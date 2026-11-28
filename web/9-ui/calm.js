// calm.js — the empty button's two times (20.11., user): spread two fingers on the button that holds no take = it widens
// like a clip. Left: pulled a little = it starts a new take by itself as soon as it is free (a coloured ring shows
// it); past the first catch = after a countdown (sound or motion: no matter – time to settle, or to move from one rest
// into the next start position). Right: past the catch = the stillness after which a running take ends. Kept until changed.
//
// Purpose:   two times on the button (28.11., user's words): "Start von selbst" (left) = a countdown, then a take
//            starts by itself; "Ende ohne Bewegung" (right) = so many seconds without motion in the picture, then the take
//            is kept – out to the left onto the line, the button ready; with the start by itself set, its countdown
//            follows: a series without hands. A tap pauses; paused, ← (↑ →) keeps and the countdown begins; a tap goes
//            on and the end without motion counts again. Against takes nobody meant: one that started by itself and saw
//            no motion is dropped and the next start waits for motion or a touch; typing or a touch begins the countdown
//            anew. After the app opens it may start at once (27.11., user: remembered). A stop on the way (27.11.): when
//            ← leaves a nesting (the next take has other prefixes, take-flow.js fix), the next start waits for a touch.
//            Both count and show only with the take window and a sense on (28.11., tick). Seen on the button (21.11., no numbers, a
//            tick per second): the countdown = the pill as wide as set, narrowing from the left onto the button (green);
//            stillness in a take = after half the time set (26.11.) the pill growing to the right up to its end (red); it opens
//            and closes moving (≈ 0.2 s), back onto the button with motion or when the take was kept. A ring inside the
//            button shows what is seen right now: bright = motion, faint = a little, gone = still (21.11., phone test).
// Depends:   browser; settings.js (calmStep, normalize), layout.js (timerPill), ready.js (watch), take-state.js (live)
// Test:      calmStep, timerPill in tests/ui.test.mjs; the sensing on a phone.
// Limits:    0–10 s each, in half seconds, stillness at least 1 s (26.11.); ≈ 15 px per second beyond a catch of 26 px; checked every 100 ms,
//            nothing new while a start or drop runs (take-flow busy, 27.11.), a start that found no camera again after 2 s; the camera
//            is watched only while a time is set; the catch is shown and felt (a short vibration).

import { calmStep, normalize } from './settings.js';
import { timerPill } from './layout.js';
import { calmShapes } from './paint.js';
import { watch } from './ready.js';
import { live } from './take-state.js';

const EVERY_MS = 100, CLOSE_MS = 220, EASE_MS = 60, STILL_SEEN_MS = 250, RETRY_MS = 2000; // the pill opens and closes in ≈ 0.2 s; stillness shows after 0.25 s
const run = (fn) => Promise.resolve().then(fn).catch(() => {});
const on = (s) => s.restartMs != null || s.stillEndMs > 0;

export function calmOf(A) {
  const video = document.querySelector('#live');
  let free = performance.now(), still = free, armed = A.settings.restartMs != null, moved = false, auto = false, starting = false, was = 'idle', wasIdle = false;
  let held = false; // a stop on the way: only a touch goes on
  let watched = null, unwatch = null, setting = null;

  /** A touch now: the countdown begins anew, a start by itself may come again, the take is not still and not dropped. */
  function poke() { free = still = performance.now(); armed = true; held = false; if (A.st.rec !== 'idle') moved = true; } // a finger on it: somebody is there, it is never dropped
  /** ← left a nesting (take-flow.js): the next start waits for a touch. */
  function hold() { if (A.settings.restartMs == null) return; held = true; armed = false; navigator.vibrate?.([10, 40, 10, 40, 10]); } // felt: three short

  /** The camera is watched while a time is set; a new camera (the other side) is watched anew. */
  function sense(yes) {
    const stream = yes ? A.take.camera : null;
    if (stream === watched) return;
    unwatch?.(); unwatch = null; watched = stream;
    if (stream) unwatch = watch(stream, (e) => {
      const seen = A.st.strands.v ? e.level : e.loud ? 1 : 0, ring = document.querySelector('#take .motion');
      if (ring) ring.style.opacity = seen >= 1 ? 1 : (seen * 0.45).toFixed(2); // the ring in the button: bright = moving, faint = a little (21.11.)
      if (!(e.moving || (e.loud && !A.st.strands.v))) return; // still: without the picture strand, quiet
      if (!held) armed = true;
      if (A.st.rec === 'recording') { still = performance.now(); moved = true; }
    }, { video });
  }

  function tick() {
    const now = performance.now(), s = A.settings, st = A.st;
    if (st.rec !== was) { if (st.rec === 'recording') { still = now; if (was === 'idle') { moved = false; auto = starting; } } starting = false; was = st.rec; }
    // 28.11. (user: "nicht wenn ich woanders aktiv in der UI unterwegs bin und die Kamera, Audio deaktiv"): both times
    // count only with the take window – the newest spot, Similar closed or one result (the live picture under it), no
    // sharing, timeline, typing, settings, stacked lines or chosen line – and with a sense on: the picture or sound
    // strand, the camera running. Elsewhere nothing shows; back, the countdown begins anew and a take's stillness too.
    const here = live(st) && (st.similar === 'closed' || st.similar === 'single') && !st.share && st.wide < 0.02 && !st.typing && !setting && !A.data.timers && !A.data.fan && st.chosenLine == null && !document.hidden;
    const sensing = (st.strands.v || st.strands.a) && Boolean(A.take.camera?.getTracks?.().some((k) => k.readyState === 'live'));
    const near = here && sensing, idle = st.rec === 'idle' && near;
    if ((idle && !wasIdle) || st.typing) free = now; // free again (kept, dropped, the newest spot, back): the countdown begins
    wasIdle = idle;
    if (st.rec === 'recording' && !near) still = now; // away: the take runs on; not still while you are elsewhere
    sense(on(s));
    if (!on(s)) return show(null);
    const recording = st.rec === 'recording';
    // nothing new while a start or a drop is on its way (27.11.: it was asked again every 100 ms until the state changed)
    const step = A.take.busy ? null : calmStep(s, { idle, freeMs: now - free, armed, recording, stillMs: now - still, moved, auto });
    if (step) show(null); // the pill closes moving (felt: keep, start and drop vibrate on their own)
    if (step === 'start') { starting = true; return run(A.take.start).then(() => { if (A.st.rec === 'idle') { starting = false; free = performance.now() + RETRY_MS; } }); } // no camera: again in 2 s, not every tick
    if (step === 'keep') return run(A.take.keep); // the end without motion (28.11., user): kept, out to the left, ready – the countdown begins when set
    if (step === 'drop') { armed = false; return run(A.take.anew); }
    // stillness shows only after half the time set (26.11., user: not at once); then the pill opens as wide as set, half run
    return show(recording && near && s.stillEndMs && now - still > Math.max(STILL_SEEN_MS, s.stillEndMs / 2) ? { kind: 'stop', t0: still, ms: s.stillEndMs }
      : idle && armed && s.restartMs > 0 ? { kind: 'start', t0: free, ms: s.restartMs } : null);
  }

  /**
   * The pill on the button moves (21.11., user): it opens – to the left as the countdown, to the right with its end
   * when the take went still – and closes onto the button when it starts, moves again or was kept, each in ≈ 0.2 s;
   * in between it follows the time exactly, every frame. Only the moving paths change (paint.js calmShapes); the whole
   * take is painted again only when the pill comes or goes.
   */
  let target = null, frame = 0, last = 0;
  function show(c) {
    target = c;
    if (!frame && (target || A.data.calm)) frame = requestAnimationFrame(move);
  }
  const width = (t, now) => { const f = Math.min(1, Math.max(0, (now - t.t0) / t.ms)); return t.kind === 'start' ? 1 - f : f; };
  function move(now) {
    frame = 0;
    const dt = Math.min(50, last ? now - last : 16), ease = 1 - Math.exp(-dt / EASE_MS); last = now;
    const t = target && (!A.data.calm || A.data.calm.kind === target.kind) ? target : null; // another kind: the old one closes first
    let c = A.data.calm, born = false;
    if (!c && t) { c = A.data.calm = { kind: t.kind, ms: t.ms, w: 0, g: 0 }; born = true; }
    if (!c) { last = 0; return; }
    if (t) c.ms = t.ms;
    const tw = t ? width(t, now) : 0, tg = t ? 1 : 0;
    c.w = Math.abs(tw - c.w) < 0.03 ? tw : c.w + (tw - c.w) * ease; // a jump (opening, closing, moved again) eases; the time itself is followed
    c.g = Math.abs(tg - c.g) < 0.01 ? tg : c.g + (tg - c.g) * ease;
    if (!t && c.w < 0.01 && c.g < 0.01) { A.data.calm = null; last = 0; A.paint(); if (target) frame = requestAnimationFrame(move); return; } // round again
    if (born) A.paint();
    else {
      const p = calmShapes(c, A.L);
      for (const [cls, d] of [['calm-move', p.move], ['calm-goal-move', p.goal], ['calm-end-move', p.end]]) if (d) for (const el of document.getElementsByClassName(cls)) el.setAttribute('d', d);
    }
    frame = requestAnimationFrame(move);
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
  return { poke, hold, pinch, get setting() { return Boolean(setting); } };
}
