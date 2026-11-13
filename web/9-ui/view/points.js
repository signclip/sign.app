// view/points.js — the sharing points as circles in a sheet that rises from the point after ↑.
//
// Sheet:     a rectangle with rounded corners from the lower edge up (decided 13.11.); pulled down = away
//            ("egal", nothing changes); inside, each sharing point can be chosen on its own.
//
// Purpose:   no chips, everything is seen on the circle (share-menu.js says what the gestures do):
//              circle      one sharing point; the first one (0) is this device
//                          filled blue = brought in (shows in Similar) · dashed grey = not there now
//                          (disk unplugged) or not reachable · green ring = shared to last
//              mini arcs   which strands go there: solid = always, dashed = only on a tap, grey = not
//                          (left visual · right audio · bottom context · top landmarks, as in the ring)
//              bridges     lines between circles: copy (solid) or encrypted backup (double line);
//                          0 → n = every take goes there
//              dashed +    bring a new one in: clipboard · folder
//              dashed blue a share waiting for me (tap = take in), or the other side's page to accept
//                          what I just gave (tap = open it, log in there if asked)
//              browse      after a login: the folders of the account as circles, ↑ = one level up
//            Names under the circles are the only words (a sharing point has no other face).
// Depends:   nothing (shapes are drawn by view/ring.js toSvg)
// Test:      tests/ui.test.mjs
// Limits:    4 circles a row on a 390 px phone, up to 40 sharing points (the area scrolls past 12).

const ARCS = { l: [-40, 40], a: [50, 130], x: [140, 220], v: [230, 310] };
const COLS = 4;

function grid(i, { w, k, y0 }) {
  const gap = w / COLS;
  return { cx: gap / 2 + (i % COLS) * gap, cy: y0 + Math.floor(i / COLS) * 96 * k };
}

/**
 * all: tiles (share-menu.js) · own: label of this device · focus: n shared to last · waitSecret: true
 * when a pasted password is awaited · browse: [{ label }] folders after a login, or null ·
 * incoming: [{ label }] shares waiting for me · acceptThere: { label } the other side's page to accept.
 * → { shapes, at: Map(role → { cx, cy, r }) }
 */
export function pointShapes(all, { own = '', focus = null, waitSecret = false, browse = null, incoming = [], acceptThere = null }, { w = 390, h = 844, k = w / 390, top = h * 0.4 } = {}) {
  const r = 28 * k;
  const y0 = top + 64 * k; // first row of circles, under the handle
  const shapes = [];
  const at = new Map();
  const add = (type, o) => shapes.push({ type, ...o });
  add('sheet', { x: 0, y: top, w, h: h - top + 24 * k, r: 24 * k, cls: 'sheet', role: 'sheet' });
  add('line', { x1: w / 2 - 20 * k, y1: top + 12 * k, x2: w / 2 + 20 * k, y2: top + 12 * k, cls: 'handle', role: 'sheet' }); // pull down = away
  const circle = (i, role, cls, label) => {
    const { cx, cy } = grid(i, { w, k, y0 });
    at.set(role, { cx, cy, r });
    add('circle', { cx, cy, r, cls, role });
    if (label) add('label', { x: cx, y: cy + r + 18 * k, text: label, cls: 'label' });
    return { cx, cy };
  };

  if (browse) { // after a login: choose the folder
    browse.forEach((b, i) => circle(i, `browse:${i}`, `sp folder${i === 0 ? ' always' : ''}`, b.label));
    return { shapes, at };
  }

  // bridges first, so the circles lie on top of them
  const centre = (n) => grid(n, { w, k, y0 }); // circle n sits at position n (0 = this device)
  for (const tile of all) {
    const to = centre(tile.n);
    if (tile.always) add('line', { ...ends(centre(0), to), cls: 'bridge own', role: `bridge:0:${tile.n}` });
    if (tile.backupOwn) add('line', { ...ends(centre(0), to), cls: 'bridge backup', role: `bridge:0:${tile.n}` });
    for (const m of tile.copyTo) add('line', { ...ends(to, centre(m)), cls: 'bridge own', role: `bridge:${tile.n}:${m}` });
    for (const m of tile.backupTo) add('line', { ...ends(to, centre(m)), cls: 'bridge backup', role: `bridge:${tile.n}:${m}` });
  }

  circle(0, 'sp:0', 'sp own-device', own);
  for (const tile of all) {
    const cls = ['sp', tile.state, tile.shown && 'shown', tile.always && 'always', focus === tile.n && 'focus'].filter(Boolean).join(' ');
    const { cx, cy } = circle(tile.n, `sp:${tile.n}`, cls, tile.label);
    for (const [kind, [from, to]] of Object.entries(ARCS)) {
      const look = !tile.kinds.includes(kind) ? 'off' : tile.always ? 'own' : 'new';
      add('arc', { cx, cy, r: r + 7 * k, from, to, cls: `strand mini ${look}`, role: `sp-kind:${tile.n}:${kind}` });
      add('arc', { cx, cy, r: r + 7 * k, from, to, cls: 'hit', role: `sp-kind:${tile.n}:${kind}` }); // a wider, unseen line to hit
    }
  }
  let next = all.length + 1;
  incoming.forEach((x, i) => circle(next++, `incoming:${i}`, 'sp incoming', x.label)); // waiting for me: tap = take in
  if (acceptThere) circle(next++, 'accept-there', 'sp incoming there', acceptThere.label); // tap = their page to accept
  circle(next, 'add:paste', `sp add${waitSecret ? ' now' : ''}`, '');
  circle(next + 1, 'add:folder', 'sp add', '');
  glyphPaste(at.get('add:paste'), k, add);
  glyphFolder(at.get('add:folder'), k, add);
  return { shapes, at };
}

/** A line from circle edge to circle edge. */
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
