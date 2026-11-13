// notation.js — read and write the one bracket grammar of context, line, similar and file heads.
//
// Purpose:   text ⇄ tree, losslessly (SCHEMA.md §3–4). Meaning is added by context.js and
//            file.js; this file only knows the shape of the text.
// Depends:   symbols.js
// Origin:    recursive descent parser; idea of "brace expansion" from the Unix shell.
// Test:      tests/model.test.mjs
// Rules:     ( ) holds values, { } holds references · inside a bracket space = together,
//            between brackets = one after the other · bracket directly on bracket = prefix,
//            applies to every element of the following bracket · symbol bracket directly after
//            an element = meta of that element · inside a symbol bracket: value first, then meta
//            about it · short forms :art, :art.n, :art.n.a, :?.1.1_3 · a line break is a space.
// Limits:    nesting depth is limited only by the call stack (~10,000 levels in practice).

import { SYMBOLS } from './symbols.js';

export { SYMBOLS };
const OPEN = '([{';
const STOP = '()[]{}';

export class NotationError extends Error {}

export function parse(text) {
  const p = { s: text.replace(/’/g, "'").replace(/\s*\n\s*/g, ' '), i: 0 }; // ’ becomes ', line break = space
  const items = sequence(p, null);
  if (p.i < p.s.length) fail(p, `unexpected "${p.s[p.i]}"`);
  return items;
}

const fail = (p, msg) => { throw new NotationError(`${msg} at position ${p.i}`); };

const symbolAt = (p) => SYMBOLS.find((sym) => p.s.startsWith(sym, p.i) && p.s[p.i + sym.length] === '(') ?? null;

function sequence(p, close) {
  const items = [];
  for (;;) {
    while (p.s[p.i] === ' ') p.i++;
    if (p.i >= p.s.length) {
      if (close) fail(p, `missing "${close}"`);
      return items;
    }
    if (p.s[p.i] === close) { p.i++; return items; }
    if (')]}'.includes(p.s[p.i])) fail(p, `unexpected "${p.s[p.i]}"`);
    items.push(element(p));
  }
}

function element(p) {
  let node = atom(p);
  for (;;) {
    const sym = symbolAt(p);
    if (sym) { node.meta.push(symbolNode(p, sym)); continue; }
    if (OPEN.includes(p.s[p.i])) {
      node = { t: 'prefix', head: node, body: element(p), meta: [] };
      return node;
    }
    return node;
  }
}

function atom(p) {
  const sym = symbolAt(p);
  if (sym) return symbolNode(p, sym);
  const ch = p.s[p.i];
  if (ch === '(') { p.i++; return bracket(p); }
  if (ch === '[') {
    const end = p.s.indexOf(']', p.i);
    if (end < 0) fail(p, 'missing "]"');
    const letters = [...p.s.slice(p.i + 1, end)];
    p.i = end + 1;
    return { t: 'spell', letters, meta: [] };
  }
  if (ch === '{') { p.i++; return { t: 'line', items: sequence(p, '}'), meta: [] }; }
  if (ch === ':') {
    const m = /^:([a-z]+(?:-[a-z]+)*|[?_])((?:\.\d+(?:_\d+)?)*)/.exec(p.s.slice(p.i));
    if (!m) fail(p, 'short form needs a kind, e.g. :v.1');
    p.i += m[0].length;
    const path = m[2] ? m[2].slice(1).split('.') : [];
    return { t: 'ref', kind: m[1], path, name: m[1] + m[2], meta: [] };
  }
  return bareText(p);
}

function bareText(p) {
  const start = p.i;
  while (p.i < p.s.length && p.s[p.i] !== ' ' && !STOP.includes(p.s[p.i]) && !symbolAt(p)) p.i++;
  if (p.i === start) fail(p, 'empty element');
  return { t: 'text', text: p.s.slice(start, p.i), meta: [] };
}

function isPlainText(n) { return n.t === 'text' && n.meta.length === 0; }

function bracket(p) {
  const items = sequence(p, ')');
  if (items.every(isPlainText)) return { t: 'value', text: items.map((n) => n.text).join(' '), meta: [] };
  return { t: 'group', items, meta: [] };
}

function symbolNode(p, sym) {
  p.i += sym.length + 1; // symbol and "("
  const items = sequence(p, ')');
  let k = 0;
  while (k < items.length && isPlainText(items[k])) k++;
  const rest = items.slice(k);
  if (k > 0 && rest.every((n) => n.t === 'sym')) {
    return { t: 'sym', sym, value: items.slice(0, k).map((n) => n.text).join(' '), inner: rest, meta: [] };
  }
  if (k === 0 && items.length === 0) return { t: 'sym', sym, value: '', inner: [], meta: [] };
  return { t: 'sym', sym, body: items, meta: [] };
}

/** Write a tree back in the one canonical spelling. */
export const write = (items) => items.map(writeNode).join(' ');
const metas = (n) => n.meta.map(writeNode).join('');

function writeNode(n) {
  switch (n.t) {
    case 'value': return `(${n.text})` + metas(n);
    case 'text': return n.text + metas(n);
    case 'group': return `(${write(n.items)})` + metas(n);
    case 'spell': return `[${n.letters.join('')}]` + metas(n);
    case 'line': return `{${write(n.items)}}` + metas(n);
    case 'ref': return `:${n.name}` + metas(n);
    case 'prefix': return writeNode(n.head) + writeNode(n.body);
    case 'sym': {
      const inside = n.body ? write(n.body) : n.value + n.inner.map(writeNode).join(''); // meta directly behind
      return `${n.sym}(${inside})` + metas(n);
    }
    default: throw new NotationError(`unknown node ${n.t}`);
  }
}

/** Every chip must be in a bracket: bare text is only allowed inside symbol brackets. */
export function check(items) {
  const errors = [];
  const walk = (list, insideSymbol) => {
    for (const n of list) {
      if (n.t === 'text' && !insideSymbol) errors.push(`chip without bracket: "${n.text}"`);
      if (n.items) walk(n.items, false);
      if (n.t === 'prefix') walk([n.head, n.body], insideSymbol);
      else if (n.body) walk(n.body, true);
      walk(n.meta, insideSymbol);
    }
  };
  walk(items, false);
  return errors;
}
