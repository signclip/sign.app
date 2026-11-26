// sealed-store.js — a sharing point whose files are sealed end to end (22.11., mechanics; no group uses it yet):
//            the usual store contract (memory.js) on top of any store – Nextcloud, gateway, device, disk.
//
// Purpose:   inside the backing store only this is visible:
//              e2e/<JJJJ.MM>/<26>.sealed   one file, sealed with its own file key (1-model/sealed.js), in the month of
//                                          the file ('t( ) in its name); name = SHA-256 of the sealed bytes
//              e2e/run/<26>.sealed         one change, sealed with the group key: { at, add: [[path, blob, key, size]],
//                                          drop: [path] }; every device writes its own (random names), none is rewritten
//            Paths, context words, names of persons and the file keys live only inside the runs. copyTo: the sealed
//            bytes go as they are into another sealed store (another group, Training), plus a run there with the same
//            file key, sealed with that store's group key – nothing opened, nothing sealed again but 32 bytes.
// Depends:   1-model/sealed.js, 1-model/filename.js + layout.js (month), memory.js (errors)
// Test:      tests/sealed.test.mjs
// Limits:    every change = 1 run (≈ 0.2–0.5 KB; Hetzner bills 64 KB) · load() reads only runs not seen yet (they never
//            change) · compact(): one 'whole' run, the covered ones removed (with only 'a' they stay and are skipped) ·
//            same path from two devices at once: the earlier run wins (never overwrite); a device's runs follow all it
//            has seen · list() comes from the runs, files are never listed · a wrong group key opens no run.

import { newKey, keyText, keyBytes, sealFile, openFile, nameOf, sealBytes, openBytes } from '../1-model/sealed.js';
import { toBase32 } from '../1-model/ids.js';
import { readName } from '../1-model/filename.js';
import { monthOf } from './layout.js';
import { ExistsError, MissingError } from './memory.js';

export const FOLDER = 'e2e/';
const RUNS = `${FOLDER}run/`, LABEL = 'sign run 1';
const enc = new TextEncoder(), dec = new TextDecoder();
const stem = (p) => p.slice(p.lastIndexOf('/') + 1).replace(/\.sealed$/, '');

/** Where a sealed file lies: the month of the file, as in the layout and the backup. */
function blobPath(name, path) {
  const time = readName(path.slice(path.lastIndexOf('/') + 1))?.time;
  return time ? `${FOLDER}${monthOf(time)}/${name}.sealed` : `${FOLDER}${name}.sealed`;
}

export class SealedStore {
  /** store: the backing store · key: the group key (32 bytes or 52 Base32 chars) · now: clock for the runs. */
  constructor({ store, key, now = () => Date.now(), name = 'sealed' }) {
    this.store = store;
    this.key = typeof key === 'string' ? keyBytes(key) : key;
    this.now = now;
    this.name = name;
    this.runs = new Map(); // run name → { at, add, drop, whole, upto }
    this.files = null; // path → { blob, key, size, at }
    this.last = 0; // latest run time seen
  }

  /** Read the runs not seen yet and rebuild the list. Sealed runs never change, so each is read once. */
  async load() {
    const listed = await this.store.list(RUNS).catch(() => []);
    for (const e of listed) {
      const n = stem(e.path);
      if (this.runs.has(n)) continue;
      const run = JSON.parse(dec.decode(await openBytes(await this.store.read(e.path), this.key, LABEL)));
      this.runs.set(n, run);
    }
    this.rebuild();
    return this;
  }

  rebuild() {
    const all = [...this.runs.entries()].sort(([a, x], [b, y]) => x.at - y.at || (a < b ? -1 : 1));
    const whole = all.filter(([, r]) => r.whole).pop();
    const skip = new Set(whole ? [whole[0], ...whole[1].upto] : []);
    const files = new Map((whole?.[1].add ?? []).map(([p, blob, k, size, at]) => [p, { blob, key: keyBytes(k), size, at }]));
    for (const [n, r] of all) {
      if (skip.has(n)) continue;
      for (const p of r.drop ?? []) files.delete(p);
      for (const [p, blob, k, size] of r.add ?? []) if (!files.has(p)) files.set(p, { blob, key: keyBytes(k), size, at: r.at });
    }
    this.files = files;
    this.last = Math.max(0, ...all.map(([, r]) => r.at));
  }

  async ready() { if (!this.files) await this.load(); }
  async entry(path) {
    await this.ready();
    if (!this.files.has(path)) throw new MissingError(path);
    return this.files.get(path);
  }

  async run(change) {
    const run = { at: Math.max(this.now(), this.last + 1), ...change }; // after all it has seen: its own order holds
    const name = toBase32(newKey()).slice(0, 26);
    await this.store.write(`${RUNS}${name}.sealed`, await sealBytes(enc.encode(JSON.stringify(run)), this.key, LABEL));
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
  }

  async remove(path) {
    const f = await this.entry(path);
    await this.run({ drop: [path] });
    if (![...this.files.values()].some((g) => g.blob === f.blob)) await this.store.remove(f.blob).catch(() => {});
  }

  /** Rename only: the sealed file stays where it is, a run says the new path. */
  async move(from, to) {
    const f = await this.entry(from);
    if (this.files.has(to)) throw new ExistsError(to);
    await this.run({ drop: [from], add: [[to, f.blob, keyText(f.key), f.size]] });
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

  /** Everything into one run; the runs it covers go (if this store may remove; otherwise they stay and are skipped). */
  async compact() {
    await this.load();
    const upto = [...this.runs.keys()];
    const add = [...this.files.entries()].map(([p, f]) => [p, f.blob, keyText(f.key), f.size, f.at]);
    await this.run({ whole: true, upto, add });
    for (const n of upto) await this.store.remove(`${RUNS}${n}.sealed`).catch(() => {});
    for (const n of upto) this.runs.delete(n);
    this.rebuild();
  }
}
