// limits.js — every buffer and every count the app and the gateway hold to, in one table (27.11., user: "alle
//            Ressourcenpuffer flexibel anpassbar … jeweils einzeln und Vorauswahl anpassbar").
//
// Purpose:   before, each module carried its own number (8 MiB here, 50 there): to change one meant a new build.
//            Now a module asks limit('piece') at the moment it starts something, and the table answers with
//              the preselection the value written here, tried and measured (the modules' headers say how)
//              the project's    app/project.json "limits": { "piece": "16 MiB" } – one preselection for every device
//              the server's     gateway.env LIMITS=gateway.asks=6000,gateway.nonces=2000000
//              the device's     one value for this device alone (9-ui keeps it under sign.limits)
//            the last one given counts, in this order (ORDER). Each value has a least and a most: outside them it
//            is refused and said so in numbers, nothing is cut to fit in silence.
//            Fixed entries are in the same table, with the reason: a number that is part of a file's form or of a
//            foreign rule (S3) cannot differ on one device. How deep a swarm or a group in a group goes is
//            no limit at all (27.11., user: depth is free): a swarm reaches as far as its touches.
//              limit(name)                   → the value that counts now
//              adjust(name, value, by)       → { name, value, by } | { name, refused }   value: 8388608 | '8 MiB' | null = back
//              adjustAll(values, by)         → { taken: […], refused: […] }   values: { name: value } | 'a=1,b=8 MiB'
//              limitsNow()                   → the whole table as it counts now (for a view, for the log)
// Depends:   nothing.
// Test:      tests/limits.test.mjs
// Limits:    a value counts for what starts after it was given: an upload under way keeps the piece it began with
//            (2-storage/gateway-store.js, webdav.js) · a worker has its own table and reads the preselection ·
//            26 adjustable and 6 fixed entries (27.11.) · limit() ≈ two Map reads.

const KiB = 2 ** 10, MiB = 2 ** 20, GiB = 2 ** 30;

/** Who may give a value, later ones count over earlier ones. A layer between (a sharing point's) can be added here. */
export const ORDER = ['project', 'server', 'device'];

const B = 'B', N = '', CHARS = 'characters';
const one = (value, least, most, unit, where, what) => Object.freeze({ value, least, most, unit, where, what });
const fixed = (value, unit, where, why) => Object.freeze({ value, least: value, most: value, unit, where, what: why, fixed: true });

/** name → { value (the preselection), least, most, unit, where, what [, fixed] } */
export const LIMITS = Object.freeze({
  // how a file travels
  'piece': one(8 * MiB, 5 * MiB, 16 * MiB, B, '2-storage/pieces.js', 'a file goes to a store in pieces of this size (the object storage takes none below 5 MiB; no piece above the bridge)'),
  'whole': one(256 * MiB, 16 * MiB, GiB, B, '2-storage/pieces.js', 'the most a store without pieces gives or takes at once'),
  'in-pieces': one(16 * MiB, 5 * MiB, 16 * MiB, B, '2-storage/gateway-store.js', 'above this a file goes to the object storage in pieces (below: one body, it must pass the bridge)'),
  'at-once': one(3, 1, 6, N, '2-storage/gateway-store.js', 'pieces sent at once (memory: this many pieces and one more)'),
  'bridge': one(48 * MiB, 16 * MiB, 128 * MiB, B, '2-storage/dav-fetch.js', 'the largest body the APK hands to its own HTTP (the bytes lie there three times for a moment)'),
  // how a far take plays
  'stream.first': one(4 * MiB, MiB, 16 * MiB, B, '9-ui/stream.js', 'the beginning of a far file that is read ahead'),
  'stream.piece': one(2 * MiB, MiB, 8 * MiB, B, '9-ui/stream.js', 'each further piece while it plays'),
  'stream.hold': one(64 * MiB, 16 * MiB, 256 * MiB, B, '9-ui/stream.js', 'a far file longer than this is passed on without keeping its pieces'),
  'far.kept': one(96 * MiB, 32 * MiB, 512 * MiB, B, '9-ui/media.js', 'what has come of far files and is not whole yet; the least recently used goes'),
  'ahead': one(10, 2, 50, N, '9-ui/ahead.js', 'files kept ready for the next tap'),
  'ahead.similar': one(3, 0, 10, N, '9-ui/ahead.js', 'results of Similar read ahead'),
  'ahead.line': one(2, 0, 10, N, '9-ui/ahead.js', 'takes of a line read ahead'),
  // what comes in from outside
  'intake': one(500 * MiB, 50 * MiB, 2 * GiB, B, '5-take/intake.js', 'a file from outside that is read at once (memory: about twice its size)'),
  'drop.files': one(100, 10, 1000, N, '8-join/sealed-drop.js', 'files in one sealed drop'),
  'drop.notes': one(50, 10, 500, N, '8-join/sealed-drop.js', 'notes of drops read per look, the newest'),
  'drop.hold': one(64 * MiB, 16 * MiB, 256 * MiB, B, '8-join/sealed-drop.js', 'sealed bytes held between checking a drop and taking it'),
  // the index on the device
  'index.parts': one(32 * MiB, 8 * MiB, 256 * MiB, B, '3-index/parts.js', 'parts of the index kept per store before all are read once more'),
  'index.proven': one(64e6, 8e6, 512e6, CHARS, '3-index/index.js', 'texts whose seal was checked and is remembered'),
  // who comes in
  'hellos': one(50, 10, 500, N, '8-join/group.js', 'hellos read per look at a door, the newest'),
  'touches': one(500, 50, 2000, N, '8-join/swarm.js', 'touches read per look at a swarm (a swarm that is one long line costs rings × touches: 500 = 8 ms, 2,000 ≈ 0.15 s)'),
  'keys': one(200, 200, 2000, N, '2-storage/sealed-keys.js', 'notes with sealed keys read per look, the newest (never fewer: a holder must find its line)'),
  'key.tries': one(100, 100, 1000, N, '2-storage/sealed-keys.js', 'tries to join the parts of a key'),
  'grant.chain': one(8, 3, 32, N, '8-join/grant.js', 'grants in one chain, root first: one per step from the project to a device (a group inside a group needs one more); the gateway checks every seal'),
  // what a line holds
  'line': one(64, 8, 256, N, '9-ui/line.js, 4-save/add-line.js', 'takes in one line'),
  // the gateway (gateway.env LIMITS=)
  'gateway.asks': one(3000, 300, 60000, 'per minute', 'gateway/gateway.mjs', 'asks one key may make, and all who hold one door together'),
  'gateway.nonces': one(1e6, 1e5, 1e7, N, 'gateway/gateway.mjs', 'asks remembered so that none counts twice (≈ 100 B each)'),
  // fixed, and why
  'sealed.piece': fixed(8 * MiB, B, '1-model/sealed.js', 'part of the sealed form: every reader cuts a sealed file by it'),
  'shares': fixed(255, N, '1-model/shares.js', 'a key in parts has at most 255 of them (one byte counts them)'),
  's3.piece.least': fixed(5 * MiB, B, 'gateway/multipart.mjs', 'the object storage takes no smaller piece but the last'),
  's3.piece.most': fixed(512 * MiB, B, 'gateway/multipart.mjs', 'the gateway signs no larger piece'),
  's3.pieces': fixed(10000, N, 'gateway/multipart.mjs', 'the object storage joins no more pieces'),
  's3.put': fixed(5 * GiB, B, 'gateway/gateway.mjs', 'the object storage takes no larger file in one body'),
});

const given = new Map(ORDER.map((by) => [by, new Map()])); // by → name → value

/** The value that counts now: the last one given (ORDER), else the preselection. An unknown name is a mistake in the code. */
export function limit(name) {
  const l = LIMITS[name];
  if (!l) throw new Error(`no limit named ${name}`);
  for (let i = ORDER.length - 1; i >= 0; i--) { const v = given.get(ORDER[i]).get(name); if (v !== undefined) return v; }
  return l.value;
}

const UNITS = { b: 1, kib: KiB, mib: MiB, gib: GiB };
/** 8388608 · '8388608' · '8 MiB' · '64e6' → a whole number, or null when it is none. */
export function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const m = /^\s*([0-9]+(?:\.[0-9]+)?(?:e[0-9]+)?)\s*(b|kib|mib|gib)?\s*$/i.exec(String(value ?? ''));
  return m ? Math.round(Number(m[1]) * UNITS[(m[2] ?? 'b').toLowerCase()]) : null;
}

/** A value as a person reads it: 8 MiB, 64,000,000 characters, 50. */
export function shown(name, value = limit(name)) {
  const { unit } = LIMITS[name];
  if (unit !== B) return `${value.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  for (const [word, size] of [['GiB', GiB], ['MiB', MiB], ['KiB', KiB]]) if (value >= size && value % size === 0) return `${value / size} ${word}`;
  return `${value} B`;
}

/**
 * Give one limit a value for one layer (by), or take that layer's value back (value null).
 * → { name, value, by }: the value that counts now · { name, refused }: why not, in numbers; nothing changed.
 */
export function adjust(name, value, by = 'device') {
  const l = LIMITS[name];
  if (!l) return { name, refused: `no limit named ${name}` };
  if (!given.has(by)) return { name, refused: `no one named ${by} gives limits (${ORDER.join(', ')})` };
  if (value === null || value === undefined || value === '') { given.get(by).delete(name); return { name, value: limit(name), by }; }
  if (l.fixed) return { name, refused: `${name} is fixed at ${shown(name, l.value)}: ${l.what}` };
  const n = amount(value);
  if (n === null) return { name, refused: `${name}: ${JSON.stringify(value)} is no number` };
  if (n < l.least) return { name, refused: `${name}: ${shown(name, n)} is below the least, ${shown(name, l.least)}` };
  if (n > l.most) return { name, refused: `${name}: ${shown(name, n)} is above the most, ${shown(name, l.most)}` };
  given.get(by).set(name, n);
  return { name, value: limit(name), by };
}

/** 'piece=16 MiB, hellos=100' or { piece: '16 MiB', hellos: 100 } → { piece: '16 MiB', hellos: '100' }. */
export function readLimits(values) {
  if (!values) return {};
  if (typeof values === 'object') return { ...values };
  return Object.fromEntries(String(values).split(/[,;\n]/).map((p) => p.split('=').map((s) => s.trim())).filter((p) => p.length === 2 && p[0]));
}

/** Give a whole layer its values at once (what it gave before goes first). → { taken: [{ name, value, by }], refused: [{ name, refused }] } */
export function adjustAll(values, by = 'device') {
  const taken = [], refused = [];
  if (!given.has(by)) return { taken, refused: [{ name: '', refused: `no one named ${by} gives limits (${ORDER.join(', ')})` }] };
  given.get(by).clear();
  for (const [name, value] of Object.entries(readLimits(values))) {
    const r = adjust(name, value, by);
    (r.refused ? refused : taken).push(r);
  }
  return { taken, refused };
}

/** What one layer gave: { name: value } – to keep it (9-ui: sign.limits) or to show it. */
export const givenBy = (by) => Object.fromEntries(given.get(by) ?? []);

/** The whole table as it counts now, in the table's order. by: who gave the value ('' = the preselection). */
export function limitsNow() {
  return Object.entries(LIMITS).map(([name, l]) => {
    const by = [...ORDER].reverse().find((o) => given.get(o).has(name)) ?? '';
    return { name, value: limit(name), shown: shown(name), preselected: l.value, least: l.least, most: l.most, unit: l.unit, where: l.where, what: l.what, fixed: Boolean(l.fixed), by };
  });
}
