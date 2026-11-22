// sqlite-worker.js — SQLite in its own thread, its file in the browser's own file system (sqlite.js says why).
//
// Purpose:   loads the library once (the URL comes with every message, SQLITE_LIBRARY in sqlite.js), installs the
//            OPFS pool (it needs a worker, gives synchronous file access without special server headers) and opens
//            the database. Each message is one statement: { id, op: 'all'|'run'|'exec', sql, params, name } →
//            { id, result } or { id, error }.
// Depends:   the library (WebAssembly), OPFS sync access handles
// Test:      in the browser (checked in Chrome with the library served locally); the SQL itself: tests/index.test.mjs
// Limits:    one database per worker, one worker per database at a time: a second tab of the app gets an error at
//            the start and keeps its parts as files (checked in Chrome) · a failed start stays failed.

let ready = null;

async function open(name, library) {
  const { default: init } = await import(library);
  const sqlite3 = await init();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: `sign-${name.replace(/[^a-z0-9]/gi, '')}` }); // one pool per database
  return new pool.OpfsSAHPoolDb(`/${name}`);
}

self.onmessage = async ({ data }) => {
  try {
    ready ??= open(data.name, data.library);
    const db = await ready;
    let result = null;
    if (data.op === 'all') result = db.exec({ sql: data.sql, bind: data.params.length ? data.params : undefined, rowMode: 'object', returnValue: 'resultRows' });
    else if (data.op === 'run') { db.exec({ sql: data.sql, bind: data.params.length ? data.params : undefined }); result = { changes: db.changes() }; }
    else db.exec(data.sql);
    self.postMessage({ id: data.id, result });
  } catch (err) {
    self.postMessage({ id: data.id, error: String(err?.message ?? err) });
  }
};
