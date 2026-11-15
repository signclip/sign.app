// sheet-pages.js — the pages of the emergency sheet after the cover (14.11.): backup, sharing points, stock, context,
// accounts. Each function fills one Page from the plain sheet (emergency.js sheetData); nothing here reads a store.
// Every fact stands once: a number at its bar or in its tile, a path in the table, never twice.
//
// Purpose:   backup   paper password, how backups open (this device or the paper → each backup target), access IDs,
//                     password gestures and login by hand, the way back in 3 steps
//            points   as in the sharing menu: this device first, 3 tiles a row, one bridge kind with chevron (new things go
//                     there), under each tile the day of the last backup and copy; the joining icon with hello and join;
//                     then one table: name, login, whole path, q_, password line
//            stock    takes, hours, words, versions · the field with the strand numbers · weeks · the earth · index
//            context  every take a point, placed by its words (view/sheet-context.js)
//            accounts (admin) hello · join · within · quiet; tile size = bytes (smallest → largest), GB in the tile,
//                     files per strand at the bars; the space once, as a bar
// Depends:   1-model/pdf.js, view/sheet-charts.js, view/sheet-context.js, view/earth.js
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    sharing points: 3 a row, ≈ 4 rows on the page (12 incl. join tiles), more rows push the table on ·
//            paths ≤ 140 characters whole (≥ 5 pt) · accounts flow in rows, a new page when full (≈ 30–40 a page).

import { Page, fit, textWidth } from '../../1-model/pdf.js';
import { INK, title, tiles, tile, arcs, weeks, indexMap, step, next, n0, short, hours } from './sheet-charts.js';
import { contextPicture } from './sheet-context.js';
import { earth, sun } from './earth.js';

export const M = 40, W = 515;
const appArcSafe = (p, cx, cy, r) => p.arc(cx, cy, r, 180, 360, { fill: INK.whoSoft }); // shoulders of a person
const groups = (s) => s.replace(/(.{4})/g, '$1 ').trim();
const gb = (b) => (b / 1e9).toLocaleString('de-DE', { maximumFractionDigits: b < 1e10 ? 1 : 0 });
const barsOf = (pt) => Object.fromEntries(['v', 'a', 'x', 'l'].map((k) => [k, pt.always.includes(k) || (pt.marks.includes('always') && !pt.always.length) ? 'always'
  : pt.marks.includes('ask') && (!pt.kinds.length || pt.kinds.includes(k)) ? 'tap' : 'off']));

function value(p, y, label, text, size = 8.5) {
  p.rect(M, y - 9, W, 15, { r: 4, fill: INK.paper });
  p.text(M + 6, y + 1.5, label, { size: 7, color: INK.mut });
  p.text(M + 92, y + 1.5, fit(text, size, W - 98, 'mono'), { size, font: 'mono' });
  return y + 18;
}

/**
 * Zugang (15.11.): one overview of everything that opens Sign, so a new signer sees at once what is theirs to keep:
 *   bei dir      name sign and password gestures: a new device, a new account (nothing to write but the gestures' words)
 *   dieses Blatt the paper password: opens every backup when all devices are gone
 *   Admin        person and device IDs: only passed on when the admin asks (a device to add or remove)
 *   nur Admin    (admin and atlas sheets only) the admin account, atlas, the signer code, the emergency login
 * below in the same order: the password gestures, the paper password and how it opens a backup, the IDs.
 */
export function backupPage(sheet) {
  const p = new Page();
  let y = title(p, M, 84, W, 'Zugang');
  const cards = [
    ['bei dir', 'neues Gerät, neues Konto', INK.who, (cx, cy) => { arcs(p, cx - 18, cy, 11, { width: 1.8, window: INK.picture, line: false }); for (let i = 0; i < 3; i++) p.rect(cx + 2 + i * 12, cy - 6, 10, 12, { r: 2, fill: INK.handTint, stroke: INK.hand, width: 0.6, dash: [1.5, 1.5] }); }, ['Namensgebärde', 'Passwort-Gesten']],
    ['dieses Blatt', 'wenn alle Geräte fehlen', INK.hand, (cx, cy) => { p.rect(cx - 22, cy - 9, 44, 18, { r: 3, fill: INK.handTint, stroke: INK.hand, width: 0.8 }); p.text(cx, cy + 2.5, 'ABCD …', { size: 6.5, font: 'mono', align: 'center' }); }, ['Papier-Passwort']],
    ['für den Admin', 'nur wenn gefragt', INK.mut, (cx, cy) => { p.text(cx, cy - 1, 'n_ …', { size: 7, font: 'mono', align: 'center', color: INK.mut }); p.text(cx, cy + 8, 'q_ … z_ …', { size: 7, font: 'mono', align: 'center', color: INK.mut }); }, ['Person', 'Geräte (signer)']],
    ...(sheet.admin ? [['nur Admin', 'nie weitergeben', INK.fg, (cx, cy) => { p.circle(cx, cy, 9, { stroke: INK.fg, width: 1 }); p.circle(cx, cy, 3, { fill: INK.fg }); }, ['Admin-Konto', 'Ersatz-signer', 'Notzugang']]] : []),
  ];
  const cw = (W - (cards.length - 1) * 8) / cards.length;
  cards.forEach(([head, when, ink, pic, items], i) => {
    const cx0 = M + i * (cw + 8);
    p.rect(cx0, y - 4, cw, 108, { r: 10, fill: INK.card, stroke: ink, width: 1 });
    p.text(cx0 + 10, y + 10, head, { size: 9, font: 'bold' });
    pic(cx0 + cw / 2, y + 36);
    items.forEach((t, j) => p.text(cx0 + 10, y + 64 + j * 10, t, { size: 7.5 }));
    p.text(cx0 + 10, y + 97, when, { size: 6.5, color: INK.mut });
  });
  y += 124;
  // 1 bei dir: the name sign needs nothing written; the password gestures one word each, by hand
  y = title(p, M, y, W, 'bei dir · Passwort-Gesten', 'ein Wort je Geste, von Hand');
  const slots = Math.max(3, Math.min(8, sheet.passwordGestures?.length || sheet.gestureSlots || 5)), sw = (W - (slots - 1) * 6) / slots;
  for (let i = 0; i < slots; i++) {
    const sx = M + i * (sw + 6);
    p.rect(sx, y - 6, sw, 26, { r: 6, fill: INK.handTint, stroke: INK.hand, width: 0.8, dash: [3, 2] });
    p.text(sx + 8, y + 4, String(i + 1), { size: 7, font: 'bold', color: INK.mut });
    if (sheet.passwordGestures?.[i]) p.text(sx + sw / 2, y + 15, fit(sheet.passwordGestures[i], 9, sw - 8), { size: 9, align: 'center' });
  }
  // 2 dieses Blatt: the paper password, how it is used (copy → backup tile onto the device), where it opens
  y = title(p, M, y + 36, W, 'dieses Blatt · Papier-Passwort', 'öffnet jedes Backup');
  p.rect(M, y - 4, W, 46, { r: 12, fill: INK.handTint, stroke: INK.hand, width: 1 });
  p.text(M + W / 2, y + 27, groups(sheet.paper), { size: 22, font: 'mono', align: 'center' });
  y += 62;
  const fy = y + 16, fx = [M + 60, M + 200, M + 340];
  step(p, fx[0], fy, 1, 'kopieren', (cx, cy) => { p.rect(cx - 20, cy - 8, 40, 16, { r: 3, fill: INK.handTint, stroke: INK.hand, width: 0.8 }); p.text(cx, cy + 2.5, 'ABCD …', { size: 6, font: 'mono', align: 'center' }); });
  next(p, fx[0] + 36, fx[1] - 36, fy);
  step(p, fx[1], fy, 2, 'Kachel aufs Gerät', (cx, cy) => { tile(p, cx - 16, cy - 4, 18, { run: 'ok', edges: false }); p.line(cx - 6, cy, cx + 6, cy + 2, { stroke: INK.safe, width: 1 }); tile(p, cx + 16, cy + 2, 20, { fill: INK.whoTint, stroke: INK.who, edges: false, number: 0 }); });
  next(p, fx[1] + 36, fx[2] - 36, fy);
  step(p, fx[2], fy, 3, 'Backup offen', (cx, cy) => tile(p, cx, cy, 22, { fill: INK.whoTint, stroke: INK.who, edges: false, run: 'ok' }));
  const targets = sheet.points.filter((pt) => pt.marks.includes('backup'));
  targets.slice(0, 4).forEach((pt, i) => { // where it opens: the backup targets
    const ty = fy - 18 + i * 14;
    p.circle(M + 412, ty, 2.4, pt.offline ? { stroke: INK.safe, width: 0.8 } : { fill: INK.safe });
    p.text(M + 420, ty + 2.5, fit(pt.label, 7.5, W - 382), { size: 7.5 });
  });
  if (!targets.length) p.text(M + 412, fy, 'noch kein Backup-Ziel', { size: 7, color: INK.mut });
  y += 68;
  // 3 für den Admin: only when asked — the person and every device (signer) with q_ and z_
  y = title(p, M, y, W, 'für den Admin', 'nur weitergeben, wenn er fragt');
  for (const { label, value: v, small } of sheet.ids) y = value(p, y, label, v, small ? 6.8 : 8.5);
  // 4 nur Admin (admin and atlas sheets)
  if (sheet.admin) {
    y = title(p, M, y + 8, W, 'nur Admin', 'nie weitergeben');
    for (const { label, value: v, small } of sheet.adminIds) y = value(p, y, label, v, small ? 6.8 : 8.5);
    if (sheet.adminIds.some((i) => i.label === 'Ersatz-signer')) p.text(M + 92, y - 3, 'Admin-Gerät verloren: Code kopieren, auf dem neuen Gerät + antippen', { size: 6.5, color: INK.mut });
    y += 8;
    ['Konto', 'Passwort'].forEach((label, i) => { // the emergency login: by hand only, never digital
      const lx = M + i * (W / 2 + 6);
      p.text(lx, y + 4, label, { size: 7, color: INK.mut });
      p.line(lx + 44, y + 6, lx + W / 2 - 6, y + 6, { stroke: INK.hand, width: 0.8 });
    });
  }
  return p;
}

/**
 * sharing points as in the sharing menu (view/points.js): this device first, 3 tiles a row (86 × 64), bridges from tile to
 * tile — straight to the next, bent below when tiles lie between — with a chevron in the middle pointing where it runs;
 * the joining icon (me → group → my own space) with the day of the hello and of the join on its lines; the password
 * gestures one joins with; then one table. Returns the pages (the table may go on).
 */
export function pointPages(sheet, self) {
  const p = new Page(), pages = [p];
  let y = title(p, M, 80, W, `sharing points (${sheet.points.length})`);
  // legend: one line, a few marks
  let lx = M;
  const legend = [['Neues geht dorthin', (x) => { p.line(x, y, x + 22, y, { stroke: INK.takeSoft, width: 5 }); chevron(p, x, y, x + 22, y, INK.take); }],
    ['letztes Backup', (x) => p.circle(x + 11, y, 2.6, { fill: INK.safe })], ['letzte Kopie', (x) => p.line(x + 5, y, x + 17, y, { stroke: INK.take, width: 2 })],
    ['eingebunden', (x) => p.rect(x + 4, y - 5, 14, 10, { r: 3, fill: INK.whereSoft, stroke: INK.where, width: 0.8 })],
    ['hello · join', (x) => p.line(x, y, x + 22, y, { stroke: INK.where, width: 2, dash: [1, 3] })]];
  for (const [text, draw] of legend) { draw(lx); lx += 27 + p.text(lx + 27, y + 2.5, text, { size: 6.5, color: INK.mut }) + 11; }
  // slots as in the menu: this device 0, then each sharing point; a join not yet within takes one more for my own space
  const TW = 84, TH = 62, CW = W / 3, RH = 124, y0 = y + 50; // 86 × 64 in the app
  const joinOf = new Map((sheet.joins ?? []).map((j) => [j.label, j]));
  const slot = new Map([[0, 0]]), ownSlot = new Map();
  for (const pt of sheet.points) {
    slot.set(pt.n, slot.size + ownSlot.size);
    const j = joinOf.get(pt.label);
    if (j && j.state !== 'within' && j.state !== 'quiet') ownSlot.set(pt.n, slot.get(pt.n) + 1);
  }
  const at = (i) => ({ x: M + (i % 3) * CW + CW / 2, y: y0 + Math.floor(i / 3) * RH });
  const centre = (n) => at(slot.get(n));
  const marks = [];
  const bridge = (from, to, style) => { // the app's bridge: centre to centre, bent below when tiles lie between
    const a = centre(from), b = centre(to);
    if (!a || !b) return;
    const far = Math.abs(slot.get(from) - slot.get(to)) > 1;
    if (!far) { p.line(a.x, a.y, b.x, b.y, style.line); marks.push([a.x, a.y, b.x, b.y, style.ink]); return; }
    const c = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + TH * 1.6 };
    p.curve(a.x, a.y, c.x, c.y, b.x, b.y, style.line);
    const mx = 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, my = 0.25 * a.y + 0.5 * c.y + 0.25 * b.y, d = Math.sign(b.x - a.x) || 1;
    marks.push([mx - d, my, mx + d, my, style.ink]);
  };
  const LINE = { line: { stroke: INK.takeSoft, width: 5 }, ink: INK.take }, drawn = new Set();
  for (const f of sheet.flows ?? []) { // one line per pair, whatever goes (copy, backup, from now or with all before): when, the dates say
    if (!['always', 'ask', 'backup'].includes(f.mark) || drawn.has(`${f.from}>${f.to}`)) continue;
    drawn.add(`${f.from}>${f.to}`); bridge(f.from, f.to, LINE);
  }
  // the joining icon: me → group (hello dotted, join solid) → my own space (rose); the days on the lines
  const days = [], near = (A, B) => { const d = Math.hypot(B.x - A.x, B.y - A.y) || 1, t = Math.max(0.5, 1 - (TW / 2 + 22) / d); return [A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t]; };
  for (const pt of sheet.points) {
    const j = joinOf.get(pt.label);
    if (!j || j.state === 'within' || j.state === 'quiet') continue; // within: the tiles take over, as in the app (the days stay under the name)
    const me = centre(0), g = centre(pt.n), own = at(ownSlot.get(pt.n)), done = j.state !== 'hello';
    p.line(me.x, me.y, g.x, g.y, { stroke: INK.where, width: 2, dash: done ? null : [1, 3] });
    if (j.hello) days.push([...near(me, g), `hello ${j.hello}`]);
    p.line(g.x, g.y, own.x, own.y, { stroke: INK.who, width: 2, dash: [1, 3] });
    if (j.join) days.push([...near(g, own), `join ${j.join}`]);
    tile(p, own.x, own.y, TW, { h: TH, fill: INK.card, stroke: INK.who, dashed: true, edges: false });
    p.text(own.x, own.y + TH / 2 + 24, fit(sheet.name, 8, CW - 12, 'bold'), { size: 8, font: 'bold', align: 'center', color: INK.mut });
  }
  const draw = (pt, c) => {
    tile(p, c.x, c.y, TW, { h: TH, counts: pt.service ? {} : pt.counts ?? {}, bars: barsOf(pt), edges: !pt.service, fill: pt.self ? INK.whoTint : pt.service ? INK.paper : pt.shown ? INK.whereSoft : INK.card,
      stroke: pt.self ? INK.who : INK.where, width: pt.group ? 2.2 : 1, dashed: pt.offline, consent: pt.consent ?? [], friend: pt.friend, number: pt.n });
    p.text(c.x, c.y + TH / 2 + 24, fit(pt.label, 8, CW - 12, 'bold'), { size: 8, font: 'bold', align: 'center' });
    const j = joinOf.get(pt.label), marks = [];
    if (pt.lastBackup) marks.push(['b', pt.lastBackup]);
    if (pt.lastCopy) marks.push(['c', pt.lastCopy]);
    if (j && (j.state === 'within' || j.state === 'quiet') && j.join) marks.push(['j', j.join]);
    const widths = marks.map(([, d]) => textWidth(d, 6.5) + 12), all = widths.reduce((a, b) => a + b, 0);
    let mx = c.x - all / 2, my = c.y + TH / 2 + 33;
    marks.forEach(([kind, d], i) => { // the days: last backup (mint dot), last copy (honey dash), join
      if (kind === 'b') p.circle(mx + 3, my - 2.3, 2.3, { fill: INK.safe });
      else if (kind === 'c') p.line(mx, my - 2.3, mx + 7, my - 2.3, { stroke: INK.take, width: 2 });
      else p.line(mx, my - 2.3, mx + 7, my - 2.3, { stroke: INK.where, width: 2 });
      p.text(mx + 9, my, d, { size: 6.5, color: INK.mut }); mx += widths[i];
    });
  };
  draw(self, centre(0));
  for (const pt of sheet.points) draw(pt, centre(pt.n));
  for (const [x1, y1, x2, y2, ink] of marks) chevron(p, x1, y1, x2, y2, ink); // on top: which way it runs
  for (const [x, yy, text] of days) { const w = textWidth(text, 6.5) + 8; p.rect(x - w / 2, yy - 6, w, 11, { r: 5.5, fill: INK.card, stroke: INK.where, width: 0.5 }); p.text(x, yy + 2.3, text, { size: 6.5, align: 'center' }); }
  const rowsUsed = Math.ceil((slot.size + ownSlot.size) / 3);
  y = y0 + (rowsUsed - 1) * RH + TH / 2 + 48;
  // the table: one row each, every fact once
  let page = p;
  y = title(page, M, y, W, 'Pfade und IDs');
  let rows = Math.max(0, Math.floor((806 - y) / 22));
  for (const [i, pt] of [self, ...sheet.points].entries()) {
    if (!rows--) { page = new Page(); pages.push(page); y = title(page, M, 80, W, 'Pfade und IDs'); rows = 29; }
    if (i % 2) page.rect(M, y - 9, W, 22, { r: 3, fill: INK.paper });
    page.text(M + 8, y, String(pt.n), { size: 7.5, font: 'bold', align: 'center' });
    const lw = page.text(M + 20, y, fit(pt.label, 8, 130, 'bold'), { size: 8, font: 'bold' });
    if (pt.login && pt.login !== pt.path) page.text(M + 26 + lw, y, fit(pt.login, 6.5, 230 - lw, 'mono'), { size: 6.5, font: 'mono', color: INK.mut });
    if (pt.path && !pt.self) page.line(M + 280, y + 1, M + W - 92, y + 1, { stroke: INK.hand, width: 0.8 }); // the password, by hand
    page.text(M + W - 4, y, pt.id ?? '', { size: 6.5, font: 'mono', color: INK.mut, align: 'right' });
    if (pt.path) { const size = Math.max(5, Math.min(7, (W - 24) / (0.6 * pt.path.length))); page.text(M + 20, y + 9, fit(pt.path, size, W - 24, 'mono'), { size, font: 'mono' }); }
    y += 22;
  }
  return pages;
}

/** The app's chevron: in the middle of a bridge, pointing to its target. */
function chevron(p, x1, y1, x2, y2, ink) {
  const x = (x1 + x2) / 2, y = (y1 + y2) / 2, a = Math.atan2(y2 - y1, x2 - x1), s = 6;
  p.poly([[x - s * Math.cos(a + 0.6), y - s * Math.sin(a + 0.6)], [x, y], [x - s * Math.cos(a - 0.6), y - s * Math.sin(a - 0.6)]], { stroke: ink, width: 2 });
}

export function stockPage(sheet) {
  const p = new Page(), st = sheet.stats;
  let y = title(p, M, 80, W, 'Bestand');
  tiles(p, { x: M, y, w: W, h: 52 }, [{ value: n0(st.takes), label: 'Takes' }, { value: hours(st.hours.all), label: 'Stunden' }, { value: short(st.words), label: 'Wörter' }, { value: n0(st.versions), label: 'Fassungen' }]);
  y += 92;
  arcs(p, M + 80, y + 52, 46, { counts: st.strands, width: 4, window: INK.picture });
  weeks(p, { x: M + 200, y: y - 4, w: W - 200, h: 104 }, st.weeks, sheet.now);
  y = title(p, M, y + 140, W, 'Orte');
  sun(p, { x: M, y, w: 104, h: 168 });
  earth(p, { x: M + 120, y, w: W - 120, h: 168 }, sheet.spots ?? []);
  y = title(p, M, y + 194, W, 'Index');
  indexMap(p, { x: M, y: y + 4, w: W }, st.tables, st.strands);
  return p;
}

export function contextPage(sheet) {
  const p = new Page(), c = sheet.context;
  const y = title(p, M, 80, W, `context · ${short(c.words)} Wörter · ${short(c.takes)} Takes`);
  contextPicture(p, { x: M, y, w: W, h: 806 - y }, c, sheet.now);
  return p;
}

const STATES = [['hello', INK.mut, [1, 2]], ['join', INK.who, [3, 2]], ['within', INK.who, null], ['quiet', INK.mut, [3, 2]]]; // accounts are persons: rose

export function accountPages(sheet) {
  const list = sheet.accounts, bytes = list.reduce((a, b) => a + (b.bytes ?? 0), 0), quota = sheet.quota ?? 1e12;
  const sizes = list.map((a) => a.bytes ?? 0), lo = Math.min(...sizes), hi = Math.max(...sizes), S0 = 26, S1 = 66;
  const side = (b) => S0 + (S1 - S0) * Math.sqrt(hi > lo ? (b - lo) / (hi - lo) : 1);
  const pages = [new Page()];
  let p = pages[0];
  let y = title(p, M, 80, W, `Konten (${list.length})`, 'nur Zahlen von atlas, keine Inhalte');
  p.rect(M, y, W - 100, 8, { r: 4, fill: INK.rest }); p.rect(M, y, Math.max(8, (bytes / quota) * (W - 100)), 8, { r: 4, fill: INK.where }); // space used = where: blue
  p.text(M + W, y + 7, `${gb(bytes)} / ${gb(quota)} GB`, { size: 8, font: 'bold', align: 'right' });
  y += 20;
  p.text(M, y, 'Zahl in der Kachel = GB · am Balken = Dateien', { size: 6.5, color: INK.mut });
  y += 34; // the way of an account: hello → join → within → quiet, with how many stand at each step
  const sw2 = W / STATES.length;
  STATES.forEach(([key, ink, dash], i) => {
    const cx = M + sw2 * i + sw2 / 2, n = list.filter((a) => a.state === key).length;
    p.rect(cx - 30, y - 12, 60, 24, { r: 12, fill: key === 'within' ? INK.whoTint : INK.card, stroke: ink, width: 1, dash });
    p.text(cx, y - 1, String(n), { size: 10, font: 'bold', align: 'center' });
    p.text(cx, y + 8, key, { size: 6.5, color: INK.mut, align: 'center' });
    if (i < STATES.length - 1) next(p, cx + 34, cx + sw2 - 34, y);
  });
  y += 14;
  for (const [key, ink, dash] of STATES) {
    const rows = list.filter((a) => a.state === key).sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
    if (!rows.length) continue;
    if (y > 740) { p = new Page(); pages.push(p); y = 80; }
    y = title(p, M, y + 10, W, key);
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
