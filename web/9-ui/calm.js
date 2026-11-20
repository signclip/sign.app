// calm.js — the empty button's two times (20.11., user): spread two fingers on the button that holds no take = it widens
// like a clip. Left: pulled a little = it starts a new take by itself as soon as it is free (a coloured ring shows
// it); past the first catch = after a countdown (sound or motion: no matter – time to settle, or to move from one rest
// into the next start position). Right: past the catch = the stillness after which a running take ends. Kept until changed.
//
// Purpose:   a series without hands: start → sign → still → kept → countdown → the next. Without the left time a take
//            that went still waits on the button (← keeps, ↓ far drops, a tap goes on). Against takes nobody meant: one
//            that started by itself and saw no motion is dropped and the next start waits for motion or a touch; after
//            a photo by itself and after the app opens the same; typing or a touch begins the countdown anew. A thin arc round the button shows
//            the countdown (green), then the stillness in the take (red).
// Depends:   browser; settings.js (calmStep, normalize), layout.js (timerPill), ready.js (watch), take-state.js (live)
// Test:      calmStep, timerPill in tests/ui.test.mjs; the sensing on a phone.
// Limits:    0–10 s each, in half seconds; ≈ 15 px per second beyond a catch of 26 px; checked every 100 ms; the camera
//            is watched only while a time is set; the catch is shown and felt (a short vibration).

import { calmStep, normalize } from './settings.js';
import { timerPill } from './layout.js';
import { watch } from './ready.js';
import { live } from './take-state.js';

const EVERY_MS = 100, CLOSE_MS = 220;
const run = (fn) => Promise.resolve().then(fn).catch(() => {});
const on = (s) => s.restartMs != null || s.stillEndMs > 0;

export function calmOf(A) {
  const video = document.querySelector('#live');
  let free = performance.now(), still = free, armed = false, moved = false, auto = false, starting = false, was = 'idle', wasIdle = false;
  let watched = null, unwatch = null, setting = null;

  /** A touch now: the countdown begins anew, a start by itself may come again, the take is not still. */
  function poke() { free = still = performance.now(); armed = true; }

  /** The camera is watched while a time is set; a new camera (the other side) is watched anew. */
  function sense(yes) {
    const stream = yes ? A.take.camera : null;
    if (stream === watched) return;
    unwatch?.(); unwatch = null; watched = stream;
    if (stream) unwatch = watch(stream, (e) => {
      if (!(e.moving || (e.loud && !A.st.strands.v))) return; // still: without the picture strand, quiet
      armed = true;
      if (A.st.rec === 'recording') { still = performance.now(); moved = true; }
    }, { video });
  }

  function tick() {
    const now = performance.now(), s = A.settings, st = A.st;
    if (st.rec !== was) { if (st.rec === 'recording') { still = now; if (was === 'idle') { moved = false; auto = starting; } } starting = false; was = st.rec; }
    const idle = st.rec === 'idle' && live(st) && !st.share && st.similar !== 'full' && st.wide < 0.02 && !setting && !A.data.timers;
    if ((idle && !wasIdle) || st.typing) free = now; // free again (kept, dropped, the newest spot): the countdown begins
    wasIdle = idle;
    sense(on(s));
    if (!on(s)) return show(null);
    const recording = st.rec === 'recording';
    const step = calmStep(s, { idle, freeMs: now - free, armed, recording, stillMs: now - still, moved, auto });
    if (step) { show(null); navigator.vibrate?.(step === 'pause' ? [20, 60, 20] : 10); }
    if (step === 'start') { if (st.mode === 'photo') { armed = false; return run(A.take.photo); } starting = true; return run(A.take.start); }
    if (step === 'keep') return run(A.take.keep); // the series goes on: the button is free, the countdown begins
    if (step === 'pause') return run(A.take.pause); // waits for ← (keep) or ↓ far (drop)
    if (step === 'drop') { armed = false; return run(A.take.anew); }
    return show(recording && s.stillEndMs ? { kind: 'stop', f: (now - still) / s.stillEndMs }
      : idle && armed && s.restartMs > 0 ? { kind: 'start', f: (now - free) / s.restartMs } : null);
  }
  /** The arc round the button (paint.js): painted again only when it visibly changed. */
  function show(c) {
    const before = A.data.calm;
    if (!c && !before) return;
    A.data.calm = c && c.f > 0.02 ? c : null;
    if (!before || !A.data.calm || before.kind !== A.data.calm.kind || Math.abs(before.f - A.data.calm.f) >= 0.02) A.paint();
  }

  /**
   * Two fingers on the empty button (from gestures-take.js): it widens from the times it has; the left finger out =
   * at once, past the catch a countdown; the right finger past its catch = the stillness; back in = less, down to off.
   * → true while it has the pinch
   */
  function pinch(ev) {
    const s = A.settings;
    if (!setting) {
      if (ev.phase !== 'move' || !ev.now || !ev.at) return false;
      const p = timerPill(A.L, s);
      setting = { lp: p.left, rp: p.right, left: ev.at[0].x <= ev.at[1].x ? 0 : 1 };
    }
    const l = setting.left, r = 1 - l, p = timerPill(A.L, s);
    const times = p.times(setting.lp + ev.at[l].x - ev.now[l].x, setting.rp + ev.now[r].x - ev.at[r].x);
    const t = A.data.timers, sec = (ms) => (ms == null ? -2 : Math.floor(ms / 1000));
    if (t && ((t.restartMs == null) !== (times.restartMs == null) || (t.restartMs === 0) !== (times.restartMs === 0) || !t.stillEndMs !== !times.stillEndMs)) navigator.vibrate?.(18); // a catch
    else if (t && (sec(t.restartMs) !== sec(times.restartMs) || sec(t.stillEndMs) !== sec(times.stillEndMs))) navigator.vibrate?.(5); // a second
    A.data.timers = { ...times, f: 1 };
    if (ev.phase === 'end') {
      Object.assign(A.settings, normalize({ ...s, ...times }));
      A.keepSettings();
      setting = null; poke(); close();
    }
    A.paint();
    return true;
  }
  /** Back onto the button: the pill shrinks in ≈ 220 ms. */
  function close() {
    const t0 = performance.now(), t = A.data.timers;
    const step = () => { if (A.data.timers !== t) return; t.f = 1 - (performance.now() - t0) / CLOSE_MS; if (t.f <= 0) A.data.timers = null; else requestAnimationFrame(step); A.paint(); };
    requestAnimationFrame(step);
  }

  setInterval(tick, EVERY_MS);
  return { poke, pinch, get setting() { return Boolean(setting); } };
}
