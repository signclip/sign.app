// layout.js — where everything sits on the screen, as numbers only (no DOM): the take window with its three arcs,
// the button on the line, the photo dot, the context rows, Similar and the sharing menu.
//
// Purpose:   one spot for every position, so the drawing (paint.js) and the touches (touch.js) agree. The take window
//            has a form (form.js, 20.11.: circle · ellipse · rounded rectangle · rectangle, any aspect), as large as
//            the screen allows for it; around it, by degrees (0° = top, clockwise, as in the version until 16.11.):
//              line   −60…60   through the button (top), the takes of the line left and right of it
//              audio   60…140  right · context 140…220 bottom · visual 220…300 left, the photo dot at its upper end
//            Older lines are small arcs under the line (between line and window), newest first.
//            Similar (16.11.): phone upright = above the take, the take smaller at the bottom; wide (tablet across) =
//            beside it; full = the cloud alone. The keyboard lifts the whole take until its typing row is visible.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    drawn for a 390 px phone, scaled by k = min(long side / 760, short side / 390) (the same upright and
//            across, 20.11.); ≤ 3 older lines drawn (more = "+n" mark);
//            ≤ 9 takes visible on the line at once (4 left, 4 right of the button), the rest scroll in.

import { fit, edge, curve, pathOf, along, cover, exponent, clampAspect, shapeIn, inside } from './form.js';

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

/**
 * The take. size { w, h, keyboard (px covered at the bottom) } · similar: 'closed' | 'many' | 'double' | 'full' ·
 * form { round 0…1, aspect } · picture: the aspect of what the window shows (camera 1:1, a take, a file).
 * → { k, cx, cy, rx, ry, R (= ry), n, button: { x, y, r }, lineOff, photo, nowOff, queueY, lift, scale, media,
 *     similarBox, doubleBox, double (the result's form in the double view) }
 */
export function takeLayout({ w, h, keyboard = 0 }, similar = 'closed', form = { round: 1, aspect: 1 }, picture = 1) {
  const k = Math.min(Math.max(w, h) / 760, Math.min(w, h) / 390);
  const ring = 42 * k; // the button's radius with its ring
  const room = { w: w - 2 * Math.max(25 * k, 14), h: h - 1.8 * ring - 76 * k - 12 }; // the line's ends, the button above, the row below
  const { rx: rx0, ry: ry0 } = fit(room, form.aspect);
  const wide = isWide({ w, h });
  const S = Math.min(room.w, room.h); // the 1:1 window: no form is larger, one side may be narrower (20.11.)
  let cx = w / 2, cy = 1.8 * ring + 6 + S / 2 + Math.max(0, (room.h - S) / 2), scale = 1, similarBox = null, doubleBox = null, double = null;
  if (similar === 'many' || similar === 'double') {
    if (wide) { // beside: the take right, Similar left
      cx = w * 0.72; scale = Math.min(1, (w * 0.5) / (2 * rx0 + 60 * k), (h - 1.8 * ring - 90 * k) / (2 * ry0));
      cy = h / 2 + ring / 2;
      similarBox = { x: 12 * k, y: 12 * k, w: w * 0.44 - 12 * k, h: h - 24 * k };
    } else { // above: the take smaller, low
      scale = Math.min(0.62, (h * 0.42) / (2 * ry0 + 1.8 * ring));
      cy = h - (ry0 * scale) - 70 * k;
      similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: cy - ry0 * scale - ring * scale * 2 - 18 * k };
    }
    if (similar === 'double') { double = shapeIn(squareIn(similarBox, 0.92), form); doubleBox = { x: double.cx - double.rx, y: double.cy - double.ry, w: 2 * double.rx, h: 2 * double.ry }; } // the same form as the take (20.11.)
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
  const [bx, by] = edge(F, 0, lineOff), [px, py] = edge(F, ARCS.v[1] + 4, 7 * k * s);
  return { k, cx, cy: F.cy, rx, ry, R: ry, n, aspect: clampAspect(form.aspect), round: form.round ?? 1, ring: ring * s, scale, wide, lift,
    button: { x: bx, y: by, r: 31 * k * s }, lineOff, photo: { x: px, y: py, r: 8 * k * s },
    nowOff: -24 * k * s, queueY: queueY0 - lift, media: cover(F, picture), similarBox, doubleBox, double };
}

/** The biggest square of share f inside a box, centred. */
export function squareIn(box, f = 1) {
  const s = Math.min(box.w, box.h) * f;
  return { x: box.x + (box.w - s) / 2, y: box.y + (box.h - s) / 2, w: s, h: s };
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
export function timeline(L, take, ms) {
  const span = Math.max(2000, Math.min(6000, (take?.ms ?? 0) * 1.4));
  const px = ((2 * L.rx) / PHI) / span;
  return { span, px, x: (t) => L.button.x + (t - ms) * px };
}

/** The button spread across (16.11.): a pill as high as the button, as wide as the window ÷ φ at most. → { x, y, w, h } */
export function wideButton(L, spread) {
  const h = 2 * L.button.r, max = Math.max(h, (2 * L.rx) / PHI);
  const w = h + (max - h) * Math.max(0, Math.min(1, spread));
  return { x: L.button.x - w / 2, y: L.button.y - h / 2, w, h, max };
}

/** The chips of the take now, along the bottom edge inside the window: a chip of width cw at index i of n. */
export function nowChipSpot(L, widths, i) {
  const total = widths.reduce((s, x) => s + x, 0) + 6 * (widths.length - 1);
  const before = widths.slice(0, i).reduce((s, x) => s + x, 0) + 6 * i + widths[i] / 2;
  const p = along(curve(L, 270, 90, L.nowOff, 120), before - total / 2); // from the left end over the bottom to the right
  return { x: p.x, y: p.y, rot: p.rot };
}

/** What belongs to the take under a finger: the window, its strands, the line, the button, the context row (20.11.). */
const TAKE_ROLES = /^(window|button|photo|line|context|under|strand:|take:|old:|gap:|chip:|bubble:)/;
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
