// known.js — what the door already knows of a person (15.11.): her account folder in within/, and there her first
//            name sign and password gestures, so the admin sees a new device's takes beside the originals (Doppel).
//
// Depends:   1-model/filename, join.js
// Test:      tests/join.test.mjs
// Limits:    an ID matches only by the ID; the name only offers candidates for the Doppel (16.11.: the admin decides by
//            eye: ↑ = same person as the one above, Doppel squeezed away + ↑ = a new account); one list of within/ per look.

import { readName } from '../1-model/filename.js';
import { withHello, readHello } from './join.js';

const dec = new TextDecoder();

const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const visual = (p) => /\.(mp4|png)$/.test(p);
const timeOf = (p) => readName(nameOf(p))?.time ?? '';
const under = async (store, base) => (await store.list(`${base}/`).catch(() => [])).map((f) => f.path);
const within = (store) => under(store, 'within');

const folders = async (store) => [...new Set((await within(store)).map((x) => x.split('/')[1]).filter(Boolean))];
const hasId = (folder, id) => folder.toLowerCase().endsWith(`!(${id.toLowerCase()})`);

/**
 * The account folder in within/ ('@(Lena)!(n_…)') or null. With an ID only by the ID (back from her paper, 15.11.;
 * 16.11.: two persons with one name stay two accounts). Without an ID by name (older hellos).
 */
export async function knownFolder(store, label, id = null) {
  const all = await folders(store);
  return (id ? all.find((f) => hasId(f, id)) : all.find((f) => f.startsWith(`@(${label})!(`))) ?? null;
}

/** Every account a hello may belong to, for the Doppel (16.11.): her ID first, then each folder of the same name. */
export async function candidates(store, label, id = null) {
  const all = await folders(store);
  const byId = id ? all.filter((f) => hasId(f, id)) : [];
  return [...byId, ...all.filter((f) => f.startsWith(`@(${label})!(`) && !byId.includes(f))];
}
/** The account (Nextcloud user) behind a folder: its n_, small. */
export const userOf = (folder) => /!\(([^()]*)\)$/.exec(folder)?.[1]?.toLowerCase() ?? null;

/** Which piece a file shows: '' = name sign · 'password gesture 1' · '… 2' · '… own' (also the older '(hello password 1)'). */
export function pieceOf(path) {
  const n = readName(nameOf(path));
  if (!n) return null;
  if (n.part) return n.part === 'name sign' ? '' : n.part;
  return n.words[1] === 'password' ? `password gesture ${n.words[2]}` : '';
}

/** All takes of an account folder (name signs, password gestures), oldest first; base: within or quiet. */
export async function accountTakes(store, folder, base = 'within') {
  return (await under(store, base)).filter((p) => p.startsWith(`${base}/${folder}/`) && visual(p)).sort((a, b) => timeOf(a).localeCompare(timeOf(b)) || a.localeCompare(b));
}

/** The first of each piece in an account folder → Map(piece → path). */
export async function firstPieces(store, folder) {
  const out = new Map();
  for (const p of await accountTakes(store, folder)) { const k = pieceOf(p); if (k != null && !out.has(k)) out.set(k, p); }
  return out;
}

/**
 * A hello's takes for the admin's eye: name sign first, then its password gestures; if an account of that ID or name is
 * known, each one carries the original of the same piece (pair) → { takes: [{ path, pair }], folder, candidates }.
 */
export async function helloTakes(store, hello) {
  const id = await store.read(hello.helloPath).then((b) => readHello(dec.decode(b)).person.id).catch(() => null);
  const all = await candidates(store, hello.name, id), folder = all[0] ?? null; // the Doppel starts with the first; ← → the others
  const first = folder ? await firstPieces(store, folder) : new Map();
  const takes = (await withHello(store, hello.helloPath)).filter(visual).map((path) => ({ path, pair: first.get(pieceOf(path)) ?? null }));
  return { takes, folder, candidates: all };
}
