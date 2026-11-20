// swipe.js — what a finger did, from raw pointer points (no DOM, time passed in): tap, double tap, hold, swipe,
// drag and pinch. One finger = start spot + direction (15.11., "Anfangsort plus Geste wohin"); two fingers = spread
// or squeeze around their middle.
//
// Purpose:   the same classifier for the take, Similar and the sharing menu, so a gesture means the same everywhere.
//            Each event carries the role where the finger started (data-role of the element under it).
//              tap     < TAP_PX moved, < HOLD_MS          double   two taps < DOUBLE_MS apart on the same role
//              hold    still for HOLD_MS (once)           drag     every move of one finger after it left TAP_PX
//              swipe   at the end, ≥ SWIPE_PX: dir 'up' | 'down' | 'left' | 'right', dist px, far = beyond FAR of
//                      the way to the screen edge in that direction (↓ a little = context away, ↓ far = take anew)
//              pinch   two fingers: scale (1 = start), centre, the roles under both; phase 'move' | 'end';
//                      fx / fy = how much further apart across / up-down than at the start, angle = how steep they
//                      lay at the start (0 side by side … 90 one above the other) – the window's form (20.11.)
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    two fingers at most (a third is ignored); a double tap delays nothing: the first tap is reported at
//            once, the second comes as 'double' instead of a second 'tap'.

export const TAP_PX = 10, SWIPE_PX = 28, HOLD_MS = 450, DOUBLE_MS = 320, FAR = 0.45;

/** The pinch between two fingers a, b (with their spots at the pinch's start in p). */
function pinchOf(p, a, b, phase) {
  const x0 = Math.abs(p.at[0].x - p.at[1].x), y0 = Math.abs(p.at[0].y - p.at[1].y);
  const ratio = (now, then) => (then < 24 ? 1 : Math.max(0.2, now / then)); // too close in that direction to say
  return { type: 'pinch', phase, scale: Math.hypot(a.x - b.x, a.y - b.y) / p.d0, centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, roles: p.roles, at: p.at, now: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], // at: where the two fingers went down (20.11.: free space or the take), now: where they are
    fx: ratio(Math.abs(a.x - b.x), x0), fy: ratio(Math.abs(a.y - b.y), y0), angle: (Math.atan2(y0, x0) * 180) / Math.PI };
}

export class Swipe {
  constructor({ w = 390, h = 844 } = {}) { this.size = { w, h }; this.fingers = new Map(); this.lastTap = null; this.pinch = null; }

  resize(w, h) { this.size = { w, h }; }

  /** A finger comes down. → [event] */
  down(id, x, y, t, role) {
    if (this.fingers.size >= 2) return [];
    this.fingers.set(id, { x0: x, y0: y, x, y, t0: t, role, moved: false, held: false });
    if (this.fingers.size === 2) {
      const [a, b] = [...this.fingers.values()];
      for (const f of [a, b]) f.moved = true; // no tap, no swipe from a pinch
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, roles: [a.role, b.role], at: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], ids: [...this.fingers.keys()] };
      return [];
    }
    return [];
  }

  /** A finger moves. → [event] */
  move(id, x, y, t) {
    const f = this.fingers.get(id);
    if (!f) return [];
    f.x = x; f.y = y;
    if (this.pinch && this.fingers.size === 2) {
      const [a, b] = this.pinch.ids.map((k) => this.fingers.get(k));
      return [pinchOf(this.pinch, a, b, 'move')];
    }
    if (!f.moved && Math.hypot(x - f.x0, y - f.y0) >= TAP_PX) f.moved = true;
    return f.moved && !this.pinch ? [{ type: 'drag', role: f.role, dx: x - f.x0, dy: y - f.y0, x, y, t }] : [];
  }

  /** Called by a timer while fingers are down: a still finger becomes a hold, once. → [event] */
  tick(t) {
    const out = [];
    for (const f of this.fingers.values()) if (!f.moved && !f.held && !this.pinch && t - f.t0 >= HOLD_MS) { f.held = true; out.push({ type: 'hold', role: f.role, x: f.x, y: f.y }); }
    return out;
  }

  /** A finger lifts. → [event] */
  up(id, x, y, t) {
    const f = this.fingers.get(id);
    if (!f) return [];
    f.x = x; f.y = y;
    this.fingers.delete(id);
    if (this.pinch) {
      const out = [];
      if (this.fingers.size === 1) {
        const o = [...this.fingers.values()][0], gone = { x, y };
        const [a, b] = this.pinch.ids[0] === id ? [gone, o] : [o, gone];
        out.push(pinchOf(this.pinch, a, b, 'end'));
      }
      if (!this.fingers.size) this.pinch = null;
      return out;
    }
    if (f.held) return [{ type: 'release', role: f.role }];
    const dx = x - f.x0, dy = y - f.y0, dist = Math.hypot(dx, dy);
    if (dist < TAP_PX && !f.moved) {
      const last = this.lastTap;
      if (last && last.role === f.role && t - last.t < DOUBLE_MS) { this.lastTap = null; return [{ type: 'double', role: f.role, x, y }]; }
      this.lastTap = { role: f.role, t };
      return [{ type: 'tap', role: f.role, x, y }];
    }
    if (dist < SWIPE_PX) return [{ type: 'drag-end', role: f.role, dx, dy }];
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    const room = { up: f.y0, down: this.size.h - f.y0, left: f.x0, right: this.size.w - f.x0 }[dir] || 1;
    const along = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx);
    return [{ type: 'swipe', role: f.role, dir, dist: along, far: along / room >= FAR, dx, dy }];
  }

  /** All fingers gone without an up (the browser took them). */
  cancel() { this.fingers.clear(); this.pinch = null; return []; }
}
