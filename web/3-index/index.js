// index.js — what the index knows and how it answers. Computed, never the truth.
//
// Purpose:   tables named after our terms, all rebuilt from the files at any time:
//              strands        id → kind, head (from :x files and from the chains that define them); :x also lead = sticky words
//              chains         id → head, definitions, lines, the chain below (bottom {:chain.1})
//              sharingPoints  u_ (whole, from the file name) → paths in every sharing point
//              context        word (NFC, lower case) → :x strands that contain it
//              weave          id → files that point to it (define it, came from it, build on it)
//              takes          chains whose top line waits for a Take ({:_.1})
//              similar        chains whose top line holds a similar ({:?.1} or ?( )), live or kept: the log of similars
//            Video, audio and Parquet are never opened: chains define them, names locate them.
// Depends:   1-model (file, ids, filename)
// Test:      tests/storage.test.mjs, tests/share.test.mjs
// Seals:     with keys, every .sign is checked against the z_ of its q_; keys come only along a chain of
//            trust from the roots given (this device, signers known from join), see trust().
// Parts:     read through index/ parts (parts.js): one form in the sharing point, on the device, at atlas.
// Limits:    in memory: ~200–300 B per file → 10⁵ Takes (~5·10⁵ files) ≈ 100–150 MB.
//            Lookups are Map reads (~1 µs); versions walk the chain (~1 µs per step).
// EXTEND(S3, index): folders whose ETag is unchanged are not even listed (parts.js).
// EXTEND(S14, index): tables in SQLite when one reader holds more than ~10⁶ files (atlas).
// EXTEND(S6, vectors): vectors for Similar as one more table.

import { readFile } from '../1-model/file.js';
import { readId, idKey, uOf } from '../1-model/ids.js';
import { readName, flatWords } from '../1-model/filename.js';
import { checkWitness } from '../1-model/crypto.js';
import { leadOf } from '../1-model/context.js';
import { readThroughParts, cachePrefix } from './parts.js';

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
      const lead = [...new Set(file.rows.flatMap((row) => leadOf(row.text)))]; // sticky words: a series (15.11.)
      this.tables.strands.set(key, { key, kind: 'x', head: file.head, from, lead });
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
  sharingPoints(idText) { return [...(this.tables.sharingPoints.get(uOf(readId(idText))) ?? [])]; }

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

/** Check keys announced in a .sign: devices in a list, signers in a sharing-point.sign → [[q_…, z_…]]. */
export function announcedKeys(text) {
  return [...text.matchAll(/^:sharing-point(?:\.\d+)?[^\n]*?!\((q_[0-9A-Z]+) z_([0-9A-Z]+)\)/gm)].map((m) => [m[1], m[2]]);
}

const headQ = (text) => /^:[^\n!]*!\((q_[0-9A-Z]+)/.exec(text)?.[1] ?? null;
const sealedHead = (text) => / y_/.test(text.slice(0, text.indexOf('\n') >>> 0));

/**
 * Chain of trust (14.11.): a key announced in a file counts only when that file is sealed by a key already
 * known. Roots come from the caller: this device's own z_, and the signers learned at join (project.json,
 * a group's join answer). From there: own list (sealed by this device) → the other own devices; a group's
 * within/ (sealed by its signer) → its members' devices → their Takes and templates. A file that announces
 * its own key (a hello in a drop, anything put there by someone) proves nothing and stays unwitnessed.
 * Repeats until no new key comes (≤ depth of the chain, usually 2–3 rounds).
 */
async function trust(sealed, roots) {
  const known = { ...roots };
  for (let grew = true; grew;) {
    grew = false;
    for (const s of sealed) {
      if (s.ok || !sealedHead(s.text)) continue;
      const q = headQ(s.text), z = known[q];
      if (!z || s.tried === z) continue;
      s.tried = z;
      s.ok = await checkWitness(z, s.text);
      if (s.ok) for (const [aq, az] of announcedKeys(s.text)) if (!known[aq]) { known[aq] = az; grew = true; }
    }
  }
  for (const s of sealed) if (s.entry) s.entry.witnessed = Boolean(s.ok);
  return known;
}

/**
 * Read every sharing point through its parts (parts.js): a fresh part = one read per folder, else the .sign
 * files one by one (and the part is made again). Video, audio and Parquet are never opened.
 * stores: [{ name, store, write?, id? }] · write: this reader may refresh the sharing point's own index/ ·
 * id: name of its parts in the cache (default: name).
 * keys: { q_…: z_… } roots of trust (this device, signers known from join), or null = no checking.
 * cache: a store of this reader (device: its own store; atlas: the atlas account) for parts it cannot write
 * into the sharing point, under index/<id>/.
 * witnessed: true (sealed by a trusted key) · false (missing, wrong, or no trusted key: shown apart, not used).
 * index.read = .sign files opened one by one (0 when every part was fresh).
 */
export async function buildIndex(stores, { keys = null, cache = null } = {}, index = new Index()) {
  index.skipped = []; // [{ store, path?, error }]: not part of the tables, never stops the rest (a brought-in
  //                     sharing point may be offline or hold a file this version cannot read)
  index.read = 0;
  const sealed = [];
  for (const { name, store, write = false, id = null } of stores) {
    let got;
    try { got = await readThroughParts(store, { write, cache: cache ? { store: cache, prefix: cachePrefix(id ?? name) } : null }); }
    catch (err) { index.skipped.push({ store: name, error: String(err.message ?? err) }); continue; }
    index.skipped.push(...got.skipped.map((s) => ({ store: name, ...s })));
    index.read += got.read;
    for (const f of got.files) {
      index.addPath(name, f.path);
      if (f.text == null) continue;
      try {
        if (f.path.endsWith('sharing-point.sign')) { sealed.push({ entry: null, text: f.text }); continue; } // only its keys
        const key = index.addText(f.text, { store: name, path: f.path });
        if (key) sealed.push({ entry: index.tables.chains.get(key) ?? index.tables.strands.get(key), text: f.text });
      } catch (err) { index.skipped.push({ store: name, path: f.path, error: String(err.message ?? err) }); }
    }
  }
  index.keys = keys ? await trust(sealed, keys) : null;
  return index;
}

/** Files whose witness is missing or wrong (only after buildIndex with keys). */
export function unwitnessed(index) {
  return [...index.tables.chains.values(), ...index.tables.strands.values()].filter((e) => e.witnessed === false);
}
