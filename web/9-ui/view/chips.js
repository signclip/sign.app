// view/chips.js — context as chips, clustered and following the time (Initial §5, §8; SCHEMA G2–G4).
//
// Purpose:   one field: stable part below, new part above, at most two rows.
//            One gesture = one background bubble (G3: the outermost brackets are gestures); its word chips
//            sit inside, the bubble ends where the next gesture begins. A prefix (cluster, G4) is glued to
//            the front of the bubble, no gap: ((Frucht) (Banane Erdbeeren)) → (Frucht)Banane Erdbeeren
//            as one gesture. A gesture of one word is the chip alone.
//            Each chip may carry 't( ) (Whisper per word): while playing the chip at the time is 'now'
//            (--hl), past ones full, coming ones pale; stable chips hold for the whole take.
//            The row scrolls so the current chip stands above the point (x = cx).
// Depends:   nothing (ring.js and the other views call it)
// Test:      tests/view.test.mjs
// Limits:    ~40 chips per row before it only scrolls; width ≈ 26 + 8.4 px per letter.

export const chipW = (text, k = 1) => Math.round((text ? 26 + text.length * 8.4 : 56) * k);

/**
 * groups = gestures: [{ text, t, stable } | { items: [{ text, t }], head?, stable }] · timeMs · cx, y (lowest
 * row), k (scale), w (screen width). → shapes [{ type: 'bubble' | 'chip', … }]
 */
export function chipShapes(groups = [], { timeMs = null, cx, y, k = 1, w = 390 }) {
  const rows = [groups.filter((g) => !g.stable), groups.filter((g) => g.stable)].filter((r) => r.length);
  if (!rows.length) rows.push([{ text: '', wait: true }]);
  const gap = 8 * k, inner = 4 * k, pad = 4 * k, out = [];
  const space = (u, i) => (i === 0 ? 0 : u[i - 1].head ? 0 : inner); // the prefix is glued
  const tone = (c, stable) => (c.wait ? 'wait' : stable || timeMs == null || !c.t ? 'own'
    : timeMs >= c.t[0] && timeMs < c.t[1] ? 'now' : timeMs >= c.t[1] ? 'own' : 'later');
  rows.slice(-2).forEach((row, r) => {
    const units = row.map((g) => (g.items ? [...(g.head ? [{ text: g.head, head: true }] : []), ...g.items] : [g]).map((c) => ({ ...c, w: chipW(c.text, k) })));
    const unitW = units.map((u) => u.reduce((a, c, i) => a + c.w + space(u, i), 0) + (u.length > 1 ? 2 * pad : 0));
    const total = unitW.reduce((a, b) => a + b, 0) + gap * (units.length - 1);
    let x = cx - total / 2;
    if (total > w - 24 * k) { // scroll: the chip at the time above the point
      let pos = 0, found = null;
      units.forEach((u, i) => { let ux = pos + (u.length > 1 ? pad : 0); u.forEach((c, j) => { ux += space(u, j); if (found == null && tone(c, row[i].stable) === 'now') found = ux + c.w / 2; ux += c.w; }); pos += unitW[i] + gap; });
      x = cx - (found ?? total / 2);
    }
    const cy = y + (r - (Math.min(rows.length, 2) - 1)) * 40 * k;
    units.forEach((u, i) => {
      const stable = row[i].stable;
      if (u.length > 1) out.push({ type: 'bubble', x, y: cy - 20 * k, w: unitW[i], h: 40 * k, cls: `bubble${stable ? ' stable' : ''}${u.some((c) => tone(c, stable) === 'now') ? ' now' : ''}`, role: `gesture:${u.map((c) => c.text).join(' ')}` });
      let cxp = x + (u.length > 1 ? pad : 0);
      u.forEach((c, j) => {
        cxp += space(u, j);
        out.push({ type: 'chip', x: cxp, y: cy, w: c.w, h: 32 * k, text: c.text, cls: `chip ${c.head ? 'own head' : tone(c, stable)}`, role: c.wait ? null : `chip:${c.text}` });
        cxp += c.w;
      });
      x += unitW[i] + gap;
    });
  });
  return out;
}
