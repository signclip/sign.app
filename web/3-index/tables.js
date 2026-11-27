// tables.js — the tables of the index in SQLite: step 2 of "the index has one form everywhere" (merged.js is step 1).
//
// Purpose:   index.js keeps its tables in memory and reads every .sign again at each start: fine up to ~10⁵ Takes
//            (100–150 MB). Here the same tables lie in the database of the reader — the device, a server beside a
//            large sharing point, atlas — and a question reads only the rows it needs.
//              folder   store · folder · stamp                what was read, and in which state (names and sizes)
//              copy     store · path · u                      every file by its name: where copies lie
//              entry    key · kind · n · label · t · o · store · path · below · top · lead · flags · text
//                       :x strands and chains with their head and text; strands a chain only names, with their kind
//              context  word · key                            which :x strands hold a word
//              weave    key · by                              what points to what (defines, came from, builds on)
//            Every row carries its store and folder: a folder that changed is taken out and read in again, nothing
//            else is touched; a sharing point whose access is gone leaves with one statement (forget).
//            The rows come from the same reading as the tables in memory (Index.addText), so both say the same.
//            Finding: words by an ordered table (a whole word, or everything that starts with some letters),
//            then narrowed in the same statement by who, where it lies, when and what.
// Depends:   a db from sqlite.js (browser or node), index.js (the reading), 1-model/filename.js
// Test:      tests/tables.test.mjs
// Limits:    measured 26.11. with 20,000 Takes of one person (Node 22, one core; a phone ≈ 3–5 ×):
//            on disk ≈ 5 KB per Take (texts, names, the long keys in every table): 20,000 ≈ 100 MB, 10⁶ ≈ 5 GB — so a
//            device keeps what it may read, and the whole of a very large sharing point is asked from afar (step 4) ·
//            first reading 4.5 s, a later start with nothing new ≈ 1 s (the listings and parts; no row written) ·
//            a question for a word 0.2 ms, by first letters 6 ms, a month without words 22 ms; a word that stands
//            in every Take (the language) with another word 80 ms: it reads all its rows ·
//            seals are not checked here yet: `trust()` of index.js still needs every sealed text; until that step
//            a reader that must check keeps using buildIndex · months in facets() are UTC months.
// EXTEND(S14, index): the same tables as files that never change inside a sharing point (step 3), read from afar
//            page by page (step 4).

import { Index } from './index.js';
import { folderOf, readThroughParts, cachePrefix } from './parts.js';
import { readName } from '../1-model/filename.js';

export const TABLES = [
  'CREATE TABLE IF NOT EXISTS folder (store TEXT NOT NULL, folder TEXT NOT NULL, stamp TEXT NOT NULL, PRIMARY KEY (store, folder)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS copy (store TEXT NOT NULL, path TEXT NOT NULL, folder TEXT NOT NULL, u TEXT, size INTEGER, PRIMARY KEY (store, path)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS copy_u ON copy (u)',
  'CREATE TABLE IF NOT EXISTS entry (key TEXT NOT NULL, store TEXT NOT NULL, folder TEXT NOT NULL, kind TEXT, n TEXT, label TEXT, t TEXT, o TEXT, path TEXT, below TEXT, top TEXT, lead TEXT, flags TEXT, text TEXT, PRIMARY KEY (key, store, folder)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS entry_where ON entry (store, folder)',
  'CREATE INDEX IF NOT EXISTS entry_when ON entry (t)',
  'CREATE INDEX IF NOT EXISTS entry_below ON entry (below)',
  'CREATE TABLE IF NOT EXISTS context (word TEXT NOT NULL, key TEXT NOT NULL, store TEXT NOT NULL, folder TEXT NOT NULL, PRIMARY KEY (word, key, store, folder)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS context_where ON context (store, folder)',
  'CREATE TABLE IF NOT EXISTS weave (key TEXT NOT NULL, by TEXT NOT NULL, store TEXT NOT NULL, folder TEXT NOT NULL, PRIMARY KEY (key, by, store, folder)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS weave_where ON weave (store, folder)',
];
const KEPT = ['copy', 'entry', 'context', 'weave'];

const norm = (w) => String(w).normalize('NFC').toLowerCase();
const after = (prefix) => prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1); // first text behind everything that starts with prefix
const marks = (list) => list.map(() => '?').join(',');
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);

/** The state of a folder as listed: how many files, their sizes, their names. The same listing, the same stamp. */
export function stampOf(files) {
  let h = 2166136261, bytes = 0;
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    bytes += f.size ?? 0;
    for (const c of `${nameOf(f.path)}:${f.size ?? 0};`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  }
  return `${files.length}:${bytes}:${h.toString(36)}`;
}

/** The rows of one folder, read exactly as index.js reads (one Index, taken apart). files: [{ path, size, text? }] */
export function rowsOf(store, folder, files) {
  const ix = new Index(), rows = { copy: [], entry: [], context: [], weave: [] }, skipped = [];
  for (const f of files) {
    rows.copy.push([store, f.path, folder, readName(nameOf(f.path))?.u ?? null, f.size ?? 0]);
    if (f.text == null || f.path.endsWith('sharing-point.sign')) continue;
    try { ix.addText(f.text, { store, path: f.path, text: f.text }); } catch (err) { skipped.push({ path: f.path, error: String(err.message ?? err) }); }
  }
  const { strands, chains, context, weave, takes, similar } = ix.tables;
  const head = (e) => [e.head?.id?.n ?? null, e.head?.['@'] ?? null, e.head?.["'t"] ?? null, e.head?.id?.o ?? null, e.from?.path ?? null];
  for (const s of strands.values()) rows.entry.push([s.key, store, folder, s.kind, ...head(s), null, null, s.lead?.join(' ') || null, null, s.from?.text ?? null]);
  for (const c of chains.values()) {
    const flags = [takes.has(c.key) && 'take', similar.has(c.key) && 'similar'].filter(Boolean).join(' ') || null;
    rows.entry.push([c.key, store, folder, 'chain', ...head(c), c.below, c.lines[0]?.text ?? null, null, flags, c.from?.text ?? null]);
  }
  for (const [word, keys] of context) for (const key of keys) rows.context.push([word, key, store, folder]);
  for (const [key, by] of weave) for (const b of by) rows.weave.push([key, b, store, folder]);
  return { rows, skipped };
}

const COLUMNS = {
  copy: ['store', 'path', 'folder', 'u', 'size'],
  entry: ['key', 'store', 'folder', 'kind', 'n', 'label', 't', 'o', 'path', 'below', 'top', 'lead', 'flags', 'text'],
  context: ['word', 'key', 'store', 'folder'],
  weave: ['key', 'by', 'store', 'folder'],
};

/** The tables on db. → { fill, forget, similar, words, entry, copies, weave, above, facets, count } */
export async function tablesOf(db) {
  for (const sql of TABLES) await db.exec(sql);

  /** Many rows in few statements (200 rows each: a first reading of 20,000 Takes is ~2,000 statements, not 300,000). */
  const insert = async (table, rows) => {
    const cols = COLUMNS[table], one = `(${marks(cols)})`;
    for (let i = 0; i < rows.length; i += 200) {
      const some = rows.slice(i, i + 200);
      await db.run(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES ${some.map(() => one).join(',')}`, some.flat());
    }
  };
  const clear = async (store, folder) => { for (const t of KEPT) await db.run(`DELETE FROM ${t} WHERE store = ? AND folder = ?`, [store, folder]); };

  const shaped = (r) => ({
    key: r.key, kind: r.kind === 'chain' ? undefined : r.kind, chain: r.kind === 'chain',
    head: r.t || r.n ? { id: { n: r.n, o: r.o }, '@': r.label, "'t": r.t } : null,
    from: r.path ? { store: r.store, path: r.path } : null,
    below: r.below, top: r.top, lead: r.lead ? r.lead.split(' ') : [], flags: r.flags ? r.flags.split(' ') : [], text: r.text,
  });

  /** who · where it lies · when · what → SQL and its values (as passes() in 7-similar/filter.js). */
  const narrowed = ({ persons = [], sharingPoints = [], time = null, kinds = [] } = {}) => {
    const sql = ['e.text IS NOT NULL'], values = [];
    if (persons.length) { sql.push(`e.n IN (${marks(persons)})`); values.push(...persons); }
    if (sharingPoints.length) { sql.push(`e.store IN (${marks(sharingPoints)})`); values.push(...sharingPoints); }
    if (time) { sql.push('substr(e.t, 1, ?) >= ? AND substr(e.t, 1, ?) <= ?'); values.push(time[0].length, time[0], time[1].length, time[1]); }
    if (kinds.length) { sql.push(`(e.kind = 'chain' OR e.kind IN (${marks(kinds)}))`); values.push(...kinds); }
    return { sql: sql.join(' AND '), values };
  };

  return {
    /**
     * The files of one sharing point as readThroughParts gives them → the tables. Only folders whose stamp changed
     * are written again. whole: these files are all of the sharing point, so folders no longer listed leave
     * (false when only some folders were read, e.g. this month's). → { folders, changed, skipped }
     */
    async fill(store, files, { whole = true } = {}) {
      const byFolder = new Map();
      for (const f of files) (byFolder.get(folderOf(f.path)) ?? byFolder.set(folderOf(f.path), []).get(folderOf(f.path))).push(f);
      const known = new Map((await db.all('SELECT folder, stamp FROM folder WHERE store = ?', [store])).map((r) => [r.folder, r.stamp]));
      const skipped = [];
      let changed = 0;
      await db.exec('BEGIN');
      try {
        for (const [folder, list] of byFolder) {
          const stamp = stampOf(list);
          if (known.get(folder) === stamp) continue;
          await clear(store, folder);
          const got = rowsOf(store, folder, list);
          skipped.push(...got.skipped);
          for (const t of KEPT) await insert(t, got.rows[t]);
          await db.run('INSERT OR REPLACE INTO folder (store, folder, stamp) VALUES (?, ?, ?)', [store, folder, stamp]);
          changed += 1;
        }
        if (whole) for (const folder of known.keys()) if (!byFolder.has(folder)) { await clear(store, folder); await db.run('DELETE FROM folder WHERE store = ? AND folder = ?', [store, folder]); changed += 1; }
        await db.exec('COMMIT');
      } catch (err) { await db.exec('ROLLBACK'); throw err; }
      return { folders: byFolder.size, changed, skipped };
    },

    /** A sharing point whose access is gone leaves with all its rows. → how many entries */
    async forget(store) {
      const { changes } = await db.run('DELETE FROM entry WHERE store = ?', [store]);
      for (const t of ['copy', 'context', 'weave', 'folder']) await db.run(`DELETE FROM ${t} WHERE store = ?`, [store]);
      return changes;
    },

    /**
     * similar over context, narrowed. words: [] → everything that passes, newest first; with words → ranked by how
     * many of them an entry holds. starts: true = a word counts when it starts with what was asked ("kaf" finds Kaffee).
     * filters: { persons: [n_], sharingPoints: [name], time: [from, to], kinds: ['x'] } → [{ key, score, entry }]
     */
    async similar({ words = [], filters = {}, limit = 40, starts = false } = {}) {
      const asked = [...new Set(words.map(norm))], n = narrowed(filters);
      if (!asked.length) {
        const rows = await db.all(`SELECT e.* FROM entry e WHERE ${n.sql} GROUP BY e.key ORDER BY e.t DESC, e.kind = 'chain', e.key LIMIT ?`, [...n.values, limit]);
        return rows.map((r) => ({ key: r.key, score: 0, entry: shaped(r) }));
      }
      // one arm per asked word: an entry scores 1 for each asked word it holds, however many of its words start with it
      const arms = asked.map(() => `SELECT DISTINCT key, ? AS asked FROM context WHERE ${starts ? 'word >= ? AND word < ?' : 'word = ?'}`).join(' UNION ALL ');
      const values = asked.flatMap((w, i) => (starts ? [i, w, after(w)] : [i, w]));
      const rows = await db.all(
        `SELECT e.*, s.score AS score FROM (SELECT key, count(*) AS score FROM (${arms}) GROUP BY key) s JOIN entry e ON e.key = s.key
         WHERE ${n.sql} GROUP BY e.key ORDER BY s.score DESC, e.t DESC, e.key LIMIT ?`, [...values, ...n.values, limit]);
      return rows.map((r) => ({ key: r.key, score: Number(r.score), entry: shaped(r) }));
    },

    /** The words that start with some letters, most used first (the letters at the edge of Similar). → [{ word, count }] */
    async words(start = '', limit = 50) {
      const s = norm(start);
      const rows = s
        ? await db.all('SELECT word, count(DISTINCT key) AS count FROM context WHERE word >= ? AND word < ? GROUP BY word ORDER BY count DESC, word LIMIT ?', [s, after(s), limit])
        : await db.all('SELECT word, count(DISTINCT key) AS count FROM context GROUP BY word ORDER BY count DESC, word LIMIT ?', [limit]);
      return rows.map((r) => ({ word: r.word, count: Number(r.count) }));
    },

    /** One entry by its key (the row with its text first). → entry or null */
    async entry(key) {
      const [r] = await db.all('SELECT * FROM entry WHERE key = ? ORDER BY text IS NULL LIMIT 1', [key]);
      return r ? shaped(r) : null;
    },

    /** Where the copies of a file lie, by the u_ in its name. → ['store:path'] */
    async copies(u) { return (await db.all('SELECT store, path FROM copy WHERE u = ? ORDER BY store, path', [u])).map((r) => `${r.store}:${r.path}`); },

    /** Keys that point to this one (define it, came from it, build on it). */
    async weave(key) { return (await db.all('SELECT DISTINCT by FROM weave WHERE key = ?', [key])).map((r) => r.by); },

    /** The chains that stand on this one (its echoes, shares, next versions). */
    async above(key) { return (await db.all('SELECT * FROM entry WHERE below = ? GROUP BY key ORDER BY t', [key])).map(shaped); },

    /** What can be chosen: persons, sharing points, months (UTC). */
    async facets() {
      const of = (sql) => db.all(sql);
      return {
        persons: (await of('SELECT n, max(label) AS label, count(DISTINCT key) AS count FROM entry WHERE text IS NOT NULL AND n IS NOT NULL GROUP BY n ORDER BY count DESC')).map((r) => ({ n: r.n, label: r.label, count: Number(r.count) })),
        sharingPoints: (await of('SELECT store AS name, count(DISTINCT key) AS count FROM entry WHERE text IS NOT NULL GROUP BY store ORDER BY count DESC')).map((r) => ({ name: r.name, count: Number(r.count) })),
        months: (await of("SELECT DISTINCT substr(t, 1, 7) AS month FROM entry WHERE t IS NOT NULL ORDER BY month DESC")).map((r) => r.month),
      };
    },

    /** How much is kept. → { folders, files, entries, words } */
    async count() {
      const [r] = await db.all('SELECT (SELECT count(*) FROM folder) AS folders, (SELECT count(*) FROM copy) AS files, (SELECT count(DISTINCT key) FROM entry WHERE text IS NOT NULL) AS entries, (SELECT count(DISTINCT word) FROM context) AS words');
      return { folders: Number(r.folders), files: Number(r.files), entries: Number(r.entries), words: Number(r.words) };
    },
  };
}

/**
 * Every sharing point into the tables, read through its parts (as buildIndex). stores: [{ name, store, write?, id?, under? }]
 * cache: where this reader keeps parts it may not write into a sharing point. → { read, changed, skipped }
 */
export async function buildTables(tables, stores, { cache = null } = {}) {
  const out = { read: 0, changed: 0, skipped: [] };
  for (const { name, store, write = false, id = null, under = null } of stores) {
    try {
      const got = await readThroughParts(store, { write, under, cache: cache ? { store: cache, prefix: cachePrefix(id ?? name) } : null });
      const filled = await tables.fill(name, got.files, { whole: !under });
      out.read += got.read; out.changed += filled.changed;
      out.skipped.push(...[...got.skipped, ...filled.skipped].map((s) => ({ store: name, ...s })));
    } catch (err) { out.skipped.push({ store: name, error: String(err.message ?? err) }); }
  }
  return out;
}
