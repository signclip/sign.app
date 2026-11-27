// key-for.js — a group key given to the admin, by a member, with her consent (27.11., user).
//
// Purpose:   end to end means the admin and every server see sizes and months only. For what needs reading — building
//            the index of a sealed group on a server, helping after a lost device — a member can give the group key:
//            her device seals it for the admin's pickup key and signs what it did. Nothing else can produce this file.
//              e2e/for/<admin key, 26>/<device key, 26>.json   { group, for, z, at, sealed, sig }
//              sealed   the group key, readable only with the private half of `for` (crypto.js seal: ECDH P-256 + AES-GCM)
//              sig      her device key over all other fields: who gave which group's key to whom, and when
//            The admin opens it with takeKey, which first checks the signature and that the file is meant for this key.
//            Taking it back: remove the file — but a key once opened is known. To really end it the group gets a new
//            key (renewGroup) and the old files stay readable to whoever had the old one.
// Depends:   1-model/crypto.js, 1-model/sealed.js
// Test:      tests/e2e-on.test.mjs
// Limits:    one file ≈ 0.6 KB per member and admin key · the admin's pickup key must be one that stays (kept in the
//            Keystore of the admin device); a lost admin key opens nothing given before · known: without the list of
//            the group's device keys takeKey can only say the signature fits the key named in the file, not whose it is.

import { seal, unseal, sign, verify } from '../1-model/crypto.js';
import { keyText, keyBytes } from '../1-model/sealed.js';

export const KEYS_FOR = 'e2e/for/';
const said = (b) => ['sign key for 1', b.group, b.for, b.z, b.at, b.sealed].join('\n');
const enc = new TextEncoder(), dec = new TextDecoder();

/** Where the file lies inside the group's sharing point (outside the sealed part: the admin has no group key yet). */
export const keyPath = (to, z) => `${KEYS_FOR}${to.slice(0, 26)}/${z.slice(0, 26)}.json`;

/**
 * Member: give the group key to `to` (the admin's pickup public key). store: the group's backing store (not the
 * sealed one) · deviceKey: her device key · group: its label. → path
 */
export async function giveKey({ store, key, to, deviceKey, group, now = Date.now() }) {
  const body = { group, for: to, z: deviceKey.public, at: new Date(now).toISOString(), sealed: await seal(to, keyText(typeof key === 'string' ? keyBytes(key) : key)) };
  const path = keyPath(to, deviceKey.public);
  await store.write(path, enc.encode(JSON.stringify({ ...body, sig: await sign(deviceKey.privateKey, said(body)) })));
  return path;
}

/**
 * Admin: open what was given. pickup: { privateKey, public } · known: device keys of the group's members (z without
 * z_), if at hand. → { key (32 bytes), group, by (her device key), at, known (true | false | null = not checked) }
 */
export async function takeKey({ store, path, pickup, known = null }) {
  const b = JSON.parse(dec.decode(await store.read(path)));
  if (b.for !== pickup.public) throw new Error('this key was given to another key');
  if (!(await verify(b.z, said(b), b.sig))) throw new Error('not signed by the device it names');
  return { key: keyBytes(await unseal(pickup.privateKey, b.sealed)), group: b.group, by: b.z, at: b.at, known: known ? known.includes(b.z) : null };
}

/** Every key given to this admin key in a sharing point. → [path] */
export const givenKeys = async (store, to) => (await store.list(`${KEYS_FOR}${to.slice(0, 26)}/`)).map((f) => f.path);

/** Member: take it back (see Purpose: this stops new readers, not one who already opened it). */
export const takeBack = (store, to, deviceKey) => store.remove(keyPath(to, deviceKey.public));
