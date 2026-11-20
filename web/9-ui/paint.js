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

import { timerPill, arcsOf, lineSlots, wideButton, nowChipSpot, timeline } from './layout.js';
import { edge, curve, outline, pathOf } from './form.js';
import { partsOf, contextTimes } from './line.js';
import { chipWidth, NEST_COLORS } from './chips.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => Number(n).toFixed(1);

/** The button's symbol: ● start · ❚❚ pause · ● again when paused · shutter in photo mode · ▶ on an earlier take. */
function symbol(st, x, y, r, live) {
  if (!live) return `<path class="sym" d="M${f1(x - r * 0.28)} ${f1(y - r * 0.38)}L${f1(x + r * 0.42)} ${f1(y)}L${f1(x - r * 0.28)} ${f1(y + r * 0.38)}Z"/>`;
  if (st.mode === 'photo') return `<circle class="sym-ring" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.5)}"/><circle class="sym" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.3)}"/>`;
  if (st.rec === 'recording') return `<rect class="sym" x="${f1(x - r * 0.3)}" y="${f1(y - r * 0.32)}" width="${f1(r * 0.2)}" height="${f1(r * 0.64)}" rx="2"/><rect class="sym" x="${f1(x + r * 0.1)}" y="${f1(y - r * 0.32)}" width="${f1(r * 0.2)}" height="${f1(r * 0.64)}" rx="2"/>`;
  return `<circle class="sym rec" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.36)}"/>`;
}

/**
 * The timeline of a take inside the spread button (17.11.): the moment ms stands at the mark in the middle, the take runs
 * through it. Three rows, as the strands lie around the window: the picture (its still, side by side), the sound (a bar),
 * the context (a word with its own time where it was said; a word without one along the whole take). Marks every half
 * second, a longer one every second; where two joined takes meet, a line through all rows. A strand the take does not
 * have is a thin grey line: seen at the mark, which rows a cut divides.
 */
export function timelineSvg(take, ms, L, w, pic, zoom = 1) {
  if (!take) return '';
  const tl = timeline(L, take, ms, zoom), len = take.ms ?? 0, out = [];
  const x0 = tl.x(0), x1 = tl.x(len), has = (k) => !take.kinds || take.kinds.includes(k);
  const row = { v: [w.y, w.h * 0.5], a: [w.y + w.h * 0.5, w.h * 0.2], x: [w.y + w.h * 0.7, w.h * 0.3] };
  out.push(`<rect class="tl-band" x="${f1(x0)}" y="${f1(w.y)}" width="${f1(Math.max(1, x1 - x0))}" height="${f1(w.h)}"/>`);
  if (has('v') && pic) { // the still side by side, only as far as the take reaches
    const side = row.v[1], from = Math.max(x0, w.x - side), to = Math.min(x1, w.x + w.w);
    out.push(`<clipPath id="cband"><rect x="${f1(x0)}" y="${f1(w.y)}" width="${f1(Math.max(1, x1 - x0))}" height="${f1(w.h)}"/></clipPath><g clip-path="url(#cband)">`);
    for (let x = x0 + Math.floor((from - x0) / side) * side, n = 0; x < to && n < 24; x += side, n++) out.push(`<image class="tl-pic" href="${esc(pic)}" x="${f1(x)}" y="${f1(row.v[0])}" width="${f1(side)}" height="${f1(side)}" preserveAspectRatio="xMidYMid slice"/>`);
    out.push('</g>');
  }
  const bar = (k) => `<rect class="tl-row ${k}${has(k) ? '' : ' off'}" x="${f1(x0)}" y="${f1(row[k][0] + (has(k) ? 1.5 : row[k][1] / 2 - 0.75))}" width="${f1(Math.max(1, x1 - x0))}" height="${f1(has(k) ? row[k][1] - 3 : 1.5)}"/>`;
  out.push(has('v') && pic ? '' : bar('v'), bar('a'));
  const words = has('x') ? contextTimes(take.context) : [];
  const whole = words.filter((x) => x.from == null), timed = words.filter((x) => x.from != null);
  out.push(`<rect class="tl-row x${has('x') && whole.length ? '' : ' off'}" x="${f1(x0)}" y="${f1(row.x[0] + (whole.length ? 1.5 : row.x[1] / 2 - 0.75))}" width="${f1(Math.max(1, x1 - x0))}" height="${f1(whole.length ? row.x[1] - 3 : 1.5)}"/>`);
  if (whole.length) out.push(`<text class="tl-word" x="${f1(Math.max(x0, w.x + w.h * 0.3) + 4)}" y="${f1(row.x[0] + row.x[1] * 0.68)}">${esc(whole.map((x) => x.text).join(' ').slice(0, 28))}</text>`);
  for (const t of timed) out.push(`<rect class="tl-said" x="${f1(tl.x(t.from))}" y="${f1(row.x[0] + 1.5)}" width="${f1(Math.max(3, (t.to - t.from) * tl.px))}" height="${f1(row.x[1] - 3)}" rx="3"/><text class="tl-word said" x="${f1(tl.x(t.from) + 3)}" y="${f1(row.x[0] + row.x[1] * 0.68)}">${esc(t.text.slice(0, 12))}</text>`);
  for (let t = 0; t <= len; t += 500) { const x = tl.x(t); if (x > w.x - 2 && x < w.x + w.w + 2) out.push(`<line class="tick${t % 1000 ? '' : ' full'}" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(w.y)}" y2="${f1(w.y + (t % 1000 ? 5 : 9) * L.k)}"/>`); }
  let at = 0;
  for (const p of partsOf(take).slice(0, -1)) { at += p.to - p.from; out.push(`<line class="tl-join" x1="${f1(tl.x(at))}" x2="${f1(tl.x(at))}" y1="${f1(w.y)}" y2="${f1(w.y + w.h)}"/>`); }
  return out.join('');
}

/**
 * The cut (20.11.): the pill parts at the mark into two, they move apart and round into two bubbles, which then lie on
 * the line as two takes. split: { t0, left, right (px of each part), y, h, at (the mark) } · 380 ms.
 */
export function splitSvg(split, L) {
  const f = Math.max(0, Math.min(1, (performance.now() - split.t0) / 380)), e = 1 - (1 - f) ** 3, r = split.h / 2;
  const pill = (x, w) => `<rect class="button wide split" x="${f1(x)}" y="${f1(split.y)}" width="${f1(w)}" height="${f1(split.h)}" rx="${f1(r)}" style="opacity:${(1 - f * 0.6).toFixed(2)}"/>`;
  const gap = e * 26 * L.k, lw = split.left + (split.h - split.left) * e, rw = split.right + (split.h - split.right) * e;
  return pill(split.at - gap / 2 - lw, lw) + pill(split.at + gap / 2, rw);
}

/** The button's time (calm.js): a thin arc on its ring from the top, clockwise; f 0…1 of the calm or of the take's run. */
function timerArc(b, R, { kind, f }) {
  const a = Math.min(0.999, Math.max(0, f)) * 2 * Math.PI, x = b.x + R * Math.sin(a), y = b.y - R * Math.cos(a);
  return `<path class="button-timer ${kind}" d="M${f1(b.x)} ${f1(b.y - R)}A${f1(R)} ${f1(R)} 0 ${a > Math.PI ? 1 : 0} 1 ${f1(x)} ${f1(y)}"/>`;
}
/**
 * The empty button spread for its times (calm.js): a pill like the clip; left = a new take by itself (to the first
 * catch: at once, beyond: the countdown), right beyond its catch = the stillness until the end; a tick per second, the
 * catches as short bars (shown faintly where the pill has not reached yet), the values above each side.
 */
function timerSvg(t, L) {
  const p = timerPill(L, t, t.f), b = L.button, r = p.h / 2, k = L.k, f = Math.max(0, t.f);
  const d = `M${f1(p.x + r)} ${f1(p.y)}H${f1(p.x + p.w - r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(p.x + p.w - r)} ${f1(p.y + p.h)}H${f1(p.x + r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(p.x + r)} ${f1(p.y)}Z`;
  const out = [`<path class="button wide${t.restartMs != null ? ' auto' : ''}" d="${d}"/>`];
  const bar = (x, cls, a = 0.3) => out.push(`<line class="${cls}" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(p.y + p.h * a)}" y2="${f1(p.y + p.h * (1 - a))}"/>`);
  for (let i = 1; i * 1000 <= (t.restartMs ?? 0); i++) bar(b.x - b.r - (p.at + i * p.S) * f, 'timer-tick');
  for (let i = 1; i * 1000 <= t.stillEndMs; i++) bar(b.x + b.r + (p.at + i * p.S) * f, 'timer-tick');
  for (const side of [-1, 1]) { const x = b.x + side * (b.r + p.at * f), inside = (side < 0 ? p.left : p.right) >= p.at * f - 0.5; bar(x, `timer-catch${inside ? '' : ' ahead'}`, 0.18); }
  out.push(`<path class="button wide-edge${t.restartMs != null ? ' auto' : ''}" d="${d}"/><path class="hit" data-role="button" d="${d}"/>`);
  if (f > 0.6) {
    const sec = (ms) => ` ${(ms / 1000).toLocaleString()} s`, y = p.y - 16 * k, h = 22 * k;
    const one = (text, x, anchor) => { const w = (text.length * 7.5 + 16) * k, x0 = anchor === 'end' ? x - w : x; return `<g class="timer-label"><rect x="${f1(x0)}" y="${f1(y - h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(h / 2)}"/><text x="${f1(x0 + w / 2)}" y="${f1(y)}">${text}</text></g>`; };
    if (t.restartMs != null) out.push(one(`↻${t.restartMs ? sec(t.restartMs) : ''}`, b.x - 4 * k, 'end'));
    if (t.stillEndMs) out.push(one(`■${sec(t.stillEndMs)}`, b.x + 4 * k, 'start'));
  }
  return out.join('');
}

/** The SVG text of the take. data: { thumbs: { id: url }, buttonPic, cut (0…1 past the widest), split, calm, timers, auto (calm.js: it starts anew by itself) } */
export function takeSvg(st, L, data = {}) {
  const out = [];
  const line = st.lines.at(-1), older = st.lines.length - 1;
  if (L.scale) out.push(`<path class="focus-edge" d="${outline(L)}"/>`); // only the inside is seen (20.11., user): the picture itself is clipped to the window (app.js)
  // a line chosen (20.11.): a border around it, as wide as its takes — the stroke itself keeps its colour
  const border = (d, w, id) => `<mask id="${id}" maskUnits="userSpaceOnUse"><rect x="-9999" y="-9999" width="99999" height="99999" fill="white"/><path d="${d}" fill="none" stroke="black" stroke-width="${f1(w)}" stroke-linecap="round"/></mask><path class="line-border" d="${d}" stroke-width="${f1(w + 6)}" mask="url(#${id})"/>`;
  const sc = L.scale || 1;
  for (const a of arcsOf(L, older)) {
    if (a.kind) {
      const on = st.strands[a.kind];
      out.push(`<path class="strand ${on ? 'on' : 'off'}${st.rec === 'recording' && on ? ' live' : ''}" d="${a.d}"/><path class="hit" data-role="${a.id}" d="${a.d}"/>`);
    } else if (a.id === 'line') {
      if (st.chosenLine === older) out.push(border(a.d, 2 * 15 * L.k * sc + 10, 'b-line'));
      out.push(`<path class="line" d="${a.d}"/><path class="hit" data-role="line" d="${a.d}"/>`);
    } else {
      const i = Number(a.id.split(':')[1]), n = older - 1 - i;
      if (st.chosenLine === n) out.push(border(a.d, 10 * L.k * sc, `b-old${n}`));
      out.push(`<path class="old" d="${a.d}"/><path class="hit thin" data-role="old:${n}" d="${a.d}"/>`);
    }
  }
  if (older > 3) { const [x, y] = edge(L, 0, L.lineOff - 34 * L.k); out.push(`<text class="more" x="${f1(x)}" y="${f1(y)}">+${older - 3}</text>`); }
  out.push('<defs>');
  const slots = lineSlots(L, line.takes.length + (st.rec !== 'idle' ? 1 : 0), st.at, data.lineShift ?? 0);
  const thumbOf = (t) => ({ cx: t.x, cy: t.y, rx: t.r * Math.min(1, L.aspect), ry: t.r * Math.min(1, 1 / L.aspect), n: L.n }); // a take on the line: the window's form (20.11.)
  for (const s of slots) out.push(`<clipPath id="c${s.i}"><path d="${outline(thumbOf(s))}"/></clipPath>`);
  out.push(`<clipPath id="cb"><circle cx="${f1(L.button.x)}" cy="${f1(L.button.y)}" r="${f1(L.button.r - 3)}"/></clipPath></defs>`);
  for (const s of slots) {
    const take = line.takes[s.i], pic = take && data.thumbs?.[take.id];
    const T = thumbOf(s), d = outline(T);
    out.push(`<g data-role="take:${s.i}"><path class="thumb" d="${d}"/>${pic ? `<image href="${esc(pic)}" x="${f1(s.x - T.rx)}" y="${f1(s.y - T.ry)}" width="${f1(2 * T.rx)}" height="${f1(2 * T.ry)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${s.i})"/>` : ''}<path class="thumb-edge" d="${d}"/></g>`);
  }
  const p = L.photo;
  out.push(`<circle class="photo${st.mode === 'photo' ? ' on' : ''}" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r)}"/><circle class="hit-dot" data-role="photo" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r * 2.6)}"/>`);
  const live = st.at >= line.takes.length;
  const near = Math.max(0, Math.min(line.takes.length, Math.round(st.at - (data.lineShift ?? 0)))); // the take the pulled line would rest on
  const b = L.button, pic = (data.lineShift ? near >= line.takes.length : live) ? data.buttonPic : data.thumbs?.[line.takes[data.lineShift ? near : st.at]?.id];
  if (st.wide > 0.02) {
    const w = wideButton(L, st.wide, line.takes[st.at], st.wideMs, st.wideZoom ?? 1), r = w.h / 2;
    const d = `M${f1(w.x + r)} ${f1(w.y)}H${f1(w.x + w.w - r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(w.x + w.w - r)} ${f1(w.y + w.h)}H${f1(w.x + r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(w.x + r)} ${f1(w.y)}Z`;
    out.push(`<clipPath id="cw"><path d="${d}"/></clipPath><path class="button wide" d="${d}"/><g clip-path="url(#cw)">${timelineSvg(line.takes[st.at], st.wideMs, L, w, pic, st.wideZoom ?? 1)}</g>`);
    const gap = Math.max(0, Math.min(1, data.cut ?? 0)) * 7 * L.k; // spread past the widest: the take opens at the mark
    if (gap > 0) out.push(`<line class="cut" x1="${f1(b.x - gap)}" x2="${f1(b.x - gap)}" y1="${f1(w.y - 4)}" y2="${f1(w.y + w.h + 4)}"/><line class="cut" x1="${f1(b.x + gap)}" x2="${f1(b.x + gap)}" y1="${f1(w.y - 4)}" y2="${f1(w.y + w.h + 4)}"/>`);
    else out.push(`<line class="playhead" x1="${f1(b.x)}" x2="${f1(b.x)}" y1="${f1(w.y - 4)}" y2="${f1(w.y + w.h + 4)}"/>`);
    out.push(`<path class="button wide-edge" d="${d}"/><path class="hit" data-role="button" d="${d}"/>`);
  } else if (data.split) {
    out.push(splitSvg(data.split, L));
  } else if (data.timers) {
    out.push(timerSvg(data.timers, L), `<g data-role="button" class="button-g idle">${symbol(st, b.x, b.y, b.r, true)}</g>`);
  } else {
    out.push(`<g data-role="button" class="button-g ${st.rec}${st.mode === 'photo' ? ' photo' : ''}${data.auto && live ? ' auto' : ''}"><circle class="button" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r)}"/>`);
    if (pic && (st.rec !== 'idle' || !live)) out.push(`<image href="${esc(pic)}" x="${f1(b.x - b.r)}" y="${f1(b.y - b.r)}" width="${f1(2 * b.r)}" height="${f1(2 * b.r)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cb)" class="button-pic"/>`);
    out.push(`${symbol(st, b.x, b.y, b.r, live)}<circle class="button-ring" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r + 5 * L.k)}"/>${data.calm ? timerArc(b, b.r + 5 * L.k, data.calm) : ''}</g>`);
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

/**
 * The series row: bubbles, takes, chips, and a gap at every spot something can be written at (17.11.): in front of the
 * first element (of the row and of every bubble), behind every element, at the end. A tap on a gap, a take or a bubble
 * puts the caret there; what is typed shows at the caret. caret: { at: path | null, how: 'after' | 'in' | 'first' } | null
 * (null = at the end). → HTML
 */
export function rowHtml(row, { caret = null, typing = '', offers = [], all = false, waiting = false, on = false } = {}) {
  const same = (a, b) => (a ?? []).length === (b ?? []).length && (a ?? []).every((x, i) => x === b[i]);
  const here = (at, how) => on && caret && caret.how === how && same(caret.at, at);
  const typed = `<span class="chip typing">${esc(typing) || '&nbsp;'}</span>`;
  const gap = (at, how = 'after') => `<i class="gap${here(at, how) ? ' caret' : ''}" data-role="gap:${how}:${(at ?? []).join('.')}"></i>${here(at, how) && typing ? typed : ''}`;
  const hidden = (n) => !all && (n.take ? n.i === 0 : n.children.every(hidden)); // the take now shows inside the window; the row: what comes
  const chip = (w) => `<span class="chip ${w.tone}${offers.includes(w.text) ? ' offer' : ''}">${esc(w.text)}</span>`;
  const edge = (k) => (k == null ? '' : ` style="--nc:${NEST_COLORS[k % NEST_COLORS.length]}"`); // the edge says which nesting (20.11.)
  const node = (n) => {
    if (hidden(n)) return '';
    if (n.take) {
      const words = n.words.map(chip).join('');
      return `<span class="take ${n.tone}"${n.at ? ` data-role="gap:after:${n.at.join('.')}"` : ''}>${n.nest != null ? `<span class="bubble inner"${edge(n.nest)}>${words}</span>` : words}</span>`;
    }
    const inside = n.children.map((c) => node(c) + (c.at && !hidden(c) ? gap(c.at) : '')).join('');
    const tail = here(n.at, 'in') ? `<i class="gap caret"></i>${typing ? typed : ''}` : '';
    return `<span class="bubble d${Math.min(3, n.depth)}${n.sticky ? ' sticky' : ''}"${edge(n.nest)} data-role="bubble:${(n.at ?? []).join('.')}">${(n.head ?? []).map(chip).join('')}${n.sticky ? '' : gap(n.at, 'first')}${inside}${tail}</span>`;
  };
  const parts = row.map((n) => node(n) + (n.at?.length && !hidden(n) ? gap(n.at) : ''));
  const atEnd = on && !caret;
  const wait = waiting ? '<span class="chip offer wait" data-role="context"></span>' : ''; // one's own password word: empty, breathing
  return `${gap([], 'first')}${parts.join('')}${wait}<i class="gap end${atEnd ? ' caret' : ''}" data-role="gap:end:"></i>${atEnd && typing ? typed : ''}<i class="gap tail" data-role="gap:end:"></i>`;
}

/** An arc path for the hint layer (the gesture shown by a pale point). */
export const hintArc = (L, a, b) => pathOf(curve(L, a, b, 7 * L.k));
