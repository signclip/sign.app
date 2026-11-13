// app.js — the web app: wiring only. What a gesture means is in gestures.js, what the screen does next
// in state.js, how it looks in view/ring.js, where it lands on the screen in screen.js.
//
//   point: tap = take with the strands that are on · hold = take while held · double-tap = always ready
//          ↑ share (choose where) · ↓ set aside · all the way ↓ delete · ← → replay, in a line next/before
//   strand arc: tap = on/off (stays until changed) · hold = only this strand while held · ↑ its chips · ← hide
//   chip: hold = record more strands to it (kept solid, new dashed) · ↓ take this context away
//         · double-tap = sticky on/off: in front, one bubble, a prefix (G4) for every take of the series
//   live picture: tap = focus · hold = video while held · ← → front/back camera · pinch = zoom
//   edges: upper left own · middle left strands · upper right Similar · middle right share · top: ↑ full, ↓ Similar
//   window: a circle as large as fits, or ellipse / rounded rectangle (own settings); arcs by degrees: line −60…60 ·
//          audio 60…140 · context 140…220 · visual 220…300 · Similar as tiles at the top: one onto the line or the
//          point, or ↓ on them = all onto the chain · line double-tap = full screen · context ↓ = open and write
//   line (an arc of pictures over the point, view/arc.js): ↓ on it = straight, ↑ = arc again · older lines of the
//          chain under it: ↓ = apart, ↑ = together, tap = open · a Similar result dragged onto point or line =
//          onto the chain (it flies in, a new line slides in on top) · a saved take slides in the same way
//   onboarding: the next element breathes, a pale point shows its gesture (onboarding.js); the first take is the name sign
//   parallel (one finger holds, the other acts; rows with `held` in gestures.js):
//          strand held + tap point = record only it onto the last take · + ↑ point = share only it
//          · + all the way ↓ = delete only it · + in from upper right = Similar from it
//          chip held + tap point = a take with this context (a series while held) · + upper right = Similar for it
// Depends:   browser; 0-i18n, 1-model, 2-storage/local, 3-index, 4-save, 5-take, 7-similar, 9-ui
// Test:      needs a browser; every part is tested on its own (tests/ui, state, view, list, similar).
// Limits:    Whisper only after a take (live and keywords: EXTEND(S2, live)); one take records at a time; one property
//            held at a time. Every row of the gesture table has a case below, wired or EXTEND (tests/ui).

import { translator } from '../0-i18n/t.js';
import { LocalStore } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { saveTake } from '../4-save/save-take.js';
import { removeStrands } from '../4-save/remove.js';
import { saveSimilar } from '../4-save/save-similar.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { loadWhisper } from '../5-take/whisper-engine.js';
import { transcribe, contextOf as wordsRow } from '../5-take/whisper.js';
import { toMono, resample } from '../5-take/resample.js';
import { addEcho } from '../4-save/add-echo.js';
import { similar } from '../7-similar/filter.js';
import { newPerson, newSource } from '../1-model/ids.js';
import { readFile } from '../1-model/file.js';
import { withSticky, afterTake as nextOfSeries, readContext } from '../1-model/context.js';
import { write as writeNotation, parse as parseNotation } from '../1-model/notation.js';
import { actionFor } from './gestures.js';
import { startState, next, toRecord, toKeep, toUse } from './state.js';
import { mountScreen, targetOf } from './screen.js';
import { normalize, readyStep, choose } from './settings.js';
import { watch } from './ready.js';
import { flip, zoomBy, focusAt, torch } from './camera.js';
import { bind, edgeZone } from './touch.js';
import { ownChips, strandChips, draw } from './panels.js';
import { filterChips, toggle, filtersOf, EMPTY } from './similar-filter.js';
import { mountShareMenu } from './share-mount.js';
import { keychain } from './keychain.js';
import { hintOf, progress, done, NAME_SIGN_STEP } from './onboarding.js';

const $ = (sel) => document.querySelector(sel);
/** A held chip as context text: every gesture in its own bracket (SCHEMA G-rules). */
const contextOf = (text) => (!text ? '' : text.startsWith('(') ? text : `(${text})`);
/** A role held by a finger → the property of a parallel gesture, or null if it cannot be one. */
function propertyOf(role) {
  const hit = targetOf(role);
  if (hit.target === 'strand') return { target: 'strand', kind: hit.kind };
  if (hit.target === 'chip') return { target: 'chip', text: hit.text };
  return null;
}
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

  // a video shows only once its first frame plays (no black box, no grey play button); then the shapes follow
  for (const v of document.querySelectorAll('#screen video')) {
    v.addEventListener('playing', () => v.classList.add('on'));
    v.addEventListener('emptied', () => v.classList.remove('on'));
  }
  $('#live').addEventListener('playing', () => $('#screen').classList.add('ready'), { once: true });
  setTimeout(() => $('#screen').classList.add('ready'), 2500); // no camera (denied, none): the shapes come anyway
  let camera = await openDevices(navigator.mediaDevices, { facing: settings.facing }).catch(() => null);
  $('#live').srcObject = camera;

  // ---------- what is going on ----------
  let st = startState(settings.auto); // one strand selection for everything, kept until changed
  if (settings.ready) st = next(st, { action: 'ready' });
  const data = { chips: [], levels: [], similar: [], line: { count: 0, at: 0 }, versions: 1, timeMs: null, hidden: [], words: [], flows: settings.flows, shape: settings.shape };
  let series = ''; // written context, one gesture per entry: each take takes the first one (context.afterTake)
  const take = { recorder: null, lastChain: null, lastKinds: [], replayAt: -1, began: null, context: '', shareOnce: null, starting: false, stopSoon: false };
  const onboard = { at: Number(kept('sign.onboard', () => '0')) || 0 };
  let filter = EMPTY; // the chips of Similar: wer · wo · wann · was
  let sticky = JSON.parse(kept('sign.sticky', () => '[]')); // words in front for the series, as levels (device only)
  const stickyChips = () => sticky.map((text) => ({ text, stable: true }));
  const setChips = (current = data.chips.filter((c) => !c.stable)) => { data.chips = [...stickyChips(), ...current]; };
  setChips([]);
  let sources = [{ name: 'own', store }];
  let index = await buildIndex(sources);

  const screen = mountScreen({ root: $('#screen'), live: $('#live'), replay: $('#replay'), template: $('#template'), overlay: $('#overlay') });
  const paint = () => screen.paint(st, { ...data, hint: hintOf(onboard.at, settings.onboarding) });
  /** An action was done: the onboarding goes one step on if it was its step; at the end it switches off. */
  const learned = (action) => {
    if (!settings.onboarding) return;
    const at = progress(onboard.at, action);
    if (at === onboard.at) return;
    onboard.at = at;
    try { localStorage.setItem('sign.onboard', String(at)); } catch { /* private mode */ }
    if (done(at)) { settings = choose(settings, 'onboarding', false); saveSettings(); }
    paint();
  };
  const step = (action, extra = {}) => { st = next(st, { action, ...extra }); paint(); };
  /** Animate one value of the view from a to b (ms, eased), painting every frame; resolves at the end. */
  const animate = (key, a, b, ms = 320) => new Promise((done) => {
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 3;
      data[key] = a + (b - a) * e;
      paint();
      if (t < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
  /** A new line arrives on the chain: it slides in from above, the older ones move one level down. */
  const arrive = async () => { data.push = 0; await animate('push', 0, 1, 380); delete data.push; paint(); };
  const takesCount = async () => (await store.list('take/')).filter((f) => f.path.endsWith('.v.mp4')).length;
  data.line.count = await takesCount().catch(() => 0);

  const project = await fetch(new URL('../project.json', import.meta.url)).then((r) => r.json()).catch(() => null); // the project's door
  const menu = await mountShareMenu({
    project,
    panel: $('#share'), own: store, keychain, person, device, t,
    lastChain: async () => take.lastChain,
    selection: () => toRecord(st), // double-tap on a sharing point = these strands always go there
    once: () => take.shareOnce, // a strand held while ↑ on the point: only it is shared this time
    nameSign: async () => { // the first take of the onboarding goes along with every hello
      try { const p = localStorage.getItem('sign.nameSign'); return p ? await store.read(p) : null; } catch { return null; }
    },
    onSources: async (list) => { sources = list; index = await buildIndex(sources); },
  });
  menu.runRules().catch(() => {}); // copies and backups of the list, quietly in the background

  // ---------- audio → context: Whisper, when that connection is drawn (settings.flows 'a>x') ----------
  let whisper = null; // Promise of the engine, loaded once (≈ 250 MB the first time, then from the cache)
  const ensureWhisper = () => {
    whisper ??= loadWhisper({ language: lang }).then((engine) => {
      data.flowsRunning = ['a>x']; // the connection turns solid: it runs
      paint();
      return engine;
    }).catch((err) => { whisper = null; console.warn('whisper', err); return null; });
    return whisper;
  };
  if (settings.flows.includes('a>x')) ensureWhisper();
  /** After a take: its sound → words with their time → an echo :x on top of the chain, shown as chips. */
  async function flowAudio(chainPath, audio) {
    const engine = await ensureWhisper();
    if (!engine) return;
    const words = await transcribe(engine, resample(toMono(audio.channels), audio.sampleRate, 16000));
    if (!words.length) return;
    await addEcho({ own: store, chainPath, from: 'a.1', kind: 'x', row: wordsRow(words), echo: engine.label, device, person });
    setChips(words.map((w) => ({ text: w.text, t: [w.from, w.to] })));
    paint();
    index = await buildIndex(sources);
  }

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
  let unwatch = camera ? watch(camera, onActivity, { video: $('#live') }) : () => {};

  // ---------- a take ----------
  async function begin(action = 'take', extra = {}) {
    if (!camera || take.recorder || take.starting || st.screen === 'line') return;
    step(action, extra);
    if (st.screen !== 'record') return;
    take.began = action;
    const first = parseNotation(series).find((n) => n.t !== 'sym'); // written context: the next gesture of the series
    take.context = action === 'take-with-context' ? contextOf(st.hold?.text) : first ? writeNotation([first]) : '';
    take.fromSeries = action !== 'take-with-context' && Boolean(first);
    take.starting = true; // the microphone takes ~50–300 ms to open; a tap meanwhile = stop right after
    const tap = await browserTap(camera).finally(() => { take.starting = false; });
    if (st.screen !== 'record') { tap.stop(); return; } // undone meanwhile (a second finger came)
    take.recorder = startTake(camera, { MediaRecorder, tapAudio: () => tap });
    if (take.stopSoon) { take.stopSoon = false; return end(); }
    data.levels = [];
    const tick = (ts) => {
      if (!take.recorder) return;
      take.recorder.frame(ts);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** What a hold started alone is undone (a second finger made it a property): nothing is saved. */
  async function cancelTake() {
    take.stopSoon = false;
    if (!take.recorder) return;
    const r = take.recorder;
    take.recorder = null;
    await r.stop().catch(() => {});
  }

  async function end() {
    if (take.starting) { take.stopSoon = true; return; }
    if (!take.recorder) return;
    const recorded = await take.recorder.stop();
    take.recorder = null;
    const kinds = toRecord(st); // what this take records, decided before it started
    const onto = st.base; // adding to an element: the chain below
    const keep = toKeep(st);
    step('take'); // → saving
    const saved = await saveTake({
      device, person, store, now: Date.now(), lengthMs: recorded.lengthMs, context: withSticky(sticky.map((w) => `(${w})`).join(' '), take.context),
      video: kinds.includes('v') ? recorded.video : null,
      audio: kinds.includes('a') ? recorded.audio : null,
      onto, keep,
    });
    take.lastChain = saved.chain.path;
    if (take.fromSeries) { series = nextOfSeries(series); showSeries(); } // the series goes one on
    take.lastKinds = [...new Set([...kinds, ...keep])];
    data.versions = onto ? data.versions + 1 : 1;
    data.line = { count: await takesCount(), at: 0 };
    step('saved');
    arrive(); // the new take slides in as the top of the line
    if (settings.onboarding && onboard.at === NAME_SIGN_STEP) {
      const video = saved.paths.find((p) => p.endsWith('.v.mp4'));
      try { if (video) localStorage.setItem('sign.nameSign', video); } catch { /* private mode */ }
      menu.joinProject().catch(() => {}); // the first group: hello to the project's door, with this name sign
    }
    learned(take.began);
    if (settings.flows.includes('a>x') && recorded.audio && kinds.includes('a')) flowAudio(saved.chain.path, recorded.audio).catch((err) => console.warn('whisper', err));
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
    data.line = { count: videos.length, at: take.replayAt }; // newest first: the one playing sits at the top of the arc
    video.src = URL.createObjectURL(new Blob([await store.read(videos[take.replayAt])], { type: 'video/mp4' }));
    video.play();
    step(st.mode === 'line' ? (by > 0 ? 'before' : 'next') : 'replay-back');
  }

  // ---------- deleting the last take (chips take · strand · part) ----------
  async function removeLast(what, kinds = toUse(st)) {
    if (!take.lastChain) return step('done');
    const file = readFile(dec.decode(await store.read(take.lastChain)));
    const strands = [...file.defs.values()].filter((d) => ['v', 'a', 'x', 'l'].includes(d.kind));
    const names = what === 'take' ? strands.map((d) => d.name) : strands.filter((d) => kinds.includes(d.kind)).map((d) => d.name);
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
    data.shape = settings.shape;
    if (c.key === 'onboarding' && c.value) { onboard.at = 0; try { localStorage.setItem('sign.onboard', '0'); } catch { /* private mode */ } }
    saveSettings();
    paint();
    showOwn(true);
  });
  const showSimilar = (on) => { // at the top: metadata and strand choice as chips, the hits as tiles (view)
    const hits = similar(index, { words: data.words, filters: filtersOf(index, filter) });
    data.similar = hits.slice(0, 12).map((h) => h.key);
    const chips = filterChips(index, filter, t);
    panel('#similar', on, chips, (c) => {
      if (!c.row) return;
      filter = toggle(filter, c);
      showSimilar(true);
    });
  };
  async function keepSimilar() { // every similar shows in the log, live or kept: one chain on closing
    if (filter === EMPTY) return; // EXTEND(S3, words): words of a held chip into the kept similar
    const f = filtersOf(index, filter);
    const time = f.time ? [...new Set(f.time)].join('_') : null;
    await saveSimilar(store, { kinds: f.kinds, persons: f.persons, time, sharingPoints: f.sharingPoints.map((label) => ({ label })) }, { device, person });
  }

  // ---------- the context field: chips, and writing (one gesture per Enter; the series goes one on per take) ----------
  const say = $('#say');
  function showSeries() {
    const gestures = readContext(series).gestures.map((g) => g.chips.map((c) => c.text).join(' '));
    setChips(gestures.map((text, i) => ({ text, t: i ? [1, 2] : [0, 1] }))); // the next one now, the rest coming
    data.timeMs = 0;
    paint();
  }
  const openContext = (on) => {
    $('#context').hidden = !on;
    if (on) say.focus(); else say.blur();
  };
  say.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const text = say.value.replace(/[()[\]{}]/g, ' ').trim().replace(/\s+/g, ' ');
    say.value = '';
    if (!text) return openContext(false);
    series = `${series} (${text})`.trim();
    showSeries();
  });

  /** Fly one Similar tile into the line, then the new line slides in on the chain. */
  async function intoLine(tileRole, ms = 420) {
    const from = screen.last?.shapes.find((x) => x.role === tileRole && x.type === 'thumb');
    data.arrive = { x: from?.x ?? innerWidth, y: from?.y ?? 0, s: from?.s, t: 0 };
    await new Promise((done) => {
      const t0 = performance.now();
      const frame = (now) => {
        data.arrive.t = Math.min(1, (now - t0) / ms);
        paint();
        if (data.arrive.t < 1) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    delete data.arrive;
    data.line = { count: (data.line?.count ?? 0) + 1, at: 0 };
  }

  // ---------- one gesture → one action ----------
  async function act(gesture, role, extra = {}) {
    let hit = { ...targetOf(role), ...extra };
    if (hit.target === 'strand' && hit.kind === 'x' && ['down', 'up'].includes(gesture) && !st.hold) hit = { ...hit, target: 'context' }; // the context arc opens its field
    if (hit.target === 'delete') return gesture === 'tap' ? removeLast(hit.what) : null;
    const mode = st.mode === 'line' ? 'line' : st.similar ? 'similar' : 'take';
    const held = st.hold?.target ?? null; // what the other finger holds (parallel gesture)
    const row = actionFor({ gesture, target: hit.drag ?? hit.target, mode, held });
    const kind = hit.kind ?? st.hold?.kind;
    if (row && !['take', 'take-while-held', 'strand-while-held', 'add-strand', 'take-with-context'].includes(row.action)) learned(row.action); // takes count when saved
    switch (row?.action) {
      case 'take': return take.recorder || take.starting ? end() : begin('take');
      // ---------- parallel: a strand or chip is held by the other finger ----------
      case 'add-strand':
        if (take.recorder || take.starting) return end();
        return begin('add-strand', { base: take.lastChain, kinds: take.lastChain ? take.lastKinds : [], kind: st.hold.kind }); // no take yet: a take of only it
      case 'take-with-context': return take.recorder || take.starting ? end() : begin('take-with-context');
      case 'share-strand':
        take.shareOnce = [st.hold.kind];
        step('share-strand');
        return menu.show(true);
      case 'remove-strand': step('remove-strand'); return removeLast('strand', [st.hold.kind]);
      case 'similar-from': // drag a strand onto Similar, or hold it and pull Similar in
        filter = { ...filter, kinds: [kind] };
        step('similar-from', { kinds: [kind] });
        return showSimilar(true);
      case 'similar-context':
        data.words = [st.hold.text];
        step('similar-context');
        return showSimilar(true);
      case 'sticky': { // on: the word goes in front (the next level); off: it leaves the front
        const word = hit.text;
        if (!word) return null; // the sticky bubble itself: its chips are tapped one by one
        sticky = sticky.includes(word) ? sticky.filter((w) => w !== word) : [...sticky, word];
        try { localStorage.setItem('sign.sticky', JSON.stringify(sticky)); } catch { /* private mode */ }
        setChips();
        return paint();
      }
      case 'chip-on-off': // a chip as a word for Similar
        data.words = data.words.includes(hit.text) ? data.words.filter((w) => w !== hit.text) : [...data.words, hit.text];
        return st.similar ? showSimilar(true) : paint();
      case 'take-while-held': return begin('take-while-held');
      case 'strand-while-held': return begin('strand-while-held', { kind });
      case 'ready':
        settings = choose(settings, 'ready', !st.ready);
        saveSettings();
        return step('ready');
      case 'strand-on-off':
        step('strand-on-off', { kind });
        if (kind === 'x') openContext(st.fields.x === 'on'); // context on: the field opens, typing writes directly
        settings = { ...settings, auto: toRecord(st) }; // the selection stays until changed
        return saveSettings();
      case 'replay-back': case 'before': return replay(+1);
      case 'replay-on': case 'next': return replay(-1);
      case 'scrub': case 'spread': return step(row.action);
      case 'aside-last': case 'remove-last': return step(row.action);
      case 'add-to': return take.lastChain ? step('add-to', { base: take.lastChain, kinds: take.lastKinds }) : null;
      case 'context-out': return null; // EXTEND(S2, context): a new line on top without this chip (needs chips from Whisper)
      case 'flow': { // a connection between two sides (around their corner): on / off, kept in the own settings
        const flow = `${(hit.drag ?? '').split('>')[0].split(':')[1]}>x`;
        settings = choose(settings, 'flows', flow);
        saveSettings();
        data.flows = settings.flows;
        if (settings.flows.includes('a>x')) ensureWhisper(); // loads now, so the next take flows at once
        return paint();
      }
      case 'chips-in': return panel('#chips', true, strandChips(kind, { torch: data.torch }), async (c) => {
        data.torch = c.value;
        await torch(camera, data.torch);
        panel('#chips', false);
      });
      case 'chips-out': return panel('#chips', false);
      case 'hide-strand': data.hidden = [...new Set([...data.hidden, kind])]; return paint();
      case 'strands-in': data.hidden = []; return paint();
      case 'focus': return focusAt(camera, hit.x, hit.y);
      case 'zoom': return null; // pinch goes straight to the camera (handlers.pinch)
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
        data.words = [];
        return showSimilar(false);
      case 'share-last': take.shareOnce = null; step('share-last'); return menu.show(true); // ↑ on the point: the sharing points as circles
      case 'always-there': return menu.dropKind(hit.n, hit.kind);
      case 'full':
        step('full');
        return document.documentElement.requestFullscreen?.().catch(() => {});
      case 'unfull':
        step('unfull');
        return document.exitFullscreen?.().catch(() => {});
      // ---------- the line in its arc, the chain under it ----------
      case 'straighten': return animate('bend', data.bend ?? 1, 0);
      case 'bend': return animate('bend', data.bend ?? 0, 1);
      case 'levels-open': data.levelsOpen = true; return paint();
      case 'levels-close': data.levelsOpen = false; return paint();
      case 'level-open': // choose an earlier line of the chain (tap again = back to the current one)
        data.levelAt = data.levelAt === hit.index ? null : hit.index;
        return paint(); // EXTEND(S3, chain): play that version (index.versions → its chain below)
      case 'into-line': // a Similar result laid on the chain: it flies into the line, then a new line slides in
        await intoLine(role);
        data.versions += 1; // EXTEND(S3, chain): write the new line {…} with {:chain.1} below (4-save)
        return arrive();
      case 'similar-all': { // all of Similar: one after another into the line, then one new line on the chain
        const n = Math.min(6, data.similar.length);
        for (let i = 0; i < n; i++) await intoLine(`similar:${i}`, 220);
        data.versions += 1; // EXTEND(S3, chain): the whole similar as a line {:?.1} on top (G4c)
        return arrive();
      }
      case 'line-full': // the line in full screen: replay from the current one
        if (take.replayAt < 0) await replay(+1);
        step('full');
        return document.documentElement.requestFullscreen?.().catch(() => {});
      case 'from-top':
        if (st.full) { step('unfull'); return document.exitFullscreen?.().catch(() => {}); }
        step('similar-in');
        return showSimilar(true);
      case 'context-open': return openContext(true);
      case 'context-close': return openContext(false);
      // ---------- in the table, not wired yet: each says where it docks ----------
      case 'take-over': return null; // EXTEND(S3, similar): a result into the Take in the middle (needs similar items on screen)
      case 'share': case 'aside': case 'remove': return null; // EXTEND(S3, line): the same for an element of a line
      case 'after': case 'together': return null; // EXTEND(S3, line): a new line on top (4-save, chain with {:chain.1})
      case 'settings': return null; // in the share menu itself (share-mount.js: hold on a circle)
      default: return null;
    }
  }

  // ---------- touch on the screen: each finger has its role, read when it goes down ----------
  let propertyRole = null; // the finger that holds a property (parallel gesture)
  let spentRole = null; // that finger just let go: its drag end is not a drag
  const handlers = {
    down: (e) => {
      const role = screen.roleAt(e);
      const doubles = role === 'point' || role?.startsWith('chip:') || role === 'sticky' || role === 'line-arc'; // these wait for a second tap
      handlers.doubleTap = doubles ? () => act('double-tap', role) : undefined;
      return role;
    },
    tap: (x, y, role) => { if (!$('#share').hidden && role !== 'point') return menu.show(false); return act('tap', role, { x, y }); }, // a tap beside the circles closes them
    hold: (role) => act('hold', role),
    parallel: async (heldRole) => { // a second finger came while one is held: the held thing becomes the property
      const hold = propertyOf(heldRole);
      if (!hold || propertyRole === heldRole) return; // already the property: the other finger just acts again
      propertyRole = heldRole;
      if (st.screen === 'record' && st.held) await cancelTake(); // only what the hold started alone is not kept
      step('hold-property', { hold });
    },
    holdEnd: (role) => {
      if (propertyRole && role === propertyRole) { spentRole = role; propertyRole = null; return step('release-property'); }
      if (st.held) end(); else if (st.sub === 'scrub') step('release');
    },
    swipe: (dir, role) => act(dir, role),
    pinch: (factor) => zoomBy(camera, factor),
    dragEnd: (el, moved, role) => {
      if (role === spentRole || st.hold) { spentRole = null; return null; } // a property was held, not carried
      const from = targetOf(role);
      const onto = el?.closest?.('[data-role]')?.dataset.role;
      if (from.target === 'strand' && onto?.startsWith('strand:')) return act('drag', role, { drag: `${role}>${onto}` });
      if (from.target === 'strand' && el?.closest?.('#similar')) return act('drag', role, { drag: from.kind === 'x' ? 'strand:x>similar' : 'strand>similar' });
      if (from.target === 'strand' && onto?.startsWith('sp:')) return act('drag', role, { drag: 'strand>sharing-point', n: Number(onto.split(':')[1]) });
      if (from.target === 'similar-item' && (onto === 'point' || onto === 'line-arc')) return act('drag', role, { drag: `similar-item>${onto}` });
      if (from.target === 'item' && onto === 'point') return act('drag', role, { drag: 'item>point' });
      if (from.target === 'item') return act('drag', role, { drag: 'item>beside-point' });
      return null;
    },
  };
  bind($('#screen'), handlers);

  // ---------- edges ----------
  const edges = new Map(); // pointerId → where it started: an edge pull can come while the other finger holds
  addEventListener('pointerdown', (e) => { edges.set(e.pointerId, { zone: edgeZone(e.clientX, e.clientY, innerWidth, innerHeight), x: e.clientX, y: e.clientY }); }, true);
  addEventListener('pointerup', (e) => {
    const edge = edges.get(e.pointerId);
    edges.delete(e.pointerId);
    const zone = edge?.zone;
    const dx = e.clientX - (edge?.x ?? 0);
    const dy = e.clientY - (edge?.y ?? 0);
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
