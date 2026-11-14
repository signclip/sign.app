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
//            14.11.: it starts with the name (the context field is open, Enter = name, it becomes the context
//            of the name sign), and after the name sign the door waits in the sharing menu as a hello bubble:
//            drag yourself onto it = hello. Steps without a gesture of the table ('write', 'drag') are hinted where they happen.
// Limits:    9 steps; the step number is kept on the device (localStorage), never shared.

import { TABLE } from './gestures.js';
import { targetOf } from './screen.js';

/** [action, role on the screen]: in this order; the name first, then the name sign. */
export const STEPS = [
  ['name', 'field'], // write the name: the context field is open and breathes
  ['take', 'point'], // name sign (the name is its context)
  ['share-last', 'point'], // the sharing menu: the door breathes as a hello bubble
  ['hello', 'panel'], // drag yourself onto it
  ['replay-back', 'point'], // watch it
  ['strand-while-held', 'strand:v'], // only one strand while held
  ['take-while-held', 'point'], // all switched-on strands while held
  ['similar-in', 'upper-right'], // Similar
  ['own-in', 'upper-left'], // own settings: here the onboarding can start again
];
export const NAME_SIGN_STEP = 1;
/** Steps hinted where they happen (field, sharing menu) instead of by the pale point: their gesture. */
const IN_PLACE = { field: 'write', panel: 'drag' };

/** The gesture of the table for this action on this role, or null. */
export function gestureFor(action, role) {
  if (IN_PLACE[role]) return IN_PLACE[role];
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
