// sealed-store.js — a sharing point whose files are sealed end to end (22.11., mechanics; no group uses it yet):
//            the usual store contract (memory.js) on top of any store – Nextcloud, gateway, device, disk.
//
// Purpose:   inside the backing store only this is visible:
//              e2e/<JJJJ.MM>/<26>.sealed   one file, sealed with its own file key (1-model/sealed.js), in the month of
//                                          the file ('t( ) in its name); name = SHA-256 of the sealed bytes
//              e2e/run/<26>.<26>.sealed    one change, sealed with a group key: { at, add: [[path, blob, key, size]],
//                                          drop: [path] }; every device writes its own (random names), none is rewritten.
//                                          The first 26 = the name of the group key that seals it (sealed.js keyName).
//              e2e/key/…                   the group keys themselves, sealed for each device (sealed-keys.js)
//              e2e/view/<26>/<26>.<26>.sealed  a person's view (27.11.): runs under a key of her own that name files
//                                          once more – the same sealed bytes, the same file key, nothing sealed
//                                          again but the run. Who holds the view key reads exactly these.
//            Group keys one after the other (26.11.): the store holds every group key its device was given. It reads
//            each run with the key its name says and writes with the newest. A run under a key it does not hold stays
//            closed and is counted (closed): there is something newer, ask the signer. A run that does not open under
//            the key it names is junk (anyone who may add could put one there): skipped and counted, never an error.
//            Renewing = renewKey (sealed-keys.js), then compact() here: the whole run under the new key closes the
//            keys before it. A run that still comes under one of them (from whoever left, or from a device that had
//            not seen the new key) counts for nothing and is counted (late).
//            Paths, context words, names of persons and the file keys live only inside the runs. copyTo: the sealed
//            bytes go as they are into another sealed store (another group, Training), plus a run there with the same
//            file key, sealed with that store's group key – nothing opened, nothing sealed again but 32 bytes.
// Depends:   1-model/sealed.js, 1-model/filename.js + layout.js (month), memory.js (errors)
// Test:      tests/sealed.test.mjs
//            A view lists what its holder may read; it is no second copy: remove the file in the group through a
//            store without `also` and the view names bytes that are gone (her device opens the group with `also`).
// Test:      tests/views.test.mjs (views)
// Limits:    a file in a view = 1 run more (≈ 0.3 KB), no sealed bytes twice · a holder of a view key can add runs
//            to that view (as every holder of a group key can in the group) · every change = 1 run (≈ 0.2–0.5 KB; Hetzner bills 64 KB) · load() reads only runs not seen yet (they never
//            change) · compact(): one 'whole' run under the newest key, the covered ones removed (with only 'a' they
//            stay and are skipped) · same path from two devices at once: the earlier run wins (never overwrite); a
//            device's runs follow all it has seen · list() comes from the runs, files are never listed · a wrong group
//            key opens no run (list() stays empty, closed counts them) · a run does not say who wrote it: every device
//            with a group key can hide a path or name one first (the sealed file and its seal y_ stay as they are).

import { newKey, keyText, keyBytes, keyName, sealFile, openFile, nameOf, sealBytes, openBytes } from '../1-model/sealed.js';
import { toBase32 } from '../1-model/ids.js';
import { readName } from '../1-model/filename.js';
import { monthOf } from './layout.js';
import { ExistsError, MissingError } from './memory.js';

export const FOLDER = 'e2e/';
/** Where the keychain of a device keeps the group key of a sharing point (beside its access, under the same id). */
export const keyId = (id) => `${id}.key`;
const RUNS = `${FOLDER}run/`, VIEWS = `${FOLDER}view/`, LABEL = 'sign run 1';
const enc = new TextEncoder(), dec = new TextDecoder();
const stem = (p) => p.slice(p.lastIndexOf('/') + 1).replace(/\.sealed$/, '');
const bytesOfKey = (k) => (typeof k === 'string' ? keyBytes(k) : k);
const RUN = /^([0-9A-Z]{26})\.[0-9A-Z]{26}$/; // <name of the group key>.<random>
const KEY = /^[0-9A-Z]{52}$/;
/** Is this what a run looks like? Whoever holds a group key could seal anything. */
const wellFormed = (r) => Number.isFinite(r?.at) && (r.add ?? []).every((a) => Array.isArray(a) && typeof a[0] === 'string' && typeof a[1] === 'string' && KEY.test(a[2]))
  && (r.drop ?? []).every((d) => typeof d === 'string') && (!r.whole || Array.isArray(r.upto));

/** Where a sealed file lies: the month of the file, as in the layout and the backup. */
function blobPath(name, path) {
  const time = readName(path.slice(path.lastIndexOf('/') + 1))?.time;
  return time ? `${FOLDER}${monthOf(time)}/${name}.sealed` : `${FOLDER}${name}.sealed`;
}

export class SealedStore {
  /**
   * store: the backing store · key: the group key (32 bytes or 52 Base32 chars), or keys: every group key this device
   * was given, [{ key, at }] (sealed-keys.js openKeys; the newest at writes) · now: clock for the runs ·
   * view: true = this is a person's view (27.11.), keys: its view key · also: [views] = whatever this store
   * writes, moves or removes is named in these views too (her device: "all I add, for whoever holds my view").
   */
  constructor({ store, key = null, keys = [], now = () => Date.now(), name = 'sealed', view = false, also = [] }) {
    this.store = store;
    this.view = view; // a view: runs of its own in e2e/view/<name of its key>/, sealed files are never removed through it
    this.also = also; // views that name once more what this store writes
    this.given = [...(key ? [{ key, at: 0 }] : []), ...keys].map((k) => ({ key: bytesOfKey(k.key), at: k.at ?? 0 }));
    if (!this.given.length) throw new Error('a sealed sharing point needs a group key');
    this.key = this.given.reduce((a, b) => (b.at > a.at ? b : a)).key; // the one that writes (until the names are known: the newest at)
    this.ring = new Map(); // name of a group key → { key, at }
    this.now = now;
    this.name = name;
    this.runs = new Map(); // run name → { at, add, drop, whole, upto }
    this.junk = new Set(); // runs that do not open under the key they name
    this.closed = 0; // runs under a group key this device does not hold
    this.late = 0; // runs under a key that a whole run under a newer key has closed
    this.files = null; // path → { blob, key, size, at }
    this.last = 0; // latest run time seen
  }

  /** More group keys (a renewal arrived): the next load() opens what was closed. keys: [{ key, at }] */
  addKeys(keys = []) {
    this.given.push(...keys.map((k) => ({ key: bytesOfKey(k.key), at: k.at ?? 0 })));
    this.files = null;
    return this;
  }

  /** The names of the keys given so far, and the one that writes: the newest (same time: the greater name, for every device alike). */
  async names() {
    for (const k of this.given.splice(0)) this.ring.set(await keyName(k.key), k);
    const [name, newest] = [...this.ring.entries()].sort(([a, x], [b, y]) => y.at - x.at || (a < b ? 1 : -1))[0];
    this.key = newest.key;
    return name;
  }

  /** Where this store's runs lie: one folder for a group, one per view key for a view. */
  folders() { return this.view ? [...this.ring.keys()].map((n) => `${VIEWS}${n}/`) : [RUNS]; }
  runPath(name) { return this.view ? `${VIEWS}${name.slice(0, 26)}/${name}.sealed` : `${RUNS}${name}.sealed`; }

  /** Read the runs not seen yet and rebuild the list. Sealed runs never change, so each is read once. */
  async load() {
    await this.names();
    const listed = [];
    for (const dir of this.folders()) listed.push(...await this.store.list(dir).catch(() => []));
    let closed = 0;
    for (const e of listed) {
      const n = stem(e.path);
      if (this.runs.has(n) || this.junk.has(n)) continue;
      const holds = this.ring.get(RUN.exec(n)?.[1]);
      if (!holds) { if (RUN.test(n)) closed++; else this.junk.add(n); continue; }
      let run = null;
      try { run = JSON.parse(dec.decode(await openBytes(await this.store.read(e.path), holds.key, LABEL))); } catch { /* not sealed with the key it names */ }
      if (wellFormed(run)) this.runs.set(n, run); else this.junk.add(n);
    }
    this.closed = closed;
    this.rebuild();
    return this;
  }

  rebuild() {
    const since = (n) => this.ring.get(n.slice(0, 26))?.at ?? 0; // since when the key of this run writes
    const all = [...this.runs.entries()].sort(([a, x], [b, y]) => x.at - y.at || (a < b ? -1 : 1));
    const whole = all.filter(([, r]) => r.whole).sort(([a, x], [b, y]) => since(a) - since(b) || x.at - y.at || (a < b ? -1 : 1)).pop();
    const skip = new Set(whole ? [whole[0], ...whole[1].upto] : []);
    const files = new Map((whole?.[1].add ?? []).map(([p, blob, k, size, at]) => [p, { blob, key: keyBytes(k), size, at }]));
    let late = 0, last = whole?.[1].at ?? 0;
    for (const [n, r] of all) {
      if (skip.has(n)) continue;
      // WHY: a whole run under a newer key closes the keys before it. Whoever left still holds her old key and may
      // still be able to add: a run of hers under it could hide a path or name one first. It counts for nothing.
      if (whole && since(n) < since(whole[0])) { late++; continue; }
      for (const p of r.drop ?? []) files.delete(p);
      for (const [p, blob, k, size] of r.add ?? []) if (!files.has(p)) files.set(p, { blob, key: keyBytes(k), size, at: r.at });
      last = Math.max(last, r.at);
    }
    this.files = files;
    this.late = late; // runs under a closed key (a device that had not seen the new key yet writes its change again)
    this.last = last;
  }

  async ready() { if (!this.files) await this.load(); }
  async entry(path) {
    await this.ready();
    if (!this.files.has(path)) throw new MissingError(path);
    return this.files.get(path);
  }

  async run(change) {
    const run = { at: Math.max(this.now(), this.last + 1), ...change }; // after all it has seen: its own order holds
    const name = `${await this.names()}.${toBase32(newKey()).slice(0, 26)}`; // the newest group key seals it
    await this.store.write(this.runPath(name), await sealBytes(enc.encode(JSON.stringify(run)), this.key, LABEL));
    this.runs.set(name, run);
    this.rebuild();
  }

  async list(prefix = '') {
    await this.ready();
    return [...this.files.entries()].filter(([p]) => p.startsWith(prefix))
      .map(([path, f]) => ({ path, size: f.size, at: f.at })).sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  async read(path) {
    const f = await this.entry(path);
    return openFile(await this.store.read(f.blob), f.key);
  }

  async write(path, bytes) {
    await this.ready();
    if (this.files.has(path)) throw new ExistsError(path);
    const plain = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
    const key = newKey();
    await this.put(path, await sealFile(plain, key), key, plain.length);
  }

  /** The sealed bytes into the backing store (same bytes = same name: written once), then the run. */
  async put(path, sealed, key, size, name = null) {
    const blob = blobPath(name ?? await nameOf(sealed), path);
    await this.store.write(blob, sealed).catch((e) => { if (!(e instanceof ExistsError)) throw e; });
    await this.run({ add: [[path, blob, keyText(key), size]] });
    for (const v of this.also) { await v.ready(); if (!v.files.has(path)) await v.run({ add: [[path, blob, keyText(key), size]] }); }
  }

  async remove(path) {
    const f = await this.entry(path);
    await this.run({ drop: [path] });
    for (const v of this.also) { await v.ready(); if (v.files.has(path)) await v.run({ drop: [path] }); }
    if (this.view) return; // out of the view only: the group still names the sealed file
    if (![...this.files.values()].some((g) => g.blob === f.blob)) await this.store.remove(f.blob).catch(() => {});
  }

  /** Rename only: the sealed file stays where it is, a run says the new path. */
  async move(from, to) {
    const f = await this.entry(from);
    if (this.files.has(to)) throw new ExistsError(to);
    await this.run({ drop: [from], add: [[to, f.blob, keyText(f.key), f.size]] });
    for (const v of this.also) { await v.ready(); if (v.files.has(from) && !v.files.has(to)) await v.run({ drop: [from], add: [[to, f.blob, keyText(f.key), f.size]] }); }
  }

  /** The file key of one file: to seal it for Training (consent per take) or another reader. */
  async fileKey(path) { return (await this.entry(path)).key; }

  /** Copy without opening: the sealed bytes as they are, the file key into a run of the other sealed store. */
  async copyTo(path, other, toPath = path) {
    const f = await this.entry(path);
    await other.ready();
    if (other.files.has(toPath)) throw new ExistsError(toPath);
    await other.put(toPath, await this.store.read(f.blob), f.key, f.size, stem(f.blob));
  }

  /**
   * A readable copy (27.11., user: other sharing points may hold one, Sciebo by default): opened here, written as it
   * was made into a store that is not sealed – same path, same bytes. There it is open to the storage and to every
   * link, and it cannot be called back. Into a sealed store the sealed bytes go as they are: copyTo.
   */
  async copyReadable(path, other, toPath = path) {
    if (other instanceof SealedStore) throw new Error('into a sealed store: copyTo (nothing is opened on the way)');
    await other.write(toPath, await this.read(path));
  }

  /**
   * Everything into one run under the newest group key; the runs it covers go (if this store may remove; otherwise
   * they stay and are skipped). After a renewal this is what takes the file keys away from the key before: whoever
   * holds only that one finds no run left that it opens.
   */
  async compact() {
    await this.load();
    const upto = [...this.runs.keys()];
    const add = [...this.files.entries()].map(([p, f]) => [p, f.blob, keyText(f.key), f.size, f.at]);
    await this.run({ whole: true, upto, add });
    for (const n of upto) await this.store.remove(this.runPath(n)).catch(() => {});
    for (const n of upto) this.runs.delete(n);
    this.rebuild();
  }

  /**
   * Take a view back: its runs go (if this store may remove). Whoever holds the view key finds nothing listed any
   * more; what she already opened she keeps. The sealed files stay – the group still names them. → runs removed
   */
  async forget() {
    if (!this.view) throw new Error('only a view is taken back this way');
    await this.load();
    const gone = [...this.runs.keys()];
    for (const n of gone) await this.store.remove(this.runPath(n));
    this.runs.clear();
    this.rebuild();
    return gone.length;
  }
}
