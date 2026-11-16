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
//                         landmarks a ~ as wide as the button, right under it (15.11.)
//                         visual   220 … 300  video without sound; on it a small
//                                              point: picture (14.11.): on = the point becomes a photo button
//                       look: new = pale (will be recorded) · keep = solid · off = thin grey (state.look); 5° apart
//                       · hold = thick green: held by one finger as the property for the other (parallel)
//              flows    a short arc across the meeting of two arcs: audio → context (Whisper) at 140°, visual →
//                       context (own modelling, later) at 220°
//              point    at 0° on the line, its outer ring touching the window; recording = a square
//              Similar  brought in at the top: many tiles (metadata and strand choice as chips above them); a tile
//                       dragged onto the line or the point, or all of them at once, go onto the chain (animated)
//              chips    on the window above the context arc (open: in the field); sticky in front in one bubble,
//                       then this take (chips.js); Doppel: the result's context on the reference window
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
import { chipShapes, rowHeight, splitNow, moveY } from './chips.js';
import { timelineShapes } from './timeline.js';
import { withHint } from './hint.js';
import { arcShapes } from './arc.js';
import { startShapes } from './start.js';
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
  let k = Math.min(w / 390, h / 760); // drawn for a 390 px phone, scaled to fit width and height (iPad: 15.11.)
  if (data.viewH && data.viewH < h * 0.85) { // the keyboard is up (15.11.): same size as before if point, window and field fit above it, else just as much smaller as needed
    h = data.viewH;
    for (let i = 0; i < 2; i++) { const need = keyboardNeed(k, w); if (need > h) k *= h / need; }
  }
  const cw = Math.min(w, 390 * k); // one column: the take as on a phone; wider screens have room beside it
  const d = POINT_D * k, ring = (d / 2) * RING;
  const double = Boolean(st.similar && data.double); // Similar · Doppel: the reference above, the live picture below
  const many = Boolean(st.similar && !double); // Similar · viele: half (above the line, to drag into it) or full
  const half = many && !data.manyFull, low = double || many; // the take window moves down, the upper half is free
  const side = w >= 1.9 * cw && (double || half); // wide (iPad across, 15.11.): Doppel and Similar · halb beside the take, not above
  const sideness = side ? data.lowT ?? 1 : 0;
  const grow = many && !half ? data.grow ?? 1 : 0; // viele ganz: the arcs bend out to the screen's edges (0 → 1, animated)
  const F0 = Math.min(cw - 16 * k, 2 * ((cw / 2 - 6 * k) / Math.sin(Math.PI / 3) - ring)) - 12 * k; // the line's ends stay on screen; 12 px more room at the sides for the sound (14.11.)
  const lowness = side ? 0 : data.lowT ?? (low ? 1 : 0); // 0 = the take window in the middle, 1 = moved down (animated, 14.11.)
  const cx = w / 2 + (cw / 2 + 8 * k) * sideness; // beside: the take to the right of the middle, the other to the left
  const FL = Math.min(F0, (h - 130 * k - 2 * ring - 8 * k) / 2); // two windows, the point between them
  const F = F0 + (FL - F0) * lowness;
  const cyMid = h / 2 + (st.screen === 'delete' ? 20 * k : 0), cyLow = h - 60 * k - FL / 2; // the window in the middle of the screen, upright or across, phone or tablet (15.11., user)
  const cy0 = cyMid + (cyLow - cyMid) * lowness;
  const deep = Math.max(0, rowHeight(splitNow([...(data.chips ?? []), ...(data.offers ?? [])]).rest, k) - 32 * k); // bubbles in bubbles: more room above the typing row
  const gapOpen = ((data.open ?? 0) > 0.5 ? 72 * k + deep : 40 * k), room = (data.viewH ?? h) - 34 * k; // the keyboard takes the lower part
  const bottom0 = onShape(windowOf(data.shape ?? 'circle', { cx, cy: cy0, F }), 180, 0)[1];
  const cy = cy0 - ((data.open ?? 0) > 0.5 ? Math.max(0, bottom0 + gapOpen - room) : 0); // the keyboard is up: the live picture moves up with the field (14.11.)
  const win = windowOf(data.shape ?? 'circle', { cx, cy, F });
  const top = h / PHI; // viele ganz (14.11.): the arcs frame the lower 38 %, the upper 62 % stays free (golden ratio): room for A–Z one under the other (26 × ≈ 18 px ≈ 470 px of 520 on a phone)
  const edge = { x0: 14 * k, x1: w - 14 * k, y0: top, y1: h - 14 * k, r: 28 * k }; // an open U: right edge down, along the bottom, left edge up
  const [, winBottom] = onShape(win, 180, 0);
  const fieldY = Math.min(winBottom + gapOpen, room); // the typing row right under the bottom arc (open: the chip row above it, the box starts under the arc); above the keyboard
  const g = { st, data, w, h, k, cw, cx, cy, F, win, ring, shapes: [], edge: grow ? edge : null, grow, fieldY, side, deep };
  g.add = (type, o) => g.shapes.push({ type, ...o });

  const video = { cx: g.cx, cy, d: F, radius: 18 * k, window: win };
  const [px, py] = onShape(win, 0, ring);
  const point = { cx: px, cy: py, d }; // its outer ring touches the window
  const stretched = Boolean(data.items?.length) && ['line', 'record', 'stream'].includes(st.screen);

  const [, pyLow] = onShape(win, 0, ring);
  const [, pointTop] = onShape(win, 0, 2 * ring);
  if (!st.similar) g.add('sheet', { x: 0, y: 24 * k, w, h: Math.max(0, pointTop - 32 * k), r: 0, cls: 'top-zone', role: 'top-zone' }); // the free part above: pulled down = Similar (below Android's own pull-down strip)
  if (!st.similar) g.add('sheet', { x: 0, y: winBottom + 14 * k, w, h: Math.max(0, h - winBottom - 14 * k), r: 0, cls: 'bottom-zone', role: 'bottom-zone' }); // the free part below: tap = the context arc straightens, write at once (15.11.)
  const boxTop = fieldY - 64 * k - deep; // the open context field's box: its top edge is where the bottom arc lies, pushed up = closed
  if ((data.open ?? 0) > 0.5 && !many) g.add('sheet', { x: cx - cw / 2 + 12 * k, y: boxTop, w: cw - 24 * k, h: 88 * k + deep, r: 22 * k, cls: 'field-box' });
  if (many && !half) similarTiles(g, pyLow - ring - 10 * k + (h - pyLow + ring + 10 * k) * grow); // full: down to the bottom, only arcs and context on top
  {
    if (!many || half) g.add('rest', { field: { x: g.cx - F / 2, y: cy - F / 2, s: F, r: 18 * k }, win, cls: 'field-rest' }); // nothing shows outside the window (14.11.)
    strandArcs(g);
    if (!many || half) { photoPoint(g); soundBars(g); }
    if (!grow) flowArcs(g);
  }
  if (!many || half) g.add('video', { ...video, cls: st.screen === 'delete' ? 'video faded' : 'video' });
  const template = double ? referenceWindow(g, point) : templateVideo(g);
  if (!stretched) chipArea(g, point, double ? template : null);
  if (stretched) g.shapes.push(...timelineShapes(data.items, { timeMs: data.timeMs ?? 0, sub: st.sub ?? 'play', zoom: data.timeZoom ?? 1, cx: g.cx, y: point.cy, k, w }));
  else if (!double && (!many || half)) g.shapes.push(...arcShapes(win, ring, { ...data, bend: data.bend ?? (st.sub === 'spread' ? 0 : 1) }, { k, w }));
  if (st.screen === 'delete') deleteChips(g);
  if (data.waits) { // pinching the waits: inner ring = start, outer = stop (1 s ≈ 8 px)
    g.add('circle', { cx: point.cx, cy: point.cy, r: ring + (4 + data.waits.startMs / 125) * k, cls: 'wait-ring start' });
    g.add('circle', { cx: point.cx, cy: point.cy, r: ring + (4 + data.waits.stopMs / 125) * k, cls: 'wait-ring stop' });
  }

  if (half) similarTiles(g, side ? h - 14 * k : point.cy - ring - 10 * k, side ? [0, cx - cw / 2 - 8 * k] : [0, w]); // half: above the line (wide: beside it), a result can be dragged onto it
  if (data.start && !many) g.shapes.push(...startShapes(data.start, { win, point, k, ring })); // the start: whose state, how it starts (15.11.)
  if (data.focus) g.add('circle', { cx: data.focus.x, cy: data.focus.y, r: (34 - 12 * (data.focusT ?? 0)) * k, fade: 1 - (data.focusT ?? 0) * 0.8, cls: 'focus-mark' }); // where it focuses
  if (data.feedback && !many) { // saved: a green ring going out · gone: a red dashed ring going in (R7); p 0 → 1 over 0.9 s
    const p = data.feedbackP ?? 0;
    g.add('circle', { cx: point.cx, cy: point.cy, r: ring + (data.feedback === 'saved' ? 4 + 26 * p : 30 - 26 * p) * k, fade: 1 - p, cls: `feedback ${data.feedback}` });
  }
  if (!many || half) g.add('point', { ...point, cls: `${pointClass(st)}${data.photo && st.screen !== 'line' ? ' photo' : ''}${data.paused && st.screen === 'record' ? ' paused' : ''}${st.screen === 'line' && data.replayPaused ? ' stopped' : ''}`, role: 'point',
    href: st.screen === 'line' ? data.lineThumbs?.[data.line?.at ?? 0] ?? null : null }); // in the line: that take's picture inside, play / pause over it (16.11.)

  const centre = (role) => { const s = g.shapes.find((x) => x.role === role && x.cls !== 'hit'); return !s ? null : s.s ? [s.x + s.s / 2, s.y + s.s / 2, s.s] : s.x1 != null ? [(s.x1 + s.x2) / 2, s.y1, 24 * k] : null; };
  if (data.cutMark) { const c = centre(data.cutMark); if (c) g.add('line', { x1: c[0], y1: c[1] - c[2] * 0.75, x2: c[0], y2: c[1] + c[2] * 0.75, cls: 'cut-mark' }); } // split (15.11.): past the mark a line across the take
  if (data.joinMark) { const [a, b] = data.joinMark.map(centre); if (a && b) g.add('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], cls: 'join-mark' }); } // join: a band between the two
  const noPicture = look(st, 'v') === 'off' && st.screen !== 'line'; // visual off: no picture, the window in the background colour (15.11.)
  const field = { x: cx - cw / 2 + 12 * k, w: cw - 24 * k }; // the typing row lies in the box (one column, centred), on phone, tablet, portrait and landscape
  return { video, template, point, window: win, fieldY, field, hideLive: (many && !half) || noPicture, shapes: withHint(g.shapes, data.hint, { w, h, k }) };
}

/** Height for point, window and open field above the keyboard at scale k: 8 px margin + point + window + 72 px to the typing row + 34 px under it. */
export function keyboardNeed(k, w) {
  const cw = Math.min(w, 390 * k), ring = ((POINT_D * k) / 2) * RING;
  const F0 = Math.min(cw - 16 * k, 2 * ((cw / 2 - 6 * k) / Math.sin(Math.PI / 3) - ring)) - 12 * k;
  return 8 * k + 2 * ring + F0 + 72 * k + 34 * k;
}

/** One arc per strand, 2° short of its neighbours: new (dashed) · keep (solid) · off (grey); recording turns new solid. */
function strandArcs(g) {
  const { st, data, win, k, add, edge, grow, fieldY, cx, ring } = g;
  for (const kind of KINDS) {
    if (data.hidden?.includes(kind) || !ARCS[kind]) continue; // hidden: still records when on
    const looks = look(st, kind);
    const live = st.screen === 'record' && looks === 'new';
    const [from, to] = ARCS[kind];
    const out = 6 * k; // every arc close around the window (14.11.)
    const along = (wn) => (kind === 'l' ? tilde(wn, ring, k) : pointsOn(wn, from + GAP, to - GAP, out));
    const onEdge = () => (kind === 'l' ? topWave(edge, pts.length, k) // landmarks: as long as before (60 of 240°), on top of the U
      : pts.map((_, i) => onU(edge, (from + GAP + Math.min(i * 3, to - from - 2 * GAP) - 60) / 240))); // 60…300° → the U from its right top to its left top: each arc keeps its share and order
    let pts = along(win);
    if (edge) { const e = grow * grow * (3 - 2 * grow); pts = onEdge().map(([x, y], i) => [pts[i][0] + (x - pts[i][0]) * e, pts[i][1] + (y - pts[i][1]) * e]); } // bent out to the edges
    if (kind === 'x' && data.open) pts = straighten(pts, data.open, { cx, y: fieldY - 64 * k - (g.deep ?? 0) }); // opening: the arc lies on the field's top edge, as long as before, in its middle (15.11.)
    const dd = pathThrough(pts);
    const mid = onShape(win, (from + to) / 2, out); // for hints (hint.js)
    add('path', { d: dd, mid, cls: `strand ${live ? 'own' : looks}${kind === 'l' ? ' wave' : ''}`, role: `strand:${kind}` });
    add('path', { d: dd, cls: 'hit', role: `strand:${kind}` }); // a wider, unseen line to hit
  }
}

/** Landmarks (15.11.): a ~ as wide as the button, right under it inside the window's top edge, ±4 px; 61 points. */
function tilde(win, ring, k) {
  const [x, top] = onShape(win, 0, 0);
  return Array.from({ length: 61 }, (_, i) => { const t = i / 60; return [x - ring + 2 * ring * t, top + 12 * k - 4 * k * Math.sin(t * 2 * Math.PI)]; });
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
function straighten(pts, t, { cx, y }) {
  let len = 0; // the arc's own length: it stays the same when it lies straight (15.11.)
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const x0 = cx - len / 2, x1 = cx + len / 2; // centred on the field
  const e = t * t * (3 - 2 * t); // ease in and out
  return pts.map(([x, yy], i) => {
    const tx = x1 - ((x1 - x0) * i) / (pts.length - 1); // the arc runs clockwise: right to left at the bottom
    return [x + (tx - x) * e, yy + (y - yy) * e];
  });
}

/** The picture point at the upper end of the visual arc: on = a take is one picture (.v.png, lossless), the point a photo button. */
function photoPoint({ data, win, k, add }) {
  const [from, to] = ARCS.v;
  void from;
  const [cx, cy] = onShape(win, to - GAP, 6 * k); // at the arc's upper end (15.11.): tap = one picture (.png)
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
function soundBars({ st, data, win, cx, cw, k, add }) {
  if (look(st, 'a') === 'off') return; // audio off: no level (15.11.); on: the level shows, also before a take
  const w = cx + cw / 2; // the column's right edge
  const [from, to] = ARCS.a;
  const room = Math.max(4 * k, w - 3 * k - onShape(win, 90, 0)[0] - 12 * k); // from the arc's outer side to the edge
  (data.levels ?? []).slice(-20).forEach((level, i, all) => {
    const deg = from + 3 + ((to - from - 6) * (all.length - 1 - i)) / 19; // the newest at the top, the sound runs down the arc (15.11.)
    const [x1, y1] = onShape(win, deg, 12 * k);
    const [x2, y2] = onShape(win, deg, 12 * k + room * Math.min(1, level));
    add('line', { x1, y1, x2, y2, cls: `bar own${i === all.length - 1 ? ' now' : ''}` });
  });
}

/**
 * Chips (15.11.): this take's own chips at the top of the take window (they fly into the chain when it is taken) ·
 * the rest below – sticky, prefixes, what comes after: closed on the window above the context arc, open in the field;
 * a tap in that row writes there (caret), a tap below it at the end; long rows scroll sideways. Full-screen replay:
 * one row above the point. Similar · Doppel: each window its own context (the result's on the reference window).
 */
function chipArea({ st, data, cx, win, k, cw, F, shapes, fieldY, deep }, point, ref = null) {
  if (st.screen === 'line') return;
  const open = (data.open ?? 0) > 0.5; // the context field is open: the rest sits in it, its lowest row stays free to type
  const offers = data.offers ?? [];
  const theirs = ref ? offers.filter((o) => o.origin === 'similar') : [];
  const mine = [...(data.chips ?? []), ...offers.filter((o) => !theirs.includes(o))];
  const held = st.hold?.target === 'chip' ? st.hold.text : null;
  const mark = (s) => (held && s.role && s.role.split(':').pop() === held ? { ...s, cls: `${s.cls} hold` } : s); // the held context, as property
  if (theirs.length) shapes.push(...chipShapes(theirs, { cx: ref.cx, y: onShape(ref.window, 180, 0)[1] - 10 * k - rowHeight(theirs, k) / 2, k, w: ref.d * 0.8 }));
  if (!open && look(st, 'x') === 'off') return; // context off: no chips; on: they show, empty = one dashed chip (15.11.)
  const { now, rest } = splitNow(mine);
  const [ex, ey] = extentOf(win);
  const inWindow = (list) => [{ type: 'clip-in', id: `clip${shapes.length}`, d: outlinePath(win) }, ...list, { type: 'clip-out' }];
  if (now.length) shapes.push(...inWindow(chipShapes(now, { timeMs: data.timeMs, cx, y: win.cy - ey * 0.62, k, w: ex * 1.5 }).map(mark))); // the take's own: in the upper part of the window, where it is still wide
  const width = open ? cw - 24 * k : ex * 1.9; // closed: along the whole lower edge
  const y = open ? fieldY - 42 * k - deep / 2 : win.cy + ey * 0.6; // open: 2 px above the typing row · closed: laid along the lower edge below
  const caret = open ? data.insertAt ?? null : null;
  let row = chipShapes(rest, { timeMs: data.timeMs, cx, y, k, w: width, queue: true, caret, scroll: data.chipScroll ?? 0 }).map(mark);
  if (!open) row = alongEdge(row, { cx, cy: win.cy, ex, ey, gap: 6 * k }); // each element right on the window's lower edge, following its curve (15.11.)
  const x0 = cx - width / 2, box = `M${x0} ${y - 60 * k}H${x0 + width}V${y + 60 * k}H${x0}Z`;
  shapes.push(...(open ? [{ type: 'clip-in', id: `clip${shapes.length}`, d: box }, ...row, { type: 'clip-out' }] : inWindow(row)));
}

/** Chips along the lower edge: every element of the row moved down until its bottom is gap above the edge at its middle. */
function alongEdge(shapes, { cx, cy, ex, ey, gap }) {
  const box = new Map();
  for (const s of shapes) if (s.g != null && (s.type === 'chip' || s.type === 'bubble')) {
    const b = box.get(s.g) ?? { x0: Infinity, x1: -Infinity, bottom: -Infinity };
    box.set(s.g, { x0: Math.min(b.x0, s.x), x1: Math.max(b.x1, s.x + s.w), bottom: Math.max(b.bottom, s.y + s.h) });
  }
  const edgeAt = (x) => { const t = Math.min(1, Math.abs(x - cx) / ex); return cy + ey * Math.sqrt(1 - t * t); }; // the lower edge (ellipse; a rounded square lies outside it)
  const dyOf = (b) => { const lowest = Math.min(edgeAt(b.x0), edgeAt(b.x1)); return lowest - gap - b.bottom; }; // its outer corner stays inside
  const more = (s) => { const [, x, y] = /^M(-?[\d.]+) (-?[\d.]+)/.exec(s.d).map(Number); return moveY(s, edgeAt(x) - gap * 3.7 - (y + 7 * gap / 6)); }; // ‹ › beside the chips at that spot of the edge
  return shapes.map((s) => (s.g != null && box.has(s.g) ? moveY(s, dyOf(box.get(s.g))) : s.cls === 'more' ? more(s) : s));
}

/** A template (Vorlage) beside the own take: smaller, blue, lower left inside the window. */
function templateVideo({ st, data, win, k, add }) {
  if (!data.template) return null;
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
 * ↓ from the top or spread: closed → half → full · ↑ on them or squeeze: full → half → closed · tap = Doppel · the band onto the point = all onto the chain.
 */
function similarTiles({ data, w, h, k, add }, bottom = h, [left, right] = [0, w]) {
  const keys = data.similar ?? [];
  const cols = 4, gap = 6 * k, top = 56 * k, size = (right - left - gap * (cols + 1)) / cols;
  const rows = Math.max(1, Math.floor((bottom - top - gap) / (size + gap)));
  const x0 = left + gap, y0 = top - (1 - (data.reveal ?? 1)) * (bottom - top); // coming in: the tiles slide down from the top
  add('sheet', { x: left, y: top - gap, w: right - left, h: bottom - top + gap, r: 0, cls: 'similar-band', role: 'similar-band' });
  keys.slice(0, Math.min(MANY, cols * rows)).forEach((key, i) => {
    const x = x0 + (i % cols) * (size + gap), y = y0 + Math.floor(i / cols) * (size + gap);
    const path = outlinePath(windowOf(data.shape, { cx: x + size / 2, cy: y + size / 2, F: size })); // the form of my window (14.11.)
    add('thumb', { x, y, s: size, path, id: `st${i}`, href: data.thumbs?.[key], cls: 'thumb other', role: `similar:${i}` });
  });
}

/**
 * Similar · Doppel (14.11.): the reference in the same window above, the live picture below, the point between.
 * squeeze = back to viele · ←/→ = next / before · spread = full (review, like a line) · wide: beside the take.
 */
function referenceWindow({ data, w, h, k, cx: own, cy: ownY, F, win, ring, add, side }, point) {
  const cx = side ? w - own : own, cy = side ? ownY : point.cy - ring - 4 * k - F / 2; // wide: beside the take, else above it
  const ref = windowOf(win.shape === 'rrect' ? win : win.shape, { cx, cy, F });
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
  image: (s) => `<image href="data:image/png;base64,${s.png}" x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" class="${s.cls}"${roleOf(s)}/>`, // an app's icon (share row)
  label: (s) => `<text x="${s.x}" y="${s.y}" text-anchor="middle" class="${s.cls}">${esc(s.text)}</text>`,
  video: (s) => (s.window ? `<path d="${outlinePath(s.window)}" class="${s.cls}"${roleOf(s)}/>` : `<circle cx="${s.cx}" cy="${s.cy}" r="${s.d / 2}" class="${s.cls}"${roleOf(s)}/>`),
  thumb: (s) => (s.path // in the form of my window (14.11.)
    ? `<clipPath id="${s.id}"><path d="${s.path}"/></clipPath>${s.href ? `<image href="${esc(s.href)}" x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${s.id})"/>` : ''}<path d="${s.path}" class="${s.cls}${s.href ? ' seen' : ''}"${roleOf(s)}/>`
    : `${s.href ? `<image href="${esc(s.href)}" x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" preserveAspectRatio="xMidYMid slice" style="clip-path: inset(0 round ${s.round ? s.s / 2 : 12}px)"/>` : ''}<rect x="${s.x}" y="${s.y}" width="${s.s}" height="${s.s}" rx="${s.round ? s.s / 2 : 12}" class="${s.cls}${s.href ? ' seen' : ''}"${roleOf(s)}/>`),
  'clip-in': (s) => `<clipPath id="${s.id}"><path d="${s.d}"/></clipPath><g clip-path="url(#${s.id})">`, // a long chip row stays inside its window or box (15.11.)
  'clip-out': () => '</g>',
  chip: (s) => `<g class="${s.cls}"${roleOf(s)}>`
    + `<rect x="${s.x}" y="${s.y - s.h / 2}" width="${s.w}" height="${s.h}" rx="${s.h / 2}"/>`
    + `<text x="${s.x + s.w / 2}" y="${s.y + 5}" text-anchor="middle">${esc(s.text)}</text></g>`,
  hint: (s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" class="${s.cls}" style="--dx:${s.dx}px;--dy:${s.dy}px"/>`,
  point: (s) => { // 16.11.: ● start · ❚❚ during a take (tap = pause) · ● dashed = paused (tap = on) · photo = a shutter ·
    const pause = `<rect x="${s.cx - 13}" y="${s.cy - 15}" width="9" height="30" rx="3" class="core"/><rect x="${s.cx + 4}" y="${s.cy - 15}" width="9" height="30" rx="3" class="core"/>`; // in the line: the take's picture, ▶ / ❚❚ over it
    const play = `<path d="M ${s.cx - 10} ${s.cy - 15} L ${s.cx + 15} ${s.cy} L ${s.cx - 10} ${s.cy + 15} Z" class="core"/>`;
    const r = s.d / 2, ring = `<circle cx="${s.cx}" cy="${s.cy}" r="${r * 1.35}" class="ring"/>`;
    if (s.cls.includes('line')) { // the take's picture inside the point
      const pic = s.href ? `<clipPath id="pt"><circle cx="${s.cx}" cy="${s.cy}" r="${r * 1.3}"/></clipPath><image href="${esc(s.href)}" x="${s.cx - r * 1.3}" y="${s.cy - r * 1.3}" width="${r * 2.6}" height="${r * 2.6}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pt)"/>` : '';
      return `<g class="${s.cls}"${roleOf(s)}>${pic}${ring}<g class="over">${s.cls.includes('stopped') ? play : pause}</g></g>`;
    }
    const core = s.cls.includes('paused') ? `<circle cx="${s.cx}" cy="${s.cy}" r="${r}" class="core"/>`
      : s.cls.includes('recording') ? pause
      : s.cls.includes('photo') ? `<circle cx="${s.cx}" cy="${s.cy}" r="${r}" class="core"/><circle cx="${s.cx}" cy="${s.cy}" r="${r * 0.55}" class="shutter"/>`
      : `<circle cx="${s.cx}" cy="${s.cy}" r="${r}" class="core"/>`;
    return `<g class="${s.cls}"${roleOf(s)}>${ring}${core}</g>`;
  },
};

/** Shapes → one SVG (the picture itself is a <video> element placed at layout().video). */
export function toSvg({ shapes }, { w = 390, h = 844 } = {}) {
  const inner = shapes.map((s) => SVG[s.type]?.(s) ?? '').join('');
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
