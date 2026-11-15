// tally.js — what the index adds up to, for the emergency sheet (14.11.): counts, hours, words, rooms, weeks.
//
// Purpose:   one pass over the index tables → plain numbers the sheet draws (never stored, rebuilt each time):
//              takes      lines "recorded here" _( ) in all chains, with their strands and length ('t … 0_ms)
//              hours      sum of take lengths: all · with picture (v) · with sound (a)
//              strands    count per kind (v a x l m) · echo = strands with ~( ) · versions = chains on a chain
//              words      how many different context words
//              weeks      takes per week, the last 26 weeks, oldest first
//              rooms     ° (room or town) of the take chains, else the o_ cell; people = @ of the chains
//              files      files per sharing point (store name of the index), also per kind (v a x l m chain)
//              list       every take { ms, at, kinds, words } for the context cluster (3-index/clusters.js) ·
//              tables     size of each index table
// Depends:   3-index/index.js (the Index it reads), 1-model/ids.js (idKey)
// Test:      tests/model.test.mjs (emergency sheet)
// Limits:    one pass, ~1 µs per file → 10⁵ takes ≈ 0.1–0.3 s · a take without length counts 0 s · list: ≤ 200,000 takes (~60 B each in memory).

import { idKey } from '../1-model/ids.js';

const DAY = 86_400_000, WEEK = 7 * DAY;
const KINDS = ['v', 'a', 'x', 'l', 'm'];

/** "2026.11.14 12.30.05 0_4200" → { at: ms, ms: 4200 } (local time, as the app writes it), or null. */
export function readTime(label) {
  const m = /^(\d{4})\.(\d\d)\.(\d\d)(?: (\d\d)\.(\d\d)\.(\d\d))?(?: 0_(\d+))?/.exec(String(label ?? ''));
  if (!m) return null;
  const [, y, mo, d, h = 0, mi = 0, s = 0, len = 0] = m;
  return { at: new Date(+y, mo - 1, +d, +h, +mi, +s).getTime(), ms: Number(len) };
}

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
const top = (map, n) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

/** index → the numbers of the sheet. now: ms (for weeks). */
export function tally(index, { now = Date.now() } = {}) {
  const t = index.tables;
  const out = { takes: 0, hours: { all: 0, v: 0, a: 0 }, strands: Object.fromEntries(KINDS.map((k) => [k, 0])), echo: 0, versions: 0,
    chains: t.chains.size, waiting: t.takes.size, similar: t.similar.size, words: 0,
    weeks: new Array(26).fill(0), rooms: [], people: [], files: [], kinds: {}, list: [], tables: {}, first: null, last: null };
  const rooms = new Map(), people = new Map(), wordsOfStrand = new Map();
  for (const [w, set] of t.context) for (const key of set) (wordsOfStrand.get(key) ?? wordsOfStrand.set(key, []).get(key)).push(w);

  for (const c of t.chains.values()) {
    if (c.below) out.versions += 1;
    for (const d of c.defs.values()) if (d.echo && KINDS.includes(d.kind)) out.echo += 1;
    for (const row of c.lines) {
      const took = /(^|[^{:\w])_\(/.test(row.text); // recorded here, not a waiting {:_.1}
      if (!took) continue;
      out.takes += 1;
      const used = [...row.text.matchAll(/:([a-z]+\.\d+)/g)].map((m) => c.defs.get(m[1])).filter(Boolean);
      const kinds = new Set(used.map((d) => d.kind));
      const time = readTime(row.time ?? c.head["'t"]);
      const h = (time?.ms ?? 0) / 3_600_000;
      out.hours.all += h;
      if (kinds.has('v')) out.hours.v += h;
      if (kinds.has('a')) out.hours.a += h;
      if (out.list.length < 200_000) {
        const words = used.filter((d) => d.kind === 'x' && d.id).flatMap((d) => wordsOfStrand.get(idKey(d.id)) ?? []);
        out.list.push({ ms: time?.ms ?? 0, at: time?.at ?? null, kinds: [...kinds].filter((k) => KINDS.includes(k)), words: [...new Set(words)] });
      }
      if (time) {
        out.first = Math.min(out.first ?? time.at, time.at);
        out.last = Math.max(out.last ?? time.at, time.at);
        const back = Math.floor((now - time.at) / WEEK);
        if (back >= 0 && back < 26) out.weeks[25 - back] += 1;
      }
      const room = c.head['°'] ?? (c.head.id?.o ? c.head.id.o : null);
      if (room) bump(rooms, room);
      if (c.head['@']) bump(people, c.head['@']);
    }
  }
  for (const s of t.strands.values()) if (s.kind in out.strands) out.strands[s.kind] += 1;

  out.words = t.context.size;
  out.rooms = top(rooms, 12);
  out.people = top(people, 12);
  const files = new Map();
  for (const paths of t.sharingPoints.values()) for (const p of paths) {
    const store = p.slice(0, p.indexOf(':')), kind = /\.chain\.sign$/.test(p) ? 'chain' : /\.([vaxlm])\.(mp4|png|wav|sign|parquet)$/.exec(p)?.[1];
    bump(files, store);
    if (kind) { const k = (out.kinds[store] ??= { v: 0, a: 0, x: 0, l: 0, m: 0, chain: 0 }); k[kind] += 1; }
  }
  out.files = top(files, 40);
  out.tables = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.size]));
  return out;
}
