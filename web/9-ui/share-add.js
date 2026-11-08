// share-add.js — bring a sharing point in (paste, folder, one-click login) and give one out read-only.
//
// Purpose:   in:  ← paste: a link, a WebDAV address, a Nextcloud server (one click), a password
//                  when one was asked for (straight into the keychain, never shown) ·
//                  Ordner wählen: a folder or a disk (folders.js), read and write.
//            out: a Nextcloud folder of mine, only the chosen kinds (take/x, echo/x …) read-only:
//                  Link kopieren (one link per kind folder on the clipboard) · an Adresse (paste a
//                  cloud id: Sciebo, another Nextcloud; in the PWA too, via WebAppPassword). iCloud, Google Drive, OneDrive have no
//                  read-only share an app can make: there the way is a backup into their folder.
// Depends:   browser; 2-storage (spec, login-flow, nextcloud, routes); folders.js, system-share.js
// Test:      needs a browser; readPaste and give are tested (list.test.mjs, connect.test.mjs).
// Limits:    the browser blocks the one-click login (CORS) → "geht in der App"; a link per kind.

import { readPaste } from '../2-storage/spec.js';
import { startLogin, waitLogin } from '../2-storage/login-flow.js';
import { Nextcloud, webdavUrl } from '../2-storage/nextcloud.js';
import { giveStrands } from '../2-storage/routes.js';
import { newSource } from '../1-model/ids.js';
import { folders, canPick } from './folders.js';
import { copy } from './system-share.js';

async function clipboard() {
  const cap = globalThis.Capacitor?.Plugins?.Clipboard;
  return cap ? (await cap.read()).value : navigator.clipboard.readText();
}

/** ← paste. ctx: { s, keychain, edit, load, say, t } (share-mount.js). */
export async function bringIn(ctx) {
  const { s, keychain, edit, say, t } = ctx;
  let text = '';
  try { text = await clipboard(); } catch { return say(t('notReachable')); }
  if (s.waitSecret) { await keychain.set(s.waitSecret, text.trim()); s.waitSecret = null; await ctx.load(); return say(t('copied')); }
  if (s.giveTo) return giveOut(ctx, s.giveTo, text.trim());
  const what = readPaste(text);
  if (!what) return say(t('menu.paste'));
  if (what.kind === 'cloud') { const own = ctx.tileOf(s.focus) ?? ctx.all().find((x) => x.canGive); return own ? giveOut(ctx, own.n, what.cloudId) : say(t('notReachable')); }
  const id = newSource();
  if (what.kind === 'login') {
    try {
      const { login, poll } = await startLogin(what.server);
      globalThis.open?.(login, '_blank');
      const got = await waitLogin(poll);
      await keychain.set(id, got.appPassword);
      return edit({ add: { label: got.user, path: webdavUrl(got.server, got.user), id }, marks: ['show', 'write'] });
    } catch { return say(t('menu.native')); } // the browser is blocked (CORS); the app is not
  }
  await edit({ add: { path: what.path, id }, marks: ['show'] });
  const sp = [...s.open.values()].find((x) => x.entry.id === id);
  try { await sp.store.list('chain/'); } catch { s.waitSecret = id; say(t('menu.secret')); }
}

/** Ordner wählen: a folder or disk, read and write, brought into search. */
export async function pickFolder(ctx) {
  if (!canPick()) return ctx.say(ctx.t('menu.native'));
  const id = newSource();
  try {
    const { name } = await folders.pick(id);
    await ctx.edit({ add: { label: name, path: `folder:${name}`, id }, marks: ['show', 'write'] });
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
  const sp = s.open.get(n), tile = ctx.tileOf(n);
  try {
    const nc = new Nextcloud({ server: sp.spec.server, user: sp.spec.user, password: await keychain.get(sp.entry.id) });
    const kinds = tile.kinds.length ? tile.kinds : ['v', 'a', 'x', 'l'];
    const to = how === 'link' ? 'link' : readPaste(how)?.cloudId;
    if (!to) return say(t('menu.paste'));
    const given = await giveStrands(nc, { root: sp.spec.folder, kinds, to });
    if (to === 'link') await copy(given.map((g) => g.url ?? g).join('\n'));
    say(t(to === 'link' ? 'copied' : 'share'));
  } catch { say(t('notReachable')); } // WebAppPassword missing or the address not entered there
}
