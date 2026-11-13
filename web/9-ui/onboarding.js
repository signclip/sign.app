// onboarding.js — the first steps, shown only with what is already on the screen (decision 13.11.).
//
// Purpose:   no extra screen, no text, no buttons: the element of the next step breathes, and a pale
//            copy of the point does the gesture on it (tap, hold, or a short way up, left, in from the edge).
//            Each step is an action of the gesture table (gestures.js); which gesture it needs is read
//            from that table, so a changed gesture changes the onboarding too.
//            Nothing is blocked: every other gesture works as always, the hint just stays until its step
//            is done. The first take is the name sign; it goes along with every hello (share-group.js).
//            Own settings (upper left) can switch it off or start it again (settings.onboarding).
// Depends:   gestures.js, screen.js (targetOf)
// Test:      tests/ui.test.mjs
// Limits:    7 steps; the step number is kept on the device (localStorage), never shared.

import { TABLE } from './gestures.js';
import { targetOf } from './screen.js';

/** [action, role on the screen]: in this order, the first one records the name sign. */
export const STEPS = [
  ['take', 'point'], // name sign
  ['replay-back', 'point'], // watch it
  ['strand-while-held', 'strand:v'], // only one strand while held
  ['take-while-held', 'point'], // all switched-on strands while held
  ['share-last', 'point'], // the sharing points (groups are joined there)
  ['similar-in', 'upper-right'], // Similar
  ['own-in', 'upper-left'], // own settings: here the onboarding can start again
];
export const NAME_SIGN_STEP = 0;

/** The gesture of the table for this action on this role, or null. */
export function gestureFor(action, role) {
  const target = targetOf(role).target;
  return TABLE.find(([a, , t]) => a === action && t === target)?.[1] ?? null;
}

/** Step number → { action, role, gesture } to show, or null when done (or switched off). */
export function hintOf(at, on = true) {
  if (!on || at < 0 || at >= STEPS.length) return null;
  const [action, role] = STEPS[at];
  return { action, role, gesture: gestureFor(action, role) };
}

/** An action was done → the step number after it (unchanged if it was not the step's action). */
export const progress = (at, action) => (STEPS[at]?.[0] === action ? at + 1 : at);
export const done = (at) => at >= STEPS.length;
