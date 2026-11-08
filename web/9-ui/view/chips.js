// view/chips.js — context as chips, clustered and following the time (Initial §5, §8; SCHEMA G2–G4).
//
// Purpose:   one field: stable part below, new part above, at most two rows.
//            A cluster = prefix in its own bracket ((Frucht) (Banane Erdbeeren)) → one frame:
//            [Frucht | Banane Erdbeeren]; space = together (one frame), separate frames = one after another.
//            Each chip may carry 't( ) (Whisper per word): while playing the chip at the time is 'now'
//            (--hl), past ones full, coming ones pale; stable chips hold for the whole take.
//            The row scrolls so the current chip stands above the point (x = cx).
// Depends:   nothing (ring.js and the other views call it)
// Test:      tests/view.test.mjs
// Limits:    ~40 chips per row before it only scrolls; width ≈ 26 + 8.4 px per letter.

export const chipW = (text, k = 1) => Math.round((text ? 26 + text.length * 8.4 : 56) * k);

/**
 * groups: [{ text, t, stable } | { head, items: [{ text, t }], stable }] · timeMs · cx, y (lowest row),
 * k (scale), w (screen width). → shapes [{ type: 'chip' | 'frame', … }]
 */
export function chipShapes(groups = [], { timeMs = null, cx, y, k = 1, w = 390 }) {
  const rows = [groups.filter((g) => !g.stable), groups.filter((g) => g.stable)].filter((r) => r.length);
  if (!rows.length) rows.push([{ text: '', wait: true }]);
  const gap = 8 * k, pad = 6 * k, out = [];
  const tone = (c, stable) => (c.wait ? 'wait' : stable || timeMs == null || !c.t ? 'own'
    : timeMs >= c.t[0] && timeMs < c.t[1] ? 'now' : timeMs >= c.t[1] ? 'own' : 'later');
  rows.slice(-2).forEach((row, r) => {
    const units = row.map((g) => (g.items ? [{ text: g.head, head: true }, ...g.items] : [g]).map((c) => ({ ...c, w: chipW(c.text, k) })));
    const unitW = units.map((u) => u.reduce((a, c) => a + c.w, 0) + gap * (u.length - 1) + (u.length > 1 ? 2 * pad : 0));
    const total = unitW.reduce((a, b) => a + b, 0) + gap * (units.length - 1);
    let x = cx - total / 2;
    if (total > w - 24 * k) { // scroll: the chip at the time above the point
      let pos = 0, found = null;
      units.forEach((u, i) => { let ux = pos + (u.length > 1 ? pad : 0); for (const c of u) { if (found == null && tone(c, row[i].stable) === 'now') found = ux + c.w / 2; ux += c.w + gap; } pos += unitW[i] + gap; });
      x = cx - (found ?? total / 2);
    }
    const cy = y + (r - (Math.min(rows.length, 2) - 1)) * 40 * k;
    units.forEach((u, i) => {
      const stable = row[i].stable;
      if (u.length > 1) out.push({ type: 'frame', x, y: cy - 20 * k, w: unitW[i], h: 40 * k, cls: `frame${stable ? ' stable' : ''}` });
      let cxp = x + (u.length > 1 ? pad : 0);
      for (const c of u) {
        out.push({ type: 'chip', x: cxp, y: cy, w: c.w, h: 32 * k, text: c.text, cls: `chip ${c.head ? 'own head' : tone(c, stable)}`, role: c.wait ? null : `chip:${c.text}` });
        cxp += c.w + gap;
      }
      x += unitW[i] + gap;
    });
  });
  return out;
}
