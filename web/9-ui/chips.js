// chips.js — the context of a series as chips (20.11., user): what is taken now, what stays, what comes next, what later.
//
// Purpose:   every word is one chip with a background and an edge; brackets show as pastel-yellow bubbles, one inside
//            the other as they nest, a new nesting after it as a bubble of its own.
//              inside the window, above the context arc: the words of the take now, one by one, all in one colour
//              the row under the arc: the series as it was typed, without the take now – "Obst (Banane Apfel Birne)"
//              shows Obst (Apfel Birne) once Obst Banane is taken
//              background (tone)  sticky  a word in the take now and in the next one too: the window's colour
//                                 next    a word of the next take: a little lighter · later   lighter still
//                                 now     the take now (only while typing, the row shows everything)
//              edge (nest)        which nesting a word belongs to; each main nesting its own colour, darker inside (NEST_COLORS,
//                                 in order), the bubble's edge the same; loose words keep the edge of their tone
//            Typing form and its meaning: context.js fromField. After every take the row moves on by one element
//            (context.js afterTake). A tap between two takes puts the caret there (context.js insertGesture), a tap
//            into a bubble writes into that bracket.
// Depends:   1-model/context.js
// Test:      tests/ui.test.mjs
// Limits:    bubbles drawn up to 3 levels deep (deeper ones share the look); 4 main colours, then they repeat;
//            ≈ 26 + 8.4 px per letter per chip.

import { contextTree, nextOfSeries, afterTake, withSticky, chipTexts, stepOn } from '../1-model/context.js';

export const chipWidth = (text, k = 1) => Math.round((text ? 22 + String(text).length * 8 : 48) * k);
/**
 * The edges of the main nestings (27.11., user: each main nesting its own colour, the brackets inside it variations of
 * it): coral · ochre · green · grey, then they repeat – the app's colours, no violet, not Similar's blue. A bracket one
 * level deeper: the same colour 22 % darker per level (≤ 3).
 */
export const NEST_COLORS = Object.freeze(['#C9694F', '#A67C00', '#5E8C61', '#7A746C']);
const DARK = [0x3b, 0x2f, 0x2a];
/** The edge of a bracket: its main nesting's colour, darker the deeper it lies. main: 0, 1 … · depth: 1 = the main bracket. */
export function nestColor(main, depth = 1) {
  const base = NEST_COLORS[main % NEST_COLORS.length], f = 0.22 * Math.min(3, Math.max(0, depth - 1));
  const c = [1, 3, 5].map((i, j) => Math.round(parseInt(base.slice(i, i + 2), 16) * (1 - f) + DARK[j] * f));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const split = (t) => String(t ?? '').split(/\s+/).filter(Boolean);
const TONES = ['now', 'next'];

/**
 * The series as a row. text: written context (gestures in our notation) · sticky: words held for the whole series.
 * → [node]: { bubble: true, depth, at, nest, head: [{ text, tone }], children: [node] }
 *         | { take: true, at, i (0 = now, 1 = next …), tone, nest?, words: [{ text, tone }] }
 * at = the path of the element in contextTree(text) (for writing at a tapped spot); nest = its edge colour (nestColor:
 * the main nesting's colour, darker inside).
 */
export function seriesRow(text, sticky = '') {
  let tree = [];
  try { tree = contextTree(text ?? ''); } catch { tree = text ? [{ text }] : []; }
  const held = chipTexts(sticky).flat();
  // 1) the takes in order, each with the prefix words over it
  const takes = [];
  const collect = (node, at, heads) => {
    if (node.head) node.items.forEach((x, j) => collect(x, [...at, j], [...heads, ...node.head]));
    else takes.push({ at, heads, words: node.items ? node.items.flatMap((x) => split(x.text)) : split(node.text) });
  };
  tree.forEach((node, i) => collect(node, [i], []));
  const all = (t) => (t ? [...held, ...t.heads, ...t.words] : []);
  const nowSet = new Set(all(takes[0]).map((w) => w.toLowerCase())), nextSet = new Set(all(takes[1]).map((w) => w.toLowerCase()));
  const toneOf = (word, i) => (nowSet.has(word.toLowerCase()) && nextSet.has(word.toLowerCase()) ? 'sticky' : TONES[i] ?? 'later');
  const index = new Map(takes.map((t, i) => [t.at.join('.'), i]));
  // 2) the row as it was typed: a prefix once, then its takes; every bracket a bubble with its own edge
  let mains = 0;
  const build = (node, at, depth, main) => {
    if (node.head) {
      const me = nestColor(main, depth);
      const children = node.items.map((x, j) => build(x, [...at, j], depth + 1, main));
      const first = Math.min(...children.map((c) => c.i ?? c.first ?? Infinity));
      return { bubble: true, depth, at, nest: me, first, head: node.head.map((w) => ({ text: w, tone: toneOf(w, first) })), children };
    }
    const i = index.get(at.join('.')), words = node.items ? node.items.flatMap((x) => split(x.text)) : split(node.text);
    const inBracket = words.length > 1 && (depth > 1 || Boolean(node.items)); // a bracket inside a bracket, or one typed with nothing before it (22.11.): one take, its own bubble
    return { take: true, at, i, tone: TONES[i] ?? 'later', ...(inBracket ? { nest: nestColor(main, depth) } : {}), words: words.map((w) => ({ text: w, tone: toneOf(w, i) })) };
  };
  const nested = (node) => Boolean(node.head) || (node.items && node.items.flatMap((x) => split(x.text)).length > 1);
  const row = tree.map((node, i) => build(node, [i], 1, nested(node) ? mains++ : mains)); // each main nesting the next colour
  if (!held.length) return row;
  return [{ bubble: true, depth: 0, at: [], sticky: true, nest: null, head: held.map((w) => ({ text: w, tone: 'sticky' })), children: row }];
}

/** The words of the take now, for inside the window: held, the prefixes over it, its own – all in one colour. */
export function nowWords(text, sticky = '') {
  let tree = [];
  try { tree = contextTree(nextOfSeries(text ?? '') || ''); } catch { tree = []; }
  const out = chipTexts(sticky).flat();
  const visit = (node) => { if (node.head) { out.push(...node.head); node.items.forEach(visit); } else out.push(...(node.items ? node.items.flatMap((x) => split(x.text)) : split(node.text))); };
  tree.forEach(visit);
  return out.map((w) => ({ text: w, tone: 'now' }));
}

/** The context stored with the next take: sticky in front of the first element (context.js withSticky). */
export const contextForTake = (text, sticky = '') => withSticky(sticky, nextOfSeries(text ?? ''));

/** After a take: the first element leaves the series (it went up into the chain). */
export const afterOne = (text) => (text ? afterTake(text) : '');
/** After a take kept with ← (26.11., user): a little = the innermost goes, the prefixes stay · far = the whole gesture goes. */
export const stepAfter = (text, how = 'inner') => (text ? stepOn(text, how) : '');

/** All words of the row in reading order, flat (for similar, onboarding checks). */
export function rowWords(row) {
  const out = [];
  const visit = (node) => { if (node.take) out.push(...node.words); else { out.push(...(node.head ?? [])); node.children?.forEach(visit); } };
  row.forEach(visit);
  return out;
}

/** How many takes the series still holds. */
export function takesLeft(row) {
  let n = 0;
  const visit = (node) => { if (node.take) n++; else node.children?.forEach(visit); };
  row.forEach(visit);
  return n;
}
