// gestures.js — the one table of gestures (DESIGN R9): action × gesture × target × mode.
//
// Purpose:   help, hints and tests come from this table; a new action = one row, no code change.
//            Only strand fields, the point (record) and what is on screen are targets: no extra buttons.
//            tap = on/off or start · hold = record while held (point: all on; strand: only it) · items: ↑ share
//            · ↓ set aside, all the way ↓ delete (chips) · ← next · → before · slow hold = find the moment.
//            No labels on screen (decided 08.11.): the help shows while something is held.
//            Edges in zones, starting ~1–2 cm inside (Android back).
//            Intent × device (Design · Geste Overview): VOICE = the keyword for an action (Initial §4.2);
//            glasses later as one more map, the table stays.
//            Parallel (DESIGN principle 4): one finger holds a property (a strand or a chip), the other does
//            the action. A sixth column `held` says which property the row needs; rows without it are the
//            gesture alone. A held property never blocks: with no parallel row the gesture does what it
//            does alone. Voice and glasses give the same pair later (keyword + held field), the table stays.
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    a lookup is a scan of ~50 rows (< 1 µs); each (gesture, target, mode, held) means one action;
//            one property at a time (two fingers; a third is ignored).

export const GESTURES = ['tap', 'double-tap', 'hold', 'hold-slow', 'up', 'down', 'down-far', 'left', 'right', 'edge-in', 'edge-out', 'drag', 'pinch'];
export const MODES = ['take', 'similar', 'line', 'any'];
/** What the other finger can hold (the property of a parallel gesture). */
export const HELD = ['strand', 'chip'];

/** [action, gesture, target, mode, what it does, held?] */
export const TABLE = [
  ['take', 'tap', 'point', 'any', 'all switched-on strands start / stop together'],
  ['take-while-held', 'hold', 'point', 'any', 'all switched-on strands record while held'],
  ['ready', 'double-tap', 'point', 'any', 'always ready on / off: starts on motion or sound, stops after the wait'],
  ['waits', 'pinch', 'point', 'any', 'always ready: spread = wait longer before start and stop, pinch = shorter (rings show it)'],
  ['share-last', 'up', 'point', 'any', 'the sharing points as circles: tap = share there, double-tap = always, mini arcs = which strands (share-menu.js)'],
  ['aside-last', 'down', 'point', 'any', 'set the last take aside (it stays, dashed)'],
  ['remove-last', 'down-far', 'point', 'any', 'delete: chips take · strand · part, then share-first · out of similar · out of training'],
  ['scrub', 'hold-slow', 'point', 'line', 'find the moment: the strip spreads, the chips follow the time'],
  ['next', 'left', 'point', 'line', 'next element of the line'],
  ['before', 'right', 'point', 'line', 'element before'],
  ['replay-back', 'left', 'point', 'any', 'watch the take before (plays in the display)'],
  ['replay-on', 'right', 'point', 'any', 'watch the next take; past the newest = live again'],
  ['strand-on-off', 'tap', 'strand', 'any', 'this strand on / off for the point'],
  ['strand-while-held', 'hold', 'strand', 'any', 'record only this strand while held'],
  ['strand-while-held', 'hold', 'live', 'any', 'record only video while held'],
  ['flow', 'drag', 'strand:a>strand:x', 'any', 'connect audio to context: Whisper lets it flow in by itself (drag again = off)'],
  ['flow', 'drag', 'strand:v>strand:x', 'any', 'connect visual to context: suggestions from own modelling (later)'],
  ['similar-from', 'drag', 'strand:x>similar', 'any', 'from context to Similar: find with these words'],
  ['similar-from', 'drag', 'strand>similar', 'any', 'Similar from this strand'],
  ['always-there', 'drag', 'strand>sharing-point', 'any', 'this strand always goes to that sharing point (A onto B = B gets A)'],
  ['chips-in', 'up', 'strand', 'any', 'show the chips of this strand (camera: light, exposure; audio: stereo, Whisper)'],
  ['chips-out', 'down', 'strand', 'any', 'hide the chips of this strand'],
  ['hide-strand', 'left', 'strand', 'any', 'hide this field (it still records when on)'],
  ['photo', 'tap', 'photo', 'any', 'picture instead of video: the point becomes a photo button (tap again = video)'],
  ['focus', 'tap', 'live', 'any', 'focus where tapped'],
  ['zoom', 'pinch', 'live', 'any', 'zoom the camera'],
  ['shape', 'up', 'live', 'any', 'the window: circle → ellipse → rounded rectangle'],
  ['shape', 'down', 'live', 'any', 'the window: back (rounded rectangle → ellipse → circle)'],
  ['switch-camera', 'left', 'live', 'any', 'front / back camera'],
  ['switch-camera', 'right', 'live', 'any', 'front / back camera'],
  ['strands-in', 'edge-in', 'middle-left', 'any', 'show the strand fields (hidden ones come back)'],
  ['similar-in', 'edge-in', 'upper-right', 'any', 'pull Similar onto the display'],
  ['similar-out', 'edge-out', 'upper-right', 'any', 'push Similar off'],
  ['full', 'up', 'top-middle', 'any', 'full screen: only picture and point'],
  ['from-top', 'down', 'top-middle', 'any', 'pulled down from the top: in full screen = everything again, else Similar comes in at the top'],
  ['similar-less', 'up', 'similar-band', 'any', 'push Similar · viele up: full → half → closed'],
  ['similar-all', 'down', 'similar-band', 'any', 'all of Similar onto the chain: the tiles fly into the line one after another'],
  ['line-full', 'double-tap', 'line-arc', 'any', 'this line (a take to review, or from Similar) in full screen'],
  ['context-open', 'down', 'context', 'any', 'pull the context field open (like the line): chips, and writing with the keyboard'],
  ['context-close', 'up', 'context', 'any', 'push it closed again'],
  ['share', 'up', 'item', 'any', 'share to the sharing point in focus (no question)'],
  ['aside', 'down', 'item', 'any', 'set aside'],
  ['remove', 'down-far', 'item', 'any', 'delete: chips share-first · out of similar and shares · out of training'],
  ['after', 'drag', 'item>beside-point', 'any', 'one after another: a new line on top'],
  ['together', 'drag', 'item>point', 'any', 'at the same time: a new line on top'],
  ['chip-on-off', 'tap', 'chip', 'any', 'this context on / off for similar'],
  ['sticky', 'double-tap', 'chip', 'any', 'sticky on / off: in front for the series, a prefix for every take (like double-tap = always elsewhere)'],
  ['context-out', 'down', 'chip', 'any', 'take this context away: a new line on top'],
  ['add-to', 'hold', 'chip', 'any', 'record more strands to this: kept ones solid, new ones dashed → a new combination'],
  ['add-to', 'hold', 'item', 'any', 'record more strands to this element (missing picture, a new version …)'],
  ['next', 'left', 'item', 'any', 'next / another; on hello: go on to join'],
  ['before', 'right', 'item', 'any', 'before'],
  ['settings', 'hold', 'sharing-point', 'any', 'settings and consent of this sharing point'],
  ['take-over', 'tap', 'similar-item', 'any', 'Similar · Doppel: this result above in the same window, the live picture below (14.11.)'],
  ['reference-full', 'double-tap', 'reference', 'any', 'Similar · voll: the result in full screen, to review like a line (↓ from the top = back)'],
  ['reference-out', 'up', 'reference', 'any', 'back to Similar · viele'],
  ['reference-next', 'left', 'reference', 'any', 'the next result'],
  ['reference-before', 'right', 'reference', 'any', 'the result before'],
  // the line in its arc over the point, the chain under it (view/arc.js)
  ['straighten', 'down', 'line-arc', 'any', 'pull the line straight (animated): one row of pictures'],
  ['bend', 'up', 'line-arc', 'any', 'back into the arc'],
  ['levels-open', 'down', 'level', 'any', 'pull the older lines of the chain apart: their pictures show'],
  ['levels-close', 'up', 'level', 'any', 'push them together again'],
  ['level-open', 'tap', 'level', 'any', 'open this older line'],
  ['into-line', 'drag', 'similar-item>point', 'any', 'lay this result on the chain: it flies into the arc, a new line on top'],
  ['into-line', 'drag', 'similar-item>line-arc', 'any', 'the same, dropped on the line'],

  // parallel: the other finger holds a strand (its arc turns green; what it had started alone is dropped)
  ['add-strand', 'tap', 'point', 'any', 'record only the held strand onto the last take: a new combination on top, the rest stays', 'strand'],
  ['share-strand', 'up', 'point', 'any', 'the sharing points, sharing only the held strand of the last take', 'strand'],
  ['remove-strand', 'down-far', 'point', 'any', 'delete only the held strand of the last take (chips as always)', 'strand'],
  ['similar-from', 'edge-in', 'upper-right', 'any', 'Similar from the held strand', 'strand'],
  // parallel: the other finger holds a chip
  ['take-with-context', 'tap', 'point', 'any', 'a take with the held context; tap again = next take of the series, as long as it is held', 'chip'],
  ['similar-context', 'edge-in', 'upper-right', 'any', 'Similar for the held context', 'chip'],
];

/** Intent × keyword (Initial §4.2): saying it does the same as the gesture. */
export const VOICE = {
  take: 'Start', next: 'Weiter', before: 'Zurück', scrub: 'Marker', after: 'Zusammenfügen',
  'remove-last': 'Alle löschen', 'share-last': 'Senden', share: 'Senden', full: 'Vollbild',
};

const rows = TABLE.map(([action, gesture, target, mode, what, held = null]) => ({ action, gesture, target, mode, what, held }));

const find = (gesture, target, mode, held) => rows.find((r) => r.gesture === gesture && r.target === target && r.mode === mode && r.held === held);

/**
 * What does this gesture do here? → row or null. held: 'strand' | 'chip' | null (what the other finger holds).
 * Order: parallel row in this mode, parallel row in any mode, then the gesture alone (mode, any).
 */
export function actionFor({ gesture, target, mode = 'take', held = null }) {
  const parallel = held ? find(gesture, target, mode, held) ?? find(gesture, target, 'any', held) : null;
  return parallel ?? find(gesture, target, mode, null) ?? find(gesture, target, 'any', null) ?? null;
}

/** Problems of the table: unknown gestures, modes or properties, two actions for one (gesture, target, mode, held). */
export function checkTable() {
  const seen = new Map();
  const problems = [];
  for (const r of rows) {
    if (!GESTURES.includes(r.gesture)) problems.push(`unknown gesture: ${r.gesture}`);
    if (!MODES.includes(r.mode)) problems.push(`unknown mode: ${r.mode}`);
    if (r.held && !HELD.includes(r.held)) problems.push(`unknown property: ${r.held}`);
    const k = `${r.gesture}|${r.target}|${r.mode}|${r.held ?? ''}`;
    if (seen.has(k)) problems.push(`two actions for ${k}: ${seen.get(k)}, ${r.action}`);
    seen.set(k, r.action);
  }
  return problems;
}

/** Help as rows for one target (the UI shows it while something is held). */
export const helpFor = (target) => rows.filter((r) => r.target === target || r.target.startsWith(`${target}:`) || r.target.startsWith(`${target}>`));

/** What the other hand can do while this property is held (help and hints while holding). */
export const whileHeld = (held) => rows.filter((r) => r.held === held);
