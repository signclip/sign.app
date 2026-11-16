// gestures-take.js — what a gesture means where it starts (16.11.): button, arcs, line, context row, Similar, picture,
// and in the sharing menu the engine's roles. One finger = start spot + direction; two fingers = spread or squeeze.
//
//   button   tap: start · pause · go on (photo: one picture; on an earlier take: play) · ← keep / the next · → the one
//            before · ↑ sharing menu (a line chosen: onto that line) · ↓ a little: context away · ↓ far: take anew
//            (a line chosen: off that line) · spread: the button across, slide = the moment, past its widest = cut there
//   arcs     tap = that strand on/off · the dot on the visual arc = photo on/off
//   line     tap the line or an older line's small arc = chosen (outlined) · tap a take = look at it ·
//            squeeze two takes together = joined
//   row      tap = write (where: between two elements, into a bubble, at the end) · the preset "Name" pulled down = away
//   above    spread above the take = Similar comes (then full), squeeze = it goes; a tile tapped = double view
//   Similar  tap a selection view = on/off (date, initial, @, sharing point, spot open their choices) · hold date or
//            initial = their order turns · drag over the date bar = the span
//   picture  ← / → = the other camera · tap = focus there
// Depends:   browser; take-state.js, line.js, similar-view.js, chips.js, 1-model/context.js, 4-save/add-line.js
// Test:      the meanings in tests/ui.test.mjs (buttonMeaning, zoomed, filters); the wiring on a phone.
// Limits:    the moment slides ± 3 s across the spread button; a cut needs ≥ 200 ms on both sides (line.js).

import { buttonMeaning, live, count } from './take-state.js';
import { joinTakes, cutTake, putOnLine, removeTake } from './line.js';
import { slotPx } from './layout.js';
import { zoomed, tapFilter, turnOrder, setFilter } from './similar-view.js';
import { insertGesture, fromField } from '../1-model/context.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { flipPicture, focusAt } from './camera.js';

const CUT = 1.15, RUN_RATE = 0.5; // past the widest by 15 % = cut · the timeline runs through at half speed
const onLine = (r) => r === 'line' || r.startsWith('take:') || r.startsWith('old:');
const fake = (role) => ({ target: { closest: () => ({ dataset: { role } }) } });

const inRow = (r) => r === 'context' || r === 'under' || r.startsWith('gap:') || r.startsWith('chip:') || r.startsWith('bubble:');

export function gesturesOf(A) {
  const say = document.querySelector('#say');
  let wide = null, facing = A.settings.facing;

  function onEvent(ev, e) {
    if (A.st.share) return sharing(ev, e);
    if (ev.type === 'pinch') return pinch(ev);
    const r = ev.role ?? '';
    if (onLine(r) && (ev.type === 'drag' || ev.type === 'swipe' || ev.type === 'drag-end')) return pull(ev); // the line follows the finger (17.11.)
    if (A.st.typing && ev.type === 'tap' && !inRow(r)) say.blur(); // a tap anywhere else takes over what is written (blur commits), then does what it does
    if (r === 'button') return button(ev);
    if (ev.type === 'tap') {
      if (r.startsWith('strand:')) return A.dispatch({ type: 'strand', kind: r.slice(7) });
      if (r === 'photo') return A.dispatch({ type: 'photo' });
      if (r === 'line') return A.dispatch({ type: 'select-line', n: A.st.lines.length - 1 });
      if (r.startsWith('old:')) return A.dispatch({ type: 'select-line', n: Number(r.slice(4)) });
      if (r.startsWith('take:')) return A.dispatch({ type: 'at', at: Number(r.slice(5)) });
      if (r.startsWith('tile:')) return A.similar.pick(A.data.entries[Number(r.slice(5))]?.key);
      if (r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: tapFilter(A.st.filters, r.slice(7)) });
      if (r.startsWith('initial:')) return toggleValue('initial', r.slice(8));
      if (r.startsWith('value:')) { const [, name, id] = r.split(':'); return toggleValue(name, id); }
      if (r === 'window') return focusHere(ev);
      if (r === 'screen' && A.L && A.st.similar === 'closed' && A.st.strands.x && ev.y > A.L.cy + A.L.R + 10 * A.L.k) return openTyping('context'); // anywhere under the bottom arc = write (17.11.)
      if (inRow(r)) return openTyping(r);
    }
    if (ev.type === 'hold' && r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: turnOrder(A.st.filters, r.slice(7)) });
    if (ev.type === 'drag' && r === 'datebar') return dateSpan(ev);
    if (ev.type === 'swipe') {
      if (r === 'double' && (ev.dir === 'left' || ev.dir === 'right')) return A.similar.step(ev.dir) || nextResult(ev.dir); // ← → above: the next account that may be hers, else the next result
      if (r.startsWith('chip:') && ev.dir === 'down' && r.slice(5) === 'Name' && A.st.onboard.on) { A.dispatch({ type: 'onboard', patch: { dropped: true } }); return A.syncOnboard(); }
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
    if (A.similar.looking && st.pick && ev.type === 'swipe' && (ev.dir === 'up' || ev.dir === 'down')) return A.similar.decide(ev.dir);
    const across = Math.abs(ev.dx ?? 0) > Math.abs(ev.dy ?? 0);
    if (st.rec === 'idle' && count(st) && ((ev.type === 'drag' && (across || pulled)) || ((ev.type === 'swipe' || ev.type === 'drag-end') && pulled))) return pull(ev);
    const m = buttonMeaning(st, ev);
    if (st.onboard.on && !st.onboard.name && !st.onboard.nameSign && ['start', 'photo'].includes(m?.do)) { A.shake('context'); return openTyping('context'); } // first the name, then its sign (17.11.: a hello without a name went out)
    switch (m?.do) {
      case 'start': return A.take.start();
      case 'pause': return A.take.pause();
      case 'resume': return A.take.resume();
      case 'photo': return A.take.photo();
      case 'keep': return A.take.keep();
      case 'anew': return A.take.anew();
      case 'clear-context': navigator.vibrate?.(10); return A.dispatch({ type: 'clear-context' });
      case 'next': return A.dispatch({ type: 'step', dir: 'left' });
      case 'before': return A.dispatch({ type: 'step', dir: 'right' });
      case 'play': return play();
      case 'share': A.engine?.show(true); return A.dispatch({ type: 'share', open: true });
      case 'to-line': return toLine();
      case 'off-line': return offLine();
      default: return null;
    }
  }
  const takeNow = () => A.st.lines.at(-1).takes[Math.min(A.st.at, count(A.st) - 1)];
  function toLine() {
    const take = takeNow();
    if (!take || A.st.chosenLine == null) return A.shake('button');
    navigator.vibrate?.(20);
    A.dispatch({ type: 'lines', lines: putOnLine(A.st.lines, A.st.chosenLine, take) });
    A.keepLines();
    return A.dispatch({ type: 'select-line', n: A.st.chosenLine });
  }
  function offLine() {
    const n = A.st.chosenLine, line = A.st.lines[n];
    if (!line?.takes.length) return A.shake('button');
    const i = n === A.st.lines.length - 1 ? Math.min(A.st.at, line.takes.length - 1) : line.takes.length - 1;
    navigator.vibrate?.([12, 50, 12]);
    A.dispatch({ type: 'lines', lines: removeTake(A.st.lines, n, i) });
    A.keepLines();
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
    const nearButton = L && Math.hypot(ev.centre.x - L.button.x, ev.centre.y - L.button.y) < 70 * L.k;
    if ((a === 'button' || b === 'button' || nearButton) && A.st.similar !== 'full' && A.st.rec === 'idle' && count(A.st)) {
      if (live(A.st)) A.dispatch({ type: 'at', at: count(A.st) - 1 }); // the button holds no take yet: the newest one opens
      const spread = Math.max(0, Math.min(1.4, (ev.scale - 1) / 1.2 + (wide?.base ?? 0)));
      if (ev.phase === 'move') {
        if (!wide) { wide = { base: A.st.wide, fresh: A.st.wide < 0.1 }; if (wide.fresh) { A.player.pause(); A.dispatch({ type: 'wide', spread, ms: 0 }); } } // it opens at the take's beginning: the whole take lies to the right
        A.data.cut = spread > 1 ? Math.min(1, (spread - 1) / (CUT - 1)) : 0;
        return A.dispatch({ type: 'wide', spread });
      }
      const was = wide; wide = null; A.data.cut = 0;
      if (spread > CUT && was && !was.fresh) return cut(); // spread further on the open timeline: the take parts at the mark
      if (spread < 0.1) return closeWide();
      A.dispatch({ type: 'wide', spread: 1 });
      if (was?.fresh) run(); // just opened: it runs through slowly, the picture in the window runs along
      return null;
    }
    if (ev.phase !== 'end') return null;
    if (a?.startsWith('take:') && b?.startsWith('take:') && ev.scale < 0.75) return join(Number(a.slice(5)), Number(b.slice(5)));
    const L0 = A.L, above = L0 && ev.centre.y < L0.button.y + 30 * L0.k;
    if (A.st.similar === 'closed' && !above) return null;
    const level = zoomed(A.st.similar, ev.scale);
    if (level !== A.st.similar) { navigator.vibrate?.(8); if (level !== 'closed') location.hash = level; } // Android back = closes (hashchange in app.js)
    return A.dispatch({ type: 'similar', level });
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
    const span = Math.max(2000, Math.min(6000, (take.ms ?? 0) * 1.4)), w = (2 * A.L.R) / 1.618;
    const ms = Math.max(0, Math.min(take.ms ?? 0, scrubFrom - (ev.dx * span) / w));
    A.player.show(take, ms);
    return A.dispatch({ type: 'wide', spread: A.st.wide, ms });
  }
  function cut() {
    const n = A.st.lines.length - 1, i = Math.min(A.st.at, count(A.st) - 1);
    const lines = cutTake(A.st.lines, n, i, A.st.wideMs);
    if (lines === A.st.lines) { A.shake('button'); return A.dispatch({ type: 'wide', spread: 1 }); } // too near an end (< 200 ms): it stays open
    navigator.vibrate?.([10, 30, 10]);
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
  function openTyping(role) {
    const o = A.st.onboard;
    if (o.on && !o.dropped && !o.name) A.dispatch({ type: 'onboard', patch: { dropped: true } });
    if (A.st.typing && say.value.trim()) commit(); // a second tap while writing: what is written stays where it was, the caret moves on
    A.dispatch({ type: 'caret', at: caretOf(role) });
    A.dispatch({ type: 'typing', on: true });
    say.value = ''; A.data.typing = '';
    if (document.activeElement !== say) say.focus({ preventScroll: true });
    if (o.on) A.syncOnboard();
  }
  function commit() {
    const text = say.value.trim();
    say.value = ''; A.data.typing = '';
    if (!text) return A.paint();
    const o = A.st.onboard;
    if (o.on && !o.nameSign) {
      try { localStorage.setItem('sign.name', text); } catch { /* private mode */ }
      A.person.label = text;
      A.dispatch({ type: 'onboard', patch: { name: text, dropped: true } });
      return A.syncOnboard();
    }
    if (o.on && o.gestures === PASSWORD_PARTS.length - 1) { A.dispatch({ type: 'onboard', patch: { own: text, ownTyped: true } }); return A.syncOnboard(); }
    const c = A.st.caret;
    const r = insertGesture(A.st.context, c?.at ?? null, c?.how ?? 'after', fromField(text));
    A.dispatch({ type: 'context', text: r.text });
    return A.dispatch({ type: 'caret', at: c ? { how: 'after', at: r.at } : null }); // the next word goes behind this one
  }

  // ---------- Similar's selection views ----------
  function toggleValue(name, id) {
    const now = A.st.filters.value[name] ?? [];
    return A.dispatch({ type: 'filters', filters: setFilter(A.st.filters, name, now.includes(id) ? now.filter((x) => x !== id) : [...now, id]) });
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
    return A.dispatch({ type: 'filters', filters: setFilter(A.st.filters, 'date', [Math.min(at(lo), at(hi)), Math.max(at(lo), at(hi))]) });
  }

  // ---------- the picture ----------
  async function flip() {
    facing = facing === 'user' ? 'environment' : 'user';
    const fresh = await flipPicture(A.take.camera, facing).catch(() => null);
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

  return { onEvent, commit };
}
