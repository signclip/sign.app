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
import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { buildName, timeLabel } from '../1-model/filename.js';
import { monthOf } from '../2-storage/layout.js';
import { timeRange } from '../7-similar/filter.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** A similar → its definition lines. similar: { words, kinds, sharingPoints: [{ label, path, id }], persons: [n_], time } */
export function similarDefs({ words = [], kinds = [], sharingPoints = [], persons = [], time = null }) {
  const points = sharingPoints.slice(0, 40).map((sp, i) => defLine(`sharing-point.${i + 1}`, { hint: sp.label, path: sp.path, id: sp.id }));
  const body = [
    ...words.map((w) => `(${w})`),
    ...(kinds.length ? [`{${kinds.map((k) => `:${k}`).join(' ')}}`] : []),
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
  const words = items.filter((i) => i.t === 'value').map((i) => i.text);
  const refs = items.filter((i) => i.t === 'line').map((i) => i.items.map((r) => r.name));
  const kinds = refs.flat().filter((n) => !n.includes('.'));
  const sharingPoints = refs.flat().filter((n) => n.startsWith('sharing-point.')).map((n) => file.defs.get(n)).filter(Boolean)
    .map((d) => ({ label: d.hint, path: d.path, id: d.id?.q ?? null }));
  const persons = def.person ? def.person.split(/\s+/) : [];
  const time = def.time ?? null;
  return { words, kinds, sharingPoints, persons, time,
    filters: { persons, sharingPoints: sharingPoints.map((s) => s.label), time: timeRange(time), kinds } };
}

/**
 * Keep a similar as its own chain. from: path of the chain it is called from (→ {:chain.1}), or null for a
 * new one. → { path, id, text }
 */
export async function saveSimilar(store, similar, { device, person, now = Date.now(), from = null }) {
  const time = timeLabel(now);
  const id = newId({ q: device, n: person.id, now });
  const defs = similarDefs(similar);
  const rows = [`{:?.1}'t(${time})`];
  if (from) {
    const below = dec.decode(await store.read(from));
    defs.push(defLine('chain.1', { id: writeId(readFile(below).head.id, await hashBytes(enc.encode(below))) }));
    rows.push('{:chain.1}');
  }
  const text = fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }), defs, rows);
  const words = ['similar', ...(similar.words ?? [])].slice(0, 6);
  const path = `chain/${monthOf(time)}/${buildName({ words, person: person.label, time, u: shortU(id), kind: 'chain', ext: 'sign' })}`;
  await store.write(path, enc.encode(text));
  return { path, id, text };
}

/** Call a similar again from its chain: the same similar, a new chain on top that points back. */
export async function callSimilar(store, path, meta) {
  const similar = readSimilar(dec.decode(await store.read(path)));
  return { similar, ...(await saveSimilar(store, similar, { ...meta, from: path })) };
}
