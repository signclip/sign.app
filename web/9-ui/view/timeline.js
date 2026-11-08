// view/timeline.js — a line / playlist stretched out: every element on one time axis, the strands as
// parallel threads in the same span (picture, sound, text), in real time while recording or streaming.
//
// Purpose:   the point is "now": everything before it is left, what comes is right; the threads move,
//            the point stays (Initial §8: the time stands at the height of the play button).
//              picture   frames along the thread (one per 500 ms)
//              sound     bars, one per 100 ms
//              text      chips at their 't( ) (Whisper per word), the one at "now" in --hl; words of one
//                        gesture (g) in one bubble that ends where the next gesture begins
//            element borders as gaps; elements from Similar / a template in blue (other), own in coral.
//            stretched (spread) = more pixels per ms to find a moment; slow hold zooms further.
// Depends:   chips.js (chipW)
// Test:      tests/view.test.mjs
// Limits:    0.12 px/ms (spread 0.3, scrub 0.8) on a 390 px phone; draws only what is within the screen.

import { chipW } from './chips.js';

export const ZOOM = { play: 0.12, spread: 0.3, scrub: 0.8 };

/**
 * items: [{ ms, own: true|false, levels: [0–1 per 100 ms], words: [{ text, t: [from, to], g: gesture n }] }] (t inside the
 * element) · timeMs: "now" on the whole line · sub: play | spread | scrub · cx, y (picture thread), k, w.
 * → shapes
 */
export function timelineShapes(items = [], { timeMs = 0, sub = 'play', cx, y, k = 1, w = 390 }) {
  const px = (ZOOM[sub] ?? ZOOM.play) * k, out = [];
  const X = (ms) => cx + (ms - timeMs) * px;
  const seen = (x, width = 0) => x + width >= 0 && x <= w;
  let start = 0;
  for (const [i, it] of items.entries()) {
    const x0 = X(start), x1 = X(start + it.ms), tone = it.own === false ? 'other' : 'own';
    if (seen(x0, x1 - x0)) {
      out.push({ type: 'line', x1: x0 + 2 * k, y1: y, x2: x1 - 2 * k, y2: y, cls: `thread ${tone}`, role: `line:${i}` });
      for (let ms = 0; ms < it.ms; ms += 500) { const x = X(start + ms); if (seen(x, 24 * k)) out.push({ type: 'thumb', x, y: y - 14 * k, s: Math.min(28 * k, (500 * px) - 4 * k), cls: `thumb ${tone}` }); }
      (it.levels ?? []).forEach((v, j) => { const x = X(start + j * 100); if (seen(x)) out.push({ type: 'line', x1: x, y1: y + 44 * k - (4 + 18 * v) * k / 2, x2: x, y2: y + 44 * k + (4 + 18 * v) * k / 2, cls: `bar ${tone}` }); });
      const gestures = new Map(); // one bubble per gesture: from its first word to its last, ends at the next
      for (const word of it.words ?? []) if (word.g != null) gestures.set(word.g, [...(gestures.get(word.g) ?? []), word]);
      for (const ws of gestures.values()) {
        if (ws.length < 2) continue;
        const bx = X(start + ws[0].t[0]) - 4 * k, last = ws.at(-1), bw = X(start + last.t[0]) + chipW(last.text, k) + 4 * k - bx;
        const now = timeMs >= start + ws[0].t[0] && timeMs < start + last.t[1];
        if (seen(bx, bw)) out.push({ type: 'bubble', x: bx, y: y + 70 * k, w: bw, h: 36 * k, cls: `bubble${now ? ' now' : ''}` });
      }
      for (const word of it.words ?? []) {
        const x = X(start + word.t[0]), now = timeMs >= start + word.t[0] && timeMs < start + word.t[1];
        if (seen(x, chipW(word.text, k))) out.push({ type: 'chip', x, y: y + 88 * k, w: chipW(word.text, k), h: 28 * k, text: word.text, cls: `chip ${now ? 'now' : timeMs >= start + word.t[1] ? tone : 'later'}`, role: `chip:${word.text}` });
      }
    }
    start += it.ms;
  }
  out.push({ type: 'line', x1: cx, y1: y - 24 * k, x2: cx, y2: y + 108 * k, cls: 'now-mark' });
  return out;
}

/** The whole length of a line in ms (for "past the end = live again"). */
export const lengthOf = (items) => items.reduce((a, it) => a + it.ms, 0);
