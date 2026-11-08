// sharing-point.js — a sharing point describes itself; a person keeps one list of all of them.
//
// Purpose:   consent = sharing point (SCHEMA.md B8). Two files, both in our grammar:
//              sharing-point.sign   in the root of the sharing point:
//                                   :sharing-point!(q_… z_…)@(…)'t(…) · row (label) · row {:x :l :v}
//                                   z_ only for a device: a device is a sharing point with a key
//                                   = which kinds may lie here · optional join rule:
//                                   :_.1((join) (gestures 1) (vouch 2))°(Hörsaal 2)'t(2026.11.10 10.00_12.00)
//              list of a person     a chain file in her own chain/: one definition per sharing point
//                                   :sharing-point.1^(full path)!(q_… z_…)@(whose), and relation lines
//                                   (relations.js), e.g. {:v :x} {:sharing-point.1} = always there
//            ^( ) is the sharing point: its full path. A device: ^(local:<name>). @( ) is whose.
//            Passwords are never in either file; the device keychain holds them by q_ id.
// Depends:   file.js, ids.js, layout.js, memory.js
// Test:      tests/storage.test.mjs
// Limits:    the list is read once at start (one file, ~100 B per sharing point).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { write } from '../1-model/notation.js';
import { writeId } from '../1-model/ids.js';
import { partsOf } from './layout.js';
import { ExistsError } from './memory.js';
import { relationLine, readRelation } from './relations.js';

/** Name to show: the device name, the whose (@) of a whole account, else the last folder of the path. */
export function labelOf(path, person = null) {
  if (path?.startsWith('local:')) return path.slice(6);
  if (person && /\/remote\.php\/dav\/files\/[^/]+\/?$/.test(path ?? '')) return person;
  return decodeURIComponent(String(path ?? '').replace(/\/$/, '').split('/').pop() ?? '');
}

/**
 * Text of sharing-point.sign. kinds: what consent covers · join: { gestures, vouch, where, time } ·
 * key: z_ of a device · signers: [{ label, id, key }] who may seal the next version (the admin is
 * just the signer of atlas) · moveTo: { path, time } = planned move, the newest line on top.
 */
export function describe({ id, by, time, label, kinds, join = null, key = null, signers = [], moveTo = null }) {
  const rule = join ? [defLine('_.1', {
    body: `((join)${join.gestures ? ` (gestures ${join.gestures})` : ''}${join.vouch ? ` (vouch ${join.vouch})` : ''})`,
  }) + (join.where ? `°(${join.where})` : '') + (join.time ? `'t(${join.time})` : '')] : [];
  const defs = [...signers.map((sg, i) => defLine(`sharing-point.${i + 1}`, { hint: `local:${sg.label}`, id: `${sg.id} z_${sg.key}` })), ...rule];
  return fileText(headLine('sharing-point', { '!': key ? `${id} z_${key}` : id, '@': by, "'t": time }), defs, [
    ...(moveTo ? [`^(${moveTo.path})'t(${moveTo.time})`] : []),
    `(${label})`,
    `{${kinds.map((k) => `:${k}`).join(' ')}}`,
  ]);
}

/** Read sharing-point.sign → { id, key, label, kinds, join, signers, moveTo }. */
export function readDescription(text) {
  const f = readFile(text);
  const labelRow = f.rows.find((r) => r.items[0]?.t === 'value');
  const kindRow = f.rows.find((r) => r.items[0]?.t === 'line' && r.items[0].items.every((i) => i.t === 'ref'));
  const move = f.rows.find((r) => r.items[0]?.t === 'sym' && r.items[0].sym === '^');
  const textOf = (d) => (d.body ? write([d.body]) : '');
  const rule = [...f.defs.values()].find((d) => d.kind === '_' && textOf(d).includes('(join)'));
  const num = (word) => Number(new RegExp(`\\(${word} (\\d+)\\)`).exec(rule ? textOf(rule) : '')?.[1] ?? 0);
  return {
    id: f.head.id?.q ?? null,
    key: f.head.id?.z?.slice(2) ?? null,
    label: labelRow?.items[0]?.text ?? null,
    kinds: (kindRow?.items[0]?.items ?? []).map((r) => r.kind),
    join: rule ? { gestures: num('gestures'), vouch: num('vouch'), where: rule.where, time: rule.part } : null,
    signers: [...f.defs.values()].filter((d) => d.kind === 'sharing-point' && d.id?.z).map((d) => ({ label: labelOf(d.hint), id: d.id.q, key: d.id.z.slice(2) })),
    moveTo: move ? { path: move.items[0].value, time: move.time } : null,
  };
}

/**
 * Can this description be trusted? Members can write in a group folder, so anyone could widen
 * the kinds in sharing-point.sign. It counts only with a seal y_ of a known signer.
 * signerKeys: { q_…: public key in Base32 } (from the last trusted version: signerKeys()).
 */
export async function trusted(text, signerKeys) {
  const { checkWitness } = await import('../1-model/crypto.js');
  for (const key of Object.values(signerKeys)) if (await checkWitness(key, text)) return true; // any signer may seal
  return false;
}

/** Signers of a description as { q_…: key }, to check the next version. */
export const signerKeys = (description) => Object.fromEntries(description.signers.map((sg) => [sg.id, sg.key]));

/** May this file go to this sharing point? Decided from the kind in its name. Chains go along. */
export function allows(description, path) {
  const kind = partsOf(path)?.kind;
  if (kind === 'chain') return true;
  return description.kinds.includes(kind);
}

/**
 * The person's list: her sharing points (^(full path), devices with z_) and the relation lines between
 * them. sharingPoints: [{ path, id, key, person, always }] · relations: [{ what, from, to, marks }]
 * with from/to as 1-based positions in sharingPoints.
 */
export function listText({ id, person, time }, sharingPoints, relations = []) {
  return fileText(
    headLine('chain', { '!': writeId(id), '@': person, "'t": time }),
    sharingPoints.map((sp, i) => defLine(`sharing-point.${i + 1}`, { hint: sp.path, id: sp.key ? `${sp.id} z_${sp.key}` : sp.id, person: sp.person })),
    [...sharingPoints.map((sp, i) => (sp.always?.length ? relationLine({ what: sp.always, to: i + 1, time }) : null)).filter(Boolean),
      ...relations.map((r) => relationLine({ ...r, time }))],
  );
}

/** Keys of a list: { q_…: public key } of every sharing point that has one (devices), to check seals. */
export function readKeys(text) {
  return Object.fromEntries(readList(text).filter((sp) => sp.key).map((sp) => [sp.id, sp.key]));
}

/** Read the list back: [{ label, path, id, key, person, always }] and its relations (readRelations). */
export function readList(text) {
  const f = readFile(text);
  const always = new Map();
  for (const r of readRelations(text)) if (!r.from && !r.marks.length && r.what.length && r.what.every((k) => !k.includes('.'))) always.set(r.to, r.what);
  return [...f.defs.values()]
    .filter((d) => d.kind === 'sharing-point')
    .map((d) => ({ label: labelOf(d.hint, d.person), path: d.hint, id: d.id?.q ?? null, ...(d.id?.z ? { key: d.id.z.slice(2) } : {}), ...(d.person ? { person: d.person } : {}), always: always.get(d.n) ?? [] }));
}

/** All relation lines of a chain, newest first. */
export function readRelations(text) {
  return readFile(text).rows.map((r) => readRelation(r.text)).filter(Boolean);
}

/**
 * Write files to every sharing point that allows them. targets: [{ description, store }].
 * Same path = same file (written once); failures are kept to try again later.
 */
export async function saveEverywhere(targets, files) {
  const result = { saved: [], skipped: [], failed: [] };
  for (const { description, store } of targets) {
    for (const { path, bytes } of files) {
      if (!allows(description, path)) { result.skipped.push([description.id, path]); continue; }
      try {
        await store.write(path, bytes);
        result.saved.push([description.id, path]);
      } catch (err) {
        if (err instanceof ExistsError) result.saved.push([description.id, path]);
        else result.failed.push([description.id, path, String(err.message ?? err)]);
      }
    }
  }
  return result;
}

/** Copy what is missing from one sharing point to another (move, backup, "only landmarks"). */
export async function copyMissing(from, to, { filter = () => true } = {}) {
  const have = new Set((await to.list()).map((f) => f.path));
  const copied = [];
  for (const { path } of await from.list()) {
    if (have.has(path) || !filter(path)) continue;
    await to.write(path, await from.read(path));
    copied.push(path);
  }
  return copied;
}
