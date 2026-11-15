// app.js — the web app: wiring only. What a gesture means is in gestures.js, what the screen does next
// in state.js, how it looks in view/ring.js, where it lands on the screen in screen.js.
//
//   grammar (DESIGN §4, gestures.js): what (where the finger starts, or what the other finger holds) × do × onto
//   point: tap = take with the strands that are on · hold = take while held · double-tap = always ready
//          ↑ out over the upper edge = share · ↓ = set aside · ↓ out over the lower edge = delete
//          ← the later take comes from the right (towards live) · → the one before, from the left · in a line next/before
//   strand arc: tap = on/off (stays until changed) · hold = grip (green, the other finger acts on it; carried = drag)
//          · spread its chips open, squeeze them closed · ← push the field to its edge
//   chip: tap = on/off · hold = grip · ↓ take this context away · double-tap = sticky on/off (a prefix for every take)
//   live picture: tap = focus · ← → = the other camera slides in (also in a take) · hold = grip · pinch = camera zoom
//          · held + the other finger pulls (stretch) = the window's form
//   no settings area (14.11.): form = picture held + stretch · strands as left · waits = pinch on the point
//          · onboarding again = hold your own tile in the sharing menu
//   edges: middle left strands · upper right Similar · middle right share · top: ↑ full, ↓ Similar
//   scale: spread over the free part above the take = Similar comes nearer (closed → half → full), squeeze = it goes;
//          spread on a tile = fly to it (Doppel), again = voll; ↑ on Similar = pushed back (full → half → closed);
//          on the line: the takes apart / together (zoom), at the end straight, then full screen; older lines: apart
//          · squeeze = back the same steps · the context field opens by a tap on its arc only (15.11.)
//   window: a circle as large as fits, or ellipse / rounded rectangle; arcs by degrees: line −60…60 · audio 60…140 ·
//          context 140…220 · visual 220…300 · line: the oldest left · Similar as tiles at the top: one onto the line or
//          the point, or the band onto the point = all onto the chain
//   onboarding: the next element breathes, a pale point shows its gesture (onboarding.js); the first take is the name sign
//   parallel (one finger holds, the other acts; rows with `held` in gestures.js):
//          strand held + tap point = record only it onto the last take · + hold point = only it while held
//          · + ↑ out = share only it · + ↓ out = delete only it · + in from upper right = Similar from it
//          chip held + tap point = a take with this context (a series while held) · + upper right = Similar for it
// Depends:   browser; 0-i18n, 1-model, 2-storage/local, 3-index, 4-save, 5-take, 7-similar, 9-ui
// Test:      needs a browser; every part is tested on its own (tests/ui, state, view, list, similar).
// Limits:    Whisper only after a take (live and keywords: EXTEND(S2, live)); one take records at a time; one property
//            held at a time. Every row of the gesture table has a case below, wired or EXTEND (tests/ui).

import './persons-boot.js'; // first: several persons on this device (persons.js)
import { translator } from '../0-i18n/t.js';
import { LocalStore } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { saveTake } from '../4-save/save-take.js';
import { removeStrands } from '../4-save/remove.js';
import { saveSimilar } from '../4-save/save-similar.js';
import { addLine } from '../4-save/add-line.js';
import { askRemove } from '../8-join/remove-request.js';
import { deviceKeys } from './device-keys.js';
const sealKey = async () => (await deviceKeys().catch(() => null))?.device ?? null; // every .sign this device writes gets its y_ (SCHEMA B2)
import { readName } from '../1-model/filename.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { relay } from '../5-take/relay.js';
import { loadWhisper } from '../5-take/whisper-engine.js';
import { transcribe, contextOf as wordsRow } from '../5-take/whisper.js';
import { toMono, resample } from '../5-take/resample.js';
import { addEcho } from '../4-save/add-echo.js';
import { similar } from '../7-similar/filter.js';
import { newPerson, newSource, shortU, writeId } from '../1-model/ids.js';
import { readFile } from '../1-model/file.js';
import { withTakes } from './view/chips.js';
import { withSticky, afterTake as stepSeries, nextOfSeries, readContext, contextTree, fromField } from '../1-model/context.js';
import { write as writeNotation, parse as parseNotation } from '../1-model/notation.js';
import { actionFor } from './gestures.js';
import { startState, next, toRecord, toKeep, toUse } from './state.js';
import { MANY } from './view/ring.js';
import { formOf, formBy, snapForm, extentOf, inside as insideWindow } from './view/shape.js';
import { mountScreen, targetOf } from './screen.js';
import { normalize, readyStep, choose, CHOICES } from './settings.js';
import { watch } from './ready.js';
import { flip, flipPicture, zoomBy, focusAt, torch } from './camera.js';
import { bind, edgeZone, pinchStep } from './touch.js';
import { strandChips, draw } from './panels.js';
import { filterChips, toggle, filtersOf, EMPTY } from './similar-filter.js';
import { mountShareMenu } from './share-mount.js';
import { keychain } from './keychain.js';
import { hintOf, progress, done, NAME_SIGN_STEP, GESTURE_STEPS, STEPS } from './onboarding.js';
import { drawWords } from '../1-model/words.js';
import { installDavFetch } from '../2-storage/dav-fetch.js';
installDavFetch(); // native app: PROPFIND, MKCOL, MOVE through the app's own plugin (Android refuses them otherwise)
import { installDebug } from './debug.js';
import { createWhere } from '../5-take/where.js';

const here = createWhere(); // o_ of each take: H3 cell, resolution 5
installDebug(); // every request into a short log (hold the line under the circles = share it)

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
  if (hit.target === 'live') return { target: 'strand', kind: 'v' }; // the picture is the visual strand
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
  const ownKeys = await deviceKeys().then((k) => ({ [device]: k.device.public }), () => ({})); // this device's z_: the index checks seals
  const reindex = () => buildIndex(sources, { keys: ownKeys });
  let index = await reindex();
  /** The newest version of my newest take: what the chain gestures lay on after a restart. */
  const newestOwnChain = () => {
    const top = new Set([...index.tables.chains.values()].map((c) => c.below).filter(Boolean)); // chains with one on top are older versions
    const mine = [...index.tables.chains.values()].filter((c) => c.from?.store === 'own' && !top.has(c.key) && c.from.path.startsWith('chain/') && (!c.head['@'] || c.head['@'] === person.label)); // mine: several persons may share this device
    return mine.sort((a, b) => String(b.head["'t"] ?? '').localeCompare(String(a.head["'t"] ?? '')))[0]?.from.path ?? null; // newest by its time
  };
  take.lastChain = newestOwnChain(); // after a restart the chain gestures go on where they were

  const screen = mountScreen({ root: $('#screen'), live: $('#live'), replay: $('#replay'), template: $('#template'), pair: $('#pair'), overlay: $('#overlay') });
  const paint = () => screen.paint(st, { ...data, hint: hintOf(onboard.at, settings.onboarding) });
  /** An action was done: the onboarding goes one step on if it was its step; at the end it switches off. */
  const learned = (action) => {
    if (!settings.onboarding) return;
    const at = progress(onboard.at, action);
    if (at === onboard.at) return;
    onboard.at = at;
    try { localStorage.setItem('sign.onboard', String(at)); } catch { /* private mode */ }
    if (done(at)) { settings = choose(settings, 'onboarding', false); saveSettings(); }
    suggestGesture();
    paint();
  };
  /**
   * Password gestures (15.11.): at the first two steps three drawn words wait as pale chips; tap one = it is the word
   * (it turns solid), ↓ on them = three others. The third gesture is one's own: type a word in the field, or none.
   */
  function suggestGesture(again = false) {
    const i = GESTURE_STEPS.indexOf(onboard.at);
    if (!settings.onboarding || i < 0 || i > 1) { if (data.gestureChoices) { data.gestureChoices = null; data.gestureWord = null; data.offers = []; } return; }
    if (!data.gestureChoices || again) { data.gestureChoices = drawWords(3); data.gestureWord = null; }
    data.offers = data.gestureChoices.map((text) => ({ text, offer: true, origin: 'password', picked: text === data.gestureWord }));
  }
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
    onLook: (path, from) => { menu.show(false); return show(path, from).catch(() => {}); }, // tap on a hello: its name sign in the window
    onLookAll: async (items) => { // double-tap on a hello: its password gestures one after the other, then the account's earlier ones (15.11.)
      menu.show(false);
      return lookAt(items);
    },
    words: () => [...data.chips.filter((c) => !c.stable).map((c) => c.text), ...($('#say')?.value ?? '').split(/\s+/)].filter(Boolean), // context finds accounts and hellos (admin)
    panel: $('#share'), own: store, keychain, person, device, t,
    index: () => index, // the emergency sheet counts from it
    lastChain: async () => take.shareChain ?? take.lastChain, // an element of the line (↑ on it), else the last take
    selection: () => toRecord(st), // double-tap on a sharing point = these strands always go there
    once: () => take.shareOnce, // a strand held while ↑ on the point: only it is shared this time
    gestures: async () => { // the password gestures go with the door's hello (15.11.: the admin compares them by eye until the model can)
      let list = []; try { list = JSON.parse(localStorage.getItem('sign.passwords') || '[]'); } catch { /* none */ }
      return (await Promise.all(list.map((p) => store.read(p).catch(() => null)))).filter(Boolean);
    },
    nameSign: async () => { // the first take of the onboarding goes along with every hello
      try { const p = localStorage.getItem('sign.nameSign'); return p ? await store.read(p) : null; } catch { return null; }
    },
    onSources: async (list) => { sources = list; index = await reindex(); },
    onHello: () => learned('hello'), // onboarding: I dragged myself onto the door
    onOwnHold: () => { // my own tile held (14.11.): a new person on this device; its first steps follow (name, name sign, hello)
      if (globalThis.signPersons?.add()) return location.reload();
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
    await addEcho({ own: store, chainPath, from: 'a.1', kind: 'x', row: wordsRow(words), echo: engine.label, device, person , deviceKey: await sealKey() });
    setChips(words.map((w) => ({ text: w.text, t: [w.from, w.to], heard: true }))); // heard, not typed: the wave
    paint();
    index = await reindex();
  }

  // ---------- always ready: motion or sound starts and stops a take ----------
  const activity = [];
  const onActivity = (e) => {
    activity.push(e);
    while (activity.length > 100) activity.shift();
    if (take.recorder) { // sound level as bars on the top arc
      data.levels = [...data.levels.slice(-19), Math.max(0, Math.min(1, (20 * Math.log10(Math.max(e.sound ?? 0, 1e-5)) + 60) / 50))]; // in dB: −60 … −10 dB → 0 … 1, so quiet and loud differ (14.11.)
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
    take.context = action === 'take-with-context' ? contextOf(st.hold?.text) : first ? nextOfSeries(series) : ''; // a prefix series: prefix + its next element
    if (settings.onboarding && GESTURE_STEPS.includes(onboard.at)) { // a password gesture: the picked word (1, 2) or one's own typed word (3)
      const own = onboard.at === GESTURE_STEPS[2] && first ? writeNotation([first]).replace(/^\(|\)$/g, '') : '';
      take.context = `(password${data.gestureWord ? ` ${data.gestureWord}` : own ? ` ${own}` : ''})`;
      take.gesture = true;
    }
    take.fromSeries = action !== 'take-with-context' && Boolean(first);
    if (data.adopted?.length) { take.context = [take.context, ...data.adopted.map((x) => `(${x})`)].filter(Boolean).join(' '); data.adopted = []; } // offers taken from the result above
    if (data.photo && toRecord(st).includes('v')) { // the picture point is on: one picture, no sound, saved at once
      const picture = await snapshot($('#live'));
      take.recorder = { stop: async () => ({ lengthMs: 0, picture, video: null, audio: null }), frame() {} };
      return end();
    }
    take.starting = true; // the microphone takes ~50–300 ms to open; a tap meanwhile = stop right after
    const tap = await browserTap(camera).finally(() => { take.starting = false; });
    if (st.screen !== 'record') { tap.stop(); return; } // undone meanwhile (a second finger came)
    try { take.relay = relay($('#live')); } catch { take.relay = null; } // the camera may change during the take (14.11.)
    const source = take.relay ? new MediaStream([take.relay.track, ...camera.getAudioTracks()]) : camera;
    take.recorder = startTake(source, { MediaRecorder, tapAudio: () => tap });
    here.refresh(); // o_: where this take is, ready when it is saved (never waits)
    navigator.vibrate?.(25); // the take runs: felt, not only seen
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
    take.relay?.stop(); take.relay = null;
  }

  async function end() {
    if (take.starting) { take.stopSoon = true; return; }
    if (!take.recorder) return;
    const recorded = await take.recorder.stop();
    take.relay?.stop(); take.relay = null;
    navigator.vibrate?.([15, 60, 15]); // stopped: two short pulses
    data.paused = false;
    take.recorder = null;
    const kinds = toRecord(st); // what this take records, decided before it started
    const onto = st.base; // adding to an element: the chain below
    const keep = toKeep(st);
    step('take'); // → saving
    let saved;
    try {
      saved = await saveTake({
        device, person, store, cell: here.now(), now: Date.now(), lengthMs: recorded.lengthMs, context: withSticky(sticky.map((w) => `(${w})`).join(' '), take.context),
        video: kinds.includes('v') ? recorded.video : null,
        picture: kinds.includes('v') ? recorded.picture ?? null : null,
        audio: kinds.includes('a') ? recorded.audio : null,
        onto, keep, deviceKey: await sealKey(),
      });
    } catch { // could not be saved (storage full, gone): back to ready at once, the point says so
      step('saved');
      feedback('gone');
      return;
    }
    take.lastChain = saved.chain.path;
    if (data.double) { // Similar · Doppel: the result is the line underneath, the new take a line on top of it (14.11.)
      const ref = await chainBytes(data.double);
      if (ref) take.lastChain = (await addLine({ own: store, below: ref.bytes, elements: [{ bytes: await store.read(saved.chain.path) }], device, person , deviceKey: await sealKey() })).chain;
    }
    if (take.fromSeries) { series = stepSeries(series); showSeries(); } // the series goes one on (a prefix series: one element)
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
    }
    if (take.gesture) { // a password gesture saved: kept for this person; the hello takes them along (after the third)
      const video = saved.paths.find((p) => /\.v\.(mp4|webm)$/.test(p));
      let list = []; try { list = JSON.parse(localStorage.getItem('sign.passwords') || '[]'); } catch { /* none yet */ }
      try { if (video) localStorage.setItem('sign.passwords', JSON.stringify([...list, video].slice(-3))); } catch { /* private mode */ }
      take.gesture = false;
      if (onboard.at === GESTURE_STEPS[2]) menu.joinProject().catch(() => {}); // all three there: hello to the project's door
      data.gestureWord = null; data.gestureChoices = null;
    }
    learned(take.began);
    if (settings.flows.includes('a>x') && recorded.audio && kinds.includes('a')) flowAudio(saved.chain.path, recorded.audio).catch((err) => console.warn('whisper', err));
    await menu.afterTake(saved.paths); // (always) rules of the list
    index = await reindex();
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
  let rawShape = null; // the form as the fingers have it; what shows rests at the circle when near (snapForm)
  function reshape(change) {
    rawShape = formOf({ ...(rawShape ?? data.shape), ...change });
    const was = data.shape, now = snapForm(rawShape, was);
    if ((now.round === 1 && now.aspect === 1) && !(was.round === 1 && was.aspect === 1)) navigator.vibrate?.(12); // arrived at the circle: a short tick
    data.shape = now;
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
    const r = await addLine({ own: store, chainPath: take.lastChain, elements, together, device, person , deviceKey: await sealKey() });
    take.lastChain = r.chain;
    index = await reindex();
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
  /** The context text of a take chain (its :x strand), or ''. */
  async function contextTextOf(chain) {
    const x = [...chain.defs.values()].find((d) => d.kind === 'x' && d.id);
    const where = x && index.sharingPoints(writeId(x.id)).find((p) => /\.x\.sign$/.test(p));
    if (!where) return '';
    const [name, ...rest] = where.split(':');
    const src = sources.find((y) => y.name === name);
    if (!src) return '';
    const text = new TextDecoder().decode(await src.store.read(rest.join(':')));
    return readFile(text).rows.map((r) => r.text ?? '').join(' ').trim();
  }
  /**
   * Similar · Doppel (14.11.): the context of the result above comes into my field greyed, as offers: one gesture = one
   * chip or a cluster of chips in a bubble (chips in chips). Tap an offer = it becomes mine; ↓ = away.
   */
  async function offerContext(chain) {
    const text = chain ? await contextTextOf(chain).catch(() => '') : '';
    const mine = new Set(data.chips.map((c) => c.text));
    data.offers = readContext(text).gestures.map((g) => g.chips.map((c) => c.text)).filter((w) => w.length && !mine.has(w.join(' ')))
      .map((w) => (w.length > 1 ? { items: w.map((text) => ({ text })), offer: true, origin: 'similar' } : { text: w[0], offer: true, origin: 'similar' }));
  }
  const offerText = (o) => (o.items ? o.items.map((c) => c.text).join(' ') : o.text);
  /** An offer taken (14.11.): it joins my context for this take, as written there (one gesture, in front of the series). */
  function adopt(text) {
    data.offers = (data.offers ?? []).filter((o) => offerText(o) !== text);
    data.adopted = [...(data.adopted ?? []), text]; // goes into the next take's context
    setChips([...data.chips.filter((c) => !c.stable), { text }]);
    navigator.vibrate?.(8);
    return paint();
  }
  /** A small picture for a tile: the picture itself, or the first frame of the video (96 px, kept for the session). */
  const thumbs = new Map(), pics = new Map();
  async function thumbOf(key) {
    if (thumbs.has(key)) return;
    thumbs.set(key, null);
    const at = atOf(key);
    if (!at) return;
    thumbs.set(key, await picOf(at).catch(() => null));
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

  /** Files from elsewhere as the Similar tiles (admin: a hello's name sign and password gestures, 15.11.); closing Similar ends it. */
  async function lookAt(items) {
    for (const k of [...thumbs.keys()]) if (k.startsWith('look:')) thumbs.delete(k);
    data.look = items;
    data.double = null;
    if (st.similar) showSimilar(true); else await openMany();
    const paired = items.findIndex((x) => x.pair); // a known person on a new device: straight into Doppel, new above, original below
    return paired >= 0 ? reference(paired) : null;
  }
  /** Doppel of a hello from a known person (15.11.): new and original side by side above (within | hello); below stays free for the own take. */
  async function pairOn(path, from) {
    const v = $('#pair');
    if (!path) return pairOff();
    v.src = URL.createObjectURL(new Blob([await from.read(path)], { type: 'video/mp4' }));
    v.dataset.on = '1';
    v.play().catch(() => {});
  }
  function pairOff() {
    const v = $('#pair');
    if (!v.dataset.on) return;
    delete v.dataset.on;
    v.pause(); v.removeAttribute('src'); v.hidden = true;
  }
  /** Admin, in Doppel: move the person this take belongs to one pile on (up) or back (down); her takes leave, the next one shows. */
  async function decide(how) {
    const at = data.look?.[data.doubleAt];
    if (!at?.[how]) return null;
    navigator.vibrate?.(how === 'up' ? 20 : [12, 50, 12]); // felt at once: on = one pulse, back = two
    let r;
    try { r = await at[how](); } catch { navigator.vibrate?.([40, 40, 40]); return null; } // not reachable: it stays, three pulses
    if (r === 'wait') { navigator.vibrate?.(250); return null; } // asks once more: the same gesture again within 5 s (delete for good)
    const rest = data.look.filter((x) => x.group !== at.group);
    if (!rest.length) { pairOff(); return act('edge-out', 'upper-right'); }
    const next = Math.min(data.look.slice(0, data.doubleAt).filter((x) => x.group !== at.group).length, rest.length - 1);
    for (const k of [...thumbs.keys()]) if (k.startsWith('look:')) thumbs.delete(k);
    data.look = rest;
    showSimilar(true);
    return reference(next);
  }
  /** A tile key → { store, path } of its picture or video: an index key, or look:i. */
  const atOf = (key) => {
    if (!key?.startsWith('look:')) return takeOf(key) && visualOf(takeOf(key));
    const x = data.look?.[Number(key.slice(5))];
    return x ? { store: x.from, path: x.path } : null;
  };
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
    const at = key && atOf(key);
    if (!at) return null;
    const v = $('#template');
    const blob = new Blob([await at.store.read(at.path)], { type: at.path.endsWith('.png') ? 'image/png' : 'video/mp4' });
    if (at.path.endsWith('.png')) { v.dataset.picture = '1'; v.removeAttribute('src'); v.poster = URL.createObjectURL(blob); v.load(); v.classList.add('on'); }
    else { delete v.dataset.picture; v.poster = ''; v.src = URL.createObjectURL(blob); v.loop = true; v.muted = true; v.play().catch(() => {}); }
    data.double = key;
    data.doubleAt = i;
    if (!data.look) await offerContext(takeOf(key));
    await pairOn(data.look?.[Number(key.slice(5))]?.pair, data.look?.[Number(key.slice(5))]?.from);
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
      await removeStrands({ own: store, chainPath: take.lastChain, names, chips: { similar: true }, device, person , deviceKey: await sealKey() });
      index = await reindex();
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
    if (data.look) { data.similar = data.look.map((_, i) => `look:${i}`); data.similar.forEach(thumbOf); return panel('#similar', on, [], () => {}); }
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
    await saveSimilar(store, { kinds: f.kinds, persons: f.persons, time, sharingPoints: f.sharingPoints.map((label) => ({ label })) }, { device, person, deviceKey: await sealKey() });
  }

  // ---------- the context field: chips, and writing (one gesture per Enter; the series goes one on per take) ----------
  const say = $('#say');
  function showSeries() {
    setChips(withTakes(contextTree(series))); // bubbles in bubbles; one take per element: now, next, some time later; ↑ = flies
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
      globalThis.signPersons?.named(name); // the persons on this device show it
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
    if (hit.target === 'strand' && hit.kind === 'x' && gesture === 'tap' && !st.hold) hit = { ...hit, target: 'context' }; // the context arc: a tap opens / closes its field (15.11.)
    if (hit.target === 'delete') return gesture === 'tap' ? removeLast(hit.what) : null;
    const mode = st.mode === 'line' ? 'line' : st.similar ? 'similar' : 'take';
    const held = st.hold?.target ?? null; // what the other finger holds (parallel gesture)
    const row = actionFor({ gesture, target: hit.drag ?? hit.target, mode, held });
    const kind = hit.kind ?? st.hold?.kind;
    if (row && !['take', 'take-while-held', 'strand-while-held', 'add-strand', 'take-with-context'].includes(row.action)) learned(row.action); // takes count when saved
    switch (row?.action) {
      case 'take': return take.recorder || take.starting ? end() : begin('take');
      case 'grip': { // hold on a strand, chip or the picture: it is the property now (green), nothing records
        const hold = propertyOf(role);
        if (!hold || propertyRole === role) return null;
        propertyRole = role;
        return step('hold-property', { hold });
      }
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
        if (take.recorder?.pause) { // during a take: pause / go on (14.11.); a tap still stops it
          if (take.recorder.paused) take.recorder.resume(); else take.recorder.pause();
          data.paused = take.recorder.paused;
          return paint();
        }
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
      case 'focus': { // only inside the visible window (also during a take); the camera wants 0…1 of its picture
        const v = screen.last?.video, win = screen.last?.window;
        const r = $('#screen').getBoundingClientRect(), x = hit.x - r.left, y = hit.y - r.top;
        if (!v || !win || !insideWindow(win, x, y)) return null;
        data.focus = { x, y };
        focusAt(camera, (x - (v.cx - v.d / 2)) / v.d, (y - (v.cy - v.d / 2)) / v.d).catch(() => {});
        await animate('focusT', 0, 1, 900);
        delete data.focus; delete data.focusT;
        return paint();
      }
      case 'zoom': case 'waits': return null; // pinch goes straight to the camera (picture), or on the point to time / the waits (handlers.pinch)
      case 'form': return null; // the picture held, the other finger pulls: handlers.stretch shapes the window as it moves
      case 'switch-camera':
        if (take.recorder && !take.relay) return null; // without the canvas the recorder would end
        settings = choose(settings, 'facing', settings.facing === 'user' ? 'environment' : 'user');
        saveSettings();
        unwatch();
        camera = take.recorder ? await flipPicture(camera, settings.facing) : await flip(camera, settings.facing); // in a take the sound goes on
        $('#live').srcObject = camera;
        unwatch = watch(camera, onActivity, { video: $('#live') });
        return null;
      case 'similar-in': return openMany(); // first the upper half, sliding down
      case 'similar-out':
        if (st.similar && !data.double && (data.reveal ?? 1) > 0) await Promise.all([animate('reveal', data.reveal ?? 1, 0), animate('lowT', 1, 0)]); // the tiles slide up, the take window back to the middle
        if (!data.look) await keepSimilar();
        step('similar-out');
        data.words = [];
        data.double = null; // Doppel ends with Similar
        if (data.look) { delete data.look; $('#template').removeAttribute('src'); pairOff(); } // a hello looked at: done
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
      case 'straighten': // spread on the line: straight, then full screen (replay from the current one)
        if ((data.bend ?? 1) > 0) return animate('bend', data.bend ?? 1, 0);
        data.fullFrom = 'own';
        if (take.replayAt < 0) await replay(+1);
        step('full');
        return document.documentElement.requestFullscreen?.().catch(() => {});
      case 'bend': // squeeze: full screen ends, then back into the arc
        if (st.full) { step('unfull'); return document.exitFullscreen?.().catch(() => {}); }
        return animate('bend', data.bend ?? 0, 1);
      case 'levels-open': data.levelsOpen = true; return paint();
      case 'levels-close': data.levelsOpen = false; return paint();
      case 'level-open': // choose an earlier line of the chain (tap again = back to the current one)
        data.levelAt = data.levelAt === hit.index ? null : hit.index;
        paint();
        return data.levelAt == null ? null : playVersion(data.levelAt); // that version plays (index.versions)
      case 'into-line': // a Similar result laid on the chain: it flies into the line, then a new line slides in
        if (data.look) return null; // files of a hello are looked at, not taken
        await intoLine(role);
        await layOn([data.similar[hit.index]].filter(Boolean)); // a new line {:chain.2} on top, the chain below (add-line.js)
        return arrive();
      case 'similar-all': { // all of Similar: one after another into the line, then one new line on the chain
        if (data.look) return null;
        const n = Math.min(6, data.similar.length);
        for (let i = 0; i < n; i++) await intoLine(`similar:${i}`, 220);
        await layOn(data.similar.slice(0, n)); // one line, the results one after another
        return arrive();
      }
      case 'similar-nearer': // spread above the take or over Similar: closed → half → full (a far planet comes nearer)
        if (!st.similar) return openMany();
        if (!data.double && !data.manyFull) { data.manyFull = true; data.grow = 0; return animate('grow', 0, 1); } // half → full: the arcs bend out
        return null;
      case 'similar-farther': // squeeze: full → half → closed
        if (data.manyFull) { await animate('grow', data.grow ?? 1, 0); data.manyFull = false; delete data.grow; return paint(); } // the arcs bend back
        return st.similar ? act('edge-out', 'upper-right') : null;
      case 'share-in': take.shareOnce = null; take.shareChain = null; return menu.show(true); // pulled in from the middle right
      case 'share-out': return menu.show(false);
      case 'from-top': // ↓ from the top: review ends · closed → viele half → viele full
        if (st.full) {
          if (data.double) { $('#replay').hidden = true; $('#replay').pause(); } // review of a result ends: Doppel again
          step('unfull');
          return document.exitFullscreen?.().catch(() => {});
        }
        if (st.similar && !data.double) { data.manyFull = true; data.grow = 0; return animate('grow', 0, 1); } // half → full: the arcs bend out
        return openMany();
      case 'from-top-far': // a long pull from the top (14.11.): viele full at once; in full screen it just ends it
        if (st.full) return act('down', 'top-middle');
        if (!st.similar) await openMany();
        if (!data.double && !data.manyFull) { data.manyFull = true; data.grow = 0; return animate('grow', 0, 1); }
        return null;
      case 'context-open': return openContext(!((data.open ?? 0) > 0.5)); // tap: open, tap again: closed
      case 'context-close': return openContext(false);
      case 'line-zoom': return null; // continuous: handlers.pinch
      // ---------- in the table, not wired yet: each says where it docks ----------
      case 'take-over': return reference(hit.index); // Similar · Doppel: the result above, the live picture below
      case 'look-up': return decide('up'); // admin: ↑ = on to the next pile (15.11.)
      case 'reference-out': // squeeze on the result: farther, back to Similar · viele
        data.double = null; data.offers = []; $('#template').removeAttribute('src'); pairOff(); return paint(); // back to viele
      case 'look-down': return decide('down'); // admin: ↓ = back a pile (join → hello anew, within → quiet)
      case 'reference-next': case 'reference-before': { // ← next · → before, in the order of the tiles
        const n = data.similar.length;
        return n ? reference((data.doubleAt + (row.action === 'reference-next' ? 1 : -1) + n) % n) : null;
      }
      case 'reference-full': { // Similar · voll = review: the result fills the screen like a line (↓ from the top = back)
        const at = atOf(data.double);
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
        await removeStrands({ own: store, chainPath: chain.from.path, names: strands.map((d) => d.name), chips: { similar: true }, device, person , deviceKey: await sealKey() });
        index = await reindex();
        data.line = { count: (await takeVisuals()).length, at: 0 };
        data.lineThumbs = {}; lineThumbs();
        return paint();
      }
      case 'aside': return null; // EXTEND(S3, line): set aside (out of the line, kept) needs the aside line in 4-save
      case 'after': case 'together': { // an element of the line beside the point (after) or onto it (together)
        const key = await keyOfItem(hit.index);
        return key ? layOn([key], row.action === 'together').then(() => arrive()) : null;
      }
      default: return null;
    }
  }

  // ---------- touch on the screen: each finger has its role, read when it goes down ----------
  const LINE_ZOOM = [0.6, 2.2]; // the takes on the line: as close / as far apart as they go (× their size)
  let propertyRole = null; // the finger that holds a property (gripped, or parallel gesture)
  let paired = false; // the other finger acted while it was held: its lifting is no drag
  let spentRole = null; // that finger just let go after acting as a property: its drag end is not a drag
  /** The window's edges on the screen: [top, bottom] in client px, or null. */
  const windowEdges = () => {
    const win = screen.last?.window;
    if (!win) return null;
    const r = $('#screen').getBoundingClientRect(), [, ey] = extentOf(win);
    return [r.top + win.cy - ey, r.top + win.cy + ey];
  };
  const handlers = {
    down: (e) => {
      const role = screen.roleAt(e);
      const doubles = role === 'point' || role?.startsWith('chip:') || role === 'sticky'; // these wait for a second tap
      handlers.doubleTap = doubles ? () => act('double-tap', role) : undefined;
      return role;
    },
    tap: (x, y, role) => {
      if (!$('#share').hidden && role !== 'point') return menu.show(false); // a tap beside the circles closes them
      if (role?.startsWith('offer:') && data.gestureChoices) { data.gestureWord = role.slice(6); suggestGesture(); return paint(); } // this word for the password gesture
      if (role?.startsWith('offer:')) return adopt(role.slice(6)); // a greyed context of the result above: now mine
      return act('tap', role, { x, y });
    },
    hold: (role) => act('hold', role),
    parallel: async (heldRole) => { // a second finger came while one is held: the held thing is (or becomes) the property
      paired = true;
      const hold = propertyOf(heldRole);
      if (!hold || propertyRole === heldRole) return; // already gripped: the other finger just acts
      propertyRole = heldRole;
      if (st.screen === 'record' && st.held) await cancelTake(); // only what a hold started alone is not kept
      step('hold-property', { hold });
    },
    holdEnd: (role) => {
      if (propertyRole && role === propertyRole) {
        if (paired) spentRole = role; // it was a property for the other finger, not carried
        propertyRole = null; paired = false;
        return step('release-property');
      }
      if (st.held) end(); else if (st.sub === 'scrub') step('release');
    },
    out: (x0, y0, x1, y1, dir) => { // the edge rule: ended beyond the window's upper / lower edge
      const edges = windowEdges();
      if (!edges) return undefined;
      return dir === 'up' ? y1 < edges[0] : y1 > edges[1];
    },
    swipe: (dir, role) => { if (role?.startsWith('offer:') && dir.startsWith('down') && data.gestureChoices) { suggestGesture(true); return paint(); } // three other words
      if (role?.startsWith('offer:') && dir.startsWith('down')) { data.offers = data.offers.filter((o) => offerText(o) !== role.slice(6)); return paint(); } return act(dir, role); }, // ↓ on an offer: away
    pinch: (factor, role, how = {}) => { // continuous, view only: on the picture = camera zoom · on the point = time (line zoom, or the waits)
      if (role === 'live') return zoomBy(camera, factor);
      if (role === 'line-arc' || role?.startsWith('line:')) { data.lineZoom = Math.max(LINE_ZOOM[0], Math.min(LINE_ZOOM[1], (data.lineZoom ?? 1) * factor)); return paint(); } // the takes apart / together
      if (role !== 'point') return null; // elsewhere the pinch ends as a step (pinchEnd)
      const f = how.fx ?? factor;
      if (data.items?.length && ['line', 'record', 'stream'].includes(st.screen)) { data.timeZoom = Math.max(0.25, Math.min(8, (data.timeZoom ?? 1) * f)); return paint(); }
      return st.ready ? waitsBy(f) : null;
    },
    pinchEnd: (factor, role) => { // spread = nearer / more, squeeze = farther / less, where the first finger lay
      const g = pinchStep(factor);
      if (!g || role === 'live' || role === 'point') return null; // those zoomed continuously
      if (role === 'line-arc' || role?.startsWith('line:')) { // at the end of the zoom: straight → full, or back
        const z = data.lineZoom ?? 1;
        if (g === 'spread' ? z < LINE_ZOOM[1] : z > LINE_ZOOM[0] && !st.full && (data.bend ?? 1) > 0.5) return null;
        return act(g, 'line-arc');
      }
      return act(g, role ?? 'top-zone');
    },
    stretch: (heldRole, factor, how) => { // one finger holds the picture, the other pulls: the window's form changes
      if (heldRole !== 'live') return false;
      reshape(formBy(rawShape ?? data.shape, factor, how));
      return true;
    },
    stretchEnd: () => { rawShape = null; saveSettings(); },
    dragEnd: (el, moved, role) => {
      if (role === spentRole) { spentRole = null; return null; } // a property was held for the other finger, not carried
      const from = targetOf(role);
      const onto = el?.closest?.('[data-role]')?.dataset.role;
      if (from.target === 'strand' && onto?.startsWith('strand:')) return act('drag', role, { drag: `${role}>${onto}` });
      if (from.target === 'strand' && el?.closest?.('#similar')) return act('drag', role, { drag: from.kind === 'x' ? 'strand:x>similar' : 'strand>similar' });
      if (from.target === 'strand' && onto?.startsWith('sp:')) return act('drag', role, { drag: 'strand>sharing-point', n: Number(onto.split(':')[1]) });
      if (from.target === 'similar-item' && (onto === 'point' || onto === 'line-arc')) return act('drag', role, { drag: `similar-item>${onto}` });
      if (from.target === 'similar-band' && (onto === 'point' || onto === 'line-arc')) return act('drag', role, { drag: 'similar-band>point' });
      if (from.target === 'item' && (onto === 'point' || onto === 'line-arc')) return act('drag', role, { drag: `item>${onto}` });
      return null; // dropped anywhere else: nothing happens
    },
  };
  bind($('#screen'), handlers);
  suggestGesture(); // started again at a password gesture step: its words are there
  { // how this person starts (14.11.): as left (default) · records at once · the persons of this device to choose
    const P = globalThis.signPersons, me = P?.persons().find((x) => x.id === P.current());
    if (me?.start === 'choose' && P.persons().length > 1) menu.choose();
    else if (me?.start === 'record') setTimeout(() => { if (camera && !take.recorder) act('tap', 'point'); }, 900);
  }
  // Android "back" (14.11.): one step back, never out of the app by surprise: sharing menu → full screen → Similar → context field
  globalThis.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
    if (!$('#share').hidden) return menu.back() || menu.show(false); // an account → the accounts → closed
    if (st.full) return act('down', 'top-middle');
    if (data.double) { data.double = null; data.offers = []; $('#template').removeAttribute('src'); pairOff(); return paint(); } // Doppel → viele
    if (st.similar) return act('edge-out', 'upper-right');
    if ((data.open ?? 0) > 0) return openContext(false);
    return globalThis.Capacitor.Plugins.App.minimizeApp?.();
  });

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
