// view/chips.js — context as chips: what belongs together, when it is taken, what flies away (decided 15.11.).
//
// Purpose:   one field under the window. Four things, each with its own means:
//            1 belongs together: a yellow bubble. The sticky context and everything it holds for (the takes of
//              the series) lie in ONE bubble; a prefix (G4) opens a bubble inside it: bubbles in bubbles, the
//              yellow stronger inward. Every bubble and every own chip has the same edge: what is one, looks one.
//            2 stays: the sticky words and every prefix, filled dark (they multiply onto what follows, never fly).
//            3 when: the inside of a take in coral — now strong, next one step lighter, some time later lighter
//              still. With Whisper times while playing: the word at the time 'now', the coming ones 'later'.
//            4 flies away: a small arrow ↑ over what goes up into the chain after this take (the gesture that is
//              'now'); past is out of the row.
//            Origin: Whisper words have a fine wave at the bottom (heard, not typed); offers are dashed and keep
//            their colour: Similar/template blue, password gesture mint (offer.origin). Tap an offer = mine.
//            The row scrolls so the current chip stands above the point (x = cx).
// Depends:   nothing (ring.js calls it)
// Test:      tests/view.test.mjs
// Limits:    3 bubble levels with room (each +6 px around: 3 levels = 68 px high); deeper only one more edge;
//            ~40 chips per row before it only scrolls; chip width ≈ 26 + 8.4 px per letter.

/** Width of a chip for a word (an empty chip = a dashed waiting chip). */
export const chipW = (text, k = 1) => Math.round((text ? 26 + text.length * 8.4 : 56) * k);

const GAP = 8; // between gestures
const INNER = 4; // between chips inside a bubble
const PAD = 6; // bubble around its content, per level
const H = 32; // chip height
const ROOMY = 3; // levels with their own padding; deeper ones share the edge

/** Is this word now, past or coming? Without times it keeps the take's position (now · next · later) or is just mine. */
function toneOf(chip, take, timeMs) {
  if (chip.wait) return 'wait';
  if (take) return take;
  if (timeMs == null || !chip.t) return 'own';
  if (timeMs >= chip.t[0] && timeMs < chip.t[1]) return 'now';
  return timeMs >= chip.t[1] ? 'own' : 'later';
}

/** A gesture or nested group → a tree node: { head: [chip], items: [node] } or a chip. */
function nodeOf(g, inherit = {}) {
  const ctx = { fly: g.fly, take: g.take ?? inherit.take, offer: g.offer ?? inherit.offer, origin: g.origin ?? inherit.origin, picked: g.picked ?? inherit.picked, heard: g.heard ?? inherit.heard };
  if (!g.items) return { chip: { ...g, ...ctx } };
  const head = [g.head].flat().filter(Boolean).map((text) => ({ text, head: true }));
  return { group: g, ctx, head, items: g.items.map((x) => nodeOf(x, { ...ctx, fly: false })) };
}

/**
 * The series as takes (15.11.: a prefix series gives one take per element; the prefix stays until its last one):
 * every element without a prefix of its own gets 'now', 'next' or 'later' in reading order; 'fly' marks what goes
 * into the chain after this take — the element, or the prefix bubble whose last element it is (nested the same way).
 */
export function withTakes(gestures) {
  let n = 0;
  const walk = (g, at) => (g.head ? { ...g, at, items: g.items.map((x, j) => walk(x, [...at, j])) } : { ...g, at, take: ['now', 'next'][n++] ?? 'later' });
  const out = gestures.map((g, i) => walk(g, [i])); // at: the path in the series, for writing at a tapped spot (15.11.)
  const flying = (g) => {
    if (!g.head) return g;
    const inner = flying(g.items[0]);
    return g.items.length === 1 && inner === g.items[0] ? g : inner;
  };
  if (out[0]) flying(out[0]).fly = true;
  return out;
}

/**
 * The chips of this take apart from the rest (15.11.): → { now: groups for the top of the window, rest: groups below }.
 * now = the element taken now, inside the prefixes it belongs to; rest = sticky, offers and everything after it.
 * Without a 'now' (heard words, nothing written) all stays below.
 */
export function splitNow(groups = []) {
  const find = (g) => (g.head ? g.items.some(find) : g.take === 'now');
  const top = groups.findIndex((g) => !g.stable && !g.offer && find(g));
  if (top < 0) return { now: [], rest: groups };
  const only = (g) => (g.head ? { ...g, items: g.items.filter(find).map(only) } : g); // the path down to it
  const without = (g) => (g.head ? { ...g, items: g.items.filter((x) => !(x.head ? false : x.take === 'now')).map(without).filter((x) => !x.head || x.items.length) } : g);
  const rest = groups.flatMap((g, i) => (i !== top ? [g] : g.head ? [without(g)].filter((x) => x.items.length) : []));
  return { now: [only(groups[top])], rest };
}

/** Depth of bubbles under a node (0 for a chip). */
const depthOf = (n) => (n.chip ? 0 : 1 + Math.max(0, ...n.items.map(depthOf)));
const padOf = (level, k) => (level <= ROOMY ? PAD * k : 1.5 * k);

/** Width of a node at a level (1 = outermost bubble). */
function widthOf(n, k, level) {
  if (n.chip) return chipW(n.chip.text, k);
  const parts = [...n.head.map((c) => chipW(c.text, k)), ...n.items.map((x) => widthOf(x, k, level + 1))];
  return parts.reduce((s, x) => s + x, 0) + INNER * k * (parts.length - 1) + 2 * padOf(level, k);
}

/** Height of a node's bubble at a level. */
function heightOf(n, k, level) {
  let h = H * k;
  for (let l = level + depthOf(n) - 1; l >= level; l--) h += 2 * padOf(l, k);
  return h;
}

/**
 * groups = gestures: [{ text, t, heard, take, stable, offer, origin, picked } | { items: [gesture], head?, … }]
 *   stable = sticky (in front, filled dark, holds for all) · take: 'now' | 'next' | 'later', fly (withTakes) ·
 *   heard: from Whisper · offer: dashed, origin 'similar' | 'password' · items may nest (bubbles in bubbles).
 * timeMs · cx, y (middle of the row), k (scale), w (screen width). → shapes [{ type: 'bubble' | 'chip' | 'path', … }]
 */
export function chipShapes(groups = [], { timeMs = null, cx, y, k = 1, w = 390, queue = false, caret = null, scroll = 0 }) {
  const sticky = groups.filter((g) => g.stable).flatMap((g) => (g.items ? [g.head, ...g.items.map((i) => i.text)].flat().filter(Boolean) : [g.text]));
  const own = groups.filter((g) => !g.stable && !g.offer), offers = groups.filter((g) => !g.stable && g.offer);
  const row = [];
  if (sticky.length) row.push({ head: sticky, items: own, sticky: true }); // the sticky holds for all the takes: one bubble
  else row.push(...own);
  row.push(...offers);
  if (!row.length) row.push({ text: '', wait: true }); // nothing yet: one dashed chip

  const out = [];
  let x = 0;
  for (const g of row) {
    const node = nodeOf(g);
    put(node, x, 1, { y, k, timeMs, out, queue });
    x += widthOf(node, k, 1) + GAP * k;
  }
  const total = x - GAP * k;
  let caretX = null;
  if (caret) { // where the next written gesture goes: a thin line behind the tapped chip, or inside the tapped bubble at its end
    const hit = out.find((s) => s.at && s.at.join('.') === caret.at.join('.') && (caret.how === 'in' ? s.type === 'bubble' : true));
    if (hit) { caretX = hit.x + hit.w + (caret.how === 'in' ? -PAD * k : (GAP * k) / 2); out.push({ type: 'path', d: `M${caretX} ${hit.y + 4 * k}V${hit.y + hit.h - 4 * k}`, cls: 'caret' }); }
  }
  const fly = out.find((s) => s.cls === 'fly'), now = out.find((s) => s.type === 'chip' && /\bnow\b/.test(s.cls));
  const at = caretX ?? (fly ? +/^M(-?[\d.]+)/.exec(fly.d)[1] : now ? now.x + now.w / 2 : null); // the caret, the gesture taken now, or the word at the time
  const long = total > w - 24 * k;
  const base = long && at != null ? cx - at : long ? cx - w / 2 + 12 * k : cx - total / 2;
  const shift = long ? Math.min(cx - w / 2 + 12 * k, Math.max(cx + w / 2 - 12 * k - total, base + scroll)) : base; // long: scrolls sideways, never past its ends (15.11.)
  return out.map((s) => move(s, shift));
}

/** How high the row is (bubbles in bubbles grow it: 32 px, 2 levels 56 px, 3 levels 68 px) – the field makes room for it. */
export function rowHeight(groups = [], k = 1) {
  const s = chipShapes(groups, { cx: 0, y: 0, k }).filter((x) => x.type === 'chip' || x.type === 'bubble');
  return s.length ? Math.max(...s.map((x) => x.y + x.h)) - Math.min(...s.map((x) => x.y)) : H * k;
}

/** A node at x (its left edge), level, middle y. */
function put(n, x, level, o) {
  const { y, k, out } = o;
  if (n.chip) return out.push(...chipOf(n.chip, x, o));
  const g = n.group, h = heightOf(n, k, level), width = widthOf(n, k, level);
  const words = [...n.head.map((c) => c.text), ...n.items.map(textOf)].join(' ');
  const offer = n.ctx.offer ? `offer:${words}` : null;
  const spot = o.queue && g.at && !g.sticky ? `queue:in:${g.at.join('.')}:${words}` : null; // tapped in the row: write into this bubble
  out.push({ type: 'bubble', x, y: y - h / 2, w: width, h, at: g.at, cls: `bubble d${Math.min(level, 4)}${g.sticky ? ' sticky' : ''}${offer ? ` offer ${n.ctx.origin ?? ''}`.trimEnd() : ''}`,
    role: offer ?? (g.sticky ? 'sticky' : spot ?? `gesture:${words}`) });
  if (g.fly && !g.sticky) out.push(flyOver(x + width / 2, y - h / 2, k));
  const from = out.length;
  let cx = x + padOf(level, k);
  for (const c of n.head) { out.push(...chipOf({ ...c, offer: n.ctx.offer, origin: n.ctx.origin, at: g.sticky ? null : g.at, how: 'in' }, cx, o)); cx += chipW(c.text, k) + INNER * k; }
  for (const item of n.items) { put(item, cx, level + 1, o); cx += widthOf(item, k, level + 1) + INNER * k; }
  if (offer) for (const sh of out.slice(from)) if (sh.role) sh.role = offer; // an offer is taken as a whole gesture
}

const textOf = (n) => (n.chip ? n.chip.text : [...n.head.map((c) => c.text), ...n.items.map(textOf)].join(' '));

/** One chip (and its wave, and its arrow if it flies alone). */
function chipOf(c, x, o) {
  const { y, k, timeMs } = o;
  const w = chipW(c.text, k), shapes = [];
  const tone = c.offer ? `offer${c.origin ? ` ${c.origin}` : ''}${c.picked ? ' picked' : ''}` : c.head ? 'head' : toneOf(c, c.take, timeMs);
  const spot = o.queue && c.at && !c.offer ? `queue:${c.how ?? 'after'}:${c.at.join('.')}:${c.text}` : null; // tapped in the row: write behind it (a prefix word: into its bubble)
  shapes.push({ type: 'chip', x, y, w, h: H * k, at: c.how === 'in' ? null : c.at, text: c.text, cls: `chip ${tone}${c.heard ? ' heard' : ''}`, role: c.offer ? `offer:${c.text}` : c.wait ? null : spot ?? `chip:${c.text}` });
  if (c.heard) { // heard, not typed: a fine wave inside the bottom edge
    const y0 = y + 12 * k, x0 = x + 14 * k, n = Math.max(2, Math.floor((w - 28 * k) / (8 * k)));
    shapes.push({ type: 'path', d: `M${x0} ${y0}${' q2 -3 4 0 t4 0'.repeat(n)}`, cls: 'wave-heard' });
  }
  if (c.fly && !c.offer) shapes.push(flyOver(x + w / 2, y - (H * k) / 2, k));
  return shapes;
}

/** The arrow ↑ over what flies into the chain after this take. */
const flyOver = (x, top, k) => ({ type: 'path', d: `M${x} ${top - 3 * k}V${top - 13 * k}M${x - 5 * k} ${top - 8 * k}L${x} ${top - 14 * k}L${x + 5 * k} ${top - 8 * k}`, cls: 'fly' });

/** Move a shape sideways. */
function move(s, dx) {
  if (s.type !== 'path') return { ...s, x: s.x + dx };
  return { ...s, d: s.d.replace(/([MLV])(-?[\d.]+)(?: (-?[\d.]+))?/g, (m, op, a, b) => (op === 'V' ? m : `${op}${(+a + dx)}${b != null ? ` ${b}` : ''}`)) };
}
