// camera.js — the camera, driven from the live picture (decision 08.11., 18.07):
//   ← / → front / back · pinch zoom · tap focus there · light as a chip (↑ on the video strand)
//   Opened at 1× (20.11.), never wide angle: the main lens of that side (not ultra wide, tele or a lens-switching
//   "dual/triple" device), zoom 1 (on a lens-switching device of an iPhone the main lens sits at zoom 2).
// Depends:   5-take/recorder (openDevices), browser (MediaStreamTrack capabilities)
// Test:      the gesture rows in tests/ui.test.mjs; the camera itself only on a device.
// Limits:    zoom/focus/torch depend on browser and phone (Chrome on Android: zoom and torch yes,
//            focus point partly); the native app (Capacitor) can do all three. Device names are only readable after the
//            camera was allowed once; before that the browser's own choice stays (then only zoom 1 is set).

import { openDevices } from '../5-take/recorder.js';
import { constraints } from '../5-take/settings.js';

const track = (stream) => stream.getVideoTracks()[0];
const caps = (stream) => track(stream)?.getCapabilities?.() ?? {};

/** Open the other camera. → new stream (the old one is stopped). */
export async function flip(stream, facing) {
  stream.getTracks().forEach((t) => t.stop());
  return openDevices(navigator.mediaDevices, { facing });
}

/** Only the picture changes camera; the sound track stays (a take goes on, its sound unbroken). */
export async function flipPicture(stream, facing) {
  const { video } = constraints({ facing });
  const fresh = await navigator.mediaDevices.getUserMedia({ video });
  stream.getVideoTracks().forEach((t) => t.stop());
  return new MediaStream([...fresh.getVideoTracks(), ...stream.getAudioTracks()]);
}

/** Zoom by a pinch factor (1 = unchanged), kept within what the camera allows. */
export async function zoomBy(stream, factor) {
  const c = caps(stream).zoom;
  if (!c) return false;
  const now = track(stream).getSettings().zoom ?? c.min;
  await track(stream).applyConstraints({ advanced: [{ zoom: Math.min(c.max, Math.max(c.min, now * factor)) }] });
  return true;
}

/** Focus at a point of the picture (x, y from 0 to 1). */
export async function focusAt(stream, x, y) {
  if (!caps(stream).focusMode?.includes?.('single-shot')) return false;
  await track(stream).applyConstraints({ advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }] });
  return true;
}

/** Torch on/off (back camera). */
export async function torch(stream, on) {
  if (!caps(stream).torch) return false;
  await track(stream).applyConstraints({ advanced: [{ torch: on }] });
  return true;
}

const BACK = /back|rück|rear|environment|hinten/i, FRONT = /front|user|vorder|facetime/i;
const NOT_MAIN = /ultra|tele|dual|triple|dreifach|weitwinkel|wide|desk|depth|ir\b/i;

/**
 * The main lens of a side among the devices (enumerateDevices). Android names them "camera2 0, facing back": the lowest
 * number is the main lens; an iPhone names them "Back Camera", "Back Ultra Wide Camera" … (in the phone's language).
 * → deviceId or null (no names yet, or nothing recognisable: the browser's choice stays)
 */
export function mainCamera(devices, facing = 'user') {
  const side = facing === 'environment' ? BACK : FRONT;
  const cams = (devices ?? []).filter((d) => d.kind === 'videoinput' && d.label && side.test(d.label));
  const android = cams.map((d) => ({ d, n: Number(/camera2 (\d+)/.exec(d.label)?.[1]) })).filter((x) => Number.isFinite(x.n));
  if (android.length) return android.sort((a, b) => a.n - b.n)[0].d.deviceId;
  const plain = cams.filter((d) => !NOT_MAIN.test(d.label)).sort((a, b) => a.label.length - b.label.length);
  return plain[0]?.deviceId ?? null;
}

/** The zoom that means 1× for a track: 1, or 2 on an iPhone device that switches lenses (its 1 is the ultra wide). → number or null */
export function normalZoom(capabilities, label = '') {
  const z = capabilities?.zoom;
  if (!z || !Number.isFinite(z.min) || !Number.isFinite(z.max)) return null;
  const want = /triple|dual wide|dreifach|dual-weitwinkel/i.test(label) ? 2 : 1;
  return Math.min(z.max, Math.max(z.min, want));
}

/** After opening: the main lens of that side at 1×. The sound track stays. → the stream (a new one if the lens changed) */
export async function mainLens(stream, facing = 'user', md = navigator.mediaDevices) {
  let s = stream;
  const t = track(s);
  if (!t) return s;
  const want = mainCamera(await md.enumerateDevices().catch(() => []), facing);
  if (want && want !== t.getSettings?.().deviceId) {
    const { video } = constraints({ facing });
    delete video.facingMode;
    const fresh = await md.getUserMedia({ video: { ...video, deviceId: { exact: want } } }).catch(() => null);
    if (fresh) { t.stop(); s = new MediaStream([...fresh.getVideoTracks(), ...s.getAudioTracks()]); }
  }
  const v = track(s), z = normalZoom(v.getCapabilities?.() ?? {}, v.label);
  if (z != null) await v.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
  return s;
}
