// screen.js — puts the view (view/ring.js) on the screen: the camera picture where the ring says, the
// SVG of arcs, chips, Similar and the point on top, and tells for a touch what was touched.
//
// Purpose:   the view only computes shapes; this file is the only one that touches the DOM for it.
//            The picture is the real <video> (live camera, or the take being replayed), cut round
//            by CSS at layout().video; the template plays in its own small round <video>.
//            What was touched comes from data-role on the shapes ("point", "strand:v", "chip:Kaffee",
//            "similar:0", "line:-1", "delete:take", "template"), else "live" inside the picture.
// Depends:   browser; view/ring.js
// Test:      the shapes are tested in tests/view.test.mjs; this needs a browser.
// Limits:    one paint ≈ 1 ms layout + one innerHTML of ~100 shapes; call it on every state change and
//            while playing at most every animation frame.

import { layout, toSvg } from './view/ring.js';

/** Fit a <video> as a circle (or the whole screen when d covers it). */
function fit(video, circle, full) {
  if (!video || !circle) {
    if (video) video.hidden = true;
    return;
  }
  Object.assign(video.style, full
    ? { left: '0px', top: '0px', width: '100%', height: '100%', borderRadius: '0' }
    : { left: `${circle.cx - circle.d / 2}px`, top: `${circle.cy - circle.d / 2}px`, width: `${circle.d}px`, height: `${circle.d}px`, borderRadius: '50%' });
}

/**
 * root: the screen element (fills the screen) · live, replay, template: <video> elements · overlay: element
 * for the SVG. → { paint(st, data), roleAt(event), last }
 */
export function mountScreen({ root, live, replay, template, overlay }) {
  const screen = { last: null };

  screen.paint = (st, data = {}) => {
    const { width: w, height: h } = root.getBoundingClientRect();
    const view = layout(st, data, { w, h });
    screen.last = view;
    fit(live, view.video, st.full);
    fit(replay, view.video, st.full);
    fit(template, view.template, false);
    if (template) template.hidden = !view.template;
    overlay.innerHTML = toSvg(view, { w, h });
    return view;
  };

  /** What a touch hit: a role of a shape, "live" inside the picture, or null. */
  screen.roleAt = (event) => {
    const hit = event.target?.closest?.('[data-role]');
    if (hit) return hit.dataset.role;
    const v = screen.last?.video;
    if (!v) return null;
    const r = root.getBoundingClientRect();
    const inside = Math.hypot(event.clientX - r.left - v.cx, event.clientY - r.top - v.cy) <= v.d / 2;
    return inside ? 'live' : null;
  };

  return screen;
}

/** A role → the target of the gesture table and what it carries: { target, kind?, text?, index? }. */
export function targetOf(role) {
  if (!role) return { target: null };
  const [what, rest = ''] = role.split(/:(.*)/s);
  switch (what) {
    case 'point': return { target: 'point' };
    case 'live': return { target: 'live' };
    case 'strand': return { target: 'strand', kind: rest };
    case 'chip': case 'gesture': return { target: 'chip', text: rest };
    case 'similar': return { target: 'similar-item', index: Number(rest) };
    case 'line': return { target: 'item', index: Number(rest) };
    case 'template': return { target: 'item', template: true };
    case 'delete': return { target: 'delete', what: rest };
    default: return { target: role }; // edge zones and other named targets pass through
  }
}
