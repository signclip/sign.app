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
// Limits:    two shares per group on the owner's server; renewing = 2 + n requests (n members).

import { helloBack, answerFor } from './join.js';

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
export function welcomeToGroup({ store, helloPath, group, signer, now = Date.now() }) {
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
export async function waitingHellos(store) {
  const paths = (await store.list()).map((f) => f.path);
  const hellos = paths.filter((p) => p.startsWith('hello/') && /\(hello /.test(p));
  return hellos.filter((h) => !answerFor(paths, h));
}
