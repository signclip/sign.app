// welcome.js — the whole way from hello to a working sharing point, both sides together:
//   signer app  welcome(): account + app password (provision.js) → hello back with the person's own
//               Nextcloud sharing point and the ones the signer adds (Kurs 3, …); with a gateway (project.json,
//               21.11.) also her own sharing point in the object storage: <gateway>/s3/<user>/Sign/ and a grant for
//               the access key of the asking device (grant.js), both inside the sealed answer
//   device      arrive(): after join → secret and grants into the keychain, entries for the person's list, stores
// Depends:   provision.js, join.js, grant.js, 2-storage (connect, nextcloud)
// Test:      tests/connect.test.mjs, tests/gateway.test.mjs
// Limits:    the secret travels only sealed (join.js); keychain = { set(q_, secret) } given by the app ·
//            a grant needs a hello that names an access key (devices since 21.11.).

import { createAccount, appPasswordFor, makeFolder, shareFolder, setPassword } from './provision.js';
import { newPassword } from '../1-model/crypto.js';
/** Each person's own folder in her account. */
export const FOLDER = 'Sign';
import { helloBack, readHello } from './join.js';
import { connect } from '../2-storage/connect.js';
import { webdavUrl } from '../2-storage/nextcloud.js';
import { newSource } from '../1-model/ids.js';
import { makeGrant } from './grant.js';

const dec = new TextDecoder();

/** The person's own sharing point in the object storage, mirrored on her Nextcloud path (<user>/Sign/), with a grant. */
async function inGateway({ ask, gateway, user, signer, now }) {
  if (!gateway || !ask.access) return { also: [], grants: {} };
  const prefix = `${user}/${FOLDER}/`, sp = { label: ask.person.label, path: `${gateway.replace(/\/$/, '')}/s3/${prefix}`, id: newSource() };
  return { also: [sp], grants: { [sp.id]: await makeGrant({ signer, device: ask.device, access: ask.access, prefix, now }) } };
}

/**
 * Signer app. door: store with hello/ join/ · admin: { server, user, password } of the instance ·
 * also: more sharing points for this person [{ path, id, person }] · atlas: user that reads every Sign/ (or null) ·
 * → path of the answer in join/.
 */
export async function welcome({ door, helloPath, admin, signer, also = [], quota, atlas = null, group, gateway = null, fetch = globalThis.fetch, now = Date.now() }) {
  const ask = readHello(dec.decode(await door.read(helloPath)));
  const account = await createAccount(admin, ask.person, { quota, fetch, ...(group ? { groups: [group] } : {}) });
  const login = { server: admin.server, ...account };
  await makeFolder(login, FOLDER, { fetch }); // the own Nextcloud of the person is Sign/, not the account's root (14.11.)
  if (atlas) await shareFolder(login, FOLDER, atlas, { fetch }); // read only to atlas: the index over all (SCHEMA B6), the admin sees only its summary
  const appPassword = await appPasswordFor(login, { fetch });
  const own = { label: ask.person.label, path: webdavUrl(admin.server, account.user, FOLDER), id: newSource() };
  const g = await inGateway({ ask, gateway, user: account.user, signer, now });
  const secret = JSON.stringify({ server: admin.server, user: account.user, appPassword, id: own.id, grants: g.grants });
  return helloBack({ store: door, helloPath, secret, sharingPoints: [own, ...g.also, ...also], signer, now });
}

/**
 * Signer app, a known person on a new device (15.11.): no new account; the account gets a new login password, the
 * device its own app password for the same Sign/. user: the account (n_ small) the admin compared the takes with.
 */
export async function welcomeDevice({ door, helloPath, admin, signer, user, also = [], gateway = null, fetch = globalThis.fetch, now = Date.now() }) {
  const ask = readHello(dec.decode(await door.read(helloPath)));
  const login = { server: admin.server, user, password: newPassword() + newPassword() };
  await setPassword(admin, user, login.password, { fetch });
  const appPassword = await appPasswordFor(login, { fetch });
  const own = { label: ask.person.label, path: webdavUrl(admin.server, user, FOLDER), id: newSource() };
  const g = await inGateway({ ask, gateway, user, signer, now });
  const secret = JSON.stringify({ server: admin.server, user, appPassword, id: own.id, grants: g.grants });
  return helloBack({ store: door, helloPath, secret, sharingPoints: [own, ...g.also, ...also], signer, now });
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
    const grant = s.grants?.[sp.id];
    if (grant) { await keychain.set(sp.id, grant); entries.push({ ...sp, kind: 'gateway' }); continue; } // opened with the access key + grant (sharing-points.js)
    const own = Boolean(s.server) && (sp.id === s.id || sp.path.startsWith(`${s.server.replace(/\/$/, '')}/remote.php/dav/files/${s.user}/`));
    if (!own) { entries.push({ ...sp, kind: sp.path.startsWith('cloud:') ? 'cloud' : 'webdav' }); continue; } // reached later with its own access; cloud: = an account the signer cleared, its shares are taken in
    const folder = decodeURIComponent(sp.path.split(`/files/${s.user}/`)[1] ?? '').replace(/\/$/, '');
    const { entry, store } = connect({ kind: 'nextcloud', label: sp.label, id: sp.id, server: s.server, user: s.user, folder }, { secret: s.appPassword, fetch });
    if (sp.id !== s.id) await keychain.set(sp.id, s.appPassword); // each folder of the own account opens with the same login
    entries.push(entry); stores.set(sp.id, store);
  }
  return { entries, stores };
}
