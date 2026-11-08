// app.js — the web app: one display, strand fields, the point. Only wiring; the meaning of every
// gesture is in gestures.js, the detection in touch.js (decision 08.11., 18.07):
//   point: tap = all strands that are on · hold = while held · double-tap = always ready · ← → replay
//   strand: tap = on/off · hold = only this strand while held · hold audio and drop on text = text of it
//   live picture: tap = focus · hold = video while held · ← → front/back · pinch = zoom
//   edges: upper left own · middle left strands · upper right Similar · middle right share · top full
// Depends:   browser; 0-i18n, 1-model, 2-storage/local, 3-index, 4-save, 5-take, 9-ui
//   share menu: tiles of the sharing points, chips on hold, ← paste one in (share-mount.js)
// Test/Limits: needs a browser (parts tested in tests/ui.test.mjs, tests/list.test.mjs); no Whisper yet.

import { translator } from '../0-i18n/t.js';
import { LocalStore } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { saveTake } from '../4-save/save-take.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { newPerson, newSource } from '../1-model/ids.js';
import { actionFor } from './gestures.js';
import { normalize, readyStep, choose } from './settings.js';
import { glyph } from './glyph.js';
import { glyphSvg } from './render.js';
import { watch } from './ready.js';
import { flip, zoomBy, focusAt, torch } from './camera.js';
import { bind, edgeZone } from './touch.js';
import { ownChips, strandChips, similarChips, draw } from './panels.js';
import { mountShareMenu } from './share-mount.js';
import { keychain } from './keychain.js';

const $ = (sel) => document.querySelector(sel);
const keep = (k, make) => { try { return localStorage.getItem(k) ?? (localStorage.setItem(k, make()), localStorage.getItem(k)); } catch { return make(); } };

export async function start({ locales, lang = navigator.language.slice(0, 2) }) {
  const t = translator(locales, lang);
  let settings = normalize(JSON.parse(keep('sign.settings', () => '{}')));
  const save = () => { try { localStorage.setItem('sign.settings', JSON.stringify(settings)); } catch {} };
  const person = { id: keep('sign.person', newPerson), label: keep('sign.name', () => t('take.name')) };
  const device = keep('sign.device', newSource);
  const store = new LocalStore(await navigator.storage.getDirectory());
  let stream = await openDevices(navigator.mediaDevices, { facing: settings.facing });
  $('#live').srcObject = stream;
  const state = { recording: null, only: null, on: new Set(settings.auto), ready: settings.ready, torch: false, replay: -1, sources: [{ name: 'own', store }], lastChain: null };
  state.index = await buildIndex(state.sources);
  const menu = await mountShareMenu({ panel: $('#share'), own: store, keychain, person, device, t, lastChain: async () => state.lastChain,
    onSources: async (src) => { state.sources = src; state.index = await buildIndex(src); } });
  menu.runRules().catch(() => {}); // copies and backups of the list, quietly in the background
  const events = [];
  const onActivity = (e) => {
    events.push(e); while (events.length > 100) events.shift();
    const step = readyStep({ ...settings, ready: state.ready }, events, Boolean(state.recording), e.at);
    if (step === 'start') begin(); else if (step === 'stop') end();
  };
  let unwatch = watch(stream, onActivity, { video: $('#live') });

  const paint = () => {
    $('#point').innerHTML = glyphSvg(glyph({ recording: Boolean(state.recording), ready: state.ready }), 96);
    for (const f of document.querySelectorAll('[data-strand]')) f.classList.toggle('on', state.on.has(f.dataset.strand));
  };
  async function begin(only = null) {
    if (state.recording || state.replay >= 0) return;
    state.only = only;
    const tap = await browserTap(stream);
    state.recording = startTake(stream, { MediaRecorder, tapAudio: () => tap });
    const tick = (ts) => { if (state.recording) { state.recording.frame(ts); requestAnimationFrame(tick); } };
    requestAnimationFrame(tick); paint();
  }
  async function end() {
    if (!state.recording) return;
    const take = await state.recording.stop();
    const strands = state.only ? new Set([state.only]) : state.on;
    state.recording = null; state.only = null; paint();
    const saved = await saveTake({ device, person, now: Date.now(), lengthMs: take.lengthMs, context: '', store,
      video: strands.has('v') ? take.video : null, audio: strands.has('a') ? take.audio : null });
    state.lastChain = saved.chain.path;
    await menu.afterTake(saved.paths); // (always) rules of the list
    state.index = await buildIndex(state.sources);
    return take;
  }
  async function replay(step) {
    const videos = (await store.list('take/')).map((f) => f.path).filter((p) => p.endsWith('.v.mp4')).sort().reverse();
    state.replay = Math.max(-1, Math.min(videos.length - 1, state.replay + step));
    const v = $('#replay');
    v.hidden = state.replay < 0;
    if (state.replay >= 0) { v.src = URL.createObjectURL(new Blob([await store.read(videos[state.replay])], { type: 'video/mp4' })); v.play(); }
  }
  const panel = (id, on, chips, onChip) => { $(id).hidden = !on; if (on) draw($(id), chips, onChip); };
  const showOwn = (on) => panel('#own', on, ownChips(settings, t), (c) => { settings = choose(settings, c.key, c.value); state.on = new Set(settings.auto); save(); paint(); showOwn(true); });
  const showSimilar = (on) => panel('#similar', on, similarChips(state.index, [...state.index.tables.context.keys()].slice(-3)));

  async function act(gesture, target, x = {}) {
    const row = actionFor({ gesture, target: target === 'strand' && gesture === 'drag' ? x.drag : target, mode: state.recording ? 'take' : 'search' });
    switch (row?.action) {
      case 'take': return state.recording ? end() : begin();
      case 'take-while-held': return begin();
      case 'ready': state.ready = !state.ready; settings = choose(settings, 'ready', state.ready); save(); return paint();
      case 'replay-back': return replay(+1);
      case 'replay-on': return replay(-1);
      case 'strand-on-off': state.on.has(x.k) ? state.on.delete(x.k) : state.on.add(x.k); return paint();
      case 'strand-while-held': return begin(x.k ?? 'v');
      case 'transcribe': return; // EXTEND(S2, whisper): text of the audio just taken (5-take/whisper.js)
      case 'chips-in': return panel('#chips', true, strandChips(x.k, state), async (c) => { state.torch = c.value; await torch(stream, state.torch); act('up', 'strand', x); });
      case 'chips-out': return panel('#chips', false);
      case 'hide-strand': return $(`[data-strand="${x.k}"]`).classList.add('hidden');
      case 'strands-in': return document.querySelectorAll('[data-strand]').forEach((f) => f.classList.remove('hidden'));
      case 'focus': return focusAt(stream, x.x, x.y);
      case 'switch-camera': if (state.recording) return; settings = choose(settings, 'facing', settings.facing === 'user' ? 'environment' : 'user'); save(); unwatch(); stream = await flip(stream, settings.facing); $('#live').srcObject = stream; unwatch = watch(stream, onActivity, { video: $('#live') }); return;
      case 'own-in': return showOwn(true);
      case 'own-out': return showOwn(false);
      case 'similar-in': return showSimilar(true);
      case 'similar-out': return showSimilar(false);
      case 'share-last': return menu.shareLast();
      case 'share-menu': return menu.show(true);
      case 'share-menu-out': return menu.show(false);
      case 'full': document.body.classList.add('full'); return document.documentElement.requestFullscreen?.().catch(() => {});
      case 'unfull': document.body.classList.remove('full'); return document.exitFullscreen?.().catch(() => {});
      default: return null;
    }
  }

  bind($('#point'), { tap: () => act('tap', 'point'), doubleTap: () => act('double-tap', 'point'), hold: () => act('hold', 'point'), holdEnd: end, swipe: (d) => act(d, 'point') });
  bind($('#live'), { tap: (px, py) => act('tap', 'live', { x: px, y: py }), hold: () => act('hold', 'live'), holdEnd: end, swipe: (d) => act(d, 'live'), pinch: (f) => zoomBy(stream, f) });
  for (const f of document.querySelectorAll('[data-strand]')) {
    const k = f.dataset.strand;
    bind(f, { tap: () => act('tap', 'strand', { k }), hold: () => act('hold', 'strand', { k }), swipe: (d) => act(d, 'strand', { k }), holdEnd: end,
      dragEnd: (el) => { const to = el?.dataset?.strand; if (to && to !== k) act('drag', 'strand', { k, drag: `strand:${k}>strand:${to}` }); } });
  }
  let edge = null;
  addEventListener('pointerdown', (e) => { edge = { zone: edgeZone(e.clientX, e.clientY, innerWidth, innerHeight), x: e.clientX, y: e.clientY }; }, true);
  addEventListener('pointerup', (e) => {
    const z = edge?.zone, dx = e.clientX - (edge?.x ?? 0), dy = e.clientY - (edge?.y ?? 0); edge = null;
    if (z === 'top-middle' && Math.abs(dy) > 50) act(dy < 0 ? 'up' : 'down', 'top-middle');
    else if (z?.endsWith('left') && dx > 60) act('edge-in', z);
    else if (z?.endsWith('right') && dx < -60) act('edge-in', z);
  }, true);
  $('#own').addEventListener('pointerup', (e) => { if (e.clientX < 72) act('edge-out', 'upper-left'); });
  $('#similar').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 72) act('edge-out', 'upper-right'); });
  $('#share').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 24) act('edge-out', 'middle-right'); });
  paint();
}
