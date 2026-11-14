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
export function pointShapes(all, { own = '', admin = null, pulse = null, flash = null, appear = false, fresh = new Set(), focus = null, waitSecret = false, clip = 'ready', shake = null, zoom = null, apps = null, browse = null, incoming = [], acceptThere = null, hellos = [], joinStates = new Map() }, { w = 390, h = 844, k = w / 390, top = h * 0.4 } = {}) {
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
  /** The growing sharing icon in the group's spot: me · group · my own space. */
  function joinIcon(i, t, state) {
    const { cx, cy } = grid(i, { w, k, y0 });
    const r = 19 * k, me = [cx - 38 * k, cy], group = [cx + 32 * k, cy - 25 * k], mine = [cx + 32 * k, cy + 25 * k]; // big, like a tile (14.11.)
    const line = ([x1, y1], [x2, y2], cls) => add('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, cls: `join-line ${cls}` });
    if (state === 'door') { // onboarding: the door as a hello bubble, breathing; tap it = hello (or drag yourself onto it)
      add('circle', { cx: me[0], cy: me[1], r, cls: 'join-me', role: 'sp:0' });
      add('circle', { cx: group[0], cy: group[1], r: r * 1.4, cls: 'join-group door breathe', role: `sp:${t.n}` });
      add('label', { x: cx, y: cy + th / 2 + 18 * k, text: t.label, cls: 'label' });
      at.set(`sp:${t.n}`, { cx: group[0], cy: group[1], r: r * 1.4 });
      return;
    }
    const grow = (n) => (fresh.has(t.label) ? ` appear a${n}` : ''); // a new state: the symbol builds up, me → line → group → own
    line(me, group, `${state === 'hello' ? 'hello' : 'join'}${grow(2)}`);
    if (state !== 'hello') line(me, mine, `${state === 'join-own' ? 'join own' : 'hello own'}${grow(4)}`);
    add('circle', { cx: me[0], cy: me[1], r, cls: `join-me${grow(1)}` });
    add('circle', { cx: group[0], cy: group[1], r, cls: `join-group${state === 'hello' ? ' waiting' : ''}${grow(3)}`, role: `sp:${t.n}` });
    if (state !== 'hello') add('circle', { cx: mine[0], cy: mine[1], r, cls: `join-own${state === 'join-own' ? '' : ' waiting'}${grow(5)}` });
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
  const ghost = clip !== 'ready' && !waitSecret; // nothing to take: the copy sign says "copy something first"
  tile(next, 'add:new', `sp add${waitSecret ? ' now' : ''}${ghost ? ' ghost' : ''}${pulse === 'add:new' ? ' breathe' : ''}`, '', { stack: false });
  (ghost ? glyphCopy : glyphPlus)(at.get('add:new'), k, add);
  tile(next + 1, 'out:system', 'sp out', '', { stack: false }); // the classic way out (14.11.): the system share sheet to other apps
  glyphShare(at.get('out:system'), k, add);
  if (apps?.list?.length) appRow(apps, { w, h, k, add, at }); // Android: the apps right here, at the bottom of the sheet
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
/** The share row (14.11.): up to 5 apps side by side, the most used first; ← → = more; tap = the last take goes there. */
function appRow({ list, page = 0 }, { w, h, k, add, at }) {
  const per = 5, size = 44 * k, y = h - 112 * k, gap = w / per;
  add('line', { x1: 24 * k, y1: y - 16 * k, x2: w - 24 * k, y2: y - 16 * k, cls: 'apps-rule' });
  list.slice(page * per, page * per + per).forEach((a, i) => {
    const cx = gap * (i + 0.5), role = `app:${page * per + i}`;
    add('image', { png: a.icon, x: cx - size / 2, y, s: size, cls: 'app', role });
    add('label', { x: cx, y: y + size + 14 * k, text: a.label.length > 11 ? `${a.label.slice(0, 10)}…` : a.label, cls: 'label app-label' });
    at.set(role, { cx, cy: y + size / 2, r: size / 2 });
  });
  if (list.length > per) add('label', { x: w / 2, y: y + size + 32 * k, text: '·'.repeat(Math.ceil(list.length / per)).split('').map((d, i) => (i === page ? '•' : d)).join(' '), cls: 'label app-label' });
}
function glyphShare({ cx, cy }, k, add) { // three dots, two lines: the share sign every phone knows
  const p = [[cx + 8 * k, cy - 9 * k], [cx - 8 * k, cy], [cx + 8 * k, cy + 9 * k]];
  add('path', { d: `M ${p[0]} L ${p[1]} L ${p[2]}`.replace(/,/g, ' '), cls: 'glyph' });
  for (const [x, y] of p) add('circle', { cx: x, cy: y, r: 3.5 * k, cls: 'glyph dot' });
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
