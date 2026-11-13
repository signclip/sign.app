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
//                          (left visual · right audio · bottom context · top landmarks, as in the ring)
//              bridges     lines between tiles: copy (solid) or encrypted backup (double line);
//                          0 → n = every take goes there
//              dashed +    bring a new one in: clipboard · folder
//              dashed blue a share waiting for me (tap = take in), or the other side's page to accept
//                          what I just gave (tap = open it, log in there if asked)
//              browse      after a login: the folders of the account as tiles, ↑ = one level up
//            Names under the tiles are the only words (a sharing point has no other face).
// Depends:   nothing (shapes are drawn by view/ring.js toSvg)
// Test:      tests/ui.test.mjs
// Limits:    3 tiles a row on a 390 px phone, up to 40 sharing points (the area scrolls past 12).

// Where each strand shows on a tile: the same sides as on the ring (left visual, right audio,
// bottom context, top landmarks), as a short bar on that edge.
const EDGES = ['v', 'a', 'x', 'l'];
const COLS = 3;

function grid(i, { w, k, y0 }) {
  const gap = w / COLS;
  return { cx: gap / 2 + (i % COLS) * gap, cy: y0 + Math.floor(i / COLS) * 112 * k };
}

/** The bar of one strand on a tile's edge. */
function edgeBar(kind, { cx, cy, tw, th }) {
  const inset = 14;
  if (kind === 'v') return { x1: cx - tw / 2, y1: cy - th / 2 + inset, x2: cx - tw / 2, y2: cy + th / 2 - inset };
  if (kind === 'a') return { x1: cx + tw / 2, y1: cy - th / 2 + inset, x2: cx + tw / 2, y2: cy + th / 2 - inset };
  if (kind === 'x') return { x1: cx - tw / 2 + inset, y1: cy + th / 2, x2: cx + tw / 2 - inset, y2: cy + th / 2 };
  return { x1: cx - tw / 2 + inset, y1: cy - th / 2, x2: cx + tw / 2 - inset, y2: cy - th / 2 };
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
  // bridges first, so the tiles lie on top of them
  for (const t of all) {
    if (t.under) continue;
    const to = centre(t.n);
    if (t.always) add('line', { ...ends(centre(0), to), cls: 'bridge own', role: `bridge:0:${t.n}` });
    if (t.backupOwn) add('line', { ...ends(centre(0), to), cls: 'bridge backup', role: `bridge:0:${t.n}` });
    for (const m of t.copyTo) add('line', { ...ends(to, centre(m)), cls: 'bridge own', role: `bridge:${t.n}:${m}` });
    for (const m of t.backupTo) add('line', { ...ends(to, centre(m)), cls: 'bridge backup', role: `bridge:${t.n}:${m}` });
  }

  tile(0, 'sp:0', 'sp own-device', own);
  for (const t of all) {
    if (t.under) continue; // the drop link of a group: drawn as part of its read tile
    const cls = ['sp', t.state, t.shown && 'shown', t.always && 'always', focus === t.n && 'focus'].filter(Boolean).join(' ');
    const { cx, cy } = tile(slot.get(t.n), `sp:${t.n}`, `${cls}${t.group ? ' group' : ''}`, t.label);
    const joined = joinStates.get(t.label); // the sharing icon growing: one circle = hello sent, two = joined
    if (joined) {
      add('circle', { cx: cx + tw / 2 - 4 * k, cy: cy - th / 2 + 4 * k, r: 7 * k, cls: 'badge' });
      if (joined === 'join') add('circle', { cx: cx + tw / 2 + 6 * k, cy: cy - th / 2 + 4 * k, r: 7 * k, cls: 'badge joined' });
    }
    for (const kind of EDGES) {
      const look = !t.kinds.includes(kind) ? 'off' : t.always ? 'own' : 'new';
      const bar = edgeBar(kind, { cx, cy, tw, th });
      add('line', { ...bar, cls: `strand mini ${look}`, role: `sp-kind:${t.n}:${kind}` });
      add('line', { ...bar, cls: 'hit', role: `sp-kind:${t.n}:${kind}` }); // a wider, unseen line to hit
    }
  }
  let next = slot.size;
  hellos.forEach((x, i) => { // signer: someone said hello (circles, as the sharing icon); tap = welcome
    const { cx, cy } = grid(next++, { w, k, y0 });
    at.set(`hello:${i}`, { cx, cy, r: 26 * k });
    add('circle', { cx, cy, r: 26 * k, cls: 'hello', role: `hello:${i}` });
    add('circle', { cx: cx + 10 * k, cy: cy - 10 * k, r: 8 * k, cls: 'hello-dot' });
    add('label', { x: cx, y: cy + 44 * k, text: x.label, cls: 'label' });
  });
  incoming.forEach((x, i) => tile(next++, `incoming:${i}`, 'sp incoming', x.label)); // waiting for me: tap = take in
  if (acceptThere) tile(next++, 'accept-there', 'sp incoming there', acceptThere.label); // tap = their page to accept
  tile(next, 'add:paste', `sp add${waitSecret ? ' now' : ''}`, '', { stack: false });
  tile(next + 1, 'add:folder', 'sp add', '', { stack: false });
  glyphPaste(at.get('add:paste'), k, add);
  glyphFolder(at.get('add:folder'), k, add);
  return { shapes, at };
}

/** A line from tile centre to tile centre (the tiles lie on top). */
function ends(a, b) {
  return { x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy };
}

// two small sheets = the clipboard
function glyphPaste({ cx, cy }, k, add) {
  add('path', { d: `M ${cx - 8 * k} ${cy - 10 * k} h ${12 * k} v ${16 * k} h ${-12 * k} z M ${cx - 4 * k} ${cy - 6 * k} h ${12 * k} v ${16 * k} h ${-12 * k} z`, cls: 'glyph' });
}
// a folder
function glyphFolder({ cx, cy }, k, add) {
  add('path', { d: `M ${cx - 11 * k} ${cy - 7 * k} h ${8 * k} l ${3 * k} ${3 * k} h ${11 * k} v ${12 * k} h ${-22 * k} z`, cls: 'glyph' });
}
