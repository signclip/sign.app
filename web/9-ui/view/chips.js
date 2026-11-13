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

/** Width of a chip for a word (an empty chip = a dashed waiting chip). */
export const chipW = (text, k = 1) => Math.round((text ? 26 + text.length * 8.4 : 56) * k);

const GAP = 8; // between gestures
const INNER = 4; // between words inside a gesture
const PAD = 4; // bubble around the words
const ROW = 40; // from row to row

/** Is this word now, past or coming? Stable chips hold for the whole take. */
function toneOf(chip, stable, timeMs) {
  if (chip.wait) return 'wait';
  if (stable || timeMs == null || !chip.t) return 'own';
  if (timeMs >= chip.t[0] && timeMs < chip.t[1]) return 'now';
  return timeMs >= chip.t[1] ? 'own' : 'later';
}

/** A gesture → its chips in order; the prefix (head) first. */
function chipsOf(gesture) {
  if (!gesture.items) return [gesture];
  return [...(gesture.head ? [{ text: gesture.head, head: true }] : []), ...gesture.items];
}

/** The space before chip i of a gesture: none before the first, none after the glued prefix. */
function spaceBefore(chips, i, k) {
  if (i === 0 || chips[i - 1].head) return 0;
  return INNER * k;
}

/**
 * groups = gestures: [{ text, t, stable } | { items: [{ text, t }], head?, stable }] · timeMs · cx, y (lowest
 * row), k (scale), w (screen width). → shapes [{ type: 'bubble' | 'chip', … }]
 */
export function chipShapes(groups = [], { timeMs = null, cx, y, k = 1, w = 390 }) {
  const rows = [groups.filter((g) => !g.stable), groups.filter((g) => g.stable)].filter((row) => row.length);
  if (!rows.length) rows.push([{ text: '', wait: true }]); // nothing yet: one dashed chip
  const shown = rows.slice(-2);
  const out = [];
  shown.forEach((row, r) => {
    const rowY = y + (r - (shown.length - 1)) * ROW * k; // the stable row is the lowest
    out.push(...rowShapes(row, { timeMs, cx, y: rowY, k, w }));
  });
  return out;
}

/** One row of gestures: centred, or scrolled so the chip at the time stands above the point (x = cx). */
function rowShapes(row, { timeMs, cx, y, k, w }) {
  const units = row.map((gesture) => {
    const chips = chipsOf(gesture).map((c) => ({ ...c, w: chipW(c.text, k) }));
    const words = chips.reduce((sum, c, i) => sum + spaceBefore(chips, i, k) + c.w, 0);
    return { gesture, chips, width: words + (chips.length > 1 ? 2 * PAD * k : 0) };
  });
  const total = units.reduce((sum, u) => sum + u.width, 0) + GAP * k * (units.length - 1);

  let x = cx - total / 2;
  if (total > w - 24 * k) {
    const now = centreOfNow(units, timeMs, k);
    x = cx - (now ?? total / 2);
  }

  const out = [];
  for (const { gesture, chips, width } of units) {
    const stable = Boolean(gesture.stable);
    if (chips.length > 1) {
      const lit = chips.some((c) => toneOf(c, stable, timeMs) === 'now');
      out.push({ type: 'bubble', x, y: y - 20 * k, w: width, h: 40 * k,
        cls: `bubble${stable ? ' stable' : ''}${lit ? ' now' : ''}`, role: `gesture:${chips.map((c) => c.text).join(' ')}` });
    }
    let chipX = x + (chips.length > 1 ? PAD * k : 0);
    chips.forEach((c, i) => {
      chipX += spaceBefore(chips, i, k);
      out.push({ type: 'chip', x: chipX, y, w: c.w, h: 32 * k, text: c.text,
        cls: `chip ${c.head ? 'own head' : toneOf(c, stable, timeMs)}`, role: c.wait ? null : `chip:${c.text}` });
      chipX += c.w;
    });
    x += width + GAP * k;
  }
  return out;
}

/** Where (from the row's left edge) the middle of the chip at the time is, or null. */
function centreOfNow(units, timeMs, k) {
  let left = 0;
  for (const { gesture, chips, width } of units) {
    let x = left + (chips.length > 1 ? PAD * k : 0);
    for (const [i, c] of chips.entries()) {
      x += spaceBefore(chips, i, k);
      if (toneOf(c, Boolean(gesture.stable), timeMs) === 'now') return x + c.w / 2;
      x += c.w;
    }
    left += width + GAP * k;
  }
  return null;
}
