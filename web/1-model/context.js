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

/** Plain chip texts per gesture, e.g. for search and file names. */
export function chipTexts(text) {
  return readContext(text).gestures.map((g) => g.chips.map((c) => c.text));
}

/** Series: after one Take the first gesture is done and leaves the text. */
export function afterTake(text) {
  const items = parse(text);
  removeFirstGesture(items);
  return write(items);
}

function removeFirstGesture(items) {
  const i = items.findIndex((n) => n.t !== 'sym');
  if (i >= 0) items.splice(i, 1);
  return i >= 0;
}
