// combine.js — combined Similar: words from several strands at once (typed text, Whisper text of the
// audio, later landmarks) → takes ranked by how much they share. context first; visual in wave 2.
//
// Purpose:   sources: [{ kind, words, weight }] e.g. typed text weight 1, live Whisper weight 0.7.
//            Score of a text strand = sum of the weights of the distinct query words it contains.
//            Live: call again with every new word; it is a lookup, not a scan.
// Depends:   3-index (Index tables)
// Test:      tests/ui.test.mjs
// Limits:    one call = one Map read per word (~1 µs); 10⁵ strands with 20 words each fit in memory.
// EXTEND(S6, vectors): a landmark source adds visual nearness as one more weighted source.

const norm = (w) => String(w).normalize('NFC').toLowerCase();

/** → [{ key, score, strand }] best first; ties: newer first. */
export function combinedSimilar(index, sources, { limit = 20 } = {}) {
  const scores = new Map();
  for (const { words = [], weight = 1 } of sources) {
    for (const w of new Set(words.map(norm))) {
      for (const key of index.tables.context.get(w) ?? []) scores.set(key, (scores.get(key) ?? 0) + weight);
    }
  }
  const time = (s) => s?.head?.["'t"] ?? '';
  return [...scores].map(([key, score]) => ({ key, score, strand: index.tables.strands.get(key) }))
    .sort((a, b) => b.score - a.score || time(b.strand).localeCompare(time(a.strand)))
    .slice(0, limit);
}
