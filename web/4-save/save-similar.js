// save-similar.js — every similar becomes a line in a chain: live or kept, it shows in the log the same way.
//
// Purpose:   one similar = one chain file in chain/, its definition holds what it looks for:
//              :sharing-point.1^(Kurs 3)=(full path)!(q_…)
//              :?.1((Kaffee) {:v :x} {:sharing-point.1})@(n_… n_…)'t(2026.11.01_2026.11.14)
//              {:?.1}'t(when it ran)
//              {:chain.1}                       only when called again from an older similar
//            words · kinds · where (sharing points as definitions) · from whom (@ n_) · when ('t, prefix
//            or from_to). Calling a similar from a chain = a NEW separate chain on top that points to
//            the chain it came from; the old one stays. The index lists them in `similar` (the log).
// Depends:   1-model (file, ids, hash, filename), 2-storage/layout, 7-similar/filter (timeRange)
// Test:      tests/similar.test.mjs
// Limits:    one similar ≈ 300 B + 100 B per sharing point; ≤ 40 sharing points in one similar.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { buildName, timeLabel } from '../1-model/filename.js';
import { monthOf } from '../2-storage/layout.js';
import { signed } from '../1-model/crypto.js';
import { timeRange } from '../7-similar/filter.js';
import { artOf } from '../1-model/symbols.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/**
 * A similar → its definition lines. similar: { words, kinds, sharingPoints: [{ label, path, id }], persons: [n_], time,
 * letters: [A …], spot: o_ cell, weite: { x, t, o, w } } – letters, spot and the steps of the Weite as keyword chips
 * (letters A B) (spot o_…) (weite x2 t3 o1 w2) (21.11.).
 */
export function similarDefs({ words = [], kinds = [], sharingPoints = [], persons = [], time = null, letters = [], spot = null, weite = null }) {
  const points = sharingPoints.slice(0, 40).map((sp, i) => defLine(`sharing-point.${i + 1}`, { hint: sp.label, path: sp.path, id: sp.id }));
  const steps = weite ? Object.entries(weite).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => `${k}${v}`).join(' ') : '';
  const body = [
    ...words.map((w) => `(${w})`),
    ...(letters.length ? [`(letters ${letters.join(' ')})`] : []),
    ...(spot ? [`(spot ${spot})`] : []),
    ...(steps ? [`(weite ${steps})`] : []),
    ...(kinds.length ? [`{${kinds.map((k) => `:${artOf(k)}`).join(' ')}}`] : []), // l → :~l (G10)
    ...(points.length ? [`{${points.map((_, i) => `:sharing-point.${i + 1}`).join(' ')}}`] : []),
  ].join(' ');
  return [...points, `:?.1(${body})` + (persons.length ? `@(${persons.join(' ')})` : '') + (time ? `'t(${time})` : '')];
}

/** A chain with a similar → { words, kinds, sharingPoints, persons, time, filters } (filters for 7-similar). */
export function readSimilar(text) {
  const file = readFile(text);
  const def = file.defs.get('?.1');
  if (!def) return null;
  const items = def.body?.items ?? [];
  const values = items.filter((i) => i.t === 'value').map((i) => i.text), key = (k) => values.find((v) => v.startsWith(`${k} `))?.slice(k.length + 1);
  const words = values.filter((v) => !/^(letters|spot|weite) /.test(v));
  const letters = key('letters')?.split(/\s+/) ?? [], spot = key('spot') ?? null;
  const weite = Object.fromEntries((key('weite') ?? '').split(/\s+/).filter(Boolean).map((x) => [x[0], Number(x.slice(1))]));
  const refs = items.filter((i) => i.t === 'line').map((i) => i.items.map((r) => r.name));
  const kinds = refs.flat().filter((n) => !n.includes('.'));
  const sharingPoints = refs.flat().filter((n) => n.startsWith('sharing-point.')).map((n) => file.defs.get(n)).filter(Boolean)
    .map((d) => ({ label: d.hint, path: d.path, id: d.id?.q ?? null }));
  const persons = def.person ? def.person.split(/\s+/) : [];
  const time = def.time ?? null;
  return { words, kinds, sharingPoints, persons, time, letters, spot, weite, view: viewOf(file),
    filters: { persons, sharingPoints: sharingPoints.map((s) => s.label), time: timeRange(time), kinds } };
}

/**
 * What the top line shows (21.11., G4c): _( ) = the take window – with that take or line ({:chain.n}) or empty (_())
 * · ?( ) = the cloud: alone = full, with a take = many, :?.1.n = single with the nth element; further :chain.n = the
 * elements, the cloud exactly so. → { focus: def name | null, empty, pick: n | null, elements: [def names] }
 */
export function viewOf(file) {
  const top = file.rows?.[0]?.text ?? '';
  const focus = /_\(\{:(chain\.\d+)\}\)/.exec(top)?.[1] ?? null, empty = /_\(\)/.test(top), pick = Number(/:\?\.1\.(\d+)/.exec(top)?.[1]) || null;
  const elements = [...top.matchAll(/(?<!\{):(chain\.\d+)/g)].map((m) => m[1]).filter((n) => n !== focus);
  return { focus, empty, pick, elements };
}

/**
 * Keep a similar as its own chain. from: path of the chain it is called from (→ {:chain.1}), or null for a
 * new one. → { path, id, text }
 */
export async function saveSimilar(store, similar, { device, person, now = Date.now(), from = null, deviceKey = null, focus = null, empty = false, pick = null, elements = [] }) {
  const time = timeLabel(now);
  const id = newId({ q: device, n: person.id, now });
  const defs = similarDefs(similar);
  let n = 0;
  const ref = async (bytes) => { const text = dec.decode(bytes); n += 1; defs.push(defLine(`chain.${n}`, { id: writeId(readFile(text).head.id, await hashBytes(bytes)) })); return `:chain.${n}`; };
  // the top line (21.11., G4c): the take window (its take, or empty), the element shown single, the elements kept
  const parts = [':?.1'];
  if (focus) parts.push(`_({${await ref(focus)}})`); else if (empty) parts.push('_()');
  if (pick) parts.push(`:?.1.${pick}`);
  for (const bytes of elements.slice(0, 40)) parts.push(await ref(bytes));
  const rows = [`{${parts.join(' ')}}'t(${time})`];
  if (from) rows.push(`{${await ref(await store.read(from))}}`);
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }), defs, rows));
  const words = ['similar', ...(similar.words ?? [])].slice(0, 6);
  const path = `chain/${monthOf(time)}/${buildName({ words, person: person.label, time, u: uOf(id), kind: 'chain', ext: 'sign' })}`;
  await store.write(path, enc.encode(text));
  return { path, id, text };
}

/** Call a similar again from its chain: the same similar, a new chain on top that points back. */
export async function callSimilar(store, path, meta) {
  const similar = readSimilar(dec.decode(await store.read(path)));
  return { similar, ...(await saveSimilar(store, similar, { ...meta, from: path })) };
}
