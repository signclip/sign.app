// gestures.js — the one table of gestures (DESIGN R9) and its grammar (DESIGN §4, 15.11.): what × do × onto.
//
// Purpose:   help, hints and tests come from this table; a new action = one row, no code change.
//            A gesture is a sentence: WHAT = where the finger starts (or what the first finger holds: the prefix,
//            as in the notation) · DO = the movement (a verb, the same for every what) · ONTO = where it ends.
//            The screen is the model in space: ← → the line (left the oldest; the thing follows the finger, so ←
//            brings the later one), ↑ ↓ the chain, spread / squeeze the scale (moment … take … line … chain … Similar:
//            spread over the free part above the take = Similar comes nearer, like a far planet; squeeze = it goes).
//            Edge rule: what crosses the window's edge leaves the room (↑ out = share, ↓ out = delete); a pull from
//            the screen's edge brings in. Spread / squeeze without a held thing only changes the view; one finger
//            holds a thing and the other pulls (stretch) = the thing changes. Holding a strand, chip or the picture
//            only grips it (green); only the point records.
//            No labels on screen (decided 08.11.): the help shows while something is held.
//            Intent × device: VOICE = the keyword for an action (Initial §4.2); glasses later as one more map.
//            Parallel (DESIGN principle 4): the sixth column `held` says which property the row needs; rows without
//            it are the gesture alone. A held property never blocks: with no parallel row the gesture does what it
//            does alone.
// Depends:   nothing
// Test:      tests/ui.test.mjs, tests/parallel.test.mjs (checkTable, checkGrammar)
// Limits:    a lookup is a scan of ~75 rows (< 1 µs); each (gesture, target, mode, held) means one action;
//            one property at a time (two fingers; a third is ignored).

export const GESTURES = ['tap', 'double-tap', 'hold', 'up', 'down', 'up-out', 'down-out', 'left', 'right', 'edge-in', 'edge-out', 'drag', 'pinch', 'spread', 'squeeze', 'stretch'];
export const MODES = ['take', 'similar', 'line', 'any'];
/** What the other finger can hold (the property of a parallel gesture). */
export const HELD = ['strand', 'chip', 'live', 'item'];

/** The verbs: one meaning per movement, for every what (help and onboarding teach these, not the rows). */
export const VERBS = {
  tap: 'now: record, on / off, play, fill a gap',
  hold: 'while held (the point records) · a strand, chip or the picture: grip it',
  'double-tap': 'always: lasting on / off',
  left: 'later: the next one comes from the right',
  right: 'earlier: the one before comes from the left',
  up: 'move up inside the window (chain, piles)',
  down: 'move down inside the window · on a thing: set aside',
  'up-out': 'out over the upper edge: share',
  'down-out': 'out over the lower edge: delete (chips)',
  drag: 'A onto B: A flows to B',
  pinch: 'zoom the view, continuous',
  spread: 'nearer / more of it (view only)',
  squeeze: 'farther / less of it (view only)',
  stretch: 'one finger holds a thing, the other pulls: the thing changes',
  'edge-in': 'from the screen edge: bring in',
  'edge-out': 'to the screen edge: push away',
};

/** [action, gesture, target, mode, what it does, held?] */
export const TABLE = [
  // the point: records; the edge rule on it
  ['take', 'tap', 'point', 'any', 'all switched-on strands start; during a take pause / go on (saved by ← → ↑ on the point) · in the line: play / pause that take (16.11.)'],
  ['take-while-held', 'hold', 'point', 'any', 'all switched-on strands record while held; in the line: live at once, then it records (16.11.)'],
  ['ready', 'double-tap', 'point', 'any', 'always ready on / off: starts on motion or sound, stops after the wait'],
  ['waits', 'pinch', 'point', 'any', 'two fingers on the point: across = in the line the button widens to the golden section (slide = search the moment, the middle is now; pulled on past it = cut there), else into the time · up-down = the waits longer / shorter (16.11.)'],
  ['share-last', 'up-out', 'point', 'any', 'out over the upper edge: the sharing points as circles, tap = share there'],
  ['aside-last', 'down', 'point', 'any', 'set the last take aside (it stays, dashed)'],
  ['remove-last', 'down-out', 'point', 'any', 'out over the lower edge: delete, chips take · strand · part, then share-first · out of similar · out of training'],
  ['next', 'left', 'point', 'line', 'the next (later) element of the line comes from the right'],
  ['before', 'right', 'point', 'line', 'the element before comes from the left'],
  ['replay-on', 'left', 'point', 'any', 'the next take comes from the right; past the newest = live again'],
  ['replay-back', 'right', 'point', 'any', 'the take before comes from the left (plays in the display)'],
  // strands: tap on/off, hold = grip
  ['strand-on-off', 'tap', 'strand', 'any', 'this strand on / off for the point'],
  ['grip', 'hold', 'strand', 'any', 'grip this strand: it turns green, the other finger acts on it; carried = dragged'],
  ['flow', 'drag', 'strand:a>strand:x', 'any', 'connect audio to context: Whisper lets it flow in by itself (drag again = off)'],
  ['flow', 'drag', 'strand:v>strand:x', 'any', 'connect visual to context: suggestions from own modelling (later)'],
  ['similar-from', 'drag', 'strand:x>similar', 'any', 'from context to Similar: find with these words'],
  ['similar-from', 'drag', 'strand>similar', 'any', 'Similar from this strand'],
  ['always-there', 'drag', 'strand>sharing-point', 'any', 'this strand always goes to that sharing point (A onto B = B gets A)'],
  ['chips-in', 'spread', 'strand', 'any', 'open the chips of this strand (camera: light, exposure; audio: stereo, Whisper)'],
  ['chips-out', 'squeeze', 'strand', 'any', 'close the chips of this strand'],
  ['hide-strand', 'left', 'strand', 'any', 'push this field to the edge (it still records when on)'],
  ['context-open', 'tap', 'bottom-zone', 'any', 'tap anywhere under the take: the arc straightens, write at once (15.11.)'],
  // the picture
  ['photo', 'tap', 'photo', 'any', 'picture instead of video: the point becomes a photo button (tap again = video)'],
  ['focus', 'tap', 'live', 'any', 'focus where tapped'],
  ['grip', 'hold', 'live', 'any', 'grip the picture (the visual strand): the other finger acts on it'],
  ['zoom', 'pinch', 'live', 'any', 'two fingers on the picture: the camera nearer / farther'],
  ['split', 'stretch', 'item', 'any', 'a take of the line held, the other finger pulls away from it: past the mark (a line across it shows) it is two parts, cut in its middle (15.11.)', 'item'],
  ['join', 'stretch', 'item>item', 'any', 'two takes held, pushed together: one after the other in a new line (15.11.)', 'item'],
  ['form', 'stretch', 'live', 'any', 'picture held, the other finger pulls: across = narrower / wider · up-down = lower / higher · slanted = squarer / rounder', 'live'],
  ['switch-camera', 'left', 'live', 'any', 'the other camera slides in (front / back), also during a take: the picture changes, the sound goes on'],
  ['switch-camera', 'right', 'live', 'any', 'the same, the other way'],
  // edges: bring in, push away
  ['strands-in', 'edge-in', 'middle-left', 'any', 'show the strand fields (hidden ones come back)'],
  ['share-in', 'edge-in', 'middle-right', 'any', 'pull the sharing points in'],
  ['share-out', 'edge-out', 'middle-right', 'any', 'push them off'],
  // the scale: Similar lies outside, like far planets
  ['similar-nearer', 'spread', 'top-zone', 'any', 'spread over the free part above the take: Similar comes nearer (closed → half → full) – the only way it appears (16.11.: no edge, no pull)'],
  ['similar-nearer', 'spread', 'similar-band', 'any', 'spread over the cloud: bigger, more results; moved while pinching = it moves (16.11.)'],
  ['similar-farther', 'squeeze', 'similar-band', 'any', 'squeeze the cloud: smaller; small enough = it flies away to the upper right (16.11.: the only way to close it, besides Back)'],
  ['similar-farther', 'squeeze', 'top-zone', 'any', 'squeeze above the take: Similar goes'],
  ['similar-all', 'drag', 'similar-band>point', 'any', 'all of Similar onto the chain: the tiles fly into the line one after another'],
  ['take-over', 'tap', 'similar-item', 'any', 'Similar · Doppel: this result above in the same window, the live picture below'],
  ['take-over', 'spread', 'similar-item', 'any', 'fly to this result: it comes into the window (Doppel)'],
  ['into-line', 'drag', 'similar-item>point', 'any', 'lay this result on the chain: it flies into the arc, a new line on top'],
  ['into-line', 'drag', 'similar-item>line-arc', 'any', 'the same, dropped on the line'],
  ['reference-out', 'squeeze', 'reference', 'any', 'farther: back to Similar · viele'],
  ['reference-next', 'left', 'reference', 'any', 'the next result comes from the right'],
  ['reference-before', 'right', 'reference', 'any', 'the result before comes from the left'],
  ['look-up', 'up', 'reference', 'any', 'admin, a pile in Doppel: on a pile (hello → join → within, quiet → within)'],
  ['look-down', 'down', 'reference', 'any', 'admin, a pile in Doppel: back a pile (hello → quiet, join → hello anew; within: the sharing menu opens, a tap on quiet = account off)'],
  // the line in its arc over the point, the chain under it (view/arc.js): opened and closed by the scale
  ['line-choose', 'tap', 'line-arc', 'any', 'tap on the line (between its takes): chosen, outlined – now ↑ on the point = the context just recorded onto every take of the line, ↓ = that context out of all of them; then it is unchosen (16.11.)'],
  ['line-go', 'tap', 'item', 'any', 'tap on a take of the line: it slides into the point and plays (16.11.)'],
  ['line-zoom', 'pinch', 'line-arc', 'any', 'two fingers on the line: the takes apart (bigger) / together (smaller), continuous'],
  ['line-zoom', 'pinch', 'item', 'any', 'the same, starting on a take of the line'],
  ['straighten', 'spread', 'line-arc', 'any', 'spread further when the takes are as far apart as they go: the take opens as its timeline; spread on there = cut at the point (16.11.)'],
  ['bend', 'squeeze', 'line-arc', 'any', 'squeeze further when they are as close as they go: the two takes under the fingers become one (16.11.)'],
  ['levels-open', 'spread', 'level', 'any', 'spread the older lines of the chain apart: their pictures show'],
  ['levels-close', 'squeeze', 'level', 'any', 'push them together again'],
  ['level-open', 'tap', 'level', 'any', 'open this older line'],
  // an element of the line
  ['share', 'up-out', 'item', 'any', 'out over the upper edge: share to the sharing point in focus (no question)'],
  ['aside', 'down', 'item', 'any', 'set aside'],
  ['remove', 'down-out', 'item', 'any', 'out over the lower edge: delete, chips share-first · out of similar and shares · out of training'],
  ['after', 'drag', 'item>line-arc', 'any', 'onto the line: one after another, a new line on top'],
  ['together', 'drag', 'item>point', 'any', 'onto the point: at the same time, a new line on top'],
  ['add-to', 'hold', 'item', 'any', 'record more strands to this element (missing picture, a new version …)'],
  ['next', 'left', 'item', 'any', 'next (later); on hello: go on to join'],
  ['before', 'right', 'item', 'any', 'before'],
  // a chip
  ['chip-on-off', 'tap', 'chip', 'any', 'what is written in the take always searches in Similar (context first, sound and picture later); a tap takes this word out of the search / in again (16.11.)'],
  ['write-here', 'tap', 'queue', 'any', 'a chip or bubble in the row below the take: the field opens, what is written goes behind it (into a bubble: as its last element); tap under the row = at the end (15.11.)'],
  ['chips-later', 'left', 'chip', 'any', 'a long chip row: the later ones come in from the right (15.11.)'],
  ['chips-earlier', 'right', 'chip', 'any', 'a long chip row: the earlier ones come back from the left (15.11.)'],
  ['sticky', 'double-tap', 'chip', 'any', 'sticky on / off: in front for the series, a prefix for every take'],
  ['context-out', 'down', 'chip', 'any', 'take this context away: from what is being written, or from the saved take as a new line on top (16.11.)'],
  ['context-out', 'down-out', 'chip', 'any', 'the same, the finger ending below the window (the chips lie at its lower edge)'],
  ['grip', 'hold', 'chip', 'any', 'grip this context: the other finger records or finds with it'],

  // parallel: the other finger holds a strand (its arc turns green)
  ['add-strand', 'tap', 'point', 'any', 'record only the held strand onto the last take: a new combination on top, the rest stays', 'strand'],
  ['strand-while-held', 'hold', 'point', 'any', 'record only the held strand while the point is held', 'strand'],
  ['share-strand', 'up-out', 'point', 'any', 'the sharing points, sharing only the held strand of the last take', 'strand'],
  ['remove-strand', 'down-out', 'point', 'any', 'delete only the held strand of the last take (chips as always)', 'strand'],
  // parallel: the other finger holds a chip
  ['take-with-context', 'tap', 'point', 'any', 'a take with the held context; tap again = next take of the series, as long as it is held', 'chip'],
];

/** Named exceptions to the grammar, each with its reason (DESIGN §4: new ones only with approve). */
export const EXCEPTIONS = [
  ['left', 'live', 'the cameras lie side by side (front, back, later glasses): ← → on the picture = the next source (15.11.)'],
  ['right', 'live', 'the same'],
  ['left', 'strand', 'a field pushed to its edge, not a step in time'],
];

/** Intent × keyword (Initial §4.2): saying it does the same as the gesture. */
export const VOICE = {
  take: 'Start', next: 'Weiter', before: 'Zurück', after: 'Zusammenfügen',
  'remove-last': 'Alle löschen', 'share-last': 'Senden', share: 'Senden',
};

const rows = TABLE.map(([action, gesture, target, mode, what, held = null]) => ({ action, gesture, target, mode, what, held }));

const find = (gesture, target, mode, held) => rows.find((r) => r.gesture === gesture && r.target === target && r.mode === mode && r.held === held);

/**
 * What does this gesture do here? → row or null. held: 'strand' | 'chip' | 'live' | null (what the other finger holds).
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

// what each verb may do (the grammar, checked)
const LATER = ['next', 'replay-on', 'reference-next', 'chips-later'];
const EARLIER = ['before', 'replay-back', 'reference-before', 'chips-earlier'];
const OUT = ['share', 'share-last', 'share-strand'];
const BACK = ['similar-farther']; // pushed back over the edge it came from
const AWAY = ['remove', 'remove-last', 'remove-strand'];
const ALWAYS = ['ready', 'sticky'];
const VIEW = ['similar-nearer', 'similar-farther', 'take-over', 'reference-out', 'straighten', 'bend', 'levels-open', 'levels-close', 'chips-in', 'chips-out', 'context-open', 'context-close'];
const CONTENT = ['point', 'item'];

/** Rows that break the grammar (and are no named exception) → list of problems; [] = consistent. */
export function checkGrammar() {
  const excepted = (r) => EXCEPTIONS.some(([g, t]) => g === r.gesture && t === r.target);
  const rule = {
    left: (r) => LATER.includes(r.action),
    right: (r) => EARLIER.includes(r.action),
    'up-out': (r) => OUT.includes(r.action) || BACK.includes(r.action),
    'down-out': (r) => !CONTENT.includes(r.target) || AWAY.includes(r.action),
    'double-tap': (r) => ALWAYS.includes(r.action),
    hold: (r) => !['strand', 'chip', 'live'].includes(r.target) || r.action === 'grip',
    spread: (r) => VIEW.includes(r.action),
    squeeze: (r) => VIEW.includes(r.action),
    stretch: (r) => Boolean(r.held),
  };
  return rows.filter((r) => rule[r.gesture] && !rule[r.gesture](r) && !excepted(r)).map((r) => `${r.gesture} on ${r.target} does ${r.action}`);
}

/** Help as rows for one target (the UI shows it while something is held). */
export const helpFor = (target) => rows.filter((r) => r.target === target || r.target.startsWith(`${target}:`) || r.target.startsWith(`${target}>`));

/** What the other hand can do while this property is held (help and hints while holding). */
export const whileHeld = (held) => rows.filter((r) => r.held === held);
