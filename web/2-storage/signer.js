// signer.js — signers of a sharing point: who may change it, move it, or name a new location.
// The same for an own sharing point, a group and atlas (decision 08.11.: the admin is just a signer).
//
// Purpose:   a new version of sharing-point.sign counts only with the seal y_ of a signer listed in
//            the last trusted version. The old version is never changed: it moves (rename only) to
//              chain/JJJJ.MM/(sharing-point <label>)'t(…)!(u_…).sharing-point.sign
//            Planned move = newest line ^(new path)'t(…), sealed by a signer, read at the OLD location
//            (only who has the old account can put it there) → devices follow.
//            Same line read only from atlas (old location gone) = a new location → the person confirms,
//            or after 14 days it counts by itself; anyone with the old location or a seal can stop it.
// Depends:   sharing-point.js, 1-model (crypto, ids, filename, file)
// Test:      tests/signer.test.mjs
// Limits:    one version ≈ 0.3–1 KB; checking = one Ed25519 check per signer (~0.1 ms each).
// EXTEND(signer, recover): a new signer by paper key; server proof (server z_); sealed content.

import { readDescription, trusted, signerKeys, describe } from './sharing-point.js';
import { signed } from '../1-model/crypto.js';
import { newId, shortU } from '../1-model/ids.js';
import { buildName } from '../1-model/filename.js';
import { monthOf, SELF } from './layout.js';

export const WAIT_DAYS = 14;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Does next follow from previous? It must be sealed by a signer of previous. → description or null. */
export async function nextVersion(previousText, nextText) {
  return (await trusted(nextText, signerKeys(readDescription(previousText)))) ? readDescription(nextText) : null;
}

/**
 * What a device does with a move it read. from: "old" (read at the old location) or "atlas".
 * known: the last trusted description · now, since: when the device first saw it (ms).
 * → { action: "follow" | "confirm" | "reject", path }
 */
export async function followMove({ text, from, known, now = Date.now(), since = now }) {
  const next = await nextVersion(known.text, text);
  if (!next?.moveTo) return { action: 'reject', path: null };
  if (from === 'old') return { action: 'follow', path: next.moveTo.path };
  const waited = now - since >= WAIT_DAYS * 864e5;
  return { action: waited ? 'follow' : 'confirm', path: next.moveTo.path };
}

/**
 * Signer side: write a new version. The old sharing-point.sign moves into chain/ (content unchanged),
 * the new one is written in its stead. signer: { device (q_), deviceKey, label } · change: what to set.
 */
export async function newVersion({ store, signer, change, now = Date.now(), time }) {
  const oldText = dec.decode(await store.read(SELF));
  const old = readDescription(oldText);
  const text = await signed(signer.deviceKey, describe({ ...old, ...change, id: old.id, by: signer.label, time }));
  const u = shortU(newId({ q: signer.device, n: 'n_0', now }));
  const kept = `chain/${monthOf(time)}/${buildName({ words: ['sharing-point', old.label], time, u, kind: 'sharing-point', ext: 'sign' })}`;
  await store.move(SELF, kept);
  await store.write(SELF, enc.encode(text));
  return { text, kept };
}

/** Signer side: a planned move. Written at the old location, so it proves the old account too. */
export const planMove = ({ store, signer, path, now = Date.now(), time }) =>
  newVersion({ store, signer, change: { moveTo: { path, time } }, now, time });
