// view/shape.js — the window into the 1080 × 1080 field: a circle by default, shaped by hand (14.11.).
//
// Purpose:   one form between square and ellipse: { round 0…1, aspect }. round = how rounded the corners are (a
//            corner dragged inwards = rounder, outwards = squarer, continuous); fully round is an ellipse by itself;
//            aspect = width / height (two fingers pinched across = narrower, along = lower). A rectangle with
//            elliptical corners of radii round·rx and round·ry does all of it with true arcs: 0 = rectangle,
//            1 = exactly an ellipse (a circle when even), in between nicely rounded corners. Outside the window
//            nothing shows (the whole square can be watched in review). Every side of the screen is placed
//            by DEGREES around the window (0° = top, clockwise), so the arcs sit at the same angles whatever its
//            shape: line −60…60 · audio 60…140 · context 140…220 · visual 220…300.
// Depends:   nothing
// Test:      tests/view.test.mjs
// Limits:    a point on the outline is exact for circle and ellipse along the ray from the centre; the outward step
//            follows the outline's normal; arcs are polylines of 3° steps (≤ 120 points).

export const SHAPES = ['circle', 'ellipse', 'rounded'];
/** The form by hand: limits of the aspect (narrowest 0.5, lowest 2) and of the corner. */
export const ASPECT = [0.5, 2];
export const DEFAULT_FORM = Object.freeze({ round: 1, aspect: 1 });
/** A kept form or an old name → { round, aspect }. */
export function formOf(x) {
  if (x && typeof x === 'object') return { round: Math.max(0, Math.min(1, Number(x.round ?? 1))), aspect: Math.max(ASPECT[0], Math.min(ASPECT[1], Number(x.aspect ?? 1))) };
  return x === 'ellipse' ? { round: 1, aspect: 0.8 } : x === 'rounded' ? { round: 0.45, aspect: 1 } : { ...DEFAULT_FORM };
}

/** The window inside a field of side F around (cx, cy). */
export function windowOf(shape, { cx, cy, F }) {
  if (shape && typeof shape === 'object') { // by hand: rectangle … ellipse (also a window passed on: the same form, moved)
    const { round, aspect } = formOf(shape);
    const rx = (F / 2) * Math.min(1, aspect), ry = (F / 2) * Math.min(1, 1 / aspect);
    return { shape: 'rrect', cx, cy, rx, ry, ax: round * rx, ay: round * ry, round, aspect };
  }
  if (shape === 'ellipse') return { shape, cx, cy, rx: F * 0.4, ry: F / 2 }; // upright: head, hands, the signing space
  if (shape === 'rounded') return { shape, cx, cy, hw: F / 2, hh: F / 2, r: F * 0.18 };
  return { shape: 'circle', cx, cy, rx: F / 2, ry: F / 2 };
}

/** Half width and half height of the window. */
export const extentOf = (win) => (win.shape === 'rounded' ? [win.hw, win.hh] : [win.rx, win.ry]);

/** The point of the outline at deg (0 = top, clockwise), moved `out` px outwards. → [x, y] */
export function onShape(win, deg, out = 0) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  let px, py, nx, ny;
  if (win.shape === 'rounded') {
    const { hw, hh, r } = win;
    const t = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity);
    [px, py] = [dx * t, dy * t];
    if (Math.abs(px) > hw - r && Math.abs(py) > hh - r) { // in a corner: where the ray meets the corner's circle
      const ccx = Math.sign(px) * (hw - r), ccy = Math.sign(py) * (hh - r);
      const b = dx * ccx + dy * ccy, c = ccx * ccx + ccy * ccy - r * r;
      const s = b + Math.sqrt(Math.max(0, b * b - c));
      [px, py] = [dx * s, dy * s];
      [nx, ny] = [(px - ccx) / r, (py - ccy) / r];
    } else [nx, ny] = Math.abs(px) >= hw - 1e-6 ? [Math.sign(px), 0] : [0, Math.sign(py)];
  } else if (win.shape === 'rrect') {
    const { rx, ry, ax, ay } = win;
    const t = Math.min(Math.abs(dx) > 1e-9 ? rx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? ry / Math.abs(dy) : Infinity);
    [px, py] = [dx * t, dy * t];
    if (ax > 1e-6 && ay > 1e-6 && Math.abs(px) > rx - ax && Math.abs(py) > ry - ay) { // in a corner: the ray meets the corner's ellipse
      const ccx = Math.sign(px) * (rx - ax), ccy = Math.sign(py) * (ry - ay);
      const A = (dx / ax) ** 2 + (dy / ay) ** 2, B = -2 * ((dx * ccx) / ax ** 2 + (dy * ccy) / ay ** 2), C = (ccx / ax) ** 2 + (ccy / ay) ** 2 - 1;
      const s = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
      [px, py] = [dx * s, dy * s];
      const gx = (px - ccx) / ax ** 2, gy = (py - ccy) / ay ** 2, gl = Math.hypot(gx, gy) || 1;
      [nx, ny] = [gx / gl, gy / gl];
    } else [nx, ny] = Math.abs(px) >= rx - 1e-6 ? [Math.sign(px), 0] : [0, Math.sign(py)];
  } else {
    const { rx, ry } = win;
    const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
    [px, py] = [dx * t, dy * t];
    const gx = px / (rx * rx), gy = py / (ry * ry), gl = Math.hypot(gx, gy) || 1;
    [nx, ny] = [gx / gl, gy / gl];
  }
  return [win.cx + px + nx * out, win.cy + py + ny * out];
}

/** Points along the outline from `from` to `to` degrees (clockwise), `out` px outside. */
export function pointsOn(win, from, to, out = 0, step = 3) {
  const pts = [];
  for (let d = from; d < to; d += step) pts.push(onShape(win, d, out));
  pts.push(onShape(win, to, out));
  return pts;
}

/** An SVG path through points. */
export const pathThrough = (pts) => `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`;

/** The whole outline as a closed SVG path (for the window and the greyed rest around it). */
/** A picture of side s at (x, y) in the form of the window (16.11.): take, Similar, line and timeline all alike. */
export const formPath = (shape, x, y, s) => outlinePath(windowOf(shape ?? 'circle', { cx: x + s / 2, cy: y + s / 2, F: s }));

export function outlinePath(win) {
  if (win.shape === 'rrect') { // true elliptical arcs in the corners
    const { cx, cy, rx, ry, ax, ay } = win;
    const x0 = cx - rx, x1 = cx + rx, y0 = cy - ry, y1 = cy + ry;
    return `M ${x0 + ax} ${y0} H ${x1 - ax} A ${ax} ${ay} 0 0 1 ${x1} ${y0 + ay} V ${y1 - ay} A ${ax} ${ay} 0 0 1 ${x1 - ax} ${y1} H ${x0 + ax} A ${ax} ${ay} 0 0 1 ${x0} ${y1 - ay} V ${y0 + ay} A ${ax} ${ay} 0 0 1 ${x0 + ax} ${y0} Z`;
  }
  if (win.shape === 'rounded') {
    const { cx, cy, hw, hh, r } = win;
    const x = cx - hw, y = cy - hh, w = 2 * hw, h = 2 * hh;
    return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }
  const { cx, cy, rx, ry } = win;
  return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry} Z`;
}

/** Is (x, y) inside the window? */
export function inside(win, x, y) {
  const [ex] = extentOf(win);
  const deg = (Math.atan2(x - win.cx, -(y - win.cy)) * 180) / Math.PI;
  const [bx, by] = onShape(win, deg, 0);
  return Math.hypot(x - win.cx, y - win.cy) <= Math.hypot(bx - win.cx, by - win.cy) + 1e-6 && ex > 0;
}

/** The forms in their order (16.11., user): circle → upright ellipse → rectangle → square; a pull walks along them. */
export const FORM_STEPS = Object.freeze([{ round: 1, aspect: 1 }, { round: 1, aspect: 0.8 }, { round: 0, aspect: 0.8 }, { round: 0, aspect: 1 }]);
/** Where a form lies on that path: 0 = circle … 3 = square (between two steps: in between). */
export function stepOf(form) {
  const f = formOf(form), clamp = (x) => Math.max(0, Math.min(1, x));
  if (f.round >= 1) return clamp((1 - f.aspect) / 0.2);
  if (f.round > 0) return 1 + (1 - f.round);
  return 2 + clamp((f.aspect - 0.8) / 0.2);
}
/** A spot on the path → its form; within 0.1 of a step it rests there exactly. */
export function formAt(at) {
  const x = Math.max(0, Math.min(3, at)), near = Math.round(x), t = Math.abs(x - near) < 0.1 ? near : x;
  const i = Math.min(2, Math.floor(t)), u = t - i, a = FORM_STEPS[i], b = FORM_STEPS[i + 1];
  return { round: a.round + (b.round - a.round) * u, aspect: a.aspect + (b.aspect - a.aspect) * u };
}
/** One finger holds the picture, the other pulls (16.11.): apart = on along the path, together = back; 1.6 × the distance ≈ one step. */
export function formAlong(at, factor) {
  return Math.max(0, Math.min(3, at + Math.log(factor) * 2.1));
}
