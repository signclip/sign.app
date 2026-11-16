// similar-view.js — Similar on the screen (16.11.): how near it is, what it filters by, where its tiles lie.
//
// Purpose:   zoom is the only way in and out (no swipe, no drag):
//              closed ──spread above the take──▶ many ──spread again──▶ full (the take fades, only the cloud)
//              many ──tap one──▶ double (that one large beside the take, its strands shown) ──squeeze──▶ many
//              full ──squeeze──▶ many ──squeeze──▶ closed
//            What Similar matches is what the take window holds now (its strands, the take chosen or running): first
//            context, later audio and visual. The filters are "selection views", all of the same kind, shown pale until
//            tapped: the strands v · x · a, and the metadata date (right edge), initial letter (left edge), @ name,
//            sharing point (the button's sign) and spot where it was taken (o_). Date and initial are ordered data:
//            holding them turns their order around. The chips of a take are equal, on one level: an initial filter
//            matches a take if any of its chips starts with it.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    ≤ MANY tiles in the cloud (the rest by scrolling); initials A–Z plus Ä Ö Ü and digits (# = digits).

export const LEVELS = ['closed', 'many', 'double', 'full'];
export const MANY = 40;
export const FILTERS = ['v', 'x', 'a', 'date', 'initial', 'name', 'sharing', 'spot'];
export const ORDERED = ['date', 'initial'];

export const noFilters = () => ({ on: { x: true }, value: {}, open: null, order: { date: 'new', initial: 'az' } });

/** The next level after a pinch: scale > 1 = spread, < 1 = squeeze. */
export function zoomed(level, scale) {
  const out = scale > 1.12, inn = scale < 0.88;
  if (out) return level === 'closed' ? 'many' : level === 'many' ? 'full' : level;
  if (inn) return level === 'full' ? 'many' : level === 'double' ? 'many' : level === 'many' ? 'closed' : level;
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
  const order = { ...f.order, [name]: name === 'date' ? (f.order.date === 'new' ? 'old' : 'new') : (f.order.initial === 'az' ? 'za' : 'az') };
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
  if (f.on.initial && v.initial?.length && !(entry.words ?? []).some((w) => v.initial.includes(initialOf(w)))) return false;
  if (f.on.name && v.name?.length && !v.name.includes(entry.person)) return false;
  if (f.on.sharing && v.sharing?.length && !(entry.sharing ?? []).some((s) => v.sharing.includes(s))) return false;
  if (f.on.spot && v.spot?.length && !v.spot.includes(entry.spot)) return false;
  return true;
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
