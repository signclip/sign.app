// parts.js — the index in every sharing point, on the device and at atlas: one form, three readers (14.11.).
//
// Purpose:   reading every .sign one by one costs one request per file (20,000 Takes ≈ 40,000 .sign ≈ 40,000
//            GETs over WebDAV). A part bundles one folder: the names and sizes of all its files and the texts
//            of its .sign files. Fresh = the folder lists exactly these names and sizes; then nothing in the
//            folder is opened. Only the folder of this month changes, older months stay fresh.
//              index/<folder>.json    e.g. index/take/x/2026.11.json, index/chain/2026.11.json, index/root.json
//              { "folder": "take/x/2026.11", "files": [[name, size], …], "texts": { name: text } }
//            Three readers, the same file:
//              in the sharing point   written by whoever may write there (own Nextcloud, the device, the signer of
//                                     a group); everyone who reads the sharing point reads it with it
//              on the device          cache for sharing points it may only read (group by read link, Sciebo
//                                     shared with me): index/<q_ or name>/<folder>.json in the device's own store
//              at atlas               the same cache in the atlas account, one prefix per account (Sign/ is
//                                     shared with atlas read only); from it atlas builds the index over all
//            A part is a cache, never the truth: rebuilt from the files whenever it is missing or stale, and the
//            only file Sign ever replaces (remove + write). Its texts keep their seals y_: a part that lies cannot
//            make a sealed file say something else (buildIndex checks the seal of every text, also from a part).
// Depends:   nothing (any store with list, read, write, remove)
// Test:      tests/index.test.mjs
// Limits:    a part ≈ 1.1 × the .sign texts of its folder + ~60 B per file: a month of one person (150 Takes,
//            ~600 files, ~300 .sign) ≈ 0.25 MB · fresh = same names and sizes (a change that keeps the size is
//            only seen by the seal, or when the folder gets a new file) · cost: one listing per folder
//            (as before) + one read per folder instead of one per .sign.
// Read once (26.11.): a part of a sharing point is asked for again only when the listing shows it changed (its size,
//            and its time where the server tells one) – before, every build read every part again (one request
//            per folder, ≈ 0.25 MB per person and month, every 5 minutes). Kept per store while the app runs, at
//            most KEPT_MAX = 32 MiB of parts per store (then all of that store are let go and read once more).
//            A part kept this way is still checked against the folder's listing (fresh), exactly as a read one.
// EXTEND(S3, index): ETag of the folder instead of names and sizes, where the server gives it (Nextcloud does).

export const PARTS = 'index/';
const enc = new TextEncoder(), dec = new TextDecoder();

/** Folder of a path ('' at the root) and the part that bundles it. */
export const folderOf = (path) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
export const partOf = (folder) => `${PARTS}${folder || 'root'}.json`;

/** A part for one folder. files: [{ path, size }] · texts: Map(path → text). */
export function makePart(folder, files, texts) {
  const name = (p) => p.slice(p.lastIndexOf('/') + 1);
  return JSON.stringify({
    folder,
    files: files.map((f) => [name(f.path), f.size ?? 0]),
    texts: Object.fromEntries(files.filter((f) => texts.has(f.path)).map((f) => [name(f.path), texts.get(f.path)])),
  });
}

/** Is this part (parsed) the folder as listed now? */
export function fresh(part, folder, files) {
  if (!part || part.folder !== folder || part.files.length !== files.length) return false;
  const now = new Map(files.map((f) => [f.path.slice(f.path.lastIndexOf('/') + 1), f.size ?? 0]));
  return part.files.every(([n, s]) => now.get(n) === s);
}

const readPart = async (store, path) => { try { return JSON.parse(dec.decode(await store.read(path))); } catch { return null; } };
export const KEPT_MAX = 32 * 1024 * 1024;
const kept = new WeakMap(); // store → { parts: Map(path → { size, at, part }), bytes }
/** The part at path, read from the store only when its listing (f: { size, at? }) is not the one it was read under. */
async function readPartOnce(store, path, f) {
  const mine = kept.get(store) ?? kept.set(store, { parts: new Map(), bytes: 0 }).get(store);
  const have = mine.parts.get(path);
  if (have && have.size === (f.size ?? 0) && have.at === f.at) return have.part;
  const part = await readPart(store, path);
  if (have) { mine.bytes -= have.size; mine.parts.delete(path); }
  if (part && (f.size ?? 0) > 0) {
    if (mine.bytes + f.size > KEPT_MAX) { mine.parts.clear(); mine.bytes = 0; }
    mine.parts.set(path, { size: f.size, at: f.at, part });
    mine.bytes += f.size;
  }
  return part;
}
/** A part this reader just wrote anew: what was kept of it no longer counts. */
const forgetPart = (store, path) => { const mine = kept.get(store), have = mine?.parts.get(path); if (have) { mine.bytes -= have.size; mine.parts.delete(path); } };
const replace = async (store, path, text) => { await store.remove(path).catch(() => {}); await store.write(path, enc.encode(text)); };
const isSign = (p) => p.endsWith('.sign');

/**
 * Every file of a sharing point, .sign with its text, read through the parts.
 * store: the sharing point · write: true = may write its own index/ (refresh stale parts there) ·
 * cache: { store, prefix } = where this reader keeps parts it may not write into the sharing point (device, atlas).
 * → { files: [{ path, size, text? }], skipped: [{ path, error }], read: number of .sign opened one by one }
 */
export async function readThroughParts(store, { write = false, cache = null } = {}) {
  const listed = (await store.list()).filter((f) => !f.path.startsWith(PARTS));
  const own = new Map((await store.list(PARTS).catch(() => [])).map((f) => [f.path, f]));
  const byFolder = new Map();
  for (const f of listed) (byFolder.get(folderOf(f.path)) ?? byFolder.set(folderOf(f.path), []).get(folderOf(f.path))).push(f);
  const out = [], skipped = [];
  let read = 0;
  for (const [folder, files] of byFolder) {
    const at = partOf(folder), cached = cache ? `${cache.prefix}${at.slice(PARTS.length)}` : null;
    let part = own.has(at) ? await readPartOnce(store, at, own.get(at)) : null;
    if (!fresh(part, folder, files) && cached) part = await readPart(cache.store, cached);
    const ok = fresh(part, folder, files);
    const texts = new Map();
    for (const f of files) {
      if (!isSign(f.path)) continue;
      const name = f.path.slice(f.path.lastIndexOf('/') + 1);
      const known = part?.texts?.[name];
      const same = known != null && part.files.some(([n, s]) => n === name && s === (f.size ?? 0));
      if (ok || same) { texts.set(f.path, known); continue; }
      try { texts.set(f.path, dec.decode(await store.read(f.path))); read += 1; } catch (err) { skipped.push({ path: f.path, error: String(err.message ?? err) }); }
    }
    if (!ok) {
      const text = makePart(folder, files, texts);
      if (write) { forgetPart(store, at); await replace(store, at, text).catch(() => {}); } // the sharing point's own index/, for every reader
      if (cached) await replace(cache.store, cached, text).catch(() => {});
    }
    for (const f of files) out.push(texts.has(f.path) ? { ...f, text: texts.get(f.path) } : f);
  }
  return { files: out, skipped, read };
}

/** Prefix for the parts of one sharing point inside a reader's own store: index/<id or name>/. */
export const cachePrefix = (id) => `${PARTS}${String(id).replace(/[^0-9A-Za-z_.-]/g, '_')}/`;

