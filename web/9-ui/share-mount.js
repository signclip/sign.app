// share-mount.js — puts the sharing points on the screen after ↑ on the point and carries out the gestures.
//
// Purpose:   keeps the list in force, its rules and the opened sharing points together; after every change
//            of the list it reopens them and hands Similar its sources (show rules). What a gesture means
//            is in share-menu.js, how it looks in view/points.js; this file only listens and calls.
//            A folder or disk that comes back (checked every 30 s) gets its rules run at once: backup and
//            copies catch up by themselves. Upkeep (2-storage/upkeep.js): a new rule runs right after it
//            is made, copies every hour, backups every 7 days; a sharing point offline at start is opened
//            again; each tile shows how its last run went; a tile dropped on this device (0) brings its
//            files home (a backup is restored).
// Depends:   browser; 2-storage (list, sharing-point, sharing-points), 4-save/share-take,
//            9-ui (share-menu, share-add, folders, touch, view/points, view/ring)
// Test:      needs a browser; the parts are tested in tests/list.test.mjs and tests/ui.test.mjs.
// Limits:    one list per device store; 30 s until a plugged-in disk is noticed (browser: only while the
//            app is open, and after one tap on its tile per session for permission); upkeep runs only while
//            the app is open (native app: EXTEND(S10, background) a background task).

import { findList, changeList, rulesOf } from '../2-storage/list.js';
import { readList } from '../2-storage/sharing-point.js';
import { openAll, afterTake, sources, runRules, reconnect } from '../2-storage/sharing-points.js';
import { dueRules, remember, retry, backupKey, summary, reopen, bringHome } from '../2-storage/upkeep.js';
import { partsOf } from '../2-storage/layout.js';
import { quietIds } from '../4-save/remove.js';
import { deviceKeys } from './device-keys.js';
import { readPaste } from '../2-storage/spec.js';
import { copyRoute } from '../2-storage/routes.js';
import { copy } from './system-share.js';
import { shareTake } from '../4-save/share-take.js';
import { timeLabel } from '../1-model/filename.js';
import { tiles, gestureOn, targetFor, KINDS } from './share-menu.js';
import { addNew, giveOut, giveToAccount, cloudIdOf, browseChips, waitingShares, acceptWaiting, openPage, askAccount, expectedOf } from './share-add.js';
import { makeOrRenew, hellosToWelcome, welcome, followJoins, joinProject, helloToDoor, checkKey } from './share-group.js';
import { folders } from './folders.js';
import { bind } from './touch.js';
import { pointShapes } from './view/points.js';
import { toSvg } from './view/ring.js';

const dec = new TextDecoder();

/** Small things this device remembers about its own runs (never shared). */
function kept(key) { try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; } }
function keep(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }

async function clipboardText() {
  try {
    const cap = globalThis.Capacitor?.Plugins?.Clipboard;
    return cap ? (await cap.read()).value : await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

/**
 * panel: element over the screen · own: the device store · keychain: { get, set } · person: { id, label } ·
 * device: q_ · t: translator · lastChain(): newest take chain · selection(): kinds on in the ring ·
 * once(): kinds for this share only (a strand held on the screen while ↑ on the point) or null ·
 * onSources(list): new sources for Similar · nameSign(): bytes of the name sign video or null (goes with each hello) ·
 * project: { label, read, drop } the project's door (project.json): the first join, without a group text.
 * → { show(on), afterTake(paths), runRules(), dropKind(n, kind) }
 */
export async function mountShareMenu({ panel, own, keychain, person, device, t, lastChain, selection = () => KINDS, once = () => null, onSources = () => {}, nameSign = async () => null, project = null, onHello = () => {}, onOwnHold = () => {} }) {
  const s = {
    entries: [], // the sharing points of the list in force
    rules: [], // its rules (list.js rulesOf)
    open: new Map(), // n → opened sharing point (sharing-points.js openAll)
    focus: null, // the circle shared to last
    waitSecret: null, // q_ of a sharing point that waits for a pasted password
    giveTo: null, // n that waits for a pasted cloud id
    browse: null, // after a login: choosing the folder
    incoming: [], // shares waiting for me in my own Nextcloud
    acceptThere: null, // after giving to a cloud id: { url, label } of the other side's page
    hellos: [], // signer: hellos waiting in my group folders
    joinStates: new Map(), // member: label → 'hello' | 'join'
    note: '', // one short line under the circles
    runs: new Map(), // n → how its last run went (upkeep.summary)
    last: kept('sign.upkeep'), // ruleKey → ms of its last run (this device only)
    running: false,
  };
  const svg = document.createElement('div');
  svg.className = 'points';
  const note = document.createElement('div');
  note.className = 'note';
  panel.append(svg, note);

  const meta = () => ({ device, person, now: Date.now(), time: timeLabel(Date.now()) });
  const all = () => tiles(s.entries, s.rules, s.open, s.runs);

  // ---------- upkeep: what is due runs by itself (2-storage/upkeep.js) ----------
  const host = async () => { const { pickup } = await deviceKeys(); return { id: device, pickup: pickup.public, privateKey: pickup.privateKey }; };
  const paper = async () => { const text = (await clipboardText()).trim().toUpperCase(); return /^[0-9A-Z]{26}$/.test(text) ? text : null; };
  async function skip() { // removed takes never come back through a copy or a restore
    const texts = [];
    for (const { path } of await own.list('chain/')) if (path.includes('quiet') && path.endsWith('.sign')) texts.push(dec.decode(await own.read(path)));
    const ids = quietIds(texts);
    return (path) => ids.has(partsOf(path)?.u);
  }
  /** Run what is due (or, with only = n, everything of that sharing point now). → report */
  const run = async (only = null) => {
    if (s.running) return [];
    const rules = only == null ? dueRules(s.rules, s.last) : s.rules.filter((r) => r.to === only || r.from === only);
    if (!rules.length) return [];
    s.running = true;
    try {
      let key = null;
      for (const r of rules.filter((x) => x.mark === 'backup')) { // one key per device, sealed at every backup target
        const target = s.open.get(r.to)?.store;
        if (target) key = await backupKey(target, { keychain, host: await host(), paper }).catch(() => key);
      }
      const report = await runRules(rules, s.open, { own, backupKey: key, skip: await skip() });
      for (const [n, line] of summary(report)) s.runs.set(n, line);
      s.last = remember(s.last, report);
      keep('sign.upkeep', s.last);
      if (only != null) tell(only);
      if (!panel.hidden) draw();
      return report;
    } finally { s.running = false; }
  };
  /** One line about sharing point n under the tiles. */
  function tell(n) {
    const line = s.runs.get(n), label = s.entries[n - 1]?.label ?? '';
    if (line) say(t(`run.${line.state}`, { label, n: line.copied }));
  }

  async function load() {
    const at = await findList(own);
    const text = at ? dec.decode(await own.read(at)) : '';
    s.entries = text ? readList(text) : [];
    s.rules = text ? rulesOf(text) : [];
    s.open = await openAll(s.entries, { keychain, own, folders });
    onSources(sources(s.rules, s.open, own));
    waitingShares(ctx).then(async (list) => { // asks in the background
      const expected = expectedOf(ctx, list); // from accounts I brought in: taken in without a tap
      for (const item of expected) await acceptWaiting(ctx, item).catch(() => {});
      s.incoming = list.filter((x) => !expected.includes(x));
      if (!panel.hidden) draw();
    });
    hellosToWelcome(ctx).then((list) => { s.hellos = list; if (!panel.hidden) draw(); }); // signer: who said hello
    followJoins(ctx).then((states) => { s.joinStates = states; if (!panel.hidden) draw(); }); // member: my joins
    joinProject(ctx, project).catch(() => {}); // the first group: the project's door (also after its password came)
  }
  async function edit(change) {
    await changeList(own, change, meta());
    await load();
    draw();
    run().catch(() => {}); // a new copy or backup starts now, not at the next start
  }
  const say = (text) => { s.note = text; draw(); };
  const doorLabel = (project?.doors?.length || project?.read) ? project.label || 'Sign' : null; // the project's door, if there is one
  const ctx = { s, keychain, edit, load, say, t, all, device, person, nameSign, doorLabel, doorSigner: project?.signer ?? null, tileOf: (n) => all().find((x) => x.n === n), draw: () => draw() };

  // ---------- doing what a gesture says ----------
  async function shareTo(n) {
    const sp = s.open.get(n);
    const chainPath = await lastChain();
    if (!sp?.store || !chainPath) return say(t('notReachable'));
    s.focus = n;
    const tile = ctx.tileOf(n);
    const target = { entry: { ...sp.entry, always: tile.kinds.length ? tile.kinds : KINDS }, description: sp.description ?? { kinds: KINDS }, store: sp.store };
    await shareTake({ own, chainPath, device, person, now: Date.now(), targets: [target], once: once() }); // once: a held strand (parallel)
    return say(`${t('share')} → ${sp.entry.label}`);
  }

  async function apply(result) {
    if (!result) return null;
    if (result.once) { // a copy: the connection, and everything so far once, now
      for (const change of result.edits ?? [result.edit]) await edit(change);
      const from = result.once.from == null ? own : s.open.get(result.once.from)?.store;
      const to = s.open.get(result.once.n)?.store;
      if (!from || !to) return say(t('notReachable'));
      const r = await copyRoute(from, to, { kinds: ['v', 'a', 'x', 'l', 'm'], skip: await skip() }).catch(() => null);
      return say(r ? t('run.ok', { label: ctx.tileOf(result.once.n)?.label ?? '', n: r.copied.length }) : t('notReachable'));
    }
    if (result.action === 'share') return shareTo(result.n);
    if (result.give) { // my Nextcloud dropped on another account: the line, and the share now
      for (const change of result.edits ?? [result.edit]) await edit(change);
      const entry = s.entries[result.give.n - 1];
      const cloudId = entry?.path?.startsWith('cloud:') ? entry.path.slice(6) : cloudIdOf(readPaste(entry?.path ?? ''));
      return cloudId ? giveOut(ctx, result.give.from, cloudId) : say(t('notReachable'));
    }
    if (result.action === 'give') { // ↑: an account on the clipboard = shared to it (it comes in as a tile); else my WebDAV address
      const cloudId = cloudIdOf(readPaste(await clipboardText()));
      if (cloudId && ctx.tileOf(result.n)?.canGive) return giveToAccount(ctx, result.n, cloudId);
      return giveOut(ctx, result.n, 'link');
    }
    for (const change of result.edits ?? [result.edit]) await edit(change);
    return null;
  }

  async function tapped(role) {
    if (!role) return show(false); // a tap beside the sheet = back
    if (role === 'sheet') return null; // the sheet itself
    const [what, a, b] = role.split(':');
    if (what === 'sp' && a === '0') return null; // this device: its gestures are drags
    if (what === 'sp') {
      const tile = ctx.tileOf(Number(a));
      if (tile?.state === 'cloud') return askAccount(ctx, tile.n); // my cloud id copied, their server opens
      if (tile?.state === 'error') { // not reachable at start: try again now, then catch up
        const back = await reopen(s.open, s.entries, { keychain, own, folders });
        if (back.length) { onSources(sources(s.rules, s.open, own)); await run(tile.n); }
        return draw();
      }
      if (tile?.state === 'waiting') { // permission needs a tap; then its rules catch up
        const back = await reconnect(s.open, folders, { ask: true, only: tile.n });
        if (back.length) {
          onSources(sources(s.rules, s.open, own));
          await run(tile.n);
        }
        return draw();
      }
      return apply(gestureOn(targetFor(tile, 'tap'), 'tap', s.rules));
    }
    if (what === 'sp-kind') return apply(gestureOn(targetFor(ctx.tileOf(Number(a)), 'tap-kind'), 'tap-kind', s.rules, { kind: b }));
    if (what === 'add') return addNew(ctx); // the one + tile
    if (what === 'browse') return browseChips(ctx)[Number(a)]?.go();
    if (what === 'incoming') return acceptWaiting(ctx, s.incoming[Number(a)]);
    if (what === 'hello') return welcome(ctx, s.hellos[Number(a)]).then(load).then(draw);
    if (what === 'accept-there') {
      const { url } = s.acceptThere;
      s.acceptThere = null;
      draw();
      return openPage(url);
    }
    return null;
  }

  // ---------- drawing ----------
  function draw() {
    const { width: w, height: h } = panel.getBoundingClientRect();
    const browse = s.browse ? browseChips(ctx) : null;
    const incoming = s.incoming.map((x) => ({ label: x.share.name }));
    const hellos = s.hellos.map((x) => ({ label: x.name, n: x.n })); // n: the group they said hello to
    const view = pointShapes(all(), { own: person.label, focus: s.focus, waitSecret: Boolean(s.waitSecret), browse, incoming, acceptThere: s.acceptThere, hellos, joinStates: s.joinStates }, { w, h });
    svg.innerHTML = toSvg(view, { w, h });
    note.textContent = s.note;
  }

  // ---------- touch: the role is read when the finger goes down ----------
  let role = null;
  const roleOf = (el) => el?.closest?.('[data-role]')?.dataset.role ?? null;
  const circleOf = (r) => (r?.startsWith('sp:') ? Number(r.split(':')[1]) : null);
  const handlers = {
    down: (e) => {
      role = roleOf(e.target); // double-tap is free here (13.11.: encryption is no gesture), so a tap never waits
    },
    tap: () => tapped(role),

    swipe: (dir) => {
      if (role === 'sheet' && (dir === 'down' || dir === 'down-far')) return show(false); // pulled down = egal, nothing changes
      if (role?.startsWith('bridge:') && (dir === 'down' || dir === 'down-far')) { // ↓ on a line = cut it
        const [, a, b] = role.split(':');
        return apply(gestureOn(Number(b), 'cut', s.rules, { from: Number(a) }));
      }
      const n = circleOf(role);
      if (n === 0 && dir === 'up') return checkKey(ctx).then((k) => copy(k)).then(() => say(t('copied'))); // ↑ on my own tile: my check key (for project.json)
      if (!n) return null;
      const tile = ctx.tileOf(n);
      if (tile?.drop && (dir === 'down' || dir === 'down-far')) { // a group goes with both its links, the higher number first
        return apply({ edits: [Math.max(n, tile.drop), Math.min(n, tile.drop)].map((x) => ({ remove: x })) });
      }
      return apply(gestureOn(n, dir, s.rules));
    },
    dragEnd: (el, moved) => {
      const from = circleOf(role);
      if (!moved && from === 0) return onOwnHold(); // my own tile held still: the onboarding again
      if (!moved) return from ? apply(gestureOn(targetFor(ctx.tileOf(from), 'hold'), 'hold', s.rules, { selection: selection(), private: ctx.tileOf(from)?.private })) : null; // held still: new goes there
      const onto = circleOf(roleOf(el));
      if (from === 0 && onto && s.joinStates.get(ctx.tileOf(onto)?.label) === 'door') { // me onto the door's hello bubble = hello
        const label = ctx.tileOf(onto).label;
        return helloToDoor(ctx, label).then((m) => { if (m) s.joinStates.set(label, m.state); onHello(); draw(); });
      }
      if (from && onto === 0) return home(from); // onto this device: bring its files here (a backup is restored)
      if (from && ctx.tileOf(from)?.canGive && roleOf(el) === 'add:new') return makeOrRenew(ctx, from); // my Nextcloud onto + = a group (read + drop link)
      const target = onto ? ctx.tileOf(onto) : null;
      const give = Boolean(from && ctx.tileOf(from)?.canGive && target && (target.state === 'cloud' || s.open.get(onto)?.spec?.kind === 'nextcloud')); // my Nextcloud onto another account
      if (give) return apply(gestureOn(onto, 'drop-point', s.rules, { from, give: true }));
      return from != null && onto ? apply(gestureOn(onto, 'drop-point', s.rules, { from, private: ctx.tileOf(onto)?.private })) : null; // carried onto another: copy (encrypted when only I read it)
    },
  };
  bind(panel, handlers);

  /** A tile dropped on this device: its files come here once (no rule); a backup is opened and restored. */
  async function home(n) {
    const store = s.open.get(n)?.store;
    if (!store) return say(t('notReachable'));
    try {
      const r = await bringHome(store, own, { keychain, host: await host(), paper, skip: await skip() });
      say(r.restored ? t('home.restored', { n: r.restored.length }) : t('home.copied', { n: r.copied.length }));
      onSources(sources(s.rules, s.open, own)); // Similar sees what came home
    } catch { say(t('home.key')); } // a backup of another device: the paper password on the clipboard opens it
  }

  await load();
  setInterval(async () => { // every 30 s: a disk plugged in again, a sharing point online again, what is due
    let changed = false;
    for (const n of await reconnect(s.open, folders)) { changed = true; await run(n).catch(() => {}); }
    if (globalThis.navigator?.onLine !== false && [...s.open.values()].some((sp) => sp.error)) {
      if ((await reopen(s.open, s.entries, { keychain, own, folders })).length) changed = true;
    }
    if (changed) onSources(sources(s.rules, s.open, own));
    await run().catch(() => {});
    if (changed && !panel.hidden) draw();
  }, 30e3);

  function show(on) {
    panel.hidden = !on;
    if (on) draw();
  }
  return {
    show,
    async afterTake(paths) {
      const files = await Promise.all(paths.map(async (path) => ({ path, bytes: await own.read(path) })));
      const result = await afterTake(s.rules, s.open, files);
      if (result.failed.length) { // e.g. offline: the copy rule of that sharing point runs again on the next tick
        s.last = retry(s.last, s.rules, [...new Set(result.failed.map(([n]) => n))]);
        keep('sign.upkeep', s.last);
      }
      return result;
    },
    runRules: () => run(), // what is due (all new rules at the first start)
    /** The name sign was just taken: the hello to the project's door goes out now. */
    joinProject: () => joinProject(ctx, project).then((started) => (started ? load().then(draw) : null)),
    /** A ring arc dropped on tile n (app.js): that strand always goes there. */
    dropKind: (n, kind) => apply(gestureOn(targetFor(ctx.tileOf(n), 'drop-kind'), 'drop-kind', s.rules, { kind })),
  };
}
