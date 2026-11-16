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
import { takeSvg, nowHtml, rowHtml } from './paint.js';
import { similarHtml } from './paint-similar.js';
import { sharingView } from './paint-sharing.js';
import { seriesRow, nowWords } from './chips.js';
import { hintOf, onboardingSeries } from './onboarding-steps.js';
import { listen } from './touch.js';
import { takeFlow } from './take-flow.js';
import { similarFlow } from './similar-flow.js';
import { mediaOf } from './media.js';
import { gesturesOf } from './gestures-take.js';
import { mountSharing } from './sharing-engine.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { hintSvg } from './hint.js';

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
  let st = { ...A.st, strands: { v: settings.auto.includes('v'), a: settings.auto.includes('a'), x: settings.auto.includes('x') } };
  const lines = read('sign.lines', null);
  if (lines?.length) st = { ...st, lines, at: lines.at(-1).takes.length };
  st = { ...st, context: localStorage.getItem('sign.series') ?? '', sticky: localStorage.getItem('sign.sticky') ?? '' };
  const words = read('sign.words', null) ?? drawWords(PASSWORD_PARTS.length - 1);
  keep('sign.words', words);
  const nameSign = Boolean(localStorage.getItem('sign.nameSign')), gestures = read('sign.passwords', []).length;
  st = { ...st, onboard: { ...st.onboard, on: settings.onboarding && (!nameSign || gestures < PASSWORD_PARTS.length), name: person.label, nameSign, gestures, words } };
  if (st.onboard.on) st = { ...st, context: onboardingSeries({ ...st.onboard, own: '' }) };
  A.st = st;
  A.keepLines = () => keep('sign.lines', A.st.lines.map((l) => ({ ...l, takes: l.takes.map(({ thumb, ...x }) => x) })));

  let frame = 0;
  A.paint = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
  A.dispatch = (e) => {
    const before = A.st;
    A.st = next(A.st, e);
    if (A.st.strands !== before.strands) keep('sign.settings', { ...settings, auto: Object.keys(A.st.strands).filter((k) => A.st.strands[k]) });
    if (A.st.context !== before.context && !A.st.onboard.on) keep('sign.series', A.st.context);
    if (A.st.similar !== before.similar || A.st.filters !== before.filters || A.st.context !== before.context) A.similar?.refresh();
    if (A.st.similar === 'closed' && before.similar !== 'closed') A.similar?.close();
    A.paint();
  };
  A.shake = (role) => { const el = document.querySelector(`[data-role="${role}"]`); el?.classList.add('shake'); setTimeout(() => el?.classList.remove('shake'), 400); navigator.vibrate?.([40, 40, 40]); };
  A.say = (text) => { A.data.note = text; A.paint(); setTimeout(() => { if (A.data.note === text) { A.data.note = ''; A.paint(); } }, 2600); };
  A.take = takeFlow(A);
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
    words: () => nowWords(A.st.context, A.st.sticky).map((w) => w.text),
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
  const size = () => ({ w: innerWidth, h: innerHeight, keyboard: A.st.keyboard });
  function paint() {
    const st = A.st, L = takeLayout(size(), st.similar);
    A.L = L;
    const win = $('#window');
    Object.assign(win.style, { left: `${L.cx - L.R}px`, top: `${L.cy - L.R}px`, width: `${2 * L.R}px`, height: `${2 * L.R}px` });
    win.classList.toggle('off', !st.strands.v);
    win.classList.toggle('gone', st.similar === 'full');
    const svg = takeSvg(st, L, { thumbs: A.data.thumbs, buttonPic: A.data.buttonPic, cut: A.data.cut, wideTicks: A.data.wideTicks });
    if ($('#take').dataset.svg !== svg) { $('#take').innerHTML = svg; $('#take').dataset.svg = svg; }
    $('#take').classList.toggle('gone', st.similar === 'full');
    const row = seriesRow(st.context, st.sticky);
    $('#now').innerHTML = st.strands.x && st.similar !== 'full' ? nowHtml(nowWords(st.context, st.sticky), L, st.onboard.on ? ['Name', ...st.onboard.words] : []) : '';
    const rowEl = $('#row');
    rowEl.style.top = `${L.queueY}px`;
    rowEl.classList.toggle('typing', st.typing);
    rowEl.classList.toggle('gone', st.similar === 'full' || !st.strands.x);
    rowEl.innerHTML = rowHtml(row, { waiting: st.onboard.on && st.onboard.nameSign && st.onboard.gestures === PASSWORD_PARTS.length - 1 && !st.onboard.ownTyped && !st.typing, all: st.typing, caret: st.caret, typing: st.typing ? A.data.typing : '', offers: st.onboard.on ? ['Name', ...st.onboard.words] : [] });
    $('#similar').innerHTML = similarHtml(st, A.data.entries ?? [], L, A.data.similarLists ?? {});
    $('#note').textContent = A.data.note ?? '';
    const o = st.onboard;
    const h = o.on ? hintOf({ ...o, takeNow: st.rec !== 'idle', shareOpen: st.share, join: A.data.sharing?.door?.look }) : null;
    const hint = hintSvg(h, { L, sharing: A.data.sharing?.layout ?? null, w: innerWidth, h: innerHeight });
    if ($('#hint').dataset.svg !== hint) { $('#hint').innerHTML = hint; $('#hint').dataset.svg = hint; }
  }
  function paintSharing() {
    if (!A.data.snap) return;
    const v = sharingView(A.data.snap, { w: innerWidth, h: innerHeight }, { drag: A.data.drag });
    A.data.sharing = v;
    $('#sharing-svg').innerHTML = v.svg;
    $('#sharing-html').innerHTML = v.html;
    A.paint();
  }
  A.paintSharing = paintSharing;

  // ---------- touches and keys ----------
  const g = gesturesOf(A);
  listen($('#screen'), g.onEvent);
  const say = $('#say');
  say.addEventListener('input', () => { A.data.typing = say.value; A.similar.refresh(); A.paint(); });
  say.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); say.blur(); } }); // Enter = done: the keyboard goes, blur commits
  say.addEventListener('blur', () => { g.commit(); A.dispatch({ type: 'typing', on: false }); });
  const vv = globalThis.visualViewport;
  vv?.addEventListener('resize', () => A.dispatch({ type: 'keyboard', px: Math.max(0, innerHeight - vv.height - vv.offsetTop) }));
  addEventListener('resize', () => { A.paint(); paintSharing(); });
  addEventListener('hashchange', () => { if (location.hash) return; if (A.st.share) A.engine?.show(false); else if (A.st.similar !== 'closed') A.dispatch({ type: 'similar', level: 'closed' }); });

  // thumbs of the kept line, then the camera after the first paint (15.11.)
  for (const line of A.st.lines) for (const take of line.takes) {
    const chain = [...(A.index?.tables.chains.values() ?? [])].find((c) => c.from?.path === take.id);
    if (chain) A.media.picOf(A.media.visualOf(chain)).then((url) => { if (url) { A.data.thumbs[take.id] = url; A.paint(); } });
  }
  paint();
  requestAnimationFrame(() => document.body.classList.add('ready'));
  setTimeout(() => A.take.openCamera(), 350);
  A.engine?.runRules?.().catch(() => {});
  globalThis.SIGN = A; // for the debugging console only
}
