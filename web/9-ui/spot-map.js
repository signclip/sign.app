// spot-map.js — Similar's spots as a map (22.11., user: "Ort oben … wie bei Ort die Karte").
//
// Purpose:   the cells where the takes in the cloud were (o_, H3 resolution 5, ≈ 250 km²) drawn as hexagons where they
//            lie, fitted into the cloud; how fine follows the zoom on the cloud's top edge (similar-zoom.js): bundled
//            = region (resolution 3), one step finer = surroundings (4), finest = the cell (5). A hexagon tapped =
//            that spot chosen (data-role value:spot:<cell>), takes in a finer cell inside it count. No base map: only
//            where takes were, nothing leaves the phone.
// In / out:  areasOf(spots, level) → [{ id, n }] · fitMap(shapes, box) → [{ id, n, d, x, y }] (svg paths)
// Depends:   similar-range.js (parentCell); the outlines come from where.js outlineOf (h3-js, loaded once)
// Test:      tests/ui.test.mjs
// Limits:    ≤ 60 areas drawn; equirectangular with cos(latitude) – fine for the few hundred km a person moves.

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

/** Outlines [{ id, n, poly: [[lat, lon]] }] fitted into box → svg paths and label spots. */
export function fitMap(shapes, box, pad = 14) {
  const pts = shapes.flatMap((s) => s.poly);
  if (!pts.length) return [];
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length, kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * kx), ys = pts.map((p) => -p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), single = shapes.length === 1;
  const scale = Math.min((box.w - 2 * pad) / w, (box.h - 2 * pad) / h) * (single ? 0.45 : 1);
  const ox = box.x + box.w / 2 - ((x0 + x1) / 2) * scale, oy = box.y + box.h / 2 - ((y0 + y1) / 2) * scale;
  const at = ([lat, lon]) => [ox + lon * kx * scale, oy - lat * scale];
  return shapes.map((s) => {
    const p = s.poly.map(at), c = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    return { id: s.id, n: s.n, d: `M${p.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}Z`, x: c[0], y: c[1] };
  });
}
