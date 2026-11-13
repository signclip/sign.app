// select.js — choose from a similar: the n-th, a range, or at random.
//
// Purpose:   :?.1.3 (third) · :?.1.1_3 (first to third) · :?.1~(random 3) (decision 07.11.).
//            A random draw is kept: the chosen files become definitions of the next chain,
//            so the same draw comes back when the chain is opened again.
// Depends:   1-model (crypto, ids, file)
// Test:      tests/share.test.mjs
// Limits:    results are ordered by the similar (similarity, else time) · random uses the
//            platform's secure randomness, never Math.random.

import { draw } from '../1-model/crypto.js';
import { writeId } from '../1-model/ids.js';
import { defLine } from '../1-model/file.js';

/** results: ordered list · part: "3" or "1_3" (counted from 1). */
export function pick(results, part) {
  const [from, to = from] = String(part).split('_').map(Number);
  if (!(from >= 1) || to < from) throw new Error(`not a selection: ${part}`);
  return results.slice(from - 1, to);
}

/** n different results at random. */
export function drawFrom(results, n) {
  return draw(results, n);
}

/**
 * Keep a choice as definitions plus one line, e.g. for the next chain:
 * :v.1!(… hash)~(:?.1)  :v.2!(…)~(:?.1)   {:v.1} {:v.2}
 * chosen: [{ kind, id }] (id with hash) · source: the similar it came from, e.g. "?.1".
 */
export function keepChoice(chosen, source) {
  const count = {};
  const names = chosen.map((c) => `${c.kind}.${(count[c.kind] = (count[c.kind] ?? 0) + 1)}`);
  return {
    defs: chosen.map((c, i) => defLine(names[i], { id: writeId(c.id, c.id.hash), echo: `:${source}` })),
    line: names.map((n) => `{:${n}}`).join(' '),
  };
}
