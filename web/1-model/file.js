// file.js — one file form for every text file: head, definitions, rows.
//
// Purpose:   read and write .sign files (SCHEMA.md, decisions 07.11.):
//              head         :art~(…)!(id)@(…)°(…)'t(…)          first line, the file itself
//              definitions  :art.n(…)^(name)=(full path)~(…)!(id hash)@(person)'(part), one per line (~ before !: 26.11.)
//              rows         { … } _( ) ^( ){ } ?( ) ( …)        steps, newest on top
//            A line break inside a bracket is a space; outside, it ends a definition or row.
// Depends:   notation.js, symbols.js, ids.js, hash.js
// Test:      tests/model.test.mjs
// Rules:     every element is recorded here _( ) or says where it came from: ~( ) in its
//            definition = "came from" (a method, a source, or both: ~(mediapipe 0.10 :v.1),
//            ~(:chain.1)) · a prefix stands in its own bracket {{:a.1}{{:v.1} {:v.2}}} ·
//            the bottom line may be {:chain.1}: the chain this one builds on · a computed strand carries ~ before
//            its letter (G10, checkFile): computed here (a method in ~( )) → :~x.1~(whisper … :a.1); a kind that
//            exists only computed always: :~w :~l :~m; a reference only (~(:chain.1)) keeps the spelling of its strand.
// Limits:    the whole file is parsed at once; a line file of 1,000 rows (~100 KB) parses in ~10 ms.

import { parse, write } from './notation.js';
import { META, KINDS, artOf } from './symbols.js';
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

/** A definition node → { name, kind, n, label, hint, id, echo, part, time, body }; null if it is no definition. */
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
    name: `${ref.art}.${ref.path[0]}`, kind: ref.kind, art: ref.art, n: Number(ref.path[0]), // :~w.1 → name ~w.1, kind w (G10)
    label: body?.t === 'value' ? body.text : null,
    body: body && body.t !== 'value' ? body : null,
    hint: valueOf(m['^']), path: valueOf(m['=']), id: m['!'] ? readId(valueOf(m['!'])) : null,
    echo: valueOf(m['~']), person: valueOf(m['@']), where: valueOf(m['°']), part: valueOf(m["'"]) ?? valueOf(m["'t"]), time: valueOf(m["'t"]), node,
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
  return { kind: head.kind, art: first.art, head, defs, rows };
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

/** Head line from parts, meta in the fixed order. kind 'x' or art '~x'; a kind that exists only computed is written :~l (G10). */
export function headLine(kind, parts) {
  return `:${kind.startsWith('~') ? kind : artOf(kind)}` + META.filter((s) => parts[s]).map((s) => `${s}(${parts[s]})`).join('');
}

/** Definition line: :name(label)^(name of a sharing point)=(its full path)~(echo)!(id hash)@(person)'(part) – the order of META. */
export function defLine(name, { label, hint, path, id, echo, person, part, body } = {}) {
  return `:${name}` + (label ? `(${label})` : '') + (body ?? '') + (hint ? `^(${hint})` : '') + (path ? `=(${path})` : '') +
    (echo ? `~(${echo})` : '') + (id ? `!(${id})` : '') + (person ? `@(${person})` : '') + (part ? `'(${part})` : '');
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
  // G10: ~ before the letter = computed. Always for kinds that exist only computed; a method in ~( ) = computed here,
  // so written with ~; a ~ needs its ~( ). A rule names kinds ({:x :~l}): there the spelling of the kind, never :~x.
  const method = (echo) => (echo ?? '').split(' ').some((w) => w && !w.startsWith(':'));
  const spelling = (kind, art, echo, named) => {
    if (!(kind in KINDS) || !art) return;
    const tilde = art.startsWith('~');
    if (KINDS[kind].computed && !tilde) errors.push(`spelling: :${art} → :~${kind}`);
    else if (named && tilde && !echo) errors.push(`spelling: :${art} without ~( )`);
    else if (named && !tilde && method(echo)) errors.push(`spelling: :${art} → :~${kind} (computed)`);
  };
  spelling(file.kind, file.art, file.head['~'], true);
  for (const d of file.defs.values()) spelling(d.kind, d.art, d.echo, true);
  const seen = new Set();
  const visit = (n, recorded) => {
    if (!n) return;
    if (n.t === 'ref' && n.path.length) spelling(n.kind, n.art, null, false);
    if (n.t === 'ref' && !n.path.length && n.kind in KINDS && n.art !== artOf(n.kind)) errors.push(`spelling: :${n.art} → :${artOf(n.kind)}`);
    if (n.t === 'ref' && n.path.length) {
      const name = `${n.art}.${n.path[0]}`;
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
