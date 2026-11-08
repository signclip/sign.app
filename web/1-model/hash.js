// hash.js — content hashes: which exact bytes.
//
// Purpose:   same bytes → same hash, on every device (SCHEMA.md B2). A file never contains its
//            own hash; the hash stands where the file is used (definition in a line).
// Depends:   ids.js (Base32), Web Crypto (browser and Node).
// Origin:    SHA-256 (FIPS 180-4), written in Crockford Base32 without prefix (52 characters).
// Test:      tests/model.test.mjs
// Limits:    collisions become likely only around 2^128 files.
// EXTEND(S14, hash): chunked hashing for large videos and live streams; a different method
//                    gets a different length, so old hashes stay readable.

import { toBase32 } from './ids.js';

const encoder = new TextEncoder();

/** Hash bytes or a string (UTF-8). Returns 52 Base32 characters. */
export async function hashBytes(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toBase32(new Uint8Array(digest));
}

/** Text as it is stored: Unicode NFC, ’ as ', line ends LF. Same text → same bytes → same hash. */
export function storedText(text) {
  return text.normalize('NFC').replace(/’/g, "'").replace(/\r\n?/g, '\n');
}
