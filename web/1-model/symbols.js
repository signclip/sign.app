// symbols.js — the one list of symbols, kinds, ID parts and folders (SCHEMA.md §3).
//
// Purpose:   every other file reads its symbols from here; nothing is spelled twice.
// Depends:   nothing.
// Test:      tests/model.test.mjs
// Limits:    adding a symbol or kind is an addition here plus a line in SCHEMA.md; existing
//            files stay valid because no symbol changes its meaning.

/** Meta symbols in the order they are written: ^ which sharing point (its name), = its full path, ! id, ~ came from, @ whose (person), ° where it was, 't time, ' part. */
export const META = ['^', '=', '!', '~', '@', '°', "'t", "'"];

/** Symbols that wrap or filter: without, must contain (reserved), similar ?( ), gap (Take). */
export const WRAP = ['-', '+', '?', '_'];

/** Parser order: longest first, so 't wins over '. */
export const SYMBOLS = ["'t", ...META.filter((s) => s !== "'t"), ...WRAP];

/** Parts of an identity !( ), coarse to fine: source (device or sharing point), person, H3 cell, time, random. */
export const ID_PARTS = ['q', 'n', 'e', 't', 'u'];

/**
 * Kinds of files. folder: where the file lies inside a sharing point (2-storage/layout.js).
 * echo kinds are always computed; x is an original when typed and an echo when computed.
 */
export const KINDS = {
  v: { ext: 'mp4', folder: 'take', what: 'visual, no sound' },
  a: { ext: 'wav', folder: 'take', what: 'audio, 32 bit float as the browser computes it' },
  x: { ext: 'sign', folder: 'take', what: 'text and context', json: true },
  l: { ext: 'parquet', folder: 'echo', what: 'landmarks' },
  m: { ext: 'mp4', folder: 'echo', what: 'mask' },
  chain: { ext: 'sign', folder: 'chain', what: 'lines on top of each other, newest on top; at the bottom the chain it builds on', json: true },
  'sharing-point': { ext: 'sign', folder: '', what: 'a sharing point describes itself; a device is one with a key z_' },
};

/** Kinds that may stand in a definition besides file kinds: similar (?) and take (waits for a Take). */
export const DEF_KINDS = ['?', '_'];

/** Folders inside every sharing point. Secrets never live here (they live in the keychain). */
export const FOLDERS = ['take', 'echo', 'chain', 'index'];

/** Characters never allowed in a file name (Windows, macOS, Linux, WebDAV). */
export const NAME_FORBIDDEN = /[:{}/\\*?"<>|#%\u0000-\u001f]/g;

/** Longest file name in bytes (UTF-8) that every file system accepts. */
export const NAME_MAX_BYTES = 255;
