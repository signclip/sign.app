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

// Where each strand sits on the ring, in degrees from the top, clockwise.
const SIDES = {
  a: [-40, 40], // top: sound
  v: [50, 130], // right: picture
  x: [140, 220], // bottom: text
  l: [230, 310], // left: landmarks
};

// The three Similar threads out of the upper-right corner, on the 390 px phone:
// [x, y, width, height, size of the result at the end]
const SIMILAR_THREADS = [
  [236, -40, 180, 210, 64],
  [296, -40, 120, 130, 52],
  [168, -40, 248, 330, 72],
];

/** A point on a circle: centre, radius, degrees from the top (clockwise). */
function onCircle(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/**
 * st: state.js · data: { chips (chips.js), timeMs, levels: [0–1], similar: [id], line: { before, after },
 * versions: n, items: a stretched line (timeline.js), template: true } · size: { w, h }.
 * → { video, template, point, shapes }
 */
export function layout(st, data = {}, { w = 390, h = 844 } = {}) {
  const k = w / 390; // everything is drawn for a 390 px phone and scaled
  const g = {
    st, data, w, h, k,
    cx: w / 2,
    cy: (st.screen === 'delete' ? 392 : 362) * k,
    D: 240 * k, // picture
    R: 158 * k, // ring
    shapes: [],
  };
  g.add = (type, o) => g.shapes.push({ type, ...o });

  const video = st.full ? { cx: g.cx, cy: h / 2, d: Math.max(w, h) } : { cx: g.cx, cy: g.cy, d: g.D };
  const point = { cx: g.cx, cy: st.full ? h - 80 * k : g.cy + g.D / 2 - 6 * k, d: 62 * k };
  const stretched = Boolean(data.items?.length) && ['line', 'record', 'stream'].includes(st.screen);

  if (!st.full) {
    layersBehind(g);
    strandArcs(g);
    soundBars(g);
  }
  g.add('video', { ...video, cls: st.screen === 'delete' ? 'video faded' : 'video' });
  if (!stretched) chipArea(g, point);
  const template = templateVideo(g);
  if (st.similar) similarThreads(g);
  if (stretched) g.shapes.push(...timelineShapes(data.items, { timeMs: data.timeMs ?? 0, sub: st.sub ?? 'play', cx: g.cx, y: point.cy, k, w }));
  else if (st.screen === 'line') lineThread(g, point);
  if (st.screen === 'delete') deleteChips(g);
  g.add('point', { ...point, cls: pointClass(st), role: 'point' });

  return { video, template, point, shapes: g.shapes };
}

/** C: older versions of the chain as pale rings behind, at most three. */
function layersBehind({ data, cx, cy, R, k, add }) {
  const behind = Math.min(3, (data.versions ?? 1) - 1);
  for (let i = behind; i >= 1; i--) add('circle', { cx: cx - 8 * i * k, cy: cy - 8 * i * k, r: R, cls: 'layer' });
}

/** One arc per strand: new (dashed) · keep (solid) · off (grey); while recording the new ones turn solid. */
function strandArcs({ st, data, cx, cy, R, add }) {
  for (const kind of KINDS) {
    if (data.hidden?.includes(kind)) continue; // hidden field: still records when on
    const looks = look(st, kind);
    const live = st.screen === 'record' && looks === 'new';
    add('arc', { cx, cy, r: R, from: SIDES[kind][0], to: SIDES[kind][1], cls: `strand ${live ? 'own' : looks}`, role: `strand:${kind}` });
    add('arc', { cx, cy, r: R, from: SIDES[kind][0], to: SIDES[kind][1], cls: 'hit', role: `strand:${kind}` }); // a wider, unseen line to hit
  }
}

/** B on the ring: the sound level as bars outside the top arc. */
function soundBars({ data, cx, cy, R, k, add }) {
  (data.levels ?? []).slice(0, 20).forEach((level, i) => {
    const deg = -38 + i * 4;
    const [x1, y1] = onCircle(cx, cy, R + 8 * k, deg);
    const [x2, y2] = onCircle(cx, cy, R + (13 + 16 * level) * k, deg);
    add('line', { x1, y1, x2, y2, cls: 'bar own' });
  });
}

/** Chips under the ring; in full-screen replay above the point; in a plain line none (the thread shows it). */
function chipArea({ st, data, cx, cy, R, k, w, shapes }, point) {
  if (st.screen === 'line') return;
  if (st.full && st.mode !== 'line') return;
  const y = st.full ? point.cy - 70 * k : cy + R + 32 * k;
  shapes.push(...chipShapes(data.chips, { timeMs: data.timeMs, cx, y, k, w }));
}

/** A template (Vorlage) beside the own take: smaller, blue, upper left, plays in the same time. */
function templateVideo({ st, data, cx, cy, R, k, add }) {
  if (!data.template || st.full) return null;
  const template = { cx: cx - R * 0.95, cy: cy - R * 0.95, d: 96 * k };
  add('video', { ...template, cls: 'video other template', role: 'template' });
  return template;
}

/** B: Similar as arcs out of the upper-right corner, a result at the end of each. */
function similarThreads({ data, k, add }) {
  const count = (data.similar ?? [1, 2, 3]).length;
  SIMILAR_THREADS.slice(0, count).forEach((thread, i) => {
    const [x, y, width, height, size] = thread.map((n) => n * k);
    add('path', { d: `M ${x} ${y + height} A ${width} ${height} 0 0 1 ${x + width} ${y}`, cls: 'thread other' });
    add('thumb', { x: x - size / 2, y: y + height, s: size, cls: 'thumb other', role: `similar:${i}` });
  });
}

/** B: a line as a thread through the point, the neighbours left and right (spread = wider). */
function lineThread({ st, data, cx, w, k, add }, point) {
  const gap = (st.sub === 'spread' ? 104 : 80) * k;
  const y = point.cy;
  const before = data.line?.before ?? 3;
  const after = data.line?.after ?? 3;
  add('line', { x1: 0, y1: y, x2: w, y2: y, cls: 'thread own' });
  for (const i of [-3, -2, -1, 1, 2, 3]) {
    if (i < 0 && -i > before) continue;
    if (i > 0 && i > after) continue;
    const near = Math.abs(i) === 1;
    const size = (near ? 46 : 36) * k;
    add('thumb', { x: cx + i * gap - size / 2, y: y - size / 2, s: size, round: true, cls: `thumb own${near ? '' : ' far'}`, role: `line:${i}` });
  }
}

/** Deleting: the chips take · strand · part (no labels, the order says it). */
function deleteChips({ cx, k, add }) {
  ['take', 'strand', 'part'].forEach((what, i) => {
    add('chip', { x: cx - 120 * k + i * 84 * k, y: 642 * k, w: 76 * k, h: 32 * k, text: '', cls: `chip ${i ? 'wait' : 'own'} ${what}`, role: `delete:${what}` });
  });
}

function pointClass(st) {
  if (st.screen === 'record') return 'point recording';
  if (st.screen === 'wait') return 'point waiting';
  if (st.screen === 'line') return 'point line';
  return 'point';
}

// ---------- shapes → SVG ----------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const roleOf = (s) => (s.role ? ` data-role="${esc(s.role)}"` : '');

function arcPath({ cx, cy, r, from, to }) {
  const [x1, y1] = onCircle(cx, cy, r, from);
  const [x2, y2] = onCircle(cx, cy, r, to);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const SVG = {
  bubble: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" class="${s.cls}"${roleOf(s)}/>`,
  circle: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  arc: (s) => `<path d="${arcPath(s)}" class="${s.cls}"${roleOf(s)}/>`,
  line: (s) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" class="${s.cls}"${roleOf(s)}/>`,
  path: (s) => `<path d="${s.d}" class="${s.cls}"${roleOf(s)}/>`,
  label: (s) => `<text x="${s.x}" y="${s.y}" text-anchor="middle" class="${s.cls}">${esc(s.text)}</text>`,
  video: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="${s.cls}"${roleOf(s)}/>`,
  thumb: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${s.round ? s.s / 2 : 12}" class="${s.cls}"${roleOf(s)}/>`,
  chip: (s) => `<g class="${s.cls}"${roleOf(s)}>`
    + `<rect x="${s.x}" y="${s.y - s.h / 2}" width="${s.w}" height="${s.h}" rx="${s.h / 2}"/>`
    + `<text x="${s.x + s.w / 2}" y="${s.y + 5}" text-anchor="middle">${esc(s.text)}</text></g>`,
  point: (s) => {
    const core = s.cls.includes('recording')
      ? `<rect x="${s.cx - 16}" y="${s.cy - 16}" width="32" height="32" rx="8" class="core"/>` // stop
      : `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="core"/>`;
    return `<g class="${s.cls}"${roleOf(s)}><circle cx="${s.cx}" cy="${s.cy}" r="${(s.d / 2) * 1.35}" class="ring"/>${core}</g>`;
  },
};

/** Shapes → one SVG (the picture itself is a <video> element placed at layout().video). */
export function toSvg({ shapes }, { w = 390, h = 844 } = {}) {
  const inner = shapes.map((s) => SVG[s.type]?.(s) ?? '').join('');
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
