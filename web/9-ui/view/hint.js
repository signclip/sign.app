// view/hint.js — the onboarding hint (onboarding.js) as shapes: the element of the next step breathes,
// a pale copy of the point does the gesture on it. Data in, shapes out; ring.js calls it last.
//
// Depends:   nothing
// Test:      tests/view.test.mjs
// Limits:    one hint at a time; a way of 60 px on the 390 px phone; edges ~40 px inside.

const WAY = 60;
const MOVES = { up: [0, -1], down: [0, 1], 'down-far': [0, 2], left: [-1, 0], right: [1, 0] };

/** Middle of a shape: point, circle, thumb, or an arc (its middle angle). */
function middleOf(s) {
  if (s.type === 'arc') {
    const rad = (((s.from + s.to) / 2) * Math.PI) / 180;
    return [s.cx + s.r * Math.sin(rad), s.cy - s.r * Math.cos(rad)];
  }
  if (s.mid) return s.mid; // an arc around the window (ring.js)
  if (s.type === 'thumb') return [s.x + s.s / 2, s.y + s.s / 2];
  if (s.x1 != null) return [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2]; // a strand bar on the window's edge
  if (s.cx != null) return [s.cx, s.cy];
  return null;
}

/** Where an edge zone is: ~40 px inside, upper third at 1/6 of the height, middle at 1/2. */
function edgeAt(role, { w, h, k }) {
  const m = /^(upper|middle)-(left|right)$/.exec(role);
  if (role === 'top-middle') return { at: [w / 2, 40 * k], inward: [0, 1] };
  if (!m) return null;
  const y = m[1] === 'upper' ? h / 6 : h / 2;
  return m[2] === 'left' ? { at: [40 * k, y], inward: [1, 0] } : { at: [w - 40 * k, y], inward: [-1, 0] };
}

/**
 * shapes: from ring.js · hint: { role, gesture } or null · size { w, h, k }.
 * → the shapes, the target marked 'hinted', and one 'hint' shape { cx, cy, r, dx, dy, cls }.
 */
export function withHint(shapes, hint, { w, h, k = w / 390 }) {
  if (!hint?.gesture) return shapes;
  let at = null, dir = MOVES[hint.gesture] ?? [0, 0];
  const out = shapes.map((s) => {
    if (s.role !== hint.role || s.cls === 'hit') return s;
    at ??= middleOf(s);
    return { ...s, cls: `${s.cls} hinted` };
  });
  if (!at) {
    const edge = edgeAt(hint.role, { w, h, k });
    if (!edge) return shapes;
    at = edge.at;
    if (hint.gesture === 'edge-in') dir = edge.inward;
    if (hint.gesture === 'edge-out') dir = edge.inward.map((d) => -d);
  }
  const moving = dir[0] || dir[1];
  const how = moving ? 'move' : hint.gesture; // tap · double-tap · hold · hold-slow · move
  out.push({ type: 'hint', cx: at[0], cy: at[1], r: 14 * k, dx: dir[0] * WAY * k, dy: dir[1] * WAY * k, cls: `hint ${how}` });
  return out;
}
