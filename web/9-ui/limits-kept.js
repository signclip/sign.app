// limits-kept.js — what this device was given for itself, kept over a restart (27.11.).
//
// Purpose:   1-model/limits.js holds the table and who gave which value; it keeps nothing. A value given to this
//            device alone (not to the project) must still count after the app was closed: it lies here, under
//            sign.limits, as { name: value }, and app.js gives it back to the table at every start.
//              keptLimits()            → { name: value } as kept (nothing kept, or unreadable: {})
//              keepLimit(name, value)  → as adjust(): { name, value, by } | { name, refused }; value null = back to
//                                        the project's value or the preselection
// Depends:   ../1-model/limits.js, localStorage
// Test:      tests/limits.test.mjs
// Limits:    ≤ 25 names, ≈ 1 KB · a value the table refuses is never kept · no view yet: A.limits in app.js.

import { adjust, givenBy } from '../1-model/limits.js';

export const KEY = 'sign.limits';

export function keptLimits(storage = globalThis.localStorage) {
  try { const kept = JSON.parse(storage?.getItem(KEY) ?? '{}'); return kept && typeof kept === 'object' ? kept : {}; } catch { return {}; }
}

export function keepLimit(name, value, storage = globalThis.localStorage) {
  const r = adjust(name, value, 'device');
  if (!r.refused) { try { storage?.setItem(KEY, JSON.stringify(givenBy('device'))); } catch { /* counts until the app closes */ } }
  return r;
}
