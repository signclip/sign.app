// touch.js — fingers on an element → swipe.js events, each with the role under the finger where it came down.
//
// Purpose:   the only file that listens to pointer events. The role is data-role of the element (or its nearest parent
//            with one) at the first contact; a second finger reports its own role (pinch: roles of both). Android's
//            back gesture starts at the very edge: touches within EDGE px of the left/right edge are left alone.
// Depends:   browser; swipe.js
// Test:      the classifier is tested in tests/ui.test.mjs; this needs a browser.
// Limits:    two fingers; hold checked every 60 ms. Focus never moves by a touch: whoever wants the keyboard gone
//            blurs the field itself (gestures-take.js).

import { Swipe } from './swipe.js';

const EDGE = 12;
export const roleAt = (el) => el?.closest?.('[data-role]')?.dataset.role ?? null;

/** Listen on root; onEvent(event, domEvent) gets every swipe.js event; onMove(event) every drag/pinch step. */
export function listen(root, onEvent) {
  const sw = new Swipe({ w: innerWidth, h: innerHeight });
  let timer = null;
  const emit = (list, e) => { for (const ev of list) onEvent(ev, e); };
  root.addEventListener('pointerdown', (e) => {
    if (e.clientX < EDGE || e.clientX > innerWidth - EDGE) return;
    e.preventDefault(); // no mouse events made up after the touch (17.11.): they took the focus from the typing field at once, the keyboard never came
    sw.resize(innerWidth, innerHeight);
    const role = roleAt(document.elementFromPoint(e.clientX, e.clientY));
    emit(sw.down(e.pointerId, e.clientX, e.clientY, e.timeStamp, role), e);
    if (!timer) timer = setInterval(() => emit(sw.tick(performance.now()), null), 60);
    try { root.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  });
  root.addEventListener('pointermove', (e) => emit(sw.move(e.pointerId, e.clientX, e.clientY, e.timeStamp), e));
  const end = (e) => {
    emit(sw.up(e.pointerId, e.clientX, e.clientY, e.timeStamp), e);
    if (!sw.fingers.size) { clearInterval(timer); timer = null; }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', () => { sw.cancel(); clearInterval(timer); timer = null; });
  return sw;
}
