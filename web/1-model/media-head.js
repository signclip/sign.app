// media-head.js — video, sound and picture carry their own head with ID and seal (14.11., SCHEMA §11 → B5).
//
// Purpose:   a file that travels alone still says where it began: the head line (:v!(q_ n_ o_ t_ u_ y_)@(…)'t(…))
//            sits inside the file where players skip it. The seal y_ covers the head and the hash of the content
//            (the bytes without the head): the content stays as recorded, the head is added around it.
//            The hash stays neutral (only bytes, no maker, no folder): files may move; y_ / z_ prove the origin.
//              .a.wav   chunk "sign" (wav.js)
//              .v.png   chunk tEXt with the keyword "sign", right after IHDR
//              .v.mp4   a top-level box "uuid" at the end (players skip unknown boxes)
//            .webm and .l.parquet: no head yet (webm only where MP4 cannot be recorded; parquet with landmarks, S5).
// Depends:   1-model/hash.js, crypto.js, wav.js
// Test:      tests/model.test.mjs
// Limits:    the head is ≤ 1 KB · reading walks the top-level boxes / chunks once (a few µs per 1000 boxes) ·
//            hashing the content: SHA-256 over the whole file in memory (a 10 min take ≈ 1 s on a phone).

import { hashBytes } from './hash.js';
import { witness, checkWitness } from './crypto.js';
import { readWav } from './wav.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const UUID = enc.encode('signclip.head.01'); // 16 bytes: our box among other uuid boxes

/** The text the seal covers: the head line, then the hash of the content. */
const sealedText = async (head, content) => `${head}\n${await hashBytes(content)}`;

/** Seal a head for this content. deviceKey: { privateKey } or null (then the head stays unsealed). */
export async function sealHead(deviceKey, head, content) {
  if (!deviceKey) return head;
  return (await witness(deviceKey.privateKey, await sealedText(head, content))).split('\n')[0];
}

/** Is the seal in this head right for the content and the device's check key z_? */
export async function checkHead(publicB32, head, content) {
  return Boolean(head) && checkWitness(publicB32, await sealedText(head, content));
}

// ---------- PNG ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255];
const join = (...parts) => { // byte arrays one after another, without spreading big files into lists
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

function pngWith(png, head) {
  const body = join(enc.encode('tEXtsign'), [0], enc.encode(head)); // type + keyword + 0 + text
  const chunk = join(be32(body.length - 4), body, be32(crc32(body)));
  const at = 8 + 25; // signature + IHDR (13 bytes data + 12)
  return join(png.subarray(0, at), chunk, png.subarray(at));
}
function pngRead(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let o = 8; o + 12 <= bytes.length;) {
    const len = v.getUint32(o), type = dec.decode(bytes.subarray(o + 4, o + 8));
    if (type === 'tEXt' && dec.decode(bytes.subarray(o + 8, o + 13)) === 'sign\0') {
      return { head: dec.decode(bytes.subarray(o + 13, o + 8 + len)), content: join(bytes.subarray(0, o), bytes.subarray(o + 12 + len)) };
    }
    o += 12 + len;
  }
  return { head: '', content: bytes };
}

// ---------- MP4 ----------
function mp4With(mp4, head) {
  const text = enc.encode(head), size = 8 + 16 + text.length;
  return join(mp4, be32(size), enc.encode('uuid'), UUID, text);
}
function mp4Read(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let o = 0; o + 8 <= bytes.length;) {
    const size = v.getUint32(o), type = dec.decode(bytes.subarray(o + 4, o + 8));
    if (size < 8) break; // 0 (to the end) or 64-bit sizes: no head of ours after it
    if (type === 'uuid' && UUID.every((b, i) => bytes[o + 8 + i] === b)) {
      return { head: dec.decode(bytes.subarray(o + 24, o + size)), content: join(bytes.subarray(0, o), bytes.subarray(o + size)) };
    }
    o += size;
  }
  return { head: '', content: bytes };
}

/** Put a (sealed) head into the file. ext: 'png' | 'mp4' (wav: encodeWav writes it). Other formats unchanged. */
export function withHead(ext, bytes, head) {
  if (ext === 'png') return pngWith(bytes, head);
  if (ext === 'mp4') return mp4With(bytes, head);
  return bytes;
}

/** The head and the content (the file without its head) → { head, content }; head '' when there is none. */
export function readHead(ext, bytes) {
  if (ext === 'png') return pngRead(bytes);
  if (ext === 'mp4') return mp4Read(bytes);
  if (ext === 'wav') { const w = readWav(bytes); return { head: w.head, content: bytes.subarray(w.dataAt, w.dataAt + w.dataLen) }; }
  return { head: '', content: bytes };
}

/** Seal a head and put it in: the content is what was recorded. → the file with its head. */
export async function headed(ext, bytes, head, deviceKey) {
  return withHead(ext, bytes, await sealHead(deviceKey, head, bytes));
}
