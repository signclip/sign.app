// view/shape.js — the window into the 1080 × 1080 field: a circle by default, or an ellipse, or a rounded rectangle.
//
// Purpose:   (decided 13.11.) one circle as large as fits; own settings can change it to an ellipse or a rectangle
//            with rounded corners; the rest of the field stays visible, greyed. Every side of the screen is placed
//            by DEGREES around the window (0° = top, clockwise), so the arcs sit at the same angles whatever its
//            shape: line −60…60 · audio 60…140 · context 140…220 · visual 220…300.
// Depends:   nothing
// Test:      tests/view.test.mjs
// Limits:    a point on the outline is exact for circle and ellipse along the ray from the centre; the outward step
//            follows the outline's normal; arcs are polylines of 3° steps (≤ 120 points).

export const SHAPES = ['circle', 'ellipse', 'rounded'];

/** The window inside a field of side F around (cx, cy). */
export function windowOf(shape, { cx, cy, F }) {
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
export function outlinePath(win) {
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
