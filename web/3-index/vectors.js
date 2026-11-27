// vectors.js — vectors: one more table of the index (EXTEND S6 of index.js). What modeling compares, in real time.
//
// Purpose:   a vector is an echo of a strand: numbers a method computed from it (from landmarks, a picture, a text,
//            a sound), made so that "similar" becomes "near". The index keeps them like its other tables: computed,
//            brought together from every sharing point this reader may read, rebuilt at any time, never the truth.
//              one row   key   the strand it came from (its id without hash, as everywhere in the index)
//                        part  which stretch of the strand: 0 = the whole, 1, 2, 3 … = its stretches in order
//                              (how long a stretch is belongs to the method)
//                        echo  the method with its version, as it stands in ~( ): only vectors of one echo are compared
//                        n     whose it is (n_ from the key) · store: the sharing point it was read from
//              bits      1 bit per number (above zero or not): 256 numbers = 32 bytes. Kept in memory, all of them.
//              fine      1 byte per number (−127 … 127): 256 bytes. Stays in the database, read only for the best.
//            near(): bits of all (count the bits that differ) → the best 1,000 → their fine (angle) → the best few.
//            Where vectors come from is not decided here: put() takes them from whoever computed them (6-compute on
//            this device, later a file form in the sharing points). The table does not care which model it was.
// Depends:   a db from sqlite.js (browser or node) to keep them; without one they live in memory only
// Test:      tests/vectors.test.mjs
// Limits:    in memory 32 B + 4 B per vector of 256 numbers: 20,000 Takes of one person = 0.7 MB, 10⁶ = 36 MB ·
//            in the database ≈ 0.42 KB per vector: 20,000 = 8 MB, 10⁶ = 0.42 GB; at the start only the bits are
//            read: 0.3 s per 10⁵ ·
//            near() over 20,000 ≈ 3 ms, over 10⁶ ≈ 30 ms, plus ≈ 10 ms when the best 1,000 come from the database
//            (one statement) — measured 26.11. in Node 22 on one core; a phone ≈ 3–5 × that, so a live picture can
//            ask ≥ 5 times a second against 10⁶ ·
//            found: of 50 Takes of one sign hidden among 10⁶ others, all 50 came back, at likeness 0.9 and at 0.6 ·
//            the bits hold the true nearest when the numbers lie around zero (a method that gives only positive
//            numbers must centre them first) ·
//            a vector is written once: the same strand, part and echo again is left as it is (a new model = a new echo) ·
//            put() = 2 statements per vector: a Take's own few are instant; 10⁵ at once ≈ 5 s in Node.
//            one reader per database at a time, as sqlite.js says (a second tab keeps its vectors in memory).
// EXTEND(S14, index): beyond ~10⁷ vectors in one reader the bits go into clusters (only the nearest clusters are read).

export const NEAR_FIRST = 1000;

export const VECTOR_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS vector (id INTEGER PRIMARY KEY, echo TEXT NOT NULL, key TEXT NOT NULL, part INTEGER NOT NULL, n TEXT, store TEXT, bits BLOB NOT NULL, UNIQUE (echo, key, part))',
  'CREATE TABLE IF NOT EXISTS vector_fine (id INTEGER PRIMARY KEY, fine BLOB NOT NULL)',
  'CREATE INDEX IF NOT EXISTS vector_whose ON vector (echo, n)',
];

/** Bits set in a 32 bit number. */
const count = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24; };

/** Numbers → { fine: Int8Array (−127 … 127, the largest = 127), bits: Uint32Array (1 where fine is above zero) }. */
export function pack(vector) {
  let max = 0;
  for (const x of vector) max = Math.max(max, Math.abs(x));
  const fine = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) fine[i] = max ? Math.round((127 * vector[i]) / max) : 0;
  return { fine, bits: bitsOf(fine) };
}

function bitsOf(fine) {
  const bits = new Uint32Array(Math.ceil(fine.length / 32));
  for (let i = 0; i < fine.length; i++) if (fine[i] > 0) bits[i >>> 5] |= 1 << (i & 31);
  return bits;
}

/** How alike two fine vectors point: 1 = the same direction, 0 = nothing in common, −1 = opposite. */
export function alike(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

// Bytes in the database: bits as 4 bytes per number, lowest first (the same on every device); fine as it is.
const bitBytes = (bits) => { const out = new Uint8Array(bits.length * 4), v = new DataView(out.buffer); bits.forEach((w, i) => v.setUint32(4 * i, w, true)); return out; };
const bitsFrom = (bytes) => { const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return Uint32Array.from({ length: bytes.byteLength / 4 }, (_, i) => v.getUint32(4 * i, true)); };
const fineBytes = (fine) => new Uint8Array(fine.buffer, fine.byteOffset, fine.byteLength);
const fineFrom = (bytes) => { const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); return new Int8Array(b.buffer, b.byteOffset, b.byteLength); };
const whose = (key) => /(?:^| )(n_[0-9A-Z]+)/.exec(key)?.[1] ?? null;

/** Where the rows are kept when there is no database: the same calls in memory (tests, a reader without OPFS). */
function inMemory() {
  const rows = new Map(), taken = new Set();
  const name = (r) => `${r.echo}|${r.key}|${r.part}`;
  return {
    async add(row) { if (taken.has(name(row))) return false; taken.add(name(row)); rows.set(row.id, row); return true; },
    async bits() { return [...rows.values()].map((r) => ({ id: r.id, echo: r.echo, bits: r.bits })); },
    async lengths() { return new Map([...rows.values()].map((r) => [r.echo, r.fine.length])); },
    async rows(ids) { return ids.map((id) => rows.get(id)).filter(Boolean); },
    async of(echo, n, max) { return [...rows.values()].filter((r) => r.echo === echo && r.n === n && r.part === 0).slice(0, max); },
    async drop(column, value) { let gone = 0; for (const [id, r] of rows) if (r[column] === value) { rows.delete(id); taken.delete(name(r)); gone += 1; } return gone; },
    async batch(work) { return work(); },
  };
}

/** The same in the database of this device (beside the parts of merged.js: one file for the whole index). */
async function inDatabase(db) {
  for (const sql of VECTOR_SCHEMA) await db.exec(sql);
  const read = (r) => ({ id: Number(r.id), echo: r.echo, key: r.key, part: Number(r.part), n: r.n, store: r.store, fine: fineFrom(r.fine) });
  const JOINED = 'SELECT v.id AS id, echo, key, part, n, store, fine FROM vector v JOIN vector_fine f ON f.id = v.id';
  return {
    async add(row) {
      const { changes } = await db.run('INSERT OR IGNORE INTO vector (id, echo, key, part, n, store, bits) VALUES (?, ?, ?, ?, ?, ?, ?)', [row.id, row.echo, row.key, row.part, row.n, row.store, bitBytes(row.bits)]);
      if (changes) await db.run('INSERT INTO vector_fine (id, fine) VALUES (?, ?)', [row.id, fineBytes(row.fine)]);
      return Boolean(changes);
    },
    async bits() { return (await db.all('SELECT id, echo, bits FROM vector ORDER BY id')).map((r) => ({ id: Number(r.id), echo: r.echo, bits: bitsFrom(r.bits instanceof Uint8Array ? r.bits : new Uint8Array(r.bits)) })); },
    async lengths() { return new Map((await db.all('SELECT v.echo AS echo, length(f.fine) AS length FROM (SELECT echo, min(id) AS id FROM vector GROUP BY echo) v JOIN vector_fine f ON f.id = v.id')).map((r) => [r.echo, Number(r.length)])); },
    async rows(ids) { return ids.length ? (await db.all(`${JOINED} WHERE v.id IN (${ids.map(() => '?').join(',')})`, ids)).map(read) : []; },
    async of(echo, n, max) { return (await db.all(`${JOINED} WHERE echo = ? AND n = ? AND part = 0 ORDER BY v.id LIMIT ?`, [echo, n, max])).map(read); },
    async drop(column, value) {
      if (!['store', 'key', 'echo'].includes(column)) throw new Error(`not a column to drop by: ${column}`);
      await db.run(`DELETE FROM vector_fine WHERE id IN (SELECT id FROM vector WHERE ${column} = ?)`, [value]);
      return (await db.run(`DELETE FROM vector WHERE ${column} = ?`, [value])).changes;
    },
    async batch(work) { await db.exec('BEGIN'); try { const out = await work(); await db.exec('COMMIT'); return out; } catch (err) { await db.exec('ROLLBACK'); throw err; } },
  };
}

/**
 * The vectors of this reader. db: from sqlite.js (kept on the device) or null (memory only).
 * → { put, near, of, forget, remove, size }
 */
export async function vectorsOf(db = null) {
  const keep = db ? await inDatabase(db) : inMemory();
  let packs, next; // packs: echo → { length (numbers per vector), words, count, bits: Uint32Array, ids: Int32Array }

  const room = (p, more) => {
    if ((p.count + more) * p.words <= p.bits.length) return;
    const size = Math.max(2 * p.count, p.count + more, 64);
    const bits = new Uint32Array(size * p.words), ids = new Int32Array(size);
    bits.set(p.bits.subarray(0, p.count * p.words)); ids.set(p.ids.subarray(0, p.count));
    p.bits = bits; p.ids = ids;
  };
  const remember = (echo, id, bits, length) => {
    const p = packs.get(echo) ?? packs.set(echo, { length, words: bits.length, count: 0, bits: new Uint32Array(0), ids: new Int32Array(0) }).get(echo);
    room(p, 1);
    p.bits.set(bits, p.count * p.words); p.ids[p.count] = id; p.count += 1;
  };
  const load = async () => {
    packs = new Map(); next = 1;
    const lengths = await keep.lengths();
    for (const r of await keep.bits()) { remember(r.echo, r.id, r.bits, lengths.get(r.echo)); next = Math.max(next, r.id + 1); }
  };
  await load();

  /** The ids of the `first` vectors whose bits differ least from q: one pass, then a cut by counting. */
  const nearestByBits = (p, q, first) => {
    const { count: total, words, bits } = p, far = new Uint16Array(total), tally = new Uint32Array(32 * words + 2);
    for (let i = 0, o = 0; i < total; i++) { let d = 0; for (let w = 0; w < words; w++) d += count(bits[o++] ^ q[w]); far[i] = d; tally[d] += 1; }
    let cut = 0, fit = 0;
    while (cut <= 32 * words && fit + tally[cut] <= first) fit += tally[cut++]; // everything nearer than cut fits
    const out = [];
    for (let i = 0; i < total; i++) if (far[i] < cut) out.push(p.ids[i]);
    for (let i = 0; i < total && out.length < first; i++) if (far[i] === cut) out.push(p.ids[i]); // fill up from the next step
    return out;
  };

  return {
    /** rows: [{ key, part = 0, echo, store = null, vector: numbers }] → how many were new. */
    async put(rows) {
      return keep.batch(async () => {
        let added = 0;
        for (const { key, part = 0, echo, store = null, vector } of rows) {
          const p = packs.get(echo), { fine, bits } = pack(vector);
          if (p && p.length !== vector.length) throw new Error(`${echo}: ${vector.length} numbers, the others have ${p.length}`);
          const row = { id: next, echo, key, part, n: whose(key), store, fine, bits };
          if (!(await keep.add(row))) continue; // written once
          remember(echo, next, bits, vector.length); next += 1; added += 1;
        }
        return added;
      });
    },

    /**
     * The nearest vectors of one echo. vector: numbers of the same length ·
     * limit: how many · first: how many pass the bits · floor: least likeness (−1 … 1) · not: a key to leave out.
     * → [{ key, part, n, store, score }] nearest first; score = how alike (1 = the same).
     */
    async near(echo, vector, { limit = 5, first = NEAR_FIRST, floor = -1, not = null } = {}) {
      const p = packs.get(echo);
      if (!p?.count) return [];
      if (vector.length !== p.length) throw new Error(`${echo}: asked with ${vector.length} numbers, kept with ${p.length}`);
      const q = pack(vector);
      const rows = await keep.rows(nearestByBits(p, q.bits, Math.min(30000, Math.max(first, limit)))); // one statement holds ≤ 32,766 ids
      return rows.map((r) => ({ key: r.key, part: r.part, n: r.n, store: r.store, score: alike(q.fine, r.fine) }))
        .filter((h) => h.score >= floor && h.key !== not)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    /** The whole-strand vectors of one person (n_) in one echo, at most max → [{ key, n, store, fine }]. */
    async of(echo, n, max = 200) { return keep.of(echo, n, max); },

    /** A sharing point whose access is gone: its vectors leave (as merged.forget). → how many */
    async forget(store) { const gone = await keep.drop('store', store); if (gone) await load(); return gone; },

    /** A strand that is gone (quiet): its vectors leave. → how many */
    async remove(key) { const gone = await keep.drop('key', key); if (gone) await load(); return gone; },

    /** How much is kept: { vectors, echoes: { echo: count }, memory: bytes of bits and ids }. */
    size() {
      const echoes = {}; let vectors = 0, memory = 0;
      for (const [echo, p] of packs) { echoes[echo] = p.count; vectors += p.count; memory += p.count * (4 * p.words + 4); }
      return { vectors, echoes, memory };
    },
  };
}
