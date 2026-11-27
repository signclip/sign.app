// sqlite.js — one SQLite database on this device (21.11., user: the index has one form everywhere, SQLite).
//
// Purpose:   openDevice() in the browser and the APK's WebView: a worker (sqlite-worker.js) loads SQLite as
//            WebAssembly (SQLITE_LIBRARY, from lib/ beside the app like whisper and h3, put there at build) and keeps
//            the database in the browser's own file system (OPFS, VFS "opfs-sahpool": needs no special server
//            headers, so it runs on GitHub Pages and in the WebView). fromNode() gives the same four calls over
//            node:sqlite, for the tests. Whoever holds a db does not know which of the two it is.
//              all(sql, params) → rows as objects · run(sql, params) → { changes } · exec(sql) · close()
// Depends:   browser Worker + OPFS (Chrome/WebView ≥ 108, Safari ≥ 16.4) or node:sqlite (Node ≥ 22.5)
// Test:      tests/index.test.mjs (through merged.js, with node:sqlite)
// Limits:    the library ≈ 1.5 MB (≈ 0.6 MB compressed), loaded once, then from the browser cache · the first call
//            waits for it (≤ 15 s, then an error: the caller falls back) · one database file per name, open in one
//            tab at a time (a second tab falls back to files) · a call
//            ≈ 0.1–1 ms plus the hop to the worker (≈ 0.1 ms).

export const SQLITE_LIBRARY = new URL('../lib/sqlite/index.mjs', import.meta.url).href; // beside the app (27.11., IMPORTS.md)

/** The same calls over a node:sqlite DatabaseSync (tests). */
export function fromNode(db) {
  return {
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    run: async (sql, params = []) => { const r = db.prepare(sql).run(...params); return { changes: Number(r.changes) }; },
    exec: async (sql) => { db.exec(sql); },
    close: async () => db.close(),
  };
}

/** The database of this device in the browser. name: its file in OPFS. → { all, run, exec, close } */
export function openDevice(name = 'sign-index.sqlite', { timeoutMs = 15000, library = SQLITE_LIBRARY } = {}) {
  const worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let n = 0;
  const failAll = (msg) => { for (const w of waiting.values()) w.no(new Error(msg)); waiting.clear(); };
  worker.onmessage = ({ data }) => {
    const w = waiting.get(data.id);
    if (!w) return;
    waiting.delete(data.id);
    if (data.error) w.no(new Error(data.error)); else w.ok(data.result);
  };
  worker.onerror = (e) => failAll(`sqlite worker: ${e.message || 'failed'}`);
  const call = (op, sql, params) => new Promise((ok, no) => {
    const id = ++n;
    waiting.set(id, { ok, no });
    worker.postMessage({ id, op, sql, params, name, library });
    setTimeout(() => { if (waiting.delete(id)) no(new Error(`sqlite: no answer in ${timeoutMs} ms`)); }, timeoutMs);
  });
  return {
    all: (sql, params = []) => call('all', sql, params),
    run: (sql, params = []) => call('run', sql, params),
    exec: (sql) => call('exec', sql, []),
    close: async () => { failAll('closed'); worker.terminate(); },
  };
}
