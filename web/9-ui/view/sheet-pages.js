// sheet-pages.js — the pages of the emergency sheet after the cover (14.11.): backup, sharing points, stock, context,
// accounts. Each function fills one Page from the plain sheet (emergency.js sheetData); nothing here reads a store.
// Every fact stands once: a number at its bar or in its tile, a path in the table, never twice.
//
// Purpose:   backup   paper password, how backups open (this device or the paper → each backup target), access IDs,
//                     password gestures and login by hand, the way back in 3 steps
//            points   this device in the middle, every sharing point around it as a tile of the sharing menu (number of
//                     files at each strand bar); arrows = where things go: coral = always (dashed: ask), green double =
//                     backup, blue = brought in (towards the device), also between sharing points; open coral dot =
//                     consent; then one table: number, name, login, whole path, q_, a line for the password by hand
//            stock    takes, hours, words, versions · the field with the strand numbers · weeks · trends · rooms · index
//            context  all clusters in one picture (view/sheet-cluster.js)
//            accounts (admin) hello · join · within · quiet; tile size = bytes (smallest → largest), GB in the tile,
//                     files per strand at the bars; the space once, as a bar
// Depends:   1-model/pdf.js, view/sheet-charts.js, view/sheet-cluster.js
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    ≤ 24 sharing points around the device (more: "+n") · table 12 rows on the first page, 30 on each next ·
//            paths ≤ 140 characters whole (≥ 5 pt) · accounts flow in rows, a new page when full (≈ 30–40 a page).

import { Page, fit, textWidth } from '../../1-model/pdf.js';
import { INK, title, tiles, tile, arcs, weeks, trend, rooms, indexMap, n0, short, hours } from './sheet-charts.js';
import { bigCluster } from './sheet-cluster.js';

export const M = 40, W = 515;
const groups = (s) => s.replace(/(.{4})/g, '$1 ').trim();
const gb = (b) => (b / 1e9).toLocaleString('de-DE', { maximumFractionDigits: b < 1e10 ? 1 : 0 });
const barsOf = (pt) => Object.fromEntries(['v', 'a', 'x', 'l'].map((k) => [k, pt.always.includes(k) || (pt.marks.includes('always') && !pt.always.length) ? 'always'
  : pt.marks.includes('ask') && (!pt.kinds.length || pt.kinds.includes(k)) ? 'tap' : 'off']));
const FLOW = { always: { ink: INK.me }, ask: { ink: INK.me, dash: [3, 2] }, backup: { ink: INK.ok, double: true }, show: { ink: INK.shared, back: true } };

function value(p, y, label, text, size = 8.5) {
  p.rect(M, y - 9, W, 15, { r: 4, fill: INK.paper });
  p.text(M + 6, y + 1.5, label, { size: 7, color: INK.mut });
  p.text(M + 92, y + 1.5, fit(text, size, W - 98, 'mono'), { size, font: 'mono' });
  return y + 18;
}

/** An arrow from tile A to tile B (centres and half sizes), shifted sideways by off. */
function arrow(p, A, B, { ink, dash = null, double = false }, off = 0) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy * off, ny = ux * off;
  const x1 = A.x + ux * (A.h + 4) + nx, y1 = A.y + uy * (A.h + 4) + ny, x2 = B.x - ux * (B.h + 7) + nx, y2 = B.y - uy * (B.h + 7) + ny;
  for (const o of double ? [-1.3, 1.3] : [0]) p.line(x1 - uy * o, y1 + ux * o, x2 - uy * o, y2 + ux * o, { stroke: ink, width: 0.9, dash });
  p.poly([[x2 + ux * 5, y2 + uy * 5], [x2 - uy * 3, y2 + ux * 3], [x2 + uy * 3, y2 - ux * 3]], { close: true, fill: ink });
}

export function backupPage(sheet) {
  const p = new Page();
  let y = title(p, M, 84, W, 'Backup');
  p.rect(M, y - 4, W, 58, { r: 12, fill: INK.secretTint, stroke: INK.secret, width: 1 });
  p.text(M + 16, y + 11, 'Papier-Passwort', { size: 8, font: 'bold' });
  p.text(M + W / 2, y + 38, groups(sheet.paper), { size: 23, font: 'mono', align: 'center' });
  y += 76;
  const targets = sheet.points.filter((pt) => pt.marks.includes('backup')), rowH = 40;
  const dx = M + 46, tx = M + 300, h = Math.max(2, targets.length) * rowH, dev = { x: dx, y: y + h / 2 - 16, h: 20 }, paper = { x: dx, y: y + h / 2 + 30, h: 11 };
  tile(p, dev.x, dev.y, 40, { fill: INK.meTint, edges: false, number: 0 });
  p.rect(dx - 24, paper.y - 11, 48, 22, { r: 4, fill: INK.secretTint, stroke: INK.secret, width: 0.8, dash: [2, 2] });
  p.text(dx, paper.y + 2.5, 'Papier', { size: 7, font: 'bold', align: 'center' });
  if (!targets.length) p.text(tx, y + h / 2, 'noch kein Backup-Ziel', { size: 7.5, color: INK.mut });
  targets.forEach((pt, i) => {
    const T = { x: tx, y: y + i * rowH + rowH / 2, h: 14 };
    arrow(p, dev, T, FLOW.backup);
    arrow(p, { ...paper, x: paper.x + 14 }, T, { ink: INK.secret, dash: [2, 2] });
    tile(p, T.x, T.y, 28, { run: pt.offline ? 'fail' : 'ok', fill: pt.shown ? INK.sharedSoft : INK.card, number: pt.n, edges: false, dashed: pt.offline });
    p.text(tx + 24, T.y + 3, fit(pt.label, 8.5, M + W - tx - 24, 'bold'), { size: 8.5, font: 'bold' });
  });
  y += Math.max(h, 70) + 22;
  y = title(p, M, y, W, 'Zugangs-IDs');
  for (const { label, value: v, small } of sheet.ids) y = value(p, y, label, v, small ? 6.8 : 8.5);
  y = title(p, M, y + 10, W, 'Passwort-Gesten');
  const slots = Math.max(3, Math.min(8, sheet.passwordGestures?.length || sheet.gestureSlots || 5)), sw = (W - (slots - 1) * 6) / slots;
  for (let i = 0; i < slots; i++) {
    const sx = M + i * (sw + 6);
    p.rect(sx, y - 6, sw, 30, { r: 6, fill: INK.secretTint, stroke: INK.secret, width: 0.8, dash: [3, 2] });
    p.text(sx + 8, y + 4, String(i + 1), { size: 7, font: 'bold', color: INK.mut });
    if (sheet.passwordGestures?.[i]) p.text(sx + sw / 2, y + 18, fit(sheet.passwordGestures[i], 9, sw - 8), { size: 9, align: 'center' });
  }
  y = title(p, M, y + 44, W, 'Notzugang');
  ['Konto', 'Passwort'].forEach((label, i) => {
    const lx = M + i * (W / 2 + 6);
    p.text(lx, y + 4, label, { size: 7, color: INK.mut });
    p.line(lx + 44, y + 6, lx + W / 2 - 6, y + 6, { stroke: INK.secret, width: 0.8 });
  });
  y = title(p, M, y + 34, W, 'Zurück');
  [['Namensgebärde', INK.meSoft, INK.me], ['Passwort-Gesten', INK.secretSoft, INK.secret], ['Kachel aufs Gerät + Papier', INK.okTint, INK.ok]].forEach(([head, fill, ink], i, all) => {
    const cw = (W - 28) / 3, sx = M + i * (cw + 14);
    p.circle(sx + 11, y + 4, 10, { fill, stroke: ink, width: 0.8 });
    p.text(sx + 11, y + 7.5, String(i + 1), { size: 9, font: 'bold', align: 'center' });
    p.text(sx + 28, y + 7, fit(head, 8.5, cw - 30, 'bold'), { size: 8.5, font: 'bold' });
    if (i < all.length - 1) p.poly([[sx + cw + 3, y], [sx + cw + 9, y + 4], [sx + cw + 3, y + 8]], { stroke: INK.mut, width: 0.8 });
  });
  return p;
}

/** sharing points around this device, with arrows; then the table. Returns the pages (the table may go on). */
export function pointPages(sheet, self) {
  const p = new Page(), pages = [p], list = sheet.points.slice(0, 24);
  let y = title(p, M, 80, W, `sharing points (${sheet.points.length})`);
  let lx = M; // legend: symbols, a word each
  for (const [text, draw] of [['immer', (x) => arrow(p, { x, y, h: 0 }, { x: x + 22, y, h: 0 }, FLOW.always)], ['fragen', (x) => arrow(p, { x, y, h: 0 }, { x: x + 22, y, h: 0 }, FLOW.ask)],
    ['Backup', (x) => arrow(p, { x, y, h: 0 }, { x: x + 22, y, h: 0 }, FLOW.backup)], ['lesend', (x) => arrow(p, { x, y, h: 0 }, { x: x + 22, y, h: 0 }, FLOW.show)],
    ['Einwilligung', (x) => p.circle(x + 6, y, 2.6, { fill: INK.card, stroke: INK.me, width: 0.9 })], ['friend', (x) => p.circle(x + 6, y, 3.5, { fill: INK.shared })],
    ['läuft', (x) => p.circle(x + 6, y, 2.6, { fill: INK.ok })]]) {
    draw(lx); lx += 26 + p.text(lx + 26, y + 2.5, text, { size: 6.5, color: INK.mut }) + 12;
  }
  const cx = M + W / 2, cy = y + 196, rx = 200, ry = 152;
  const at = new Map([[0, { x: cx, y: cy, h: 20 }]]);
  list.forEach((pt, i) => { const a = (-90 + (360 * (i + 0.5)) / list.length) * (Math.PI / 180); at.set(pt.n, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), h: 15 }); });
  const pairs = new Map();
  for (const f of sheet.flows ?? []) {
    const style = FLOW[f.mark], A = at.get(f.from), B = at.get(f.to);
    if (!style || !A || !B) continue;
    const key = [f.from, f.to].sort().join(), k = pairs.get(key) ?? 0; pairs.set(key, k + 1);
    arrow(p, style.back ? B : A, style.back ? A : B, style, [0, 3.2, -3.2, 6.4][k % 4]); // several rules between the same two: side by side
  }
  const draw = (pt, c, s) => {
    tile(p, c.x, c.y, s, { counts: pt.counts ?? {}, bars: barsOf(pt), fill: pt.self ? INK.meTint : pt.shown ? INK.sharedSoft : INK.card, dashed: pt.offline,
      run: pt.marks.includes('backup') ? (pt.offline ? 'fail' : 'ok') : null, consent: pt.marks.includes('consent'), friend: pt.friend, number: pt.n });
    p.text(c.x, c.y + s / 2 + 19, fit(pt.label, 7.5, 104, 'bold'), { size: 7.5, font: 'bold', align: 'center' });
  };
  draw(self, at.get(0), 40);
  list.forEach((pt) => draw(pt, at.get(pt.n), 30));
  if (sheet.points.length > list.length) p.text(M + W, cy + ry + 30, `+${sheet.points.length - list.length}`, { size: 7, color: INK.mut, align: 'right' });
  // the table: one row each, every fact once
  let page = p, rows = 12;
  y = title(page, M, cy + ry + 52, W, 'Pfade und IDs');
  for (const [i, pt] of [self, ...sheet.points].entries()) {
    if (!rows--) { page = new Page(); pages.push(page); y = title(page, M, 80, W, 'Pfade und IDs'); rows = 29; }
    if (i % 2) page.rect(M, y - 9, W, 22, { r: 3, fill: INK.paper });
    page.text(M + 8, y, String(pt.n), { size: 7.5, font: 'bold', align: 'center' });
    const lw = page.text(M + 20, y, fit(pt.label, 8, 130, 'bold'), { size: 8, font: 'bold' });
    if (pt.login && pt.login !== pt.path) page.text(M + 26 + lw, y, fit(pt.login, 6.5, 230 - lw, 'mono'), { size: 6.5, font: 'mono', color: INK.mut });
    if (pt.path && !pt.self) page.line(M + 280, y + 1, M + W - 92, y + 1, { stroke: INK.secret, width: 0.8 }); // the password, by hand
    page.text(M + W - 4, y, pt.id ?? '', { size: 6.5, font: 'mono', color: INK.mut, align: 'right' });
    if (pt.path) { const size = Math.max(5, Math.min(7, (W - 24) / (0.6 * pt.path.length))); page.text(M + 20, y + 9, fit(pt.path, size, W - 24, 'mono'), { size, font: 'mono' }); }
    y += 22;
  }
  return pages;
}

export function stockPage(sheet) {
  const p = new Page(), st = sheet.stats;
  let y = title(p, M, 80, W, 'Bestand');
  tiles(p, { x: M, y, w: W, h: 52 }, [{ value: n0(st.takes), label: 'Takes' }, { value: hours(st.hours.all), label: 'Stunden' }, { value: short(st.words), label: 'Wörter' }, { value: n0(st.versions), label: 'Versionen' }]);
  y += 92;
  arcs(p, M + 80, y + 52, 46, { counts: st.strands, width: 4, window: INK.picture });
  weeks(p, { x: M + 200, y: y - 4, w: W - 200, h: 104 }, st.weeks, sheet.now);
  y = title(p, M, y + 140, 240, 'Trends');
  trend(p, { x: M, y: y - 2, w: 240 }, st.trend);
  title(p, M + 260, y - 18, W - 260, 'Orte');
  rooms(p, { x: M + 260, y: y - 4, w: W - 260, h: 92 }, st.rooms);
  y = title(p, M, y + 116, W, 'Index');
  indexMap(p, { x: M, y: y + 4, w: W }, st.tables, st.strands);
  return p;
}

export function contextPage(sheet) {
  const p = new Page(), c = sheet.clusters;
  const hint = c.total ? `${Math.round(c.inside * 100)} % der Verbindungen innerhalb${c.bridges?.length ? ` · Brücken: ${c.bridges.slice(0, 4).join(', ')}` : ''}` : '';
  const y = title(p, M, 80, W, `context · ${short(c.words)} chips`, hint);
  bigCluster(p, { x: M, y, w: W, h: 806 - y }, c);
  return p;
}

const STATES = [['hello', INK.mut, [1, 2]], ['join', INK.me, [3, 2]], ['within', INK.me, null], ['quiet', INK.mut, [3, 2]]];

export function accountPages(sheet) {
  const list = sheet.accounts, bytes = list.reduce((a, b) => a + (b.bytes ?? 0), 0), quota = sheet.quota ?? 1e12;
  const sizes = list.map((a) => a.bytes ?? 0), lo = Math.min(...sizes), hi = Math.max(...sizes), S0 = 26, S1 = 66;
  const side = (b) => S0 + (S1 - S0) * Math.sqrt(hi > lo ? (b - lo) / (hi - lo) : 1);
  const pages = [new Page()];
  let p = pages[0];
  let y = title(p, M, 80, W, `Konten (${list.length})`, 'nur Zahlen von atlas, keine Inhalte');
  p.rect(M, y, W - 100, 8, { r: 4, fill: INK.rest }); p.rect(M, y, Math.max(8, (bytes / quota) * (W - 100)), 8, { r: 4, fill: INK.me });
  p.text(M + W, y + 7, `${gb(bytes)} / ${gb(quota)} GB`, { size: 8, font: 'bold', align: 'right' });
  y += 20;
  p.text(M, y, 'Zahl in der Kachel = GB · am Balken = Dateien', { size: 6.5, color: INK.mut });
  y += 10;
  for (const [key, ink, dash] of STATES) {
    const rows = list.filter((a) => a.state === key).sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
    if (!rows.length) continue;
    if (y > 740) { p = new Page(); pages.push(p); y = 80; }
    y = title(p, M, y + 10, W, `${key} ${rows.length}`);
    let x = M, rowH = 0;
    for (const a of rows) {
      const s = side(a.bytes ?? 0), cw = Math.max(s + 72, 96), counted = key === 'within' || key === 'quiet';
      if (x + cw > M + W) { x = M; y += rowH; rowH = 0; }
      if (y + s + 50 > 806) { p = new Page(); pages.push(p); y = 80; x = M; }
      const cx = x + cw / 2, cy = y + 10 + s / 2;
      tile(p, cx, cy, s, { counts: counted ? { v: a.v, a: a.a, x: a.x, l: a.l } : {}, bars: counted ? { v: a.v ? 'always' : 'off', a: a.a ? 'always' : 'off', x: a.x ? 'always' : 'off', l: a.l ? 'always' : 'off' } : {}, edges: counted,
        stroke: ink, dashed: Boolean(dash), fill: key === 'quiet' ? INK.paper : INK.card, number: a.bytes >= 5e7 ? gb(a.bytes) : null });
      p.text(cx, cy + s / 2 + (counted ? 22 : 12), fit(a.label || a.user, 7.5, cw - 6, 'bold'), { size: 7.5, font: 'bold', align: 'center' });
      x += cw; rowH = Math.max(rowH, s + (counted ? 40 : 30));
    }
    y += rowH;
  }
  return pages;
}
