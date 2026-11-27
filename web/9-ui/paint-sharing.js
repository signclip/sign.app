// paint-sharing.js — draws the sharing menu from the engine's snapshot (sharing-engine.js) at the positions of
// sharing-view.js, and turns the new gestures into the engine's roles.
//
// Purpose:   accounts top left (roles square, persons round, the current one ringed) · + top right · this device as
//            the first tile with the person's name in a round bubble (front: from now on · behind it: what is stored)
//            · beside it the way in: hello → join → sign (sharing-view.js JOIN_LOOKS) · the admin's piles hello · join
//            · within · quiet with their counts · every sharing point as a tile with its small strand arcs (a group:
//            below its name how many are within, the number as on the piles) · lines from
//            the device bubbles to where things flow (dashed = from now on, solid thick = everything) · the system row.
//            A group's tile spread open: its swarm where the tiles were (swarm-view.js).
// Depends:   browser; sharing-view.js
// Test:      positions and looks in tests/ui.test.mjs; this needs a browser.
// Limits:    tiles as the engine gives them (≤ 40); names cut at 12 letters inside a tile.

import { menuLayout, joinLook, bridge, TILE_ARCS } from './sharing-view.js';
import { arcPath, polar } from './layout.js';
import { swarmView } from './swarm-view.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => Number(n).toFixed(1);
const cut = (s, n = 12) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
const GLYPH = { save: '⤓', print: '⎙', mail: '✉', more: '⋯', messenger: '◍', bluetooth: 'ᛒ', nearby: '⌁' };

/** The door tile (the project's hello) and its look. */
export function doorOf(snap) {
  const tile = snap.tiles.find((t) => snap.joinStates.has(t.label) && !t.under);
  if (!tile) return { tile: null, look: 'none' };
  const state = snap.joinStates.get(tile.label);
  const busy = snap.sending === `sp:${tile.n}` ? (state === 'ready' ? 'join' : 'hello') : null;
  return { tile, look: joinLook({ door: state === 'door' ? null : state, busy, ready: state === 'door' || state === 'hello' || state === 'ready' || busy != null }) };
}

/** Everything of the menu: { html, svg, layout }. snap: engine snapshot · size { w, h } · drag: { from, x, y } while carrying */
export function sharingView(snap, size, { drag = null } = {}) {
  const door = doorOf(snap);
  const hiddenDoor = door.tile && ['offer', 'sending', 'sent', 'accepted', 'loading'].includes(door.look);
  const mark = (role) => `${snap.pulse === role ? ' breathe' : ''}${snap.flash === role ? ' flash' : ''}${snap.shake === role ? ' shake' : ''}${snap.fresh?.has?.(role) ? ' appear' : ''}`;
  // what stands in the grid: after a login or in a role's lists the choices (browse), else the sharing points, then what waits for me
  const real = snap.tiles.filter((t) => !t.under && !(hiddenDoor && t.label === door.tile.label));
  const tiles = snap.swarm ? [] // a group's swarm lies where the tiles were (26.11., swarm-view.js)
    : snap.browse ? snap.browse.map((b, i) => ({ ...b, role: `browse:${i}`, choice: true }))
    : [...real.map((t) => ({ ...t, role: `sp:${t.n}` })), ...(snap.incoming ?? []).map((x, i) => ({ ...x, role: `incoming:${i}`, waitsForMe: true })),
      ...(snap.acceptThere ? [{ label: snap.acceptThere.label, role: 'accept-there', waitsForMe: true }] : [])];
  const self = snap.self ?? { id: 'me', label: snap.own };
  const accounts = [{ ...self, current: true, roleKey: `person:${self.id}` }, ...(snap.persons ?? []).map((p) => ({ ...p, roleKey: `person:${p.id}` })),
    ...(snap.accounts ?? []).map((a, i) => ({ ...a, roleKey: `account:${i}` })).filter((a) => a.role && !a.current)]; // Admin, Atlas, Groups: square; my own login is my person (20.11.: not a second time beside it)
  const piles = snap.hellos?.length && !snap.browse && !snap.swarm ? Object.fromEntries(snap.hellos.map((p) => [p.pile, p.count ?? 0])) : null;
  const native = snap.apps?.length ? snap.apps.slice(0, 5).map((a, i) => ({ id: a.glyph ?? (/mail|gm/i.test(a.pkg ?? '') ? 'mail' : /bluetooth/.test(a.pkg ?? '') ? 'bluetooth' : 'messenger'), label: a.label ?? a.glyph, i, role: `app:${i}` }))
    : [{ id: 'save', role: 'web:save' }, { id: 'more', role: 'out:system' }]; // the web: save as download, the system's share sheet
  const L = menuLayout({ accounts, tiles, piles, native: snap.apps?.length ? [] : native, join: door.look }, size);
  const html = [], svg = [];
  for (const a of L.accounts) html.push(`<span class="acc${a.square ? ' square' : ''}${a.current ? ' current' : ''}${a.joined === 'waiting' ? ' waiting' : ''}${mark(a.roleKey)}" data-role="${a.roleKey}" style="left:${f1(a.x - a.s / 2)}px;top:${f1(a.y - a.s / 2)}px;width:${f1(a.s)}px;height:${f1(a.s)}px">${esc(String(a.label ?? '?').charAt(0).toUpperCase())}${a.count ? `<sup>${Number(a.count)}</sup>` : ''}</span>`);
  html.push(`<span class="plus${snap.clip === 'ready' ? ' ready' : ''}${mark('add:new')}" data-role="add:new" style="left:${f1(L.plus.x - L.plus.s / 2)}px;top:${f1(L.plus.y - L.plus.s / 2)}px;width:${f1(L.plus.s)}px;height:${f1(L.plus.s)}px">+</span>`);
  const d = L.device;
  html.push(`<div class="tile device${mark('sp:0')}" data-role="sp:0" style="left:${f1(d.x)}px;top:${f1(d.y)}px;width:${f1(d.s)}px;height:${f1(d.s)}px"></div>`);
  html.push(`<span class="bubble-acc back" data-role="dev:all" style="left:${f1(d.back.x - d.back.r)}px;top:${f1(d.back.y - d.back.r)}px;width:${f1(2 * d.back.r)}px;height:${f1(2 * d.back.r)}px"></span>`);
  html.push(`<span class="bubble-acc front" data-role="dev:new" style="left:${f1(d.front.x - d.front.r)}px;top:${f1(d.front.y - d.front.r)}px;width:${f1(2 * d.front.r)}px;height:${f1(2 * d.front.r)}px">${esc(cut(self.label, 9))}</span>`);
  if (door.tile && door.look !== 'none' && door.look !== 'joined') {
    const h = L.hello, j = L.join, look = door.look;
    svg.push(`<path class="way ${look}" d="${bridge(d.front, h, 0.1)}"/>`);
    if (look === 'sending') for (let i = 0; i < Math.max(1, snap.sent ?? 0); i++) svg.push(`<circle class="dot-run" r="3"><animateMotion dur="1.1s" begin="${(i * 0.25).toFixed(2)}s" repeatCount="indefinite" path="${bridge(d.front, h, 0.1)}"/></circle>`);
    html.push(`<span class="way-bubble hello ${look}" data-role="sp:${door.tile.n}" style="left:${f1(h.x - h.r)}px;top:${f1(h.y - h.r)}px;width:${f1(2 * h.r)}px;height:${f1(2 * h.r)}px">hello</span>`);
    if (['accepted', 'loading'].includes(look)) {
      svg.push(`<path class="way join-way ${look}" d="${bridge(j, d.front, -0.08)}"/>`);
      html.push(`<span class="way-bubble join ${look}" data-role="sp:${door.tile.n}" style="left:${f1(j.x - j.r)}px;top:${f1(j.y - j.r)}px;width:${f1(2 * j.r)}px;height:${f1(2 * j.r)}px">join</span>`);
    }
  }
  for (const p of L.piles) html.push(`<div class="pile${p.n ? '' : ' faint'}${mark(`hello:${(snap.hellos ?? []).findIndex((x) => x.pile === p.pile)}`)}" data-role="hello:${(snap.hellos ?? []).findIndex((x) => x.pile === p.pile)}" style="left:${f1(p.x)}px;top:${f1(p.y)}px;width:${f1(p.s)}px;height:${f1(p.s)}px"><b>${p.pile}</b><em>${p.n}</em></div>`);
  for (const t of L.tiles) {
    const c = { x: t.x + t.s / 2, y: t.y + t.s / 2 }, r = t.s / 2 + 5;
    const box = `style="left:${f1(t.x)}px;top:${f1(t.y)}px;width:${f1(t.s)}px;height:${f1(t.s)}px"`;
    if (t.choice) { html.push(`<div class="tile choice${t.found ? ' breathe found' : ''}${t.faint ? ' faint' : ''}${mark(t.role)}" data-role="${t.role}" ${box}><span>${esc(cut(t.label, 22))}</span>${t.sub ? `<small>${esc(cut(t.sub, 16))}</small>` : ''}</div>`); continue; }
    if (t.waitsForMe) { html.push(`<div class="tile waits breathe${mark(t.role)}" data-role="${t.role}" ${box}><span>${esc(cut(t.label))}</span></div>`); continue; }
    const mine = door.look === 'joined' && /\/Sign\/?$/.test(t.path ?? '') ? ' mine' : '';
    html.push(`<div class="tile ${t.state ?? ''}${t.encrypted ? ' sealed' : ''}${t.shown ? ' shown' : ''}${mine}${snap.focus === t.n ? ' focus' : ''}${mark(t.role)}" data-role="${t.role}" ${box}><span>${esc(cut(t.label))}</span>${t.count != null ? `<em>${Number(t.count)}</em>` : ''}</div>`);
    for (const [k, [a, b]] of Object.entries(TILE_ARCS)) {
      const on = (t.consent ?? []).includes(k) || (t.kinds ?? []).includes(k) || ((t.always || t.alwaysAll) && !(t.kinds ?? []).length);
      svg.push(`<path class="tile-arc ${on ? 'on' : 'off'}" d="${arcPath(c.x, c.y, r, a + 4, b - 4)}"/><path class="hit" data-role="sp-kind:${t.n}:${k}" d="${arcPath(c.x, c.y, r, a + 4, b - 4)}"/>`);
    }
    if (t.always || t.alwaysAll || t.backupOwn) {
      const all = t.alwaysAll || t.backupOwn, from = all ? d.back : d.front, [tx, ty] = polar(c.x, c.y, r, -35);
      svg.push(`<path class="flow ${all ? 'all' : 'new'}" data-role="bridge:0:${t.n}" d="${bridge(from, { x: tx, y: ty })}"/>`);
    }
    for (const to of t.copyTo ?? []) { const o = L.tiles.find((x) => x.n === to); if (o) svg.push(`<path class="flow new" d="${bridge(c, { x: o.x + o.s / 2, y: o.y + o.s / 2 })}"/>`); }
  }
  if (snap.swarm) { const v = swarmView(snap.swarm, size); html.push(v.html); svg.push(v.svg); }
  for (const n of L.native) html.push(`<span class="native" data-role="${n.role}" style="left:${f1(n.x)}px;top:${f1(n.y)}px;width:${f1(n.s)}px;height:${f1(n.s)}px">${GLYPH[n.id] ?? esc(String(n.label ?? '').charAt(0))}</span>`);
  if (snap.apps?.length) html.push(appRow(snap.apps, L.k)); // the native app: every app that takes a share, side by side, sliding (as until 16.11.)
  if (snap.confirm) html.push(confirmHtml(snap.confirm, size, L.k));
  if (snap.note) html.push(`<div class="menu-note" data-role="note">${esc(snap.note)}</div>`);
  if (drag) svg.push(`<path class="carry ${drag.from === 'dev:all' ? 'all' : 'new'}" d="M${f1(drag.x0)} ${f1(drag.y0)}L${f1(drag.x)} ${f1(drag.y)}"/>`);
  return { html: html.join(''), svg: svg.join(''), layout: L, door };
}

/**
 * The share row at the very bottom (native app, as in the version until 16.11.): every app that takes a share, the most
 * used first, each with its own icon and name; it slides left and right under the finger (the browser's own scrolling:
 * smooth, with momentum, snapping to an app). A tap = the last take goes there; ↑ on the row = the system's share sheet.
 */
export function appRow(apps, k = 1) {
  const icon = (a) => (a.icon ? `<img src="${esc(String(a.icon).startsWith('data:') ? a.icon : `data:image/png;base64,${a.icon}`)}" alt="">` : `<i>${GLYPH[a.glyph] ?? '↗'}</i>`);
  const items = apps.map((a, i) => `<span class="app" data-role="app:${i}">${icon(a)}<em>${esc(cut(a.label ?? '', 11))}</em></span>`).join('');
  return `<div class="row" data-role="row-area" style="--k:${k.toFixed(3)}">${items}<span class="app" data-role="out:system"><i>⋯</i><em></em></span></div>`;
}

/**
 * The first circle (engine: confirm): what goes to this sharing point, before anything goes. Its name, the three strands
 * as bars (visual left · context bottom · sound right, tap = on/off), the middle = yes (→ from now on · a number = that
 * many takes now). Pushed down or a tap beside it = nothing goes.
 */
export function confirmHtml(c, { w, h }, k = 1) {
  const s = Math.min(w - 48 * k, 300 * k), x = (w - s) / 2, y = (h - s) / 2 - 20 * k;
  const bar = (kind, cls) => `<i class="bar ${cls}${c.kinds.includes(kind) ? ' on' : ''}" data-role="confirm:${kind}"></i>`;
  return `<div class="confirm-veil" data-role="sheet"></div><div class="confirm" data-role="confirm:box" style="left:${f1(x)}px;top:${f1(y)}px;width:${f1(s)}px;height:${f1(s)}px">`
    + `<b>${esc(cut(c.label, 18))}</b>${bar('v', 'left')}${bar('x', 'bottom')}${bar('a', 'right')}`
    + `<span class="confirm-ok${c.kinds.length ? '' : ' none'}" data-role="confirm:ok">${c.how === 'new' ? '→' : esc(String(c.count ?? 1))}</span></div>`;
}
