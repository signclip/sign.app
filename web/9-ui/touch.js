// touch.js — turn pointer events into the gestures of the table: tap, double-tap, hold (start/end),
// swipes, pinch, and edge zones. Pure parts (classify, edgeZone) are tested; bind() needs a browser.
//
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    hold after 350 ms · double-tap within 300 ms · swipe ≥ 50 px · edges start 12–72 px inside
//            the screen edge (Android uses the outermost strip for "back") and only in the upper 2/3.

export const HOLD_MS = 350, DOUBLE_MS = 300, SWIPE_PX = 50, EDGE_IN = [12, 72];

/** A swipe down longer than this = all the way down (delete instead of set aside). */
export const FAR_PX = 220;

/**
 * A finished one-finger touch → 'tap' | 'up' | 'down' | 'down-far' | 'left' | 'right' | null
 * (held touches end elsewhere).
 */
export function classify({ dx, dy, ms }) {
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return ms < HOLD_MS ? 'tap' : null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  if (dy < 0) return 'up';
  return dy > FAR_PX ? 'down-far' : 'down';
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
 * bind(el, handlers) → detach(). handlers: down(event) (first touch, before anything is known), tap(x, y),
 * doubleTap(), hold(), holdEnd(), swipe(dir), pinch(factor), dragEnd(targetElement). x, y are 0–1 inside el.
 */
export function bind(el, h) {
  const fingers = new Map(); // pointerId → { x, y }
  let touch = null; // the one-finger touch in progress: { x, y, at }
  let timer = null;
  let held = false;
  let lastTap = 0;
  let spread = null; // distance between two fingers while pinching

  const distance = () => {
    const [p, q] = [...fingers.values()];
    return Math.hypot(p.x - q.x, p.y - q.y);
  };

  const down = (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) { // a second finger: pinch, not a touch
      clearTimeout(timer);
      spread = distance();
      touch = null;
      return;
    }
    h.down?.(e);
    touch = { x: e.clientX, y: e.clientY, at: performance.now() };
    held = false;
    timer = setTimeout(() => {
      held = true;
      h.hold?.();
    }, HOLD_MS);
  };

  const move = (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (spread && fingers.size === 2) {
      const d = distance();
      h.pinch?.(d / spread);
      spread = d;
      return;
    }
    const moved = touch && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10;
    if (moved && !held) clearTimeout(timer); // a swipe, not a hold
  };

  const up = (e) => {
    fingers.delete(e.pointerId);
    clearTimeout(timer);
    if (!touch) {
      if (!fingers.size) spread = null;
      return;
    }
    if (held) {
      h.holdEnd?.();
      h.dragEnd?.(document.elementFromPoint(e.clientX, e.clientY));
      touch = null;
      return;
    }
    const gesture = classify({ dx: e.clientX - touch.x, dy: e.clientY - touch.y, ms: performance.now() - touch.at });
    if (gesture === 'tap') tapped(e);
    else if (gesture) h.swipe?.(gesture);
    touch = null;
  };

  // a tap waits DOUBLE_MS when a double-tap is possible
  const tapped = (e) => {
    const now = performance.now();
    if (h.doubleTap && now - lastTap < DOUBLE_MS) {
      lastTap = 0;
      h.doubleTap();
      return;
    }
    lastTap = now;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTimeout(() => { if (lastTap === now || !h.doubleTap) h.tap?.(x, y); }, h.doubleTap ? DOUBLE_MS : 0);
  };

  const events = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]];
  for (const [name, fn] of events) el.addEventListener(name, fn);
  return () => { for (const [name, fn] of events) el.removeEventListener(name, fn); };
}
