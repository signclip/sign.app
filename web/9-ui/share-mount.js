// share-mount.js — draws the share menu (share-menu.js) and carries out what is tapped.
//
// Purpose:   keeps the list in force, its rules and the opened sharing points together; after
//            every change of the list it reopens them and hands the search its sources (show rules).
//            ↑ on the point = pick: only tiles that can take the last take, tap = share there.
//            A folder or disk that comes back (checked every 30 s) gets its rules run at once:
//            backup and copies catch up by themselves, nothing to press.
// Depends:   browser; 2-storage (list, sharing-point, sharing-points), 4-save/share-take,
//            9-ui (share-menu, share-add, folders, touch, system-share)
// Test:      needs a browser; the parts are tested in tests/list.test.mjs and tests/ui.test.mjs.
// Limits:    one list per device store; 30 s until a plugged-in disk is noticed (browser: only while
//            the app is open, and after one tap on its tile per session for permission).

import { findList, changeList, rulesOf } from '../2-storage/list.js';
import { readList } from '../2-storage/sharing-point.js';
import { openAll, afterTake, sources, runRules, reconnect } from '../2-storage/sharing-points.js';
import { shareTake } from '../4-save/share-take.js';
import { timeLabel } from '../1-model/filename.js';
import { tiles, tileChips, chipEdit, tileNote, pickable, MENU_KINDS } from './share-menu.js';
import { bringIn, pickFolder, giveOut } from './share-add.js';
import { folders, canPick } from './folders.js';
import { bind } from './touch.js';
import { send } from './system-share.js';

const dec = new TextDecoder();
const el = (tag, cls, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });

/**
 * own: the device store · keychain: { get, set } · person: { id, label } · device: q_ · t: translator ·
 * lastChain(): path of the newest take chain · onSources(list): new sources for the search.
 * → { show(on), pick(), afterTake(paths), runRules() }
 */
export async function mountShareMenu({ panel, own, keychain, person, device, t, lastChain, onSources = () => {} }) {
  const s = { entries: [], rules: [], open: new Map(), hold: null, focus: null, pick: false, waitSecret: null, giveTo: null, note: '' };
  const meta = () => ({ device, person, now: Date.now(), time: timeLabel(Date.now()) });
  const all = () => tiles(s.entries, s.rules, s.open);
  const run = async (only = null) => runRules(only ? s.rules.filter((r) => r.to === only || r.from === only) : s.rules,
    s.open, { own, backupKey: await keychain.get('backup') }); // the backup key, opened once by backup-key.js

  async function load() {
    const at = await findList(own);
    const text = at ? dec.decode(await own.read(at)) : '';
    s.entries = text ? readList(text) : [];
    s.rules = text ? rulesOf(text) : [];
    s.open = await openAll(s.entries, { keychain, own, folders });
    onSources(sources(s.rules, s.open, own));
  }
  async function edit(change) { await changeList(own, change, meta()); await load(); draw(); }
  const say = (text) => { s.note = text; draw(); };
  const ctx = { s, keychain, edit, load, say, t, tileOf: (n) => all().find((x) => x.n === n), all };

  async function tap(tile) {
    if (tile.state === 'waiting') { // permission needs a tap; then its rules catch up
      if ((await reconnect(s.open, folders, { ask: true, only: tile.n })).length) { onSources(sources(s.rules, s.open, own)); await run(tile.n); }
      return draw();
    }
    const sp = s.open.get(tile.n), chainPath = await lastChain();
    if (!sp?.store || !chainPath) return say(t('notReachable'));
    s.focus = tile.n; s.pick = false;
    const rule = s.rules.find((r) => r.to === tile.n && r.from == null && (r.mark === 'always' || r.mark === 'ask'));
    await shareTake({ own, chainPath, device: { id: device, label: device }, person, now: Date.now(),
      targets: [{ entry: { ...sp.entry, always: rule?.kinds?.length ? rule.kinds : MENU_KINDS }, description: sp.description ?? { kinds: MENU_KINDS }, store: sp.store }] });
    say(`${t('share')} → ${sp.entry.label}`);
  }

  function draw() {
    const row = (cls) => panel.appendChild(el('div', `row ${cls}`));
    panel.replaceChildren();
    if (s.pick) row('note').textContent = t('menu.pick');
    else row('system').appendChild(el('span', 'chip', t('share'))).onclick = () => send({ text: person.label });
    const list = row('points');
    for (const tile of s.pick ? pickable(all()) : all()) {
      const box = list.appendChild(el('div', `tile ${tile.state}${s.focus === tile.n ? ' focus' : ''}`));
      box.append(el('b', '', tile.label), el('small', '', tileNote(tile, t)));
      bind(box, { tap: () => tap(tile), hold: () => { s.hold = s.hold === tile.n ? null : tile.n; draw(); },
        swipe: (d) => (d === 'down' ? edit({ remove: tile.n }) : d === 'up' ? tap(tile) : null) });
      if (s.hold !== tile.n || s.pick) continue;
      const chips = list.appendChild(el('div', 'tile-chips'));
      for (const chip of tileChips(tile, t)) {
        chips.appendChild(el('span', `chip${chip.on ? ' on' : ''}`, chip.label)).onclick = () => {
          if (chip.key === 'give') return giveOut(ctx, tile.n, chip.value);
          const change = chipEdit(tile.n, chip, s.rules);
          if (change) edit(change);
        };
      }
    }
    if (s.pick) return;
    const add = row('add');
    add.appendChild(el('span', 'chip', `← ${t(s.waitSecret ? 'menu.secret' : 'menu.paste')}`)).onclick = () => bringIn(ctx);
    if (canPick()) add.appendChild(el('span', 'chip', t('menu.folder'))).onclick = () => pickFolder(ctx);
    if (s.note) row('note').textContent = s.note;
  }

  bind(panel, { swipe: (d) => (d === 'left' && !s.pick ? bringIn(ctx) : null) });
  await load();
  setInterval(async () => { // a disk plugged in again → its rules run (backup, copies)
    for (const n of await reconnect(s.open, folders)) { onSources(sources(s.rules, s.open, own)); await run(n).catch(() => {}); draw(); }
  }, 30e3);
  return {
    show(on) { panel.hidden = !on; if (!on) s.pick = false; else draw(); },
    pick() { s.pick = true; panel.hidden = false; draw(); },
    async afterTake(paths) {
      const files = await Promise.all(paths.map(async (path) => ({ path, bytes: await own.read(path) })));
      return afterTake(s.rules, s.open, files);
    },
    runRules: () => run(),
  };
}
