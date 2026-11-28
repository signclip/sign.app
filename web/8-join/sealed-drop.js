// sealed-drop.js — something sealed for the devices of one person, left at her door (26.11., mechanics; no tile uses
//            it yet).
//
// Purpose:   every sharing point of a signer has a door: hello/ takes what anyone leaves there, and nobody but the
//            signer reads it (join.js, group.js). A person is the signer of her own sharing point. So sending her
//            something = leaving it at her door, sealed for her devices: the storage and whoever else can look into
//            the drop learn who sent it and how much, never what.
//              hello/<26>.sealed                              each file, sealed with its own file key (1-model/sealed.js:
//                                                             the same file as in a sealed sharing point, same name)
//              hello/(sealed)'t(…)!(u_…).chain.sign           the note, sealed (y_) by the sending device; no name in
//                                                             its path (advance() moves what carries a person's name)
//                :chain!(q_ n_ t_ u_ y_…)@(Anna)'t(…)
//                :sharing-point.1^(Annas Pixel)!(q_… z_…)                          who sends
//                ((sealed <run>) (<26>) (<26>) {:sharing-point.1})'t(…)             the run { add: [[path, file, file key,
//                                                                                  size]] } sealed with a key drawn for
//                                                                                  this drop; then the files it is about
//                ((key <name>) (q_<her device>) (sealed <eph> <iv> <data>))'t(…)    that key for each device of hers (the
//                                                                                  line of a key note, sealed-keys.js)
//            Whose devices: the description of her sharing point names the pickup key of each signer device
//            (sharing-point.js); the sender checks its seal against the signers she knows before she seals anything.
//            First she sees, then she takes: waitingDrops() shows who it is from and whether she knows that device
//            (within/ of her door); nothing of it is opened or copied before
//              acceptDrop  ↑  the files go into her own sharing point – into a sealed one as they are, only their file
//                             keys are sealed again there; the note moves to within/<account>/, the door is empty again
//              quietDrop   ↓  note and files move to quiet/<account>/, unopened; nothing is deleted (as with a hello)
//            SealedDrop is a store like every other (write never over), so what shares a take to a sharing point
//            (4-save/share-take.js) leaves it at a door unchanged; send() writes the note last: whoever finds it finds
//            its files.
// Depends:   1-model (sealed, crypto, file, ids, filename), 2-storage (memory, layout), join.js, state.js
// Test:      tests/drop.test.mjs
// Limits:    a note ≈ 0.3 KB + 0.3 KB per device of hers + ≈ 0.4 KB per file (measured: a take of 4 files for one
//            device = 2.1 KB); ≤ 100 files per drop · names of files and keys: 130 bit · a drop is open to
//            anyone: per look the newest 50 notes are read, only those sealed by the device they name are shown, the
//            rest is counted as junk · the files of a drop lie whole in memory until send() (as a take does) · a drop
//            opens only on the devices its note names: a device she adds later reads it after she accepted it into her
//            sharing point, not before · the sender cannot take it back once it lies there (a drop is write only) ·
//            accepting checks every file before it takes one: up to 64 MiB are held meanwhile, beyond that the rest is
//            read twice.

import { newKey, keyText, keyBytes, keyName, sealFile, openFile, nameOf, sealBytes, openBytes, sealGroupKey, openGroupKey } from '../1-model/sealed.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf, toBase32, fromBase32 } from '../1-model/ids.js';
import { timeLabel, buildName, readName } from '../1-model/filename.js';
import { ExistsError, MissingError } from '../2-storage/memory.js';
import { partsOf } from '../2-storage/layout.js';
import { readHello } from './join.js';
import { withState, accountFolder, nameOf as fileOf } from './state.js';
import { limit, LIMITS } from '../1-model/limits.js';

export const MOST_FILES = LIMITS['drop.files'].value; // the preselection, 100; what counts: limit('drop.files')
export const MAX_NOTES = LIMITS['drop.notes'].value; // the preselection, 50; what counts: limit('drop.notes')
// sealed bytes kept in memory between checking a drop and taking it: limit('drop.hold'), 64 MiB
const LABEL = 'sign run 1';
const RUN = /^\(\(sealed ([0-9A-Z]+)\)((?: \([0-9A-Z]{26}\))*) \{:sharing-point\.1\}\)/;
const KEY = /^\(\(key ([0-9A-Z]{26})\) \((q_[0-9A-Z]+)\) \(sealed ([0-9A-Z]+ [0-9A-Z]+ [0-9A-Z]+)\)\)/;
const LAID = /^(?:(?:take|echo)\/[a-z~]+|chain)\/\d{4}\.\d{2}\/[^/]+$/; // where a strand or a chain lies in every sharing point (layout.js)
const enc = new TextEncoder(), dec = new TextDecoder();
const bytesOf = (text) => { // Base32 → bytes, as long as toBase32 made them
  const out = new Uint8Array(Math.floor((text.length * 5) / 8));
  let v = fromBase32(text);
  for (let i = out.length - 1; i >= 0; i--) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
};
const sealedPath = (name) => `hello/${name}.sealed`;
const isNote = (path) => path.startsWith('hello/') && path.endsWith('.chain.sign') && fileOf(path).startsWith('(sealed)');

/**
 * The devices something for this sharing point is sealed for: its signers with a pickup key. description: from
 * readDescription, after trusted() said its seal is a known signer's. → [{ id (q_), pickup }]
 */
export const devicesOf = (description) => (description?.signers ?? []).filter((s) => s.pickup).map((s) => ({ id: s.id, pickup: s.pickup }));

/**
 * A drop on its way: a store to write into, then send(). door: her door as the sender reaches it (write into hello/) ·
 * to: [{ id (q_), pickup }] her devices (devicesOf) · from: { person: { id, label }, device: { id, label, key }, deviceKey }.
 */
export class SealedDrop {
  constructor({ door, to, from, now = Date.now() }) {
    if (!to?.length) throw new Error('nobody to seal for: her description names no pickup key');
    Object.assign(this, { door, to, from, now });
    this.dropOnly = true;
    this.held = new Map(); // path → { bytes, file, key, size }
    this.sent = null;
  }

  /** Seal one file with a key of its own and leave it at the door. Never over. */
  async write(path, bytes) {
    if (this.sent) throw new Error('this drop is on its way: a new one for more');
    if (this.held.has(path)) throw new ExistsError(path);
    if (this.held.size >= limit('drop.files')) throw new Error(`a drop takes ${limit('drop.files')} files`);
    const plain = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
    const key = newKey(), sealed = await sealFile(plain, key), file = await nameOf(sealed);
    await this.door.write(sealedPath(file), sealed).catch((e) => { if (!(e instanceof ExistsError)) throw e; });
    this.held.set(path, { bytes: plain, file, key, size: plain.length });
  }

  /** What this drop holds so far (what lies at the door cannot be listed or read by the sender). */
  async list(prefix = '') {
    return [...this.held.entries()].filter(([p]) => p.startsWith(prefix)).map(([path, f]) => ({ path, size: f.size })).sort((a, b) => (a.path < b.path ? -1 : 1));
  }
  async read(path) {
    const f = this.held.get(path);
    if (!f?.bytes) throw new MissingError(path);
    return f.bytes;
  }
  async remove(path) { throw new Error(`a drop is write only: ${path}`); }
  async move(path) { throw new Error(`a drop is write only: ${path}`); }

  /** The note, last: the run sealed with a key of this drop, that key for each of her devices. → its path in hello/ */
  async send() {
    if (this.sent) return this.sent;
    if (!this.held.size) throw new Error('an empty drop');
    const { person, device, deviceKey } = this.from, time = timeLabel(this.now);
    const key = newKey(), name = await keyName(key);
    const run = { add: [...this.held.entries()].map(([path, f]) => [path, f.file, keyText(f.key), f.size]) };
    const files = [...new Set(run.add.map((a) => a[1]))].map((f) => ` (${f})`).join('');
    const rows = [`((sealed ${toBase32(await sealBytes(enc.encode(JSON.stringify(run)), key, LABEL))})${files} {:sharing-point.1})'t(${time})`];
    for (const d of this.to) rows.push(`((key ${name}) (${d.id}) (sealed ${await sealGroupKey(d.pickup, key)}))'t(${time})`);
    const id = newId({ q: device.id, n: person.id, now: this.now });
    const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": time }),
      [defLine('sharing-point.1', { hint: device.label, id: `${device.id} z_${device.key}` })], rows));
    this.sent = `hello/${buildName({ words: ['sealed'], time, u: uOf(id), kind: 'chain', ext: 'sign' })}`;
    await this.door.write(this.sent, enc.encode(text));
    for (const f of this.held.values()) f.bytes = null; // the device keeps its own files; this copy has gone
    return this.sent;
  }
}

/** What a note says without opening anything: who, which files, for which devices. → null if it is no note. */
export function readNote(text) {
  try {
    const f = readFile(String(text)), d = f.defs.get('sharing-point.1');
    const m = RUN.exec(f.rows[0]?.text ?? '');
    if (!m || !d?.id?.z) return null;
    return {
      from: { person: { id: f.head.id.n, label: f.head['@'] ?? '' }, device: { label: d.hint ?? '', id: d.id.q, key: d.id.z.slice(2) } },
      run: m[1], files: [...m[2].matchAll(/\(([0-9A-Z]{26})\)/g)].map((x) => x[1]), time: f.rows[0].time,
      keys: f.rows.slice(1).map((r) => KEY.exec(r.text)).filter(Boolean).map((k) => ({ name: k[1], to: k[2], sealed: k[3] })),
    };
  } catch { return null; }
}

/**
 * The devices she knows already: everyone within/ her door (their hellos lie there since she took them in).
 * → { q_…: z_ } Limits: one listing of within/ and one read per hello.
 */
export async function knownDevices(store) {
  const out = {};
  for (const f of (await store.list('within/').catch(() => [])).filter((x) => x.path.endsWith('.chain.sign'))) {
    try { const { device } = readHello(dec.decode(await store.read(f.path))); out[device.id] = device.key; } catch { /* a join marker, a consent, a note: no device */ }
  }
  return out;
}

/**
 * Her side: the drops waiting at her door, newest first. store: her door as she reaches it · known: { q_: z_ }
 * (knownDevices) · device: this device's q_ (is it one the drop was sealed for?).
 * → [{ path, from, known (a device within her door), mine (sealed for this device), files: n, bytes, time }], .junk = n
 */
export async function waitingDrops(store, { known = {}, device = null, max = limit('drop.notes') } = {}) {
  const listed = await store.list('hello/');
  const size = new Map(listed.map((f) => [f.path, f.size]));
  const notes = listed.map((f) => f.path).filter(isNote);
  const newest = notes.sort((a, b) => (readName(fileOf(b))?.time ?? '').localeCompare(readName(fileOf(a))?.time ?? '')).slice(0, max);
  const out = [];
  for (const path of newest) {
    const text = dec.decode(await store.read(path)), n = readNote(text);
    if (!n || !(await checkWitness(n.from.device.key, text).catch(() => false))) continue; // only a note sealed by the device it names can come from that device
    out.push({ path, from: n.from, known: known[n.from.device.id] === n.from.device.key, mine: n.keys.some((k) => k.to === device),
      files: n.files.length, bytes: n.files.reduce((sum, f) => sum + (size.get(sealedPath(f)) ?? 0), 0), time: n.time });
  }
  Object.defineProperty(out, 'junk', { value: notes.length - out.length }); // named like a note, but not one (or beyond the newest 50)
  return out;
}

/** Open the note of a drop with this device's pickup key. Reads the note only. → { from, files: [{ path, file, key, size }] } */
export async function openDrop({ store, notePath, device, pickupKey }) {
  const text = dec.decode(await store.read(notePath)), n = readNote(text);
  if (!n || !(await checkWitness(n.from.device.key, text).catch(() => false))) throw new Error('not a drop sealed by the device it names');
  const line = n.keys.find((k) => k.to === device);
  if (!line) throw new Error('this drop is not sealed for this device');
  const key = await openGroupKey(pickupKey, line.sealed);
  if (await keyName(key) !== line.name) throw new Error('the key of this drop is not the one it names');
  const run = JSON.parse(dec.decode(await openBytes(bytesOf(n.run), key, LABEL)));
  const files = (run.add ?? []).map(([path, file, k, size]) => ({ path, file, key: keyBytes(k), size }));
  for (const f of files) {
    if (!LAID.test(f.path) || f.path.includes('..') || !partsOf(f.path)) throw new Error(`a drop brings strands and chains, nothing else: ${f.path}`); // never sharing-point.sign, e2e/, within/ …
    if (!n.files.includes(f.file)) throw new Error('the run names a file the note does not');
  }
  return { from: n.from, files };
}

/**
 * ↑ She takes it. into: her own sharing point – a SealedStore gets the sealed bytes as they are (their file keys are
 * sealed again under her group key, nothing is opened), any other store gets them opened. A path she has already
 * stays as it is (never over). Then the note moves to within/<account of the sender>/ and the sealed files leave the
 * door. → { from, paths: [taken], had: [paths she had already], note }
 */
export async function acceptDrop({ store, notePath, device, pickupKey, into }) {
  const { from, files } = await openDrop({ store, notePath, device, pickupKey });
  const paths = [], had = [], held = new Map();
  let holding = 0;
  const checked = async (f) => { // the note is sealed by her device, the run names each file by its hash: so the bytes are hers
    const sealed = held.get(f.file) ?? await store.read(sealedPath(f.file));
    if (!held.has(f.file) && await nameOf(sealed) !== f.file) throw new Error(`not the file the sender sealed: ${f.path}`);
    return sealed;
  };
  const hold = limit('drop.hold');
  for (const f of files) { // all of it is checked before any of it gets in: a drop comes whole or not at all
    const sealed = await checked(f);
    if (!held.has(f.file) && (holding += sealed.length) <= hold) held.set(f.file, sealed);
  }
  for (const f of files) {
    const sealed = await checked(f); // held from the check, or read and checked once more (beyond 64 MiB)
    try {
      if (typeof into.put === 'function') { await into.ready(); if (into.files.has(f.path)) throw new ExistsError(f.path); await into.put(f.path, sealed, f.key, f.size, f.file); }
      else await into.write(f.path, await openFile(sealed, f.key));
      paths.push(f.path);
    } catch (e) { if (!(e instanceof ExistsError)) throw e; had.push(f.path); }
  }
  const note = `within/${accountFolder(from.person)}/${withState(fileOf(notePath), 'within')}`;
  await store.move(notePath, note);
  for (const file of new Set(files.map((f) => f.file))) await store.remove(sealedPath(file)).catch(() => {});
  return { from, paths, had, note };
}

/** ↓ Not now: the note and the files it names move to quiet/<account of the sender>/, unopened. → [new paths] */
export async function quietDrop({ store, notePath }) {
  const n = readNote(dec.decode(await store.read(notePath)));
  if (!n) throw new Error('not a note of a drop');
  const folder = `quiet/${accountFolder(n.from.person)}/`, moved = [];
  for (const file of n.files) {
    try { await store.move(sealedPath(file), `${folder}${file}.sealed`); moved.push(`${folder}${file}.sealed`); } catch (e) { if (!(e instanceof MissingError || e instanceof ExistsError)) throw e; }
  }
  await store.move(notePath, `${folder}${withState(fileOf(notePath), 'quiet')}`);
  return [...moved, `${folder}${withState(fileOf(notePath), 'quiet')}`];
}
