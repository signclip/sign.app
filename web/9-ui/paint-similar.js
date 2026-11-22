// paint-similar.js — draws Similar (similar-view.js): the cloud, the single view, and the selection views around it.
//
// Purpose:   the cloud's tiles lie nearest the take where they match best; a tile shows its small picture and up to
//            three of its chips, in the window's form (21.11.). The single view shows one result large (it plays), the take stays beside it. The
//            selection views sit at the edges, pale until tapped: initial letters on the left edge, the date on the right
//            edge (a bar from new to old; drag over it = the span), and along the bottom the strands v · x · a and
//            @ name · sharing point · spot. An open selection shows its choices; a chosen one is filled.
// Depends:   browser; similar-view.js
// Test:      positions and filters in tests/ui.test.mjs; this needs a browser.
// Limits:    ≤ 40 tiles; ≤ 30 initials; ≤ 12 names / sharing points / spots shown (the rest by scrolling the strip).

import { cloudSpots, initialsOf } from './similar-view.js';
import { bundlesOf, LADDERS } from './similar-zoom.js';
import { outline, curve, pathOf } from './form.js';
import { ARCS, GAP } from './layout.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (n) => `${Number(n).toFixed(1)}px`;
const f1 = (n) => Number(n).toFixed(1);

const ICON = { v: '◖', x: '◡', a: '◗', initial: 'A', date: '▮', name: '@', sharing: '●', spot: '◎', who: '@' };
const KIND_SIGN = { search: '?', choice: '#', series: '—', template: '_', ask: '↗' }; // chain kinds in the cloud (21.11.): the schema's own signs

/** A tile in the window's form (21.11.): s = its square, narrower on one side as the window; the outline kept per size. */
const forms = new Map();
export function tileForm(s, L) {
  const a = L.aspect ?? 1, w = s * Math.min(1, a), h = s * Math.min(1, 1 / a), key = `${w.toFixed(1)} ${h.toFixed(1)} ${L.n}`;
  if (!forms.has(key)) { if (forms.size > 64) forms.clear(); forms.set(key, outline({ cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, n: L.n ?? 2 })); }
  return { w, h, d: forms.get(key) };
}

/** HTML of Similar. entries: [{ key, thumb, words, t, person, sharing, spot }] (ordered, filtered) · L: take layout */
export function similarHtml(st, entries, L, { names = [], sharing = [], spots = [], range = null, compare = null, picked = null, search = null, reach = [], me = '', kindCloud = null, searches = 0, asks = 0 } = {}) {
  if (st.similar === 'closed' || !L.similarBox) return '';
  const box = L.similarBox, f = st.filters, out = [];
  // 21.11.: no row of signs at the top any more – each metadata is zoomed open where it lies (similar-zoom.js): a pale
  // grip at each edge shows the zone (a tap does the same); who and spot open a strip at the top to choose from.
  const head = (['who', 'spot'].includes(f.open) ? 52 : 12) * L.k;
  const inner = { x: box.x + 30 * L.k, y: box.y + head, w: box.w - 60 * L.k, h: box.h - head - 8 * L.k };
  if (st.similar === 'single' && L.singleBox) {
    const d = L.singleBox, e = (picked?.key === st.pick ? picked : null) ?? entries.find((x) => x.key === st.pick); // picked: still there when typing filters it out
    const clip = outline(L.single, 0, d.x, d.y); // the take's form (20.11.)
    out.push(`<div class="single" style="left:${px(d.x)};top:${px(d.y)};width:${px(d.w)};height:${px(d.h)};clip-path:path('${clip}')" data-role="single"><svg class="single-edge" viewBox="0 0 ${d.w.toFixed(1)} ${d.h.toFixed(1)}"><path d="${clip}"/></svg>${compare ? `<div class="who"><b>${esc(compare.label)}</b><small>${esc(compare.id)}</small>${compare.n > 1 ? `<i>${Array.from({ length: compare.n }, (_, k) => (k === compare.i ? '●' : '○')).join('')}</i>` : ''}</div>` : ''}<div class="tags"${st.dstrands?.x === false ? ' hidden' : ''}>${(e?.words ?? []).slice(0, 4).map((w) => `<span class="chip tag">${esc(w)}</span>`).join('')}</div></div>`);
    out.push(singleStrands(L, st.dstrands ?? {}, { v: Boolean(e?.at || e?.thumb || e?.pieces), x: Boolean(e?.words?.length), a: Boolean(e?.sound) }));
  } else {
    const groups = bundlesOf(entries, f);
    if (groups) for (const sp of cloudSpots(groups.length, inner, { beside: L.wide && !L.full, k: L.k })) { // bundled (21.11.): a pastel bubble, up to four pictures, how many
      const g = groups[sp.i], pics = g.entries.filter((e) => e.thumb).slice(0, 4), q = Math.max(8, (sp.s - 30) / 2); // 2 × 2 under the name
      out.push(`<div class="bundle" data-role="bundle:${sp.i}" style="left:${px(sp.x - sp.s / 2)};top:${px(sp.y - sp.s / 2)};width:${px(sp.s)};height:${px(sp.s)}"><b>${esc(g.label)}</b>${pics.map((e) => `<img src="${esc(e.thumb)}" alt="" style="width:${px(q)};height:${px(q)}">`).join('')}<i>${g.entries.length}</i></div>`);
    }
    else for (const sp of cloudSpots(entries.length, inner, { beside: L.wide && !L.full, k: L.k })) {
      const e = entries[sp.i], t = tileForm(sp.s, L); // the window's form (21.11.): its aspect and its corners
      out.push(`<div class="tile${e.key === st.pick ? ' picked' : ''}${e.kind ? ` chain-${e.kind}` : ''}" data-role="tile:${sp.i}" style="left:${px(sp.x - t.w / 2)};top:${px(sp.y - t.h / 2)};width:${px(t.w)};height:${px(t.h)};clip-path:path('${t.d}');--r:${(L.round ?? 1).toFixed(2)}">${e.thumb ? `<img src="${esc(e.thumb)}" alt="">` : ''}${e.kind ? `<em class="sign">${KIND_SIGN[e.kind] ?? ''}</em>` : ''}<div class="tags">${(e.words ?? []).slice(0, 3).map((w) => `<span class="chip tag">${esc(w)}</span>`).join('')}</div><svg class="tile-edge" viewBox="0 0 ${t.w.toFixed(1)} ${t.h.toFixed(1)}"><path d="${t.d}"/></svg></div>`);
    }
    if (!entries.length) out.push(`<div class="empty" style="left:${px(inner.x)};top:${px(inner.y + inner.h / 2 - 20)};width:${px(inner.w)}">∅</div>`);
  }
  // the grips: where each zone is (pale; filled while it is open), with its step as dots; the strands at the bottom
  const g = f.group, dots = (z) => (g?.by === z ? `<i>${LADDERS[z].map((_, i) => (i < g.level ? '●' : '○')).join('')}</i>` : '');
  const grip = (z, x, y, end = false) => `<span class="grip${f.open === z || g?.by === z ? ' on' : ''}" data-role="grip:${z}" style="left:${px(x)};top:${px(y)}${end ? ';transform:translateX(-100%)' : ''}">${ICON[z]}${dots(z)}</span>`;
  out.push(grip('initial', box.x + 2 * L.k, box.y + box.h / 2 - 14 * L.k), grip('date', box.x + box.w - 2 * L.k, box.y + box.h / 2 - 14 * L.k, true), grip('spot', box.x + box.w / 2 - 13 * L.k, box.y + 2 * L.k));
  if (st.sel === 'cloud' && st.similar !== 'single') out.unshift(`<div class="cloud-chosen" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.w)};height:${px(box.h)}"></div>`); // the cloud chosen: its ground tinted, behind the tiles (22.11.)
  if (st.sel === 'element' && st.similar === 'single' && L.single) { // the element chosen: a tinted ring of 18 px around its window (22.11.)
    const pad = 18 * L.k, S = L.single, x0 = S.cx - S.rx - pad, y0 = S.cy - S.ry - pad;
    out.unshift(`<svg class="single-chosen" style="left:${px(x0)};top:${px(y0)};width:${px(2 * (S.rx + pad))};height:${px(2 * (S.ry + pad))}"><path fill-rule="evenodd" d="${outline(S, pad, x0, y0)} ${outline(S, 0, x0, y0)}"/></svg>`);
  }
  // 21.11. (user): what counts as similar = the strands that are on in the take; wer and the rest = the rings with sectors
  if (search) out.push(`<span class="chip pick on search-on" data-role="search-off" style="position:absolute;left:${px(box.x + 40 * L.k)};top:${px(box.y + 2 * L.k)}">? ${esc(search.words.join(' '))}</span>`); // a similar opened: its words; pulled down = the window's again (21.11.)
  else if (kindCloud) out.push(`<span class="chip pick on search-on" data-role="kinds-off" style="position:absolute;left:${px(box.x + 40 * L.k)};top:${px(box.y + 2 * L.k)}">${KIND_SIGN[kindCloud] ?? ''} · ${entries.length}</span>`); // a kind's own cloud; pulled down = the takes again
  else if (searches && st.similar !== 'single') out.push(`<span class="kind-bubble in-similar" data-role="kinds:search" style="position:absolute;left:${px(box.x + 40 * L.k)};top:${px(box.y + 2 * L.k)}"><em>?</em><b>${searches}</b></span>`); // the saved similar: a bubble at the top, spread or tap = their cloud
  if (asks && !search && !kindCloud && st.similar !== 'single') out.push(`<span class="kind-bubble in-similar ask" data-role="kinds:ask" style="position:absolute;left:${px(box.x + (searches ? 96 : 40) * L.k)};top:${px(box.y + 2 * L.k)}"><em>↗</em><b>${asks}</b></span>`); // requests to pass on my takes: their own cloud, ↑ / ↓ on the button decides (21.11.)
  if (f.open === 'initial') {
    const letters = initialsOf(entries.length ? entries : [], f.order.initial).slice(0, 30);
    out.push(`<div class="letters" style="left:${px(box.x + 30 * L.k)};top:${px(box.y + 14 * L.k)};height:${px(box.h - 44 * L.k)}"><em data-role="order:initial">${f.order.initial === 'az' ? '↓' : '↑'}</em>${letters.map((c) => `<span class="${(f.value.initial ?? []).includes(c) ? 'on' : ''}" data-role="initial:${esc(c)}">${esc(c)}</span>`).join('')}</div>`);
  }
  if (f.open === 'date') {
    const [a, b] = range ?? [0, 1];
    out.push(`<div class="datebar" data-role="datebar" style="left:${px(box.x + box.w - 52 * L.k)};top:${px(box.y + 14 * L.k)};height:${px(box.h - 44 * L.k)}"><b style="top:${(a * 100).toFixed(1)}%;height:${((b - a) * 100).toFixed(1)}%"></b><em data-role="order:date">${f.order.date === 'new' ? '↓' : '↑'}</em></div>`);
  }
  if (f.open === 'who') out.push(whoRings(f, box, L, reach, me)); // wer as rings round me (21.11.), not a strip
  const list = f.open === 'spot' ? spots.map((x) => ({ ...x, kind: 'spot' })) : null;
  if (list) out.push(`<div class="strip" style="left:${px(box.x + 8 * L.k)};width:${px(box.w - 16 * L.k)};top:${px(box.y + 18 * L.k)}">${list.slice(0, 16).map((x) => `<span class="chip pick${(f.value[x.kind] ?? []).includes(x.id) ? ' on' : ''}" data-role="value:${x.kind}:${esc(x.id)}">${esc(x.label)}</span>`).join('')}</div>`);
  return out.join('');
}

/**
 * wer as rings round me (21.11., user): inside me · my own sharing point · where I write with others – groups as
 * yellow bubbles with their persons in them · all I can see (read only), pale. The rings are the steps of the Weite
 * (tap one); a bubble tapped = that sharing point, a person tapped = that person.
 */
function whoRings(f, box, L, reach, me) {
  const R = Math.min(box.w, box.h) / 2 - 10 * L.k, cx = box.x + box.w / 2, cy = box.y + box.h / 2 + 6 * L.k, w = f.range?.w ?? 3;
  const radii = [0.2, 0.44, 0.74, 1].map((x) => x * R), out = [];
  const svg = radii.map((r, i) => i).reverse().map((i) => `<circle class="who-ring${i <= w ? ' on' : ''}" data-role="who-ring:${i}" cx="${f1(R)}" cy="${f1(R)}" r="${f1(radii[i])}"/>`).join('');
  out.push(`<svg class="who-rings" style="left:${px(cx - R)};top:${px(cy - R)};width:${px(2 * R)};height:${px(2 * R)}" viewBox="0 0 ${f1(2 * R)} ${f1(2 * R)}">${svg}</svg>`);
  out.push(`<span class="who-me" style="left:${px(cx)};top:${px(cy)}">${esc((me || '').slice(0, 2) || 'ich')}</span>`);
  const groups = [reach.filter((x) => x.own), reach.filter((x) => !x.own && x.write), reach.filter((x) => !x.own && !x.write)];
  groups.forEach((list, ring) => {
    const mid = (radii[ring] + radii[ring + 1]) / 2, n = list.length, size = Math.min(radii[ring + 1] - radii[ring] - 6 * L.k, (2 * Math.PI * mid) / Math.max(n, 1) - 6 * L.k, 64 * L.k);
    list.forEach((x, i) => {
      const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / Math.max(n, 1) + ring * 0.4, bx = cx + mid * Math.cos(a), by = cy + mid * Math.sin(a);
      const chosen = (f.value.sharing ?? []).includes(x.name), persons = x.persons.slice(0, 4);
      out.push(`<div class="who-group${ring === 2 ? ' far' : ''}${chosen ? ' on' : ''}" data-role="value:sharing:${esc(x.name)}" style="left:${px(bx - size / 2)};top:${px(by - size / 2)};width:${px(size)};height:${px(size)}"><b>${esc(x.own ? '◉' : x.name)}</b>${persons.map((p) => `<i class="${(f.value.name ?? []).includes(p) ? 'on' : ''}" data-role="value:name:${esc(p)}">${esc(p.slice(0, 2))}</i>`).join('')}</div>`);
    });
  });
  return out.join('');
}

/**
 * The strands around the single view (20.11.), as around the take: picture left, context below, sound right. A tap
 * switches what one sees and hears of the result; a strand the result does not have is a faint dashed arc.
 * on: { v, x, a } · has: { v, x, a } → SVG over the screen (only the arcs take a finger)
 */
export function singleStrands(L, on, has) {
  const F = L.single, off = 9 * L.k;
  if (!F) return '';
  const arcs = ['v', 'x', 'a'].map((k) => {
    const d = pathOf(curve(F, ARCS[k][0] + GAP, ARCS[k][1] - GAP, off));
    const cls = !has[k] ? 'none' : on[k] ? 'on' : 'off';
    return `<path class="strand ${cls}" d="${d}"/><path class="hit" data-role="dstrand:${k}" d="${d}"/>`;
  }).join('');
  return `<svg class="dstrands" width="100%" height="100%">${arcs}</svg>`;
}
