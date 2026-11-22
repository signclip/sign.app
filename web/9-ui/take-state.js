// take-state.js — what the screen is doing, as a plain reducer: state + event → next state. No DOM, no devices.
//
// Purpose:   the one module that knows the take window, the button, the line, the context row, Similar and the
//            sharing menu at the same time, so a gesture can be checked against all of it (tests). The devices (camera,
//            files) are app.js; it reads the state and does what changed. Events:
//              strand {kind}        an arc tapped: that strand on/off (visual off = the picture fades out)
//              form {round, aspect} the window's form (double tap on the picture, two fingers with one still)
//              rec {to}             'recording' | 'paused' | 'idle' (what the recorder did)
//              took {take}          a take kept (← on the button): onto the line, left of the button; the series moves on
//              discard              ↓ far on the button: the take is dropped, the button starts fresh
//              clear-context        ↓ a little on the button: the context of the take goes
//              step {dir}           ← / → on the button: the next / the one before on the line · at {at} a take tapped
//              select-line {n}      tap the line or an older line's arc: chosen (outlined) / not chosen
//              lines {lines}        joined, cut, put on, taken off (line.js)
//              wide {spread, ms}    the button spread across: a window into the take, ms = the moment in its middle
//              context {text}  sticky {text}  typing {on}  caret {at}  keyboard {px}
//              similar {level}  pick {key}  filters {filters}       share {open}       onboard {patch}
//              show-line {n}        an older line to the button (the fan, 22.11.)
//              choose {what}        what goes over with ↑ on Similar's side (21.11., user): 'cloud' · 'element' · null =
//                                   the take's side (the take in the button, a chosen line, else ready). The last touched counts.
// Depends:   line.js, similar-view.js, chips.js
// Test:      tests/ui.test.mjs
// Limits:    synchronous, < 1 µs per event; unknown events return the same state.

import { noLines, addTake } from './line.js';
import { noFilters } from './similar-view.js';
import { afterOne } from './chips.js';

export const initial = () => Object.freeze({
  rec: 'idle', form: { round: 0, aspect: 1 }, // the window's form (form.js), standard the 1:1 rectangle (20.11., user); a take is always recorded 1:1
  strands: { v: true, a: true, x: true },
  dstrands: { v: true, x: true, a: false }, // what the single view shows and plays (20.11.): picture, context; sound only when chosen (two pictures at once)
  lines: noLines(), at: 0, chosenLine: null,
  wide: 0, wideMs: 0,
  context: '', sticky: '', typing: false, caret: null, keyboard: 0,
  similar: 'closed', pick: null, filters: noFilters(), sel: null, // sel: Similar's side chosen (choose)
  share: false,
  onboard: { on: false, dropped: false, name: '', nameSign: false, gestures: 0, ownTyped: false },
});

const openLine = (s) => s.lines.at(-1);
/** The number of takes on the open line. */
export const count = (s) => openLine(s).takes.length;
/** Is the button on the live take (not looking at an earlier one)? */
export const live = (s) => s.at >= count(s);

export function next(s, e) {
  switch (e.type) {
    case 'strand': return { ...s, strands: { ...s.strands, [e.kind]: !s.strands[e.kind] } };
    case 'dstrand': return { ...s, dstrands: { ...s.dstrands, [e.kind]: !s.dstrands[e.kind] } };
    case 'form': return { ...s, form: { round: e.round ?? s.form.round, aspect: e.aspect ?? s.form.aspect } };
    case 'rec': return { ...s, rec: e.to, ...(e.to === 'recording' ? { at: count(s), wide: 0, sel: null } : {}) };
    case 'took': {
      const lines = addTake(s.lines, e.take, s.sticky);
      const n = lines.at(-1).takes.length;
      return { ...s, lines, at: s.rec === 'idle' || s.at >= n - 1 ? n : s.at, context: afterOne(s.context), wide: 0, caret: null }; // rec stays: the next take may run already (17.11.)
    }
    case 'discard': return { ...s, rec: 'idle', wide: 0 };
    case 'clear-context': return { ...s, context: '', caret: null };
    case 'step': {
      const n = count(s), at = e.dir === 'left' ? Math.min(n, s.at + 1) : e.dir === 'right' ? Math.max(0, s.at - 1) : s.at;
      return { ...s, at, wide: 0, sel: null };
    }
    case 'at': return { ...s, at: Math.max(0, Math.min(count(s), e.at)), wide: 0, sel: null };
    case 'select-line': return { ...s, chosenLine: s.chosenLine === e.n ? null : e.n, sel: null };
    case 'show-line': { // an older line chosen in the fan (22.11., user): it comes to the button – nothing written until it changes
      if (!(e.n >= 0 && e.n < s.lines.length - 1)) return s;
      const lines = [...s.lines], [l] = lines.splice(e.n, 1);
      lines.push(l);
      return { ...s, lines, at: l.takes.length, chosenLine: null, sel: null, wide: 0 };
    }
    case 'choose': return { ...s, sel: e.what ?? null, ...(e.what ? { chosenLine: null } : {}) }; // one thing chosen at a time: Similar's side or the take's
    case 'lines': return { ...s, lines: e.lines, at: Math.min(s.at, e.lines.at(-1).takes.length) };
    case 'wide': return { ...s, wide: Math.max(0, e.spread), wideMs: e.ms ?? s.wideMs, wideZoom: e.spread > 0 ? e.zoom ?? s.wideZoom ?? 1 : 1 }; // zoom: finer in time (20.11.), back to 1 when closed
    case 'context': return { ...s, context: e.text ?? '' };
    case 'sticky': return { ...s, sticky: e.text ?? '' };
    case 'typing': return { ...s, typing: Boolean(e.on), ...(e.on ? {} : { caret: null }) };
    case 'caret': return { ...s, caret: e.at ?? null };
    case 'keyboard': return { ...s, keyboard: Math.max(0, e.px | 0) };
    case 'similar': return { ...s, similar: e.level, ...(e.level !== 'single' ? { pick: e.level === 'many' ? s.pick : null } : {}), ...(e.level === 'closed' || (e.level !== 'single' && s.sel === 'element') ? { sel: null } : {}) };
    case 'pick': return { ...s, pick: e.key, similar: e.key == null ? 'many' : 'single', ...(e.key == null ? (s.sel === 'element' ? { sel: null } : {}) : { sel: 'element', chosenLine: null }) }; // tapped big = chosen
    case 'filters': return { ...s, filters: e.filters };
    case 'share': return { ...s, share: Boolean(e.open) };
    case 'onboard': return { ...s, onboard: { ...s.onboard, ...e.patch } };
    default: return s;
  }
}

/**
 * What a gesture on the button means now (the user's table, 16.11.). g: swipe.js event on role 'button'.
 * → { do } with do one of: 'photo' 'photo-share' 'share-element' 'share-cloud' 'start' 'pause' 'resume' 'play' 'keep' 'next' 'before' 'share' 'share-line'
 *   'line-with' 'line-without' 'clear-context' 'anew' 'spread' or null. A line chosen (20.11.): ↑ = share its make-up,
 *   ← = the words written now onto every take of it, ↓ = out of every take that has them.
 */
export function buttonMeaning(s, g) {
  if (g.type === 'tap') {
    if (!live(s)) return { do: 'play' };
    return { do: s.rec === 'idle' ? 'start' : s.rec === 'recording' ? 'pause' : 'resume' };
  }
  if (g.type !== 'swipe') return null;
  // nothing running yet (21.11., instead of the photo dot): ← = one picture, kept · ↑ = one picture, straight to sharing
  const ready = live(s) && s.rec === 'idle' && s.chosenLine == null;
  // ↑ (21.11., user): what goes over is what is chosen – the element shown single, the cloud, a chosen line, the take in the
  // button; nothing chosen = ready: one picture to share (all strands off: the sharing points)
  if (g.dir === 'up') return { do: s.sel === 'element' && s.similar === 'single' ? 'share-element' : s.sel === 'cloud' && s.similar !== 'closed' ? 'share-cloud' : s.chosenLine != null ? 'share-line' : ready && s.strands.v && !s.onboard?.on ? 'photo-share' : 'share' };
  if (g.dir === 'down') return { do: s.chosenLine != null ? 'line-without' : g.far ? 'anew' : 'clear-context' };
  if (g.dir === 'left') return { do: live(s) && s.rec !== 'idle' ? 'keep' : s.chosenLine != null ? 'line-with' : ready ? 'photo' : 'next' };
  if (g.dir === 'right') return { do: 'before' };
  return null;
}
