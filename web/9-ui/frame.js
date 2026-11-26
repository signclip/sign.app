// frame.js — a small still picture of a video: the tiles of Similar and the line show it (16.11.).
//
// Purpose:   Android's WebView loads a <video> that is not on the page and not playing only as far as it likes (often
//            not at all), so a frame drawn from it stays black. Here the video sits on the page (invisible, 1 px),
//            plays muted until its first frame is there, is paused, drawn and removed. One at a time, so 40 tiles
//            never open 40 decoders at once. A failure goes into sign-debug.txt ('frame').
//            26.11. (user: small pictures were black): a frame is taken at any moment of the video (the right half of
//            a cut shows the picture at the cut), and a frame that came out dark is not believed at once – a camera's
//            first frames and a video that has not drawn yet are black: the next frame is tried (DARK_TRIES), only
//            then the dark one is kept; `dark` tells the caller, who does not store it for good.
// Depends:   browser (document, canvas), debug.js
// Test:      isDark in tests/ui.test.mjs; the rest needs a browser; the tiles that use it: tests/view.test.mjs
// Limits:    96 × 96 px JPEG ≈ 3 KB · at most 4 s per video, then null (the tile stays without picture) · dark = mean
//            brightness < DARK of 255 over 256 sampled points; ≤ DARK_TRIES later frames, 150 ms apart.

import { note } from './debug.js';

export const DARK = 10, DARK_TRIES = 3;
let queue = Promise.resolve();

/** Is a picture (RGBA bytes, as canvas getImageData gives them) dark all over? Sampled: every step-th point. */
export function isDark(rgba, limit = DARK) {
  const n = Math.floor((rgba?.length ?? 0) / 4);
  if (!n) return true;
  const step = Math.max(1, Math.floor(n / 256));
  let sum = 0, count = 0;
  for (let i = 0; i < n; i += step) { sum += 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]; count += 1; }
  return sum / count < limit;
}

/** The middle square of what a video shows now, on a canvas of size × size. → { canvas, dark } or null */
function draw(video, size) {
  const s = Math.min(video?.videoWidth ?? 0, video?.videoHeight ?? 0);
  if (!s) return null;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, size, size);
  let dark = false;
  try { dark = isDark(g.getImageData(0, 0, size, size).data); } catch { /* a picture from elsewhere: not readable, taken as it is */ }
  return { canvas: c, dark };
}
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * blob of a video → its frame at `at` seconds (0 = the first) as a data: URL (square, middle), or null.
 * → Promise(url | null); the resolved url carries no flag – ask frameOf for { url, dark }.
 */
export function firstFrame(blob, options = {}) {
  return frameOf(blob, options).then((f) => f?.url ?? null);
}

/** As firstFrame, but → { url, dark } (dark: every frame tried was dark – a night take, or a file that does not draw). */
export function frameOf(blob, { size = 96, path = '', at = 0 } = {}) {
  const run = queue.then(() => grab(blob, size, path, at));
  queue = run.catch(() => null);
  return run;
}

async function grab(blob, size, path, at) {
  const url = URL.createObjectURL(blob);
  const v = Object.assign(document.createElement('video'), { src: url, muted: true, playsInline: true, preload: 'auto' });
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
  document.body.append(v);
  try {
    const ready = new Promise((done) => {
      const ok = () => { if (v.videoWidth && v.readyState >= 2) done(true); };
      v.onloadeddata = ok; v.ontimeupdate = ok; v.onplaying = ok; v.onerror = () => done(false);
      setTimeout(() => done(false), 4000);
    });
    v.play().catch(() => {}); // muted: allowed without a touch; it makes the WebView load the data
    const got = await ready;
    v.pause();
    if (!got || !Math.min(v.videoWidth, v.videoHeight)) { note({ method: 'frame', where: path, error: v.error ? `media error ${v.error.code}` : 'no frame in 4 s', ms: 0 }); return null; }
    if (at > 0) await seek(v, at);
    let shot = draw(v, size);
    for (let i = 0; shot?.dark && i < DARK_TRIES; i++) { // dark: not drawn yet, or the camera's first frames – a little further on
      v.play().catch(() => {});
      await wait(150);
      v.pause();
      shot = draw(v, size) ?? shot;
    }
    if (!shot) return null;
    if (shot.dark) note({ method: 'frame', where: path, error: 'dark frame', ms: 0 });
    return { url: shot.canvas.toDataURL('image/jpeg', 0.8), dark: shot.dark };
  } finally {
    v.remove(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url);
  }
}

/** Move a paused video to a moment and wait until it shows it (≤ 1.5 s). A recording without a known length seeks too. */
function seek(v, at) {
  return new Promise((done) => {
    const ok = () => { v.removeEventListener('seeked', ok); done(); };
    v.addEventListener('seeked', ok);
    setTimeout(ok, 1500);
    try { v.currentTime = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(at, Math.max(0, v.duration - 0.05)) : at; } catch { ok(); }
  });
}

/**
 * The picture a <video> shows right now → JPEG bytes (square, middle) or null: the wake of a take as it starts.
 * A dark picture (the camera just opened) is tried again up to `tries` times, `gap` ms apart; then it is taken as it is.
 */
export async function stillOf(video, size = 96, { tries = DARK_TRIES, gap = 250 } = {}) {
  let shot = draw(video, size);
  for (let i = 0; shot?.dark && i < tries; i++) { await wait(gap); shot = draw(video, size) ?? shot; }
  if (!shot) return null;
  const blob = await new Promise((done) => shot.canvas.toBlob(done, 'image/jpeg', 0.8));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
