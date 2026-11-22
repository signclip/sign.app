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
// Object storage (22.11., user: "auch für die Gruppen"): the folder lies in the owner's sharing point behind the gateway;
//            instead of two links two door grants (grant.js: access *, r and a), chained to the owner's own grant and
//            sealed by her device key, travel in the invitation. A member's hello back carries her own grant (her access
//            key, ra) for both tiles: renewing the door (new door grants, the old ones revoked) leaves members as they are.
// Limits:    two shares per group on the owner's server; renewing = 2 + n requests (n members) · a drop is open
//            to anyone: per look at most 50 hellos are read (newest first), only sealed ones are shown; the rest
//            is counted as junk (set a small quota on the drop's account so a flood cannot fill more).

import { helloBack, answerFor, readHello } from './join.js';
import { nameOf } from './state.js';
import { readName } from '../1-model/filename.js';
import { checkWitness } from '../1-model/crypto.js';
import { SELF } from '../2-storage/layout.js';
import { ExistsError } from '../2-storage/memory.js';
import { gatewayParts, packGrant } from '../2-storage/spec.js';
import { newSource } from '../1-model/ids.js';
import { makeGrant, chainOf } from './grant.js';

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

/**
 * A group in the object storage: path = the owner's sharing point there (the group folder), grants = her own chain
 * (w). → { gateway: { grants }, read: { chain }, drop: { chain }, sharingPoints } — chain = her chain + the door grant.
 */
export async function gatewayGroup({ path, grants, label, signer, now = Date.now() }) {
  const p = gatewayParts(path), own = chainOf(grants);
  const door = async (rights) => [...own, await makeGrant({ signer, access: '*', prefix: p.prefix, rights, now })];
  const at = `${p.base}/s3/${p.prefix}`;
  return { gateway: { grants: own }, read: { chain: await door('r') }, drop: { chain: await door('a') }, sharingPoints: [{ label, path: `${at}#read`, id: null }, { label, path: `${at}#add`, id: null }] };
}

const linksOf = (label, read, drop) => [{ label, path: read.webdav, id: null }, { label, path: drop.webdav, id: null }];

/**
 * Hello back for one member: the group's two links, sealed for the asking device. store: the group
 * folder as the signer reaches it (own account) · helloPath: the member's hello in hello/.
 */
export async function welcomeToGroup({ store, helloPath, group, signer, now = Date.now() }) {
  await describeJoin(store);
  if (!group.gateway) return helloBack({ store, helloPath, secret: '', sharingPoints: group.sharingPoints, signer, now });
  const ask = readHello(dec.decode(await store.read(helloPath))), p = gatewayParts(group.sharingPoints[0].path);
  const sharingPoints = group.sharingPoints.map((x) => ({ ...x, id: newSource() }));
  const mine = ask.access ? JSON.stringify([...chainOf(group.gateway.grants), await makeGrant({ signer, device: ask.device, access: ask.access, prefix: p.prefix, rights: 'ra', now })]) : null; // her own grant; a device without access key keeps the door's
  const grants = Object.fromEntries(sharingPoints.map((x, i) => [x.id, mine ?? JSON.stringify((i ? group.drop : group.read)?.chain ?? [])]));
  return helloBack({ store, helloPath, secret: JSON.stringify({ grants }), sharingPoints, signer, now });
}

/**
 * Renew both links (a link was passed on, someone has to go): new links, the old ones stopped, and a
 * new sealed join for every member still in. members: hello paths of those who stay. old: the links
 * made before ({ read: { id }, drop: { id } }), or tokens: [token of the group's own links] (16.11.: only those stop;
 * a link given out to view, outside the app, stays as it is).
 * → { group (the new links), joins: [path] }
 */
export async function renewGroup(nc, { folder, label, old = null, tokens = [], store, members, signer, password = undefined, now = Date.now() }) {
  const before = old ? [old.read?.id, old.drop?.id].filter(Boolean) : (await nc.linksOf(folder)).filter((l) => tokens.includes(l.token)).map((l) => l.id); // only the group's own links
  const group = await makeGroup(nc, { folder, label, password });
  for (const id of before) await nc.stopShare(id);
  const joins = [];
  for (const helloPath of members) joins.push(await welcomeToGroup({ store, helloPath, group, signer, now }));
  return { group, joins };
}

/** The invitation a signer hands out (one paste brings the whole group in): name, read link, drop link (object storage: the two tiles with their door grants). */
export const invitation = (label, group) => (group.gateway
  ? [label, ...group.sharingPoints.map((x, i) => `${x.path}=${packGrant((i ? group.drop : group.read).chain)}`)]
  : [label, group.read.webdav, group.drop.webdav]).join('\n');

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
