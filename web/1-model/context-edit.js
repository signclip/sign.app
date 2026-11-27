// context-edit.js — changing a written context afterwards (21.11., user): a word away by deleting, brackets set later.
//
// Purpose:   the row has a caret ({ at: path, how: 'after' | 'first' | 'in' } | null = the end, as insertGesture in
//            context.js); here the same caret deletes and nests:
//              removeBefore  the last word before the caret goes (Backspace with nothing typed); an empty bracket goes
//                            with it, a prefix without anything under it becomes a word again
//              wrapBetween   "(" at one caret, ")" at a later one of the same bracket: the takes between are nested,
//                            as if typed so – in the row the word right before "(" is put in front of each (Begriff1
//                            (Begriff2 Begriff3) = Begriff1 Begriff2, then Begriff1 Begriff3); nothing before it, or
//                            inside a bracket: one take together (as context.js typingForm) · nestBetween: + where
//              closeAt       ")" typed with no "(" waiting (22.11., user): inside a bracket = it ends here, what follows
//                            moves out behind it; in the row = the bracket before the caret reaches to here
//              unwrapAt      Backspace right after a bracket's "(": the nesting goes, its words stay
//              appendWord    a word typed right behind a loose word of the row joins its take (words without a
//                            bracket are one take together)
//              takeWords     every word of a take's context in reading order, with its own time 't(from_to) if it has one
//              toFront       a take further on tapped (26.11., user): it comes first, with its prefixes – the take now
//              takeOut       a take pushed down (26.11., user): it goes; a bracket it leaves empty stays open
// Depends:   notation.js
// Test:      tests/model.test.mjs
// Limits:    one bracket level per wrap (both carets in the same bracket); text that does not parse stays as it is;
//            only brackets with a word in front (bubbles of the row) take a caret inside.

import { parse, write } from './notation.js';

const real = (list) => list.map((n, ix) => [n, ix]).filter(([n]) => n.t !== 'sym');
const inner = (n) => { while (n?.t === 'group' && real(n.items).length === 1 && ['prefix', 'group'].includes(real(n.items)[0][0].t)) n = real(n.items)[0][0]; return n; };
const asGroup = (n) => { if (n.body.t !== 'group') n.body = { t: 'group', items: n.body.t === 'value' && n.body.text === '' ? [] : [n.body], meta: [] }; return n.body.items; }; // "()" = an open, empty bracket (26.11.)

/** Where a caret stands: the list it writes into, the index there (as insertGesture), the path of that bracket ([] = the row) and the bracket node. */
function positionOf(nodes, caret) {
  if (!caret) return { list: nodes, ix: nodes.length, path: [], owner: null };
  const { at = [], how = 'after' } = caret;
  if (!at.length) return { list: nodes, ix: how === 'first' ? 0 : nodes.length, path: [], owner: null };
  let list = nodes, owner = null;
  const path = [];
  for (let d = 0; d < at.length; d++) {
    const [outer, ix] = real(list)[at[d]] ?? [];
    if (!outer) return { list: nodes, ix: nodes.length, path: [], owner: null };
    const n = inner(outer), last = d === at.length - 1;
    if (last && n.t === 'prefix' && (how === 'first' || how === 'in')) { const items = asGroup(n); return { list: items, ix: how === 'first' ? 0 : items.length, path: [...path, at[d]], owner: n }; }
    if (last || n.t !== 'prefix') return { list, ix: ix + 1, path, owner };
    path.push(at[d]); owner = n;
    list = asGroup(n);
  }
  return { list: nodes, ix: nodes.length, path: [], owner: null };
}
const realIndex = (list, ix) => real(list).findIndex(([, j]) => j === ix);
/** The node at a path and the list holding it. */
function nodeAt(nodes, at) {
  let list = nodes;
  for (let d = 0; d < at.length; d++) {
    const [outer, ix] = real(list)[at[d]] ?? [];
    if (!outer) return null;
    if (d === at.length - 1) return { list, ix, node: outer };
    const n = inner(outer);
    if (n.t !== 'prefix') return null;
    list = asGroup(n);
  }
  return null;
}

/** The last word of list[j] goes; → true when list[j] went altogether. */
function dropLast(list, j) {
  const n = list[j];
  if (n.t === 'value') {
    const words = n.text.split(/\s+/).filter(Boolean);
    if (words.length > 1) { n.text = words.slice(0, -1).join(' '); return false; }
    list.splice(j, 1); return true;
  }
  if (n.t === 'group') {
    const r = real(n.items).at(-1);
    if (!r || (dropLast(n.items, r[1]) && !real(n.items).length)) { list.splice(j, 1); return true; }
    return false;
  }
  if (n.t === 'prefix') {
    const items = asGroup(n), r = real(items).at(-1);
    if (r) dropLast(items, r[1]);
    if (!real(items).length) list[j] = n.head; // nothing under it any more: the prefix is a word again
    return false;
  }
  list.splice(j, 1); return true;
}

/** Backspace with nothing typed: the last word before the caret goes. → { text, caret } or null (nothing before it) */
export function removeBefore(text, caret = null) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const { list, ix } = positionOf(nodes, caret);
  let j = ix - 1;
  while (j >= 0 && list[j].t === 'sym') j--;
  if (j < 0) return null;
  const gone = dropLast(list, j);
  let next = caret;
  if (gone && caret?.how === 'after' && caret.at?.length) { // the element under the caret went: the caret moves to the one before
    const at = [...caret.at], i = at.pop() - 1;
    next = i >= 0 ? { how: 'after', at: [...at, i] } : { how: 'first', at };
  }
  return { text: write(nodes).trim(), caret: next };
}

/** "(" at caret open, ")" at caret close (same bracket, close later): the takes between nested. → { text, at } (at = the new bracket's path) or null */
export function nestBetween(text, open, close) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const a = positionOf(nodes, open), b = positionOf(nodes, close);
  if (a.list !== b.list || b.ix <= a.ix) return null;
  const inside = a.list.slice(a.ix, b.ix);
  if (!real(inside).length) return null;
  let j = a.ix - 1;
  while (j >= 0 && a.list[j].t === 'sym') j--;
  const before = j >= 0 && !a.path.length ? a.list[j] : null; // in the row only: inside a bracket a bracket is one take (typingForm)
  let at;
  if (before && (before.t === 'value' || before.t === 'group')) { // the word before "(" stands in front of each (G4: in its own bracket)
    const prefix = { t: 'prefix', head: before, body: { t: 'group', items: inside, meta: [] }, meta: [] };
    a.list.splice(j, b.ix - j, { t: 'group', items: [prefix], meta: [] });
    at = [...a.path, realIndex(a.list, j)];
  } else { a.list.splice(a.ix, b.ix - a.ix, { t: 'group', items: inside, meta: [] }); at = [...a.path, realIndex(a.list, a.ix)]; } // nothing before: one take together
  return { text: write(nodes).trim(), at };
}
export const wrapBetween = (text, open, close) => nestBetween(text, open, close)?.text ?? null;

/** ")" with no "(" waiting (22.11.): inside a bracket it ends at the caret · in the row the bracket before reaches to it. → { text, caret } or null */
export function closeAt(text, caret) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const p = positionOf(nodes, caret);
  if (p.path.length) { // inside a bracket: what follows the caret moves out, behind the bracket
    const rest = p.list.splice(p.ix);
    const at = p.path, parent = nodeAt(nodes, at);
    if (!parent) return null;
    parent.list.splice(parent.ix + 1, 0, ...rest);
    if (!real(p.list).length) return null;
    return { text: write(nodes).trim(), caret: { how: 'after', at } };
  }
  let b = p.ix - 1; // in the row: the nearest bracket before the caret takes in what lies between
  while (b >= 0 && inner(p.list[b])?.t !== 'prefix') b--;
  if (b < 0 || b === p.ix - 1) return null;
  const moved = p.list.splice(b + 1, p.ix - b - 1);
  asGroup(inner(p.list[b])).push(...moved);
  return { text: write(nodes).trim(), caret: { how: 'after', at: [realIndex(p.list, b)] } };
}

/** Backspace right after a bracket's "(" (caret first in it): the nesting goes, the word in front and the words inside stay. → { text, caret } or null */
export function unwrapAt(text, caret) {
  if (caret?.how !== 'first' || !caret.at?.length) return null;
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const hit = nodeAt(nodes, caret.at), n = inner(hit?.node);
  if (n?.t !== 'prefix') return null;
  const items = asGroup(n);
  hit.list.splice(hit.ix, 1, n.head, ...items);
  return { text: write(nodes).trim(), caret: { how: 'after', at: [...caret.at.slice(0, -1), realIndex(hit.list, hit.ix)] } };
}

/** A word typed right behind a loose word of the row joins its take: (Obst) + Banane → (Obst Banane). → text or null */
export function appendWord(text, caret, word) {
  if (caret?.how !== 'after' || caret.at?.length !== 1) return null;
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const hit = nodeAt(nodes, caret.at);
  if (hit?.node.t !== 'value' || /[()[\]{}]/.test(word)) return null;
  hit.node.text = `${hit.node.text} ${word}`;
  return write(nodes).trim();
}

/** Every word of a take's context, in reading order: [{ text, from, to }] (ms inside the take, null = the whole take). */
export function takeWords(text) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return text ? [{ text: String(text), from: null, to: null }] : []; }
  const out = [];
  const timeOf = (n) => { const m = /^(\d+)_(\d+)$/.exec((n.meta ?? []).find((x) => x.sym === "'t")?.value ?? ''); return m ? [Number(m[1]), Number(m[2])] : null; };
  const visit = (n, time) => {
    const t = timeOf(n) ?? time;
    if (n.t === 'value') for (const w of n.text.split(/\s+/).filter(Boolean)) out.push({ text: w, from: t?.[0] ?? null, to: t?.[1] ?? null });
    else if (n.t === 'group') n.items.forEach((x) => visit(x, t));
    else if (n.t === 'prefix') { visit(n.head, t); visit(n.body, t); }
  };
  nodes.forEach((n) => visit(n, null));
  return out;
}

/**
 * A take further on in the row tapped (26.11., user): it becomes the take now – first in every bracket on its way, so its
 * prefixes stay in front of it (context.js nextOfSeries). at: its path in the row (paint.js rowHtml). → text, or null
 *   toFront('((Obst)((Banane) (Apfel))) (Kaffee)', [0, 1]) → '((Obst)((Apfel) (Banane))) (Kaffee)'
 */
export function toFront(text, at) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  if (!at?.length) return null;
  let list = nodes;
  for (let d = 0; d < at.length; d++) {
    const r = real(list), hit = r[at[d]];
    if (!hit) return null;
    const [outer, ix] = hit, first = r[0][1];
    if (ix !== first) { list.splice(ix, 1); list.splice(first, 0, outer); }
    if (d === at.length - 1) break;
    const n = inner(outer);
    if (n.t !== 'prefix') return null;
    list = asGroup(n);
  }
  return write(nodes).trim();
}

/** A take of the row pushed down (26.11., user): it goes; the bracket around stays, open, when it was the last. → text, or null */
export function takeOut(text, at) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const hit = at?.length ? nodeAt(nodes, at) : null;
  if (!hit) return null;
  hit.list.splice(hit.ix, 1);
  return write(nodes).trim();
}

/**
 * The bracket left open and empty in front (26.11., stepOn: the last element went, the prefixes stay): its path in the
 * row, so writing goes on inside it – a new nesting begins only after ")" or a tap elsewhere. → path, or null
 *   openAt('((Obst)()) (Kaffee)') → [0] · openAt('((A)((B)()))') → [0, 0] · openAt('(Hallo)') → null
 */
export function openAt(text) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const path = [];
  let list = nodes;
  for (;;) {
    const first = real(list)[0];
    if (!first) return null;
    const n = inner(first[0]);
    if (n.t !== 'prefix') return null;
    path.push(0);
    const items = n.body?.t === 'group' ? n.body.items : n.body?.t === 'value' && n.body.text === '' ? [] : [n.body];
    if (!real(items).length) return path;
    list = items;
  }
}
