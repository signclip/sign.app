// share-take.js — share a Take: which strands go to which sharing point, always or this once.
//
// Purpose:   the share menu (decisions 07.11.): per sharing point the kinds as chips;
//            what goes = (this once ?? always) ∩ what the sharing point allows.
//            For each target: copy the chosen strand files, write a chain there that names only
//            those strands. At home: a new chain on top of the old one (decision 07.11., A):
//              :chain.1!(old chain, hash)  :v.1!(…)~(:chain.1)  :x.1!(…)~(:chain.1)
//              :sharing-point.1^(full path)!(q_…)       where it went
//              {:v.1 :x.1} {:sharing-point.1}'t(…)      new line on top: what, then where (relations.js)
//              {:chain.1}                               bottom: the chain it builds on
//            Its file name starts with ^(Kurs 3) (a view).
// Depends:   1-model (file, ids, filename), 2-storage (layout, memory)
// Test:      tests/share.test.mjs
// Limits:    one share = small copies + 2 chain files (~0.5–1 KB) · withheld strands are not
//            named in the target chain, not even by id.
// EXTEND(S2, always): after every saveTake the app calls shareTake for targets with "always".
// Whole chain: strands defined further down (own versions) go along; embedded chains
// (a playlist of others' chains) stay references – the target needs its own access.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { relationLine } from '../2-storage/relations.js';
import { newId, writeId, shortU, idKey } from '../1-model/ids.js';
import { timeLabel } from '../1-model/filename.js';
import { toJson } from '../1-model/json.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { pathOf, partsOf, jsonPath } from '../2-storage/layout.js';
import { ExistsError } from '../2-storage/memory.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const FILE_KINDS = ['v', 'a', 'x', 'l', 'm'];

/** Kinds that go: this once (if given) or always, but never more than the sharing point allows. */
export function chooseKinds({ always = [], once = null, allowed = [] }) {
  return (once ?? always).filter((k) => allowed.includes(k));
}

/** The chain below, if the bottom line is {:chain.n}. */
function belowDef(file) {
  const lone = file.rows.at(-1)?.items;
  const ref = lone?.length === 1 && lone[0].items?.length === 1 && lone[0].items[0].kind === 'chain' ? lone[0].items[0] : null;
  return ref ? file.defs.get(ref.name) : null;
}

/**
 * Strands of the whole chain: this file and every chain below it (own versions).
 * Chains embedded as content (a playlist) are not copied: the target gets their reference only.
 */
async function strandsOfChain(own, byU, file) {
  const found = new Map();
  const embedded = [];
  for (let f = file, steps = 0; f && steps < 10000; steps++) {
    const below = belowDef(f);
    for (const d of f.defs.values()) {
      if (d.id && FILE_KINDS.includes(d.kind) && !found.has(idKey(d.id))) found.set(idKey(d.id), d);
      if (d.kind === 'chain' && d !== below) embedded.push(d.label ?? writeId(d.id));
    }
    const path = below ? (byU.get(shortU(below.id)) ?? []).find((p) => p.endsWith('.chain.sign')) : null;
    f = path ? readFile(dec.decode(await own.read(path))) : null;
  }
  const count = {};
  const strands = [...found.values()].map((d) => ({ ...d, name: `${d.kind}.${(count[d.kind] = (count[d.kind] ?? 0) + 1)}` }));
  return { strands, embedded };
}

/** Write once; then read back and compare (hash up to 1 MB, size above), so a broken copy is noticed. */
async function writeOnce(store, path, bytes) {
  let wrote = true;
  try { await store.write(path, bytes); } catch (e) { if (!(e instanceof ExistsError)) throw e; wrote = false; }
  const back = await store.read(path);
  const same = bytes.length > 1e6 ? back.length === bytes.length : (await hashBytes(back)) === (await hashBytes(bytes));
  if (!same) throw new Error(`copy differs: ${path}`);
  return wrote;
}

/**
 * own: store with the Take · chainPath: its chain file · targets: [{ entry, description, store }]
 * entry: { label, id, always } from the person's list · description: from sharing-point.sign
 * once: kinds for this share only, or null · device, person: { id, label } · now: ms
 */
export async function shareTake({ own, chainPath, targets, once = null, device, person, now = Date.now(), deviceKey = null }) {
  const oldBytes = await own.read(chainPath);
  const file = readFile(dec.decode(oldBytes));
  const name = partsOf(chainPath);
  const byU = new Map();
  for (const { path } of await own.list()) {
    const u = partsOf(path)?.u;
    if (u) byU.set(u, [...(byU.get(u) ?? []), path]);
  }
  const { strands, embedded } = await strandsOfChain(own, byU, file);
  const at = timeLabel(now);
  const report = { shared: [], skipped: [], version: null, notCopied: embedded };
  const shareRows = [];
  const sharedNames = new Set();

  for (const { entry, description, store } of targets) {
    if (description.trusted === false) { report.skipped.push(entry.label); continue; } // sharing-point.sign without admin witness
    const kinds = chooseKinds({ always: entry.always, once, allowed: description.kinds });
    const chosen = strands.filter((d) => kinds.includes(d.kind));
    if (!chosen.length) { report.skipped.push(entry.label); continue; }
    const copied = [];
    for (const d of chosen) {
      for (const p of byU.get(shortU(d.id)) ?? []) if (await writeOnce(store, p, await own.read(p))) copied.push(p);
    }
    const id = newId({ q: device, n: person.id, now });
    const head = headLine('chain', { '!': writeId(id), '@': file.head['@'], '°': file.head['°'], "'t": file.head["'t"] });
    const refs = chosen.map((d) => `:${d.name}`).join(' ');
    const text = await signed(deviceKey, fileText(head, chosen.map((d) => defLine(d.name, { id: writeId(d.id, d.id.hash) })), [`_({${refs}})'t(${file.head["'t"]})`]));
    const path = pathOf({ words: name.words, person: name.person, where: name.where, time: name.time, kind: 'chain', u: shortU(id) });
    await writeOnce(store, path, enc.encode(text));
    await writeOnce(store, jsonPath(path), enc.encode(toJson(text)));
    report.shared.push({ to: entry.label, kinds, paths: [...copied, path] });
    for (const d of chosen) sharedNames.add(d.name);
    const n = shareRows.length + 1;
    shareRows.push({ label: entry.label, def: defLine(`sharing-point.${n}`, { hint: entry.path ?? `local:${entry.label}`, id: entry.id }), row: `${relationLine({ what: chosen.map((d) => d.name), to: n })}'t(${at})` });
  }

  if (shareRows.length) {
    const id = newId({ q: device, n: person.id, now });
    const head = headLine('chain', { '!': writeId(id), '@': person.label, '°': file.head['°'], "'t": at });
    const defs = [
      defLine('chain.1', { id: writeId(file.head.id, await hashBytes(oldBytes)) }),
      ...strands.filter((d) => sharedNames.has(d.name)).map((d) => defLine(d.name, { id: writeId(d.id, d.id.hash), echo: ':chain.1' })),
      ...shareRows.map((s) => s.def),
    ];
    const text = await signed(deviceKey, fileText(head, defs, [...shareRows.map((s) => s.row), '{:chain.1}']));
    const path = pathOf({ to: shareRows.map((s) => s.label), words: name.words, person: person.label, where: name.where, time: at, kind: 'chain', u: shortU(id) });
    await own.write(path, enc.encode(text));
    await own.write(jsonPath(path), enc.encode(toJson(text)));
    report.version = path;
  }
  return report;
}
