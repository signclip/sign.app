// view/ring.js — how the screen looks: the window with four arcs around it. The one file to swap for another
// arrangement (later glasses.js); state and gestures stay.
//
// Purpose:   state (state.js) + what is there (chips, levels, Similar, line) → shapes → SVG. Decided 13.11.:
//              window   a circle, as large as fits (or an ellipse / a rounded rectangle: ↑/↓ on the picture; shape.js);
//                       the rest of the 1080 × 1080 field stays visible, greyed
//              arcs     by degrees around the window, 0° = top, clockwise (ARCS):
//                         line     −60 … 60   through the point (arc.js); earlier lines of a chain under it
//                         audio     60 … 140  the audio strand, close around the window like the others; the
//                                             sound pulses outward in the room up to the screen's edge (14.11.)
//                         context  140 … 220  the context field below it (chips; pulled down = open, writing:
//                                             the arc straightens into the field, animated)
//                         landmarks −30 … 30 close around the window under the point, slightly wavy (14.11.)
//                         visual   220 … 300  video without sound; on it a small
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
export const ARCS = Object.freeze({ line: [-60, 60], a: [60, 140], x: [140, 220], v: [220, 300], l: [-30, 30] }); // fixed by the user (13.11.), keep; l (14.11.): short, wavy, at the top
/** The golden ratio: the free part above the arcs in viele ganz is 1/φ ≈ 62 % of the height. */
export const PHI = (1 + Math.sqrt(5)) / 2;
/** Space between two arcs: this many degrees off each end. */
const GAP = 5;
/** Where each strand sits on a tile of the sharing menu: the same sides as on the field. */
export const SIDES = Object.freeze({ v: 'left', l: 'top', a: 'right', x: 'bottom' });
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
  const double = Boolean(st.similar && data.double && !st.full); // Similar · Doppel: the reference above, the live picture below
  const many = Boolean(st.similar && !double && !st.full); // Similar · viele: half (above the line, to drag into it) or full
  const half = many && !data.manyFull, low = double || many; // the take window moves down, the upper half is free
  const grow = many && !half ? data.grow ?? 1 : 0; // viele ganz: the arcs bend out to the screen's edges (0 → 1, animated)
  const F0 = Math.min(w - 16 * k, 2 * ((w / 2 - 6 * k) / Math.sin(Math.PI / 3) - ring)) - 12 * k; // the line's ends stay on screen; 12 px more room at the sides for the sound (14.11.)
  const lowness = data.lowT ?? (low ? 1 : 0); // 0 = the take window in the middle, 1 = moved down (animated, 14.11.)
  const FL = Math.min(F0, (h - 130 * k - 2 * ring - 8 * k) / 2); // two windows, the point between them
  const F = F0 + (FL - F0) * lowness;
  const cyMid = (st.screen === 'delete' ? 424 : 404) * k, cyLow = h - 60 * k - FL / 2;
  const cy = cyMid + (cyLow - cyMid) * lowness;
  const win = windowOf(data.shape ?? 'circle', { cx: w / 2, cy, F });
  const top = h / PHI; // viele ganz (14.11.): the arcs frame the lower 38 %, the upper 62 % stays free (golden ratio): room for A–Z one under the other (26 × ≈ 18 px ≈ 470 px of 520 on a phone)
  const edge = { x0: 14 * k, x1: w - 14 * k, y0: top, y1: h - 14 * k, r: 28 * k }; // an open U: right edge down, along the bottom, left edge up
  const [, winBottom] = onShape(win, 180, 0);
  const fieldY = Math.min(winBottom + ((data.open ?? 0) > 0.5 ? 72 : 40) * k, (data.viewH ?? h) - 34 * k); // the typing row right under the bottom arc (open: the chip row above it, the box starts under the arc); above the keyboard
  const g = { st, data, w, h, k, cx: w / 2, cy, F, win, ring, shapes: [], edge: grow ? edge : null, grow, fieldY };
  g.add = (type, o) => g.shapes.push({ type, ...o });

  const video = st.full ? { cx: g.cx, cy: h / 2, d: Math.max(w, h), radius: 0 } : { cx: g.cx, cy, d: F, radius: 18 * k, window: win };
  const [px, py] = onShape(win, 0, ring);
  const point = st.full ? { cx: g.cx, cy: h - 80 * k, d } : { cx: px, cy: py, d }; // its outer ring touches the window
  const stretched = Boolean(data.items?.length) && ['line', 'record', 'stream'].includes(st.screen);

  const [, pyLow] = onShape(win, 0, ring);
  if (many && !half) similarTiles(g, pyLow - ring - 10 * k + (h - pyLow + ring + 10 * k) * grow); // full: down to the bottom, only arcs and context on top
  if (!st.full) {
    if (!many || half) g.add('rest', { field: { x: g.cx - F / 2, y: cy - F / 2, s: F, r: 18 * k }, win, cls: 'field-rest' }); // nothing shows outside the window (14.11.)
    if (!many && !double) for (const [c, sx, sy] of [['bl', -1, 1], ['br', 1, 1]]) { // the lower corners (the line lies over the upper ones): drag = rounder / squarer
      g.add('circle', { cx: g.cx + sx * (win.rx ?? win.hw) * 0.86, cy: cy + sy * (win.ry ?? win.hh) * 0.86, r: 30 * k, cls: 'corner', role: `corner:${c}` });
    }
    strandArcs(g);
    if (!many || half) { photoPoint(g); soundBars(g); }
    if (!grow) flowArcs(g);
  }
  if (!many || half) g.add('video', { ...video, cls: st.screen === 'delete' ? 'video faded' : 'video' });
  if (!stretched) chipArea(g, point);
  const template = double ? referenceWindow(g, point) : templateVideo(g);
  if (stretched) g.shapes.push(...timelineShapes(data.items, { timeMs: data.timeMs ?? 0, sub: st.sub ?? 'play', zoom: data.timeZoom ?? 1, cx: g.cx, y: point.cy, k, w }));
  else if (!st.full && !double && (!many || half)) g.shapes.push(...arcShapes(win, ring, { ...data, bend: data.bend ?? (st.sub === 'spread' ? 0 : 1) }, { k, w }));
  if (st.screen === 'delete') deleteChips(g);
  if (data.waits && !st.full) { // pinching the waits: inner ring = start, outer = stop (1 s ≈ 8 px)
    g.add('circle', { cx: point.cx, cy: point.cy, r: ring + (4 + data.waits.startMs / 125) * k, cls: 'wait-ring start' });
    g.add('circle', { cx: point.cx, cy: point.cy, r: ring + (4 + data.waits.stopMs / 125) * k, cls: 'wait-ring stop' });
  }
  if (st.full) { // review: where it comes from, in colour and in form: own = a solid edge (coral), from Similar = dashed (blue)
    const other = data.fullFrom === 'similar';
    for (let x = 0; x < w; x += other ? 18 * k : w) g.add('sheet', { x, y: 0, w: other ? 12 * k : w, h: 5 * k, r: 0, cls: `from ${other ? 'other' : 'own'}` });
  }
  if (half) similarTiles(g, point.cy - ring - 10 * k); // half: above the line, a result can be dragged onto it
  if (data.feedback && !many) { // saved: a green ring going out · gone: a red dashed ring going in (R7); p 0 → 1 over 0.9 s
    const p = data.feedbackP ?? 0;
    g.add('circle', { cx: point.cx, cy: point.cy, r: ring + (data.feedback === 'saved' ? 4 + 26 * p : 30 - 26 * p) * k, fade: 1 - p, cls: `feedback ${data.feedback}` });
  }
  if (!many || half) g.add('point', { ...point, cls: `${pointClass(st)}${data.photo ? ' photo' : ''}`, role: 'point' });

  return { video, template, point, window: win, fieldY, hideLive: many && !half, shapes: withHint(g.shapes, data.hint, { w, h, k }) };
}

/** One arc per strand, 2° short of its neighbours: new (dashed) · keep (solid) · off (grey); recording turns new solid. */
function strandArcs({ st, data, win, k, w, h, add, edge, grow, fieldY }) {
  for (const kind of KINDS) {
    if (data.hidden?.includes(kind) || !ARCS[kind]) continue; // hidden: still records when on
    const looks = look(st, kind);
    const live = st.screen === 'record' && looks === 'new';
    const [from, to] = ARCS[kind];
    const out = 6 * k; // every arc close around the window (14.11.)
    const along = (wn) => (kind === 'l' ? wave(wn, from, to, out, k) : pointsOn(wn, from + GAP, to - GAP, out));
    const onEdge = () => (kind === 'l' ? topWave(edge, pts.length, k) // landmarks: as long as before (60 of 240°), on top of the U
      : pts.map((_, i) => onU(edge, (from + GAP + Math.min(i * 3, to - from - 2 * GAP) - 60) / 240))); // 60…300° → the U from its right top to its left top: each arc keeps its share and order
    let pts = along(win);
    if (edge) { const e = grow * grow * (3 - 2 * grow); pts = onEdge().map(([x, y], i) => [pts[i][0] + (x - pts[i][0]) * e, pts[i][1] + (y - pts[i][1]) * e]); } // bent out to the edges
    if (kind === 'x' && data.open) pts = straighten(pts, data.open, { w, k, y: fieldY }); // opening: the arc becomes the field
    const dd = pathThrough(pts);
    const mid = onShape(win, (from + to) / 2, out); // for hints (hint.js)
    add('path', { d: dd, mid, cls: `strand ${live ? 'own' : looks}${kind === 'l' ? ' wave' : ''}`, role: `strand:${kind}` });
    add('path', { d: dd, cls: 'hit', role: `strand:${kind}` }); // a wider, unseen line to hit
  }
}

/** Landmarks: a short arc, one and a half gentle waves (±3 px), so it reads as points in motion. */
function wave(win, from, to, out, k) {
  const pts = [];
  for (let d = from; d <= to; d += 1) pts.push(onShape(win, d, out + 3 * k * Math.sin(((d - from) / (to - from)) * 3 * Math.PI)));
  return pts;
}

/**
 * Viele ganz (14.11., consistency): the arcs keep their order and their share of length. Around the window audio,
 * context and visual take 80° each of 60…300°; on the open U (right edge down, bottom, left edge up) each takes a
 * third, the gaps as before. s 0 → 1 = from the U's right top to its left top. → [x, y]
 */
export function onU({ x0, x1, y0, y1, r }, s) {
  const H = y1 - y0 - r, W = x1 - x0 - 2 * r, C = (Math.PI * r) / 2, L = 2 * H + W + 2 * C;
  let d = Math.max(0, Math.min(1, s)) * L;
  if (d <= H) return [x1, y0 + d];
  d -= H;
  if (d <= C) { const a = d / r; return [x1 - r + r * Math.cos(a), y1 - r + r * Math.sin(a)]; }
  d -= C;
  if (d <= W) return [x1 - r - d, y1];
  d -= W;
  if (d <= C) { const a = Math.PI / 2 + d / r; return [x0 + r + r * Math.cos(a), y1 - r + r * Math.sin(a)]; }
  d -= C;
  return [x0, y1 - r - d];
}

/** Landmarks on top of the U: a quarter of the U's length (60 of 240°), centred, gently waving; n points. */
function topWave({ x0, x1, y0, y1, r }, n, k) {
  const L = 2 * (y1 - y0 - r) + (x1 - x0 - 2 * r) + Math.PI * r;
  const len = Math.min(x1 - x0 - 2 * r, L / 4), cx = (x0 + x1) / 2;
  return Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [cx - len / 2 + len * t, y0 - 12 * k + 3 * k * Math.sin(t * 3 * Math.PI)]; });
}

/** The context arc on its way to the field (t 0 → 1): each point slides to a straight line where the field opens. */
function straighten(pts, t, { w, k, y }) {
  const x0 = 12 * k, x1 = w - 12 * k; // the field: 12 px in from both sides, right under the window
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

/** The sound pulsing outward from the audio arc, up to 3 px before the screen's edge: the newest level the longest. */
function soundBars({ data, win, w, k, add }) {
  const [from, to] = ARCS.a;
  const room = Math.max(4 * k, w - 3 * k - onShape(win, 90, 0)[0] - 12 * k); // from the arc's outer side to the edge
  (data.levels ?? []).slice(-20).forEach((level, i, all) => {
    const deg = from + 3 + ((to - from - 6) * i) / 19;
    const [x1, y1] = onShape(win, deg, 12 * k);
    const [x2, y2] = onShape(win, deg, 12 * k + room * Math.min(1, level));
    add('line', { x1, y1, x2, y2, cls: `bar own${i === all.length - 1 ? ' now' : ''}` });
  });
}

/** Chips under the window (the context arc); in full-screen replay above the point; in a plain line none. */
function chipArea({ st, data, cx, cy, win, k, w, shapes, fieldY }, point) {
  if (st.screen === 'line') return;
  if (st.full && st.mode !== 'line') return;
  const open = (data.open ?? 0) > 0.5; // the context field is open: the chips sit in it, its lowest row stays free to type
  const y = st.full ? point.cy - 70 * k : open ? fieldY - 42 * k : fieldY; // chips 32 px high, centred: they end 2 px above the typing row
  if (open && !st.full) shapes.push({ type: 'sheet', x: 12 * k, y: fieldY - 64 * k, w: w - 24 * k, h: 88 * k, r: 22 * k, cls: 'field-box' });
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

/** Most results at once (14.11.): 4 columns, as many rows as the screen holds (≈ 8 on a phone). */
export const MANY = 40;

/**
 * Similar · viele (14.11.), two ways: half = above the line in the upper half (the take window moves down, a result
 * can be dragged onto the line) · full = from the top to the bottom, on top only the strand arcs (what is searched)
 * and the context field; metadata (which sharing points, who, when) as chips above (#similar).
 * ↓ from the top: closed → half → full · ↑ on them: full → half → closed · tap = Doppel · ↓ on them = all onto the chain.
 */
function similarTiles({ data, w, h, k, add }, bottom = h) {
  const keys = data.similar ?? [];
  const cols = 4, gap = 6 * k, top = 56 * k, size = (w - gap * (cols + 1)) / cols;
  const rows = Math.max(1, Math.floor((bottom - top - gap) / (size + gap)));
  const x0 = gap, y0 = top - (1 - (data.reveal ?? 1)) * (bottom - top); // coming in: the tiles slide down from the top
  add('sheet', { x: 0, y: top - gap, w, h: bottom - top + gap, r: 0, cls: 'similar-band', role: 'similar-band' });
  keys.slice(0, Math.min(MANY, cols * rows)).forEach((key, i) => {
    add('thumb', { x: x0 + (i % cols) * (size + gap), y: y0 + Math.floor(i / cols) * (size + gap), s: size, href: data.thumbs?.[key], cls: 'thumb other', role: `similar:${i}` });
  });
}

/**
 * Similar · Doppel (14.11.): the reference in the same window above, the live picture below, the point between.
 * ↑ on it = back to viele · ←/→ = next / before · double-tap = full (review, like a line).
 */
function referenceWindow({ data, w, h, k, cx, F, win, ring, add }, point) {
  const cy = point.cy - ring - 4 * k - F / 2;
  const ref = windowOf(win.shape === 'super' ? win : win.shape, { cx, cy, F });
  add('rest', { field: { x: cx - F / 2, y: cy - F / 2, s: F, r: 18 * k }, win: ref, cls: 'field-rest' });
  add('video', { cx, cy, d: F, window: ref, cls: 'video other reference', role: 'reference' });
  return { cx, cy, d: F, radius: 18 * k, window: ref };
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
  rest: (s) => `<path d="${rounded({ x: s.field.x - 3, y: s.field.y - 3, s: s.field.s + 6, r: s.field.r + 3 })} ${outlinePath(s.win)}" fill-rule="evenodd" class="${s.cls}"/>`, // 3 px over the field's edge: no seam
  bubble: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" class="${s.cls}"${roleOf(s)}/>`,
  circle: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}"${s.fade != null ? ` style="opacity:${s.fade.toFixed(2)}"` : ''}${roleOf(s)}/>`,
  arc: (s) => `<path d="${arcPath(s)}" class="${s.cls}"${roleOf(s)}/>`,
  line: (s) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" class="${s.cls}"${roleOf(s)}/>`,
  path: (s) => `<path d="${s.d}" class="${s.cls}"${roleOf(s)}/>`,
  sheet: (s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" class="${s.cls}"${roleOf(s)}/>`,
  label: (s) => `<text x="${s.x}" y="${s.y}" text-anchor="middle" class="${s.cls}">${esc(s.text)}</text>`,
  video: (s) => (s.window ? `<path d="${outlinePath(s.window)}" class="${s.cls}"${roleOf(s)}/>` : `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="${s.cls}"${roleOf(s)}/>`),
  thumb: (s) => `${s.href ? `<image href="${esc(s.href)}" x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" preserveAspectRatio="xMidYMid slice" style="clip-path: inset(0 round ${s.round ? s.s / 2 : 12}px)"/>` : ''}<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${s.round ? s.s / 2 : 12}" class="${s.cls}${s.href ? ' seen' : ''}"${roleOf(s)}/>`,
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
