// form.js — the form of the take window (20.11.): circle, ellipse, rounded rectangle, rectangle; and how a picture of
// any other format fits into it. Numbers only, no DOM.
//
// Purpose:   one formula for every form, a superellipse |x/a|ⁿ + |y/b|ⁿ = 1 around the window's middle:
//              round 1 → n = 2 (circle at aspect 1, ellipse otherwise) · round 0 → n = 12 (rectangle, soft corners)
//            so the window, its clip and the arcs around it are always the same curve, at every size.
//            Size (20.11., user): never larger than the 1:1 window, the greatest square the room between the button
//            above and the row below allows; one side can get narrower (aspect < 1: narrower, > 1: lower).
//            A picture inside (the live camera, always 1:1; a take; an imported file of any format) is placed as
//            large as needed to fill the window completely and no larger (cover). Only what lies inside the window
//            is seen (20.11., user): everything around it is hidden, never greyed or cut off at a corner.
//            The form by hand (20.11., user): standard is the 1:1 rectangle. Two fingers slanted = corners only
//            (together rounder up to the circle, apart back to the rectangle); side by side = width, one above the
//            other = height (narrower and back to full). One side always keeps the full 1:1 size; the aspect snaps
//            to the picture's own format and to 1:1 within SNAP. The same form frames the result in Similar's
//            double view and the takes on the line.
//            No visible corners (20.11., user): the outline is sampled along the curve's own parameter, so its
//            points crowd where it bends (the corners of a rounded rectangle) and lie wide where it is straight.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    aspect 0.4 … 2.5 (9:16 = 0.56 and 16:9 = 1.78 inside, 21:9 = 2.33 too); 96 points per outline,
//            chord error < 0.3 px for a window of 800 px at every roundness (test); the offset curve (arcs) is
//            approximated by growing both half-axes by the offset (error < 1 px for offsets ≤ 40 px).

export const ASPECT = Object.freeze([0.4, 2.5]);
export const SNAP = 0.06;
export const STEPS = 96;

export const clampAspect = (a) => Math.max(ASPECT[0], Math.min(ASPECT[1], Number.isFinite(a) && a > 0 ? a : 1));
/** The superellipse exponent of a roundness 0…1. */
export const exponent = (round) => 2 + (1 - Math.max(0, Math.min(1, round ?? 1))) * 10;

/**
 * The window's size for an aspect inside the room: at most the greatest square, one side narrower.
 * room { w, h } (px the window may use) → { rx, ry } (half-axes)
 */
export function fit(room, aspect) {
  const a = clampAspect(aspect), S = Math.min(room.w, room.h);
  return { rx: (S / 2) * Math.min(1, a), ry: (S / 2) * Math.min(1, 1 / a) };
}

/** The form inside a box (Similar's double view, a take on the line): the box's square, one side narrower. */
export function shapeIn(box, form = {}) {
  const { rx, ry } = fit(box, form.aspect ?? 1);
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx, ry, n: exponent(form.round ?? 1) };
}

/**
 * Two fingers change the form, in proportion to how they lie (20.11., user). Slanted = corners only: together rounder
 * up to the circle, apart back to the rectangle; the aspect stays. Side by side = the width, one above the other =
 * the height, each between 40 % and full. One side always keeps the full 1:1 size: only the narrow side moves (at 1:1
 * the one pulled more); spread back it rests at 1:1, and from there the other side can get narrower.
 * form: at the start of the gesture · factor = the fingers' distance now ÷ at the start · fx, fy = the same across
 * and up-down · angle = how steep the fingers lay at the start (0 side by side … 90 one above the other)
 * → { round, aspect }
 */
export function formBy(form, factor, { fx = 1, fy = 1, angle = 45 } = {}) {
  const t = (angle * Math.PI) / 180, diag = 1 - Math.abs(Math.cos(2 * t)); // 1 at 45°, 0 side by side or one above the other
  const a0 = clampAspect(form.aspect ?? 1), r0 = Math.max(0, Math.min(1, form.round ?? 1));
  const round = Math.max(0, Math.min(1, r0 - Math.log(factor) * diag * 1.8)); // together (factor < 1) = rounder
  const lx = Math.cos(t) ** 2 * (1 - diag) * Math.log(fx), ly = Math.sin(t) ** 2 * (1 - diag) * Math.log(fy);
  const share = (s0, l) => Math.max(1 / ASPECT[1], Math.min(1, s0 * Math.exp(l))); // one side: 40 % … full
  const across = a0 < 1 || (a0 === 1 && Math.abs(lx) >= Math.abs(ly)); // the width moves (else the height)
  return { round, aspect: clampAspect(across ? share(a0, lx) : 1 / share(1 / a0, ly)) };
}

/** The point of the outline at angle deg (0 = top, clockwise), off px outside it. → [x, y] */
export function edge(F, deg, off = 0) {
  const t = (deg * Math.PI) / 180, dx = Math.sin(t), dy = -Math.cos(t);
  const a = F.rx + off, b = F.ry + off, n = F.n ?? 2;
  if (a <= 0 || b <= 0) return [F.cx, F.cy];
  const r = (Math.abs(dx / a) ** n + Math.abs(dy / b) ** n) ** (-1 / n);
  return [F.cx + r * dx, F.cy + r * dy];
}

/**
 * The curve's own parameter φ (degrees, 0 = top, clockwise) of the point seen at angle deg from the middle:
 * x = A·sin φ^(2/n), y = −B·cos φ^(2/n) (signed powers). Even steps in φ crowd where the outline bends.
 */
function phiOf(A, B, n, deg) {
  const t = (deg * Math.PI) / 180, M = Math.max(A, B), s = Math.sin(t), c = Math.cos(t);
  const p = (Math.atan2(Math.sign(s) * ((B / M) * Math.abs(s)) ** (n / 2), Math.sign(c) * ((A / M) * Math.abs(c)) ** (n / 2)) * 180) / Math.PI;
  return p + 360 * Math.round((deg - p) / 360); // continuous with deg (360 stays 360)
}

/** Points of the outline from deg a to deg b (clockwise), off px outside, sampled along φ. → [[x, y]] */
export function curve(F, a, b, off = 0, steps) {
  const A = F.rx + off, B = F.ry + off, n = F.n ?? 2;
  if (A <= 0 || B <= 0) return [[F.cx, F.cy], [F.cx, F.cy]];
  const p0 = phiOf(A, B, n, a), p1 = phiOf(A, B, n, b), k = steps ?? Math.max(8, Math.round((Math.abs(p1 - p0) / 360) * STEPS));
  const out = [];
  for (let i = 0; i <= k; i++) {
    const r = ((p0 + ((p1 - p0) * i) / k) * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
    out.push([F.cx + A * Math.sign(s) * Math.abs(s) ** (2 / n), F.cy - B * Math.sign(c) * Math.abs(c) ** (2 / n)]);
  }
  return out;
}

/** An SVG path through points (closed with Z if asked). */
export const pathOf = (pts, close = false) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}${close ? 'Z' : ''}`;

/** The whole outline as a path (for the clip and the outline), relative to (ox, oy) if given. */
export function outline(F, off = 0, ox = 0, oy = 0) {
  return pathOf(curve(F, 0, 360, off, STEPS).slice(0, -1).map(([x, y]) => [x - ox, y - oy]), true);
}

/** Is (x, y) inside the outline grown by pad px? */
export function inside(F, x, y, pad = 0) {
  const a = F.rx + pad, b = F.ry + pad, n = F.n ?? 2;
  return a > 0 && b > 0 && Math.abs((x - F.cx) / a) ** n + Math.abs((y - F.cy) / b) ** n <= 1;
}

/**
 * Walk along points by length: the spot s px from the middle of the run (negative = before it).
 * → { x, y, rot (degrees of the run's direction there) }
 */
export function along(pts, s) {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len.at(-1), want = Math.max(0, Math.min(total, total / 2 + s));
  let i = 1;
  while (i < len.length - 1 && len[i] < want) i++;
  const f = (want - len[i - 1]) / ((len[i] - len[i - 1]) || 1), [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, rot: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
}

/**
 * The picture inside the window: as large as needed to cover it, centred (the least lies outside).
 * F: { cx, cy, rx, ry } · aspect: the picture's width ÷ height → { x, y, w, h }
 */
export function cover(F, aspect = 1) {
  const a = aspect > 0 ? aspect : 1, W = 2 * F.rx, H = 2 * F.ry;
  const w = Math.max(W, H * a), h = w / a;
  return { x: F.cx - w / 2, y: F.cy - h / 2, w, h };
}

/** Share of the picture that lies outside the window's box (0 = window and picture have one format). */
export const outsideShare = (F, aspect = 1) => { const c = cover(F, aspect); return 1 - (4 * F.rx * F.ry) / (c.w * c.h); };

/** A pulled aspect, snapped to the picture's format or to 1:1 when within SNAP. */
export function snap(aspect, picture = 1) {
  const a = clampAspect(aspect);
  for (const to of [picture, 1]) if (to > 0 && Math.abs(a / to - 1) < SNAP) return clampAspect(to);
  return a;
}
