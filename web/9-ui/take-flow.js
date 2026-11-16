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
  const t = { camera: null, recorder: null, began: 0, preview: null, lineChain: null };

  async function openCamera() {
    if (t.camera) return t.camera;
    t.camera = await openDevices(navigator.mediaDevices, { facing: A.settings.facing }).catch(() => null);
    if (t.camera) { live.srcObject = t.camera; live.play?.().catch(() => {}); }
    return t.camera;
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

  /** ← while recording or paused: kept. */
  async function keep() {
    const r = t.recorder ? await t.recorder.stop() : { video: null, audio: null, lengthMs: Date.now() - t.began };
    t.recorder = null;
    navigator.vibrate?.([15, 60, 15]);
    return save({ video: r.video, audio: r.audio, lengthMs: r.lengthMs, began: t.began, preview: t.preview });
  }

  /** The photo dot is on: one tap = one picture, kept at once. */
  async function photo() {
    await openCamera();
    if (!t.camera) return A.shake('button');
    const picture = await snapshot(live);
    navigator.vibrate?.(8);
    const small = await stillOf(live).catch(() => null);
    return save({ picture, lengthMs: 0, began: Date.now(), preview: small });
  }

  async function save({ video = null, audio = null, picture = null, lengthMs, began, preview }) {
    const st = A.st, on = st.strands;
    const context = on.x ? contextForTake(st.context, st.sticky) : '';
    let saved;
    try {
      saved = await saveTake({ device: A.device, person: A.person, store: A.store, cell: here.now?.() ?? null, now: began, lengthMs, context,
        video: on.v ? video : null, picture: on.v ? picture : null, audio: on.a ? audio : null, deviceKey: await sealKey(), preview: on.v && video ? preview : null });
    } catch (err) { console.warn('save', err); A.dispatch({ type: 'discard' }); return A.shake('button'); }
    const thumb = preview ? URL.createObjectURL(new Blob([preview], { type: 'image/jpeg' })) : null;
    const take = { id: saved.chain.path, ms: lengthMs, t: began, context, kinds: Object.keys(on).filter((k) => on[k]), thumb };
    if (thumb) A.data.thumbs[take.id] = thumb;
    const before = A.st.lines.length;
    A.dispatch({ type: 'took', take });
    A.data.buttonPic = null;
    // the series in the chain: the first take of a line is its own chain; the next ones lay onto the line (add-line.js)
    if (A.st.lines.length !== before || count(A.st) === 1) t.lineChain = saved.chain.path;
    else t.lineChain = (await addLine({ own: A.store, chainPath: t.lineChain, elements: [{ bytes: await A.store.read(saved.chain.path) }], device: A.device, person: A.person, deviceKey: await sealKey() }).catch(() => ({ chain: t.lineChain }))).chain;
    A.keepLines();
    await A.onboardTook(saved.paths, take);
    A.engine?.afterTake(saved.paths).catch(() => {});
    A.reindex();
  }

  /** The chain of the line in force (↑ on the button shares it). */
  const lastChain = () => A.chosenChain?.() ?? t.lineChain;

  return { setCamera: (stream) => { t.camera = stream; }, openCamera, start, pause, resume, keep, anew, photo, lastChain, get camera() { return t.camera; } };
}
