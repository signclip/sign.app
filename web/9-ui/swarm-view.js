// swarm-view.js — how a swarm looks: the group's tile spread open in the sharing menu (8-join/swarm.js).
//
// Purpose:   no words, no numbers but one: who is in lies round the Startpoint, ring by ring, a line from whoever took
//            her in. Position says how far from the Startpoint; nothing else does.
//              Startpoint          in the middle, pale yellow with a gold edge (what holds it together)
//              within              a solid bubble with her name, a gold line to the device that took her in; a gold
//                                  edge when the rule lets everyone within take in (the Startpoint held her bubble)
//              me                  the same bubble in coral
//              waiting             dashed, on the strip at the edge (below; across: at the right) – she said hello or
//                                  was touched by someone who does not count yet. If I may take in, they breathe:
//                                  a tap = my touch.
//              a net apart         its waiting bubbles in one dashed yellow bubble: they come in together
//              the window          an arc round the Startpoint, as long as the share of its time that is left
//              more than fit       one yellow bubble with their number (the only number)
//            The area: upright below this device, across beside it. Rings are circles a line's length apart, pushed
//            apart until no two bubbles touch; only when that does not fit at full size they move closer or are
//            stretched to the area (an ellipse), and everything is made to fit.
// Depends:   layout.js (arcPath)
// Test:      tests/swarm.test.mjs
// Limits:    ≤ 48 devices as bubbles (SHOWN), the rest counted · never under 22 px (then fewer are shown) · measured
//            (tests/swarm.test.mjs): phone upright 390 × 844 = up to 15 devices at 44 px, 40 at 32 px, 48 at 30 px ·
//            phone across = 15 at 39 px, 40 at 27 px · tablet = 21 at 62 px, 48 at 51 px · the strip holds 6 waiting on
//            a phone (5 and their number when more wait), 8 and more on a tablet · n² distance checks, up to 9 times:
//            48² / 2 × 9 ≈ 10 000 per drawing (< 1 ms).

import { arcPath } from './layout.js';

export const SHOWN = 48;
const SMALLEST = 11; // radius in px
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => Number(n).toFixed(1);

/** Where the swarm lies in the sharing menu (the same measures as sharing-view.js menuLayout). → { x, y, w, h, k, across } */
export function swarmArea({ w, h }) {
  const k = Math.min(w / 390, h / 760), pad = 18 * k, top = 34 * k, gap = 14 * k, cols = w >= 700 ? 5 : 3;
  const device = Math.min(112 * k, (w - 2 * pad - gap * (cols - 1)) / cols) * 1.15, bottom = h - pad - 46 * k - 22 * k;
  const across = w > h * 1.25;
  const x = across ? pad + device + 96 * k : pad, y = across ? top + 30 * k : top + 66 * k + device + 24 * k;
  return { x, y, w: w - pad - x, h: bottom - y, k, across };
}

/** Rings as positions in steps: each device at the middle of the angle its branch takes. → [{ node, ux, uy }] */
function rings(nodes, ax, ay) {
  const shown = new Map(nodes.map((n) => [n.id, n])), kids = new Map(), roots = [];
  for (const n of nodes) { const p = n.by.find((id) => shown.has(id)); if (p) kids.set(p, [...(kids.get(p) ?? []), n]); else roots.push(n); }
  const many = roots.length > 1, weight = new Map();
  const weigh = (n) => { const w = Math.max(1, (kids.get(n.id) ?? []).reduce((sum, c) => sum + weigh(c), 0)); weight.set(n.id, w); return w; };
  const total = roots.reduce((sum, r) => sum + weigh(r), 0);
  const out = [];
  const lay = (n, from, to, ring) => {
    const mid = (from + to) / 2, a = (mid * Math.PI) / 180;
    out.push({ node: n, ux: ring * Math.sin(a) * ax, uy: -ring * Math.cos(a) * ay });
    let at = from;
    for (const c of kids.get(n.id) ?? []) { const span = ((to - from) * weight.get(c.id)) / weight.get(n.id); lay(c, at, at + span, ring + 1); at += span; }
  };
  let at = -180;
  for (const r of roots) { const span = (360 * weight.get(r.id)) / total; lay(r, at, at + span, many ? 1 : 0); at += span; }
  return out;
}

/**
 * Positions. swarm: swarmOf() · size: { w, h } of the menu · me: my device id · area: where it may lie.
 * → { area, k, nodes: [{ id, label, x, y, r, start, me, from: [ids] }], waiting: [{ id, label, x, y, r, me, net }],
 *     pills: [{ x, y, w, h }], more: [{ x, y, r, count, kind }], core: { x, y, r } }
 */
export function swarmLayout(swarm, size, { me = null, area = swarmArea(size) } = {}) {
  const { across } = area, k = Math.max(0.5, Math.min(1.4, Math.min(area.w, area.h) / 354)); // the swarm's own measure: a bubble is 44 px where the area is as wide as on a phone upright
  const R = 22 * k, gap = 5 * k, strip = 2 * R + 12 * k, pitch = 2 * R + 8 * k;
  const all = [...swarm.within.values()].sort((a, b) => a.depth - b.depth || (a.at ?? 0) - (b.at ?? 0));
  const more = [];
  // the strip of the waiting: nets first, each kept together
  const order = [...swarm.waiting].sort((a, b) => (a.net ?? 1e9) - (b.net ?? 1e9) || String(a.label).localeCompare(String(b.label)));
  const room = Math.max(1, Math.floor(((across ? area.h : area.w) + 8 * k) / pitch)), fits = order.length > room ? room - 1 : order.length;
  const slot = (i) => (across ? { x: area.x + area.w - strip / 2, y: area.y + R + i * pitch } : { x: area.x + R + i * pitch, y: area.y + area.h - strip / 2 + 4 * k });
  const waiting = order.slice(0, fits).map((w, i) => ({ id: w.id, label: w.label, ...slot(i), r: R, me: w.id === me, net: w.net }));
  if (order.length > fits) more.push({ ...slot(fits), r: R * 0.8, count: order.length - fits, kind: 'waiting' });
  const pills = [];
  for (const net of new Set(waiting.map((w) => w.net).filter((n) => n != null))) {
    const of = waiting.filter((w) => w.net === net), a = of[0], b = of.at(-1), m = 4 * k;
    pills.push({ x: a.x - R - m, y: a.y - R - m, w: b.x - a.x + 2 * (R + m), h: b.y - a.y + 2 * (R + m) });
  }
  // the rings: as many as fit with bubbles of at least SMALLEST
  const space = across ? { x: area.x, y: area.y, w: area.w - strip, h: area.h } : { x: area.x, y: area.y, w: area.w, h: area.h - strip };
  let nodes = [], core = { x: space.x + space.w / 2, y: space.y + space.h / 2, r: R };
  for (let n = Math.min(all.length, SHOWN); n >= 1; n = Math.floor(n * 0.85)) {
    const hidden = all.length - n, corner = hidden ? 2 * R * 0.8 + gap : 0; // room kept for the bundle, top right
    const box = { x: space.x, y: space.y, w: space.w - corner, h: space.h };
    const wide = Math.min(2, Math.max(1, box.w / box.h)), tall = Math.min(1.6, Math.max(1, box.h / box.w));
    const fit = (ax, ay, air) => { // air: how far a ring lies beyond the bubbles of the one before
      const at = rings(all.slice(0, n), ax, ay), step = 2 * R + air;
      let f = 1; // pushed apart until no two touch
      for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) { const d = Math.hypot(at[i].ux - at[j].ux, at[i].uy - at[j].uy); if (d > 1e-6) f = Math.max(f, (2 * R + gap) / (d * step)); }
      const xs = at.map((p) => p.ux * step * f), ys = at.map((p) => p.uy * step * f);
      const minX = Math.min(...xs) - R, maxX = Math.max(...xs) + R, minY = Math.min(...ys) - R, maxY = Math.max(...ys) + R;
      return { at, xs, ys, minX, maxX, minY, maxY, s: Math.min(1, box.w / (maxX - minX), box.h / (maxY - minY)) };
    };
    // round rings a line's length apart (16 px) while that fits at full size; else as close as they may be, round or stretched to the area – whichever leaves the bubbles largest
    let best = fit(1, 1, 16 * k);
    if (best.s < 1) {
      const close = [[1, 1], [wide, tall]].map(([ax, ay]) => ({ ax, ay, ...fit(ax, ay, gap) })).sort((p, q) => q.s - p.s)[0];
      if (close.s > best.s) best = close;
      if (close.s >= 1) { // room left: as much air as still fits at full size (6 halvings ≈ 0.2 px)
        let lo = gap, hi = 16 * k;
        for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2, c = fit(close.ax, close.ay, mid); if (c.s >= 1) { lo = mid; best = c; } else hi = mid; }
      }
    }
    const { at, xs, ys, minX, maxX, minY, maxY, s } = best;
    if (R * s < SMALLEST && n > 1) continue; // too small to see: fewer bubbles, the rest counted
    const cx = box.x + box.w / 2 - ((minX + maxX) / 2) * s, cy = box.y + box.h / 2 - ((minY + maxY) / 2) * s;
    nodes = at.map((p, i) => ({ id: p.node.id, label: p.node.label, x: cx + xs[i] * s, y: cy + ys[i] * s, r: R * s, start: p.node.startpoint, me: p.node.id === me, from: p.node.by }));
    const starts = nodes.filter((b) => b.start);
    core = { x: cx, y: cy, r: Math.max(...starts.map((b) => Math.hypot(b.x - cx, b.y - cy) + b.r), R * s) + 5 * k };
    if (hidden) more.push({ x: space.x + space.w - R * 0.8, y: space.y + R * 0.8, r: R * 0.8, count: hidden, kind: 'within' });
    break;
  }
  return { area, k, nodes, waiting, pills, more, core };
}

const short = (label, r) => { const s = String(label ?? '').trim(), n = r >= 20 ? 6 : r >= 17 ? 4 : r >= 14 ? 3 : 1; return s.length > n ? (n > 4 ? `${s.slice(0, n - 1)}…` : s.slice(0, n)) : s; };
const box = (b) => `left:${f1(b.x - b.r)}px;top:${f1(b.y - b.r)}px;width:${f1(2 * b.r)}px;height:${f1(2 * b.r)}px;font-size:${f1(Math.max(9, Math.min(12, b.r * 0.52)))}px`;

/**
 * The drawing. model: { label (the group), swarm, me, can (I may take in now), left (share of the window left, 0…1, or
 * null), gives (everyone within takes in), busy (id being touched now), shake (id that could not be touched), fresh
 * (Set of ids just come in) } → { html, svg, layout }; roles: swarm:<device id> on who waits, swarm:me on my own
 * bubble within, swarm elsewhere.
 */
export function swarmView(model, size, { area } = {}) {
  const L = swarmLayout(model.swarm, size, { me: model.me, ...(area ? { area } : {}) });
  const at = new Map(L.nodes.map((b) => [b.id, b])), html = [], svg = [];
  for (const b of L.nodes) {
    for (const id of b.from) { // a line from every device that took her in, edge to edge
      const p = at.get(id); if (!p) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y) || 1, ux = (b.x - p.x) / d, uy = (b.y - p.y) / d;
      svg.push(`<path class="sw-line" d="M${f1(p.x + ux * p.r)} ${f1(p.y + uy * p.r)}L${f1(b.x - ux * b.r)} ${f1(b.y - uy * b.r)}"/>`);
    }
  }
  if (model.left != null && model.left > 0) svg.push(`<path class="sw-time" d="${arcPath(L.core.x, L.core.y, L.core.r, 0, Math.min(359.9, 360 * model.left))}"/>`);
  for (const p of L.pills) svg.push(`<rect class="sw-net" x="${f1(p.x)}" y="${f1(p.y)}" width="${f1(p.w)}" height="${f1(p.h)}" rx="${f1(Math.min(p.w, p.h) / 2)}"/>`);
  html.push(`<span class="sw-name" data-role="swarm" style="left:${f1(L.area.x)}px;top:${f1(L.area.y - 4 * L.k)}px">${esc(model.label)}</span>`);
  const fresh = (id) => (model.fresh?.has?.(id) ? ' fresh' : ''); // just come in: it pops up once
  for (const b of L.nodes) html.push(`<span class="sw${b.start ? ' start' : ''}${b.me ? ' me' : ''}${model.gives && !b.start ? ' gives' : ''}${fresh(b.id)}${model.shake === b.id ? ' shake' : ''}" data-role="swarm${b.me ? ':me' : ''}" style="${box(b)}">${esc(short(b.label, b.r))}</span>`);
  for (const b of L.waiting) html.push(`<span class="sw waits${b.me ? ' me' : ''}${model.can && !b.me ? ' breathe' : ''}${model.busy === b.id ? ' sending' : ''}${model.shake === b.id ? ' shake' : ''}" data-role="swarm:${esc(b.id)}" style="${box(b)}">${esc(short(b.label, b.r))}</span>`);
  for (const m of L.more) html.push(`<span class="sw more${m.kind === 'waiting' ? ' waits' : ''}" data-role="swarm" style="${box(m)}">${m.count}</span>`);
  return { html: html.join(''), svg: svg.join(''), layout: L };
}
