// screen.js — puts the view (view/ring.js) on the screen: the camera picture where the ring says, the
// SVG of arcs, chips, Similar and the point on top, and tells for a touch what was touched.
//
// Purpose:   the view only computes shapes; this file is the only one that touches the DOM for it.
//            The picture is the real <video> (live camera, or the take being replayed), the whole
//            square field at layout().video; the greyed rest outside the window is drawn by the view.
//            The template plays in its own small round <video>.
//            What was touched comes from data-role on the shapes ("point", "strand:v", "chip:Kaffee",
//            "similar:0", "line:-1", "delete:take", "template"), else "live" inside the picture.
// Depends:   browser; view/ring.js
// Test:      the shapes are tested in tests/view.test.mjs; this needs a browser.
// Limits:    one paint ≈ 1 ms layout + one innerHTML of ~100 shapes; call it on every state change and
//            while playing at most every animation frame.

import { layout, toSvg } from './view/ring.js';

/** Fit a <video> into its square (the field, a small round template, or the whole screen). */
function fit(video, box, full) {
  if (!video || !box) {
    if (video) video.hidden = true;
    return;
  }
  Object.assign(video.style, full
    ? { left: '0px', top: '0px', width: '100%', height: '100%', borderRadius: '0' }
    : { left: `${box.cx - box.d / 2}px`, top: `${box.cy - box.d / 2}px`, width: `${box.d}px`, height: `${box.d}px`, borderRadius: box.radius != null ? `${box.radius}px` : '50%' });
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
    globalThis.document?.documentElement.style.setProperty('--field-y', `${view.fieldY}px`); // the context field follows the window
    fit(live, view.video, st.full);
    if (live) live.style.visibility = view.hideLive ? 'hidden' : ''; // Similar · viele: the tiles take the window
    fit(replay, view.video, st.full);
    fit(template, view.template, false); // the small template, or in Similar · Doppel the reference window
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
    const inside = Math.max(Math.abs(event.clientX - r.left - v.cx), Math.abs(event.clientY - r.top - v.cy)) <= v.d / 2; // the whole field
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
    case 'sticky': return { target: 'chip', sticky: true };
    case 'similar': return { target: 'similar-item', index: Number(rest) };
    case 'line': return { target: 'item', index: Number(rest) };
    case 'line-arc': return { target: 'line-arc' };
    case 'similar-band': return { target: 'similar-band' };
    case 'level': return { target: 'level', index: Number(rest) };
    case 'template': return { target: 'item', template: true };
    case 'delete': return { target: 'delete', what: rest };
    default: return { target: role }; // edge zones and other named targets pass through
  }
}
