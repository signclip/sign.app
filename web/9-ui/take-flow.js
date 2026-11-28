// take-flow.js — the take with the devices: camera, recording, pause, photo, keep (←), anew (↓ far), replay.
//
// Purpose:   what the button does to the hardware and the files; the state stays in take-state.js (A.dispatch).
//            The camera opens after the first paint (15.11.: the start is the background with the window, never a bare
//            camera picture). Without a camera (a desktop, a page in a frame) a take still works with the strands that
//            are there: context alone is a take too. Keep = the take onto the line at once (27.11., fix), then saveTake
//            behind it (originals first, chain last): a series is one line in the chain (add-line.js), the next take lays on it.
//            Onboarding: the first take is the name sign (localStorage sign.nameSign), the next three the password
//            gestures (sign.passwords); after the third the hello goes to the project's door (engine.joinProject).
//            The camera after being away (26.11., user: the picture stood still when coming back to the take): the
//            phone takes the camera from an app in the background, the stream then ends or simply stops giving
//            pictures. So the camera is let go when the app is no longer seen (no take running), opened again when
//            it is seen, and checked whenever the window goes back to the live picture: a stream that ended, or that
//            gives no new picture within STILL_MS, is closed and opened anew (liveAgain).
// Depends:   browser; 4-save (save-take, add-line), 5-take (recorder, where), 9-ui (frame, device-keys, chips)
// Test:      the state it drives is tested in tests/ui.test.mjs; the recorder in tests/take.test.mjs; devices on a phone.
// Limits:    one take records at a time; a photo is 1080 × 1080 PNG (lossless); wake 96 × 96 JPEG after 150 ms;
//            a camera that stands still is noticed after STILL_MS = 900 ms, opening it anew takes ≈ 0.3–1 s.

import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { createWhere } from '../5-take/where.js';
import { saveTake } from '../4-save/save-take.js';
import { addLine } from '../4-save/add-line.js';
import { stillOf } from './frame.js';
import { mainLens } from './camera.js';
import { deviceKeys } from './device-keys.js';
import { contextForTake } from './chips.js';
import { leadOf } from '../1-model/context.js';
import { count } from './take-state.js';
import { withContext } from './line.js';

const sealKey = async () => (await deviceKeys().catch(() => null))?.device ?? null;

/** One picture from the live video: the middle square, 1080 × 1080, PNG. → bytes */
async function snapshot(video, side = 1080) {
  const s = Math.min(video.videoWidth, video.videoHeight) || side;
  const c = Object.assign(document.createElement('canvas'), { width: side, height: side });
  c.getContext('2d').drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, side, side);
  const blob = await new Promise((done) => c.toBlob(done, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export function takeFlow(A) {
  A.sealKey = sealKey; // also for the words from the sound (heard.js)
  const live = document.querySelector('#live');
  const here = createWhere();
  const t = { camera: null, recorder: null, began: 0, wake: null, lineChain: A.st.lines.at(-1)?.chain ?? null }; // the line's chain is kept with the line (20.11.): it survives a restart

  const STILL_MS = 900;
  const alive = (stream) => { const v = stream?.getVideoTracks?.()[0]; return Boolean(v && v.readyState === 'live'); };
  /** Let the camera go (tracks stopped, the window empty). */
  function closeCamera() {
    const s = t.camera;
    t.camera = null;
    try { s?.getTracks().forEach((x) => x.stop()); } catch { /* gone already */ }
    if (live.srcObject === s) live.srcObject = null;
  }
  async function openCamera() {
    if (t.camera && alive(t.camera)) return t.camera;
    if (t.camera) closeCamera(); // it ended while away (the phone took it): a new one
    t.opening ??= (async () => { // once, even when the button is tapped while it opens
      const facing = t.facing ?? A.settings.facing;
      const s = await openDevices(navigator.mediaDevices, { facing }).catch(() => null);
      t.camera = s && await mainLens(s, facing).catch(() => s); // the main lens at 1×, never wide angle (20.11.)
      if (t.camera) {
        live.srcObject = t.camera; live.play?.().catch(() => {});
        const cam = t.camera, track = cam.getVideoTracks()[0];
        if (track) track.onended = () => { if (t.camera === cam && !t.recorder) { closeCamera(); liveAgain(); } }; // taken away: opened again as soon as the app is seen
      }
      t.opening = null;
      return t.camera;
    })();
    return t.opening;
  }
  /** Does the live picture stand still? → true when no new picture came within ms. */
  function still(ms = STILL_MS) {
    return new Promise((done) => {
      let over = false;
      const end = (v) => { if (!over) { over = true; done(v); } };
      const from = live.currentTime;
      if (live.requestVideoFrameCallback) live.requestVideoFrameCallback(() => end(false));
      const poll = setInterval(() => { if (live.currentTime !== from) { clearInterval(poll); end(false); } }, 80);
      setTimeout(() => { clearInterval(poll); end(true); }, ms);
    });
  }
  /**
   * The live picture is wanted again (the app is seen again, the window goes back from an earlier take, a take is
   * about to start): open what was let go, start what was paused, and replace a camera that gives no pictures.
   * Never while a take runs – its stream is not touched. → the stream or null
   */
  let again = null;
  function liveAgain() {
    if (document.visibilityState !== 'visible' || t.recorder) return Promise.resolve(t.camera);
    again ??= (async () => {
      try {
        if (!t.camera || !alive(t.camera)) return await openCamera();
        if (live.srcObject !== t.camera) live.srcObject = t.camera;
        if (live.paused) await live.play().catch(() => {});
        if (await still()) { if (t.recorder) return t.camera; closeCamera(); return await openCamera(); }
        return t.camera;
      } finally { again = null; }
    })();
    return again;
  }
  // away = the camera is let go (the phone would take it anyway, and nobody is filmed unseen); back = it comes again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') return void liveAgain();
    if (!t.recorder && A.st.rec === 'idle') closeCamera();
  });
  addEventListener('pageshow', () => { liveAgain(); });
  globalThis.Capacitor?.Plugins?.App?.addListener?.('resume', () => { liveAgain(); }); // the native app comes to the front

  // One at a time (27.11., user: start by itself, pause, go on and the stillness end together hung): a start and a drop
  // each take a while (camera, recorder) before the state says so – meanwhile calm.js ticks every 100 ms and a finger
  // taps. While one runs, another start or drop gets the same promise; pause, go on and ← wait for it to end.
  let busy = null;
  const once = (fn) => (...args) => busy ?? (busy = Promise.resolve().then(() => fn(...args)).finally(() => { busy = null; }));
  const start = once(startNow);
  const anew = once(anewNow);
  async function startNow() {
    if (A.st.rec !== 'idle') return; // already recording (a second start arriving late)
    await liveAgain(); // a camera that went still while away is replaced before the take, not found black afterwards (26.11.)
    await openCamera();
    t.began = Date.now(); t.wake = null; A.data.buttonPic = null;
    if (t.camera) {
      const tap = await browserTap(t.camera).catch(() => null);
      t.recorder = startTake(t.camera, { MediaRecorder, tapAudio: () => tap });
      A.heard?.begin(tap); // the flow sound → context on: Whisper reads it while it runs (26.11.)
      const mine = t.recorder; // kept or dropped within 150 ms: the picture is not this take's any more – the button stays free
      setTimeout(() => stillOf(live).then((b) => { if (t.recorder !== mine) return; t.wake = b; A.data.buttonPic = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })); A.paint(); }, () => {}), 150);
    }
    here.refresh?.();
    navigator.vibrate?.(12);
    A.dispatch({ type: 'rec', to: 'recording' });
  }
  const pause = () => { if (busy || !t.recorder) return; t.recorder.pause(); A.dispatch({ type: 'rec', to: 'paused' }); };
  const resume = () => { if (busy || !t.recorder) return; t.recorder.resume(); A.dispatch({ type: 'rec', to: 'recording' }); };

  /** ↓ while recording (26.11.: a little = the video anew, the context stays; far = the context goes too, all = true): the take is dropped, nothing is saved; the button starts fresh. */
  async function anewNow(all = false) {
    if (A.st.rec === 'idle' && !t.recorder) return; // dropped already
    A.heard?.cut(); // what was read of it goes too
    if (t.recorder) await t.recorder.stop().catch(() => null);
    t.recorder = null; A.data.buttonPic = null;
    navigator.vibrate?.(all ? [12, 50, 12, 50, 12] : [12, 50, 12]);
    A.dispatch({ type: 'discard' });
    if (all) A.dispatch({ type: 'clear-context' });
  }

  /**
   * ← while recording or paused: kept. The button is free at once (17.11.): the next tap starts the next take, it no
   * longer pauses a take that is still being written. Takes are saved one after another, in the order they were made.
   * step (26.11.): 'inner' = the innermost of the series goes next (← a little) · 'whole' = the whole gesture (← far).
   */
  let saving = Promise.resolve();
  function keep(step = 'inner') {
    if (busy) return busy.then(() => (A.st.rec !== 'idle' ? keep(step) : null)); // still starting: kept once it runs
    if (A.st.rec === 'idle' && !t.recorder) return Promise.resolve(null); // kept already (a second ← arriving late)
    const rec = t.recorder, began = t.began, wake = t.wake, heard = A.heard?.cut() ?? null; // heard: what Whisper read of it so far
    t.recorder = null;
    navigator.vibrate?.([15, 60, 15]);
    A.dispatch({ type: 'rec', to: 'idle' });
    const fixed = fix(step, began, Date.now() - began);
    const run = saving.then(async () => {
      const r = rec ? await rec.stop() : { video: null, audio: null, lengthMs: Date.now() - began };
      const out = await save({ video: r.video, audio: r.audio, lengthMs: r.lengthMs, began, wake, fixed });
      if (heard && r.audio && fixed.strands.a) A.heard.finish(heard, r.audio, out); // the rest of its words, then the echo – the next take need not wait
      return out;
    });
    saving = run.catch(() => {});
    return run;
  }

  /**
   * What a take keeps is fixed the moment it is kept (27.11.): its context, the result it answers, the strands on and
   * taken over – the save runs behind (a second or more over the network) and reads nothing that changed meanwhile.
   * The take lies on the line at once, with the button's picture, and glides out of the button to the left (A.slideIn);
   * the series shows its next word at once, so a take that starts by itself right after never shows the old word.
   * → what save() needs
   */
  function fix(step, began, ms) {
    const st = A.st, adding = t.addTo, from = A.data.takeFrom, pic = A.data.buttonPic;
    t.addTo = null; A.data.takeFrom = null; A.data.buttonPic = null; // the button is free: its picture went with the take
    const fixed = { step, adding, from, typed: st.context, strands: { ...st.strands }, pending: null,
      context: st.strands.x ? contextForTake(st.context, st.sticky) : '',
      answering: st.similar === 'single' ? A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === st.pick) ?? null : null };
    if (adding) return fixed; // a strand onto a take that lies on the line already: nothing new on it
    fixed.pending = `saving:${began}`;
    if (pic) A.data.thumbs[fixed.pending] = pic;
    A.dispatch({ type: 'kept', take: { id: fixed.pending, ms, t: began, context: fixed.context, kinds: Object.keys(st.strands).filter((k) => st.strands[k]), thumb: pic }, step });
    const n = A.st.lines.length - 1;
    Object.assign(fixed, { n, first: A.st.lines[n].takes.length === 1, after: A.st.context }); // first of its line: its own chain, else onto the line's (save) · after: the series moved on to
    // a stop on the way (27.11., user): ← left a nesting – the next take has other prefixes – so the start by itself waits
    // for a touch: ((Obst)((Banane) (Apfel))) after Apfel → ((Obst)()) stops (more can be written into it); flat words never stop; the end neither
    if (A.st.context && leadOf(fixed.context).join('\n') !== leadOf(contextForTake(A.st.context, A.st.sticky)).join('\n')) A.calm?.hold();
    A.slideIn?.();
    return fixed;
  }

  /**
   * One picture, kept at once (21.11.: ← or ↑ on the ready button, instead of the photo dot). Visual strand off: a take
   * of the other strands (its context) without a picture.
   */
  async function photo(step = 'inner') {
    if (!A.st.strands.v) { const began = Date.now(); return save({ lengthMs: 0, began, wake: null, fixed: fix(step, began, 0) }); }
    await openCamera();
    if (!t.camera) return A.shake('button');
    const picture = await snapshot(live);
    navigator.vibrate?.(8);
    const small = await stillOf(live).catch(() => null), began = Date.now();
    if (small) A.data.buttonPic = URL.createObjectURL(new Blob([small], { type: 'image/jpeg' })); // it lies on the line at once with its picture
    return save({ picture, lengthMs: 0, began, wake: small, fixed: fix(step, began, 0) });
  }
  /** → while recording or paused (26.11., user): kept, and at once played in the window – the take just made, in the button. */
  async function keepAndPlay() {
    const out = await keep('inner');
    const take = out?.take;
    if (!take) return null;
    const i = A.st.lines.at(-1).takes.findIndex((x) => x.id === take.id);
    if (i >= 0 && A.st.rec === 'idle') A.dispatch({ type: 'at', at: i });
    const back = () => { if (A.st.rec === 'idle' && A.st.lines.at(-1).takes[A.st.at]?.id === take.id) A.dispatch({ type: 'at', at: count(A.st) }); A.paint(); }; // played: ready again for the next
    const onLine = A.st.lines.at(-1).takes[i] ?? take; // as the line holds it (with its parts): what the player knows how to show
    if (!A.chainAt?.(onLine.id)) await A.reindex?.().catch(() => {}); // just written: the player finds its file through the index
    return A.player.show(onLine, 0, { play: true, onEnd: back }).then((ok) => { if (!ok) back(); return ok; }, () => back());
  }

  async function save({ video = null, audio = null, picture = null, lengthMs, began, wake, fixed }) {
    if (fixed.adding) return addStrandSave(fixed.adding, { video, audio, lengthMs });
    const on = fixed.strands, answering = fixed.answering, context = fixed.context;
    // strands taken over from a result (21.11.): each kept by reference, per strand; the text only while it was not changed
    const from = fixed.from;
    const keep = from ? from.kinds.filter((k) => k !== 'x' || fixed.typed === from.text) : [], kept = (k) => keep.includes(k);
    let saved;
    try {
      saved = await saveTake({ device: A.device, person: A.person, store: A.store, cell: here.now?.() ?? null, now: began, lengthMs, context: kept('x') ? '' : context,
        video: on.v && !kept('v') ? video : null, picture: on.v && !kept('v') ? picture : null, audio: on.a && !kept('a') ? audio : null, deviceKey: await sealKey(), wake: on.v && video && !kept('v') ? wake : null,
        ...(from && keep.length ? { onto: from.path, ontoStore: from.store, keep } : {}) });
    } catch (err) { // off the line again; a take that runs meanwhile goes on; its word comes back while nothing else changed – to be signed again
      console.warn('save', err);
      if (fixed.pending) A.dispatch({ type: 'unkept', id: fixed.pending });
      if (fixed.pending && A.st.rec === 'idle' && A.st.context === fixed.after) A.dispatch({ type: 'context', text: fixed.typed });
      return A.shake('button');
    }
    const thumb = wake ? URL.createObjectURL(new Blob([wake], { type: 'image/jpeg' })) : null;
    const take = { id: saved.chain.path, ms: lengthMs, t: began, context, kinds: Object.keys(on).filter((k) => on[k]), thumb };
    if (thumb) A.data.thumbs[take.id] = thumb;
    A.dispatch({ type: 'took', take, replace: fixed.pending }); // where the one kept lies; the button's picture went already (fix)
    // the series in the chain: the first take of a line is its own chain; the next ones lay onto the line (add-line.js).
    // Saves run one after another, so the line's chain is known (t.lineChain) when the second one gets here.
    if (fixed.first) remember(fixed.n, saved.chain.path);
    else remember(fixed.n, (await addLine({ own: A.store, chainPath: t.lineChain, elements: [{ bytes: await A.store.read(saved.chain.path) }], device: A.device, person: A.person, deviceKey: await sealKey() }).catch(() => ({ chain: t.lineChain }))).chain);
    A.keepLines();
    if (answering) await answer(answering, saved.chain.path); // taken in the single view: one's own version, with a reference to that one (21.11.)
    await A.onboardTook(saved.paths, take);
    A.engine?.afterTake(saved.paths).catch(() => {});
    A.reindex();
    return { saved, take };
  }

  /**
   * The open line after a cut or a join (17.11.): a new line on top of its chain, every take by reference — a cut as two
   * parts of one take '(from_to), no file is rewritten (add-line.js). Best effort: the line on the screen stays as it is.
   */
  async function saveLine() {
    const line = A.st.lines.at(-1);
    if (!line?.takes.length || !t.lineChain) return null;
    try {
      const elements = await elementsOf(line);
      if (elements.length > 64) return null;
      remember(A.st.lines.length - 1, (await addLine({ own: A.store, chainPath: t.lineChain, elements, device: A.device, person: A.person, deviceKey: await sealKey() })).chain);
      A.reindex();
      return t.lineChain;
    } catch (err) { console.warn('line', err); return null; }
  }
  /** Every take of a line as an element (a cut: its part '(from_to)). */
  async function elementsOf(line) {
    const elements = [];
    for (const take of line.takes) for (const p of (take.parts ?? [{ id: take.id, from: 0, to: take.ms, len: take.ms }])) {
      elements.push({ bytes: await A.store.read(p.id), ...(p.from > 0 || p.to < (p.len ?? p.to) ? { part: [p.from, p.to] } : {}) });
    }
    return elements;
  }
  /** The chain of line n now (20.11.): kept on the line itself, so a chosen older line and a restart find it. */
  function remember(n, chain) {
    if (!chain) return;
    if (n === A.st.lines.length - 1) t.lineChain = chain;
    if (A.st.lines[n] && A.st.lines[n].chain !== chain) A.dispatch({ type: 'lines', lines: A.st.lines.map((l, j) => (j === n ? { ...l, chain } : l)) });
    A.keepLines();
  }
  /**
   * The words written now onto every take of line n, or out of them (20.11.): a new line on top of its chain —
   * ((Essen))({:chain.2} {:chain.3}) or -((Essen))(…). A line without a chain yet (older, from before 20.11.) gets one.
   */
  async function lineWith(n, words, without) {
    const line = A.st.lines[n];
    if (!line?.takes.length || !words.length) return null;
    try {
      const elements = await elementsOf(line);
      if (elements.length > 64) return null;
      const context = words.length === 1 ? `(${words[0]})` : `(${words.map((w) => `(${w})`).join(' ')})`; // the whole group in front: multiplied with every take
      const chainPath = line.chain ?? (n === A.st.lines.length - 1 ? t.lineChain : null);
      const chain = (await addLine({ own: A.store, chainPath, elements, context, without, device: A.device, person: A.person, deviceKey: await sealKey() })).chain;
      remember(n, chain);
      A.reindex();
      return chain;
    } catch (err) { console.warn('line context', err); return null; }
  }
  /**
   * An earlier take's context changed afterwards (21.11., user: words deleted, brackets set later): one's own take = a
   * new chain on top of it – the picture and the sound kept by reference, the new context recorded, the old one stays
   * below ({:chain.1}); someone else's take (take.from: its store) = the same, but the new chain is one's own. The line
   * then points to it. edit: { n, i, text }
   */
  async function retext({ n, i, text }) {
    const line = A.st.lines[n], take = line?.takes[i];
    if (!take || (take.parts?.length ?? 0) > 1) return A.shake('context'); // two joined takes: their contexts stay their own
    const guest = A.data.guestAt?.[take.id]; // someone else's take, carried in from Similar: the new chain is one's own, with a reference
    const base = guest?.chainPath ?? take.parts?.[0]?.id ?? take.id, keep = (take.kinds ?? ['v', 'a']).filter((k) => k !== 'x');
    let saved;
    try {
      saved = await saveTake({ device: A.device, person: A.person, store: A.store, now: Date.now(), lengthMs: take.ms ?? 0, context: text,
        onto: base, ontoStore: guest?.chainStore ?? null, keep, deviceKey: await sealKey() });
    } catch (err) { console.warn('retext', err); return A.shake('context'); }
    const id = saved.chain.path, next = { ...take, id, context: text, ...(take.parts ? { parts: [{ ...take.parts[0], id }] } : {}) };
    if (A.data.thumbs[take.id]) A.data.thumbs[id] = A.data.thumbs[take.id];
    A.dispatch({ type: 'lines', lines: A.st.lines.map((l, j) => (j === n ? { ...l, takes: l.takes.map((x, k) => (k === i ? next : x)) } : l)) });
    A.keepLines();
    if (n === A.st.lines.length - 1) await saveLine();
    A.reindex();
    return id;
  }
  /**
   * The words written now onto the element shown single, or out of it (26.11., user: as for a chosen line, ← far / ↓ far).
   * Like a changed context (retext): a new chain of mine on top of it, picture and sound by reference, the new context
   * recorded – someone else's take stays as it is (G4b). e: Similar's entry · → the new chain's path, or null
   */
  async function wordsOnElement(e, words, without) {
    const from = e?.chain?.from, store = (A.sources ?? []).find((x) => x.name === from?.store)?.store ?? null;
    if (!store || !from?.path || !words.length) return null;
    const had = (await Promise.resolve(A.media.contextTextOf?.(e.chain)).catch(() => null)) ?? (e.words ?? []).map((w) => `(${w})`).join(' '); // its context as written
    const lines = withContext([{ takes: [{ id: from.path, context: had }] }], 0, words, { without });
    const text = lines[0].takes[0].context;
    if (text === had) return null; // it has them all already / has none of them
    try {
      const saved = await saveTake({ device: A.device, person: A.person, store: A.store, now: Date.now(), lengthMs: e.ms ?? 0, context: text,
        onto: from.path, ontoStore: store, keep: (e.kinds ?? ['v', 'a']).filter((k) => k !== 'x'), deviceKey: await sealKey() });
      A.reindex();
      return saved.chain.path;
    } catch (err) { console.warn('element words', err); return null; }
  }
  /**
   * A take taken in the single view (21.11.): a line of one's own with both, the result first – one's own version of
   * it, by reference; the other person's files stay where they are. → the line's chain (↑ then sends it to her)
   */
  /** An older line tapped in the fan (22.11., user): it comes to the button; a change then writes a new line on top of it. */
  function showLine(n) {
    const line = A.st.lines[n];
    if (!line) return null;
    A.data.fan = false; A.data.fanShift = null; // the rows are counted anew next time: this line is the open one now
    A.dispatch({ type: 'show-line', n });
    t.lineChain = line.chain ?? null;
    navigator.vibrate?.(10);
    return A.paint();
  }
  /** ↑ with the take in the button (21.11.): that take goes over – its own chain, or a line of mine pointing to a guest. */
  async function shareTake() {
    const take = A.st.lines.at(-1)?.takes[A.st.at];
    if (!take) return null;
    const g = A.data.guestAt?.[take.id];
    try {
      if (g?.chainPath) { const line = await addLine({ own: A.store, elements: [{ bytes: await g.chainStore.read(g.chainPath) }], device: A.device, person: A.person, deviceKey: await sealKey() }); A.data.shareChain = line.chain; }
      else A.data.shareChain = take.parts?.[0]?.id ?? take.id;
      A.reindex();
      return A.data.shareChain;
    } catch (err) { console.warn('share take', err); return null; }
  }
  /** ↑ with an element shown single (21.11.): a line of mine pointing to it; her name offered. */
  async function shareElement(e) {
    if (await A.pass?.ask(e)) return 'asked'; // not hers to pass on: a request to the author instead (21.11.)
    const from = e.chain?.from, store = (A.sources ?? []).find((x) => x.name === from?.store)?.store ?? null;
    if (!store || !from?.path) return null;
    try {
      const line = await addLine({ own: A.store, elements: [{ bytes: await store.read(from.path) }], device: A.device, person: A.person, deviceKey: await sealKey() });
      A.data.shareChain = line.chain; A.data.suggest = e.person || null;
      A.reindex();
      return line.chain;
    } catch (err) { console.warn('share element', err); return null; }
  }
  async function answer(e, mine) {
    const from = e.chain?.from; // { store: the sharing point's name, path } (3-index)
    try {
      const store = (A.sources ?? []).find((x) => x.name === from?.store)?.store ?? null, path = from?.path;
      if (!store || !path) return null;
      const line = await addLine({ own: A.store, elements: [{ bytes: await store.read(path) }, { bytes: await A.store.read(mine) }], device: A.device, person: A.person, deviceKey: await sealKey() });
      A.data.shareChain = line.chain; A.data.suggest = e.person || null;
      A.reindex();
      return line.chain;
    } catch (err) { console.warn('answer', err); return null; }
  }
  /**
   * A strand of the result shown single, its arc dragged into the take window (21.11., user): the next take keeps it
   * by reference – the text comes into the row to check (changed = one's own text) – and records the rest.
   */
  function takeStrand(e, kind) {
    const f = e?.chain?.from, src = (A.sources ?? []).find((x) => x.name === f?.store);
    if (!src || !f?.path) return A.shake('window');
    const from = A.data.takeFrom?.path === f.path ? A.data.takeFrom : { store: src.store, path: f.path, kinds: [], text: null };
    if (!from.kinds.includes(kind)) from.kinds.push(kind);
    if (kind === 'x' && e.words?.length) { from.text = `(${e.words.map((w) => `(${w})`).join(' ')})`; A.dispatch({ type: 'context', text: from.text }); }
    A.data.takeFrom = from;
    navigator.vibrate?.(12);
    return A.paint();
  }
  /** A strand the earlier take lacks (21.11.): its arc tapped → the next take records only that, onto this take. */
  function addStrand(kind) {
    const n = A.st.lines.length - 1, i = A.st.at, take = A.st.lines[n]?.takes[i];
    if (!take || (take.kinds ?? []).includes(kind) || !['v', 'a'].includes(kind)) return false;
    t.addTo = { n, i, kind };
    navigator.vibrate?.(10);
    start();
    return true;
  }
  async function addStrandSave(add, { video, audio, lengthMs }) {
    const take = A.st.lines[add.n]?.takes[add.i];
    if (!take) return null;
    const guest = A.data.guestAt?.[take.id], base = guest?.chainPath ?? take.parts?.[0]?.id ?? take.id;
    let saved;
    try {
      saved = await saveTake({ device: A.device, person: A.person, store: A.store, now: Date.now(), lengthMs: take.ms || lengthMs, video: add.kind === 'v' ? video : null, audio: add.kind === 'a' ? audio : null,
        onto: base, ontoStore: guest?.chainStore ?? null, keep: take.kinds ?? [], deviceKey: await sealKey() });
    } catch (err) { console.warn('add strand', err); return A.shake('button'); }
    const id = saved.chain.path, next = { ...take, id, kinds: [...new Set([...(take.kinds ?? []), add.kind])], ...(take.parts ? { parts: [{ ...take.parts[0], id }] } : {}) };
    if (A.data.thumbs[take.id]) A.data.thumbs[id] = A.data.thumbs[take.id];
    A.dispatch({ type: 'lines', lines: A.st.lines.map((l, j) => (j === add.n ? { ...l, takes: l.takes.map((x, k) => (k === add.i ? next : x)) } : l)) });
    A.dispatch({ type: 'at', at: add.i });
    A.keepLines();
    if (add.n === A.st.lines.length - 1 && !A.st.lines[add.n].guest) await saveLine();
    A.reindex();
    return id;
  }
  /**
   * The series written in the row, kept as a template (21.11.): ↑ on the row = shared. A chain whose line is its
   * context and one empty take – waiting for takes (SCHEMA _( ) empty = waits). → path
   */
  async function saveTemplate(context) {
    if (!context) return null;
    const saved = await saveTake({ device: A.device, person: A.person, store: A.store, now: Date.now(), lengthMs: 0, context, deviceKey: await sealKey(), waiting: true });
    A.data.shareChain = saved.chain.path;
    A.reindex();
    return saved.chain.path;
  }
  /** The chosen line's chain (↑ shares its make-up); one without a chain yet gets one first. → path or null */
  async function chosenChain() {
    const n = A.st.chosenLine, line = n == null ? null : A.st.lines[n];
    if (!line?.takes.length) return null;
    const have = line.chain ?? (n === A.st.lines.length - 1 ? t.lineChain : null);
    if (have) return have;
    try {
      const elements = await elementsOf(line);
      const chain = (await addLine({ own: A.store, elements, device: A.device, person: A.person, deviceKey: await sealKey() })).chain;
      remember(n, chain);
      return chain;
    } catch { return null; }
  }

  /** The chain of the line in force (↑ on the button shares it). */
  const lastChain = async () => A.data.shareChain ?? (await chosenChain()) ?? t.lineChain; // what was just made to share (a search, an answer, a template), else a chosen line (20.11.)

  return { get busy() { return Boolean(busy); }, here: () => here.now?.() ?? null, saveLine, lineWith, retext, addStrand, takeStrand, shareTake, shareElement, showLine, saveTemplate, setCamera: (stream, facing) => { t.camera = stream; if (facing) t.facing = facing; }, openCamera, liveAgain, start, pause, resume, keep, keepAndPlay, anew, photo, wordsOnElement, lastChain, get camera() { return t.camera; } };
}
