// similar-filter.js — the filter chips of Similar: wer · wo · wann · was, chosen like strands.
//
// Purpose:   chips only, no fields: tap = on/off. Rows (no labels on screen, the order says it):
//              wer   persons (@): files BY her
//              wo    @Anna = every sharing point of Anna, then each sharing point on its own
//              wann  heute · 7 Tage · this month · the last months with files
//              was   v a x l
//            The chosen chips are the meta of the similar: ?(… {:v :x} {:sharing-point.2})@(Anna)'t(…)
//            (7-similar/filter.js); without words Similar lists everything that fits, newest first.
// Depends:   7-similar/filter.js
// Test:      tests/similar.test.mjs
// Limits:    ≤ 8 persons, ≤ 12 sharing points, 3 months shown (more by scrolling the row).

import { facets, sharingPointsOf } from '../7-similar/filter.js';

export const EMPTY = Object.freeze({ persons: [], at: [], sharingPoints: [], time: null, kinds: [] });
const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

/** Time chips → ranges, relative to now. */
export function timeOf(key, now = new Date()) {
  if (!key) return null;
  if (key === 'today') return [day(now), day(now)];
  if (key === 'week') return [day(new Date(now - 6 * 864e5)), day(now)];
  return [key, key]; // a month 'JJJJ.MM'
}

/** chips: [{ row, key, value, label, on }] */
export function filterChips(index, chosen = EMPTY, t = (k) => k, now = new Date()) {
  const f = facets(index);
  const month = day(now).slice(0, 7);
  const persons = f.persons.slice(0, 8);
  const times = ['today', 'week', month, ...f.months.filter((m) => m !== month).slice(0, 2)];
  const isOn = (key, value) => (key === 'time' ? chosen.time === value : chosen[key].includes(value));
  const chip = (row, key, value, label) => ({ row, key, value, label, on: isOn(key, value) });
  return [
    // wer: files by her
    ...persons.map((p) => chip('wer', 'persons', p.n, `@${p.label ?? '?'}`)),
    // wo: @Anna = all her sharing points, then each sharing point
    ...persons.map((p) => chip('wo', 'at', p.n, `@${p.label ?? '?'}`)),
    ...f.sharingPoints.slice(0, 12).map((sp) => chip('wo', 'sharingPoints', sp.name, sp.name)),
    // wann: today, 7 days, this month, the last months with files
    ...times.map((k) => chip('wann', 'time', k, k.includes('.') ? k : t(`time.${k}`))),
    // was: kinds
    ...['v', 'a', 'x', 'l'].map((k) => chip('was', 'kinds', k, t(`kind.${k}`))),
  ];
}

/** Tap a chip → the next choice. */
export function toggle(chosen, chip) {
  if (chip.key === 'time') return { ...chosen, time: chosen.time === chip.value ? null : chip.value };
  const list = chosen[chip.key];
  return { ...chosen, [chip.key]: list.includes(chip.value) ? list.filter((v) => v !== chip.value) : [...list, chip.value] };
}

/** The choice → filters for similar(): @Anna in wo = all her sharing points, joined with the single ones. */
export function filtersOf(index, chosen, { owners = {}, now = new Date() } = {}) {
  const points = new Set(chosen.sharingPoints);
  for (const n of chosen.at) for (const name of sharingPointsOf(index, n, { owners })) points.add(name);
  return { persons: chosen.persons, sharingPoints: [...points], time: timeOf(chosen.time, now), kinds: chosen.kinds };
}
