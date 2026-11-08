// gestures.js — the one table of gestures (DESIGN R9): action × gesture × target × mode.
//
// Purpose:   help, hints and tests come from this table; a new action = one row, no code change.
//            Only strand fields, the point (record) and what is on screen are targets: no extra buttons.
//            Directions (decision design chat 4 and 07.11.): ↑ share · ↓ remove (chips) · ← next/another
//            · → before. Upper right edge: Similar (others) · upper left edge: own settings (mirror).
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    a lookup is a scan of ~20 rows (< 1 µs); each (gesture, target, mode) means one action.

export const GESTURES = ['tap', 'double-tap', 'hold', 'up', 'down', 'left', 'right', 'edge-in', 'edge-out', 'drag', 'pinch'];
export const MODES = ['take', 'search', 'any'];

/** [action, gesture, target, mode, what it does] */
export const TABLE = [
  ['take', 'tap', 'point', 'any', 'record on / off with the chosen strands'],
  ['take-while-held', 'hold', 'point', 'any', 'record while held'],
  ['ready', 'double-tap', 'point', 'any', 'always ready on / off: starts on motion or sound, stops after the wait'],
  ['choose-strands', 'hold', 'strand', 'any', 'only the held strands take part; several held = together'],
  ['transcribe', 'drag', 'strand:a>strand:x', 'any', 'audio becomes text (Whisper), live when possible'],
  ['search-from', 'drag', 'strand>similar', 'any', 'search Similar from this strand or the held combination'],
  ['switch-camera', 'left', 'strand:v', 'any', 'front / back camera'],
  ['switch-camera', 'right', 'strand:v', 'any', 'front / back camera'],
  ['torch', 'double-tap', 'strand:v', 'any', 'torch on / off (back camera)'],
  ['zoom', 'pinch', 'live', 'any', 'zoom the camera'],
  ['focus', 'tap', 'live', 'any', 'focus where tapped'],
  ['own-in', 'edge-in', 'upper-left', 'any', 'settings of the own sharing point: waits, strands, camera, consent'],
  ['own-out', 'edge-out', 'upper-left', 'any', 'push the own settings off the display'],
  ['similar-in', 'edge-in', 'upper-right', 'any', 'pull Similar onto the display'],
  ['similar-out', 'edge-out', 'upper-right', 'any', 'push Similar off the display'],
  ['share', 'up', 'item', 'any', 'share to the sharing point in focus (no question)'],
  ['remove', 'down', 'item', 'any', 'remove: chips share-first · out of search and shares · out of training'],
  ['next', 'left', 'item', 'any', 'next / another; on hello: go on to join'],
  ['before', 'right', 'item', 'any', 'before'],
  ['add-sharing-point', 'left', 'sharing-point', 'any', 'add another sharing point (in the share menu)'],
  ['settings', 'hold', 'sharing-point', 'any', 'settings and consent of this sharing point'],
  ['take-over', 'tap', 'similar-item', 'search', 'take a result into the Take in the middle'],
];

const rows = TABLE.map(([action, gesture, target, mode, what]) => ({ action, gesture, target, mode, what }));

/** What does this gesture do here? → row or null. Specific mode wins over "any". */
export function actionFor({ gesture, target, mode = 'take' }) {
  return rows.find((r) => r.gesture === gesture && r.target === target && r.mode === mode) ??
    rows.find((r) => r.gesture === gesture && r.target === target && r.mode === 'any') ?? null;
}

/** Problems of the table: unknown gestures or modes, two actions for one (gesture, target, mode). */
export function checkTable() {
  const seen = new Map();
  const problems = [];
  for (const r of rows) {
    if (!GESTURES.includes(r.gesture)) problems.push(`unknown gesture: ${r.gesture}`);
    if (!MODES.includes(r.mode)) problems.push(`unknown mode: ${r.mode}`);
    const k = `${r.gesture}|${r.target}|${r.mode}`;
    if (seen.has(k)) problems.push(`two actions for ${k}: ${seen.get(k)}, ${r.action}`);
    seen.set(k, r.action);
  }
  return problems;
}

/** Help as rows for one target (the UI shows it while something is held). */
export const helpFor = (target) => rows.filter((r) => r.target === target || r.target.startsWith(`${target}:`) || r.target.startsWith(`${target}>`));
