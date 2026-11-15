// sheet-cover.js — the first page of the emergency sheet (14.11.): what the app looks like and where it goes.
//
// Purpose:   the phone with the app as it is (view/ring.js: the field as a ring with the strand arcs
//            and their numbers, the point (Take) on top of it, under the bottom arc the open context field with the chips
//            — sticky ones in front),
//            nothing written around it (14.11.: less is clearer); the way of a Take as pictures (Take → strands →
//            chain → sharing → Similar); the colours and what they mean (the same on every page); the roadmap: four waves and SL2T as stations
//            on one path, "du bist hier" in wave 1.
// Depends:   1-model/pdf.js, view/sheet-charts.js (INK, arcs, appArc, short)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    one page · the waves come from md/WAVES.md (written here as text: a new wave = one line in WAVES below).



import { INK, arcs, tile, step, next, short } from './sheet-charts.js';

export const WAVES = [
  { no: '1', name: 'Lernen und Ablegen', who: '1–20 Personen · DGS 1. Semester', app: 'Browser und APK, eigene Nextcloud' },
  { no: '2', name: 'Hochschulraum und App', who: '20–100 Studierende, dann einige hundert', app: 'Lern-App · landmarks · Echtzeit-Suche' },
  { no: '3', name: 'Weiterer Kreis', who: 'alle Hochschulen · Gehörlosen-Community', app: 'DGS-Suite · Gespräche · modeling' },
  { no: 'SL2T', name: 'eigene wave', who: 'nur mit eigener Einwilligung', app: 'Gebärde zu Text', side: true },
  { no: '4', name: 'Wohin weiter', who: 'Beyond', app: 'das Design als wide interface' },
];

function phone(p, x, y, sheet) {
  // as view/ring.js lays it out: the point (Take) on top, its ring touching the window; the free part above is pulled
  // down for Similar; under the bottom arc the open context field with the chips, the sticky ones in front
  const W = 168, H = 336, st = sheet.stats, k = W / 390;
  p.rect(x, y, W, H, { r: 24, fill: INK.rest, stroke: INK.fg, width: 1.4 });
  p.rect(x + W / 2 - 18, y + 8, 36, 5, { r: 2.5, fill: INK.fg });
  const cx = x + W / 2, r = 48, cy = y + 160, ring = (62 * k / 2) * 1.35;
  arcs(p, cx, cy, r, { counts: st.strands, width: 3.4, window: INK.picture, size: 5.8, quiet: ['l'] }); // l lies under the point
  const py = cy - r - ring; // the point: on top of the window
  p.circle(cx, py, ring, { fill: INK.rest, stroke: INK.take, width: 1.2 });
  p.circle(cx, py, ring * 0.72, { fill: INK.takeSoft, stroke: INK.take, width: 1 });
  const by = cy + r + 22; // the open context field under the bottom arc
  p.rect(x + 8, by, W - 16, 40, { r: 10, fill: INK.card, stroke: INK.line, width: 0.6 });
  let chx = x + 14;
  for (const [chip, sticky] of [['Obst', true], ['Banane', false], ['danke', false]]) {
    const w = chip.length * 3.8 + 12;
    p.rect(chx, by + 6, w, 13, { r: 6.5, fill: sticky ? INK.rest : INK.card, stroke: sticky ? INK.mut : INK.line, width: 0.7 }); // sticky: held for the series, in front
    p.text(chx + w / 2, by + 15, chip, { size: 6.2, align: 'center' });
    chx += w + 4;
  }
  p.line(x + 14, by + 31, x + W - 14, by + 31, { stroke: INK.line, width: 0.6 }); // the row to type in
  for (let i = 0; i < 4; i++) p.rect(x + 26 + i * 30, y + 24, 26, 26, { r: 6, fill: INK.takeSoft, stroke: INK.take, width: 0.6 }); // Similar: pulled down from the free part above
  const sy = by + 56; // the sharing menu, small: this device and its sharing points (up from the point)
  [[INK.whoTint, INK.who], [INK.card, INK.where], [INK.whereSoft, INK.where]].forEach(([fill, stroke], i) => p.rect(x + 46 + i * 28, sy, 22, 16, { r: 4, fill, stroke, width: 0.8 }));
  return { cx, cy, py, W, H };
}

export function cover(p, sheet) {
  const M = 40, Wd = 515;
  p.text(M, 82, 'Sign', { size: 40, font: 'bold' });
  p.line(M, 100, M + Wd, 100, { stroke: INK.line, width: 0.6 });
  const top = 116;
  phone(p, M + Wd / 2 - 84, top, sheet); // the app as it is, nothing written around it

  // the way of a Take, pictured: Take → strands → chain → sharing point → Similar
  let y = top + 384;
  const xs = [0, 1, 2, 3, 4].map((i) => M + 44 + i * ((Wd - 88) / 4));
  const pics = [
    ['Take', (cx, cy) => { p.circle(cx, cy, 13, { stroke: INK.take, width: 1 }); p.circle(cx, cy, 9, { fill: INK.takeSoft, stroke: INK.take, width: 0.8 }); }],
    ['strands', (cx, cy) => arcs(p, cx, cy, 12, { width: 2.4, window: INK.picture, line: false })],
    ['chain', (cx, cy) => { for (let i = 0; i < 4; i++) p.rect(cx - 16, cy - 13 + i * 7, 32, 4.5, { r: 2, fill: i ? INK.rest : INK.takeSoft }); }],
    ['sharing', (cx, cy) => tile(p, cx, cy, 24, { bars: { v: 'always', x: 'always' } })],
    ['Similar', (cx, cy) => { for (let i = 0; i < 3; i++) p.rect(cx - 20 + i * 14, cy - 6, 12, 12, { r: 3, fill: INK.takeSoft, stroke: INK.take, width: 0.6 }); }],
  ];
  pics.forEach(([word, pic], i) => { step(p, xs[i], y, i + 1, word, pic); if (i < 4) next(p, xs[i] + 28, xs[i + 1] - 28, y); });

  // colours: one meaning each, on every page
  y += 66;
  let lx = M;
  for (const [ink, text] of [[INK.strand, 'strands'], [INK.take, 'Takes'], [INK.where, 'Ort · Speicher'], [INK.who, 'Person'], [INK.safe, 'Backup'], [INK.hand, 'von Hand'], [INK.time, 'Zeit']]) {
    p.rect(lx, y - 7, 14, 9, { r: 4.5, fill: ink });
    lx += 18 + p.text(lx + 18, y + 0.5, text, { size: 7.5 }) + 13;
  }

  // roadmap: stations on one path, labels alternate below / above, SL2T branches off
  y += 28;
  p.text(M, y, 'Wohin', { size: 16, font: 'bold' });
  const path = [], y0 = y + 62, X0 = M + 30, X1 = M + Wd - 30;
  for (let i = 0; i <= 60; i++) { const t = i / 60; path.push([X0 + t * (X1 - X0), y0 - Math.sin(t * Math.PI * 1.5) * 16]); }
  p.poly(path, { stroke: INK.timeSoft, width: 6 });
  p.poly(path.slice(0, 10), { stroke: INK.time, width: 6 }); // when: teal
  const main = WAVES.filter((w) => !w.side), at = (t) => path[Math.round(t * 60)];
  main.forEach((wv, i) => {
    const t = i / (main.length - 1), [sx, sy] = at(t), now = i === 0, below = i % 2 === 0;
    p.circle(sx, sy, now ? 11 : 9, { fill: now ? INK.time : INK.card, stroke: INK.time, width: 1.4 });
    p.text(sx, sy + 3, wv.no, { size: 8, font: 'bold', align: 'center' });
    const ty = below ? sy + 26 : sy - 36, tx = Math.min(Math.max(sx, M + 58), M + Wd - 58);
    p.text(tx, ty + (below ? 0 : 20), wv.name, { size: 8.5, font: 'bold', align: 'center' });
  });
  const [bx, by] = at(0.84), cx2 = bx + 6, cy2 = y0 + 44;
  p.poly([[bx, by], [cx2, cy2 - 9]], { stroke: INK.mut, width: 1, dash: [3, 2] });
  p.circle(cx2, cy2, 9, { fill: INK.card, stroke: INK.mut, width: 1.2, dash: [2, 2] });
  p.text(cx2, cy2 + 2.2, 'SL2T', { size: 5.5, font: 'bold', align: 'center' });
  const [hx, hy] = at(0.1);
  p.poly([[hx, hy - 8], [hx - 4, hy - 15], [hx + 4, hy - 15]], { close: true, fill: INK.fg });
  p.text(hx, hy - 19, 'du bist hier', { size: 7, font: 'bold', align: 'center' });

}
