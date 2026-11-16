// chips.js — the context of a series as chips (16.11.): what is taken now, what comes next, what stays.
//
// Purpose:   one row under the bottom arc, the same model whether typing or not. Every element of the series is one
//            take; a prefix (G4) multiplies onto each of its elements, so each take shows its words multiplied out,
//            and the takes of one prefix lie together in a pastel-yellow bubble (bubbles nest like the brackets).
//              tone   sticky  the sticky words (hold for the whole series, kept on the device)
//                     stay    prefix words: they stay while their bracket lasts
//                     now     the element taken by the next take: it also shows inside the window, bent along the arc
//                     next    the one after it · later   everything after that (paler)
//            After every take the row moves up by one element (context.js afterTake): next becomes now and slides from
//            under the arc into the window. A tap between two elements puts the caret there: what is typed is written
//            at that spot (context.js insertGesture), a tap into a bubble writes into that bracket.
// Depends:   1-model/context.js
// Test:      tests/ui.test.mjs
// Limits:    bubbles drawn up to 3 levels deep (deeper ones share the edge); ≈ 26 + 8.4 px per letter per chip.

import { contextTree, nextOfSeries, afterTake, withSticky, chipTexts } from '../1-model/context.js';

export const chipWidth = (text, k = 1) => Math.round((text ? 22 + String(text).length * 8 : 48) * k);

/**
 * The series as a row. text: written context (gestures in our notation) · sticky: '(Essen) (Obst)' or ''.
 * → [node]: { bubble: true, depth, at, children: [node] } | { take: true, at, tone, words: [{ text, tone }] }
 * at = the path of the element in contextTree(text) (for writing at a tapped spot).
 */
export function seriesRow(text, sticky = '') {
  let n = 0;
  const toneOfTake = () => ['now', 'next'][n++] ?? 'later';
  const stickyWords = chipTexts(sticky).flat();
  const walk = (node, at, heads, depth) => {
    if (node.head) {
      const children = node.items.map((x, j) => walk(x, [...at, j], [...heads, ...node.head], depth + 1));
      return { bubble: true, depth, at, children };
    }
    if (node.items) { // a bracket of variants without prefix: one take, several chips side by side
      const tone = toneOfTake();
      return { take: true, at, tone, words: [...heads.map((h) => ({ text: h, tone: 'stay' })), ...node.items.map((x) => ({ text: x.text ?? '', tone }))] };
    }
    const tone = toneOfTake();
    return { take: true, at, tone, words: [...heads.map((h) => ({ text: h, tone: 'stay' })), ...String(node.text ?? '').split(/\s+/).filter(Boolean).map((w) => ({ text: w, tone }))] };
  };
  let tree = [];
  try { tree = contextTree(text ?? ''); } catch { tree = text ? [{ text }] : []; }
  const row = tree.map((node, i) => walk(node, [i], [], 1));
  if (!stickyWords.length) return row;
  return [{ bubble: true, depth: 0, at: [], sticky: true, children: [{ take: true, at: null, tone: 'sticky', words: stickyWords.map((w) => ({ text: w, tone: 'sticky' })) }, ...row] }];
}

/** The words of the take now (for inside the window): sticky, the prefixes on its way, the element. → [{ text, tone }] */
export function nowWords(text, sticky = '') {
  const found = [];
  const visit = (node) => { if (node.take && node.tone === 'now') found.push(...node.words); else node.children?.forEach(visit); };
  seriesRow(text, sticky).forEach(visit);
  const stickyWords = chipTexts(sticky).flat().map((w) => ({ text: w, tone: 'sticky' }));
  return found.length ? [...stickyWords, ...found] : stickyWords;
}

/** The context stored with the next take: sticky in front of the first element (context.js withSticky). */
export const contextForTake = (text, sticky = '') => withSticky(sticky, nextOfSeries(text ?? ''));

/** After a take: the first element leaves the series (it went up into the chain). */
export const afterOne = (text) => (text ? afterTake(text) : '');

/** All words of the row in reading order, flat (for similar, onboarding checks). */
export function rowWords(row) {
  const out = [];
  const visit = (node) => (node.take ? out.push(...node.words) : node.children?.forEach(visit));
  row.forEach(visit);
  return out;
}

/** How many takes the series still holds. */
export function takesLeft(row) {
  let n = 0;
  const visit = (node) => { if (node.take && node.tone !== 'sticky') n++; else node.children?.forEach(visit); };
  row.forEach(visit);
  return n;
}
