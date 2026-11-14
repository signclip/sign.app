// view/ring.js — how the screen looks: the window with four arcs around it. The one file to swap for another
// arrangement (later glasses.js); state and gestures stay.
//
// Purpose:   state (state.js) + what is there (chips, levels, Similar, line) → shapes → SVG. Decided 13.11.:
//              window   a circle, as large as fits (or an ellipse / a rounded rectangle, own settings; shape.js);
//                       the rest of the 1080 × 1080 field stays visible, greyed
//              arcs     by degrees around the window, 0° = top, clockwise (ARCS):
//                         line     −60 … 60   through the point (arc.js); earlier lines of a chain under it
//                         audio     60 … 140  the audio strand, out at the screen's edge (14.11.); level ticks inward,
//                                             in the room between window and arc
//                         context  140 … 220  the context field below it (chips; pulled down = open, writing:
//                                             the arc straightens into the field, animated)
//                         visual   220 … 300  video without sound (landmarks get their track with S5); on it a small
//                                              point: picture (14.11.): on = the point becomes a photo button
//                       look: new = pale (will be recorded) · keep = solid · off = thin grey (state.look); 5° apart
//                       · hold = thick green: held by one finger as the property for the other (parallel)
//              flows    a short arc across the meeting of two arcs: audio → context (Whisper) at 140°, visual →
//                       context (own modelling, later) at 220°
//              point    at 0° on the line, its outer ring touching the window; recording = a square
//              Similar  brought in at the top: many tiles (metadata and strand choice as chips above them); a tile
//                       dragged onto the line or the point, or all of them at once, go onto the chain (animated)
//              chips    under the window: sticky in front in one bubble, then this take (chips.js)
//              stretched  a line or a live take as parallel threads in one time span (timeline.js)
//              template a template (Vorlage) small and blue, lower left inside the window
//              hint     onboarding: the next element breathes, a pale point does its gesture (hint.js)
//            No labels (decided 08.11.). Colours only as classes (index.html): own, other, wait, now,
//            later, keep, off, hold; never colour alone — dashed, filled or a shape says it too.
// Depends:   9-ui/state.js (look), shape.js, arc.js, chips.js, timeline.js, hint.js
// Test:      tests/view.test.mjs
// Limits:    phone 390 × 844 as the unit, scaled to any width; the circle is as large as lets the line's ends
//            (±60°) stay on screen: 352 px on 390 px; ≤ 12 Similar tiles; chips one row; one layout < 1 ms.

import { look, KINDS } from '../state.js';
import { chipShapes } from './chips.js';
import { timelineShapes } from './timeline.js';
import { withHint } from './hint.js';
import { arcShapes } from './arc.js';
import { windowOf, onShape, pointsOn, pathThrough, outlinePath, extentOf } from './shape.js';

/** The four arcs around the window in degrees (0 = top, clockwise); the line is the upper one. */
export const ARCS = Object.freeze({ line: [-60, 60], a: [60, 140], x: [140, 220], v: [220, 300] }); // fixed by the user (13.11.), keep
/** Space between two arcs: this many degrees off each end. */
const GAP = 5;
/** Where each strand sits on a tile of the sharing menu: the same sides as on the field. */
export const SIDES = Object.freeze({ v: 'left', l: 'left', a: 'right', x: 'bottom' });
/** A second track on the same arc sits a little further out. */
const TRACK = Object.freeze({ l: 1 });
/** Flows (settings.flows): the angle where the two arcs meet. */
export const FLOWS = Object.freeze({ 'a>x': 140, 'v>x': 220 });

/** The straight part of one side of a rounded square { x, y, s, r } → a line (tiles of the sharing menu). */
export function sideOf(side, { x, y, s, r }, out = 0) {
  if (side === 'top') return { x1: x + r, y1: y - out, x2: x + s - r, y2: y - out };
  if (side === 'bottom') return { x1: x + r, y1: y + s + out, x2: x + s - r, y2: y + s + out };
  if (side === 'left') return { x1: x - out, y1: y + r, x2: x - out, y2: y + s - r };
  return { x1: x + s + out, y1: y + r, x2: x + s + out, y2: y + s - r };
}

const POINT_D = 62, RING = 1.35; // the point; toSvg draws its ring at 1.35 × its radius

/**
 * st: state.js · data: { shape, chips, timeMs, levels: [0–1], similar: [key], line: { count, at }, versions, bend,
 * levelsOpen, push, arrive, flows, flowsRunning, items, template, hint } · size: { w, h }.
 * → { video, template, point, window, shapes }
 */
export function layout(st, data = {}, { w = 390, h = 844 } = {}) {
  const k = w / 390; // everything is drawn for a 390 px phone and scaled
  const d = POINT_D * k, ring = (d / 2) * RING;
  const F = Math.min(w - 16 * k, 2 * ((w / 2 - 6 * k) / Math.sin(Math.PI / 3) - ring)); // the line's ends stay on screen
  const cy = (st.screen === 'delete' ? 424 : 404) * k;
  const win = windowOf(data.shape ?? 'circle', { cx: w / 2, cy, F });
  const g = { st, data, w, h, k, cx: w / 2, cy, F, win, ring, shapes: [] };
  g.add = (type, o) => g.shapes.push({ type, ...o });

  const video = st.full ? { cx: g.cx, cy: h / 2, d: Math.max(w, h), radius: 0 } : { cx: g.cx, cy, d: F, radius: 18 * k, window: win };
  const [px, py] = onShape(win, 0, ring);
  const point = st.full ? { cx: g.cx, cy: h - 80 * k, d } : { cx: px, cy: py, d }; // its outer ring touches the window
  const stretched = Boolean(data.items?.length) && ['line', 'record', 'stream'].includes(st.screen);

  if (!st.full) {
    g.add('rest', { field: { x: g.cx - F / 2, y: cy - F / 2, s: F, r: 18 * k }, win, cls: 'field-rest' }); // greyed outside the window
    strandArcs(g);
    photoPoint(g);
    soundBars(g);
    flowArcs(g);
  }
  g.add('video', { ...video, cls: st.screen === 'delete' ? 'video faded' : 'video' });
  if (!stretched) chipArea(g, point);
  const template = templateVideo(g);
  if (stretched) g.shapes.push(...timelineShapes(data.items, { timeMs: data.timeMs ?? 0, sub: st.sub ?? 'play', cx: g.cx, y: point.cy, k, w }));
  else if (!st.full) g.shapes.push(...arcShapes(win, ring, { ...data, bend: data.bend ?? (st.sub === 'spread' ? 0 : 1) }, { k, w }));
  if (st.similar) similarTiles(g, point);
  if (st.screen === 'delete') deleteChips(g);
  g.add('point', { ...point, cls: `${pointClass(st)}${data.photo ? ' photo' : ''}`, role: 'point' });

  return { video, template, point, window: win, shapes: withHint(g.shapes, data.hint, { w, h, k }) };
}

/** One arc per strand, 2° short of its neighbours: new (dashed) · keep (solid) · off (grey); recording turns new solid. */
function strandArcs({ st, data, win, k, w, h, add }) {
  for (const kind of KINDS) {
    if (data.hidden?.includes(kind) || !ARCS[kind]) continue; // hidden: still records when on
    const looks = look(st, kind);
    const live = st.screen === 'record' && looks === 'new';
    const [from, to] = ARCS[kind];
    const out = kind === 'a' ? audioOut({ win, w, k }) : (6 + 9 * (TRACK[kind] ?? 0)) * k;
    let pts = pointsOn(win, from + GAP, to - GAP, out);
    if (kind === 'x' && data.open) pts = straighten(pts, data.open, { w, h, k }); // opening: the arc becomes the field
    const dd = pathThrough(pts);
    const mid = onShape(win, (from + to) / 2, out); // for hints (hint.js)
    add('path', { d: dd, mid, cls: `strand ${live ? 'own' : looks}${TRACK[kind] ? ' thin' : ''}`, role: `strand:${kind}` });
    add('path', { d: dd, cls: 'hit', role: `strand:${kind}` }); // a wider, unseen line to hit
  }
}

/** The context arc on its way to the field (t 0 → 1): each point slides to a straight line where the field opens. */
function straighten(pts, t, { w, h, k }) {
  const y = h - 40 * k, x0 = 12 * k, x1 = w - 12 * k; // the field: 12 px in from both sides, at the bottom
  const e = t * t * (3 - 2 * t); // ease in and out
  return pts.map(([x, yy], i) => {
    const tx = x1 - ((x1 - x0) * i) / (pts.length - 1); // the arc runs clockwise: right to left at the bottom
    return [x + (tx - x) * e, yy + (y - yy) * e];
  });
}

/** The picture point on the visual arc: on = a take is one picture (.v.png, lossless), the point a photo button. */
function photoPoint({ data, win, k, add }) {
  const [from, to] = ARCS.v;
  const [cx, cy] = onShape(win, (from + to) / 2, 6 * k); // on the arc itself: the arc reaches the screen's edge
  add('circle', { cx, cy, r: 10 * k, cls: `photo${data.photo ? ' on' : ''}`, role: 'photo' });
}

/** Flows across the meeting of two arcs: solid = running, dashed = waiting for its model. */
function flowArcs({ data, win, k, add }) {
  for (const flow of data.flows ?? []) {
    const deg = FLOWS[flow];
    if (deg == null) continue;
    add('path', { d: pathThrough(pointsOn(win, deg - 14, deg + 14, 18 * k, 2)), cls: `flow ${data.flowsRunning?.includes(flow) ? 'own' : 'waiting'}`, role: `flow:${flow}` });
  }
}

/** How far out the audio arc lies: at its widest point 5 px from the screen's right edge. */
const audioOut = ({ win, w, k }) => Math.max(6 * k, w - 5 * k - onShape(win, 90, 0)[0]);

/** The sound level as ticks inward from the audio arc: the room between it and the window. */
function soundBars({ data, win, w, k, add }) {
  const [from, to] = ARCS.a;
  const out = audioOut({ win, w, k });
  (data.levels ?? []).slice(0, 20).forEach((level, i) => {
    const deg = from + 3 + ((to - from - 6) * i) / 19;
    const [x1, y1] = onShape(win, deg, out - 6 * k);
    const [x2, y2] = onShape(win, deg, Math.max(2 * k, out - 6 * k - (out - 8 * k) * level));
    add('line', { x1, y1, x2, y2, cls: 'bar own' });
  });
}

/** Chips under the window (the context arc); in full-screen replay above the point; in a plain line none. */
function chipArea({ st, data, cx, cy, win, k, w, shapes }, point) {
  if (st.screen === 'line') return;
  if (st.full && st.mode !== 'line') return;
  const y = st.full ? point.cy - 70 * k : cy + extentOf(win)[1] + 34 * k;
  const held = st.hold?.target === 'chip' ? [`chip:${st.hold.text}`, `gesture:${st.hold.text}`] : [];
  shapes.push(...chipShapes(data.chips, { timeMs: data.timeMs, cx, y, k, w })
    .map((s) => (held.includes(s.role) ? { ...s, cls: `${s.cls} hold` } : s))); // the held context, as property
}

/** A template (Vorlage) beside the own take: smaller, blue, lower left inside the window. */
function templateVideo({ st, data, win, k, add }) {
  if (!data.template || st.full) return null;
  const [ex, ey] = extentOf(win);
  const template = { cx: win.cx - ex * 0.55, cy: win.cy + ey * 0.55, d: 88 * k };
  add('video', { ...template, cls: 'video other template', role: 'template' });
  return template;
}

/** Similar at the top: tiles in rows above the line (metadata and strand choice sit as chips above, #similar). */
function similarTiles({ data, w, k, add }, point) {
  const keys = data.similar ?? [];
  const size = 56 * k, gap = 6 * k, top = 64 * k;
  const cols = Math.max(1, Math.floor((w - gap) / (size + gap)));
  const rows = Math.max(1, Math.floor((point.cy - (point.d / 2) * RING - 12 * k - top) / (size + gap)));
  const x0 = (w - (cols * size + (cols - 1) * gap)) / 2;
  add('sheet', { x: 0, y: top - gap, w, h: rows * (size + gap) + gap, r: 0, cls: 'similar-band', role: 'similar-band' });
  keys.slice(0, cols * rows).forEach((_, i) => {
    add('thumb', { x: x0 + (i % cols) * (size + gap), y: top + Math.floor(i / cols) * (size + gap), s: size, cls: 'thumb other', role: `similar:${i}` });
  });
}

/** Deleting: the chips take · strand · part (no labels, the order says it). */
function deleteChips({ cx, cy, win, k, add }) {
  ['take', 'strand', 'part'].forEach((what, i) => {
    add('chip', { x: cx - 120 * k + i * 84 * k, y: cy + extentOf(win)[1] + 84 * k, w: 76 * k, h: 32 * k, text: '', cls: `chip ${i ? 'wait' : 'own'} ${what}`, role: `delete:${what}` });
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

/** A point on a circle: centre, radius, degrees from the top (clockwise). */
function onCircle(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

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
  rest: (s) => `<path d="${rounded(s.field)} ${outlinePath(s.win)}" fill-rule="evenodd" class="${s.cls}"/>`,
  bubble: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" class="${s.cls}"${roleOf(s)}/>`,
  circle: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  arc: (s) => `<path d="${arcPath(s)}" class="${s.cls}"${roleOf(s)}/>`,
  line: (s) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" class="${s.cls}"${roleOf(s)}/>`,
  path: (s) => `<path d="${s.d}" class="${s.cls}"${roleOf(s)}/>`,
  sheet: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  label: (s) => `<text x="${s.x}" y="${s.y}" text-anchor="middle" class="${s.cls}">${esc(s.text)}</text>`,
  video: (s) => (s.window ? `<path d="${outlinePath(s.window)}" class="${s.cls}"${roleOf(s)}/>` : `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="${s.cls}"${roleOf(s)}/>`),
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
