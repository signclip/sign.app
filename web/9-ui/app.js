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
//          on the line: the takes apart / together (zoom); past the widest the take opens as its timeline (16.11.); older lines: apart
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

import { accountTakes, pieceOf } from '../8-join/known.js'; // the search in within/ for one person (16.11.)
import { PASSWORD_PARTS } from '../8-join/flow.js'; // the pieces of a hello's password gestures
import './persons-boot.js'; // first: several persons on this device (persons.js)
import { translator } from '../0-i18n/t.js';
import { LocalStore, lasting } from '../2-storage/local.js';
import { buildIndex } from '../3-index/index.js';
import { saveTake } from '../4-save/save-take.js';
import { removeStrands } from '../4-save/remove.js';
import { saveSimilar } from '../4-save/save-similar.js';
import { addLine, MAX_ELEMENTS } from '../4-save/add-line.js';
import { askRemove } from '../8-join/remove-request.js';
import { deviceKeys, joins } from './device-keys.js';
const sealKey = async () => (await deviceKeys().catch(() => null))?.device ?? null; // every .sign this device writes gets its y_ (SCHEMA B2)
import { readName, flatWords } from '../1-model/filename.js';
import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { relay } from '../5-take/relay.js';
import { loadWhisper } from '../5-take/whisper-engine.js';
import { transcribe, contextOf as wordsRow } from '../5-take/whisper.js';
import { toMono, resample } from '../5-take/resample.js';
import { addEcho } from '../4-save/add-echo.js';
import { similar } from '../7-similar/filter.js';
import { newPerson, newSource, uOf, writeId } from '../1-model/ids.js';
import { readFile } from '../1-model/file.js';
import { withTakes, markTyping } from './view/chips.js';
import { withSticky, afterTake as stepSeries, nextOfSeries, readContext, contextTree, fromField, insertGesture } from '../1-model/context.js';
import { write as writeNotation, parse as parseNotation } from '../1-model/notation.js';
import { actionFor } from './gestures.js';
import { startState, next, toRecord, toKeep, toUse, look } from './state.js';
import { MANY, CLOUD, CLOUD_GONE, cloudHome } from './view/ring.js';
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
import { installDebug, note as debugNote } from './debug.js';
import { firstFrame, stillOf } from './frame.js';
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
  store.lasting = await lasting(); // false (Safari tab, not installed): this device is only a cache (local.js)

  // a video shows only once its first frame plays (no black box, no grey play button); then the shapes follow
  for (const v of document.querySelectorAll('#screen video')) {
    v.addEventListener('playing', () => v.classList.add('on'));
    v.addEventListener('emptied', () => { if (!v.dataset.picture) v.classList.remove('on'); }); // a picture (poster) shows at once
  }
  // start (15.11., user): first the background with the window centred, never a bare camera picture; the camera opens
  // after the first paint, so its picture fades in inside the window (freshCamera at the end of the start)
  let camera = null;

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
  let sources = [{ name: 'own', store, write: true }];
  const ownKeys = await deviceKeys().then((k) => ({ [device]: k.device.public }), () => ({})); // this device's z_: the index checks seals
  const reindex = () => buildIndex(sources, { keys: ownKeys, cache: store }); // parts of sharing points it only reads: index/<id>/ on the device
  let index = await reindex();
  /** The newest version of my newest take: what the chain gestures lay on after a restart. */
  const newestOwnChain = () => {
    const top = new Set([...index.tables.chains.values()].map((c) => c.below).filter(Boolean)); // chains with one on top are older versions
    const mine = [...index.tables.chains.values()].filter((c) => c.from?.store === 'own' && !top.has(c.key) && c.from.path.startsWith('chain/') && (!c.head['@'] || c.head['@'] === person.label)); // mine: several persons may share this device
    return mine.sort((a, b) => String(b.head["'t"] ?? '').localeCompare(String(a.head["'t"] ?? '')))[0]?.from.path ?? null; // newest by its time
  };
  take.lastChain = newestOwnChain(); // after a restart the chain gestures go on where they were

  const screen = mountScreen({ root: $('#screen'), live: $('#live'), replay: $('#replay'), template: $('#template'), pair: $('#pair'), overlay: $('#overlay') });
  const nameHint = () => (naming() ? { role: 'point', gesture: 'left' } : null); // 16.11.: ← on the point = this name, on to the name sign; the name chip below breathes: tap under it and write another
  const paint = () => screen.paint(st, { ...data, hint: nameHint() ?? hintOf(onboard.at, settings.onboarding) });
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
   * Password gestures (15.11.): two words drawn from the vocabulary (words.js) and one's own, recorded one after the
   * other like a series: the word of this take at the top of the window (now), the next ones below; the third is an
   * empty mint chip – tap it and write one's own word (or none). ↓ on a word = only that one is drawn anew.
   */
  function suggestGesture(swap = null) {
    const i = GESTURE_STEPS.indexOf(onboard.at);
    if (!settings.onboarding || i < 0) { if (data.gestureChoices) { data.gestureChoices = null; data.gestureWord = null; data.offers = (data.offers ?? []).filter((o) => o.origin !== 'password'); } return; }
    if (!data.gestureChoices) data.gestureChoices = drawWords(2);
    const k = swap == null ? -1 : data.gestureChoices.indexOf(swap);
    if (k >= 0) { let w; do { [w] = drawWords(1); } while (data.gestureChoices.includes(w)); data.gestureChoices[k] = w; }
    data.gestureWord = data.gestureChoices[i] ?? null; // the third: one's own (typed), not drawn
    data.offers = [...data.gestureChoices, ''].slice(i).map((text, j) => ({ text, offer: true, origin: 'password', take: ['now', 'next'][j] ?? 'later', wait: !text }));
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
    helloTakes: async ({ door = false } = {}) => { // the name sign (and at the door the password gestures) go with the hello as takes of their own (15.11.)
      let list = []; try { list = JSON.parse(localStorage.getItem('sign.passwords') || '[]'); } catch { /* none */ }
      let name = null; try { name = localStorage.getItem('sign.nameSign'); } catch { /* private mode */ }
      return [...(name ? [{ from: store, visual: name, part: 'name sign', words: ['hello'] }] : []),
        ...(door ? list.slice(0, 3).map((visual, i) => ({ from: store, visual, part: PASSWORD_PARTS[i], // in front: its word ((password Apfel) → (Apfel))
          words: (readName(visual.slice(visual.lastIndexOf('/') + 1))?.words ?? []).filter((w) => w !== 'password') })) : [])];
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
      askName();
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
    if (take.recorder || look(st, 'a') !== 'off') { // the sound level on the audio arc: during a take, and whenever audio is on (15.11.)
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
    commitTyped(); // typed but no Enter: the take takes it (15.11.)
    const first = parseNotation(series).find((n) => n.t !== 'sym'); // written context: the next gesture of the series
    take.context = action === 'take-with-context' ? contextOf(st.hold?.text) : first ? nextOfSeries(series) : ''; // a prefix series: prefix + its next element
    if (settings.onboarding && GESTURE_STEPS.includes(onboard.at)) { // a password gesture: the picked word (1, 2) or one's own typed word (3)
      const own = onboard.at === GESTURE_STEPS[2] && first ? writeNotation([first]).replace(/^\(|\)$/g, '') : '';
      take.context = `(password${data.gestureWord ? ` ${data.gestureWord}` : own ? ` ${own}` : ''})`;
      take.gesture = true;
    }
    take.fromSeries = action !== 'take-with-context' && Boolean(first);
    const fromResult = (data.offers ?? []).filter((o) => o.origin === 'similar').map(offerText); // the result's context comes along by itself (15.11.); ↓ on one = it stays out
    if (data.adopted?.length || fromResult.length) { take.context = [take.context, ...[...(data.adopted ?? []), ...fromResult].map((x) => `(${x})`)].filter(Boolean).join(' '); data.adopted = []; } // offers taken from the result above
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
    take.preview = null; setTimeout(() => stillOf($('#live')).then((b) => { take.preview = b; }, () => {}), 150); // its small picture, from the first moments (16.11.)
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
        device, person, store, cell: here.now(), now: Date.now(), lengthMs: recorded.lengthMs, context: (take.lastContext = withSticky(sticky.map((w) => `(${w})`).join(' '), take.context)),
        video: kinds.includes('v') ? recorded.video : null,
        picture: kinds.includes('v') ? recorded.picture ?? null : null,
        audio: kinds.includes('a') ? recorded.audio : null,
        onto, keep, deviceKey: await sealKey(),
        preview: kinds.includes('v') && recorded.video ? take.preview : null, // echo of the video (16.11.)
      });
      const v = saved.paths.find((p) => /\.v\.(mp4|webm)$/.test(p)), jpg = saved.paths.find((p) => p.endsWith('.v.jpg'));
      if (v && jpg && take.preview) pics.set(v, URL.createObjectURL(new Blob([take.preview], { type: 'image/jpeg' }))); // shown at once in the line
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
      if (onboard.at === GESTURE_STEPS[2]) { data.gestureWord = null; data.gestureChoices = null; } // the words stay for the next steps
      if (onboard.at === GESTURE_STEPS[2] && (data.open ?? 0) > 0) openContext(false); // 16.11.: the field goes; ↑ on the point breathes (share-last), in the menu the door's hello tile
    }
    learned(take.began);
    if (settings.flows.includes('a>x') && recorded.audio && kinds.includes('a')) flowAudio(saved.chain.path, recorded.audio).catch((err) => console.warn('whisper', err));
    await menu.afterTake(saved.paths); // (always) rules of the list
    index = await reindex();
  }

  // ---------- replay: the line of my takes, newest first ----------
  async function replay(by) {
    if (data.top) return data.top.goTo((data.line?.at ?? 0) + by); // an opened line on top: only its elements (16.11.)
    const videos = await takeVisuals(); // videos and pictures, newest first
    take.replayAt = Math.max(-1, Math.min(videos.length - 1, take.replayAt + by));
    $('#replay').hidden = take.replayAt < 0;
    if (take.replayAt < 0) { data.replayPaused = false; return step('live'); } // past the newest: live, a tap records (16.11.)
    data.line = { count: videos.length, at: take.replayAt };
    data.replayPaused = false; // newest first: the one playing sits at the top of the arc
    lineThumbs();
    await show(videos[take.replayAt]);
    step(st.mode === 'line' ? (by > 0 ? 'before' : 'next') : 'replay-back');
  }

  /** The camera's zoom (16.11.): the camera's own where it has one (Chrome asks for it with zoom: true), else larger in the window
   *  (1–4 ×, the picture only: what is recorded stays whole). In sign-debug.txt: which of the two, or why none. */
  let digital = 1;
  async function zoomCamera(factor) {
    if (!camera) return debugNote({ method: 'zoom', where: 'live', error: 'no camera open', ms: 0 });
    const done = await zoomBy(camera, factor).catch((e) => { debugNote({ method: 'zoom', where: 'camera', error: String(e?.message ?? e), ms: 0 }); return false; });
    if (done) return true;
    digital = Math.max(1, Math.min(4, digital * factor));
    const p = ((1 - 1 / digital) / 2) * 100; // the middle of the picture, larger; the window keeps its form (Chrome / Android WebView: object-view-box)
    $('#live').style.objectViewBox = `inset(${p.toFixed(2)}%)`;
    return false;
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

  /**
   * The start (15.11., user): at once clear whose state this is and how it starts — no account yet (onboarding), a hello
   * waits, join is there, a Sign account is there; and the start: waits for the button, starts by itself after the
   * waits shown (seconds), records at once, or the persons to choose. Name sign or password gestures as a login need
   * recognition (S5/S6) and come with the model.
   */
  async function showStart() {
    const P = globalThis.signPersons, me = P?.persons().find((x) => x.id === P.current());
    const onboarding = settings.onboarding && onboard.at < STEPS.length;
    const j = project?.label ? await joins.get(project.label).catch(() => null) : null;
    const account = onboarding ? 'onboarding' : !j ? 'none' : j.state === 'hello' ? 'hello' : j.state === 'within' || j.account ? 'sign' : 'join';
    const mode = me?.start === 'choose' && P.persons().length > 1 ? 'choose' : me?.start === 'record' ? 'record' : st.ready ? 'auto' : 'button';
    data.start = { account, mode, waits: { startMs: settings.waitStartMs, stopMs: settings.waitStopMs } };
    if (mode === 'auto') data.waits = data.start.waits; // the two rings, with their seconds
    setTimeout(() => { delete data.start; if (mode === 'auto') delete data.waits; paint(); }, 2500);
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
    const hits = [...index.tables.chains.values()].filter((c) => index.tables.takes.has(c.key) && [...c.defs.values()].some((d) => d.kind === 'v' && d.id && uOf(d.id) === u));
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
  /**
   * The line chosen, then ↑ / ↓ on the point (16.11.): the context just written (not yet taken) or else that of the last take
   * goes onto every take of the line – or out of all of them where it is. A new line on top, nothing copied:
   * (context)({:chain.2} {:chain.3} …) or -(context)(…). Felt and seen (a green ring out / a red one in), then unchosen.
   */
  async function lineContext(on) {
    const now = say.value.trim() ? fromField(say.value) : series.trim();
    const context = (now || take.lastContext || '').trim();
    data.lineSel = false;
    if (!context) { data.shake = 'line'; paint(); return null; }
    const all = (await takeVisuals()).slice(0, MAX_ELEMENTS);
    const elements = (await Promise.all(all.map(async (p) => chainBytes(await chainOfVisual(p))))).filter(Boolean);
    if (!elements.length) return paint();
    const wrapped = /^\(.*\)$/.test(context) ? context : `(${context})`;
    const r = await addLine({ own: store, chainPath: take.lastChain, elements, context: wrapped, without: !on, device, person, deviceKey: await sealKey() });
    take.lastChain = r.chain;
    index = await reindex();
    navigator.vibrate?.(on ? 20 : [10, 30, 10]);
    return feedback(on ? 'saved' : 'gone');
  }
  /**
   * ↓ on a chip of a saved take (16.11.): the take keeps its files; a new line on top says this context is out of it
   * (add-line.js without: -(context)). The take = the one on the button in the line, else the last one.
   */
  async function chipOutOfTake(text) {
    const key = st.screen === 'line' && take.replayAt >= 0 ? chainOfVisual((await takeVisuals())[take.replayAt]) : null;
    const el = key ? await chainBytes(key) : take.lastChain ? { bytes: await store.read(take.lastChain) } : null;
    if (!el || !take.lastChain) return null;
    const r = await addLine({ own: store, chainPath: take.lastChain, elements: [el], context: `(${text})`, without: true, device, person, deviceKey: await sealKey() });
    take.lastChain = r.chain;
    data.chips = data.chips.filter((c) => c.text !== text);
    index = await reindex();
    navigator.vibrate?.([10, 30, 10]);
    feedback('gone');
    return paint();
  }
  /** Split a take of the line (15.11.): at atMs (timeline), else at the fraction frac (between the fingers, 16.11.), else in its middle; a new line with its two parts ('( ) in ms), nothing copied. */
  async function splitTake(i, atMs = null, frac = 0.5) {
    const key = await keyOfItem(i), el = key && await chainBytes(key);
    if (!el) return null;
    const length = Number(/ 0_(\d+)/.exec(readFile(dec.decode(el.bytes)).head["'t"] ?? '')?.[1] ?? 0);
    if (!length) return null; // a picture has no time to cut
    const half = Math.round(atMs != null && atMs > 100 && atMs < length - 100 ? atMs : length * frac);
    const r = await addLine({ own: store, chainPath: take.lastChain, elements: [{ ...el, part: [0, half] }, { ...el, part: [half, length] }], device, person, deviceKey: await sealKey() });
    take.lastChain = r.chain;
    index = await reindex();
    navigator.vibrate?.([12, 40, 12]); // felt: two parts
    return arrive();
  }
  /** Two takes of the line pushed together (15.11.): one after the other in a new line, the older first. */
  async function joinTakes(a, b) {
    const keys = (await Promise.all([Math.max(a, b), Math.min(a, b)].map(keyOfItem))).filter(Boolean); // a larger i is further back in time: the older one first
    if (keys.length < 2) return null;
    data.merge = [a, b]; await animate('mergeT', 0, 1); // 16.11.: the two melt into one, then the new line comes
    delete data.merge; delete data.mergeT;
    await layOn(keys, false);
    navigator.vibrate?.(20);
    return arrive();
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
    const visual = refs.find((d) => d.kind === 'v' && !d.echo) ?? refs.filter((d) => d.kind === 'chain' && d.name !== 'chain.1').map((d) => index.chain(writeId(d.id))).flatMap((c) => (c ? [...c.defs.values()] : [])).find((d) => d.kind === 'v');
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
    if ((data.offers ?? []).some((o) => o.origin === 'error' && o.text === text)) { data.offers = data.offers.filter((o) => o.text !== text); return paint(); } // a message: tapped = gone
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
    data.tileWords = { ...(data.tileWords ?? {}), [key]: await wordsOf(key).catch(() => []) }; // the take's chips, small on its picture (16.11.)
    paint();
  }
  /** A tile's chips: a hello's name, or the first chips of the take's context (at most 3). */
  async function wordsOf(key) {
    if (key.startsWith('look:')) { const x = data.look?.[Number(key.slice(5))]; return x?.name ? [x.name] : []; }
    if (key.startsWith('cmp:')) { const c = data.compare?.[Number(key.slice(4))]; return c?.name ? [c.name] : []; }
    const chain = takeOf(key);
    return chain ? readContext(await contextTextOf(chain)).gestures.flatMap((g) => g.chips.map((c) => c.text)).slice(0, 3) : [];
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
    const png = at.path.endsWith('.png');
    const url = png ? URL.createObjectURL(new Blob([await at.store.read(at.path)], { type: 'image/png' })) : await previewOf(at);
    pics.set(at.path, url);
    return url;
  }
  /**
   * A video's small picture, fastest first (16.11.): the copy on this device (index/preview/<u_>.jpg) · its echo .v.jpg
   * beside it (echo/v/<month>/ or the same folder, e.g. hello/; same person, same time) · else drawn from the video
   * (frame.js). What came from elsewhere is kept on the device. Limits: one listing per folder and session.
   */
  async function previewOf(at) {
    const n = readName(at.path.slice(at.path.lastIndexOf('/') + 1));
    const cached = n?.u && `index/preview/${n.u}.jpg`;
    const asUrl = (b) => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' }));
    if (cached) { const b = await store.read(cached).catch(() => null); if (b) return asUrl(b); }
    const keep = (b) => { if (cached && at.store !== store) store.write(cached, b).catch(() => {}); return asUrl(b); }; // never overwritten (ExistsError = there already)
    if (n?.time) {
      for (const folder of new Set([at.path.slice(0, at.path.lastIndexOf('/') + 1), `echo/v/${n.time.slice(0, 7)}/`])) {
        const list = await listOnce(at.store, folder);
        const p = list.find((x) => x.endsWith('.v.jpg') && (({ echo, time, person } = readName(x.slice(x.lastIndexOf('/') + 1)) ?? {}) => echo === 'preview' && time === n.time && person === n.person)());
        if (p) { const b = await at.store.read(p).catch(() => null); if (b) return keep(b); }
      }
    }
    let bytes;
    try { bytes = await at.store.read(at.path); } catch (err) { debugNote({ method: 'frame', where: at.path, error: `read: ${err?.message ?? err}`, ms: 0 }); throw err; }
    const url = await firstFrame(new Blob([bytes], { type: 'video/mp4' }), { path: at.path });
    if (url && cached) fetch(url).then((r) => r.arrayBuffer()).then((b) => store.write(cached, new Uint8Array(b))).catch(() => {}); // next time at once
    return url;
  }
  const listings = new WeakMap();
  function listOnce(where, folder) {
    if (!listings.has(where)) listings.set(where, new Map());
    const m = listings.get(where);
    if (!m.has(folder)) m.set(folder, where.list(folder).then((fs) => fs.map((f) => f.path), () => []));
    return m.get(folder);
  }

  /** Files from elsewhere as the Similar tiles (admin: a hello's name sign and password gestures, 15.11.); closing Similar ends it. */
  async function lookAt(items) {
    for (const k of [...thumbs.keys()]) if (k.startsWith('look:')) thumbs.delete(k);
    const groups = new Map(); // 16.11. (user): a pile is a search in its folder, put together by name – one tile per person, her line = all her pieces (name sign, password gestures; several hellos one after another)
    const keyOf = (x) => (x.name ? `@${x.name}` : x.group ?? x.path);
    for (const x of items) groups.set(keyOf(x), [...(groups.get(keyOf(x)) ?? []), x]);
    items = [...groups.values()].map((pieces) => ({ ...pieces[0], pieces }));
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
    v.poster = posterOf(path); v.src = URL.createObjectURL(new Blob([await from.read(path)], { type: 'video/mp4' }));
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
  /**
   * Admin, ↑ on a hello (16.11., user): the Doppel decides. The account above still shown = same person, the hello joins
   * it; the Doppel squeezed away (or none) = a new account. Other piles: nothing to choose (undefined).
   */
  function intoOf(at) {
    if (at.pile !== 'hello' || !at.candidates?.length) return undefined;
    const shown = data.double?.startsWith('cmp:') ? data.compare?.[Number(data.double.slice(4))] : null;
    return { into: shown?.folder ?? null };
  }
  /** The menu opens while a person is looked at (16.11.): she is held there, a tap on the next pile moves her (share-mount hold). */
  function holdLooked() {
    const tile = data.look?.[data.lookAt ?? data.doubleAt ?? (data.look?.length === 1 ? 0 : -1)];
    const at = tile?.pieces?.[data.pieceAt ?? 0] ?? tile;
    if (!at?.up && !at?.down) return;
    const into = intoOf(at); // the Doppel as it is now: the menu may close Similar
    menu.hold({ pile: at.pile, up: at.up && (() => at.up(into)), down: at.down && (() => at.down({})) });
  }
  async function decide(how) {
    const tile = data.look?.[data.lookAt ?? data.doubleAt ?? (data.look?.length === 1 ? 0 : -1)]; // one person only: no tap needed first
    const at = tile?.pieces?.[data.pieceAt ?? 0] ?? tile; // the hello of the piece on the button (a name may have several)
    if (!at?.[how]) return null;
    if (at.pile === 'within' && how === 'down') { // 16.11. (user): ↓ in within = the sharing menu opens, quiet breathes, a tap on it = quiet (account off)
      navigator.vibrate?.(12);
      await closeSimilar();
      return menu.carry('quiet', () => at.down());
    }
    navigator.vibrate?.(how === 'up' ? 20 : [12, 50, 12]); // felt at once: on = one pulse, back = two
    let r;
    try { r = await at[how](how === 'down' ? data.deleteChoices ?? {} : intoOf(at)); } catch (err) { // it stays, three pulses, and why as a chip (16.11.)
      navigator.vibrate?.([40, 40, 40]);
      const why = String(err?.message ?? err).slice(0, 60);
      debugNote({ method: 'door', where: `${at.pile ?? ''} ${how}`, error: why, ms: 0 });
      data.offers = [...(data.offers ?? []).filter((o) => o.origin !== 'error'), { text: why, offer: true, origin: 'error' }];
      return paint();
    }
    if (r === 'wait') { // asks first (15.11.): Backup · Modell as chips (tap = yes), the same gesture again within 15 s = delete for good
      navigator.vibrate?.(250);
      data.deleteChoices = { backup: false, model: false };
      data.offers = [{ text: 'Backup', offer: true, origin: 'delete' }, { text: 'Modell', offer: true, origin: 'delete' }];
      return paint();
    }
    data.deleteChoices = null; if (data.offers?.some((o) => o.origin === 'delete')) data.offers = [];
    feedback('saved'); // moved: the green ring goes out from the point (16.11.)
    const left = (x) => { const pieces = (x.pieces ?? [x]).filter((p) => p.group !== at.group); return pieces.length ? { ...pieces[0], pieces } : null; }; // that hello leaves; the rest of her name stays
    const rest = data.look.map(left).filter(Boolean);
    data.compare = null;
    if (!rest.length) { pairOff(); return closeSimilar(); }
    const next = Math.min(data.look.slice(0, data.lookAt ?? data.doubleAt).map(left).filter(Boolean).length, rest.length - 1);
    for (const k of [...thumbs.keys()]) if (k.startsWith('look:')) thumbs.delete(k);
    data.look = rest;
    showSimilar(true);
    return reference(next);
  }
  /** A tile key → { store, path } of its picture or video: an index key, or look:i. */
  const atOf = (key) => {
    if (key?.startsWith('piece:')) return data.top?.items[Number(key.slice(6))] ?? null; // an element of the line on top
    if (key?.startsWith('cmp:')) { const c = data.compare?.[Number(key.slice(4))]; return c ? { store: c.from, path: c.path } : null; } // a result of the search in within/
    if (!key?.startsWith('look:')) return takeOf(key) && visualOf(takeOf(key));
    const x = data.look?.[Number(key.slice(5))];
    return x ? { store: x.from, path: x.path } : null;
  };
  /** Similar · viele (16.11.): the cloud flies in from the upper right to where it last was (≈ 0.3 s); the take stays. */
  async function openMany() {
    data.reveal = 0; data.cloud = null; // it opens full every time (16.11.)
    step('similar-in');
    showSimilar(true);
    await animate('reveal', 0, 1);
  }
  /** Similar closes (squeezed small, or Back): the cloud flies out to the upper right; Doppel ends with it. */
  async function closeSimilar() {
    if ((data.cloudFull ?? 0) > 0) await fullSimilar(false); // from the whole screen: first the cloud again
    if (st.similar && !data.double && (data.reveal ?? 1) > 0) await animate('reveal', data.reveal ?? 1, 0);
    if (!data.look) await keepSimilar();
    step('similar-out');
    data.wordsOff = [];
    data.double = null; // Doppel ends with Similar
    if (data.ownLine) { if (data.ownLine.mine) ({ line: data.line, lineThumbs: data.lineThumbs } = data.ownLine); data.versions = data.ownLine.versions; delete data.ownLine; } // my line back on top
    delete data.top; if (take.replayAt < 0 && st.screen === 'line') step('live');
    if (data.look) { delete data.look; data.lookAt = null; data.compare = null; $('#template').removeAttribute('src'); pairOff(); const r = $('#replay'); r.onended = null; r.pause(); r.hidden = take.replayAt < 0; } // a hello looked at: done, the take window live again
    delete data.reveal;
    $('#template').removeAttribute('src');
    return showSimilar(false);
  }
  /** Similar over the whole screen (16.11.): the cloud spreads into a grid, the arcs wander to the screen's edges, the take
   *  glides small into the middle of their U and hides (its button stays) – tap the visual arc and it shows. Back: the reverse. */
  async function fullSimilar(on) {
    if (on) data.fullTakeT = 0;
    await animate('cloudFull', on ? 0 : 1, on ? 1 : 0);
    if (!on) { delete data.cloudFull; delete data.fullTakeT; }
    return paint();
  }
  /** Where the cloud is and how big (16.11.): kept on this device; a pinch on it moves and sizes it. */
  data.cloud = JSON.parse(kept('sign.cloud', () => 'null'));
  const keepCloud = () => { try { localStorage.setItem('sign.cloud', JSON.stringify(data.cloud)); } catch { /* private mode */ } };

  /** Similar · Doppel: result i of the tiles plays above in the same window as the live picture (loop, muted). */
  async function reference(i) {
    if (data.similar[i]?.startsWith('piece:')) return data.top?.goTo(Number(data.similar[i].slice(6))); // an element of this line: the button goes there
    if (data.compare && data.similar[i]?.startsWith('cmp:')) { // a result of the search in within/ tapped: it plays in the Doppel
      const c = data.compare[Number(data.similar[i].slice(4))], t = $('#template');
      t.poster = posterOf(c.path); t.src = URL.createObjectURL(new Blob([await c.from.read(c.path)], { type: 'video/mp4' })); t.loop = true; t.muted = true; t.play().catch(() => {});
      data.double = data.similar[i];
      return paint();
    }
    const looked = data.look?.[Number(data.similar[i]?.slice(5))];
    if (looked?.pieces) return lookLine(i, looked); // a hello: its line in the take window (16.11.)
    const key = data.similar[i];
    const at = key && atOf(key);
    if (!at) return null;
    const v = $('#template');
    const blob = new Blob([await at.store.read(at.path)], { type: at.path.endsWith('.png') ? 'image/png' : 'video/mp4' });
    if (at.path.endsWith('.png')) { v.dataset.picture = '1'; v.removeAttribute('src'); v.poster = URL.createObjectURL(blob); v.load(); v.classList.add('on'); }
    else { delete v.dataset.picture; v.poster = posterOf(at.path); v.src = URL.createObjectURL(blob); v.loop = true; v.muted = true; v.play().catch(() => {}); }
    data.double = key;
    data.doubleAt = i;
    if (!data.look) lineOnTop([at], () => data.double === key); // the opened take: a new line on top of mine
    v.onended = null;
    if (!data.look) await offerContext(takeOf(key));
    await pairOn(data.look?.[Number(key.slice(5))]?.pair, data.look?.[Number(key.slice(5))]?.from);
    return paint();
  }
  /**
   * A hello tapped (16.11.): her line plays in the take window — name sign → password gesture 1 → 2 → own, again from the
   * start. A known person (a new device): the original piece from within/ plays in the Similar area as Doppel (phone: above,
   * tablet landscape: beside), piece by piece with the new one. ↑ on the point = on (hello → join → within), ↓ = back.
   */
  async function lookLine(i, x) {
    data.lookAt = i; data.doubleAt = i;
    const known = Boolean(x.known);
    const v = $('#replay'), t = $('#template');
    // 16.11.: comparing = a second search, only in the sharing point within/, for this person (her ID, else her name):
    // its results are the Similar tiles now; the one of the same piece plays in the Doppel. Squeezed back = the hellos again.
    const accounts = known ? (x.candidates?.length ? x.candidates : [x.known]) : []; // 16.11.: every account of her ID or name, ← → goes through them
    data.compare = known ? (await Promise.all(accounts.map(async (folder) => (await accountTakes(x.from, folder).catch(() => [])).map((path) => ({ path, from: x.from, folder, piece: pieceOf(path) }))))).flat() : null;
    for (const k of [...thumbs.keys()]) if (k.startsWith('cmp:')) thumbs.delete(k);
    data.double = known && data.compare.length ? 'cmp:0' : null; // without an original Similar stays as the hellos
    const items = x.pieces.map((p) => ({ store: p.from, path: p.path }));
    lineOnTop(items, () => data.look?.[i] === x); // her pieces: a new line on top of mine (chain)
    let j = 0;
    data.top = { items, goTo: (n) => { j = Math.max(0, Math.min(items.length - 1, n)); v.onended = next; return go(); } }; // ← → and the tiles move in this line only (16.11.)
    if (st.screen !== 'line') step('replay-back'); // the button on its first element, with its picture
    showSimilar(true); // Similar now searches only in the elements of this line
    const go = async () => {
      if (data.lookAt !== i || data.look?.[i] !== x) { v.onended = null; return; } // another tile, or Similar closed
      const p = x.pieces[j % x.pieces.length];
      await show(p.path, p.from); v.loop = false; v.muted = false;
      const shown = data.double?.startsWith('cmp:') ? data.compare?.[Number(data.double.slice(4))]?.folder : null; // the account above stays as chosen (← →)
      const piece = pieceOf(p.path), at = shown ? data.compare.findIndex((c) => c.folder === shown && c.piece === piece) : -1; // its take of the same piece
      if (known && at >= 0) {
        const pair = data.compare[at].path;
        t.src = URL.createObjectURL(new Blob([await p.from.read(pair)], { type: 'video/mp4' })); t.loop = true; t.muted = true; delete t.dataset.picture; t.poster = posterOf(pair); t.play().catch(() => {});
        data.double = `cmp:${at}`;
      }
      data.pieceAt = j % x.pieces.length; data.line = { ...data.line, at: data.pieceAt };
      paint();
    };
    const next = () => { j = j < x.pieces.length - 1 ? j + 1 : 0; go(); }; // through her line, then from the front again
    v.onended = next;
    return go();
  }
  /** What a <video> shows while loading (16.11.): the take's small picture if there is one, else nothing (transparent) –
   *  an empty poster makes Android's WebView draw its own grey video sign. */
  const NO_POSTER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const posterOf = (path) => (path && pics.get(path)) || NO_POSTER;
  /**
   * Something opened from Similar (16.11., the chain idea): it comes as a new line on top; my line slides down and stays
   * as a faint arc beneath it, towards the take window (arc.js levels). Similar closed = my line on top again.
   * items: [{ store, path }] of the visual strands · still(): false once something else is open.
   */
  function lineOnTop(items, still = () => true) {
    if (!data.ownLine) { data.ownLine = { line: data.line, lineThumbs: data.lineThumbs, versions: data.versions ?? 1, mine: true }; data.versions = Math.min(4, data.ownLine.versions + 1); arrive(); }
    data.line = { count: items.length, at: 0 }; data.lineThumbs = {};
    items.forEach((at, n) => picOf(at).then((url) => { if (still()) { data.lineThumbs = { ...data.lineThumbs, [n]: url }; paint(); } }, () => {}));
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
    video.poster = posterOf(path); // while it loads: its picture, never the system's grey video sign (16.11.)
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
    if (data.look && data.top && !data.compare) { data.similar = data.top.items.map((_, n) => `piece:${n}`); data.similar.forEach(thumbOf); return panel('#similar', on, [], () => {}); } // searched only in this line's elements (16.11.)
    if (data.look && data.compare) { data.similar = data.compare.map((_, i) => `cmp:${i}`); data.similar.forEach(thumbOf); return panel('#similar', on, [], () => {}); } // the search in within/ (16.11.)
    if (data.look) { data.similar = data.look.map((_, i) => `look:${i}`); data.similar.forEach(thumbOf); return panel('#similar', on, [], () => {}); }
    const hits = similar(index, { words: searchWords(), filters: filtersOf(index, filter) });
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
  /** The series as it shows: what is being typed is in it already, live, at its spot (15.11.); a space = and, as in the notation. */
  /** What Similar searches (16.11., user): what is written in the take – its context with what is being typed – minus the words tapped off. */
  function searchWords() {
    const text = [sticky.map((w) => `(${w})`).join(' '), data.contextNow ?? series].filter(Boolean).join(' ');
    let words = []; try { words = flatWords(text); } catch { words = text.split(/[\s()]+/).filter(Boolean); }
    return [...new Set(words)].filter((w) => !(data.wordsOff ?? []).includes(w));
  }
  function showSeries() {
    const typing = say.value.trim() ? insertGesture(series, data.insertAt?.at ?? null, data.insertAt?.how ?? null, fromField(say.value)) : null;
    data.contextNow = typing?.text ?? series;
    if (st.similar && !data.look) { clearTimeout(showSeries.soon); showSeries.soon = setTimeout(() => showSimilar(true), 250); } // Similar follows what is typed
    setChips(withTakes(markTyping(contextTree(typing?.text ?? series), typing?.at))); // bubbles in bubbles; one take per element: now, next, some time later; ↑ = flies
    paint();
  }
  /** What is typed goes in for good: Enter, or the take starts (15.11.). → true if something was there. */
  function commitTyped() {
    const raw = say.value;
    if (!raw.trim()) return false;
    say.value = '';
    if (naming()) { nameIs(raw.replace(/[()[\]{}]/g, '').replace(/\s+/g, ' ').trim()); return true; } // my name (a space stays: Anna Maria)
    const put = insertGesture(series, data.insertAt?.at ?? null, data.insertAt?.how ?? null, fromField(raw)); // at the tapped spot, or at the end
    series = put.text;
    if (data.insertAt) data.insertAt = { at: put.at, how: 'after' }; // the next one goes behind it
    showSeries();
    return true;
  }
  /** Open or close the context field: the bottom arc straightens into the field (or bends back), ~300 ms. */
  const openContext = (on, ms = 300) => {
    const field = $('#context');
    if (!on) { field.hidden = true; field.classList.remove('shown'); say.blur(); data.insertAt = null; data.chipScroll = 0; }
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
  /** Onboarding (15.11.): the name. A preset in a pale chip like a template – not mine until tapped; typing writes my own. */
  function naming() { return settings.onboarding && STEPS[onboard.at]?.[0] === 'name'; }
  function askName() {
    $('#context').classList.add('breathe');
    say.value = '';
    data.offers = [{ text: person.label, offer: true, origin: 'name' }];
    openContext(true);
  }
  /** This is my name, and the context of my name sign (the next take). */
  function nameIs(name) {
    if (!name) return;
    person.label = name;
    try { localStorage.setItem('sign.name', name); } catch { /* private mode */ }
    globalThis.signPersons?.named(name); // the persons on this device show it
    $('#context').classList.remove('breathe');
    data.offers = (data.offers ?? []).filter((o) => o.origin !== 'name');
    series = `${series} ${fromField(name)}`.trim();
    learned('name');
    showSeries();
    openContext(false); // the keyboard goes: the name lies on the window, the point is next (name sign)
  }
  say.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !say.value && series) { // empty field: Backspace takes the last written gesture away (initial K6)
      const items = parseNotation(series);
      items.splice(items.findLastIndex((n) => n.t !== 'sym'), 1);
      series = writeNotation(items);
      return showSeries();
    }
    if (e.key !== 'Enter') return;
    if (!commitTyped()) return naming() ? nameIs(person.label) : openContext(false); // nothing typed: the name's preset, else the field closes
  });
  say.addEventListener('input', () => showSeries()); // live: every letter shows in its chip at once

  takeVisuals().then((all) => { data.line = { count: all.length, at: 0 }; return lineThumbs(); }).catch(() => {}); // the line is there from the start
  setTimeout(() => askAgain().catch(() => {}), 5000); // remove requests that could not go out before (the sharing points open first)

  let kbTop = null; // Android's keyboard edge (VirtualKeyboard API), if the WebView reports it
  const keyboard = () => { // what stays visible above the keyboard, from the screen's top (16.11.): both sources, the smaller wins – a WebView that ignores overlaysContent still resizes visualViewport
    const top = $('#screen').getBoundingClientRect().top, vv = globalThis.visualViewport;
    const seen = [vv ? vv.height + vv.offsetTop - top : null, kbTop != null ? kbTop - top : null].filter((x) => x != null && x > 0);
    data.viewH = seen.length ? Math.min(...seen) : null; paint();
  };
  globalThis.visualViewport?.addEventListener('resize', keyboard);
  if (navigator.virtualKeyboard) {
    navigator.virtualKeyboard.overlaysContent = true;
    navigator.virtualKeyboard.addEventListener('geometrychange', (e) => { const r = e.target.boundingRect; kbTop = r.height > 0 ? r.y : null; keyboard(); });
  }
  let wideAs = 0; // the screen's height without keyboard, per orientation
  const measure = () => { const { w, h } = screen.size(); if (w !== wideAs) { wideAs = w; data.fullH = h; } else if (!document.activeElement?.matches?.('input, textarea, [contenteditable]')) data.fullH = h; }; // typing anywhere: the height without keyboard stays
  measure();
  addEventListener('resize', () => { measure(); paint(); });

  if (naming()) askName(); // onboarding starts with the name: write it right away

  /** Fly one Similar tile into the line, then the new line slides in on the chain. */
  async function intoLine(tileRole, ms = 420) {
    await flyToPoint(tileRole, ms);
    data.line = { count: (data.line?.count ?? 0) + 1, at: 0 };
  }
  /** A picture on the screen (a Similar tile, a take of the line) glides into the point (≈ 0.3–0.4 s). */
  async function flyToPoint(role, ms) {
    const from = screen.last?.shapes.find((x) => x.role === role && x.type === 'thumb');
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
  }

  // ---------- one gesture → one action ----------
  async function act(gesture, role, extra = {}) {
    let hit = { ...targetOf(role), ...extra };
    if (hit.queue && gesture === 'tap' && !st.hold) hit = { ...hit, target: 'queue' }; // the row below: a tap writes there (15.11.)
    if ((data.cloudFull ?? 0) > 0.5 && hit.target === 'strand' && hit.kind === 'v' && gesture === 'tap') { const on = (data.fullTakeT ?? 0) < 0.5; return animate('fullTakeT', on ? 0 : 1, on ? 1 : 0); } // full Similar: the visual arc shows / hides the take (16.11.)
    if (hit.target === 'delete') return gesture === 'tap' ? removeLast(hit.what) : null;
    if (data.lineSel && hit.target === 'point' && ['up', 'up-out', 'down', 'down-out'].includes(gesture)) return lineContext(gesture.startsWith('up')); // 16.11.: the line chosen: ↑ = this context onto all of it, ↓ = out of all of it
    if (data.look && data.lookAt != null && data.top && ['point', 'line-arc', 'item'].includes(hit.target)) { // anywhere on her line (16.11.) // 16.11.: a hello in the window: ↑ on the point = on (hello → join → within), ↓ = back
      if (gesture === 'up' || gesture === 'up-out') return decide('up');
      if (gesture === 'down' || gesture === 'down-out') return decide('down');
    }
    const mode = st.mode === 'line' ? 'line' : st.similar ? 'similar' : 'take';
    const held = st.hold?.target ?? null; // what the other finger holds (parallel gesture)
    const row = actionFor({ gesture, target: hit.drag ?? hit.target, mode, held });
    const kind = hit.kind ?? st.hold?.kind;
    if (row && !['take', 'take-while-held', 'strand-while-held', 'add-strand', 'take-with-context'].includes(row.action)) learned(row.action); // takes count when saved
    switch (row?.action) {
      case 'take': // 16.11.: start · during a take pause / go on (← → ↑ on the point save it) · in the line: play / pause that take
        if (st.screen === 'line') { const v = $('#replay'); if (v.paused) v.play?.().catch(() => {}); else v.pause(); data.replayPaused = v.paused; return paint(); }
        if (take.recorder?.pause && !take.starting) { if (take.recorder.paused) take.recorder.resume(); else take.recorder.pause(); data.paused = take.recorder.paused; navigator.vibrate?.(10); return paint(); }
        return take.recorder || take.starting ? end() : begin('take');
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
      case 'sticky': { // on: the word goes in front (the next level); off: it leaves the front
        const word = hit.text;
        if (!word) return null; // the sticky bubble itself: its chips are tapped one by one
        sticky = sticky.includes(word) ? sticky.filter((w) => w !== word) : [...sticky, word];
        try { localStorage.setItem('sign.sticky', JSON.stringify(sticky)); } catch { /* private mode */ }
        setChips();
        return paint();
      }
      case 'chip-on-off': // 16.11.: every word of the take searches in Similar; a tap takes one out (again = in)
        data.wordsOff = (data.wordsOff ?? []).includes(hit.text) ? data.wordsOff.filter((w) => w !== hit.text) : [...(data.wordsOff ?? []), hit.text];
        return st.similar ? showSimilar(true) : paint();
      case 'take-while-held': if (st.screen === 'line' && take.replayAt >= 0) await replay(-(take.replayAt + 1)); return begin('take-while-held'); // in the line: live at once, then it records
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
      case 'replay-back': case 'before': if (take.recorder || take.starting) return end(); return replay(+1); // during a take: ← → ↑ save it (16.11.)
      case 'replay-on': case 'next': if (take.recorder || take.starting) return end(); return replay(-1);
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
          if (writeNotation(keep) === series) return chipOutOfTake(text); // a chip of a saved take: a new line on top without it (16.11.)
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
      case 'split': case 'join': return null; // a take held, the other finger pulls or pushes: handlers.stretch shows the mark, stretchEnd does it
      case 'switch-camera':
        if (take.recorder && !take.relay) return null; // without the canvas the recorder would end
        settings = choose(settings, 'facing', settings.facing === 'user' ? 'environment' : 'user');
        saveSettings();
        unwatch();
        camera = take.recorder ? await flipPicture(camera, settings.facing) : await flip(camera, settings.facing); // in a take the sound goes on
        $('#live').srcObject = camera;
        unwatch = watch(camera, onActivity, { video: $('#live') });
        return null;
      case 'similar-in': return openMany(); // the cloud flies in
      case 'similar-out': return closeSimilar();
      case 'share-last': if (data.look) holdLooked(); if (take.recorder || take.starting) await end(); take.shareOnce = null; take.shareChain = null; step('share-last'); return menu.show(true); // ↑ on the point: the sharing points as circles
      case 'always-there': return menu.dropKind(hit.n, hit.kind);
      // 16.11.: no full screen by ↑ / ↓ any more
      // ---------- the line in its arc, the chain under it ----------
      case 'straighten': // 16.11.: spread on the line past its widest = this take opens as its timeline (no full screen);
        if (take.replayAt < 0) await replay(+1); //    spread on further there = cut at the point (pinchEnd)
        data.timeZoom = 1;
        return step('spread');
      case 'bend': // squeeze on the line past its closest = the two takes under the fingers become one (pinchEnd)
        return null;
      case 'levels-open': data.levelsOpen = true; return paint();
      case 'levels-close': data.levelsOpen = false; return paint();
      case 'level-open': // choose an earlier line of the chain (tap again = back to the current one)
        if (data.ownLine && hit.index === 1) { // 16.11.: an opened line on top – the line beneath comes up, the opened one goes under (tap again = back)
          const under = data.ownLine;
          data.ownLine = { line: data.line, lineThumbs: data.lineThumbs, versions: under.versions, mine: !under.mine, top: data.top };
          ({ line: data.line, lineThumbs: data.lineThumbs } = under); data.top = under.top ?? null;
          navigator.vibrate?.(10);
          if (data.top) return data.top.goTo(data.line?.at ?? 0);
          const r = $('#replay'); r.onended = null; r.pause();
          if (take.replayAt >= 0) { const videos = await takeVisuals(); await show(videos[take.replayAt]); } else r.hidden = true;
          return paint();
        }
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
      case 'similar-nearer': return st.similar ? null : openMany(); // spread above the take: the cloud comes; on it the pinch already sized it
      case 'similar-farther': if (st.similar && data.look && data.top && (data.cloud?.s ?? 1) < CLOUD_GONE) { delete data.top; data.lookAt = null; data.cloud = null; showSimilar(true); return paint(); } // her line: squeezed = all hellos again (the line stays)
        return st.similar && !data.double && (data.cloud?.s ?? 1) < CLOUD_GONE ? closeSimilar() : null; // squeezed small enough: away
      case 'share-in': if (data.look) holdLooked(); take.shareOnce = null; take.shareChain = null; return menu.show(true); // pulled in from the middle right
      case 'share-out': return menu.show(false);
      case 'context-open': data.insertAt = null; paint(); return (data.open ?? 0) > 0.5 ? null : openContext(true); // under the take: open, write at the end
      case 'write-here': data.insertAt = hit.queue; paint(); return (data.open ?? 0) > 0.5 ? say.focus() : openContext(true); // a spot in the row: write there (the keyboard stays)
      case 'chips-later': case 'chips-earlier': data.chipScroll = (data.chipScroll ?? 0) + (row.action === 'chips-later' ? -1 : 1) * 160; return paint(); // a long row scrolls sideways
      case 'context-close': return openContext(false);
      case 'line-choose': data.lineSel = !data.lineSel; navigator.vibrate?.(8); return paint(); // chosen: outlined
      case 'line-go': { // a take of the line tapped (16.11.): it slides into the point and plays
        await flyToPoint(`line:${hit.index}`, 300);
        await replay(hit.index);
        const r = $('#replay'); data.replayPaused = false; r.play?.().catch(() => {});
        return paint();
      }
      case 'line-zoom': return null; // continuous: handlers.pinch
      // ---------- in the table, not wired yet: each says where it docks ----------
      case 'take-over': return reference(hit.index); // Similar · Doppel: the result above, the live picture below
      case 'look-up': return decide('up'); // admin: ↑ = on to the next pile (15.11.)
      case 'reference-out': // squeeze on the result: farther, back to Similar · viele
        if (data.compare) { data.compare = null; data.lookAt = null; const r = $('#replay'); r.onended = null; r.pause(); showSimilar(true); } // the search in within/ ends: the hellos again
        data.double = null; data.offers = []; $('#template').removeAttribute('src'); pairOff(); return paint(); // back to viele
      case 'look-down': return decide('down'); // admin: ↓ = back a pile (join → hello anew, within → quiet)
      case 'reference-next': case 'reference-before': { // ← next · → before, in the order of the tiles
        const n = data.similar.length;
        const from = data.compare && data.double?.startsWith('cmp:') ? data.similar.indexOf(data.double) : data.doubleAt; // in the Doppel: from the account shown above (16.11.; doubleAt stays the hello)
        return n ? reference((from + (row.action === 'reference-next' ? 1 : -1) + n) % n) : null;
      }
      // 16.11.: no full screen of a Similar tile any more (one could not get out of it with gestures)
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
  let cloudAt = null; // the cloud being pinched: where the fingers were last
  let pendingHold = null, usedHold = null, cutting = null; // a take of the line held: split or join by a second finger (15.11.)
  const SPLIT_AT = 1.6, JOIN_AT = 0.6; // the marks: pulled to 1.6 × the start distance = split · pushed to 0.6 × = join
  /** The window's edges on the screen: [top, bottom] in client px, or null. */
  /** Where across a take of the line the cut lies (16.11.): between the two fingers, left edge 0 … right edge 1, held to 0.1–0.9; beside the take = its middle. */
  const cutSpot = (role, where) => {
    const s = screen.last?.shapes?.find((x) => x.role === role && x.s), r = $('#screen').getBoundingClientRect();
    if (!s || !where) return 0.5;
    const mx = (where.held.x + where.at.x) / 2 - r.left, f = (mx - s.x) / s.s;
    return f < -0.25 || f > 1.25 ? 0.5 : Math.min(0.9, Math.max(0.1, f));
  };
  const windowEdges = () => {
    const win = screen.last?.window;
    if (!win) return null;
    const r = $('#screen').getBoundingClientRect(), [, ey] = extentOf(win);
    return [r.top + win.cy - ey, r.top + win.cy + ey];
  };
  const handlers = {
    down: (e) => {
      const role = screen.roleAt(e);
      const doubles = role === 'point' || role?.startsWith('chip:') || role?.startsWith('queue:') || role === 'sticky'; // these wait for a second tap
      handlers.doubleTap = doubles ? () => act('double-tap', role) : undefined;
      return role;
    },
    tap: (x, y, role) => {
      if (!$('#share').hidden && role !== 'point') return menu.show(false); // a tap beside the circles closes them
      if (role?.startsWith('offer:') && data.deleteChoices) { const k = role.slice(6) === 'Backup' ? 'backup' : 'model'; data.deleteChoices[k] = !data.deleteChoices[k]; data.offers = data.offers.map((o) => (o.text === role.slice(6) ? { ...o, picked: data.deleteChoices[k] } : o)); navigator.vibrate?.(10); return paint(); } // before deleting: keep a copy?
      if (role === 'offer:' && data.gestureChoices) { data.insertAt = null; return openContext(true); } // the empty mint chip: write one's own password word
      if (role?.startsWith('offer:') && data.gestureChoices) return null; // the drawn words come in their order, one take each
      if (role?.startsWith('offer:') && naming()) return nameIs(role.slice(6)); // the preset name: tapped = mine
      if (role?.startsWith('offer:')) return adopt(role.slice(6)); // a greyed context of the result above: now mine
      return act('tap', role, { x, y });
    },
    hold: (role) => { if (targetOf(role).target === 'item') { pendingHold = role; return null; } return act('hold', role); }, // a take of the line: its hold acts on lifting, so it can still be split or joined (15.11.)
    parallel: async (heldRole, role, where) => { // a second finger came while one is held: the held thing is (or becomes) the property
      paired = true;
      if (targetOf(heldRole).target === 'item') { cutting = { held: heldRole, other: role, total: 1, at: cutSpot(heldRole, where) }; return; } // split or join: decided by the pull; the cut lies between the two fingers (16.11.)
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
    swipe: (dir, role) => { if (naming() && role === 'point' && dir.startsWith('left')) return nameIs(person.label); // the name as it is: on (16.11.)
      if (role?.startsWith('offer:') && role !== 'offer:' && dir.startsWith('down') && data.gestureChoices) { suggestGesture(role.slice(6)); return paint(); } // only this word, drawn anew
      if (role?.startsWith('offer:') && dir.startsWith('down')) { data.offers = data.offers.filter((o) => offerText(o) !== role.slice(6)); return paint(); } return act(dir, role); }, // ↓ on an offer: away
    slide: (role, dx) => { // the wide button (16.11.): one finger along it = the moment in the take, the middle stays "now"
      if (role !== 'point-wide') return null;
      const px = screen.last?.wide?.px ?? 0.3, r = $('#replay');
      const ms = Math.max(0, Math.min((r.duration || 0) * 1000 || Infinity, (data.timeMs ?? 0) - dx / px));
      data.timeMs = ms;
      if (Number.isFinite(r.duration)) { r.pause(); r.currentTime = ms / 1000; data.replayPaused = true; }
      return paint();
    },
    slideEnd: () => null,
    pinch: (factor, role, how = {}) => { // continuous, view only: on the picture = camera zoom · on the point = time (line zoom, or the waits)
      if (role === 'live') return zoomCamera(factor); // two fingers on the picture: the camera's zoom (16.11.: also without a zoom in the camera)
      if (st.similar && !data.double && role === 'similar-band') { // the cloud (16.11.): bigger / smaller, and along with the fingers (on a tile: into it, at the end)
        if ((data.cloudFull ?? 0) > 0.5) return null; // full screen: the pinch decides at its end (smaller = the cloud again)
        const c = data.cloud ?? cloudHome(screen.size()), at = how.at ?? how.mid ?? { x: c.x, y: c.y }, last = cloudAt ?? at;
        if (c.s >= 0.99 && factor > 1) data.cloudOver = (data.cloudOver ?? 1) * factor; // past its biggest (it fills the part above the take): on to the whole screen
        data.cloud = { x: c.x + at.x - last.x, y: c.y + at.y - last.y, s: Math.max(CLOUD[0], Math.min(1, c.s * factor)) }; // full = it fills the part above the take (16.11.)
        cloudAt = at;
        return paint();
      }
      if (role === 'line-arc' || role?.startsWith('line:')) { data.lineZoom = Math.max(LINE_ZOOM[0], Math.min(LINE_ZOOM[1], (data.lineZoom ?? 1) * factor)); return paint(); } // the takes apart / together
      if (role !== 'point' && role !== 'point-wide') return null; // elsewhere the pinch ends as a step (pinchEnd)
      const fx = how.fx ?? factor, fy = how.fy ?? 1;
      if (Math.abs(Math.log(fy)) > Math.abs(Math.log(fx))) return waitsBy(fy); // up-down (15.11.): the waits longer / shorter (rings show them)
      if (st.screen === 'line') { // across (16.11.): the button widens to the golden section; past that = the mark to cut
        const { H, max } = screen.last?.wide ?? { H: 84, max: 240 }, width = H + (max - H) * (data.pointWide ?? 0);
        const next = width * fx;
        data.wideOver = next > max ? (data.wideOver ?? 1) * (width >= max - 0.5 ? fx : next / max) : 1;
        data.pointWide = Math.max(0, Math.min(1, (next - H) / (max - H)));
        return paint();
      }
      if (data.items?.length && ['record', 'stream'].includes(st.screen)) { data.timeZoom = Math.max(0.25, Math.min(8, (data.timeZoom ?? 1) * fx)); return paint(); } // across: into the take's time
      return null;
    },
    pinchEnd: (factor, role) => { // spread = nearer / more, squeeze = farther / less, where the first finger lay
      if (cloudAt) { cloudAt = null; keepCloud(); } // the cloud stays where it was put
      const g = pinchStep(factor);
      if (st.similar && !data.double && (role === 'similar-band' || role?.startsWith('similar:'))) { // 16.11.: cloud ⇄ the whole screen
        const over = data.cloudOver ?? 1; data.cloudOver = 1;
        if (g === 'spread' && role?.startsWith('similar:')) return act('spread', role); // zoomed into a tile: that take in Doppel, playing
        if ((data.cloudFull ?? 0) > 0.5) return g === 'squeeze' ? fullSimilar(false) : null; // smaller: the cloud again (the take glides back)
        if (over > 1.2) return fullSimilar(true);
      }
      if ((role === 'point' || role === 'point-wide') && st.screen === 'line') { // the wide button: cut past the mark, nearly shut = round again
        const cut = (data.wideOver ?? 1) > 1.15;
        data.wideOver = 1;
        if ((data.pointWide ?? 0) < 0.08) data.pointWide = 0;
        paint();
        if (cut) { data.pointWide = 0; return splitTake(0, data.timeMs ?? 0); } // in two at the moment in its middle
        return null;
      }
      if (!g || role === 'live' || role === 'point') return null; // those zoomed continuously
      if (st.screen === 'line' && st.sub === 'spread') { // 16.11.: in a take's timeline
        const z = data.timeZoom ?? 1;
        if (g === 'spread' && z >= 7.9) { // spread on past its widest: cut where the point stands (its moment inside that take)
          let acc = 0, off = null;
          for (const it of data.items ?? []) { if ((data.timeMs ?? 0) < acc + (it.ms ?? 0)) { off = (data.timeMs ?? 0) - acc; break; } acc += it.ms ?? 0; }
          step('done');
          return splitTake(0, off);
        }
        if (g === 'squeeze' && z <= 0.26) return step('done'); // squeezed shut: back to the line
        return null;
      }
      if (role === 'line-arc' || role?.startsWith('line:')) { // at the end of the zoom: past its widest = the timeline, past its closest = join
        const z = data.lineZoom ?? 1;
        if (g === 'spread' ? z < LINE_ZOOM[1] : z > LINE_ZOOM[0]) return null;
        if (g === 'squeeze') { const i = role?.startsWith('line:') ? Number(role.slice(5)) : 0; return joinTakes(i, i > 0 ? i - 1 : i + 1); } // the take under the finger and its neighbour toward the point
        return act(g, 'line-arc');
      }
      return act(g, role ?? 'top-zone');
    },
    stretch: (heldRole, factor, how) => { // one finger holds the picture, the other pulls: the window's form changes
      if (cutting && heldRole === cutting.held) { // a take held: apart = split, onto another take = join (15.11.)
        cutting.total *= factor;
        const join = cutting.other?.startsWith('line:') && cutting.other !== cutting.held;
        data.cutMark = !join && cutting.total > SPLIT_AT ? cutting.held : null; // past the mark: a line across the take
        data.cutAt = cutting.at;
        data.joinMark = join && cutting.total < JOIN_AT ? [cutting.held, cutting.other] : null;
        paint();
        return true;
      }
      if (heldRole !== 'live') return false;
      if (!rawShape) debugNote({ method: 'form', where: 'live', error: `stretch ${factor.toFixed(2)} fx ${how.fx?.toFixed(2)} fy ${how.fy?.toFixed(2)}`, ms: 0 }); // in sign-debug.txt: the pull arrived
      reshape(formBy(rawShape ?? data.shape, factor, how));
      return true;
    },
    stretchEnd: () => {
      if (cutting) { // the pull ends: split or join if it went past its mark, else nothing
        const { held, other, at } = cutting, split = data.cutMark, join = data.joinMark;
        cutting = null; usedHold = held; data.cutMark = null; data.joinMark = null; delete data.cutAt; paint();
        if (split) return splitTake(Number(held.slice(5)), null, at);
        if (join) return joinTakes(Number(held.slice(5)), Number(other.slice(5)));
        return null;
      }
      rawShape = null; saveSettings();
    },
    dragEnd: (el, moved, role) => {
      if (role === spentRole) { spentRole = null; return null; } // a property was held for the other finger, not carried
      if (role === pendingHold) { pendingHold = null; if (usedHold === role) { usedHold = null; return null; } if (!moved) return act('hold', role); } // held alone and lifted: its hold now (add-to)
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
    else if (me?.start === 'record') { const tryRecord = (n) => setTimeout(() => { if (camera && !take.recorder) act('tap', 'point'); else if (n) tryRecord(n - 1); }, 900); tryRecord(4); } // the camera comes just after the start
  }
  // Android "back" (14.11.): one step back, never out of the app by surprise: sharing menu → Similar → context field
  globalThis.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
    if (!$('#share').hidden) return menu.back() || menu.show(false); // an account → the accounts → closed
    if (data.double) { data.double = null; data.offers = []; $('#template').removeAttribute('src'); pairOff(); return paint(); } // Doppel → viele
    if ((data.cloudFull ?? 0) > 0.5) return fullSimilar(false); // Back: the whole screen → the cloud
    if (st.similar) return closeSimilar();
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
  $('#share').addEventListener('pointerup', (e) => { if (innerWidth - e.clientX < 24) act('edge-out', 'middle-right'); });
  $('#replay').addEventListener('timeupdate', (e) => { data.timeMs = e.target.currentTime * 1000; });
  $('#replay').addEventListener('loadedmetadata', (e) => { data.lengthMs = Number.isFinite(e.target.duration) ? e.target.duration * 1000 : 0; data.pointWide = 0; }); // the take's length: the wide button's window (16.11.)
  await showStart().catch(() => {}); // whose state, how it starts: 2.5 s in the window (15.11.)
  paint();
  $('#screen').classList.add('ready'); // the window and its arcs at once, centred
  freshCamera(); // then the camera, its picture inside the window
}
