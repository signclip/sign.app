// touch.js — turn pointer events into the gestures of the table: tap, double-tap, hold (start/end),
// swipes, pinch, and edge zones. Pure parts (classify, edgeZone) are tested; bind() needs a browser.
//
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    hold after 350 ms · double-tap within 300 ms · swipe ≥ 50 px · edges start 12–72 px inside
//            the screen edge (Android uses the outermost strip for "back") and only in the upper 2/3.

export const HOLD_MS = 350, DOUBLE_MS = 300, SWIPE_PX = 50, EDGE_IN = [12, 72];

/** A finished one-finger touch → 'tap' | 'up' | 'down' | 'left' | 'right' | null (held touches end elsewhere). */
/** far: a swipe down longer than FAR_PX (all the way ↓ = delete instead of set aside). */
export const FAR_PX = 220;
export function classify({ dx, dy, ms }) {
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return ms < HOLD_MS ? 'tap' : null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : dy > FAR_PX ? 'down-far' : 'down');
}

/** Where a touch starts → edge zone or null. w, h = screen size. */
export function edgeZone(x, y, w, h) {
  const [a, b] = EDGE_IN;
  if (y > (h * 2) / 3) return null;
  const third = y < h / 3 ? 'upper' : 'middle';
  if (x >= a && x <= b) return `${third}-left`;
  if (w - x >= a && w - x <= b) return `${third}-right`;
  if (y >= a && y <= b && Math.abs(x - w / 2) < w / 6) return 'top-middle';
  return null;
}

/**
 * bind(el, handlers) → detach(). handlers: tap(x, y), doubleTap(), hold(), holdEnd(), swipe(dir),
 * pinch(factor), dragEnd(targetElement). x, y are 0–1 inside el.
 */
export function bind(el, h) {
  const pts = new Map();
  let s = null, timer = null, held = false, lastTap = 0, spread = null;
  const dist = () => { const [p, q] = [...pts.values()]; return Math.hypot(p.x - q.x, p.y - q.y); };
  const down = (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { clearTimeout(timer); spread = dist(); s = null; return; }
    s = { x: e.clientX, y: e.clientY, at: performance.now() }; held = false;
    timer = setTimeout(() => { held = true; h.hold?.(); }, HOLD_MS);
  };
  const move = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (spread && pts.size === 2) { const d = dist(); h.pinch?.(d / spread); spread = d; return; }
    if (s && !held && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clearTimeout(timer);
  };
  const up = (e) => {
    pts.delete(e.pointerId); clearTimeout(timer);
    if (!s) { if (!pts.size) spread = null; return; }
    if (held) { h.holdEnd?.(); h.dragEnd?.(document.elementFromPoint(e.clientX, e.clientY)); s = null; return; }
    const g = classify({ dx: e.clientX - s.x, dy: e.clientY - s.y, ms: performance.now() - s.at });
    const r = el.getBoundingClientRect();
    if (g === 'tap') {
      const now = performance.now();
      if (h.doubleTap && now - lastTap < DOUBLE_MS) { lastTap = 0; h.doubleTap(); }
      else { lastTap = now; const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; setTimeout(() => { if (lastTap === now || !h.doubleTap) h.tap?.(x, y); }, h.doubleTap ? DOUBLE_MS : 0); }
    } else if (g) h.swipe?.(g);
    s = null;
  };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return () => { for (const [n, f] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]]) el.removeEventListener(n, f); };
}
