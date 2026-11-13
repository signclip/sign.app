// view/arc.js — the top side around the window: the line, through the point, following the window's rounding.
//
// Purpose:   (decided 13.11.) the four sides right around the window: left visual, right audio, bottom
//            context, top the line. The line is a playlist: preview pictures tight side by side on a curve
//            that runs through the point and follows the rounded top of the window, down round its corners.
//              bend      1 = the rounding · 0 = pulled straight (one row across) · in between while animating
//              current   the element playing is the window itself; the point sits on its spot in the line,
//                        the neighbours follow left (before) and right (after)
//              levels    older lines of the chain: the same curve, further out, pale ("several on top of
//                        each other"); pulled apart (levelsOpen) they show their pictures, a tap opens one
//              push      a new line arrives (a take, or a Similar result laid on the chain): it fades in on the
//                        curve, the older ones move one level out (0 → 1)
//              arrive    a Similar result flies from where it was into the point ({ x, y, s, t })
// Depends:   nothing (shapes are drawn by ring.js toSvg)
// Test:      tests/view.test.mjs
// Limits:    pictures 34 px with 2 px gap; on a 390 px phone ≈ 4 a side on the rounding, 5 a side straight;
//            ≤ 3 older levels; a curve is a polyline of 6 px steps (< 200 points).

const S = 34, GAP = 2, LEVEL_GAP = 9, LEVEL_OPEN = 44, STEP = 6;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A point on the line at distance s (px, + = right) from the point's centre. curve: { cx, top, half, R } —
 * top = y of the straight part, half = its half length, R = radius of the rounding. → [x, y]
 */
export function onLine(s, { cx, top, half, R }, bend = 1) {
  const a = Math.abs(s), dir = Math.sign(s) || 1;
  let x, y;
  if (a <= half) [x, y] = [cx + s, top];
  else {
    const th = (a - half) / R;
    if (th <= Math.PI / 2) [x, y] = [cx + dir * (half + R * Math.sin(th)), top + R * (1 - Math.cos(th))];
    else [x, y] = [cx + dir * (half + R), top + R + (a - half - (R * Math.PI) / 2)];
  }
  return [lerp(cx + s, x, bend), lerp(top, y, bend)];
}

/** The curve of the line at level dy (0 = through the point, + = further out). */
function curveOf(point, win, dy) {
  const out = win.y - point.cy + dy; // how far outside the window
  return { cx: point.cx, top: point.cy - dy, half: win.s / 2 - win.r, R: win.r + out };
}

/** Does a spot still belong on screen (not past the sides, not below the window's rounding)? */
const shown = ([x, y], s, { w, win }) => x > -s && x < w + s && y < win.y + win.s - win.r;

/** The line itself as a polyline, clipped to the screen. */
function linePath(curve, bend, size) {
  const pts = [];
  for (let s = -900; s <= 900; s += STEP) {
    const p = onLine(s, curve, bend);
    if (shown(p, 0, size)) pts.push(p);
  }
  return pts.length ? `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}` : '';
}

/** Distance along the line of neighbour i (±1 next to the point, outside its ring). */
const distanceOf = (i, ring, k) => Math.sign(i) * (ring + GAP * k + (S * k) / 2 + (Math.abs(i) - 1) * (S + GAP) * k);

/** Spots of the pictures: i = position from the current one (0 = under the point, not drawn). → [{ i, x, y, s }] */
export function lineSpots(point, win, { k = 1, count = 0, at = 0, bend = 1, dy = 0, w = 390 } = {}) {
  const curve = curveOf(point, win, dy);
  const ring = (point.d / 2) * 1.35, s = S * k;
  const out = [];
  for (let n = 0; n < count; n++) {
    const i = n - at;
    if (i === 0) continue; // the current one is the window itself
    const p = onLine(distanceOf(i, ring, k), curve, bend);
    if (!shown(p, s, { w, win })) continue;
    out.push({ i, x: p[0] - s / 2, y: p[1] - s / 2, s });
  }
  return out;
}

/**
 * Shapes of the line and its chain. point: { cx, cy, d } · data: { line: { count, at }, versions, bend,
 * levelsOpen, push, arrive } · { k, w, win }. → shapes
 */
export function arcShapes(point, data = {}, { k = 1, w = 390, win } = {}) {
  const out = [];
  const count = data.line?.count ?? 0;
  const bend = data.bend ?? 1;
  const push = data.push ?? 1;
  const gap = (data.levelsOpen ? LEVEL_OPEN : LEVEL_GAP) * k;
  const older = Math.min(3, (data.versions ?? 1) - 1);
  const size = { w, win };
  const at = data.line?.at ?? 0;

  for (let j = older; j >= 1; j--) { // older lines, further out; while a new one arrives they move out one level
    const dy = (j - 1 + push) * gap;
    const d = linePath(curveOf(point, win, dy), bend, size);
    out.push({ type: 'path', d, cls: `thread own level${data.levelsOpen ? ' open' : ''}`, role: `level:${j}` });
    out.push({ type: 'path', d, cls: 'hit', role: `level:${j}` });
    if (data.levelsOpen) {
      for (const p of lineSpots(point, win, { k, count, at, bend, dy, w })) {
        out.push({ type: 'thumb', x: p.x + p.s * 0.2, y: p.y + p.s * 0.2, s: p.s * 0.6, round: true, cls: 'thumb own far', role: `level:${j}` });
      }
    }
  }

  const fade = push < 1 ? ' arriving' : '';
  const d = linePath(curveOf(point, win, 0), bend, size);
  out.push({ type: 'path', d, cls: `thread own line-arc${fade}`, role: 'line-arc' });
  out.push({ type: 'path', d, cls: 'hit', role: 'line-arc' });
  for (const p of lineSpots(point, win, { k, count, at, bend, w })) {
    out.push({ type: 'thumb', x: p.x, y: p.y, s: p.s, round: true, cls: `thumb own${Math.abs(p.i) === 1 ? ' near' : ''}${fade}`, role: `line:${p.i}` });
  }
  if (data.arrive) { // a Similar result on its way into the point (= into the line, at the current spot)
    const t = data.arrive.t ?? 1, to = S * k;
    const s = lerp(data.arrive.s ?? to, to, t);
    out.push({ type: 'thumb', x: lerp(data.arrive.x, point.cx - to / 2, t), y: lerp(data.arrive.y, point.cy - to / 2, t), s, round: t > 0.5, cls: 'thumb other flying' });
  }
  return out;
}
