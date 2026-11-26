// spot-map.js — Similar's spots as a map (22.11., user: "Ort oben … wie bei Ort die Karte").
//
// Purpose:   the cells where the takes in the cloud were (o_, H3 resolution 5, ≈ 250 km²) drawn as hexagons where they
//            lie, fitted into the cloud; how fine follows the zoom on the cloud's top edge (similar-zoom.js): bundled
//            = region (resolution 3), one step finer = surroundings (4), finest = the cell (5). A hexagon tapped =
//            that spot chosen (data-role value:spot:<cell>), takes in a finer cell inside it count. Under them the base
//            map (26.11., basemap.js: land, lakes, borders, rivers, towns from tiles inside the app – nothing leaves the
//            phone); mapView gives the projection both share.
// In / out:  areasOf(spots, level) → [{ id, n }] · fitMap(shapes, box) → [{ id, n, d, x, y }] (svg paths) ·
//            mapView(shapes, box) → { hexes, at, view, scale } · aroundOf(shapes) → the stretch to load the base map for
// Depends:   similar-range.js (parentCell); the outlines come from where.js outlineOf (h3-js, loaded once)
// Test:      tests/ui.test.mjs
// Limits:    ≤ 60 areas drawn; equirectangular with cos(latitude) – fine for the few hundred km a person moves;
//            an area is drawn at least 17 px from its middle to a corner (a finger finds it), then no longer to scale.

import { parentCell } from './similar-range.js';

export const MAP_RES = [3, 4, 5];

/** The areas at a level (0 coarse … 2 cell) with how many takes lie in each. */
export function areasOf(spots, level = 2) {
  const res = MAP_RES[Math.max(0, Math.min(2, level))], n = new Map();
  for (const s of spots) {
    const id = s ? parentCell(s, res) : null;
    if (id) n.set(id, (n.get(id) ?? 0) + 1);
  }
  return [...n].slice(0, 60).map(([id, count]) => ({ id: `o_${id}`, n: count }));
}

/** Does a spot lie in a chosen area (the same cell or a finer one inside it)? */
export function inArea(spot, area) {
  if (!spot || !area) return false;
  if (spot === area) return true;
  const hex = String(area).replace(/^o_/, '');
  const res = /^[0-9a-f]{15,16}$/i.test(hex) ? Number((BigInt(`0x${hex}`) >> 52n) & 15n) : -1;
  return res >= 0 && parentCell(spot, res) === hex.toLowerCase();
}

/**
 * Outlines [{ id, n, poly: [[lat, lon]] }] fitted into box → svg paths and label spots. Where they lie is true to the
 * earth; how large is not, when they are far apart (26.11.: Berlin and Köln in one band made each cell 2 px): an
 * area smaller than `min` px (middle to corner) is drawn that large, round its own middle, and areas that then lie
 * over one another move apart until they touch (≤ 12 rounds), staying inside the box. min 0 = true to scale.
 */
export function fitMap(shapes, box, pad = 14, min = 17) {
  return mapView(shapes, box, pad, min).hexes;
}

/** The narrowest stretch the map shows (projected degrees, ≈ 25–40 km): closer in, the base map has nothing to say. */
export const MIN_SPAN = 0.35;

/**
 * The map's view (26.11.): the hexagons as fitMap draws them, and the projection the base map uses with them.
 * → { hexes, at([lat, lon]) → [x, y], view: { lon0, lat0, lon1, lat1 } (what the box shows), scale (px per degree) }
 */
export function mapView(shapes, box, pad = 14, min = 17) {
  const pts = shapes.flatMap((s) => s.poly);
  if (!pts.length) return { hexes: [], at: null, view: null, scale: 0 };
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length, kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * kx), ys = pts.map((p) => -p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), single = shapes.length === 1;
  const room = Math.max(pad, min); // an enlarged area at the rim still lies inside
  const scale = Math.min((box.w - 2 * room) / w, (box.h - 2 * room) / h, (Math.min(box.w, box.h) - 2 * room) / MIN_SPAN) * (single ? 0.45 : 1);
  const ox = box.x + box.w / 2 - ((x0 + x1) / 2) * scale, oy = box.y + box.h / 2 - ((y0 + y1) / 2) * scale;
  const at = ([lat, lon]) => [ox + lon * kx * scale, oy - lat * scale];
  const view = { lon0: (box.x - ox) / (kx * scale), lon1: (box.x + box.w - ox) / (kx * scale), lat1: (oy - box.y) / scale, lat0: (oy - box.y - box.h) / scale };
  const drawn = shapes.map((s) => {
    let p = s.poly.map(at);
    const c = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    let r = Math.max(...p.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
    if (min > 0 && r < min) { const f = min / Math.max(r, 1e-6); p = p.map((q) => [c[0] + (q[0] - c[0]) * f, c[1] + (q[1] - c[1]) * f]); r = min; }
    return { s, p, c: [...c], r, dx: 0, dy: 0 };
  });
  for (let round = 0; min > 0 && round < 12; round++) { // apart until they only touch
    let moved = false;
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i], b = drawn[j], ax = a.c[0] + a.dx, ay = a.c[1] + a.dy, bx = b.c[0] + b.dx, by = b.c[1] + b.dy;
      const d = Math.hypot(bx - ax, by - ay), need = (a.r + b.r) * 0.9;
      if (d >= need) continue;
      const ux = d > 1e-6 ? (bx - ax) / d : 1, uy = d > 1e-6 ? (by - ay) / d : 0, push = (need - d) / 2;
      a.dx -= ux * push; a.dy -= uy * push; b.dx += ux * push; b.dy += uy * push;
      moved = true;
    }
    for (const a of drawn) { // inside the box
      a.dx = Math.max(box.x + a.r - a.c[0], Math.min(box.x + box.w - a.r - a.c[0], a.dx));
      a.dy = Math.max(box.y + a.r - a.c[1], Math.min(box.y + box.h - a.r - a.c[1], a.dy));
    }
    if (!moved) break;
  }
  const hexes = drawn.map(({ s, p, c, dx, dy }) => ({ id: s.id, n: s.n, d: `M${p.map((q) => `${(q[0] + dx).toFixed(1)} ${(q[1] + dy).toFixed(1)}`).join('L')}Z`, x: c[0] + dx, y: c[1] + dy }));
  return { hexes, at, view, scale };
}

/**
 * The stretch of the earth round some areas the base map must cover. A screen that is taller or wider than they are
 * shows more around them: so as much again as they span on each side, at least 1.5° (a phone upright, full screen,
 * shows ≈ 2.3 × the width in height).
 */
export function aroundOf(shapes) {
  const pts = shapes.flatMap((s) => s.poly);
  if (!pts.length) return null;
  const lon0 = Math.min(...pts.map((p) => p[1])), lon1 = Math.max(...pts.map((p) => p[1])), lat0 = Math.min(...pts.map((p) => p[0])), lat1 = Math.max(...pts.map((p) => p[0]));
  const m = Math.max(1.5, 1.2 * Math.max(lon1 - lon0, lat1 - lat0));
  return { lon0: lon0 - m, lon1: lon1 + m, lat0: lat0 - m, lat1: lat1 + m };
}
