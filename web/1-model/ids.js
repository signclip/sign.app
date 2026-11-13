// ids.js — identities !(q_ n_ e_ t_ u_), made on the device without a server.
//
// Purpose:   one identity per file: source (device or sharing point), person, H3 cell,
//            time, random (SCHEMA.md B2). Coarse to fine. Written as text, never one long string.
// Depends:   nothing (Web Crypto random from the platform).
// Origin:    Crockford Base32 alphabet; time part like UUIDv7 (RFC 9562), 48-bit milliseconds.
// Test:      tests/model.test.mjs
// Limits:    t_ runs until year 10889 · u_ has 80 random bits (16 chars): two files of the same
//            source in the same millisecond collide with p ≈ 1 / 2^80 · e_ is an H3 cell
//            (resolution 5, ~250 km², optional) given by the caller · the file name carries
//            u_ shortened to 12 chars (10⁶ files → p ≈ 4·10⁻⁷ that two share it; the head decides).
// Witness:   y_ ("yes") in the own head = signature of the device key over the whole file (crypto.js);
//            it confirms identity and content, it is not part of the identity.

import { ID_PARTS } from './symbols.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32, no I L O U

export class IdError extends Error {}

/** Encode bytes as Crockford Base32 (big-endian, left-padded to whole 5-bit groups). */
export function toBase32(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  const length = Math.ceil((bytes.length * 8) / 5);
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ALPHABET[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}

/** Decode Crockford Base32 to a BigInt (case-insensitive, I/L→1, O→0). */
export function fromBase32(text) {
  let value = 0n;
  for (const ch of text.toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0')) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new IdError(`not Base32: ${ch}`);
    value = (value << 5n) | BigInt(digit);
  }
  return value;
}

function random(chars) {
  const bytes = new Uint8Array(Math.ceil((chars * 5) / 8));
  globalThis.crypto.getRandomValues(bytes);
  return toBase32(bytes).slice(-chars);
}

/** 48-bit milliseconds as 10 Base32 characters; sorts like the time itself. */
export function timePart(ms) {
  if (!Number.isInteger(ms) || ms < 0 || ms >= 2 ** 48) throw new IdError(`time out of range: ${ms}`);
  const bytes = new Uint8Array(6);
  let v = BigInt(ms);
  for (let i = 5; i >= 0; i--) { bytes[i] = Number(v & 255n); v >>= 8n; }
  return toBase32(bytes); // 6 bytes → 10 chars
}

/** A new person: n_ + 16 random characters. Made once, never moved (S9: recovery 2 of 3). */
export function newPerson() { return 'n_' + random(16); }

/** A new source: a device or a sharing point (a device is a local sharing point). */
export function newSource() { return 'q_' + random(16); }

/** A new file identity. q: source, n: person, e: H3 cell or null, now: ms. */
export function newId({ q, n, e = null, now = Date.now() }) {
  if (!q?.startsWith('q_') || !n?.startsWith('n_')) throw new IdError('newId needs q_ and n_');
  return { q, n, e: e ? (e.startsWith('e_') ? e : 'e_' + e) : null, t: 't_' + timePart(now), u: 'u_' + random(16) };
}

/** Identity as text in fixed order; the witness y_ (own head only) and the hash (references) may follow. */
export function writeId(id, hash = null) {
  return [...ID_PARTS.map((k) => id[k]).filter(Boolean), id.z, id.y, hash].filter(Boolean).join(' ');
}

/** Read "q_… n_… e_… t_… u_… [y_…] [hash]" back. Parts may be missing (in a similar); order is checked. */
export function readId(text) {
  const id = { q: null, n: null, e: null, t: null, u: null, z: null, y: null, hash: null };
  let last = -1;
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const m = /^([a-z])_(.+)$/.exec(token);
    if (!m) { id.hash = token; continue; }
    if (m[1] === 'y') { id.y = token; continue; } // witness: confirms, is not part of the identity
    if (m[1] === 'z') { id.z = token; continue; } // public key of a device: in its sharing-point.sign and in lists
    const at = ID_PARTS.indexOf(m[1]);
    if (at < 0) throw new IdError(`unknown id part: ${token}`);
    if (at <= last) throw new IdError(`id parts out of order: ${text}`);
    id[m[1]] = token;
    last = at;
  }
  return id;
}

/** The key the index uses: identity parts only (no witness, no hash). Two copies share it. */
export function idKey(id) { return writeId({ ...id, z: null, y: null, hash: null }); }

/** u_ shortened for file names: "u_" + first 12 characters. */
export function shortU(id, length = 12) { return id.u ? id.u.slice(0, 2 + length) : null; }

/** Milliseconds of the time part. */
export function idTime(id) { return Number(fromBase32(id.t.slice(2))); }
