// share-mount.js — puts the sharing points on the screen after ↑ on the point and carries out the gestures.
//
// Purpose:   keeps the list in force, its rules and the opened sharing points together; after every change
//            of the list it reopens them and hands Similar its sources (show rules). What a gesture means
//            is in share-menu.js, how it looks in view/points.js; this file only listens and calls.
//            A folder or disk that comes back (checked every 30 s) gets its rules run at once: backup and
//            copies catch up by themselves.
// Depends:   browser; 2-storage (list, sharing-point, sharing-points), 4-save/share-take,
//            9-ui (share-menu, share-add, folders, touch, view/points, view/ring)
// Test:      needs a browser; the parts are tested in tests/list.test.mjs and tests/ui.test.mjs.
// Limits:    one list per device store; 30 s until a plugged-in disk is noticed (browser: only while the
//            app is open, and after one tap on its circle per session for permission).

import { findList, changeList, rulesOf } from '../2-storage/list.js';
import { readList } from '../2-storage/sharing-point.js';
import { openAll, afterTake, sources, runRules, reconnect } from '../2-storage/sharing-points.js';
import { readPaste } from '../2-storage/spec.js';
import { shareTake } from '../4-save/share-take.js';
import { timeLabel } from '../1-model/filename.js';
import { tiles, gestureOn, KINDS } from './share-menu.js';
import { bringIn, pickFolder, giveOut, browseChips, waitingShares, acceptWaiting, openPage } from './share-add.js';
import { folders } from './folders.js';
import { bind } from './touch.js';
import { pointShapes } from './view/points.js';
import { toSvg } from './view/ring.js';

const dec = new TextDecoder();

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
 * onSources(list): new sources for Similar.
 * → { show(on), afterTake(paths), runRules(), dropKind(n, kind) }
 */
export async function mountShareMenu({ panel, own, keychain, person, device, t, lastChain, selection = () => KINDS, onSources = () => {} }) {
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
    note: '', // one short line under the circles
  };
  const svg = document.createElement('div');
  svg.className = 'points';
  const note = document.createElement('div');
  note.className = 'note';
  panel.append(svg, note);

  const meta = () => ({ device, person, now: Date.now(), time: timeLabel(Date.now()) });
  const all = () => tiles(s.entries, s.rules, s.open);
  const run = async (only = null) => {
    const rules = only == null ? s.rules : s.rules.filter((r) => r.to === only || r.from === only);
    return runRules(rules, s.open, { own, backupKey: await keychain.get('backup') }); // the key, opened once by backup-key.js
  };

  async function load() {
    const at = await findList(own);
    const text = at ? dec.decode(await own.read(at)) : '';
    s.entries = text ? readList(text) : [];
    s.rules = text ? rulesOf(text) : [];
    s.open = await openAll(s.entries, { keychain, own, folders });
    onSources(sources(s.rules, s.open, own));
    waitingShares(ctx).then((list) => { s.incoming = list; if (!panel.hidden) draw(); }); // asks in the background
  }
  async function edit(change) {
    await changeList(own, change, meta());
    await load();
    draw();
  }
  const say = (text) => { s.note = text; draw(); };
  const ctx = { s, keychain, edit, load, say, t, all, tileOf: (n) => all().find((x) => x.n === n), draw: () => draw() };

  // ---------- doing what a gesture says ----------
  async function shareTo(n) {
    const sp = s.open.get(n);
    const chainPath = await lastChain();
    if (!sp?.store || !chainPath) return say(t('notReachable'));
    s.focus = n;
    const tile = ctx.tileOf(n);
    const target = { entry: { ...sp.entry, always: tile.kinds.length ? tile.kinds : KINDS }, description: sp.description ?? { kinds: KINDS }, store: sp.store };
    await shareTake({ own, chainPath, device, person, now: Date.now(), targets: [target] });
    return say(`${t('share')} → ${sp.entry.label}`);
  }

  async function apply(result) {
    if (!result) return null;
    if (result.action === 'share') return shareTo(result.n);
    if (result.action === 'give') { // a cloud id on the clipboard = to it, else the WebDAV address onto the clipboard
      const pasted = readPaste(await clipboardText());
      return giveOut(ctx, result.n, pasted?.kind === 'cloud' ? pasted.cloudId : 'link');
    }
    for (const change of result.edits ?? [result.edit]) await edit(change);
    return null;
  }

  async function tapped(role) {
    if (!role) return show(false); // a tap beside the circles = back
    const [what, a, b] = role.split(':');
    if (what === 'sp' && a === '0') return null; // this device: its gestures are drags
    if (what === 'sp') {
      const tile = ctx.tileOf(Number(a));
      if (tile?.state === 'waiting') { // permission needs a tap; then its rules catch up
        const back = await reconnect(s.open, folders, { ask: true, only: tile.n });
        if (back.length) {
          onSources(sources(s.rules, s.open, own));
          await run(tile.n);
        }
        return draw();
      }
      return apply(gestureOn(Number(a), 'tap', s.rules));
    }
    if (what === 'sp-kind') return apply(gestureOn(Number(a), 'tap-kind', s.rules, { kind: b }));
    if (what === 'add' && a === 'paste') return bringIn(ctx);
    if (what === 'add' && a === 'folder') return pickFolder(ctx);
    if (what === 'browse') return browseChips(ctx)[Number(a)]?.go();
    if (what === 'incoming') return acceptWaiting(ctx, s.incoming[Number(a)]);
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
    const view = pointShapes(all(), { own: person.label, focus: s.focus, waitSecret: Boolean(s.waitSecret), browse, incoming, acceptThere: s.acceptThere }, { w });
    svg.innerHTML = toSvg(view, { w, h });
    note.textContent = s.note;
  }

  // ---------- touch: the role is read when the finger goes down ----------
  let role = null;
  const roleOf = (el) => el?.closest?.('[data-role]')?.dataset.role ?? null;
  const circleOf = (r) => (r?.startsWith('sp:') ? Number(r.split(':')[1]) : null);
  function doubled(r) {
    const [what, a, b] = r.split(':');
    if (what === 'sp' && a !== '0') return apply(gestureOn(Number(a), 'double-tap', s.rules, { selection: selection() }));
    if (what === 'bridge') return apply(gestureOn(Number(b), 'double-tap-bridge', s.rules, { from: Number(a) }));
    return null;
  }
  const handlers = {
    down: (e) => {
      role = roleOf(e.target);
      const doubles = role?.startsWith('sp:') || role?.startsWith('bridge:');
      handlers.doubleTap = doubles ? () => doubled(role) : undefined; // only circles and bridges wait for a second tap
    },
    tap: () => tapped(role),

    swipe: (dir) => {
      const n = circleOf(role);
      return n ? apply(gestureOn(n, dir, s.rules)) : null;
    },
    dragEnd: (el, moved) => {
      const from = circleOf(role);
      if (!moved) return from ? apply(gestureOn(from, 'hold', s.rules)) : null; // held still: bring in / out
      const onto = circleOf(roleOf(el));
      return from != null && onto ? apply(gestureOn(onto, 'drop-point', s.rules, { from })) : null; // carried onto another: copy
    },
  };
  bind(panel, handlers);

  await load();
  setInterval(async () => { // a disk plugged in again → its rules run (backup, copies)
    for (const n of await reconnect(s.open, folders)) {
      onSources(sources(s.rules, s.open, own));
      await run(n).catch(() => {});
      if (!panel.hidden) draw();
    }
  }, 30e3);

  function show(on) {
    panel.hidden = !on;
    if (on) draw();
  }
  return {
    show,
    async afterTake(paths) {
      const files = await Promise.all(paths.map(async (path) => ({ path, bytes: await own.read(path) })));
      return afterTake(s.rules, s.open, files);
    },
    runRules: () => run(),
    /** A ring arc dropped on circle n (app.js): that strand always goes there. */
    dropKind: (n, kind) => apply(gestureOn(n, 'drop-kind', s.rules, { kind })),
  };
}
