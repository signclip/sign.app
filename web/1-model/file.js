// file.js — one file form for every text file: head, definitions, rows.
//
// Purpose:   read and write .sign files (SCHEMA.md, decisions 07.11.):
//              head         :art!(id)~(…)@(…)°(…)'t(…)          first line, the file itself
//              definitions  :art.n(label)^(hint)!(id hash)~(…)'(part)   variables, one per line
//              rows         { … } _( ) ^( ){ } ?( ) ( …)        steps, newest on top
//            A line break inside a bracket is a space; outside, it ends a definition or row.
// Depends:   notation.js, symbols.js, ids.js, hash.js
// Test:      tests/model.test.mjs
// Rules:     every element is recorded here _( ) or says where it came from: ~( ) in its
//            definition = "came from" (a method, a source, or both: ~(mediapipe 0.10 :v.1),
//            ~(:chain.1)) · a prefix stands in its own bracket {{:a.1}{{:v.1} {:v.2}}} ·
//            the bottom line may be {:chain.1}: the chain this one builds on.
// Limits:    the whole file is parsed at once; a line file of 1,000 rows (~100 KB) parses in ~10 ms.

import { parse, write } from './notation.js';
import { META, KINDS } from './symbols.js';
import { readId } from './ids.js';
import { storedText } from './hash.js';

export class FileError extends Error {}

const VARIABLE_KINDS = ['chain', '?', '_', 'sharing-point']; // variables, not content: need no origin

/** Split text into logical lines: a line break inside brackets does not end a line. */
function logicalLines(text) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const raw of storedText(text).split('\n')) {
    cur = cur ? `${cur} ${raw.trim()}` : raw.trim();
    for (const ch of raw) depth += '([{'.includes(ch) ? 1 : ')]}'.includes(ch) ? -1 : 0;
    if (depth <= 0 && cur) { out.push(cur); cur = ''; depth = 0; }
  }
  if (cur) throw new FileError('bracket not closed at end of file');
  return out;
}

const metaOf = (node) => Object.fromEntries([...node.meta].reverse().map((x) => [x.sym, x]));

const valueOf = (sym) => (sym ? (sym.value ?? write(sym.body ?? [])) : null);

/** A definition node → { name, kind, n, label, hint, id, echo, part, body }; null if it is no definition. */
function readDef(node) {
  let ref = null;
  let holder = node;
  let body = null;
  if (node.t === 'ref' && node.path.length === 1) ref = node;
  else if (node.t === 'prefix' && node.head.t === 'ref' && node.head.path.length === 1) {
    ref = node.head;
    body = node.body;
    holder = node.body;
  }
  if (!ref) return null;
  const m = metaOf(holder);
  return {
    name: `${ref.kind}.${ref.path[0]}`, kind: ref.kind, n: Number(ref.path[0]),
    label: body?.t === 'value' ? body.text : null,
    body: body && body.t !== 'value' ? body : null,
    hint: valueOf(m['^']), id: m['!'] ? readId(valueOf(m['!'])) : null,
    echo: valueOf(m['~']), where: valueOf(m['°']), part: valueOf(m["'"]) ?? valueOf(m["'t"]), node,
  };
}

/** Read a .sign file. Returns { kind, head, defs, rows }. */
export function readFile(text) {
  const lines = logicalLines(text);
  if (!lines.length) throw new FileError('empty file');
  const [first] = parse(lines[0]);
  if (first?.t !== 'ref' || first.path.length) throw new FileError('first line must be the head, e.g. :chain!(…)');
  const hm = metaOf(first);
  const head = { kind: first.kind, id: hm['!'] ? readId(valueOf(hm['!'])) : null };
  for (const sym of META) if (sym !== '!' && hm[sym]) head[sym] = valueOf(hm[sym]);
  const defs = new Map();
  const rows = [];
  for (const line of lines.slice(1)) {
    const items = parse(line);
    const asDefs = items.map(readDef);
    if (asDefs.every(Boolean)) {
      for (const d of asDefs) {
        if (defs.has(d.name)) throw new FileError(`defined twice: :${d.name}`);
        defs.set(d.name, d);
      }
    } else rows.push(readRow(items, line));
  }
  return { kind: head.kind, head, defs, rows };
}

function readRow(items, text) { // time and person of a step: the 't and @ nearest the end
  const row = { items, text, time: null, person: null };
  for (let n of [...items].reverse()) {
    while (n.t === 'prefix') n = n.body; // meta of a prefixed element sits on its body
    const m = metaOf(n);
    row.time ??= valueOf(m["'t"]);
    row.person ??= valueOf(m['@']);
  }
  return row;
}

/** Head line from parts, meta in the fixed order. */
export function headLine(kind, parts) {
  return `:${kind}` + META.filter((s) => parts[s]).map((s) => `${s}(${parts[s]})`).join('');
}

/** Definition line: :name(label)^(hint)!(id hash)~(echo)'(part). */
export function defLine(name, { label, hint, id, echo, part, body } = {}) {
  return `:${name}` + (label ? `(${label})` : '') + (body ?? '') + (hint ? `^(${hint})` : '') +
    (id ? `!(${id})` : '') + (echo ? `~(${echo})` : '') + (part ? `'(${part})` : '');
}

/** Whole file: head, definitions, rows (newest first). Ends with one line break. */
export function fileText(head, defs = [], rows = []) {
  return storedText([head, ...defs, ...rows].join('\n') + '\n');
}

/** Rules a file must keep. Returns a list of problems (empty = fine). */
export function checkFile(file) {
  const errors = [];
  if (!(file.kind in KINDS)) errors.push(`unknown kind: :${file.kind}`);
  if (!file.head.id) errors.push('head without !( )');
  const seen = new Set();
  const visit = (n, recorded) => {
    if (!n) return;
    if (n.t === 'ref' && n.path.length) {
      const name = `${n.kind}.${n.path[0]}`;
      const def = file.defs.get(name);
      if (!def) errors.push(`not defined: :${name}`);
      else if (!seen.has(name)) {
        seen.add(name);
        if (!recorded && !def.echo && !VARIABLE_KINDS.includes(def.kind)) errors.push(`origin missing: :${name} (use _( ) or ~( ) in its definition)`);
      }
    }
    if (n.t === 'sym' && (n.sym === '_' || n.sym === '?')) recorded = true;
    for (const c of [...(n.items ?? []), ...(Array.isArray(n.body) ? n.body : n.body ? [n.body] : []), ...(n.head ? [n.head] : [])]) visit(c, recorded);
  };
  for (const row of [...file.rows].reverse()) {
    for (const n of row.items) {
      if (n.t === 'prefix') errors.push(`prefix needs its own bracket: ${row.text}`);
      visit(n, false);
    }
  }
  return errors;
}
