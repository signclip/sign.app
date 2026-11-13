// view/ring.js — how the screen looks: fassung A, with threads (B) and layers (C). The one file
// to swap for another arrangement (threads.js, layers.js, later glasses.js); state and gestures stay.
//
// Purpose:   state (state.js) + what is there (chips, levels, Similar, line) → shapes → SVG.
//              field    the whole 1080 × 1080 picture, almost the full width (13.11.): a rounded square
//                       window in it is clear, the rest of the field stays visible, greyed
//              sides    the four sides right around the window, the same everywhere (SIDES, also the tiles
//                       of the sharing menu; decided 13.11.): left visual (picture, stream, video without
//                       sound; landmarks as a thin second track) · right audio (level ticks) · top the line,
//                       through the point (arc.js) · bottom the context field (chips below)
//              flows    a connection drawn from one side to another around the corner between them: audio →
//                       context (Whisper), later visual → context (own modelling, suggestions)
//                       look: new = dashed (will be recorded) · keep = solid · off = grey (state.look)
//                       · hold = thick green: held by one finger as the property for the other (parallel)
//              point    on top, its outer ring only touching the window's edge (13.11.: the current line of a
//                       chain is on top); recording = a square
//              line     a playlist in an arc over the point, older lines of the chain pale under it (arc.js)
//              layers   older versions of the chain as pale rings behind (C): editing = one more on top
//              Similar  arcs out of the upper-right corner, results at their ends (B, chosen 08.11.)
//              chips    under the ring, clustered, stable below (chips.js); in full-screen replay above the point
//              stretched  a line or a live take as parallel threads in one time span (timeline.js)
//              template a template (Vorlage) small and blue at the upper left, beside the own take
//              hint     onboarding: the next element breathes, a pale point does its gesture (hint.js)
//            No labels (decided 08.11.). Colours only as classes (index.html): own, other, wait, now,
//            later, keep, off, hold; never colour alone — dashed, filled or a shape says it too.
// Depends:   9-ui/state.js (look), chips.js, timeline.js
// Test:      tests/view.test.mjs
// Limits:    phone 390 × 844 as the unit, scaled to any width; field = width − 16 px, window inset 18 px,
//            corner radius 64 px; ≤ 3 layers, ≤ 3 Similar arcs, ≤ 6 line neighbours, chips at most 2 rows;
//            one layout < 1 ms.

import { look, KINDS } from '../state.js';
import { chipShapes } from './chips.js';
import { timelineShapes } from './timeline.js';
import { withHint } from './hint.js';
import { arcShapes } from './arc.js';

/** Where each strand sits, the same on the field and on every tile (view/points.js). The top is the line. */
export const SIDES = Object.freeze({ v: 'left', l: 'left', a: 'right', x: 'bottom' });
/** A second track on the same side sits a little further out. */
const TRACK = Object.freeze({ l: 1 });
/** Flows between sides (settings.flows): the corner they go around. */
export const FLOWS = Object.freeze({ 'a>x': 'bottom-right', 'v>x': 'bottom-left' });

// The field on the 390 px phone: margin to the screen edge, window inset, window corner radius.
const MARGIN = 8, INSET = 18, CORNER = 64;

/** The straight part of one side of a rounded square { x, y, s, r } → a line { x1, y1, x2, y2 }. */
export function sideOf(side, { x, y, s, r }, out = 0) {
  if (side === 'top') return { x1: x + r, y1: y - out, x2: x + s - r, y2: y - out };
  if (side === 'bottom') return { x1: x + r, y1: y + s + out, x2: x + s - r, y2: y + s + out };
  if (side === 'left') return { x1: x - out, y1: y + r, x2: x - out, y2: y + s - r };
  return { x1: x + s + out, y1: y + r, x2: x + s + out, y2: y + s - r };
}

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
 * versions: n, items: a stretched line (timeline.js), template: true, hint: { role, gesture } } · size: { w, h }.
 * → { video, template, point, shapes }
 */
export function layout(st, data = {}, { w = 390, h = 844 } = {}) {
  const k = w / 390; // everything is drawn for a 390 px phone and scaled
  const F = w - 2 * MARGIN * k; // the 1080 × 1080 field
  const cy = (st.screen === 'delete' ? 424 : 404) * k; // room above for the point and the arc of the line
  const win = { x: w / 2 - F / 2 + INSET * k, y: cy - F / 2 + INSET * k, s: F - 2 * INSET * k, r: CORNER * k };
  const g = { st, data, w, h, k, cx: w / 2, cy, F, win, shapes: [] };
  g.add = (type, o) => g.shapes.push({ type, ...o });

  const video = st.full ? { cx: g.cx, cy: h / 2, d: Math.max(w, h), radius: 0 } : { cx: g.cx, cy, d: F, radius: 18 * k, window: win };
  const d = 62 * k, ring = (d / 2) * 1.35; // the point's outer ring (toSvg draws it at 1.35 × its radius)
  const point = { cx: g.cx, cy: st.full ? h - 80 * k : win.y - ring, d }; // outer ring touches the window, nothing more
  const stretched = Boolean(data.items?.length) && ['line', 'record', 'stream'].includes(st.screen);

  if (!st.full) {
    g.add('rest', { field: { x: g.cx - F / 2, y: cy - F / 2, s: F, r: 18 * k }, win, cls: 'field-rest' }); // greyed outside the window, under the bars
    layersBehind(g);
    strandArcs(g);
    soundBars(g);
    flowArcs(g);
  }
  g.add('video', { ...video, cls: st.screen === 'delete' ? 'video faded' : 'video' });
  if (!stretched) chipArea(g, point);
  const template = templateVideo(g);
  if (st.similar) similarThreads(g);
  if (stretched) g.shapes.push(...timelineShapes(data.items, { timeMs: data.timeMs ?? 0, sub: st.sub ?? 'play', cx: g.cx, y: point.cy, k, w }));
  else if (!st.full) g.shapes.push(...arcShapes(point, { ...data, bend: data.bend ?? (st.sub === 'spread' ? 0 : 1) }, { k, w, win }));
  if (st.screen === 'delete') deleteChips(g);
  g.add('point', { ...point, cls: pointClass(st), role: 'point' });

  return { video, template, point, shapes: withHint(g.shapes, data.hint, { w, h, k }) };
}

/** C: older versions of the chain as pale rounded squares behind, at most three. */
function layersBehind({ data, win, k, add }) {
  const behind = Math.min(3, (data.versions ?? 1) - 1);
  for (let i = behind; i >= 1; i--) add('rect', { ...win, x: win.x - 8 * i * k, y: win.y - 8 * i * k, cls: 'layer' });
}

/** One bar per strand on the window's edge: new (dashed) · keep (solid) · off (grey); recording turns new solid. */
function strandArcs({ st, data, win, k, add }) {
  for (const kind of KINDS) {
    if (data.hidden?.includes(kind)) continue; // hidden field: still records when on
    const looks = look(st, kind);
    const live = st.screen === 'record' && looks === 'new';
    const bar = sideOf(SIDES[kind], win, (4 + 9 * (TRACK[kind] ?? 0)) * k); // just outside the window, on the greyed rest
    const thin = TRACK[kind] ? ' thin' : '';
    add('edge', { ...bar, cls: `strand ${live ? 'own' : looks}${thin}`, role: `strand:${kind}` });
    add('edge', { ...bar, cls: 'hit', role: `strand:${kind}` }); // a wider, unseen line to hit
  }
}

/** Flows around a corner (audio → context …): solid = running, dashed = waiting for its model. */
function flowArcs({ data, win, k, add }) {
  for (const flow of data.flows ?? []) {
    const corner = FLOWS[flow];
    if (!corner) continue;
    const out = 4 * k, r = win.r + out;
    const right = corner.endsWith('right');
    const sx = right ? win.x + win.s + out : win.x - out; // on the side bar, where the corner begins
    const sy = win.y + win.s - win.r;
    const ex = right ? win.x + win.s - win.r : win.x + win.r; // on the bottom bar
    const ey = win.y + win.s + out;
    const sweep = right ? 1 : 0;
    add('path', { d: `M ${sx} ${sy} A ${r} ${r} 0 0 ${sweep} ${ex} ${ey}`, cls: `flow ${data.flowsRunning?.includes(flow) ? 'own' : 'waiting'}`, role: `flow:${flow}` });
  }
}

/** B: the sound level as ticks above the top bar. */
function soundBars({ data, win, k, add }) {
  const { y1, y2, x1 } = sideOf(SIDES.a, win, 10 * k);
  const levels = (data.levels ?? []).slice(0, 20);
  levels.forEach((level, i) => {
    const y = y1 + ((y2 - y1) * (i + 0.5)) / 20;
    add('line', { x1, y1: y, x2: x1 + (4 + 14 * level) * k, y2: y, cls: 'bar own' }); // outward, to the right
  });
}

/** Chips under the ring; in full-screen replay above the point; in a plain line none (the thread shows it). */
function chipArea({ st, data, cx, cy, F, k, w, shapes }, point) {
  if (st.screen === 'line') return;
  if (st.full && st.mode !== 'line') return;
  const y = st.full ? point.cy - 70 * k : cy + F / 2 + 30 * k;
  const held = st.hold?.target === 'chip' ? [`chip:${st.hold.text}`, `gesture:${st.hold.text}`] : [];
  shapes.push(...chipShapes(data.chips, { timeMs: data.timeMs, cx, y, k, w })
    .map((s) => (held.includes(s.role) ? { ...s, cls: `${s.cls} hold` } : s))); // the held context, as property
}

/** A template (Vorlage) beside the own take: smaller, blue, upper left, plays in the same time. */
function templateVideo({ st, data, win, k, add }) {
  if (!data.template || st.full) return null;
  const template = { cx: win.x + 52 * k, cy: win.y + win.s - 52 * k, d: 88 * k }; // lower left inside the window, clear of the line
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

/** Deleting: the chips take · strand · part (no labels, the order says it). */
function deleteChips({ cx, k, add }) {
  ['take', 'strand', 'part'].forEach((what, i) => {
    add('chip', { x: cx - 120 * k + i * 84 * k, y: 642 * k, w: 76 * k, h: 32 * k, text: '', cls: `chip ${i ? 'wait' : 'own'} ${what}`, role: `delete:${what}` });
  });
}

function pointClass(st) {
  const with_ = st.hold ? ' with' : ''; // a property is held: the point acts on it (parallel gesture)
  if (st.screen === 'record') return `point recording${with_}`;
  if (st.screen === 'wait') return `point waiting${with_}`;
  if (st.screen === 'line') return `point line${with_}`;
  return `point${with_}`;
}

// ---------- shapes → SVG ----------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const roleOf = (s) => (s.role ? ` data-role="${esc(s.role)}"` : '');

function arcPath({ cx, cy, r, from, to }) {
  const [x1, y1] = onCircle(cx, cy, r, from);
  const [x2, y2] = onCircle(cx, cy, r, to);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** A rounded square as a path (clockwise); reversed = a hole when drawn with fill-rule evenodd. */
const rounded = ({ x, y, s, r }) => `M ${x + r} ${y} H ${x + s - r} A ${r} ${r} 0 0 1 ${x + s} ${y + r} V ${y + s - r} A ${r} ${r} 0 0 1 ${x + s - r} ${y + s} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + s - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;

const SVG = {
  rect: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  edge: (s) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" class="${s.cls}"${roleOf(s)}/>`,
  rest: (s) => `<path d="${rounded(s.field)} ${rounded(s.win)}" fill-rule="evenodd" class="${s.cls}"/>`,
  bubble: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" class="${s.cls}"${roleOf(s)}/>`,
  circle: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  arc: (s) => `<path d="${arcPath(s)}" class="${s.cls}"${roleOf(s)}/>`,
  line: (s) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" class="${s.cls}"${roleOf(s)}/>`,
  path: (s) => `<path d="${s.d}" class="${s.cls}"${roleOf(s)}/>`,
  sheet: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  label: (s) => `<text x="${s.x}" y="${s.y}" text-anchor="middle" class="${s.cls}">${esc(s.text)}</text>`,
  video: (s) => (s.window ? `<path d="${rounded(s.window)}" class="${s.cls}"${roleOf(s)}/>` : `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="${s.cls}"${roleOf(s)}/>`),
  thumb: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${s.round ? s.s / 2 : 12}" class="${s.cls}"${roleOf(s)}/>`,
  chip: (s) => `<g class="${s.cls}"${roleOf(s)}>`
    + `<rect x="${s.x}" y="${s.y - s.h / 2}" width="${s.w}" height="${s.h}" rx="${s.h / 2}"/>`
    + `<text x="${s.x + s.w / 2}" y="${s.y + 5}" text-anchor="middle">${esc(s.text)}</text></g>`,
  hint: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}" style="--dx:${s.dx}px;--dy:${s.dy}px"/>`,
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
