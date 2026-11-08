// view/ring.js — how the screen looks: fassung A Ring, with threads (B) and layers (C). The one file
// to swap for another arrangement (threads.js, layers.js, later glasses.js); state and gestures stay.
//
// Purpose:   state (state.js) + what is there (chips, levels, Similar, line) → shapes → SVG.
//              ring     round picture in the middle, the four strands as arcs around it:
//                       top sound (bars) · right picture · bottom text (chips below) · left landmarks
//                       arc look: new = dashed (will be recorded) · keep = solid · off = grey (state.look)
//              point    overlaps the lower edge of the picture (Initial §6.1); recording = a square
//              layers   older versions of the chain as pale rings behind (C): editing = one more on top
//              Similar  arcs out of the upper-right corner, results at their ends (B, chosen 08.11.)
//              line     a thread through the point, the current element half see-through in it (B)
//              chips    under the ring, clustered, stable below (chips.js); in full-screen replay above the point
//              stretched  a line or a live take as parallel threads in one time span (timeline.js)
//              template a template (Vorlage) small and blue at the upper left, beside the own take
//            No labels (decided 08.11.). Colours only as classes (index.html): own, other, wait, now,
//            later, keep, off, hold; never colour alone — dashed, filled or a shape says it too.
// Depends:   9-ui/state.js (look), chips.js, timeline.js
// Test:      tests/view.test.mjs
// Limits:    phone 390 × 844 as the unit, scaled to any width; ≤ 3 layers, ≤ 3 Similar arcs, ≤ 6 line
//            neighbours, chips at most 2 rows; one layout < 1 ms.

import { look, KINDS } from '../state.js';
import { chipShapes } from './chips.js';
import { timelineShapes } from './timeline.js';

const SIDES = { a: [-40, 40], v: [50, 130], x: [140, 220], l: [230, 310] }; // degrees from top, clockwise
const at = (cx, cy, r, deg) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];

/**
 * st: state.js · data: { chips: [{ text, t: [fromMs, toMs], stable }], timeMs, levels: [0–1],
 * similar: [id], line: { before: n, after: n }, versions: n } · size: { w, h }.
 * items: a stretched line (timeline.js) · template: true = a template plays beside the own take.
 * → { video, template, point, shapes }
 */
export function layout(st, data = {}, { w = 390, h = 844 } = {}) {
  const k = w / 390, cx = w / 2, cy = (st.screen === 'delete' ? 392 : 362) * k, D = 240 * k, R = 158 * k;
  const shapes = [];
  const add = (type, o) => shapes.push({ type, ...o });
  const video = st.full ? { cx, cy: h / 2, d: Math.max(w, h) } : { cx, cy, d: D };
  const point = { cx, cy: st.full ? h - 80 * k : cy + D / 2 - 6 * k, d: 62 * k };

  if (!st.full) {
    for (let i = Math.min(3, (data.versions ?? 1) - 1); i >= 1; i--) add('circle', { cx: cx - 8 * i * k, cy: cy - 8 * i * k, r: R, cls: 'layer' }); // C
    for (const s of KINDS) {
      const kind = look(st, s);
      const live = st.screen === 'record' && kind === 'new';
      add('arc', { cx, cy, r: R, from: SIDES[s][0], to: SIDES[s][1], cls: `strand ${live ? 'own' : kind}`, role: `strand:${s}` });
    }
    (data.levels ?? []).slice(0, 20).forEach((v, i) => { // sound as bars on the top arc
      const deg = -38 + i * 4, [x1, y1] = at(cx, cy, R + 8 * k, deg), [x2, y2] = at(cx, cy, R + (8 + 5 + 16 * v) * k, deg);
      add('line', { x1, y1, x2, y2, cls: 'bar own' });
    });
  }
  add('video', { ...video, cls: st.screen === 'delete' ? 'video faded' : 'video' });

  // chips: clustered, stable below, the one at the time highlighted (chips.js); not while a timeline shows words
  const stretched = data.items?.length && ['line', 'record', 'stream'].includes(st.screen);
  if (!stretched && (!st.full || st.mode === 'line') && st.screen !== 'line') shapes.push(...chipShapes(data.chips, { timeMs: data.timeMs, cx, y: st.full ? point.cy - 70 * k : cy + R + 32 * k, k, w }));

  // template (Vorlage) beside the own take: smaller, blue, upper left, plays in the same time
  const template = data.template && !st.full ? { cx: cx - R * 0.95, cy: cy - R * 0.95, d: 96 * k } : null;
  if (template) add('video', { ...template, cls: 'video other template', role: 'template' });

  // Similar: arcs out of the upper-right corner (B)
  if (st.similar) {
    [[236, -40, 180, 210, 64], [296, -40, 120, 130, 52], [168, -40, 248, 330, 72]].slice(0, (data.similar ?? [1, 2, 3]).length).forEach(([x, y, aw, ah, ts], i) => {
      const [X, Y, W, H, T] = [x, y, aw, ah, ts].map((n) => n * k);
      add('path', { d: `M ${X} ${Y + H} A ${W} ${H} 0 0 1 ${X + W} ${Y}`, cls: 'thread other' });
      add('thumb', { x: X - T / 2, y: Y + H, s: T, cls: 'thumb other', role: `similar:${i}` });
    });
  }

  // line: a thread through the point, neighbours left and right (B)
  if (stretched) shapes.push(...timelineShapes(data.items, { timeMs: data.timeMs ?? 0, sub: st.sub ?? 'play', cx, y: point.cy, k, w }));
  else if (st.screen === 'line') {
    const g = (st.sub === 'spread' ? 104 : 80) * k, y = point.cy;
    add('line', { x1: 0, y1: y, x2: w, y2: y, cls: 'thread own' });
    for (const i of [-3, -2, -1, 1, 2, 3]) {
      if ((i < 0 && -i > (data.line?.before ?? 3)) || (i > 0 && i > (data.line?.after ?? 3))) continue;
      const s = (Math.abs(i) === 1 ? 46 : 36) * k;
      add('thumb', { x: cx + i * g - s / 2, y: y - s / 2, s, round: true, cls: `thumb own${Math.abs(i) === 1 ? '' : ' far'}`, role: `line:${i}` });
    }
  }

  if (st.screen === 'delete') ['take', 'strand', 'part'].forEach((what, i) => add('chip', { x: cx - 120 * k + i * 84 * k, y: 642 * k, w: 76 * k, h: 32 * k, text: '', cls: `chip ${i ? 'wait' : 'own'} ${what}`, role: `delete:${what}` }));

  const pcls = st.screen === 'record' ? 'point recording' : st.screen === 'wait' ? 'point waiting' : st.screen === 'line' ? 'point line' : 'point';
  add('point', { ...point, cls: pcls, role: 'point' });
  return { video, template, point, shapes };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const role = (s) => (s.role ? ` data-role="${esc(s.role)}"` : '');
function arcPath({ cx, cy, r, from, to }) {
  const [x1, y1] = at(cx, cy, r, from), [x2, y2] = at(cx, cy, r, to);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Shapes → one SVG (the video itself is a <video> element placed by layout().video). */
export function toSvg({ shapes }, { w = 390, h = 844 } = {}) {
  const out = shapes.map((s) => {
    switch (s.type) {
      case 'bubble': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" class="${s.cls}"/>`;
      case 'circle': return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}"/>`;
      case 'arc': return `<path d="${arcPath(s)}" class="${s.cls}"${role(s)}/>`;
      case 'line': return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" class="${s.cls}"/>`;
      case 'path': return `<path d="${s.d}" class="${s.cls}"/>`;
      case 'video': return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="${s.cls}"/>`;
      case 'thumb': return `<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${s.round ? s.s / 2 : 12}" class="${s.cls}"${role(s)}/>`;
      case 'chip': return `<g class="${s.cls}"${role(s)}><rect x="${s.x}" y="${s.y - s.h / 2}" width="${s.w}" height="${s.h}" rx="${s.h / 2}"/><text x="${s.x + s.w / 2}" y="${s.y + 5}" text-anchor="middle">${esc(s.text)}</text></g>`;
      case 'point': return `<g class="${s.cls}"${role(s)}><circle cx="${s.cx}" cy="${s.cy}" r="${(s.d / 2) * 1.35}" class="ring"/><${s.cls.includes('recording') ? `rect x="${s.cx - 16}" y="${s.cy - 16}" width="32" height="32" rx="8"` : `circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}"`} class="core"/></g>`;
      default: return '';
    }
  });
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
}
