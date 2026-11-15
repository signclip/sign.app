// view/start.js — what the start shows at once (15.11., user): the state of this person, for 2.5 s in the window,
//            before the camera's picture is there; no text but the waits.
//   account  three small tiles me · group · my Sign, as in the sharing icon: none = me alone, the group dashed ·
//            hello = a dotted line, the group waits · join = the group there, a dotted line to my Sign · sign = all
//            three solid (a Sign account is there). 'onboarding': nothing here, the first step breathes instead.
//   mode     at the point: button = it breathes (waits for a tap) · auto = the two wait rings with their seconds
//            (motion or sound starts after the first, stillness stops after the second) · record = a ring that runs
//            once, then the take starts · choose = the persons come as tiles (sharing menu).
// Depends:   nothing (shapes as in ring.js)
// Test:      tests/ui.test.mjs
// Limits:    5 tiles' worth of shapes; drawn only while data.start is set (app.js clears it after 2.5 s).

/** → shapes for data.start = { account, mode, waits: { startMs, stopMs } } around win (window) and point. */
export function startShapes(start, { win, point, k = 1, ring = 42 }) {
  const out = [], s = 26 * k, gap = 44 * k, y = win.cy;
  const at = (i) => win.cx + (i - 1) * gap;
  const tile = (i, cls) => out.push({ type: 'sheet', x: at(i) - s / 2, y: y - s / 2, w: s, h: s, r: 7 * k, cls: `start-tile ${cls}` });
  const line = (i, j, cls) => out.push({ type: 'line', x1: at(i) + s / 2, y1: y, x2: at(j) - s / 2, y2: y, cls: `start-line ${cls}` });
  const a = start.account;
  if (a && a !== 'onboarding') {
    tile(0, 'on');
    if (a === 'none') tile(1, 'dashed breathe');
    if (a === 'hello') { line(0, 1, 'dotted'); tile(1, 'dashed'); }
    if (a === 'join') { line(0, 1, ''); tile(1, 'on'); line(1, 2, 'dotted'); tile(2, 'dashed breathe'); }
    if (a === 'sign') { line(0, 1, ''); tile(1, 'on'); line(1, 2, ''); tile(2, 'on'); }
  }
  const m = start.mode;
  if (m === 'button') out.push({ type: 'circle', cx: point.cx, cy: point.cy, r: ring + 6 * k, cls: 'start-mode breathe' });
  if (m === 'record') out.push({ type: 'circle', cx: point.cx, cy: point.cy, r: ring + 6 * k, cls: 'start-mode record' });
  if (m === 'auto' && start.waits) {
    for (const [ms, cls] of [[start.waits.startMs, 'start'], [start.waits.stopMs, 'stop']]) {
      const r = ring + (4 + ms / 125) * k;
      out.push({ type: 'label', x: point.cx + r + 4 * k, y: point.cy - r * 0.2 + (cls === 'stop' ? 12 * k : 0), text: `${Math.round(ms / 100) / 10} s`, cls: `label start-wait ${cls}` });
    }
  }
  return out;
}
