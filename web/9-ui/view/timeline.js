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
 * items: [{ ms, own: true|false, levels: [0–1 per 100 ms], words: [{ text, t: [from, to], g: gesture n }] }]
 * (t inside the element) · timeMs: "now" on the whole line · sub: play | spread | scrub · zoom (× px/ms, 0.25–8) · cx, y (picture
 * thread), k, w. → shapes
 */
export function timelineShapes(items = [], { timeMs = 0, sub = 'play', zoom = 1, cx, y, k = 1, w = 390 }) {
  const t = {
    k, y, w, timeMs,
    px: (ZOOM[sub] ?? ZOOM.play) * k * zoom, // pixels per millisecond; zoom = two fingers side by side on the point (14.11.)
    X: (ms) => cx + (ms - timeMs) * t.px, // where a moment of the line is on the screen
    seen: (x, width = 0) => x + width >= 0 && x <= w, // draw only what is on the screen
    out: [],
  };
  let start = 0; // where the element begins on the whole line
  for (const [i, item] of items.entries()) {
    const tone = item.own === false ? 'other' : 'own';
    const x0 = t.X(start);
    const x1 = t.X(start + item.ms);
    if (t.seen(x0, x1 - x0)) {
      t.out.push({ type: 'line', x1: x0 + 2 * k, y1: y, x2: x1 - 2 * k, y2: y, cls: `thread ${tone}`, role: `line:${i}` });
      frames(t, item, start, tone);
      bars(t, item, start, tone);
      gestureBubbles(t, item, start);
      words(t, item, start, tone);
    }
    start += item.ms;
  }
  t.out.push({ type: 'line', x1: cx, y1: y - 24 * k, x2: cx, y2: y + 108 * k, cls: 'now-mark' });
  return t.out;
}

/** Picture: one frame per 500 ms along the thread. */
function frames(t, item, start, tone) {
  const size = Math.min(28 * t.k, 500 * t.px - 4 * t.k);
  for (let ms = 0; ms < item.ms; ms += 500) {
    const x = t.X(start + ms);
    if (t.seen(x, size)) t.out.push({ type: 'thumb', x, y: t.y - 14 * t.k, s: size, cls: `thumb ${tone}` });
  }
}

/** Sound: one bar per 100 ms under the picture. */
function bars(t, item, start, tone) {
  const mid = t.y + 44 * t.k;
  (item.levels ?? []).forEach((level, j) => {
    const x = t.X(start + j * 100);
    const half = ((4 + 18 * level) * t.k) / 2;
    if (t.seen(x)) t.out.push({ type: 'line', x1: x, y1: mid - half, x2: x, y2: mid + half, cls: `bar ${tone}` });
  });
}

/** Text: words of one gesture (g) in one bubble from its first to its last word, it ends at the next gesture. */
function gestureBubbles(t, item, start) {
  const byGesture = new Map();
  for (const word of item.words ?? []) {
    if (word.g == null) continue;
    byGesture.set(word.g, [...(byGesture.get(word.g) ?? []), word]);
  }
  for (const list of byGesture.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    const last = list.at(-1);
    const x = t.X(start + first.t[0]) - 4 * t.k;
    const width = t.X(start + last.t[0]) + chipW(last.text, t.k) + 4 * t.k - x;
    const lit = t.timeMs >= start + first.t[0] && t.timeMs < start + last.t[1];
    if (t.seen(x, width)) t.out.push({ type: 'bubble', x, y: t.y + 70 * t.k, w: width, h: 36 * t.k, cls: `bubble${lit ? ' now' : ''}` });
  }
}

/** Text: each word at its 't( ); the one at "now" in --hl, past full, coming pale. */
function words(t, item, start, tone) {
  for (const word of item.words ?? []) {
    const x = t.X(start + word.t[0]);
    const width = chipW(word.text, t.k);
    if (!t.seen(x, width)) continue;
    const from = start + word.t[0];
    const to = start + word.t[1];
    const state = t.timeMs >= from && t.timeMs < to ? 'now' : t.timeMs >= to ? tone : 'later';
    t.out.push({ type: 'chip', x, y: t.y + 88 * t.k, w: width, h: 28 * t.k, text: word.text, cls: `chip ${state}`, role: `chip:${word.text}` });
  }
}

/** The whole length of a line in ms (for "past the end = live again"). */
export const lengthOf = (items) => items.reduce((sum, item) => sum + item.ms, 0);
