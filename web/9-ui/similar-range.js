// similar-range.js — how far Similar looks from the take, in each respect (21.11., user: "Weite"; a similar is a take
// whose values are ranges).
//
// Purpose:   six respects, each with steps from exact (0) to wide; they lie round the take where its arcs are – wer
//            on top (beside the button), Zeit and Ort beside it, Ton right, context below, Bild left – the same in the
//            halo round the take (paint.js) and in the rings with sectors where they are set (paint.js rangeSvg):
//              x context  exact words · word forms · related (they come up together) · theme (related of related)
//              t Zeit     ±1 hour · ±½ day · ±3½ days · ±15 days · ±½ year · always (round the take's time, or now)
//              o Ort      the cell (o_) · around it (H3 parent, res 4) · region (res 3) · everywhere
//              w wer      me · my own sharing point · where I write with others · all I can see
//              v, a       same · similar · far (wait for the picture and sound models: shown pale, not applied)
// Depends:   –
// Test:      tests/ui.test.mjs
// Limits:    word forms by cutting German endings (≥ 3 letters stay); related = the 5 words found most often together.

export const SECTORS = Object.freeze({ w: [-20, 20], t: [20, 60], a: [60, 140], x: [140, 220], v: [220, 300], o: [300, 340] });
export const STEPS = Object.freeze({ x: 4, t: 6, o: 4, w: 4, v: 3, a: 3 });
export const READY = Object.freeze({ x: true, t: true, o: true, w: true, v: false, a: false });
export const SIGN = Object.freeze({ w: '@', t: '▮', a: '◗', x: '◡', v: '◖', o: '◎' });
/** As Similar looked before 21.11.: the written words exactly, every time, every spot, everyone. */
export const wideOpen = () => ({ x: 0, t: 5, o: 3, w: 3, v: 0, a: 0 });

const HOUR = 3.6e6, HALF = [HOUR, 12 * HOUR, 84 * HOUR, 360 * HOUR, 4380 * HOUR, Infinity];

/** One step wider (+1) or narrower (−1) in one respect. → range */
export function stepRange(range, k, by) {
  const r = { ...wideOpen(), ...range };
  r[k] = Math.max(0, Math.min(STEPS[k] - 1, r[k] + by));
  return r;
}

/** The H3 cell of the same spot at a coarser resolution (its parent): resolution bits, finer digits = 7. */
export function parentCell(cell, res) {
  const hex = String(cell ?? '').replace(/^o_/, '');
  if (!/^[0-9a-f]{15,16}$/i.test(hex)) return null;
  let h = BigInt(`0x${hex}`);
  const own = Number((h >> 52n) & 15n);
  if (res >= own) return hex.toLowerCase();
  h = (h & ~(15n << 52n)) | (BigInt(res) << 52n);
  for (let d = res + 1; d <= 15; d++) h |= 7n << BigInt(3 * (15 - d));
  return h.toString(16);
}

/** The entries inside the range round the focus { t, cell, person }; own: names of one's own sources, write: where one writes too. */
export function applyRange(entries, range, focus = {}, { own = ['own'], write = [] } = {}) {
  const r = { ...wideOpen(), ...range }, t0 = focus.t ?? Date.now();
  const res = [5, 4, 3][r.o];
  const fc = res != null && focus.cell ? parentCell(focus.cell, res) : null;
  return entries.filter((e) => {
    if (HALF[r.t] !== Infinity && Math.abs((e.t || 0) - t0) > HALF[r.t]) return false;
    if (fc && parentCell(e.spot, res) !== fc) return false;
    if (r.w === 0 && e.person !== focus.person) return false;
    if (r.w === 1 && !(e.sharing ?? []).some((s) => own.includes(s))) return false;
    if (r.w === 2 && !(e.sharing ?? []).some((s) => own.includes(s) || write.includes(s))) return false;
    return true;
  });
}

const ENDINGS = ['innen', 'ern', 'en', 'er', 'es', 'em', 'e', 'n', 's'];
/** A word's possible stems: itself and without each German ending that fits (≥ 3 letters stay), äu read as au. */
export function stemsOf(w) {
  const s = String(w).toLocaleLowerCase('de').replace(/äu/g, 'au'), out = new Set([s]);
  for (const e of ENDINGS) if (s.endsWith(e) && s.length - e.length >= 3) out.add(s.slice(0, -e.length));
  return out;
}
/** Are two words forms of one another (Haus, Häuser, Hauses)? */
export const sameStem = (a, b) => { const x = stemsOf(a); return [...stemsOf(b)].some((s) => x.has(s)); };

/**
 * The written words, widened by the context step. vocabulary: Map word → Set of keys it occurs in (3-index context).
 * → [words] (the written ones first)
 */
export function widenWords(words, step, vocabulary) {
  const out = new Set(words.map((w) => String(w).toLocaleLowerCase('de')));
  if (step >= 1) { const written = [...out]; for (const v of vocabulary.keys()) if (written.some((w) => sameStem(w, v))) out.add(v); }
  const related = (from) => {
    const near = new Map();
    for (const w of from) for (const key of vocabulary.get(w) ?? []) for (const [v, keys] of vocabulary) if (!out.has(v) && keys.has(key)) near.set(v, (near.get(v) ?? 0) + 1);
    return [...near].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v]) => v);
  };
  if (step >= 2) for (const v of related([...out])) out.add(v);
  if (step >= 3) for (const v of related([...out])) out.add(v);
  return [...out];
}
