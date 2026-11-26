// symbols.js — the one list of symbols, kinds, ID parts and folders (SCHEMA.md §3).
//
// Purpose:   every other file reads its symbols from here; nothing is spelled twice.
// Depends:   nothing.
// Test:      tests/model.test.mjs
// Limits:    adding a symbol or kind is an addition here plus a line in SCHEMA.md; existing
//            files stay valid because no symbol changes its meaning.

/** Meta symbols in the order they are written: ^ which sharing point (its name), = its full path, ~ came from, ! id, @ whose (person), ° where it was, 't time, ' part.
 *  26.11. (user): ~ before ! – where it came from stands next to its name, the long id and hash behind: :~w.1~(wake :v.1)!(q_… u_… HASH).
 *  Reading does not depend on the order (files written before keep !( )~( )). */
export const META = ['^', '=', '~', '!', '@', '°', "'t", "'"];

/** Symbols that wrap or filter: without, must contain (reserved), similar ?( ), gap (Take). */
export const WRAP = ['-', '+', '?', '_'];

/** Parser order: longest first, so 't wins over '. */
export const SYMBOLS = ["'t", ...META.filter((s) => s !== "'t"), ...WRAP];

/** Parts of an identity !( ), coarse to fine: source (device or sharing point), person, H3 cell, time, random. */
export const ID_PARTS = ['q', 'n', 'o', 't', 'u']; // o_ = Ort (H3 cell), renamed from e_ on 13.11. (no file had it)

/**
 * Kinds of files. folder: where the file lies inside a sharing point (2-storage/layout.js).
 * echo kinds are always computed; x is an original when typed and an echo when computed.
 * ~ before the letter (26.11., user, SCHEMA G10) = this strand is computed, an echo in echo/: :~x Whisper text, later :~v from
 * modeling. computed: kinds that exist only computed, always written with ~ (:~w :~l :~m). In folders, file names
 * and code the letter stays (echo/w/, .w.jpg, kind 'w').
 * follows: a kind that goes wherever its source goes – the wake shows the same as its :v, so it never goes alone
 * and never stays behind (no own consent, no own chip).
 */
export const KINDS = {
  v: { ext: 'mp4', folder: 'take', what: 'visual, no sound' },
  a: { ext: 'wav', folder: 'take', what: 'audio, 32 bit float as the browser computes it' },
  x: { ext: 'sign', folder: 'take', what: 'text and context', json: true },
  l: { ext: 'parquet', folder: 'echo', what: 'landmarks', computed: true },
  m: { ext: 'mp4', folder: 'echo', what: 'mask', computed: true },
  w: { ext: 'jpg', folder: 'echo', what: 'wake: the small picture of a take, 96 × 96 JPEG from its :v', computed: true, follows: 'v' },
  chain: { ext: 'sign', folder: 'chain', what: 'lines on top of each other, newest on top; at the bottom the chain it builds on', json: true },
  'sharing-point': { ext: 'sign', folder: '', what: 'a sharing point describes itself; a device is one with a key z_' },
};

/** Sign before the letter of a computed strand (G10): :~x :~w :~l :~m. */
export const COMPUTED = '~';

/** Kind → how it is written after ":" – 'w' → '~w', 'v' → 'v', ('x', true) → '~x'. */
export const artOf = (kind, computed = false) => (computed || KINDS[kind]?.computed ? COMPUTED + kind : kind);

/** Written art → kind – '~w' → 'w', 'v' → 'v'. */
export const kindOf = (art) => (art.startsWith(COMPUTED) ? art.slice(COMPUTED.length) : art);

/** Name of a strand inside a file: ('w', 1) → '~w.1', ('v', 2) → 'v.2', ('x', 1, true) → '~x.1'. */
export const strandName = (kind, n, computed = false) => `${artOf(kind, computed)}.${n}`;

/** Order of strands inside one { } (G10): the wake first, then as before, each recorded before computed (x, ~x).
 *  Meaning is the same in any order (G2); one order gives one text and so one hash (§1). */
export const STRAND_ORDER = ['w', 'v', 'a', 'x', 'l', 'm'];

/** Sort strand names or kinds into STRAND_ORDER; anything else (chain, _ ) comes after them, in its own order. */
export function inOrder(names) {
  const rank = (s) => {
    const art = String(s).split('.')[0], i = STRAND_ORDER.indexOf(kindOf(art));
    return i < 0 ? 2 * STRAND_ORDER.length : 2 * i + (art.startsWith(COMPUTED) ? 1 : 0);
  };
  return [...names].map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
}

/** Kinds plus those that follow them: ['v', 'x'] → ['v', 'x', 'w']. */
export function withFollowers(kinds) {
  const out = [...kinds];
  for (const [k, d] of Object.entries(KINDS)) if (d.follows && out.includes(d.follows) && !out.includes(k)) out.push(k);
  return out;
}

/** Kinds that may stand in a definition besides file kinds: similar (?) and take (waits for a Take). */
export const DEF_KINDS = ['?', '_'];

/** Folders inside every sharing point. Secrets never live here (they live in the keychain). */
export const FOLDERS = ['take', 'echo', 'chain', 'index'];

/** Characters never allowed in a file name (Windows, macOS, Linux, WebDAV). */
export const NAME_FORBIDDEN = /[:{}/\\*?"<>|#%\u0000-\u001f]/g;

/** Longest file name in bytes (UTF-8) that every file system accepts. */
export const NAME_MAX_BYTES = 255;
