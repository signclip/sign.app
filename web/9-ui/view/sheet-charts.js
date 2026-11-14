// sheet-charts.js — the drawings of the emergency sheet (14.11.): each takes a Page, a box and plain numbers.
//
// Purpose:   one pastel colour = one meaning on every page (the question each colour answers):
//              coral     strands — only the arcs and edge bars; which strand is told by WHERE it sits, never by colour
//                        (ring.js ARCS and SIDES: l top · a right · x bottom · v left)
//              honey     what: takes, how many, how dense (dots, bars per week, Similar, arrows that carry takes)
//              blue      where: sharing points, storage and space used (GB), rooms, what is brought in to read
//              rose      who: me, persons, friends, accounts, consent
//              mint      safe: backup, a run that went through
//              butter    by hand: the paper password, password gestures, every line to write on
//              teal      when: roadmap, sessions, the steps of a way, how new a take is (dark = new)
//              dark      the picture (video window) · grey: no meaning (numbers, index, roles, clusters)
//            Drawings: arcs (the field as a ring) · tile (a sharing point as in the sharing menu, no layers) ·
//            big numbers · weeks · trend · rooms · index (folders → tables) · step (a pictured way).
// Depends:   1-model/pdf.js (fit, textWidth)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    text ≥ 6 pt (readable printed) · numbers at arcs and bars shortened above 9.999 (12 T, 1,2 Mio).

import { fit, textWidth } from '../../1-model/pdf.js';

export const INK = {
  fg: '#222222', mut: '#8a8984', line: '#e8e6e1', rest: '#e4e2dd', card: '#ffffff', paper: '#faf9f7', picture: '#2F323A',
  strand: '#f5a08a', strandSoft: '#f8c9bb',
  take: '#c9a77c', takeSoft: '#ecdcc6', takeTint: '#f8f1e7',
  where: '#8fb6e0', whereSoft: '#c4dcf2', whereTint: '#eef4fb',
  who: '#d98aab', whoSoft: '#f5cbdc', whoTint: '#fbeef3',
  safe: '#5fbf92', safeSoft: '#c6ead6', safeTint: '#edf7f1',
  hand: '#e2bf4f', handSoft: '#ffe9a0', handTint: '#fff8e1',
  time: '#6fbcc0', timeSoft: '#cde9ea', timeTint: '#eef8f8',
};
/** Where the strands sit in the app: degrees from the top, clockwise (ring.js ARCS), and tile sides (SIDES). */
export const ARCS = { l: [-30, 30], a: [60, 140], x: [140, 220], v: [220, 300] };
export const SIDES = { l: 'top', a: 'right', x: 'bottom', v: 'left' };
export const KIND_DE = { v: 'Bild', a: 'Ton', x: 'context', l: 'landmarks', m: 'Maske' };
export const RULE = { always: { ink: INK.take, de: 'immer' }, ask: { ink: INK.take, de: 'fragen', dash: [2, 2] }, show: { ink: INK.where, de: 'lesend' }, backup: { ink: INK.safe, de: 'Backup' }, consent: { ink: INK.who, de: 'Einwilligung' } };

export const n0 = (n) => Math.round(n ?? 0).toLocaleString('de-DE');
export const short = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio` : n >= 1e4 ? `${Math.round(n / 1e3)} T` : n0(n));
export const hours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
export const polar = (cx, cy, r, d) => [cx + r * Math.sin((d * Math.PI) / 180), cy - r * Math.cos((d * Math.PI) / 180)];
/** An arc in the app's degrees (0 = top, clockwise). */
export const appArc = (p, cx, cy, r, a, b, st) => p.arc(cx, cy, r, a - 90, b - 90, st);

/** A section title with a thin rule; returns the y below it. */
export function title(p, x, y, w, text, hint = '') {
  p.text(x, y, text, { size: 10.5, font: 'bold' });
  if (hint) p.text(x + w, y, fit(hint, 7, w - textWidth(text, 10.5, 'bold') - 12), { size: 7, color: INK.mut, align: 'right' });
  p.line(x, y + 5, x + w, y + 5, { stroke: INK.line, width: 0.6 });
  return y + 18;
}

/** The field as a ring with the strand arcs and the line on top; counts { v, a, x, l } written at each arc. */
export function arcs(p, cx, cy, r, { counts = null, width = 3, window = null, line = true, size = null } = {}) {
  if (window) p.circle(cx, cy, r - width * 1.6, { fill: window });
  const out = r + width * 2.6;
  if (line) appArc(p, cx, cy, out, -60, -34, { stroke: INK.strandSoft, width: width * 0.7 }), appArc(p, cx, cy, out, 34, 60, { stroke: INK.strandSoft, width: width * 0.7 });
  for (const [k, [a, b]] of Object.entries(ARCS)) {
    const on = !counts || counts[k] > 0, rr = k === 'l' ? out : r;
    appArc(p, cx, cy, rr, a + 5, b - 5, { stroke: on ? INK.strand : INK.rest, width: k === 'l' ? width * 0.7 : width });
    if (!counts) continue;
    const [tx, ty] = polar(cx, cy, rr + (k === 'l' ? 9 : width + 7), (a + b) / 2);
    p.text(tx, ty + 2.5, `${k} ${short(counts[k] ?? 0)}`, { size: size ?? Math.max(6, Math.min(8, r / 6)), color: on ? INK.fg : INK.mut, align: k === 'a' ? 'left' : k === 'v' ? 'right' : 'center' });
  }
}

/**
 * A sharing point as a tile of the sharing menu (no layers, 14.11.): rounded square, a bar on the side of each strand
 * (solid = always, dashed = on a tap, grey = not) with its number outside. outline blue = where it lies; fill blue = brought in ·
 * seal: dot upper left · consent: open rose dot on the bar of each consented strand (as in the app) · run: dot lower
 * right (mint = went through, open = failed) · friend: a person in rose. h: the tile may be lower than wide (the menu: 86 × 64).
 */
export function tile(p, cx, cy, s, { h = s, counts = {}, bars = {}, fill = INK.card, stroke = INK.where, width = 1, dashed = false, seal = false, run = null, consent = [], friend = false, number = null, edges = true } = {}) {
  const x = cx - s / 2, y = cy - h / 2, r = Math.min(14, Math.min(s, h) * 0.22), o = 3, fs = Math.max(6, Math.min(7.5, h / 8));
  p.rect(x, y, s, h, { r, fill, stroke, width, dash: dashed ? [3, 2] : null });
  for (const k of edges ? ['l', 'a', 'x', 'v'] : []) {
    const kind = bars[k] ?? 'off', side = SIDES[k];
    const seg = side === 'top' ? [x + r, y - o, x + s - r, y - o] : side === 'bottom' ? [x + r, y + h + o, x + s - r, y + h + o] : side === 'left' ? [x - o, y + r, x - o, y + h - r] : [x + s + o, y + r, x + s + o, y + h - r];
    p.line(...seg, { stroke: kind === 'off' ? INK.rest : INK.strand, width: 2.6, dash: kind === 'tap' ? [3, 2] : null });
    if (consent.includes(k) && kind !== 'off') p.circle((seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2, 2.6, { fill: INK.card, stroke: INK.who, width: 0.9 }); // consented: a dot on the bar, as in the app
    const n = counts[k];
    if (n == null) continue;
    const label = short(n);
    if (side === 'top') p.text(cx, y - o - 4, label, { size: fs, align: 'center' });
    else if (side === 'bottom') p.text(cx, y + h + o + 9, label, { size: fs, align: 'center' });
    else if (side === 'left') p.text(x - o - 4, cy + 2.5, label, { size: fs, align: 'right' });
    else p.text(x + s + o + 4, cy + 2.5, label, { size: fs });
  }
  if (seal) p.circle(x + 7, y + 7, 2.2, { fill: INK.fg });
  if (run) p.circle(x + s - 7, y + h - 7, 2.6, run === 'ok' ? { fill: INK.safe } : { stroke: INK.safe, width: 0.8 });
  if (friend) {
    p.circle(cx, cy - h * 0.1, h * 0.1, { fill: INK.who });
    appArc(p, cx, cy + h * 0.2, h * 0.18, -90, 90, { fill: INK.who });
  } else if (number != null) p.text(cx, cy + 3.5, String(number), { size: Math.min(11, h / 4), font: 'bold', align: 'center', color: INK.mut });
}

/** Big numbers in a row: [{ value, label }] (no colour: a number means nothing beyond itself). */
export function tiles(p, { x, y, w, h }, list) {
  const gap = 8, tw = (w - gap * (list.length - 1)) / list.length;
  list.forEach((t, i) => {
    const tx = x + i * (tw + gap);
    p.rect(tx, y, tw, h, { r: 7, fill: INK.card, stroke: INK.line, width: 0.6 });
    p.text(tx + 8, y + h - 18, fit(t.value, 17, tw - 14, 'bold'), { size: 17, font: 'bold' });
    p.text(tx + 8, y + h - 7, fit(t.label, 7, tw - 14), { size: 7, color: INK.mut });
  });
}

/** Takes per week (oldest left), month initials under the bars; the last 4 weeks strong. */
export function weeks(p, { x, y, w, h }, counts, now = Date.now()) {
  const max = Math.max(1, ...counts), bw = w / counts.length;
  for (let k = 0; k <= 2; k++) { const gy = y + h - (h * k) / 2; p.line(x, gy, x + w, gy, { stroke: INK.line, width: 0.4 }); }
  p.text(x - 4, y + 3, n0(max), { size: 6.5, color: INK.mut, align: 'right' });
  counts.forEach((n, i) => {
    const bh = (n / max) * h;
    if (n) p.rect(x + i * bw + 1.5, y + h - bh, bw - 3, bh, { r: Math.min(2, bw / 4), fill: i >= counts.length - 4 ? INK.take : INK.takeSoft });
    const d = new Date(now - (counts.length - 1 - i) * 7 * 86_400_000);
    if (d.getDate() <= 7) p.text(x + i * bw + bw / 2, y + h + 10, 'JFMAMJJASOND'[d.getMonth()], { size: 6.5, color: INK.mut, align: 'center' });
  });
}

/** Rising and falling words: [{ word, now, before }]. */
export function trend(p, { x, y, w }, list) {
  if (!list.length) return p.text(x, y + 8, 'noch zu wenige Takes mit Datum', { size: 7.5, color: INK.mut });
  list.forEach((t, i) => {
    const ty = y + i * 15 + 6, up = t.now >= t.before;
    p.poly(up ? [[x, ty + 3], [x + 7, ty + 3], [x + 3.5, ty - 4]] : [[x, ty - 4], [x + 7, ty - 4], [x + 3.5, ty + 3]], up ? { close: true, fill: INK.fg } : { close: true, stroke: INK.mut, width: 0.8 });
    p.text(x + 13, ty + 2.5, fit(t.word, 8.5, w - 70), { size: 8.5 });
    p.text(x + w, ty + 2.5, `${t.before} > ${t.now}`, { size: 7.5, color: INK.mut, align: 'right' });
  });
}

/** Rooms °( ) as bubbles on a dotted ground (schematic: the sheet knows names and cells, not coordinates). */
export function rooms(p, { x, y, w, h }, list) {
  p.rect(x, y, w, h, { r: 8, fill: INK.paper, stroke: INK.line, width: 0.6 });
  for (let gx = x + 10; gx < x + w; gx += 12) for (let gy = y + 10; gy < y + h; gy += 12) p.circle(gx, gy, 0.5, { fill: INK.rest });
  if (!list.length) return p.text(x + w / 2, y + h / 2 + 3, 'noch keine Orte °( ) an den Takes', { size: 7.5, color: INK.mut, align: 'center' });
  const max = list[0][1], cols = 4, cw = w / cols, rh = h / Math.ceil(list.length / cols);
  list.forEach(([name, n], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = x + cw * col + cw / 2 + (row % 2 ? cw / 4 : -cw / 8), cy = y + rh * row + rh / 2 - 4;
    const r = 4 + 14 * Math.sqrt(n / max);
    p.circle(cx, cy, r, { fill: INK.whereSoft, stroke: INK.where, width: 0.8 });
    p.text(cx, cy + 2.5, short(n), { size: 7, font: 'bold', align: 'center' });
    p.text(cx, cy + r + 8, fit(String(name).replace(/^o_/, ''), 6.5, cw - 4), { size: 6.5, color: INK.mut, align: 'center' });
  });
}

/** How the index is built: folders (the truth, in every sharing point) → tables (computed on the device). */
export function indexMap(p, { x, y, w }, tables, strands) {
  const left = [['take/v/', 'Bild', strands.v], ['take/a/', 'Ton', strands.a], ['take/x/', 'context', strands.x], ['echo/l/ echo/m/', '~ berechnet', strands.l + strands.m], ['chain/', 'chains (Log)', tables.chains], ['keys/', 'nie geteilt', null]];
  const right = [['strands', tables.strands], ['chains', tables.chains], ['context', tables.context], ['weave', tables.weave], ['sharingPoints', tables.sharingPoints], ['takes', tables.takes], ['similar', tables.similar]];
  const links = [[0, 0], [1, 0], [2, 0], [2, 2], [3, 0], [3, 3], [4, 1], [4, 3], [4, 5], [4, 6]];
  const bw = 150, lx = x, rx = x + w - bw, rowL = 24, rowR = 20.6;
  const L = (i) => y + i * rowL + 9, R = (i) => y + i * rowR + 8;
  for (const [a, b] of links) { const ax = lx + bw, bx = rx, ay = L(a), by = R(b); p.poly([[ax, ay], [ax + 40, ay], [bx - 40, by], [bx, by]], { stroke: INK.rest, width: 0.8 }); }
  left.forEach(([folder, what, n], i) => {
    const secret = n == null;
    p.rect(lx, L(i) - 9, bw, 18, { r: 5, fill: secret ? INK.handTint : INK.card, stroke: secret ? INK.hand : INK.line, width: 0.6, dash: secret ? [2, 2] : null });
    p.text(lx + 7, L(i) + 2.5, folder, { size: 7.5, font: 'mono' });
    p.text(lx + bw - 7, L(i) + 2.5, what, { size: 6.5, color: INK.mut, align: 'right' }); // the numbers stand at the arcs and in the tables, not twice
  });
  right.forEach(([name, n], i) => {
    p.rect(rx, R(i) - 8, bw, 16, { r: 8, fill: INK.paper, stroke: INK.mut, width: 0.6 });
    p.text(rx + 8, R(i) + 2.5, name, { size: 7.5, font: 'bold' });
    p.text(rx + bw - 8, R(i) + 2.5, n0(n ?? 0), { size: 7, align: 'right' });
  });
  p.text(lx, y + left.length * rowL + 10, 'Dateien', { size: 7, color: INK.mut });
  p.text(rx + bw, y + left.length * rowL + 10, 'Index, berechnet', { size: 7, color: INK.mut, align: 'right' });
}

/** One step of a pictured way: a numbered teal circle, a small picture, one word; returns nothing. */
export function step(p, cx, cy, no, word, picture) {
  p.circle(cx - 44, cy - 16, 6, { fill: INK.timeSoft, stroke: INK.time, width: 0.7 });
  p.text(cx - 44, cy - 13.6, String(no), { size: 6.5, font: 'bold', align: 'center' });
  picture(cx, cy);
  p.text(cx, cy + 30, word, { size: 7.5, align: 'center' });
}

/** An arrow between two steps (teal: a way in time). */
export function next(p, x1, x2, y) {
  p.line(x1, y, x2 - 5, y, { stroke: INK.time, width: 1 });
  p.poly([[x2, y], [x2 - 5, y - 3], [x2 - 5, y + 3]], { close: true, fill: INK.time });
}
