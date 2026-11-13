// filter.js — narrow Similar like any other strand: by person, by sharing point, by time, by kind.
//
// Purpose:   Similar is the one way to find (DESIGN: a Take is a similar). Next to words and pictures it takes
//            filters, each one more chip: wer (@ person) · wo (sharing points; of a person = where her
//            files lie or that are hers) · wann ('t range, prefix or from_to) · was (kinds).
//            Without words it lists everything that fits, newest first ("all of Anna from 1.–14.11.").
//            Notation (proposal, SCHEMA after approve): meta on the similar, G5/G7:
//              ?((Kaffee) {:v :x} {:sharing-point.2 :sharing-point.5})@(Anna)'t(2026.11.01_2026.11.14)
// Depends:   3-index (tables), combine.js
// Test:      tests/similar.test.mjs
// Limits:    one pass over the index (~1 µs per entry, 10⁵ entries ≈ 0.1 s); persons by n_ (names
//            are only for reading, G8).

import { combinedSimilar } from './combine.js';

const TIME = "'t";
const personOf = (e) => ({ n: e?.head?.id?.n ?? null, label: e?.head?.['@'] ?? null });

/** 't(2026.11) · 't(2026.11.08) · 't(2026.11.01_2026.11.14) → [from, to] as comparable prefixes. */
export function timeRange(text) {
  if (!text) return null;
  const [from, to = from] = String(text).split('_');
  return [from.trim(), to.trim()];
}
export function inTime(t, range) {
  if (!range) return true;
  if (!t) return false;
  const [from, to] = range;
  return t.slice(0, from.length) >= from && t.slice(0, to.length) <= to;
}

/** Everything the index holds that has a head: :x strands and chains. */
const entries = (index) => [...index.tables.strands.values(), ...index.tables.chains.values()].filter((e) => e.head);

/**
 * What can be chosen: persons, sharing points (with their persons), months. → { persons, sharingPoints, months }
 * persons: [{ n, label, count }] · sharingPoints: [{ name, persons: [n], count }] · months: ['2026.11', …]
 */
export function facets(index) {
  const persons = new Map(), points = new Map(), months = new Set();
  for (const e of entries(index)) {
    const p = personOf(e), where = e.from?.store;
    if (p.n) {
      if (!persons.has(p.n)) persons.set(p.n, { n: p.n, label: p.label, count: 0 });
      persons.get(p.n).count += 1;
    }
    if (where) {
      if (!points.has(where)) points.set(where, { name: where, persons: new Set(), count: 0 });
      const point = points.get(where);
      point.count += 1;
      if (p.n) point.persons.add(p.n);
    }
    if (e.head[TIME]) months.add(e.head[TIME].slice(0, 7));
  }
  return {
    persons: [...persons.values()].sort((a, b) => b.count - a.count),
    sharingPoints: [...points.values()].map((x) => ({ ...x, persons: [...x.persons] })).sort((a, b) => b.count - a.count),
    months: [...months].sort().reverse(),
  };
}

/** The sharing points of a person: where her files lie, and those named as hers (owners: name → n_). */
export function sharingPointsOf(index, n, { owners = {} } = {}) {
  const names = new Set(facets(index).sharingPoints.filter((x) => x.persons.includes(n)).map((x) => x.name));
  for (const [name, owner] of Object.entries(owners)) if (owner === n) names.add(name);
  return [...names];
}

/**
 * Does an entry pass? filters: { persons: [n], sharingPoints: [name], time: [from, to], kinds: ['x'] }
 * (each empty or missing = no limit).
 */
export function passes(e, { persons = [], sharingPoints = [], time = null, kinds = [] } = {}) {
  if (persons.length && !persons.includes(personOf(e).n)) return false;
  if (sharingPoints.length && !sharingPoints.includes(e.from?.store)) return false;
  if (!inTime(e.head?.[TIME], time)) return false;
  if (kinds.length && e.kind && e.kind !== 'chain' && !kinds.includes(e.kind)) return false;
  return true;
}

/**
 * similar with filters. words: [] → everything that passes, newest first; with words → ranked hits
 * that pass. → [{ key, score, entry }]
 */
export function similar(index, { words = [], sources = null, filters = {}, limit = 40 } = {}) {
  if (words.length || sources) {
    return combinedSimilar(index, sources ?? [{ kind: 'x', words }], { limit: 10 * limit })
      .filter((h) => passes(h.strand, filters))
      .slice(0, limit)
      .map((h) => ({ key: h.key, score: h.score, entry: h.strand }));
  }
  return entries(index).filter((e) => passes(e, filters))
    .sort((a, b) => String(b.head[TIME] ?? '').localeCompare(String(a.head[TIME] ?? '')))
    .slice(0, limit).map((e) => ({ key: e.key, score: 0, entry: e }));
}
