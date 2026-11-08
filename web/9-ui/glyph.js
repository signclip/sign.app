// glyph.js — point, bubble, line: one set of shapes for the record point, the share icon and the
// growing hello/join icon (decision 08.11.). Data in, shapes out; drawing is elsewhere (render.js).
//
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    more than 3 connections are bundled into one pale line (no numbers on screen).

const MAX_LINES = 3;

/**
 * own: is it the own point? · recording · ready (always ready) · shares: ids of connected sharing
 * points · state: 'none' | 'hello' | 'join' | 'within' | 'quiet' (8-join/state.stateOf).
 * → [{ shape: 'point'|'bubble'|'line', role, state }]
 */
export function glyph({ own = true, recording = false, ready = false, shares = [], state = 'within' } = {}) {
  const out = [{ shape: 'point', role: own ? 'own' : 'other', state: state === 'none' ? 'empty' : recording ? 'recording' : ready ? 'ready' : 'rest' }];
  if (state === 'hello') out.push({ shape: 'bubble', role: 'hello', state: 'waiting' });
  if (state === 'join') out.push({ shape: 'line', role: 'join', state: 'solid' }, { shape: 'bubble', role: 'signer', state: 'answered' });
  if (state === 'quiet') out.push({ shape: 'line', role: 'join', state: 'pale' });
  if (state === 'within') {
    for (const id of shares.slice(0, MAX_LINES)) out.push({ shape: 'line', role: 'share', to: id, state: 'solid' });
    if (shares.length > MAX_LINES) out.push({ shape: 'line', role: 'share', to: null, state: 'bundle' });
  }
  return out;
}
