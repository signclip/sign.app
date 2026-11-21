// onboarding-steps.js — the first start teaches the app by using it (16.11.): no text, the next thing pulses.
//
// Purpose:   the way is 8-join/flow.js personStep (name → name sign → 3 password gestures → hello); this file says,
//            for the screen, which element pulses and which gesture a pale point shows on it:
//              drop-name   the chip "Name" lies under the arc: a pale point pulls it down (it flies out)
//              type-name   the row under the arc pulses: tap, type the name, it becomes a chip
//              name-sign   the button pulses: take the name sign. Meanwhile the password gestures show under the arc as
//                          what comes next (mint: preset, can't be changed; the last one empty: one's own)
//              next        a pale point swipes ← on the button: the take is kept, the next one comes up
//              gesture     the preset password gesture is now; Similar shows the matching sign in the double view, to
//                          learn it if it is new · button pulses, then ←
//              own         the row pulses: type one's own word, then take it, then ←
//              share       a pale point swipes ↑ on the button: the sharing menu opens, the hello bubble pulses
//              hello       tap the hello bubble (it carries name sign and password gestures to the door)
// Depends:   8-join/flow.js (PASSWORD_PARTS)
// Test:      tests/ui.test.mjs
// Limits:    3 password gestures (flow.js); two of them are preset words drawn for this hello (offers).

import { PASSWORD_PARTS } from '../8-join/flow.js';

export const STEPS = ['drop-name', 'type-name', 'name-sign', 'next', 'gesture', 'own', 'share', 'hello', 'done'];

/**
 * What pulses now. s: { dropped (the preset name chip pulled away), name (typed), nameSign (taken), gestures (password
 * takes kept, 0–3), takeNow (a take waits to be kept with ←), ownTyped, shareOpen, join (sharing-view joinLook) }
 * → { step, role, gesture: 'tap' | 'drag-down' | 'swipe-left' | 'swipe-up' | null, similar: boolean }
 */
export function hintOf(s = {}) {
  const g = s.gestures ?? 0;
  if (s.join === 'sent' || s.join === 'accepted' || s.join === 'loading' || s.join === 'joined') return { step: 'done', role: null, gesture: null };
  if (g >= PASSWORD_PARTS.length) return s.shareOpen ? { step: 'hello', role: 'hello', gesture: 'tap' } : { step: 'share', role: 'button', gesture: 'swipe-up' };
  if (s.takeNow) return { step: 'next', role: 'button', gesture: 'swipe-left' };
  if (!s.nameSign) {
    if (!s.dropped && !s.name) return { step: 'drop-name', role: 'chip:offer', gesture: 'drag-down' };
    if (!s.name) return { step: 'type-name', role: 'context', gesture: 'tap' };
    return { step: 'name-sign', role: 'button', gesture: 'tap' };
  }
  if (g === PASSWORD_PARTS.length - 1 && !s.ownTyped) return { step: 'own', role: 'context', gesture: 'tap' };
  return { step: g === PASSWORD_PARTS.length - 1 ? 'own' : 'gesture', role: 'button', gesture: 'tap', similar: g < PASSWORD_PARTS.length - 1 };
}

/**
 * The context row while onboarding: the preset name chip first; after the name the password gestures as the coming
 * takes: words = the two drawn words, then an empty one for one's own. → series text for chips.js
 */
export function onboardingSeries({ name = '', dropped = false, nameSign = false, gestures = 0, words = [], own = '' }) {
  const parts = [];
  if (!nameSign) parts.push(name ? `(${name})` : dropped ? '' : '(Name)');
  const preset = words.slice(0, PASSWORD_PARTS.length - 1);
  for (let i = nameSign ? gestures : 0; i < preset.length; i++) if (name || nameSign) parts.push(`(${preset[i]})`);
  if ((name || nameSign) && gestures < PASSWORD_PARTS.length && own) parts.push(`(${own})`);
  return parts.filter(Boolean).join(' ');
}

/** The green spot typed into while onboarding: the name (while there is no name sign) or one's own password word. */
export function typingSlot(o) {
  if (!o?.on) return null;
  if (!o.nameSign) return 'name';
  return o.gestures === PASSWORD_PARTS.length - 1 && !o.ownTyped ? 'own' : null;
}

/**
 * What the row and the window show while onboarding (21.11., user): what is typed goes straight into its green chip –
 * in the row and in the window – and one's own words stay green. typing: the text being typed now.
 * → { slot, series (the series with it, or null while nothing is typed), green: [words shown green] }
 */
export function onboardingView(o, typing = '') {
  const slot = typingSlot(o), live = slot ? typing.trim() : '';
  const series = live ? onboardingSeries({ ...o, ...(slot === 'name' ? { name: live } : { own: live }) }) : null;
  const name = o.nameSign ? null : o.name;
  return { slot, series, green: ['Name', ...(o.words ?? []), o.own, name, live].filter(Boolean) };
}

/** Which chips are offers (preset, not to be changed) in the onboarding row: the drawn password words and "Name". */
export const isPreset = (text, words = []) => text === 'Name' || words.includes(text);
