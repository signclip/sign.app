// merged.js — every sharing point this person may read, in one SQLite database on the device (21.11., user).
//
// Purpose:   step 1 of "the index has one form everywhere, SQLite": the parts of all sharing points (parts.js: one
//            per folder, names, sizes and .sign texts with their seals) are kept on the device in one database
//            instead of as many small files. buildIndex reads them through store() exactly as before — it is the
//            storage contract (list, read, write never over, remove), so index.js and parts.js do not change.
//            The app starts from here at once and offline; only folders that changed are read again.
//            forget(prefix): a sharing point whose access is gone leaves the database with all its rows.
//            Next steps (not here): 2 · the index tables themselves in SQL (context as full-text FTS5, similar
//            asks SQL) · 3 · the parts on the sharing points as SQLite pieces that never change (object storage)
//            · 4 · large ones (atlas) asked from afar, page by page.
// Depends:   a db from sqlite.js (browser or node), 2-storage/memory.js (the errors of the contract)
// Test:      tests/index.test.mjs
// Limits:    a part ≈ 0.25 MB per person and month: 20,000 takes of one person ≈ 12 MB, a group of 20 ≈ 250 MB ·
//            read or write ≈ 0.1–1 ms per part · paths ≤ 1 KB.

import { ExistsError, MissingError } from '../2-storage/memory.js';

export const SCHEMA = 'CREATE TABLE IF NOT EXISTS part (path TEXT PRIMARY KEY, bytes BLOB NOT NULL, at INTEGER NOT NULL)';

const enc = new TextEncoder();
const end = (prefix) => prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1); // first path after the prefix

/** The merged database on db. → { store, forget, size } */
export async function mergedOf(db, { now = () => Date.now() } = {}) {
  await db.exec(SCHEMA);
  const store = {
    name: 'merged',
    async list(prefix = '') {
      const rows = prefix
        ? await db.all('SELECT path, length(bytes) AS size FROM part WHERE path >= ? AND path < ? ORDER BY path', [prefix, end(prefix)])
        : await db.all('SELECT path, length(bytes) AS size FROM part ORDER BY path');
      return rows.map((r) => ({ path: r.path, size: Number(r.size) }));
    },
    async read(path) {
      const [row] = await db.all('SELECT bytes FROM part WHERE path = ?', [path]);
      if (!row) throw new MissingError(path);
      return row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
    },
    async write(path, bytes) {
      const b = bytes instanceof Uint8Array ? bytes : enc.encode(bytes);
      const { changes } = await db.run('INSERT OR IGNORE INTO part (path, bytes, at) VALUES (?, ?, ?)', [path, b, now()]);
      if (!changes) throw new ExistsError(path); // written once, like every store
    },
    async remove(path) { await db.run('DELETE FROM part WHERE path = ?', [path]); },
  };
  /** A sharing point whose access is gone: all its parts leave. → how many */
  const forget = async (prefix) => (await db.run('DELETE FROM part WHERE path >= ? AND path < ?', [prefix, end(prefix)])).changes;
  /** How much is kept: { parts, bytes } */
  const size = async () => { const [r] = await db.all('SELECT count(*) AS parts, coalesce(sum(length(bytes)), 0) AS bytes FROM part'); return { parts: Number(r.parts), bytes: Number(r.bytes) }; };
  return { store, forget, size };
}
