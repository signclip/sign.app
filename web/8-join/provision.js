// provision.js — the signer app creates what a new person needs on the Nextcloud, without anyone
// seeing a password: account (with a random password nobody knows) → an app password for this one
// device → sealed into hello back (join.js). Only in the signer app (native), never in the browser.
//
// Depends:   fetch (CapacitorHttp in the native app), 1-model/crypto (newPassword)
// Test:      tests/connect.test.mjs (fake server)
// Limits:    Nextcloud user ids: letters, digits, _ . @ - (we use n_ in lower case, 18 chars) ·
//            quota as Nextcloud text ("100 GB", "none" = no limit) · one app password per device (revocable) ·
//            accounts listed per group (Sign), ≤ 500 per look; Nextcloud tells space, not the number of files.

import { newPassword } from '../1-model/crypto.js';

const ocsHeaders = (auth) => ({ Authorization: auth, 'OCS-APIRequest': 'true', Accept: 'application/json' });
const basic = (user, password) => 'Basic ' + btoa(`${user}:${password}`);

/**
 * Create an account. admin: { server, user, password } (from the signer device's keychain) ·
 * person: { id (n_), label } · → { user, password } — the password goes straight on to appPasswordFor.
 */
/** New accounts get this much (14.11.: up to 100 GB by default; the admin changes it per account). */
export const QUOTA = '100 GB';
/** The steps the admin walks through per account (↑ more, ↓ less); none = no limit. */
export const QUOTAS = ['10 GB', '25 GB', '50 GB', '100 GB', '250 GB', '500 GB', 'none'];

export async function createAccount(admin, person, { groups = ['Sign'], quota = QUOTA, fetch = globalThis.fetch } = {}) {
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

const base = (server) => server.replace(/\/$/, '');
const ocs = async (admin, path, { method = 'GET', body = null, fetch = globalThis.fetch } = {}) => {
  const res = await fetch(`${base(admin.server)}/ocs/v1.php/cloud/${path}${path.includes('?') ? '&' : '?'}format=json`, {
    method, headers: { ...ocsHeaders(basic(admin.user, admin.password)), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.ocs?.meta?.statuscode >= 300) throw new Error(`${path}: ${d.ocs?.meta?.message ?? res.status}`);
  return d.ocs.data;
};

/** Is this login an admin of its Nextcloud (group admin)? Then this device is the admin app (14.11.). → boolean */
export async function isAdmin(login, { fetch = globalThis.fetch } = {}) {
  try { return (await ocs(login, `users/${encodeURIComponent(login.user)}`, { fetch })).groups?.includes('admin') === true; } catch { return false; }
}

/**
 * The accounts of a group with their space: [{ user, label, used, quota (bytes, -3 = no limit), lastLogin }],
 * the fullest first. Limits: one request per account; ≤ 500.
 */
export async function listAccounts(admin, { group = 'Sign', max = 500, fetch = globalThis.fetch } = {}) {
  const users = ((await ocs(admin, `groups/${encodeURIComponent(group)}`, { fetch })).users ?? []).slice(0, max);
  const out = [];
  for (const user of users) {
    try {
      const d = await ocs(admin, `users/${encodeURIComponent(user)}`, { fetch });
      out.push({ user, label: d.displayname || user, used: d.quota?.used ?? 0, quota: d.quota?.quota ?? -3, lastLogin: d.lastLogin ?? 0 });
    } catch { out.push({ user, label: user, used: 0, quota: -3, lastLogin: 0 }); }
  }
  return out.sort((a, b) => b.used - a.used);
}

/** Change an account's space: one of QUOTAS ("none" = the limit lifted). */
export async function setQuota(admin, user, quota, { fetch = globalThis.fetch } = {}) {
  await ocs(admin, `users/${encodeURIComponent(user)}`, { method: 'PUT', body: new URLSearchParams({ key: 'quota', value: quota }).toString(), fetch });
}

/** The next step of space for an account, up (+1) or down (−1), from its quota in bytes; null = no step further. */
export function nextQuota(bytes, by) {
  const gb = (q) => (q === 'none' ? Infinity : Number.parseFloat(q) * 2 ** 30);
  const now = bytes < 0 ? Infinity : bytes;
  const at = QUOTAS.findIndex((q) => gb(q) >= now - 1); // the first step at or above today's
  const exact = at >= 0 && Math.abs(gb(QUOTAS[at]) - now) <= 1;
  const i = Math.max(0, Math.min(QUOTAS.length - 1, at < 0 ? QUOTAS.length - 1 : exact ? at + by : by > 0 ? at : at - 1));
  return by < 0 && gb(QUOTAS[i]) > now ? null : QUOTAS[i]; // below the lowest step: no change (null)
}
