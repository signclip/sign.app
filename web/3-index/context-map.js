// context-map.js — every take as one point, placed by its context words (emergency sheet, 15.11.). No clusters chosen
// beforehand: takes that share words lie near each other; a word in many takes gathers many points — it looks like a
// cluster without being one.
//
// Purpose:   1 words: the 2,000 most used words are laid out (force layout: words of one take pull each other, every
//              word pushes its neighbours away). A pair pulls n / √(fᵢ·fⱼ): a glue word in every fifth take ("ich")
//              pulls little and does not drag everything into the middle. Rarer words sit at the mean of the anchor
//              words they appear with.
//            2 takes: at the mean of their words (rare words weigh more: 1 / √f), takes with the same words spread in a
//              sunflower around that spot. Takes without context: a ring at the edge.
//            3 above `most` takes, points that fall into one small square merge into one point (size = how many).
//            Computed each time from the index, never stored. Same input = same picture (no randomness).
// Depends:   nothing (the take list of 3-index/tally.js: [{ ms, at, kinds, words }])
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    layout: 2,000 words × ≤ 30 pulls × 160 steps + a grid for pushing ≈ 0.2–0.4 s · takes: one pass ·
//            20,000 takes → 20,000 points (≈ 700 kB of PDF) · 100,000 takes → merged in the finest squares that give
//            ≤ 20,000 points (≈ 5 takes a point) · labels: the 24 most used words.

const ANCHORS = 2000, PULLS = 30, STEPS = 160;

function hash(text) { let h = 2166136261; for (const c of text) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/** list: takes → { dots: [{ x, y, ms, at, n }], labels: [{ word, x, y, n }], merged: takes per point or 1 } in [0, 1]². */
export function contextMap(list, { most = 20000 } = {}) {
  const freq = new Map();
  for (const t of list) for (const w of t.words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const words = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a) || a.localeCompare(b));
  const anchors = words.slice(0, ANCHORS), id = new Map(anchors.map((w, i) => [w, i]));
  // 1 words: pulls between anchors of one take, the strongest PULLS per word
  const pull = anchors.map(() => new Map());
  for (const t of list) {
    const ws = t.words.filter((w) => id.has(w)).slice(0, 8).map((w) => id.get(w));
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j]; if (a === b) continue;
      pull[a].set(b, (pull[a].get(b) ?? 0) + 1); pull[b].set(a, (pull[b].get(a) ?? 0) + 1);
    }
  }
  const edges = [];
  pull.forEach((m, a) => [...m].map(([b, n]) => [b, n / Math.sqrt(freq.get(anchors[a]) * freq.get(anchors[b]))]).sort((x, y) => y[1] - x[1]).slice(0, PULLS).forEach(([b, w]) => { if (a < b) edges.push([a, b, w]); }));
  const P = anchors.map((w) => ({ x: hash(w), y: hash(`${w}·`) }));
  const k = 0.6 / Math.sqrt(Math.max(1, anchors.length)), strongest = edges.reduce((a, e) => Math.max(a, e[2]), 1e-9);
  for (let step = 0; step < STEPS; step++) {
    const heat = 0.08 * (1 - step / STEPS) + 0.002, F = P.map(() => ({ x: 0, y: 0 }));
    const cell = 2 * k, grid = new Map(), key = (gx, gy) => gx * 100003 + gy; // push: exact inside the own square (≤ 40), the 8 around as one mass each
    P.forEach((p, i) => { const g = key(Math.floor(p.x / cell), Math.floor(p.y / cell)); let c = grid.get(g); if (!c) grid.set(g, (c = { list: [], x: 0, y: 0 })); c.list.push(i); c.x += p.x; c.y += p.y; });
    const push = (i, x, y, m) => { const ex = P[i].x - x, ey = P[i].y - y, d = Math.max(Math.hypot(ex, ey), k * 0.05); if (d < cell * 1.5) { F[i].x += (ex / d) * m * (k * k) / d; F[i].y += (ey / d) * m * (k * k) / d; } };
    P.forEach((p, i) => {
      const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = grid.get(key(gx + dx, gy + dy));
        if (!c) continue;
        if (dx || dy) { push(i, c.x / c.list.length, c.y / c.list.length, c.list.length); continue; }
        for (const j of c.list.length > 40 ? c.list.filter((_, n) => n % Math.ceil(c.list.length / 40) === 0) : c.list) if (j !== i) push(i, P[j].x, P[j].y, c.list.length > 40 ? Math.ceil(c.list.length / 40) : 1);
      }
      F[i].x += (0.5 - p.x) * 0.02; F[i].y += (0.5 - p.y) * 0.02; // a little gravity: no word drifts away
    });
    for (const [a, b, w] of edges) {
      const ex = P[b].x - P[a].x, ey = P[b].y - P[a].y, d = Math.hypot(ex, ey) || 1e-6, f = ((d * d) / k) * (w / strongest);
      F[a].x += (ex / d) * f; F[a].y += (ey / d) * f; F[b].x -= (ex / d) * f; F[b].y -= (ey / d) * f;
    }
    P.forEach((p, i) => { const d = Math.hypot(F[i].x, F[i].y) || 1e-9, m = Math.min(d, heat); p.x += (F[i].x / d) * m; p.y += (F[i].y / d) * m; });
  }
  // rarer words: the mean of the anchors they appear with
  const pos = new Map(anchors.map((w, i) => [w, P[i]])), sum = new Map();
  for (const t of list) {
    const known = t.words.filter((w) => pos.has(w));
    if (!known.length) continue;
    const mx = known.reduce((a, w) => a + pos.get(w).x, 0) / known.length, my = known.reduce((a, w) => a + pos.get(w).y, 0) / known.length;
    for (const w of t.words) if (!pos.has(w)) { const s = sum.get(w) ?? sum.set(w, { x: 0, y: 0, n: 0 }).get(w); s.x += mx; s.y += my; s.n += 1; }
  }
  for (const [w, s] of sum) pos.set(w, { x: s.x / s.n, y: s.y / s.n });
  // 2 takes: the mean of their words (rare words weigh more), the same words spread as a sunflower
  const groups = new Map(), ring = [];
  for (const t of list) {
    const ws = t.words.filter((w) => pos.has(w));
    if (!ws.length) { ring.push(t); continue; }
    const key = [...new Set(ws)].sort().join(' ');
    (groups.get(key) ?? groups.set(key, { ws: [...new Set(ws)], takes: [] }).get(key)).takes.push(t);
  }
  const gap = 0.55 / Math.sqrt(Math.max(1, list.length)), dots = [];
  for (const { ws, takes } of groups.values()) {
    let x = 0, y = 0, wsum = 0;
    for (const w of ws) { const g = 1 / Math.sqrt(freq.get(w)); x += pos.get(w).x * g; y += pos.get(w).y * g; wsum += g; }
    x /= wsum; y /= wsum;
    takes.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).forEach((t, i) => { const r = gap * Math.sqrt(i), a = i * 2.39996; dots.push({ x: x + r * Math.cos(a), y: y + r * Math.sin(a), ms: t.ms, at: t.at ?? null, n: 1 }); });
  }
  ring.forEach((t, i) => { const a = (i / Math.max(1, ring.length)) * 2 * Math.PI; dots.push({ x: 0.5 + 9 * Math.cos(a), y: 0.5 + 9 * Math.sin(a), ms: t.ms, at: t.at ?? null, n: 1 }); }); // far out: they land on the edge
  // into [0, 1]²
  const q = (vals, f) => { const v = vals.slice().sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.max(0, Math.floor(f * (v.length - 1))))] ?? 0; };
  const xs = dots.map((d) => d.x), ys = dots.map((d) => d.y), x0 = q(xs, 0.01), x1 = q(xs, 0.99), y0 = q(ys, 0.01), y1 = q(ys, 0.99);
  const span = (Math.max(x1 - x0, y1 - y0) || 1) * 1.1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const fit = (vx, vy) => { // one scale for both; the few far ones (and takes without words) sit on the round edge
    const u = (vx - cx) / span, v = (vy - cy) / span, r = Math.hypot(u, v), m = r > 0.5 ? 0.5 / r : 1;
    return [0.5 + u * m, 0.5 + v * m];
  };
  for (const d of dots) [d.x, d.y] = fit(d.x, d.y);
  // 3 merge when there are too many: one point per small square, newest time, summed length
  let out = dots, merged = 1;
  for (let side = 1024; out.length > most && side >= 16; side = Math.floor(side / 1.4)) { // the finest squares that bring it under `most`
    const cells = new Map();
    for (const d of dots) { const g = Math.floor(d.x * side) * 100003 + Math.floor(d.y * side), c = cells.get(g); if (!c) cells.set(g, { ...d }); else { c.n += 1; c.ms += d.ms; c.at = Math.max(c.at ?? 0, d.at ?? 0); } }
    out = [...cells.values()];
    merged = dots.length / out.length;
  }
  const labels = anchors.slice(0, 24).map((w) => { const [x, y] = fit(pos.get(w).x, pos.get(w).y); return { word: w, x, y, n: freq.get(w) }; });
  return { dots: out, labels, merged, takes: list.length, words: words.length };
}
