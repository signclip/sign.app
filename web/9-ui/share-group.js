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
// Name sign:  the first take of the onboarding goes with the hello as a take of its own (join.js sayHello, 15.11.).
// Limits:    one hello per device and group; a renew reaches members on their next start.

import { note as debugNote } from './debug.js';
import { WebDavStore } from '../2-storage/webdav.js';
import { webdavUrl } from '../2-storage/nextcloud.js';
import { readFile } from '../1-model/file.js';
import { Nextcloud } from '../2-storage/nextcloud.js';
import { readDescription, signerKeys } from '../2-storage/sharing-point.js';
import { readPaste } from '../2-storage/spec.js';
import { connect } from '../2-storage/connect.js';
import { SELF } from '../2-storage/layout.js';
import { trustedSigners, certificatesIn } from '../8-join/signers.js';
import { makeGroup, renewGroup, invitation, waitingHellos, welcomeToGroup, doorLinks, describeJoin } from '../8-join/group.js';
import { sayHello, answerFor, join, advance, readHello } from '../8-join/join.js';
import { honorRemove } from '../8-join/remove-request.js';
import { welcome as welcomeWithAccount, welcomeDevice, arrive } from '../8-join/welcome.js';
import { knownFolder, userOf } from '../8-join/known.js';
import { isAgain } from '../8-join/door.js';
import { sayRename } from '../8-join/rename.js';
import { QUOTA } from '../8-join/provision.js';
import { readName } from '../1-model/filename.js';
import { newSource } from '../1-model/ids.js';
import { deviceKeys, joins } from './device-keys.js';
import { copy } from './system-share.js';

const dec = new TextDecoder();

/** The group of a label in the list: its read and drop entries (both links), or null. */
export function groupOf(ctx, label) {
  const tiles = (ctx.every ?? ctx.all)().filter((t) => t.label === label);
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

/**
 * Is this device a signer the project's devices trust (21.11., phone test: the join answers of an admin device that was
 * not the one in project.json were refused, and a tap on join did nothing)? Trusted = project.json's signer, or
 * certified by it in the door's join/signer/. No signer named = yes (the description in join/ counts).
 */
export async function trustedHere(ctx, store) {
  const pinned = signerOfText(ctx.doorSigner);
  if (!pinned) return true;
  const trusted = await trustedSigners(pinned, await certificatesIn(store).catch(() => []));
  return trusted[ctx.device] === (await deviceKeys()).device.public;
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
    const tokens = [before.read.n, before.drop.n].map((x) => /\/public\.php\/dav\/files\/([^/]+)/.exec(s.entries[x - 1]?.path ?? '')?.[1]).filter(Boolean); // the group's own links: a link given out to view stays
    ({ group } = await renewGroup(nc, { folder, label, tokens, store: sp.store, members, signer: await signerOf(ctx) }));
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
  const door = ctx.admin ? ctx.adminStore?.() : null; // the admin: the door's folder (found from its links, 15.11.)
  const groupsAt = (label) => (ctx.groups ? new WebDavStore({ base: webdavUrl(ctx.groups.server, ctx.groups.user, label), user: ctx.groups.user, password: ctx.groups.password, name: label }) : null); // Groups (16.11.): its own folders, with rights to move and to honour remove requests
  const look = [...[...ctx.s.open].filter(([, sp]) => (sp.spec?.kind === 'nextcloud' || (ctx.groups && sp.spec?.kind === 'link' && !sp.store?.dropOnly)) && groupOf(ctx, sp.entry.label)).filter(([, sp], i, all) => all.findIndex(([, x]) => x.entry.label === sp.entry.label) === i) // one look per group
      .map(([n, sp]) => [n, sp.spec?.kind === 'link' ? groupsAt(sp.entry.label) : sp.store]),
    ...(door ? [[ctx.s.adminN, door]] : [])];
  for (const [n, store] of look) {
    try {
      for (const helloPath of await waitingHellos(store)) out.push({ n, store, helloPath, name: /@\(([^)]*)\)/.exec(helloPath)?.[1] ?? '?' });
      await groupUpkeep(store);
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
  const markers = paths.filter((q) => first(q) === 'join' && q.endsWith('.chain.sign'));
  for (const label of new Set(markers.map((q) => name(q)?.person).filter(Boolean))) { // her n_: from her hello, or (hello already in within/, join ↑) from her ((join)) marker
    const h = hellos.find((p) => name(p)?.person === label) ?? markers.find((p) => name(p)?.person === label);
    try {
      const text = new TextDecoder().decode(await store.read(h)), head = readFile(text).head;
      const person = markers.includes(h) ? { id: head.id.n, label: head['@'] } : readHello(text).person;
      const chosen = hellos.includes(h) ? choices.get(h) : undefined; // the admin's choice in the single view (16.11.)
      await advance({ store, person, folder: (chosen !== undefined ? chosen : await knownFolder(store, label, person.id)) ?? undefined }); // her account folder: chosen, else by ID
    } catch { /* wait */ }
  }
  for (const p of paths.filter((x) => first(x) === 'quiet').slice(0, 20)) {
    await honorRemove({ store, requestPath: p, authorKeys: await keysOf(name(p)?.person) }).catch(() => {});
  }
}

/**
 * The admin's choice in the single view (16.11.), kept on the admin device by the u_ of the hello: the account folder above
 * that ↑ confirmed (same person), or '' = single view squeezed away, a new account. join ↑ and the upkeep follow it later.
 * Limits: ≤ 500 choices kept, the oldest go first; another admin device does not know them (it falls back to the ID).
 */
const uOfHello = (helloPath) => readName(helloPath.slice(helloPath.lastIndexOf('/') + 1))?.u ?? helloPath;
export const choices = {
  read() { try { return JSON.parse(globalThis.localStorage?.getItem('sign.into') || '{}'); } catch { return {}; } },
  get(helloPath) { const v = this.read()[uOfHello(helloPath)]; return v === undefined ? undefined : v || null; },
  set(helloPath, into) {
    if (into === undefined) return;
    const all = Object.entries({ ...this.read(), [uOfHello(helloPath)]: into ?? '' }).slice(-500);
    try { globalThis.localStorage?.setItem('sign.into', JSON.stringify(Object.fromEntries(all))); } catch { /* private mode */ }
  },
};

/** Signer: tap on a hello circle = welcome: both links sealed for that device. into (admin, 16.11.): the account confirmed in the single view, null = new. */
export async function welcome(ctx, { n, helloPath, store = null }, { into } = {}) {
  const sp = { ...ctx.s.open.get(n), ...(store ? { store } : {}) }; // the door's folder when the admin welcomes (15.11.)
  const g = groupOf(ctx, sp.entry.label);
  const sharingPoints = g ? [g.read, g.drop].map((x) => ({ label: x.label, path: ctx.s.entries[x.n - 1].path, id: null })) : [];
  if (ctx.admin) { // the admin app (14.11.): an own account for the person (QUOTA), its app password sealed into the answer
    if (!(await trustedHere(ctx, sp.store))) { // her device would refuse the answer: no account made for nothing (21.11.)
      debugNote({ method: 'join', where: 'welcome', error: `this device ${ctx.device} is not the project's signer`, ms: 0 });
      return ctx.say(ctx.t('door.notSigner'));
    }
    await describeJoin(sp.store); // the signer's keys readable through the door
    const asker = readHello(new TextDecoder().decode(await sp.store.read(helloPath))).person;
    const known = into !== undefined ? into : await knownFolder(sp.store, asker.label, asker.id); // the admin's choice in the single view (16.11.), else her ID (paper); her account, a new app password
    choices.set(helloPath, into); // join ↑ and the upkeep follow the same choice
    if (known) await welcomeDevice({ door: sp.store, helloPath, admin: ctx.admin, signer: await signerOf(ctx), also: sharingPoints, user: userOf(known), gateway: ctx.gateway });
    else await welcomeWithAccount({ door: sp.store, helloPath, admin: ctx.admin, signer: await signerOf(ctx), also: sharingPoints, quota: ctx.quota ?? QUOTA, atlas: ctx.atlasUser, group: ctx.group, gateway: ctx.gateway })
      .catch(async (e) => { // the account is there already (welcomed once, sent back from join): only a new device app password
        const { person } = readHello(new TextDecoder().decode(await sp.store.read(helloPath)));
        if (!/exist/i.test(e.message)) throw e;
        return welcomeDevice({ door: sp.store, helloPath, admin: ctx.admin, signer: await signerOf(ctx), also: sharingPoints, user: person.id.toLowerCase(), gateway: ctx.gateway });
      });
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
export async function joinProject(ctx, project, { reachable = doorAnswers, memory = joins, report = () => {} } = {}) {
  const doors = (project?.doors ?? [project]).filter((d) => d?.read && d?.drop);
  if (!doors.length) return false; // no door configured: group texts as before
  const label = project.label || 'Sign';
  if (await memory.get(label)) return false; // the hello went out already
  if (!(await ctx.nameSign?.())) { report('join: no name sign yet'); return false; } // the hello carries the name sign: it comes first
  if (ctx.s.entries.some((e) => e.label === label)) return false; // the door is there: it waits as a hello bubble (helloToDoor)
  let door = null, locked = false;
  for (const d of doors) {
    const answer = await reachable(d); // true · 'password' · false (a door may be gone: revoked, moved)
    if (answer) { door = d; locked = answer === 'password'; break; }
  }
  if (!door) { report(`join: door does not answer (${doors.length})`); return false; } // 16.11.: said, no longer silent
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
  } catch (err) {
    if (/: 401\b/.test(String(err.message))) return 'password';
    debugNote({ method: 'door', where: 'read link', error: String(err?.message ?? err).slice(0, 300), ms: 0 }); // 16.11.: why, in sign-debug.txt (CORS in the browser shows here)
    return false;
  }
}

/** A group's drop link, opened for writing: it only takes files in and may refuse to be looked at (403), so it is not probed (14.11.). */
async function dropStoreOf(ctx, n) {
  const sp = ctx.s.open.get(n), entry = ctx.s.entries[n - 1], spec = sp?.spec ?? readPaste(entry?.path ?? '');
  if (spec?.kind !== 'link') return sp?.store ?? null;
  return connect({ ...spec, write: true, drop: true }, { secret: await ctx.keychain.get(entry.id) }).store;
}

const helloOut = new Map(); // label → the hello on its way (17.11.): a second call while it runs gets the same one, never a second hello
function sayHelloTo(ctx, label, opts = {}) {
  const key = `${ctx.person?.id ?? ''} ${label}`;
  if (!helloOut.has(key)) helloOut.set(key, sayHelloOnce(ctx, label, opts).finally(() => helloOut.delete(key)));
  return helloOut.get(key);
}
async function sayHelloOnce(ctx, label, { door = false } = {}) {
  const before = await joins.get(label).catch(() => null);
  if (before?.helloPath && before.state === 'hello') return; // it is out and waits for its answer: said once
  const g = groupOf(ctx, label);
  if (!g) return;
  const open = await dropStoreOf(ctx, g.drop.n);
  if (!open) return;
  const drop = door ? doorLinks(ctx.s.open.get(g.read.n)?.store, open) : open; // a door's drop link is hello/ itself
  const keys = await deviceKeys();
  const device = { id: ctx.device, label: ctx.person.label, key: keys.device.public };
  const helloPath = await sayHello({ store: drop, device, deviceKey: keys.device, person: ctx.person, target: label, pickup: keys.pickup.public, access: keys.access.public, takes: await ctx.helloTakes?.({ door }).catch(() => []) ?? [],
    onFile: (n) => { ctx.s.sent = n; ctx.draw?.(); } }); // name sign (and at the door the password gestures) as takes of their own; a dot per file on the line
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
  for (const t of (ctx.every ?? ctx.all)().filter((x) => x.drop)) { // every(): the door too once it is no tile any more (17.11.: its state was lost and the tile came back)
    const mine = await joins.get(t.label);
    if (!mine) continue;
    states.set(t.label, mine.state);
    if (mine.state === 'join-own') await joins.set(t.label, { ...mine, state: 'within' }); // complete once more, then tiles
    if (mine.state !== 'hello' && !(mine.door && mine.account)) continue; // only a hello still waits for its answer; a joined device looks for a quiet note
    const read = ctx.s.open.get(t.n)?.store;
    const drop = await dropStoreOf(ctx, t.drop);
    if (!read || !drop) continue;
    if (mine.state !== 'hello') { // the admin quieted this device (15.11.): it logs itself out, keys away, the door again
      try {
        const u = readName(mine.helloPath.slice(mine.helloPath.lastIndexOf('/') + 1))?.u;
        const note = u && (await doorLinks(read, drop).list('join/')).some((f) => { const n = readName(f.path.slice(f.path.lastIndexOf('/') + 1)); return n?.words.includes(u) && n.words.includes('quiet'); });
        if (note) { await ctx.logout?.(mine.account); await joins.set(t.label, null); states.set(t.label, 'door'); continue; }
        if (!mine.label) await joins.set(t.label, { ...mine, label: ctx.person.label }); // the name it joined with
        else if (ctx.person.label && mine.label !== ctx.person.label) { // renamed (15.11.): the admin is told, sealed, with the new name sign; the ID stays
          const keys = await deviceKeys();
          await sayRename({ store: doorLinks(read, drop), device: { id: ctx.device, label: ctx.person.label, key: keys.device.public }, deviceKey: keys.device, person: ctx.person, account: mine.account.user, old: mine.label, takes: (await ctx.helloTakes?.({ door: false }).catch(() => []) ?? []).map((x) => ({ ...x, words: ['rename'] })) }); // the name sign as a take of its own
          await joins.set(t.label, { ...mine, label: ctx.person.label });
        }
      } catch { /* not reachable now */ }
      continue;
    }
    try {
      const both = mine.door ? doorLinks(read, drop) // the door: read link = join/, drop link = hello/
        : { read: (p) => read.read(p), write: (p, b) => drop.write(p, b), list: (p) => read.list(p) }; // read through one link, write through the other
      const paths = (await both.list('join/')).map((f) => f.path);
      const answer = answerFor(paths, mine.helloPath);
      if (!answer || answer === mine.answer) continue;
      if (mine.door && !mine.tapped && !isAgain(answer)) { states.set(t.label, 'ready'); continue; } // the answer is there: a tap on join takes it (15.11.)
      if (isAgain(answer)) { await joins.set(t.label, null); if (mine.door) states.set(t.label, 'door'); else states.delete(t.label); continue; } // the admin asks anew (15.11.): the hello bubble breathes again
      const pinned = mine.door ? signerOfText(ctx.doorSigner) : null; // project.json names the signer: only that seal counts
      const signers = pinned ? await trustedSigners(pinned, await certificatesIn(both)) // the anchor and whoever it certified (second device, paper)
        : signerKeys(readDescription(dec.decode(await both.read(mine.door ? `join/${SELF}` : SELF))));
      const keys = await deviceKeys();
      const r = await join({ store: both, joinPath: answer, pickupKey: keys.pickup.privateKey, signers, device: { id: ctx.device }, deviceKey: keys.device, person: ctx.person });
      const own = await takeOwn(ctx, r); // an account came along: my own Nextcloud appears (welcome.arrive)
      if (!mine.door) await follow(ctx, t, (r.sharingPoints ?? []).filter((sp) => sp.label === t.label)); // a group's renewed links; the door stays as it is
      const state = own ? 'join-own' : 'join';
      await joins.set(t.label, { ...mine, answer, state, account: own || undefined });
      states.set(t.label, state);
    } catch (e) { // not there yet, or not sealed by a signer: wait – and say why on the next tap (21.11.)
      const why = String(e?.message ?? e);
      if (mine.tapped) { states.set(t.label, 'ready'); ctx.s.joinWhy = /sealed by a signer/.test(why) ? 'join.notSigner' : 'notReachable'; }
      debugNote({ method: 'join', where: t.label, error: why.slice(0, 200), ms: 0 });
    }
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
  if (!s?.server && !Object.keys(s?.grants ?? {}).length) return false;
  const { entries } = await arrive({ secret: r.secret, sharingPoints: r.sharingPoints ?? [], keychain: ctx.keychain });
  for (const e of entries.filter((x) => ['nextcloud', 'gateway'].includes(x.kind) && !ctx.s.entries.some((y) => y.path === x.path))) { // gateway: own sharing point in the object storage, with its grant (21.11.)
    await ctx.edit({ add: { label: e.label, path: e.path, id: e.id }, marks: ['show', 'write'] });
  }
  return { server: s.server ?? null, user: s.user ?? null }; // kept with the join: a quiet note later logs exactly this account out
}

/** Renewed links in a join: replace the group's two entries when the paths changed. */
async function follow(ctx, tile, sharingPoints) {
  const now = [tile.n, tile.drop].map((n) => ctx.s.entries[n - 1].path);
  const next = sharingPoints.map((x) => x.path);
  if (next.every((p) => now.includes(p))) return;
  for (const x of [Math.max(tile.n, tile.drop), Math.min(tile.n, tile.drop)]) await ctx.edit({ remove: x });
  for (const [i, sp] of sharingPoints.entries()) await ctx.edit({ add: { label: tile.label, path: sp.path, id: newSource() }, marks: i === 0 ? ['show'] : [] });
}

/**
 * A person taken off this device (16.11., ↓ on her small circle): her hello at the project's door goes back – a remove
 * request for the hello and every file of the takes that went with it, sealed by this device (the signer's app honours
 * it by itself: groupUpkeep → honorRemove). → true if a request went out. The person's files on the device stay.
 */
export async function withdrawHello(ctx, who, { own, takeFiles, askRemove }) {
  const label = ctx.project?.label || 'Sign';
  const mine = await joins.getFor(label, who.id).catch(() => null);
  if (!mine?.helloPath || mine.state === 'within') return false; // nothing waiting at the door (in within/ she is an account: the admin decides)
  const keyOf = (k) => globalThis.signPersons?.keyOf?.(k, who.id) ?? k;
  let visuals = [];
  try { visuals = [localStorage.getItem(keyOf('sign.nameSign')), ...JSON.parse(localStorage.getItem(keyOf('sign.passwords')) || '[]')].filter(Boolean); } catch { /* none */ }
  const us = new Set([readName(mine.helloPath.slice(mine.helloPath.lastIndexOf('/') + 1))?.u]);
  for (const v of visuals) for (const p of await takeFiles(own, v).catch(() => [v])) us.add(readName(p.slice(p.lastIndexOf('/') + 1))?.u);
  const strands = [...us].filter(Boolean).map((u, i) => ({ name: `chain.${i + 1}`, id: { q: ctx.device, n: who.id, u } }));
  const d = (ctx.project?.doors ?? [ctx.project]).find((x) => x?.drop);
  if (!d || !strands.length) return false;
  const drop = connect({ ...readPaste(d.drop), write: true, drop: true }, {}).store;
  const keys = await deviceKeys();
  await askRemove({ store: doorLinks(drop, drop), strands, device: ctx.device, person: { id: who.id, label: who.label }, deviceKey: keys.device });
  await joins.setFor(label, who.id, null);
  return true;
}
