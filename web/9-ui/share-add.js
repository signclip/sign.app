// share-add.js — bring a sharing point in (paste, folder, one-click login) and give one out read-only.
//
// Purpose:   in:  ← paste: a link, a WebDAV address, a Nextcloud or Sciebo server (one click, then
//                  choose: ganzes Konto or one folder, step by step into subfolders), a password
//                  when one was asked for (straight into the keychain, never shown) ·
//                  Ordner wählen: a folder or a disk (folders.js), read and write.
//            out: a Nextcloud folder of mine, whole or only the strands that go there (its mini arcs), read-only:
//                  WebDAV-Adresse kopieren (to bring it in elsewhere; one per folder) · an Adresse (paste a
//                  cloud id: Sciebo, another Nextcloud; in the PWA too, via WebAppPassword). iCloud, Google Drive, OneDrive have no
//                  read-only share an app can make: there the way is a backup into their folder.
// Depends:   browser; 2-storage (spec, login-flow, nextcloud, routes); folders.js, system-share.js
// Test:      needs a browser; readPaste and give are tested (list.test.mjs, connect.test.mjs).
//            waiting shares: native app = one tap accepts in the background; PWA = one tap opens the own
//            Nextcloud to accept there. After giving to a cloud id: one tap opens the other side's page.
// Limits:    the browser blocks the one-click login and the pending-share API (CORS); a link per kind.

import { readPaste } from '../2-storage/spec.js';
import { startLogin, waitLogin } from '../2-storage/login-flow.js';
import { Nextcloud, webdavUrl } from '../2-storage/nextcloud.js';
import { giveStrands, giveAll } from '../2-storage/routes.js';
import { connect, takeIn, acceptPage, pendingPage, myCloudId, cloudIdParts } from '../2-storage/connect.js';
import { newSource } from '../1-model/ids.js';
import { timeLabel } from '../1-model/filename.js';
import { describeNew } from '../2-storage/sharing-points.js';
import { deviceKeys } from './device-keys.js';

/**
 * A folder brought in that is not a sharing point yet becomes one: its sharing-point.sign, this device as signer,
 * sealed (the tile then shows the filled seal). Folders others described stay as they are (their seal is checked).
 */
export async function makeSharingPoint(ctx, id) {
  const sp = [...ctx.s.open.values()].find((x) => x.entry.id === id);
  if (!sp?.store || sp.description) return false;
  const { device: deviceKey } = await deviceKeys();
  const made = await describeNew(sp.store, { id, label: sp.entry.label, path: sp.entry.path, time: timeLabel(Date.now()),
    signer: { device: ctx.device, label: ctx.person.label, deviceKey } }).catch(() => null);
  if (made) { sp.description = made; ctx.draw(); }
  return Boolean(made);
}
import { folders, canPick } from './folders.js';
import { copy } from './system-share.js';
import { bringInvitation } from './share-group.js';

async function clipboard() {
  const cap = globalThis.Capacitor?.Plugins?.Clipboard;
  return cap ? (await cap.read()).value : navigator.clipboard.readText();
}

/**
 * The one + tile: whatever brings a sharing point in. A link, an address, a server, a cloud id, a group text or an
 * awaited password on the clipboard → bringIn; nothing usable there → choose a folder or disk (pickFolder).
 */
export async function addNew(ctx) {
  let text = '';
  try { text = (await clipboard()) ?? ''; } catch { /* no permission: then a folder */ }
  if (ctx.s.waitSecret || ctx.s.giveTo || text.includes('\n') || readPaste(text)) return bringIn(ctx);
  if (canPick()) return pickFolder(ctx);
  return ctx.say(ctx.t('menu.paste'));
}

/** ← paste. ctx: { s, keychain, edit, load, say, t } (share-mount.js). */
export async function bringIn(ctx) {
  const { s, keychain, edit, say, t } = ctx;
  let text = '';
  try { text = await clipboard(); } catch { return say(t('notReachable')); }
  if (text.includes('\n') && await bringInvitation(ctx, text)) return say(t('share')); // a group invitation: name, read link, drop link
  if (s.waitSecret) { // the password a sharing point asked for (given privately): straight into the keychain, never shown
    for (const id of [s.waitSecret, ...(s.waitSecretAlso ?? [])]) await keychain.set(id, text.trim());
    s.waitSecret = null;
    s.waitSecretAlso = null;
    await ctx.load(); // a door waiting for its password: the hello goes out now (joinProject)
    return say(t('copied'));
  }
  if (s.giveTo) return giveOut(ctx, s.giveTo, text.trim());
  const what = readPaste(text);
  if (!what) return say(t('menu.paste'));
  if (what.kind === 'cloud') { // a cloud id brought in: its shares to me are taken in by themselves
    const host = what.cloudId.slice(what.cloudId.lastIndexOf('@') + 1);
    return edit({ add: { label: host, path: `cloud:${what.cloudId}`, id: newSource() } });
  }
  const id = newSource();
  if (what.kind === 'login') {
    try {
      const { login, poll } = await startLogin(what.server);
      globalThis.open?.(login, '_blank');
      const got = await waitLogin(poll);
      await keychain.set(id, got.appPassword);
      const account = { kind: 'nextcloud', server: got.server, user: got.user, folder: '' };
      const { store } = connect(account, { secret: got.appPassword });
      s.browse = { id, server: got.server, user: got.user, store, at: '', inside: await store.folders('') };
      return say(t('menu.account'));
    } catch { return say(t('menu.native')); } // the browser is blocked (CORS); the app is not
  }
  await edit({ add: { path: what.path, id }, marks: ['show'] });
  const sp = [...s.open.values()].find((x) => x.entry.id === id);
  try { await sp.store.list('chain/'); } catch { s.waitSecret = id; return say(t('menu.secret')); }
  await makeSharingPoint(ctx, id); // a new, writable folder becomes a sharing point (sealed by this device)
}

/** Ordner wählen: a folder or disk, read and write, brought into Similar. */
export async function pickFolder(ctx) {
  if (!canPick()) return ctx.say(ctx.t('menu.native'));
  const id = newSource();
  try {
    const { name } = await folders.pick(id);
    await ctx.edit({ add: { label: name, path: `folder:${name}`, id }, marks: ['show', 'write'] });
    await makeSharingPoint(ctx, id);
  } catch { /* the person closed the picker */ }
}

/**
 * Give tile n out read-only: how = 'link' → links on the clipboard · 'address' → wait for a paste ·
 * a cloud id (from bringIn) → shared to it. Only the kinds of the tile (all when none chosen).
 */
export async function giveOut(ctx, n, how) {
  const { s, keychain, say, t } = ctx;
  if (how === 'address') { s.giveTo = n; return say(t('menu.paste')); }
  s.giveTo = null;
  const sp = s.open.get(n);
  if (sp?.spec?.kind === 'link') { // a link (a group's read link): it is itself the way in
    await copy(sp.entry.path);
    return say(t('copied'));
  }
  try {
    const nc = new Nextcloud({ server: sp.spec.server, user: sp.spec.user, password: await keychain.get(sp.entry.id) });
    const tileKinds = ctx.tileOf(n)?.kinds ?? [];
    const kinds = tileKinds.length && tileKinds.length < 4 ? tileKinds : []; // the strands that go there, else the whole folder
    const to = how === 'link' ? 'link' : readPaste(how)?.cloudId;
    if (!to) return say(t('menu.paste'));
    const root = sp.spec.folder;
    const given = kinds.length ? await giveStrands(nc, { root, kinds, to }) : await giveAll(nc, { root, to });
    if (to === 'link') await copy(given.map((g) => g.webdav).join('\n')); // WebDAV addresses, read-only, no account
    else s.acceptThere = { url: acceptPage(to), label: new URL(acceptPage(to)).host }; // one tap → their page to accept
    say(t(to === 'link' ? 'copied' : 'share'));
  } catch { say(t('notReachable')); } // WebAppPassword missing or the address not entered there
}

/** After a login: chips to choose what to bring in. → [{ label, go }] · ganzes Konto / diesen Ordner, then subfolders. */
export function browseChips(ctx) {
  const { s, edit, t } = ctx, b = s.browse;
  const nameOf = (folder) => folder.replace(/\/$/, '').split('/').pop();
  const take = (at) => {
    s.browse = null;
    const folder = at.replace(/\/$/, '');
    return edit({ add: { label: at ? nameOf(at) : b.user, path: webdavUrl(b.server, b.user, folder), id: b.id }, marks: ['show', 'write'] });
  };
  const into = async (at) => { b.at = at; b.inside = await b.store.folders(at); ctx.draw(); };
  return [
    { label: t(b.at ? 'menu.here' : 'menu.account'), go: () => take(b.at) },
    ...(b.at ? [{ label: '↑', go: () => into(b.at.replace(/[^/]+\/$/, '')) }] : []),
    ...b.inside.map((f) => ({ label: nameOf(f), go: () => into(f) })),
  ];
}

/** Open a page outside the app: the system browser in the native app, a new tab in the PWA. */
export async function openPage(url) {
  const browser = globalThis.Capacitor?.Plugins?.Browser;
  if (browser) return browser.open({ url });
  return globalThis.open?.(url, '_blank');
}

/**
 * Shares waiting for me in my own Nextcloud (sent from another Nextcloud or Sciebo).
 * → [{ n (my Nextcloud tile), share }] · empty when nothing waits or the browser is blocked (CORS).
 */
export async function waitingShares(ctx) {
  const { s, keychain } = ctx;
  const out = [];
  for (const [n, sp] of s.open) {
    if (sp.spec?.kind !== 'nextcloud' || sp.store?.readOnly) continue;
    try {
      const nc = new Nextcloud({ server: sp.spec.server, user: sp.spec.user, password: await keychain.get(sp.entry.id) });
      for (const share of await nc.pending()) out.push({ n, share });
    } catch { /* the PWA cannot ask (CORS); the native app can */ }
  }
  return out;
}

/**
 * Tap on a waiting share: native app = accept it in the background and bring the folder in as a
 * sharing point; PWA = open my own Nextcloud's page to accept it there.
 */
export async function acceptWaiting(ctx, { n, share }) {
  const { s, keychain, edit, say, t } = ctx;
  const sp = s.open.get(n);
  const secret = await keychain.get(sp.entry.id);
  const nc = new Nextcloud({ server: sp.spec.server, user: sp.spec.user, password: secret });
  try {
    const entry = await takeIn(nc, share, { newId: newSource });
    await keychain.set(entry.id, secret); // reached with the same login as my own Nextcloud
    await edit({ add: entry, marks: ['show'] });
    return say(`${t('share')} ← ${share.owner}`);
  } catch {
    return openPage(pendingPage(sp.spec.server)); // accept it there; it then shows as a folder in my account
  }
}

/**
 * Tap on an expected account (cloud:…): my own Nextcloud's cloud id goes onto the clipboard and its
 * server opens, where the folder is shared to that id; my app then takes it in by itself.
 */
/** A cloud id from what was pasted: an id itself, or another Nextcloud account's address (user@host). */
export function cloudIdOf(pasted) {
  if (pasted?.kind === 'cloud') return pasted.cloudId;
  if (pasted?.kind === 'nextcloud' && pasted.user) return `${pasted.user}@${new URL(pasted.path).host}`;
  return null;
}

/**
 * My Nextcloud tile n given out read-only to an account (cloud id): it comes in as a tile (if new), a line from
 * my tile shows the share, a tap on it opens that account's page to accept (askAccount).
 */
export async function giveToAccount(ctx, n, cloudId) {
  let m = ctx.s.entries.findIndex((e) => e.path === `cloud:${cloudId}`) + 1;
  if (!m) {
    await ctx.edit({ add: { label: cloudId.slice(cloudId.lastIndexOf('@') + 1), path: `cloud:${cloudId}`, id: newSource() } });
    m = ctx.s.entries.findIndex((e) => e.path === `cloud:${cloudId}`) + 1;
  }
  if (m) await ctx.edit({ rule: { from: n, to: m, mark: 'show', kinds: [] }, on: true });
  await giveOut(ctx, n, cloudId);
  ctx.s.acceptThere = null; // the account's own tile leads to its page now
}

export async function askAccount(ctx, n) {
  const entry = ctx.s.entries[n - 1];
  const cloudId = entry.path.slice(6);
  if (ctx.all().some((t) => t.giveTo?.includes(n))) return openPage(acceptPage(cloudId)); // I shared to it: accept there
  const mine = [...ctx.s.open.values()].find((sp) => sp.spec?.kind === 'nextcloud' && !sp.store?.readOnly);
  if (mine) await copy(myCloudId(mine.spec.server, mine.spec.user));
  return openPage(`${cloudIdParts(entry.path.slice(6)).remote}/index.php/apps/files/`);
}

/** Waiting shares from accounts I brought in (cloud:…) → taken in without a tap (native app). */
export function expectedOf(ctx, waiting) {
  const expected = ctx.s.entries.filter((e) => e.path?.startsWith('cloud:')).map((e) => cloudIdParts(e.path.slice(6)));
  return waiting.filter(({ share }) => expected.some((x) => share.owner === x.owner && String(share.remote).replace(/\/$/, '').startsWith(x.remote)));
}
