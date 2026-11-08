// camera.js — everything about the camera sits on the video strand itself (decision 08.11., 17.46):
//   ← / → on the video field  front / back
//   pinch on the live picture  zoom (where the camera allows it)
//   tap on the live picture    focus there (where the camera allows it)
//   double-tap the video field torch on / off (back camera)
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

/** Pointer gestures on an element: sideways swipe, pinch, tap. → detach(). */
export function onGestures(el, { swipe, pinch, tap, minPx = 50 }) {
  const pts = new Map();
  let start = null, spread = null;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = pts.size === 1 ? { x: e.clientX, y: e.clientY, at: performance.now() } : null; spread = pts.size === 2 ? dist() : null; };
  const move = (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (spread && pts.size === 2 && pinch) { const d = dist(); pinch(d / spread); spread = d; } };
  const up = (e) => {
    pts.delete(e.pointerId);
    if (!start || spread) { if (!pts.size) spread = null; return; }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > minPx && Math.abs(dx) > Math.abs(dy)) swipe?.(dx < 0 ? 'left' : 'right');
    else if (Math.hypot(dx, dy) < 10 && performance.now() - start.at < 300) { const r = el.getBoundingClientRect(); tap?.((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }
    start = null;
  };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
}
