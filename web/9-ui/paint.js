// paint.js — draws the take from the state (take-state.js) and the positions (layout.js): window, arcs, line, button,
// photo dot, the chips inside the window and the series row under it.
//
// Purpose:   the only file that writes the take into the DOM. SVG for arcs, line and button (every touchable shape has
//            data-role, with a wide invisible twin to hit), HTML for the picture and the chips. Colour is never alone:
//            off = thin and grey, chosen = thick, waiting = dashed. Strands differ only by their spot around the window.
// Depends:   browser; layout.js, chips.js
// Test:      the positions are tested in tests/ui.test.mjs; this needs a browser (screenshots in md/screen.svg).
// Limits:    one SVG of ≈ 40 shapes per paint (< 1 ms); the SVG is only replaced when its text changed, so running
//            CSS animations (pulse, dots) keep their phase.

import { arcsOf, lineSlots, wideButton, nowChipSpot, polar, arcPath } from './layout.js';
import { chipWidth } from './chips.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => Number(n).toFixed(1);

/** The button's symbol: ● start · ❚❚ pause · ● again when paused · shutter in photo mode · ▶ on an earlier take. */
function symbol(st, x, y, r, live) {
  if (!live) return `<path class="sym" d="M${f1(x - r * 0.28)} ${f1(y - r * 0.38)}L${f1(x + r * 0.42)} ${f1(y)}L${f1(x - r * 0.28)} ${f1(y + r * 0.38)}Z"/>`;
  if (st.mode === 'photo') return `<circle class="sym-ring" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.5)}"/><circle class="sym" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.3)}"/>`;
  if (st.rec === 'recording') return `<rect class="sym" x="${f1(x - r * 0.3)}" y="${f1(y - r * 0.32)}" width="${f1(r * 0.2)}" height="${f1(r * 0.64)}" rx="2"/><rect class="sym" x="${f1(x + r * 0.1)}" y="${f1(y - r * 0.32)}" width="${f1(r * 0.2)}" height="${f1(r * 0.64)}" rx="2"/>`;
  return `<circle class="sym rec" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.36)}"/>`;
}

/** The SVG text of the take. data: { thumbs: { id: url }, buttonPic, cut (0…1 past the widest), wideTicks: [x] } */
export function takeSvg(st, L, data = {}) {
  const out = [];
  const line = st.lines.at(-1), older = st.lines.length - 1;
  for (const a of arcsOf(L, older)) {
    if (a.kind) {
      const on = st.strands[a.kind];
      out.push(`<path class="strand ${on ? 'on' : 'off'}${st.rec === 'recording' && on ? ' live' : ''}" d="${a.d}"/><path class="hit" data-role="${a.id}" d="${a.d}"/>`);
    } else if (a.id === 'line') {
      out.push(`<path class="line${st.chosenLine === older ? ' chosen' : ''}" d="${a.d}"/><path class="hit" data-role="line" d="${a.d}"/>`);
    } else {
      const i = Number(a.id.split(':')[1]), n = older - 1 - i;
      out.push(`<path class="old${st.chosenLine === n ? ' chosen' : ''}" d="${a.d}"/><path class="hit thin" data-role="old:${n}" d="${a.d}"/>`);
    }
  }
  if (older > 3) { const [x, y] = polar(L.cx, L.cy, L.lineR - 34 * L.k, 0); out.push(`<text class="more" x="${f1(x)}" y="${f1(y)}">+${older - 3}</text>`); }
  out.push('<defs>');
  const slots = lineSlots(L, line.takes.length + (st.rec !== 'idle' ? 1 : 0), st.at);
  for (const s of slots) out.push(`<clipPath id="c${s.i}"><circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r)}"/></clipPath>`);
  out.push(`<clipPath id="cb"><circle cx="${f1(L.button.x)}" cy="${f1(L.button.y)}" r="${f1(L.button.r - 3)}"/></clipPath></defs>`);
  for (const s of slots) {
    const take = line.takes[s.i], pic = take && data.thumbs?.[take.id];
    out.push(`<g data-role="take:${s.i}"><circle class="thumb" cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r)}"/>${pic ? `<image href="${esc(pic)}" x="${f1(s.x - s.r)}" y="${f1(s.y - s.r)}" width="${f1(2 * s.r)}" height="${f1(2 * s.r)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${s.i})"/>` : ''}<circle class="thumb-edge" cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r)}"/></g>`);
  }
  const p = L.photo;
  out.push(`<circle class="photo${st.mode === 'photo' ? ' on' : ''}" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r)}"/><circle class="hit-dot" data-role="photo" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r * 2.6)}"/>`);
  const live = st.at >= line.takes.length;
  const b = L.button, pic = live ? data.buttonPic : data.thumbs?.[line.takes[st.at]?.id];
  if (st.wide > 0.02) {
    const w = wideButton(L, st.wide), r = w.h / 2;
    const d = `M${f1(w.x + r)} ${f1(w.y)}H${f1(w.x + w.w - r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(w.x + w.w - r)} ${f1(w.y + w.h)}H${f1(w.x + r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(w.x + r)} ${f1(w.y)}Z`;
    out.push(`<clipPath id="cw"><path d="${d}"/></clipPath><path class="button wide" d="${d}"/>`);
    if (pic) out.push(`<image href="${esc(pic)}" x="${f1(w.x)}" y="${f1(w.y)}" width="${f1(w.w)}" height="${f1(w.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cw)" class="wide-pic"/>`);
    for (const x of data.wideTicks ?? []) out.push(`<line class="tick" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(w.y + w.h * 0.72)}" y2="${f1(w.y + w.h * 0.9)}" clip-path="url(#cw)"/>`);
    out.push(`<line class="${(data.cut ?? 0) > 0 ? 'cut' : 'playhead'}" x1="${f1(b.x)}" x2="${f1(b.x)}" y1="${f1(w.y + 5)}" y2="${f1(w.y + w.h - 5)}"/><path class="hit" data-role="button" d="${d}"/>`);
  } else {
    out.push(`<g data-role="button" class="button-g ${st.rec}${st.mode === 'photo' ? ' photo' : ''}"><circle class="button" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r)}"/>`);
    if (pic && (st.rec !== 'idle' || !live)) out.push(`<image href="${esc(pic)}" x="${f1(b.x - b.r)}" y="${f1(b.y - b.r)}" width="${f1(2 * b.r)}" height="${f1(2 * b.r)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cb)" class="button-pic"/>`);
    out.push(`${symbol(st, b.x, b.y, b.r, live)}<circle class="button-ring" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r + 5 * L.k)}"/></g>`);
  }
  return out.join('');
}

/** The chips of the take now, bent along the bottom arc inside the window. → HTML */
export function nowHtml(words, L, offers = []) {
  const widths = words.map((w) => chipWidth(w.text, L.k * 0.95));
  return words.map((w, i) => {
    const s = nowChipSpot(L, widths, i);
    return `<span class="chip ${w.tone} in${offers.includes(w.text) ? ' offer' : ''}" data-role="chip:${esc(w.text)}" style="left:${f1(s.x)}px;top:${f1(s.y)}px;width:${widths[i]}px;height:${f1(26 * L.k)}px;font-size:${f1(13 * L.k)}px;transform:translate(-50%,-50%) rotate(${f1(s.rot)}deg)">${esc(w.text)}</span>`;
  }).join('');
}

/** The series row: bubbles, takes, chips, and caret gaps between top-level elements (tap = write there). → HTML */
export function rowHtml(row, { caret = null, typing = '', offers = [], all = false, waiting = false } = {}) {
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const gap = (at, how = 'after') => `<i class="gap${same(caret, at) ? ' caret' : ''}" data-role="gap:${how}:${(at ?? []).join('.')}"></i>`;
  const typed = typing ? `<span class="chip typing">${esc(typing)}</span>` : '';
  const node = (n) => {
    if (n.take && n.tone === 'now' && !all) return ''; // the take now shows inside the window; the row: what comes
    if (n.take) return `<span class="take ${n.tone}">${n.words.map((w) => `<span class="chip ${w.tone}${offers.includes(w.text) ? ' offer' : ''}" data-role="chip:${esc(w.text)}">${esc(w.text)}</span>`).join('')}${same(caret, n.at) && typing ? typed : ''}</span>`;
    return `<span class="bubble d${Math.min(3, n.depth)}${n.sticky ? ' sticky' : ''}" data-role="bubble:${(n.at ?? []).join('.')}">${n.children.map((c) => node(c) + (c.at && !c.sticky ? gap(c.at) : '')).join('')}</span>`;
  };
  const parts = row.map((n) => node(n) + (n.at?.length ? gap(n.at) : ''));
  const end = caret == null && typing ? typed : '';
  const wait = waiting ? '<span class="chip offer wait" data-role="context"></span>' : ''; // one's own password word: empty, breathing
  return `${gap(null, 'start')}${parts.join('')}${wait}${end}<i class="gap end${caret == null ? ' caret' : ''}" data-role="gap:end:"></i>`;
}

/** An arc path for the hint layer (the gesture shown by a pale point). */
export const hintArc = (L, a, b) => arcPath(L.cx, L.cy, L.R + 7 * L.k, a, b);
