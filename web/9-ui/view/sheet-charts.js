// sheet-charts.js — the drawings of the emergency sheet (14.11.): each takes a Page, a box and plain numbers.
//
// Purpose:   colours of the first version (index.html) and the strand colours of the sheet in one room (INK);
//            ring (the app's mark) · tiles (big numbers) · stacked bar (strands by kind) · weeks (bars) ·
//            trend list · rooms (schematic bubbles) · sharing points around this device · context cluster
//            (chips as nodes, words in one strand as edges) · index (folders → tables).
//            Colour never alone: every bar and node carries its number or word, rules are also dashed or doubled.
// Depends:   1-model/pdf.js (Page, fit, textWidth)
// Test:      tests/model.test.mjs (emergency sheet: draws with empty and full numbers)
// Limits:    text ≥ 6.5 pt (readable printed) · cluster: ≤ 30 nodes, 300 steps of a force layout (~5 ms) ·
//            sharing points around the device: ≤ 16 drawn, the rest as "+n" · rooms: ≤ 12 bubbles.

import { fit, textWidth } from '../../1-model/pdf.js';

export const INK = {
  fg: '#222222', mut: '#8a8984', line: '#e8e6e1', rest: '#e4e2dd', card: '#ffffff', paper: '#faf9f7',
  rc: '#f5c6b8', rcS: '#f5a08a', sc: '#b9d4ee', scS: '#8fb6e0', hold: '#5fbf92', hl: '#ffe9a0', hlS: '#e2bf4f', video: '#2F323A',
};
export const KIND = { v: { ink: INK.video, de: 'Bild' }, a: { ink: INK.rcS, de: 'Ton' }, x: { ink: INK.scS, de: 'context' }, l: { ink: INK.hold, de: 'landmarks' }, m: { ink: INK.hlS, de: 'Maske' } };
export const RULE = { always: { ink: INK.rcS, de: 'immer' }, ask: { ink: INK.rcS, de: 'fragen', dash: [2, 2] }, show: { ink: INK.scS, de: 'lesend' }, backup: { ink: INK.hold, de: 'Backup' }, consent: { ink: INK.hlS, de: 'Einwilligung' } };

const n0 = (n) => Math.round(n).toLocaleString('de-DE');
export const hours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

/** The app's mark: a ring with the four strand arcs (line, Ton, context, Bild) and the point below. */
export function ring(p, cx, cy, r) {
  p.circle(cx, cy, r, { stroke: INK.line, width: 1.2 });
  [[-60, 60, INK.rcS], [60, 140, KIND.a.ink], [140, 220, KIND.x.ink], [220, 300, KIND.v.ink]].forEach(([a, b, ink]) => p.arc(cx, cy, r, a + 6, b - 6, { stroke: ink, width: 2.4 }));
  p.circle(cx, cy + r, r * 0.28, { fill: INK.rc, stroke: INK.rcS, width: 0.8 });
}

/** A section title with a thin rule; returns the y below it. */
export function title(p, x, y, w, text, hint = '') {
  p.text(x, y, text, { size: 10.5, font: 'bold' });
  if (hint) p.text(x + w, y, fit(hint, 7, w - textWidth(text, 10.5, 'bold') - 12), { size: 7, color: INK.mut, align: 'right' });
  p.line(x, y + 5, x + w, y + 5, { stroke: INK.line, width: 0.6 });
  return y + 18;
}

/** Big numbers in a row: [{ value, label, ink }]. */
export function tiles(p, { x, y, w, h }, list) {
  const gap = 8, tw = (w - gap * (list.length - 1)) / list.length;
  list.forEach((t, i) => {
    const tx = x + i * (tw + gap);
    p.rect(tx, y, tw, h, { r: 7, fill: INK.card, stroke: INK.line, width: 0.6 });
    p.rect(tx + 8, y + 8, 14, 3, { r: 1.5, fill: t.ink ?? INK.rcS });
    p.text(tx + 8, y + h - 18, fit(t.value, 17, tw - 14, 'bold'), { size: 17, font: 'bold' });
    p.text(tx + 8, y + h - 7, fit(t.label, 7, tw - 14), { size: 7, color: INK.mut });
  });
}

/** strands by kind as one bar, the numbers under it. counts: { v, a, x, l, m }. */
export function stack(p, { x, y, w }, counts) {
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  p.rect(x, y, w, 14, { r: 7, fill: INK.rest });
  let at = x;
  for (const [k, n] of Object.entries(counts)) {
    if (!n) continue;
    const bw = (n / all) * w;
    p.rect(at, y, Math.max(bw, 2), 14, { fill: KIND[k].ink });
    at += bw;
  }
  let lx = x;
  for (const [k, n] of Object.entries(counts)) {
    p.rect(lx, y + 22, 7, 7, { r: 2, fill: KIND[k].ink });
    lx += 10 + p.text(lx + 10, y + 28.5, `${KIND[k].de} ${n0(n)}`, { size: 7.5 }) + 14;
  }
  if (!all) p.text(x + w / 2, y + 10, 'noch keine strands', { size: 7.5, color: INK.mut, align: 'center' });
}

/** Takes per week (oldest left), month initials under the bars. */
export function weeks(p, { x, y, w, h }, counts, now = Date.now()) {
  const max = Math.max(1, ...counts), bw = w / counts.length;
  for (let k = 0; k <= 2; k++) { const gy = y + h - (h * k) / 2; p.line(x, gy, x + w, gy, { stroke: INK.line, width: 0.4 }); }
  p.text(x - 4, y + 3, n0(max), { size: 6.5, color: INK.mut, align: 'right' });
  counts.forEach((n, i) => {
    const bh = (n / max) * h;
    if (n) p.rect(x + i * bw + 1.5, y + h - bh, bw - 3, bh, { r: Math.min(2, bw / 4), fill: i >= counts.length - 4 ? INK.rcS : INK.rc });
    const d = new Date(now - (counts.length - 1 - i) * 7 * 86_400_000);
    if (d.getDate() <= 7) p.text(x + i * bw + bw / 2, y + h + 10, 'JFMAMJJASOND'[d.getMonth()], { size: 6.5, color: INK.mut, align: 'center' });
  });
}

/** Rising and falling words: [{ word, now, before }]. */
export function trend(p, { x, y, w }, list) {
  if (!list.length) return p.text(x, y + 8, 'noch zu wenige Takes mit Datum', { size: 7.5, color: INK.mut });
  list.forEach((t, i) => {
    const ty = y + i * 15 + 6, up = t.now >= t.before;
    p.poly(up ? [[x, ty + 3], [x + 7, ty + 3], [x + 3.5, ty - 4]] : [[x, ty - 4], [x + 7, ty - 4], [x + 3.5, ty + 3]], { close: true, fill: up ? INK.hold : INK.mut });
    p.text(x + 13, ty + 2.5, fit(t.word, 8.5, w - 70), { size: 8.5 });
    p.text(x + w, ty + 2.5, `${t.before} > ${t.now}`, { size: 7.5, color: INK.mut, align: 'right' });
  });
}

/** Rooms as bubbles on a dotted ground (schematic: the sheet knows names and cells, not coordinates). */
export function rooms(p, { x, y, w, h }, list) {
  p.rect(x, y, w, h, { r: 8, fill: INK.paper, stroke: INK.line, width: 0.6 });
  for (let gx = x + 10; gx < x + w; gx += 12) for (let gy = y + 10; gy < y + h; gy += 12) p.circle(gx, gy, 0.5, { fill: INK.rest });
  if (!list.length) return p.text(x + w / 2, y + h / 2 + 3, 'noch keine Orte °( ) an den Takes', { size: 7.5, color: INK.mut, align: 'center' });
  const max = list[0][1], cols = 4, cw = w / cols, rh = h / Math.ceil(list.length / cols);
  list.forEach(([name, n], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = x + cw * col + cw / 2 + (row % 2 ? cw / 4 : -cw / 8), cy = y + rh * row + rh / 2 - 4;
    const r = 4 + 14 * Math.sqrt(n / max);
    p.circle(cx, cy, r, { fill: INK.sc, stroke: INK.scS, width: 0.8 });
    p.text(cx, cy + 2.5, n0(n), { size: 7, font: 'bold', align: 'center' });
    p.text(cx, cy + r + 8, fit(String(name).replace(/^o_/, ''), 6.5, cw - 4), { size: 6.5, color: INK.mut, align: 'center' });
  });
}

/** This device in the middle, every sharing point around it: size = files there, line = its rules. */
export function around(p, { x, y, w, h }, points, own) {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 - 115, ry = h / 2 - 24, shown = points.slice(0, 16);
  const max = Math.max(1, ...shown.map((s) => s.files ?? 0));
  shown.forEach((s, i) => {
    const a = (-90 + (360 * i) / shown.length) * (Math.PI / 180), px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
    const marks = s.marks.length ? s.marks : ['none'];
    marks.forEach((m, j) => { const off = (j - (marks.length - 1) / 2) * 2.2; p.line(cx + off, cy + off, px + off, py + off, { stroke: RULE[m]?.ink ?? INK.line, width: 1, dash: RULE[m]?.dash ?? (m === 'none' ? [1, 2] : null) }); });
    const r = 6 + 10 * Math.sqrt((s.files ?? 0) / max);
    p.circle(px, py, r, { fill: s.group ? INK.sc : INK.card, stroke: s.group ? INK.scS : INK.rcS, width: 1 });
    p.text(px, py + 2.5, String(s.n), { size: 7, font: 'bold', align: 'center' });
    const right = Math.cos(a) >= 0;
    p.text(px + (right ? r + 4 : -r - 4), py + 2.5, fit(s.label, 7, 92), { size: 7, align: right ? 'left' : 'right' });
    if (s.files) p.text(px + (right ? r + 4 : -r - 4), py + 10.5, `${n0(s.files)} Dateien`, { size: 6.5, color: INK.mut, align: right ? 'left' : 'right' });
  });
  if (points.length > shown.length) p.text(x + w, y + h, `+${points.length - shown.length}`, { size: 7, color: INK.mut, align: 'right' });
  p.circle(cx, cy, 15, { fill: INK.rc, stroke: INK.rcS, width: 1.2 });
  p.text(cx, cy + 2.5, '0', { size: 8, font: 'bold', align: 'center' });
  p.text(cx, cy + 26, fit(own, 7, 110), { size: 7, color: INK.mut, align: 'center' });
  let lx = x;
  for (const [k, r] of Object.entries(RULE)) { p.line(lx, y + 4, lx + 14, y + 4, { stroke: r.ink, width: 1.4, dash: r.dash }); lx += 18 + p.text(lx + 18, y + 6.5, r.de, { size: 6.5, color: INK.mut }) + 10; }
}

/** chips as nodes (size = strands with the word), edges = both words in one strand (width = how often). */
export function cluster(p, { x, y, w, h }, chips, pairs) {
  p.rect(x, y, w, h, { r: 8, fill: INK.paper, stroke: INK.line, width: 0.6 });
  const list = chips.slice(0, 30);
  if (!list.length) return p.text(x + w / 2, y + h / 2, 'noch keine chips', { size: 8, color: INK.mut, align: 'center' });
  const at = new Map(list.map(([word], i) => [word, i]));
  const max = list[0][1], k = Math.sqrt((w * h) / list.length) * 0.6;
  const nodes = list.map(([word, n], i) => ({ word, n, r: 4 + 9 * Math.sqrt(n / max), x: x + w / 2 + Math.cos(i * 2.4) * 8 * Math.sqrt(i + 1), y: y + h / 2 + Math.sin(i * 2.4) * 8 * Math.sqrt(i + 1) }));
  const edges = pairs.filter(([a, b]) => at.has(a) && at.has(b)).map(([a, b, n]) => [nodes[at.get(a)], nodes[at.get(b)], n]);
  const cx = x + w / 2, cy = y + h / 2;
  for (let step = 0; step < 300; step++) { // Fruchterman–Reingold with gravity, cooling; same input = same picture
    const heat = (1 - step / 300) * k * 0.6;
    for (const a of nodes) { a.dx = (cx - a.x) * 0.12; a.dy = (cy - a.y) * 0.12; for (const b of nodes) { if (a === b) continue; const dx = a.x - b.x, dy = a.y - b.y, d = Math.max(1, Math.hypot(dx, dy)); a.dx += (dx / d) * (k * k) / d; a.dy += (dy / d) * (k * k) / d; } }
    for (const [a, b, n] of edges) { const dx = a.x - b.x, dy = a.y - b.y, d = Math.max(1, Math.hypot(dx, dy)), f = ((d * d) / k) * Math.min(1.5, 0.3 + n * 0.08); a.dx -= (dx / d) * f; a.dy -= (dy / d) * f; b.dx += (dx / d) * f; b.dy += (dy / d) * f; }
    for (const a of nodes) { const d = Math.max(1, Math.hypot(a.dx, a.dy)), m = Math.min(d, heat); a.x += (a.dx / d) * m; a.y += (a.dy / d) * m; }
  }
  const pad = { l: 40, r: 40, t: 16, b: 22 }; // fit the picture into the box, then push overlapping circles (and their words) apart
  const bx = [Math.min(...nodes.map((a) => a.x)), Math.max(...nodes.map((a) => a.x))], by = [Math.min(...nodes.map((a) => a.y)), Math.max(...nodes.map((a) => a.y))];
  for (const a of nodes) {
    a.x = x + pad.l + ((a.x - bx[0]) / Math.max(1, bx[1] - bx[0])) * (w - pad.l - pad.r);
    a.y = y + pad.t + ((a.y - by[0]) / Math.max(1, by[1] - by[0])) * (h - pad.t - pad.b);
  }
  for (let step = 0; step < 80; step++) {
    for (const a of nodes) for (const b of nodes) {
      if (a === b) continue;
      const need = { x: Math.max(a.r, textWidth(a.word, 7) / 2) + Math.max(b.r, textWidth(b.word, 7) / 2) + 4, y: a.r + b.r + 12 };
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) >= need.x || Math.abs(dy) >= need.y) continue;
      const ox = need.x - Math.abs(dx), oy = need.y - Math.abs(dy);
      if (ox < oy) { const s = (dx >= 0 ? 1 : -1) * ox / 2; a.x -= s; b.x += s; } else { const s = (dy >= 0 ? 1 : -1) * oy / 2; a.y -= s; b.y += s; }
    }
    for (const a of nodes) { a.x = Math.min(x + w - pad.r, Math.max(x + pad.l, a.x)); a.y = Math.min(y + h - pad.b, Math.max(y + pad.t, a.y)); }
  }
  const root = nodes.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i]))); // clusters = connected words
  for (const [a, b] of edges) root[find(nodes.indexOf(a))] = find(nodes.indexOf(b));
  const groups = new Map();
  nodes.forEach((a, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))).push(a));
  const TINT = [['#eef4fb', INK.scS], ['#fdf0eb', INK.rcS], ['#edf7f1', INK.hold], ['#fcf6e0', INK.hlS], ['#efeff1', INK.video]];
  [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length).forEach((g, i) => {
    const [tint, ink] = TINT[i % TINT.length];
    const x0 = Math.min(...g.map((a) => a.x - Math.max(a.r, textWidth(a.word, 7) / 2))) - 8, x1 = Math.max(...g.map((a) => a.x + Math.max(a.r, textWidth(a.word, 7) / 2))) + 8;
    const y0 = Math.min(...g.map((a) => a.y - a.r)) - 8, y1 = Math.max(...g.map((a) => a.y + a.r + 10)) + 6;
    p.rect(x0, y0, x1 - x0, y1 - y0, { r: 12, fill: tint });
    for (const a of g) a.ink = ink;
  });
  const most = Math.max(1, ...edges.map((e) => e[2]));
  for (const [a, b, n] of edges) p.line(a.x, a.y, b.x, b.y, { stroke: a.ink ?? INK.scS, width: 0.4 + 1.8 * (n / most) });
  for (const a of nodes) {
    p.circle(a.x, a.y, a.r, { fill: a.n === max ? INK.rc : INK.card, stroke: a.ink ?? INK.mut, width: 1 });
    p.text(a.x, a.y + a.r + 8, fit(a.word, 7, 80), { size: 7, align: 'center' });
    if (a.r > 8) p.text(a.x, a.y + 2.5, n0(a.n), { size: 6.5, color: INK.mut, align: 'center' });
  }
}

/** How the index is built: folders (the truth) → tables (computed). counts: tally.tables + strands. */
export function indexMap(p, { x, y, w }, tables, strands) {
  const left = [['take/v/', 'Bild', strands.v], ['take/a/', 'Ton', strands.a], ['take/x/', 'context', strands.x], ['echo/l/ echo/m/', '~ berechnet', strands.l + strands.m], ['chain/', 'chains (Log)', tables.chains], ['keys/', 'nie geteilt', null]];
  const right = [['strands', tables.strands], ['chains', tables.chains], ['context', tables.context], ['weave', tables.weave], ['sharingPoints', tables.sharingPoints], ['takes', tables.takes], ['similar', tables.similar]];
  const links = [[0, 0], [1, 0], [2, 0], [2, 2], [3, 0], [3, 3], [4, 1], [4, 3], [4, 5], [4, 6]];
  const bw = 150, lx = x, rx = x + w - bw, rowL = 24, rowR = 20.6;
  const L = (i) => y + i * rowL + 9, R = (i) => y + i * rowR + 8;
  for (const [a, b] of links) { const ax = lx + bw, bx = rx, ay = L(a), by = R(b); p.poly([[ax, ay], [ax + 40, ay], [bx - 40, by], [bx, by]], { stroke: INK.scS, width: 0.6 }); }
  p.poly([[lx + bw, L(0)], [lx + bw + 20, L(0)]], { stroke: INK.line });
  left.forEach(([folder, what, n], i) => {
    const secret = n == null;
    p.rect(lx, L(i) - 9, bw, 18, { r: 5, fill: secret ? INK.paper : INK.card, stroke: secret ? INK.mut : INK.line, width: 0.6, dash: secret ? [2, 2] : null });
    p.text(lx + 7, L(i) + 2.5, folder, { size: 7.5, font: 'mono' });
    p.text(lx + bw - 7, L(i) + 2.5, secret ? what : `${what} ${n0(n)}`, { size: 6.5, color: INK.mut, align: 'right' });
  });
  right.forEach(([name, n], i) => {
    p.rect(rx, R(i) - 8, bw, 16, { r: 8, fill: INK.sc, stroke: INK.scS, width: 0.6 });
    p.text(rx + 8, R(i) + 2.5, name, { size: 7.5, font: 'bold' });
    p.text(rx + bw - 8, R(i) + 2.5, n0(n ?? 0), { size: 7, align: 'right' });
  });
  p.text(lx, y + left.length * rowL + 10, 'Dateien = Wahrheit (in jedem sharing point)', { size: 7, color: INK.mut });
  p.text(rx + bw, y + left.length * rowL + 10, 'Index = berechnet, jederzeit neu baubar', { size: 7, color: INK.mut, align: 'right' });
}
