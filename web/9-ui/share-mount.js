// share-mount.js — draws the share menu (share-menu.js) and carries out what is tapped.
//
// Purpose:   keeps the list in force, its rules and the opened sharing points together; after
//            every change of the list it reopens them and hands the search its sources (show rules).
//            Paste instead of typing: a link, an address, a Nextcloud server (one click, native app),
//            a cloud id; when a sharing point asks for a password, the next paste goes into the
//            keychain by its q_ and is never shown.
// Depends:   browser; 2-storage (list, sharing-points, login-flow, nextcloud), 4-save/share-take,
//            9-ui (share-menu, touch, system-share, keychain given by the app)
// Test:      needs a browser; the parts are tested in tests/list.test.mjs and tests/ui.test.mjs.
// Limits:    one list per device store; a login waits up to 20 min (login-flow.js).

import { findList, changeList, rulesOf } from '../2-storage/list.js';
import { readList } from '../2-storage/sharing-point.js';
import { openAll, afterTake, sources, readPaste, runRules } from '../2-storage/sharing-points.js';
import { startLogin, waitLogin } from '../2-storage/login-flow.js';
import { webdavUrl } from '../2-storage/nextcloud.js';
import { shareTake } from '../4-save/share-take.js';
import { newSource } from '../1-model/ids.js';
import { timeLabel } from '../1-model/filename.js';
import { tiles, tileChips, chipEdit, tileNote, MENU_KINDS } from './share-menu.js';
import { bind } from './touch.js';
import { send } from './system-share.js';

const dec = new TextDecoder();
const el = (tag, cls, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });

/**
 * own: the device store · keychain: { get, set } · person: { id, label } · device: q_ · t: translator ·
 * lastChain(): path of the newest take chain · onSources(list): new sources for the search.
 * → { panel, show(on), afterTake(paths), shareLast(), runRules() }
 */
export async function mountShareMenu({ panel, own, keychain, person, device, t, lastChain, onSources = () => {} }) {
  const s = { entries: [], rules: [], open: new Map(), hold: null, focus: null, waitSecret: null, note: '' };
  const meta = () => ({ device, person, now: Date.now(), time: timeLabel(Date.now()) });

  async function load() {
    const at = await findList(own);
    const text = at ? dec.decode(await own.read(at)) : '';
    s.entries = text ? readList(text) : [];
    s.rules = text ? rulesOf(text) : [];
    s.open = await openAll(s.entries, { keychain, own });
    onSources(sources(s.rules, s.open, own));
  }
  async function edit(change) { await changeList(own, change, meta()); await load(); draw(); }
  const say = (text) => { s.note = text; draw(); };

  async function shareTo(n) {
    const sp = s.open.get(n), chainPath = await lastChain();
    if (!sp?.store || !chainPath) return say(t('notReachable'));
    s.focus = n;
    const rule = s.rules.find((r) => r.to === n && r.from == null && (r.mark === 'always' || r.mark === 'ask'));
    await shareTake({ own, chainPath, device: { id: device, label: device }, person, now: Date.now(),
      targets: [{ entry: { ...sp.entry, always: rule?.kinds?.length ? rule.kinds : MENU_KINDS }, description: sp.description ?? { kinds: MENU_KINDS }, store: sp.store }] });
    say(`${t('share')} → ${sp.entry.label}`);
  }

  async function paste() {
    let text = '';
    try { text = globalThis.Capacitor?.Plugins?.Clipboard ? (await globalThis.Capacitor.Plugins.Clipboard.read()).value : await navigator.clipboard.readText(); } catch { return say(t('notReachable')); }
    if (s.waitSecret) { await keychain.set(s.waitSecret, text.trim()); s.waitSecret = null; await load(); return say(t('copied')); }
    const what = readPaste(text);
    if (!what || what.kind === 'cloud') return say(what ? t('menu.native') : t('menu.paste'));
    const id = newSource();
    if (what.kind === 'login') {
      try {
        const { login, poll } = await startLogin(what.server);
        globalThis.open?.(login, '_blank');
        const got = await waitLogin(poll);
        await keychain.set(id, got.appPassword);
        return edit({ add: { label: got.user, path: webdavUrl(got.server, got.user), id }, marks: ['show', 'write'] });
      } catch { return say(t('menu.native')); } // the browser is blocked (CORS); the app is not
    }
    await edit({ add: { path: what.path, id }, marks: ['show'] });
    const sp = [...s.open.values()].find((x) => x.entry.id === id);
    try { await sp.store.list('chain/'); } catch { s.waitSecret = id; say(t('menu.secret')); }
  }

  function draw() {
    const row = (cls) => panel.appendChild(el('div', `row ${cls}`));
    panel.replaceChildren();
    const share = row('system').appendChild(el('span', 'chip', t('share')));
    share.onclick = async () => send({ text: person.label });
    const list = row('points');
    for (const tile of tiles(s.entries, s.rules, s.open)) {
      const box = list.appendChild(el('div', `tile ${tile.state}${s.focus === tile.n ? ' focus' : ''}`));
      box.append(el('b', '', tile.label), el('small', '', tileNote(tile, t)));
      bind(box, { tap: () => shareTo(tile.n), hold: () => { s.hold = s.hold === tile.n ? null : tile.n; draw(); },
        swipe: (d) => (d === 'down' ? edit({ remove: tile.n }) : d === 'up' ? shareTo(tile.n) : null) });
      if (s.hold !== tile.n) continue;
      const chips = list.appendChild(el('div', 'tile-chips'));
      for (const chip of tileChips(tile, t)) {
        const c = chips.appendChild(el('span', `chip${chip.on ? ' on' : ''}`, chip.label));
        c.onclick = () => { const change = chipEdit(tile.n, chip, s.rules); if (change) edit(change); };
      }
    }
    const add = row('add').appendChild(el('span', 'chip', `← ${t(s.waitSecret ? 'menu.secret' : 'menu.paste')}`));
    add.onclick = paste;
    if (s.note) row('note').textContent = s.note;
  }

  bind(panel, { swipe: (d) => (d === 'left' ? paste() : null) });
  await load();
  return {
    panel,
    show(on) { panel.hidden = !on; if (on) draw(); },
    async afterTake(paths) {
      const files = await Promise.all(paths.map(async (path) => ({ path, bytes: await own.read(path) })));
      return afterTake(s.rules, s.open, files);
    },
    shareLast: () => (s.focus ? shareTo(s.focus) : (panel.hidden = false, draw())),
    runRules: async () => runRules(s.rules, s.open, { own, backupKey: await keychain.get('backup') }), // opened once by backup-key.js
  };
}
