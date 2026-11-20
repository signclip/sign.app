// app.js — the web app (rewritten 16.11.): wiring only. What the screen is: take-state.js · where: layout.js · how it
// looks: paint*.js · what a gesture means: gestures-take.js · the devices: take-flow.js · Similar: similar-flow.js ·
// the sharing menu: sharing-engine.js (its logic taken over from the version until 16.11.).
//
// Start (15.11.): the background with the take window centred, then the shapes, then the camera fades in inside it.
// Kept on the device per person (persons.js PERSONAL): the strands (settings.auto), the line, the series, sticky,
// the onboarding (name, name sign, password gestures, the two drawn words).
// Depends:   browser; 0-i18n, 2-storage/local, 3-index, 9-ui
// Test:      every part without a screen in tests/ui.test.mjs; the whole in Chrome and on the phone.
// Limits:    one paint per animation frame at most; the index is rebuilt after each take (≈ 5 ms per 100 files).

import './persons-boot.js';
import { translator } from '../0-i18n/t.js';
import { LocalStore, lasting } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { newPerson, newSource } from '../1-model/ids.js';
import { drawWords } from '../1-model/words.js';
import { normalize } from './settings.js';
import { deviceKeys } from './device-keys.js';
import { keychain } from './keychain.js';
import { installDebug } from './debug.js';
import { initial, next } from './take-state.js';
import { takeLayout } from './layout.js';
import { outline } from './form.js';
import { takeSvg, nowHtml, rowHtml } from './paint.js';
import { similarHtml } from './paint-similar.js';
import { sharingView } from './paint-sharing.js';
import { seriesRow, nowWords } from './chips.js';
import { hintOf, onboardingSeries } from './onboarding-steps.js';
import { listen } from './touch.js';
import { takeFlow } from './take-flow.js';
import { similarFlow } from './similar-flow.js';
import { mediaOf } from './media.js';
import { playerOf } from './player.js';
import { live as isLive, count as takesOn } from './take-state.js';
import { gesturesOf } from './gestures-take.js';
import { calmOf } from './calm.js';
import { mountSharing } from './sharing-engine.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { hintSvg } from './hint.js';
import { installDavFetch } from '../2-storage/dav-fetch.js';

installDavFetch(); // native app: PROPFIND, MKCOL, MOVE through the app's own plugin (17.11.: lost in the rewrite, so the door never answered in the APK)
installDebug();
const $ = (sel) => document.querySelector(sel);
const kept = (key, make) => { try { if (localStorage.getItem(key) == null) localStorage.setItem(key, make()); return localStorage.getItem(key); } catch { return make(); } };
const keep = (key, value) => { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* private mode */ } };
const read = (key, d) => { try { const v = localStorage.getItem(key); return v == null ? d : JSON.parse(v); } catch { return d; } };

export async function start({ locales, lang = navigator.language.slice(0, 2) }) {
  const t = translator(locales, lang);
  const settings = normalize(read('sign.settings', {}));
  const person = { id: kept('sign.person', newPerson), label: localStorage.getItem('sign.name') || '' };
  const device = kept('sign.device', newSource);
  const store = new LocalStore(await navigator.storage.getDirectory());
  store.lasting = await lasting();
  const A = { t, settings, person, device, store, sources: [{ name: 'own', store, write: true }], index: null, engine: null,
    st: initial(), data: { thumbs: {}, buttonPic: null, entries: [], typing: '', hint: null, sharing: null, drag: null } };
  const ownKeys = await deviceKeys().then((k) => ({ [device]: k.device.public }), () => ({}));
  A.reindex = async () => { A.index = await buildIndex(A.sources, { keys: ownKeys, cache: store }); A.similar?.refresh(); };
  A.index = await buildIndex(A.sources, { keys: ownKeys, cache: store }).catch(() => null);
  A.media = mediaOf(store, () => A);

  // ---------- state, kept on the device ----------
  let st = { ...A.st, form: settings.shape, strands: { v: settings.auto.includes('v'), a: settings.auto.includes('a'), x: settings.auto.includes('x') } };
  const lines = read('sign.lines', null);
  if (lines?.length) st = { ...st, lines, at: lines.at(-1).takes.length };
  st = { ...st, context: localStorage.getItem('sign.series') ?? '', sticky: localStorage.getItem('sign.sticky') ?? '' };
  const words = read('sign.words', null) ?? drawWords(PASSWORD_PARTS.length - 1);
  keep('sign.words', words);
  const nameSign = Boolean(localStorage.getItem('sign.nameSign')), gestures = read('sign.passwords', []).length;
  st = { ...st, onboard: { ...st.onboard, on: settings.onboarding && (!nameSign || gestures < PASSWORD_PARTS.length), name: person.label, nameSign, gestures, words } };
  if (st.onboard.on) st = { ...st, context: onboardingSeries({ ...st.onboard, own: '' }) };
  A.st = st;
  A.keepLines = () => keep('sign.lines', A.st.lines.filter((l) => !l.guest).map((l) => ({ ...l, takes: l.takes.map(({ thumb, ...x }) => x) })));

  let frame = 0;
  A.paint = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
  A.dispatch = (e) => {
    const before = A.st;
    A.st = next(A.st, e);
    if (A.st.strands !== before.strands || A.st.form !== before.form) { settings.auto = Object.keys(A.st.strands).filter((k) => A.st.strands[k]); settings.shape = A.st.form; keep('sign.settings', settings); }
    if (A.st.context !== before.context && !A.st.onboard.on) keep('sign.series', A.st.context);
    if (A.st.similar !== before.similar || A.st.filters !== before.filters || A.st.context !== before.context) A.similar?.refresh();
    if (A.st.similar === 'closed' && before.similar !== 'closed') A.similar?.close();
    if ((A.st.at !== before.at || A.st.rec !== before.rec) && A.st.wide < 0.02 && !A.similar?.comparing) A.showAt?.();
    if (A.st.dstrands !== before.dstrands || A.st.pick !== before.pick || A.st.similar !== before.similar) A.similar?.sound?.(); // the double view's sound (20.11.)
    A.paint();
  };
  A.shake = (role) => { const el = document.querySelector(`[data-role="${role}"]`); el?.classList.add('shake'); setTimeout(() => el?.classList.remove('shake'), 400); navigator.vibrate?.([40, 40, 40]); };
  A.say = (text) => { A.data.note = text; A.paint(); setTimeout(() => { if (A.data.note === text) { A.data.note = ''; A.paint(); } }, 2600); };
  A.keepSettings = () => keep('sign.settings', settings);
  A.take = takeFlow(A);
  A.calm = calmOf(A); // the button's times: start when calm, end by itself (20.11.)
  A.player = playerOf(A, $('#replay'));
  /** The window shows what the button holds: live, or the earlier take's picture (17.11.). */
  A.showAt = () => { const s = A.st; if (isLive(s) || s.rec !== 'idle') return A.player.stop(); const take = s.lines.at(-1).takes[Math.min(s.at, takesOn(s) - 1)]; return take ? A.player.show(take, 0) : A.player.stop(); };
  A.similar = similarFlow(A);

  // ---------- onboarding: the app teaches itself (onboarding-steps.js) ----------
  A.onboardTook = async (paths) => {
    const o = A.st.onboard;
    if (!o.on) return;
    const visual = paths.find((p) => /\.v\.(mp4|webm|png)$/.test(p)) ?? paths.find((p) => p.endsWith('.x.sign')) ?? paths[0];
    if (!o.nameSign) { keep('sign.nameSign', visual); A.dispatch({ type: 'onboard', patch: { nameSign: true } }); }
    else {
      const list = [...read('sign.passwords', []), visual].slice(-PASSWORD_PARTS.length);
      keep('sign.passwords', list);
      A.dispatch({ type: 'onboard', patch: { gestures: list.length } });
      if (list.length >= PASSWORD_PARTS.length) A.engine?.joinProject().catch(() => {});
    }
    syncOnboardSeries();
  };
  function syncOnboardSeries() {
    const o = A.st.onboard;
    if (!o.on) return;
    A.dispatch({ type: 'context', text: onboardingSeries({ ...o, own: o.own ?? '' }) });
    const h = hintOf({ ...o, takeNow: A.st.rec !== 'idle', shareOpen: A.st.share, join: A.data.sharing?.door?.look });
    if (h.similar && A.st.similar === 'closed') { A.dispatch({ type: 'similar', level: 'many' }); if (!A.data.entries?.length) A.dispatch({ type: 'similar', level: 'closed' }); } // to learn the sign, if Similar knows it
    if (h.step === 'done') { A.dispatch({ type: 'onboard', patch: { on: false } }); keep('sign.series', ''); A.dispatch({ type: 'context', text: '' }); }
  }
  A.syncOnboard = syncOnboardSeries;

  // ---------- the sharing menu ----------
  const panel = $('#sharing');
  const project = await fetch(new URL('../project.json', import.meta.url)).then((r) => r.json()).catch(() => null);
  A.engine = await mountSharing({
    panel, project, own: store, keychain, person, device, t,
    onDraw: (snap) => { A.data.snap = snap; paintSharing(); },
    lastChain: async () => A.take.lastChain(),
    selection: () => Object.keys(A.st.strands).filter((k) => A.st.strands[k]),
    onSources: async (list) => { A.sources = list; await A.reindex(); },
    words: () => (A.st.onboard.on ? [] : nowWords(A.st.context, A.st.sticky).map((w) => w.text)), // the onboarding's own words ("Name", the drawn ones) find nobody
    onDoor: (state) => { A.data.door = state; A.paint(); },
    onRole: () => { if (A.st.onboard.on) { A.dispatch({ type: 'onboard', patch: { on: false } }); A.dispatch({ type: 'context', text: '' }); keep('sign.series', ''); } }, // Admin, Atlas, Groups: their login is their account, no steps
    index: () => A.index,
    nameSign: async () => { const p = localStorage.getItem('sign.nameSign'); return p ? store.read(p).catch(() => null) : null; },
    helloTakes: async ({ door = false } = {}) => {
      const name = localStorage.getItem('sign.nameSign'), list = read('sign.passwords', []);
      return [...(name ? [{ from: store, visual: name, part: 'name sign', words: ['hello'] }] : []),
        ...(door ? list.slice(0, PASSWORD_PARTS.length).map((visual, i) => ({ from: store, visual, part: PASSWORD_PARTS[i], words: [words[i] ?? A.st.onboard.own ?? ''].filter(Boolean) })) : [])];
    },
    onHello: () => A.syncOnboard(),
    onLook: () => {}, onLookAll: (items) => { A.engine.show(false); A.similar.lookAt(items); },
  }).catch((err) => { console.warn('sharing', err); return null; });
  new MutationObserver(() => { if (A.st.share === panel.hidden) A.dispatch({ type: 'share', open: !panel.hidden }); A.syncOnboard(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  // ---------- painting ----------
  // The keyboard (17.11.): a browser shrinks only the visual viewport, Android's web view shrinks the whole window. Both
  // count: the tallest window seen at this width is the screen, what is missing below is the keyboard.
  const full = { w: 0, h: 0 };
  const measure = () => {
    if (full.w !== innerWidth) { full.w = innerWidth; full.h = 0; } // turned: measured anew
    const vv = globalThis.visualViewport, seen = Math.min(innerHeight, vv ? vv.height + vv.offsetTop : innerHeight);
    const typing = document.activeElement === $('#say');
    if (!typing || seen > full.h) full.h = Math.max(full.h, innerHeight);
    return Math.max(0, Math.round(full.h - seen), typing ? A.data.nativeKeyboard ?? 0 : 0);
  };
  // The APK (20.11.): with the margins for edge to edge the web view never shrinks for the keyboard; Capacitor's Keyboard
  // plugin says how tall it is (CSS px, with the navigation bar below it: the row sits a little higher, never covered).
  const nativeKeyboard = (px) => { A.data.nativeKeyboard = px; keyboardNow(); };
  globalThis.Capacitor?.Plugins?.Keyboard?.addListener?.('keyboardWillShow', (e) => nativeKeyboard(e?.keyboardHeight ?? 0));
  globalThis.Capacitor?.Plugins?.Keyboard?.addListener?.('keyboardWillHide', () => { nativeKeyboard(0); if (A.st.typing) $('#say').blur(); }); // closed by Android (back, swipe): done writing
  const size = () => ({ w: innerWidth, h: full.h || innerHeight, keyboard: A.st.keyboard });
  function paint() {
    const st = A.st, L = takeLayout(size(), st.similar, st.form, A.data.picture ?? 1);
    A.L = L;
    const win = $('#window'), m = L.media, focus = $('#focus'); // the picture covers the window (form.js cover); only what lies inside the window is seen (20.11., user)
    Object.assign(win.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px`, clipPath: `path('${outline(L, 0, m.x, m.y)}')` });
    Object.assign(focus.style, { left: `${L.cx - L.rx}px`, top: `${L.cy - L.ry}px`, width: `${2 * L.rx}px`, height: `${2 * L.ry}px`, clipPath: `path('${outline(L, 0, L.cx - L.rx, L.cy - L.ry)}')` });
    focus.classList.toggle('gone', st.similar === 'full');
    win.classList.toggle('off', !st.strands.v);
    win.classList.toggle('gone', st.similar === 'full');
    const svg = takeSvg(st, L, { thumbs: A.data.thumbs, buttonPic: A.data.buttonPic, cut: A.data.cut, lineShift: A.data.lineShift, split: A.data.split, calm: A.data.calm, timers: A.data.timers, auto: A.settings.restartMs != null });
    if ($('#take').dataset.svg !== svg) { $('#take').innerHTML = svg; $('#take').dataset.svg = svg; }
    $('#take').classList.toggle('gone', st.similar === 'full');
    const row = seriesRow(st.context, st.sticky);
    const nowText = st.strands.x && st.similar !== 'full' ? nowHtml(nowWords(st.context, st.sticky), L, st.onboard.on ? ['Name', ...st.onboard.words] : []) : '';
    if ($('#now').dataset.html !== nowText) { $('#now').innerHTML = nowText; $('#now').dataset.html = nowText; } // written only when it changed: the button's arc repaints often (calm.js)
    const rowEl = $('#row');
    rowEl.style.top = `${L.queueY}px`;
    rowEl.classList.toggle('typing', st.typing);
    rowEl.classList.toggle('gone', st.similar === 'full' || !st.strands.x);
    const rowText = rowHtml(row, { waiting: st.onboard.on && st.onboard.nameSign && st.onboard.gestures === PASSWORD_PARTS.length - 1 && !st.onboard.ownTyped && !st.typing, all: st.typing, on: st.typing, caret: st.caret, typing: st.typing ? A.data.typing : '', offers: st.onboard.on ? ['Name', ...st.onboard.words] : [] });
    if (rowEl.dataset.html !== rowText) { rowEl.innerHTML = rowText; rowEl.dataset.html = rowText; }
    const sim = similarHtml(st, A.data.entries ?? [], L, { ...(A.data.similarLists ?? {}), picked: A.data.picked ?? null });
    if ($('#similar').dataset.text !== sim) { $('#similar').innerHTML = sim; $('#similar').dataset.text = sim; }
    const cg = $('#carry'), c = A.data.carry; // what is carried follows the finger
    cg.hidden = !c;
    if (c) Object.assign(cg.style, { left: `${c.x - 34}px`, top: `${c.y - 34}px`, backgroundImage: c.pic ? `url("${c.pic}")` : 'none' });
    const pv = $('#pickvideo'), db = st.similar === 'double' ? L.doubleBox : null; // the picked result plays in its own element (17.11.): a repaint no longer stops it
    pv.hidden = !db;
    pv.style.visibility = st.dstrands?.v === false ? 'hidden' : ''; // the picture strand of the double view off: only context and sound (20.11.)
    if (db) { Object.assign(pv.style, { left: `${db.x}px`, top: `${db.y}px`, width: `${db.w}px`, height: `${db.h}px`, clipPath: `path('${outline(L.double, 0, db.x, db.y)}')` }); const e = (A.data.picked?.key === st.pick ? A.data.picked : null) ?? (A.data.entries ?? []).find((x) => x.key === st.pick); if (e?.thumb && pv.poster !== e.thumb) pv.poster = e.thumb; }
    else if (pv.src) { pv.pause(); pv.removeAttribute('src'); pv.poster = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; pv.load(); } // transparent: never the WebView's grey placeholder
    $('#note').textContent = A.data.note ?? '';
    const o = st.onboard;
    let h = o.on ? hintOf({ ...o, takeNow: st.rec !== 'idle', shareOpen: st.share, join: A.data.sharing?.door?.look }) : null;
    if (A.data.door === 'ready' && !st.share) h = { step: 'join', role: 'button', gesture: 'swipe-up' }; // the admin answered (17.11.): the button shows the way to join
    if (st.share && h && h.role !== 'hello') h = null; // the menu is open: nothing of the take pulses through it
    const hint = hintSvg(h, { L, sharing: A.data.sharing?.layout ?? null, w: innerWidth, h: innerHeight });
    if ($('#hint').dataset.svg !== hint) { $('#hint').innerHTML = hint; $('#hint').dataset.svg = hint; }
    if (!st.typing && A.data.wasTyping) toStart(rowEl); // done writing: a long row glides back to its start, the next words in sight (20.11.)
    A.data.wasTyping = st.typing;
    if (st.typing) { // the caret stays in sight in a long row (17.11.)
      const c = rowEl.querySelector('.chip.typing') ?? rowEl.querySelector('.gap.caret');
      if (c) { const a = c.getBoundingClientRect(), mid = a.left + a.width / 2; if (mid < 40 || mid > innerWidth - 40) rowEl.scrollLeft += mid - innerWidth / 2; }
    }
  }
  /** The row glides back to its beginning (≈ 450 ms, slowing down); a finger on it stops the glide. */
  function toStart(el) {
    const from = el.scrollLeft, t0 = performance.now();
    if (from < 1) return;
    const step = (now) => { const f = Math.max(0, Math.min(1, (now - t0) / 450)); if (el.dataset.gliding !== String(t0)) return; el.scrollLeft = from * (1 - f) ** 3; if (f < 1) requestAnimationFrame(step); else delete el.dataset.gliding; };
    el.dataset.gliding = String(t0);
    el.addEventListener('touchstart', () => delete el.dataset.gliding, { once: true });
    requestAnimationFrame(step);
  }
  function paintSharing() {
    if (!A.data.snap) return;
    const v = sharingView(A.data.snap, { w: innerWidth, h: innerHeight }, { drag: A.data.drag });
    A.data.sharing = v;
    if ($('#sharing-svg').dataset.text !== v.svg) { $('#sharing-svg').innerHTML = v.svg; $('#sharing-svg').dataset.text = v.svg; }
    if ($('#sharing-html').dataset.text !== v.html) { // only when something changed: the share row stays where the finger left it, what breathes keeps its beat
      const at = $('#sharing-html .row')?.scrollLeft ?? 0;
      $('#sharing-html').innerHTML = v.html; $('#sharing-html').dataset.text = v.html;
      const row = $('#sharing-html .row'); if (row && at) row.scrollLeft = at;
    }
    A.paint();
  }
  A.paintSharing = paintSharing;

  // ---------- touches and keys ----------
  const g = gesturesOf(A);
  // what the window shows decides how the picture covers it (20.11.): the camera (asked 1:1, the device decides), a take, a file
  const picture = () => { const r = $('#replay'), v = r && !r.hidden && r.videoWidth ? r : $('#live'); const a = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1; if (Math.abs(a - (A.data.picture ?? 1)) > 0.01) { A.data.picture = a; A.paint(); } };
  for (const v of [$('#live'), $('#replay')]) for (const e of ['loadedmetadata', 'resize', 'play']) v.addEventListener(e, picture);
  new MutationObserver(picture).observe($('#replay'), { attributes: true, attributeFilter: ['hidden'] });
  A.pictureAspect = () => A.data.picture ?? 1;
  listen($('#screen'), (ev, e) => { A.calm.poke(); return g.onEvent(ev, e); }); // a touch is input: no start by itself under a finger
  const say = $('#say');
  say.addEventListener('input', () => { A.calm.poke(); A.data.typing = say.value; A.similar.refresh(); A.paint(); });
  say.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); say.blur(); } }); // Enter = done: the keyboard goes, blur commits
  say.addEventListener('blur', () => { g.commit(); A.dispatch({ type: 'typing', on: false }); });
  const keyboardNow = () => { const px = measure(); if (px !== A.st.keyboard) A.dispatch({ type: 'keyboard', px }); else A.paint(); };
  globalThis.visualViewport?.addEventListener('resize', keyboardNow);
  globalThis.visualViewport?.addEventListener('scroll', keyboardNow);
  say.addEventListener('focus', () => setTimeout(keyboardNow, 300));
  addEventListener('resize', () => { keyboardNow(); paintSharing(); });
  // Android's back button (native app; also lost in the rewrite): one step back — typing, the sharing menu's lists, the menu, Similar — then the app goes to the background
  globalThis.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
    if (A.st.typing) return say.blur();
    if (A.st.share) return A.engine?.back?.() ? null : A.engine?.show(false);
    if (A.st.similar !== 'closed') return A.dispatch({ type: 'similar', level: A.st.similar === 'double' ? 'many' : 'closed' });
    if (A.st.wide > 0.02) return A.dispatch({ type: 'wide', spread: 0 });
    return globalThis.Capacitor.Plugins.App.minimizeApp?.();
  });
  addEventListener('hashchange', () => { if (location.hash) return; if (A.st.share) A.engine?.show(false); else if (A.st.similar !== 'closed') A.dispatch({ type: 'similar', level: 'closed' }); });

  // thumbs of the kept line, then the camera after the first paint (15.11.)
  for (const line of A.st.lines) for (const take of line.takes) {
    const chain = [...(A.index?.tables.chains.values() ?? [])].find((c) => c.from?.path === take.id);
    if (chain) A.media.picOf(A.media.visualOf(chain)).then((url) => { if (url) { A.data.thumbs[take.id] = url; A.paint(); } });
  }
  measure();
  paint();
  requestAnimationFrame(() => document.body.classList.add('ready'));
  setTimeout(() => A.take.openCamera(), 350);
  A.engine?.runRules?.().catch(() => {});
  globalThis.SIGN = A; // for the debugging console only
}
