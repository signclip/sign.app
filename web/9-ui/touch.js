// touch.js — turn pointer events into the gestures of the table: tap, double-tap, hold (start/end),
// swipes, pinch, and edge zones. Pure parts (classify, edgeZone) are tested; bind() needs a browser.
//
// Depends:   nothing · Test: tests/ui.test.mjs
// Limits:    hold after 350 ms · double-tap within 300 ms · swipe ≥ 50 px · edges start 12–72 px inside
//            the screen edge (Android uses the outermost strip for "back") and only in the upper 2/3 ·
//            at most two fingers: held + action (parallel) or two moving (pinch).

export const LONG_MS = 1100, HOLD_MS = 350, DOUBLE_MS = 300, SWIPE_PX = 50, EDGE_IN = [12, 72];
export const FAR_PX = 220; // a swipe down longer than this = all the way down (delete instead of set aside)

/** A finished one-finger touch → 'tap' | 'up' | 'down' | 'down-far' | 'left' | 'right' | null (held touches end elsewhere). */
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
 * bind(el, handlers) → detach(). Each finger is its own touch; the role a finger touched is what down(event)
 * returns (or null) and is handed back as the last argument, so two fingers never mix up their targets.
 *   down(event) → role       a finger goes down, before anything is known
 *   tap(x, y, role)          x, y are 0–1 inside el · doubleTap(role)
 *   hold(role)               the finger stayed HOLD_MS · holdLong(role) at LONG_MS · holdMove(role, x, y, long) while carried
 *                            · holdEnd(role) · dragEnd(element, moved, role, { long })
 *   swipe(dir, role)         · pinch(factor, role, how): two fingers, neither held yet; role of the first;
 *                              how { fx, fy (distance across / up-down changed), angle (0 = side by side, 90 = above), mid (start, between) }
 *   pinchEnd() both fingers up · slide(role, dx, dy) · slideEnd(role): one finger on a role starting with 'corner', moved (the window's form)
 *   parallel(heldRole, role) a second finger went down while the first one is held: from now on the first
 *                            finger is a property (DESIGN principle 4), the second does the action
 * Without a held finger, a second finger is a pinch (as before). A third finger is ignored.
 */
export function bind(el, h) {
  const touches = new Map(); // pointerId → { x, y, at, role, held, timer, pinch }
  let lastTap = 0;
  let spread = null; // distance between two fingers while pinching
  let across = [0, 0], mid = null; // the two fingers' distance across and up-down · where they started, between them

  const pinchers = () => [...touches.values()].filter((t) => t.pinch);
  const distance = () => {
    const [p, q] = pinchers();
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  const down = (e) => {
    const others = [...touches.values()];
    if (others.length >= 2) return; // a third finger: ignored
    const heldOne = others.find((t) => t.held && !t.pinch);
    if (others.length === 1 && !heldOne) { // a second finger, the first not held: pinch, not a touch
      clearTimeout(others[0].timer);
      others[0].pinch = true;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, pinch: true });
      spread = distance();
      const [p, q] = pinchers();
      across = [Math.abs(p.x - q.x), Math.abs(p.y - q.y)];
      mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      return;
    }
    const role = h.down?.(e) ?? null;
    const t = { x: e.clientX, y: e.clientY, at: performance.now(), role, held: false, pinch: false };
    touches.set(e.pointerId, t);
    if (heldOne) h.parallel?.(heldOne.role, role);
    t.timer = setTimeout(() => {
      t.held = true;
      h.hold?.(role);
      t.timer = setTimeout(() => { t.long = true; h.holdLong?.(role); }, LONG_MS - HOLD_MS); // held on (15.11.): carried now = everything so far too
    }, HOLD_MS);
  };
  const move = (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    if (t.pinch) {
      Object.assign(t, { x: e.clientX, y: e.clientY });
      if (spread && pinchers().length === 2) {
        const d = distance();
        const [p, q] = pinchers();
        const now = [Math.abs(p.x - q.x), Math.abs(p.y - q.y)];
        const ratio = (i) => (across[i] > 8 && now[i] > 8 ? now[i] / across[i] : 1); // a component near zero says nothing
        const angle = (Math.atan2(now[1], now[0]) * 180) / Math.PI;
        h.pinch?.(d / spread, pinchers()[0]?.role, { fx: ratio(0), fy: ratio(1), angle, mid }); // where the first finger went down: the point or the picture
        across = now;
        spread = d;
      }
      return;
    }
    const rowSlide = /^(app:|out:system|row-area)/.test(String(t.role)) && (t.slid || Math.abs(e.clientX - t.x) > 10); // the share row slides
    if (String(t.role).startsWith('corner') || rowSlide) { // the window's corner follows the finger
      clearTimeout(t.timer);
      h.slide?.(t.role, e.clientX - (t.lx ?? t.x), e.clientY - (t.ly ?? t.y));
      Object.assign(t, { lx: e.clientX, ly: e.clientY, slid: true });
      return;
    }
    Object.assign(t, { cx: e.clientX, cy: e.clientY }); // where it last was: a cancelled touch ends here, not at 0,0
    const moved = Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10;
    if (moved && !t.held) clearTimeout(t.timer); // a swipe, not a hold
    if (moved && t.held) { if (!t.carried) { t.carried = true; clearTimeout(t.timer); } h.holdMove?.(t.role, e.clientX, e.clientY, Boolean(t.long)); } // carried: the line follows the finger
  };

  const up = (ev) => {
    const t = touches.get(ev.pointerId);
    if (!t) return;
    // Android cancels a long press (it would open a menu): the finger counts as lifted where it last was
    const e = ev.type === 'pointercancel' ? { clientX: t.cx ?? t.x, clientY: t.cy ?? t.y, pointerId: ev.pointerId } : ev;
    touches.delete(e.pointerId);
    clearTimeout(t.timer);
    if (t.pinch) { if (!pinchers().length) { spread = null; h.pinchEnd?.(); } return; } // both fingers up: the pinch ends
    if (String(t.role).startsWith('corner') || t.slid) return h.slideEnd?.(t.role);
    if (t.held) {
      const moved = Math.hypot(e.clientX - t.x, e.clientY - t.y) > 30; // held and carried = a drag
      h.holdEnd?.(t.role);
      h.dragEnd?.(globalThis.document?.elementFromPoint?.(e.clientX, e.clientY) ?? null, moved, t.role, { long: Boolean(t.long) });
      return;
    }
    const gesture = classify({ dx: e.clientX - t.x, dy: e.clientY - t.y, ms: performance.now() - t.at });
    if (gesture === 'tap') tapped(e, t.role);
    else if (gesture) h.swipe?.(gesture, t.role);
  };

  // a tap waits DOUBLE_MS when a double-tap is possible
  const tapped = (e, role) => {
    const now = performance.now();
    if (h.doubleTap && now - lastTap < DOUBLE_MS) {
      lastTap = 0;
      h.doubleTap(role);
      return;
    }
    lastTap = now;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const waits = Boolean(h.doubleTap);
    setTimeout(() => { if (lastTap === now || !waits) h.tap?.(x, y, role); }, waits ? DOUBLE_MS : 0);
  };

  const events = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]];
  events.push(...['contextmenu', 'selectstart'].map((n) => [n, (e) => e.preventDefault()])); // no long-press menu: holding is a gesture
  for (const [name, fn] of events) el.addEventListener(name, fn);
  return () => { for (const [name, fn] of events) el.removeEventListener(name, fn); };
}
