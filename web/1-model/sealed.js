// sealed.js — end to end (22.11., built as mechanics, switched on in no group yet): a key per file, pieces of 8 MiB,
//            file keys kept by a group key.
//
// Purpose:   a group's files are sealed on the device before they leave; Nextcloud, Hetzner, the gateway and the
//            admin see sizes, times and month folders only. Three levels (md/infrastructure-setup.svg §9):
//              pickup key (P-256, crypto.js)  opens the group key once: it came sealed in the hello back
//              group key (AES-256, 32 bytes)  opens the group's runs (2-storage/sealed-store.js), which hold the file keys
//              file key (AES-256, 32 bytes)   drawn new for every file; opens that file's pieces, nothing else
//            A sealed file = its pieces one after the other, each AES-256-GCM. Nonce = piece number: a file key seals
//            one file only, so a counter never repeats. Piece number and "last" are bound into every piece: a piece
//            moved, swapped or cut off never opens. Name = SHA-256 of the sealed bytes: the same sealed file has the
//            same name everywhere, so a copy into another group moves the bytes as they are and only the 32-byte file
//            key is sealed again (≈ 0.1 ms).
// Depends:   Web Crypto, ids.js (Base32), crypto.js (seal/unseal for the pickup key)
// Test:      tests/sealed.test.mjs
// Limits:    PIECE = 8 MiB plain → 8 MiB + 16 bytes sealed (1 GB: 128 pieces, 2 KB more) · ≤ 2³² pieces per file ·
//            openPiece holds one piece (seek in a video); sealFile/openFile hold the whole file, as the stores do today ·
//            measured with Web Crypto on a server CPU: ≈ 2.4 GB/s sealing, ≈ 1.4 GB/s opening, 0.07 ms per key;
//            a phone a few 100 MB/s (estimate, not measured).

import { toBase32, fromBase32 } from './ids.js';
import { seal, unseal } from './crypto.js';

export const PIECE = 8 * 1024 * 1024;
const TAG = 16;
const STEP = PIECE + TAG;
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

/** A new key of 32 random bytes: a group key or a file key. Nothing is derived, no password. */
export const newKey = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

/** 32 bytes ↔ 52 Base32 chars (as the backup key). */
export const keyText = (key) => toBase32(key);
export function keyBytes(text) {
  if (!/^[0-9A-Z]{52}$/.test(text ?? '')) throw new Error('a key is 52 Base32 chars (32 bytes)');
  let v = fromBase32(text);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
}

const aes = (raw, use) => subtle().importKey('raw', raw, 'AES-GCM', false, use);
function nonce(i) {
  const n = new Uint8Array(12);
  new DataView(n.buffer).setUint32(8, i);
  return n;
}
function bound(i, last) { // what every piece carries along unseen: which file format, which piece, the last one or not
  const a = new Uint8Array(16);
  a.set(enc.encode('sign file 1'));
  new DataView(a.buffer).setUint32(11, i);
  a[15] = last ? 1 : 0;
  return a;
}

/** How many pieces n plain bytes become (at least one, also for 0 bytes) and how long the sealed file is. */
export const piecesOf = (n) => Math.max(1, Math.ceil(n / PIECE));
export const sealedSize = (n) => n + TAG * piecesOf(n);
/** Where piece i lies in a sealed file of the given length: [start, end) – for reading one piece only. */
export const pieceRange = (length, i) => [i * STEP, Math.min(length, (i + 1) * STEP)];
const piecesIn = (length) => Math.ceil(length / STEP);

/** Seal plain bytes with a file key → the sealed file. */
export async function sealFile(bytes, fileKey) {
  const k = await aes(fileKey, ['encrypt']);
  const n = piecesOf(bytes.length);
  const out = new Uint8Array(sealedSize(bytes.length));
  for (let i = 0; i < n; i++) {
    const part = bytes.subarray(i * PIECE, Math.min(bytes.length, (i + 1) * PIECE));
    const c = await subtle().encrypt({ name: 'AES-GCM', iv: nonce(i), additionalData: bound(i, i === n - 1) }, k, part);
    out.set(new Uint8Array(c), i * STEP);
  }
  return out;
}

/** Open piece i of a sealed file (the whole file, or only that piece's bytes from pieceRange: give length then). */
export async function openPiece(sealedOrPiece, fileKey, i, length = sealedOrPiece.length, k = null) {
  const [a, b] = pieceRange(length, i);
  const piece = sealedOrPiece.length === length ? sealedOrPiece.subarray(a, b) : sealedOrPiece;
  const key = k ?? await aes(fileKey, ['decrypt']);
  const last = i === piecesIn(length) - 1;
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: nonce(i), additionalData: bound(i, last) }, key, piece));
}

/** Open a whole sealed file. Fails if a single byte was changed, a piece moved or the end cut off. */
export async function openFile(sealed, fileKey) {
  if (!sealed?.length) throw new Error('not a sealed file');
  const k = await aes(fileKey, ['decrypt']);
  const n = piecesIn(sealed.length);
  const out = new Uint8Array(sealed.length - TAG * n);
  for (let i = 0; i < n; i++) out.set(await openPiece(sealed, null, i, sealed.length, k), i * PIECE);
  return out;
}

/** The name of a sealed file: 26 Base32 chars of its SHA-256 (130 bit). Says nothing about the content. */
export async function nameOf(sealed) {
  return toBase32(new Uint8Array(await subtle().digest('SHA-256', sealed))).slice(0, 26);
}

/** Seal small bytes (a run, a key) with a 32-byte key: 12 bytes nonce + data + 16 bytes check. label binds the use. */
export async function sealBytes(bytes, key, label) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(label) }, await aes(key, ['encrypt']), bytes));
  const out = new Uint8Array(12 + data.length);
  out.set(iv); out.set(data, 12);
  return out;
}
export async function openBytes(sealed, key, label) {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12), additionalData: enc.encode(label) }, await aes(key, ['decrypt']), sealed.subarray(12)));
}

/** The group key for one device: sealed for its pickup key (ECDH P-256 → HKDF → AES-GCM, crypto.js), one line. */
export const sealGroupKey = (pickupPublicB32, groupKey) => seal(pickupPublicB32, keyText(groupKey));
export const openGroupKey = async (pickupPrivateKey, line) => keyBytes(await unseal(pickupPrivateKey, line));
