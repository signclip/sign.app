// similar-zoom.js — the metadata of Similar by zooming (21.11., user): where two fingers spread or squeeze decides
// which metadata, how far decides how fine.
//
// Purpose:   zones in the cloud: left = initial letters · right = date · top = spot (where it was) · bottom (next to
//            the take) = who (sharing point, person) · the middle stays the cloud's own zoom (similar-view.js zoomed).
//            Each has a ladder from coarse to fine; spread = finer, squeeze = coarser, quite together = bundled, quite
//            apart = one by one, sorted by it (the arrow of its selection view turns the order):
//              date     year → month → day → one by one
//              initial  first letter → two letters → whole word → one by one
//              who      sharing point → person → one by one
//              spot     cell (o_) → name (°) → one by one
//              template its elements, in its order (spread on a template tile, 21.11.)
//            A bundle tapped or spread open = only it (value.bundle), one step finer; squeezed again = back.
//            The rails (26.11., user): the zone that is open shows its values as a bar along its edge – letters left,
//            the calendar right (years, months or days, each under its year or month) – at the step the cloud is
//            bundled by, so one sees what a zoom does; one by one = the finest step that still fits the bar
//            (RAIL_MAX values). A value tapped = only that (letters: several; calendar: one span, a second value = from … to).
// Depends:   similar-view.js (initialOf)
// Test:      tests/ui.test.mjs
// Limits:    ≤ 40 bundles shown (MANY); times as the device's local calendar; a rail lists ≤ RAIL_MAX = 24 values
//            before it takes the next coarser step (24 × 26 px = 624 px: more than a phone's cloud, so it scrolls).

import { initialOf } from './similar-view.js';
import { parentCell } from './similar-range.js';

export const LADDERS = { date: ['year', 'month', 'day'], initial: ['letter', 'two', 'word'], who: ['sharing', 'person'], spot: ['cell', 'name'], template: ['element'] };
export const ZONES = ['initial', 'date', 'spot', 'who']; // template: spread on a template tile (its elements, value.template)

/** Which zone of the cloud a point is in (box: Similar's box): 15 % of each side, at least 44 / 36 px. → zone or null */
export function zoneOf(box, pt, k = 1) {
  if (!box || !pt) return null;
  const x = pt.x - box.x, y = pt.y - box.y, side = Math.max(44 * k, box.w * 0.15), band = Math.max(36 * k, box.h * 0.15);
  if (x < 0 || y < 0 || x > box.w || y > box.h) return null;
  if (x < side) return 'initial';
  if (x > box.w - side) return 'date';
  if (y < band) return 'spot';
  if (y > box.h - band) return 'who';
  return null;
}

/**
 * A spread (scale > 1) or squeeze in a zone: the next step of its ladder. group = { by, level }: level < ladder length
 * = bundled at that step, = length = one by one. Squeezed below the coarsest: closed. → filters
 */
export function zoomZone(f, zone, scale) {
  const ladder = LADDERS[zone], g = f.group?.by === zone ? f.group : null, out = scale > 1.12, inn = scale < 0.88;
  if (!ladder || (!out && !inn)) return f;
  const value = { ...f.value };
  if (inn && value.bundle?.by === zone) { const level = ladder.indexOf(value.bundle.step); delete value.bundle; return { ...f, value, group: { by: zone, level }, open: zone }; } // out of the opened bundle: bundled again
  let level = g ? g.level + (out ? 1 : -1) : out ? ladder.length : 0;
  if (level < 0) return { ...f, value, group: null, open: f.open === zone ? null : f.open }; // below the coarsest: closed
  level = Math.min(ladder.length, level);
  return { ...f, value, group: { by: zone, level }, open: zone };
}

/** A bundle opened (tapped or spread): only what is in it, one step finer. → filters */
export function openBundle(f, key) {
  const g = f.group, ladder = LADDERS[g?.by];
  if (!ladder || g.level >= ladder.length) return f;
  return { ...f, value: { ...f.value, bundle: { by: g.by, step: ladder[g.level], key } }, group: { ...g, level: g.level + 1 } };
}

const two = (n) => String(n).padStart(2, '0');
/** The bundle an entry belongs to at one step. → key (also its label) */
export function bundleKey(e, by, step, f = null) {
  if (by === 'date') { const d = new Date(e.t || 0); return step === 'year' ? `${d.getFullYear()}` : step === 'month' ? `${d.getFullYear()}.${two(d.getMonth() + 1)}` : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; }
  if (by === 'initial') { const w = String(e.words?.[0] ?? '').trim(); return step === 'letter' ? initialOf(w) || '–' : step === 'two' ? w.slice(0, 2).toLocaleUpperCase('de') || '–' : w || '–'; }
  if (by === 'who') return (step === 'sharing' ? e.sharing?.[0] : e.person) || '–';
  if (by === 'spot') return (step === 'cell' ? e.spot : e.where ?? e.spot) || '–';
  if (by === 'template') { const have = new Set((e.words ?? []).map((w) => w.toLowerCase())); const ws = (f?.value?.template ?? []).find((x) => x.some((w) => have.has(w.toLowerCase()))); return ws ? ws.join(' ') : '–'; }
  return '–';
}

/** Is an entry in the bundle that was opened? */
export const inBundle = (e, b, f = null) => !b || bundleKey(e, b.by, b.step, f) === b.key;

/** The cloud bundled at the group's step, or null (one by one). → [{ key, label, entries }] in the selection's order */
export function bundlesOf(entries, f, { near = null } = {}) {
  const g = f.group, ladder = LADDERS[g?.by];
  if (!ladder || g.level >= ladder.length) return null;
  if (g.by === 'template') { // a template's elements in its order (21.11.): each take of it a bundle, what fits its words falls in
    const els = f.value.template ?? [], label = (ws) => ws.join(' ');
    const out = els.map((ws) => ({ key: label(ws), label: label(ws), entries: [] })), rest = [];
    for (const e of entries) { const have = new Set((e.words ?? []).map((w) => w.toLowerCase())); const i = els.findIndex((ws) => ws.some((w) => have.has(w.toLowerCase()))); (i >= 0 ? out[i].entries : rest).push(e); }
    return [...out, ...(rest.length ? [{ key: '–', label: '…', entries: rest }] : [])];
  }
  const m = new Map();
  for (const e of entries) { const k = bundleKey(e, g.by, ladder[g.level]); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  const down = backwards(f, g.by), list = [...m].map(([key, list]) => ({ key, label: key, entries: list }));
  if (g.by === 'spot' && near) return list.sort((a, b) => (down ? -1 : 1) * (nearness(b.entries[0]?.spot, near) - nearness(a.entries[0]?.spot, near))); // near → far (26.11.)
  return list.sort((a, b) => (down ? -1 : 1) * a.key.localeCompare(b.key, 'de', { numeric: true }));
}

/**
 * How near two spots are, without a map library (26.11.): the finest H3 resolution at which they share their cell –
 * 5 = the same cell (≈ 250 km²), 4 its surroundings (≈ 1,800 km²), 3 the region (≈ 12,000 km²) … 0 the same base cell,
 * −1 not even that (another part of the world), −2 one of them has no spot. Ort's arrow: near → far.
 */
export function nearness(a, b) {
  if (!a || !b) return -2;
  for (let res = 5; res >= 0; res--) { const pa = parentCell(a, res); if (pa && pa === parentCell(b, res)) return res; }
  return -1;
}

/** One by one, sorted by the zone that was zoomed (date, initial; who and spot by their name), else as found. */
/** The view's arrow turned (22.11.): date newest first by default, the others A → Z. */
const backwards = (f, by) => (by === 'date' ? f.order?.date !== 'old' : f.order?.[by] === 'za');
export function sortedBy(entries, f, { near = null } = {}) {
  const by = f.group?.by, dir = backwards(f, by) ? -1 : 1;
  if (!by) return entries;
  if (by === 'date') return [...entries].sort((a, b) => dir * (a.t - b.t));
  if (by === 'spot' && near) return [...entries].sort((a, b) => dir * (nearness(b.spot, near) - nearness(a.spot, near))); // near → far from the take's spot (26.11.), turned: far → near
  const step = LADDERS[by].at(-1);
  return [...entries].sort((a, b) => dir * bundleKey(a, by, step, f).localeCompare(bundleKey(b, by, step, f), 'de'));
}

// ---------- the rails (26.11.) ----------

/** What a rail can list: the calendar down to days; letters never whole words (too long for a bar of 40 px). */
export const RAIL_STEPS = Object.freeze({ date: ['year', 'month', 'day'], initial: ['letter', 'two'] });
export const RAIL_MAX = 24;

/** Does a word begin with a rail's key ('A', 'AP', '#' = a digit)? */
export const beginsWith = (word, key) => { const w = String(word ?? '').trim().toLocaleUpperCase('de'); return key === '#' ? /^\d/.test(w) : Boolean(key) && w.startsWith(String(key).toLocaleUpperCase('de')); };

/** Every key of an entry at a step: its day, month or year; for letters every one of its words (they are equal, on one level). */
export function keysOf(e, by, step) {
  if (by !== 'initial') return [bundleKey(e, by, step)];
  return [...new Set((e.words ?? []).flatMap((x) => String(x).split(/\s+/)).map((w) => (step === 'letter' || /^\d/.test(w) ? initialOf(w) : w.slice(0, 2).toLocaleUpperCase('de'))).filter(Boolean))]; // a number is '#' at both steps
}

/**
 * The step a rail shows. The calendar: the step the cloud is bundled by, else (one by one) the finest that fits the
 * bar. Letters: the first letter – the index everybody knows – and the first two only while the cloud is bundled by two.
 */
export function railStep(entries, f, by, max = RAIL_MAX) {
  const steps = RAIL_STEPS[by] ?? [], g = f.group?.by === by ? f.group : null;
  if (by === 'initial') return g?.level === 1 ? 'two' : 'letter';
  if (g && g.level < LADDERS[by].length) return steps[Math.min(g.level, steps.length - 1)];
  for (let i = steps.length - 1; i > 0; i--) if (new Set(entries.flatMap((e) => keysOf(e, by, steps[i]))).size <= max) return steps[i];
  return steps[0];
}

/** The span of a calendar key in ms (local time): '2026' · '2026.11' · '2026.11.26' → [from, to]. */
export function periodRange(key) {
  const [y, m, d] = String(key).split('.').map(Number);
  if (!Number.isFinite(y)) return null;
  const from = new Date(y, (m || 1) - 1, d || 1), to = d ? new Date(y, m - 1, d + 1) : m ? new Date(y, m, 1) : new Date(y + 1, 0, 1);
  return [from.getTime(), to.getTime() - 1];
}

/** A calendar key as it is read: '2026' · 'Nov' (with '26 when years differ) · '26.' */
export function periodLabel(key, lang = 'de', { year = false } = {}) {
  const [y, m, d] = String(key).split('.');
  if (d) return `${Number(d)}.`;
  if (!m) return y;
  let name = m;
  try { name = new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(Number(y), Number(m) - 1, 1)).replace(/\.$/, ''); } catch { /* an unknown language: the number */ }
  return year ? `${name} ’${y.slice(2)}` : name;
}

/**
 * What a rail lists. entries: the results before any choice narrows them (a choice can always be taken back).
 * → { step, values: [{ key, n, head }] } – head: the year over its months, the month over its days (it can be tapped
 * too: the whole of it); in the view's order (date: newest first unless turned; letters A → Z).
 */
export function railValues(entries, f, by, max = RAIL_MAX) {
  const steps = RAIL_STEPS[by];
  if (!steps) return { step: null, values: [] };
  const step = railStep(entries, f, by, max), count = new Map();
  for (const e of entries) for (const k of keysOf(e, by, step)) if (k && k !== '–') count.set(k, (count.get(k) ?? 0) + 1);
  const down = backwards(f, by), keys = [...count.keys()].sort((a, b) => (down ? -1 : 1) * a.localeCompare(b, 'de', { numeric: true }));
  if (by !== 'date' || step === 'year') return { step, values: keys.map((key) => ({ key, n: count.get(key), head: false })) };
  const values = [];
  let over = null;
  for (const key of keys) {
    const parent = key.slice(0, key.lastIndexOf('.'));
    if (parent !== over) { over = parent; values.push({ key: parent, n: keys.filter((k) => k.startsWith(`${parent}.`)).reduce((n, k) => n + count.get(k), 0), head: true }); }
    values.push({ key, n: count.get(key), head: false });
  }
  return { step, values };
}

/** A calendar key as short as a narrow rail holds (28.11.): a day '21.11.' · a month 'Nov' · a year '2026' – ≤ 31 px at 10 px. */
export function shortLabel(key, lang = 'de') {
  const p = String(key ?? '').split('.');
  if (p.length === 3) return `${Number(p[2])}.${Number(p[1])}.`;
  return periodLabel(key, lang);
}

/** From one calendar key to another, whichever comes first (27.11.: a finger drawn along the date's rail). → [from, to] in ms, or null */
export function spanBetween(a, b) {
  const x = periodRange(a), y = periodRange(b);
  return x && y ? [Math.min(x[0], y[0]), Math.max(x[1], y[1])] : null;
}

/**
 * Did two fingers go apart with a part across (27.11., user: "Aufzoomen vertikal = Leiste, mit horizontalem Anteil =
 * Vollbild")? at / now: where the two fingers went down and where they are. Across = they went at least 24 px
 * further apart sideways, and more than 0.6 of what they went apart upright (steeper than ≈ 59° counts as upright).
 */
export function spreadAcross(at, now) {
  if (!at?.[1] || !now?.[1]) return false;
  const gx = Math.abs(now[0].x - now[1].x) - Math.abs(at[0].x - at[1].x), gy = Math.abs(now[0].y - now[1].y) - Math.abs(at[0].y - at[1].y);
  return gx >= 24 && gx > 0.6 * Math.max(0, gy);
}

/** Is a calendar key inside the chosen span? */
export const inSpan = (key, span) => { const r = periodRange(key); return Boolean(r && span && r[0] >= span[0] && r[1] <= span[1]); };
