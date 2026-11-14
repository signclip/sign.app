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
//              dashed +    ONE tile to bring a new one in (13.11.): a link or address on the clipboard is taken,
//                          else a folder or disk is chosen; everything else is a connection between tiles
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
  const inward = kind === 'l' ? 6 : 0; // a second track on the same side (landmarks next to visual), a little inside
  const bar = sideOf(SIDES[kind], { x: cx - tw / 2 + inward, y: cy - th / 2, s: tw - 2 * inward, r: 14 });
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
export function pointShapes(all, { own = '', focus = null, waitSecret = false, browse = null, incoming = [], acceptThere = null, hellos = [], joinStates = new Map() }, { w = 390, h = 844, k = w / 390, top = h * 0.4 } = {}) {
  const tw = 86 * k; // a tile: a rounded rectangle, two layers behind it = much lies inside
  const th = 64 * k;
  const y0 = top + 72 * k; // first row, under the handle
  const shapes = [];
  const at = new Map();
  const add = (type, o) => shapes.push({ type, ...o });
  add('sheet', { x: 0, y: top, w, h: h - top + 24 * k, r: 24 * k, cls: 'sheet', role: 'sheet' });
  add('line', { x1: w / 2 - 20 * k, y1: top + 12 * k, x2: w / 2 + 20 * k, y2: top + 12 * k, cls: 'handle', role: 'sheet' }); // pull down = away

  const tile = (i, role, cls, label, { stack = true } = {}) => {
    const { cx, cy } = grid(i, { w, k, y0 });
    at.set(role, { cx, cy, r: th / 2 });
    if (stack) for (const d of [8, 4]) add('sheet', { x: cx - tw / 2 + d * k, y: cy - th / 2 - d * k, w: tw, h: th, r: 14 * k, cls: 'tile-behind' });
    add('sheet', { x: cx - tw / 2, y: cy - th / 2, w: tw, h: th, r: 14 * k, cls, role });
    if (label) add('label', { x: cx, y: cy + th / 2 + 18 * k, text: label, cls: 'label' });
    return { cx, cy };
  };

  if (browse) { // after a login: choose the folder
    browse.forEach((b, i) => tile(i, `browse:${i}`, `sp folder${i === 0 ? ' always' : ''}`, b.label));
    return { shapes, at };
  }

  // positions: this device first, then every drawn tile in order; a group's drop link sits under its read tile
  const slot = new Map([[0, 0]]);
  for (const t of all.filter((x) => !x.under)) slot.set(t.n, slot.size);
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

  tile(0, 'sp:0', 'sp own-device', own);
  const joining = (t) => ['door', 'hello', 'join', 'join-own'].includes(joinStates.get(t.label));
  for (const t of all) {
    if (t.under) continue; // the drop link of a group: drawn as part of its read tile
    if (joining(t)) { joinIcon(slot.get(t.n), t, joinStates.get(t.label)); continue; } // joining: the growing icon
    const cls = ['sp', t.state, t.shown && 'shown', t.always && 'always', focus === t.n && 'focus'].filter(Boolean).join(' ');
    const { cx, cy } = tile(slot.get(t.n), `sp:${t.n}`, `${cls}${t.group ? ' group' : ''}`, t.label);
    if (t.seal === 'ok' || t.seal === 'wrong') add('circle', { cx: cx - tw / 2 + 4 * k, cy: cy - th / 2 + 4 * k, r: 6 * k, cls: `badge ${t.seal === 'ok' ? 'sealed' : 'unsealed'}` });
    if (t.readOnly && !t.drop) add('sheet', { x: cx - tw / 2 + 5 * k, y: cy - th / 2 + 5 * k, w: tw - 10 * k, h: th - 10 * k, r: 10 * k, cls: 'view-only' });
    if (t.run === 'ok' || t.run === 'error') { // last copy or backup: filled dot = went through · open ring = failed
      add('circle', { cx: cx + tw / 2 - 4 * k, cy: cy + th / 2 - 4 * k, r: 6 * k, cls: `badge ${t.run === 'ok' ? 'ran' : 'failed'}` });
    }
    for (const kind of EDGES) {
      const look = !t.kinds.includes(kind) ? 'off' : t.always ? 'own' : 'new';
      const bar = edgeBar(kind, { cx, cy, tw, th });
      add('line', { ...bar, cls: `strand mini ${look}`, role: `sp-kind:${t.n}:${kind}` });
      add('line', { ...bar, cls: 'hit', role: `sp-kind:${t.n}:${kind}` }); // a wider, unseen line to hit
    }
  }
  for (const [a, b, cls] of bridges) chevron(a, b, k, add, cls); // on top: which way it runs
  /** The growing sharing icon in the group's spot: me · group · my own space. */
  function joinIcon(i, t, state) {
    const { cx, cy } = grid(i, { w, k, y0 });
    const r = 13 * k, me = [cx - 34 * k, cy], group = [cx + 30 * k, cy - 22 * k], mine = [cx + 30 * k, cy + 22 * k];
    const line = ([x1, y1], [x2, y2], cls) => add('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, cls: `join-line ${cls}` });
    if (state === 'door') { // onboarding: the door as a hello bubble, breathing; drag yourself (your tile or this circle) onto it
      add('circle', { cx: me[0], cy: me[1], r, cls: 'join-me', role: 'sp:0' });
      add('circle', { cx: group[0], cy: group[1], r: r * 1.4, cls: 'join-group door breathe', role: `sp:${t.n}` });
      add('label', { x: cx, y: cy + th / 2 + 18 * k, text: t.label, cls: 'label' });
      at.set(`sp:${t.n}`, { cx: group[0], cy: group[1], r: r * 1.4 });
      return;
    }
    line(me, group, state === 'hello' ? 'hello' : 'join');
    if (state !== 'hello') line(me, mine, state === 'join-own' ? 'join own' : 'hello own');
    add('circle', { cx: me[0], cy: me[1], r, cls: 'join-me' });
    add('circle', { cx: group[0], cy: group[1], r, cls: `join-group${state === 'hello' ? ' waiting' : ''}`, role: `sp:${t.n}` });
    if (state !== 'hello') add('circle', { cx: mine[0], cy: mine[1], r, cls: `join-own${state === 'join-own' ? '' : ' waiting'}` });
    add('label', { x: cx, y: cy + th / 2 + 18 * k, text: t.label, cls: 'label' });
    at.set(`sp:${t.n}`, { cx: group[0], cy: group[1], r });
  }

  let next = slot.size;
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
  tile(next, 'add:new', `sp add${waitSecret ? ' now' : ''}`, '', { stack: false });
  glyphPlus(at.get('add:new'), k, add);
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

// a plus: one more sharing point
function glyphPlus({ cx, cy }, k, add) {
  add('path', { d: `M ${cx - 10 * k} ${cy} H ${cx + 10 * k} M ${cx} ${cy - 10 * k} V ${cy + 10 * k}`, cls: 'glyph' });
}
