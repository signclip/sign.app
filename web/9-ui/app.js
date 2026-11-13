// app.js — the web app: wiring only. What a gesture means is in gestures.js, what the screen does next
// in state.js, how it looks in view/ring.js, where it lands on the screen in screen.js.
//
//   point: tap = take with the strands that are on · hold = take while held · double-tap = always ready
//          ↑ share (choose where) · ↓ set aside · all the way ↓ delete · ← → replay, in a line next/before
//   strand arc: tap = on/off (stays until changed) · hold = only this strand while held · ↑ its chips · ← hide
//   chip: hold = record more strands to it (kept solid, new dashed) · ↓ take this context away
//   live picture: tap = focus · hold = video while held · ← → front/back camera · pinch = zoom
//   edges: upper left own · middle left strands · upper right Similar · middle right share · top full
// Depends:   browser; 0-i18n, 1-model, 2-storage/local, 3-index, 4-save, 5-take, 7-similar, 9-ui
// Test:      needs a browser; every part is tested on its own (tests/ui, state, view, list, similar).
// Limits:    no Whisper yet (no chips from speech, no keywords); one take records at a time.

import { translator } from '../0-i18n/t.js';
import { LocalStore } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { saveTake } from '../4-save/save-take.js';
import { removeStrands } from '../4-save/remove.js';
import { saveSimilar } from '../4-save/save-similar.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { similar } from '../7-similar/filter.js';
import { newPerson, newSource } from '../1-model/ids.js';
import { readFile } from '../1-model/file.js';
import { actionFor } from './gestures.js';
import { startState, next, toRecord, toKeep } from './state.js';
import { mountScreen, targetOf } from './screen.js';
import { normalize, readyStep, choose } from './settings.js';
import { watch } from './ready.js';
import { flip, zoomBy, focusAt, torch } from './camera.js';
import { bind, edgeZone } from './touch.js';
import { ownChips, strandChips, draw } from './panels.js';
import { filterChips, toggle, filtersOf, EMPTY } from './similar-filter.js';
import { mountShareMenu } from './share-mount.js';
import { keychain } from './keychain.js';

const $ = (sel) => document.querySelector(sel);
const dec = new TextDecoder();

/** A value kept in this browser, made once. */
function kept(key, make) {
  try {
    if (localStorage.getItem(key) == null) localStorage.setItem(key, make());
    return localStorage.getItem(key);
  } catch {
    return make();
  }
}

export async function start({ locales, lang = navigator.language.slice(0, 2) }) {
  const t = translator(locales, lang);
  let settings = normalize(JSON.parse(kept('sign.settings', () => '{}')));
  const saveSettings = () => { try { localStorage.setItem('sign.settings', JSON.stringify(settings)); } catch { /* private mode */ } };
  const person = { id: kept('sign.person', newPerson), label: kept('sign.name', () => t('take.name')) };
  const device = kept('sign.device', newSource);
  const store = new LocalStore(await navigator.storage.getDirectory());

  let camera = await openDevices(navigator.mediaDevices, { facing: settings.facing });
  $('#live').srcObject = camera;

  // ---------- what is going on ----------
  let st = startState(settings.auto); // one strand selection for everything, kept until changed
  if (settings.ready) st = next(st, { action: 'ready' });
  const data = { chips: [], levels: [], similar: [], line: null, versions: 1, timeMs: null, hidden: [] };
  const take = { recorder: null, lastChain: null, lastKinds: [], replayAt: -1 };
  let filter = EMPTY; // the chips of Similar: wer · wo · wann · was
  let sources = [{ name: 'own', store }];
  let index = await buildIndex(sources);

  const screen = mountScreen({ root: $('#screen'), live: $('#live'), replay: $('#replay'), template: $('#template'), overlay: $('#overlay') });
  const paint = () => screen.paint(st, data);
  const step = (action, extra = {}) => { st = next(st, { action, ...extra }); paint(); };

  const menu = await mountShareMenu({
    panel: $('#share'), own: store, keychain, person, device, t,
    lastChain: async () => take.lastChain,
    onSources: async (list) => { sources = list; index = await buildIndex(sources); },
  });
  menu.runRules().catch(() => {}); // copies and backups of the list, quietly in the background

  // ---------- always ready: motion or sound starts and stops a take ----------
  const activity = [];
  const onActivity = (e) => {
    activity.push(e);
    while (activity.length > 100) activity.shift();
    if (take.recorder) { // sound level as bars on the top arc
      data.levels = [...data.levels.slice(-19), Math.min(1, (e.sound ?? 0) * 8)];
      paint();
    }
    const what = readyStep({ ...settings, ready: st.ready }, activity, Boolean(take.recorder), e.at);
    if (what === 'start') begin('motion');
    else if (what === 'stop') end();
  };
  let unwatch = watch(camera, onActivity, { video: $('#live') });

  // ---------- a take ----------
  async function begin(action = 'take', extra = {}) {
    if (take.recorder || st.screen === 'line') return;
    step(action, extra);
    if (st.screen !== 'record') return;
    const tap = await browserTap(camera);
    take.recorder = startTake(camera, { MediaRecorder, tapAudio: () => tap });
    data.levels = [];
    const tick = (ts) => {
      if (!take.recorder) return;
      take.recorder.frame(ts);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function end() {
    if (!take.recorder) return;
    const recorded = await take.recorder.stop();
    take.recorder = null;
    const kinds = toRecord(st); // what this take records, decided before it started
    const onto = st.base; // adding to an element: the chain below
    const keep = toKeep(st);
    step('take'); // → saving
    const saved = await saveTake({
      device, person, store, now: Date.now(), lengthMs: recorded.lengthMs, context: '',
      video: kinds.includes('v') ? recorded.video : null,
      audio: kinds.includes('a') ? recorded.audio : null,
      onto, keep,
    });
    take.lastChain = saved.chain.path;
    take.lastKinds = [...new Set([...kinds, ...keep])];
    data.versions = onto ? data.versions + 1 : 1;
    step('saved');
    await menu.afterTake(saved.paths); // (always) rules of the list
    index = await buildIndex(sources);
  }

  // ---------- replay: the line of my takes, newest first ----------
  async function replay(by) {
    const videos = (await store.list('take/')).map((f) => f.path).filter((p) => p.endsWith('.v.mp4')).sort().reverse();
    take.replayAt = Math.max(-1, Math.min(videos.length - 1, take.replayAt + by));
    const video = $('#replay');
    video.hidden = take.replayAt < 0;
    if (take.replayAt < 0) return step('done');
    data.line = { before: Math.min(3, videos.length - 1 - take.replayAt), after: Math.min(3, take.replayAt) };
    video.src = URL.createObjectURL(new Blob([await store.read(videos[take.replayAt])], { type: 'video/mp4' }));
    video.play();
    step(st.mode === 'line' ? (by > 0 ? 'before' : 'next') : 'replay-back');
  }

  // ---------- deleting the last take (chips take · strand · part) ----------
  async function removeLast(what) {
    if (!take.lastChain) return step('done');
    const file = readFile(dec.decode(await store.read(take.lastChain)));
    const strands = [...file.defs.values()].filter((d) => ['v', 'a', 'x', 'l'].includes(d.kind));
    const names = what === 'take' ? strands.map((d) => d.name) : strands.filter((d) => toRecord(st).includes(d.kind)).map((d) => d.name);
    // EXTEND(S4, part): a part of a strand ('part') with the moment from the line
    if (names.length && what !== 'part') {
      await removeStrands({ own: store, chainPath: take.lastChain, names, chips: { similar: true }, device, person });
      index = await buildIndex(sources);
    }
    step('done');
  }

  // ---------- panels ----------
  const panel = (id, on, chips, onChip) => {
    $(id).hidden = !on;
    if (on) draw($(id), chips, onChip);
  };
  const showOwn = (on) => panel('#own', on, ownChips(settings, t), (c) => {
    settings = choose(settings, c.key, c.value);
    saveSettings();
    showOwn(true);
  });
  const showSimilar = (on) => { // filter chips (wer · wo · wann · was) above the hits
    const hits = similar(index, { filters: filtersOf(index, filter) });
    data.similar = hits.slice(0, 3).map((h) => h.key);
    const chips = [...filterChips(index, filter, t), ...hits.map((h) => ({ label: h.entry.head?.['@'] ?? '·', key: h.key }))];
    panel('#similar', on, chips, (c) => {
      if (!c.row) return;
      filter = toggle(filter, c);
      showSimilar(true);
    });
  };
  async function keepSimilar() { // every similar shows in the log, live or kept: one chain on closing
    if (filter === EMPTY) return;
    const f = filtersOf(index, filter);
    const time = f.time ? [...new Set(f.time)].join('_') : null;
    await saveSimilar(store, { kinds: f.kinds, persons: f.persons, time, sharingPoints: f.sharingPoints.map((label) => ({ label })) }, { device, person });
  }

  // ---------- one gesture → one action ----------
  async function act(gesture, role, extra = {}) {
    const hit = { ...targetOf(role), ...extra };
    if (hit.target === 'delete') return gesture === 'tap' ? removeLast(hit.what) : null;
    const mode = st.mode === 'line' ? 'line' : st.similar ? 'similar' : 'take';
    const row = actionFor({ gesture, target: hit.drag ?? hit.target, mode });
    const kind = hit.kind;
    switch (row?.action) {
      case 'take': return take.recorder ? end() : begin('take');
      case 'take-while-held': return begin('take-while-held');
      case 'strand-while-held': return begin('strand-while-held', { kind });
      case 'ready':
        settings = choose(settings, 'ready', !st.ready);
        saveSettings();
        return step('ready');
      case 'strand-on-off':
        step('strand-on-off', { kind });
        settings = { ...settings, auto: toRecord(st) }; // the selection stays until changed
        return saveSettings();
      case 'replay-back': case 'before': return replay(+1);
      case 'replay-on': case 'next': return replay(-1);
      case 'scrub': case 'spread': return step(row.action);
      case 'aside-last': case 'remove-last': return step(row.action);
      case 'add-to': return take.lastChain ? step('add-to', { base: take.lastChain, kinds: take.lastKinds }) : null;
      case 'context-out': return null; // EXTEND(S2, context): a new line on top without this chip (needs chips from Whisper)
      case 'transcribe': return null; // EXTEND(S2, whisper): text of the audio just taken (5-take/whisper.js)
      case 'chips-in': return panel('#chips', true, strandChips(kind, { torch: data.torch }), async (c) => {
        data.torch = c.value;
        await torch(camera, data.torch);
        panel('#chips', false);
      });
      case 'chips-out': return panel('#chips', false);
      case 'hide-strand': data.hidden = [...new Set([...data.hidden, kind])]; return paint();
      case 'strands-in': data.hidden = []; return paint();
      case 'focus': return focusAt(camera, hit.x, hit.y);
      case 'zoom': return null;
      case 'switch-camera':
        if (take.recorder) return null;
        settings = choose(settings, 'facing', settings.facing === 'user' ? 'environment' : 'user');
        saveSettings();
        unwatch();
        camera = await flip(camera, settings.facing);
        $('#live').srcObject = camera;
        unwatch = watch(camera, onActivity, { video: $('#live') });
        return null;
      case 'own-in': return showOwn(true);
      case 'own-out': return showOwn(false);
      case 'similar-in': step('similar-in'); return showSimilar(true);
      case 'similar-out':
        await keepSimilar();
        step('similar-out');
        return showSimilar(false);
      case 'share-last': step('share-last'); return menu.pick(); // ↑ on the point: choose where the last take goes
      case 'share-menu': step('share-menu'); return menu.show(true);
      case 'share-menu-out': step('share-menu-out'); return menu.show(false);
      case 'full':
        step('full');
        return document.documentElement.requestFullscreen?.().catch(() => {});
      case 'unfull':
        step('unfull');
        return document.exitFullscreen?.().catch(() => {});
      default: return null;
    }
  }

  // ---------- touch on the screen: the role is read when the finger goes down ----------
  let role = null;
  const handlers = {
    down: (e) => {
      role = screen.roleAt(e);
      handlers.doubleTap = role === 'point' ? () => act('double-tap', 'point') : undefined; // only the point waits for a second tap
    },
    tap: (x, y) => act('tap', role, { x, y }),
    hold: () => act('hold', role),
    holdEnd: () => { if (st.held) end(); else if (st.sub === 'scrub') step('release'); },
    swipe: (dir) => act(dir, role),
    pinch: (factor) => zoomBy(camera, factor),
    dragEnd: (el) => {
      const from = targetOf(role);
      const onto = el?.closest?.('[data-role]')?.dataset.role;
      if (from.target === 'strand' && onto?.startsWith('strand:')) return act('drag', role, { drag: `${role}>${onto}` });
      if (from.target === 'strand' && el?.closest?.('#similar')) return act('drag', role, { drag: 'strand>similar' });
      if (from.target === 'item' && onto === 'point') return act('drag', role, { drag: 'item>point' });
      if (from.target === 'item') return act('drag', role, { drag: 'item>beside-point' });
      return null;
    },
  };
  bind($('#screen'), handlers);

  // ---------- edges ----------
  let edge = null;
  addEventListener('pointerdown', (e) => { edge = { zone: edgeZone(e.clientX, e.clientY, innerWidth, innerHeight), x: e.clientX, y: e.clientY }; }, true);
  addEventListener('pointerup', (e) => {
    const zone = edge?.zone;
    const dx = e.clientX - (edge?.x ?? 0);
    const dy = e.clientY - (edge?.y ?? 0);
    edge = null;
    if (zone === 'top-middle' && Math.abs(dy) > 50) act(dy < 0 ? 'up' : 'down', 'top-middle');
    else if (zone?.endsWith('left') && dx > 60) act('edge-in', zone);
    else if (zone?.endsWith('right') && dx < -60) act('edge-in', zone);
  }, true);
  $('#own').addEventListener('pointerup', (e) => { if (e.clientX < 72) act('edge-out', 'upper-left'); });
  $('#similar').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 72) act('edge-out', 'upper-right'); });
  $('#share').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 24) act('edge-out', 'middle-right'); });
  addEventListener('resize', paint);
  $('#replay').addEventListener('timeupdate', (e) => { data.timeMs = e.target.currentTime * 1000; });
  paint();
}
