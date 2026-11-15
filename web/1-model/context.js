// context.js — what a context text means: gestures and chips.
//
// Purpose:   turn the tree from notation.js into gestures with their chips (SCHEMA.md §4).
//            Only the original text is stored (row of an :x file); this is computed.
// Depends:   notation.js
// Origin:    context model v1 (28.10.), v2 without commas, 07.11. without outer bracket.
// Test:      tests/model.test.mjs
// Rules:     1 every element is a bracket, never an outer bracket around all ·
//            2 inside a bracket space = together (variants), between brackets = one after the other ·
//            3 brackets of the row = gestures ·
//            4 bracket directly on bracket = prefix: applies to every element of the following
//              bracket, and stands in its own bracket: ((Kaffee)((bestellen) (holen))) = one
//              gesture with two variants (decision 07.11.).
// Limits:    multiplying nested prefixes grows as a product: (a b)((c d)((e f))) → 2·2·2 chips.

import { parse, write, check, NotationError } from './notation.js';

const SPACE_LETTER = '␣';

/** Read a context text. Returns { gestures, errors }. */
export function readContext(text) {
  const items = parse(text);
  const errors = [...check(items), ...items.filter((n) => n.t === 'prefix').map((n) => `prefix needs its own bracket: ${write([n])}`)];
  const gestures = items.filter((n) => n.t !== 'sym').map((n) => ({ chips: chips(n), meta: n.meta.map(metaOf) }));
  return { gestures, errors };
}

/**
 * The gestures as a tree for the view (chips in bubbles, 15.11.): a word → { text }; a bracket of several →
 * { items }; a prefix → { head: [words], items } (the head multiplies onto every item). Nothing is multiplied out.
 */
export function contextTree(text) {
  const node = (n) => {
    switch (n.t) {
      case 'value': case 'text': return { text: n.text };
      case 'spell': return { text: n.letters.join('') };
      case 'group': return n.items.length === 1 ? node(n.items[0]) : { items: n.items.filter((x) => x.t !== 'sym').map(node) };
      case 'prefix': {
        const body = node(n.body);
        return { head: chips(n.head).map((c) => c.text), items: body.items && !body.head ? body.items : [body] };
      }
      default: return null;
    }
  };
  return parse(text).filter((n) => n.t !== 'sym').map(node).filter(Boolean);
}

/** Put every prefix of the row into its own bracket: (A)((b) (c)) → ((A)((b) (c))). */
export function wrapPrefixes(text) {
  return write(parse(text).map((n) => (n.t === 'prefix' ? { t: 'group', items: [n], meta: [] } : n)));
}

// Inside a gesture: collect chips; prefixes multiply.
function chips(n) {
  switch (n.t) {
    case 'value': return [chip(n.text, n.meta)];
    case 'spell': return n.letters.map((l) => chip(l === ' ' ? SPACE_LETTER : l, n.meta));
    case 'group': return n.items.flatMap(chips);
    case 'prefix': {
      const heads = chips(n.head);
      const bodies = chips(n.body);
      return heads.flatMap((h) => bodies.map((b) => chip(`${h.text} ${b.text}`, [...h.metaNodes, ...b.metaNodes])));
    }
    case 'sym': return [];
    case 'text': return [chip(n.text, n.meta)]; // reported by check(), still readable
    default: throw new NotationError(`not allowed in context: ${n.t}`);
  }
}

function chip(text, metaNodes = []) {
  const c = { text, metaNodes };
  for (const m of metaNodes) {
    if (m.sym === '~') c.computed = m.value;
  }
  return c;
}

function metaOf(m) { return { sym: m.sym, value: m.value ?? null }; }

/** Plain chip texts per gesture, e.g. for Similar and file names. */
export function chipTexts(text) {
  return readContext(text).gestures.map((g) => g.chips.map((c) => c.text));
}

/**
 * Sticky context in front (13.11.): what holds for a series is a prefix (G4) for every gesture of this take.
 * sticky: its gestures in order are levels, (Essen) (Obst) = Essen › Obst; variants inside one level stay
 * variants, ((Café) (Bar)) = Café or Bar; (Café Bar) is one chip of two words (G2). Sticky is kept on the device;
 * each take stores the result, so the list of a series (afterTake) never loses it.
 *   withSticky('(Obst)', '(Banane) (Apfel)') → '((Obst)((Banane))) ((Obst)((Apfel)))'   two gestures stay two
 *   withSticky('(Essen) (Obst)', '(Banane)') → '((Essen)((Obst)((Banane))))'             Essen Obst Banane
 *   withSticky('(Essen) (Obst)', '')         → '((Essen)((Obst)))'                        sticky alone
 */
export function withSticky(sticky, context) {
  const levels = parse(sticky ?? '').filter((n) => n.t !== 'sym').map((n) => write([n]));
  const gestures = parse(context ?? '').filter((n) => n.t !== 'sym').map((n) => write([n]));
  if (!levels.length) return context ?? '';
  // G4: a prefix and the bracket it applies to stand together in their own bracket: ((Obst)((Banane)))
  const nest = (outer, gesture) => outer.reduceRight((body, level) => `(${level}${body})`, `(${gesture})`);
  if (!gestures.length) return levels.length === 1 ? levels[0] : nest(levels.slice(0, -1), levels.at(-1));
  return gestures.map((g) => nest(levels, g)).join(' ');
}

/** Series: after one Take the first gesture is done and leaves the text. */
export function afterTake(text) {
  const items = parse(text);
  removeFirstGesture(items);
  return write(items);
}

// A prefix series (15.11.): (hallo)((apfel) (birne) (du)) gives one take per element — (hallo apfel), then (hallo birne) …
// The prefix stays in front until its last element is taken; nested prefixes step the same way inside.
const unwrap = (n) => (n?.t === 'group' && n.items?.length === 1 && n.items[0].t === 'prefix' ? n.items[0] : n);
const elements = (prefix) => prefix.body.items.filter((n) => n.t !== 'sym');

function removeFirstGesture(items) {
  const i = items.findIndex((n) => n.t !== 'sym');
  if (i < 0) return false;
  const p = unwrap(items[i]);
  if (p.t === 'prefix' && elements(p).length) { // take one element of the prefix's bracket, keep the prefix for the rest
    const inner = p.body.items, j = inner.findIndex((n) => n.t !== 'sym'), first = unwrap(inner[j]);
    if (first.t === 'prefix' && elements(first).length > 1) removeFirstGesture(inner);
    else inner.splice(j, 1);
    if (!elements(p).length) items.splice(i, 1);
    return true;
  }
  items.splice(i, 1);
  return true;
}

/**
 * The context of the next take of a series: the first gesture; of a prefix series the prefix with its first element,
 * in its own bracket (G4): (hallo)((apfel) (birne)) → ((hallo)((apfel))). Empty text → ''.
 */
export function nextOfSeries(text) {
  const first = parse(text ?? '').find((n) => n.t !== 'sym');
  if (!first) return '';
  const pick = (n) => {
    const p = unwrap(n);
    if (p.t !== 'prefix' || !elements(p).length) return n;
    return { t: 'group', items: [{ ...p, body: { ...p.body, items: [pick(elements(p)[0])] } }], meta: [] };
  };
  return write([pick(first)]);
}

/**
 * What someone typed into the context field → gestures in our notation. Without "(" it is one gesture as
 * before; "[ ]" spells letters; brackets nest; a word without its bracket gets one; missing ")" or "]" at the
 * end are closed; a prefix gets its own bracket (G4). Unreadable → one gesture without brackets.
 * "Obst Banane" → (Obst Banane) · "[LISA]" → ([LISA]) · "(Obst (Banane" → ((Obst) (Banane)) · "Obst(Banane)" → ((Obst)(Banane))
 */
export function fromField(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const plain = () => `(${s.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim()})`;
  const open = s.includes('(') ? s : `(${s})`;
  const stack = [];
  for (const ch of open) {
    if (ch === '(' || ch === '[') stack.push(ch === '(' ? ')' : ']');
    else if (ch === ')' || ch === ']') { if (stack.pop() !== ch) return plain(); }
  }
  const fix = (n) => (n.t === 'text' ? { ...n, t: 'value' }
    : n.t === 'group' ? { ...n, items: n.items.map(fix) }
      : n.t === 'prefix' ? { ...n, head: fix(n.head), body: fix(n.body) } : n);
  try {
    const items = parse(open + stack.reverse().join('')).map(fix).map((n) => (n.t === 'prefix' ? { t: 'group', items: [n], meta: [] } : n));
    const out = write(items);
    return readContext(out).errors.length ? plain() : out;
  } catch { return plain(); }
}

/**
 * The sticky words of a context (15.11.): what a series holds stands as a prefix in its own bracket (G4, withSticky):
 * ((Obst)((Banane))) ((Obst)((Apfel))) → ['obst']. Nested levels all count: ((Essen)((Obst)((Banane)))) → ['essen', 'obst'].
 * No prefix, or text that does not parse → [].
 */
export function leadOf(text) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return []; }
  const words = (n) => (n.t === 'value' ? [n.text] : (n.items ?? []).flatMap(words));
  const out = new Set();
  const walk = (n) => { if (n.t === 'prefix') { for (const w of words(n.head)) out.add(w.normalize('NFC').toLowerCase()); walk(n.body); } else if (n.t === 'group' && n.items?.length === 1) walk(n.items[0]); };
  for (const n of nodes) walk(n);
  return [...out];
}
