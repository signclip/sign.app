// accounts.js — the accounts of a project, wherever they lie (27.11., user: "der Objektspeicher parallel oder ganz
// separat mit eigenen Usern; die Kontrolllisten nicht nur bei Nextcloud").
//
// Purpose:   one set of calls for the admin's menu. Each does its work on every system this admin holds:
//              admin.server (a Nextcloud login)          the account there (provision.js), as before
//              admin.there  { gateway, access, grant }   the account's folder <user>/ in the object storage, asked with
//                                                         the signer's own grant over the whole bucket (room.js)
//            In the object storage an account is no login. It is the folder <user>/Sign/, one grant per device, and
//            what the door keeps of the person (within/). So there:
//              made          welcome.js welcomeThere: a grant for the asking device
//              listed        the door's within/ and quiet/ (who) + what the gateway says each holds (how much)
//              space         its room, in the same 10-GB steps
//              rests · wakes every grant inside <user>/ stops counting · counts again
//              device quiet  that device counts nowhere in the bucket · welcomed again: it counts again
//              deleted       it rests, then its files are cleared, 1,000 per ask
//            thereOnly: the account lives only in the object storage (it came through the door there): Nextcloud is
//            not asked. Without it a Nextcloud admin is asked first, and its refusal is the answer.
// Depends:   provision.js, room.js, door.js, known.js
// Test:      tests/gateway.test.mjs
// Limits:    listing = 1 look at the door + 1 ask per account, 8 at a time: 200 accounts ≈ 2–5 s; what an account
//            holds is counted by the gateway at most every 10 min · clearing 20,000 Takes (≈ 60,000 files) = 60 asks ≈
//            1–2 min, at most 200,000 files per call · rests, wakes and a quiet device count on a second gateway ≤ 60 s
//            later · Nextcloud's groups (groupsOf, setGroup) and display name exist only there.

import * as nextcloud from './provision.js';
import { askThere, setRoom, roomHeld, rootOf, bytesOf } from './room.js';
import { doorView } from './door.js';
import { userOf } from './known.js';

const onNextcloud = (admin, o = {}) => Boolean(admin?.server) && !o.thereOnly;
const there = (admin) => admin?.there ?? null;
const everyoneAt = '*'; // revoked.mjs: every grant inside a root

/**
 * The accounts with their space, as provision.listAccounts gives them: [{ user, label, used, quota (bytes, −3 = no
 * limit), enabled, lastLogin, groups, only? }]. doorThere: the door in the object storage (the admin's own folder
 * there) – accounts that came through it and have no Nextcloud account are added with only: 'there'.
 */
export async function listAccounts(admin, { doorThere = null, ...opts } = {}) {
  const out = onNextcloud(admin) ? await nextcloud.listAccounts(admin, opts) : [];
  const where = there(admin);
  if (!where || !doorThere) return out;
  const have = new Set(out.map((a) => a.user.toLowerCase())), found = new Map();
  const view = await doorView(doorThere);
  for (const [pile, enabled] of [['within', true], ['quiet', false]]) {
    for (const f of view[pile]) {
      const user = userOf(f.folder);
      if (user && !have.has(user) && !found.has(user)) found.set(user, { user, label: f.name, enabled });
    }
  }
  const list = [...found.values()], more = [];
  for (let i = 0; i < list.length; i += 8) {
    more.push(...await Promise.all(list.slice(i, i + 8).map(async (a) => {
      const h = await roomHeld(where, rootOf(a.user)).catch(() => null);
      return { user: a.user, label: a.label, used: h?.used ?? 0, quota: h?.room ?? -3, lastLogin: 0, enabled: h ? !h.rests : a.enabled, groups: [], only: 'there' };
    })));
  }
  return [...out, ...more.sort((a, b) => b.used - a.used)];
}

/** An account's space: "60 GB" (a step of provision.nextQuota). In the object storage: the room of <user>/. */
export async function setQuota(admin, user, quota, o = {}) {
  if (onNextcloud(admin, o)) await nextcloud.setQuota(admin, user, quota, o.fetch ? { fetch: o.fetch } : {});
  if (there(admin)) await setRoom(there(admin), rootOf(user), bytesOf(quota));
}

/** An account rests (on = false) or wakes (true). In the object storage: every grant inside <user>/ stops counting, or counts again. */
export async function setEnabled(admin, user, on, o = {}) {
  if (onNextcloud(admin, o)) await nextcloud.setEnabled(admin, user, on, o.fetch ? { fetch: o.fetch } : {});
  if (there(admin)) await askThere(there(admin), 'revoke', everyoneAt, rootOf(user), on ? 'off' : null);
}

/** What an account holds in the object storage. → { root, used, room, rests } or null (no access there) */
export const held = (admin, user) => (there(admin) ? roomHeld(there(admin), rootOf(user)) : null);

/** A device goes quiet ("Gerät sperren"): in the object storage no grant naming it counts any more, anywhere in the bucket. */
export const quietDeviceThere = (admin, deviceId) => (there(admin) && deviceId ? askThere(there(admin), 'revoke', deviceId, '') : null);

/** Before a device is welcomed (again): its account is awake and the device itself counts – both taken back if they were set. */
export async function welcomeBack(admin, user, deviceId) {
  if (!there(admin)) return;
  await askThere(there(admin), 'revoke', everyoneAt, rootOf(user), 'off');
  if (deviceId) await askThere(there(admin), 'revoke', deviceId, '', 'off');
}

/**
 * An account deleted for good (GDPR). Nextcloud: the account with its files. Object storage: <user>/ rests, then
 * its files go, 1,000 per ask. → how many files went there
 */
export async function deleteAccount(admin, user, o = {}) {
  if (onNextcloud(admin, o)) await nextcloud.deleteAccount(admin, user, o.fetch ? { fetch: o.fetch } : {});
  const where = there(admin);
  if (!where) return 0;
  await askThere(where, 'revoke', everyoneAt, rootOf(user));
  let gone = 0;
  for (let i = 0; i < 200; i++) {
    const r = await askThere(where, 'clear', rootOf(user));
    gone += r.removed ?? 0;
    if (!r.left) return gone;
  }
  throw new Error(`more than 200,000 files in ${rootOf(user)}: call again`);
}

/** Nextcloud only: the groups of an account ({ all, mine }); nowhere else there are such groups. */
export const groupsOf = (admin, user, o = {}) => (onNextcloud(admin, o) ? nextcloud.groupsOf(admin, user) : Promise.resolve({ all: [], mine: [] }));
export const setGroup = (admin, user, group, on) => nextcloud.setGroup(admin, user, group, on);
/** Nextcloud only: the name shown there. In the object storage the name stands in the person's own files. */
export const setDisplayName = (admin, user, name, o = {}) => (onNextcloud(admin, o) ? nextcloud.setDisplayName(admin, user, name) : Promise.resolve());
