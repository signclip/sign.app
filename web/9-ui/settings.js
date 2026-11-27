// settings.js — what a person can switch, without extra buttons (held strand field or sharing point).
//
// Purpose:   ready (always ready) on/off · which strands record by themselves · wait times for quick
//            automatic takes · which strands feed the combined Similar · camera front/back ·
//            onboarding shown or not · the button's two times (start anew by itself, end when still). No settings area (14.11.): each is set by a gesture where it acts, kept on the device.
//            Settings live on the device only; they are no data and never shared.
// Depends:   1-model/symbols (KINDS)
// Test:      tests/ui.test.mjs
// Limits:    waits 300–10,000 ms; pre-roll 0–3,000 ms (kept in memory while ready); the button's times: 0–10 s each,
//            in half seconds (0 = off).

import { KINDS } from '../1-model/symbols.js';
import { clampAspect } from './form.js';

/** The window's form (form.js, 20.11.): round 0…1, aspect 0.4…2.5. */
const formOf = (x) => (x && typeof x === 'object' ? { round: Math.max(0, Math.min(1, Number(x.round ?? 1))), aspect: clampAspect(Number(x.aspect ?? 1)) } : { round: 1, aspect: 1 });

const STRANDS = ['v', 'a', 'x', 'l'].filter((k) => k in KINDS);

export const DEFAULTS = Object.freeze({
  ready: false, // always ready: starts on motion or sound
  auto: ['v', 'a', 'x'], // strands that record by themselves (x = Whisper text)
  startOn: ['motion', 'sound'],
  waitStartMs: 300, // how long motion or sound must last before a take starts
  waitStopMs: 1500, // how long it must be quiet before the take stops
  preRollMs: 1000, // kept from before the start, so the beginning of a sign is not lost
  similarFrom: ['x', 'a'], // strands that feed the combined Similar (a via its text)
  facing: 'user', // camera: 'user' (front) or 'environment' (back)
  onboarding: true,
  shape: { round: 0, aspect: 1 }, // the window by hand: standard the 1:1 rectangle (20.11., user); round 0 rectangle … 1 circle/ellipse · aspect width/height (form.js)
  flows: [], // connections drawn between sides: 'a>x' audio → context (Whisper), 'v>x' visual → context (later)
  restartMs: null, // the button starts a take by itself so long after it is free again (sound, motion: no matter); null = off, 0 = at once (20.11.)
  stillEndMs: 0, // no motion so long while a take runs → it ends; 0 = off (20.11.)
});
export const FLOW_KINDS = ['a>x', 'v>x'];

const clamp = (n, lo, hi, d) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);
/** The button's times (calm.js): 0…10 s in steps of half a second. */
export const timeOf = (n, d = 0) => (Number.isFinite(n) ? Math.min(10000, Math.max(0, Math.round(n / 500) * 500)) : d);
const subset = (list, allowed, d) => (Array.isArray(list) ? [...new Set(list.filter((k) => allowed.includes(k)))] : d);

/** Any input → valid settings (unknown keys dropped, numbers clamped, lists filtered). */
export function normalize(input = {}) {
  const d = DEFAULTS;
  return {
    ready: typeof input.ready === 'boolean' ? input.ready : d.ready,
    auto: subset(input.auto, STRANDS, d.auto),
    startOn: subset(input.startOn, ['motion', 'sound'], d.startOn),
    waitStartMs: clamp(input.waitStartMs, 300, 10000, d.waitStartMs),
    waitStopMs: clamp(input.waitStopMs, 300, 10000, d.waitStopMs),
    preRollMs: clamp(input.preRollMs, 0, 3000, d.preRollMs),
    similarFrom: subset(input.similarFrom, STRANDS, d.similarFrom),
    facing: ['user', 'environment'].includes(input.facing) ? input.facing : d.facing,
    onboarding: typeof input.onboarding === 'boolean' ? input.onboarding : d.onboarding,
    flows: subset(input.flows, FLOW_KINDS, d.flows),
    shape: formOf(input.shape ?? d.shape),
    restartMs: Number.isFinite(input.restartMs) ? timeOf(input.restartMs) : null,
    stillEndMs: ((t) => (t > 0 ? Math.max(1000, t) : 0))(timeOf(input.stillEndMs, d.stillEndMs)), // 0 = off, else at least 1 s (26.11.)
  };
}

/** The steps of each choice (pinch on the point walks the waits): each a choice of a few values, no number fields (decision 07.11.: chips). */
export const CHOICES = {
  waitStartMs: [300, 500, 1000, 2000],
  waitStopMs: [1000, 1500, 3000, 5000],
  preRollMs: [0, 1000, 2000],
  facing: ['user', 'environment'],
  shape: ['circle', 'ellipse', 'rounded'],
};

/**
 * The button's two times (calm.js): → 'start' | 'keep' | 'pause' | 'drop' | null.
 * now: { idle (the button is free on the newest spot), freeMs (free for so long; typing and touches begin it anew),
 * armed (motion or a touch since the last drop), recording, stillMs (no motion for so long in the
 * running take), moved (motion in it at all), auto (it started by itself) }. A take that went still is kept when the
 * button starts anew by itself (a series without hands), else it waits for ←; one that started by itself and saw no
 * motion at all is dropped (nobody was there), and the next start then waits for motion or a touch.
 */
export function calmStep(settings, now) {
  if (now.recording && settings.stillEndMs > 0 && now.stillMs >= settings.stillEndMs) return now.auto && !now.moved ? 'drop' : settings.restartMs != null ? 'keep' : 'pause';
  if (now.idle && now.armed && settings.restartMs != null && now.freeMs >= settings.restartMs) return 'start';
  return null;
}

/** One tap on a chip: set that value (or toggle a strand in auto / similarFrom). */
export function choose(settings, key, value) {
  if (key === 'auto' || key === 'similarFrom' || key === 'flows') {
    const has = settings[key].includes(value);
    return normalize({ ...settings, [key]: has ? settings[key].filter((k) => k !== value) : [...settings[key], value] });
  }
  return normalize({ ...settings, [key]: value });
}

/**
 * Always ready: decide from the last events whether a take starts or stops.
 * events: [{ at (ms), active (motion or sound now) }] newest last · recording: now? → 'start' | 'stop' | null
 */
export function readyStep(settings, events, recording, now) {
  if (!settings.ready || !events.length) return null;
  const since = (pred) => { let t = now; for (let i = events.length - 1; i >= 0 && pred(events[i]); i--) t = events[i].at; return now - t; };
  if (!recording && since((e) => e.active) >= settings.waitStartMs) return 'start';
  if (recording && since((e) => !e.active) >= settings.waitStopMs) return 'stop';
  return null;
}
