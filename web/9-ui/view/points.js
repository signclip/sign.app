// view/points.js — the sharing menu: sharing points as rounded tiles in a sheet that rises from the point after ↑.
//
// Sheet:     a rectangle with rounded corners from the lower edge up (decided 13.11.); pulled down = away
//            ("egal", nothing changes); inside, each sharing point can be chosen on its own.
//
// Purpose:   no chips, everything is seen on the tile (share-menu.js says what the gestures do):
//              tile        one sharing point, a rounded rectangle with two layers behind (much lies inside);
//                          the first one (0) is this device
//                          filled blue = brought in (shows in Similar) · dashed grey = not there now
//                          (disk unplugged) or not reachable · green ring = shared to last
//              edge bars   which strands go there: solid = always, dashed = only on a tap, grey = not
//                          (the same sides as on the field: ring.js SIDES)
//              bridges     lines between tiles: copy (solid) or encrypted backup (double line);
//                          0 → n = every take goes there
//              run dot     lower right: filled = the last copy/backup there went through · open ring = it failed
//              seal        upper left: filled = its sharing-point.sign is sealed by one of its signers (verified) ·
//                          open ring = sealed wrong (nothing is shared there) · none = a plain folder
//              view only   an inner dashed edge: it can only be read (shows in Similar, nothing goes there)
//              arrows      a copy or backup line has a chevron at its target: it runs one way, all once, then new;
//                          a thin blue line = shared to that account, read-only (no copy)
//              join        builds the sharing icon (decided 13.11.), in the group's spot: me on the left (coral),
//                          the group upper right (blue), my own space lower right (coral). hello = a dotted line to
//                          a dashed group circle · join = the group filled, a dotted line to my own space ·
//                          join-own = all three filled: the icon complete, shown once, then the tiles take over.
//                          At the signer each hello is a circle on a line from its group (the same icon).
//              share sign  the classic way out (14.11.): tap = the last take into the system share sheet (other apps)
//              dashed +    ONE tile to bring a new one in (13.11.): a link or address on the clipboard is taken
//                          (folders and disks: tap this device, 14.11.); everything else is a connection between tiles ·
//                          nothing usable on the clipboard (14.11.): a faint copy sign instead (copy a link, it turns +)
//              dashed blue a share waiting for me (tap = take in), or the other side's page to accept
//                          what I just gave (tap = open it, log in there if asked)
//              browse      after a login: the folders of the account as tiles, ↑ = one level up
//            Names under the tiles are the only words (a sharing point has no other face).
// Depends:   view/ring.js (SIDES, sideOf; shapes are drawn by its toSvg)
// Test:      tests/ui.test.mjs
// Limits:    3 tiles a row on a 390 px phone, up to 40 sharing points (the area scrolls past 12).

import { SIDES, sideOf } from './ring.js';

// Where each strand shows on a tile: the same sides as on the field (ring.js SIDES), a short bar on that edge.
const EDGES = ['v', 'a', 'x', 'l'];
const COLS = 3;

function grid(i, { w, k, y0 }) {
  const gap = w / COLS;
  return { cx: gap / 2 + (i % COLS) * gap, cy: y0 + Math.floor(i / COLS) * 112 * k };
}

/** The bar of one strand on a tile's edge (tiles are about square: the side of the field, 14 px in from the corners). */
function edgeBar(kind, { cx, cy, tw, th }) {
  const bar = sideOf(SIDES[kind], { x: cx - tw / 2, y: cy - th / 2, s: tw, r: 14 });
  if (SIDES[kind] === 'bottom') return { ...bar, y1: cy + th / 2, y2: cy + th / 2 }; // tiles may be lower than wide
  if (SIDES[kind] === 'left' || SIDES[kind] === 'right') return { ...bar, y2: cy + th / 2 - 14 };
  return bar;
}

/**
 * all: tiles (share-menu.js) · own: label of this device · focus: n shared to last · waitSecret: true
 * when a pasted password is awaited · browse: [{ label }] folders after a login, or null ·
 * incoming: [{ label }] shares waiting for me · acceptThere: { label } the other side's page to accept.
 * → { shapes, at: Map(role → { cx, cy, r }) }
 */
export function pointShapes(all, { own = '', admin = null, pulse = null, flash = null, appear = false, fresh = new Set(), focus = null, waitSecret = false, clip = 'ready', shake = null, zoom = null, apps = null, outOnly = false, persons = [], choosing = false, selfStart = 'direct', browse = null, incoming = [], acceptThere = null, hellos = [], joinStates = new Map() }, { w = 390, h = 844, k = w / 390, top = h * 0.4 } = {}) {
  const tw = 86 * k; // a tile: a rounded rectangle, two layers behind it = much lies inside
  const th = 64 * k;
  const y0 = top + 72 * k; // first row, under the handle
  const shapes = [];
  const at = new Map();
  const add = (type, o) => shapes.push({ type, ...o });
  if (outOnly) { // only the way out (14.11.): the sheet folds down to its share row, e.g. for the emergency sheet
    const low = h - 176 * k;
    add('sheet', { x: 0, y: low, w, h: h - low + 24 * k, r: 24 * k, cls: 'sheet', role: 'sheet' });
    add('line', { x1: w / 2 - 20 * k, y1: low + 12 * k, x2: w / 2 + 20 * k, y2: low + 12 * k, cls: 'handle', role: 'sheet' });
    appRow(apps ?? { list: [] }, { w, h, k, add, at });
    return { shapes, at };
  }
  add('sheet', { x: 0, y: top, w, h: h - top + 24 * k, r: 24 * k, cls: 'sheet', role: 'sheet' });
  add('line', { x1: w / 2 - 20 * k, y1: top + 12 * k, x2: w / 2 + 20 * k, y2: top + 12 * k, cls: 'handle', role: 'sheet' }); // pull down = away

  const tile = (i, role, cls, label, { stack = false } = {}) => { // no layers behind (14.11.): they said nothing
    const { cx, cy } = grid(i, { w, k, y0 });
    at.set(role, { cx, cy, r: th / 2 });
    if (stack) for (const d of [8, 4]) add('sheet', { x: cx - tw / 2 + d * k, y: cy - th / 2 - d * k, w: tw, h: th, r: 14 * k, cls: 'tile-behind' });
    const z = zoom?.role === role ? zoom.scale : 1, zw = tw * z, zh = th * z; // two fingers on it: it grows or shrinks with them, then settles
    add('sheet', { x: cx - zw / 2, y: cy - zh / 2, w: zw, h: zh, r: 14 * k, cls: `${cls}${appear || fresh.has(role) ? ` appear a${appear ? Math.min(i, 9) : 0}` : ''}${role === flash ? ' flash' : ''}${role === shake ? ' shake' : ''}`, role }); // opening: the tiles build up · flash: done (e.g. copied)
    if (label) add('label', { x: cx, y: cy + th / 2 + 18 * k, text: label, cls: 'label' });
    return { cx, cy };
  };

  if (browse) { // after a login: choose the folder
    browse.forEach((b, i) => {
      const { cx, cy } = tile(i, `browse:${i}`, `sp folder${i === 0 ? ' always' : ''}${b.faint ? ' faint' : ''}`, b.label); // faint: a group the account is not in (tap = in)
      if (b.full != null) add('sheet', { x: cx - tw / 2, y: cy + th / 2 - 6 * k, w: tw * Math.min(1, b.full), h: 6 * k, r: 3 * k, cls: `fill${b.full > 0.9 ? ' high' : ''}` }); // an account: how full
    });
    return { shapes, at };
  }

  // positions: this device first, then every drawn tile in order; a group's drop link sits under its read tile
  const slot = new Map([[0, 0]]);
  const joining = (t) => ['door', 'hello', 'join', 'join-own'].includes(joinStates.get(t.label));
  let extra = 0; // the joining icon's own space takes one more tile (14.11.: three big tiles)
  for (const t of all.filter((x) => !x.under)) {
    slot.set(t.n, slot.size + extra);
    if (joining(t) && ['join', 'join-own'].includes(joinStates.get(t.label))) extra++;
  }
  for (const t of all.filter((x) => x.under)) slot.set(t.n, slot.get(t.under));
  const centre = (n) => grid(slot.get(n) ?? n, { w, k, y0 });
  // bridges first, so the tiles lie on top of them; their chevrons come after the tiles
  const bridges = [];
  const bridge = (from, to, cls) => {
    const a = centre(from), b = centre(to);
    const far = Math.abs((slot.get(from) ?? from) - (slot.get(to) ?? to)) > 1; // another tile in between: bend around it
    const c = far ? { cx: (a.cx + b.cx) / 2, cy: Math.max(a.cy, b.cy) + th * 2 } : null; // its middle runs under the names
    add('path', { d: c ? `M ${a.cx} ${a.cy} Q ${c.cx} ${c.cy} ${b.cx} ${b.cy}` : `M ${a.cx} ${a.cy} L ${b.cx} ${b.cy}`, cls: `bridge ${cls}`, role: `bridge:${from}:${to}` });
    if (!c) return bridges.push([a, b, cls]);
    const mid = { cx: 0.25 * a.cx + 0.5 * c.cx + 0.25 * b.cx, cy: 0.25 * a.cy + 0.5 * c.cy + 0.25 * b.cy }; // the curve's middle
    const dx = Math.sign(b.cx - a.cx) || 1; // its direction there runs from a's side to b's side
    bridges.push([{ cx: mid.cx - dx, cy: mid.cy }, { cx: mid.cx + dx, cy: mid.cy }, cls]);
  };
  for (const t of all) {
    if (t.under) continue;
    if (t.always) bridge(0, t.n, 'own');
    if (t.backupOwn) bridge(0, t.n, 'backup');
    for (const m of t.copyTo) bridge(t.n, m, 'own');
    for (const m of t.backupTo) bridge(t.n, m, 'backup');
    for (const m of t.giveTo ?? []) bridge(t.n, m, 'give'); // shared to that account, read-only
  }

  const me = tile(0, 'sp:0', 'sp own-device', own); // this device, for the current person
  if (selfStart === 'choose') add('circle', { cx: me.cx + tw / 2 - 4 * k, cy: me.cy - th / 2 + 4 * k, r: 6 * k, cls: 'badge person-start' }); // chooses at start
  if (selfStart === 'record') add('sheet', { x: me.cx - tw / 2 - 4 * k, y: me.cy - th / 2 - 4 * k, w: tw + 8 * k, h: th + 8 * k, r: 18 * k, cls: 'person-record' }); // records at once
  for (const t of all) {
    if (t.under) continue; // the drop link of a group: drawn as part of its read tile
    if (joining(t)) { joinIcon(slot.get(t.n), t, joinStates.get(t.label)); continue; } // joining: the growing icon
    const cls = ['sp', t.state, t.shown && 'shown', t.always && 'always', focus === t.n && 'focus'].filter(Boolean).join(' ');
    const { cx, cy } = tile(slot.get(t.n), `sp:${t.n}`, `${cls}${t.group ? ' group' : ''}`, t.label);
    if (t.n === admin) add('circle', { cx: cx + tw / 2 - 4 * k, cy: cy - th / 2 + 4 * k, r: 7 * k, cls: 'badge admin' }); // the admin login: → shows the accounts
    if (t.seal === 'ok' || t.seal === 'wrong') add('circle', { cx: cx - tw / 2 + 4 * k, cy: cy - th / 2 + 4 * k, r: 6 * k, cls: `badge ${t.seal === 'ok' ? 'sealed' : 'unsealed'}` });
    if (t.readOnly && !t.drop) add('sheet', { x: cx - tw / 2 + 5 * k, y: cy - th / 2 + 5 * k, w: tw - 10 * k, h: th - 10 * k, r: 10 * k, cls: 'view-only' });
    if (t.run === 'ok' || t.run === 'error') { // last copy or backup: filled dot = went through · open ring = failed
      add('circle', { cx: cx + tw / 2 - 4 * k, cy: cy + th / 2 - 4 * k, r: 6 * k, cls: `badge ${t.run === 'ok' ? 'ran' : 'failed'}` });
    }
    for (const kind of EDGES) {
      const look = !t.kinds.includes(kind) ? 'off' : t.always ? 'own' : 'new';
      const bar = edgeBar(kind, { cx, cy, tw, th });
      add('line', { ...bar, cls: `strand mini ${look}`, role: `sp-kind:${t.n}:${kind}` });
      if (t.consent?.includes(kind) && t.kinds.includes(kind)) add('circle', { cx: (bar.x1 + bar.x2) / 2, cy: (bar.y1 + bar.y2) / 2, r: 3.5 * k, cls: 'consent-dot' }); // consented: a dot on the bar
      add('line', { ...bar, cls: 'hit', role: `sp-kind:${t.n}:${kind}` }); // a wider, unseen line to hit
    }
  }
  for (const [a, b, cls] of bridges) chevron(a, b, k, add, cls); // on top: which way it runs
  /**
   * The growing sharing icon (14.11.): three big tiles — me (this device, first), the group, my own space — joined by
   * lines. door: the group tile breathes, tap = hello · hello: a dotted line, the group waits · join: the group is
   * there, a dotted line to my own space · join-own: all three solid, the icon complete.
   */
  function joinIcon(i, t, state) {
    const me = grid(0, { w, k, y0 });
    const grow = (n) => (fresh.has(t.label) ? ` appear a${n}` : ''); // a new state: the symbol builds up, me → line → group → own
    const line = (b, cls) => shapes.splice(2, 0, { type: 'path', d: `M ${me.cx} ${me.cy} L ${b.cx} ${b.cy}`, cls: `join-line ${cls}` }); // under the tiles
    const group = grid(i, { w, k, y0 });
    if (state !== 'door') line(group, `${state === 'hello' ? 'hello' : 'join'}${grow(2)}`);
    tile(i, `sp:${t.n}`, `sp join-group${state === 'door' ? ' door breathe' : state === 'hello' ? ' waiting' : ''}${grow(3)}`, state === 'door' ? 'hello' : t.label); // before the hello: it says what a tap does
    if (state === 'join' || state === 'join-own') {
      const mine = grid(i + 1, { w, k, y0 });
      line(mine, `${state === 'join-own' ? 'join own' : 'hello own'}${grow(4)}`);
      tile(i + 1, `own:${t.n}`, `sp join-own${state === 'join-own' ? '' : ' waiting'}${grow(5)}`, own, { stack: false });
    }
  }

  let next = slot.size + extra;
  hellos.forEach((x, i) => { // signer: someone said hello: a circle on a line from its group (the sharing icon); tap = welcome
    const { cx, cy } = grid(next++, { w, k, y0 });
    at.set(`hello:${i}`, { cx, cy, r: 26 * k });
    if (x.n != null && slot.has(x.n)) shapes.splice(1 + shapes.findIndex((s) => s.role === 'sheet' && s.type === 'line'), 0,
      { type: 'path', d: `M ${centre(x.n).cx} ${centre(x.n).cy} L ${cx} ${cy}`, cls: 'join-line hello' }); // under the tiles
    add('circle', { cx, cy, r: 26 * k, cls: 'hello', role: `hello:${i}` });
    add('circle', { cx: cx + 10 * k, cy: cy - 10 * k, r: 8 * k, cls: 'hello-dot' });
    add('label', { x: cx, y: cy + 44 * k, text: x.label, cls: 'label' });
  });
  incoming.forEach((x, i) => tile(next++, `incoming:${i}`, 'sp incoming', x.label)); // waiting for me: tap = take in
  if (acceptThere) tile(next++, 'accept-there', 'sp incoming there', acceptThere.label); // tap = their page to accept
  // the other persons on this device (14.11.): small round tiles upper left, their initial inside; tap = switch,
  // ↓ = off this device, double-tap = how this person starts (dot: chooses at start · ring: records at once)
  persons.forEach((p, i) => {
    const c = { cx: 30 * k + i * 34 * k, cy: top + 20 * k, r: 13 * k }; // above the tiles, beside the handle
    add('circle', { ...c, cls: `sp person round${choosing ? ' breathe' : ''}${shake === `person:${p.id}` ? ' shake' : ''}`, role: `person:${p.id}` });
    add('label', { x: c.cx, y: c.cy + 5 * k, text: (p.label || '?').slice(0, 1).toUpperCase(), cls: 'label person-initial' });
    if (p.start === 'choose') add('circle', { cx: c.cx + 9 * k, cy: c.cy - 9 * k, r: 3.5 * k, cls: 'badge person-start' });
    if (p.start === 'record') add('circle', { cx: c.cx, cy: c.cy, r: 16 * k, cls: 'person-record' });
    at.set(`person:${p.id}`, c);
  });
  // + (14.11.): no tile any more, a small round button in the sheet's upper right corner; faint copy sign = copy a link first
  const ghost = clip !== 'ready' && !waitSecret;
  const plus = { cx: w - 30 * k, cy: top + 20 * k, r: 14 * k }; // above the tiles, beside the handle
  add('circle', { ...plus, cls: `sp add round${waitSecret ? ' now' : ''}${ghost ? ' ghost' : ''}${pulse === 'add:new' ? ' breathe' : ''}${shake === 'add:new' ? ' shake' : ''}`, role: 'add:new' });
  (ghost ? glyphCopy : glyphPlus)(plus, k * 0.65, add);
  at.set('add:new', plus);
  appRow(apps ?? { list: [] }, { w, h, k, add, at }); // the way out at the bottom: apps (Android), then the system sheet
  return { shapes, at };
}

/** A chevron between two tiles, in the gap, pointing to the target: copy and backup run one way. */
function chevron(a, b, k, add, cls) {
  const x = (a.cx + b.cx) / 2, y = (a.cy + b.cy) / 2;
  const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx), s = 7 * k;
  const p = (da) => [x - s * Math.cos(ang + da), y - s * Math.sin(ang + da)];
  const [l, r] = [p(0.6), p(-0.6)];
  add('path', { d: `M ${l[0]} ${l[1]} L ${x} ${y} L ${r[0]} ${r[1]}`, cls: `chevron ${cls}` });
}

/** A line from tile centre to tile centre (the tiles lie on top). */
function ends(a, b) {
  return { x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy };
}

// a plus: one more sharing point · a copy sign: two sheets, one over the other (nothing on the clipboard yet)
function glyphPlus({ cx, cy }, k, add) {
  add('path', { d: `M ${cx - 10 * k} ${cy} H ${cx + 10 * k} M ${cx} ${cy - 10 * k} V ${cy + 10 * k}`, cls: 'glyph' });
}
/**
 * The share row (14.11.): the apps side by side, the most used first, sliding with the finger (x = offset in px);
 * at its end the share sign = the system sheet (on iOS and in the browser the only one). tap = the last take goes there.
 */
function appRow({ list = [], x = 0 }, { w, h, k, add, at }) {
  const size = 44 * k, y = h - 112 * k, gap = 70 * k, first = 40 * k;
  add('line', { x1: 24 * k, y1: y - 16 * k, x2: w - 24 * k, y2: y - 16 * k, cls: 'apps-rule' });
  const items = [...list.map((a, i) => ({ ...a, role: `app:${i}` })), { role: 'out:system', label: '' }];
  items.forEach((a, i) => {
    const cx = first + i * gap + x;
    if (a.icon) add('image', { png: a.icon, x: cx - size / 2, y, s: size, cls: 'app row', role: a.role }); // all drawn: the row slides by CSS, no redraw
    else if (a.glyph) { add('circle', { cx, cy: y + size / 2, r: size / 2, cls: 'sp out round row', role: a.role }); (a.glyph === 'print' ? glyphPrint : glyphSave)({ cx, cy: y + size / 2 }, k, add); }
    else { add('circle', { cx, cy: y + size / 2, r: size / 2, cls: 'sp out round row', role: a.role }); glyphShare({ cx, cy: y + size / 2 }, k, add, ' row'); }
    if (a.label) add('label', { x: cx, y: y + size + 14 * k, text: a.label.length > 10 ? `${a.label.slice(0, 9)}…` : a.label, cls: 'label app-label row' });
    at.set(a.role, { cx, cy: y + size / 2, r: size / 2 });
  });
}
/** How far the row may slide: 0 … −(its length beyond the screen). */
export const rowLimit = (n, { w = 390, k = w / 390 } = {}) => Math.min(0, w - (40 * k * 2 + n * 70 * k));
function glyphSave({ cx, cy }, k, add) { // an arrow down into a tray: save into a folder
  add('path', { d: `M ${cx} ${cy - 11 * k} V ${cy + 3 * k} M ${cx - 6 * k} ${cy - 3 * k} L ${cx} ${cy + 3 * k} L ${cx + 6 * k} ${cy - 3 * k} M ${cx - 12 * k} ${cy + 3 * k} V ${cy + 10 * k} H ${cx + 12 * k} V ${cy + 3 * k}`, cls: 'glyph row' });
}
function glyphPrint({ cx, cy }, k, add) { // a printer: paper in, paper out
  add('path', { d: `M ${cx - 7 * k} ${cy - 4 * k} V ${cy - 11 * k} H ${cx + 7 * k} V ${cy - 4 * k} M ${cx - 12 * k} ${cy + 6 * k} V ${cy - 4 * k} H ${cx + 12 * k} V ${cy + 6 * k} H ${cx - 12 * k} M ${cx - 7 * k} ${cy + 2 * k} V ${cy + 11 * k} H ${cx + 7 * k} V ${cy + 2 * k}`, cls: 'glyph row' });
}
function glyphShare({ cx, cy }, k, add, extra = '') { // three dots, two lines: the share sign every phone knows
  const p = [[cx + 8 * k, cy - 9 * k], [cx - 8 * k, cy], [cx + 8 * k, cy + 9 * k]];
  add('path', { d: `M ${p[0]} L ${p[1]} L ${p[2]}`.replace(/,/g, ' '), cls: `glyph${extra}` });
  for (const [x, y] of p) add('circle', { cx: x, cy: y, r: 3.5 * k, cls: `glyph dot${extra}` });
}
function glyphCopy({ cx, cy }, k, add) {
  const r = (x, y) => `M ${x + 2 * k} ${y} h ${10 * k} a ${2 * k} ${2 * k} 0 0 1 ${2 * k} ${2 * k} v ${12 * k} a ${2 * k} ${2 * k} 0 0 1 ${-2 * k} ${2 * k} h ${-10 * k} a ${2 * k} ${2 * k} 0 0 1 ${-2 * k} ${-2 * k} v ${-12 * k} a ${2 * k} ${2 * k} 0 0 1 ${2 * k} ${-2 * k} Z`;
  add('path', { d: `${r(cx - 11 * k, cy - 12 * k)} ${r(cx - 3 * k, cy - 4 * k)}`, cls: 'glyph ghost' });
}

/**
 * The first circle (14.11.): before something goes to a sharing point for the first time. The window's form with
 * the four strands on its sides, where the arcs are (tap = on / off); in the middle how much: 1 = this take,
 * → = from now on, a number = everything so far; tap in the middle = yes, ↓ = nothing goes.
 * c: { label, kinds, how, count } → { shapes, at }
 */
export function confirmShapes(c, { w = 390, h = 844, k = w / 390 } = {}) {
  const shapes = [], at = new Map(), add = (type, o) => shapes.push({ type, ...o });
  const s = 220 * k, cx = w / 2, cy = h * 0.42, x = cx - s / 2, y = cy - s / 2;
  add('sheet', { x: 0, y: 0, w, h, r: 0, cls: 'sheet', role: 'sheet' });
  add('sheet', { x, y, w: s, h: s, r: 40 * k, cls: 'sp confirm' });
  for (const kind of EDGES) {
    const bar = sideOf(SIDES[kind], { x, y, s, r: 40 });
    const on = c.kinds.includes(kind);
    add('line', { ...bar, cls: `strand ${on ? 'own' : 'off'}`, role: `confirm:${kind}` });
    add('line', { ...bar, cls: 'hit', role: `confirm:${kind}` });
  }
  add('circle', { cx, cy, r: 44 * k, cls: 'confirm-ok', role: 'confirm:ok' });
  add('label', { x: cx, y: cy + 8 * k, text: c.how === 'new' ? '→' : String(c.count ?? 1), cls: 'label confirm-count' });
  add('label', { x: cx, y: y + s + 30 * k, text: c.label, cls: 'label' });
  at.set('confirm:ok', { cx, cy, r: 44 * k });
  return { shapes, at };
}
