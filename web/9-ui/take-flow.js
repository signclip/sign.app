// take-flow.js — the take with the devices: camera, recording, pause, photo, keep (←), anew (↓ far), replay.
//
// Purpose:   what the button does to the hardware and the files; the state stays in take-state.js (A.dispatch).
//            The camera opens after the first paint (15.11.: the start is the background with the window, never a bare
//            camera picture). Without a camera (a desktop, a page in a frame) a take still works with the strands that
//            are there: context alone is a take too. Keep = saveTake (originals first, chain last), then the take goes
//            onto the line: a series is one line in the chain (add-line.js), the next take of the series lays on it.
//            Onboarding: the first take is the name sign (localStorage sign.nameSign), the next three the password
//            gestures (sign.passwords); after the third the hello goes to the project's door (engine.joinProject).
// Depends:   browser; 4-save (save-take, add-line), 5-take (recorder, where), 9-ui (frame, device-keys, chips)
// Test:      the state it drives is tested in tests/ui.test.mjs; the recorder in tests/take.test.mjs; devices on a phone.
// Limits:    one take records at a time; a photo is 1080 × 1080 PNG (lossless); preview 96 × 96 JPEG after 150 ms.

import { openDevices, startTake, browserTap } from '../5-take/recorder.js';
import { createWhere } from '../5-take/where.js';
import { saveTake } from '../4-save/save-take.js';
import { addLine } from '../4-save/add-line.js';
import { stillOf } from './frame.js';
import { mainLens } from './camera.js';
import { deviceKeys } from './device-keys.js';
import { contextForTake } from './chips.js';
import { count } from './take-state.js';

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
  const live = document.querySelector('#live');
  const here = createWhere();
  const t = { camera: null, recorder: null, began: 0, preview: null, lineChain: A.st.lines.at(-1)?.chain ?? null }; // the line's chain is kept with the line (20.11.): it survives a restart

  async function openCamera() {
    if (t.camera) return t.camera;
    t.opening ??= (async () => { // once, even when the button is tapped while it opens
      const facing = A.settings.facing;
      const s = await openDevices(navigator.mediaDevices, { facing }).catch(() => null);
      t.camera = s && await mainLens(s, facing).catch(() => s); // the main lens at 1×, never wide angle (20.11.)
      if (t.camera) { live.srcObject = t.camera; live.play?.().catch(() => {}); }
      t.opening = null;
      return t.camera;
    })();
    return t.opening;
  }

  async function start() {
    await openCamera();
    t.began = Date.now(); t.preview = null; A.data.buttonPic = null;
    if (t.camera) {
      const tap = await browserTap(t.camera).catch(() => null);
      t.recorder = startTake(t.camera, { MediaRecorder, tapAudio: () => tap });
      setTimeout(() => stillOf(live).then((b) => { t.preview = b; A.data.buttonPic = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })); A.paint(); }, () => {}), 150);
    }
    here.refresh?.();
    navigator.vibrate?.(12);
    A.dispatch({ type: 'rec', to: 'recording' });
  }
  const pause = () => { t.recorder?.pause(); A.dispatch({ type: 'rec', to: 'paused' }); };
  const resume = () => { t.recorder?.resume(); A.dispatch({ type: 'rec', to: 'recording' }); };

  /** ↓ far: the take is dropped, nothing is saved; the button starts fresh. */
  async function anew() {
    if (t.recorder) await t.recorder.stop().catch(() => null);
    t.recorder = null; A.data.buttonPic = null;
    navigator.vibrate?.([12, 50, 12]);
    A.dispatch({ type: 'discard' });
  }

  /**
   * ← while recording or paused: kept. The button is free at once (17.11.): the next tap starts the next take, it no
   * longer pauses a take that is still being written. Takes are saved one after another, in the order they were made.
   */
  let saving = Promise.resolve();
  function keep() {
    const rec = t.recorder, began = t.began, preview = t.preview;
    t.recorder = null;
    navigator.vibrate?.([15, 60, 15]);
    A.dispatch({ type: 'rec', to: 'idle' });
    const run = saving.then(async () => {
      const r = rec ? await rec.stop() : { video: null, audio: null, lengthMs: Date.now() - began };
      return save({ video: r.video, audio: r.audio, lengthMs: r.lengthMs, began, preview });
    });
    saving = run.catch(() => {});
    return run;
  }

  /**
   * One picture, kept at once (21.11.: ← or ↑ on the ready button, instead of the photo dot). Visual strand off: a take
   * of the other strands (its context) without a picture.
   */
  async function photo() {
    if (!A.st.strands.v) return save({ lengthMs: 0, began: Date.now(), preview: null });
    await openCamera();
    if (!t.camera) return A.shake('button');
    const picture = await snapshot(live);
    navigator.vibrate?.(8);
    const small = await stillOf(live).catch(() => null);
    return save({ picture, lengthMs: 0, began: Date.now(), preview: small });
  }

  async function save({ video = null, audio = null, picture = null, lengthMs, began, preview }) {
    const adding = t.addTo; t.addTo = null;
    if (adding) return addStrandSave(adding, { video, audio, lengthMs });
    const st = A.st, on = st.strands, answering = st.similar === 'single' ? A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === st.pick) : null;
    const context = on.x ? contextForTake(st.context, st.sticky) : '';
    // strands taken over from a result (21.11.): each kept by reference, per strand; the text only while it was not changed
    const from = A.data.takeFrom; A.data.takeFrom = null;
    const keep = from ? from.kinds.filter((k) => k !== 'x' || st.context === from.text) : [], kept = (k) => keep.includes(k);
    let saved;
    try {
      saved = await saveTake({ device: A.device, person: A.person, store: A.store, cell: here.now?.() ?? null, now: began, lengthMs, context: kept('x') ? '' : context,
        video: on.v && !kept('v') ? video : null, picture: on.v && !kept('v') ? picture : null, audio: on.a && !kept('a') ? audio : null, deviceKey: await sealKey(), preview: on.v && video && !kept('v') ? preview : null,
        ...(from && keep.length ? { onto: from.path, ontoStore: from.store, keep } : {}) });
    } catch (err) { console.warn('save', err); A.dispatch({ type: 'discard' }); return A.shake('button'); }
    const thumb = preview ? URL.createObjectURL(new Blob([preview], { type: 'image/jpeg' })) : null;
    const take = { id: saved.chain.path, ms: lengthMs, t: began, context, kinds: Object.keys(on).filter((k) => on[k]), thumb };
    if (thumb) A.data.thumbs[take.id] = thumb;
    const before = A.st.lines.length;
    A.dispatch({ type: 'took', take });
    A.data.buttonPic = null;
    // the series in the chain: the first take of a line is its own chain; the next ones lay onto the line (add-line.js)
    if (A.st.lines.length !== before || count(A.st) === 1) remember(A.st.lines.length - 1, saved.chain.path);
    else remember(A.st.lines.length - 1, (await addLine({ own: A.store, chainPath: t.lineChain, elements: [{ bytes: await A.store.read(saved.chain.path) }], device: A.device, person: A.person, deviceKey: await sealKey() }).catch(() => ({ chain: t.lineChain }))).chain);
    A.keepLines();
    if (answering) await answer(answering, saved.chain.path); // taken in the single view: one's own version, with a reference to that one (21.11.)
    await A.onboardTook(saved.paths, take);
    A.engine?.afterTake(saved.paths).catch(() => {});
    A.reindex();
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
   * A take taken in the single view (21.11.): a line of one's own with both, the result first – one's own version of
   * it, by reference; the other person's files stay where they are. → the line's chain (↑ then sends it to her)
   */
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

  return { here: () => here.now?.() ?? null, saveLine, lineWith, retext, addStrand, takeStrand, shareTake, shareElement, saveTemplate, setCamera: (stream) => { t.camera = stream; }, openCamera, start, pause, resume, keep, anew, photo, lastChain, get camera() { return t.camera; } };
}
