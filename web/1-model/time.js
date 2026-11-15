// time.js — the one way a time is written in Sign, and the one way it is shown.
//
// Purpose:   every 't( ) in a file, a file name, a month folder, a similar and a join rule is UTC
//            (decision 06.11., step 1 of the storage review 15.11.): one moment = one text, on every
//            device, in every time zone, also in the hour that repeats when clocks go back.
//            Only the surface shows local time; it converts here and nowhere else.
//              written   'JJJJ.MM.TT HH.MM.SS' UTC, optional length ' 0_4200' (ms from the start)
//              range     'from_to', each a prefix of a written time: '2026.11' · '2026.11.08' ·
//                        '2026.11.01_2026.11.14' · '2026.11.10 09.00_2026.11.10 11.00' (G7: _ = bis)
//              shown     local time of the device, built from the same milliseconds
// Depends:   nothing.
// Test:      tests/model.test.mjs
// Limits:    seconds in 't( ); milliseconds live in t_ of the ID (48 bit, until year 10889) and in
//            parts '( ) of a strand · years 0000–9999 as text · a written time sorts like the moment
//            itself (plain string order), so prefixes and ranges need no parsing.

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Milliseconds → written time in UTC; with a length: '… 0_4200'. */
export function timeLabel(ms, lengthMs = null) {
  const d = new Date(ms);
  const at = `${pad(d.getUTCFullYear(), 4)}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}.${pad(d.getUTCSeconds())}`;
  return lengthMs == null ? at : `${at} 0_${Math.round(lengthMs)}`;
}

/** Written time (or a prefix of it) → milliseconds of its start, UTC. Length is ignored. */
export function msOf(label) {
  const m = /^(\d{4})(?:\.(\d{2}))?(?:\.(\d{2}))?(?: (\d{2}))?(?:\.(\d{2}))?(?:\.(\d{2}))?/.exec(String(label ?? '').trim());
  if (!m) return null;
  const [y, mo = 1, d = 1, h = 0, mi = 0, s = 0] = m.slice(1).map((v) => (v == null ? undefined : Number(v)));
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/** 'from_to' or one prefix → [from, to] as comparable prefixes. */
export function timeRange(text) {
  if (!text) return null;
  const [from, to = from] = String(text).split('_');
  return [from.trim(), to.trim()];
}

/** Is a written time inside a range? Both ends count whole ('2026.11.14' includes 23.59.59). */
export function inTime(t, range) {
  if (!range) return true;
  if (!t) return false;
  const [from, to] = range;
  return t.slice(0, from.length) >= from && t.slice(0, to.length) <= to;
}

/** A span of local time (ms) → range of written UTC times, to the second. */
export function rangeOf(fromMs, toMs) {
  return [timeLabel(fromMs), timeLabel(toMs)];
}

/** Start of the local day of ms (the surface thinks in local days). */
export function localDayStart(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Shown on the surface: local time of the device. what: 'day' · 'month' · 'minute' · 'second'. */
export function shown(msOrLabel, what = 'minute') {
  const ms = typeof msOrLabel === 'number' ? msOrLabel : msOf(msOrLabel);
  if (ms == null) return '';
  const d = new Date(ms);
  const day = `${pad(d.getFullYear(), 4)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  if (what === 'month') return day.slice(0, 7);
  if (what === 'day') return day;
  const hm = `${day} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  return what === 'second' ? `${hm}.${pad(d.getSeconds())}` : hm;
}
