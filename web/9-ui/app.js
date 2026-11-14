// app.js — the web app: wiring only. What a gesture means is in gestures.js, what the screen does next
// in state.js, how it looks in view/ring.js, where it lands on the screen in screen.js.
//
//   point: tap = take with the strands that are on · hold = take while held · double-tap = always ready
//          ↑ share (choose where) · ↓ set aside · all the way ↓ delete · ← → replay, in a line next/before
//   strand arc: tap = on/off (stays until changed) · hold = only this strand while held · ↑ its chips · ← hide
//   chip: hold = record more strands to it (kept solid, new dashed) · ↓ take this context away
//         · double-tap = sticky on/off: in front, one bubble, a prefix (G4) for every take of the series
//   live picture: tap = focus · hold = video while held · ← → front/back camera · pinch = zoom
//   no settings area (14.11.): form = ↑/↓ on the picture · strands as left · waits = pinch on the point · onboarding
//   again = hold your own tile in the sharing menu
//   edges: middle left strands · upper right Similar · middle right share · top: ↑ full, ↓ Similar
//   window: a circle as large as fits, or ellipse / rounded rectangle (↑/↓ on the picture); arcs by degrees: line −60…60 ·
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
import { addLine } from '../4-save/add-line.js';
import { askRemove } from '../8-join/remove-request.js';
import { deviceKeys } from './device-keys.js';
import { readName } from '../1-model/filename.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { loadWhisper } from '../5-take/whisper-engine.js';
import { transcribe, contextOf as wordsRow } from '../5-take/whisper.js';
import { toMono, resample } from '../5-take/resample.js';
import { addEcho } from '../4-save/add-echo.js';
import { similar } from '../7-similar/filter.js';
import { newPerson, newSource, shortU, writeId } from '../1-model/ids.js';
import { readFile } from '../1-model/file.js';
import { withSticky, afterTake as nextOfSeries, readContext, fromField } from '../1-model/context.js';
import { write as writeNotation, parse as parseNotation } from '../1-model/notation.js';
import { actionFor } from './gestures.js';
import { startState, next, toRecord, toKeep, toUse } from './state.js';
import { MANY } from './view/ring.js';
import { formOf, formBy } from './view/shape.js';
import { mountScreen, targetOf } from './screen.js';
import { normalize, readyStep, choose, CHOICES } from './settings.js';
import { watch } from './ready.js';
import { flip, zoomBy, focusAt, torch } from './camera.js';
import { bind, edgeZone } from './touch.js';
import { strandChips, draw } from './panels.js';
import { filterChips, toggle, filtersOf, EMPTY } from './similar-filter.js';
import { mountShareMenu } from './share-mount.js';
import { keychain } from './keychain.js';
import { hintOf, progress, done, NAME_SIGN_STEP, STEPS } from './onboarding.js';

const $ = (sel) => document.querySelector(sel);
/** A held chip as context text: every gesture in its own bracket (SCHEMA G-rules). */
/** One picture from the live video: the middle square, 1080 × 1080 (as the video), PNG = lossless. → bytes */
async function snapshot(video, side = 1080) {
  const s = Math.min(video.videoWidth, video.videoHeight) || side;
  const c = Object.assign(document.createElement('canvas'), { width: side, height: side });
  c.getContext('2d').drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, side, side);
  const blob = await new Promise((done) => c.toBlob(done, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

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
    v.addEventListener('emptied', () => { if (!v.dataset.picture) v.classList.remove('on'); }); // a picture (poster) shows at once
  }
  $('#live').addEventListener('playing', () => $('#screen').classList.add('ready'), { once: true });
  setTimeout(() => $('#screen').classList.add('ready'), 2500); // no camera (denied, none): the shapes come anyway
  let camera = await openDevices(navigator.mediaDevices, { facing: settings.facing }).catch(() => null);
  $('#live').srcObject = camera;

  // ---------- what is going on ----------
  let st = startState(settings.auto); // one strand selection for everything, kept until changed
  if (settings.ready) st = next(st, { action: 'ready' });
  const data = { chips: [], levels: [], similar: [], line: { count: 0, at: 0 }, versions: 1, timeMs: null, hidden: [], words: [], flows: settings.flows, shape: formOf(settings.shape), photo: kept('sign.photo', () => '') === '1' };
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
  /** The newest version of my newest take: what the chain gestures lay on after a restart. */
  const newestOwnChain = () => {
    const top = new Set([...index.tables.chains.values()].map((c) => c.below).filter(Boolean)); // chains with one on top are older versions
    const mine = [...index.tables.chains.values()].filter((c) => c.from?.store === 'own' && !top.has(c.key) && c.from.path.startsWith('chain/'));
    return mine.sort((a, b) => String(b.head["'t"] ?? '').localeCompare(String(a.head["'t"] ?? '')))[0]?.from.path ?? null; // newest by its time
  };
  take.lastChain = newestOwnChain(); // after a restart the chain gestures go on where they were

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
  const step = (action, extra = {}) => {
    const before = st.fields;
    st = next(st, { action, ...extra });
    if (action === 'strand-on-off' && st.fields !== before) { // strands are remembered: on next start as left (14.11.)
      settings = normalize({ ...settings, auto: Object.keys(st.fields).filter((k) => st.fields[k] === 'on') });
      saveSettings();
    }
    paint();
  };
  /** Animate one value of the view from a to b (ms, eased), painting every frame; resolves at the end. */
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; // the phone asks for less motion: jump to the end
  const animate = (key, a, b, ms = 320) => new Promise((done) => {
    if (still) ms = 1;
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
  const takesCount = async () => (await store.list('take/')).filter((f) => /\.v\.(mp4|png)$/.test(f.path)).length;
  data.line.count = await takesCount().catch(() => 0);

  const project = await fetch(new URL('../project.json', import.meta.url)).then((r) => r.json()).catch(() => null); // the project's door
  const menu = await mountShareMenu({
    project,
    panel: $('#share'), own: store, keychain, person, device, t,
    lastChain: async () => take.shareChain ?? take.lastChain, // an element of the line (↑ on it), else the last take
    selection: () => toRecord(st), // double-tap on a sharing point = these strands always go there
    once: () => take.shareOnce, // a strand held while ↑ on the point: only it is shared this time
    nameSign: async () => { // the first take of the onboarding goes along with every hello
      try { const p = localStorage.getItem('sign.nameSign'); return p ? await store.read(p) : null; } catch { return null; }
    },
    onSources: async (list) => { sources = list; index = await buildIndex(sources); },
    onHello: () => learned('hello'), // onboarding: I dragged myself onto the door
    onOwnHold: () => { // my own tile held: the first steps again (there is no settings area)
      settings = choose(settings, 'onboarding', true);
      saveSettings();
      onboard.at = 0;
      try { localStorage.setItem('sign.onboard', '0'); } catch { /* private mode */ }
      menu.show(false);
      $('#context').classList.add('breathe');
      say.value = person.label;
      openContext(true);
      setTimeout(() => say.select(), 320);
    },
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
  /** Back from the background (or the camera was taken away): the live picture starts again by itself. */
  async function freshCamera() {
    const alive = camera?.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
    if (alive) return $('#live').play?.().catch(() => {});
    unwatch();
    camera?.getTracks().forEach((t) => t.stop());
    camera = await openDevices(navigator.mediaDevices, { facing: settings.facing }).catch(() => null);
    $('#live').srcObject = camera;
    unwatch = camera ? watch(camera, onActivity, { video: $('#live') }) : () => {};
    paint();
  }
  globalThis.document?.addEventListener('visibilitychange', async () => {
    if (document.hidden) { if (take.recorder || take.starting) await end(); return; } // going away during a take: it is saved
    await freshCamera();
  });

  // ---------- a take ----------
  async function begin(action = 'take', extra = {}) {
    if (!camera || take.recorder || take.starting || st.screen === 'line') return;
    step(action, extra);
    if (st.screen !== 'record') return;
    take.began = action;
    const first = parseNotation(series).find((n) => n.t !== 'sym'); // written context: the next gesture of the series
    take.context = action === 'take-with-context' ? contextOf(st.hold?.text) : first ? writeNotation([first]) : '';
    take.fromSeries = action !== 'take-with-context' && Boolean(first);
    if (data.photo && toRecord(st).includes('v')) { // the picture point is on: one picture, no sound, saved at once
      const picture = await snapshot($('#live'));
      take.recorder = { stop: async () => ({ lengthMs: 0, picture, video: null, audio: null }), frame() {} };
      return end();
    }
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
    let saved;
    try {
      saved = await saveTake({
        device, person, store, now: Date.now(), lengthMs: recorded.lengthMs, context: withSticky(sticky.map((w) => `(${w})`).join(' '), take.context),
        video: kinds.includes('v') ? recorded.video : null,
        picture: kinds.includes('v') ? recorded.picture ?? null : null,
        audio: kinds.includes('a') ? recorded.audio : null,
        onto, keep,
      });
    } catch { // could not be saved (storage full, gone): back to ready at once, the point says so
      step('saved');
      feedback('gone');
      return;
    }
    take.lastChain = saved.chain.path;
    if (data.double) { // Similar · Doppel: the result is the line underneath, the new take a line on top of it (14.11.)
      const ref = await chainBytes(data.double);
      if (ref) take.lastChain = (await addLine({ own: store, below: ref.bytes, elements: [{ bytes: await store.read(saved.chain.path) }], device, person })).chain;
    }
    if (take.fromSeries) { series = nextOfSeries(series); showSeries(); } // the series goes one on
    take.lastKinds = [...new Set([...kinds, ...keep])];
    data.versions = onto ? data.versions + 1 : 1;
    data.line = { count: await takesCount(), at: 0 };
    data.lineThumbs = {}; lineThumbs(); // the new take is element 0: all move one on
    step('saved');
    feedback('saved');
    askAgain().catch(() => {});
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
    const videos = await takeVisuals(); // videos and pictures, newest first
    take.replayAt = Math.max(-1, Math.min(videos.length - 1, take.replayAt + by));
    $('#replay').hidden = take.replayAt < 0;
    if (take.replayAt < 0) return step('done');
    data.line = { count: videos.length, at: take.replayAt }; // newest first: the one playing sits at the top of the arc
    lineThumbs();
    await show(videos[take.replayAt]);
    step(st.mode === 'line' ? (by > 0 ? 'before' : 'next') : 'replay-back');
  }

  // ---------- the window's form by hand (14.11.): corners rounder or squarer, narrower or lower ----------
  function reshape(change) {
    data.shape = formOf({ ...data.shape, ...change });
    settings = normalize({ ...settings, shape: data.shape });
    paint();
    clearTimeout(reshape.soon);
    reshape.soon = setTimeout(saveSettings, 400); // kept when the fingers rest
  }

  // ---------- always ready: the waits, pinched on the point (14.11., no settings) ----------
  let pinched = 1, waitsShown = null;
  function waitsBy(factor) {
    pinched *= factor;
    if (pinched > 0.8 && pinched < 1.25) return null; // a step every 25 %
    const by = pinched >= 1.25 ? 1 : -1;
    pinched = 1;
    const stepIn = (list, now) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(now) + by))] ?? now;
    settings = normalize({ ...settings, waitStartMs: stepIn(CHOICES.waitStartMs, settings.waitStartMs), waitStopMs: stepIn(CHOICES.waitStopMs, settings.waitStopMs) });
    saveSettings();
    data.waits = { startMs: settings.waitStartMs, stopMs: settings.waitStopMs }; // two rings around the point
    clearTimeout(waitsShown);
    waitsShown = setTimeout(() => { delete data.waits; paint(); }, 1500);
    return paint();
  }

  // ---------- the chain: elements laid on it, earlier versions played ----------
  const takeVisuals = async () => (await store.list('take/')).map((f) => f.path).filter((p) => /\.v\.(mp4|png)$/.test(p)).sort().reverse();
  /** The bytes of a chain in the index (a strand: the take that holds it). */
  async function chainBytes(key) {
    const t = index.tables;
    const entry = t.chains.get(key) ?? [...(t.weave.get(key) ?? [])].map((k) => t.chains.get(k)).find((c) => c && t.takes.has(c.key));
    const from = entry?.from;
    const src = from && sources.find((x) => x.name === from.store);
    return src ? { bytes: await src.store.read(from.path) } : null;
  }
  /** The take chain of a picture or video file, found by its u_ (newest version). Limits: walks all chains, fine to ~10⁴. */
  function chainOfVisual(path) {
    const u = readName(path.slice(path.lastIndexOf('/') + 1))?.u;
    const hits = [...index.tables.chains.values()].filter((c) => index.tables.takes.has(c.key) && [...c.defs.values()].some((d) => d.kind === 'v' && d.id && shortU(d.id) === u));
    return hits.sort((a, b) => String(b.head["'t"] ?? '').localeCompare(String(a.head["'t"] ?? '')))[0]?.key ?? null;
  }
  /** Lay elements (index keys) on the current chain: a new line on top (add-line.js). */
  async function layOn(keys, together = false) {
    const elements = (await Promise.all(keys.map(chainBytes))).filter(Boolean);
    if (!elements.length) return null;
    const r = await addLine({ own: store, chainPath: take.lastChain, elements, together, device, person });
    take.lastChain = r.chain;
    index = await buildIndex(sources);
    const head = readFile(dec.decode(await store.read(r.chain))).head;
    data.versions = Math.max(1, index.versions(writeId(head.id)).length);
    return r.chain;
  }
  /** An element of the line (its position beside the point) → the key of its take. */
  async function keyOfItem(i) {
    const all = await takeVisuals();
    const path = all[Math.max(0, Math.min(all.length - 1, (data.line?.at ?? 0) + i))];
    return path ? chainOfVisual(path) : null;
  }
  /** Play an earlier version of the current chain (level j, 0 = newest): its first picture or video. */
  async function playVersion(j) {
    if (!take.lastChain) return null;
    const head = readFile(dec.decode(await store.read(take.lastChain))).head;
    const version = index.versions(writeId(head.id))[j];
    if (!version) return null;
    const at = visualOf(version);
    return at ? show(at.path, at.store) : null;
  }
  /** The first picture or video of a chain (or of the chains it lays on): { store, path } or null. */
  function visualOf(chain) {
    const refs = [...chain.defs.values()];
    const visual = refs.find((d) => d.kind === 'v') ?? refs.filter((d) => d.kind === 'chain' && d.name !== 'chain.1').map((d) => index.chain(writeId(d.id))).flatMap((c) => (c ? [...c.defs.values()] : [])).find((d) => d.kind === 'v');
    const where = visual && index.sharingPoints(writeId(visual.id)).find((x) => /\.v\.(mp4|png)$/.test(x));
    if (!where) return null;
    const [name, ...rest] = where.split(':');
    const src = sources.find((x) => x.name === name);
    return src ? { store: src.store, path: rest.join(':') } : null;
  }
  /** A small picture for a tile: the picture itself, or the first frame of the video (96 px, kept for the session). */
  const thumbs = new Map(), pics = new Map();
  async function thumbOf(key) {
    if (thumbs.has(key)) return;
    thumbs.set(key, null);
    const at = takeOf(key) && visualOf(takeOf(key));
    if (!at) return;
    thumbs.set(key, await picOf(at));
    data.thumbs = Object.fromEntries(thumbs);
    paint();
  }
  /** The elements of the line around the current one get their pictures too (±4, kept by path). */
  async function lineThumbs() {
    const all = await takeVisuals(), at = data.line?.at ?? 0;
    const out = { ...(data.lineThumbs ?? {}) };
    for (let i = Math.max(0, at - 4); i <= Math.min(all.length - 1, at + 4); i++) out[i] = await picOf({ store, path: all[i] });
    data.lineThumbs = out;
    paint();
  }
  /** A small picture of a picture or video file (the first frame, 96 px), once per path. */
  async function picOf(at) {
    if (pics.has(at.path)) return pics.get(at.path);
    const blob = new Blob([await at.store.read(at.path)], { type: at.path.endsWith('.png') ? 'image/png' : 'video/mp4' });
    let url = URL.createObjectURL(blob);
    if (!at.path.endsWith('.png')) { // a video: draw its first frame
      const v = Object.assign(document.createElement('video'), { src: url, muted: true, playsInline: true, preload: 'auto' });
      await new Promise((done) => { v.onloadeddata = done; v.onerror = done; setTimeout(done, 3000); });
      const c = Object.assign(document.createElement('canvas'), { width: 96, height: 96 });
      const s = Math.min(v.videoWidth, v.videoHeight);
      if (s) c.getContext('2d').drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      url = s ? c.toDataURL('image/jpeg', 0.8) : null;
    }
    pics.set(at.path, url);
    return url;
  }

  /** Similar · viele, the upper half: the tiles slide down from the top (≈ 0.3 s). */
  async function openMany() {
    data.manyFull = false;
    data.reveal = 0;
    data.lowT = 0;
    step('similar-in');
    showSimilar(true);
    await Promise.all([animate('reveal', 0, 1), animate('lowT', 0, 1)]); // the tiles come down while the take window moves down
    delete data.lowT;
  }

  /** Similar · Doppel: result i of the tiles plays above in the same window as the live picture (loop, muted). */
  async function reference(i) {
    const key = data.similar[i];
    const at = key && takeOf(key) && visualOf(takeOf(key));
    if (!at) return null;
    const v = $('#template');
    const blob = new Blob([await at.store.read(at.path)], { type: at.path.endsWith('.png') ? 'image/png' : 'video/mp4' });
    if (at.path.endsWith('.png')) { v.dataset.picture = '1'; v.removeAttribute('src'); v.poster = URL.createObjectURL(blob); v.load(); v.classList.add('on'); }
    else { delete v.dataset.picture; v.poster = ''; v.src = URL.createObjectURL(blob); v.loop = true; v.muted = true; v.play().catch(() => {}); }
    data.double = key;
    data.doubleAt = i;
    return paint();
  }
  /** An index key (chain or strand) → its take chain entry. */
  const takeOf = (key) => index.tables.chains.get(key) ?? [...(index.tables.weave.get(key) ?? [])].map((k) => index.tables.chains.get(k)).find((c) => c && index.tables.takes.has(c.key)) ?? null;
  /** Show one picture or video in the replay element (a picture as its poster). */
  async function show(path, from = store) {
    const video = $('#replay');
    const blob = new Blob([await from.read(path)], { type: path.endsWith('.png') ? 'image/png' : 'video/mp4' });
    video.hidden = false;
    if (path.endsWith('.png')) { video.dataset.picture = '1'; video.removeAttribute('src'); video.poster = URL.createObjectURL(blob); video.load(); video.classList.add('on'); return; }
    delete video.dataset.picture;
    video.poster = '';
    video.src = URL.createObjectURL(blob);
    video.play();
  }

  /**
   * Strands I delete were shared before (a line {…} {:sharing-point.n} in a version of this chain): each of those sharing
   * points gets a remove request in its hello/ (remove-request.js); its signer's app honours it, as I am the author.
   */
  async function askAway(chainPath, strands) {
    if (!strands.length) return;
    const head = readFile(dec.decode(await store.read(chainPath))).head;
    const targets = new Set(index.versions(writeId(head.id)).flatMap((c) => [...c.defs.values()].filter((d) => d.kind === 'sharing-point' && d.path).map((d) => d.path)));
    for (const path of targets) await askAt(path, strands);
  }
  /** One remove request to one sharing point; not reachable now → kept on the device and asked again later (≤ 50 kept). */
  async function askAt(path, strands) {
    const there = menu.storeOf(path);
    try {
      if (!there) throw new Error('not open');
      await askRemove({ store: there, strands, device, person, deviceKey: (await deviceKeys()).device }); // sealed: the signer sees it comes from me
      return true;
    } catch {
      const later = laterList();
      if (!later.some((x) => x.path === path && JSON.stringify(x.strands) === JSON.stringify(strands))) later.push({ path, strands });
      try { localStorage.setItem('sign.removeLater', JSON.stringify(later.slice(-50))); } catch { /* private mode */ }
      return false;
    }
  }
  const laterList = () => { try { return JSON.parse(localStorage.getItem('sign.removeLater') || '[]'); } catch { return []; } };
  /** The requests that could not go out: tried again at the start and after each take. */
  async function askAgain() {
    const later = laterList();
    if (!later.length) return;
    try { localStorage.setItem('sign.removeLater', '[]'); } catch { return; }
    for (const { path, strands } of later) await askAt(path, strands); // failing ones go back into the list
  }

  // ---------- deleting the last take (chips take · strand · part) ----------
  async function removeLast(what, kinds = toUse(st)) {
    if (!take.lastChain) return step('done');
    const file = readFile(dec.decode(await store.read(take.lastChain)));
    const strands = [...file.defs.values()].filter((d) => ['v', 'a', 'x', 'l'].includes(d.kind));
    const names = what === 'take' ? strands.map((d) => d.name) : strands.filter((d) => kinds.includes(d.kind)).map((d) => d.name);
    // EXTEND(S4, part): a part of a strand ('part') with the moment from the line
    if (names.length && what !== 'part') {
      await askAway(take.lastChain, strands.filter((d) => names.includes(d.name))); // where it was shared: a request there
      await removeStrands({ own: store, chainPath: take.lastChain, names, chips: { similar: true }, device, person });
      index = await buildIndex(sources);
      feedback('gone');
    }
    step('done');
  }
  /** Saved or gone, shown at the point for 0.9 s (initial version R7): saved = a green ring going out, gone = a red dashed ring going in. */
  async function feedback(kind) {
    data.feedback = kind;
    await animate('feedbackP', 0, 1, 900);
    if (data.feedback === kind) { delete data.feedback; delete data.feedbackP; paint(); }
  }

  // ---------- panels ----------
  const panel = (id, on, chips, onChip) => {
    $(id).hidden = !on;
    if (on) draw($(id), chips, onChip);
  };
  const showSimilar = (on) => { // at the top: metadata and strand choice as chips, the hits as tiles (view)
    const hits = similar(index, { words: data.words, filters: filtersOf(index, filter) });
    data.similar = hits.slice(0, MANY).map((h) => h.key);
    for (const key of data.similar) thumbOf(key); // pictures for the tiles, as they come
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
  /** Open or close the context field: the bottom arc straightens into the field (or bends back), ~300 ms. */
  const openContext = (on, ms = 300) => {
    const field = $('#context');
    if (!on) { field.hidden = true; field.classList.remove('shown'); say.blur(); }
    else { field.hidden = false; say.focus(); } // there at once but unseen, so the keyboard may open inside the touch
    const from = data.open ?? 0, to = on ? 1 : 0, t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      data.open = from + (to - from) * t;
      paint();
      if (t < 1) return requestAnimationFrame(frame);
      if (on) field.classList.add('shown'); // the arc has become the field: it shows
      else delete data.open;
    };
    requestAnimationFrame(frame);
  };
  say.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !say.value && series) { // empty field: Backspace takes the last written gesture away (initial K6)
      const items = parseNotation(series);
      items.splice(items.findLastIndex((n) => n.t !== 'sym'), 1);
      series = writeNotation(items);
      return showSeries();
    }
    if (e.key !== 'Enter') return;
    const text = fromField(say.value); // ( ) nest, [ ] spells, missing brackets are closed
    const name = say.value.replace(/[()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
    say.value = '';
    if (text && settings.onboarding && STEPS[onboard.at]?.[0] === 'name') { // onboarding: this is my name, and the context of my name sign
      person.label = name;
      try { localStorage.setItem('sign.name', name); } catch { /* private mode */ }
      $('#context').classList.remove('breathe');
      learned('name');
    }
    if (!text) return openContext(false);
    series = `${series} ${text}`.trim();
    showSeries();
  });

  takeVisuals().then((all) => { data.line = { count: all.length, at: 0 }; return lineThumbs(); }).catch(() => {}); // the line is there from the start
  setTimeout(() => askAgain().catch(() => {}), 5000); // remove requests that could not go out before (the sharing points open first)

  globalThis.visualViewport?.addEventListener('resize', () => { data.viewH = globalThis.visualViewport.height; paint(); }); // the keyboard: the field stays above it

  if (settings.onboarding && STEPS[onboard.at]?.[0] === 'name') { // onboarding starts with the name: write it right away
    $('#context').classList.add('breathe');
    say.value = person.label; // a preset to change (as chosen beforehand): typing replaces it
    openContext(true);
    setTimeout(() => say.select(), 320);
  }

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
      case 'context-out': { // ↓ on a chip: this context goes away (sticky in front, or the written series)
        const text = hit.text;
        if (sticky.includes(text)) {
          sticky = sticky.filter((w) => w !== text);
          try { localStorage.setItem('sign.sticky', JSON.stringify(sticky)); } catch { /* private mode */ }
        } else {
          const keep = parseNotation(series).filter((n) => n.t === 'sym' || !readContext(writeNotation([n])).gestures.some((g) => g.chips.some((c) => c.text === text)));
          if (writeNotation(keep) === series) return null; // a chip of a saved take: EXTEND(S2, context) a new line on top without it
          series = writeNotation(keep);
        }
        return showSeries();
      }
      case 'flow': { // a connection between two sides (around their corner): on / off, kept on the device
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
      case 'photo': // the picture point on the visual arc: on = the point takes one picture
        data.photo = !data.photo;
        try { localStorage.setItem('sign.photo', data.photo ? '1' : ''); } catch { /* private mode */ }
        return paint();
      case 'focus': return focusAt(camera, hit.x, hit.y);
      case 'zoom': case 'waits': return null; // pinch goes straight to the camera, or on the point to the waits (handlers.pinch)
      case 'form': return null; // a corner dragged: handlers.slide shapes the window as the finger moves
      case 'switch-camera':
        if (take.recorder) return null;
        settings = choose(settings, 'facing', settings.facing === 'user' ? 'environment' : 'user');
        saveSettings();
        unwatch();
        camera = await flip(camera, settings.facing);
        $('#live').srcObject = camera;
        unwatch = watch(camera, onActivity, { video: $('#live') });
        return null;
      case 'similar-in': return openMany(); // first the upper half, sliding down
      case 'similar-out':
        if (st.similar && !data.double && (data.reveal ?? 1) > 0) await Promise.all([animate('reveal', data.reveal ?? 1, 0), animate('lowT', 1, 0)]); // the tiles slide up, the take window back to the middle
        await keepSimilar();
        step('similar-out');
        data.words = [];
        data.double = null; // Doppel ends with Similar
        data.manyFull = false;
        delete data.reveal; delete data.grow; delete data.lowT;
        $('#template').removeAttribute('src');
        return showSimilar(false);
      case 'share-last': take.shareOnce = null; take.shareChain = null; step('share-last'); return menu.show(true); // ↑ on the point: the sharing points as circles
      case 'always-there': return menu.dropKind(hit.n, hit.kind);
      case 'full': // full screen is for review (14.11.): the line from the current take, like a result in Similar · voll
        if (!(await takeVisuals()).length) return null;
        data.fullFrom = 'own';
        if (take.replayAt < 0) await replay(+1);
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
        paint();
        return data.levelAt == null ? null : playVersion(data.levelAt); // that version plays (index.versions)
      case 'into-line': // a Similar result laid on the chain: it flies into the line, then a new line slides in
        await intoLine(role);
        await layOn([data.similar[hit.index]].filter(Boolean)); // a new line {:chain.2} on top, the chain below (add-line.js)
        return arrive();
      case 'similar-all': { // all of Similar: one after another into the line, then one new line on the chain
        const n = Math.min(6, data.similar.length);
        for (let i = 0; i < n; i++) await intoLine(`similar:${i}`, 220);
        await layOn(data.similar.slice(0, n)); // one line, the results one after another
        return arrive();
      }
      case 'line-full': // the line in full screen: replay from the current one
        data.fullFrom = 'own';
        if (take.replayAt < 0) await replay(+1);
        step('full');
        return document.documentElement.requestFullscreen?.().catch(() => {});
      case 'similar-less': // ↑ on the tiles: full → half → closed
        if (data.manyFull) { await animate('grow', data.grow ?? 1, 0); data.manyFull = false; delete data.grow; return paint(); } // the arcs bend back
        return act('edge-out', 'upper-right');
      case 'from-top': // ↓ from the top: review ends · closed → viele half → viele full
        if (st.full) {
          if (data.double) { $('#replay').hidden = true; $('#replay').pause(); } // review of a result ends: Doppel again
          step('unfull');
          return document.exitFullscreen?.().catch(() => {});
        }
        if (st.similar && !data.double) { data.manyFull = true; data.grow = 0; return animate('grow', 0, 1); } // half → full: the arcs bend out
        return openMany();
      case 'context-open': return openContext(true);
      case 'context-close': return openContext(false);
      // ---------- in the table, not wired yet: each says where it docks ----------
      case 'take-over': return reference(hit.index); // Similar · Doppel: the result above, the live picture below
      case 'reference-out': data.double = null; $('#template').removeAttribute('src'); return paint(); // back to viele
      case 'reference-next': case 'reference-before': { // ← next · → before, in the order of the tiles
        const n = data.similar.length;
        return n ? reference((data.doubleAt + (row.action === 'reference-next' ? 1 : -1) + n) % n) : null;
      }
      case 'reference-full': { // Similar · voll = review: the result fills the screen like a line (↓ from the top = back)
        const at = takeOf(data.double) && visualOf(takeOf(data.double));
        if (!at) return null;
        await show(at.path, at.store);
        data.fullFrom = 'similar';
        step('full');
        return document.documentElement.requestFullscreen?.().catch(() => {});
      }
      case 'share': { // ↑ on an element of the line: that take goes to the sharing points (the menu, as for the last take)
        const chain = takeOf(await keyOfItem(hit.index));
        if (!chain?.from || chain.from.store !== 'own') return null;
        take.shareChain = chain.from.path;
        return menu.show(true);
      }
      case 'remove': { // ↓ all the way on an element: its strands go, here and (by request) where it was shared
        const chain = takeOf(await keyOfItem(hit.index));
        if (!chain?.from || chain.from.store !== 'own') return null;
        const strands = [...chain.defs.values()].filter((d) => ['v', 'a', 'x', 'l'].includes(d.kind));
        await askAway(chain.from.path, strands);
        await removeStrands({ own: store, chainPath: chain.from.path, names: strands.map((d) => d.name), chips: { similar: true }, device, person });
        index = await buildIndex(sources);
        data.line = { count: (await takeVisuals()).length, at: 0 };
        data.lineThumbs = {}; lineThumbs();
        return paint();
      }
      case 'aside': return null; // EXTEND(S3, line): set aside (out of the line, kept) needs the aside line in 4-save
      case 'after': case 'together': { // an element of the line beside the point (after) or onto it (together)
        const key = await keyOfItem(hit.index);
        return key ? layOn([key], row.action === 'together').then(() => arrive()) : null;
      }
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
    pinch: (factor, role, how = {}) => { // on the point: one above the other = camera zoom, side by side = time (line zoom, or the waits) · on the picture: the window's form
      if (role === 'point') {
        if ((how.angle ?? 90) >= 45) return zoomBy(camera, how.fy ?? factor); // up and down: the picture
        const f = how.fx ?? factor; // across: time
        if (data.items?.length && ['line', 'record', 'stream'].includes(st.screen)) { data.timeZoom = Math.max(0.25, Math.min(8, (data.timeZoom ?? 1) * f)); return paint(); }
        return st.ready ? waitsBy(f) : null;
      }
      return reshape(formBy(data.shape, factor, how));
    },
    slide: (role, dx, dy) => { // a corner of the window: inwards rounder, outwards squarer
      const [sx, sy] = { 'corner:tl': [1, 1], 'corner:tr': [-1, 1], 'corner:bl': [1, -1], 'corner:br': [-1, -1] }[role] ?? [0, 0];
      return reshape({ round: data.shape.round + (dx * sx + dy * sy) / Math.SQRT2 / 160 });
    },
    slideEnd: () => saveSettings(),
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
  $('#similar').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 72) act('edge-out', 'upper-right'); });
  $('#share').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 24) act('edge-out', 'middle-right'); });
  addEventListener('resize', paint);
  $('#replay').addEventListener('timeupdate', (e) => { data.timeMs = e.target.currentTime * 1000; });
  paint();
}
