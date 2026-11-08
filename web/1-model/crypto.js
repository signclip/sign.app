// crypto.js — keys, signatures, sealing, secure randomness. Only what the platform has built in.
//
// Purpose:   device key (Ed25519): sign files, confirm other devices (join) ·
//            pickup (ECIES): the admin APK seals a device password so only the asking device
//            can open it: ECDH P-256 → HKDF-SHA-256 → AES-256-GCM ·
//            secure randomness for codes and random draws (never Math.random).
// Depends:   Web Crypto (every current browser, Node 20+). No library.
// Test:      tests/model.test.mjs
// Limits:    Ed25519 signature 64 bytes, public key 32 bytes, ~0.1 ms per signature ·
//            sealed device password ~150 bytes · private keys are created non-extractable:
//            they never leave the device (browser storage or keychain holds the handle).
// Witness:   y_ inside !( ) of the own head (decision 08.11.): signature over the whole file
//            without its y_ token; copies keep it; checked with the public key of device q_.

import { toBase32, fromBase32 } from './ids.js';

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const b32 = (buf) => toBase32(new Uint8Array(buf));
const bytesOf = (text, length) => {
  let v = fromBase32(text);
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
};

/** Device key: { privateKey (handle), publicKey (handle), public: Base32 of the 32 raw bytes }. */
export async function newDeviceKey() {
  const k = await subtle().generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  return { privateKey: k.privateKey, publicKey: k.publicKey, public: b32(await subtle().exportKey('raw', k.publicKey)) };
}

/** Sign bytes or text; returns the signature in Base32 (103 characters). */
export async function sign(privateKey, data) {
  return b32(await subtle().sign('Ed25519', privateKey, typeof data === 'string' ? enc.encode(data) : data));
}

/** Check a signature against a public key given in Base32. */
export async function verify(publicB32, data, signatureB32) {
  const key = await subtle().importKey('raw', bytesOf(publicB32, 32), { name: 'Ed25519' }, false, ['verify']);
  return subtle().verify('Ed25519', key, bytesOf(signatureB32, 64), typeof data === 'string' ? enc.encode(data) : data);
}

/** Pickup key of the asking device: ECDH P-256. public: Base32 of the 65 raw bytes. */
export async function newPickupKey() {
  const k = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { privateKey: k.privateKey, public: b32(await subtle().exportKey('raw', k.publicKey)) };
}

async function aesKey(privateKey, publicRaw) {
  const pub = await subtle().importKey('raw', publicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: pub }, privateKey, 256);
  const hkdf = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('sign pickup 1') }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Admin side: seal text for the device whose pickup public key is given. Returns one line of text. */
export async function seal(devicePublicB32, text) {
  const eph = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const key = await aesKey(eph.privateKey, bytesOf(devicePublicB32, 65));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return [b32(await subtle().exportKey('raw', eph.publicKey)), b32(iv), b32(data)].join(' ');
}

/** Device side: open what was sealed for it. Fails if anything was changed on the way. */
export async function unseal(privateKey, sealed) {
  const [ephB32, ivB32, dataB32] = sealed.split(' ');
  const key = await aesKey(privateKey, bytesOf(ephB32, 65));
  const dataLen = Math.floor((dataB32.length * 5) / 8);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: bytesOf(ivB32, 12) }, key, bytesOf(dataB32, dataLen));
  return new TextDecoder().decode(plain);
}

const W = / y_[0-9A-Z]+(?=[ )])/;

/** The file without its witness: what is signed and checked. */
export function unwitnessed(text) {
  const [head, ...rest] = text.split('\n');
  return [head.replace(W, ''), ...rest].join('\n');
}

/** Sign a .sign text: the witness y_ goes into !( ) of the head line. */
export async function witness(privateKey, text) {
  const plain = unwitnessed(text);
  const w = await sign(privateKey, plain);
  const [head, ...rest] = plain.split('\n');
  const at = head.indexOf('!(');
  if (at < 0) throw new Error('head without !( )');
  const close = head.indexOf(')', at);
  return [head.slice(0, close) + ` y_${w}` + head.slice(close), ...rest].join('\n');
}

/** Witness the text if a device key is there, else leave it (before the first key, foreign tools). */
export async function signed(deviceKey, text) {
  return deviceKey ? witness(deviceKey.privateKey, text) : text;
}

/** Is the witness of this text right for the public key of its device? */
export async function checkWitness(publicB32, text) {
  const m = /y_([0-9A-Z]+)/.exec(text.split('\n')[0]);
  return m ? verify(publicB32, unwitnessed(text), m[1]) : false;
}

/** A password for a link (read-only link, file drop): 26 Base32 characters = 130 bits. */
export function newPassword() {
  return toBase32(globalThis.crypto.getRandomValues(new Uint8Array(17))).slice(-26);
}

/** A secure random integer 0 ≤ n < max (no modulo bias). */
export function randomInt(max) {
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buf = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}

/** Draw n different items at random (password gestures, ~(random 3)). */
export function draw(list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}
