// signers.js — who may answer at the door, without a new app when the admin device changes (14.11.).
//
// Purpose:   project.json names the first signer (q_ z_, the anchor, built into the app). Every other signer comes
//            with a certificate in the door's join/signer/: a small .sign naming q_ z_ of the new signer, sealed by a
//            signer already trusted. Trust = the anchor plus every certificate sealed by someone trusted (a chain).
//              second device: the admin device certifies it (its check key q_ z_ on the clipboard, + tapped)
//              paper: a signer code printed on the emergency sheet; its key is derived from the code, the admin device
//                     certifies it once; a lost admin device → the code on a new device certifies that device
// Depends:   1-model (crypto, ids, file, filename), Web Crypto (Ed25519 from a 32-byte seed via PKCS#8)
// Test:      tests/join.test.mjs
// Limits:    ≤ 50 certificates, ≤ 10 links in a chain · the paper key: PBKDF2-SHA-256, 200 000 rounds (≈ 0.3 s on a
//            phone, guessing stays slow), code 26 Base32 characters (≈ 130 bit) · a certificate ≈ 0.4 KB.

import { signed, checkWitness, newPassword } from '../1-model/crypto.js';
import { newId, writeId, uOf, toBase32 } from '../1-model/ids.js';
import { headLine, defLine, fileText, readFile } from '../1-model/file.js';
import { buildName, timeLabel } from '../1-model/filename.js';

export const FOLDER = 'join/signer/';
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const PKCS8 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]; // Ed25519 private key, 32-byte seed follows
const fromUrl64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** A new signer code for the paper: 26 Base32 characters. */
export const newSignerCode = newPassword;

/** The signer key of a paper code → { id (q_…), key (z_ Base32), privateKey, label }. Same code, same key, on any device. */
export async function paperSigner(code) {
  const clean = String(code).replace(/[\s-]+/g, '').toUpperCase();
  const base = await subtle().importKey('raw', enc.encode(clean), 'PBKDF2', false, ['deriveBits']);
  const seed = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('sign signer paper'), iterations: 200000 }, base, 256));
  const privateKey = await subtle().importKey('pkcs8', new Uint8Array([...PKCS8, ...seed]), { name: 'Ed25519' }, true, ['sign']);
  const pub = fromUrl64((await subtle().exportKey('jwk', privateKey)).x);
  const id = `q_${toBase32(new Uint8Array(await subtle().digest('SHA-256', pub)).slice(0, 10))}`; // its name: from its key
  return { id, key: toBase32(pub), privateKey, label: 'Papier' };
}

/**
 * A certificate: by (a trusted signer: { id, label, privateKey }) names signer ({ id, key, label }) → { path, text }.
 * person: { id, label } of the one who certifies.
 */
export async function certify({ by, signer, person, now = Date.now() }) {
  const id = newId({ q: by.id, n: person.id, now });
  const time = timeLabel(now);
  const text = await signed({ privateKey: by.privateKey }, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }),
    [defLine('sharing-point.1', { hint: signer.label, id: `${signer.id} z_${signer.key}` })], [`((signer) {:sharing-point.1})'t(${time})`]));
  return { path: `${FOLDER}${buildName({ words: ['signer', signer.label], person: person.label, time, u: uOf(id), kind: 'chain', ext: 'sign' })}`, text };
}

/** Read a certificate → { by (q_ of the sealer), signer: { id, key, label } } or null. */
export function readCertificate(text) {
  try {
    const f = readFile(text);
    const d = f.defs.get('sharing-point.1');
    if (!/\(\(signer\)/.test(f.rows[0]?.text ?? '') || !d?.id?.z) return null;
    return { by: f.head.id.q, signer: { id: d.id.q, key: d.id.z.slice(2), label: d.hint } };
  } catch { return null; }
}

/**
 * The trusted signers: anchor ({ q_: z_ } from project.json) plus every certificate sealed by someone trusted,
 * link by link (≤ 10). texts: the certificates (≤ 50). → { q_: z_ }
 */
export async function trustedSigners(anchor, texts = []) {
  const trusted = { ...(anchor ?? {}) };
  const certs = texts.slice(0, 50).map((text) => ({ text, c: readCertificate(text) })).filter((x) => x.c);
  for (let round = 0; round < 10; round++) {
    let added = false;
    for (const { text, c } of certs) {
      if (trusted[c.signer.id] || !trusted[c.by]) continue;
      if (await checkWitness(trusted[c.by], text)) { trusted[c.signer.id] = c.signer.key; added = true; }
    }
    if (!added) break;
  }
  return trusted;
}

/** All certificates of a door, read through store (the door links or the admin's own folder) → [text]. */
export async function certificatesIn(store) {
  const dec = new TextDecoder();
  const paths = (await store.list(FOLDER).catch(() => [])).map((f) => f.path).filter((p) => p.endsWith('.sign')).slice(0, 50);
  return Promise.all(paths.map(async (p) => dec.decode(await store.read(p))));
}
