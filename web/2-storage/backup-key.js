// backup-key.js — the backup key lies sealed next to the backup: openable by a host device or by
// the paper password, never by the backup alone (decision 08.11.).
//
// Purpose:   backup/keys/<q_>.key      the backup key sealed for one host device (ECDH P-256 → AES-GCM,
//                                      crypto.seal); only that device's private key opens it
//            backup/keys/paper.key     the backup key sealed with the paper password
//                                      (PBKDF2-SHA-256, 210,000 rounds → AES-256-GCM)
//            The readable key is never written anywhere; the app opens it only after the password
//            gestures (9-ui). A new host device gets its own .key; a removed one: its file is deleted.
// Depends:   1-model/crypto (seal, unseal, newPassword), 1-model/ids (Base32), memory.js
// Test:      tests/backup.test.mjs
// Limits:    ~200 B per sealed key · opening with the paper password takes ~0.2 s on a phone
//            (on purpose: guessing stays slow) · paper password: 26 Base32 chars ≈ 130 bit.

import { seal, unseal, newPassword } from '../1-model/crypto.js';
import { toBase32, fromBase32 } from '../1-model/ids.js';

export const KEYS = 'backup/keys/';
const ROUNDS = 210_000;
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const bytesOf = (text, n) => {
  let v = fromBase32(text);
  const out = new Uint8Array(n);
  for (let i = n - 1; i >= 0; i--) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
};

/** A new paper password (26 chars). Printed on the emergency sheet, never shown on screen. */
export const newPaperPassword = newPassword;

async function paperKey(password, salt) {
  const base = await subtle().importKey('raw', enc.encode(password.toUpperCase()), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Seal the backup key for every host device and for the paper password, into the backup store.
 * hosts: [{ id (q_), pickup (ECDH public, Base32) }] · paper: paper password or null.
 */
export async function sealBackupKey(store, backupKey, { hosts = [], paper = null } = {}) {
  const written = [];
  for (const h of hosts) {
    const path = `${KEYS}${h.id}.key`;
    await store.write(path, enc.encode(await seal(h.pickup, backupKey)));
    written.push(path);
  }
  if (paper) {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await paperKey(paper, salt), enc.encode(backupKey)));
    await store.write(`${KEYS}paper.key`, enc.encode([toBase32(salt), toBase32(iv), toBase32(data)].join(' ')));
    written.push(`${KEYS}paper.key`);
  }
  return written;
}

/** Open the backup key: with a host device ({ id, privateKey }) or with the paper password. */
export async function openBackupKey(store, { host = null, paper = null } = {}) {
  if (host) return unseal(host.privateKey, dec.decode(await store.read(`${KEYS}${host.id}.key`)));
  if (paper) {
    const [salt, iv, data] = dec.decode(await store.read(`${KEYS}paper.key`)).split(' ');
    const key = await paperKey(paper, bytesOf(salt, 16));
    // data length: key text (52) + 16 tag bytes = 68 bytes
    return dec.decode(await subtle().decrypt({ name: 'AES-GCM', iv: bytesOf(iv, 12) }, key, bytesOf(data, 68)));
  }
  throw new Error('a host device or the paper password is needed');
}
