// share-group.js — groups in the sharing menu: a folder with a read link and a drop link (8-join/group.js).
//
// Purpose:   signer: ↑ on the tile of my own Nextcloud folder = it becomes a group (read link + drop link);
//                    ↑ again = new links (the old stop), a new sealed join for everyone who joined.
//                    The invitation (name, read link, drop link) goes onto the clipboard to send.
//                    Each hello in the folder shows as a circle; a tap welcomes (sealed join with both links).
//            member: one paste of the invitation brings the group in as one tile and says hello into the
//                    drop (my keys, my name); when the signer's join is there, the app takes it and follows
//                    renewed links by itself. The circles beside the tile show where it stands:
//                    one = hello sent · two = joined (the sharing icon growing).
// Depends:   browser; 2-storage (nextcloud, sharing-point, spec), 8-join (group, join), 9-ui (device-keys,
//            system-share)
// Test:      the parts in tests/join.test.mjs; this needs a browser.
// Name sign:  the first take of the onboarding goes into the drop beside the hello (join.js nameSignOf).
// Limits:    one hello per device and group; a renew reaches members on their next start.

import { Nextcloud } from '../2-storage/nextcloud.js';
import { readDescription, signerKeys } from '../2-storage/sharing-point.js';
import { readPaste } from '../2-storage/spec.js';
import { connect } from '../2-storage/connect.js';
import { SELF } from '../2-storage/layout.js';
import { makeGroup, renewGroup, invitation, waitingHellos, welcomeToGroup, doorLinks, describeJoin } from '../8-join/group.js';
import { sayHello, answerFor, join, advance, readHello } from '../8-join/join.js';
import { honorRemove } from '../8-join/remove-request.js';
import { welcome as welcomeWithAccount, arrive } from '../8-join/welcome.js';
import { QUOTA } from '../8-join/provision.js';
import { readName } from '../1-model/filename.js';
import { newSource } from '../1-model/ids.js';
import { deviceKeys, joins } from './device-keys.js';
import { copy } from './system-share.js';

const dec = new TextDecoder();

/** The group of a label in the list: its read and drop entries (both links), or null. */
function groupOf(ctx, label) {
  const tiles = ctx.all().filter((t) => t.label === label);
  const read = tiles.find((t) => t.drop);
  return read ? { read, drop: ctx.tileOf(read.drop) } : null;
}

const signerOf = async (ctx) => {
  const keys = await deviceKeys();
  return { device: ctx.device, person: ctx.person, deviceKey: keys.device };
};

/** My check key as it stands in a sharing-point.sign: "q_… z_…" (public; ↑ on the own tile copies it for project.json). */
export async function checkKey(ctx) {
  return `${ctx.device} z_${(await deviceKeys()).device.public}`;
}

/** "q_… z_…" (project.json signer) → { q_…: key } as signerKeys gives it, or null. */
export function signerOfText(text) {
  const m = /^(q_\S+)\s+z_(\S+)$/.exec(String(text ?? '').trim());
  return m ? { [m[1]]: m[2] } : null;
}

/** Signer: ↑ on my own Nextcloud folder → make the group, or renew its links. */
export async function makeOrRenew(ctx, n) {
  const { s, keychain, say, t, edit } = ctx;
  const sp = s.open.get(n);
  const label = sp.entry.label;
  const nc = new Nextcloud({ server: sp.spec.server, user: sp.spec.user, password: await keychain.get(sp.entry.id) });
  const folder = sp.spec.folder;
  const before = groupOf(ctx, label);
  let group;
  if (before) { // renew: new links, the old stop, a new join for everyone who joined
    const paths = (await sp.store.list()).map((f) => f.path);
    const members = paths.filter((p) => p.startsWith('hello/') && p.endsWith('.chain.sign') && answerFor(paths, p));
    ({ group } = await renewGroup(nc, { folder, label, store: sp.store, members, signer: await signerOf(ctx) }));
    for (const x of [Math.max(before.read.n, before.drop.n), Math.min(before.read.n, before.drop.n)]) await edit({ remove: x });
  } else {
    group = await makeGroup(nc, { folder, label });
  }
  for (const link of group.sharingPoints) await edit({ add: { ...link, id: newSource() }, marks: link === group.sharingPoints[0] ? ['show'] : [] });
  await copy(invitation(label, group));
  return say(t('copied'));
}

/** Signer: hellos waiting in my group folders → [{ n, helloPath, name }]. */
export async function hellosToWelcome(ctx) {
  const out = [];
  for (const [n, sp] of ctx.s.open) {
    const adminFolder = ctx.admin && sp.spec?.server === ctx.admin.server && sp.spec?.user === ctx.admin.user; // the admin's own folders: the door lives there
    if (sp.spec?.kind !== 'nextcloud' || !(groupOf(ctx, sp.entry.label) || adminFolder)) continue;
    try {
      for (const helloPath of await waitingHellos(sp.store)) out.push({ n, helloPath, name: /@\(([^)]*)\)/.exec(helloPath)?.[1] ?? '?' });
      await groupUpkeep(sp.store);
    } catch { /* not reachable now */ }
  }
  return out;
}

/**
 * Signer, on every look (14.11.): whoever joined moves to within/ (advance: hello, marker, answer); a remove request
 * from the author (sealed by a device of her hello) is honoured by itself, anything else waits in hello/.
 * Limits: one list of hello/ + per person one more; requests ≤ 20 per look.
 */
export async function groupUpkeep(store) {
  const paths = (await store.list('hello/')).map((f) => f.path);
  const name = (p) => readName(p.slice(p.lastIndexOf('/') + 1));
  const hellos = paths.filter((p) => /\(hello /.test(p) && p.endsWith('.chain.sign'));
  const done = (await store.list('within/')).map((f) => f.path); // hellos already moved there still name her devices
  const keysOf = async (label) => { // the device keys this person showed in her hellos
    const out = {};
    for (const p of [...hellos, ...done].filter((x) => name(x)?.person === label && x.endsWith('.chain.sign'))) {
      try { const h = readHello(new TextDecoder().decode(await store.read(p))); out[h.device.id] = h.device.key; } catch { /* not a hello */ }
    }
    return out;
  };
  const first = (p) => name(p)?.words?.[0];
  const joined = new Set(paths.filter((q) => first(q) === 'join').map((q) => name(q)?.person).filter((l) => hellos.some((p) => name(p)?.person === l)));
  for (const label of joined) { // her n_ comes from her hello (it names the folder within/@(label)!(n_))
    const h = hellos.find((p) => name(p)?.person === label);
    try { const { person } = readHello(new TextDecoder().decode(await store.read(h))); await advance({ store, person }); } catch { /* wait */ }
  }
  for (const p of paths.filter((x) => first(x) === 'quiet').slice(0, 20)) {
    await honorRemove({ store, requestPath: p, authorKeys: await keysOf(name(p)?.person) }).catch(() => {});
  }
}

/** Signer: tap on a hello circle = welcome: both links sealed for that device. */
export async function welcome(ctx, { n, helloPath }) {
  const sp = ctx.s.open.get(n);
  const g = groupOf(ctx, sp.entry.label);
  const sharingPoints = g ? [g.read, g.drop].map((x) => ({ label: x.label, path: ctx.s.entries[x.n - 1].path, id: null })) : [];
  if (ctx.admin) { // the admin app (14.11.): an own account for the person (QUOTA), its app password sealed into the answer
    await describeJoin(sp.store); // the signer's keys readable through the door
    await welcomeWithAccount({ door: sp.store, helloPath, admin: ctx.admin, signer: await signerOf(ctx), also: sharingPoints, quota: ctx.quota ?? QUOTA });
  } else if (sharingPoints.length) {
    await welcomeToGroup({ store: sp.store, helloPath, group: { sharingPoints }, signer: await signerOf(ctx) });
  } else return null;
  return ctx.say(`${ctx.t('share')} → ${/@\(([^)]*)\)/.exec(helloPath)?.[1] ?? ''}`);
}

/** Member: a pasted invitation (name, read link, drop link) → one group tile, and hello into the drop. */
export async function bringInvitation(ctx, text, secret = null) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const links = lines.map(readPaste).filter((x) => x?.kind === 'link');
  if (links.length !== 2) return false;
  const label = lines.find((l) => !/^https?:/.test(l)) ?? new URL(links[0].path).host;
  for (const link of links) {
    const id = newSource();
    if (secret) await ctx.keychain.set(id, secret); // one password for both links, pasted with them
    await ctx.edit({ add: { label, path: link.path, id }, marks: link === links[0] ? ['show'] : [] });
  }
  await sayHelloTo(ctx, label);
  return true;
}

/**
 * The first group of the onboarding is the project's own Nextcloud (decided 13.11.): the app knows its door
 * (project.json: read link + drop link), so no group text is needed. As soon as the name sign exists, the door
 * comes into the list and the hello goes out; the sharing icon grows; with hello back the own Nextcloud folder
 * appears. → true when it was started now.
 */
export async function joinProject(ctx, project, { reachable = doorAnswers, memory = joins } = {}) {
  const doors = (project?.doors ?? [project]).filter((d) => d?.read && d?.drop);
  if (!doors.length) return false; // no door configured: group texts as before
  const label = project.label || 'Sign';
  if (await memory.get(label)) return false; // the hello went out already
  if (!(await ctx.nameSign?.())) return false; // the hello carries the name sign: it comes first
  if (ctx.s.entries.some((e) => e.label === label)) return false; // the door is there: it waits as a hello bubble (helloToDoor)
  let door = null, locked = false;
  for (const d of doors) {
    const answer = await reachable(d); // true · 'password' · false (a door may be gone: revoked, moved)
    if (answer) { door = d; locked = answer === 'password'; break; }
  }
  if (!door) return false;
  const path = (url) => readPaste(url)?.path ?? url; // /s/<token> → its WebDAV path
  const readId = newSource(), dropId = newSource();
  await ctx.edit({ add: { label, path: path(door.read), id: readId }, marks: ['show'] });
  await ctx.edit({ add: { label, path: path(door.drop), id: dropId } });
  if (locked) { // a password given privately: paste it on +, then the hello goes out (share-add.js waitSecret)
    ctx.s.waitSecret = readId;
    ctx.s.waitSecretAlso = [dropId]; // both links of the door open with the same password
    ctx.say(ctx.t('menu.secret'));
    return false;
  }
  return true; // the door came in: drawn as a hello bubble; the own tile dragged onto it says hello (helloToDoor)
}

/** Onboarding (14.11.): the own tile dragged onto the door's hello bubble = hello, with the name sign. */
export async function helloToDoor(ctx, label) {
  await sayHelloTo(ctx, label, { door: true });
  return joins.get(label);
}

/** Does a door answer? → true · 'password' (it asks for one: 401) · false (revoked or moved). */
async function doorAnswers(door) {
  try {
    const { store } = connect(readPaste(door.read), {});
    await store.list('');
    return true;
  } catch (err) { return /: 401\b/.test(String(err.message)) ? 'password' : false; }
}

async function sayHelloTo(ctx, label, { door = false } = {}) {
  const g = groupOf(ctx, label);
  const open = g && ctx.s.open.get(g.drop.n)?.store;
  if (!open) return;
  const drop = door ? doorLinks(ctx.s.open.get(g.read.n)?.store, open) : open; // a door's drop link is hello/ itself
  const keys = await deviceKeys();
  const device = { id: ctx.device, label: ctx.person.label, key: keys.device.public };
  const helloPath = await sayHello({ store: drop, device, deviceKey: keys.device, person: ctx.person, target: label, pickup: keys.pickup.public, nameSign: await ctx.nameSign?.() });
  await joins.set(label, { helloPath, state: 'hello', door });
}

/**
 * Member: for every group I said hello to, look for my join in join/ (through the read link); take it
 * and follow renewed links. → Map(label → 'door' | 'hello' | 'join' | 'join-own' | 'within'), drawn as the growing
 * sharing icon (view/points.js): join-own = my own sharing point came along; shown complete once, then 'within'.
 */
export async function followJoins(ctx) {
  const states = new Map();
  const door = ctx.doorLabel && ctx.s.entries.some((e) => e.label === ctx.doorLabel);
  if (door && !(await joins.get(ctx.doorLabel))) states.set(ctx.doorLabel, 'door'); // in the list, no hello yet: a bubble to drag onto
  for (const t of ctx.all().filter((x) => x.drop)) {
    const mine = await joins.get(t.label);
    if (!mine) continue;
    states.set(t.label, mine.state);
    if (mine.state === 'join-own') await joins.set(t.label, { ...mine, state: 'within' }); // complete once more, then tiles
    if (mine.state !== 'hello') continue; // only a hello still waits for its answer
    const read = ctx.s.open.get(t.n)?.store;
    const drop = ctx.s.open.get(t.drop)?.store;
    if (!read || !drop) continue;
    try {
      const both = mine.door ? doorLinks(read, drop) // the door: read link = join/, drop link = hello/
        : { read: (p) => read.read(p), write: (p, b) => drop.write(p, b), list: (p) => read.list(p) }; // read through one link, write through the other
      const paths = (await both.list('join/')).map((f) => f.path);
      const answer = answerFor(paths, mine.helloPath);
      if (!answer || answer === mine.answer) continue;
      const pinned = mine.door ? signerOfText(ctx.doorSigner) : null; // project.json names the signer: only that seal counts
      const signers = pinned ?? signerKeys(readDescription(dec.decode(await both.read(mine.door ? `join/${SELF}` : SELF))));
      const keys = await deviceKeys();
      const r = await join({ store: both, joinPath: answer, pickupKey: keys.pickup.privateKey, signers, device: { id: ctx.device }, deviceKey: keys.device, person: ctx.person });
      const own = await takeOwn(ctx, r); // an account came along: my own Nextcloud appears (welcome.arrive)
      if (!mine.door) await follow(ctx, t, (r.sharingPoints ?? []).filter((sp) => sp.label === t.label)); // a group's renewed links; the door stays as it is
      const state = own ? 'join-own' : 'join';
      await joins.set(t.label, { ...mine, answer, state });
      states.set(t.label, state);
    } catch { /* not there yet, or not sealed by a signer: wait */ }
  }
  return states;
}

/**
 * The answer carried an account (secret with server, user, app password): the app password is swapped at once,
 * kept in the keychain, and my own Nextcloud comes into the list as a writable sharing point. → true if so.
 */
async function takeOwn(ctx, r) {
  let s = null;
  try { s = r.secret ? JSON.parse(r.secret) : null; } catch { return false; }
  if (!s?.server) return false;
  const { entries } = await arrive({ secret: r.secret, sharingPoints: r.sharingPoints ?? [], keychain: ctx.keychain });
  for (const e of entries.filter((x) => x.kind === 'nextcloud' && !ctx.s.entries.some((y) => y.path === x.path))) {
    await ctx.edit({ add: { label: e.label, path: e.path, id: e.id }, marks: ['show', 'write'] });
  }
  return true;
}

/** Renewed links in a join: replace the group's two entries when the paths changed. */
async function follow(ctx, tile, sharingPoints) {
  const now = [tile.n, tile.drop].map((n) => ctx.s.entries[n - 1].path);
  const next = sharingPoints.map((x) => x.path);
  if (next.every((p) => now.includes(p))) return;
  for (const x of [Math.max(tile.n, tile.drop), Math.min(tile.n, tile.drop)]) await ctx.edit({ remove: x });
  for (const [i, sp] of sharingPoints.entries()) await ctx.edit({ add: { label: tile.label, path: sp.path, id: newSource() }, marks: i === 0 ? ['show'] : [] });
}
