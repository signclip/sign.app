// gestures-take.js — what a gesture means where it starts (16.11.): button, arcs, line, context row, Similar, picture,
// and in the sharing menu the engine's roles. One finger = start spot + direction; two fingers = spread or squeeze.
//
//   button   tap: start · pause · go on (on an earlier take: play / pause) · ready (nothing runs): ← = one picture, kept ·
//            ↑ = one picture, straight to sharing (21.11., instead of the photo dot) · ← keep / the next · → the one
//            before · ↑ sharing menu (a line chosen: onto that line) · ↓ a little: context away · ↓ far: take anew
//            (a line chosen: off that line) · spread on a take: the button across as its clip, slide = the moment, past
//            its widest = the mark bends into two round ends, cut there · squeezed below 70 % = the bubble again (21.11.) ·
//            spread on the empty button: left = a new take by itself (a little: at once,
//            past the catch: after a countdown), right past the catch = stillness until the take ends (calm.js)
//   arcs     tap = that strand on/off · the audio arc dragged onto the context arc = words from the sound (Whisper)
//            on/off, a wave across their seam shows it (26.11., heard.js); a tap on the wave = off
//   line     tap the line or an older line's small arc = chosen (outlined) · tap a take = look at it ·
//            squeeze two takes together = joined
//   row      tap = write (where: between two elements, into a bubble, at the end) · the preset "Name" pulled down = away
//   above    spread above the take, or a tap there (26.11.) = Similar comes (spread again: full), squeeze = it goes;
//            a tile tapped = single view
//   Similar  the four respects at the cloud's edges (26.11.): tap a grip or spread two fingers there = its rail opens ·
//            a value tapped = chosen (calendar: a second one = from … to) · the arrow at its head = the order turns ·
//            spread / squeeze = finer / coarser bundles · the rail pushed out over its edge = closed · spread on the rail
//            itself = it lies over everything (26.11., paint-over.js), squeeze or its sign = back
//   picture  ← / → = the other camera (at 1×) · tap = focus there · two fingers = the window's form: side by side =
//            width, one above the other = height, slanted = corners (rectangle ↔ circle); at most 1:1, snaps to the
//            picture's format
// Depends:   browser; take-state.js, line.js, similar-view.js, chips.js, 1-model/context.js, 4-save/add-line.js
// Test:      the meanings in tests/ui.test.mjs (buttonMeaning, zoomed, filters); the wiring on a phone.
// Limits:    the moment slides ± 3 s across the spread button; a cut needs ≥ 200 ms on both sides (line.js).

import { buttonMeaning, live, count } from './take-state.js';
import { joinTakes, cutTake, withContext, nestStep } from './line.js';
import { nowWords, stepAfter } from './chips.js';
import { slotPx, onTake, similarSide, onArc, timeline, wideButton, STACK, stackReach } from './layout.js';
import { zoomed, tapFilter, turnOrder, setFilter } from './similar-view.js';
import { zoneOf, zoomZone, openBundle, bundlesOf, periodRange } from './similar-zoom.js';
import { SECTORS, READY, wideOpen, stepRange } from './similar-range.js';
import { insertGesture, fromField, contextTree, leadOf } from '../1-model/context.js';
import { removeBefore, nestBetween, closeAt, unwrapAt, appendWord, toFront, takeOut, openAt } from '../1-model/context-edit.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { flipPicture, focusAt, mainLens } from './camera.js';
import { BOW } from './paint.js';
import { inside, formBy, snap } from './form.js';

const CUT = 1.15, RUN_RATE = 0.5; // past the widest by 15 % = cut · the timeline runs through at half speed
const onLine = (r) => r === 'line' || r.startsWith('take:') || r.startsWith('old:');
const fake = (role) => ({ target: { closest: () => ({ dataset: { role } }) } });

export const ZW = '\u200b'; // a mark at the start of the typing field: deleting it = Backspace with nothing typed (21.11.)
const inRow = (r) => r === 'context' || r === 'under' || r.startsWith('gap:') || r.startsWith('chip:') || r.startsWith('bubble:') || r.startsWith('xt:');
const pathOf = (r) => r.slice(r.indexOf(':') + 1).split('.').filter(Boolean).map(Number); // xt:0.1 → [0, 1]

export function gesturesOf(A) {
  const say = document.querySelector('#say');
  let wide = null, facing = A.settings.facing, shaping = null; // shaping: two fingers on the picture, the form at their start (20.11.)
  let zooming = null; // the zoom in time at the start of a pinch on one side of the mark (20.11.)

  function onEvent(ev, e) {
    if (A.st.share) return sharing(ev, e);
    if (A.st.filters.full && A.st.filters.open === A.st.filters.full && (A.st.similar === 'many' || A.st.similar === 'full')) return over(ev); // a respect over everything (26.11.)
    if (A.data.ranging) return ranging(ev);
    if (ev.type === 'hold' && ev.role === 'window' && (A.st.similar === 'many' || A.st.similar === 'single')) { A.data.ranging = true; navigator.vibrate?.(10); return A.paint(); } // how far Similar looks: the rings with sectors (21.11.)
    if (A.data.fan && ev.type !== 'pinch') return fan(ev); // the lines fanned out: a row = that line, elsewhere = closed
    if (ev.type === 'pinch') return pinch(ev);
    const r = ev.role ?? '';
    if (onLine(r) && (ev.type === 'drag' || ev.type === 'swipe' || ev.type === 'drag-end')) return pull(ev); // the line follows the finger (17.11.)
    const endsTyping = A.st.typing && ev.type === 'tap' && !inRow(r);
    if (endsTyping) say.blur(); // a tap anywhere else takes over what is written (blur commits), then does what it does
    if (r === 'strand:a' && (ev.type === 'drag' || ev.type === 'swipe' || ev.type === 'drag-end')) return flowDrag(ev); // the audio arc dragged onto the context arc = Whisper on/off (26.11.)
    if (r === 'button') return button(ev);
    if (ev.type === 'tap') {
      if (r === 'flow:a>x') return A.heard?.toggle(); // its wave tapped: off (26.11.)
      if (r.startsWith('strand:') && !live(A.st) && A.st.rec === 'idle' && A.take.addStrand(r.slice(7))) return null; // an earlier take without it: only this strand is taken, onto it (21.11.)
      if (r.startsWith('strand:')) return A.dispatch({ type: 'strand', kind: r.slice(7) });
      if (r.startsWith('dstrand:')) { navigator.vibrate?.(8); return A.dispatch({ type: 'dstrand', kind: r.slice(8) }); } // the single view: what one sees and hears (20.11.)
      if (r === 'line') return A.dispatch({ type: 'select-line', n: A.st.lines.length - 1 });
      if (r.startsWith('old:')) return A.dispatch({ type: 'select-line', n: Number(r.slice(4)) });
      if (r.startsWith('take:')) return A.dispatch({ type: 'at', at: Number(r.slice(5)) });
      if (r.startsWith('tile:')) { // what lies on top of a chain decides where it opens (21.11., user): ?( ) Similar · a line or _() the take window
        const e = A.data.entries[Number(r.slice(5))];
        if (e?.kind === 'search') return A.similar.openSearch(e); // a similar is a view: it opens
        return A.similar.pick(e?.key); // a take, a series, a template: seen in the single view first; dragged into the take = taken over (similar-flow toLine)
      }
      if (r === 'single' && A.st.similar === 'single') return A.dispatch({ type: 'choose', what: 'element' }); // the element tapped again: it is what goes over (21.11.)
      if (r === 'screen' && (A.st.similar === 'many' || A.st.similar === 'full') && A.L?.similarBox) { // the cloud tapped where it is empty = chosen (21.11.): ↑ shares its question
        const b = A.L.similarBox;
        if (ev.x > b.x && ev.x < b.x + b.w && ev.y > b.y && ev.y < b.y + b.h) { navigator.vibrate?.(8); return A.dispatch({ type: 'choose', what: A.st.sel === 'cloud' ? null : 'cloud' }); }
      }
      if (r.startsWith('kinds:')) return A.similar.openKind(r.slice(6)); // the bubble of templates, series or saved similar: their own cloud (21.11.)
      if (r.startsWith('kind:')) { const k = r.slice(5), f = A.st.filters; return A.dispatch({ type: 'filters', filters: { ...f, on: { ...f.on, [k]: f.on[k] === false } } }); } // which chains the cloud shows
      if (r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: tapFilter(A.st.filters, r.slice(7)) });
      if (r.startsWith('bundle:')) return openBundleAt(Number(r.slice(7))); // a bundle: only it, one step finer (21.11.)
      if (r.startsWith('grip:')) return grip(r.slice(5));
      if (r.startsWith('period:')) return period(r.slice(7)); // a year, month or day on the calendar's rail = only that; again = all (26.11.)
      if (r.startsWith('order:')) { navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: turnOrder(A.st.filters, r.slice(6)) }); } // the arrow: the other way round, the cloud sorts so
      if (r.startsWith('initial:')) return toggleValue('initial', r.slice(8));
      if (r.startsWith('value:')) { const [, name, id] = r.split(':'); return toggleValue(name, id); }
      if (r === 'screen' && A.st.similar === 'closed' && !endsTyping && !A.st.onboard.on && similarSide(A.L, ev)) { // a tap where Similar opens = it comes (26.11., user), as two fingers spread there
        navigator.vibrate?.(8); location.hash = 'many'; // Android back = closes (hashchange in app.js)
        return A.dispatch({ type: 'similar', level: 'many' });
      }
      if (r === 'window') return focusHere(ev);
      if (r === 'screen' && A.L && A.st.strands.x && ev.y > A.L.cy + A.L.R + 10 * A.L.k && Math.abs(ev.x - A.L.cx) < A.L.rx + 60 * A.L.k) return openTyping('context'); // anywhere under the bottom arc = write (17.11.)
      if (r.startsWith('xt:') && !A.st.typing && live(A.st) && !A.st.onboard.on && pathOf(r).some((x) => x > 0)) return frontTake(pathOf(r)); // a take further on: it comes first (26.11.)
      if (r.startsWith('sword:') && A.st.similar === 'single') return wordsOver(); // the words of the result shown single: into the take window (26.11.)
      if (r.startsWith('tword:')) return wordsOver(A.data.entries?.[Number(r.slice(6))]); // a tile's words in the cloud: the same (26.11.)
      if (inRow(r)) return openTyping(r);
    }
    if (r.startsWith('tile:') || r === 'single' || (r.startsWith('tword:') && ev.type !== 'tap')) { // a result carried into the take window = it lies there as a line (17.11.; also by its words, 26.11.)
      const key = r === 'single' ? A.st.pick : A.data.entries[Number(r.slice(r.indexOf(':') + 1))]?.key;
      if (ev.type === 'drag' && Math.abs(ev.dy) > 14) { A.data.carry = { x: ev.x, y: ev.y, pic: (A.data.entries ?? []).find((x) => x.key === key)?.thumb ?? null }; return A.paint(); }
      if ((ev.type === 'swipe' || ev.type === 'drag-end') && A.data.carry) {
        const c = A.data.carry, L = A.L; A.data.carry = null; A.paint();
        const inWindow = inside(L, c.x, c.y, L.ring * 2) || Math.hypot(c.x - L.button.x, c.y - L.button.y) < L.ring * 2;
        if (inWindow && key) return A.similar.toLine(key);
        if (r === 'single' && (ev.dir === 'left' || ev.dir === 'right')) return A.similar.step(ev.dir) || nextResult(ev.dir);
        return null;
      }
    }
    if (r.startsWith('dstrand:') && A.st.similar === 'single') { // an arc of the result shown single dragged into the take window = that strand taken over (21.11.)
      if (ev.type === 'drag') { A.data.strandCarry = { kind: r.slice(8), x: ev.x, y: ev.y }; return null; }
      if ((ev.type === 'swipe' || ev.type === 'drag-end') && A.data.strandCarry) {
        const c = A.data.strandCarry; A.data.strandCarry = null;
        if (A.L && inside(A.L, c.x, c.y)) return A.take.takeStrand(A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === A.st.pick), c.kind);
        return null;
      }
    }
    if (ev.type === 'hold' && r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: turnOrder(A.st.filters, r.slice(7)) });
    const mine = railOf(r); // a rail pushed out over its own edge = closed (26.11.), as everything goes that is pushed over an edge
    if (ev.type === 'swipe' && mine && mine === A.st.filters.open && ev.dir === OUT[mine]) return closeRail(mine);
    if (ev.type === 'swipe') {
      if (r === 'single' && (ev.dir === 'left' || ev.dir === 'right')) return A.similar.step(ev.dir) || nextResult(ev.dir); // ← → above: the next account that may be hers, else the next result
      if (r.startsWith('chip:') && ev.dir === 'down' && r.slice(5) === 'Name' && A.st.onboard.on) { A.dispatch({ type: 'onboard', patch: { dropped: true } }); return A.syncOnboard(); }
      if (ev.dir === 'down' && r === 'search-off') return A.similar.closeSearch(); // pulled down = away (21.11., user: no ✕)
      if (ev.dir === 'down' && r === 'kinds-off') return A.similar.closeKind();
      if (r.startsWith('xt:') && ev.dir === 'down' && !A.st.onboard.on) return dropTake(pathOf(r)); // a take pushed down: it goes (26.11.)
      if (inRow(r) && ev.dir === 'up' && !ev.far && !A.st.onboard.on) return similarByDate(); // ↑ a little: Similar, the chains with these words by date (26.11.)
      if (inRow(r) && ev.dir === 'up' && live(A.st) && !A.st.onboard.on && A.st.context) { // the written series pushed up over the edge (far) = shared as a template (21.11.)
        navigator.vibrate?.(12);
        return A.take.saveTemplate(A.st.context).then((p) => { if (!p) return A.shake('context'); A.engine?.show(true); return A.dispatch({ type: 'share', open: true }); });
      }
      if (r === 'window' && (ev.dir === 'left' || ev.dir === 'right') && A.st.rec === 'idle' && A.take.camera) return flip();
    }
    return null;
  }

  /** The audio arc pulled by a finger: let go on the context arc = the flow sound → context switches (heard.js). */
  let flowAt = null;
  function flowDrag(ev) {
    if (ev.type === 'drag') { flowAt = { x: ev.x, y: ev.y }; return null; }
    const at = flowAt; flowAt = null;
    if (at && onArc(A.L, at, 'x')) return A.heard?.toggle();
    return null;
  }

  /** ← → on a result in the single view: the next / the one before (F5). */
  function nextResult(dir) {
    const list = A.data.entries ?? [], i = list.findIndex((e) => e.key === A.st.pick);
    if (i < 0 || list.length < 2) return null;
    return A.similar.pick(list[(i + (dir === 'left' ? 1 : -1) + list.length) % list.length].key);
  }

  // ---------- the button ----------
  function button(ev) {
    const st = A.st;
    if (st.wide > 0.02) {
      if (ev.type === 'drag') return scrub(ev);
      if (ev.type === 'tap') return A.player.playing ? A.player.pause() : run(); // tap = it stops / runs on
      if (ev.type === 'swipe' && ev.dir === 'down' && Math.abs(ev.dy) > Math.abs(ev.dx) * 2) return closeWide(); // pushed down = closed
      if (ev.type === 'swipe' || ev.type === 'drag-end') { scrubFrom = null; return null; }
      return null;
    }
    if (ev.type === 'swipe' && (ev.dir === 'up' || ev.dir === 'down') && A.data.kindCloud === 'ask' && st.similar === 'single') return A.pass.decide(ev.dir === 'up'); // a request to pass on my take: ↑ allowed, ↓ not (21.11.)
    if (ev.type === 'swipe' && (ev.dir === 'up' || ev.dir === 'down') && (A.similar.carried || (A.similar.looking && st.pick))) return A.similar.decide(ev.dir);
    if (ev.type === 'tap' && A.similar.carried && !live(st)) return play(); // the guest in the window: tap = it stops / plays on
    const across = Math.abs(ev.dx ?? 0) > Math.abs(ev.dy ?? 0);
    if (ev.type === 'swipe' && ev.far && across && st.rec === 'idle' && st.chosenLine == null && count(st) && !(live(st) && ev.dir === 'left')) { // far across (26.11.): a whole nesting, the line does not follow the finger
      pulled = null; A.data.lineShift = 0; navigator.vibrate?.(8);
      return A.dispatch({ type: 'step', to: nestStep(A.st.lines.at(-1).takes, st.at, ev.dir === 'left' ? 'next' : 'before', leadOf) });
    }
    const towardsNothing = live(st) && !pulled && (ev.dx ?? 0) < 0; // on the ready button there is nothing newer: ← is the picture (21.11.)
    if (st.rec === 'idle' && count(st) && st.chosenLine == null && !towardsNothing && ((ev.type === 'drag' && (across || pulled)) || ((ev.type === 'swipe' || ev.type === 'drag-end') && pulled))) return pull(ev);
    const m = buttonMeaning(st, ev);
    if (st.onboard.on && !st.onboard.name && !st.onboard.nameSign && ['start', 'photo', 'photo-share'].includes(m?.do)) { A.shake('context'); return openTyping('context'); } // first the name, then its sign (17.11.: a hello without a name went out)
    switch (m?.do) {
      case 'start': A.similar.dropGuest(); return A.take.start();
      case 'pause': return A.take.pause();
      case 'resume': return A.take.resume();
      case 'photo': A.similar.dropGuest(); return A.take.photo(m.step);
      case 'photo-share': A.similar.dropGuest(); return A.take.photo().then(() => { A.engine?.show(true); A.dispatch({ type: 'share', open: true }); }); // the picture just taken is what is shared
      case 'keep': return A.take.keep(m.step); // ← a little: the innermost of the series goes next · far: the whole gesture (26.11.)
      case 'keep-play': return A.take.keepAndPlay(); // → : kept and played at once (26.11.)
      case 'anew': return A.take.anew(); // ↓ a little: the video anew, the context stays (26.11.)
      case 'anew-all': return A.take.anew(true); // ↓ far: the context goes too
      case 'clear-context': navigator.vibrate?.(10); return A.dispatch({ type: 'clear-context' });
      case 'next': return A.dispatch({ type: 'step', dir: 'left' });
      case 'before': return A.dispatch({ type: 'step', dir: 'right' });
      case 'next-nest': case 'before-nest': navigator.vibrate?.(8); return A.dispatch({ type: 'step', to: nestStep(A.st.lines.at(-1).takes, A.st.at, m.do === 'next-nest' ? 'next' : 'before', leadOf) }); // far: a whole nesting (26.11.)
      case 'peel': { navigator.vibrate?.(m.step === 'whole' ? [10, 40, 10] : 8); return A.dispatch({ type: 'context', text: stepAfter(A.st.context, m.step) }); } // ← without a take: out, nothing saved (26.11.)
      case 'play': return play();
      case 'play-line': return playLine(); // a line chosen: its takes one after another (26.11.)
      case 'share': return Promise.resolve(!live(A.st) && A.st.rec === 'idle' ? A.take.shareTake() : null).then(() => { A.engine?.show(true); A.dispatch({ type: 'share', open: true }); }); // the take in the button: that one (21.11.)
      case 'share-line': A.engine?.show(true); return A.dispatch({ type: 'share', open: true }); // what is shared: the chosen line (take-flow lastChain)
      case 'share-cloud': return A.similar.shareCloud().then(() => { A.engine?.show(true); A.dispatch({ type: 'share', open: true }); }); // the cloud chosen: its question, opening as it is seen (21.11., G4c)
      case 'share-element': return A.similar.shareElement().then((r) => { if (r === 'asked') return; A.engine?.show(true); A.dispatch({ type: 'share', open: true }); }); // the element shown single; not hers to pass on = a request to the author (pass-flow.js)
      case 'line-with': return lineContext(false);
      case 'line-without': return lineContext(true);
      case 'with': return chosenContext(m.what, false); // ← far: the words written now onto the cloud / the element (26.11.)
      case 'without': return chosenContext(m.what, true); // ↓ far: out of it
      default: return null;
    }
  }
  const takeNow = () => A.st.lines.at(-1).takes[Math.min(A.st.at, count(A.st) - 1)];
  /**
   * A line chosen (20.11.): the words written now (the take that comes next, without the sticky words) onto every take
   * of it (←) or out of every take that has them (↓). Saved as a new line on top of its chain (add-line.js context /
   * without); the field is free again after.
   */
  function lineContext(without) {
    const n = A.st.chosenLine, words = nowWords(A.st.context, '').map((w) => w.text);
    if (n == null || !words.length) return A.shake('button'); // nothing written: nothing to add or take out
    const lines = withContext(A.st.lines, n, words, { without });
    if (lines === A.st.lines) return A.shake('button'); // every take has it already / none has it
    navigator.vibrate?.(without ? [12, 50, 12] : 20);
    A.dispatch({ type: 'lines', lines });
    A.dispatch({ type: 'context', text: '' });
    A.keepLines();
    A.take.lineWith(n, words, without);
    return null;
  }
  /**
   * The cloud or the element shown single chosen (26.11., user: as for a line): the words written now onto it (←
   * far) or out of it (↓ far). The element: a new chain of mine on top of it (take-flow wordsOnElement). The cloud:
   * every element would need its own chain – not yet (a shake; md/TODO.md).
   */
  function chosenContext(what, without) {
    const words = nowWords(A.st.context, '').map((w) => w.text);
    if (!words.length || what !== 'element') return A.shake('button');
    const e = A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === A.st.pick);
    return A.take.wordsOnElement(e, words, without).then((path) => {
      if (!path) return A.shake('button');
      navigator.vibrate?.(without ? [12, 50, 12] : 20);
      A.dispatch({ type: 'context', text: '' });
      return A.similar.refresh?.();
    });
  }
  /** Tap on an earlier take: it plays in the window (what it really is: its parts, one after another), tap again = pause. */
  function play() {
    const take = takeNow();
    if (!take) return A.shake('button');
    if (A.player.playing) return A.player.pause();
    return A.player.show(take, 0, { play: true, onEnd: () => A.paint() }).then((ok) => (ok ? null : A.shake('button')));
  }

  /** A line chosen (26.11., user: selected = ▶ at once): its takes play one after another; tap again = pause. */
  function playLine() {
    const takes = A.st.lines[A.st.chosenLine]?.takes ?? [];
    if (!takes.length) return A.shake('button');
    if (A.player.playing) { A.player.pause(); return A.paint(); }
    const from = (i) => (i < takes.length && A.st.chosenLine != null ? A.player.show(takes[i], 0, { play: true, onEnd: () => { A.paint(); from(i + 1); } }) : A.paint());
    return Promise.resolve(from(0)).then(() => A.paint());
  }

  // ---------- the line under the finger (17.11.): it slides, lets go, rests on the nearest take ----------
  let pulled = null; // { v (px/ms), x, t }
  function pull(ev) {
    const px = slotPx(A.L), n = count(A.st);
    // pulled up (26.11., user): the stacked lines open upwards (the fan, as with two fingers) – a finger that starts upright
    const upright = (ev.dy ?? 0) < -8 && Math.abs(ev.dy) > 1.6 * Math.abs(ev.dx ?? 0);
    if (!pulled && (lifting || (ev.type === 'drag' && upright) || (ev.type === 'swipe' && ev.dir === 'up'))) {
      if (ev.type === 'drag') { lifting = true; return null; }
      lifting = false;
      if ((ev.dy ?? 0) > -28 || A.st.lines.length < 2 || A.st.rec !== 'idle') return A.paint();
      if (!A.data.fan) { A.data.fan = true; A.data.fanOff = 0; A.data.fanShift = null; navigator.vibrate?.(8); }
      return A.paint();
    }
    if (ev.type === 'drag') {
      const v = pulled ? (ev.dx - pulled.x) / Math.max(1, ev.t - pulled.t) : 0;
      pulled = { x: ev.dx, t: ev.t, v: pulled ? pulled.v * 0.6 + v * 0.4 : 0 };
      A.data.lineShift = Math.max(A.st.at - n - 0.35, Math.min(A.st.at + 0.35, ev.dx / px)); // a little past the ends, then it holds
      return A.paint();
    }
    const shift = A.data.lineShift ?? 0, fling = pulled ? Math.max(-2, Math.min(2, (pulled.v * 90) / px)) : 0; // let go in motion: it runs on, at most 2 takes
    pulled = null;
    const to = Math.max(0, Math.min(n, Math.round(A.st.at - shift - fling)));
    const rest = shift + (to - A.st.at); // the same picture with the button on the new take; this much is left to slide
    if (to !== A.st.at) { navigator.vibrate?.(6); A.dispatch({ type: 'at', at: to }); }
    const start = performance.now();
    const settle = (now) => {
      const f = Math.min(1, (now - start) / 180);
      A.data.lineShift = rest * (1 - f) ** 3;
      if (f >= 1) A.data.lineShift = 0;
      A.paint();
      if (f < 1 && !pulled) requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
    return null;
  }

  // ---------- spread, squeeze ----------
  /**
   * The lines stacked between the button and the window (27.11., user; opened by two fingers on the line pulled apart up
   * and down, or the line pulled up): the older lines as the line looks, an arc with its takes (layout.js stackRows).
   * A take tapped = that line at the button, on that take; its arc tapped = that line, ready; a finger upright = the
   * rows follow it (up = older), resting on a row when it lets go; sideways on a row = its takes slide; pushed together
   * or a tap beside = closed.
   */
  function fan(ev) {
    const r = ev.role ?? '', [, n, j] = r.startsWith('fan:') ? r.split(':').map(Number) : [];
    const row = STACK.row * A.L.k, older = A.st.lines.length - 1, most = Math.max(0, older - (A.L.stackRows ?? 1));
    if (ev.type === 'tap') {
      if (n == null) { A.data.fan = false; return A.paint(); }
      A.data.fan = false; // chosen: the stack folds, the line stands at the button
      A.take.showLine(n); // the line comes to the button …
      if (j != null) A.dispatch({ type: 'at', at: j }); // … standing on the take that was tapped (26.11.)
      return A.paint();
    }
    if (ev.type === 'drag' && !fanFrom && (fanUp || Math.abs(ev.dy) > Math.abs(ev.dx))) { // upright: the rows follow the finger
      fanUp = true;
      const off = A.data.fanOff ?? 0;
      A.data.stackDrag = Math.max(-(most - off) * row - row / 3, Math.min(off * row + row / 3, ev.dy)); // a third of a row past the ends, no further
      return A.paint();
    }
    // a finger sideways on a row = its takes slide under it (26.11., user: scroll a line to see all of it)
    if (n != null && ev.type === 'drag' && !fanUp) {
      fanFrom ??= { n, at: A.data.fanShift?.[n] ?? 0 };
      if (fanFrom.n !== n) return null;
      const reach = stackReach(A.L, A.st.lines[n]?.takes.length ?? 0);
      A.data.fanShift = { ...(A.data.fanShift ?? {}), [n]: Math.max(-reach, Math.min(reach, fanFrom.at - ev.dx)) };
      return A.paint();
    }
    if (ev.type === 'swipe' || ev.type === 'drag-end') {
      const sideways = fanFrom != null, upright = fanUp;
      fanFrom = null; fanUp = false;
      if (sideways) return null;
      const moved = A.data.stackDrag ?? 0;
      A.data.stackDrag = 0;
      const rowsBy = upright ? Math.round(-moved / row) + (ev.type === 'swipe' && ev.dir === 'up' ? 1 : ev.type === 'swipe' && ev.dir === 'down' ? -1 : 0) : ev.type === 'swipe' && (ev.dir === 'up' || ev.dir === 'down') ? (ev.dir === 'up' ? 1 : -1) : 0;
      A.data.fanOff = Math.max(0, Math.min(most, (A.data.fanOff ?? 0) + rowsBy)); // a flick goes one row further
      return A.paint();
    }
    return null;
  }
  let fanFrom = null; // the row a finger pushes sideways, and where it stood
  let fanUp = false; // a finger moving the stacked lines upright (27.11.)
  let lifting = false; // a finger on the line going up: the fan opens when it lets go (26.11.)
  function pinch(ev) {
    const L = A.L, [a, b] = ev.roles ?? [];
    const upright = ev.at?.length === 2 && Math.abs(ev.at[0].y - ev.at[1].y) > Math.abs(ev.at[0].x - ev.at[1].x);
    const byLine = L && Math.abs(ev.centre.y - L.button.y) < 50 * L.k && !inside(L, ev.centre.x, ev.centre.y);
    if (A.st.lines.length > 1 && A.st.rec === 'idle' && upright && (A.data.fan || byLine || [a, b].some((x) => x && onLine(x)))) { // the lines fanned out, or folded again (22.11.)
      if (ev.phase !== 'end') return null;
      if (ev.scale > 1.15 && !A.data.fan) { A.data.fan = true; A.data.fanOff = 0; A.data.fanShift = null; navigator.vibrate?.(8); return A.paint(); }
      if (ev.scale < 0.87 && A.data.fan) { A.data.fan = false; return A.paint(); }
      return null;
    }
    if (upright && [a, b].every((x) => x && inRow(x))) return ev.phase === 'end' && ev.scale > 1.15 ? similarByDate() : null; // the row spread upright = Similar by date (26.11.)
    const kindRole = [a, b].find((x) => x?.startsWith('kinds:'));
    if (kindRole) return ev.phase === 'end' && ev.scale > 1.12 ? A.similar.openKind(kindRole.slice(6)) : null; // spread on a bubble = its cloud
    const nearButton = L && Math.hypot(ev.centre.x - L.button.x, ev.centre.y - L.button.y) < 70 * L.k;
    // both fingers began off the take (20.11.): above, below, beside it on a tablet, on Similar — that zooms Similar open and shut
    const free = !shaping && !wide && Boolean(ev.at) && ev.at.every((pt, i) => !onTake(L, pt, ev.roles?.[i]));
    if (free) {
      if (ev.phase !== 'end') return null;
      if (A.st.similar === 'many' || A.st.similar === 'full') { // where it was zoomed: which metadata, how far: how fine (21.11., similar-zoom.js)
        const bundle = [a, b].find((x) => x?.startsWith('bundle:'));
        const tile = [a, b].find((x) => x?.startsWith('tile:')), te = tile ? A.data.entries?.[Number(tile.slice(5))] : null;
        if (te?.kind === 'template' && ev.scale > 1.12) return A.similar.bundleBy(te); // a template spread open: the cloud bundled by it
        if (bundle && ev.scale > 1.12) return openBundleAt(Number(bundle.slice(7)));
        const f = A.st.filters;
        if (f.open && ev.scale > 1.12 && [a, b].some((x) => railOf(x ?? '') === f.open)) { navigator.vibrate?.(10); return A.dispatch({ type: 'filters', filters: { ...f, full: f.open } }); } // spread on the open rail = over everything (26.11.)
        const zone = (f.open && f.open !== 'template' ? f.open : null) ?? zoneOf(L.similarBox, ev.centre, L.k) ?? (f.value.bundle && ev.scale < 0.88 ? f.value.bundle.by : null); // a view open: zooming anywhere = its steps (22.11.)
        if (zone) { navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: zoomZone(f, zone, ev.scale) }); }
      }
      const level = zoomed(A.st.similar, ev.scale);
      if (level !== A.st.similar) { navigator.vibrate?.(8); if (level !== 'closed') location.hash = level; } // Android back = closes (hashchange in app.js)
      return A.dispatch({ type: 'similar', level });
    }
    if (a?.startsWith('take:') && b?.startsWith('take:')) return ev.phase === 'end' && ev.scale < 0.75 ? join(Number(a.slice(5)), Number(b.slice(5))) : null; // two takes squeezed: before the button (20.11.: near it, the button took it)
    const onButton = !shaping && (a === 'button' || b === 'button' || nearButton) && A.st.similar !== 'full' && A.st.rec === 'idle';
    const emptyButton = !shaping && (a === 'button' || b === 'button' || nearButton) && A.st.similar !== 'full' && live(A.st); // also while it records: a series is switched off there
    if (A.calm && (A.calm.setting || (emptyButton && !wide && !zooming && A.st.wide < 0.02)) && A.calm.pinch(ev)) return null; // the empty button: its two times (calm.js)
    if (onButton && count(A.st) && !live(A.st)) { // the button holds a take: it opens as its clip
      // open, both fingers on one side of the mark (20.11.): finer or coarser in time; on both sides: cut or close
      const at = ev.at ?? [], oneSide = A.st.wide > 0.5 && !wide?.parting && at.length === 2 && (at[0].x - L.button.x) * (at[1].x - L.button.x) > 0;
      if (oneSide || zooming) {
        if (ev.phase === 'move') { zooming ??= A.st.wideZoom ?? 1; return A.dispatch({ type: 'wide', spread: A.st.wide, zoom: Math.max(0.25, Math.min(40, zooming * ev.scale)) }); }
        zooming = null;
        return (A.st.wideZoom ?? 1) < 0.7 ? closeWide() : null; // squeezed to less than 70 % of the clip's own length (21.11.): the bubble again
      }
      if (!wide && ev.phase === 'move') { wide = { base: A.st.wide, fresh: A.st.wide < 0.1 }; if (wide.fresh) A.player.pause(); }
      const base = wide?.base ?? A.st.wide;
      const squeeze = wide && !wide.fresh && !wide.parting && ev.scale < 1; // the open clip squeezed across (21.11.): it narrows back into the bubble
      const spread = squeeze ? base * ev.scale ** 1.6 : Math.max(0, Math.min(1.4, (ev.scale - 1) / 1.2 + base));
      if (ev.phase === 'move') {
        if (wide.fresh && A.st.wide < 0.02) A.dispatch({ type: 'wide', spread, ms: 0 }); // it opens at the take's beginning: the whole take lies to the right
        A.data.cut = spread > 1 ? Math.min(1, (spread - 1) / (CUT - 1)) : 0;
        if (spread > 1 && !wide.fresh) wide.parting = true; // it is a cut now, whatever the fingers do next
        return A.dispatch({ type: 'wide', spread });
      }
      const was = wide; wide = null; A.data.cut = 0;
      if (spread > CUT && was && !was.fresh) return cut(); // spread further on the open timeline: the take parts at the mark
      if (spread < (was && !was.fresh ? 0.7 : 0.1)) return closeWide(); // squeezed to less than 70 %: the bubble again
      A.dispatch({ type: 'wide', spread: 1 });
      if (was?.fresh) run(); // just opened: it runs through slowly, the picture in the window runs along
      return null;
    }
    if (shaping || (A.st.similar !== 'full' && L && !nearButton && inside(L, ev.centre.x, ev.centre.y) && ![a, b].some((x) => x?.startsWith('take:')))) return shape(ev); // two fingers on the picture = its form (20.11.), also where they touch an arc; while the take is seen, also beside Similar (21.11.)
    if (ev.phase !== 'end') return null;
    return null; // a finger on the take: its own gestures above (Similar only from free space)
  }
  /**
   * Two fingers on the picture = the window's form, by how they lie (form.js formBy): side by side = width, one above
   * the other = height, slanted = corners, smoothly between rectangle and circle. Always from the form at the start;
   * the aspect snaps to the picture's own format and to 1:1. The camera stays at 1× (20.11.). While the fingers are
   * down the window follows at once (body.shaping: no easing), so box and clip never part and no corner peeks out.
   */
  function shape(ev) {
    document.body.classList.toggle('shaping', ev.phase !== 'end');
    if (ev.phase === 'end') { shaping = null; return null; }
    shaping ??= { ...A.st.form };
    const f = formBy(shaping, ev.scale, ev), aspect = snap(f.aspect, A.pictureAspect());
    if (Math.abs(aspect - A.st.form.aspect) < 0.004 && Math.abs(f.round - A.st.form.round) < 0.01) return null;
    return A.dispatch({ type: 'form', round: f.round, aspect });
  }
  /** The timeline runs: the take plays in the window at half speed, the moment at the mark follows it. */
  function run() {
    const take = takeNow();
    if (!take) return null;
    const from = A.st.wideMs >= (take.ms ?? 0) - 60 ? 0 : A.st.wideMs; // at its end: from the beginning again
    return A.player.show(take, from, { play: true, rate: RUN_RATE, muted: true, onTime: (ms) => { if (A.st.wide > 0.02) A.dispatch({ type: 'wide', spread: A.st.wide, ms }); }, onEnd: () => A.paint() });
  }
  function closeWide() {
    wide = null; A.data.cut = 0; scrubFrom = null;
    A.dispatch({ type: 'wide', spread: 0 });
    return A.showAt();
  }
  /** A finger on the open timeline: it stops and follows the finger; the window shows that moment. */
  let scrubFrom = null;
  function scrub(ev) {
    const take = takeNow();
    if (!take) return null;
    if (scrubFrom == null || ev.fresh) { scrubFrom = A.st.wideMs; A.player.pause(); }
    const { px } = timeline(A.L, take, 0, A.st.wideZoom ?? 1); // the pill moves under the finger: a finger to the left = later
    const ms = Math.max(0, Math.min(take.ms ?? 0, scrubFrom - ev.dx / px));
    A.player.show(take, ms);
    return A.dispatch({ type: 'wide', spread: A.st.wide, ms });
  }
  function cut() {
    const n = A.st.lines.length - 1, i = Math.min(A.st.at, count(A.st) - 1);
    const lines = cutTake(A.st.lines, n, i, A.st.wideMs);
    if (lines === A.st.lines) { A.shake('button'); return A.dispatch({ type: 'wide', spread: 1 }); } // too near an end (< 200 ms): it stays open
    navigator.vibrate?.([10, 30, 10]);
    const w = wideButton(A.L, 1, takeNow(), A.st.wideMs, A.st.wideZoom ?? 1), mark = A.L.button.x; // the pill parts here into two bubbles (paint.js splitSvg)
    A.data.split = { t0: performance.now(), at: mark, y: w.y, h: w.h, gap0: 2 * BOW * (w.h / 2), left: Math.max(w.h / 2, mark - w.x), right: Math.max(w.h / 2, w.x + w.w - mark) }; // goes on from where the bow stood
    const step = () => { if (!A.data.split) return; if (performance.now() - A.data.split.t0 > 400) { A.data.split = null; A.paint(); return; } A.paint(); requestAnimationFrame(step); };
    requestAnimationFrame(step);
    A.player.stop();
    A.dispatch({ type: 'lines', lines });
    A.dispatch({ type: 'wide', spread: 0 });
    A.keepLines(); A.take.saveLine();
    return A.showAt();
  }
  function join(i, j) {
    const lo = Math.min(i, j);
    if (Math.abs(i - j) !== 1) return A.shake(`take:${i}`);
    navigator.vibrate?.(20);
    A.dispatch({ type: 'lines', lines: joinTakes(A.st.lines, A.st.lines.length - 1, lo) });
    A.keepLines(); A.take.saveLine();
    return A.showAt();
  }

  // ---------- the context row ----------
  /** A take further on in the row tapped (26.11., user): it becomes the take now, with its prefixes (context-edit.js toFront). */
  function frontTake(at) {
    const text = toFront(A.st.context, at);
    if (!text || text === A.st.context) return A.shake('context');
    navigator.vibrate?.(6);
    return A.dispatch({ type: 'context', text });
  }
  /** A take of the row pushed down (26.11., user): it goes – of the series, or of the earlier take's own context. */
  function dropTake(at) {
    const text = takeOut(textNow(), at);
    if (text == null) return A.shake('context');
    navigator.vibrate?.([8, 40, 8]);
    setText(text);
    return editing() ? finish() : null;
  }
  /** The words of the result shown single, or of a tile, tapped (26.11., user): its context, as written, comes into the take window as the take now. */
  async function wordsOver(tile = null) {
    const e = tile ?? A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === A.st.pick);
    const text = (await Promise.resolve(A.media.contextTextOf?.(e?.chain)).catch(() => null)) ?? (e?.words ?? []).map((w) => `(${w})`).join(' ');
    if (!text) return A.shake('context');
    navigator.vibrate?.(8);
    return A.dispatch({ type: 'context', text: [text, A.st.context].filter(Boolean).join(' ') });
  }
  /** The row pushed up a little, or spread upright (26.11., user): Similar opens with the chains of these words, newest first, by date. */
  function similarByDate() {
    const f = A.st.filters;
    navigator.vibrate?.(8);
    if (A.st.similar === 'closed' || A.st.similar === 'single') { location.hash = 'many'; A.dispatch({ type: 'similar', level: 'many' }); }
    return A.dispatch({ type: 'filters', filters: { ...f, open: 'date', full: null, order: { ...f.order, date: 'new' } } });
  }
  /** Where a tap in the row writes: a gap, a take (behind it), a bubble (into it, as its last), the row itself (the end). */
  function caretOf(role) {
    if (role.startsWith('xt:')) return { how: 'after', at: pathOf(role) }; // a take tapped while writing: the caret behind it
    if (role.startsWith('gap:')) { const [, how, path] = role.split(':'); return how === 'end' ? null : { how, at: path ? path.split('.').map(Number) : [] }; }
    if (role.startsWith('bubble:')) { const p = role.slice(7); return p ? { how: 'in', at: p.split('.').map(Number) } : null; }
    return null;
  }
  /** What the row writes into now: the series (the next takes), or – an earlier take in the button – that take's context (21.11.). */
  const editing = () => A.data.edit ?? null;
  const textNow = () => editing()?.text ?? A.st.context;
  function setText(text) { if (editing()) { A.data.edit.text = text; A.paint(); } else A.dispatch({ type: 'context', text }); }
  function openTyping(role) {
    const o = A.st.onboard;
    if (o.on && !o.dropped && !o.name) A.dispatch({ type: 'onboard', patch: { dropped: true } });
    if (A.st.typing && say.value.replace(ZW, '').trim()) commit(); // a second tap while writing: what is written stays where it was, the caret moves on
    const take = !live(A.st) && !o.on ? A.st.lines.at(-1)?.takes[A.st.at] : null; // an earlier take in the button: its own context is written (21.11.)
    if (take && editing()?.id !== take.id) A.data.edit = { n: A.st.lines.length - 1, i: A.st.at, id: take.id, text: take.context ?? '', was: take.context ?? '' };
    if (!take) A.data.edit = null;
    A.data.join = null; // a tap: the next word is a take of its own
    const open = !take && !A.data.edit && openAt(A.st.context); // a bracket left open in front (26.11.): writing goes on inside it
    A.dispatch({ type: 'caret', at: caretOf(role) ?? (open ? { how: 'in', at: open } : null) });
    A.dispatch({ type: 'typing', on: true });
    say.value = ZW; A.data.typing = ''; // the mark lets an empty field still feel Backspace (Android keyboards send no key there)
    if (document.activeElement !== say) say.focus({ preventScroll: true });
    say.setSelectionRange?.(1, 1);
    if (o.on) A.syncOnboard();
  }
  /** Backspace with nothing typed (21.11.): the last word before the caret goes. */
  function backspace() {
    if (A.st.onboard.on) return null;
    A.data.join = null;
    if (A.data.open && same(A.data.open, A.st.caret)) { A.data.open = undefined; navigator.vibrate?.(5); return A.paint(); } // the "(" just typed goes again (22.11.)
    const u = unwrapAt(textNow(), A.st.caret); // right after a bracket's "(": the nesting goes, the words stay (22.11., user)
    if (u) { navigator.vibrate?.(8); setText(u.text); return A.dispatch({ type: 'caret', at: u.caret }); }
    const r = removeBefore(textNow(), A.st.caret);
    if (!r) return A.shake('context');
    navigator.vibrate?.(5);
    setText(r.text);
    return A.dispatch({ type: 'caret', at: r.caret });
  }
  /** Typing done: an earlier take's changed context is kept (own take: a new chain on top of it; take-flow.js retext). */
  function finish() {
    if (A.data.open) { const r = nestBetween(textNow(), A.data.open, endOf(A.data.open)); if (r) setText(r.text); } // a "(" without ")": the bracket reaches to the end of where it was opened (22.11.)
    const e = editing();
    A.data.edit = null; A.data.open = undefined; A.data.join = null;
    if (e && e.text !== e.was) return A.take.retext(e);
    return A.paint();
  }
  function commit() {
    const text = say.value.replace(ZW, '').trim();
    say.value = ZW; A.data.typing = '';
    if (!text) return A.paint();
    const o = A.st.onboard;
    if (o.on && !o.nameSign) {
      try { localStorage.setItem('sign.name', text); } catch { /* private mode */ }
      A.person.label = text;
      A.dispatch({ type: 'onboard', patch: { name: text, dropped: true } });
      return A.syncOnboard();
    }
    if (o.on && o.gestures === PASSWORD_PARTS.length - 1) { A.dispatch({ type: 'onboard', patch: { own: text, ownTyped: true } }); return A.syncOnboard(); }
    typed(`${text} `); // what is left in the field: a word (or brackets) as if a space ended it
    return A.paint();
  }

  // ---------- writing while typing (22.11., user) ----------
  // A word becomes a chip as soon as a space, "(" or ")" ends it; the caret stands behind it. "(" opens a bracket at once:
  // a pastel bubble from there to the end of where the caret is (paint.js rowHtml, A.data.open), what is typed goes into
  // it; ")" closes it at the caret – also behind a word tapped further on. No "(" waiting: ")" ends the bracket the caret
  // is in there (what follows moves out), in the row the bracket before the caret reaches to here. Words without a
  // bracket typed one after another are one take together (context.js typingForm), in a bracket each word one take.
  const same = (a, b) => (a == null && b == null) || (a != null && b != null && a.how === b.how && (a.at ?? []).join('.') === (b.at ?? []).join('.'));
  /** The field's text → words and brackets placed; → what is still being typed. */
  function typed(value) {
    let v = value;
    for (let m = /[\s()]/.exec(v); m; m = /[\s()]/.exec(v)) {
      const word = v.slice(0, m.index), ch = m[0];
      v = v.slice(m.index + 1);
      if (word) placeWord(word);
      if (ch === '(') openBracket();
      else if (ch === ')') closeBracket();
    }
    return v;
  }
  /** The path of the last element at a level ([] = the row) of the text, or null when it is empty. */
  function lastAt(path) {
    let nodes = [];
    try { nodes = contextTree(textNow()); } catch { return null; }
    for (const i of path) nodes = nodes[i]?.items ?? [];
    return nodes.length ? [...path, nodes.length - 1] : null;
  }
  /** A caret as a spot behind something (or first in its level): what is typed later then stays behind it. */
  function spotOf(c) {
    if (c && c.how !== 'in') return c;
    const path = c?.at ?? [], last = lastAt(path);
    return last ? { how: 'after', at: last } : { how: 'first', at: path };
  }
  /** The end of the level a "(" was opened in (as a caret). */
  function endOf(open) {
    const level = open.how === 'after' ? open.at.slice(0, -1) : open.at;
    return level.length ? { how: 'in', at: level } : null;
  }
  function placeWord(text) {
    const c = A.st.caret, open = A.data.open;
    if (!open && A.data.join && same(A.data.join, c)) { const joined = appendWord(textNow(), c, text); if (joined) { setText(joined); return; } }
    const inBracket = Boolean(open) || (c?.at?.length ?? 0) >= 2 || ((c?.how === 'in' || c?.how === 'first') && (c?.at?.length ?? 0) >= 1); // written into a bubble: each word one take (20.11.)
    const r = insertGesture(textNow(), c?.at ?? null, c?.how ?? 'after', fromField(text, { list: inBracket }));
    setText(r.text);
    const next = { how: 'after', at: r.at };
    A.dispatch({ type: 'caret', at: next }); // the next word goes behind this one
    A.data.join = !inBracket && r.at.length === 1 ? next : null;
  }
  function openBracket() {
    A.data.join = null;
    if (A.data.open) { // a bracket inside the one still open: that one becomes real up to here, the new one opens in it
      const r = nestBetween(textNow(), A.data.open, A.st.caret);
      let tree = [];
      try { tree = contextTree(r?.text ?? ''); } catch { tree = []; }
      let n = { items: tree };
      for (const i of r?.at ?? []) n = n?.items?.[i];
      if (!r || !n?.head) return A.shake('context'); // nothing before it: one take, nothing to open inside
      setText(r.text);
      A.dispatch({ type: 'caret', at: { how: 'in', at: r.at } });
    }
    A.data.open = spotOf(A.st.caret);
    navigator.vibrate?.(6);
    A.dispatch({ type: 'caret', at: A.data.open });
  }
  function closeBracket() {
    A.data.join = null;
    const open = A.data.open;
    if (open) {
      const r = nestBetween(textNow(), open, A.st.caret);
      A.data.open = undefined;
      if (!r) return A.paint(); // nothing between: the "(" goes again
      navigator.vibrate?.(8);
      setText(r.text);
      return A.dispatch({ type: 'caret', at: { how: 'after', at: r.at } });
    }
    const r = closeAt(textNow(), A.st.caret);
    if (!r) return A.shake('context');
    navigator.vibrate?.(8);
    setText(r.text);
    return A.dispatch({ type: 'caret', at: r.caret });
  }

  // ---------- Similar's selection views ----------
  /**
   * The rings with sectors are open (21.11.): a ring tapped = that step of its respect; spread or squeeze over a sector
   * = one step wider or narrower (as everywhere); a tap anywhere else = closed.
   */
  function ranging(ev) {
    const r = ev.role ?? '', f = A.st.filters, range = { ...wideOpen(), ...f.range };
    if (ev.type === 'tap') {
      if (!r.startsWith('range:')) { A.data.ranging = false; return A.paint(); }
      const [, k, i] = r.split(':');
      if (!READY[k]) return A.shake('window'); // picture and sound: when their models are there
      navigator.vibrate?.(6);
      return A.dispatch({ type: 'filters', filters: { ...f, range: { ...range, [k]: Number(i) } } });
    }
    if (ev.type === 'hold' && r.startsWith('range:')) { // held: its own choice instead of a range – which sharing points and persons, a period, spots, letters
      const zone = { w: 'who', t: 'date', o: 'spot', x: 'initial' }[r.split(':')[1]];
      if (!zone) return null;
      A.data.ranging = false;
      return A.dispatch({ type: 'filters', filters: zoomZone(f, zone, 1.2) });
    }
    if (ev.type === 'pinch' && ev.phase === 'end' && Math.abs(Math.log(ev.scale)) > 0.1) {
      const L = A.L, deg = ((Math.atan2(ev.centre.x - L.cx, L.cy - ev.centre.y) * 180) / Math.PI + 360) % 360;
      const k = Object.keys(SECTORS).find((x) => { const [a, b] = SECTORS[x]; return ((deg - a + 360) % 360) < b - a; });
      if (!k || !READY[k]) return null;
      navigator.vibrate?.(6);
      return A.dispatch({ type: 'filters', filters: { ...f, range: stepRange(range, k, ev.scale > 1 ? 1 : -1) } });
    }
    return null;
  }
  /** A bundle of the cloud opened: only what is in it, one step finer. */
  function openBundleAt(i) {
    const groups = bundlesOf(A.data.entries ?? [], A.st.filters, { near: A.take?.here?.() }), g = groups?.[i];
    if (!g) return null;
    navigator.vibrate?.(6);
    return A.dispatch({ type: 'filters', filters: openBundle(A.st.filters, g.key) });
  }
  /** A grip tapped: its rail opens (the cloud one by one, sorted by it). Its rail is closed again by pushing it out, or by squeezing. */
  function grip(z) {
    navigator.vibrate?.(6);
    return A.dispatch({ type: 'filters', filters: zoomZone(A.st.filters, z, 1.2) });
  }
  /** Which respect a role on a rail belongs to (the rail itself, its arrow, one of its values). */
  const OUT = { initial: 'left', date: 'right', spot: 'up', who: 'down' };
  function railOf(r) {
    if (r.startsWith('rail:') || r.startsWith('order:')) return r.slice(r.indexOf(':') + 1);
    if (r.startsWith('initial:')) return 'initial';
    if (r.startsWith('period:')) return 'date';
    if (r.startsWith('value:spot:')) return 'spot';
    if (r.startsWith('value:sharing:') || r.startsWith('value:name:')) return 'who';
    return null;
  }
  /** The rail goes; what was chosen on it stays chosen (its grip stays filled), the cloud is no longer bundled by it. */
  function closeRail(z) {
    const f = A.st.filters, value = { ...f.value };
    if (value.bundle?.by === z) delete value.bundle;
    navigator.vibrate?.(6);
    return A.dispatch({ type: 'filters', filters: { ...f, value, open: null, full: null, group: f.group?.by === z ? null : f.group } });
  }
  /**
   * A respect over everything (26.11., paint-over.js): taps choose as on its rail; squeeze = back to the rail (the map:
   * one step coarser first, below its coarsest back to the rail); spread on the map = finer; its sign at the edge = back.
   */
  function over(ev) {
    const r = ev.role ?? '', f = A.st.filters, z = f.full, back = () => { navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: { ...f, full: null } }); };
    if (ev.type === 'pinch') {
      if (ev.phase !== 'end' || Math.abs(Math.log(ev.scale)) < 0.12) return null;
      if (z === 'spot') { const g = f.group?.by === 'spot' ? f.group.level : 2; if (ev.scale < 1 && g <= 0) return back(); navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: { ...zoomZone(f, 'spot', ev.scale), full: 'spot' } }); }
      return ev.scale < 1 ? back() : null;
    }
    if (ev.type !== 'tap') return null;
    if (r === 'full-off') return back();
    if (r.startsWith('period:')) return period(r.slice(7));
    if (r.startsWith('initial:')) return toggleValue('initial', r.slice(8));
    if (r.startsWith('value:')) { const [, name, id] = r.split(':'); return toggleValue(name, id); }
    if (r.startsWith('who-ring:')) { navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: { ...f, range: { ...wideOpen(), ...f.range, w: Number(r.slice(9)) } } }); } // a ring = that step of who's Weite
    return null;
  }
  function toggleValue(name, id) {
    const f = A.st.filters, now = f.value[name] ?? [], next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    navigator.vibrate?.(5);
    return A.dispatch({ type: 'filters', filters: { ...setFilter(f, name, next), on: { ...f.on, [name]: next.length > 0 } } }); // chosen = on (21.11.: no sign row to switch it)
  }
  /** The calendar's span: [from, to] in ms, or null = every time. */
  function setSpan(span) {
    const f = A.st.filters;
    return A.dispatch({ type: 'filters', filters: { ...setFilter(f, 'date', span), on: { ...f.on, date: Boolean(span) } } });
  }
  /**
   * A value of the calendar tapped (26.11.): nothing chosen = only that · the one that is chosen = all again · one
   * outside what is chosen = from … to (the span grows to it) · one inside a span = only that. No dragging: a finger
   * along the rail scrolls it, a long calendar needs that.
   */
  function period(key) {
    const r = periodRange(key), now = A.st.filters.on.date ? A.st.filters.value.date : null;
    if (!r) return null;
    navigator.vibrate?.(5);
    if (!now) return setSpan(r);
    if (now[0] === r[0] && now[1] === r[1]) return setSpan(null);
    if (r[0] >= now[0] && r[1] <= now[1]) return setSpan(r);
    return setSpan([Math.min(now[0], r[0]), Math.max(now[1], r[1])]);
  }

  // ---------- the picture ----------
  async function flip() {
    facing = facing === 'user' ? 'environment' : 'user';
    const fresh = await flipPicture(A.take.camera, facing).then((x) => mainLens(x, facing)).catch(() => null);
    if (fresh) { document.querySelector('#live').srcObject = fresh; A.take.setCamera?.(fresh, facing); } // the side is remembered: opened anew after being away, it is this one
  }
  function focusHere(ev) {
    const box = document.querySelector('#window').getBoundingClientRect();
    if (A.take.camera) focusAt(A.take.camera, (ev.x - box.left) / box.width, (ev.y - box.top) / box.height).catch(() => {});
  }

  // ---------- the sharing menu: the engine's roles ----------
  function sharing(ev, e) {
    const H = A.engine?.handlers, r = ev.role ?? ev.roles?.[0] ?? null;
    if (!H) return null;
    const on = (role) => H.down(fake(role));
    const deviceRole = (x) => (x?.startsWith('dev:') ? 'sp:0' : x);
    if (ev.type === 'tap') {
      if (r === 'confirm:box') return null; // the first circle itself: only its bars and its middle do something
      if (A.data.snap?.confirm && (r === 'sheet' || r === 'sharing' || !r)) { on('sheet'); return H.swipe('down'); } // a tap beside the first circle: nothing goes
      if (!r || r === 'sharing') return A.data.snap?.swarm ? A.engine.back() : A.engine.show(false); // beside an open swarm: the tiles again (26.11.)
      if (r === 'web:save') return saveLast();
      if (r.startsWith('dev:')) return null;
      return A.engine.tapped(r);
    }
    if (ev.type === 'double' && r) { on(deviceRole(r)); return H.doubleTap(); }
    if (ev.type === 'drag' && (r?.startsWith('dev:') || r?.startsWith('sp:'))) {
      A.data.drag = { from: r, x0: ev.x - ev.dx, y0: ev.y - ev.dy, x: ev.x, y: ev.y };
      return A.paintSharing();
    }
    if (ev.type === 'swipe' || ev.type === 'drag-end') {
      const drag = A.data.drag;
      A.data.drag = null;
      const el = e && document.elementFromPoint(e.clientX, e.clientY), onto = el?.closest?.('[data-role]')?.dataset.role;
      if (drag && onto && onto !== drag.from && (onto.startsWith('sp:') || onto === 'add:new')) { on(deviceRole(drag.from)); H.dragEnd(el, true, null, { long: drag.from === 'dev:all' }); return A.paintSharing(); }
      A.paintSharing();
      if (ev.type === 'swipe' && r) { on(deviceRole(r)); return H.swipe(ev.dir === 'down' && ev.far ? 'down-out' : ev.dir); }
      return null;
    }
    if (ev.type === 'release' && r) { on(deviceRole(r)); return H.dragEnd(e && document.elementFromPoint(e.clientX, e.clientY), false); }
    if (ev.type === 'hold' && r) { on(deviceRole(r)); return H.holdLong?.(); }
    if (ev.type === 'pinch' && r) { on(r); return ev.phase === 'end' ? H.pinchEnd?.() : H.pinch?.(ev.scale); }
    return null;
  }
  async function saveLast() {
    const take = takeNow();
    const chain = take && [...(A.index?.tables.chains.values() ?? [])].find((c) => c.from?.path === take.id);
    const at = chain && A.media.visualOf(chain);
    if (!at) return A.engine.tapped('out:system');
    const { url } = await A.media.playable(at, { whole: true }); // the file itself, not one that is still coming (27.11.)
    const a = Object.assign(document.createElement('a'), { href: url, download: at.path.split('/').pop() });
    document.body.append(a); a.click(); a.remove();
    return null;
  }

  return { onEvent, commit, backspace, finish, typed };
}
