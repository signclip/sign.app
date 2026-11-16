// paint-similar.js — draws Similar (similar-view.js): the cloud, the double view, and the selection views around it.
//
// Purpose:   the cloud's tiles lie nearest the take where they match best; a tile shows its small picture and up to
//            three of its chips. The double view shows one result large (it plays), the take stays beside it. The
//            selection views sit at the edges, pale until tapped: initial letters on the left edge, the date on the right
//            edge (a bar from new to old; drag over it = the span), and along the bottom the strands v · x · a and
//            @ name · sharing point · spot. An open selection shows its choices; a chosen one is filled.
// Depends:   browser; similar-view.js
// Test:      positions and filters in tests/ui.test.mjs; this needs a browser.
// Limits:    ≤ 40 tiles; ≤ 30 initials; ≤ 12 names / sharing points / spots shown (the rest by scrolling the strip).

import { cloudSpots, initialsOf } from './similar-view.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (n) => `${Number(n).toFixed(1)}px`;

const ICON = { v: '◖', x: '◡', a: '◗', initial: 'A', date: '▮', name: '@', sharing: '●', spot: '◎' };

/** HTML of Similar. entries: [{ key, thumb, words, t, person, sharing, spot }] (ordered, filtered) · L: take layout */
export function similarHtml(st, entries, L, { names = [], sharing = [], spots = [], range = null } = {}) {
  if (st.similar === 'closed' || !L.similarBox) return '';
  const box = L.similarBox, f = st.filters, out = [];
  const inner = { x: box.x + 30 * L.k, y: box.y + 6 * L.k, w: box.w - 60 * L.k, h: box.h - 50 * L.k };
  if (st.similar === 'double' && L.doubleBox) {
    const d = L.doubleBox, e = entries.find((x) => x.key === st.pick);
    out.push(`<div class="double" style="left:${px(d.x)};top:${px(d.y)};width:${px(d.w)};height:${px(d.h)}" data-role="double">${e?.thumb ? `<img src="${esc(e.thumb)}" alt="">` : ''}<video id="pickvideo" playsinline muted loop></video><div class="tags">${(e?.words ?? []).slice(0, 4).map((w) => `<span class="chip tag">${esc(w)}</span>`).join('')}</div></div>`);
  } else {
    const spotsOf = cloudSpots(entries.length, inner, { beside: L.wide, k: L.k });
    for (const s of spotsOf) {
      const e = entries[s.i];
      out.push(`<div class="tile${e.key === st.pick ? ' picked' : ''}" data-role="tile:${s.i}" style="left:${px(s.x - s.s / 2)};top:${px(s.y - s.s / 2)};width:${px(s.s)};height:${px(s.s)}">${e.thumb ? `<img src="${esc(e.thumb)}" alt="">` : ''}<div class="tags">${(e.words ?? []).slice(0, 3).map((w) => `<span class="chip tag">${esc(w)}</span>`).join('')}</div></div>`);
    }
    if (!entries.length) out.push(`<div class="empty" style="left:${px(inner.x)};top:${px(inner.y + inner.h / 2 - 20)};width:${px(inner.w)}">∅</div>`);
  }
  const chip = (name, x, y) => `<span class="sel${f.on[name] ? ' on' : ''}${f.open === name ? ' open' : ''}" data-role="filter:${name}" style="left:${px(x)};top:${px(y)}">${ICON[name]}</span>`;
  out.push(chip('initial', box.x + 4 * L.k, box.y + 4 * L.k), chip('date', box.x + box.w - 28 * L.k, box.y + 4 * L.k));
  const bottom = box.y + box.h - 30 * L.k, names6 = ['v', 'x', 'a', 'name', 'sharing', 'spot'];
  names6.forEach((n, i) => out.push(chip(n, box.x + box.w / 2 + (i - 2.5) * 34 * L.k - 13 * L.k, bottom)));
  if (f.open === 'initial') {
    const letters = initialsOf(entries.length ? entries : [], f.order.initial).slice(0, 30);
    out.push(`<div class="letters" style="left:${px(box.x + 4 * L.k)};top:${px(box.y + 34 * L.k)};height:${px(box.h - 74 * L.k)}">${letters.map((c) => `<span class="${(f.value.initial ?? []).includes(c) ? 'on' : ''}" data-role="initial:${esc(c)}">${esc(c)}</span>`).join('')}</div>`);
  }
  if (f.open === 'date') {
    const [a, b] = range ?? [0, 1];
    out.push(`<div class="datebar" data-role="datebar" style="left:${px(box.x + box.w - 24 * L.k)};top:${px(box.y + 34 * L.k)};height:${px(box.h - 74 * L.k)}"><b style="top:${(a * 100).toFixed(1)}%;height:${((b - a) * 100).toFixed(1)}%"></b><em>${f.order.date === 'new' ? '↓' : '↑'}</em></div>`);
  }
  const list = { name: names, sharing, spot: spots }[f.open];
  if (list) out.push(`<div class="strip" style="left:${px(box.x + 8 * L.k)};width:${px(box.w - 16 * L.k)};top:${px(bottom - 40 * L.k)}">${list.slice(0, 12).map((x) => `<span class="chip pick${(f.value[f.open] ?? []).includes(x.id) ? ' on' : ''}" data-role="value:${f.open}:${esc(x.id)}">${esc(x.label)}</span>`).join('')}</div>`);
  return out.join('');
}
