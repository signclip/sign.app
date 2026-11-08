// provision.js — the signer app creates what a new person needs on the Nextcloud, without anyone
// seeing a password: account (with a random password nobody knows) → an app password for this one
// device → sealed into hello back (join.js). Only in the signer app (native), never in the browser.
//
// Depends:   fetch (CapacitorHttp in the native app), 1-model/crypto (newPassword)
// Test:      tests/connect.test.mjs (fake server)
// Limits:    Nextcloud user ids: letters, digits, _ . @ - (we use n_ in lower case, 18 chars) ·
//            quota as Nextcloud text (e.g. "5 GB") · one app password per device (revocable).

import { newPassword } from '../1-model/crypto.js';

const ocsHeaders = (auth) => ({ Authorization: auth, 'OCS-APIRequest': 'true', Accept: 'application/json' });
const basic = (user, password) => 'Basic ' + btoa(`${user}:${password}`);

/**
 * Create an account. admin: { server, user, password } (from the signer device's keychain) ·
 * person: { id (n_), label } · → { user, password } — the password goes straight on to appPasswordFor.
 */
export async function createAccount(admin, person, { groups = ['Sign'], quota = '5 GB', fetch = globalThis.fetch } = {}) {
  const user = person.id.toLowerCase();
  const password = newPassword() + newPassword(); // 52 chars, never shown, never stored
  const body = new URLSearchParams({ userid: user, password, displayName: person.label });
  for (const g of groups) body.append('groups[]', g);
  const res = await fetch(`${admin.server.replace(/\/$/, '')}/ocs/v1.php/cloud/users?format=json`, {
    method: 'POST', headers: { ...ocsHeaders(basic(admin.user, admin.password)), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  const d = await res.json();
  if (!res.ok || d.ocs?.meta?.statuscode >= 300) throw new Error(`account: ${d.ocs?.meta?.message ?? res.status}`);
  if (quota) {
    await fetch(`${admin.server.replace(/\/$/, '')}/ocs/v1.php/cloud/users/${encodeURIComponent(user)}?format=json`, {
      method: 'PUT', headers: { ...ocsHeaders(basic(admin.user, admin.password)), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key: 'quota', value: quota }).toString(),
    });
  }
  return { user, password };
}

/** An app password for one device, asked as the new user. → app password (into the sealed answer). */
export async function appPasswordFor({ server, user, password }, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${server.replace(/\/$/, '')}/ocs/v2.php/core/getapppassword?format=json`, { headers: ocsHeaders(basic(user, password)) });
  if (!res.ok) throw new Error(`app password: ${res.status}`);
  return (await res.json()).ocs.data.apppassword;
}
