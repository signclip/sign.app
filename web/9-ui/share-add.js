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
import { userId, appPasswordFor } from '../8-join/provision.js';
import { roleOf } from '../8-join/flow.js';
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

async function clipboard() { // at most 1 s: a clipboard that asks and never answers must not swallow the tap
  const cap = globalThis.Capacitor?.Plugins?.Clipboard;
  const read = cap ? cap.read().then((r) => r.value) : navigator.clipboard.readText();
  return Promise.race([read, new Promise((_, no) => setTimeout(() => no(new Error('clipboard')), 1000))]);
}

/**
 * The one + tile: whatever brings a sharing point in. A link, an address, a server, a cloud id, a group text or an
 * awaited password on the clipboard → bringIn; nothing usable there: the copy sign shakes. Folders and disks come
 * from a tap on this device's own tile (pickFolder, 14.11.): the + is only for links.
 */
const SIGNER_KEY = /^q_[0-9A-Z]{16}\s+z_[0-9A-Z]{40,60}$/i, SIGNER_CODE = /^sign-signer\s+([0-9A-Za-z\s-]{26,40})$/i, PERSON_CODE = /^sign-person\s+(n_[0-9A-Z]{16})$/i;
const usable = (s, text) => Boolean(s.waitSecret || s.giveTo || text.includes('\n') || readPaste(text) || SIGNER_KEY.test(text.trim()) || SIGNER_CODE.test(text.trim()) || PERSON_CODE.test(text.trim()));

/**
 * Without a tap (14.11.): is there something the + could take? → 'ready' | 'ghost'. The native app reads the clipboard;
 * the browser only when reading was allowed before (else it would ask).
 */
export async function peek(s) {
  if (s.waitSecret || s.giveTo) return 'ready';
  let text = '';
  try {
    const cap = globalThis.Capacitor?.Plugins?.Clipboard;
    const allowed = cap || (await navigator.permissions?.query?.({ name: 'clipboard-read' }).then((p) => p.state === 'granted', () => false));
    if (allowed) text = (await clipboard()) ?? '';
  } catch { /* empty or not allowed */ }
  return usable(s, text) ? 'ready' : 'ghost';
}

export async function addNew(ctx, { person = true } = {}) {
  let text = '';
  try { text = (await clipboard()) ?? ''; } catch { /* no permission: then a folder */ }
  if (usable(ctx.s, text)) return bringIn(ctx);
  if (!person) { ctx.s.clip = 'ghost'; ctx.s.shake = 'add:new'; ctx.draw(); setTimeout(() => { ctx.s.shake = null; ctx.draw(); }, 400); return null; } // held: only the clipboard counts, it shakes
  return ctx.newPerson?.() ?? null; // 16.11. (user): nothing fitting on the clipboard = a new account (person) on this device: name, name sign, password gestures, hello
}

/** ← paste. ctx: { s, keychain, edit, load, say, t } (share-mount.js). */
/**
 * A pasted text that carries a link and its password together (14.11.) → { text, secret }. The password is a line
 * "Passwort: …" / "Password: …", or the one word beside a single link (next line or after a space; no spaces in it).
 * Everything else is left as it was. The password goes straight into the keychain, never shown.
 */
export function splitSecret(pasted) {
  let rest = String(pasted ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  let secret = null;
  rest = rest.filter((l) => {
    const m = /^(?:passwor[dt]|kennwort|pw)\s*[:=]\s*(\S.*)$/i.exec(l);
    if (m) secret = m[1].trim();
    return !m;
  });
  const isLink = (l) => /^https?:\/\//.test(l);
  const links = rest.filter(isLink);
  if (!secret && links.length === 1) {
    const other = rest.filter((l) => !isLink(l));
    if (rest.length === 2 && !/\s/.test(other[0])) { secret = other[0]; rest = links; }
    else if (rest.length === 1 && /^\S+\s+\S+$/.test(rest[0])) { const [url, word] = rest[0].split(/\s+/); secret = word; rest = [url]; }
  }
  return { text: rest.join('\n'), secret };
}

export async function bringIn(ctx, given = null) { // given: a text instead of the clipboard (a moved sharing point followed, 15.11.)
  const { s, keychain, edit, say, t } = ctx;
  let pasted = '';
  try { pasted = given ?? await clipboard(); } catch { return say(t('notReachable')); }
  const { text, secret } = s.waitSecret ? { text: pasted, secret: null } : splitSecret(pasted); // link and password in one text
  if (text.includes('\n') && await bringInvitation(ctx, text, secret)) return say(t('share')); // a group invitation: name, read link, drop link
  if (s.waitSecret) { // the password a sharing point asked for (given privately): straight into the keychain, never shown
    for (const id of [s.waitSecret, ...(s.waitSecretAlso ?? [])]) await keychain.set(id, text.trim());
    s.lastSecret = s.waitSecret;
    s.waitSecret = null;
    s.waitSecretAlso = null;
    await ctx.load(); // a door waiting for its password: the hello goes out now (joinProject)
    if (ctx.confirmed && /^confirm /.test(String(ctx.s.lastSecret ?? ''))) return ctx.confirmed(); // the Admin password (20.11.): Atlas, Groups, the waiting join go on
    return say(t('copied'));
  }
  if (s.giveTo) return giveOut(ctx, s.giveTo, text.trim());
  if (SIGNER_KEY.test(text.trim()) || SIGNER_CODE.test(text.trim())) return addSigner(ctx, text.trim()); // admin: a second device, or the paper
  const back = PERSON_CODE.exec(text.trim())?.[1]?.toUpperCase().replace(/^N_/, 'n_'); // a person comes back from her paper (15.11.): her ID here, the hello carries it, the admin finds her account by it
  if (back) return globalThis.signPersons?.adopt(back) ? location.reload() : say(t('notReachable'));
  const what = readPaste(text);
  if (!what) return say(t('menu.paste'));
  if (what.kind === 'cloud') { // a cloud id brought in: its shares to me are taken in by themselves
    const host = what.cloudId.slice(what.cloudId.lastIndexOf('@') + 1);
    return edit({ add: { label: host, path: `cloud:${what.cloudId}`, id: newSource() } });
  }
  if (what.kind === 'nextcloud' && !what.folder && secret && roleOf(what.user, ctx.project ?? {})) return bringRole(ctx, what, secret); // Atlas, Groups: made in the browser, brought in with their own password (20.11.)
  const id = newSource();
  if (secret) await keychain.set(id, secret); // came with the link: the folder opens at once
  if (what.kind === 'login') return loginAt(ctx, what.server, id);
  await edit({ add: { path: what.path, id }, marks: ['show'] });
  const sp = [...s.open.values()].find((x) => x.entry.id === id);
  try { await sp.store.list('chain/'); } catch { s.waitSecret = id; return say(t('menu.secret')); }
  await makeSharingPoint(ctx, id); // a new, writable folder becomes a sharing point (sealed by this device)
}

/**
 * Atlas or Groups (20.11., user: made by hand in the browser, brought in with the password they already have): the
 * account link and its password copied together, then +. The password only asks Nextcloud for an app password for this
 * device; that one opens and writes the files, the password itself is not kept. The account shows as its circle upper
 * left, as after the one-click login. Nothing about the account changes.
 */
async function bringRole(ctx, what, password) {
  const { keychain, edit, say, t } = ctx;
  let appPassword;
  try { appPassword = await appPasswordFor({ server: what.server, user: what.user, password }); } catch { return say(t('notReachable')); } // wrong password or no network: nothing kept
  const id = newSource();
  await keychain.set(id, appPassword);
  await edit({ add: { label: what.user, path: webdavUrl(what.server, what.user, ''), id } });
  ctx.show?.(true);
  return say(t('menu.account'));
}

/**
 * Log in at a Nextcloud (Login Flow v2): its page opens in the system browser, the server makes an app password for
 * this device, the app waits for it (every 2 s), keeps it in the keychain, then shows the account's folders to pick.
 * Also the admin's own way (14.11.): hold the copy sign / + = log in at the project's server, no clipboard needed.
 */
export async function loginAt(ctx, server, id = newSource()) {
  const { say, t } = ctx;
  let step = '1 start';
  try {
    const { login, poll } = await startLogin(server);
    step = '2 wait';
    try { localStorage.setItem(PENDING, JSON.stringify({ poll, id, at: Date.now() })); } catch { /* private mode */ } // Android may close the app while the browser is open
    say(t('menu.wait'));
    await openPage(login); // the native app: the system browser (window.open does nothing in its web view)
    const got = await waitLogin(poll);
    step = '3 folders';
    return await finishLogin(ctx, got, id);
  } catch (err) { return loginFailed(ctx, err, step); }
}

const PENDING = 'sign.pendingLogin';
function loginFailed({ say, t }, err, step = '') { // the browser is blocked (CORS); in the app: which step failed, short, to find it
  const why = `${step} ${String(err?.message ?? err)}`.trim().slice(0, 90);
  return say(globalThis.Capacitor?.isNativePlatform?.() ? `${t('notReachable')} · ${why}` : t('menu.native'));
}

/** Back in the app after the browser (or the app was restarted meanwhile): a login still open goes on (≤ 20 min). */
export async function resumeLogin(ctx) {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch { /* private mode */ }
  if (!p || Date.now() - p.at > 20 * 60 * 1000) return null;
  let step = '2 wait (again)';
  try { const got = await waitLogin(p.poll); step = '3 folders'; return await finishLogin(ctx, got, p.id); } catch (err) { return loginFailed(ctx, err, step); }
}

/**
 * The login is through: the app password goes into the keychain; then the folders that matter are taken at once (15.11.):
 * the door (a folder with hello/ and join/, for the admin) and Sign/ (each account's own). Only if neither is there,
 * the account's folders are shown to choose.
 */
async function finishLogin(ctx, got, id) {
  const { s, keychain, say, t, edit } = ctx;
  try { localStorage.removeItem(PENDING); } catch { /* private mode */ }
  globalThis.Capacitor?.Plugins?.Browser?.close?.().catch?.(() => {}); // logged in: back to the app by itself
  await keychain.set(id, got.appPassword);
  got = { ...got, user: await userId({ server: got.server, user: got.user, password: got.appPassword }) }; // the id, not the typed login (16.11.): the WebDAV path needs it
  if (roleOf(got.user, ctx.project ?? {})) { // Admin, Atlas, Groups (16.11.): an account, no folder to choose; it shows as its circle upper left
    await edit({ add: { label: got.user, path: webdavUrl(got.server, got.user, ''), id } });
    ctx.show?.(true);
    return say(t('menu.account'));
  }
  const account = { kind: 'nextcloud', server: got.server, user: got.user, folder: '' };
  const { store } = connect(account, { secret: got.appPassword });
  const root = await store.folders('');
  const name = (f) => f.replace(/\/$/, '').split('/').pop();
  const isDoor = (list, at = '') => list.includes(`${at}hello/`) && list.includes(`${at}join/`);
  let door = isDoor(root) ? '' : null;
  for (const f of root.slice(0, 20)) { if (door !== null) break; if (isDoor(await store.folders(f).catch(() => []), f)) door = f; }
  const sign = root.find((f) => /^sign\/?$/i.test(f));
  // the person chooses (15.11.): the folders found go first and are taken with one tap — the door (hello/, join/) first, then Sign/
  const suggest = [...(door !== null ? [door] : []), ...(sign && sign !== door ? [sign] : [])];
  s.browse = { id, server: got.server, user: got.user, store, at: '', inside: [...suggest, ...root.filter((f) => !suggest.includes(f))], suggest };
  ctx.show?.(true);
  ctx.draw?.();
  return say(t('menu.account'));
}

/**
 * Admin (14.11.): another signer for the door, so a changed admin device needs no new app.
 *   "q_… z_…" on the clipboard (the check key of a second device) → this device certifies it.
 *   "sign-signer CODE" (from the emergency sheet) → the paper certifies THIS device (the admin phone was lost).
 * Needs the admin's own folder (hold + = log in). The certificate goes to join/signer/ of the door.
 */
export async function addSigner(ctx, text) {
  const store = ctx.adminStore?.();
  if (!store) return ctx.say(ctx.t('notReachable'));
  const { deviceKeys } = await import('./device-keys.js');
  const { certify, paperSigner } = await import('../8-join/signers.js');
  const me = await deviceKeys();
  const self = { id: ctx.device, key: me.device.public, label: ctx.person.label, privateKey: me.device.privateKey };
  const code = SIGNER_CODE.exec(text)?.[1];
  const [q, z] = text.split(/\s+/);
  const cert = code ? await certify({ by: await paperSigner(code), signer: self, person: ctx.person })
    : await certify({ by: self, signer: { id: q, key: z.slice(2), label: 'Gerät' }, person: ctx.person });
  await store.write(cert.path, new TextEncoder().encode(cert.text));
  return ctx.say(ctx.t('copied')); // done: the tile flashes
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
    { label: b.at ? `${nameOf(b.at)} ✓` : `${b.user} ✓`, go: () => take(b.at) }, // this folder (or the whole account) as it is
    ...(b.at ? [{ label: '↑', go: () => into(b.at.replace(/[^/]+\/$/, '')) }] : []),
    ...b.inside.map((f) => (b.suggest?.includes(f) && !b.at
      ? { label: f ? nameOf(f) : b.user, go: () => take(f), found: true } // found by its folders: one tap takes it
      : { label: nameOf(f), go: () => into(f) })),
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
  if (!mine) return loginAt(ctx, cloudIdParts(cloudId).remote); // no own Nextcloud yet (14.11.): log in there, not just its page
  await copy(myCloudId(mine.spec.server, mine.spec.user));
  return openPage(`${cloudIdParts(cloudId).remote}/index.php/apps/files/`);
}

/** Waiting shares from accounts I brought in (cloud:…) → taken in without a tap (native app). */
export function expectedOf(ctx, waiting) {
  const expected = ctx.s.entries.filter((e) => e.path?.startsWith('cloud:')).map((e) => cloudIdParts(e.path.slice(6)));
  return waiting.filter(({ share }) => expected.some((x) => share.owner === x.owner && String(share.remote).replace(/\/$/, '').startsWith(x.remote)));
}
