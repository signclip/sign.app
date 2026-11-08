// sharing-point.js — a sharing point describes itself; a person keeps one list of all of them.
//
// Purpose:   consent = sharing point (SCHEMA.md B8). Two files, both in our grammar:
//              sharing-point.sign   in the root of the sharing point:
//                                   :sharing-point!(q_… z_…)@(…)'t(…) · row (label) · row {:x :l :v}
//                                   z_ only for a device: a device is a sharing point with a key
//                                   = which kinds may lie here · optional join rule:
//                                   :_.1((join) (gestures 1) (vouch 2))°(Hörsaal 2)'t(2026.11.10 10.00_12.00)
//              list of a person     a chain file in her own chain/: one definition per sharing point
//                                   :sharing-point.1(label)^(full path)!(q_… z_…), and per sharing point
//                                   one line {{:sharing-point.1}{:v :x}} = these kinds always go there
//            Passwords are never in either file; the device keychain holds them by q_ id.
// Depends:   file.js, ids.js, layout.js, memory.js
// Test:      tests/storage.test.mjs
// Limits:    the list is read once at start (one file, ~100 B per sharing point).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { write } from '../1-model/notation.js';
import { writeId } from '../1-model/ids.js';
import { partsOf } from './layout.js';
import { ExistsError } from './memory.js';

/**
 * Text of sharing-point.sign. kinds: what consent covers · join: { gestures, vouch, where, time } ·
 * key: z_ of a device · signers: [{ label, id, key }] who may seal the next version (the admin is
 * just the signer of atlas) · moveTo: { path, time } = planned move, the newest line on top.
 */
export function describe({ id, by, time, label, kinds, join = null, key = null, signers = [], moveTo = null }) {
  const rule = join ? [defLine('_.1', {
    body: `((join)${join.gestures ? ` (gestures ${join.gestures})` : ''}${join.vouch ? ` (vouch ${join.vouch})` : ''})`,
  }) + (join.where ? `°(${join.where})` : '') + (join.time ? `'t(${join.time})` : '')] : [];
  const defs = [...signers.map((sg, i) => defLine(`sharing-point.${i + 1}`, { label: sg.label, id: `${sg.id} z_${sg.key}` })), ...rule];
  return fileText(headLine('sharing-point', { '!': key ? `${id} z_${key}` : id, '@': by, "'t": time }), defs, [
    ...(moveTo ? [`{^(${moveTo.path})}'t(${moveTo.time})`] : []),
    `(${label})`,
    `{${kinds.map((k) => `:${k}`).join(' ')}}`,
  ]);
}

/** Read sharing-point.sign → { id, key, label, kinds, join, signers, moveTo }. */
export function readDescription(text) {
  const f = readFile(text);
  const labelRow = f.rows.find((r) => r.items[0]?.t === 'value');
  const kindRow = f.rows.find((r) => r.items[0]?.t === 'line' && r.items[0].items.every((i) => i.t === 'ref'));
  const move = f.rows.find((r) => r.items[0]?.items?.[0]?.sym === '^');
  const textOf = (d) => (d.body ? write([d.body]) : '');
  const rule = [...f.defs.values()].find((d) => d.kind === '_' && textOf(d).includes('(join)'));
  const num = (word) => Number(new RegExp(`\\(${word} (\\d+)\\)`).exec(rule ? textOf(rule) : '')?.[1] ?? 0);
  return {
    id: f.head.id?.q ?? null,
    key: f.head.id?.z?.slice(2) ?? null,
    label: labelRow?.items[0]?.text ?? null,
    kinds: (kindRow?.items[0]?.items ?? []).map((r) => r.kind),
    join: rule ? { gestures: num('gestures'), vouch: num('vouch'), where: rule.where, time: rule.part } : null,
    signers: [...f.defs.values()].filter((d) => d.kind === 'sharing-point' && d.id?.z).map((d) => ({ label: d.label, id: d.id.q, key: d.id.z.slice(2) })),
    moveTo: move ? { path: move.items[0].items[0].value, time: move.time } : null,
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

/** The person's list: her sharing points and what always goes there; devices carry z_: :sharing-point.2(Pixel)!(q_… z_…). */
export function listText({ id, person, time }, sharingPoints) {
  return fileText(
    headLine('chain', { '!': writeId(id), '@': person, "'t": time }),
    sharingPoints.map((sp, i) => defLine(`sharing-point.${i + 1}`, { label: sp.label, hint: sp.path, id: sp.key ? `${sp.id} z_${sp.key}` : sp.id })),
    sharingPoints.map((sp, i) => (sp.always?.length ? `{{:sharing-point.${i + 1}}{${sp.always.map((k) => `:${k}`).join(' ')}}}` : null)).filter(Boolean),
  );
}

/** Keys of a list: { q_…: public key } of every sharing point that has one (devices), to check seals. */
export function readKeys(text) {
  return Object.fromEntries(readList(text).filter((sp) => sp.key).map((sp) => [sp.id, sp.key]));
}

/** Read the list back: [{ label, path, id, key, always }] (key only for devices). */
export function readList(text) {
  const f = readFile(text);
  const always = new Map();
  for (const row of f.rows) {
    const n = row.items[0]?.items?.[0]; // {{:sharing-point.1}{:v :x}}
    if (n?.t === 'prefix' && n.head.items?.[0]?.kind === 'sharing-point') {
      always.set(n.head.items[0].path[0], n.body.items.map((r) => r.kind));
    }
  }
  return [...f.defs.values()]
    .filter((d) => d.kind === 'sharing-point')
    .map((d) => ({ label: d.label, path: d.hint, id: d.id?.q ?? null, ...(d.id?.z ? { key: d.id.z.slice(2) } : {}), always: always.get(String(d.n)) ?? [] }));
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
