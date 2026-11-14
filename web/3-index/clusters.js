// clusters.js — context words into clusters, every take into one of them (for the emergency sheet, 14.11.).
//
// Purpose:   words that stand in one take are neighbours; label propagation (each word takes the label most of
//            its neighbours carry, 12 rounds, most used words first, ties → the smaller label) gives clusters
//            without choosing their number beforehand. Bridges first: a word whose neighbours are more than 15 % of
//            all words ("ich" in every fifth take) would pull everything into one cluster; it stays out and is named.
//            Each take goes to the cluster of its most used word.
//            How clearly they part: inside = share of all pairs that stay in their cluster; per cluster the same
//            (cohesion); links = pairs between two clusters (drawn as lines).
//            The biggest clusters stay (named after their 3 most used words); the rest is "übrige".
//            Computed each time, never stored: the clusters are a view, like the index (SCHEMA: Klassen =
//            context-Clusterung).
// Depends:   nothing (plain lists from 3-index/tally.js: list [{ ms, kinds, words }], chips by count)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    20,000 words × 40,000 takes ≈ 0.3–0.6 s (≤ 8 words of a take make pairs: ≤ 28 pairs a take) ·
//            ≤ 24 clusters named, the rest in one · ≤ 60 links between clusters · dots: ≤ 8,000 takes drawn, above that every k-th
//            (then 1 dot ≈ k takes).

const MAX_WORDS = 8, ROUNDS = 12;

/** list: takes [{ ms, kinds, words }] → { groups: [{ name, words, chips, takes, ms, dots }], rest, step, total }. */
export function clusters(list, { keep = 24, dots = 8000 } = {}) {
  const freq = new Map();
  for (const t of list) for (const w of t.words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const words = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a) || a.localeCompare(b));
  const id = new Map(words.map((w, i) => [w, i]));
  const near = words.map(() => new Map());
  for (const t of list) {
    const ws = t.words.map((w) => id.get(w)).sort((a, b) => a - b).slice(0, MAX_WORDS);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      near[ws[i]].set(ws[j], (near[ws[i]].get(ws[j]) ?? 0) + 1);
      near[ws[j]].set(ws[i], (near[ws[j]].get(ws[i]) ?? 0) + 1);
    }
  }
  // bridges (decided before the clusters): a word whose neighbours are a large part of all words (> 15 %) joins
  // everything — it belongs to no cluster, does not vote and does not decide where a take goes
  const hub = new Set(words.map((_, i) => i).filter((i) => near[i].size > Math.max(5, words.length * 0.15)));
  const label = words.map((_, i) => i);
  for (let round = 0; round < ROUNDS; round++) {
    let moved = 0;
    for (let i = 0; i < words.length; i++) {
      if (!near[i].size || hub.has(i)) continue;
      const votes = new Map();
      for (const [j, n] of near[i]) if (!hub.has(j)) votes.set(label[j], (votes.get(label[j]) ?? 0) + n);
      let best = label[i], most = votes.get(best) ?? 0;
      for (const [l, n] of votes) if (n > most || (n === most && l < best)) { best = l; most = n; }
      if (best !== label[i]) { label[i] = best; moved += 1; }
    }
    if (!moved) break;
  }
  const byLabel = new Map();
  words.forEach((w, i) => { if (hub.has(i)) return; const g = byLabel.get(label[i]) ?? byLabel.set(label[i], { words: [], takes: [] }).get(label[i]); g.words.push(w); });
  for (const t of list) {
    const own = t.words.filter((w) => !hub.has(id.get(w)));
    const first = own.reduce((a, w) => (a == null || id.get(w) < id.get(a) ? w : a), null); // its most used word that is no bridge
    if (first != null) byLabel.get(label[id.get(first)]).takes.push(t);
  }
  const all = [...byLabel.values()].filter((g) => g.words.length > 1 && g.takes.length).sort((a, b) => b.takes.length - a.takes.length);
  const named = all.slice(0, keep);
  const restTakes = [...all.slice(keep), ...[...byLabel.values()].filter((g) => g.words.length <= 1)].flatMap((g) => g.takes);
  const restWords = words.length - hub.size - named.reduce((a, g) => a + g.words.length, 0);
  const total = list.filter((t) => t.words.length).length, step = Math.max(1, Math.ceil(total / dots));
  // how clearly the clusters part: pairs inside a cluster against pairs between clusters (rest = one more)
  const at = new Map();
  named.forEach((g, gi) => { for (const w of g.words) at.set(w, gi); });
  const R = named.length, inside = new Array(R + 1).fill(0), across = new Array(R + 1).fill(0), links = new Map();
  near.forEach((m, i) => { for (const [j, n] of m) {
    if (j < i || hub.has(i) || hub.has(j)) continue;
    const a = at.get(words[i]) ?? R, b = at.get(words[j]) ?? R;
    if (a === b) inside[a] += n; else { across[a] += n; across[b] += n; const k = a < b ? `${a} ${b}` : `${b} ${a}`; links.set(k, (links.get(k) ?? 0) + n); }
  } });
  const all2 = inside.reduce((x, y) => x + y, 0) + across.reduce((x, y) => x + y, 0) / 2;
  const pick = (takes) => takes.filter((_, i) => i % step === 0).map((t) => ({ ms: t.ms, kinds: t.kinds })).sort((a, b) => b.ms - a.ms);
  const shape = (g, name) => ({ name, words: g.words.slice(0, 3), chips: g.words.length, takes: g.takes.length, ms: g.takes.reduce((a, t) => a + t.ms, 0), dots: pick(g.takes) });
  const cohesion = (i) => (inside[i] + across[i] ? inside[i] / (inside[i] + across[i]) : 1);
  return {
    groups: named.map((g, i) => ({ ...shape(g, g.words.slice(0, 3).join(' · ')), cohesion: cohesion(i) })),
    rest: restTakes.length ? { ...shape({ words: [], takes: restTakes }, 'übrige'), chips: restWords, cohesion: cohesion(R) } : null,
    links: [...links].map(([k, n]) => [...k.split(' ').map(Number), n]).sort((a, b) => b[2] - a[2]).slice(0, 60),
    bridges: [...hub].map((i) => words[i]),
    inside: all2 ? inside.reduce((x, y) => x + y, 0) / all2 : 1,
    restWords, words: words.length, total, step,
  };
}
