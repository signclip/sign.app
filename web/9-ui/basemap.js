// basemap.js — the land under Similar's spots (26.11., user: "Ort … Karte im Hintergrund").
//
// Purpose:   reads the tiles in app/basemap/ (made once from Natural Earth 1:10m, public domain – basemap/make.mjs),
//            only those the map needs, each once per session, and draws them in the projection of the hexagons
//            (spot-map.js mapView): land pale, lakes and rivers blue, borders dashed, towns as a dot with their name.
//            How much it shows follows how near the map is (px per degree): far = big rivers and big towns, near =
//            small ones too; town names never lie over one another. Nothing is asked of any server: the tiles lie
//            in the app. Where no tile lies (outside the area made so far), the world's outline (view/earth.js, 1°).
//            Town names in the app's language (de, else en); none lies on a hexagon (avoid).
// In / out:  tilesFor(view) → keys · baseOf(view, { get }) → Promise(base) · baseSvg(base, at, { scale, box }) → SVG text
// Depends:   view/earth.js (RINGS, the world at 1°)
// Test:      tests/ui.test.mjs (tiles of a view, merging, what shows at which nearness, names apart)
// Limits:    5° tiles of 2–25 KB (12 tiles = Germany and neighbours, 168 KB); a sketch true to ≈ 0.5 km · towns ≤ one per
//            9,000 px² of map (phone band ≈ 5, full screen ≈ 30) · rivers: rank ≤ 6 far … ≤ 11 near.

import { RINGS } from './view/earth.js';

export const TILE = 5;
const tiles = new Map(); // key → Promise(tile | null)
const fetchTile = (key) => fetch(new URL(`../basemap/${key}.json`, import.meta.url)).then((r) => (r.ok ? r.json() : null), () => null).catch(() => null);

/** The tiles a view touches: keys "<lat>_<lon>" of their south-west corners (≤ 36, a view of 30° at most). */
export function tilesFor(v) {
  if (!v) return [];
  const out = [], lo = (x) => Math.floor(x / TILE) * TILE;
  for (let lat = lo(v.lat0); lat <= lo(v.lat1) && out.length < 36; lat += TILE) for (let lon = lo(v.lon0); lon <= lo(v.lon1) && out.length < 36; lon += TILE) out.push(`${lat}_${lon}`);
  return out;
}

/** One tile's numbers → degrees: [x, y, x, y …] in thousandths from its corner → [[lon, lat]]. */
const ptsOf = (flat, [lon, lat], q, from = 0) => { const out = []; for (let i = from; i + 1 < flat.length; i += 2) out.push([lon + flat[i] / q, lat + flat[i + 1] / q]); return out; };

/** The tiles merged, in degrees. A lake that lies in two tiles is kept once. → { land, lake, border, river, town, covered } */
export function merge(list) {
  const base = { land: [], lake: [], border: [], river: [], town: [], covered: false }, lakes = new Set();
  for (const t of list) {
    if (!t?.box) continue;
    base.covered = true;
    const c = t.box, q = t.q ?? 1000;
    for (const r of t.land ?? []) base.land.push(ptsOf(r, c, q));
    for (const l of t.lake ?? []) { const ring = ptsOf(l, c, q, 1), k = ring[0]?.map((x) => x.toFixed(3)).join(); if (!lakes.has(k)) { lakes.add(k); base.lake.push({ rank: l[0], ring }); } }
    for (const b of t.border ?? []) base.border.push(ptsOf(b, c, q));
    for (const r of t.river ?? []) base.river.push({ rank: r[0], line: ptsOf(r, c, q, 1) });
    for (const [x, y, rank, name] of t.city ?? []) base.town.push({ lon: c[0] + x / q, lat: c[1] + y / q, rank, name: typeof name === 'string' ? { de: name } : name });
  }
  if (!base.covered) base.land = RINGS.map((r) => r.map(([lon, lat]) => [lon, lat])); // outside the tiles: the world at 1°
  base.town.sort((a, b) => a.rank - b.rank);
  return base;
}

let listed = null; // Promise(Set of keys): basemap/tiles.json, read once – no tile is asked for that is not there
const fetchList = () => fetch(new URL('../basemap/tiles.json', import.meta.url)).then((r) => (r.ok ? r.json() : null), () => null).then((j) => new Set(j?.tiles ?? []), () => new Set());

/** The base map for a view: its tiles, read once each. get(key) → Promise(tile | null), list() → Promise(Set) for tests. */
export async function baseOf(view, { get = fetchTile, list = null } = {}) {
  const have = await (list ? list() : (listed ??= fetchList()));
  const keys = tilesFor(view).filter((k) => have.has(k));
  for (const k of keys) if (!tiles.has(k)) tiles.set(k, get(k));
  return merge(await Promise.all(keys.map((k) => tiles.get(k))));
}

/** How near the map is → the highest rank of river and town still drawn (scale = px per degree of latitude). */
export function ranksAt(scale) {
  const step = Math.log2(Math.max(1, scale) / 40);
  return { river: Math.max(5, Math.min(11, Math.round(6 + step))), town: Math.max(3, Math.min(10, Math.round(5 + step))) };
}

const f1 = (n) => n.toFixed(1);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The base map as SVG, in the hexagons' projection. at([lat, lon]) → [x, y] · scale: px per degree · box: what is seen
 * ({ x, y, w, h }; things outside are left out or cut by the caller's clip) · k: the screen's scale (font sizes).
 */
export function baseSvg(base, at, { scale, box, k = 1, lang = 'de', avoid = [] } = {}) {
  if (!base || !at) return '';
  const r = ranksAt(scale), P = (pts) => pts.map(([lon, lat]) => at([lat, lon]));
  const seen = (ps) => ps.some(([x, y]) => x >= box.x - 40 && x <= box.x + box.w + 40 && y >= box.y - 40 && y <= box.y + box.h + 40);
  const path = (ps, close) => `M${ps.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}${close ? 'Z' : ''}`;
  const out = [];
  const land = base.land.map(P).filter((ps) => ps.length > 2);
  out.push(`<path class="base-land" d="${land.map((ps) => path(ps, true)).join('')}"/>`);
  const lakes = base.lake.filter((l) => l.rank <= r.river).map((l) => P(l.ring)).filter((ps) => ps.length > 2 && seen(ps));
  if (lakes.length) out.push(`<path class="base-water" d="${lakes.map((ps) => path(ps, true)).join('')}"/>`);
  const borders = base.border.map(P).filter(seen);
  if (borders.length) out.push(`<path class="base-border" d="${borders.map((ps) => path(ps)).join('')}"/>`);
  for (const [cls, from, to] of [['big', 0, r.river - 3], ['', r.river - 2, r.river]]) { // the bigger rivers a little wider
    const lines = base.river.filter((x) => x.rank >= from && x.rank <= to).map((x) => P(x.line)).filter(seen);
    if (lines.length) out.push(`<path class="base-river ${cls}" d="${lines.map((ps) => path(ps)).join('')}"/>`);
  }
  // towns: by rank, as many as fit, no name over another, none outside the box
  const most = Math.max(3, Math.floor((box.w * box.h) / 9000)), taken = [...avoid], size = 11 * k; // avoid: what lies on top (the hexagons)
  for (const t of base.town) {
    if (taken.length - avoid.length >= most || t.rank > r.town) break;
    const name = t.name[lang] ?? t.name.en ?? t.name.de ?? '';
    const [x, y] = at([t.lat, t.lon]), w = (name.length * size * 0.56) + 8 * k, b = [x - 3 * k, y - size, x + w, y + 4 * k];
    if (b[0] < box.x || b[2] > box.x + box.w || b[1] < box.y || b[3] > box.y + box.h) continue;
    if (taken.some((o) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3])) continue;
    taken.push(b);
    out.push(`<circle class="base-town" cx="${f1(x)}" cy="${f1(y)}" r="${f1(2.2 * k)}"/><text class="base-name" x="${f1(x + 5 * k)}" y="${f1(y + 3.5 * k)}" style="font-size:${f1(size)}px">${esc(name)}</text>`);
  }
  return `<g class="base">${out.join('')}</g>`;
}
