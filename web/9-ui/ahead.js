// ahead.js — what comes next is there before it is asked for, and one take goes into the next softly (21.11., user).
//
// Purpose:   ahead     the first results of Similar and the next takes of the line are read while the present one
//                      plays, so a tap starts at once. On with mobile data too; off only when the phone saves data
//                      (Data Saver: navigator.connection.saveData; iOS does not tell, there it stays on).
//                      27.11. (user): of a video far away only its first seconds are read ahead (stream.js FIRST =
//                      4 MiB ≈ 2 s); the rest comes while it plays (media.js). Everything else as before.
//            files     a small store of playable files (path → object URL), read once, the oldest let go: the
//                      cache that makes reading ahead count.
//            fade      when a video moves to another take, its last frame stays on a canvas above it and fades out
//                      once the next one shows (no black, no jump). Sound is not faded here.
// Depends:   browser for fade (canvas); the rest is plain and tested
// Test:      tests/ui.test.mjs (allowed, files, nextOf, firstOf)
// Limits:    AHEAD.similar = 3 results, AHEAD.line = 2 takes: of far videos 4 MiB each, so ≤ 12 MiB per page of
//            results (before 27.11.: whole files, a take ≈ 2 MB per second, 24–60 MB);
//            files keeps MAX = 10 (≈ 30–100 MB in memory), the one just used never goes · fade 250 ms, given up
//            after 1.5 s when the next one does not show.

import { limit, LIMITS } from '../1-model/limits.js';

export const AHEAD = { similar: LIMITS['ahead.similar'].value, line: LIMITS['ahead.line'].value }; // the preselection, 3 and 2; what counts: limit('ahead.similar'), limit('ahead.line')
export const MAX = LIMITS.ahead.value, FADE_MS = 250; // 10: the preselection; what counts: limit('ahead')

/** May the app read ahead now? (21.11., user: also with mobile data; not when the phone saves data) */
export const allowed = (nav = globalThis.navigator) => !nav?.connection?.saveData;

/** The next n takes after this one in its line (the line's order; none past its end). */
export function nextOf(takes, take, n = limit('ahead.line')) {
  const i = takes.findIndex((t) => t.id === take?.id);
  return i < 0 ? [] : takes.slice(i + 1, i + 1 + n);
}

/** The files of the first n results of Similar: [{ store, path }] (a person's pile: its first piece). */
export function firstOf(entries, n = limit('ahead.similar')) {
  return entries.slice(0, n).map((e) => e.at ?? (e.pieces?.[0] ? { store: e.pieces[0].from, path: e.pieces[0].path } : null)).filter(Boolean);
}

/**
 * Playable files, each read once: get(where) → Promise({ url, picture }). read(where) does the reading; at most max
 * kept, the least recently used goes and its URL is let go. ahead(list) starts reading without waiting.
 */
export function filesOf(read, { max = limit('ahead'), revoke = (u) => URL.revokeObjectURL(u) } = {}) {
  const kept = new Map(); // path → Promise, in order of last use
  function get(where) {
    const key = where.path;
    if (kept.has(key)) { const job = kept.get(key); kept.delete(key); kept.set(key, job); return job; }
    const job = Promise.resolve().then(() => read(where));
    kept.set(key, job);
    job.catch(() => kept.delete(key)); // not readable now (far away, offline): asked again next time
    while (kept.size > max) {
      const [oldest, old] = kept.entries().next().value;
      kept.delete(oldest);
      old.then((f) => f?.url && revoke(f.url), () => {});
    }
    return job;
  }
  let chain = Promise.resolve();
  const ahead = (list) => { for (const w of list) if (w && !kept.has(w.path)) chain = chain.then(() => get(w)).catch(() => {}); }; // one after another
  return { get, ahead, has: (where) => kept.has(where.path), get size() { return kept.size; } };
}

/** The present frame of video stays above it and fades when release() is called (or after 1.5 s). → release() */
export function fadeOver(video, { ms = FADE_MS } = {}) {
  const none = () => {};
  if (!video || video.hidden || video.readyState < 2 || !video.videoWidth || !video.parentElement) return none;
  const w = video.offsetWidth, h = video.offsetHeight, dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  if (!w || !h) return none;
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const s = Math.max(c.width / video.videoWidth, c.height / video.videoHeight); // object-fit: cover, like the video
  const dw = video.videoWidth * s, dh = video.videoHeight * s;
  try { c.getContext('2d').drawImage(video, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh); } catch { return none; }
  const cs = getComputedStyle(video);
  Object.assign(c.style, { position: 'absolute', left: `${video.offsetLeft}px`, top: `${video.offsetTop}px`, width: `${w}px`, height: `${h}px`,
    clipPath: cs.clipPath, borderRadius: cs.borderRadius, transform: cs.transform === 'none' ? '' : cs.transform, pointerEvents: 'none', transition: `opacity ${ms}ms ease` });
  video.after(c);
  let gone = false;
  const release = () => { if (gone) return; gone = true; c.style.opacity = '0'; setTimeout(() => c.remove(), ms + 50); };
  setTimeout(release, 1500);
  return release;
}

/** Resolves when the video shows a frame of its new file (or after 1.5 s). */
export function shown(video) {
  return new Promise((done) => {
    if (video.readyState >= 2 && !video.seeking) return done();
    const ok = () => { for (const e of ['loadeddata', 'seeked', 'playing', 'error']) video.removeEventListener(e, ok); done(); };
    for (const e of ['loadeddata', 'seeked', 'playing', 'error']) video.addEventListener(e, ok);
    setTimeout(ok, 1500);
  });
}
