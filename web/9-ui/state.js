// state.js — what the screen is doing, as a plain automaton: state + event → next state. No DOM.
//
// Purpose:   the states of the canvas "Sign · Geste Overview" (one view file draws them: ring, later
//            threads/layers/glasses). Events are the actions of gestures.js plus what the device
//            reports (motion, still, saved, stream …). The same events come from touch, keywords
//            (VOICE) or later glasses, so this file never changes for a new device.
//              screen   rest · wait · record · toText · search · line · pick · share · delete · add · stream
//              line     play · spread · nextPrev · scrub        share   hello · join · own
//              stream   live · seg · people                     overlays: full, similar (both any time)
//            fields: v a x l each 'on' | 'off'; in add also 'keep' (an existing strand stays) and 'new'
//            (recorded again); saving add = a new combination on top, the old one stays below.
// Depends:   nothing
// Test:      tests/state.test.mjs
// Limits:    pure and synchronous; one event < 1 µs; unknown events leave the state as it is.

export const KINDS = ['v', 'a', 'x', 'l'];

export const START = Object.freeze({ screen: 'rest', sub: null, mode: 'take', full: false, similar: false, held: false, ready: false,
  fields: Object.freeze({ v: 'on', a: 'on', x: 'on', l: 'on' }), base: null, aside: false });

const go = (s, screen, more = {}) => ({ ...s, screen, sub: null, held: false, only: null, ...more });
const cycle = (f, add) => (add ? { keep: 'new', new: 'off', off: 'keep', on: 'new' }[f] : f === 'on' ? 'off' : 'on');

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
    case 'similar-out': return { ...s, similar: false, mode: s.screen === 'search' ? 'take' : s.mode, ...(s.screen === 'search' ? { screen: 'rest' } : {}) };
    case 'strand-on-off': return { ...s, fields: { ...s.fields, [e.kind]: cycle(s.fields[e.kind], s.screen === 'add') } };
  }
  if (s.screen === 'record') {
    if (a === 'take' || (a === 'release' && s.held) || (a === 'still' && s.ready)) return { ...s, held: false, sub: 'saving' };
    if (a === 'saved') return go(s, s.ready ? 'wait' : 'rest', { base: null });
    return s;
  }
  switch (a) {
    case 'take': return go(s, 'record');
    case 'take-while-held': return go(s, 'record', { held: true });
    case 'strand-while-held': return go(s, 'record', { held: true, only: e.kind ?? 'v' });
    case 'ready': return s.ready ? go(s, 'rest', { ready: false }) : go(s, 'wait', { ready: true });
    case 'motion': return s.screen === 'wait' ? go(s, 'record') : s;
    case 'transcribe': return go(s, 'toText');
    case 'search-from': return go(s, 'search', { mode: 'search', similar: true, fields: Object.fromEntries(KINDS.map((k) => [k, (e.kinds ?? KINDS).includes(k) ? 'on' : 'off'])) });
    case 'share-last': return go(s, 'pick');
    case 'share-to': return go(s, 'rest');
    case 'share-menu': return go(s, 'share', { sub: 'own' });
    case 'share-menu-out': return go(s, 'rest');
    case 'hello': return { ...go(s, 'share'), sub: 'hello' };
    case 'next': return s.screen === 'share' && s.sub === 'hello' ? { ...s, sub: 'join' } : s.mode === 'line' ? { ...s, screen: 'line', sub: 'nextPrev' } : s;
    case 'before': return s.mode === 'line' ? { ...s, screen: 'line', sub: 'nextPrev' } : s;
    case 'joined': return { ...go(s, 'share'), sub: 'own' };
    case 'aside-last': return go(s, 'rest', { aside: true });
    case 'remove-last': case 'remove': return go(s, 'delete');
    case 'done': return go(s, s.mode === 'line' ? 'line' : 'rest', s.mode === 'line' ? { sub: 'play' } : {});
    case 'replay-back': case 'replay-on': return go(s, 'line', { mode: 'line', sub: 'play' });
    case 'after': case 'together': return go(s, 'line', { mode: 'line', sub: 'play', edits: (s.edits ?? 0) + 1 });
    case 'scrub': return s.mode === 'line' ? { ...s, screen: 'line', sub: 'scrub', held: true } : s;
    case 'release': return s.sub === 'scrub' ? { ...s, sub: 'play', held: false } : s;
    case 'spread': return s.mode === 'line' ? { ...s, screen: 'line', sub: 'spread' } : s;
    case 'add-to': {
      const has = e.kinds ?? [];
      return go(s, 'add', { base: e.base ?? null, fields: Object.fromEntries(KINDS.map((k) => [k, has.includes(k) ? 'keep' : 'new'])) });
    }
    case 'stream': return { ...go(s, 'stream'), sub: 'live' };
    case 'segment': return s.screen === 'stream' ? { ...s, sub: 'seg' } : s;
    case 'people': return s.screen === 'stream' ? { ...s, sub: 'people' } : s;
    case 'stream-stop': return go(s, 'rest');
    default: return s;
  }
}

/** What the point records now: the fields that are 'on' or 'new' (add keeps the 'keep' ones by reference). */
export const toRecord = (s) => (s.only ? [s.only] : KINDS.filter((k) => s.fields[k] === 'on' || s.fields[k] === 'new'));
export const toKeep = (s) => KINDS.filter((k) => s.fields[k] === 'keep');

/** The canvas name of a state (Design · Geste Overview), to compare drawing and design one to one. */
export function canvasStep(s) {
  if (s.full && s.screen === 'rest') return 'full';
  const map = { rest: 'rest', wait: 'wait', record: 'retry', toText: 'toText', search: 'search', pick: 'own', delete: 'delete', add: 'retry' };
  if (s.screen === 'line') return { play: 'playlist', spread: 'spread', nextPrev: 'nextPrev', scrub: 'scrub' }[s.sub] ?? 'playlist';
  if (s.screen === 'share') return s.sub ?? 'own';
  if (s.screen === 'stream') return { live: 'stream', seg: 'streamSeg', people: 'streamPeople' }[s.sub] ?? 'stream';
  if (s.screen === 'rest' && s.similar) return 'simIn';
  return map[s.screen] ?? 'rest';
}
