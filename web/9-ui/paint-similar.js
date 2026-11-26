// paint-similar.js — draws Similar (similar-view.js): the cloud, the single view, and the four respects round it.
//
// Purpose:   the cloud's tiles lie nearest the take where they match best; a tile shows its small picture and up to
//            three of its chips, in the window's form (21.11.). The single view shows one result large (it plays) with
//            all its words along its lower edge, the take stays beside it. Round the cloud (26.11., user): letters on
//            the left edge, the date on the right, the spot at the top, who (sharing points with their persons) at the
//            bottom – each a pale grip until tapped or zoomed, then a rail along its edge: bars for letters and
//            calendar, a map for the spot, a strip of bubbles for who; the tiles keep away from the open rail
//            (similar-view.js cloudParts). One arrow at the head of the rail turns its order. Every element that
//            stays keeps its data-key, so morph.js changes it instead of making it anew.
// Depends:   browser; similar-view.js, similar-zoom.js, spot-map.js
// Test:      positions and filters in tests/ui.test.mjs; this needs a browser.
// Limits:    ≤ 40 tiles; a rail lists ≤ 24 values before it takes a coarser step; ≤ 6 persons shown in a sharing point's
//            bubble; ≤ 16 spots in the strip that stands in for the map.

import { cloudSpots, cloudParts } from './similar-view.js';
import { bundlesOf, LADDERS, railValues, periodLabel, inSpan } from './similar-zoom.js';
import { spotMapSvg } from './paint-over.js';
import { outline, curve, pathOf } from './form.js';
import { ARCS, GAP } from './layout.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (n) => `${Number(n).toFixed(1)}px`;
const f1 = (n) => Number(n).toFixed(1);

const ICON = { initial: 'A', date: '▮', spot: '◎', who: '@' };
const KIND_SIGN = { search: '?', choice: '#', series: '—', template: '_', ask: '↗' }; // chain kinds in the cloud (21.11.): the schema's own signs

/** A tile in the window's form (21.11.): s = its square, narrower on one side as the window; the outline kept per size. */
const forms = new Map();
export function tileForm(s, L) {
  const a = L.aspect ?? 1, w = s * Math.min(1, a), h = s * Math.min(1, 1 / a), key = `${w.toFixed(1)} ${h.toFixed(1)} ${L.n}`;
  if (!forms.has(key)) { if (forms.size > 64) forms.clear(); forms.set(key, outline({ cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, n: L.n ?? 2 })); }
  return { w, h, d: forms.get(key) };
}

/**
 * HTML of Similar. entries: [{ key, thumb, words, t, person, sharing, spot }] (ordered, filtered) · L: take layout ·
 * all: the results before any choice narrowed them (what the rails list) · lang: for the months' names
 */
export function similarHtml(st, entries, L, { compare = null, picked = null, search = null, reach = [], kindCloud = null, searches = 0, asks = 0, spotMap = null, spotBase = null, spots = [], all = null, lang = 'de', near = null } = {}) {
  if (st.similar === 'closed' || !L.similarBox) return '';
  const box = L.similarBox, f = st.filters, out = [], k = L.k, single = st.similar === 'single' && L.singleBox;
  const open = single ? null : f.open && f.open !== 'template' ? f.open : null;
  const parts = cloudParts(box, open, k), inner = parts.inner;
  if (single) {
    const d = L.singleBox, e = (picked?.key === st.pick ? picked : null) ?? entries.find((x) => x.key === st.pick); // picked: still there when typing filters it out
    const clip = outline(L.single, 0, d.x, d.y); // the take's form (20.11.)
    out.push(`<div class="single" style="left:${px(d.x)};top:${px(d.y)};width:${px(d.w)};height:${px(d.h)};clip-path:path('${clip}')" data-role="single"><svg class="single-edge" viewBox="0 0 ${d.w.toFixed(1)} ${d.h.toFixed(1)}"><path d="${clip}"/></svg>${compare ? `<div class="who"><b>${esc(compare.label)}</b><small>${esc(compare.id)}</small>${compare.n > 1 ? `<i>${Array.from({ length: compare.n }, (_, i) => (i === compare.i ? '●' : '○')).join('')}</i>` : ''}</div>` : ''}</div>`);
    // its words (26.11., user: "die Begriffe sehen"): all of them, along the lower edge of its window as the take's own lie in the take window – not cut by the window's form, a long row can be pushed sideways
    if (st.dstrands?.x !== false && (e?.words?.length || e?.heard?.length)) out.push(`<div class="single-words" data-key="single-words" style="left:${px(d.x)};top:${px(d.y + d.h - 38 * k)};width:${px(d.w)}">${(e.words ?? []).flatMap((w) => String(w).split(/\s+/)).filter((w, i, ws) => w && ws.indexOf(w) === i).map((w) => `<span class="chip tag">${esc(w)}</span>`).join('')}${(e.heard ?? []).map((w) => `<span class="chip tag heard">${esc(w)}</span>`).join('')}</div>`); // every word once, each its own chip; what was said in it with a wave (26.11.)
    out.push(singleStrands(L, st.dstrands ?? {}, { v: Boolean(e?.at || e?.thumb || e?.pieces), x: Boolean(e?.words?.length || e?.heard?.length), a: Boolean(e?.sound) }));
  } else {
    const groups = bundlesOf(entries, f, { near }), step = f.group ? LADDERS[f.group.by]?.[f.group.level] : null;
    const title = (g) => (f.group?.by === 'date' ? periodLabel(g.key, lang, { year: step !== 'day' }) + (step === 'day' ? ` ${periodLabel(g.key.slice(0, 7), lang)}` : '') : g.label);
    if (groups) for (const sp of cloudSpots(groups.length, inner, { beside: L.wide && !L.full, k })) { // bundled (21.11.): a pastel bubble, up to four pictures, how many
      const g = groups[sp.i], pics = g.entries.filter((e) => e.thumb).slice(0, 4), q = Math.max(8, (sp.s - 30) / 2); // 2 × 2 under the name
      out.push(`<div class="bundle" data-key="bundle:${esc(g.key)}" data-role="bundle:${sp.i}" style="left:${px(sp.x - sp.s / 2)};top:${px(sp.y - sp.s / 2)};width:${px(sp.s)};height:${px(sp.s)}"><b>${esc(title(g))}</b>${pics.map((e) => `<img src="${esc(e.thumb)}" alt="" style="width:${px(q)};height:${px(q)}">`).join('')}<i>${g.entries.length}</i></div>`);
    }
    else for (const sp of cloudSpots(entries.length, inner, { beside: L.wide && !L.full, k })) {
      const e = entries[sp.i], t = tileForm(sp.s, L); // the window's form (21.11.): its aspect and its corners
      out.push(`<div class="tile${e.key === st.pick ? ' picked' : ''}${e.kind ? ` chain-${e.kind}` : ''}" data-key="tile:${esc(e.key)}" data-role="tile:${sp.i}" style="left:${px(sp.x - t.w / 2)};top:${px(sp.y - t.h / 2)};width:${px(t.w)};height:${px(t.h)};clip-path:path('${t.d}');--r:${(L.round ?? 1).toFixed(2)}">${e.thumb ? `<img src="${esc(e.thumb)}" alt="">` : ''}${e.kind ? `<em class="sign">${KIND_SIGN[e.kind] ?? ''}</em>` : ''}<div class="tags">${(e.words ?? []).slice(0, 3).map((w) => `<span class="chip tag">${esc(w)}</span>`).join('')}${(e.words?.length ? [] : e.heard ?? []).slice(0, 3).map((w) => `<span class="chip tag heard">${esc(w)}</span>`).join('')}</div><svg class="tile-edge" viewBox="0 0 ${t.w.toFixed(1)} ${t.h.toFixed(1)}"><path d="${t.d}"/></svg></div>`);
    }
    if (!entries.length) out.push(`<div class="empty" style="left:${px(inner.x)};top:${px(inner.y + inner.h / 2 - 20)};width:${px(inner.w)}">∅</div>`);
  }
  if (st.sel === 'cloud' && !single) out.unshift(`<div class="cloud-chosen" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.w)};height:${px(box.h)}"></div>`); // the cloud chosen: its ground tinted, behind the tiles (22.11.)
  if (st.sel === 'element' && single && L.single) { // the element chosen: a tinted ring of 18 px around its window (22.11.)
    const pad = 18 * k, S = L.single, x0 = S.cx - S.rx - pad, y0 = S.cy - S.ry - pad;
    out.unshift(`<svg class="single-chosen" style="left:${px(x0)};top:${px(y0)};width:${px(2 * (S.rx + pad))};height:${px(2 * (S.ry + pad))}"><path fill-rule="evenodd" d="${outline(S, pad, x0, y0)} ${outline(S, 0, x0, y0)}"/></svg>`);
  }
  if (single) return out.join(''); // one result large: the cloud's grips and rails wait until it is small again

  // ---------- the four respects at the cloud's four edges (26.11., user) ----------
  // closed: a pale grip in the middle of its edge (filled = something of it is chosen, or the cloud is bundled by it) ·
  // open: its rail along that edge instead, one arrow at its head = the order (tap turns it); pushed out over its
  // edge, or squeezed below its coarsest step = closed again.
  const chosen = { initial: (f.value.initial ?? []).length > 0, date: Boolean(f.on.date && f.value.date), spot: (f.value.spot ?? []).length > 0, who: (f.value.sharing ?? []).length + (f.value.name ?? []).length > 0 };
  for (const z of ['initial', 'date', 'spot', 'who']) {
    if (z === open) continue;
    const c = parts.grips[z];
    out.push(`<span class="grip${chosen[z] || f.group?.by === z ? ' on' : ''}" data-key="grip:${z}" data-role="grip:${z}" style="left:${px(c.x - 13 * k)};top:${px(c.y - 14 * k)}">${ICON[z]}</span>`);
  }
  const corner = { x: inner.x + 10 * k, y: open === 'spot' ? inner.y : box.y + 1 * k }; // the words of an opened similar, the bubbles of the kinds: top left, under the map while it is open
  if (search) out.push(`<span class="chip pick on search-on" data-role="search-off" style="position:absolute;left:${px(corner.x)};top:${px(corner.y)}">? ${esc(search.words.join(' '))}</span>`); // a similar opened: its words; pulled down = the window's again (21.11.)
  else if (kindCloud) out.push(`<span class="chip pick on search-on" data-role="kinds-off" style="position:absolute;left:${px(corner.x)};top:${px(corner.y)}">${KIND_SIGN[kindCloud] ?? ''} · ${entries.length}</span>`); // a kind's own cloud; pulled down = the takes again
  else if (searches) out.push(`<span class="kind-bubble in-similar" data-role="kinds:search" style="position:absolute;left:${px(corner.x)};top:${px(corner.y)}"><em>?</em><b>${searches}</b></span>`); // the saved similar: a bubble at the top, spread or tap = their cloud
  if (asks && !search && !kindCloud) out.push(`<span class="kind-bubble in-similar ask" data-role="kinds:ask" style="position:absolute;left:${px(corner.x + (searches ? 56 : 0) * k)};top:${px(corner.y)}"><em>↗</em><b>${asks}</b></span>`); // requests to pass on my takes: their own cloud, ↑ / ↓ on the button decides (21.11.)
  if (open && parts.rail) out.push(railHtml(open, parts.rail, f, all ?? entries, { k, lang, reach, spotMap, spotBase, spots }));
  return out.join('');
}

const ARROW = { down: '↓', up: '↑', right: '→', left: '←' };
/**
 * The rail of the open respect (26.11.). Upright bars: letters (left) and the calendar (right), the arrow on top;
 * lying: the spot's map (top) and who (bottom), the arrow at the left end. What is chosen is filled.
 */
function railHtml(z, r, f, all, { k, lang, reach, spotMap, spotBase, spots }) {
  const box = `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}`, turned = z === 'date' ? f.order.date === 'old' : (f.order[z] ?? 'az') === 'za';
  const upright = z === 'initial' || z === 'date';
  const order = `<em class="rail-order" data-role="order:${z}">${upright ? (turned ? ARROW.up : ARROW.down) : (turned ? ARROW.left : ARROW.right)}</em>`;
  if (z === 'initial') {
    const { values } = railValues(all, f, 'initial'), on = f.value.initial ?? [];
    return `<div class="rail upright" data-key="rail:initial" data-role="rail:initial" style="${box}">${order}<div class="rail-list">${values.map((v) => `<span class="${on.includes(v.key) ? 'on' : ''}" data-role="initial:${esc(v.key)}">${esc(v.key)}</span>`).join('')}</div></div>`;
  }
  if (z === 'date') {
    const { values } = railValues(all, f, 'date'), span = f.on.date ? f.value.date : null, years = new Set(values.map((v) => v.key.slice(0, 4))).size > 1;
    return `<div class="rail upright" data-key="rail:date" data-role="rail:date" style="${box}">${order}<div class="rail-list">${values.map((v) => `<span class="${v.head ? 'head' : ''}${inSpan(v.key, span) ? ' on' : ''}" data-role="period:${esc(v.key)}">${esc(periodLabel(v.key, lang, { year: years && v.head }))}</span>`).join('')}</div></div>`;
  }
  if (z === 'spot') {
    const on = f.value.spot ?? [], area = { w: r.w - 34 * k, h: r.h };
    const map = spotMap?.length
      ? spotMapSvg(spotMap, spotBase, area, { k, chosen: on, id: 'rail-map', lang }) // the base map under the hexagons (26.11., basemap.js)
      : `<div class="rail-list">${spots.slice(0, 16).map((x) => `<span class="chip pick${on.includes(x.id) ? ' on' : ''}" data-role="value:spot:${esc(x.id)}">${esc(x.label)}</span>`).join('') || '<span class="none">∅</span>'}</div>`; // no map (h3 not loaded, offline): the cells as a strip
    return `<div class="rail lying map" data-key="rail:spot" data-role="rail:spot" style="${box}">${order}${map}</div>`;
  }
  // who: every sharing point a bubble – one's own first, then where one writes with others, then what one only sees (pale) –
  // its persons inside; a bubble tapped = that sharing point, a person tapped = that person
  const rank = (x) => (x.own ? 0 : x.write ? 1 : 2), dir = turned ? -1 : 1;
  const list = [...reach].sort((a, b) => rank(a) - rank(b) || dir * a.name.localeCompare(b.name, 'de'));
  const groups = list.map((x) => `<div class="who-group${x.own || x.write ? '' : ' far'}${(f.value.sharing ?? []).includes(x.name) ? ' on' : ''}" data-role="value:sharing:${esc(x.name)}"><b>${esc(x.own ? '◉' : x.name)}</b>${x.persons.slice(0, 6).map((p) => `<i class="${(f.value.name ?? []).includes(p) ? 'on' : ''}" data-role="value:name:${esc(p)}">${esc(p.slice(0, 2))}</i>`).join('')}</div>`).join('');
  return `<div class="rail lying" data-key="rail:who" data-role="rail:who" style="${box}">${order}<div class="rail-list">${groups || '<span class="none">∅</span>'}</div></div>`;
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
