// settings.js — what a person can switch, without extra buttons (held strand field or sharing point).
//
// Purpose:   ready (always ready) on/off · which strands record by themselves · wait times for quick
//            automatic takes · which strands feed the combined Similar · camera front/back ·
//            onboarding shown or not. Shown as chips from the upper left edge (own sharing point).
//            Settings live on the device only; they are no data and never shared.
// Depends:   1-model/symbols (KINDS)
// Test:      tests/ui.test.mjs
// Limits:    waits 300–10,000 ms; pre-roll 0–3,000 ms (kept in memory while ready).

import { KINDS } from '../1-model/symbols.js';

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
  flows: [], // connections drawn between sides: 'a>x' audio → context (Whisper), 'v>x' visual → context (later)
});
export const FLOW_KINDS = ['a>x', 'v>x'];

const clamp = (n, lo, hi, d) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);
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
  };
}

/** Chips for the own settings: each a choice of a few values, no number fields (decision 07.11.: chips). */
export const CHOICES = {
  waitStartMs: [300, 500, 1000, 2000],
  waitStopMs: [1000, 1500, 3000, 5000],
  preRollMs: [0, 1000, 2000],
  facing: ['user', 'environment'],
};

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
