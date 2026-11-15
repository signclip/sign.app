// sheet-context.js — the context map on the emergency sheet (15.11.): every take one point (3-index/context-map.js).
//
// Purpose:   a point = a take, where its words put it; many takes with one word gather and look like a cluster.
//            Colour = how new (teal = when: dark this week, lighter month, quarter, year, grey older); size = length
//            (merged points: how many takes). The 24 most used words stand where their takes gather.
//            No lines: 20,000 takes with ~3 words make millions of pairs; nearness already says it. No strand marks:
//            a point is 1–3 pt, too small to carry four bars.
// Depends:   1-model/pdf.js (Page.dots, textWidth), view/sheet-charts.js (INK, short)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    ≤ 20,000 points (≈ 35 B each in the PDF: ≈ 700 kB) · 5 ages · labels may overlap a little, never the edge.

import { textWidth } from '../../1-model/pdf.js';
import { INK, short } from './sheet-charts.js';

const AGES = [[7, '#2f9aa0'], [30, '#6fbcc0'], [91, '#a6d6d8'], [365, '#d0e9ea'], [Infinity, '#d6d3cd']];
const ageOf = (at, now) => (at == null ? AGES.length - 1 : AGES.findIndex(([d]) => (now - at) / 86_400_000 < d));

/** map: contextMap() result. */
export function contextPicture(p, { x, y, w, h }, map, now = Date.now()) {
  if (!map.dots.length) return p.text(x + w / 2, y + h / 2, 'noch keine Takes mit context', { size: 8, color: INK.mut, align: 'center' });
  const pad = 10, H = h - 18, side = Math.min(w, H) - 2 * pad, ox = x + (w - side) / 2, oy = y + (H - side) / 2;
  const longest = Math.max(1, ...map.dots.map((d) => d.ms / d.n)), base = Math.max(0.7, Math.min(2.4, 220 / Math.sqrt(map.dots.length)));
  const byAge = AGES.map(() => []);
  for (const d of map.dots) {
    const size = map.merged > 1 ? base * Math.sqrt(d.n / map.merged) : base * (0.6 + 0.8 * Math.sqrt(d.ms / longest));
    byAge[ageOf(d.at, now)].push([ox + d.x * side, oy + d.y * side, Math.max(0.6, Math.min(4, size))]);
  }
  for (let k = AGES.length - 1; k >= 0; k--) p.dots(byAge[k], AGES[k][1]); // old first, new on top
  for (const l of map.labels) {
    const lx = Math.min(x + w - 30, Math.max(x + 30, ox + l.x * side)), ly = Math.min(y + H - 6, Math.max(y + 10, oy + l.y * side));
    const bw = textWidth(l.word, 7, 'bold') + 8;
    p.rect(lx - bw / 2, ly - 7, bw, 10, { r: 5, fill: INK.card });
    p.text(lx, ly + 0.5, l.word, { size: 7, font: 'bold', align: 'center' });
  }
  const ly = y + h - 5; // legend
  p.dots([[x + 4, ly, 1], [x + 11, ly, 1.9], [x + 20, ly, 3]], AGES[1][1]);
  p.text(x + 28, ly + 2.5, 'Take · Länge', { size: 6.5, color: INK.mut });
  p.text(x + 96, ly + 2.5, 'neu', { size: 6.5, color: INK.mut });
  AGES.forEach(([, ink], k) => p.circle(x + 118 + k * 10, ly, 3.4, { fill: ink }));
  p.text(x + 118 + AGES.length * 10, ly + 2.5, 'alt', { size: 6.5, color: INK.mut });
  if (map.merged > 1) p.text(x + w, ly + 2.5, `1 Punkt = ${Math.round(map.merged)} Takes`, { size: 6.5, color: INK.mut, align: 'right' });
}
