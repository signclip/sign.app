// own-door.js — each person's own door for her files in a group (27.11., user: "the hello for each person singly:
//            join gives back – if yes to within, and quiet if gone"; always asked, never by itself).
//
// Purpose:   the admin's door (door.js) lets a device into a group. What that new member may read of a person's
//            files, the person says herself, singly, through her view (2-storage/sealed-keys.js giveView):
//              hello   a member of the group whose devices hold none of her view keys and whom she has not said no to
//                      – a question to her, nothing happens by itself
//              join    her answer yes: her device gives her view key to each of the member's devices (view lines,
//                      sealed for each device's pickup key) → within
//              within  members whose devices hold her view; a device they add later gets it without a question (the
//                      person said yes, not the phone) – ownDoor lists it in `give`
//              quiet   her answer no, or the member gone (left the group): a relation line in her own list
//                      `{} {:sharing-point.<group>} {:sharing-point.<member>} (quiet)` (SCHEMA G4a, list.js) – never
//                      asked again until she moves it back (↑ = join)
//            The view key only opens what she named under it; a member in quiet keeps what she could open before,
//            nothing new (a new view key for those who stay: sealed-keys.js renewal, as for a lost device).
// Depends:   2-storage/sealed-keys.js (giveView, views), 2-storage/relations.js (relationLine), 2-storage/list.js
//            (rulesOf, for quietOf)
// Test:      tests/own-door.test.mjs
// Limits:    one look = one keyNotes read of the group (≈ 1 small file per note); a member is a person with her devices
//            ({ person, label, devices: [{ id: q_, pickup: z_ }] }); ≤ 200 devices per view note (sealed-keys MOST).

import { giveView } from '../2-storage/sealed-keys.js';
import { relationLine } from '../2-storage/relations.js';

/**
 * The piles of her own door. members: the group's members [{ person, label, devices: [{ id, pickup }] }] ·
 * views: sealed-keys views() of the group · mine: the q_ of her own devices · me: her person id ·
 * quiet: person ids she said no to (quietOf). → { hello, within, quiet, give: [{ member, devices }] }
 */
export function ownDoor({ members = [], views = [], mine = [], me = null, quiet = [] }) {
  const own = new Set(mine), no = new Set(quiet);
  const held = new Set(views.filter((v) => (v.by ?? []).some((q) => own.has(q))).flatMap((v) => v.devices ?? []));
  const out = { hello: [], within: [], quiet: [], give: [] };
  for (const m of members) {
    if (!m?.person || m.person === me) continue;
    const devices = m.devices ?? [], has = devices.filter((d) => held.has(d.id));
    if (has.length) {
      out.within.push(m);
      const more = devices.filter((d) => !held.has(d.id));
      if (more.length && !no.has(m.person)) out.give.push({ member: m, devices: more }); // her yes holds for the member's new phone
    } else if (no.has(m.person)) out.quiet.push(m);
    else out.hello.push(m);
  }
  return out;
}

/**
 * Yes (↑ on a hello, or on quiet again): her view key for each of the member's devices. view: her view key (one she
 * already gave, so all who read her see the same; or a new one) · signer: her device. → giveView's { path, name, key, at }
 */
export async function joinMember({ store, signer, view, member, devices = null, now = Date.now() }) {
  const to = (devices ?? member?.devices ?? []).filter((d) => d?.id && d?.pickup);
  if (!to.length) throw new Error('a member needs a device to read');
  return giveView({ store, signer, view, holders: to, now });
}

/** No (↓ on a hello), or the member gone: the line for her own list (list.js editList). group, member: their numbers there. */
export function quietLine({ group, member, time = null }) {
  return relationLine({ what: [], from: group, to: member, marks: ['quiet'], time });
}

/**
 * Whom she said no to in a group: her list's rules (list.js rulesOf) and its sharing points → person ids.
 * rules: [{ from, to, marks }] · points: [{ n, id }] (the number in the list, the person's id).
 */
export function quietOf(rules = [], points = [], group) {
  const idOf = new Map(points.map((p) => [p.n, p.id]));
  return rules.filter((r) => r.from === group && (r.mark === 'quiet' || (r.marks ?? []).includes('quiet'))).map((r) => idOf.get(r.to)).filter(Boolean);
}
