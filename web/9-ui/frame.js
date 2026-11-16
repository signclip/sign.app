// frame.js — a small still picture of a video: the tiles of Similar and the line show it (16.11.).
//
// Purpose:   Android's WebView loads a <video> that is not on the page and not playing only as far as it likes (often
//            not at all), so a frame drawn from it stays black. Here the video sits on the page (invisible, 1 px),
//            plays muted until its first frame is there, is paused, drawn and removed. One at a time, so 40 tiles
//            never open 40 decoders at once. A failure goes into sign-debug.txt ('frame').
// Depends:   browser (document, canvas), debug.js
// Test:      needs a browser; the tiles that use it: tests/view.test.mjs
// Limits:    96 × 96 px JPEG ≈ 3 KB · at most 4 s per video, then null (the tile stays without picture).

import { note } from './debug.js';

let queue = Promise.resolve();

/** blob of a video → a data: URL of its first frame (square, middle), or null. */
export function firstFrame(blob, { size = 96, path = '' } = {}) {
  const run = queue.then(() => grab(blob, size, path));
  queue = run.catch(() => null);
  return run;
}

async function grab(blob, size, path) {
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
    const s = Math.min(v.videoWidth, v.videoHeight);
    if (!got || !s) { note({ method: 'frame', where: path, error: v.error ? `media error ${v.error.code}` : 'no frame in 4 s', ms: 0 }); return null; }
    const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
    c.getContext('2d').drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    v.remove(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url);
  }
}
