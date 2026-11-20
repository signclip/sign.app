// hint.js — the onboarding's pale point (onboarding-steps.js): where the next thing is and which gesture it wants.
//
// Purpose:   no text: a soft ring pulses on the element, a pale point shows the gesture (tap = it presses, swipe = it
//            travels, drag down = it pulls). The animation lives in CSS (look.css .hint.*), so a repaint keeps its phase.
// Depends:   nothing
// Test:      the steps are tested in tests/ui.test.mjs; this needs a browser.
// Limits:    one hint at a time; travel distance 70 px × k.

/** → SVG text (empty when there is no hint). h: hintOf() · L: take layout · sharing: sharing-view layout or null */
export function hintSvg(h, { L, sharing = null }) {
  if (!h?.role || !L) return '';
  let x, y;
  if (h.role === 'button') ({ x, y } = L.button);
  else if (h.role === 'hello' && sharing?.hello) ({ x, y } = sharing.hello);
  else if (h.role === 'chip:offer') { x = L.cx; y = L.cy + L.ry + L.nowOff; }
  else if (h.role === 'context') { x = L.cx; y = L.queueY; }
  else return '';
  const d = 70 * L.k;
  const move = { 'swipe-left': [-d, 0], 'swipe-up': [0, -d], 'drag-down': [0, d * 0.8] }[h.gesture] ?? [0, 0];
  const r = (h.role === 'button' ? L.button.r : 22 * L.k) + 10 * L.k;
  return `<circle class="hint-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`
    + `<circle class="hint ${h.gesture ?? 'tap'}" style="--dx:${move[0].toFixed(0)}px;--dy:${move[1].toFixed(0)}px" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(11 * L.k).toFixed(1)}"/>`;
}
