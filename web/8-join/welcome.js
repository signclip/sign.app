// welcome.js — the whole way from hello to a working sharing point, both sides together:
//   signer app  welcome(): account + app password (provision.js) → hello back with the person's own
//               Nextcloud sharing point and the ones the signer adds (Kurs 3, …)
//   device      arrive(): after join → secret into the keychain, entries for the person's list, stores
// Depends:   provision.js, join.js, 2-storage (connect, nextcloud)
// Test:      tests/connect.test.mjs
// Limits:    the secret travels only sealed (join.js); keychain = { set(q_, secret) } given by the app.

import { createAccount, appPasswordFor, makeFolder, shareFolder } from './provision.js';
/** Each person's own folder in her account. */
export const FOLDER = 'Sign';
import { helloBack, readHello } from './join.js';
import { connect } from '../2-storage/connect.js';
import { webdavUrl } from '../2-storage/nextcloud.js';
import { newSource } from '../1-model/ids.js';

const dec = new TextDecoder();

/**
 * Signer app. door: store with hello/ join/ · admin: { server, user, password } of the instance ·
 * also: more sharing points for this person [{ path, id, person }] · atlas: user that reads every Sign/ (or null) ·
 * → path of the answer in join/.
 */
export async function welcome({ door, helloPath, admin, signer, also = [], quota, atlas = null, fetch = globalThis.fetch, now = Date.now() }) {
  const ask = readHello(dec.decode(await door.read(helloPath)));
  const account = await createAccount(admin, ask.person, { quota, fetch });
  const login = { server: admin.server, ...account };
  await makeFolder(login, FOLDER, { fetch }); // the own Nextcloud of the person is Sign/, not the account's root (14.11.)
  if (atlas) await shareFolder(login, FOLDER, atlas, { fetch }); // read only to atlas: the index over all (SCHEMA B6), the admin sees only its summary
  const appPassword = await appPasswordFor(login, { fetch });
  const own = { label: ask.person.label, path: webdavUrl(admin.server, account.user, FOLDER), id: newSource() };
  const secret = JSON.stringify({ server: admin.server, user: account.user, appPassword, id: own.id });
  return helloBack({ store: door, helloPath, secret, sharingPoints: [own, ...also], signer, now });
}

/**
 * Device, after join(): keep the secret in the keychain (by the id of the own sharing point) and
 * make the stores. → { entries (for listText), stores: Map(id → store) }
 */
/**
 * The app password came through the read folder (sealed for this device). Swap it for a new one right away
 * (Nextcloud: POST /ocs/v2.php/core/apppassword/rotate): whoever reads the folder and one day opens the seal finds
 * a dead password. If the server does not allow it (browser block), the travelled one stays (native app: it does).
 */
export async function rotate({ server, user, appPassword }, fetch = globalThis.fetch) {
  try {
    const res = await fetch(`${server.replace(/\/$/, '')}/ocs/v2.php/core/apppassword/rotate?format=json`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`${user}:${appPassword}`)}`, 'OCS-APIRequest': 'true', Accept: 'application/json' } });
    if (!res.ok) return appPassword;
    return (await res.json())?.ocs?.data?.apppassword ?? appPassword;
  } catch { return appPassword; }
}

export async function arrive({ secret, sharingPoints, keychain, fetch = globalThis.fetch }) {
  const s = secret ? JSON.parse(secret) : {}; // a group of links only brings no account
  if (s.appPassword) s.appPassword = await rotate(s, fetch); // the one that travelled is dead from now on
  if (s.appPassword) await keychain.set(s.id, s.appPassword);
  const entries = [], stores = new Map();
  for (const sp of sharingPoints) {
    const own = Boolean(s.server) && (sp.id === s.id || sp.path.startsWith(`${s.server.replace(/\/$/, '')}/remote.php/dav/files/${s.user}/`));
    if (!own) { entries.push({ ...sp, kind: sp.path.startsWith('cloud:') ? 'cloud' : 'webdav' }); continue; } // reached later with its own access; cloud: = an account the signer cleared, its shares are taken in
    const folder = decodeURIComponent(sp.path.split(`/files/${s.user}/`)[1] ?? '').replace(/\/$/, '');
    const { entry, store } = connect({ kind: 'nextcloud', label: sp.label, id: sp.id, server: s.server, user: s.user, folder }, { secret: s.appPassword, fetch });
    if (sp.id !== s.id) await keychain.set(sp.id, s.appPassword); // each folder of the own account opens with the same login
    entries.push(entry); stores.set(sp.id, store);
  }
  return { entries, stores };
}
