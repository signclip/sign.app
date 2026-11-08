// json.js — the .json next to every .sign: the same tree, symbols as keys, indented.
//
// Purpose:   tools (Python, tables, other apps) read JSON; we write .sign. Both are made at the
//            same moment and say the same; if they differ, the .sign wins (decision 06.11.).
// Depends:   notation.js, file.js
// Test:      tests/model.test.mjs (text → JSON → text gives the same text)
// Keys:      ":" kind or short form · ":v.1" definition · "{}" rows · "(" values · "{" references ·
//            "()" prefix [head, body] · a symbol bracket under its symbol ("_", "?", "-") ·
//            meta of an element under "." + symbol (".@", ".'t", ".!") · "…" meta about a meta value.
// Limits:    about 3× the size of the .sign (~0.3 KB → ~1 KB per Take text).

import { parse, write } from './notation.js';
import { readFile } from './file.js';

function node(n) {
  const out = {};
  switch (n.t) {
    case 'value': out['('] = n.text; break;
    case 'text': out['('] = n.text; break; // bare text only appears in invalid input
    case 'group': out['('] = n.items.map(node); break;
    case 'spell': out['['] = n.letters.join(''); break;
    case 'line': out['{'] = n.items.map(node); break;
    case 'ref': out[':'] = n.name; break;
    case 'prefix': out['()'] = [node(n.head), node(n.body)]; break;
    case 'sym': out[n.sym] = n.body ? n.body.map(node) : n.value; if (n.inner?.length) out['…'] = n.inner.map(node); break;
    default: throw new Error(`unknown node ${n.t}`);
  }
  for (const m of n.meta ?? []) Object.assign(out, { [`.${m.sym}`]: node(m)[m.sym], ...(m.inner?.length ? { [`.${m.sym}…`]: m.inner.map(node) } : {}) });
  return out;
}

/** A .sign text → JSON text (2 spaces indent). */
export function toJson(text) {
  const file = readFile(text);
  const lines = text.split('\n').filter(Boolean);
  const out = node(parse(lines[0])[0]); // head: { ":": kind, ".!": …, ".@": … }
  for (const [name, d] of file.defs) out[`:${name}`] = node(d.node);
  out['{}'] = file.rows.map((r) => r.items.map(node));
  return JSON.stringify(out, null, 2) + '\n';
}

/** Text of one row or definition back from its JSON (for tests and import). */
export function fromJsonNode(j) {
  return write([back(j)]);
}

function back(j) {
  let n;
  if ('()' in j) n = { t: 'prefix', head: back(j['()'][0]), body: back(j['()'][1]), meta: [] };
  else if (':' in j) { const [kind, ...path] = j[':'].split('.'); n = { t: 'ref', kind, path, name: j[':'], meta: [] }; }
  else if ('{' in j) n = { t: 'line', items: j['{'].map(back), meta: [] };
  else if ('[' in j) n = { t: 'spell', letters: [...j['[']], meta: [] };
  else if ('(' in j) n = Array.isArray(j['(']) ? { t: 'group', items: j['('].map(back), meta: [] } : { t: 'value', text: j['('], meta: [] };
  else {
    const sym = Object.keys(j).find((k) => !k.startsWith('.') && k !== '…');
    n = Array.isArray(j[sym]) ? { t: 'sym', sym, body: j[sym].map(back), meta: [] } : { t: 'sym', sym, value: j[sym], inner: (j['…'] ?? []).map(back), meta: [] };
  }
  for (const k of Object.keys(j).filter((k) => k.startsWith('.') && !k.endsWith('…'))) {
    const sym = k.slice(1);
    const v = j[k];
    n.meta.push(Array.isArray(v) ? { t: 'sym', sym, body: v.map(back), meta: [] } : { t: 'sym', sym, value: v, inner: (j[`${k}…`] ?? []).map(back), meta: [] });
  }
  return n;
}
