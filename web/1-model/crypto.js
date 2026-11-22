// crypto.js — keys, signatures, sealing, secure randomness. Only what the platform has built in.
//
// Purpose:   device key and access key (P-256 ECDSA since 22.11.: the curve the phones' secure hardware has, Android
//            Keystore and StrongBox, iOS Secure Enclave; z_ = 33 bytes compressed, 53 characters): sign files, confirm
//            devices (join), sign wishes to a gateway. Ed25519 keys (z_ 32 bytes, 52 characters: the paper, keys made
//            before) are still checked; the length of z_ says which. A key handle may be native (9-ui/native-keys.js):
//            { sign(bytes) → raw r‖s } or { agree(peer65) → shared bits }, then the private half sits in the Keystore ·
//            pickup (ECIES): the admin APK seals a device app password so only the asking device
//            can open it: ECDH P-256 → HKDF-SHA-256 → AES-256-GCM ·
//            secure randomness for codes and random draws (never Math.random).
// Depends:   Web Crypto (every current browser, Node 20+). No library.
// Test:      tests/model.test.mjs
// Limits:    signature 64 bytes (r‖s, 103 characters), ~0.1–1 ms in the browser, ≈ 5–50 ms in the Keystore · sealed app
//            password ~150 bytes · private keys non-extractable: they never leave the device (storage holds the handle).
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

const P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n, B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const pow = (b, e) => { let r = 1n; b %= P; for (; e > 0n; e >>= 1n, b = (b * b) % P) if (e & 1n) r = (r * b) % P; return r; };
const big = (bytes) => bytes.reduce((v, x) => (v << 8n) | BigInt(x), 0n), bytes32 = (v) => Uint8Array.from({ length: 32 }, (_, i) => Number((v >> BigInt(8 * (31 - i))) & 255n));
/** P-256 public key: 65 raw bytes (04 x y) → 33 (02|03 x). */
export const compressP256 = (raw) => Uint8Array.from([2 + (raw[64] & 1), ...raw.slice(1, 33)]);
/** P-256 public key: 33 bytes → 65 raw bytes; y = √(x³ − 3x + b) mod p (p ≡ 3 mod 4). */
export function decompressP256(c) {
  const x = big(c.slice(1)), y2 = (((x * x % P) * x - 3n * x + B) % P + P) % P;
  let y = pow(y2, (P + 1n) / 4n);
  if ((y * y) % P !== y2) throw new Error('not a P-256 key');
  if (Number(y & 1n) !== (c[0] & 1)) y = P - y;
  return Uint8Array.from([4, ...bytes32(x), ...bytes32(y)]);
}

/** Device key (also the access key): { privateKey (handle, never leaves), publicKey, public: Base32 of 33 bytes }. */
export async function newDeviceKey() {
  const k = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  return { privateKey: k.privateKey, publicKey: k.publicKey, public: b32(compressP256(new Uint8Array(await subtle().exportKey('raw', k.publicKey)))) };
}

/** Sign bytes or text; returns the signature in Base32 (103 characters). privateKey: a CryptoKey or a native handle. */
export async function sign(privateKey, data) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  if (typeof privateKey?.sign === 'function') return b32(await privateKey.sign(bytes)); // native: the Keystore signs
  if (privateKey?.algorithm?.name === 'ECDSA') return b32(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes));
  return b32(await subtle().sign('Ed25519', privateKey, bytes));
}

/** Check a signature against a public key given in Base32 (53 characters: P-256, 52: Ed25519). */
export async function verify(publicB32, data, signatureB32) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data, sig = bytesOf(signatureB32, 64);
  if (String(publicB32).length >= 53) {
    const key = await subtle().importKey('raw', decompressP256(bytesOf(publicB32, 33)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, bytes);
  }
  const key = await subtle().importKey('raw', bytesOf(publicB32, 32), { name: 'Ed25519' }, false, ['verify']);
  return subtle().verify('Ed25519', key, sig, bytes);
}

/** Pickup key of the asking device: ECDH P-256. public: Base32 of the 65 raw bytes. */
export async function newPickupKey() {
  const k = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { privateKey: k.privateKey, public: b32(await subtle().exportKey('raw', k.publicKey)) };
}

async function aesKey(privateKey, publicRaw) {
  const shared = typeof privateKey?.agree === 'function' ? await privateKey.agree(publicRaw) // native: the Keystore agrees, the key stays inside
    : await subtle().deriveBits({ name: 'ECDH', public: await subtle().importKey('raw', publicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, privateKey, 256);
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
