// gestures.js — the one table of gestures (DESIGN R9): action × gesture × target × mode.
//
// Purpose:   help, hints and tests come from this table; a new action = one row, no code change.
//            Only strand fields, the point (record) and what is on screen are targets: no extra buttons.
//            tap = on/off or start · hold = record while held (point: all on; strand: only it) · items: ↑ share
//            · ↓ remove (chips) · ← next · → before. Edges in zones, starting ~1–2 cm inside (Android back).
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    a lookup is a scan of ~20 rows (< 1 µs); each (gesture, target, mode) means one action.

export const GESTURES = ['tap', 'double-tap', 'hold', 'up', 'down', 'left', 'right', 'edge-in', 'edge-out', 'drag', 'pinch'];
export const MODES = ['take', 'search', 'any'];

/** [action, gesture, target, mode, what it does] */
export const TABLE = [
  ['take', 'tap', 'point', 'any', 'all switched-on strands start / stop together'],
  ['take-while-held', 'hold', 'point', 'any', 'all switched-on strands record while held'],
  ['ready', 'double-tap', 'point', 'any', 'always ready on / off: starts on motion or sound, stops after the wait'],
  ['share-last', 'up', 'point', 'any', 'show the sharing points that can take it; tap one = share the last take there'],
  ['remove-last', 'down', 'point', 'any', 'remove the last take (chips)'],
  ['replay-back', 'left', 'point', 'any', 'watch the take before (plays in the display)'],
  ['replay-on', 'right', 'point', 'any', 'watch the next take; past the newest = live again'],
  ['strand-on-off', 'tap', 'strand', 'any', 'this strand on / off for the point'],
  ['strand-while-held', 'hold', 'strand', 'any', 'record only this strand while held'],
  ['strand-while-held', 'hold', 'live', 'any', 'record only video while held'],
  ['transcribe', 'drag', 'strand:a>strand:x', 'any', 'record audio while held and make text of it, live'],
  ['search-from', 'drag', 'strand>similar', 'any', 'search Similar from this strand'],
  ['chips-in', 'up', 'strand', 'any', 'show the chips of this strand (camera: light, exposure; audio: stereo, Whisper)'],
  ['chips-out', 'down', 'strand', 'any', 'hide the chips of this strand'],
  ['hide-strand', 'left', 'strand', 'any', 'hide this field (it still records when on)'],
  ['focus', 'tap', 'live', 'any', 'focus where tapped'],
  ['zoom', 'pinch', 'live', 'any', 'zoom the camera'],
  ['switch-camera', 'left', 'live', 'any', 'front / back camera'],
  ['switch-camera', 'right', 'live', 'any', 'front / back camera'],
  ['own-in', 'edge-in', 'upper-left', 'any', 'own settings: waits, strands, camera, consent'],
  ['own-out', 'edge-out', 'upper-left', 'any', 'push the own settings off'],
  ['strands-in', 'edge-in', 'middle-left', 'any', 'show the strand fields (hidden ones come back)'],
  ['similar-in', 'edge-in', 'upper-right', 'any', 'pull Similar onto the display'],
  ['similar-out', 'edge-out', 'upper-right', 'any', 'push Similar off'],
  ['share-menu', 'edge-in', 'middle-right', 'any', 'share menu: sharing points, hello / join'],
  ['share-menu-out', 'edge-out', 'middle-right', 'any', 'push the share menu off'],
  ['share-to', 'tap', 'sharing-point', 'any', 'share the last take to this sharing point now'],
  ['out-of-list', 'down', 'sharing-point', 'any', 'take this sharing point out of the list (a new list version)'],
  ['bring-in', 'left', 'middle-right', 'any', 'paste a link, an address or a server: bring a sharing point in'],
  ['full', 'up', 'top-middle', 'any', 'full screen: only picture and point'],
  ['unfull', 'down', 'top-middle', 'any', 'show everything again'],
  ['share', 'up', 'item', 'any', 'share to the sharing point in focus (no question)'],
  ['remove', 'down', 'item', 'any', 'remove: chips share-first · out of search and shares · out of training'],
  ['next', 'left', 'item', 'any', 'next / another; on hello: go on to join'],
  ['before', 'right', 'item', 'any', 'before'],
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
