// spec.js — where a sharing point lies, read from its =(full path); and what pasted text means.
//
// Purpose:   one notation for every kind (SCHEMA.md B8):
//              local:                                  this device (OPFS / app folder)
//              folder:Name                             a picked folder or disk (9-ui/folders.js)
//              cloud:name@uni-koeln.de@uni-koeln.sciebo.de   an account (Sciebo, Nextcloud) whose shares to
//                                                      me are taken in by themselves; no store of its own
//              https://host/remote.php/dav/files/<user>/<folder>/   Nextcloud, Sciebo
//              https://host/public.php/dav/files/<token>/           a read-only link
//              any other https                         WebDAV, user in the address (https://lena@dav.example/…)
//            never a password in a path: passwords live in the keychain by q_.
// Depends:   nextcloud.js (publicWebdavUrl)
// Test:      tests/list.test.mjs
// Limits:    later clouds (Google Drive, OneDrive, iCloud) come as their own kinds or via rclone WebDAV.

import { publicWebdavUrl } from './nextcloud.js';

/** Entry of the list → spec for connect(), from its =(full path). Devices (key, no path) → null. */
export function specOf({ label, id, path, key }) {
  if (!path) return key ? null : { kind: 'local', label, id };
  if (path === 'local:') return { kind: 'local', label, id };
  if (path.startsWith('folder:')) return { kind: 'folder', label, id }; // a picked folder or disk (9-ui/folders.js)
  if (path.startsWith('cloud:')) return { kind: 'cloud', label, id, cloudId: path.slice(6) }; // an account whose shares to me are taken in
  const u = new URL(path);
  const where = u.origin + u.pathname;
  let m = /^(.*)\/public\.php\/dav\/files\/([^/]+)\/?$/.exec(where);
  if (m) return { kind: 'link', label, id, server: m[1], token: m[2] };
  m = /^(.*)\/remote\.php\/dav\/files\/([^/]+)\/(.*?)\/?$/.exec(where);
  if (m) return { kind: 'nextcloud', label, id, server: m[1], user: decodeURIComponent(m[2]), folder: decodeURIComponent(m[3]) };
  return { kind: 'webdav', label, id, url: where, user: decodeURIComponent(u.username) || null };
}

/**
 * Pasted text (clipboard instead of typing) → what to do with it:
 *   lena@uni.sciebo.de          { kind: 'cloud', cloudId }      give a folder to it (routes.give)
 *   https://host/s/AbC123       { kind: 'link', path }          a read-only link
 *   https://host                { kind: 'login', server }       one-click login (native app); also any page of a
 *   https://host/apps/files/…                                    Nextcloud copied from the browser (…/apps/…, …/login)
 *   https://host/remote.php/…   { kind: 'nextcloud', path, … }  · any other https: { kind: 'webdav', path }
 */
export function readPaste(text) {
  const s = String(text ?? '').trim();
  // a cloud id; the user part may hold an @ itself: name@uni-koeln.de@uni-koeln.sciebo.de
  if (/^[^\s/:]+@[^\s@/]+\.[a-z]{2,}$/i.test(s)) return { kind: 'cloud', cloudId: s };
  if (!/^https?:\/\/\S+$/.test(s)) return null;
  const u = new URL(s);
  const share = /^(.*?)\/(?:index\.php\/)?s\/([A-Za-z0-9]+)\/?$/.exec(u.origin + u.pathname);
  if (share) return { kind: 'link', server: share[1], token: share[2], path: publicWebdavUrl(share[1], share[2]) };
  if (u.pathname.replace(/\/$/, '') === '' || /^\/(index\.php\/)?(apps|login|settings)(\/|$)/.test(u.pathname)) return { kind: 'login', server: u.origin }; // the address bar of a Nextcloud page = log in there
  return { ...specOf({ path: s }), path: s };
}
