// provision.js — the signer app creates what a new person needs on the Nextcloud, without anyone
// seeing a password: account (with a random password nobody knows) → an app password for this one
// device → sealed into hello back (join.js). Only in the signer app (native), never in the browser.
//
// Depends:   fetch (CapacitorHttp in the native app), 1-model/crypto (newPassword)
// Test:      tests/connect.test.mjs (fake server)
// Limits:    Nextcloud user ids: letters, digits, _ . @ - (we use n_ in lower case, 18 chars) ·
//            quota as Nextcloud text ("100 GB", "none" = no limit) · one app password per device (revocable) ·
//            accounts listed per group (Sign, without Admin and Atlas), ≤ 500 per look; Nextcloud tells space, not the number of files.

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

export const GROUP = 'Sign'; // the Nextcloud group of every Sign account (14.11.: Admin, Atlas and the group Sign exist)

export async function createAccount(admin, person, { groups = [GROUP], quota = QUOTA, fetch = globalThis.fetch } = {}) {
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

/**
 * May this login manage the Sign accounts? Then this device is the admin app (14.11.). Yes for an admin of the
 * instance and for a group admin (subadmin) of the Sign group (15.11.): Nextcloud lets a subadmin create, change and
 * delete the accounts of her group, nothing else. → true · false · null (not reachable now: ask again later)
 */
export async function isAdmin(login, { group = GROUP, fetch = globalThis.fetch } = {}) {
  try {
    const d = await ocs(login, `users/${encodeURIComponent(login.user)}`, { fetch });
    return d.groups?.includes('admin') === true || (d.subadmin ?? []).includes(group);
  } catch (err) { return /: (401|403|404)\b|statuscode|997|998/.test(String(err.message)) ? false : null; }
}

/**
 * The accounts of a group with their space: [{ user, label, used, quota (bytes, -3 = no limit), lastLogin }],
 * the fullest first. Limits: one request per account; ≤ 500.
 */
export async function listAccounts(admin, { group = GROUP, skip = [], max = 500, fetch = globalThis.fetch } = {}) {
  const not = new Set(skip.filter(Boolean).map((u) => u.toLowerCase())); // Admin and Atlas may sit in the group too: they are no person's account
  const users = ((await ocs(admin, `groups/${encodeURIComponent(group)}`, { fetch })).users ?? []).filter((u) => !not.has(u.toLowerCase())).slice(0, max);
  const out = [];
  for (const user of users) {
    try {
      const d = await ocs(admin, `users/${encodeURIComponent(user)}`, { fetch });
      out.push({ user, label: d.displayname || user, used: d.quota?.used ?? 0, quota: d.quota?.quota ?? -3, lastLogin: d.lastLogin ?? 0, enabled: d.enabled !== false, groups: (d.groups ?? []).filter((g) => g !== 'admin') });
    } catch { out.push({ user, label: user, used: 0, quota: -3, lastLogin: 0, groups: [] }); }
  }
  return out.sort((a, b) => b.used - a.used);
}

/**
 * Find accounts like Similar finds takes (14.11.): every context word must match the name or one of its groups
 * (case and accents ignored, a word may be the start). No words = all.
 */
export function matchAccounts(accounts, words = []) {
  const norm = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ws = words.map(norm).filter(Boolean);
  return accounts.filter((a) => ws.every((w) => [a.label, a.user, ...(a.groups ?? [])].some((x) => norm(x).split(/\s+/).some((part) => part.startsWith(w)) || norm(x).startsWith(w))));
}

/** Let an account rest (no login, no sync; its files stay) or wake it again (OCS disable / enable). */
/** Log out (15.11.): an app password deletes itself on its Nextcloud (asked with that very password); then it opens nothing. */
export async function revokeAppPassword({ server, user, password }, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${base(server)}/ocs/v2.php/core/apppassword?format=json`, { method: 'DELETE', headers: ocsHeaders(basic(user, password)) });
  return res.ok || res.status === 401; // 401: it was gone already
}

/** The name Nextcloud shows for an account (15.11.: a person renamed herself; the account, n_, stays). */
export async function setDisplayName(admin, user, label, { fetch = globalThis.fetch } = {}) {
  await ocs(admin, `users/${encodeURIComponent(user)}`, { method: 'PUT', body: new URLSearchParams({ key: 'displayname', value: label }).toString(), fetch });
}

/** A new login password for an existing account (15.11.: a new device of a known person gets its own app password;
 * the app passwords of her other devices keep working). Never shown, never stored. */
export async function setPassword(admin, user, password, { fetch = globalThis.fetch } = {}) {
  await ocs(admin, `users/${encodeURIComponent(user)}`, { method: 'PUT', body: new URLSearchParams({ key: 'password', value: password }).toString(), fetch });
}

/** Take an account back (15.11.: join ↓ before the device took it): the Nextcloud user goes, its files with it. */
export async function deleteAccount(admin, user, { fetch = globalThis.fetch } = {}) {
  await ocs(admin, `users/${encodeURIComponent(user)}`, { method: 'DELETE', fetch });
}

export async function setEnabled(admin, user, on, { fetch = globalThis.fetch } = {}) {
  await ocs(admin, `users/${encodeURIComponent(user)}/${on ? 'enable' : 'disable'}`, { method: 'PUT', fetch });
}

/**
 * Groups as context of an account (14.11.: "Gruppe zuordnen = context hinzufügen"): all groups of the instance and
 * the ones the account is in. Limits: ≤ 200 groups per look; Admin's own group "admin" is never offered.
 */
export async function groupsOf(admin, user, { fetch = globalThis.fetch } = {}) {
  const [all, mine] = await Promise.all([ocs(admin, 'groups?limit=200', { fetch }), ocs(admin, `users/${encodeURIComponent(user)}/groups`, { fetch })]);
  return { all: (all.groups ?? []).filter((g) => g !== 'admin'), mine: (mine.groups ?? []).filter((g) => g !== 'admin') };
}

/** Put an account into a group (on = true) or take it out. */
export async function setGroup(admin, user, group, on, { fetch = globalThis.fetch } = {}) {
  const q = new URLSearchParams({ groupid: group }).toString();
  if (on) await ocs(admin, `users/${encodeURIComponent(user)}/groups`, { method: 'POST', body: q, fetch });
  else await ocs(admin, `users/${encodeURIComponent(user)}/groups?${q}`, { method: 'DELETE', fetch }); // DELETE: in the address, not a body
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

/** A folder in someone's own files (WebDAV MKCOL; there already = fine). */
export async function makeFolder({ server, user, password }, folder, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${base(server)}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeURIComponent(folder)}/`, { method: 'MKCOL', headers: { Authorization: basic(user, password) } });
  if (![201, 405].includes(res.status)) throw new Error(`folder: ${res.status}`);
}

/** Share a folder of mine with another user of the same Nextcloud; permissions 1 = read only. → share id */
export async function shareFolder({ server, user, password }, folder, withUser, { permissions = 1, fetch = globalThis.fetch } = {}) {
  const body = new URLSearchParams({ path: `/${folder}`, shareType: '0', shareWith: withUser, permissions: String(permissions) });
  const res = await fetch(`${base(server)}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
    method: 'POST', headers: { ...ocsHeaders(basic(user, password)), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok && d.ocs?.meta?.statuscode !== 403) throw new Error(`share: ${d.ocs?.meta?.message ?? res.status}`); // 403 = shared already
  return d.ocs?.data?.id ?? null;
}

/** What others shared with me: [{ owner, label, folder (where it sits in my files) }]. */
export async function sharedWithMe({ server, user, password }, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(`${base(server)}/ocs/v2.php/apps/files_sharing/api/v1/shares?shared_with_me=true&format=json`, { headers: ocsHeaders(basic(user, password)) });
  if (!res.ok) throw new Error(`shares: ${res.status}`);
  return ((await res.json()).ocs?.data ?? []).filter((x) => x.item_type === 'folder').map((x) => ({ owner: x.uid_owner, label: x.displayname_owner || x.uid_owner, folder: String(x.file_target ?? x.path).replace(/^\//, '') }));
}
