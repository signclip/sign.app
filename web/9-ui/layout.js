// layout.js — where everything sits on the screen, as numbers only (no DOM): the take window with its three arcs,
// the button on the line, the photo dot, the context rows, Similar and the sharing menu.
//
// Purpose:   one spot for every position, so the drawing (paint.js) and the touches (touch.js) agree. The take window
//            is a circle; around it, by degrees (0° = top, clockwise, as in the version until 16.11.):
//              line   −60…60   through the button (top), the takes of the line left and right of it
//              audio   60…140  right · context 140…220 bottom · visual 220…300 left, the photo dot at its upper end
//            Older lines are small arcs under the line (between line and window), newest first.
//            Similar (16.11.): phone upright = above the take, the take smaller at the bottom; wide (tablet across) =
//            beside it; full = the cloud alone. The keyboard lifts the whole take until its typing row is visible.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    drawn for a 390 px phone, scaled by k = min(w / 390, h / 760); ≤ 3 older lines drawn (more = "+n" mark);
//            ≤ 9 takes visible on the line at once (4 left, 4 right of the button), the rest scroll in.

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
 * The take. size { w, h, keyboard (px covered at the bottom) } · similar: 'closed' | 'many' | 'double' | 'full'.
 * → { k, cx, cy, R, button: { x, y, r }, lineR, photo: { x, y, r }, nowR, queueY, lift, scale, similarBox, doubleBox }
 */
export function takeLayout({ w, h, keyboard = 0 }, similar = 'closed') {
  const k = Math.min(w / 390, h / 760);
  const cw = Math.min(w, 390 * k);
  const ring = 42 * k; // the button's radius with its ring
  const R0 = Math.min(cw / 2 - 25 * k, (h - 2 * ring - 150 * k) / 2); // window radius: the line's ends and the rows fit
  const wide = isWide({ w, h });
  let cx = w / 2, cy = h / 2 + ring / 2, scale = 1, similarBox = null, doubleBox = null;
  if (similar === 'many' || similar === 'double') {
    if (wide) { // beside: the take right, Similar left
      cx = w * 0.72; scale = Math.min(1, (w * 0.5) / (2 * R0 + 60 * k));
      similarBox = { x: 12 * k, y: 12 * k, w: w * 0.44 - 12 * k, h: h - 24 * k };
    } else { // above: the take smaller, low
      scale = 0.62;
      cy = h - (R0 * scale) - 70 * k;
      similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: cy - R0 * scale - ring * scale * 2 - 18 * k };
    }
    if (similar === 'double') doubleBox = squareIn(similarBox, 0.92);
  }
  if (similar === 'full') { similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: h - 20 * k }; scale = 0; }
  const R = R0 * scale;
  const lineR = R + ring * 0.8 * (scale || 1); // through the button: it overlaps the window a little (08.11.)
  const [bx, by] = polar(cx, cy, lineR, 0);
  const [px, py] = polar(cx, cy, R + 7 * k * (scale || 1), ARCS.v[1] + 4);
  const queueY = cy + R + 34 * k;
  const lift = keyboard ? Math.max(0, queueY + 26 * k - (h - keyboard)) : 0; // the typing row sits right above the keyboard
  return { k, cw, cx, cy: cy - lift, R, ring: ring * (scale || 1), scale, wide, lift,
    button: { x: bx, y: by - lift, r: 31 * k * (scale || 1) }, lineR,
    photo: { x: px, y: py - lift, r: 8 * k * (scale || 1) },
    nowR: R - 24 * k * (scale || 1), queueY: queueY - lift, similarBox, doubleBox };
}

/** The biggest square of share f inside a box, centred. */
export function squareIn(box, f = 1) {
  const s = Math.min(box.w, box.h) * f;
  return { x: box.x + (box.w - s) / 2, y: box.y + (box.h - s) / 2, w: s, h: s };
}

/** The arcs of the take: strand arcs, the line arc and the older lines' small arcs. → [{ id, d, mid: [x, y] }] */
export function arcsOf(L, olderLines = 0) {
  const { cx, cy, R, k, scale, lineR } = L;
  const s = scale || 1, out = [];
  for (const kind of ['v', 'x', 'a']) {
    const [a, b] = ARCS[kind];
    out.push({ id: `strand:${kind}`, kind, d: arcPath(cx, cy, R + 7 * k * s, a + GAP, b - GAP), mid: polar(cx, cy, R + 7 * k * s, (a + b) / 2) });
  }
  out.push({ id: 'line', d: arcPath(cx, cy, lineR, ARCS.line[0], ARCS.line[1]), mid: polar(cx, cy, lineR, 0) });
  for (let i = 0; i < Math.min(olderLines, OLD_LINES); i++) {
    const r = lineR - (14 + 6 * i) * k * s, span = 46 - 6 * i;
    out.push({ id: `old:${i}`, d: arcPath(cx, cy, r, -span, span), mid: polar(cx, cy, r, 0) });
  }
  return out;
}

/**
 * The takes of the line around the button: index i (0 = oldest) and at (the button's spot, = takes.length when
 * recording new). Left = older (08.11.: the take just made goes left of the button). → [{ i, x, y, r }]
 */
export function lineSlots(L, count, at, shift = 0) {
  const { cx, cy, lineR, k, scale } = L;
  const s = scale || 1, step = 13, out = [];
  for (let i = 0; i < count; i++) {
    const off = i - at + shift; // < 0 left of the button
    if (off === 0 || Math.abs(off) > LINE_SIDE) continue;
    const deg = Math.sign(off) * (10 + step * (Math.abs(off) - 0.5));
    const [x, y] = polar(cx, cy, lineR, deg);
    out.push({ i, x, y: y, r: 15 * k * s });
  }
  return out;
}

/** The button spread across (16.11.): a pill as high as the button, as wide as the window ÷ φ at most. → { x, y, w, h } */
export function wideButton(L, spread) {
  const h = 2 * L.button.r, max = Math.max(h, (2 * L.R) / PHI);
  const w = h + (max - h) * Math.max(0, Math.min(1, spread));
  return { x: L.button.x - w / 2, y: L.button.y - h / 2, w, h, max };
}

/** The chips of the take now, bent along the bottom arc inside the window: a chip of width cw at index i of n. */
export function nowChipSpot(L, widths, i) {
  const total = widths.reduce((s, x) => s + x, 0) + 6 * (widths.length - 1);
  const before = widths.slice(0, i).reduce((s, x) => s + x, 0) + 6 * i + widths[i] / 2;
  const deg = 180 - ((before - total / 2) / L.nowR) * (180 / Math.PI); // left of the middle = more than 180°
  const [x, y] = polar(L.cx, L.cy, L.nowR, deg);
  return { x, y, rot: deg - 180 };
}
