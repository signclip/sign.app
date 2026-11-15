// rename.js — a person renames herself (15.11.): the ID (n_, the account) stays, only the name changes.
//   device   sayRename(): a note (rename)@(new name) in the door's hello/, sealed by the device key, with the new
//            name sign beside it; it names the account and the old name.
//   admin    renames(): the notes whose device belongs to that account (seal + device in within/) · adoptRename():
//            the account folder within/@(old)!(n_) becomes within/@(new)!(n_), note and name sign go in ·
//            declineRename(): both to quiet/. The Nextcloud display name is set by the caller (provision.js).
// Depends:   1-model (file, ids, crypto, filename), join.js, state.js
// Test:      tests/join.test.mjs
// Limits:    one list of the door per look; old files keep @(old) in their names (names are a view, B4).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { timeLabel, buildName, readName } from '../1-model/filename.js';
import { nameSignOf, devicesOf } from './join.js';
import { withState, nameOf } from './state.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** Device: say the new name. drop: the door's hello/ (drop link) · account: the Nextcloud user (n_ small) · old: the old name. */
export async function sayRename({ store, device, deviceKey, person, account, old, nameSign = null, now = Date.now() }) {
  const id = newId({ q: device.id, n: person.id, now }), at = timeLabel(now);
  const text = await signed(deviceKey ?? null, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }),
    [defLine('sharing-point.1', { hint: device.label, id: `${device.id} z_${device.key}` })], [`((rename) (${old}) (account ${account}))'t(${at})`]));
  const name = buildName({ words: ['rename'], person: person.label, time: at, u: uOf(id), kind: 'chain', ext: 'sign' });
  await store.write(`hello/${name}`, enc.encode(text));
  if (nameSign) await store.write(`hello/${nameSignOf(name)}`, nameSign);
  return `hello/${name}`;
}

/** → { name (new), old, account, device: { id, key } } or null. */
export function readRename(text) {
  const f = readFile(text), d = f.defs.get('sharing-point.1');
  const m = /\(\(rename\) \(([^()]*)\) \(account ([^()]*)\)\)/.exec(f.rows[0]?.text ?? '');
  return m && d?.id?.z ? { name: f.head['@'], old: m[1], account: m[2].toLowerCase(), device: { id: d.id.q, key: d.id.z.slice(2) } } : null;
}

/** Admin: the rename notes that may count: sealed by a device of that very account. → [{ path, name, old, account, folder }] */
export async function renames(store) {
  const paths = (await store.list('hello/')).map((f) => f.path).filter((p) => /^\(rename\)/.test(nameOf(p)) && p.endsWith('.chain.sign'));
  const inside = (await store.list('within/').catch(() => [])).map((f) => f.path);
  const out = [];
  for (const path of paths.slice(0, 50)) {
    try {
      const text = dec.decode(await store.read(path)), r = readRename(text);
      if (!r || !(await checkWitness(r.device.key, text))) continue;
      const at = inside.find((p) => p.toLowerCase().includes(`!(${r.account})/`));
      const folder = at?.split('/')[1];
      if (!folder || !(await devicesOf(store, r.account)).some((x) => x.device.id === r.device.id)) continue; // a device of that account, nobody else
      out.push({ path, ...r, folder });
    } catch { /* not a rename */ }
  }
  return out;
}

const pairOf = (path) => [path, `hello/${nameSignOf(nameOf(path))}`];

/** Admin ↑: the folder takes the new name, note and name sign go in. → the new folder */
export async function adoptRename(store, r) {
  const to = `@(${r.name})!(${r.folder.slice(r.folder.lastIndexOf('!(') + 2, -1)})`;
  for (const { path } of (await store.list('within/')).filter((f) => f.path.startsWith(`within/${r.folder}/`))) await store.move(path, `within/${to}/${nameOf(path)}`);
  for (const p of pairOf(r.path)) await store.move(p, `within/${to}/${withState(nameOf(p), 'within')}`).catch(() => {}); // no name sign = fine
  return to;
}
/** Admin ↓: not this name; note and name sign to quiet/. */
export async function declineRename(store, r) {
  for (const p of pairOf(r.path)) await store.move(p, `quiet/${r.folder}/${withState(nameOf(p), 'quiet')}`).catch(() => {});
}
