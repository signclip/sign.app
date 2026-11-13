// group.js — a group = one folder somewhere (a teacher's Sciebo, any Nextcloud) with two links.
//
// Purpose:   decided 13.11.: groups are no accounts on our Nextcloud. The person who owns the folder is
//            its signer and makes two public links once:
//              read link   everyone sees the group in Similar; join/ is read through it
//              drop link   "File drop": takes go in, nobody sees what is there; hello lands here too
//            Members get both links sealed in their join (hello back). Nobody is added or removed by
//            hand: the links are not personal. When a link is no longer safe, the signer renews both with
//            one tap: new links, old ones stopped, a new sealed join for every member still in.
// Depends:   2-storage/nextcloud.js (readOnlyLink, dropLink, stopShare), join.js (helloBack)
// Test:      tests/join.test.mjs
// Door:      the project's door (project.json) splits the links (decided 13.11.): the read link shows only the
//            folder join/ (with a copy of the description, for the signer's keys), the drop link takes only
//            into hello/. So nobody reads the hellos and name signs through the door. doorLinks() maps both.
// Limits:    two shares per group on the owner's server; renewing = 2 + n requests (n members) · a drop is open
//            to anyone: per look at most 50 hellos are read (newest first), only sealed ones are shown; the rest
//            is counted as junk (set a small quota on the drop's account so a flood cannot fill more).

import { helloBack, answerFor, readHello } from './join.js';
import { nameOf } from './state.js';
import { readName } from '../1-model/filename.js';
import { checkWitness } from '../1-model/crypto.js';
import { SELF } from '../2-storage/layout.js';
import { ExistsError } from '../2-storage/memory.js';

const dec = new TextDecoder();
/** Hellos read per look into a drop: the newest; a flood of junk costs at most this many reads. */
export const MAX_HELLOS = 50;

/**
 * Make the two links of a group folder. nc: the owner's Nextcloud · folder: path in the owner's tree ·
 * label: name of the group. → { read: { id, webdav }, drop: { id, webdav }, sharingPoints }
 * sharingPoints: the two definitions a member gets (same name = one tile in the app).
 */
export async function makeGroup(nc, { folder, label, password = undefined }) {
  const read = await nc.readOnlyLink({ path: folder, password });
  const drop = await nc.dropLink({ path: folder, password });
  return { read, drop, sharingPoints: linksOf(label, read, drop) };
}

const linksOf = (label, read, drop) => [{ label, path: read.webdav, id: null }, { label, path: drop.webdav, id: null }];

/**
 * Hello back for one member: the group's two links, sealed for the asking device. store: the group
 * folder as the signer reaches it (own account) · helloPath: the member's hello in hello/.
 */
export async function welcomeToGroup({ store, helloPath, group, signer, now = Date.now() }) {
  await describeJoin(store);
  return helloBack({ store, helloPath, secret: '', sharingPoints: group.sharingPoints, signer, now });
}

/**
 * Renew both links (a link was passed on, someone has to go): new links, the old ones stopped, and a
 * new sealed join for every member still in. members: hello paths of those who stay. old: the links
 * made before ({ read: { id }, drop: { id } }), or null = stop every public link the folder has.
 * → { group (the new links), joins: [path] }
 */
export async function renewGroup(nc, { folder, label, old = null, store, members, signer, password = undefined, now = Date.now() }) {
  const before = old ? [old.read?.id, old.drop?.id].filter(Boolean) : (await nc.linksOf(folder)).map((l) => l.id); // no ids kept: every public link of the folder
  const group = await makeGroup(nc, { folder, label, password });
  for (const id of before) await nc.stopShare(id);
  const joins = [];
  for (const helloPath of members) joins.push(await welcomeToGroup({ store, helloPath, group, signer, now }));
  return { group, joins };
}

/** The invitation a signer hands out (one paste brings the whole group in): name, read link, drop link. */
export const invitation = (label, group) => [label, group.read.webdav, group.drop.webdav].join('\n');

/**
 * Hellos in the group folder still without an answer in join/. store: the folder as the signer reaches
 * it. → [helloPath]
 */
export async function waitingHellos(store, { max = MAX_HELLOS } = {}) {
  const paths = (await store.list()).map((f) => f.path);
  const named = paths.filter((p) => p.startsWith('hello/') && p.endsWith('.chain.sign') && /\(hello /.test(p) && !answerFor(paths, p));
  // the drop is open to anyone (spam): only the newest few are read, and only a hello sealed by the device key
  // it names counts; everything else is only counted (junk), never shown
  const newest = named.sort((a, b) => (readName(nameOf(b))?.time ?? '').localeCompare(readName(nameOf(a))?.time ?? '')).slice(0, max);
  const out = [];
  for (const h of newest) if (await sealedHello(dec.decode(await store.read(h)))) out.push(h);
  Object.defineProperty(out, 'junk', { value: named.length - out.length }); // named like a hello, but not one (or beyond the newest 50)
  return out;
}

/** A hello counts only when it is sealed (y_) by the device key it carries (it can only come from that device). */
export async function sealedHello(text) {
  try { return await checkWitness(readHello(text).device.key, text); } catch { return false; }
}

/** A copy of the folder's description in join/: a door's read link shows only join/, and the signer's keys are in it. */
export async function describeJoin(store) {
  let text;
  try { text = await store.read(SELF); } catch { return; } // a folder without description: nothing to copy
  try { await store.write(`join/${SELF}`, text); } catch (err) { if (!(err instanceof ExistsError)) throw err; }
}

/**
 * A door's two links as one store with the usual paths: join/x is read at the root of the read link, hello/x is
 * written at the root of the drop link, the description is the copy in join/.
 */
export function doorLinks(read, drop) {
  const strip = (p, part) => (p.startsWith(part) ? p.slice(part.length) : p);
  return {
    list: async (p = '') => (p.startsWith('join/') ? (await read.list(strip(p, 'join/'))).map((f) => ({ ...f, path: `join/${f.path}` })) : read.list(p)),
    read: (p) => read.read(strip(p, 'join/')),
    write: (p, bytes) => drop.write(strip(p, 'hello/'), bytes),
  };
}
