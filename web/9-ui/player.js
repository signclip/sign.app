// player.js — an earlier take of the line in the take window (17.11.): shown, played, moved through, part by part.
//
// Purpose:   a take of the line may be a whole file, a cut (one part of a file) or a join (several parts, line.js
//            partsOf). This plays what the take really is: each part from its beginning to its end, one after another,
//            and tells the moment inside the take (ms) while it runs, so the timeline in the spread button follows.
//            show() without play = the picture at that moment (moving the timeline by hand). A photo shows as a still.
// Depends:   browser (the #replay video inside the window); line.js (partsOf, locate); media.js through A
// Test:      locate/partsOf in tests/ui.test.mjs; playing needs a browser (checked in Chrome with the test camera).
// Limits:    one take at a time · a part's end is met within one animation frame (≈ 16 ms, at half speed ≈ 8 ms of
//            the take) · files are read whole once (a 10 s take ≈ 3–10 MB), the next 2 takes of the line while one
//            plays, and kept among the last 10 (ahead.js) · a new take fades in over the last frame (250 ms).

import { partsOf, locate } from './line.js';
import { note as debugNote } from './debug.js';
import { nextOf, fadeOver, shown } from './ahead.js';

/** A black picture of 1 × 1 px: without any poster the Android WebView draws its own grey one with a play button. */
export const BLACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function playerOf(A, video) {
  const spots = new Map(); // take chain path → { store, path } of its picture or video (the file itself: A.media keeps the last few)
  let cur = null;

  const whereOf = (id) => {
    if (!spots.has(id)) {
      if (A.data.guestAt?.[id]) return A.data.guestAt[id]; // a result carried into the window: its file, wherever it lies
      const chain = A.chainAt?.(id) ?? [...(A.index?.tables.chains.values() ?? [])].find((c) => c.from?.path === id);
      const at = chain && A.media.visualOf(chain);
      if (!at) return null;
      spots.set(id, at);
    }
    return spots.get(id);
  };
  const fileOf = (id) => { const at = whereOf(id); return at ? A.media.playable(at).catch(() => null) : Promise.resolve(null); };
  /** The next takes of the line are read while this one plays (21.11., user; ahead.js). */
  const readNext = (take) => A.media.ahead?.(nextOf(A.st.lines.at(-1)?.takes ?? [], take).flatMap(partsOf).map((p) => whereOf(p.id)).filter(Boolean));
  const ready = () => new Promise((done) => {
    if (video.readyState >= 1) return done();
    const ok = () => { video.removeEventListener('loadedmetadata', ok); video.removeEventListener('error', ok); done(); };
    video.addEventListener('loadedmetadata', ok); video.addEventListener('error', ok);
    setTimeout(ok, 3000);
  });

  /** Back to the live picture. */
  function stop() {
    if (cur) cancelAnimationFrame(cur.raf);
    cur = null;
    video.onended = null;
    if (!video.paused) video.pause();
    if (video.dataset.take && video.dataset.take !== 'compare') { video.hidden = true; delete video.dataset.take; }
  }

  /**
   * Show the take at ms. play: it runs from there · rate: speed · onTime(ms): the moment while it runs ·
   * onEnd(): its last part ended. → true if there is a picture to show
   */
  async function show(take, ms = 0, { play = false, rate = 1, onTime = null, onEnd = null, muted = false } = {}) {
    if (cur) cancelAnimationFrame(cur.raf);
    const open = !(take.ms > 0); // length not known (a guest from Similar): it plays to its own end
    const parts = partsOf(take), where = open ? { i: 0, id: take.id, at: 0, start: 0 } : locate(take, Math.max(0, Math.min(take.ms ?? 0, ms)));
    const me = cur = { take, i: where.i, raf: 0, onTime, onEnd, rate, playing: play };
    const still = A.thumbOf?.(take) || A.data.thumbs?.[take.id] || BLACK;
    const release = video.dataset.take !== take.id || video.dataset.file !== where.id ? fadeOver(video) : () => {}; // the last frame fades into the next (21.11.)
    if (video.dataset.take !== take.id) { // another take (20.11.): its small picture at once, while its file is read – never the grey placeholder
      video.poster = still;
      if (video.getAttribute('src')) { video.removeAttribute('src'); delete video.dataset.file; video.load(); }
      video.dataset.take = take.id;
      video.hidden = false;
    }
    const f = await fileOf(where.id);
    if (cur !== me) { release(); return false; } // another call came meanwhile
    if (!f) { release(); stop(); return false; }
    if (f.picture) { video.removeAttribute('src'); video.poster = f.url; video.dataset.file = ''; video.load(); release(); return true; }
    if (video.dataset.file !== where.id) { video.poster = still; video.src = f.url; video.dataset.file = where.id; await ready(); if (cur !== me) { release(); return false; } }
    video.muted = muted; video.loop = false; video.playbackRate = rate;
    try { video.currentTime = where.at / 1000; } catch { /* not seekable yet */ }
    shown(video).then(release);
    if (!play) { if (!video.paused) video.pause(); return true; }
    video.setAttribute('playsinline', '');
    video.play().catch((err) => debugNote({ method: 'play', where: where.id, error: String(err?.message ?? err).slice(0, 200), ms: 0 }));
    readNext(take);
    const step = () => {
      if (cur !== me) return;
      const part = parts[me.i], start = parts.slice(0, me.i).reduce((n, p) => n + (p.to - p.from), 0);
      const t = video.currentTime * 1000;
      me.onTime?.(open ? t : Math.max(0, Math.min(take.ms ?? 0, start + t - part.from)));
      if ((!open && t >= part.to - 8) || video.ended) { // this part is through: the next one, or the end
        if (me.i + 1 < parts.length) { show(take, start + (part.to - part.from) + 1, { play: true, rate, onTime, onEnd, muted }); return; }
        video.pause(); me.playing = false; me.onEnd?.(); return;
      }
      me.raf = requestAnimationFrame(step);
    };
    me.raf = requestAnimationFrame(step);
    return true;
  }

  const pause = () => { if (cur) { cancelAnimationFrame(cur.raf); cur.playing = false; } if (!video.paused) video.pause(); };

  return { show, stop, pause, get playing() { return Boolean(cur?.playing) && !video.paused; }, get take() { return cur?.take ?? null; } };
}
