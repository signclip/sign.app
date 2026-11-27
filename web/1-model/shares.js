// shares.js — a key in parts: any `need` of them give it back, fewer give nothing (27.11., user: 2 of 3, for getting
//            back in when no device holds a key any more).
//
// Purpose:   a key that lies whole with one holder is read by that holder; a key that lies nowhere else is lost with the
//            device. In parts it lies with several holders (the paper, the admin, a trusted person, a passkey …), and
//            only `need` of them together have it. Per byte of the key a random curve of degree need − 1 is drawn whose
//            value at 0 is that byte (Shamir, in GF(2⁸) as AES counts); part x holds the values at x. Through `need`
//            points runs one such curve, through fewer run curves to every possible byte: fewer parts do not make
//            guessing easier, they say nothing at all.
//              splitKey   key → parts [{ x, need, of, part }]; x = 1 … of, part as long as the key
//              joinParts  ≥ need parts → the key
//            Where the parts lie and for whom each is sealed: 2-storage/sealed-keys.js.
// Depends:   Web Crypto (getRandomValues). No library.
// Test:      tests/shares.test.mjs
// Limits:    need 2 … of, of ≤ 255 · a part = the length of the key (32 bytes) plus its number · split and join of a key
//            ≈ 0.004 ms (measured, server CPU) · joinParts cannot notice a changed part, a part of another split or too few parts with a wrong
//            `need`: it then returns other bytes. The caller compares the name of what comes out (sealed.js keyName).

export const MOST_PARTS = 255;

// GF(2⁸) with x⁸ + x⁴ + x³ + x + 1: powers of 3 as a table, so multiplying is adding exponents.
const EXP = new Uint8Array(510), LOG = new Uint8Array(256);
for (let i = 0, v = 1; i < 255; i++) {
  EXP[i] = EXP[i + 255] = v;
  LOG[v] = i;
  v ^= ((v << 1) ^ (v & 0x80 ? 0x11b : 0)) & 255; // v · 3 = v · 2 ⊕ v
}
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const div = (a, b) => (a ? EXP[LOG[a] + 255 - LOG[b]] : 0); // b is never 0 here

/**
 * A key in `of` parts, `need` of which give it back. key: Uint8Array (32 bytes; any length works).
 * → [{ x (1 … of), need, of, part (Uint8Array, as long as the key) }]
 */
export function splitKey(key, { need = 2, of = 3 } = {}) {
  if (!key?.length) throw new Error('nothing to split');
  if (!Number.isInteger(need) || !Number.isInteger(of)) throw new Error('need and of are whole numbers');
  if (need < 2) throw new Error('a key in parts needs at least 2 of them (1 would be the key itself)');
  if (of > MOST_PARTS) throw new Error('at most 255 parts');
  if (need > of) throw new Error('cannot need more than there are');
  const n = key.length;
  const rest = new Uint8Array(n * (need - 1)); // the curve's other coefficients, per byte
  for (let i = 0; i < rest.length; i += 65536) globalThis.crypto.getRandomValues(rest.subarray(i, i + 65536)); // the platform gives ≤ 64 KiB per call
  const parts = [];
  for (let x = 1; x <= of; x++) {
    const part = new Uint8Array(n);
    for (let j = 0; j < n; j++) {
      let y = 0;
      for (let c = need - 2; c >= 0; c--) y = mul(y, x) ^ rest[c * n + j]; // Horner, highest coefficient first
      part[j] = mul(y, x) ^ key[j];
    }
    parts.push({ x, need, of, part });
  }
  return parts;
}

/** The key from its parts: [{ x, part, need? }], at least `need` different ones (more are fine). → Uint8Array */
export function joinParts(parts) {
  if (!parts?.length) throw new Error('no parts');
  const need = parts[0].need ?? 2;
  if (parts.length < need) throw new Error(`this key needs ${need} parts`);
  const n = parts[0].part.length;
  const xs = parts.map((p) => p.x);
  for (const p of parts) {
    if (!Number.isInteger(p.x) || p.x < 1 || p.x > MOST_PARTS) throw new Error('the number of a part is 1 … 255');
    if (p.part.length !== n) throw new Error('parts of one key have the same length');
  }
  if (new Set(xs).size !== xs.length) throw new Error('the same part twice');
  const out = new Uint8Array(n);
  parts.forEach((p, i) => {
    let weight = 1; // the value at 0 of the curve that is 1 at this x and 0 at the others
    xs.forEach((x, m) => { if (m !== i) weight = mul(weight, div(x, x ^ p.x)); });
    for (let j = 0; j < n; j++) out[j] ^= mul(p.part[j], weight);
  });
  return out;
}
