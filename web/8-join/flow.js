// flow.js — the onboarding and the admin's door as plain steps (15.11., approved): no screen, no files, no network.
//
// Purpose:   one file that says what comes next, so the surface only draws it and a test can play the whole way:
//              person    name → name sign → password gesture 1 → 2 → own (each one take) → hello to the door
//                        (project.json) → join (her answer) → within (her own Sign/ replaces the door tile)
//              admin     the four piles hello · join · within · quiet, always there (0 = faint); in the Doppel
//                        ↑ = on, ↓ = back; a new device stands as a Doppel beside the original (known.js)
//              accounts  every person on this device is an account: a small circle upper left, the current one
//                        ringed. A person whose list holds the Admin, Atlas or Groups login (project.json) is that
//                        role: she says no hello at the door, her login is no storage tile (decided 15.11.)
// Depends:   nothing (the door's moves are done by door.js, share-group.js; this file only names them)
// Test:      tests/flow.test.mjs
// Limits:    3 password gestures · 4 piles + index (Atlas) · 3 roles; a person has at most one role (the first found).

/** The pieces of a hello's password gestures: two drawn words, then one's own (SCHEMA B6). */
export const PASSWORD_PARTS = ['password gesture 1', 'password gesture 2', 'password gesture own'];

/** The person's way, in order. 'wait' = the hello is out, the admin has not answered yet. */
export const PERSON_STEPS = ['name', 'name sign', ...PASSWORD_PARTS, 'hello', 'wait', 'join', 'within', 'done'];

/**
 * What comes next for a person. joinState: the door's state (share-group followJoins): null/'door' · 'hello' · 'ready' ·
 * 'join' · 'join-own' · 'within'. role: 'admin' · 'atlas' · 'groups' · null. → one of PERSON_STEPS, or 'role'.
 */
export function personStep({ name = '', nameSign = false, gestures = 0, joinState = null, role = null } = {}) {
  if (role) return 'role'; // Admin, Atlas, Groups: their login is their account, no door
  if (!name.trim()) return 'name';
  if (!nameSign) return 'name sign';
  if (gestures < PASSWORD_PARTS.length) return PASSWORD_PARTS[gestures];
  if (!joinState || joinState === 'door') return 'hello';
  if (joinState === 'hello') return 'wait';
  if (joinState === 'ready') return 'join';
  if (joinState === 'join' || joinState === 'join-own') return 'within';
  return 'done';
}

/** The admin's piles and what a swipe in the Doppel does there (null = nothing). ↓↓ = delete (backup/model first). */
export const PILES = ['hello', 'join', 'within', 'quiet'];
export const ADMIN_MOVES = {
  hello: { up: 'welcome', down: 'quiet', downTwice: null },
  join: { up: 'within', down: 'hello', downTwice: null },
  within: { up: null, down: 'quiet', downTwice: null },
  quiet: { up: 'within', down: null, downTwice: 'delete' },
};
export const moveOf = (pile, swipe) => ADMIN_MOVES[pile]?.[swipe] ?? null;

/**
 * The row of piles: always all four, with their counts (only those that match the context words), plus index for
 * Atlas. counts: { hello, join, within, quiet } → [{ pile, count, faint }]
 */
export function pilesOf(counts = {}, { atlas = false } = {}) {
  const row = PILES.map((pile) => ({ pile, count: counts[pile] ?? 0, faint: !(counts[pile] > 0) }));
  return atlas ? [...row, { pile: 'index', count: null, faint: false }] : row;
}

/** Which role a Nextcloud login plays (project.json names them; admin also when Nextcloud says so: provision.isAdmin). */
export function roleOf(user, project = {}, { admin = false } = {}) {
  const u = String(user ?? '').toLowerCase(), is = (x) => Boolean(x) && u === String(x).toLowerCase();
  if (admin || is(project.admin)) return 'admin';
  if (is(project.atlas)) return 'atlas';
  if (is(project.groups)) return 'groups';
  return null;
}

/**
 * The accounts upper left: every person on this device, the current one ringed, each with her role.
 * persons: [{ id, label }] · current: id · roles: Map(id → role) → [{ id, label, current, role }]
 */
export function accountsOf(persons = [], current = null, roles = new Map()) {
  return persons.map((p) => ({ id: p.id, label: p.label || '?', current: p.id === current, role: roles.get(p.id) ?? null }));
}
