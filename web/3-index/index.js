// index.js — what the index knows and how it answers. Computed, never the truth.
//
// Purpose:   tables named after our terms, all rebuilt from the files at any time:
//              strands        id → kind, head (from :x files and from the chains that define them)
//              chains         id → head, definitions, lines, the chain below (bottom {:chain.1})
//              sharingPoints  u_ (12 chars, from the file name) → paths in every sharing point
//              context        word (NFC, lower case) → :x strands that contain it
//              weave          id → files that point to it (define it, came from it, build on it)
//              takes          chains whose top line waits for a Take ({:_.1})
//              similar        chains whose top line holds a similar ({:?.1} or ?( )), live or kept: the log of similars
//            Video, audio and Parquet are never opened: chains define them, names locate them.
// Depends:   1-model (file, ids, filename)
// Test:      tests/storage.test.mjs, tests/share.test.mjs
// Limits:    in memory: ~200–300 B per file → 10⁵ Takes (~5·10⁵ files) ≈ 100–150 MB.
//            Lookups are Map reads (~1 µs); versions walk the chain (~1 µs per step).
// EXTEND(S3, index): the same tables in IndexedDB (PWA) / SQLite (native), index parts in
//                    index/ of each sharing point, read only folders whose ETag changed.
// EXTEND(S6, vectors): vectors for Similar as one more table.

import { readFile } from '../1-model/file.js';
import { readId, idKey, shortU } from '../1-model/ids.js';
import { readName, flatWords } from '../1-model/filename.js';
import { checkWitness } from '../1-model/crypto.js';

const norm = (w) => w.normalize('NFC').toLowerCase();
const add = (map, key, value) => (map.get(key) ?? map.set(key, new Set()).get(key)).add(value);
const refsIn = (text) => [...(text ?? '').matchAll(/:([a-z?_]+(?:-[a-z]+)*\.\d+)/g)].map((m) => m[1]);

export class Index {
  constructor() {
    this.tables = { strands: new Map(), chains: new Map(), sharingPoints: new Map(), context: new Map(), weave: new Map(), takes: new Set(), similar: new Set() };
  }

  /** Every path is known by its name: kind and u_ without opening the file. */
  addPath(store, path) {
    const u = readName(path.slice(path.lastIndexOf('/') + 1))?.u;
    if (u) add(this.tables.sharingPoints, u, `${store}:${path}`);
  }

  /** A .sign file: read it into the tables. Returns its key or null. */
  addText(text, from = null) {
    const file = readFile(text);
    if (!file.head.id) return null;
    const key = idKey(file.head.id);
    if (file.kind === 'x') {
      this.tables.strands.set(key, { key, kind: 'x', head: file.head, from });
      for (const row of file.rows) for (const w of flatWords(row.text)) add(this.tables.context, norm(w), key);
      return key;
    }
    if (file.kind !== 'chain') return null;
    const idOf = (name) => file.defs.get(name)?.id;
    const lone = file.rows.at(-1)?.items;
    const bottom = lone?.length === 1 && lone[0].items?.length === 1 && lone[0].items[0].kind === 'chain' ? idOf(lone[0].items[0].name) : null;
    this.tables.chains.set(key, { key, head: file.head, defs: file.defs, lines: file.rows, from, below: bottom ? idKey(bottom) : null });
    for (const d of file.defs.values()) {
      if (!d.id) continue;
      add(this.tables.weave, idKey(d.id), key);
      if (!['chain', 'sharing-point', '?', '_'].includes(d.kind) && !this.tables.strands.has(idKey(d.id))) this.tables.strands.set(idKey(d.id), { key: idKey(d.id), kind: d.kind, head: null, from: null });
      for (const src of refsIn(d.echo)) if (idOf(src)) add(this.tables.weave, idKey(idOf(src)), idKey(d.id)); // came from
    }
    const top = file.rows[0]?.text ?? '';
    if (/\{:_\.\d+\}/.test(top)) this.tables.takes.add(key);
    if (/\{:\?\.\d+\}|\?\(/.test(top)) this.tables.similar.add(key);
    return key;
  }

  /** :x strands with the word; with { through: true } also the chains that use them. */
  context(word, { through = false } = {}) {
    const hits = [...(this.tables.context.get(norm(word)) ?? [])];
    const chains = through ? hits.flatMap((k) => [...(this.tables.weave.get(k) ?? [])]).filter((k) => this.tables.chains.has(k)) : [];
    return [...hits.map((k) => this.tables.strands.get(k)), ...[...new Set(chains)].map((k) => this.tables.chains.get(k))];
  }

  strand(idText) { return this.tables.strands.get(idKey(readId(idText))) ?? null; }
  chain(idText) { return this.tables.chains.get(idKey(readId(idText))) ?? null; }

  /** Where copies lie (all sharing points), found by u_ in the name. */
  sharingPoints(idText) { return [...(this.tables.sharingPoints.get(shortU(readId(idText))) ?? [])]; }

  /** Files that point to this id: define it, came from it, build on it. */
  weave(idText) { return [...(this.tables.weave.get(idKey(readId(idText))) ?? [])]; }

  /** All versions of a chain, newest first: walk down to the first, then up again. */
  versions(idText) {
    let first = this.tables.chains.get(idKey(readId(idText)));
    if (!first) return [];
    while (first.below && this.tables.chains.has(first.below)) first = this.tables.chains.get(first.below);
    const out = [first];
    for (let c = first; c;) {
      c = [...(this.tables.weave.get(c.key) ?? [])].map((k) => this.tables.chains.get(k)).find((x) => x?.below === c.key);
      if (c) out.push(c);
    }
    return out.reverse();
  }

  /** The lines of a chain with everything below it, newest first (what the app shows on ↓). */
  lines(idText) {
    const out = [];
    for (let c = this.chain(idText); c; c = c.below ? this.tables.chains.get(c.below) : null) out.push(...c.lines.filter((l) => !/^\{:chain\.\d+\}$/.test(l.text)));
    return out;
  }

  takes() { return [...this.tables.takes].map((k) => this.tables.chains.get(k)); }
  similar() { return [...this.tables.similar].map((k) => this.tables.chains.get(k)); }
}

/**
 * Read every sharing point. stores: [{ name, store }]. Only .sign files are opened.
 * keys: { q_…: public key } from the lists of persons; then each file is checked:
 * witnessed true (right), false (missing or wrong: shown apart, not used in lines).
 */
export async function buildIndex(stores, { keys = null } = {}, index = new Index()) {
  const dec = new TextDecoder();
  index.skipped = []; // [{ store, path?, error }]: not part of the tables, never stops the rest (a brought-in
  //                     sharing point may be offline or hold a file this version cannot read)
  for (const { name, store } of stores) {
    let files;
    try { files = await store.list(); } catch (err) { index.skipped.push({ store: name, error: String(err.message ?? err) }); continue; }
    for (const { path } of files) {
      index.addPath(name, path);
      if (!path.endsWith('.sign') || path.endsWith('sharing-point.sign')) continue;
      try {
        const text = dec.decode(await store.read(path));
        const key = index.addText(text, { store: name, path });
        if (!keys || !key) continue;
        const q = key.split(' ')[0];
        const entry = index.tables.chains.get(key) ?? index.tables.strands.get(key);
        entry.witnessed = Boolean(keys[q]) && (await checkWitness(keys[q], text));
      } catch (err) { index.skipped.push({ store: name, path, error: String(err.message ?? err) }); }
    }
  }
  return index;
}

/** Files whose witness is missing or wrong (only after buildIndex with keys). */
export function unwitnessed(index) {
  return [...index.tables.chains.values(), ...index.tables.strands.values()].filter((e) => e.witnessed === false);
}
