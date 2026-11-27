// layout.js — where everything sits on the screen, as numbers only (no DOM): the take window with its three arcs,
// the button on the line, the context rows, Similar and the sharing menu.
//
// Purpose:   one spot for every position, so the drawing (paint.js) and the touches (touch.js) agree. The take window
//            has a form (form.js, 20.11.: circle · ellipse · rounded rectangle · rectangle, any aspect), as large as
//            the screen allows for it; around it, by degrees (0° = top, clockwise, as in the version until 16.11.):
//              line   −60…60   through the button (top), the takes of the line left and right of it
//              audio   60…140  right · context 140…220 bottom · visual 220…300 left (21.11.: no photo dot – ← on the ready button)
//            Older lines are small arcs under the line (between line and window), newest first.
//            Similar (21.11.): upright = above the take, wide = beside it; the take keeps its size at the bottom and
//            Similar the rest (similarShare: ≥ 1/φ³ = 23.6 %; phone 40 / 60 %) · single = both windows one
//            size · full = the cloud down to the button; the arcs glide to the screen's edges (fullOf). The keyboard lifts the whole take until its typing row is visible.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    drawn for a 390 px phone, scaled by k = min(long side / 760, short side / 390) (the same upright and
//            across, 20.11.); ≤ 3 older lines drawn (more = "+n" mark);
//            ≤ 9 takes visible on the line at once (4 left, 4 right of the button), the rest scroll in.

import { fit, edge, curve, pathOf, along, cover, exponent, clampAspect, inside } from './form.js';

export const ARCS = Object.freeze({ line: [-60, 60], a: [60, 140], x: [140, 220], v: [220, 300] });
export const PHI = (1 + Math.sqrt(5)) / 2;
export const GAP = 3; // degrees left free between two arcs
export const LINE_SIDE = 4; // takes shown on each side of the button
export const OLD_LINES = 3;

const rad = (deg) => (deg * Math.PI) / 180;
/** A point at angle deg (0 = top, clockwise) and radius r around (cx, cy). */
export const polar = (cx, cy, r, deg) => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];

/** An SVG arc path from deg a to deg b at radius r. */
export function arcPath(cx, cy, r, a, b) {
  const [x0, y0] = polar(cx, cy, r, a), [x1, y1] = polar(cx, cy, r, b);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 ${Math.abs(b - a) > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Is the screen wide enough to put Similar beside the take (tablet across, desktop)? */
export const isWide = ({ w, h }) => w >= 700 && w > h * 1.15;

/** Similar's selection views at its top (paint-similar.js): px at k = 1. */
export const HEAD = 12; // 21.11.: the row of signs went (zoom zones, similar-zoom.js); a grip is left at the top
/**
 * Similar beside the take (21.11., user): t = the share of the screen (height; on a wide screen: width) the take needs
 * at the size it has alone. The take keeps that size and Similar gets the rest – on a 390 × 844 phone 40 / 60 %, near
 * the golden section (38.2 / 61.8 %); a flat window leaves Similar more. Never less than the next golden step
 * (1/φ³ = 23.6 %): only below that the take gets smaller (a tablet upright).
 */
export function similarShare(t) {
  return Math.max(1 / PHI ** 3, 1 - t);
}

/**
 * The take. size { w, h, keyboard (px covered at the bottom) } · similar: 'closed' | 'many' | 'single' | 'full' ·
 * form { round 0…1, aspect } · picture: the aspect of what the window shows (camera 1:1, a take, a file).
 * → { k, cx, cy, rx, ry, R (= ry), n, button: { x, y, r }, lineOff, nowOff, queueY, lift, scale, media,
 *     similarBox, singleBox, single (the result's form in the single view) }
 */
export function takeLayout(size, similar = 'closed', form = { round: 1, aspect: 1 }, picture = 1, full = similar === 'full' ? 1 : 0) {
  if (full > 0) return fullOf(size, similar === 'full' ? 'many' : similar, form, picture, Math.min(1, full));
  const { w, h, keyboard = 0 } = size;
  const k = Math.min(Math.max(w, h) / 760, Math.min(w, h) / 390);
  const ring = 42 * k; // the button's radius with its ring
  const room = { w: w - 2 * Math.max(25 * k, 14), h: h - 1.8 * ring - 76 * k - 12 }; // the line's ends, the button above, the row below
  const { rx: rx0, ry: ry0 } = fit(room, form.aspect);
  const wide = isWide({ w, h });
  const S = Math.min(room.w, room.h); // the 1:1 window: no form is larger, one side may be narrower (20.11.)
  const top = 1.8 * ring + 6, below = 76 * k + 12, side = (w - room.w) / 2; // the button above the window, the row under it, the line's ends
  let cx = w / 2, cy = top + S / 2 + Math.max(0, (room.h - S) / 2), scale = 1, similarBox = null, singleBox = null, single = null;
  if (similar === 'many' || similar === 'single') {
    // 21.11. (user): the take keeps the size it has alone, at the very bottom with its row; Similar gets the rest, at
    // least 23.6 % (similarShare). Double: both windows the same size, as large as both fit.
    const n = exponent(form.round ?? 1);
    if (similar === 'many') {
      const share = similarShare((wide ? 2 * rx0 + 2 * side : top + 2 * ry0 + below) / (wide ? w : h));
      scale = Math.min(1, wide ? ((1 - share) * w - 2 * side) / (2 * rx0) : ((1 - share) * h - 6 - below) / (1.8 * ring + 2 * ry0));
      if (wide) { cx = share * w + ((1 - share) * w) / 2; similarBox = { x: 12 * k, y: 10 * k, w: share * w - 24 * k, h: h - 20 * k }; }
      else similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: share * h - 18 * k };
    } else if (wide) { // side by side at the same height: the single left, the take right
      const gap = 16 * k;
      scale = Math.min(1, (w - 26 * k - gap - 2 * side) / (4 * rx0), (h - 10 * k - HEAD * k - below) / (2 * ry0)); // 26 px left: the single's own arcs
      const left = 26 * k + Math.max(0, w - 26 * k - (4 * rx0 * scale + gap + 2 * side)) / 2;
      cx = left + 3 * rx0 * scale + gap + side;
      single = { cx: left + rx0 * scale, cy: h - below - ry0 * scale, rx: rx0 * scale, ry: ry0 * scale, n };
      similarBox = { x: 12 * k, y: 10 * k, w: cx - rx0 * scale - side - 20 * k, h: h - 20 * k };
    } else { // one above the other: the single under Similar's selection views, the take under it
      const gap = 14 * k;
      scale = Math.min(1, (h - 10 * k - HEAD * k - gap - 6 - below) / (4 * ry0 + 1.8 * ring));
      single = { cx: w / 2, cy: 10 * k + HEAD * k + ry0 * scale, rx: rx0 * scale, ry: ry0 * scale, n };
      similarBox = { x: 8 * k, y: 10 * k, w: w - 16 * k, h: HEAD * k + 2 * ry0 * scale };
    }
    cy = h - below - ry0 * scale; // the window's lower edge where it is alone at the most (the row under it)
    if (single) singleBox = { x: single.cx - single.rx, y: single.cy - single.ry, w: 2 * single.rx, h: 2 * single.ry };
  }
  if (keyboard && scale === 1) { // the keyboard is up (17.11.): the whole take stays in what is left, smaller if it must
    const need = 2 * ry0 + 1.8 * ring + 64 * k, room2 = h - keyboard - 6 * k;
    if (need > room2) scale = Math.max(0.4, (room2 - 64 * k) / (2 * ry0 + 1.8 * ring));
  }
  const s = scale || 1, rx = rx0 * scale, ry = ry0 * scale, n = exponent(form.round);
  const queueY0 = cy + ry + 34 * k;
  const lift = keyboard ? Math.max(0, queueY0 + 26 * k - (h - keyboard)) : 0; // the typing row sits right above the keyboard
  const F = { cx, cy: cy - lift, rx, ry, n };
  const lineOff = ring * 0.8 * s; // through the button: it overlaps the window a little (08.11.)
  const [bx, by] = edge(F, 0, lineOff);
  return { k, cx, cy: F.cy, rx, ry, R: ry, n, aspect: clampAspect(form.aspect), round: form.round ?? 1, ring: ring * s, scale, wide, lift,
    button: { x: bx, y: by, r: 31 * k * s }, lineOff,
    nowOff: -24 * k * s, queueY: queueY0 - lift, media: cover(F, picture), similarBox, singleBox, single };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lengthOf = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const segment = ([x0, y0], [x1, y1], n) => Array.from({ length: n + 1 }, (_, i) => [lerp(x0, x1, i / n), lerp(y0, y1, i / n)]);
const ARC_STEPS = 40;

/**
 * A point on the frame the arcs hug in Similar full: s px along it from the middle of its bottom, + to the right and up,
 * − to the left and up; rounded corners of radius rc. f: { left, right, bottom, rc }
 */
function onFrame(f, s) {
  const side = s < 0 ? -1 : 1, d = Math.abs(s), cx = (f.left + f.right) / 2, half = Math.max(0, (f.right - f.left) / 2 - f.rc), q = (Math.PI * f.rc) / 2;
  if (d <= half) return [cx + side * d, f.bottom];
  if (d <= half + q) { const a = (d - half) / f.rc; return [cx + side * (half + f.rc * Math.sin(a)), f.bottom - f.rc * (1 - Math.cos(a))]; }
  return [cx + side * (half + f.rc), f.bottom - f.rc - (d - half - q)];
}
const frameRun = (f, s0, s1, n) => Array.from({ length: n + 1 }, (_, i) => onFrame(f, s0 + ((s1 - s0) * i) / n));

/**
 * Similar full (21.11., user): the button slides down, the window goes, the words of the take now stay between, the
 * context arc lies straight under them; the picture and sound arcs stay as close to its ends as at the window and hug
 * the screen's edge – as far from it as the window's arcs are, so the sound level still shows; each arc as long as at
 * the window. Under the context arc the row, lifted above the keyboard while typing. Across (phone and tablet) the
 * cloud lies beside, the take's things in a column on the right. t 0…1 = how far it slid from the layout `from`.
 */
function fullOf(size, from, form, picture, t) {
  const { w, h, keyboard = 0 } = size, L0 = takeLayout(size, from, form, picture), k = L0.k, s0 = L0.scale || 1;
  const off = 7 * k * s0, base = keyboard ? h - keyboard + 6 * k : h;
  const arcs0 = Object.fromEntries(['v', 'x', 'a'].map((kd) => [kd, curve(L0, ARCS[kd][0] + GAP, ARCS[kd][1] - GAP, off, ARC_STEPS)]));
  const lx = lengthOf(arcs0.x), lv = lengthOf(arcs0.v), la = lengthOf(arcs0.a), g = lengthOf(curve(L0, ARCS.x[0] - GAP, ARCS.x[0] + GAP, off, 6));
  const m = Math.max(10 * k, w - (L0.cx + L0.rx + off)), rc = 36 * k; // as far from the screen's edge as the window's arcs
  const colW = L0.wide ? Math.min(w / 2, lx + 2 * g + 2 * rc + 2 * m + 24 * k) : w, colX = w - colW, cx = colX + colW / 2;
  const rowY = base - 30 * k, xY = rowY - 30 * k, wordsY = xY - 26 * k, buttonY = wordsY - 58 * k; // the row's middle line, the context arc, the words, the button
  const frame = { left: colX + m, right: w - m, bottom: xY, rc };
  const target = {
    a: frameRun(frame, lx / 2 + g + la, lx / 2 + g, ARC_STEPS), // 60° → 140°: from up the right side down to the bottom
    x: frameRun(frame, lx / 2, -lx / 2, ARC_STEPS), // 140° → 220°: right to left
    v: frameRun(frame, -(lx / 2 + g), -(lx / 2 + g + lv), ARC_STEPS), // 220° → 300°: from the bottom up the left side
  };
  const arcs = Object.fromEntries(['v', 'x', 'a'].map((kd) => [kd, arcs0[kd].map(([x, y], i) => [lerp(x, target[kd][i][0], t), lerp(y, target[kd][i][1], t)])]));
  const ry1 = 30 * k, F1 = { cx, cy: wordsY - 6 * k, rx: colW / 2 - m, ry: ry1, n: 12 };
  const F = { cx: lerp(L0.cx, F1.cx, t), cy: lerp(L0.cy, F1.cy, t), rx: lerp(L0.rx, F1.rx, t), ry: lerp(L0.ry, F1.ry, t), n: lerp(L0.n, F1.n, t) };
  const lineOff = lerp(L0.lineOff, F1.cy - ry1 - buttonY, t); // = 22 px: the button on the flat window's top
  const [bx, by] = edge(F, 0, lineOff), r = lerp(L0.button.r, 31 * k, t);
  const box1 = L0.wide ? { x: 12 * k, y: 10 * k, w: colX - 12 * k, h: h - 20 * k } : { x: 22 * k, y: 10 * k, w: w - 44 * k, h: Math.max(60 * k, buttonY - 42 * k - 18 * k) };
  const b0 = L0.similarBox ?? { x: box1.x, y: box1.y, w: box1.w, h: 0 };
  const similarBox = { x: lerp(b0.x, box1.x, t), y: lerp(b0.y, box1.y, t), w: lerp(b0.w, box1.w, t), h: lerp(b0.h, box1.h, t) };
  return { ...L0, ...F, R: F.ry, scale: s0, full: t, arcs, lineOff, button: { x: bx, y: by, r }, nowOff: lerp(L0.nowOff, -24 * k, t),
    queueY: lerp(L0.queueY, rowY, t), row: L0.wide ? { x: colX, w: colW } : null, lift: 0, similarBox, singleBox: null, single: null, media: L0.media, w, h };
}

/** A strand's arc as points: around the window, or (Similar full) on its way to the screen's edge. */
export function strandPoints(L, kind) {
  return L.full ? L.arcs[kind] : curve(L, ARCS[kind][0] + GAP, ARCS[kind][1] - GAP, 7 * L.k * (L.scale || 1));
}

/** The piece of a run of points from f0 to f1 (0…1 of its length). */
export function pieceOfPoints(pts, f0, f1) {
  const total = lengthOf(pts), out = [];
  const at = (f) => { const p = along(pts, total * f - total / 2); return [p.x, p.y]; };
  out.push(at(f0));
  let run = 0;
  for (let i = 1; i < pts.length; i++) { run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (run > total * f0 && run < total * f1) out.push(pts[i]); }
  out.push(at(f1));
  return out;
}

/** The arcs of the take: strand arcs, the line arc and the older lines' small arcs, along the window's form. → [{ id, d, mid }] */
export function arcsOf(L, olderLines = 0) {
  const s = L.scale || 1, out = [], off = 7 * L.k * s;
  for (const kind of ['v', 'x', 'a']) {
    const [a, b] = ARCS[kind], pts = strandPoints(L, kind);
    out.push({ id: `strand:${kind}`, kind, d: pathOf(pts), mid: L.full ? pts[Math.floor(pts.length / 2)] : edge(L, (a + b) / 2, off) });
  }
  let run = curve(L, ARCS.line[0], ARCS.line[1], L.lineOff);
  if (L.home) { const j = run.findIndex(([x, y]) => x > L.button.x && y < L.cy); if (j > 1) run = [...run.slice(0, j), [L.button.x, run[j - 1][1]]]; } // a line chosen: it ends at the button on the right (26.11.)
  out.push({ id: 'line', d: pathOf(run), mid: edge(L, 0, L.lineOff) });
  for (let i = 0; i < Math.min(olderLines, OLD_LINES); i++) {
    const o = L.lineOff - (14 + 6 * i) * L.k * s, span = 46 - 6 * i;
    out.push({ id: `old:${i}`, d: pathOf(curve(L, -span, span, o)), mid: edge(L, 0, o) });
  }
  return out;
}

/**
 * The takes of the line around the button: index i (0 = oldest) and at (the button's spot, = takes.length when
 * recording new). Left = older (08.11.: the take just made goes left of the button). → [{ i, x, y, r }]
 */
export function lineSlots(L, count, at, shift = 0) {
  const s = L.scale || 1, step = slotPx(L), out = [], run = curve(L, -90, 90, L.lineOff, 120);
  const moved = L.home ? L.button.x - L.home.x : 0; // a line chosen (26.11.): the button stands further right, the takes go along
  if (L.home) at += (count - at) * (L.mark ?? 1); // … and all of them lie left of it
  for (let i = 0; i < count; i++) {
    const off = i - at + shift; // < 0 left of the button; shift = how far the finger pulled the line (in takes, 17.11.)
    const a = Math.abs(off);
    if (a < 0.02 || a > LINE_SIDE + 0.5) continue;
    const d = Math.sign(off) * (a < 1 ? step * 1.25 * a : step * (a + 0.25)); // along the line, through the button without a jump
    const p = along(run, d + moved);
    out.push({ i, x: p.x, y: p.y, r: 15 * L.k * s * (a < 1 ? 0.7 + 0.3 * a : 1), off });
  }
  return out;
}
/** How many px along the line one take is (to turn a finger's way into takes): as on a circle of the window's height. */
export const slotPx = (L) => ((L.ry + L.lineOff) * 13 * Math.PI) / 180;

/**
 * The timeline inside the spread button (17.11.). take: { ms } · ms: the moment in the middle · → { span (ms across the
 * widest button), px (per ms), x(t) }: a short take fills the button, a long one runs through it.
 */
export function timeline(L, take, ms, zoom = 1) {
  const len = take?.ms ?? 0, base = ((2 * L.rx) / PHI) / Math.max(1500, len); // the whole clip as wide as the window ÷ φ (a short one: less)
  const px = base * Math.max(0.25, zoom);
  return { span: len, px, x: (t) => L.button.x + (t - ms) * px };
}

/**
 * The button spread across = the clip itself (20.11., user): as high as the button, as long as the clip at the time
 * scale (zoom = finer in time). The mark is the button's middle; the clip runs through it: at its beginning the pill's
 * left end lies where the button's left edge was (it grew to the right only), at its end its right end lies where the
 * button's right edge was. spread 0…1 = opening or closing (always back onto the button). → { x, y, w, h, full }
 */
/**
 * The empty button spread for its two times (calm.js, 20.11., user). Left: a little = a new take at once after each
 * one (the button gets a coloured ring), past the first catch = plus a countdown; right: past the catch = the stillness
 * after which a take ends (1–10 s; 26.11.). The same px per second on both sides (≤ 10 s each, fits beside the button).
 * times { restartMs (null = off, 0 = at once), stillEndMs (0 = off) } · f 0…1 = opening or closing
 * → { x, y, w, h, S (px per s), left, right, off (below = off), at (the catch), px(t, side), times(leftPx, rightPx) }
 */
/**
 * A line chosen (26.11., user): the button moves to the right at the same height – what is done in the take now goes
 * onto the line, all its takes; they lie left of the button, the line ends there. w: the screen's width · t 0…1 = on
 * the way. On a 390 px phone ≈ 128 px to the right (it stays 6 px inside the screen with its ring). → L with button,
 * home (where it stood), mark (t)
 */
export function markedButton(L, w, t = 1) {
  const to = Math.max(L.button.x, Math.min(L.cx + L.rx - L.ring, w - L.ring - 6 * L.k));
  return { ...L, button: { ...L.button, x: L.button.x + (to - L.button.x) * t }, home: L.button, mark: t };
}

/** The shortest stillness after which a take ends (26.11., user: at least 1 s). */
export const STILL_LEAST = 1000;
export function timerPill(L, { restartMs = null, stillEndMs = 0 } = {}, f = 1) {
  const r = L.button.r, k = L.k, off = 6 * k, at = 26 * k, S = Math.max(4, Math.min(15 * k, (L.button.x - r - at - 8 * k) / 10));
  const px = (t, left) => (t == null || (!left && !t) ? 0 : left && !t ? (off + at) / 2 : at + (t / 1000) * S);
  const timeAt = (d, least = 500) => Math.min(10000, Math.max(least, Math.round(((d - at) / S) * 2) * 500));
  const times = (lp, rp) => ({ restartMs: lp < off ? null : lp < at ? 0 : timeAt(lp), stillEndMs: rp < at ? 0 : timeAt(rp, STILL_LEAST) }); // stillness: at least 1 s (26.11.)
  const left = px(restartMs, true) * f, right = px(stillEndMs, false) * f;
  return { x: L.button.x - r - left, y: L.button.y - r, w: 2 * r + left + right, h: 2 * r, S, left, right, off, at, px, times };
}

export function wideButton(L, spread, take = null, ms = 0, zoom = 1) {
  const r = L.button.r, h = 2 * r, f = Math.max(0, Math.min(1, spread));
  const tl = timeline(L, take, ms, zoom), full = (take?.ms ?? 0) * tl.px + h;
  const w = h + (full - h) * f;
  return { x: L.button.x - r - ms * tl.px * f, y: L.button.y - r, w, h, full };
}

/** The chips of the take now, along the bottom edge inside the window: a chip of width cw at index i of n. */
export function nowChipSpot(L, widths, i) {
  const total = widths.reduce((s, x) => s + x, 0) + 6 * (widths.length - 1);
  const before = widths.slice(0, i).reduce((s, x) => s + x, 0) + 6 * i + widths[i] / 2;
  const p = along(curve(L, 270, 90, L.nowOff, 120), before - total / 2); // from the left end over the bottom to the right
  return { x: p.x, y: p.y, rot: p.rot };
}

/** What belongs to the take under a finger: the window, its strands, the line, the button, the context row (20.11.). */
const TAKE_ROLES = /^(window|button|line|context|under|strand:|take:|old:|gap:|chip:|bubble:)/;
/**
 * Does a finger that went down at pt (role: what was under it) start on the take? The window and a band around it
 * (the strands, the line through the button: ring · 0.8 + 22 px), and the context row under it. Everything else —
 * above, below, beside on a tablet, Similar itself — is free: two fingers there zoom Similar open and shut (20.11.).
 */
export function onTake(L, pt, role = '') {
  if (TAKE_ROLES.test(role ?? '')) return true;
  if (!L || !pt || !(L.rx > 0)) return false; // Similar full: no take on the screen
  const band = L.ring * 0.8 + 22 * L.k;
  if (inside({ cx: L.cx, cy: L.cy, rx: L.rx, ry: L.ry, n: L.n }, pt.x, pt.y, band)) return true;
  return Math.abs(pt.y - L.queueY) < 24 * L.k && Math.abs(pt.x - L.cx) < L.rx + band;
}

/**
 * Does a point lie where Similar opens – above the take, on a wide screen left of it – clear of the button and the line?
 * A tap there opens Similar (26.11., user: "öffnet sich auch durch Tippen"), as two fingers spread there do.
 */
export function similarSide(L, pt) {
  if (!L || !pt || !(L.rx > 0) || L.full) return false;
  if (L.wide) return pt.x < L.cx - L.rx - L.ring;
  return pt.y < L.button.y - L.ring - 12 * L.k;
}

/**
 * Is a point on (or just beside) a strand's arc? (26.11.: the audio arc dragged onto the context arc = the flow sound →
 * context.) Its angle seen from the window's middle lies within the arc (± 8°), and it is no farther than 44 px outside
 * the window's edge nor 56 px inside it. Similar full: the arcs lie elsewhere – no.
 */
export function onArc(L, pt, kind) {
  if (!L || !pt || L.full || !ARCS[kind]) return false;
  const deg = ((Math.atan2(pt.x - L.cx, L.cy - pt.y) * 180) / Math.PI + 360) % 360, [a, b] = ARCS[kind];
  const within = (d) => d >= a - 8 && d <= b + 8;
  return (within(deg) || within(deg - 360) || within(deg + 360)) && inside(L, pt.x, pt.y, 44 * L.k) && !inside(L, pt.x, pt.y, -56 * L.k);
}

/**
 * The flow sound → context: a short wave across the seam of the two arcs (at 140°), just inside the window's edge –
 * outside it lies under the context row (which takes the touches there) and a finger could not reach it. → points
 */
export function flowPoints(L, { from = ARCS.a[1] - 9, to = ARCS.x[0] + 9, off = -13, amp = 2.6, waves = 3, steps = 42 } = {}) {
  const s = L.scale || 1, out = [];
  for (let i = 0; i <= steps; i++) out.push(edge(L, from + ((to - from) * i) / steps, (off + amp * Math.sin((i / steps) * waves * 2 * Math.PI)) * L.k * s));
  return out;
}
