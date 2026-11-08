// rule.js — the join rule of a sharing point: may someone join now without a signer?
//
// Purpose:   :_.1((join) (gestures 1) (vouch 2))°(Hörsaal 2)'t(2026.11.10 10.00_12.00) in
//            sharing-point.sign (read by sharing-point.readDescription). Everything asked must hold.
// Depends:   nothing
// Test:      tests/share.test.mjs
// Limits:    one check, no storage; time window in local time, to the minute.

/** "2026.11.10 10.00_12.00" → [start ms, end ms] in local time. */
function window(time) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2})\.(\d{2})_(\d{2})\.(\d{2})$/.exec(time ?? '');
  if (!m) return null;
  const [y, mo, d, h1, m1, h2, m2] = m.slice(1).map(Number);
  return [new Date(y, mo - 1, d, h1, m1).getTime(), new Date(y, mo - 1, d, h2, m2).getTime()];
}

/**
 * join: may this person join now without the admin? Everything the rule asks must hold.
 * asked: { now, where (label), gestures (how many known gestures were right), vouches }.
 * Returns "auto" or "signer" (a signer of the sharing point always remains as the other way).
 */
export function joinDecision(join, { now = Date.now(), where = null, gestures = 0, vouches = 0 } = {}) {
  if (!join || (!join.gestures && !join.vouch)) return 'signer';
  const w = window(join.time);
  const ok = (!w || (now >= w[0] && now <= w[1])) && (!join.where || join.where === where) &&
    gestures >= join.gestures && vouches >= join.vouch;
  return ok ? 'auto' : 'signer';
}
