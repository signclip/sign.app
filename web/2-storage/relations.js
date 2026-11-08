// relations.js — one sentence form for everything between sharing points (decision 08.11., 20.13–20.21):
//
//   {what} {from} {to} (marks)'t(…)        read left to right
//     what   strands with a number (:v.1 :x.1) = these, once · kinds without (:v :x) = every one, a rule
//     from   optional; missing = the sharing point this chain belongs to
//     to     the sharing point, a reference {:sharing-point.n}; its definition holds ^(full path)
//     marks  show · read · backup · consent · quiet (ends a rule)
//   {:v.1 :x.1} {:sharing-point.1}                         share this take to 1
//   {:v :a :x} {:sharing-point.1}                          every new take always to 1
//   {:x :l} {:sharing-point.1} {:sharing-point.3}          always copy text + landmarks from 1 to 3
//   {:x :l} {:sharing-point.1} {:sharing-point.5} (read)   give them read-only from 1 to 5
//   {:sharing-point.2} (show) (read)                       bring 2 in, show it, read only
//   {:x :l} {:sharing-point.9} (consent)                   may be processed at 9 (atlas)
// Depends:   nothing
// Test:      tests/connect.test.mjs
// Limits:    one line ≈ 40–90 B; marks are words, a new mark is an addition, nothing changes meaning.

export const MARKS = ['show', 'read', 'backup', 'consent', 'quiet'];
const SP = /^:sharing-point\.(\d+)$/;

/** { what: ['v', 'x'] | ['v.1'], from: n|null, to: n|null, marks: [], time } → line text. */
export function relationLine({ what = [], from = null, to = null, marks = [], time = null }) {
  for (const m of marks) if (!MARKS.includes(m)) throw new Error(`unknown mark: ${m}`);
  const parts = [];
  if (what.length) parts.push(`{${what.map((k) => `:${k}`).join(' ')}}`);
  for (const n of [from, to]) if (n != null) parts.push(`{:sharing-point.${n}}`);
  for (const m of marks) parts.push(`(${m})`);
  return parts.join(' ') + (time ? `'t(${time})` : '');
}

/** Line text → { what, from, to, marks, time } or null if it is no relation line. */
export function readRelation(text) {
  const time = /'t\(([^()]*)\)\s*$/.exec(text)?.[1] ?? null;
  const body = text.replace(/'t\([^()]*\)\s*$/, '').trim();
  const tokens = body.match(/\{[^{}]*\}|\([^()]*\)/g) ?? [];
  if (tokens.join(' ') !== body) return null;
  const what = [], via = [], marks = [];
  for (const t of tokens) {
    if (t.startsWith('(')) { const m = t.slice(1, -1); if (!MARKS.includes(m)) return null; marks.push(m); continue; }
    const refs = t.slice(1, -1).split(' ').filter(Boolean);
    const sp = refs.length === 1 && SP.exec(refs[0]);
    if (sp) via.push(Number(sp[1]));
    else if (refs.every((r) => /^:[a-z]+(\.\d+)?$/.test(r)) && !via.length) what.push(...refs.map((r) => r.slice(1)));
    else return null;
  }
  if (!via.length) return null;
  return { what, from: via.length === 2 ? via[0] : null, to: via.at(-1), marks, time };
}
