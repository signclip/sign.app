// across.js — similar across strands: from what is given to what is asked for. Every direction is the same way.
//
// Purpose:   modeling means finding what belongs together across strands. With the index this is one question in
//            three steps: what is given (words, a vector, or both) → the Takes nearest to it → what is asked of them.
//              text → visual      words → Takes whose context holds them → their :v
//              visual → visual    a vector → the nearest vectors → their Takes → their :v
//              visual → text      a vector → the nearest Takes → the words of their context, each as sure as the
//                                 Takes that hold it are near (a list of the best 5, never one answer)
//            The same for any other pair (audio → text, text → landmarks …): `to` is a strand kind, `from` is words
//            or a vector of any echo. Nothing here knows a model; what a method computed arrives as vectors (vectors.js).
//            Three more questions on the same tables:
//              pairs()        Takes that hold both kinds: what a modeling for this direction learns from and is checked on
//              sameStretch()  the same stretch in other Takes: cuts of one video (vectors of the stretches, in order)
//              someones()     persons whose Takes are near one's own
// Depends:   3-index (Index tables, vectors.js), combine.js, filter.js
// Test:      tests/vectors.test.mjs
// Limits:    across() = one near() (≈ 3–13 ms over 20,000 vectors, ≈ 40 ms over 10⁶) plus Map reads for ≤ 20 × limit Takes ·
//            visual → text can only say words that some Take in the index already holds: with one example per sign the
//            first word is right for about 6 of 10 among 100 signs (INFRASTRUCTURE „Modelle“) — hence the list ·
//            pairs() = one pass over the chains (~2 µs each, 10⁵ Takes ≈ 0.2 s) ·
//            sameStretch() = one near() per stretch: 30 stretches against 10⁶ ≈ 1.2 s; a cut is found from `min`
//            stretches in a row, shorter ones not · someones() = one near() per own Take, at most `sample` (200).
//            All of them see only what this reader may read.

import { idKey } from '../1-model/ids.js';
import { combinedSimilar } from './combine.js';
import { passes } from './filter.js';

const norm = (w) => String(w).normalize('NFC').toLowerCase();
const add = (map, key, value) => (map.get(key) ?? map.set(key, new Set()).get(key)).add(value);
const timeOf = (key) => / (t_[0-9A-Z]+)/.exec(key)?.[1] ?? '';
const uOf = (key) => /(u_[0-9A-Z]+)$/.exec(key)?.[1] ?? null;
const VARIABLES = ['chain', 'sharing-point', '?', '_'];

/** The words of every :x strand: the context table turned round, made once per index. */
const turned = new WeakMap();
function wordsByStrand(index) {
  if (!turned.has(index)) {
    const map = new Map();
    for (const [word, keys] of index.tables.context) for (const key of keys) add(map, key, word);
    turned.set(index, map);
  }
  return turned.get(index);
}

/** The Take a strand or chain belongs to: its lowest chain (the one written when it was taken). */
export function takeOf(index, key) {
  const { chains, weave } = index.tables;
  let chain = chains.get(key) ?? [...(weave.get(key) ?? [])].map((k) => chains.get(k)).filter(Boolean)
    .sort((a, b) => timeOf(a.key).localeCompare(timeOf(b.key)))[0];
  for (let i = 0; chain?.below && chains.has(chain.below) && i < 50; i++) chain = chains.get(chain.below);
  return chain ?? null;
}

/** Every strand of a Take by kind: from its chain and the chains on top of it (echoes, shares). → Map(kind → Set of keys) */
export function strandsOf(index, take) {
  const { chains, weave } = index.tables, seen = new Set([take.key]), byKind = new Map();
  for (const waiting = [take]; waiting.length && seen.size <= 50;) {
    const chain = waiting.shift();
    for (const d of chain.defs.values()) if (d.id && !VARIABLES.includes(d.kind)) add(byKind, d.kind, idKey(d.id));
    for (const k of weave.get(chain.key) ?? []) {
      const above = chains.get(k);
      if (above?.below === chain.key && !seen.has(k)) { seen.add(k); waiting.push(above); }
    }
  }
  return byKind;
}

/** All words in the context of a Take (typed and heard). */
export function wordsOf(index, take) {
  const words = new Set(), byStrand = wordsByStrand(index);
  for (const key of strandsOf(index, take).get('x') ?? []) for (const w of byStrand.get(key) ?? []) words.add(w);
  return words;
}

/**
 * From what is given to what is asked for.
 * from: { words: [..] } and/or { echo, vector } · to: a strand kind ('v', 'x', 'l', 'a' …) ·
 * filters: as in filter.js (persons, sharingPoints, time) · limit: how many answers ·
 * wide: how many Takes are asked for each answer (4 → the 20 nearest decide about 5 words).
 * to = 'x' → [{ word, score, usual, takes }]   score 0 … 1: its share of the nearness of the nearest Takes ·
 *            usual 0 … 1: its share in the whole index · ordered by score − usual (what is special here comes first)
 * else     → [{ key, take, score, by, strands, copies }]   strands: keys of kind `to` · copies: where they lie
 */
export async function across(index, vectors, { from = {}, to = 'v', limit = 5, filters = {}, wide = 4 } = {}) {
  const found = new Map(); // Take → { take, score, by: { words, vector } }
  const raise = (key, score, by) => {
    const take = takeOf(index, key);
    if (!take || !passes(take, filters)) return;
    const f = found.get(take.key) ?? found.set(take.key, { take, score: 0, by: {} }).get(take.key);
    if (score > (f.by[by] ?? 0)) { f.score += score - (f.by[by] ?? 0); f.by[by] = score; } // a Take counts once per way, with its best
  };
  const words = [...new Set((from.words ?? []).map(norm))];
  if (words.length) for (const h of combinedSimilar(index, [{ kind: 'x', words }], { limit: 50 * wide * limit })) raise(h.key, h.score / words.length, 'words');
  if (from.vector) for (const h of await vectors.near(from.echo, from.vector, { limit: 5 * wide * limit })) raise(h.key, Math.max(0, h.score), 'vector');
  const takes = [...found.values()].sort((a, b) => b.score - a.score || timeOf(b.take.key).localeCompare(timeOf(a.take.key)));

  if (to === 'x') {
    const votes = new Map();
    let all = 0;
    for (const f of takes.slice(0, wide * limit)) {
      const mine = wordsOf(index, f.take);
      if (!mine.size) continue;
      const weight = f.score * f.score; // near counts much more than far
      all += weight;
      for (const w of mine) {
        if (words.includes(w)) continue; // what was asked is not an answer
        const v = votes.get(w) ?? votes.set(w, { word: w, score: 0, takes: 0 }).get(w);
        v.score += weight; v.takes += 1;
      }
    }
    // usual: the share of all :x strands that hold the word. A word every Take has (the language, a sticky word)
    // says nothing about this one: the order goes by how much more often than usual it stands near.
    const strands = wordsByStrand(index).size;
    return [...votes.values()].map((v) => ({ ...v, score: all ? v.score / all : 0, usual: strands ? (index.tables.context.get(v.word)?.size ?? 0) / strands : 0 }))
      .sort((a, b) => (b.score - b.usual) - (a.score - a.usual) || b.takes - a.takes || a.word.localeCompare(b.word)).slice(0, limit);
  }

  const out = [];
  for (const f of takes) {
    const strands = [...(strandsOf(index, f.take).get(to) ?? [])];
    if (!strands.length) continue;
    out.push({ key: f.take.key, take: f.take, score: f.score, by: f.by, strands, copies: strands.flatMap((k) => [...(index.tables.sharingPoints.get(uOf(k)) ?? [])]) });
    if (out.length === limit) break;
  }
  return out;
}

/**
 * Takes that hold both kinds, e.g. pairs(index, 'v', 'x', { words: ['DGS'] }): every Take with a picture and
 * words whose context holds DGS — what a modeling visual → text for DGS learns from. filters: as in filter.js.
 * → [{ key, take, from: [keys], to: [keys] }]
 */
export function pairs(index, from, to, { words = [], filters = {} } = {}) {
  const need = words.map(norm), out = [];
  for (const chain of index.tables.chains.values()) {
    if (chain.below && index.tables.chains.has(chain.below)) continue; // every Take once: at its lowest chain
    if (!passes(chain, filters)) continue;
    const strands = strandsOf(index, chain), a = strands.get(from), b = strands.get(to);
    if (!a?.size || !b?.size) continue;
    if (need.length) { const mine = wordsOf(index, chain); if (!need.every((w) => mine.has(w))) continue; }
    out.push({ key: chain.key, take: chain, from: [...a], to: [...b] });
  }
  return out;
}

/**
 * The same stretch in other Takes: cuts of one video. parts: the vectors of the stretches of one Take, in order
 * (stretch 1 first). A hit that keeps its distance over `min` stretches in a row is the same material:
 * → [{ key, from, to, at, length, score }]  stretches from … to of the asked Take lie in `key` from stretch `at` on.
 * each: how many near stretches are looked at per stretch · floor: least likeness · not: the asked Take itself.
 */
export async function sameStretch(vectors, { echo, parts, min = 3, each = 20, floor = 0.8, not = null, limit = 20 } = {}) {
  const lanes = new Map(); // key and distance between the two → [{ i, score }]
  for (let i = 0; i < parts.length; i++) {
    for (const h of await vectors.near(echo, parts[i], { limit: each, floor, not })) {
      if (h.part < 1) continue; // whole-strand vectors are not stretches
      const lane = `${h.key}|${h.part - (i + 1)}`;
      (lanes.get(lane) ?? lanes.set(lane, []).get(lane)).push({ i: i + 1, score: h.score });
    }
  }
  const runs = [];
  for (const [lane, hits] of lanes) {
    const cut = lane.lastIndexOf('|'), key = lane.slice(0, cut), shift = Number(lane.slice(cut + 1));
    hits.sort((a, b) => a.i - b.i);
    for (let start = 0, i = 1; i <= hits.length; i++) {
      if (i < hits.length && hits[i].i === hits[i - 1].i + 1) continue;
      const run = hits.slice(start, i);
      if (run.length >= min) runs.push({ key, from: run[0].i, to: run.at(-1).i, at: run[0].i + shift, length: run.length, score: run.reduce((s, h) => s + h.score, 0) / run.length });
      start = i;
    }
  }
  return runs.sort((a, b) => b.length - a.length || b.score - a.score).slice(0, limit);
}

/**
 * Persons whose Takes are near one's own. own: n_ of the person asking · sample: at most so many own Takes are asked.
 * → [{ n, score, takes }]  score 0 … 1: the share of the asked own Takes that have a near Take of this person.
 */
export async function someones(vectors, { echo, own, sample = 200, each = 10, floor = 0.8, limit = 10 } = {}) {
  const mine = await vectors.of(echo, own, sample), met = new Map(); // n_ → Set of own keys
  for (const row of mine) {
    for (const h of await vectors.near(echo, row.fine, { limit: each, floor })) if (h.n && h.n !== own && h.part === 0) add(met, h.n, row.key);
  }
  return [...met].map(([n, keys]) => ({ n, score: keys.size / mine.length, takes: keys.size }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}
