// layout.js — where everything sits on the screen, as numbers only (no DOM): the take window with its three arcs,
// the button on the line, the context rows, Similar and the sharing menu.
//
// Purpose:   one spot for every position, so the drawing (paint.js) and the touches (touch.js) agree. The take window
//            has a form (form.js, 20.11.: circle · ellipse · rounded rectangle · rectangle, any aspect), as large as
//            the screen allows for it; around it, by degrees (0° = top, clockwise, as in the version until 16.11.):
//              line   −60…60   through the button (top), the takes of the line left and right of it
//              audio   60…140  right · context 140…220 bottom · visual 220…300 left (21.11.: no photo dot – ← on the ready button)
//            Older lines are small arcs under the line (between line and window), newest first.
//            Similar (21.11.): upright = above the take, wide = beside it; the take keeps its size at the bottom and
//            Similar the rest (similarShare: ≥ 1/φ³ = 23.6 %; phone 40 / 60 %) · double = both windows one
//            size · full = the cloud alone. The keyboard lifts the whole take until its typing row is visible.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    drawn for a 390 px phone, scaled by k = min(long side / 760, short side / 390) (the same upright and
//            across, 20.11.); ≤ 3 older lines drawn (more = "+n" mark);
//            ≤ 9 takes visible on the line at once (4 left, 4 right of the button), the rest scroll in.

import { fit, edge, curve, pathOf, along, cover, exponent, clampAspect, inside } from './form.js';

export const ARCS = Object.freeze({ line: [-60, 60], a: [60, 140], x: [140, 220], v: [220, 300] });
export const PHI = (1 + Math.sqrt(5)) / 2;
export const GAP = 3; // degrees left free between two arcs
export const LINE_SIDE = 4; // takes shown on each side of the button
export const OLD_LINES = 3;

const rad = (deg) => (deg * Math.PI) / 180;
/** A point at angle deg (0 = top, clockwise) and radius r around (cx, cy). */
export const polar = (cx, cy, r, deg) => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];

/** An SVG arc path from deg a to deg b at radius r. */
export function arcPath(cx, cy, r, a, b) {
  const [x0, y0] = polar(cx, cy, r, a), [x1, y1] = polar(cx, cy, r, b);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 ${Math.abs(b - a) > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Is the screen wide enough to put Similar beside the take (tablet across, desktop)? */
export const isWide = ({ w, h }) => w >= 700 && w > h * 1.15;

/** Similar's selection views at its top (paint-similar.js): px at k = 1. */
export const HEAD = 12; // 21.11.: the row of signs went (zoom zones, similar-zoom.js); a grip is left at the top
/**
 * Similar beside the take (21.11., user): t = the share of the screen (height; on a wide screen: width) the take needs
 * at the size it has alone. The take keeps that size and Similar gets the rest – on a 390 × 844 phone 40 / 60 %, near
 * the golden section (38.2 / 61.8 %); a flat window leaves Similar more. Never less than the next golden step
 * (1/φ³ = 23.6 %): only below that the take gets smaller (a tablet upright).
 */
export function similarShare(t) {
  return Math.max(1 / PHI ** 3, 1 - t);
}

/**
 * The take. size { w, h, keyboard (px covered at the bottom) } · similar: 'closed' | 'many' | 'double' | 'full' ·
 * form { round 0…1, aspect } · picture: the aspect of what the window shows (camera 1:1, a take, a file).
 * → { k, cx, cy, rx, ry, R (= ry), n, button: { x, y, r }, lineOff, nowOff, queueY, lift, scale, media,
 *     similarBox, doubleBox, double (the result's form in the double view) }
 */
export function takeLayout({ w, h, keyboard = 0 }, similar = 'closed', form = { round: 1, aspect: 1 }, picture = 1) {
  const k = Math.min(Math.max(w, h) / 760, Math.min(w, h) / 390);
  const ring = 42 * k; // the button's radius with its ring
  const room = { w: w - 2 * Math.max(25 * k, 14), h: h - 1.8 * ring - 76 * k - 12 }; // the line's ends, the button above, the row below
  const { rx: rx0, ry: ry0 } = fit(room, form.aspect);
  const wide = isWide({ w, h });
  const S = Math.min(room.w, room.h); // the 1:1 window: no form is larger, one side may be narrower (20.11.)
  const top = 1.8 * ring + 6, below = 76 * k + 12, side = (w - room.w) / 2; // the button above the window, the row under it, the line's ends
  let cx = w / 2, cy = top + S / 2 + Math.max(0, (room.h - S) / 2), scale = 1, similarBox = null, doubleBox = null, double = null;
  if (similar === 'many' || similar === 'double') {
    // 21.11. (user): the take keeps the size it has alone, at the very bottom with its row; Similar gets the rest, at
    // least 23.6 % (similarShare). Double: both windows the same size, as large as both fit.
    const n = exponent(form.round ?? 1);
    if (similar === 'many') {
      const share = similarShare((wide ? 2 * rx0 + 2 * side : top + 2 * ry0 + below) / (wide ? w : h));
      scale = Math.min(1, wide ? ((1 - share) * w - 2 * side) / (2 * rx0) : ((1 - share) * h - 6 - below) / (1.8 * ring + 2 * ry0));
      if (wide) { cx = share * w + ((1 - share) * w) / 2; similarBox = { x: 12 * k, y: 10 * k, w: share * w - 24 * k, h: h - 20 * k }; }
      else similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: share * h - 18 * k };
    } else if (wide) { // side by side at the same height: the double left, the take right
      const gap = 16 * k;
      scale = Math.min(1, (w - 26 * k - gap - 2 * side) / (4 * rx0), (h - 10 * k - HEAD * k - below) / (2 * ry0)); // 26 px left: the double's own arcs
      const left = 26 * k + Math.max(0, w - 26 * k - (4 * rx0 * scale + gap + 2 * side)) / 2;
      cx = left + 3 * rx0 * scale + gap + side;
      double = { cx: left + rx0 * scale, cy: h - below - ry0 * scale, rx: rx0 * scale, ry: ry0 * scale, n };
      similarBox = { x: 12 * k, y: 10 * k, w: cx - rx0 * scale - side - 20 * k, h: h - 20 * k };
    } else { // one above the other: the double under Similar's selection views, the take under it
      const gap = 14 * k;
      scale = Math.min(1, (h - 10 * k - HEAD * k - gap - 6 - below) / (4 * ry0 + 1.8 * ring));
      double = { cx: w / 2, cy: 10 * k + HEAD * k + ry0 * scale, rx: rx0 * scale, ry: ry0 * scale, n };
      similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: HEAD * k + 2 * ry0 * scale };
    }
    cy = h - below - ry0 * scale; // the window's lower edge where it is alone at the most (the row under it)
    if (double) doubleBox = { x: double.cx - double.rx, y: double.cy - double.ry, w: 2 * double.rx, h: 2 * double.ry };
  }
  if (keyboard && scale === 1) { // the keyboard is up (17.11.): the whole take stays in what is left, smaller if it must
    const need = 2 * ry0 + 1.8 * ring + 64 * k, room2 = h - keyboard - 6 * k;
    if (need > room2) scale = Math.max(0.4, (room2 - 64 * k) / (2 * ry0 + 1.8 * ring));
  }
  if (similar === 'full') { similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: h - 20 * k }; scale = 0; }
  const s = scale || 1, rx = rx0 * scale, ry = ry0 * scale, n = exponent(form.round);
  const queueY0 = cy + ry + 34 * k;
  const lift = keyboard ? Math.max(0, queueY0 + 26 * k - (h - keyboard)) : 0; // the typing row sits right above the keyboard
  const F = { cx, cy: cy - lift, rx, ry, n };
  const lineOff = ring * 0.8 * s; // through the button: it overlaps the window a little (08.11.)
  const [bx, by] = edge(F, 0, lineOff);
  return { k, cx, cy: F.cy, rx, ry, R: ry, n, aspect: clampAspect(form.aspect), round: form.round ?? 1, ring: ring * s, scale, wide, lift,
    button: { x: bx, y: by, r: 31 * k * s }, lineOff,
    nowOff: -24 * k * s, queueY: queueY0 - lift, media: cover(F, picture), similarBox, doubleBox, double };
}

/** The arcs of the take: strand arcs, the line arc and the older lines' small arcs, along the window's form. → [{ id, d, mid }] */
export function arcsOf(L, olderLines = 0) {
  const s = L.scale || 1, out = [], off = 7 * L.k * s;
  for (const kind of ['v', 'x', 'a']) {
    const [a, b] = ARCS[kind];
    out.push({ id: `strand:${kind}`, kind, d: pathOf(curve(L, a + GAP, b - GAP, off)), mid: edge(L, (a + b) / 2, off) });
  }
  out.push({ id: 'line', d: pathOf(curve(L, ARCS.line[0], ARCS.line[1], L.lineOff)), mid: edge(L, 0, L.lineOff) });
  for (let i = 0; i < Math.min(olderLines, OLD_LINES); i++) {
    const o = L.lineOff - (14 + 6 * i) * L.k * s, span = 46 - 6 * i;
    out.push({ id: `old:${i}`, d: pathOf(curve(L, -span, span, o)), mid: edge(L, 0, o) });
  }
  return out;
}

/**
 * The takes of the line around the button: index i (0 = oldest) and at (the button's spot, = takes.length when
 * recording new). Left = older (08.11.: the take just made goes left of the button). → [{ i, x, y, r }]
 */
export function lineSlots(L, count, at, shift = 0) {
  const s = L.scale || 1, step = slotPx(L), out = [], run = curve(L, -90, 90, L.lineOff, 120);
  for (let i = 0; i < count; i++) {
    const off = i - at + shift; // < 0 left of the button; shift = how far the finger pulled the line (in takes, 17.11.)
    const a = Math.abs(off);
    if (a < 0.02 || a > LINE_SIDE + 0.5) continue;
    const d = Math.sign(off) * (a < 1 ? step * 1.25 * a : step * (a + 0.25)); // along the line, through the button without a jump
    const p = along(run, d);
    out.push({ i, x: p.x, y: p.y, r: 15 * L.k * s * (a < 1 ? 0.7 + 0.3 * a : 1), off });
  }
  return out;
}
/** How many px along the line one take is (to turn a finger's way into takes): as on a circle of the window's height. */
export const slotPx = (L) => ((L.ry + L.lineOff) * 13 * Math.PI) / 180;

/**
 * The timeline inside the spread button (17.11.). take: { ms } · ms: the moment in the middle · → { span (ms across the
 * widest button), px (per ms), x(t) }: a short take fills the button, a long one runs through it.
 */
export function timeline(L, take, ms, zoom = 1) {
  const len = take?.ms ?? 0, base = ((2 * L.rx) / PHI) / Math.max(1500, len); // the whole clip as wide as the window ÷ φ (a short one: less)
  const px = base * Math.max(0.25, zoom);
  return { span: len, px, x: (t) => L.button.x + (t - ms) * px };
}

/**
 * The button spread across = the clip itself (20.11., user): as high as the button, as long as the clip at the time
 * scale (zoom = finer in time). The mark is the button's middle; the clip runs through it: at its beginning the pill's
 * left end lies where the button's left edge was (it grew to the right only), at its end its right end lies where the
 * button's right edge was. spread 0…1 = opening or closing (always back onto the button). → { x, y, w, h, full }
 */
/**
 * The empty button spread for its two times (calm.js, 20.11., user). Left: a little = a new take at once after each
 * one (the button gets a coloured ring), past the first catch = plus a countdown; right: past the catch = the stillness
 * after which a take ends. The same px per second on both sides (≤ 10 s each, fits beside the button).
 * times { restartMs (null = off, 0 = at once), stillEndMs (0 = off) } · f 0…1 = opening or closing
 * → { x, y, w, h, S (px per s), left, right, off (below = off), at (the catch), px(t, side), times(leftPx, rightPx) }
 */
export function timerPill(L, { restartMs = null, stillEndMs = 0 } = {}, f = 1) {
  const r = L.button.r, k = L.k, off = 6 * k, at = 26 * k, S = Math.max(4, Math.min(15 * k, (L.button.x - r - at - 8 * k) / 10));
  const px = (t, left) => (t == null || (!left && !t) ? 0 : left && !t ? (off + at) / 2 : at + (t / 1000) * S);
  const timeAt = (d) => Math.min(10000, Math.max(500, Math.round(((d - at) / S) * 2) * 500));
  const times = (lp, rp) => ({ restartMs: lp < off ? null : lp < at ? 0 : timeAt(lp), stillEndMs: rp < at ? 0 : timeAt(rp) });
  const left = px(restartMs, true) * f, right = px(stillEndMs, false) * f;
  return { x: L.button.x - r - left, y: L.button.y - r, w: 2 * r + left + right, h: 2 * r, S, left, right, off, at, px, times };
}

export function wideButton(L, spread, take = null, ms = 0, zoom = 1) {
  const r = L.button.r, h = 2 * r, f = Math.max(0, Math.min(1, spread));
  const tl = timeline(L, take, ms, zoom), full = (take?.ms ?? 0) * tl.px + h;
  const w = h + (full - h) * f;
  return { x: L.button.x - r - ms * tl.px * f, y: L.button.y - r, w, h, full };
}

/** The chips of the take now, along the bottom edge inside the window: a chip of width cw at index i of n. */
export function nowChipSpot(L, widths, i) {
  const total = widths.reduce((s, x) => s + x, 0) + 6 * (widths.length - 1);
  const before = widths.slice(0, i).reduce((s, x) => s + x, 0) + 6 * i + widths[i] / 2;
  const p = along(curve(L, 270, 90, L.nowOff, 120), before - total / 2); // from the left end over the bottom to the right
  return { x: p.x, y: p.y, rot: p.rot };
}

/** What belongs to the take under a finger: the window, its strands, the line, the button, the context row (20.11.). */
const TAKE_ROLES = /^(window|button|line|context|under|strand:|take:|old:|gap:|chip:|bubble:)/;
/**
 * Does a finger that went down at pt (role: what was under it) start on the take? The window and a band around it
 * (the strands, the line through the button: ring · 0.8 + 22 px), and the context row under it. Everything else —
 * above, below, beside on a tablet, Similar itself — is free: two fingers there zoom Similar open and shut (20.11.).
 */
export function onTake(L, pt, role = '') {
  if (TAKE_ROLES.test(role ?? '')) return true;
  if (!L || !pt || !(L.rx > 0)) return false; // Similar full: no take on the screen
  const band = L.ring * 0.8 + 22 * L.k;
  if (inside({ cx: L.cx, cy: L.cy, rx: L.rx, ry: L.ry, n: L.n }, pt.x, pt.y, band)) return true;
  return Math.abs(pt.y - L.queueY) < 24 * L.k && Math.abs(pt.x - L.cx) < L.rx + band;
}
