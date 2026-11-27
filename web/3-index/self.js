// self.js — a large sharing point builds its own index (26.11., user): from devices and from a server.
//
// Purpose:   the index of a sharing point is its parts (parts.js): index/<folder>.json, one per folder, written
//            into the sharing point itself, so every reader gets a folder with one read. Whoever may write there
//            may build them — a device while it reads (buildIndex with write), or a builder that runs where the
//            sharing point lies: first on the server of the gateway, beside the object storage (gateway/index.mjs).
//            Both write the same file by the same rule; a part is a cache, so two builders never disagree for long.
//              often    only the folders of this month (and of the last, in its first two days): where new Takes land
//              rarely   everything: finds new sharing points in the store, repairs parts of older months
//            A large store holds many sharing points (one per account: <n_…>/Sign/, groups/<name>/): rootsOf finds them
//            by their folders, under() gives each as a store of its own.
//            The builder reads .sign texts only. Sealed groups (e2e/) it cannot read and leaves alone: their index
//            is built by their members' devices. The seals y_ stay in the texts: a builder that lies is found out
//            by every reader (index.js trust()).
// Depends:   parts.js, 2-storage/layout.js; any store with list, read, write, remove
// Test:      tests/tables.test.mjs
// Limits:    often: 6–10 listings per sharing point (one per folder of the month) + one read per new .sign:
//            500 accounts ≈ 5,000 listings ≈ 1–3 min against an object storage, so "often" = every 5 min ·
//            rarely: one listing of the whole store (1,000 names per page: 10⁶ files ≈ 1,000 pages ≈ 2–5 min) +
//            one listing per folder: once a day · a part ≈ 0.25 MB per person and month.

import { readThroughParts } from './parts.js';
import { monthOf } from '../2-storage/layout.js';
import { KINDS } from '../1-model/symbols.js';
import { timeLabel } from '../1-model/time.js';

export const OFTEN_MS = 5 * 60 * 1000, RARELY_MS = 24 * 60 * 60 * 1000;

const ROOT = /^((?:[^/]+\/)*?)(?:(?:take|echo)\/[a-z-]+\/[^/]+\/|chain\/[^/]+\/)[^/]+$/;
const SKIP = /(^|\/)(index|e2e|backup|\.gateway)\//;

/** The sharing points inside a store, found by their folders. paths → ['', 'n_ABC/Sign/', 'groups/Kurs 3/'] */
export function rootsOf(paths) {
  const roots = new Set();
  for (const p of paths) { if (SKIP.test(p)) continue; const m = ROOT.exec(p); if (m) roots.add(m[1]); }
  return [...roots].sort();
}

/** One sharing point inside a larger store: the same calls, paths counted from its root. */
export function under(store, root) {
  if (!root) return store;
  return {
    name: `${store.name ?? 'store'}:${root}`,
    list: async (prefix = '') => (await store.list(root + prefix)).map((f) => ({ ...f, path: f.path.slice(root.length) })),
    read: (path) => store.read(root + path),
    write: (path, bytes) => store.write(root + path, bytes),
    remove: (path) => store.remove(root + path),
  };
}

/** The folders where Takes of a month land: take/<kind>/<month>/, echo/<kind>/<month>/, chain/<month>/. */
export function monthFolders(month) {
  const kinds = Object.entries(KINDS);
  return [
    ...kinds.filter(([, k]) => k.folder === 'take').flatMap(([kind]) => [`take/${kind}/${month}/`, `echo/${kind}/${month}/`]),
    ...kinds.filter(([, k]) => k.folder === 'echo').map(([kind]) => `echo/${kind}/${month}/`),
    `chain/${month}/`,
  ];
}

/** The months that still get new files at this moment (UTC): this one, and the last during its first two days. */
export function openMonths(now = Date.now()) {
  const months = new Set([monthOf(timeLabel(now)), monthOf(timeLabel(now - 2 * 24 * 60 * 60 * 1000))]);
  return [...months];
}

/**
 * Build the parts of every sharing point in a store.
 * roots: the sharing points known from the last whole pass (null = none yet) · whole: read everything.
 * → { roots, folders, read, skipped, whole }   read = .sign opened one by one (0 when nothing was new)
 */
export async function selfBuild(store, { roots = null, whole = false, now = Date.now() } = {}) {
  const all = whole || !roots;
  if (all) roots = rootsOf((await store.list('')).map((f) => f.path));
  const out = { roots, folders: 0, read: 0, skipped: [], whole: all };
  const folders = all ? null : openMonths(now).flatMap(monthFolders);
  for (const root of roots) {
    try {
      const got = await readThroughParts(under(store, root), { write: true, under: folders });
      out.read += got.read;
      out.folders += new Set(got.files.map((f) => f.path.slice(0, f.path.lastIndexOf('/')))).size;
      out.skipped.push(...got.skipped.map((s) => ({ root, ...s })));
    } catch (err) { out.skipped.push({ root, error: String(err.message ?? err) }); }
  }
  return out;
}

/** The builder's clock: what the next pass is. last: { whole: ms of the last whole pass } → 'whole' | 'often' */
export const nextPass = (last, now = Date.now()) => (!last?.whole || now - last.whole >= RARELY_MS ? 'whole' : 'often');

/**
 * The index of a sealed group, built by whoever holds its group key: a member's device, or the admin once a member
 * gave the key (8-join/key-for.js, 27.11., user). The parts are written through the sealed store, so they lie sealed
 * like every other file and every member reads them. backing: the group's store as it lies · key: the group key.
 * → { read, folders, skipped }
 */
export async function sealedBuild(backing, key, { now = () => Date.now() } = {}) {
  const { SealedStore } = await import('../2-storage/sealed-store.js');
  const sealed = await new SealedStore({ store: backing, key, now }).load();
  if (sealed.closed && !sealed.files.size) throw new Error('this key opens no run here'); // every run under another key: build nothing (and write no parts)
  const got = await readThroughParts(sealed, { write: true });
  return { read: got.read, folders: new Set(got.files.map((f) => f.path.slice(0, f.path.lastIndexOf('/')))).size, skipped: got.skipped };
}
