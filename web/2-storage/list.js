// list.js — the person's list of sharing points as a chain: read the rules in it, change it, keep it.
//
// Purpose:   the list (sharing-point.js listText) holds one definition per sharing point
//            :sharing-point.n^(name)=(full path)!(q_…) and relation lines (relations.js). Read from the
//            oldest line to the newest, a line sets one rule per pair "from → to" and mark; a newer line
//            replaces it, (quiet) ends every rule of that pair. A change never edits the list: it writes
//            a new chain file with all sharing points and all rules in force, :chain.1!(old id, hash)
//            and the row {:chain.1} (like every other chain version, SCHEMA.md G4a).
//              chain/JJJJ.MM/(sharing-points)@(Lena)'t(…)!(u_…).chain.sign       newest = in force
//            consentAt: what a sharing point may also use, read where the list lies (atlas, 6-compute).
// Depends:   1-model (file, ids, hash, filename), relations.js, sharing-point.js, layout.js
// Test:      tests/list.test.mjs
// Limits:    one list ≈ 100 B per sharing point + 60 B per rule; 10³ versions ≈ 0.5 MB in chain/;
//            numbers n are positions, so a removed sharing point renumbers the rest in the new version.

import { signed } from '../1-model/crypto.js';
import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { buildName, readName } from '../1-model/filename.js';
import { relationLine } from './relations.js';
import { readList, readRelations, labelOf, readDescription } from './sharing-point.js';
import { monthOf } from './layout.js';

export const RULE_MARKS = ['always', 'ask', 'show', 'backup', 'consent'];
const WORD = 'sharing-points';
const enc = new TextEncoder();

/**
 * Rules in force: [{ from, to, mark, kinds, write, time }]. from null = the own sharing point.
 * kinds: ['x', 'l'] · [] or null = everything. Once-shares ({:v.1} with a number) are no rules.
 */
export function rulesOf(text) {
  const rules = new Map();
  for (const r of readRelations(text).reverse()) { // oldest first, a newer line wins
    if (r.what?.some((k) => k.includes('.'))) continue;
    const pair = `${r.from ?? 0}>${r.to}:`;
    if (r.marks.includes('quiet')) {
      for (const k of [...rules.keys()]) if (k.startsWith(pair)) rules.delete(k);
      if (r.from != null) rules.set(pair + 'quiet', { from: r.from, to: r.to, mark: 'quiet', kinds: r.what ?? [], time: r.time }); // a no from a group to a person stays written (27.11., own-door.js): never asked again
      continue;
    }
    const mark = r.marks.find((m) => RULE_MARKS.includes(m));
    if (!mark) continue;
    rules.delete(pair + 'quiet'); // a newer yes for the pair: the no is over
    rules.set(pair + mark, { from: r.from, to: r.to, mark, kinds: r.what ?? [], write: r.marks.includes('write'), all: r.marks.includes('all'), time: r.time }); // all (16.11.): everything so far too, not only new
  }
  return [...rules.values()];
}

/** Does a rule's kinds take this file? Chains always go along (they keep the order of strands). */
export function wants(kinds, path) {
  if (!kinds?.length) return true;
  const kind = readName(path.slice(path.lastIndexOf('/') + 1))?.kind;
  return kind === 'chain' || kinds.includes(kind);
}

/**
 * A change → the text of the next version. edit, one of:
 *   { add: { label, path, id, key }, marks: ['show', 'write'] }    bring a sharing point in
 *   { remove: n }                                                  take it out with all its rules
 *   { rule: { from, to, mark, kinds, write, all }, on: true | false }   set or end one rule (all = everything so far too)
 *   { label: 'Kurs 3', n }                                         rename
 * meta: { device (q_), person: { id, label }, now (ms), time } → { text, entries, rules }
 */
export async function editList(oldText, edit, { device, person, now = Date.now(), time, deviceKey = null }) {
  let entries = readList(oldText).map(({ always, ...sp }) => sp);
  let rules = rulesOf(oldText);
  const same = (a, b) => (a.from ?? 0) === (b.from ?? 0) && a.to === b.to && a.mark === b.mark;
  if (edit.add) {
    entries = [...entries, { ...edit.add, label: edit.add.label ?? labelOf(edit.add.path) }];
    const n = entries.length, write = (edit.marks ?? []).includes('write');
    for (const mark of (edit.marks ?? []).filter((m) => RULE_MARKS.includes(m))) {
      rules.push({ from: null, to: n, mark, kinds: [], write: mark === 'show' && write, time });
    }
  }
  if (edit.remove) {
    const at = (k) => (k == null || k < edit.remove ? k : k - 1);
    entries = entries.filter((_, i) => i + 1 !== edit.remove);
    rules = rules
      .filter((r) => r.to !== edit.remove && r.from !== edit.remove) // its rules go with it
      .map((r) => ({ ...r, from: at(r.from), to: at(r.to) })); // the rest move up one number
  }
  if (edit.rule) {
    rules = rules.filter((r) => !same(r, edit.rule));
    if (edit.on !== false) rules.push({ kinds: [], write: false, ...edit.rule, time });
  }
  if (edit.label) entries = entries.map((sp, i) => (i + 1 === edit.n ? { ...sp, label: edit.label } : sp));

  const old = readFile(oldText);
  const id = newId({ q: device, n: person.id, now });
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }), [
    ...entries.map((sp, i) => {
      const id = sp.key ? `${sp.id} z_${sp.key}` : sp.id; // a device carries its check key
      return defLine(`sharing-point.${i + 1}`, { hint: sp.label, path: sp.path, id });
    }),
    ...(old.head.id ? [defLine('chain.1', { id: writeId(old.head.id, await hashBytes(enc.encode(oldText))) })] : []),
  ], [
    ...rules.map((r) => {
      const marks = [r.mark, ...(r.write ? ['write'] : []), ...(r.all ? ['all'] : [])];
      return relationLine({ what: r.kinds, from: r.from, to: r.to, marks, time: r.time });
    }),
    ...(old.head.id ? ['{:chain.1}'] : []),
  ]));
  return { text, id, entries, rules };
}

/** Where a version of the list lies. */
export function listPath({ id, person, time }) {
  return `chain/${monthOf(time)}/${buildName({ words: [WORD], person, time, u: uOf(id), kind: 'chain', ext: 'sign' })}`;
}

/**
 * The list in force: the newest list file in chain/ (by time in its name), or null. person: only that person's (14.11.:
 * several on a device). Two versions of the same second (17.11.: the door's two links are added one right after the
 * other): the one in force is the one no other version of that second builds on (its `:chain.1` names the one below).
 * Limits: the tie costs one read per version of that second (≤ 5 in practice); otherwise only the listing.
 */
export async function findList(store, person = null) {
  const lists = (await store.list('chain/')).map((f) => f.path)
    .map((path) => ({ path, name: readName(path.slice(path.lastIndexOf('/') + 1)) }))
    .filter((f) => f.path.endsWith('.sign') && f.name?.words.includes(WORD) && (!person || f.name.person === person))
    .sort((a, b) => String(a.name.time).localeCompare(String(b.name.time)));
  const last = lists.at(-1);
  if (!last) return null;
  const tie = lists.filter((f) => f.name.time === last.name.time);
  if (tie.length === 1) return last.path;
  const below = new Set();
  for (const f of tie) {
    try { const d = readFile(new TextDecoder().decode(await store.read(f.path))).defs.get('chain.1'); if (d?.id?.u) below.add(d.id.u); } catch { /* unreadable: it cannot be the one in force */ below.add(f.name.u); }
  }
  return (tie.filter((f) => !below.has(f.name.u)).at(-1) ?? last).path;
}

/** Read, change, write: the list in force → the next version in chain/. → { path, text, entries, rules } */
export async function changeList(store, edit, meta) {
  const at = await findList(store, meta.person.label);
  const oldText = at
    ? new TextDecoder().decode(await store.read(at))
    : fileText(headLine('chain', { '@': meta.person.label })); // the very first list
  const next = await editList(oldText, edit, meta);
  const path = listPath({ id: next.id, person: meta.person.label, time: meta.time });
  await store.write(path, enc.encode(next.text));
  return { path, ...next };
}

/**
 * Who lets this sharing point also use a kind of strand – the (consent) rule, read by whoever computes there (atlas):
 * of every person with a list in this store the newest one, and in it a (consent) towards this very sharing point
 * (found by the q_ of its sharing-point.sign). kind: 'l' (landmarks), 'x', … · a rule without kinds = every kind.
 * → Set of n_. No sharing-point.sign, no list, no rule: nobody.
 * Limits: one listing of chain/ and one read per person with a list here · a list is believed as it stands (no seal
 *         is checked here): it is that person's word only where she alone can write – her own Sign/, not a group folder.
 */
export async function consentAt(store, kind) {
  const agreed = new Set(), dec = new TextDecoder();
  let here = null;
  try { here = readDescription(dec.decode(await store.read('sharing-point.sign'))).id; } catch { return agreed; }
  if (!here) return agreed;
  const files = await store.list('chain/'), once = { list: async () => files, read: (p) => store.read(p) };
  const people = new Set(files.map((f) => readName(f.path.slice(f.path.lastIndexOf('/') + 1))).filter((n) => n?.words.includes(WORD)).map((n) => n.person));
  for (const label of people) {
    try {
      const text = dec.decode(await store.read(await findList(once, label)));
      const n = readFile(text).head.id?.n, to = readList(text).findIndex((sp) => sp.id === here) + 1;
      if (n && to && rulesOf(text).some((r) => r.mark === 'consent' && !r.from && r.to === to && (!r.kinds?.length || r.kinds.includes(kind)))) agreed.add(n);
    } catch { /* a list that cannot be read agrees to nothing */ }
  }
  return agreed;
}
