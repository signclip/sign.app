// paint-over.js — a respect of Similar over everything (26.11., user: "Ort mit Karte … kann sich auch über alles
// einblenden, genauso wie wer, sharing point, Gruppen"): the rail at the cloud's edge, spread open, fills the screen.
//
// Purpose:   the four respects have two sizes. Small: the rail at their edge of the cloud (paint-similar.js), the take
//            stays in sight. Large (filters.full): over the take and the cloud, as much room as the screen has:
//              spot     the map – the base map (basemap.js) with the hexagons where takes were, how many in each
//              who      rings round me: my own sharing points · where I write with others (groups as bubbles with their
//                       persons) · what I only see (pale); a ring tapped = that step of the Weite
//              date     the calendar: each month with takes as a block of weeks, a dot per day as big as its takes
//              initial  every letter as a key, the ones with takes dark, how many on each
//            Tapping chooses exactly as on the rail (the same data-roles). Back to the rail: squeeze (the map: below its
//            coarsest step), Android back, or a tap on the respect's sign at its edge.
// In / out:  overHtml(st, size, data) → HTML · spotMapSvg(shapes, base, box, opts) → SVG text (rail and full view)
// Depends:   spot-map.js, basemap.js, similar-zoom.js
// Test:      tests/ui.test.mjs
// Limits:    the calendar shows ≤ 24 months (older ones by turning its order) · ≤ 12 sharing points per ring, ≤ 6 persons
//            in a bubble · the map: ≤ 60 areas, towns ≤ one per 9,000 px².

import { mapView } from './spot-map.js';
import { baseSvg } from './basemap.js';
import { railValues, periodLabel, inSpan } from './similar-zoom.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (n) => `${Number(n).toFixed(1)}px`;
const f1 = (n) => Number(n).toFixed(1);
export const SIGN = { initial: 'A', date: '▮', spot: '◎', who: '◯' };
export const EDGE = { initial: 'left', date: 'right', spot: 'top', who: 'bottom' }; // where each lies, small and large

/**
 * The row of the four respects (27.11., user: "Metadaten-Auswahl als Kurzeinstellung, schön oben … und in
 * Gesamtansicht"): at the top of the cloud and, the same, at the top of a respect over everything. Only its sign
 * (28.11., user: no summary of what is chosen there – that shows only in the rail or over everything): filled = some-
 * thing of it is chosen (or the cloud is bundled by it), dark = open.
 * Letters at the left end, the date at the right end (their rails unfold under them), spot and who in the middle;
 * box: where it lies · open: the respect whose rail or full view is open · spots: [{ id, label }]
 */
export const QUICK = ['initial', 'spot', 'who', 'date']; // in the order of their edges: left · top · bottom · right
export const QUICK_H = 34; // px at k = 1 the row takes: 28 high, 3 above and below
export function quickHtml(f, box, { open = null } = {}) {
  const v = f.value, chosen = { initial: (v.initial ?? []).length > 0, date: Boolean(f.on.date && v.date), spot: (v.spot ?? []).length > 0, who: (v.sharing ?? []).length + (v.name ?? []).length > 0 };
  const cls = (z) => `q${chosen[z] || f.group?.by === z ? ' on' : ''}${z === open ? ' open' : ''}`;
  const one = (z) => `<span class="${cls(z)}" data-key="grip:${z}" data-role="grip:${z}"><i>${SIGN[z]}</i></span>`;
  return `<div class="quick" data-key="quick" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.w)};height:${px(box.h)}">${one('initial')}<span class="q-mid">${one('spot')}${one('who')}</span>${one('date')}</div>`;
}

/** The box a respect fills over everything: the screen less 10 px round (k = 1). */
export const overBox = ({ w, h }, k = 1) => ({ x: 10 * k, y: 10 * k, w: w - 20 * k, h: h - 20 * k });

const memo = new Map(); // id → { key, svg }: the rail's map and the full one each keep their last
/**
 * The map: base map and hexagons in one projection (spot-map.js mapView), cut to the box. shapes: [{ id, n, poly }] ·
 * base: basemap.js baseOf · chosen: ids · → SVG text (coordinates inside the box, its own clip)
 */
export function spotMapSvg(shapes, base, box, { k = 1, chosen = [], id = 'map', lang = 'de', pad = 12 * k, keep = [] } = {}) {
  const key = [shapes, base, box.w, box.h, k, chosen.join(), id, lang, pad].map((x) => (typeof x === 'object' ? identity(x) : x)).join('|');
  if (memo.get(id)?.key === key) return memo.get(id).svg;
  const inner = { x: 0, y: 0, w: box.w, h: box.h }, v = mapView(shapes, inner, pad, 17 * k);
  const avoid = [...v.hexes.map((h) => [h.x - 20 * k, h.y - 20 * k, h.x + 20 * k, h.y + 20 * k]), ...keep]; // no town name on a hexagon or on what lies on the map (keep)
  const hexes = v.hexes.map((h) => `<g data-role="value:spot:${esc(h.id)}"><path class="spot-hex${chosen.includes(h.id) ? ' on' : ''}" d="${h.d}"/><text x="${f1(h.x)}" y="${f1(h.y + 4 * k)}">${h.n}</text></g>`).join('');
  const svg = `<svg class="spot-map" viewBox="0 0 ${f1(box.w)} ${f1(box.h)}" style="width:${px(box.w)};height:${px(box.h)}"><clipPath id="${id}-clip"><rect width="${f1(box.w)}" height="${f1(box.h)}" rx="${f1(10 * k)}"/></clipPath><g clip-path="url(#${id}-clip)">${baseSvg(base, v.at, { scale: v.scale, box: inner, k, lang, avoid })}${hexes}</g></svg>`;
  memo.set(id, { key, svg });
  return svg;
}
const ids = new WeakMap(); let next = 1;
const identity = (o) => { if (!o) return '0'; if (!ids.has(o)) ids.set(o, next++); return ids.get(o); };

/** HTML of the respect shown over everything, or ''. data: { all, reach, spotMap, spotBase, me, lang, k } */
export function overHtml(st, size, { all = [], reach = [], spotMap = null, spotBase = null, spots = [], me = '', lang = 'de', k = 1 } = {}) {
  const f = st.filters, z = f.full;
  if (!z || f.open !== z || (st.similar !== 'many' && st.similar !== 'full')) return '';
  // the row stays at the top (27.11.): another respect tapped = that one over everything, its own = back to its rail.
  // The map lies under the row, edge to edge; the rings, the calendar and the keys begin below it.
  const box = overBox(size, k), top = (QUICK_H + 6) * k, below = { x: box.x, y: box.y + top, w: box.w, h: box.h - top };
  const row = quickHtml(f, { x: 8 * k, y: 6 * k, w: box.w - 16 * k, h: (QUICK_H - 6) * k }, { open: z });
  const under = (html) => `<div class="over-body" style="top:${px(top)};height:${px(below.h)}">${html}</div>`;
  const body = z === 'spot' ? spotOver(f, box, { spotMap, spotBase, k, lang, top }) : under(z === 'who' ? whoOver(f, below, { reach, me, k }) : z === 'date' ? dateOver(f, below, { all, lang, k }) : lettersOver(f, below, { all, k }));
  return `<div class="over-panel ${z}" data-key="over:${z}" data-role="over" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.w)};height:${px(box.h)}">${body}${row}</div>`;
}

function spotOver(f, box, { spotMap, spotBase, k, lang, top = 40 * k }) {
  if (!spotMap?.length) return '<div class="over-empty">◎</div>';
  // the row at the top: no name under it; 12 % margin round the takes' areas, for what lies around them
  return spotMapSvg(spotMap, spotBase, box, { k, chosen: f.value.spot ?? [], id: 'over-map', lang, pad: Math.max(12 * k, 0.12 * Math.min(box.w, box.h)), keep: [[0, 0, box.w, top]] });
}

/** Rings round me (the Weite's steps of who), the sharing points on them as bubbles with their persons. */
function whoOver(f, box, { reach, me, k }) {
  const R = Math.min(box.w, box.h) / 2 - 8 * k, cx = box.w / 2, cy = box.h / 2, w = f.range?.w ?? 3, out = [];
  const radii = [0.18, 0.42, 0.72, 1].map((x) => x * R);
  const rings = [3, 2, 1, 0].map((i) => `<circle class="who-ring${i <= w ? ' on' : ''}" data-role="who-ring:${i}" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(radii[i])}"/>`).join('');
  out.push(`<svg class="who-rings" viewBox="0 0 ${f1(box.w)} ${f1(box.h)}" style="width:${px(box.w)};height:${px(box.h)}">${rings}</svg>`);
  out.push(`<span class="who-me" style="left:${px(cx)};top:${px(cy)}">${esc((me || '').slice(0, 2) || 'ich')}</span>`);
  const groups = [reach.filter((x) => x.own), reach.filter((x) => !x.own && x.write), reach.filter((x) => !x.own && !x.write)];
  groups.forEach((list0, ring) => {
    const list = list0.slice(0, 12), mid = (radii[ring] + radii[ring + 1]) / 2, n = Math.max(1, list.length);
    const size = Math.max(44 * k, Math.min(radii[ring + 1] - radii[ring] - 8 * k, (2 * Math.PI * mid) / n - 8 * k, 96 * k));
    list.forEach((x, i) => {
      const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / n + ring * 0.5, bx = cx + mid * Math.cos(a), by = cy + mid * Math.sin(a);
      const persons = x.persons.slice(0, 6).map((p) => `<i class="${(f.value.sharing ?? []).includes(p) ? 'on' : ''}" data-role="value:sharing:${esc(p)}">${esc(p.slice(0, 2))}</i>`).join('');
      out.push(`<div class="who-bubble${ring === 2 ? ' far' : ''}${(f.value.sharing ?? []).includes(x.name) ? ' on' : ''}" data-role="value:sharing:${esc(x.name)}" style="left:${px(bx - size / 2)};top:${px(by - size / 2)};width:${px(size)};height:${px(size)}"><b>${esc(x.own ? '◉' : x.name)}</b>${persons}</div>`);
    });
  });
  return out.join('');
}

/** The calendar: months with takes, newest first (or turned), a week a row, a dot per day as big as its takes. */
function dateOver(f, box, { all, lang, k }) {
  const count = new Map();
  for (const e of all) { if (!e.t) continue; const d = new Date(e.t), key = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; count.set(key, (count.get(key) ?? 0) + 1); }
  const months = [...new Set([...count.keys()].map((x) => x.slice(0, 7)))].sort().reverse();
  if (f.order.date === 'old') months.reverse();
  if (!months.length) return '<div class="over-empty">▮</div>';
  const span = f.on.date ? f.value.date : null, most = Math.max(1, ...count.values()), out = [];
  let year = null;
  const names = Array.from({ length: 7 }, (_, i) => { try { return new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(new Date(2026, 10, 23 + i)); } catch { return 'MDMDFSS'[i]; } }); // 23.11.2026 is a Monday
  for (const m of months.slice(0, 24)) {
    const [y, mo] = m.split('.').map(Number);
    if (y !== year) { year = y; out.push(`<div class="cal-year${inSpan(String(y), span) ? ' on' : ''}" data-role="period:${y}">${y}</div>`); }
    const first = (new Date(y, mo - 1, 1).getDay() + 6) % 7, days = new Date(y, mo, 0).getDate(), cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="cal-day none"></span>');
    for (let d = 1; d <= days; d++) {
      const key = `${m}.${String(d).padStart(2, '0')}`, n = count.get(key) ?? 0, r = n ? 3 + 7 * Math.sqrt(n / most) : 0;
      cells.push(n ? `<span class="cal-day${inSpan(key, span) ? ' on' : ''}" data-role="period:${key}"><em style="width:${f1(2 * r * k)}px;height:${f1(2 * r * k)}px"></em><b>${d}</b></span>` : `<span class="cal-day empty"><b>${d}</b></span>`);
    }
    out.push(`<div class="cal-month${inSpan(m, span) ? ' on' : ''}"><div class="cal-title" data-role="period:${m}">${esc(periodLabel(m, lang))}</div><div class="cal-grid">${names.map((x) => `<span class="cal-head">${esc(x)}</span>`).join('')}${cells.join('')}</div></div>`);
  }
  return `<div class="cal">${out.join('')}</div>`;
}

/** Every letter a key: dark = takes begin with it (how many), pale = none. */
function lettersOver(f, box, { all, k }) {
  const have = new Map(railValues(all, { ...f, group: { by: 'initial', level: 0 } }, 'initial').values.map((v) => [v.key, v.n]));
  const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Ä', 'Ö', 'Ü', '#', ...[...have.keys()].filter((x) => !/^[A-ZÄÖÜ#]$/.test(x))];
  const on = f.value.initial ?? [];
  return `<div class="letters-over">${keys.map((c) => (have.has(c) ? `<span class="key${on.includes(c) ? ' on' : ''}" data-role="initial:${esc(c)}">${esc(c)}<i>${have.get(c)}</i></span>` : `<span class="key none">${esc(c)}</span>`)).join('')}</div>`;
}
