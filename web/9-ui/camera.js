// camera.js — the camera, driven from the live picture (decision 08.11., 18.07):
//   ← / → front / back · pinch zoom · tap focus there · light as a chip (↑ on the video strand)
// Depends:   5-take/recorder (openDevices), browser (MediaStreamTrack capabilities)
// Test:      the gesture rows in tests/ui.test.mjs; the camera itself only on a device.
// Limits:    zoom/focus/torch depend on browser and phone (Chrome on Android: zoom and torch yes,
//            focus point partly); the native app (Capacitor) can do all three.

import { openDevices } from '../5-take/recorder.js';

const track = (stream) => stream.getVideoTracks()[0];
const caps = (stream) => track(stream)?.getCapabilities?.() ?? {};

/** Open the other camera. → new stream (the old one is stopped). */
export async function flip(stream, facing) {
  stream.getTracks().forEach((t) => t.stop());
  return openDevices(navigator.mediaDevices, { facing });
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
