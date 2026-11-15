// backup.js — encrypted backup of a sharing point onto any store: external drive, another device,
// WebDAV (decision 08.11.: weekly, plus the provider's snapshots).
//
// Purpose:   files never change, so a backup is "copy what is new". Each file is sealed on the device
//            before it leaves (AES-256-GCM). Nothing on the target is readable, not even names:
//              backup/<JJJJ.MM>/<26>.sealed   one file's bytes, named by its content (HMAC of the bytes), in
//                                             the month of the file (from 't( ) in its name, like every month
//                                             folder of the layout; no 't = backup/ itself): the same bytes
//                                             under two paths are stored once
//              backup/run/<26 chars>.sealed   one run: which paths came, which went, each path → its content
//                                             name; every 'whole' run lists all paths (see below)
//              backup/keys/                   the sealed backup key (backup-key.js)
//            Paths live only in the runs, never in the content files (decision 15.11., storage review):
//              · a file that moves (hello → join → within) or is renamed is not stored again,
//                only its new path is noted; a restore brings it back at its latest path only
//              · the target is never listed file by file: the runs say what is there
//            Every copy is read back and opened once before it counts.
// Depends:   Web Crypto, 1-model/ids (Base32), 1-model/filename + layout (month), memory.js (errors)
// Test:      tests/backup.test.mjs
// Limits:    one file in memory at a time (a 4 s Take ≈ 10 MB) · 28 bytes more per file ·
//            names 26 chars = 130 bit: 10⁹ files collide with p ≈ 4·10⁻²² ·
//            month folders like the layout: FAT32 sticks take ~16,000 such names per folder = ~4,000 Takes
//            of one person in one month (130 a day); exFAT, NTFS, APFS, ext4 and WebDAV have no practical
//            limit · the folders show how many files came per month, nothing else ·
//            runs: a 'whole' run is written once the changes since the last one reach its size, so a
//            restore reads at most ~2× the list of paths (20,000 Takes: ~80,000 paths ≈ 15 MB) ·
//            the key is 32 bytes: without it the backup cannot be opened (backup-key.js keeps it sealed).
// Other way: rclone with its own crypt over WebDAV works too; it uses its own format.

import { toBase32, fromBase32 } from '../1-model/ids.js';
import { ExistsError, MissingError } from './memory.js';
import { readName } from '../1-model/filename.js';
import { monthOf } from './layout.js';

export const FOLDER = 'backup/';
const RUNS = `${FOLDER}run/`;
const NAME = 26; // chars of the content name (130 bit)
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** A new backup key, as Base32 text (52 chars). Never shown on screen: copy or send only. */
export function newBackupKey() {
  return toBase32(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

async function keys(keyB32) {
  if (!/^[0-9A-Z]{52}$/.test(keyB32 ?? '')) throw new Error('backup key must be 52 Base32 chars (32 bytes)');
  let v = fromBase32(keyB32);
  const raw = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { raw[i] = Number(v & 255n); v >>= 8n; }
  const [seal, name] = await Promise.all([
    subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']),
    subtle().importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ]);
  return { seal, name };
}

/** Content name: HMAC of the bytes, so equal bytes meet again and nothing is readable. */
async function contentName(k, bytes) {
  return toBase32(new Uint8Array(await subtle().sign('HMAC', k.name, bytes))).slice(0, NAME);
}
/** Where the content lies: the month of the file, as in the layout (15.11.). */
function contentPath(name, path) {
  const time = readName(path.slice(path.lastIndexOf('/') + 1))?.time;
  return time ? `${FOLDER}${monthOf(time)}/${name}.sealed` : `${FOLDER}${name}.sealed`;
}

async function seal(k, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, k.seal, bytes));
  const out = new Uint8Array(12 + data.length);
  out.set(iv); out.set(data, 12);
  return out;
}
const open = async (k, sealed) => new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, k.seal, sealed.slice(12)));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * All runs, oldest first → { paths: Map(path → content path), names: Map(content name → content path), since: changes since the
 * last whole run, size: paths in it, count: runs }. A run: { n (number of runs before it), t (ms),
 * whole, came: [[path, content path]], went: [path] }.
 */
async function readRuns(k, store) {
  const runs = [];
  for (const { path } of await store.list(RUNS).catch(() => [])) {
    if (path.endsWith('.sealed')) runs.push(JSON.parse(dec.decode(await open(k, await store.read(path)))));
  }
  runs.sort((a, b) => a.n - b.n || a.t - b.t);
  const from = Math.max(0, runs.findLastIndex((r) => r.whole));
  const paths = new Map(), names = new Map();
  let since = 0, size = 0;
  for (const r of runs.slice(from)) {
    if (r.whole) { paths.clear(); size = r.came.length; since = 0; } else since += r.came.length + r.went.length;
    for (const [p, c] of r.came) { paths.set(p, c); names.set(c.slice(c.lastIndexOf('/') + 1, -7), c); }
    for (const p of r.went) paths.delete(p);
  }
  return { paths, names, since, size, count: runs.length };
}

/** Does this store hold an encrypted backup? (Only the runs are listed, never the content files.) */
export async function holdsBackup(store) {
  return (await store.list(RUNS).catch(() => [])).some((f) => f.path.endsWith('.sealed'));
}

/**
 * Copy what is new from a sharing point into the backup store. filter(path) chooses files.
 * Returns { copied, kept, failed }: kept = already in the backup (also under another path).
 */
export async function backup(from, to, keyB32, { filter = () => true, now = Date.now() } = {}) {
  const k = await keys(keyB32);
  const state = await readRuns(k, to);
  const result = { copied: [], kept: [], failed: [] };
  const came = [], here = new Set();
  for (const { path } of await from.list()) {
    if (path.startsWith(FOLDER) || !filter(path)) continue;
    here.add(path);
    if (state.paths.has(path)) { result.kept.push(path); continue; } // files never change: same path = same bytes
    try {
      const bytes = await from.read(path);
      const name = await contentName(k, bytes);
      let where = state.names.get(name);
      if (!where) {
        where = contentPath(name, path);
        try {
          await to.write(where, await seal(k, bytes));
          if (!same(await open(k, await to.read(where)), bytes)) throw new Error('copy differs'); // read back once
          result.copied.push(path);
        } catch (err) { if (err instanceof ExistsError) result.kept.push(path); else throw err; }
      } else result.kept.push(path); // moved or renamed: only the new path is noted
      came.push([path, where]);
      state.names.set(name, where);
    } catch (err) { result.failed.push([path, String(err.message ?? err)]); }
  }
  const went = [...state.paths.keys()].filter((p) => !here.has(p) && filter(p));
  if (came.length || went.length) {
    for (const p of went) state.paths.delete(p);
    for (const [p, n] of came) state.paths.set(p, n);
    const whole = state.since + came.length + went.length >= state.size; // keeps a restore at ≤ ~2× the list
    const head = { n: state.count, t: now, whole };
    const run = whole ? { ...head, came: [...state.paths], went: [] } : { ...head, came, went };
    const name = toBase32(globalThis.crypto.getRandomValues(new Uint8Array(17))).slice(0, NAME);
    await to.write(`${RUNS}${name}.sealed`, await seal(k, enc.encode(JSON.stringify(run))));
  }
  return result;
}

/**
 * Bring a backup back into any sharing point, as it stood at the latest run. Existing files stay.
 * skip(path): leave out what was removed after the backup (remove.quietIds), so it never comes back.
 */
export async function restore(from, to, keyB32, { skip = () => false } = {}) {
  const k = await keys(keyB32);
  const { paths } = await readRuns(k, from);
  const have = new Set((await to.list()).map((f) => f.path));
  const restored = [];
  for (const [path, where] of paths) {
    if (have.has(path) || skip(path)) continue;
    let sealed;
    try { sealed = await from.read(where); } catch (err) { if (err instanceof MissingError) continue; throw err; }
    await to.write(path, await open(k, sealed));
    restored.push(path);
  }
  return restored;
}
