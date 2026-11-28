// touch.js — fingers on an element → swipe.js events, each with the role under the finger where it came down.
//
// Purpose:   the only file that listens to pointer events. The role is data-role of the element (or its nearest parent
//            with one) at the first contact; a second finger reports its own role (pinch: roles of both). Android's
//            back gesture starts at the very edge: touches within EDGE px of the left/right edge are left alone.
// Depends:   browser; swipe.js
// Test:      the classifier is tested in tests/ui.test.mjs; this needs a browser.
//            What a finger rests on shows it (27.11., user: "visuelles Feedback"): the element with the role gets the
//            class "down" until the finger lifts, moves 12 px away or a second finger comes; look.css says how that
//            looks (a little darker). The app catches every touch itself, so the browser's own :active never shows.
// Limits:    two fingers; hold checked every 60 ms; "down" on one element at a time, never on the whole screen. Focus never moves by a touch: whoever wants the keyboard gone
//            blurs the field itself (gestures-take.js).

import { Swipe } from './swipe.js';

const EDGE = 12;
export const roleAt = (el) => el?.closest?.('[data-role]')?.dataset.role ?? null;

/** Listen on root; onEvent(event, domEvent) gets every swipe.js event; onMove(event) every drag/pinch step. */
export function listen(root, onEvent) {
  const sw = new Swipe({ w: innerWidth, h: innerHeight });
  let timer = null;
  const emit = (list, e) => { for (const ev of list) onEvent(ev, e); };
  let pressed = null, from = null;
  const release = () => { pressed?.classList?.remove('down'); pressed = null; from = null; };
  root.addEventListener('pointerdown', (e) => {
    if (e.clientX < EDGE || e.clientX > innerWidth - EDGE) return;
    e.preventDefault(); // no mouse events made up after the touch (17.11.): they took the focus from the typing field at once, the keyboard never came
    sw.resize(innerWidth, innerHeight);
    const under = document.elementFromPoint(e.clientX, e.clientY), role = roleAt(under), el = under?.closest?.('[data-role]') ?? null;
    release();
    if (!sw.fingers.size && el && el !== root && el.dataset.role !== 'screen') { pressed = el; from = { x: e.clientX, y: e.clientY }; el.classList.add('down'); }
    emit(sw.down(e.pointerId, e.clientX, e.clientY, e.timeStamp, role), e);
    if (!timer) timer = setInterval(() => emit(sw.tick(performance.now()), null), 60);
    try { root.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 12) release(); // it is being moved, not pressed
    emit(sw.move(e.pointerId, e.clientX, e.clientY, e.timeStamp), e);
  });
  const end = (e) => {
    release();
    emit(sw.up(e.pointerId, e.clientX, e.clientY, e.timeStamp), e);
    if (!sw.fingers.size) { clearInterval(timer); timer = null; }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', () => { release(); sw.cancel(); clearInterval(timer); timer = null; });
  return sw;
}
