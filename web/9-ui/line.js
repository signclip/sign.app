// line.js — the line on the screen: takes left and right of the button, older lines below, join and cut (16.11.).
//
// Purpose:   a plain model of what the line shows, so gestures can be tested without a screen. A line is a series:
//            takes made together with the same sticky context. A new line starts when the sticky context changes or
//            after a pause (SERIES_GAP_MS); the line before becomes a small arc under the line. Takes of one line can
//            be joined (squeeze two neighbours together) and cut (spread the button past its widest: cut at the moment
//            in its middle). Files are never rewritten (SCHEMA): join and cut are new line versions in the chain
//            (4-save/add-line.js), this model only says which elements and where.
//              take = { id, ms (length), thumb, context, kinds: ['v', 'a', 'x'], t (start, ms since 1970), parts? }
//              parts = [{ id, from, to }] – what a joined or cut take is made of (references, ms inside each take)
//            A cut divides every strand at the same moment (17.11.): picture and sound by the reference '(from_to),
//            the context by time — a word with its own time 't(from_to) (Whisper, ms inside the take) goes to the
//            side its beginning lies on; a word without a time belongs to the whole take and stays on both sides.
// Depends:   1-model/notation.js (the context's words and their times)
// Test:      tests/ui.test.mjs
// Limits:    64 elements per line (as add-line.js MAX_ELEMENTS); a cut needs ≥ MIN_PART_MS on both sides.

import { parse, write } from '../1-model/notation.js';

export const SERIES_GAP_MS = 10 * 60 * 1000;
export const MAX_IN_LINE = 64;
export const MIN_PART_MS = 200;

/** An empty set of lines: one open line. */
export const noLines = () => [{ id: 'l0', takes: [], sticky: '' }];

/** Does a take started at time t with this sticky context still belong to the open line? */
export function sameSeries(line, { t, sticky = '' }) {
  const last = line.takes.at(-1);
  if (!last) return true;
  return (line.sticky ?? '') === sticky && t - (last.t + (last.ms ?? 0)) < SERIES_GAP_MS && line.takes.length < MAX_IN_LINE;
}

/** A new take onto the lines: into the open line, or a new line when the series ended. → lines */
export function addTake(lines, take, sticky = '') {
  const open = lines.at(-1);
  if (open && sameSeries(open, { t: take.t, sticky })) return [...lines.slice(0, -1), { ...open, sticky, takes: [...open.takes, take] }];
  return [...lines, { id: `l${lines.length}`, takes: [take], sticky }];
}

/** The parts a take stands for: itself whole, or what it was joined or cut from. */
export const partsOf = (take) => take.parts ?? [{ id: take.id, from: 0, to: take.ms ?? 0, len: take.ms ?? 0 }]; // len: the whole file's length (a part that covers it needs no '( ))

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
export function contextTimes(text) {
  let nodes = [];
  try { nodes = parse(text ?? '').filter((n) => n.t !== 'sym'); } catch { return text ? [{ text: String(text), from: null, to: null }] : []; }
  const label = (n) => (n.text ?? (n.letters ?? []).join('') ?? '') || write([{ ...n, meta: [] }]).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
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
  const joined = { ...a, id: `${a.id}+${b.id}`, ms: (a.ms ?? 0) + (b.ms ?? 0), parts: [...partsOf(a), ...partsOf(b)], context: [a.context, b.context].filter(Boolean).join(' ') };
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
  const a = { ...take, id: `${take.id}<`, ms, parts: left, context: before }, b = { ...take, id: `${take.id}>`, ms: take.ms - ms, parts: right, context: after, thumb: null };
  return lines.map((l, j) => (j !== n ? l : { ...l, takes: [...l.takes.slice(0, i), a, b, ...l.takes.slice(i + 1)] }));
}

/** Take i out of line n (↓ on the button while that line is chosen). */
export function removeTake(lines, n, i) {
  return lines.map((l, j) => (j !== n ? l : { ...l, takes: l.takes.filter((_, x) => x !== i) }));
}

/** Put a take onto line n (↑ on the button while that line is chosen): at its end. */
export function putOnLine(lines, n, take) {
  return lines.map((l, j) => (j !== n || l.takes.length >= MAX_IN_LINE ? l : { ...l, takes: [...l.takes, take] }));
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
