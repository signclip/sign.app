// share-swarm.js — a group's swarm in the sharing menu: read it, show it, take someone in (8-join/swarm.js counts,
// swarm-view.js draws).
//
// Purpose:   spread on a group's tile = its swarm opens where the tiles were (squeeze or back = the tiles again).
//            What is read, through every side of the group this device has (its read side, its own folder):
//              the Startpoints   the signers in the group's sharing-point.sign
//              the touches       join/touch/ and, where it can be listed, hello/
//              who said hello    hello/, where it can be listed (the signer; everyone in the object storage)
//            A Startpoint holds her own bubble = from now on everyone within takes in (rule (within 1), 12 h, this
//            spot); held again = only Startpoints. Seen: every bubble within gets the gold edge of the Startpoint.
//            A tap on a waiting bubble = my touch for that device: sealed with my device key, dropped into the group
//            (a member: the drop; a signer: straight into join/touch/). It shows at once here; the others see it on
//            their next look (every 20 s while the swarm is open).
//            The signer's device does the rest by itself on every look (signerLook): sealed touches move to
//            join/touch/, and whoever is within by the rule gets her sealed join without a tap.
// Depends:   browser; 8-join (swarm, group, join), 5-take/where.js, device-keys.js
// Test:      the counting and the drawing in tests/swarm.test.mjs; this file needs a browser and a group.
// Limits:    one swarm open at a time · ≤ 50 hellos and ≤ 500 touches read per look · a look = 2–3 listings per side ·
//            my spot is the cell of the last fix (≤ 6 h old, where.js); a rule that names a cell and no fix = no touch.

import { makeTouch, checkTouch, swarmOf, mayTouch, inRule, needOf, touchesIn, publishTouches, dropTouch, windowLeft, FOLDER } from '../8-join/swarm.js';
import { sealedHello } from '../8-join/group.js';
import { readHello } from '../8-join/join.js';
import { createWhere } from '../5-take/where.js';
import { readDescription, trusted, signerKeys } from '../2-storage/sharing-point.js';
import { newVersion } from '../2-storage/signer.js';
import { SELF } from '../2-storage/layout.js';
import { rangeOf } from '../1-model/time.js';
import { timeLabel } from '../1-model/filename.js';
import { deviceKeys } from './device-keys.js';
import { note as debugNote } from './debug.js';

const dec = new TextDecoder(), enc = new TextEncoder();
const LOOK_MS = 20_000, HELLOS = 50, WINDOW_MS = 12 * 3_600_000;

/** A group's description as it stands now: taken when sealed by a signer of the version this device knew (else that one stays). */
export async function descriptionNow(store, known = null) {
  try {
    const text = dec.decode(await store.read(SELF));
    if (known && !(await trusted(text, signerKeys(known)))) return known;
    return Object.assign(readDescription(text), { trusted: true });
  } catch { return known; }
}

/** The devices that said hello in a store, as cards → [{ label, id, key, path }]; a store that does not list hello/ = []. */
export async function hellosIn(store, { max = HELLOS } = {}) {
  const files = (await store.list('hello/').catch(() => [])).filter((f) => f.path.endsWith('.chain.sign') && /\(hello /.test(f.path))
    .sort((a, b) => (a.path < b.path ? 1 : -1)).slice(0, max);
  const out = [];
  for (const f of files) {
    try {
      const text = dec.decode(await store.read(f.path));
      if (!(await sealedHello(text))) continue;
      const h = readHello(text);
      out.push({ label: h.person.label, id: h.device.id, key: h.device.key, path: f.path });
    } catch { /* not a hello */ }
  }
  return out;
}

/** The Startpoints a group's description names: its signers and the device in its head. */
export const startpointsOf = (description) => [...(description?.signers ?? []), ...(description?.id && description.key ? [{ label: description.label ?? '', id: description.id, key: description.key }] : [])]
  .filter((x, i, all) => x.id && x.key && all.findIndex((y) => y.id === x.id) === i);

/**
 * The signer's own look at one group folder (store with all rights): touches move to join/touch/, and every hello whose
 * device is within by the rule is welcomed (welcome: the same sealed join a tap gives). waiting: the hello paths not
 * answered yet. → the paths welcomed
 */
export async function signerLook({ store, description, waiting = [], welcome }) {
  await publishTouches(store);
  if (!needOf(description?.join) || !waiting.length) return [];
  const swarm = swarmOf({ startpoints: startpointsOf(description), touches: await touchesIn(store), rule: description.join });
  const done = [];
  for (const path of waiting) { // hellos nobody answered yet (group.js waitingHellos)
    const d = await store.read(path).then((bytes) => readHello(dec.decode(bytes)).device, () => null);
    if (d && swarm.within.get(d.id)?.key === d.key) await welcome(path).then(() => done.push(path), () => {});
  }
  return done;
}

/** A signer's welcome is her touch (so the swarm shows everyone the same way). */
export async function touchOnWelcome({ store, helloPath, by, group, where = null, now = Date.now() }) {
  const h = readHello(dec.decode(await store.read(helloPath)));
  const t = await makeTouch({ by, taken: { label: h.person.label, id: h.device.id, key: h.device.key }, group, where, now });
  await store.write(`${FOLDER}${t.name}`, enc.encode(t.text)).catch(() => {}); // there already: left
  return t;
}

export function swarmPart(ctx, { here = createWhere(), clock = () => Date.now() } = {}) {
  const { s } = ctx;
  const st = { n: null, label: '', model: null, mine: [], seen: null, timer: null, busy: null, shake: null };
  const shake = (id) => { st.shake = id; ctx.draw(); setTimeout(() => { st.shake = null; ctx.draw(); }, 400); return null; };
  const spot = () => { const c = here.now(); return c ? (String(c).startsWith('o_') ? c : `o_${c}`) : null; };
  const sides = (label) => {
    const same = [...s.open.values()].filter((sp) => sp.entry?.label === label && sp.store);
    return { read: same.filter((sp) => !sp.store.dropOnly).map((sp) => sp.store), drop: same.find((sp) => sp.store.dropOnly)?.store ?? null,
      full: same.find((sp) => !sp.store.dropOnly && !sp.store.readOnly)?.store ?? null, description: same.find((sp) => sp.description)?.description ?? null };
  };
  const meNow = async () => { const keys = await deviceKeys(); return { person: ctx.person, device: { id: ctx.device, key: keys.device.public, label: ctx.person.label }, deviceKey: keys.device }; };

  async function load() {
    if (st.n == null) return;
    const side = sides(st.label), { read } = side, me = await meNow();
    const description = read.length ? await descriptionNow(side.full ?? read[0], side.description) : side.description; // the rule may be newer than at opening
    const touches = [...st.mine], hellos = [];
    for (const store of read) { touches.push(...await touchesIn(store).catch(() => [])); hellos.push(...await hellosIn(store)); }
    const rule = description?.join ?? null;
    const swarm = swarmOf({ startpoints: startpointsOf(description), touches, hellos, rule, group: st.label });
    const known = new Set([...swarm.within.keys()]), fresh = new Set(st.seen ? [...known].filter((id) => !st.seen.has(id)) : []);
    st.seen = known;
    const can = mayTouch(swarm, me.device.id, rule) && inRule({ at: clock(), where: spot() }, rule);
    st.model = { label: st.label, swarm, me: me.device.id, can, left: windowLeft(rule, clock()), fresh, rule, gives: needOf(rule) > 0 };
    ctx.draw();
  }

  /** Is this tile a group (so it has a swarm)? */
  const isGroup = (n) => Boolean(ctx.tileOf(n)?.group);

  function open(n) {
    const tile = ctx.tileOf(n);
    if (!tile?.group) return false;
    Object.assign(st, { n, label: tile.label, model: null, mine: [], seen: null, busy: null });
    here.refresh().catch(() => {}); // my spot, for a rule that names one
    clearInterval(st.timer);
    st.timer = setInterval(() => load().catch(() => {}), LOOK_MS);
    load().catch((err) => debugNote({ method: 'swarm', where: st.label, error: String(err?.message ?? err), ms: 0 }));
    ctx.draw();
    return true;
  }

  function close({ silent = false } = {}) {
    if (st.n == null) return false;
    clearInterval(st.timer);
    Object.assign(st, { n: null, model: null, timer: null });
    if (!silent) ctx.draw();
    return true;
  }

  /** A tap in the swarm: on a waiting bubble = my touch. */
  async function tap(role) {
    const id = role.startsWith('swarm:') ? role.slice(6) : null, m = st.model;
    if (!id || !m || st.busy) return null;
    const taken = m.swarm.waiting.find((w) => w.id === id);
    if (!taken || id === m.me) return null;
    if (!m.can) return shake(id); // not within, outside the window or the spot
    st.busy = id; ctx.draw();
    try {
      const { drop, full } = sides(st.label);
      const t = await makeTouch({ by: await meNow(), taken: { label: taken.label, id: taken.id, key: taken.key }, group: st.label, where: spot(), now: clock() });
      if (full) await full.write(`${FOLDER}${t.name}`, enc.encode(t.text)); else if (drop) await dropTouch(drop, t); else throw new Error('this group takes nothing from here');
      st.mine.push(await checkTouch(t.text)); // seen here at once, whatever the other side lists
      globalThis.navigator?.vibrate?.(20);
    } catch (err) {
      debugNote({ method: 'touch', where: st.label, error: String(err?.message ?? err), ms: 0 });
      shake(id);
    }
    st.busy = null;
    return load();
  }

  /**
   * A Startpoint holds her own bubble: from now on everyone within takes in (the rule gets (within 1), a window of 12 h
   * from now and, with a fix, this spot) · held again: only Startpoints take in. A new sealed version of the group's
   * sharing-point.sign (2-storage/signer.js); the version before moves to chain/.
   */
  async function hold(role) {
    const m = st.model, { full } = sides(st.label);
    if (role !== 'swarm:me' || !m) return null;
    const me = await meNow();
    if (!full || !m.swarm.within.get(me.device.id)?.startpoint) return shake(me.device.id);
    const now = clock(), join = m.gives ? null : { within: 1, where: spot(), time: rangeOf(now, now + WINDOW_MS).join('_') };
    try {
      await newVersion({ store: full, signer: { device: me.device.id, deviceKey: me.deviceKey, label: me.person.label }, change: { join }, now, time: timeLabel(now) });
      globalThis.navigator?.vibrate?.(20);
    } catch (err) { debugNote({ method: 'swarm', where: st.label, error: String(err?.message ?? err), ms: 0 }); return shake(me.device.id); }
    return load();
  }

  /** What swarm-view.js draws, or null while no swarm is open (before the first reading: only the group's name). */
  const view = () => (st.n == null ? null : { ...(st.model ?? { label: st.label, swarm: swarmOf({}), me: ctx.device, can: false, left: null }), busy: st.busy, shake: st.shake });
  return { isGroup, open, close, tap, hold, view, opened: () => st.n != null };
}
