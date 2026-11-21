// context-edit.js — changing a written context afterwards (21.11., user): a word away by deleting, brackets set later.
//
// Purpose:   the row has a caret ({ at: path, how: 'after' | 'first' | 'in' } | null = the end, as insertGesture in
//            context.js); here the same caret deletes and nests:
//              removeBefore  the last word before the caret goes (Backspace with nothing typed); an empty bracket goes
//                            with it, a prefix without anything under it becomes a word again
//              wrapBetween   "(" at one caret, ")" at a later one of the same bracket: the takes between are nested,
//                            as if typed so – the word right before "(" is put in front of each (Begriff1 (Begriff2
//                            Begriff3) = Begriff1 Begriff2, then Begriff1 Begriff3); nothing before it: one take together
//              takeWords     every word of a take's context in reading order, with its own time 't(from_to) if it has one
// Depends:   notation.js
// Test:      tests/model.test.mjs
// Limits:    one bracket level per wrap (both carets in the same bracket); text that does not parse stays as it is.

import { parse, write } from './notation.js';

const real = (list) => list.map((n, ix) => [n, ix]).filter(([n]) => n.t !== 'sym');
const inner = (n) => { while (n?.t === 'group' && real(n.items).length === 1 && ['prefix', 'group'].includes(real(n.items)[0][0].t)) n = real(n.items)[0][0]; return n; };
const asGroup = (n) => { if (n.body.t !== 'group') n.body = { t: 'group', items: [n.body], meta: [] }; return n.body.items; };

/** Where a caret stands: the list it writes into and the index there (as insertGesture). */
function positionOf(nodes, caret) {
  if (!caret) return { list: nodes, ix: nodes.length };
  const { at = [], how = 'after' } = caret;
  if (!at.length) return { list: nodes, ix: how === 'first' ? 0 : nodes.length };
  let list = nodes;
  for (let d = 0; d < at.length; d++) {
    const [outer, ix] = real(list)[at[d]] ?? [];
    if (!outer) return { list: nodes, ix: nodes.length };
    const n = inner(outer), last = d === at.length - 1;
    if (last && n.t === 'prefix' && (how === 'first' || how === 'in')) { const items = asGroup(n); return { list: items, ix: how === 'first' ? 0 : items.length }; }
    if (last || n.t !== 'prefix') return { list, ix: ix + 1 };
    list = asGroup(n);
  }
  return { list: nodes, ix: nodes.length };
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

/** "(" at caret open, ")" at caret close (same bracket, close later): the takes between nested. → text or null */
export function wrapBetween(text, open, close) {
  let nodes;
  try { nodes = parse(text ?? ''); } catch { return null; }
  const a = positionOf(nodes, open), b = positionOf(nodes, close);
  if (a.list !== b.list || b.ix <= a.ix) return null;
  const inside = a.list.slice(a.ix, b.ix);
  if (!real(inside).length) return null;
  let j = a.ix - 1;
  while (j >= 0 && a.list[j].t === 'sym') j--;
  const before = j >= 0 ? a.list[j] : null;
  if (before && (before.t === 'value' || before.t === 'group')) { // the word before "(" stands in front of each (G4: in its own bracket)
    const prefix = { t: 'prefix', head: before, body: { t: 'group', items: inside, meta: [] }, meta: [] };
    a.list.splice(j, b.ix - j, { t: 'group', items: [prefix], meta: [] });
  } else a.list.splice(a.ix, b.ix - a.ix, { t: 'group', items: inside, meta: [] }); // nothing before: one take together
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
