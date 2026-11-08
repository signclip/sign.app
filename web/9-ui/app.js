// app.js — the first web-app shell: one display, four strand fields, the point. Wires gestures to
// modules; holds no logic of its own (that lives in gestures, settings, glyph, 4-save, 5-take).
//
// Purpose:   tap point = take on/off · hold point = take while held · double-tap = always ready ·
//            hold a strand field = only these strands · double-tap the video field = front/back ·
//            upper right edge = Similar in/out · upper left edge = own settings as chips.
// Depends:   browser (camera, OPFS, localStorage), 0-i18n, 2-storage/local, 3-index, 4-save, 5-take,
//            7-similar, 9-ui (gestures, settings, glyph, render)
// Test:      not in node (needs a browser); its parts are tested in tests/ui.test.mjs.
// Limits:    first shell for the test day: no Whisper yet, no share menu yet (next steps).

import { translator } from '../0-i18n/t.js';
import { LocalStore } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { saveTake } from '../4-save/save-take.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { combinedSimilar } from '../7-similar/combine.js';
import { newPerson, newSource } from '../1-model/ids.js';
import { actionFor } from './gestures.js';
import { normalize, readyStep, choose, CHOICES } from './settings.js';
import { watch } from './ready.js';
import { glyph } from './glyph.js';
import { glyphSvg } from './render.js';

const HOLD_MS = 400, DOUBLE_MS = 300, EDGE_PX = 48;
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
  const events = [];
  let unwatch = () => {};
  function onActivity(e) {
    events.push(e); while (events.length > 100) events.shift();
    const step = readyStep({ ...settings, ready: state.ready }, events, Boolean(state.recording), e.at);
    if (step === 'start') begin(); else if (step === 'stop') end();
  }
  async function switchCamera() {
    if (state.recording) return;
    settings = choose(settings, 'facing', settings.facing === 'user' ? 'environment' : 'user'); save();
    unwatch(); stream.getTracks().forEach((tr) => tr.stop());
    stream = await openDevices(navigator.mediaDevices, { facing: settings.facing });
    $('#live').srcObject = stream;
    unwatch = watch(stream, onActivity, { video: $('#live') });
  }
  const state = { recording: null, held: new Set(), ready: settings.ready, lastTap: 0, index: await buildIndex([{ name: 'own', store }]) };

  unwatch = watch(stream, onActivity, { video: $('#live') }); // after state exists
  const draw = () => { $('#point').innerHTML = glyphSvg(glyph({ recording: Boolean(state.recording), ready: state.ready }), 96); };
  for (const field of document.querySelectorAll('[data-strand]')) {
    field.setAttribute('aria-label', t(`kind.${field.dataset.strand}`));
    field.onpointerdown = () => { state.held.add(field.dataset.strand); field.classList.add('held'); };
    let lastTap = 0;
    field.onpointerup = field.onpointercancel = () => {
      state.held.delete(field.dataset.strand); field.classList.remove('held');
      const now = performance.now();
      if (now - lastTap < DOUBLE_MS) act('double-tap', `strand:${field.dataset.strand}`);
      lastTap = now;
    };
  }

  async function begin() {
    if (state.recording) return;
    const tap = await browserTap(stream);
    state.recording = startTake(stream, { MediaRecorder, tapAudio: () => tap });
    const tick = (ts) => { if (state.recording) { state.recording.frame(ts); requestAnimationFrame(tick); } };
    requestAnimationFrame(tick);
    draw();
  }
  async function end() {
    if (!state.recording) return;
    const take = await state.recording.stop();
    state.recording = null;
    draw();
    const strands = state.held.size ? state.held : new Set(settings.auto);
    await saveTake({ device, person, now: Date.now(), lengthMs: take.lengthMs, context: '', store,
      video: strands.has('v') ? take.video : null, audio: strands.has('a') ? take.audio : null });
    state.index = await buildIndex([{ name: 'own', store }]);
  }
  const act = async (gesture, target) => {
    const row = actionFor({ gesture, target, mode: state.recording ? 'take' : 'search' });
    if (!row) return;
    if (row.action === 'take') return state.recording ? end() : begin();
    if (row.action === 'take-while-held') return begin();
    if (row.action === 'ready') { state.ready = !state.ready; settings = choose(settings, 'ready', state.ready); save(); return draw(); }
    if (row.action === 'switch-camera') return switchCamera();
    if (row.action === 'own-in') return showOwn(true);
    if (row.action === 'own-out') return showOwn(false);
    if (row.action === 'similar-in') return showSimilar(true);
    if (row.action === 'similar-out') return showSimilar(false);
  };

  let downAt = 0, held = false, timer = null;
  $('#point').onpointerdown = () => { downAt = performance.now(); held = false; timer = setTimeout(() => { held = true; act('hold', 'point'); }, HOLD_MS); };
  $('#point').onpointerup = () => {
    clearTimeout(timer);
    if (held) return end();
    const now = performance.now();
    if (now - state.lastTap < DOUBLE_MS) { state.lastTap = 0; return act('double-tap', 'point'); }
    state.lastTap = now;
    setTimeout(() => { if (state.lastTap === now) act('tap', 'point'); }, DOUBLE_MS);
  };

  let edge = null;
  document.body.onpointerdown = (e) => {
    const top = e.clientY < EDGE_PX * 3;
    edge = top && innerWidth - e.clientX < EDGE_PX ? ['right', e.clientX] : top && e.clientX < EDGE_PX ? ['left', e.clientX] : null;
  };
  document.body.onpointerup = (e) => {
    if (edge?.[0] === 'right' && edge[1] - e.clientX > 60) act('edge-in', 'upper-right');
    if (edge?.[0] === 'left' && e.clientX - edge[1] > 60) act('edge-in', 'upper-left');
    edge = null;
  };
  $('#similar').onpointerup = (e) => { if (e.clientX > innerWidth - EDGE_PX) act('edge-out', 'upper-right'); };
  $('#own').onpointerup = (e) => { if (e.clientX < EDGE_PX) act('edge-out', 'upper-left'); };

  function showOwn(on) {
    $('#own').hidden = !on;
    if (!on) return;
    const chip = (key, value, label, on) => Object.assign(document.createElement('span'), { className: `chip${on ? ' on' : ''}`, textContent: label, onclick: () => { settings = choose(settings, key, value); save(); showOwn(true); } });
    const sec = (ms) => `${ms / 1000} s`;
    $('#own').replaceChildren(
      ...CHOICES.waitStartMs.map((v) => chip('waitStartMs', v, `▶ ${sec(v)}`, settings.waitStartMs === v)),
      ...CHOICES.waitStopMs.map((v) => chip('waitStopMs', v, `■ ${sec(v)}`, settings.waitStopMs === v)),
      ...['v', 'a', 'x', 'l'].map((k) => chip('auto', k, t(`kind.${k}`), settings.auto.includes(k))),
      ...CHOICES.facing.map((f) => chip('facing', f, f === 'user' ? '◐' : '◑', settings.facing === f)));
  }

  function showSimilar(on) {
    $('#similar').hidden = !on;
    if (!on) return;
    const words = [...state.index.tables.context.keys()].slice(-3);
    $('#similar').replaceChildren(...combinedSimilar(state.index, [{ kind: 'x', words }]).map((h) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = h.strand?.head?.['@'] ?? '·';
      return chip;
    }));
  }
  draw();
}
