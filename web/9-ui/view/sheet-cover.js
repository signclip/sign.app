// sheet-cover.js — the first page of the emergency sheet (14.11.): what the app looks like and where it goes.
//
// Purpose:   the phone with the app as it is (Similar tiles upper right, the field as a ring with the strand arcs
//            and their numbers, chips under it, the point at the lower edge), each part named by a thin line;
//            the colours and what they mean (the same on every page); the roadmap: four waves and SL2T as stations
//            on one path, "du bist hier" in wave 1, the 20 sessions as dots (done · running · ahead).
// Depends:   1-model/pdf.js, view/sheet-charts.js (INK, arcs, appArc, short)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    one page · the waves come from md/WAVES.md, the sessions from app/README.md (written here as text:
//            a new wave or session = one line in WAVES / SESSIONS below).

import { fit } from '../../1-model/pdf.js';
import { INK, arcs, short } from './sheet-charts.js';

export const WAVES = [
  { no: '1', name: 'Lernen und Ablegen', who: '1–20 Personen · DGS 1. Semester', app: 'Browser und APK, eigene Nextcloud' },
  { no: '2', name: 'Hochschulraum und App', who: '20–100 Studierende, dann einige hundert', app: 'Lern-App · landmarks · Echtzeit-Suche' },
  { no: '3', name: 'Weiterer Kreis', who: 'alle Hochschulen · Gehörlosen-Community', app: 'DGS-Suite · Gespräche · modeling' },
  { no: 'SL2T', name: 'eigene wave', who: 'nur mit eigener Einwilligung', app: 'Gebärde zu Text', side: true },
  { no: '4', name: 'Wohin weiter', who: 'Beyond', app: 'das Design als wide interface' },
];
// sessions (app/README.md): wave and state (done · run · ahead), as of 14.11.
export const SESSIONS = [[1, 'done'], [1, 'done'], [1, 'run'], [1, 'run'], [2], [2], [2], [2, 'run'], [2, 'run'], [2], [0], [0], [3], [3], [3], [3], [3], [3], ['SL2T'], [4]];

function phone(p, x, y, sheet) {
  const W = 168, H = 336, st = sheet.stats;
  p.rect(x, y, W, H, { r: 24, fill: INK.rest, stroke: INK.fg, width: 1.4 });
  p.rect(x + W / 2 - 18, y + 8, 36, 5, { r: 2.5, fill: INK.fg });
  p.circle(x + 16, y + 26, 5, { stroke: INK.me, width: 1 }); p.circle(x + 16, y + 26, 1.6, { fill: INK.me }); // own settings ◉
  for (let i = 0; i < 3; i++) p.rect(x + W - 66 + i * 19, y + 20, 15, 15, { r: 4, fill: INK.sharedSoft, stroke: INK.shared, width: 0.6 }); // Similar
  const cx = x + W / 2, cy = y + 140;
  arcs(p, cx, cy, 52, { counts: st.strands, width: 3.6, window: INK.picture, size: 6.5 });
  ['Hallo', '(Essen Banane)', 'danke'].reduce((cxp, chip) => { const w = chip.length * 3.6 + 10; p.rect(cxp, y + 226, w, 12, { r: 6, fill: INK.card, stroke: INK.line, width: 0.6 }); p.text(cxp + w / 2, y + 234.5, chip, { size: 6, align: 'center' }); return cxp + w + 4; }, x + 22);
  const py = y + H - 46;
  p.circle(cx, py, 19, { stroke: INK.me, width: 1.2 });
  p.circle(cx, py, 14, { fill: INK.meSoft, stroke: INK.me, width: 1 });
  p.text(cx, py + 2.5, short(st.takes), { size: 6.5, font: 'bold', align: 'center' });
  return { cx, cy, py, W, H };
}

export function cover(p, sheet) {
  const M = 40, Wd = 515;
  p.text(M, 82, 'Sign', { size: 40, font: 'bold' });
  p.text(M + 104, 80, 'Gebärde, Ton, Text – gleichwertig, deine Daten.', { size: 10, color: INK.mut });
  p.line(M, 100, M + Wd, 100, { stroke: INK.line, width: 0.6 });

  const top = 116, f = phone(p, M + 6, top, sheet), ax = M + 236;
  const notes = [[top + 27, 'Similar', [M + 6 + 168 - 30, top + 27]], [top + 98, 'strands', [f.cx + 50, top + 98]], [top + 140, 'Fenster', [f.cx + 30, f.cy]],
    [top + 232, 'context', [M + 6 + 150, top + 232]], [top + 290, 'Take', [f.cx + 20, f.py]], [top + 314, 'sharing', [f.cx + 10, f.py - 22]]];
  for (const [ny, head, [fx, fy]] of notes) {
    p.poly([[fx, fy], [ax - 22, fy], [ax - 6, ny]], { stroke: INK.mut, width: 0.5 });
    p.circle(fx, fy, 1.6, { fill: INK.fg });
    p.text(ax, ny + 3, head, { size: 9, font: 'bold' });
  }
  // the gestures of the point, as small pictures: tap · hold · twice · up
  const gx = ax + 60, gy = top + 290;
  [['tippen', 1], ['halten', 2], ['2×', 3]].forEach(([word, k], i) => {
    const x0 = gx + i * 52;
    p.circle(x0, gy, 5, k === 2 ? { fill: INK.me } : { stroke: INK.me, width: 1 });
    if (k === 3) p.circle(x0, gy, 8, { stroke: INK.me, width: 0.7 });
    p.text(x0 + 11, gy + 2.5, word, { size: 7, color: INK.mut });
  });
  p.poly([[gx, top + 318], [gx, top + 306]], { stroke: INK.me, width: 1 }); p.poly([[gx - 3, top + 309], [gx, top + 305], [gx + 3, top + 309]], { stroke: INK.me, width: 1 });

  // colours: one meaning each, on every page
  let y = top + 360, lx = M;
  for (const [ink, text] of [[INK.me, 'ich · Take · strands'], [INK.shared, 'geteilt · friends'], [INK.ok, 'Backup'], [INK.secret, 'von Hand'], [INK.picture, 'Bild']]) {
    p.rect(lx, y - 7, 16, 9, { r: 4.5, fill: ink });
    lx += 21 + p.text(lx + 21, y + 0.5, text, { size: 7.5 }) + 16;
  }

  // roadmap: stations on one path, labels alternate below / above, SL2T branches off
  y += 30;
  p.text(M, y, 'Wohin', { size: 16, font: 'bold' });
  const path = [], y0 = y + 78, X0 = M + 30, X1 = M + Wd - 30;
  for (let i = 0; i <= 60; i++) { const t = i / 60; path.push([X0 + t * (X1 - X0), y0 - Math.sin(t * Math.PI * 1.5) * 16]); }
  p.poly(path, { stroke: INK.meSoft, width: 6 });
  p.poly(path.slice(0, 10), { stroke: INK.me, width: 6 });
  const main = WAVES.filter((w) => !w.side), at = (t) => path[Math.round(t * 60)];
  main.forEach((wv, i) => {
    const t = i / (main.length - 1), [sx, sy] = at(t), now = i === 0, below = i % 2 === 0;
    p.circle(sx, sy, now ? 11 : 9, { fill: now ? INK.me : INK.card, stroke: INK.me, width: 1.4 });
    p.text(sx, sy + 3, wv.no, { size: 8, font: 'bold', align: 'center' });
    const ty = below ? sy + 26 : sy - 36, tx = Math.min(Math.max(sx, M + 58), M + Wd - 58);
    p.text(tx, ty, wv.name, { size: 8.5, font: 'bold', align: 'center' });
    p.text(tx, ty + 10, fit(wv.who, 6.8, 150), { size: 6.8, color: INK.mut, align: 'center' });
  });
  const sl = WAVES.find((w) => w.side), [bx, by] = at(0.84), cx2 = bx + 6, cy2 = y0 + 44;
  p.poly([[bx, by], [cx2, cy2 - 9]], { stroke: INK.mut, width: 1, dash: [3, 2] });
  p.circle(cx2, cy2, 9, { fill: INK.card, stroke: INK.mut, width: 1.2, dash: [2, 2] });
  p.text(cx2, cy2 + 2.2, 'SL2T', { size: 5.5, font: 'bold', align: 'center' });
  p.text(cx2, cy2 + 19, sl.who, { size: 6.8, color: INK.mut, align: 'center' });
  const [hx, hy] = at(0.1);
  p.poly([[hx, hy - 8], [hx - 4, hy - 15], [hx + 4, hy - 15]], { close: true, fill: INK.fg });
  p.text(hx, hy - 19, 'du bist hier', { size: 7, font: 'bold', align: 'center' });

  // the 20 sessions
  const sy0 = y0 + 116, sw = (Wd - 20) / SESSIONS.length;
  p.text(M, sy0 - 12, 'Sessions', { size: 7.5, font: 'bold', color: INK.mut });
  SESSIONS.forEach(([wave, state], i) => {
    const sx = M + 10 + i * sw + sw / 2;
    p.circle(sx, sy0, 6, state === 'done' ? { fill: INK.me } : state === 'run' ? { fill: INK.meTint, stroke: INK.me, width: 1 } : { fill: INK.card, stroke: INK.rest, width: 1 });
    p.text(sx, sy0 + 2.3, String(i + 1), { size: 5.5, align: 'center', color: state === 'done' ? INK.card : INK.fg });
  });
}
