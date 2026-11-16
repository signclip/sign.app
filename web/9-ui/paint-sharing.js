// paint-sharing.js — draws the sharing menu from the engine's snapshot (sharing-engine.js) at the positions of
// sharing-view.js, and turns the new gestures into the engine's roles.
//
// Purpose:   accounts top left (roles square, persons round, the current one ringed) · + top right · this device as
//            the first tile with the person's name in a round bubble (front: from now on · behind it: what is stored)
//            · beside it the way in: hello → join → sign (sharing-view.js JOIN_LOOKS) · the admin's piles hello · join
//            · within · quiet with their counts · every sharing point as a tile with its small strand arcs · lines from
//            the device bubbles to where things flow (dashed = from now on, solid thick = everything) · the system row.
// Depends:   browser; sharing-view.js
// Test:      positions and looks in tests/ui.test.mjs; this needs a browser.
// Limits:    tiles as the engine gives them (≤ 40); names cut at 12 letters inside a tile.

import { menuLayout, joinLook, bridge, TILE_ARCS } from './sharing-view.js';
import { arcPath, polar } from './layout.js';

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
  const tiles = snap.tiles.filter((t) => !t.under && !(hiddenDoor && t.label === door.tile.label));
  const self = snap.self ?? { id: 'me', label: snap.own };
  const accounts = [{ ...self, current: true, roleKey: `person:${self.id}` }, ...(snap.persons ?? []).map((p) => ({ ...p, roleKey: `person:${p.id}` })),
    ...(snap.accounts ?? []).map((a, i) => ({ ...a, roleKey: `account:${i}` })).filter((a) => a.role)]; // Admin, Atlas, Groups: square; my own login is my person
  const piles = snap.hellos?.length ? Object.fromEntries(snap.hellos.map((p) => [p.pile, p.count ?? 0])) : null;
  const native = snap.apps?.length ? snap.apps.slice(0, 5).map((a, i) => ({ id: a.glyph ?? (/mail|gm/i.test(a.pkg ?? '') ? 'mail' : /bluetooth/.test(a.pkg ?? '') ? 'bluetooth' : 'messenger'), label: a.label ?? a.glyph, i, role: `app:${i}` }))
    : [{ id: 'save', role: 'web:save' }, { id: 'more', role: 'out:system' }]; // the web: save as download, the system's share sheet
  const L = menuLayout({ accounts, tiles, piles, native, join: door.look }, size);
  const html = [], svg = [];
  for (const a of L.accounts) html.push(`<span class="acc${a.square ? ' square' : ''}${a.current ? ' current' : ''}${a.joined === 'waiting' ? ' waiting' : ''}" data-role="${a.roleKey}" style="left:${f1(a.x - a.s / 2)}px;top:${f1(a.y - a.s / 2)}px;width:${f1(a.s)}px;height:${f1(a.s)}px">${esc(String(a.label ?? '?').charAt(0).toUpperCase())}</span>`);
  html.push(`<span class="plus${snap.clip === 'ready' ? ' ready' : ''}" data-role="add:new" style="left:${f1(L.plus.x - L.plus.s / 2)}px;top:${f1(L.plus.y - L.plus.s / 2)}px;width:${f1(L.plus.s)}px;height:${f1(L.plus.s)}px">+</span>`);
  const d = L.device;
  html.push(`<div class="tile device" data-role="sp:0" style="left:${f1(d.x)}px;top:${f1(d.y)}px;width:${f1(d.s)}px;height:${f1(d.s)}px"></div>`);
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
  for (const p of L.piles) html.push(`<div class="pile${p.n ? '' : ' faint'}" data-role="hello:${(snap.hellos ?? []).findIndex((x) => x.pile === p.pile)}" style="left:${f1(p.x)}px;top:${f1(p.y)}px;width:${f1(p.s)}px;height:${f1(p.s)}px"><b>${p.pile}</b><em>${p.n}</em></div>`);
  for (const t of L.tiles) {
    const c = { x: t.x + t.s / 2, y: t.y + t.s / 2 }, r = t.s / 2 + 5;
    const joined = door.look === 'joined' && /\/Sign/.test(t.path ?? '') ? ' mine' : '';
    html.push(`<div class="tile ${t.state ?? ''}${t.encrypted ? ' sealed' : ''}${t.shown ? ' shown' : ''}${joined}" data-role="sp:${t.n}" style="left:${f1(t.x)}px;top:${f1(t.y)}px;width:${f1(t.s)}px;height:${f1(t.s)}px"><span>${esc(cut(t.label))}</span></div>`);
    for (const [k, [a, b]] of Object.entries(TILE_ARCS)) {
      const on = (t.consent ?? []).includes(k) || (t.kinds ?? []).includes(k);
      svg.push(`<path class="tile-arc ${on ? 'on' : 'off'}" d="${arcPath(c.x, c.y, r, a + 4, b - 4)}"/><path class="hit" data-role="sp-kind:${t.n}:${k}" d="${arcPath(c.x, c.y, r, a + 4, b - 4)}"/>`);
    }
    if (t.always || t.alwaysAll || t.backupOwn) {
      const all = t.alwaysAll || t.backupOwn, from = all ? d.back : d.front, [tx, ty] = polar(c.x, c.y, r, -35);
      svg.push(`<path class="flow ${all ? 'all' : 'new'}" data-role="bridge:0:${t.n}" d="${bridge(from, { x: tx, y: ty })}"/>`);
    }
    for (const to of t.copyTo ?? []) { const o = L.tiles.find((x) => x.n === to); if (o) svg.push(`<path class="flow new" d="${bridge(c, { x: o.x + o.s / 2, y: o.y + o.s / 2 })}"/>`); }
  }
  for (const n of L.native) html.push(`<span class="native" data-role="${n.role}" style="left:${f1(n.x)}px;top:${f1(n.y)}px;width:${f1(n.s)}px;height:${f1(n.s)}px">${GLYPH[n.id] ?? esc(String(n.label ?? '').charAt(0))}</span>`);
  if (snap.note) html.push(`<div class="menu-note" data-role="note">${esc(snap.note)}</div>`);
  if (drag) svg.push(`<path class="carry ${drag.from === 'dev:all' ? 'all' : 'new'}" d="M${f1(drag.x0)} ${f1(drag.y0)}L${f1(drag.x)} ${f1(drag.y)}"/>`);
  return { html: html.join(''), svg: svg.join(''), layout: L, door };
}
