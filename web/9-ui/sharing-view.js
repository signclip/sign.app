// sharing-view.js — the sharing menu as positions and looks (16.11.), opened by ↑ on the button.
//
// Purpose:   top left the accounts on this device as small bubbles (Admin, Atlas, Groups square: they come straight from
//            our Nextcloud; every other account round), the current one ringed; top right the + (takes the clipboard:
//            a folder, a federated id, a local folder; empty clipboard = a new account on this device = onboarding).
//            Below the tiles: first this device with the current account's name in a round bubble (in front: what is
//            taken from now on; behind it a second bubble: what is stored already). Then every sharing point. At the
//            bottom what the system offers: save, print (only if possible), the preferred messenger, mail, more.
//            The way into Sign shows as bubbles beside the device, never as text (JOIN_LOOKS):
//              offer     hello bubble, right of the device and a little above (like the sharing sign)
//              sending   the line to it builds up, dots (the strands) run over it
//              sent      hello dashed, the line solid                accepted  hello thick, a join bubble under it
//              loading   the line from join runs dashed towards me    joined    join solid, its word becomes sign;
//                                                                              hello goes, my own Nextcloud folder comes
//            Connections: a line from a device bubble to a tile. From the front bubble (dashed) = from now on; from the
//            back bubble (solid, thick) = all stored is copied too, and from now on. Which strands flow: the small arcs
//            around a tile, tapped one by one. A dark inner edge = encrypted (double tap on a local bubble).
// Depends:   nothing
// Test:      tests/ui.test.mjs
// Limits:    ≤ 8 account bubbles (more scroll) · tiles 3 per row on a phone, 5 on a tablet · ≤ 5 system targets.

export const ROLES = ['admin', 'atlas', 'groups'];
export const JOIN_LOOKS = ['none', 'offer', 'sending', 'sent', 'accepted', 'loading', 'joined'];
export const PILES = ['hello', 'join', 'within', 'quiet'];

/**
 * The look of the way in, from what share-group.js reports. door: null | 'door' | 'hello' | 'ready' | 'join' |
 * 'join-own' | 'within' · busy: 'hello' | 'join' while it is on its way · ready: enough takes for a hello (name sign
 * + 3 password gestures) · linked: the account already has its own Nextcloud. → one of JOIN_LOOKS
 */
export function joinLook({ door = null, busy = null, ready = false, linked = false } = {}) {
  if (linked || door === 'join' || door === 'join-own' || door === 'within') return 'joined';
  if (busy === 'join') return 'loading';
  if (door === 'ready') return 'accepted';
  if (busy === 'hello') return 'sending';
  if (door === 'hello') return 'sent';
  return ready ? 'offer' : 'none';
}

/** Is an account a role (square bubble)? */
export const isRole = (account) => ROLES.includes(account?.role);

/** What the + does now: take the clipboard, or start a new account. */
export const plusDoes = (clip) => (String(clip ?? '').trim() ? 'paste' : 'new-account');

/**
 * Positions. menu: { accounts, tiles, piles (admin: { hello: n, … } or null), join (JOIN_LOOKS), native } · size { w, h }
 * → { k, accounts: [{ x, y, s, square, current }], plus, device: { x, y, s, front, back }, hello, join, tiles: [{ n, x, y, s }],
 *     piles: [{ pile, x, y, s, n }], native: [{ id, x, y, s }] }
 */
export function menuLayout(menu, { w, h }) {
  const k = Math.min(w / 390, h / 760);
  const pad = 18 * k, top = 34 * k;
  const accounts = (menu.accounts ?? []).slice(0, 8).map((a, i) => ({ ...a, x: pad + 14 * k + i * 34 * k, y: top, s: 26 * k, square: isRole(a) }));
  const plus = { x: w - pad - 14 * k, y: top, s: 30 * k };
  const cols = w >= 700 ? 5 : 3, gap = 14 * k;
  const ts = Math.min(112 * k, (w - 2 * pad - gap * (cols - 1)) / cols);
  const dy = top + 44 * k;
  const device = { x: pad, y: dy + 22 * k, s: ts * 1.15 };
  device.front = { x: device.x + device.s * 0.58, y: device.y + device.s * 0.5, r: device.s * 0.27 };
  device.back = { x: device.x + device.s * 0.3, y: device.y + device.s * 0.42, r: device.s * 0.2 };
  const hello = { x: device.x + device.s + 54 * k, y: device.y - 4 * k, r: 24 * k };
  const join = { x: hello.x, y: hello.y + 66 * k, r: 24 * k };
  let y = device.y + device.s + 36 * k;
  const piles = menu.piles ? PILES.map((pile, i) => ({ pile, n: menu.piles[pile] ?? 0, x: pad + i * ((w - 2 * pad) / 4), y, s: (w - 2 * pad) / 4 - gap })) : [];
  if (piles.length) y += piles[0].s + 26 * k;
  const tiles = (menu.tiles ?? []).map((t, i) => ({ ...t, x: pad + (i % cols) * (ts + gap), y: y + Math.floor(i / cols) * (ts + 26 * k), s: ts }));
  const natives = (menu.native ?? []).slice(0, 5);
  const ns = 46 * k, nGap = (w - 2 * pad - natives.length * ns) / Math.max(1, natives.length - 1);
  const native = natives.map((n, i) => ({ ...n, x: pad + i * (ns + nGap), y: h - pad - ns - 8 * k, s: ns }));
  return { k, accounts, plus, device, hello, join, tiles, piles, native };
}

/** A tile's small arcs (consent: which strands flow there), as degrees like the take: v left · x bottom · a right. */
export const TILE_ARCS = Object.freeze({ v: [220, 300], x: [140, 220], a: [60, 140] });

/** The line between two points, bent a little upwards (a bridge). */
export function bridge(a, b, bend = 0.18) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * bend;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** A connection's look: from the front bubble = new only (dashed), from the back = all (solid, thick). */
export const linkLook = (from) => (from === 'all' ? 'all' : 'new');
