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
//   arcs     tap = that strand on/off
//   line     tap the line or an older line's small arc = chosen (outlined) · tap a take = look at it ·
//            squeeze two takes together = joined
//   row      tap = write (where: between two elements, into a bubble, at the end) · the preset "Name" pulled down = away
//   above    spread above the take = Similar comes (then full), squeeze = it goes; a tile tapped = double view
//   Similar  tap a selection view = on/off (date, initial, @, sharing point, spot open their choices) · hold date or
//            initial = their order turns · drag over the date bar = the span
//   picture  ← / → = the other camera (at 1×) · tap = focus there · two fingers = the window's form: side by side =
//            width, one above the other = height, slanted = corners (rectangle ↔ circle); at most 1:1, snaps to the
//            picture's format
// Depends:   browser; take-state.js, line.js, similar-view.js, chips.js, 1-model/context.js, 4-save/add-line.js
// Test:      the meanings in tests/ui.test.mjs (buttonMeaning, zoomed, filters); the wiring on a phone.
// Limits:    the moment slides ± 3 s across the spread button; a cut needs ≥ 200 ms on both sides (line.js).

import { buttonMeaning, live, count } from './take-state.js';
import { joinTakes, cutTake, withContext } from './line.js';
import { nowWords } from './chips.js';
import { slotPx, onTake, timeline, wideButton } from './layout.js';
import { zoomed, tapFilter, turnOrder, setFilter } from './similar-view.js';
import { zoneOf, zoomZone, openBundle, bundlesOf } from './similar-zoom.js';
import { SECTORS, READY, wideOpen, stepRange } from './similar-range.js';
import { insertGesture, fromField } from '../1-model/context.js';
import { removeBefore, wrapBetween } from '../1-model/context-edit.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { flipPicture, focusAt, mainLens } from './camera.js';
import { BOW } from './paint.js';
import { inside, formBy, snap } from './form.js';

const CUT = 1.15, RUN_RATE = 0.5; // past the widest by 15 % = cut · the timeline runs through at half speed
const onLine = (r) => r === 'line' || r.startsWith('take:') || r.startsWith('old:');
const fake = (role) => ({ target: { closest: () => ({ dataset: { role } }) } });

export const ZW = '\u200b'; // a mark at the start of the typing field: deleting it = Backspace with nothing typed (21.11.)
const inRow = (r) => r === 'context' || r === 'under' || r.startsWith('gap:') || r.startsWith('chip:') || r.startsWith('bubble:');

export function gesturesOf(A) {
  const say = document.querySelector('#say');
  let wide = null, facing = A.settings.facing, shaping = null; // shaping: two fingers on the picture, the form at their start (20.11.)
  let zooming = null; // the zoom in time at the start of a pinch on one side of the mark (20.11.)

  function onEvent(ev, e) {
    if (A.st.share) return sharing(ev, e);
    if (A.data.ranging) return ranging(ev);
    if (ev.type === 'hold' && ev.role === 'window' && (A.st.similar === 'many' || A.st.similar === 'double')) { A.data.ranging = true; navigator.vibrate?.(10); return A.paint(); } // how far Similar looks: the rings with sectors (21.11.)
    if (ev.type === 'pinch') return pinch(ev);
    const r = ev.role ?? '';
    if (onLine(r) && (ev.type === 'drag' || ev.type === 'swipe' || ev.type === 'drag-end')) return pull(ev); // the line follows the finger (17.11.)
    if (A.st.typing && ev.type === 'tap' && !inRow(r)) say.blur(); // a tap anywhere else takes over what is written (blur commits), then does what it does
    if (r === 'button') return button(ev);
    if (ev.type === 'tap') {
      if (r.startsWith('strand:') && !live(A.st) && A.st.rec === 'idle' && A.take.addStrand(r.slice(7))) return null; // an earlier take without it: only this strand is taken, onto it (21.11.)
      if (r.startsWith('strand:')) return A.dispatch({ type: 'strand', kind: r.slice(7) });
      if (r.startsWith('dstrand:')) { navigator.vibrate?.(8); return A.dispatch({ type: 'dstrand', kind: r.slice(8) }); } // the double view: what one sees and hears (20.11.)
      if (r === 'line') return A.dispatch({ type: 'select-line', n: A.st.lines.length - 1 });
      if (r.startsWith('old:')) return A.dispatch({ type: 'select-line', n: Number(r.slice(4)) });
      if (r.startsWith('take:')) return A.dispatch({ type: 'at', at: Number(r.slice(5)) });
      if (r.startsWith('tile:')) { // what lies on top of a chain decides where it opens (21.11., user): ?( ) Similar · a line or _() the take window
        const e = A.data.entries[Number(r.slice(5))];
        if (e?.kind === 'search') return A.similar.openSearch(e); // a similar is a view: it opens
        return A.similar.pick(e?.key); // a take, a series, a template: seen in the double view first; dragged into the take = taken over (similar-flow toLine)
      }
      if (r.startsWith('kinds:')) return A.similar.openKind(r.slice(6)); // the bubble of templates, series or saved similar: their own cloud (21.11.)
      if (r.startsWith('kind:')) { const k = r.slice(5), f = A.st.filters; return A.dispatch({ type: 'filters', filters: { ...f, on: { ...f.on, [k]: f.on[k] === false } } }); } // which chains the cloud shows
      if (r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: tapFilter(A.st.filters, r.slice(7)) });
      if (r.startsWith('bundle:')) return openBundleAt(Number(r.slice(7))); // a bundle: only it, one step finer (21.11.)
      if (r.startsWith('grip:')) return grip(r.slice(5));
      if (r.startsWith('who-ring:')) { const f = A.st.filters; navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: { ...f, range: { ...wideOpen(), ...f.range, w: Number(r.slice(9)) } } }); } // a ring of wer = that step of its Weite
      if (r.startsWith('order:')) { navigator.vibrate?.(6); return A.dispatch({ type: 'filters', filters: turnOrder(A.st.filters, r.slice(6)) }); } // the arrow: the other way round, the cloud sorts so
      if (r.startsWith('initial:')) return toggleValue('initial', r.slice(8));
      if (r.startsWith('value:')) { const [, name, id] = r.split(':'); return toggleValue(name, id); }
      if (r === 'window') return focusHere(ev);
      if (r === 'screen' && A.L && A.st.similar !== 'full' && A.st.strands.x && ev.y > A.L.cy + A.L.R + 10 * A.L.k && Math.abs(ev.x - A.L.cx) < A.L.rx + 60 * A.L.k) return openTyping('context'); // anywhere under the bottom arc = write (17.11.)
      if (inRow(r)) return openTyping(r);
    }
    if (r.startsWith('tile:') || r === 'double') { // a result carried into the take window = it lies there as a line (17.11.)
      const key = r === 'double' ? A.st.pick : A.data.entries[Number(r.slice(5))]?.key;
      if (ev.type === 'drag' && Math.abs(ev.dy) > 14) { A.data.carry = { x: ev.x, y: ev.y, pic: (A.data.entries ?? []).find((x) => x.key === key)?.thumb ?? null }; return A.paint(); }
      if ((ev.type === 'swipe' || ev.type === 'drag-end') && A.data.carry) {
        const c = A.data.carry, L = A.L; A.data.carry = null; A.paint();
        const inWindow = inside(L, c.x, c.y, L.ring * 2) || Math.hypot(c.x - L.button.x, c.y - L.button.y) < L.ring * 2;
        if (inWindow && key) return A.similar.toLine(key);
        if (r === 'double' && (ev.dir === 'left' || ev.dir === 'right')) return A.similar.step(ev.dir) || nextResult(ev.dir);
        return null;
      }
    }
    if (ev.type === 'hold' && r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: turnOrder(A.st.filters, r.slice(7)) });
    if (ev.type === 'drag' && r === 'datebar') return dateSpan(ev);
    if (ev.type === 'swipe') {
      if (r === 'double' && (ev.dir === 'left' || ev.dir === 'right')) return A.similar.step(ev.dir) || nextResult(ev.dir); // ← → above: the next account that may be hers, else the next result
      if (r.startsWith('chip:') && ev.dir === 'down' && r.slice(5) === 'Name' && A.st.onboard.on) { A.dispatch({ type: 'onboard', patch: { dropped: true } }); return A.syncOnboard(); }
      if (ev.dir === 'down' && r === 'search-off') return A.similar.closeSearch(); // pulled down = away (21.11., user: no ✕)
      if (ev.dir === 'down' && r === 'kinds-off') return A.similar.closeKind();
      if (inRow(r) && ev.dir === 'up' && live(A.st) && !A.st.onboard.on && A.st.context) { // the written series pushed up over the edge = shared as a template (21.11.)
        navigator.vibrate?.(12);
        return A.take.saveTemplate(A.st.context).then((p) => { if (!p) return A.shake('context'); A.engine?.show(true); return A.dispatch({ type: 'share', open: true }); });
      }
      if (r === 'window' && (ev.dir === 'left' || ev.dir === 'right') && A.st.rec === 'idle' && A.take.camera) return flip();
    }
    return null;
  }

  /** ← → on a result in the double view: the next / the one before (F5). */
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
    if (ev.type === 'swipe' && (ev.dir === 'up' || ev.dir === 'down') && (A.similar.carried || (A.similar.looking && st.pick))) return A.similar.decide(ev.dir);
    if (ev.type === 'tap' && A.similar.carried && !live(st)) return play(); // the guest in the window: tap = it stops / plays on
    const across = Math.abs(ev.dx ?? 0) > Math.abs(ev.dy ?? 0);
    const towardsNothing = live(st) && !pulled && (ev.dx ?? 0) < 0; // on the ready button there is nothing newer: ← is the picture (21.11.)
    if (st.rec === 'idle' && count(st) && st.chosenLine == null && !towardsNothing && ((ev.type === 'drag' && (across || pulled)) || ((ev.type === 'swipe' || ev.type === 'drag-end') && pulled))) return pull(ev);
    const m = buttonMeaning(st, ev);
    if (st.onboard.on && !st.onboard.name && !st.onboard.nameSign && ['start', 'photo', 'photo-share'].includes(m?.do)) { A.shake('context'); return openTyping('context'); } // first the name, then its sign (17.11.: a hello without a name went out)
    switch (m?.do) {
      case 'start': A.similar.dropGuest(); return A.take.start();
      case 'pause': return A.take.pause();
      case 'resume': return A.take.resume();
      case 'photo': A.similar.dropGuest(); return A.take.photo();
      case 'photo-share': A.similar.dropGuest(); return A.take.photo().then(() => { A.engine?.show(true); A.dispatch({ type: 'share', open: true }); }); // the picture just taken is what is shared
      case 'keep': return A.take.keep();
      case 'anew': return A.take.anew();
      case 'clear-context': navigator.vibrate?.(10); return A.dispatch({ type: 'clear-context' });
      case 'next': return A.dispatch({ type: 'step', dir: 'left' });
      case 'before': return A.dispatch({ type: 'step', dir: 'right' });
      case 'play': return play();
      case 'share': A.engine?.show(true); return A.dispatch({ type: 'share', open: true });
      case 'share-line': A.engine?.show(true); return A.dispatch({ type: 'share', open: true }); // what is shared: the chosen line (take-flow lastChain)
      case 'share-similar': return A.similar.saveSearch().then(() => { A.engine?.show(true); A.dispatch({ type: 'share', open: true }); }); // the cloud as it is: a search chain (21.11.)
      case 'share-to': { const e = A.data.picked ?? (A.data.entries ?? []).find((x) => x.key === A.st.pick); A.data.suggest ??= e?.person || null; A.engine?.show(true); return A.dispatch({ type: 'share', open: true }); } // the double view: to her (one's answer, if taken)
      case 'line-with': return lineContext(false);
      case 'line-without': return lineContext(true);
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
  /** Tap on an earlier take: it plays in the window (what it really is: its parts, one after another), tap again = pause. */
  function play() {
    const take = takeNow();
    if (!take) return A.shake('button');
    if (A.player.playing) return A.player.pause();
    return A.player.show(take, 0, { play: true, onEnd: () => A.paint() }).then((ok) => (ok ? null : A.shake('button')));
  }

  // ---------- the line under the finger (17.11.): it slides, lets go, rests on the nearest take ----------
  let pulled = null; // { v (px/ms), x, t }
  function pull(ev) {
    const px = slotPx(A.L), n = count(A.st);
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
  function pinch(ev) {
    const L = A.L, [a, b] = ev.roles ?? [];
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
        const f = A.st.filters, zone = zoneOf(L.similarBox, ev.centre, L.k) ?? (f.value.bundle && ev.scale < 0.88 ? f.value.bundle.by : null);
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
  /** Where a tap in the row writes: a gap, a take (behind it), a bubble (into it, as its last), the row itself (the end). */
  function caretOf(role) {
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
    A.dispatch({ type: 'caret', at: caretOf(role) });
    A.dispatch({ type: 'typing', on: true });
    say.value = ZW; A.data.typing = ''; // the mark lets an empty field still feel Backspace (Android keyboards send no key there)
    if (document.activeElement !== say) say.focus({ preventScroll: true });
    say.setSelectionRange?.(1, 1);
    if (o.on) A.syncOnboard();
  }
  /** Backspace with nothing typed (21.11.): the last word before the caret goes. */
  function backspace() {
    if (A.st.onboard.on) return null;
    const r = removeBefore(textNow(), A.st.caret);
    if (!r) return A.shake('context');
    navigator.vibrate?.(5);
    setText(r.text);
    return A.dispatch({ type: 'caret', at: r.caret });
  }
  /** Typing done: an earlier take's changed context is kept (own take: a new chain on top of it; take-flow.js retext). */
  function finish() {
    const e = editing();
    A.data.edit = null; A.data.open = undefined;
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
    if (text === '(') { A.data.open = { caret: A.st.caret }; return A.paint(); } // nesting afterwards (21.11.): "(" here …
    if (text === ')' && A.data.open) { // … ")" there: what lies between is nested
      const w = wrapBetween(textNow(), A.data.open.caret, A.st.caret);
      A.data.open = undefined;
      if (!w) return A.shake('context');
      navigator.vibrate?.(8);
      setText(w);
      return A.dispatch({ type: 'caret', at: null });
    }
    const c = A.st.caret;
    const inBracket = (c?.at?.length ?? 0) >= 2 || ((c?.how === 'in' || c?.how === 'first') && (c?.at?.length ?? 0) >= 1); // written into a bubble: each word one take (20.11.)
    const r = insertGesture(textNow(), c?.at ?? null, c?.how ?? 'after', fromField(text, { list: inBracket }));
    setText(r.text);
    return A.dispatch({ type: 'caret', at: c ? { how: 'after', at: r.at } : null }); // the next word goes behind this one
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
    const groups = bundlesOf(A.data.entries ?? [], A.st.filters), g = groups?.[i];
    if (!g) return null;
    navigator.vibrate?.(6);
    return A.dispatch({ type: 'filters', filters: openBundle(A.st.filters, g.key) });
  }
  /** A grip tapped: its zone opens (one by one, sorted by it); open already = closed. */
  function grip(z) {
    const f = A.st.filters;
    if (f.open === z || f.group?.by === z) { const value = { ...f.value }; if (value.bundle?.by === z) delete value.bundle; return A.dispatch({ type: 'filters', filters: { ...f, value, open: null, group: f.group?.by === z ? null : f.group } }); }
    return A.dispatch({ type: 'filters', filters: zoomZone(f, z, 1.2) });
  }
  function toggleValue(name, id) {
    const f = A.st.filters, now = f.value[name] ?? [], next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    return A.dispatch({ type: 'filters', filters: { ...setFilter(f, name, next), on: { ...f.on, [name]: next.length > 0 } } }); // chosen = on (21.11.: no sign row to switch it)
  }
  function dateSpan(ev) {
    const bar = document.querySelector('.datebar')?.getBoundingClientRect();
    if (!bar) return null;
    const f = (y) => Math.max(0, Math.min(1, (y - bar.top) / bar.height));
    const a = f(ev.y - ev.dy), b = f(ev.y), lo = Math.min(a, b), hi = Math.max(a, b);
    const ts = (A.data.entries ?? []).map((x) => x.t).filter(Boolean);
    const newest = Math.max(Date.now(), ...ts), oldest = Math.min(newest - 864e5, ...ts);
    const at = (p) => (A.st.filters.order.date === 'new' ? newest - p * (newest - oldest) : oldest + p * (newest - oldest));
    A.data.similarLists = { ...(A.data.similarLists ?? {}), range: [lo, hi] };
    return A.dispatch({ type: 'filters', filters: { ...setFilter(A.st.filters, 'date', [Math.min(at(lo), at(hi)), Math.max(at(lo), at(hi))]), on: { ...A.st.filters.on, date: true } } });
  }

  // ---------- the picture ----------
  async function flip() {
    facing = facing === 'user' ? 'environment' : 'user';
    const fresh = await flipPicture(A.take.camera, facing).then((x) => mainLens(x, facing)).catch(() => null);
    if (fresh) { document.querySelector('#live').srcObject = fresh; A.take.setCamera?.(fresh); }
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
      if (!r || r === 'sharing') return A.engine.show(false);
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
    const { url } = await A.media.playable(at);
    const a = Object.assign(document.createElement('a'), { href: url, download: at.path.split('/').pop() });
    document.body.append(a); a.click(); a.remove();
    return null;
  }

  return { onEvent, commit, backspace, finish };
}
