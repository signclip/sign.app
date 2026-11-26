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
// Depends:   similar-view.js (initialOf)
// Test:      tests/ui.test.mjs
// Limits:    ≤ 40 bundles shown (MANY); times as the device's local calendar.

import { initialOf } from './similar-view.js';

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
export function bundlesOf(entries, f) {
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
  const down = backwards(f, g.by);
  return [...m].map(([key, list]) => ({ key, label: key, entries: list })).sort((a, b) => (down ? -1 : 1) * a.key.localeCompare(b.key, 'de', { numeric: true }));
}

/** One by one, sorted by the zone that was zoomed (date, initial; who and spot by their name), else as found. */
/** The view's arrow turned (22.11.): date newest first by default, the others A → Z. */
const backwards = (f, by) => (by === 'date' ? f.order?.date !== 'old' : f.order?.[by] === 'za');
export function sortedBy(entries, f) {
  const by = f.group?.by, dir = backwards(f, by) ? -1 : 1;
  if (!by) return entries;
  if (by === 'date') return [...entries].sort((a, b) => dir * (a.t - b.t));
  const step = LADDERS[by].at(-1);
  return [...entries].sort((a, b) => dir * bundleKey(a, by, step, f).localeCompare(bundleKey(b, by, step, f), 'de'));
}
