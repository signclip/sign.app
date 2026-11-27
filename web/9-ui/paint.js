// paint.js — draws the take from the state (take-state.js) and the positions (layout.js): window, arcs, line, button,
// the chips inside the window and the series row under it.
//
// Purpose:   the only file that writes the take into the DOM. SVG for arcs, line and button (every touchable shape has
//            data-role, with a wide invisible twin to hit), HTML for the picture and the chips. Colour is never alone:
//            off = thin and grey, chosen = thick, waiting = dashed. Strands differ only by their spot around the window.
// Depends:   browser; layout.js, chips.js
// Test:      the positions are tested in tests/ui.test.mjs; this needs a browser (screenshots in md/design-screen.svg).
// Limits:    one SVG of ≈ 40 shapes per paint (< 1 ms); the SVG is only replaced when its text changed, so running
//            CSS animations (pulse, dots) keep their phase.

import { timerPill, arcsOf, lineSlots, wideButton, nowChipSpot, timeline, polar, strandPoints, pieceOfPoints, flowPoints } from './layout.js';
import { PIECES } from './level.js';
import { SECTORS, STEPS, READY, SIGN, wideOpen } from './similar-range.js';
import { edge, curve, outline, pathOf } from './form.js';
import { partsOf, contextTimes, lineLabel } from './line.js';
import { chipWidth, NEST_COLORS } from './chips.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => Number(n).toFixed(1);

/**
 * The button's symbol: always one of three. 26.11. (user): ● only where a new take can begin (ready, nothing waiting to
 * be kept) · a take that runs: ❚❚ · a take that was paused: ▶ (it goes on), so ▶ and ❚❚ stay until it is kept (←) ·
 * an earlier take of the line in the button, or a line chosen (26.11.): ▶ (it stands) or ❚❚ (it plays) – never the dot.
 */
function symbol(st, x, y, r, live, playing = false) {
  const start = `<path class="sym" d="M${f1(x - r * 0.28)} ${f1(y - r * 0.38)}L${f1(x + r * 0.42)} ${f1(y)}L${f1(x - r * 0.28)} ${f1(y + r * 0.38)}Z"/>`;
  const pause = `<rect class="sym" x="${f1(x - r * 0.3)}" y="${f1(y - r * 0.32)}" width="${f1(r * 0.2)}" height="${f1(r * 0.64)}" rx="2"/><rect class="sym" x="${f1(x + r * 0.1)}" y="${f1(y - r * 0.32)}" width="${f1(r * 0.2)}" height="${f1(r * 0.64)}" rx="2"/>`;
  if (!live || (st.chosenLine != null && st.rec === 'idle')) return playing ? pause : start; // a line chosen (26.11.): ▶ plays it
  if (st.rec === 'recording') return pause;
  if (st.rec === 'paused') return start;
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
  const bar = (k) => `<rect class="tl-row ${k}${has(k) ? '' : ' off'}" x="${f1(x0)}" y="${f1(row[k][0] + (has(k) ? 1.5 : row[k][1] / 2 - 0.75))}" width="${f1(Math.max(1, x1 - x0))}" height="${f1(has(k) ? Math.max(0, row[k][1] - 3) : 1.5)}"/>`;
  out.push(has('v') && pic ? '' : bar('v'), bar('a'));
  const words = has('x') ? contextTimes(take.context) : [];
  const whole = words.filter((x) => x.from == null), timed = words.filter((x) => x.from != null);
  out.push(`<rect class="tl-row x${has('x') && whole.length ? '' : ' off'}" x="${f1(x0)}" y="${f1(row.x[0] + (whole.length ? 1.5 : row.x[1] / 2 - 0.75))}" width="${f1(Math.max(1, x1 - x0))}" height="${f1(whole.length ? Math.max(0, row.x[1] - 3) : 1.5)}"/>`);
  if (whole.length) out.push(`<text class="tl-word" x="${f1(Math.max(x0, w.x + w.h * 0.3) + 4)}" y="${f1(row.x[0] + row.x[1] * 0.68)}">${esc(whole.map((x) => x.text).join(' ').slice(0, 28))}</text>`);
  for (const t of timed) out.push(`<rect class="tl-said" x="${f1(tl.x(t.from))}" y="${f1(row.x[0] + 1.5)}" width="${f1(Math.max(3, (t.to - t.from) * tl.px))}" height="${f1(Math.max(0, row.x[1] - 3))}" rx="3"/><text class="tl-word said" x="${f1(tl.x(t.from) + 3)}" y="${f1(row.x[0] + row.x[1] * 0.68)}">${esc(t.text.slice(0, 12))}</text>`);
  for (let t = 0; t <= len; t += 500) { const x = tl.x(t); if (x > w.x - 2 && x < w.x + w.w + 2) out.push(`<line class="tick${t % 1000 ? '' : ' full'}" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(w.y)}" y2="${f1(w.y + (t % 1000 ? 5 : 9) * L.k)}"/>`); }
  let at = 0;
  for (const p of partsOf(take).slice(0, -1)) { at += p.to - p.from; out.push(`<line class="tl-join" x1="${f1(tl.x(at))}" x2="${f1(tl.x(at))}" y1="${f1(w.y)}" y2="${f1(w.y + w.h)}"/>`); }
  return out.join('');
}

/** How far each half moves away from the mark while the mark bends (share of the pill's half height). */
export const BOW = 0.7;

/**
 * A piece of the spread button from x0 to x1: left end bulging bl px, right end br px (0 = straight, r = a half circle).
 * The mark bending into the cut (21.11.) is the right end of the left piece and the left end of the right one.
 */
export function pieceOf(x0, x1, y, h, bl, br) {
  const r = h / 2, w = Math.max(bl + br, x1 - x0);
  return `M${f1(x0 + bl)} ${f1(y)}H${f1(x0 + w - br)}A${f1(br)} ${f1(r)} 0 0 1 ${f1(x0 + w - br)} ${f1(y + h)}H${f1(x0 + bl)}A${f1(bl)} ${f1(r)} 0 0 1 ${f1(x0 + bl)} ${f1(y)}Z`;
}

/**
 * The cut (20.11.): the pill parts at the mark into two, they move apart and round into two bubbles, which then lie on
 * the line as two takes. split: { t0, left, right (px of each part), y, h, at (the mark) } · 380 ms.
 */
export function splitSvg(split, L) {
  const f = Math.max(0, Math.min(1, (performance.now() - split.t0) / 380)), e = 1 - (1 - f) ** 3, r = split.h / 2;
  const pill = (x, w) => `<rect class="button wide split" x="${f1(x)}" y="${f1(split.y)}" width="${f1(w)}" height="${f1(split.h)}" rx="${f1(r)}" style="opacity:${(1 - f * 0.6).toFixed(2)}"/>`;
  const gap = (split.gap0 ?? 0) + e * 26 * L.k, lw = split.left + (split.h - split.left) * e, rw = split.right + (split.h - split.right) * e;
  return pill(split.at - gap / 2 - lw, lw) + pill(split.at + gap / 2, rw);
}

/**
 * The series (21.11., user): the button as wide as its time was set, no numbers – a tick per second to judge by.
 * Before a new take the pill narrows from the left onto the button: when it is round again the take starts. In a take
 * that went still it grows to the right up to its end (dashed; the end itself round like the button): there the take
 * ends. It opens and closes moving (calm.js). c: { kind: 'start' | 'stop', ms (the time set), w (0…1 of the time's
 * width: what is left / how long still), g (0…1: how far the end is out) } → the paths that move.
 */
export function calmShapes(c, L) {
  const b = L.button, r = b.r, y = b.y - r, h = 2 * r;
  if (c.kind === 'start') { const full = timerPill(L, { restartMs: c.ms }).left; return { full, move: pieceOf(b.x - r - full * c.w, b.x + r, y, h, r, r) }; }
  const full = timerPill(L, { stillEndMs: c.ms }).right, end = b.x + r + full * c.g;
  return { full, goal: pieceOf(b.x - r, end, y, h, r, r), end: `M${f1(end - r)} ${f1(y)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(end - r)} ${f1(y + h)}`, move: pieceOf(b.x - r, b.x + r + full * Math.min(c.w, c.g), y, h, r, r) };
}
function calmSvg(c, L) {
  const b = L.button, r = b.r, k = c.ms / 1000, p = calmShapes(c, L), ticks = [];
  for (let i = 1; i < k; i++) { const x = c.kind === 'start' ? b.x - r - (p.full * i) / k : b.x + r + (p.full * i) / k; ticks.push(`<line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(b.y - r * 0.4)}" y2="${f1(b.y + r * 0.4)}"/>`); }
  const clip = c.kind === 'start' ? 'calm-move' : 'calm-goal-move', d = c.kind === 'start' ? p.move : p.goal; // the ticks only where the pill (the end) is
  const tickG = `<clipPath id="calm-clip"><path class="${clip}" d="${d}"/></clipPath><g class="timer-tick${c.kind === 'start' ? ' start' : ''}" clip-path="url(#calm-clip)">${ticks.join('')}</g>`;
  if (c.kind === 'start') return `<path class="calm-base calm-move" d="${p.move}"/><path class="calm start calm-move" d="${p.move}"/>${tickG}`;
  return `<path class="calm-goal calm-goal-move" d="${p.goal}"/><path class="calm stop calm-move" d="${p.move}"/>${tickG}<path class="calm-end calm-end-move" d="${p.end}"/>`;
}

/**
 * The empty button spread for its times (calm.js): a pill like the clip; left = a new take by itself (to the first
 * catch: at once, beyond: the countdown), right beyond its catch = the stillness until the end; a tick per second, the
 * catches as short bars (shown faintly where the pill has not reached yet); no numbers, no symbols (21.11., user).
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
  return out.join('');
}

/**
 * The halo round the take while Similar is open (21.11., user): how far it looks in each respect – a band beside each
 * arc, the wider the farther (v x a outside their arcs; wer, Zeit, Ort above the line). Pale where it waits for models.
 * 26.11. (user asked what the pale blue arcs and the doubled arcs are for): a band is drawn only for a respect that
 * was set – as Similar looks unless told otherwise (similar-range.js wideOpen) nothing lies beside the take's own arcs.
 */
function haloSvg(range, L) {
  const usual = wideOpen(), r = { ...usual, ...range }, s = L.scale || 1, out = [];
  for (const [k, [a, b]] of Object.entries(SECTORS)) {
    if (r[k] === usual[k]) continue;
    const top = ['w', 't', 'o'].includes(k), off = top ? L.lineOff + 19 * L.k * s : 15 * L.k * s;
    const w = (2 + (r[k] / (STEPS[k] - 1)) * 9) * L.k;
    out.push(`<path class="halo${READY[k] ? '' : ' later'}" d="${pathOf(curve(L, a + 4, b - 4, off + w / 2))}" stroke-width="${f1(w)}"/>`);
  }
  return out.join('');
}

/**
 * The rings with sectors over the take, where the range is set (21.11., user): a sector per respect where its arc is,
 * a ring per step from exact (inside) to wide (outside); filled up to the step chosen. Tap a ring = that step.
 */
export function rangeSvg(range, L) {
  const r = { ...wideOpen(), ...range }, R = Math.min(L.rx, L.ry) * 0.94 - 24 * L.k, r0 = R * 0.2, out = [];
  const at = (rad, deg) => polar(L.cx, L.cy, rad, deg).map(f1).join(' ');
  const ring = (r1, r2, a, b) => `M${at(r2, a)}A${f1(r2)} ${f1(r2)} 0 0 1 ${at(r2, b)}L${at(r1, b)}A${f1(r1)} ${f1(r1)} 0 0 0 ${at(r1, a)}Z`;
  out.push(`<circle class="range-back" cx="${f1(L.cx)}" cy="${f1(L.cy)}" r="${f1(R + 28 * L.k)}"/>`);
  for (const [k, [a, b]] of Object.entries(SECTORS)) {
    const n = STEPS[k];
    for (let i = 0; i < n; i++) {
      const r1 = r0 + ((R - r0) * i) / n, r2 = r0 + ((R - r0) * (i + 1)) / n;
      out.push(`<path class="range-ring${i <= r[k] ? ' on' : ''}${READY[k] ? '' : ' later'}" data-role="range:${k}:${i}" d="${ring(r1 + 1, r2 - 1, a + 2, b - 2)}"/>`);
    }
    const [x, y] = polar(L.cx, L.cy, R + 16 * L.k, (a + b) / 2); // its sign just outside, where its arc of the take is
    out.push(`<text class="range-sign" x="${f1(x)}" y="${f1(y)}">${SIGN[k]}</text>`);
  }
  out.push(`<circle class="range-take" cx="${f1(L.cx)}" cy="${f1(L.cy)}" r="${f1(r0 * 0.34)}"/>`);
  return out.join('');
}

/** The SVG text of the take. data: { thumbs: { id: url }, thumbOf(take) → url (app.js: cut and joined takes too), buttonPic, cut (0…1 past the widest), split, calm, timers, auto (calm.js: it starts anew by itself), meter (calm.js: a ring inside the button shows motion now) } */
export function takeSvg(st, L, data = {}) {
  const out = [];
  const line = st.lines.at(-1), older = st.lines.length - 1;
  // the take in the button chosen (nothing else is): a tinted ring of 18 px around the window (22.11., user)
  if (L.scale && !L.full && st.rec === 'idle' && st.at < (line?.takes.length ?? 0) && st.chosenLine == null && !st.sel) out.push(`<path class="chosen-rim" fill-rule="evenodd" d="${outline(L, 18 * L.k)} ${outline(L, 0)}"/>`);
  if (L.scale && !L.full) out.push(`<path class="focus-edge" d="${outline(L)}"/>`);
  if (st.similar !== 'closed' && st.similar !== 'full' && !L.full && data.range) out.push(haloSvg(data.range, L)); // how far Similar looks, in each respect (21.11.)
  if (data.series && st.similar !== 'full' && !L.full) { // the series' bubble at the end of the line (21.11.): spread or tap = their cloud
    const [x, y] = edge(L, 25, L.lineOff), rr = 15 * L.k; // on the line, right of the button (where no take lies yet)
    out.push(`<g class="kind-dot" data-role="kinds:series"><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}"/><text x="${f1(x)}" y="${f1(y - 3 * L.k)}">—</text><text class="n" x="${f1(x)}" y="${f1(y + 7 * L.k)}">${data.series}</text></g>`);
  } // only the inside is seen (20.11., user): the picture itself is clipped to the window (app.js)
  // chosen = a slightly tinted ground, one colour for all (22.11., user): a band behind the line, as wide as its takes
  const band = (d, w) => `<path class="chosen-band" d="${d}" stroke-width="${f1(w)}"/>`;
  const sc = L.scale || 1;
  for (const a of arcsOf(L, older)) {
    if (a.kind) {
      const on = st.strands[a.kind];
      out.push(`<path class="strand ${on ? 'on' : 'off'}${st.rec === 'recording' && on ? ' live' : ''}" d="${a.d}"/><path class="hit" data-role="${a.id}" d="${a.d}"/>`);
    } else if (a.id === 'line') {
      if (st.chosenLine === older) out.push(band(a.d, 2 * 15 * L.k * sc + 18));
      out.push(`<path class="line" d="${a.d}"/><path class="hit" data-role="line" d="${a.d}"/>`);
    } else {
      const i = Number(a.id.split(':')[1]), n = older - 1 - i;
      if (st.chosenLine === n) out.push(band(a.d, 10 * L.k * sc + 12));
      out.push(`<path class="old" d="${a.d}"/><path class="hit thin" data-role="old:${n}" d="${a.d}"/>`);
    }
  }
  if (st.strands.a && L.scale) out.push(soundSvg(L)); // the level on the audio arc (21.11.), its pieces set by level.js
  if (data.flow?.on && !L.full) out.push(flowSvg(L, data.flow)); // sound → context by Whisper (26.11.)
  if (older > 3) { const [x, y] = edge(L, 0, L.lineOff - 34 * L.k); out.push(`<text class="more" x="${f1(x)}" y="${f1(y)}">+${older - 3}</text>`); }
  out.push('<defs>');
  const slots = lineSlots(L, line.takes.length + (st.rec !== 'idle' ? 1 : 0), st.at, data.lineShift ?? 0);
  const thumbOf = (t) => ({ cx: t.x, cy: t.y, rx: t.r * Math.min(1, L.aspect), ry: t.r * Math.min(1, 1 / L.aspect), n: L.n }); // a take on the line: the window's form (20.11.)
  for (const s of slots) out.push(`<clipPath id="c${s.i}"><path d="${outline(thumbOf(s))}"/></clipPath>`);
  out.push(`<clipPath id="cb"><circle cx="${f1(L.button.x)}" cy="${f1(L.button.y)}" r="${f1(Math.max(0, L.button.r - 3))}"/></clipPath></defs>`);
  const picOf = (t) => (t ? data.thumbOf?.(t) ?? data.thumbs?.[t.id] ?? null : null); // a take's small picture (app.js thumbOf: also after a cut or a join, 26.11.)
  for (const s of slots) {
    const take = line.takes[s.i], pic = take ? picOf(take) : data.buttonPic; // no take yet: the one that runs or waits (seen while an earlier one is in the button)
    const T = thumbOf(s), d = outline(T);
    out.push(`<g data-role="take:${s.i}"><path class="thumb" d="${d}"/>${pic ? `<image href="${esc(pic)}" x="${f1(s.x - T.rx)}" y="${f1(s.y - T.ry)}" width="${f1(2 * T.rx)}" height="${f1(2 * T.ry)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${s.i})"/>` : ''}<path class="thumb-edge" d="${d}"/></g>`);
  }
  const live = st.at >= line.takes.length;
  const near = Math.max(0, Math.min(line.takes.length, Math.round(st.at - (data.lineShift ?? 0)))); // the take the pulled line would rest on
  const b = L.button, pic = (data.lineShift ? near >= line.takes.length : live) ? data.buttonPic : picOf(line.takes[data.lineShift ? near : st.at]);
  if (st.wide > 0.02) {
    const w = wideButton(L, st.wide, line.takes[st.at], st.wideMs, st.wideZoom ?? 1), r = w.h / 2;
    const d = `M${f1(w.x + r)} ${f1(w.y)}H${f1(w.x + w.w - r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(w.x + w.w - r)} ${f1(w.y + w.h)}H${f1(w.x + r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(w.x + r)} ${f1(w.y)}Z`;
    const tk = line.takes[st.at], c = Math.max(0, Math.min(1, data.cut ?? 0)), tl = timelineSvg(tk?.heard ? { ...tk, context: [tk.context, tk.heard].filter(Boolean).join(' ') } : tk, st.wideMs, L, w, pic, st.wideZoom ?? 1); // the words from the sound where they were said (26.11.)
    if (c > 0) { // spread past the widest (21.11.): the mark bends – its left side into the round end of the left half, its right side into the right half's – and the halves draw apart, on into two bubbles
      const g = c * BOW * r, bow = c * r, m = b.x;
      const left = pieceOf(w.x - g, m - g, w.y, w.h, r, bow), right = pieceOf(m + g, w.x + w.w + g, w.y, w.h, bow, r);
      out.push(`<clipPath id="cwl"><path d="${left}"/></clipPath><clipPath id="cwr"><path d="${right}"/></clipPath><path class="button wide" d="${left}${right}"/>`,
        `<g clip-path="url(#cwl)"><g transform="translate(${f1(-g)} 0)">${tl}</g></g><g clip-path="url(#cwr)"><g transform="translate(${f1(g)} 0)">${tl}</g></g>`,
        `<path class="button wide-edge" d="${left}${right}"/>`,
        `<path class="cut-bow" d="M${f1(m - g - bow)} ${f1(w.y)}A${f1(bow)} ${f1(r)} 0 0 1 ${f1(m - g - bow)} ${f1(w.y + w.h)}M${f1(m + g + bow)} ${f1(w.y + w.h)}A${f1(bow)} ${f1(r)} 0 0 1 ${f1(m + g + bow)} ${f1(w.y)}"/>`,
        `<path class="hit" data-role="button" d="${d}"/>`);
    } else {
      out.push(`<clipPath id="cw"><path d="${d}"/></clipPath><path class="button wide" d="${d}"/><g clip-path="url(#cw)">${tl}</g>`);
      out.push(`<line class="playhead" x1="${f1(b.x)}" x2="${f1(b.x)}" y1="${f1(w.y - 4)}" y2="${f1(w.y + w.h + 4)}"/>`);
      out.push(`<path class="button wide-edge" d="${d}"/><path class="hit" data-role="button" d="${d}"/>`);
    }
  } else if (data.split) {
    out.push(splitSvg(data.split, L));
  } else if (data.timers) {
    out.push(timerSvg(data.timers, L), `<g data-role="button" class="button-g idle">${symbol(st, b.x, b.y, b.r, true)}</g>`);
  } else {
    if (data.calm) out.push(calmSvg(data.calm, L));
    out.push(`<g data-role="button" class="button-g ${st.rec}${data.auto && live ? ' auto' : ''}"><circle class="button" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r)}"/>`);
    if (pic && (st.rec !== 'idle' || !live)) out.push(`<image href="${esc(pic)}" x="${f1(b.x - b.r)}" y="${f1(b.y - b.r)}" width="${f1(2 * b.r)}" height="${f1(2 * b.r)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cb)" class="button-pic"/>`);
    if (data.meter && live) out.push(`<circle class="motion" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r - 4 * L.k)}"/>`); // motion now, set by calm.js every 0.1 s
    out.push(`${symbol(st, b.x, b.y, b.r, live, data.playing)}<circle class="button-ring" cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(b.r + 5 * L.k)}"/></g>`);
  }
  if (data.ranging && st.similar !== 'closed') out.push(rangeSvg(data.range, L)); // the rings with sectors, over the take (21.11.)
  if (data.fan && st.lines.length > 1) out.push(fanSvg(st, L, data)); // the older lines fanned out above the button (22.11.)
  return out.join('');
}

export const FAN = Object.freeze({ row: 56, thumb: 22, step: 50, label: 96, side: 10 }); // px at k = 1
/** How many rows of the fan fit above the button. */
export const fanRows = (L) => Math.max(1, Math.floor((L.button.y - L.button.r - 18 * L.k) / (FAN.row * L.k)));
/** How far a row of the fan can be pushed to the left (px): until its last take stands at the row's right end. */
export function fanReach(L, takes, w) {
  const k = L.k, room = w - 2 * FAN.side * k - FAN.label * k - 12 * k;
  return Math.max(0, takes * FAN.step * k - room);
}
/**
 * The older lines fanned out (22.11., user): a row each above the button, the newest older one nearest. 26.11. (user:
 * "horizontal scrollen und auswählen, indem ich da wirklich etwas sehen kann"): a row spans the screen, says in front
 * what the line is about (line.js lineLabel), shows its takes larger, in the window's form, and is pushed sideways with
 * a finger to see them all (data.fanShift[n] px); a take tapped = that line at the button, standing on that take
 * (data-role fan:n:j), the row's label tapped = the line, ready for a new take (fan:n). Phone 390 × 844: 3 rows of
 * 56 px, 5 takes of 44 px in sight; ↑ ↓ on the rows shows older or newer lines (data.fanOff).
 */
export function fanSvg(st, L, data = {}) {
  const k = L.k, b = L.button, rows = fanRows(L), older = st.lines.length - 1, off = Math.min(data.fanOff ?? 0, Math.max(0, older - rows));
  const W = data.w ?? 2 * L.cx, out = [], defs = [], top = b.y - b.r - 10 * k - rows * FAN.row * k;
  const x0 = FAN.side * k, x1 = W - FAN.side * k, first = x0 + FAN.label * k + 8 * k + FAN.thumb * k;
  out.push(`<rect class="fan-back" x="0" y="${f1(top - 8 * k)}" width="100%" height="${f1(b.y - b.r - top + 8 * k)}"/>`);
  for (let i = 0; i < rows && off + i < older; i++) {
    const n = older - 1 - off - i, line = st.lines[n], cy = b.y - b.r - 10 * k - (i + 0.5) * FAN.row * k, h = (FAN.row - 6) * k;
    const shift = Math.max(0, Math.min(fanReach(L, line.takes.length, W), data.fanShift?.[n] ?? 0)), label = lineLabel(line);
    defs.push(`<clipPath id="fr${n}"><rect x="${f1(x0 + FAN.label * k + 4 * k)}" y="${f1(cy - h / 2)}" width="${f1(x1 - x0 - FAN.label * k - 6 * k)}" height="${f1(h)}" rx="${f1(8 * k)}"/></clipPath>`);
    out.push(`<g data-role="fan:${n}"><rect class="fan-row" x="${f1(x0)}" y="${f1(cy - h / 2)}" width="${f1(x1 - x0)}" height="${f1(h)}" rx="${f1(h / 2)}"/>`,
      `<text class="fan-label${label ? '' : ' none'}" x="${f1(x0 + 14 * k)}" y="${f1(cy)}" style="font-size:${f1(13 * k)}px">${esc(clip(label || '·', 11))}</text><text class="fan-count" x="${f1(x0 + 14 * k)}" y="${f1(cy + 15 * k)}" style="font-size:${f1(10 * k)}px">${line.takes.length}${dayOf(line) ? ` · ${dayOf(line)}` : ''}</text></g>`,
      `<g clip-path="url(#fr${n})">`);
    line.takes.forEach((t, j) => {
      const x = first + j * FAN.step * k - shift;
      if (x < x0 + FAN.label * k - FAN.thumb * k || x > x1 + FAN.thumb * k) return; // out of sight
      const T = { cx: x, cy, rx: FAN.thumb * k * Math.min(1, L.aspect), ry: FAN.thumb * k * Math.min(1, 1 / L.aspect), n: L.n }, d = outline(T), pic = data.thumbOf?.(t) ?? data.thumbs?.[t.id];
      defs.push(`<clipPath id="f${n}-${j}"><path d="${d}"/></clipPath>`);
      out.push(`<g data-role="fan:${n}:${j}"><path class="thumb" d="${d}"/>${pic ? `<image href="${esc(pic)}" x="${f1(x - T.rx)}" y="${f1(cy - T.ry)}" width="${f1(2 * T.rx)}" height="${f1(2 * T.ry)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#f${n}-${j})"/>` : ''}<path class="thumb-edge" d="${d}"/></g>`);
    });
    out.push('</g>');
    if (fanReach(L, line.takes.length, W) - shift > 1) out.push(`<path class="fan-more" d="M${f1(x1 - 12 * k)} ${f1(cy - 5 * k)}l${f1(5 * k)} ${f1(5 * k)}l${f1(-5 * k)} ${f1(5 * k)}"/>`); // more to the right
    if (shift > 1) out.push(`<path class="fan-more" d="M${f1(x0 + FAN.label * k + 1 * k)} ${f1(cy - 5 * k)}l${f1(-5 * k)} ${f1(5 * k)}l${f1(5 * k)} ${f1(5 * k)}"/>`);
  }
  if (off + rows < older) out.push(`<text class="more" x="${f1(b.x)}" y="${f1(top - 12 * k)}">↑ ${older - off - rows}</text>`);
  return `<defs>${defs.join('')}</defs>${out.join('')}`;
}
/** When a line was made (26.11., user: the lines stacked by time): its last take's day – heute · gestern (Intl, any language) · 24.11. · 24.11.25. */
function dayOf(line) {
  const t = line?.takes?.at(-1)?.t;
  if (!(t > 1e11)) return ''; // no clock time (an old or a guest line)
  const d = new Date(t), now = new Date(), day = (x) => Math.floor((x - x.getTimezoneOffset() * 6e4) / 864e5), ago = day(now) - day(d);
  if (ago === 0 || ago === 1) return new Intl.RelativeTimeFormat(globalThis.document?.documentElement?.lang || 'de', { numeric: 'auto' }).format(-ago, 'day'); // heute · gestern, in the app's language
  const dm = `${d.getDate()}.${d.getMonth() + 1}.`;
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}${String(d.getFullYear()).slice(2)}`;
}
/** A text cut to n letters, with … when something was cut. */
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/**
 * The chips of the take now, bent along the bottom arc inside the window. A word with its own time (21.11.): a thin bar
 * at its bottom shows where in the take it is said (len = the take's ms), and it lights up while the take plays there
 * (atMs). → HTML
 */
export function nowHtml(words, L, offers = [], { len = 0, atMs = null } = {}) {
  const widths = words.map((w) => chipWidth(w.text, L.k * 0.95));
  return words.map((w, i) => {
    const s = nowChipSpot(L, widths, i), timed = w.from != null && len > 0;
    const said = timed && atMs != null && atMs >= w.from && atMs <= w.to;
    const bar = timed ? `<i class="when" style="left:${((100 * w.from) / len).toFixed(1)}%;width:${Math.max(4, (100 * (w.to - w.from)) / len).toFixed(1)}%"></i>` : '';
    return `<span class="chip ${w.tone} in${offers.includes(w.text) ? ' offer' : ''}${timed ? ' timed' : ''}${said ? ' said' : ''}${w.heard ? ' heard' : ''}" data-role="chip:${esc(w.text)}" style="left:${f1(s.x)}px;top:${f1(s.y)}px;width:${widths[i]}px;height:${f1(26 * L.k)}px;font-size:${f1(13 * L.k)}px;transform:translate(-50%,-50%) rotate(${f1(s.rot)}deg)">${esc(w.text)}${bar}</span>`;
  }).join('');
}

/**
 * The series row: bubbles, takes, chips, and a gap at every spot something can be written at (17.11.): in front of the
 * first element (of the row and of every bubble), behind every element, at the end. A tap on a gap, a take or a bubble
 * puts the caret there; what is typed shows at the caret. caret: { at: path | null, how: 'after' | 'in' | 'first' } | null
 * (null = at the end). open: where a "(" was typed (21.11.), shown until its ")". → HTML
 */
export function rowHtml(row, { caret = null, typing = '', offers = [], all = false, waiting = false, on = false, open, join = false } = {}) {
  const same = (a, b) => (a ?? []).length === (b ?? []).length && (a ?? []).every((x, i) => x === b[i]);
  const here = (at, how) => on && caret && caret.how === how && same(caret.at, at);
  // 22.11. (user): a "(" just typed opens a pastel bubble at once, from there to the end of its level, until ")"
  const level = open ? (open.how === 'after' ? open.at.slice(0, -1) : open.at) : null, from = open ? (open.how === 'after' ? open.at.at(-1) + 1 : 0) : 0;
  const atOpen = Boolean(open && on && caret && caret.how === open.how && same(caret.at, open.at));
  // the word being typed: before the caret, already in the colour of the take it goes into (22.11., user)
  const takes = [];
  const walk = (n) => (n.take ? takes.push(n) : n.children?.forEach(walk));
  row.forEach(walk);
  const within = (p, q) => p.length >= q.length && q.every((x, i) => x === p[i]);
  const ordinal = () => {
    if (!caret) return takes.length;
    const at = caret.at ?? [], inside = takes.filter((t) => within(t.at, at));
    if (caret.how === 'first') return at.length ? takes.indexOf(inside[0] ?? takes[0]) : 0;
    const last = inside.at(-1);
    return last ? takes.indexOf(last) + (join && caret.how === 'after' ? 0 : 1) : takes.length;
  };
  const tone = ['now', 'next'][ordinal()] ?? 'later';
  const typed = `<span class="chip ${tone} typing">${esc(typing) || '&nbsp;'}</span>`;
  const caretHtml = (cls = '') => `${typing ? typed : ''}<i class="gap caret${cls}"></i>`;
  const gap = (at, how = 'after') => {
    const mine = here(at, how) && !atOpen;
    return `${mine && typing ? typed : ''}<i class="gap${mine ? ' caret' : ''}" data-role="gap:${how}:${(at ?? []).join('.')}"></i>`;
  };
  const hidden = (n) => !all && (n.take ? n.i === 0 : n.children.every(hidden)); // the take now shows inside the window; the row: what comes
  const chip = (w) => `<span class="chip ${w.tone}${offers.includes(w.text) ? ' offer' : ''}">${esc(w.text)}</span>`;
  const edge = (k) => (k == null ? '' : ` style="--nc:${NEST_COLORS[k % NEST_COLORS.length]}"`); // the edge says which nesting (20.11.)
  /** A level's elements, each with its gap behind; the open bracket wraps the rest of its level. */
  const list = (nodes, path) => {
    const items = nodes.map((c) => node(c) + (c.at && !hidden(c) ? gap(c.at) : ''));
    if (!open || !same(path, level)) return items.join('');
    return `${items.slice(0, from).join('')}<span class="bubble opening">${atOpen ? caretHtml() : ''}${items.slice(from).join('')}</span>`;
  };
  const node = (n) => {
    if (hidden(n)) return '';
    if (n.take) {
      const words = n.words.map(chip).join('');
      return `<span class="take ${n.tone}"${n.at ? ` data-role="xt:${n.at.join('.')}"` : ''}>${n.nest != null ? `<span class="bubble inner"${edge(n.nest)}>${words}</span>` : words}</span>`;
    }
    const tail = here(n.at, 'in') ? caretHtml() : '';
    const head = (n.head ?? []).map(chip).join('');
    if (n.sticky) return `<span class="bubble d0 sticky" data-role="bubble:">${head}${list(n.children, n.at)}${tail}</span>`;
    // the bubble begins and ends at its brackets: the word in front stands before it (Begriff1 (Begriff2 Begriff3), 22.11.)
    return `<span class="head"${edge(n.nest)}>${head}</span><span class="bubble d${Math.min(3, n.depth)}"${edge(n.nest)} data-role="bubble:${(n.at ?? []).join('.')}">${gap(n.at, 'first')}${list(n.children, n.at)}${tail}</span>`;
  };
  const top = list(row, []);
  const atEnd = on && !caret;
  const wait = waiting ? '<span class="chip offer wait" data-role="context"></span>' : ''; // one's own password word: empty, breathing
  return `${gap([], 'first')}${top}${wait}${atEnd && typing ? typed : ''}<i class="gap end${atEnd ? ' caret' : ''}" data-role="gap:end:"></i><i class="gap tail" data-role="gap:end:"></i>`;
}

/**
 * The flow sound → context (26.11.): a wave across the seam of the audio and the context arc. Loading the model: dashed,
 * filled as far as it came · ready: solid · could not load: grey. A tap on it switches it off.
 */
export function flowSvg(L, flow) {
  const pts = flowPoints(L), d = pathOf(pts), cls = flow.status === 'ready' ? 'ready' : flow.status === 'failed' ? 'failed' : 'loading';
  const done = flow.status === 'loading' && flow.progress > 0 ? `<path class="flow-wave done" d="${pathOf(pts.slice(0, Math.max(2, Math.round(pts.length * Math.min(1, flow.progress)))))}"/>` : '';
  return `<g class="flow ${cls}"><path class="flow-wave" d="${d}"/>${done}<path class="hit" data-role="flow:a>x" d="${d}"/></g>`;
}

/** An arc path for the hint layer (the gesture shown by a pale point). */
/** The sound level's pieces along the audio arc, newest at its upper end (21.11.; level.js sets their width every 0.1 s). */
export function soundSvg(L) {
  const pts = strandPoints(L, 'a'), gap = 0.004, out = [];
  for (let i = 0; i < PIECES; i++) out.push(`<path d="${pathOf(pieceOfPoints(pts, i / PIECES + gap, (i + 1) / PIECES - gap))}"/>`);
  return `<g class="sound">${out.join('')}</g>`;
}

export const hintArc = (L, a, b) => pathOf(curve(L, a, b, 7 * L.k));
