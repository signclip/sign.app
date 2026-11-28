// similar-view.js — Similar on the screen (16.11.): how near it is, what it filters by, where its tiles lie.
//
// Purpose:   zoom is the only way in and out (no swipe, no drag):
//              closed ──spread above the take──▶ many ──spread again──▶ full (the take fades, only the cloud)
//              many ──tap one──▶ single (that one large beside the take, its strands shown) ──squeeze──▶ many
//              full ──squeeze──▶ many ──squeeze──▶ closed
//            What Similar matches is what the take window holds now (its strands, the take chosen or running): first
//            context, later audio and visual. The filters are "selection views", all of the same kind, shown pale until
//            tapped: the strands v · x · a, and the metadata date (right edge), initial letter (left edge), @ name,
//            sharing point (the button's sign) and spot where it was taken (o_). Each lies at one edge of the cloud
//            (cloudParts, 26.11.): letters left, date right, spot at the top, who at the bottom; the one arrow at the
//            head of its rail turns its order. The chips of a take are equal, on one level: an initial filter
//            matches a take if any of its chips starts with it.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    ≤ MANY tiles in the cloud (the rest by scrolling); initials A–Z plus Ä Ö Ü and digits (# = digits).

export const LEVELS = ['closed', 'many', 'single', 'full'];
export const MANY = 40;
import { inArea } from './spot-map.js';

export const FILTERS = ['v', 'x', 'a', 'date', 'initial', 'sharing', 'spot']; // who = sharing (27.11.): persons are sharing points
export const ORDERED = ['date', 'initial', 'who', 'spot']; // each view has its arrow (22.11., user: sorting direction everywhere)

export const noFilters = () => ({ on: { x: true }, value: {}, open: null, order: { date: 'new', initial: 'az' }, group: null, earlier: null }); // group: zoomed in a zone (similar-zoom.js) · earlier: 'x' | 'v' | 'a' – one's own takes with that strand, newest first (27.11.)
/** How many of one's own takes the cloud looks through when it shows the earlier ones of a strand (27.11.): the newest 400. */
export const EARLIER_MAX = 400;

/** The next level after a pinch: scale > 1 = spread, < 1 = squeeze. */
export function zoomed(level, scale) {
  const out = scale > 1.12, inn = scale < 0.88;
  if (out) return level === 'closed' ? 'many' : level === 'many' ? 'full' : level;
  if (inn) return level === 'full' ? 'many' : level === 'single' ? 'many' : level === 'many' ? 'closed' : level;
  return level;
}

/** Tap a filter: on/off; a metadata filter opens its selection while on. */
export function tapFilter(f, name) {
  const on = { ...f.on, [name]: !f.on[name] };
  const open = ['v', 'x', 'a'].includes(name) ? f.open : on[name] ? name : f.open === name ? null : f.open;
  return { ...f, on, open };
}

/** Hold an ordered filter: its order turns. */
export function turnOrder(f, name) {
  if (!ORDERED.includes(name)) return f;
  const order = { ...f.order, [name]: name === 'date' ? (f.order.date === 'new' ? 'old' : 'new') : ((f.order[name] ?? 'az') === 'az' ? 'za' : 'az') };
  return { ...f, order };
}

/** Set the value of a metadata filter (date range [from, to] ms, initials ['A'], names ['Lena'], sharing ['q_…'], spots). */
export const setFilter = (f, name, value) => ({ ...f, value: { ...f.value, [name]: value } });

/** The initial of a word as the filter sees it (digits = '#'). */
export const initialOf = (word) => { const c = String(word ?? '').trim().charAt(0).toLocaleUpperCase('de'); return /\d/.test(c) ? '#' : c; };

/**
 * Does an entry pass the metadata filters? entry: { words: [], t, person, sharing: [], spot }.
 * Filters that are off or have no value let everything through.
 */
export function passes(entry, f) {
  const v = f.value;
  if (f.on.date && v.date && (entry.t < v.date[0] || entry.t > v.date[1])) return false;
  if (f.on.initial && v.initial?.length && !(entry.words ?? []).flatMap((w) => String(w).split(/\s+/)).some((w) => v.initial.some((key) => (key === '#' ? /^\d/.test(w) : w.toLocaleUpperCase('de').startsWith(String(key).toLocaleUpperCase('de')))))) return false; // a letter or the first two (the rail's step, 26.11.), any word of the take
  // who and sharing point are one (27.11., user): a person is a sharing point too. Chosen = takes made by a chosen
  // person, or lying at a chosen sharing point, or made by one of its persons (a group tapped = all of it, abstract);
  // an older choice by name alone counts the same
  const by = [...(v.sharing ?? []), ...(f.on.name ? v.name ?? [] : [])];
  if ((f.on.sharing || f.on.name) && by.length && !by.some((x) => x === entry.person || (entry.sharing ?? []).includes(x) || (v.members?.[x] ?? []).includes(entry.person))) return false;
  if (f.on.spot && v.spot?.length && !v.spot.some((x) => inArea(entry.spot, x))) return false; // a region chosen on the map holds its cells (22.11.)
  return true;
}

/** Px at k = 1: the row of the four respects at the top (quick), the gap at the other edges (side) and how much of its edge each open rail takes. */
export const RAIL = Object.freeze({ quick: 34, side: 8, initial: 40, date: 36, who: 64, spotShare: 0.42, spotMin: 110, tilesMin: 96 });

/**
 * Where Similar's parts lie. At the top one row with the four respects (27.11., user: "Metadaten-Auswahl als
 * Kurzeinstellung, schön oben"): what is chosen can be read there, a tap opens a respect's rail, a hold its view
 * over everything. Letters lie at its left end, the date at its right end (user, the same day): their rails unfold
 * right under them, the arrow of the order at the rail's head; spot and who in the middle. Before, four pale grips lay at the four edges and took a gutter of 34 px on every side; now the
 * tiles reach to 8 px from the other three edges (phone upright: 52 px wider, 26 px higher). The open respect still
 * takes its own edge as a rail (26.11.: letters left, date right, spot at the top, who at the bottom) – bars, a band
 * for the map, a strip – and the tiles keep away from it, so nothing lies over them.
 * box: Similar's box · open: 'initial' | 'date' | 'spot' | 'who' | null
 * → { inner (the tiles), rail ({ x, y, w, h } or null), quick ({ x, y, w, h }: the row) }
 */
export function cloudParts(box, open = null, k = 1) {
  const q = RAIL.quick * k, g = RAIL.side * k, pad = 6 * k;
  const quick = { x: box.x + 6 * k, y: box.y + 3 * k, w: box.w - 12 * k, h: q - 6 * k }; // 28 px high, 3 px above and below; letters at its left end, the date at its right end (27.11.)
  const inner = { x: box.x + g, y: box.y + q, w: box.w - 2 * g, h: box.h - q - g };
  let rail = null;
  if (open === 'initial') { rail = { x: box.x + 4 * k, y: box.y + q - 2 * k, w: RAIL.initial * k, h: box.h - q - 2 * k }; inner.x = rail.x + rail.w + pad; inner.w = box.x + box.w - g - inner.x; }
  if (open === 'date') { rail = { x: box.x + box.w - (RAIL.date + 4) * k, y: box.y + q - 2 * k, w: RAIL.date * k, h: box.h - q - 2 * k }; inner.w = rail.x - pad - inner.x; }
  if (open === 'spot') { // the map: 42 % of the cloud, at least 110 px, but the tiles keep 96 px
    const h = Math.max(Math.min(RAIL.spotMin * k, box.h * 0.6), Math.min(box.h * RAIL.spotShare, box.h - q - g - RAIL.tilesMin * k));
    rail = { x: box.x + 4 * k, y: box.y + q, w: box.w - 8 * k, h }; // under the row
    inner.y = rail.y + rail.h + pad; inner.h = box.y + box.h - g - inner.y;
  }
  if (open === 'who') { rail = { x: box.x + 4 * k, y: box.y + box.h - RAIL.who * k, w: box.w - 8 * k, h: RAIL.who * k }; inner.h = rail.y - pad - inner.y; }
  inner.w = Math.max(40 * k, inner.w); inner.h = Math.max(40 * k, inner.h);
  return { inner, rail, quick };
}

/** Order entries by the filter that is on (date first, then initial); otherwise as found (best match first). */
export function ordered(entries, f) {
  const out = [...entries];
  if (f.on.date) out.sort((a, b) => (f.order.date === 'new' ? b.t - a.t : a.t - b.t));
  else if (f.on.initial) out.sort((a, b) => { const x = (a.words?.[0] ?? '').localeCompare(b.words?.[0] ?? '', 'de'); return f.order.initial === 'az' ? x : -x; });
  return out;
}

/** The initials present in a set of entries (for the left edge), in order. */
export function initialsOf(entries, order = 'az') {
  const set = new Set(entries.flatMap((e) => (e.words ?? []).map(initialOf)).filter(Boolean));
  const out = [...set].sort((a, b) => a.localeCompare(b, 'de'));
  return order === 'az' ? out : out.reverse();
}

/** Group entries by person (the admin's piles: a hello is one line per person). → [{ person, entries }] */
export function byPerson(entries) {
  const m = new Map();
  for (const e of entries) { const k = e.person ?? ''; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return [...m].map(([person, list]) => ({ person, entries: list }));
}

/**
 * The cloud: n tiles in a box, no overlaps; the best match lies nearest the take (the bottom row's middle when above it,
 * the right column's middle when beside), the rest in rows further out, a little smaller and loosely offset, so it
 * reads as a cloud. → [{ i, x, y, s }]
 */
export function cloudSpots(n, box, { beside = false, k = 1 } = {}) {
  const count = Math.min(n, MANY);
  if (!count) return [];
  const gap = 10 * k;
  const s0 = Math.max(48 * k, Math.min(130 * k, Math.sqrt((box.w * box.h) / count) * 0.72));
  const along = beside ? box.h : box.w, across = beside ? box.w : box.h;
  const per = Math.max(1, Math.floor((along + gap) / (s0 + gap)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / per), j = i % per, inRow = Math.min(per, count - row * per);
    const s = s0 * Math.max(0.62, 1 - row * 0.1);
    const order = j % 2 ? (j + 1) / 2 : -j / 2; // from the middle outwards
    const a = along / 2 + order * (s0 + gap) - (inRow % 2 ? 0 : (s0 + gap) / 2); // an even row sits between the odd ones
    const b = across - (s0 / 2 + row * (s0 * 0.92 + gap)) - ((i * 37) % 11) * k; // a little loose
    if (b < s / 2) break;
    const x = beside ? box.x + b : box.x + a, y = beside ? box.y + a : box.y + b;
    out.push({ i, x: Math.max(box.x + s / 2, Math.min(box.x + box.w - s / 2, x)), y: Math.max(box.y + s / 2, Math.min(box.y + box.h - s / 2, y)), s });
  }
  return out;
}

/**
 * The older lines stacked between the button and the window, chosen and ordered by the same rails as the cloud
 * (27.11., user: no other elements – the date, the spot, who / sharing point and the initial letters narrow and sort
 * them). A line passes when one of its takes passes (passes); the open rail sorts – letters by the line's first word,
 * else by its newest take, each in its rail's direction. lines: the take's lines (the last is the open one) ·
 * entryOf: take → { t, words, person, sharing, spot } · → the indexes of the older lines, in order
 */
export function stackOrder(lines, f, entryOf) {
  const older = [...Array(Math.max(0, lines.length - 1)).keys()];
  const rows = older.map((n) => ({ n, takes: lines[n].takes.map(entryOf) }));
  const kept = f ? rows.filter((r) => r.takes.some((e) => passes(e, f))) : rows;
  const when = (r) => Math.max(0, ...r.takes.map((e) => e.t ?? 0)), first = (r) => String(r.takes.flatMap((e) => e.words ?? [])[0] ?? '').toLocaleLowerCase('de');
  if (f?.open === 'initial') { const dir = f.order?.initial === 'za' ? -1 : 1; kept.sort((a, b) => dir * first(a).localeCompare(first(b), 'de') || when(b) - when(a)); }
  else { const dir = f?.order?.date === 'old' ? -1 : 1; kept.sort((a, b) => dir * (when(b) - when(a)) || b.n - a.n); }
  return kept.map((r) => r.n);
}