// remove.js — delete with three equal chips (decision 08.11., 17.15). Sharing is the other way.
//
// Purpose:   ↓ on a strand shows the chips; any of them may be chosen:
//              rescue    "share somewhere first": copy (read back, checked) to another sharing point
//              similar   out of Similar and shares: the files leave this sharing point (the project
//                        Nextcloud = may be processed, decision 16.51)
//              training  also out of modeling/smoothing: a ((quiet)) line goes to atlas
//            If similar is chosen without training and an atlas store is given, the files go to atlas
//            first (they stay a training set). Every removal is a new chain on top:
//              {:l.1} (quiet)'t(…) · {:chain.1}        what first, the mark behind; a restore skips these ids
// Depends:   1-model (file, ids, hash, crypto, filename), 2-storage/layout
// Test:      tests/remove.test.mjs
// Limits:    one removal ≈ 0.4 KB chain + one copy per file; a strand = 1–2 files (.x has .json).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel, readName } from '../1-model/filename.js';
import { pathOf, partsOf } from '../2-storage/layout.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Paths of a strand in a store, found by the u_ in the file name. */
export async function pathsOfStrand(store, id) {
  const u = shortU(id);
  return (await store.list()).map((f) => f.path).filter((p) => readName(p.slice(p.lastIndexOf('/') + 1))?.u === u);
}

async function copyChecked(from, to, path, toPath = path) {
  const bytes = await from.read(path);
  await to.write(toPath, bytes);
  if (!same(await to.read(toPath), bytes)) throw new Error(`copy differs: ${toPath}`);
}

/**
 * own: the sharing point · chainPath: the chain that defines the strands · names: e.g. ['l.1'] ·
 * chips: { rescue: store|null, similar: bool, training: bool } · atlas: store of atlas (its hello/).
 * → { chain (path of the new chain), removed, rescued, kept, quietToAtlas }
 */
export async function removeStrands({ own, chainPath, names, chips = {}, atlas = null, device, person, deviceKey = null, now = Date.now() }) {
  const bytes = await own.read(chainPath);
  const file = readFile(dec.decode(bytes));
  const defs = names.map((n) => file.defs.get(n) ?? (() => { throw new Error(`not defined here: :${n}`); })());
  const result = { chain: null, removed: [], rescued: [], kept: [], quietToAtlas: false };
  const leaving = chips.similar || chips.rescue;
  for (const d of defs) {
    for (const p of await pathsOfStrand(own, d.id)) {
      if (chips.rescue) { await copyChecked(own, chips.rescue, p); result.rescued.push(p); }
      if (chips.similar && !chips.training && atlas) { await copyChecked(own, atlas, p, `hello/${p.split('/').pop()}`); result.kept.push(p); }
      if (leaving) { await own.remove(p); result.removed.push(p); }
    }
  }
  const id = newId({ q: device, n: person.id, now });
  const at = timeLabel(now);
  const refs = names.map((n) => `:${n}`).join(' ');
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }), [
    defLine('chain.1', { id: writeId(file.head.id, await hashBytes(bytes)) }),
    ...defs.map((d) => defLine(d.name, { id: writeId(d.id, d.id.hash), echo: ':chain.1' })),
  ], [`{${refs}} (quiet)'t(${at})`, '{:chain.1}']));
  const name = partsOf(chainPath);
  result.chain = pathOf({ words: ['quiet', ...name.words], person: person.label, time: at, kind: 'chain', u: shortU(id) });
  await own.write(result.chain, enc.encode(text));
  if (atlas && chips.training) { await atlas.write(`hello/${result.chain.split('/').pop()}`, enc.encode(text)); result.quietToAtlas = true; }
  return result;
}

/** u_ (12 chars, as in file names) of removed strands, from chain texts: a restore skips their files. */
export function quietIds(texts) {
  const out = new Set();
  for (const t of texts) {
    const f = readFile(t);
    for (const row of f.rows) {
      const m = /^\{([^{}]*)\} \(quiet\)/.exec(row.text);
      if (!m) continue;
      for (const ref of m[1].split(' ')) { const d = f.defs.get(ref.slice(1)); if (d?.id) out.add(shortU(d.id)); }
    }
  }
  return out;
}
