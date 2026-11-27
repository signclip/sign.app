// rule.js — the join rule of a sharing point: may someone join now without a signer?
//
// Purpose:   :_.1((join) (gestures 1) (vouch 2))°(Hörsaal 2)'t(2026.11.10 09.00_2026.11.10 11.00) in
//            sharing-point.sign (read by sharing-point.readDescription). Everything asked must hold.
//            The window is a range of UTC times like every 't( ) (time.js, 15.11.):
//            't(2026.11.10 09.00_2026.11.10 11.00) = 10–12 Uhr in Köln (winter).
// Depends:   1-model/time.js
// Test:      tests/share.test.mjs
// Limits:    one check, no storage; the window is as fine as its written prefix (minute, day …).

import { timeLabel, timeRange, inTime } from '../1-model/time.js';

/**
 * join: may this person join now without the admin? Everything the rule asks must hold.
 * asked: { now, where (label), gestures (how many known gestures were right), vouches }.
 * Returns "auto" or "signer" (a signer of the sharing point always remains as the other way).
 */
export function joinDecision(join, { now = Date.now(), where = null, gestures = 0, vouches = 0 } = {}) {
  const taken = join?.within || join?.vouch || 0; // (within n), written (vouch n) before: n devices within take her in (swarm.js counts them)
  if (!join || (!join.gestures && !taken)) return 'signer';
  const ok = inTime(timeLabel(now), timeRange(join.time)) && (!join.where || join.where === where) &&
    gestures >= join.gestures && vouches >= taken;
  return ok ? 'auto' : 'signer';
}
