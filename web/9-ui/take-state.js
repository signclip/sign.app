// take-state.js — what the screen is doing, as a plain reducer: state + event → next state. No DOM, no devices.
//
// Purpose:   the one module that knows the take window, the button, the line, the context row, Similar and the
//            sharing menu at the same time, so a gesture can be checked against all of it (tests). The devices (camera,
//            files) are app.js; it reads the state and does what changed. Events:
//              strand {kind}        an arc tapped: that strand on/off (visual off = the picture fades out)
//              form {round, aspect} the window's form (double tap on the picture, two fingers with one still)
//              rec {to}             'recording' | 'paused' | 'idle' (what the recorder did)
//              kept {take, step}    ← on the button (27.11.): the take onto the line at once, left of the button, marked
//                                   saving; the series moves on – step 'inner' (← a little: the innermost, prefixes stay) ·
//                                   'whole' (← far: the gesture) · unkept {id} its files failed: off the line again
//              took {take, replace} its files are written: the real take where the one kept lies (replace = its id);
//                                   without replace: onto the line and the series moves on, as kept
//              discard              ↓ on the button while recording: the take is dropped, the button starts fresh
//              clear-context        ↓ far on the button: the context of the take goes too
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
import { stepAfter } from './chips.js';

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
    case 'kept': { // ← on the button (27.11.): the take lies on the line at once and the series moves on; its files are written behind
      const lines = addTake(s.lines, { ...e.take, saving: true }, s.sticky);
      return { ...s, lines, at: s.rec === 'idle' ? lines.at(-1).takes.length : s.at, context: stepAfter(s.context, e.step ?? 'inner'), wide: 0, caret: null };
    }
    case 'unkept': { // its files could not be written: it leaves the line again
      const lines = s.lines.map((l) => (l.takes.some((t) => t.id === e.id) ? { ...l, takes: l.takes.filter((t) => t.id !== e.id) } : l));
      return { ...s, lines, at: Math.min(s.at, lines.at(-1).takes.length) };
    }
    case 'took': {
      if (e.replace != null) { // written: the real take where the one kept lies – nothing else changes (gone meanwhile: stays gone, its files are kept)
        const lines = s.lines.map((l) => (l.takes.some((t) => t.id === e.replace) ? { ...l, takes: l.takes.map((t) => (t.id === e.replace ? e.take : t)) } : l));
        return { ...s, lines };
      }
      const lines = addTake(s.lines, e.take, s.sticky);
      const n = lines.at(-1).takes.length;
      return { ...s, lines, at: s.rec === 'idle' || s.at >= n - 1 ? n : s.at, context: stepAfter(s.context, e.step ?? 'inner'), wide: 0, caret: null }; // step: ← a little = 'inner', far = 'whole' (26.11.) · rec stays: the next take may run already (17.11.)
    }
    case 'discard': return { ...s, rec: 'idle', wide: 0 };
    case 'clear-context': return { ...s, context: '', caret: null };
    case 'step': {
      const n = count(s), at = e.to != null ? Math.max(0, Math.min(n, e.to)) : e.dir === 'left' ? Math.min(n, s.at + 1) : e.dir === 'right' ? Math.max(0, s.at - 1) : s.at; // to: a nesting's start (26.11.)
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
    case 'similar': return { ...s, similar: e.level, ...(e.level !== 'single' ? { pick: e.level === 'many' ? s.pick : null } : {}), ...(e.level === 'closed' || (e.level !== 'single' && s.sel === 'element') ? { sel: null } : {}), ...(e.level === 'closed' && s.filters?.earlier ? { filters: { ...s.filters, earlier: null } } : {}) }; // closed: the earlier ones end (27.11.)
    case 'pick': return { ...s, pick: e.key, similar: e.key == null ? 'many' : 'single', ...(e.key == null ? (s.sel === 'element' ? { sel: null } : {}) : { sel: 'element', chosenLine: null }) }; // tapped big = chosen
    case 'filters': return { ...s, filters: e.filters };
    case 'share': return { ...s, share: Boolean(e.open) };
    case 'onboard': return { ...s, onboard: { ...s.onboard, ...e.patch } };
    default: return s;
  }
}

/**
 * What a gesture on the button means now (the user's table, 16.11.; directions 26.11.). g: swipe.js event on role 'button'
 * (far = beyond FAR of the way to the screen's edge). → { do, step? } with do one of: 'photo' 'photo-share' 'share-element'
 * 'share-cloud' 'start' 'pause' 'resume' 'play' 'keep' 'keep-play' 'next' 'before' 'share' 'share-line' 'line-with'
 * 'line-without' 'with' 'without' 'clear-context' 'anew' 'anew-all' 'play-line' 'peel' 'next-nest' 'before-nest' or null.
 *   recording or paused: ← a little = kept, the innermost of the series goes (step 'inner') · ← far = kept, the whole
 *     gesture goes ('whole') · → = kept and played at once · ↓ a little = the video anew (context stays) · ↓ far = anew,
 *     the context goes too
 *   a line chosen, or Similar's cloud / the element shown single chosen (sel): ↑ = share it · ← far = the words written
 *     now onto every take of it · ↓ far = out of every take that has them; a little = nothing (a shake)
 *   ready: ← a little = the innermost out, far = the whole nesting out – nothing saved; nothing written: ← = one picture ·
 *     ↑ = one picture to share · ↓ far = the context goes · → = the take before, far = the nesting before
 *   an earlier take in the button: ← / → = the next / the one before, far = the next nesting / the one before · tap = it plays · a line chosen: tap = it plays through
 */
export function buttonMeaning(s, g) {
  if (g.type === 'tap') {
    if (!live(s)) return { do: 'play' };
    if (s.chosenLine != null && s.rec === 'idle') return { do: 'play-line' }; // a line chosen: ▶ plays it through (26.11., user)
    return { do: s.rec === 'idle' ? 'start' : s.rec === 'recording' ? 'pause' : 'resume' };
  }
  if (g.type !== 'swipe') return null;
  const running = live(s) && s.rec !== 'idle';
  const ready = live(s) && s.rec === 'idle' && s.chosenLine == null;
  const step = g.far ? 'whole' : 'inner';
  // what is chosen besides the take (21.11.): the element shown single, the cloud, a chosen line – the last touched
  const chosen = s.sel === 'element' && s.similar === 'single' ? 'element' : s.sel === 'cloud' && s.similar !== 'closed' ? 'cloud' : s.chosenLine != null ? 'line' : null;
  if (g.dir === 'up') return { do: chosen === 'element' ? 'share-element' : chosen === 'cloud' ? 'share-cloud' : chosen === 'line' ? 'share-line' : ready && s.strands.v && !s.onboard?.on ? 'photo-share' : 'share' };
  if (chosen && !running && (g.dir === 'left' || g.dir === 'down')) { // ← far onto all of it, ↓ far out of all of it (26.11., user)
    if (!g.far) return null;
    const out = g.dir === 'down';
    return chosen === 'line' ? { do: out ? 'line-without' : 'line-with' } : { do: out ? 'without' : 'with', what: chosen };
  }
  if (g.dir === 'down') return running ? { do: g.far ? 'anew-all' : 'anew' } : g.far ? { do: 'clear-context' } : null;
  // not recording (26.11., user): ← takes out without saving – a little the innermost, far the whole nesting; nothing written = one picture
  if (g.dir === 'left') return running ? { do: 'keep', step } : ready ? (s.context ? { do: 'peel', step } : { do: 'photo', step }) : { do: g.far ? 'next-nest' : 'next' };
  if (g.dir === 'right') return running ? { do: 'keep-play' } : { do: g.far ? 'before-nest' : 'before' }; // far: to the nesting before (26.11.)
  return null;
}
