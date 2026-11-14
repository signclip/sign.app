// sheet-cluster.js — the context of all takes as one picture (emergency sheet, 14.11.), readable up to 20,000+ chips.
//
// Purpose:   every cluster (3-index/clusters.js) is a circle; its takes are dots inside (sunflower order, the
//            longest in the middle): how dense = how many takes, how big a dot = how long the take.
//            How clearly a cluster parts from the others is its edge: solid = ≥ 70 % of its pairs stay inside,
//            dashed = it flows into others. Lines between circles = pairs across (thicker = more); linked circles
//            are pulled together. Grey only: a cluster is no meaning of its own, so it takes no colour of the
//            sheet (coral, blue, green, yellow mean something everywhere else).
//            No strand arcs here: the strands of a cluster hardly differ (nearly every take has picture and text);
//            they stand once, at the field on the stock page.
// Depends:   1-model/pdf.js (Page.dots, fit, textWidth), view/sheet-charts.js (INK, short)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    ≤ 25 circles · ≤ 8,000 dots (above: 1 dot ≈ k takes) · ≤ 60 lines · arranging: 25 × 4,000 spiral steps
//            and 200 steps pulling linked circles (~15 ms) · ≈ 35 B per dot → 8,000 dots ≈ 280 kB of the PDF.

import { fit, textWidth } from '../../1-model/pdf.js';
import { INK, short } from './sheet-charts.js';

const FILL = '#f1f0ed', DOT = '#9a9893', EDGE = '#6f6d69', LINK = '#cfccc6';

function arrange(all, links, tall) {
  for (const [i, c] of all.entries()) { // spiral: the biggest in the middle, each next where it fits
    for (let t = 0; t < 4000; t++) {
      const r = t * 1.5, a = t * 0.35, x = r * Math.cos(a), y = r * Math.sin(a) * tall;
      if (all.slice(0, i).every((o) => Math.hypot(o.x - x, o.y - y) >= o.R + c.R + 16)) { c.x = x; c.y = y; break; }
    }
  }
  const most = Math.max(1, ...links.map((l) => l[2]));
  for (let step = 0; step < 200; step++) { // pull linked circles together, then push overlaps apart
    for (const [a, b, n] of links) {
      const A = all[a], B = all[b];
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, pull = 0.02 * (n / most) * (d - A.R - B.R);
      A.x += (dx / d) * pull; A.y += (dy / d) * pull; B.x -= (dx / d) * pull; B.y -= (dy / d) * pull;
    }
    for (const A of all) for (const B of all) {
      if (A === B) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, need = A.R + B.R + 16;
      if (d < need) { const m = (need - d) / 2; A.x -= (dx / d) * m; A.y -= (dy / d) * m; B.x += (dx / d) * m; B.y += (dy / d) * m; }
    }
  }
}

/** data: clusters() result. */
export function bigCluster(p, { x, y, w, h }, data) {
  const all = [...data.groups, ...(data.rest ? [data.rest] : [])].map((g, i) => ({ g, i }));
  if (!all.length) return p.text(x + w / 2, y + h / 2, 'noch keine Takes mit context', { size: 8, color: INK.mut, align: 'center' });
  for (const c of all) c.R = Math.sqrt(Math.max(1, c.g.dots.length)) * 2.6 + 10;
  const links = (data.links ?? []).filter(([a, b]) => all[a] && all[b]);
  arrange(all, links, Math.max(0.8, ((h - 30) / w) * 1.2));
  const pad = 22, minX = Math.min(...all.map((c) => c.x - c.R)), maxX = Math.max(...all.map((c) => c.x + c.R));
  const minY = Math.min(...all.map((c) => c.y - c.R)), maxY = Math.max(...all.map((c) => c.y + c.R));
  const s = Math.min((w - 2 * pad) / (maxX - minX), (h - 2 * pad - 16) / (maxY - minY));
  const ox = x + w / 2 - ((minX + maxX) / 2) * s, oy = y + (h - 16) / 2 - ((minY + maxY) / 2) * s;
  for (const c of all) { c.cx = ox + c.x * s; c.cy = oy + c.y * s; c.r = c.R * s; }
  const most = Math.max(1, ...links.map((l) => l[2]));
  for (const [a, b, n] of links) {
    const A = all[a], B = all[b], dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy) || 1;
    p.line(A.cx + (dx / d) * A.r, A.cy + (dy / d) * A.r, B.cx - (dx / d) * B.r, B.cy - (dy / d) * B.r, { stroke: LINK, width: 0.4 + 3 * (n / most) });
  }
  const longest = Math.max(1, ...all.map((c) => c.g.dots[0]?.ms ?? 0));
  for (const c of all) {
    const { cx, cy, r } = c, n = c.g.dots.length, rest = c.g === data.rest;
    p.circle(cx, cy, r, { fill: FILL, stroke: EDGE, width: 0.8, dash: rest || c.g.cohesion < 0.7 ? [2, 2] : null });
    p.dots(c.g.dots.map((d, i) => {
      const rr = (r - 4) * Math.sqrt((i + 0.5) / n), a = i * 2.39996;
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a), Math.max(0.7, (0.7 + 3.2 * Math.sqrt(d.ms / longest)) * Math.min(1, s * 1.5))];
    }), DOT);
    const big = r > 30, size = big ? 8 : 6.5, name = fit(c.g.name, size, Math.max(40, r * 1.8), 'bold'), count = short(c.g.takes);
    const bw = Math.max(textWidth(name, size, 'bold'), big ? textWidth(count, 6.5) : 0) + 8, ly = cy - (big ? r * 0.3 : 0);
    p.rect(cx - bw / 2, ly - 8, bw, big ? 20 : 11, { r: 4, fill: INK.card }); // a white plate keeps the words readable over the dots
    p.text(cx, ly + 0.5, name, { size, font: 'bold', align: 'center' });
    if (big) p.text(cx, ly + 9.5, count, { size: 6.5, color: INK.mut, align: 'center' });
  }
  const ly = y + h - 6; // legend: symbols, few words
  p.dots([[x + 4, ly, 1.2], [x + 12, ly, 2.4], [x + 23, ly, 3.8]], DOT);
  p.text(x + 31, ly + 2.5, 'Take · Länge', { size: 6.5, color: INK.mut });
  p.circle(x + 110, ly, 5, { stroke: EDGE, width: 0.8 }); p.text(x + 119, ly + 2.5, 'klar', { size: 6.5, color: INK.mut });
  p.circle(x + 150, ly, 5, { stroke: EDGE, width: 0.8, dash: [2, 2] }); p.text(x + 159, ly + 2.5, 'fließend', { size: 6.5, color: INK.mut });
  p.line(x + 196, ly, x + 214, ly, { stroke: LINK, width: 2.4 }); p.text(x + 219, ly + 2.5, 'verbunden', { size: 6.5, color: INK.mut });
  if (data.step > 1) p.text(x + w, ly + 2.5, `1 Punkt = ${data.step} Takes`, { size: 6.5, color: INK.mut, align: 'right' });
}
