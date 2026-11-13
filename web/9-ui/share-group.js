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
import { SELF } from '../2-storage/layout.js';
import { makeGroup, renewGroup, invitation, waitingHellos, welcomeToGroup } from '../8-join/group.js';
import { sayHello, answerFor, join } from '../8-join/join.js';
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
    if (sp.spec?.kind !== 'nextcloud' || !groupOf(ctx, sp.entry.label)) continue;
    try {
      for (const helloPath of await waitingHellos(sp.store)) out.push({ n, helloPath, name: /@\(([^)]*)\)/.exec(helloPath)?.[1] ?? '?' });
    } catch { /* not reachable now */ }
  }
  return out;
}

/** Signer: tap on a hello circle = welcome: both links sealed for that device. */
export async function welcome(ctx, { n, helloPath }) {
  const sp = ctx.s.open.get(n);
  const g = groupOf(ctx, sp.entry.label);
  const sharingPoints = [g.read, g.drop].map((x) => ({ label: x.label, path: ctx.s.entries[x.n - 1].path, id: null }));
  await welcomeToGroup({ store: sp.store, helloPath, group: { sharingPoints }, signer: await signerOf(ctx) });
  return ctx.say(`${ctx.t('share')} → ${/@\(([^)]*)\)/.exec(helloPath)?.[1] ?? ''}`);
}

/** Member: a pasted invitation (name, read link, drop link) → one group tile, and hello into the drop. */
export async function bringInvitation(ctx, text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const links = lines.map(readPaste).filter((x) => x?.kind === 'link');
  if (links.length !== 2) return false;
  const label = lines.find((l) => !/^https?:/.test(l)) ?? new URL(links[0].path).host;
  for (const link of links) await ctx.edit({ add: { label, path: link.path, id: newSource() }, marks: link === links[0] ? ['show'] : [] });
  await sayHelloTo(ctx, label);
  return true;
}

async function sayHelloTo(ctx, label) {
  const g = groupOf(ctx, label);
  const drop = g && ctx.s.open.get(g.drop.n)?.store;
  if (!drop) return;
  const keys = await deviceKeys();
  const device = { id: ctx.device, label: ctx.person.label, key: keys.device.public };
  const helloPath = await sayHello({ store: drop, device, deviceKey: keys.device, person: ctx.person, target: label, pickup: keys.pickup.public, nameSign: await ctx.nameSign?.() });
  await joins.set(label, { helloPath, state: 'hello' });
}

/**
 * Member: for every group I said hello to, look for my join in join/ (through the read link); take it
 * and follow renewed links. → Map(label → 'hello' | 'join')
 */
export async function followJoins(ctx) {
  const states = new Map();
  for (const t of ctx.all().filter((x) => x.drop)) {
    const mine = await joins.get(t.label);
    if (!mine) continue;
    states.set(t.label, mine.state);
    const read = ctx.s.open.get(t.n)?.store;
    const drop = ctx.s.open.get(t.drop)?.store;
    if (!read || !drop) continue;
    try {
      const paths = (await read.list('join/')).map((f) => f.path);
      const answer = answerFor(paths, mine.helloPath);
      if (!answer || answer === mine.answer) continue;
      const signers = signerKeys(readDescription(dec.decode(await read.read(SELF))));
      const keys = await deviceKeys();
      const both = { read: (p) => read.read(p), write: (p, b) => drop.write(p, b), list: (p) => read.list(p) }; // read through one link, write through the other
      const r = await join({ store: both, joinPath: answer, pickupKey: keys.pickup.privateKey, signers, device: { id: ctx.device }, deviceKey: keys.device, person: ctx.person });
      await follow(ctx, t, r.sharingPoints);
      await joins.set(t.label, { ...mine, answer, state: 'join' });
      states.set(t.label, 'join');
    } catch { /* not there yet, or not sealed by a signer: wait */ }
  }
  return states;
}

/** Renewed links in a join: replace the group's two entries when the paths changed. */
async function follow(ctx, tile, sharingPoints) {
  const now = [tile.n, tile.drop].map((n) => ctx.s.entries[n - 1].path);
  const next = sharingPoints.map((x) => x.path);
  if (next.every((p) => now.includes(p))) return;
  for (const x of [Math.max(tile.n, tile.drop), Math.min(tile.n, tile.drop)]) await ctx.edit({ remove: x });
  for (const [i, sp] of sharingPoints.entries()) await ctx.edit({ add: { label: tile.label, path: sp.path, id: newSource() }, marks: i === 0 ? ['show'] : [] });
}
