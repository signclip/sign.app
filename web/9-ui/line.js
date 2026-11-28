// line.js — the line on the screen: takes left and right of the button, older lines below, join and cut (16.11.).
//
// Purpose:   a plain model of what the line shows, so gestures can be tested without a screen. A line is a series:
//            takes made together with the same sticky context. A new line starts when the sticky context changes or
//            after a pause (SERIES_GAP_MS); the line before becomes a small arc under the line. Takes of one line can
//            be joined (squeeze two neighbours together) and cut (spread the button past its widest: cut at the moment
//            in its middle). Files are never rewritten (SCHEMA): join and cut are new line versions in the chain
//            (4-save/add-line.js), this model only says which elements and where.
//              take = { id, ms (length), thumb, context, kinds: ['v', 'a', 'x'], t (start, ms since 1970), parts?, heard? }
//              heard = the words Whisper read from its sound, each with 't(from_to) (26.11., heard.js) – not its context
//              parts = [{ id, from, to }] – what a joined or cut take is made of (references, ms inside each take)
//            A cut divides every strand at the same moment (17.11.): picture and sound by the reference '(from_to),
//            the context by time — a word with its own time 't(from_to) (Whisper, ms inside the take) goes to the
//            side its beginning lies on; a word without a time belongs to the whole take and stays on both sides.
//            The small picture of a take (26.11.): the frame its first part begins with – thumbKey says which file
//            and which moment, so a cut's right half shows the picture at the cut and a join the first take's.
// Depends:   1-model/notation.js (the context's words and their times)
// Test:      tests/ui.test.mjs
// Limits:    64 elements per line (as add-line.js MAX_ELEMENTS); a cut needs ≥ MIN_PART_MS on both sides.

import { parse, write } from '../1-model/notation.js';
import { limit, LIMITS } from '../1-model/limits.js';

export const SERIES_GAP_MS = 10 * 60 * 1000;
export const MAX_IN_LINE = LIMITS.line.value; // the preselection, 64; what counts: limit('line')
export const MIN_PART_MS = 200;

/** An empty set of lines: one open line. */
export const noLines = () => [{ id: 'l0', takes: [], sticky: '' }];

/** Does a take started at time t with this sticky context still belong to the open line? */
export function sameSeries(line, { t, sticky = '' }) {
  const last = line.takes.at(-1);
  if (!last) return true;
  return (line.sticky ?? '') === sticky && t - (last.t + (last.ms ?? 0)) < SERIES_GAP_MS && line.takes.length < limit('line');
}

/** A new take onto the lines: into the open line, or a new line when the series ended. → lines */
export function addTake(lines, take, sticky = '') {
  const open = lines.at(-1);
  if (open && sameSeries(open, { t: take.t, sticky })) return [...lines.slice(0, -1), { ...open, sticky, takes: [...open.takes, take] }];
  return [...lines, { id: `l${lines.length}`, takes: [take], sticky }];
}

/** The parts a take stands for: itself whole, or what it was joined or cut from. */
export const partsOf = (take) => take.parts ?? [{ id: take.id, from: 0, to: take.ms ?? 0, len: take.ms ?? 0 }]; // len: the whole file's length (a part that covers it needs no '( ))

/**
 * Which small picture a take shows (26.11.): the file of its first part and the moment it begins there.
 * → { id (the take chain's path), at (ms inside its file), key (one string for both) }
 */
export function thumbKey(take) {
  const p = partsOf(take)[0] ?? { id: take.id, from: 0 }, at = Math.max(0, Math.round(p.from ?? 0));
  return { id: p.id, at, key: at > 0 ? `${p.id}@${at}` : p.id };
}

/** Where a moment of a take lies: which part, and the ms inside that part's file. ms is held inside the take. → { i, id, at, start } */
export function locate(take, ms) {
  const parts = partsOf(take);
  let start = 0;
  for (let i = 0; i < parts.length; i++) {
    const len = parts[i].to - parts[i].from;
    if (ms < start + len || i === parts.length - 1) return { i, id: parts[i].id, at: parts[i].from + Math.max(0, Math.min(len, ms - start)), start };
    start += len;
  }
  return { i: 0, id: take.id, at: 0, start: 0 };
}

/** The words of a context with their times, for the timeline: [{ text, from, to }] (from null = the whole take). */
const labelOf = (n) => (n.text ?? (n.letters ?? []).join('') ?? '') || write([{ ...n, meta: [] }]).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
export function contextTimes(text) {
  let nodes = [];
  try { nodes = parse(text ?? '').filter((n) => n.t !== 'sym'); } catch { return text ? [{ text: String(text), from: null, to: null }] : []; }
  const label = labelOf;
  return nodes.map((n) => {
    const m = /^(\d+)_(\d+)$/.exec((n.meta ?? []).find((x) => x.sym === "'t")?.value ?? '');
    return { text: label(n), from: m ? Number(m[1]) : null, to: m ? Number(m[2]) : null };
  });
}

/**
 * A context divided at a moment (ms inside the take's file): → [left, right]. A word with its own time goes to the side
 * its beginning lies on; a word without one stays on both. Text that does not parse stays whole on both sides.
 */
export function splitContext(text, ms) {
  if (!text) return ['', ''];
  let nodes;
  try { nodes = parse(text); } catch { return [text, text]; }
  const fromOf = (n) => { const m = /^(\d+)_(\d+)$/.exec((n.meta ?? []).find((x) => x.sym === "'t")?.value ?? ''); return m ? Number(m[1]) : null; };
  const side = (keep) => write(nodes.filter((n) => n.t === 'sym' || keep(fromOf(n)))).trim();
  return [side((t) => t == null || t < ms), side((t) => t == null || t >= ms)];
}

/** Join take i with take i + 1 of line n (squeezed together). → lines (unchanged if there is no neighbour) */
export function joinTakes(lines, n, i) {
  const line = lines[n];
  const a = line?.takes[i], b = line?.takes[i + 1];
  if (!a || !b) return lines;
  const heard = [a.heard, b.heard].filter(Boolean).join(' ') || undefined; // words from the sound: each keeps its time in its own file
  const joined = { ...a, id: `${a.id}+${b.id}`, ms: (a.ms ?? 0) + (b.ms ?? 0), parts: [...partsOf(a), ...partsOf(b)], context: [a.context, b.context].filter(Boolean).join(' '), heard };
  return lines.map((l, j) => (j !== n ? l : { ...l, takes: [...l.takes.slice(0, i), joined, ...l.takes.slice(i + 2)] }));
}

/** Cut take i of line n at ms (inside the take). → lines (unchanged if a side would be shorter than MIN_PART_MS) */
export function cutTake(lines, n, i, ms) {
  const take = lines[n]?.takes[i];
  if (!take || ms < MIN_PART_MS || (take.ms ?? 0) - ms < MIN_PART_MS) return lines;
  const left = [], right = [];
  let at = 0;
  for (const p of partsOf(take)) {
    const len = p.to - p.from;
    if (at + len <= ms) left.push(p);
    else if (at >= ms) right.push(p);
    else { left.push({ ...p, to: p.from + (ms - at) }); right.push({ ...p, from: p.from + (ms - at) }); }
    at += len;
  }
  const where = locate(take, ms); // the context's times count inside the file the cut falls into
  const [before, after] = partsOf(take).length === 1 ? splitContext(take.context, where.at) : [take.context, take.context];
  const [heardBefore, heardAfter] = partsOf(take).length === 1 ? splitContext(take.heard ?? '', where.at) : [take.heard ?? '', take.heard ?? '']; // the words from the sound go to the side they were said on (26.11.)
  const a = { ...take, id: `${take.id}<`, ms, parts: left, context: before, heard: heardBefore || undefined }, b = { ...take, id: `${take.id}>`, ms: take.ms - ms, parts: right, context: after, heard: heardAfter || undefined, thumb: null };
  return lines.map((l, j) => (j !== n ? l : { ...l, takes: [...l.takes.slice(0, i), a, b, ...l.takes.slice(i + 1)] }));
}

/** Take i out of line n (↓ on the button while that line is chosen). */
export function removeTake(lines, n, i) {
  return lines.map((l, j) => (j !== n ? l : { ...l, takes: l.takes.filter((_, x) => x !== i) }));
}

/** Put a take onto line n (↑ on the button while that line is chosen): at its end. */
export function putOnLine(lines, n, take) {
  return lines.map((l, j) => (j !== n || l.takes.length >= limit('line') ? l : { ...l, takes: [...l.takes, take] }));
}

/** Older lines, newest first (they lie as small arcs under the line). */
export const olderLines = (lines) => lines.slice(0, -1).reverse();

/**
 * Where the button stands after a swipe on it. at: 0 … count (count = new take, live). '←' = the next element
 * (towards new), '→' = the one before. → at
 */
export function step(at, count, dir) {
  if (dir === 'left') return Math.min(count, at + 1);
  if (dir === 'right') return Math.max(0, at - 1);
  return at;
}

/**
 * The words written now, onto every take of line n or out of it (20.11., user: line chosen, ← = to every take, ↓ = out
 * of every take that has it). Adding skips a take that has the word already; removing touches only takes that have it.
 * Words compare without case. → lines (the same object when no take changed)
 */
export function withContext(lines, n, words, { without = false } = {}) {
  const line = lines[n], want = new Set(words.map((w) => String(w).toLowerCase()).filter(Boolean));
  if (!line?.takes.length || !want.size) return lines;
  let changed = false;
  const takes = line.takes.map((t) => {
    const has = contextTimes(t.context).map((x) => x.text.toLowerCase());
    if (without) {
      if (!has.some((h) => want.has(h))) return t;
      let nodes;
      try { nodes = parse(t.context ?? ''); } catch { return t; }
      changed = true;
      return { ...t, context: write(nodes.filter((x) => x.t === 'sym' || !want.has(labelOf(x).toLowerCase()))).trim() };
    }
    const add = words.filter((w, i) => w && !has.includes(String(w).toLowerCase()) && words.findIndex((x) => String(x).toLowerCase() === String(w).toLowerCase()) === i);
    if (!add.length) return t;
    changed = true;
    return { ...t, context: [t.context, ...add.map((w) => `(${w})`)].filter(Boolean).join(' ') };
  });
  return changed ? lines.map((l, j) => (j === n ? { ...l, takes } : l)) : lines;
}

/**
 * What a line is about, in a few words (26.11., the fan of lines: a row says what it holds): its sticky context, else
 * the words all its takes share, else the first take's words and "…" when others follow. → text ('' = no words at all)
 */
export function lineLabel(line) {
  const wordsOf = (text) => contextTimes(text).flatMap((x) => x.text.split(/\s+/)).filter(Boolean);
  const sticky = wordsOf(line?.sticky ?? '');
  if (sticky.length) return sticky.join(' ');
  const takes = (line?.takes ?? []).map((t) => wordsOf(t.context));
  if (!takes.length || !takes[0].length) return '';
  const shared = takes[0].filter((w) => takes.every((ws) => ws.some((x) => x.toLowerCase() === w.toLowerCase())));
  if (shared.length) return shared.join(' ');
  return takes[0].join(' ') + (takes.length > 1 ? ' …' : '');
}

/**
 * Jump to a nesting (26.11., user: → far = to the nesting before, ← far on an earlier take = to the next). A nesting
 * on the line = takes one after another that share their prefix (context.js leadOf); a take without one stands alone.
 * dir 'before': the first take of the nesting the take before at belongs to (mid-nesting: its own start) · 'next':
 * the first take after the nesting at belongs to (none = n, ready). leadOf: text → [words] (given, so line.js needs no model).
 * → the new at
 */
export function nestStep(takes, at, dir, leadOf) {
  const n = takes.length, key = (i) => (leadOf(takes[i]?.context ?? '') ?? []).join(' ');
  const same = (i, j) => i >= 0 && j >= 0 && i < n && j < n && key(i) !== '' && key(i) === key(j);
  if (dir === 'before') {
    let i = Math.min(n, at) - 1;
    if (i < 0) return 0;
    while (same(i - 1, i)) i--;
    return i;
  }
  if (at >= n) return n;
  let i = at;
  while (same(i, i + 1)) i++;
  return Math.min(n, i + 1);
}