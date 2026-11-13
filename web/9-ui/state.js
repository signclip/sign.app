// state.js — what the screen is doing, as a plain automaton: state + event → next state. No DOM.
//
// Purpose:   the states of the canvas "Sign · Geste Overview" (one view file draws them: ring, later
//            threads/layers/glasses). Events are the actions of gestures.js plus what the device
//            reports (motion, still, saved, stream …). The same events come from touch, keywords
//            (VOICE) or later glasses, so this file never changes for a new device.
//              screen   rest · wait · record · toText · similar · line · pick · share · delete · add · stream
//              line     play · spread · nextPrev · scrub        share   hello · join · own
//              stream   live · seg · people                     overlays: full, similar (both any time)
//            fields: v a x l each 'on' | 'off', ONE selection for everything (decided 08.11.): the point,
//            always-ready and adding to an element all record the 'on' ones; it stays as chosen (settings.auto)
//            until changed. Adding to an element: what it has and is 'off' is kept (solid), what is 'on' is
//            recorded new (dashed) → a new combination on top, the old one stays below. So: only picture on,
//            then chip after chip: tap, hold, record — each gets a new picture, the rest stays.
//            property (parallel gestures): hold = { target: 'strand', kind } | { target: 'chip', text } | null.
//            When a second finger comes, what the hold started alone (a take of only that strand, adding
//            to a chip) is undone and the held thing becomes the property of the other finger's action.
// Depends:   nothing
// Test:      tests/state.test.mjs
// Limits:    pure and synchronous; one event < 1 µs; unknown events leave the state as it is.

export const KINDS = ['v', 'a', 'x', 'l'];

/** Start from the kept selection (settings.auto). */
export const startState = (on = KINDS) => Object.freeze({ screen: 'rest', sub: null, mode: 'take', full: false, similar: false, held: false, ready: false,
  fields: Object.freeze(Object.fromEntries(KINDS.map((k) => [k, on.includes(k) ? 'on' : 'off']))), base: null, has: [], aside: false, hold: null });
export const START = startState();

const go = (s, screen, more = {}) => ({ ...s, screen, sub: null, held: false, only: null, ...more });

/**
 * The next state. event: { action } from gestures.js, or a device event { action: 'motion' | 'still' |
 * 'release' | 'saved' | 'done' | 'hello' | 'joined' | 'stream' | 'segment' | 'people' | 'stream-stop' },
 * with kind (strand-on-off), base and kinds (add-to: the strands the element already has).
 */
export function next(s, e) {
  const a = e.action;
  switch (a) {
    case 'full': return { ...s, full: true };
    case 'unfull': return { ...s, full: false };
    case 'similar-in': return { ...s, similar: true };
    case 'similar-out': return { ...s, similar: false, mode: s.screen === 'similar' ? 'take' : s.mode, ...(s.screen === 'similar' ? { screen: 'rest' } : {}) };
    case 'strand-on-off': return { ...s, fields: { ...s.fields, [e.kind]: s.fields[e.kind] === 'on' ? 'off' : 'on' } };
    case 'hold-property': { // a second finger came: the held thing is a property now, its own start is undone
      const alone = (s.screen === 'record' && s.held) || s.screen === 'add';
      return alone ? go(s, s.ready ? 'wait' : 'rest', { hold: e.hold, base: null, has: [] }) : { ...s, hold: e.hold };
    }
    case 'release-property': return { ...s, hold: null };
  }
  if (s.screen === 'record') {
    if (a === 'take' || (a === 'release' && s.held) || (a === 'still' && s.ready)) return { ...s, held: false, sub: 'saving' };
    if (a === 'saved') return go(s, s.ready ? 'wait' : 'rest', { base: null, has: [] });
    return s;
  }
  switch (a) {
    case 'take': return go(s, 'record', s.screen === 'add' ? { base: s.base, has: s.has } : { base: null, has: [] });
    case 'take-with-context': return go(s, 'record', { base: null, has: [] }); // the context comes from the held chip
    case 'add-strand': return go(s, 'record', { base: e.base ?? null, has: e.kinds ?? [], only: e.kind ?? null });
    case 'take-while-held': return go(s, 'record', { held: true });
    case 'strand-while-held': return go(s, 'record', { held: true, only: e.kind ?? 'v' });
    case 'ready': return s.ready ? go(s, 'rest', { ready: false }) : go(s, 'wait', { ready: true });
    case 'motion': return s.screen === 'wait' ? go(s, 'record') : s;
    case 'transcribe': return go(s, 'toText');
    case 'similar-from': return go(s, 'similar', { mode: 'similar', similar: true, fields: Object.fromEntries(KINDS.map((k) => [k, (e.kinds ?? KINDS).includes(k) ? 'on' : 'off'])) });
    case 'share-last': case 'share-strand': return go(s, 'pick');
    case 'similar-context': return go(s, 'similar', { mode: 'similar', similar: true });
    case 'share-to': return go(s, 'rest');
    case 'share-menu': return go(s, 'share', { sub: 'own' });
    case 'share-menu-out': return go(s, 'rest');
    case 'hello': return { ...go(s, 'share'), sub: 'hello' };
    case 'next': return s.screen === 'share' && s.sub === 'hello' ? { ...s, sub: 'join' } : s.mode === 'line' ? { ...s, screen: 'line', sub: 'nextPrev' } : s;
    case 'before': return s.mode === 'line' ? { ...s, screen: 'line', sub: 'nextPrev' } : s;
    case 'joined': return { ...go(s, 'share'), sub: 'own' };
    case 'aside-last': return go(s, 'rest', { aside: true });
    case 'remove-last': case 'remove': case 'remove-strand': return go(s, 'delete');
    case 'done': return go(s, s.mode === 'line' ? 'line' : 'rest', s.mode === 'line' ? { sub: 'play' } : {});
    case 'replay-back': case 'replay-on': return go(s, 'line', { mode: 'line', sub: 'play' });
    case 'after': case 'together': return go(s, 'line', { mode: 'line', sub: 'play', edits: (s.edits ?? 0) + 1 });
    case 'scrub': return s.mode === 'line' ? { ...s, screen: 'line', sub: 'scrub', held: true } : s;
    case 'release': return s.sub === 'scrub' ? { ...s, sub: 'play', held: false } : s;
    case 'spread': return s.mode === 'line' ? { ...s, screen: 'line', sub: 'spread' } : s;
    case 'add-to': return go(s, 'add', { base: e.base ?? null, has: e.kinds ?? [] }); // the selection stays as it is
    case 'stream': return { ...go(s, 'stream'), sub: 'live' };
    case 'segment': return s.screen === 'stream' ? { ...s, sub: 'seg' } : s;
    case 'people': return s.screen === 'stream' ? { ...s, sub: 'people' } : s;
    case 'stream-stop': return go(s, 'rest');
    default: return s;
  }
}

/** What the point records now: the 'on' fields (or the one held). */
export const toRecord = (s) => (s.only ? [s.only] : KINDS.filter((k) => s.fields[k] === 'on'));
/** Adding to an element: what it has and is not recorded again stays, by reference. */
export const toKeep = (s) => KINDS.filter((k) => s.has.includes(k) && !toRecord(s).includes(k));
/** The strands an action on the last take is about: the held strand, else the 'on' ones. */
export const toUse = (s) => (s.hold?.target === 'strand' ? [s.hold.kind] : toRecord(s));
/** How a field is drawn: 'hold' (the property of the other finger) · 'new' dashed (will be recorded) · 'keep' solid · 'off' grey. */
export function look(s, k) {
  if (s.hold?.target === 'strand' && s.hold.kind === k) return 'hold';
  if (s.only) return s.only === k ? 'new' : s.has.includes(k) ? 'keep' : 'off';
  return s.fields[k] === 'on' ? 'new' : s.has.includes(k) ? 'keep' : 'off';
}

/** The canvas name of a state (Design · Geste Overview), to compare drawing and design one to one. */
export function canvasStep(s) {
  if (s.full && s.screen === 'rest') return 'full';
  const map = { rest: 'rest', wait: 'wait', record: 'retry', toText: 'toText', similar: 'search' /* the canvas calls it so */, pick: 'own', delete: 'delete', add: 'retry' };
  if (s.screen === 'line') return { play: 'playlist', spread: 'spread', nextPrev: 'nextPrev', scrub: 'scrub' }[s.sub] ?? 'playlist';
  if (s.screen === 'share') return s.sub ?? 'own';
  if (s.screen === 'stream') return { live: 'stream', seg: 'streamSeg', people: 'streamPeople' }[s.sub] ?? 'stream';
  if (s.screen === 'rest' && s.similar) return 'simIn';
  return map[s.screen] ?? 'rest';
}
