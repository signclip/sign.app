// view/arc.js — the upper arc (−60° … +60°): the line, through the point; older lines of the chain under it.
//
// Purpose:   (decided 13.11.) the line is a playlist of preview pictures tight side by side on the upper arc around the
//            window; the point sits on it at 0°. It can be pulled straight (one row through the point) and back.
//              current   the element playing is the window itself; before = left of the point, after = right
//              levels    when the line is part of a chain, its earlier lines are arcs under it (between the line and
//                        the window), 9 px apart; pulled apart (levelsOpen) 26 px with their pictures; a tap chooses
//                        one (levelAt): it shows its pictures and stands out, the current line steps back
//              push      something new laid on the chain (a take, a Similar result): the new line fades in, the older
//                        ones move one level in (0 → 1)
//              arrive    a Similar result flying into the point ({ x, y, s, t }); arriveAll = several after another
// Depends:   view/shape.js
// Test:      tests/view.test.mjs
// Limits:    pictures 34 px, 2 px apart; on a 390 px phone ≈ 2–3 a side on the arc, 5 a side straight; ≤ 3 levels.

import { onShape } from './shape.js';

const S = 34, GAP = 2, LEVEL_GAP = 9, LEVEL_OPEN = 26, FROM = -60, TO = 60;
const lerp = (a, b, t) => a + (b - a) * t;

/** The arc at `out` px outside the window as points with their distance from 0° along it: [{ x, y, s }]. */
function arcOf(win, out) {
  const pts = [];
  let s = 0, last = null;
  for (let d = 0; d <= TO; d += 1) { // right half, then mirrored
    const p = onShape(win, d, out);
    if (last) s += Math.hypot(p[0] - last[0], p[1] - last[1]);
    pts.push({ x: p[0], y: p[1], s });
    last = p;
  }
  return pts;
}

/** The point at distance s (+ right, − left) along the arc, bent (1) or straight (0). null past the arc's ends. */
function at(arc, s, cx, top, bend) {
  const a = Math.abs(s), dir = Math.sign(s) || 1;
  const straight = [cx + s, top];
  const i = arc.findIndex((p) => p.s >= a);
  if (i < 0) return bend > 0.5 ? null : straight; // past the end of the arc: only when straight
  const p = arc[i], q = arc[Math.max(0, i - 1)];
  const f = p.s === q.s ? 0 : (a - q.s) / (p.s - q.s);
  const x = cx + dir * (lerp(q.x, p.x, f) - cx), y = lerp(q.y, p.y, f);
  return [lerp(straight[0], x, bend), lerp(straight[1], y, bend)];
}

function linePath(win, out, cx, bend, w) {
  const arc = arcOf(win, out), top = arc[0].y, end = arc.at(-1).s;
  const reach = bend > 0.5 ? end : Math.max(end, w);
  const pts = [];
  for (let s = -reach; s <= reach; s += 4) { const p = at(arc, s, cx, top, bend); if (p) pts.push(p); }
  return `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`;
}

/** Spots of the pictures: i = position from the current one (0 = the window itself, not drawn). */
export function lineSpots(win, { ring, k = 1, count = 0, at: current = 0, bend = 1, out = ring, w = 390 } = {}) {
  const arc = arcOf(win, out), top = arc[0].y, cx = win.cx, s = S * k;
  const res = [];
  for (let n = 0; n < count; n++) {
    const i = n - current;
    if (i === 0) continue;
    const d = Math.sign(i) * (ring + GAP * k + s / 2 + (Math.abs(i) - 1) * (S + GAP) * k);
    const p = at(arc, d, cx, top, bend);
    if (!p || p[0] < -s || p[0] > w + s) continue;
    res.push({ i, x: p[0] - s / 2, y: p[1] - s / 2, s });
  }
  return res;
}

/**
 * Shapes of the line and its chain. win: the window (shape.js) · ring: the point's outer radius (the line runs
 * through the point's centre, `ring` px outside the window) · data: { line: { count, at }, versions, bend,
 * levelsOpen, push, arrive } · { k, w }. → shapes
 */
export function arcShapes(win, ring, data = {}, { k = 1, w = 390 } = {}) {
  const res = [];
  const count = data.line?.count ?? 0, current = data.line?.at ?? 0;
  const bend = data.bend ?? 1, push = data.push ?? 1;
  const gap = (data.levelsOpen ? LEVEL_OPEN : LEVEL_GAP) * k;
  const older = Math.min(3, (data.versions ?? 1) - 1);

  for (let j = older; j >= 1; j--) { // earlier lines of the chain, under the line (towards the window)
    const out = ring - (j - 1 + push) * gap;
    const d = linePath(win, out, win.cx, bend, w);
    const chosen = data.levelAt === j;
    res.push({ type: 'path', d, cls: `thread own level${data.levelsOpen ? ' open' : ''}${chosen ? ' chosen' : ''}`, role: `level:${j}` });
    res.push({ type: 'path', d, cls: 'hit', role: `level:${j}` });
    if (data.levelsOpen || chosen) {
      for (const p of lineSpots(win, { ring, k, count, at: current, bend, out, w })) {
        res.push({ type: 'thumb', x: p.x + p.s * 0.2, y: p.y + p.s * 0.2, s: p.s * 0.6, round: true, cls: `thumb own${chosen ? ' chosen' : ' far'}`, role: `level:${j}` });
      }
    }
  }

  const fade = push < 1 ? ' arriving' : data.levelAt ? ' back' : ''; // an earlier line chosen: the current one steps back
  const d = linePath(win, ring, win.cx, bend, w);
  // no drawn arc through the point (14.11.): the line shows by its elements; the arc stays as a hit area
  res.push({ type: 'path', d, cls: 'hit', role: 'line-arc' });
  for (const p of lineSpots(win, { ring, k, count, at: current, bend, w })) {
    res.push({ type: 'thumb', x: p.x, y: p.y, s: p.s, round: true, href: data.lineThumbs?.[current + p.i], cls: `thumb own${Math.abs(p.i) === 1 ? ' near' : ''}${fade}`, role: `line:${p.i}` });
  }
  if (data.arrive) { // into the point = into the line at the current spot
    const [px, py] = onShape(win, 0, ring);
    const t = data.arrive.t ?? 1, to = S * k, s = lerp(data.arrive.s ?? to, to, t);
    res.push({ type: 'thumb', x: lerp(data.arrive.x, px - to / 2, t), y: lerp(data.arrive.y, py - to / 2, t), s, round: t > 0.5, cls: 'thumb other flying' });
  }
  return res;
}
