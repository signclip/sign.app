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
import { zoomed, tapFilter, turnOrder, setFilter } from './similar-view.js';
import { insertGesture, fromField } from '../1-model/context.js';
import { PASSWORD_PARTS } from '../8-join/flow.js';
import { flipPicture, focusAt } from './camera.js';

const SPAN_MS = 6000, CUT = 1.15;
const fake = (role) => ({ target: { closest: () => ({ dataset: { role } }) } });

export function gesturesOf(A) {
  const say = document.querySelector('#say');
  let wide = null, facing = A.settings.facing;

  function onEvent(ev, e) {
    if (A.st.share) return sharing(ev, e);
    if (ev.type === 'pinch') return pinch(ev);
    const r = ev.role ?? '';
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
      if (r === 'context' || r.startsWith('gap:') || r.startsWith('chip:') || r.startsWith('bubble:')) return openTyping(r);
    }
    if (ev.type === 'hold' && r.startsWith('filter:')) return A.dispatch({ type: 'filters', filters: turnOrder(A.st.filters, r.slice(7)) });
    if (ev.type === 'drag' && r === 'datebar') return dateSpan(ev);
    if (ev.type === 'swipe') {
      if (r.startsWith('chip:') && ev.dir === 'down' && r.slice(5) === 'Name' && A.st.onboard.on) { A.dispatch({ type: 'onboard', patch: { dropped: true } }); return A.syncOnboard(); }
      if (r === 'window' && (ev.dir === 'left' || ev.dir === 'right') && A.st.rec === 'idle' && A.take.camera) return flip();
    }
    return null;
  }

  // ---------- the button ----------
  function button(ev) {
    const st = A.st;
    if (st.wide > 0.02) {
      if (ev.type === 'drag') return scrub(ev);
      if (ev.type === 'tap') { wide = null; A.data.cut = 0; return A.dispatch({ type: 'wide', spread: 0 }); }
      if (ev.type === 'swipe' || ev.type === 'drag-end') { if (wide) wide.ms0 = st.wideMs; return null; }
    }
    if (A.similar.looking && st.pick && ev.type === 'swipe' && (ev.dir === 'up' || ev.dir === 'down')) return A.similar.decide(ev.dir);
    const m = buttonMeaning(st, ev);
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
  async function play() {
    const take = takeNow(), v = document.querySelector('#replay');
    const chain = take && [...(A.index?.tables.chains.values() ?? [])].find((c) => c.from?.path === take.id);
    const at = chain && A.media.visualOf(chain);
    if (!at) return A.shake('button');
    if (!v.paused && v.dataset.take === take.id) return v.pause();
    const { url, picture } = await A.media.playable(at);
    if (picture) return null;
    v.src = url; v.dataset.take = take.id; v.hidden = false; v.onended = () => { v.hidden = true; };
    return v.play().catch(() => {});
  }

  // ---------- spread, squeeze ----------
  function pinch(ev) {
    const L = A.L, [a, b] = ev.roles ?? [];
    const nearButton = L && Math.hypot(ev.centre.x - L.button.x, ev.centre.y - L.button.y) < 70 * L.k;
    if ((a === 'button' || b === 'button' || nearButton) && A.st.similar !== 'full') {
      const spread = Math.max(0, Math.min(1.4, (ev.scale - 1) / 1.2 + (wide?.base ?? 0)));
      if (ev.phase === 'move') { wide ??= { base: A.st.wide, ms0: A.st.wideMs }; A.data.cut = spread > CUT ? 1 : 0; return A.dispatch({ type: 'wide', spread }); }
      const base = wide; wide = null; A.data.cut = 0;
      if (spread > CUT && !live(A.st)) return cut();
      return A.dispatch({ type: 'wide', spread: spread < 0.1 ? 0 : Math.min(1, spread), ms: base?.ms0 ?? A.st.wideMs });
    }
    if (ev.phase !== 'end') return null;
    if (a?.startsWith('take:') && b?.startsWith('take:') && ev.scale < 0.75) return join(Number(a.slice(5)), Number(b.slice(5)));
    const L0 = A.L, above = L0 && ev.centre.y < L0.button.y + 30 * L0.k;
    if (A.st.similar === 'closed' && !above) return null;
    const level = zoomed(A.st.similar, ev.scale);
    if (level !== A.st.similar) { navigator.vibrate?.(8); if (level !== 'closed') location.hash = level; } // Android back = closes (hashchange in app.js)
    return A.dispatch({ type: 'similar', level });
  }
  function scrub(ev) {
    const L = A.L, w = L && (2 * L.R) / 1.618;
    wide ??= { base: A.st.wide, ms0: A.st.wideMs };
    const take = takeNow(), len = take?.ms ?? 0;
    const ms = Math.max(0, Math.min(len, wide.ms0 - (ev.dx * SPAN_MS) / (w || 200)));
    const ticks = [];
    for (let t = Math.ceil((ms - SPAN_MS / 2) / 500) * 500; t <= ms + SPAN_MS / 2; t += 500) if (t >= 0 && t <= len) ticks.push(L.button.x + ((t - ms) * w) / SPAN_MS);
    A.data.wideTicks = ticks;
    return A.dispatch({ type: 'wide', spread: A.st.wide, ms });
  }
  function cut() {
    const n = A.st.lines.length - 1, i = Math.min(A.st.at, count(A.st) - 1);
    const lines = cutTake(A.st.lines, n, i, A.st.wideMs);
    if (lines === A.st.lines) { A.shake('button'); return A.dispatch({ type: 'wide', spread: 1 }); } // nothing to cut here: it stays open
    navigator.vibrate?.([10, 30, 10]);
    A.dispatch({ type: 'lines', lines });
    A.keepLines();
    return A.dispatch({ type: 'wide', spread: 0 });
  }
  function join(i, j) {
    const lo = Math.min(i, j);
    if (Math.abs(i - j) !== 1) return A.shake(`take:${i}`);
    navigator.vibrate?.(20);
    A.dispatch({ type: 'lines', lines: joinTakes(A.st.lines, A.st.lines.length - 1, lo) });
    return A.keepLines();
  }

  // ---------- the context row ----------
  function openTyping(role) {
    const o = A.st.onboard;
    if (o.on && !o.dropped && !o.name) A.dispatch({ type: 'onboard', patch: { dropped: true } });
    let at = null, how = 'after';
    if (role.startsWith('gap:')) { const [, h, path] = role.split(':'); how = h; at = path ? path.split('.').map(Number) : null; }
    else if (role.startsWith('bubble:')) { how = 'in'; const p = role.slice(7); at = p ? p.split('.').map(Number) : null; }
    A.data.how = how === 'start' || how === 'end' ? 'after' : how;
    A.dispatch({ type: 'caret', at: how === 'end' || how === 'start' ? null : at });
    A.dispatch({ type: 'typing', on: true });
    say.value = ''; A.data.typing = '';
    say.focus({ preventScroll: true });
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
    const r = insertGesture(A.st.context, A.st.caret, A.data.how ?? 'after', fromField(text));
    A.dispatch({ type: 'context', text: r.text });
    return A.dispatch({ type: 'caret', at: A.st.caret ? r.at : null });
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
