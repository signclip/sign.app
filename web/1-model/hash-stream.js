// hash-stream.js — the same hash as hash.js, for bytes that come piece by piece (26.11., user: big files, imports).
//
// Purpose:   a file that never lies whole in memory (a long Take, an import, a package of 100 GB) still gets the
//            hash of SCHEMA.md B2: SHA-256 over all its bytes, 52 Base32 characters. Web Crypto hashes only whole
//            buffers (crypto.subtle.digest takes no pieces), so the rounds are written out here once. Same bytes →
//            same hash as hashBytes, however they were cut: one meaning, one spelling.
//              const h = hashStream();   h.add(bytes) … h.add(bytes)   h.done() → 52 characters
// Depends:   ids.js (Base32)
// Origin:    SHA-256 as in FIPS 180-4 (5.3.3 start values, 4.2.2 constants, 6.2.2 rounds); no library.
// Test:      tests/pieces.test.mjs (against Web Crypto at every edge of a block and for every cut; the length words)
// Limits:    measured ≈ 165 MB/s (Node 22, one core, server CPU; Web Crypto on whole buffers ≈ 4–7 × faster); a phone
//            ≈ 3–5 × slower (estimate, to be measured): a Take of 9 MB ≈ 0.05–0.3 s, 1 GB ≈ 6–30 s, 190 GB ≈ 20–100 min ·
//            exact up to 2⁵³ bytes (JavaScript's whole numbers; SHA-256 itself ends at 2⁶¹) · holds 64 bytes and 72
//            words, whatever the size · a stream is used once: after done() another add throws · runs where it is
//            called; a worker keeps the screen free (later).

import { toBase32 } from './ids.js';

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * How a message of `bytes` bytes ends: its length in bits as two 32-bit words, high then low.
 * Written without shifts, because a shift in JavaScript only sees 32 bits: 2²⁹ bytes already fill the low word.
 */
export const lengthWords = (bytes) => [Math.floor(bytes / 0x20000000) >>> 0, ((bytes % 0x20000000) * 8) >>> 0];

/** One block of 64 bytes, read from b at o, into the eight words of H. w: 64 words to work in. */
function rounds(H, w, b, o) {
  for (let i = 0; i < 16; i++, o += 4) w[i] = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15], y = w[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = H[0], c = H[1], d = H[2], e = H[3], f = H[4], g = H[5], h = H[6], k = H[7]; // FIPS names them a…h; b is the input here
  for (let i = 0; i < 64; i++) {
    const S1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
    const t1 = (k + S1 + ((f & g) ^ (~f & h)) + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & c) ^ (a & d) ^ (c & d))) | 0;
    k = h; h = g; g = f; f = (e + t1) | 0; e = d; d = c; c = a; a = (t1 + t2) | 0;
  }
  H[0] += a; H[1] += c; H[2] += d; H[3] += e; H[4] += f; H[5] += g; H[6] += h; H[7] += k;
}

/** SHA-256 over bytes that come in pieces. → { add(bytes), digest() → Uint8Array(32) } */
export function sha256Stream() {
  const H = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Int32Array(64);
  const rest = new Uint8Array(64); // the bytes of a block that is not full yet
  let held = 0, bytes = 0, closed = false;

  return {
    add(data) {
      if (closed) throw new Error('this hash is done');
      const n = data.length;
      let o = 0;
      bytes += n;
      if (held) { // fill the block that was begun
        const take = Math.min(64 - held, n);
        rest.set(data.subarray(0, take), held);
        held += take; o = take;
        if (held < 64) return this;
        rounds(H, w, rest, 0); held = 0;
      }
      for (; o + 64 <= n; o += 64) rounds(H, w, data, o); // whole blocks straight from the piece, nothing copied
      if (o < n) { rest.set(data.subarray(o), 0); held = n - o; }
      return this;
    },
    digest() {
      if (closed) throw new Error('this hash is done');
      closed = true;
      const [high, low] = lengthWords(bytes);
      rest[held++] = 0x80;
      if (held > 56) { rest.fill(0, held); rounds(H, w, rest, 0); held = 0; } // no room left for the length: one more block
      rest.fill(0, held, 56);
      const end = new DataView(rest.buffer);
      end.setUint32(56, high); end.setUint32(60, low);
      rounds(H, w, rest, 0);
      const out = new Uint8Array(32), view = new DataView(out.buffer);
      H.forEach((word, i) => view.setInt32(i * 4, word));
      return out;
    },
  };
}

/** The hash of hash.js (52 Base32 characters), over bytes that come in pieces. → { add(bytes), done() → hash } */
export function hashStream() {
  const sum = sha256Stream();
  return { add(bytes) { sum.add(bytes); return this; }, done: () => toBase32(sum.digest()) };
}
