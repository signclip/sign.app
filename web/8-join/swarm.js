// swarm.js — a swarm: the net of touches by which a group forms where its people meet (user 22.11.: swarm, Startpoint).
//
// Purpose:   until now only the signer of a group lets someone in (a tap on her hello). A touch lets everyone who is
//            in take the next one in, so the group grows from device to device:
//              Startpoint   a signer of the group's sharing point (sharing-point.sign). Passing it on = a signer
//                           certificate (signers.js), nothing new.
//              touch        "I take this device in": a small chain, sealed with the giver's device key
//                             :chain!(q_<giver> n_ [o_<spot>] t_ u_ y_…)@(<giver>)'t(…)
//                             :sharing-point.1^(<taken in>)!(q_<device> z_<device key>)
//                             :sharing-point.2^(<giver's device>)!(q_<giver> z_<giver's key>)
//                             ((touch) (<group>) {:sharing-point.1} {:sharing-point.2})'t(…)
//              swarm        every touch of a group read together: within = a Startpoint, or taken in by as many
//                           devices within as the join rule asks: `((join) (within n))°(spot)'t(from_to)`.
//            The two settings of a group (user 22.11.) are that one rule:
//              with (within n)     everyone within takes in. A touch counts as soon as its giver is within, whenever it
//                                  was given: nets that formed apart come in together once one line reaches a Startpoint.
//              without             only Startpoints take in (and whoever they made a Startpoint).
//            Who said hello before (her hello lies in the group) stands there waiting and only needs the touch.
//            Files: a member drops her touch into hello/ (all a drop takes); whoever may write there moves sealed ones
//            to join/touch/, where everyone with the read side sees them (publishTouches).
// Depends:   1-model (file, ids, crypto, filename, time)
// Test:      tests/swarm.test.mjs
// Limits:    a touch ≈ 0.5 KB · ≤ 500 read per look (the newest) ≈ 250 KB · ≤ 10 steps from a Startpoint · with
//            (within 1) and 2 touches a minute each, 3^5 = 243 devices are in after 5 minutes (one Startpoint alone:
//            ≈ 2 hours) · the spot is what the giver's device says (o_, H3 resolution 5 ≈ 250 km²): it keeps mistakes
//            out, not someone who lies about where she is – what counts is the line of seals back to a Startpoint.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf, idTime } from '../1-model/ids.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { buildName, timeLabel } from '../1-model/filename.js';
import { timeRange, inTime, msOf } from '../1-model/time.js';

export const FOLDER = 'join/touch/', DROP = 'hello/', MOST = 500, DEEPEST = 10;
const LINE = /^\(\(touch\) \(([^()]*)\) \{:sharing-point\.1\} \{:sharing-point\.2\}\)/;
const enc = new TextEncoder(), dec = new TextDecoder();
const named = (path) => path.endsWith('.chain.sign') && path.slice(path.lastIndexOf('/') + 1).startsWith('(touch ');
const cardOf = (d) => (d?.id?.q && d.id.z ? { label: d.hint ?? '', id: d.id.q, key: d.id.z.slice(2) } : null);

/**
 * A touch: by takes taken into group. by: { person: { id, label }, device: { id, key, label }, deviceKey } ·
 * taken: { label, id, key } (from her hello, or handed over) · where: o_ cell of the giver now, or null.
 * → { name, text } (sealed)
 */
export async function makeTouch({ by, taken, group, where = null, now = Date.now() }) {
  if (!taken?.id?.startsWith('q_') || !taken.key) throw new Error('a touch needs the device and its key');
  if (taken.id === by.device.id) throw new Error('nobody takes herself in');
  if (/[()]/.test(group ?? '') || !group) throw new Error(`group name not allowed: ${group}`);
  const id = newId({ q: by.device.id, n: by.person.id, o: where, now }), time = timeLabel(now);
  const text = await signed(by.deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': by.person.label, "'t": time }), [
    defLine('sharing-point.1', { hint: taken.label, id: `${taken.id} z_${taken.key}` }),
    defLine('sharing-point.2', { hint: by.device.label ?? by.person.label, id: `${by.device.id} z_${by.device.key}` }),
  ], [`((touch) (${group}) {:sharing-point.1} {:sharing-point.2})'t(${time})`]));
  return { name: buildName({ words: ['touch', taken.label], person: by.person.label, time, u: uOf(id), kind: 'chain', ext: 'sign' }), text };
}

/** What a touch says (not checked). → { u, group, at (ms), where, giver: { person, label, id, key }, taken: { label, id, key } } or null */
export function readTouch(text) {
  try {
    const f = readFile(String(text));
    const m = LINE.exec(f.rows[0]?.text ?? ''), taken = cardOf(f.defs.get('sharing-point.1')), giver = cardOf(f.defs.get('sharing-point.2'));
    if (!m || !taken || !giver || giver.id !== f.head.id.q || giver.id === taken.id) return null; // the giver named is the device that wrote it
    return { u: f.head.id.u, group: m[1], at: idTime(f.head.id), where: f.head.id.o ?? null, giver: { ...giver, person: f.head['@'] ?? giver.label }, taken };
  } catch { return null; }
}

/** A touch sealed by the giver it names → what it says, else null. (Whether that giver counts, the swarm decides.) */
export async function checkTouch(text) {
  const t = readTouch(text);
  return t && await checkWitness(t.giver.key, String(text)).catch(() => false) ? t : null;
}

/** How many devices within must take someone in (0 = only Startpoints do). The older word (vouch n) reads the same. */
export const needOf = (rule) => Number(rule?.within || rule?.vouch || 0);

/** Does a touch lie inside the rule's window and spot? A spot written as a name cannot be checked by a device: it passes. */
export function inRule(touch, rule) {
  if (!rule) return true;
  if (rule.time && !inTime(timeLabel(touch.at), timeRange(rule.time))) return false;
  return !(String(rule.where ?? '').startsWith('o_') && touch.where !== rule.where);
}

/** The end of a written time (or prefix of one): '2026.11.26 19' → the first ms after that hour. */
function endOf(label) {
  const m = /^(\d{4})(?:\.(\d{2}))?(?:\.(\d{2}))?(?: (\d{2}))?(?:\.(\d{2}))?(?:\.(\d{2}))?/.exec(String(label ?? '').trim());
  if (!m) return null;
  const given = m.slice(1).filter((v) => v != null).map(Number), at = [given[0], (given[1] ?? 1) - 1, given[2] ?? 1, given[3] ?? 0, given[4] ?? 0, given[5] ?? 0];
  at[given.length - 1] += 1; // one more of the last part written
  return Date.UTC(...at);
}

/** How much of the rule's window is left: 1 = all of it (or not begun), 0 = over, null = the rule names no window. */
export function windowLeft(rule, now = Date.now()) {
  const r = timeRange(rule?.time), from = r && msOf(r[0]), to = r && endOf(r[1]);
  if (from == null || to == null || to <= from) return null;
  return Math.max(0, Math.min(1, (to - now) / (to - from)));
}

/**
 * The swarm of one group. startpoints: [{ id, key, label }] (the signers of its sharing-point.sign) · touches: checked
 * touches (checkTouch) · hellos: [{ id, key, label }] devices that said hello · rule: its join rule or null.
 * → { within: Map id → { id, key, label, by: [ids], depth, at, startpoint },
 *     waiting: [{ id, key, label, hello, by: [ids of givers not counting yet], net (index into nets) or null }],
 *     nets: [[ids]] (two or more waiting devices tied by touches), edges: [{ from, to, counts }], ignored (number) }
 */
export function swarmOf({ startpoints = [], touches = [], hellos = [], rule = null, group = null } = {}) {
  const need = needOf(rule), everyone = need > 0, n = Math.max(1, need);
  const within = new Map(startpoints.filter((s) => s?.id && s.key).map((s) => [s.id, { id: s.id, key: s.key, label: s.label ?? '', by: [], depth: 0, at: null, startpoint: true }]));
  const seen = new Set(), good = [];
  for (const t of touches) { // one touch per giver and device, inside the window, for this group
    const k = `${t?.giver?.id} ${t?.taken?.id} ${t?.taken?.key}`;
    if (!t || seen.has(k) || (group != null && t.group !== group) || !inRule(t, rule)) continue;
    seen.add(k); good.push(t);
  }
  const counts = (t) => { const g = within.get(t.giver.id); return Boolean(g) && g.key === t.giver.key && (everyone || g.startpoint) && g.depth < DEEPEST; };
  for (let depth = 1; depth <= DEEPEST; depth++) { // ring by ring: whoever is taken in by enough devices of the rings before
    const next = new Map();
    for (const t of good.filter((x) => !within.has(x.taken.id) && counts(x))) {
      const k = `${t.taken.id} ${t.taken.key}`; // a device counts with one key only
      next.set(k, [...(next.get(k) ?? []), t]);
    }
    let grew = false;
    for (const list of next.values()) {
      if (list.length < n || within.has(list[0].taken.id)) continue;
      const first = [...list].sort((a, b) => a.at - b.at);
      within.set(first[0].taken.id, { ...first[0].taken, by: first.map((t) => t.giver.id), depth, at: first[n - 1].at, startpoint: false });
      grew = true;
    }
    if (!grew) break;
  }
  const out = new Map(); // everyone else we know of: said hello, was touched, or touched someone
  const wait = (c, hello = false) => {
    if (!c?.id || within.has(c.id)) return;
    const w = out.get(c.id) ?? { id: c.id, key: c.key, label: '', hello: false, by: [], net: null };
    out.set(c.id, { ...w, label: w.label || c.label || '', hello: w.hello || hello });
  };
  hellos.forEach((h) => wait(h, true));
  const open = good.filter((t) => !within.has(t.taken.id));
  for (const t of open) { wait(t.taken); wait(t.giver); out.get(t.taken.id).by.push(t.giver.id); }
  const nets = [], at = new Map(); // nets apart: waiting devices tied to each other by touches
  for (const t of open.filter((x) => out.has(x.giver.id))) {
    const a = at.get(t.giver.id), b = at.get(t.taken.id);
    if (a == null && b == null) { at.set(t.giver.id, nets.length).set(t.taken.id, nets.length); nets.push([t.giver.id, t.taken.id]); }
    else if (a == null || b == null) { const i = a ?? b, id = a == null ? t.giver.id : t.taken.id; at.set(id, i); nets[i].push(id); }
    else if (a !== b) { for (const id of nets[b]) { at.set(id, a); nets[a].push(id); } nets[b] = []; }
  }
  const kept = nets.filter((x) => x.length);
  kept.forEach((ids, i) => ids.forEach((id) => { out.get(id).net = i; }));
  const edges = good.map((t) => ({ from: t.giver.id, to: t.taken.id, counts: Boolean(within.get(t.taken.id)?.by.includes(t.giver.id)) }))
    .filter((e) => e.counts || !within.has(e.to));
  return { within, waiting: [...out.values()], nets: kept, edges, ignored: touches.length - good.length };
}

/**
 * How many take part (27.11., user: the number of a group that forms at a spot and a time): devices within, and
 * devices waiting (said hello or were touched, not yet within). A number only – no names, nothing about who.
 * → { within, waiting }
 */
export const countOf = (swarm) => ({ within: swarm?.within?.size ?? 0, waiting: swarm?.waiting?.length ?? 0 });

/** May this device take someone in now? (within, the rule lets members, or it is a Startpoint) */
export function mayTouch(swarm, id, rule) {
  const me = swarm.within.get(id);
  return Boolean(me) && (me.startpoint || needOf(rule) > 0) && me.depth < DEEPEST;
}

/** A member: her touch into the drop. → path */
export async function dropTouch(store, { name, text }) {
  const path = `${DROP}${name}`;
  await store.write(path, enc.encode(text));
  return path;
}

/** Whoever may write the group's folder: sealed touches move from hello/ to join/touch/ (junk stays where it is). → how many */
export async function publishTouches(store) {
  let moved = 0;
  for (const f of (await store.list(DROP).catch(() => [])).filter((x) => named(x.path)).slice(0, MOST)) {
    if (!(await checkTouch(dec.decode(await store.read(f.path))).catch(() => null))) continue;
    await store.move(f.path, `${FOLDER}${f.path.slice(f.path.lastIndexOf('/') + 1)}`).then(() => { moved += 1; }, () => {}); // there already: left
  }
  return moved;
}

/** Every sealed touch a store shows: join/touch/ and, where hello/ can be listed, what waits there. → [touch], the newest first */
export async function touchesIn(store, { max = MOST } = {}) {
  const list = async (folder) => (await store.list(folder).catch(() => [])).filter((f) => named(f.path));
  const files = [...await list(FOLDER), ...await list(DROP)].sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || (a.path < b.path ? 1 : -1)).slice(0, max);
  const out = new Map();
  for (const f of files) {
    const t = await store.read(f.path).then((bytes) => checkTouch(dec.decode(bytes)), () => null);
    if (t && !out.has(t.u)) out.set(t.u, t);
  }
  return [...out.values()];
}
