// roles.js — Atlas and Groups made by the admin app itself (20.11., user: „Atlas und Groups werden direkt angelegt“).
//
// Purpose:   the two service accounts of a project (project.json atlas, groups) need nobody to make them by hand in
//            Nextcloud. With the Admin account's own password (Nextcloud asks for it before it makes an account), the
//            admin app makes each one that is missing, with a random password nobody sees, in the project's group;
//            one that exists but has no key on this device gets a new random password (its other logins stay valid:
//            Nextcloud keeps app passwords when a password changes). Each then gets an app password for this device,
//            the way a person's device gets one. The app keeps both: the app password opens and writes the files, the
//            account's own password lets the app manage it later (a new device, a new app password).
// Depends:   provision.js (createAccount, appPasswordFor, okCode), 1-model/crypto.js (newPassword); fetch
// Test:      tests/onboard.test.mjs (strict fake Nextcloud)
// Limits:    2 accounts, ≤ 6 requests each · the admin needs the right to make accounts in the group (an admin of the
//            instance or a group admin of project.group) · names as in project.json, display name = that name.

import { createAccount, appPasswordFor, okCode, GROUP } from './provision.js';
import { newPassword } from '../1-model/crypto.js';

const basic = (user, password) => 'Basic ' + btoa(`${user}:${password}`);
const headers = (a) => ({ Authorization: basic(a.user, a.password), 'OCS-APIRequest': 'true', Accept: 'application/json' });
const base = (server) => server.replace(/\/$/, '');

/** The role accounts project.json names. → [{ role, user }] */
export const roleNames = (project = {}) => [['atlas', project.atlas], ['groups', project.groups]].filter(([, u]) => u).map(([role, user]) => ({ role, user }));

/** Does this account exist? → true · false (throws when the server cannot be asked) */
export async function exists(admin, user, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${base(admin.server)}/ocs/v1.php/cloud/users/${encodeURIComponent(user)}?format=json`, { headers: headers(admin) });
  const d = await res.json().catch(() => ({}));
  if (res.status === 404 || d.ocs?.meta?.statuscode === 404 || d.ocs?.meta?.statuscode === 998) return false;
  if (!res.ok || !okCode(d.ocs?.meta?.statuscode)) throw new Error(`${user}: ${d.ocs?.meta?.message || res.status}`);
  return true;
}

/** A new random password for an account that exists (only with the admin's own password). */
async function newPasswordFor(admin, user, { fetch }) {
  const password = newPassword() + newPassword();
  const res = await fetch(`${base(admin.server)}/ocs/v1.php/cloud/users/${encodeURIComponent(user)}?format=json`, {
    method: 'PUT', headers: { ...headers(admin), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key: 'password', value: password }).toString(),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !okCode(d.ocs?.meta?.statuscode)) throw new Error(`${user}: ${d.ocs?.meta?.message || `statuscode ${d.ocs?.meta?.statuscode ?? res.status}`}`);
  return password;
}

/**
 * Make sure the role accounts exist and this device holds a key for each.
 * admin: { server, user, password } with the Admin account's OWN password · have: user names this device already holds
 * → [{ role, user, made (true = new account), password, appPassword }] for every one that was missing on this device.
 */
export async function setupRoles(admin, project, { have = [], group = project?.group || GROUP, fetch = globalThis.fetch } = {}) {
  const held = new Set(have.map((u) => String(u).toLowerCase()));
  const out = [];
  for (const { role, user } of roleNames(project)) {
    if (held.has(user.toLowerCase())) continue;
    const made = !(await exists(admin, user, { fetch }));
    const password = made
      ? (await createAccount(admin, { id: user, label: user }, { groups: [group], fetch, user })).password
      : await newPasswordFor(admin, user, { fetch });
    const appPassword = await appPasswordFor({ server: admin.server, user, password }, { fetch });
    out.push({ role, user, made, password, appPassword });
  }
  return out;
}
