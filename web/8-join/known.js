// known.js — what the door already knows of a person (15.11.): her account folder in within/, and there her first
//            name sign and password gestures, so the admin sees a new device's takes beside the originals (Doppel).
//
// Depends:   1-model/filename, join.js
// Test:      tests/join.test.mjs
// Limits:    matches by the name label: two persons with one label look alike, the first folder wins (the admin
//            decides by eye); one list of within/ per look.

import { readName } from '../1-model/filename.js';
import { withHello, readHello } from './join.js';

const dec = new TextDecoder();

const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const visual = (p) => /\.(mp4|png)$/.test(p);
const timeOf = (p) => readName(nameOf(p))?.time ?? '';
const under = async (store, base) => (await store.list(`${base}/`).catch(() => [])).map((f) => f.path);
const within = (store) => under(store, 'within');

/** The account folder in within/ ('@(Lena)!(n_…)'): by the person's ID first (back from her paper, 15.11.), else by name; or null. */
export async function knownFolder(store, label, id = null) {
  const all = await within(store);
  const p = (id && all.find((x) => x.split('/')[1]?.toLowerCase().endsWith(`!(${id.toLowerCase()})`))) || all.find((x) => x.startsWith(`within/@(${label})!(`));
  return p ? p.slice(7, p.indexOf('/', 7)) : null;
}
/** The account (Nextcloud user) behind a folder: its n_, small. */
export const userOf = (folder) => /!\(([^()]*)\)$/.exec(folder)?.[1]?.toLowerCase() ?? null;

/** Which piece a file shows: '' = name sign · 'password gesture 1…3' (also the older '(hello password 1)'). */
export function pieceOf(path) {
  const n = readName(nameOf(path));
  if (!n) return null;
  if (n.part) return n.part;
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
 * A hello's takes for the admin's eye: name sign first, then its password gestures; if an account of that name is
 * known, each one carries the original of the same piece (pair) → [{ path, pair }], and the folder (or null).
 */
export async function helloTakes(store, hello) {
  const id = await store.read(hello.helloPath).then((b) => readHello(dec.decode(b)).person.id).catch(() => null);
  const folder = await knownFolder(store, hello.name, id);
  const first = folder ? await firstPieces(store, folder) : new Map();
  const takes = (await withHello(store, hello.helloPath)).filter(visual).map((path) => ({ path, pair: first.get(pieceOf(path)) ?? null }));
  return { takes, folder };
}
