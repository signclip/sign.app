// sealed-keys.js — the group keys of a sealed sharing point, one after the other, kept in the sharing point itself
//            (26.11., mechanics; no group uses it yet) – and every way back to them (27.11.): for whom a key lies
//            there, whole or in parts.
//
// Purpose:   a group key reaches a holder as a key note: a small chain in e2e/key/, sealed (y_) by a signer of the
//            sharing point, one line per holder that may open it:
//              :chain!(q_<signer device> n_ t_ u_ y_…)'t(<when the note was written>)
//              ((key <name>) (<holder>) (sealed <a> <b> <c>))'t(<since when this key writes>)
//              ((spare <name>) (<holder>) (sealed …))'t(…)                 the spare key, whole
//              ((view <name>) (<holder>) (sealed …))'t(…)                  a person's view key (see below)
//              ((part <name> <x> <need> <of>) (<holder>) (sealed …))'t(…)  part x of the spare key <name>: `need` of
//                                                                         `of` give it back (1-model/shares.js)
//            <name> = keyName (1-model/sealed.js): the same 26 chars that start every run this key seals.
//            A holder is one of five, and every line has the same form for each:
//              q_<device>      a device, sealed for its pickup key (crypto.js seal) – one's own, a trusted person's,
//                              the admin's. The admin opens with the pickup key of his device; the person's consent
//                              is this one line, written by her device as a signer of her sharing point.
//              paper           the paper password (backup-key.js; ≈ 0.2 s per line, on purpose)
//              passkey <26>    32 bytes a passkey gives; it comes along with her account to the next phone
//              thing <26>      the same from a card or stick                                  (9-ui/passkey.js)
//              spare <name>    the spare key: one more key that seals keys, never files. A group key sealed with it
//                              comes back with it, so a new group key needs neither paper nor passkey at hand.
//                              Only a spare key lies in parts; a group key in parts = a group key under such a one.
//            2 of 3 (user 27.11.): the spare key in parts with three holders. With no device left, two of them
//            give it to a new device, and with it every group key. Then new keys are made (renewKey, giveSpare):
//            the lost device keeps what it could open and gets no line for anything new.
//            A view (user 27.11.: in a group each one says singly who else reads her files; the admin is a
//            holder like anyone else): a key of her own under which her device names files once more
//            (sealed-store.js, `view`). Whoever holds the view key reads exactly these. Its note is sealed by her
//            device: a member (members: { q_: z_ }) may give view lines and nothing else – never a group key the
//            others would write under, never a spare key.
//              giveView   a view key for holders (her devices, the admin, anyone) · views: who holds which view
//              giveKeys   the first key, or keys that exist for a holder who comes in (which ones = from when on
//                         she reads)
//              giveSpare  a spare key, whole for some holders and/or in parts for others
//              renewKey   someone leaves, a device is lost: a new key for every holder that stays; it writes from
//                         now on (SealedStore takes the newest), the keys before keep opening what they sealed
//              renewAfterLoss  back in with no device left: the old keys for the new device, a new spare key in
//                         new parts over old and new, a new group key – three notes
//              openKeys   a holder takes every key sealed for her by a signer she trusts → SealedStore({ keys });
//                         what she opens may open more (spare key), parts join as soon as enough are there
//              partLine   one part for another holder, as a line of its own: it travels in the hello back of the
//                         new device or lies at her door; readPartLine takes it
//              deposits   where each group key can still be opened; spares: the same for each spare key
//            Who is in = who holds the group key, not who has the link. With links that are alike for everyone
//            (Nextcloud, Sciebo) this is what lets one person go: what she copied before stays with her, what comes
//            after is closed to her. A key that no signer sealed counts for nothing: nobody who may only add can
//            make the others write under a key of his, and nobody can add a holder.
// Depends:   1-model (sealed, shares, crypto, file, ids, filename, time), backup-key.js (paper)
// Test:      tests/sealed.test.mjs, tests/deposits.test.mjs
// Limits:    a line = 324 B for a device, ≈ 235 B for the others (measured); sealing one for a device ≈ 0.8 ms, with
//            a secret ≈ 0.25 ms (server CPU): a renewal for 1,000 devices = one note of ≈ 0.3 MB in ≈ 0.8 s, a phone
//            some seconds (estimate); a device finds its line there in ≈ 70 ms · a spare key 2 of 3 = one note of
//            ≈ 1.3 KB, a part passed on ≈ 0.3 KB · ≤ 200 notes read per look (the newest by the storage's time,
//            else by name); a note without the seal of a trusted signer counts for nothing · a key's time has whole
//            seconds: two renewals in one second are told apart by name, alike on every device · opening with the
//            paper ≈ 0.2 s per line (on purpose) · parts: need 2 … of ≤ 255, each needs its own holder; with parts of
//            several splits at hand at most 100 choices are tried per key · a part passed on is not signed: a wrong
//            one joins to nothing (the name is compared), it cannot open anything · who holds a key keeps what it
//            opened: taking a line back needs a new key · a key lost everywhere (no device, no other holder) = its
//            files are unreadable for good: deposits() says before.
// EXTEND(W2, upkeep): weekly, open one random file through the deposits only; one note for all (like compact()).
// EXTEND(time): a holder that opens from a date on by itself needs pairings (drand tlock) – not in Web Crypto.

import { newKey, keyText, keyBytes, keyName, sealGroupKey, openGroupKey, sealWithSecret, openWithSecret } from '../1-model/sealed.js';
import { splitKey, joinParts } from '../1-model/shares.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { readFile, headLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { timeLabel, buildName } from '../1-model/filename.js';
import { msOf } from '../1-model/time.js';
import { sealForPaper, openWithPaper } from './backup-key.js';
import { limit, LIMITS } from '../1-model/limits.js';

export const KEYS = 'e2e/key/';
export const MOST = LIMITS.keys.value; // the preselection, 200; what counts: limit('keys')
export const MOST_TRIES = LIMITS['key.tries'].value; // the preselection, 100; what counts: limit('key.tries')
const NAME = '[0-9A-Z]{26}', N = '[1-9]\\d{0,2}';
const HOLDER = `q_[0-9A-Z]+|paper|(?:passkey|thing|spare) ${NAME}`;
const LINE = new RegExp(`^\\(\\(((key|spare|view) (${NAME})|part (${NAME}) (${N}) (${N}) (${N}))\\) \\((${HOLDER})\\) \\(sealed ([0-9A-Z]+ [0-9A-Z]+ [0-9A-Z]+)\\)\\)`);
const enc = new TextEncoder(), dec = new TextDecoder();
const seconds = (ms) => Math.floor(ms / 1000) * 1000; // 't( ) has whole seconds
const named = (path) => path.endsWith('.chain.sign') && path.slice(path.lastIndexOf('/') + 1).startsWith('(key)');
const raw = (k) => (typeof k === 'string' ? keyBytes(k) : k);

/** One line of a note or a part passed on → { kind, name, x, need, of, to, sealed, label } or null. */
function readLine(text) {
  const m = LINE.exec(text);
  if (!m) return null;
  if (m[2]) return { kind: m[2], name: m[3], to: m[8], sealed: m[9], label: m[1] };
  const [x, need, of] = [m[5], m[6], m[7]].map(Number);
  if (need < 2 || need > of || x > of || of > 255) return null;
  return { kind: 'part', name: m[4], x, need, of, to: m[8], sealed: m[9], label: m[1] };
}

/** How a holder is written in a line. holder: { id, pickup } | { paper } | { passkey | thing: <26>, secret } | { spare: key } */
async function toOf(h) {
  for (const kind of ['passkey', 'thing']) {
    if (!h?.[kind]) continue;
    if (!new RegExp(`^${NAME}$`).test(h[kind])) throw new Error(`a ${kind} is named by 26 chars`);
    return `${kind} ${h[kind]}`;
  }
  if (h?.paper) return 'paper';
  if (h?.spare) return `spare ${await keyName(raw(h.spare))}`;
  if (h?.id && h?.pickup) return h.id;
  throw new Error('a holder is a device, the paper, a passkey, a thing or the spare key');
}
/** 32 bytes sealed for one holder → the three groups after `sealed`. label = the head of the line. */
function sealFor(h, bytes, label) {
  if (h.passkey || h.thing) return sealWithSecret(bytes, h.secret, label);
  if (h.paper) return sealForPaper(keyText(bytes), h.paper);
  if (h.spare) return sealWithSecret(bytes, raw(h.spare), label);
  return sealGroupKey(h.pickup, bytes);
}
/** What these holders can open: Map(to → (sealed, label) → 32 bytes). */
async function openersOf({ device = null, pickupKey = null, paper = null, secrets = [] }) {
  const out = new Map();
  if (device && pickupKey) out.set(device, (sealed) => openGroupKey(pickupKey, sealed));
  if (paper) out.set('paper', async (sealed) => keyBytes(await openWithPaper(sealed, paper)));
  for (const s of secrets) out.set(await toOf(s), (sealed, label) => openWithSecret(sealed, s.secret, label));
  return out;
}

/** The lines that give one key (or spare key) to these holders, whole and/or in parts. */
async function linesFor(kind, name, key, since, whole, parts) {
  const lines = [];
  for (const h of whole) {
    const head = `${kind} ${name}`;
    lines.push(`((${head}) (${await toOf(h)}) (sealed ${await sealFor(h, key, head)}))'t(${since})`);
  }
  if (parts?.holders?.length) {
    const to = await Promise.all(parts.holders.map(toOf));
    if (new Set(to).size !== to.length) throw new Error('each part needs its own holder');
    const split = splitKey(key, { need: parts.need ?? 2, of: to.length });
    for (const [i, p] of split.entries()) {
      const head = `part ${name} ${p.x} ${p.need} ${p.of}`;
      lines.push(`((${head}) (${to[i]}) (sealed ${await sealFor(parts.holders[i], p.part, head)}))'t(${since})`);
    }
  }
  return lines;
}
async function writeNote({ store, signer, lines, now }) {
  const id = newId({ q: signer.device, n: signer.person.id, now }), time = timeLabel(now);
  const text = await signed(signer.deviceKey, fileText(headLine('chain', { '!': writeId(id), "'t": time }), [], lines));
  const path = `${KEYS}${buildName({ words: ['key'], time, u: uOf(id), kind: 'chain', ext: 'sign' })}`; // no name, no word: the storage learns nothing from it
  await store.write(path, enc.encode(text));
  return path;
}

/**
 * Signer: group keys into the sharing point, each sealed for these holders.
 * signer: { person: { id }, device (q_), deviceKey } · keys: [{ key, at (ms: since when it writes; none = now) }] ·
 * devices: [{ id (q_), pickup (ECDH public, Base32) }] · paper: the paper password or null · holders: more of any kind
 * (see toOf). → { path, keys: [{ name, key, at }] }
 */
export async function giveKeys({ store, signer, keys, devices = [], paper = null, holders = [], now = Date.now() }) {
  const whole = [...devices, ...(paper ? [{ paper }] : []), ...holders];
  if (!whole.length) throw new Error('a key note needs a holder: a device or the paper, a passkey, a thing or the spare key');
  const out = [], lines = [];
  for (const k of keys) {
    const key = raw(k.key), name = await keyName(key), at = seconds(k.at ?? now);
    lines.push(...await linesFor('key', name, key, timeLabel(at), whole, null));
    out.push({ name, key, at });
  }
  return { path: await writeNote({ store, signer, lines, now }), keys: out };
}

/**
 * Signer: a spare key – whole for `holders` (her own devices: they seal new group keys with it), in parts for
 * parts.holders (2 of 3: the paper, the admin, a trusted person, a passkey …). Group keys come under it with
 * giveKeys / renewKey({ holders: [{ spare: key }] }). → { path, name, key }
 */
export async function giveSpare({ store, signer, spare = newKey(), holders = [], parts = null, now = Date.now() }) {
  if (!holders.length && !parts?.holders?.length) throw new Error('a spare key needs a holder');
  const key = raw(spare), name = await keyName(key);
  const lines = await linesFor('spare', name, key, timeLabel(seconds(now)), holders, parts);
  return { path: await writeNote({ store, signer, lines, now }), name, key };
}

/**
 * A member or signer: a view key for these holders – her own devices, the admin's device, anyone's, the spare key.
 * signer: her device { person: { id }, device, deviceKey }. What the view shows is named with a SealedStore
 * ({ keys: [view], view: true }). → { path, name, key, at }
 */
export async function giveView({ store, signer, view = newKey(), holders = [], at = null, now = Date.now() }) {
  if (!holders.length) throw new Error('a view needs a holder');
  const key = raw(view), name = await keyName(key), since = seconds(at ?? now);
  const lines = await linesFor('view', name, key, timeLabel(since), holders, null);
  return { path: await writeNote({ store, signer, lines, now }), name, key, at: since };
}

/**
 * Every key note of the sharing point that a trusted signer sealed. signers: { q_…: z_ } (the description's signers,
 * or the chain from signers.js) · members: { q_…: z_ } whose notes count for view lines only.
 * → [{ path, by, written (ms), lines: [{ kind, name, to, sealed, at, label, x?, need?, of? }] }]
 */
export async function keyNotes({ store, signers, members = null }) {
  const listed = (await store.list(KEYS).catch(() => [])).filter((f) => named(f.path));
  const newest = listed.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || (a.path < b.path ? 1 : -1)).slice(0, limit('keys'));
  const out = [];
  for (const f of newest) {
    try {
      const text = dec.decode(await store.read(f.path)), file = readFile(text), q = file.head.id?.q;
      const z = signers?.[q] ?? members?.[q];
      if (!z || !(await checkWitness(z, text))) continue; // anyone who may add could put a note here
      const all = file.rows.map((r) => ({ l: readLine(r.text), at: msOf(r.time) })).filter((x) => x.l && x.at != null).map(({ l, at }) => ({ ...l, at, by: q }));
      const lines = signers?.[q] ? all : all.filter((l) => l.kind === 'view'); // a member gives views, nothing the others write under
      out.push({ path: f.path, by: file.head.id.q, written: msOf(file.head["'t"]) ?? 0, lines });
    } catch { /* not a key note */ }
  }
  return out;
}

/** Since when each group key writes: the earliest time a trusted note gives it (alike for every holder, whoever it was sealed for). */
function timesOf(notes) {
  const at = new Map();
  for (const n of notes) for (const l of n.lines) if (l.kind === 'key') at.set(l.name, Math.min(at.get(l.name) ?? Infinity, l.at));
  return at;
}
/** The names that are spare keys: given as one, whole or in parts, or holding a line. */
function spareNames(notes) {
  const out = new Set();
  for (const n of notes) for (const l of n.lines) { if (l.kind === 'spare' || l.kind === 'part') out.add(l.name); if (l.to.startsWith('spare ')) out.add(l.to.slice(6)); }
  return out;
}

/** The key `name` from the parts at hand, or null. Parts of several splits may lie among them: each choice of `need` is tried. */
async function joined(name, parts) {
  const seen = new Set(), all = parts.filter((p) => { const id = `${p.x} ${p.need} ${keyText(p.part)}`; return seen.has(id) ? false : seen.add(id); });
  let tries = 0;
  const most = limit('key.tries');
  for (const need of new Set(all.map((p) => p.need))) {
    const pool = all.filter((p) => p.need === need);
    const pick = async (from, chosen) => {
      if (chosen.length === need) {
        if (tries++ >= most) return null;
        const key = joinParts(chosen);
        return (await keyName(key)) === name ? key : null;
      }
      for (let i = from; i < pool.length && tries < most; i++) {
        if (chosen.some((c) => c.x === pool[i].x)) continue;
        const key = await pick(i + 1, [...chosen, pool[i]]);
        if (key) return key;
      }
      return null;
    };
    const key = await pick(0, []);
    if (key) return key;
  }
  return null;
}

/**
 * A holder takes every key sealed for her: a device (device: its q_, pickupKey: its private pickup key), the paper
 * password, secrets: [{ passkey | thing: <26>, secret }], and parts: [{ name, x, need, of, part }] others passed on.
 * What opens may open more: the spare key opens the lines it holds, its parts join when `need` of one split are there.
 * members: { q_: z_ } whose notes count for views. → { keys: [{ name, key, at }] oldest first (for SealedStore),
 *     missing: [{ name, at }], spares: [{ name, key }], views: [{ name, key, at, by }] (never among keys: no group
 *     store writes under a view),
 *     parts: [{ name, x, need, of, part }] (what these holders opened; alone they are no key) }
 * missing = group keys the signers gave that this holder cannot open: newer than her newest = she is out, or her
 * line has not come yet (hello again); older = she came in later and reads from then on.
 */
export async function openKeys({ store, signers, members = null, device = null, pickupKey = null, paper = null, secrets = [], parts = [] }) {
  const notes = await keyNotes({ store, signers, members }), at = timesOf(notes);
  const openers = await openersOf({ device, pickupKey, paper, secrets });
  const lines = notes.flatMap((n) => n.lines), tried = new Set();
  const keys = new Map(), spares = new Map(), views = new Map(), opened = [], atHand = new Map(), joinedAt = new Map();
  const hold = (p) => atHand.set(p.name, [...(atHand.get(p.name) ?? []), p]);
  parts.forEach(hold);
  const take = async (l, key) => { // opened or joined: only what carries the name it claims counts
    if ((await keyName(key)) !== l.name) return false;
    if (l.kind === 'key') { keys.set(l.name, { name: l.name, key, at: at.get(l.name) }); return true; }
    if (l.kind === 'view') { views.set(l.name, { name: l.name, key, at: l.at, by: l.by }); return true; }
    spares.set(l.name, { name: l.name, key });
    openers.set(`spare ${l.name}`, (sealed, label) => openWithSecret(sealed, key, label));
    return true;
  };
  for (let more = true; more;) {
    more = false;
    for (const l of lines) {
      const open = openers.get(l.to);
      if (!open || tried.has(l) || keys.has(l.name) || spares.has(l.name) || views.has(l.name)) continue;
      tried.add(l);
      try {
        const bytes = await open(l.sealed, l.label);
        if (l.kind === 'part') { const p = { name: l.name, x: l.x, need: l.need, of: l.of, part: bytes }; opened.push(p); hold(p); more = true; }
        else if (await take(l, bytes)) more = true;
      } catch { /* not sealed for this holder, or changed on the way */ }
    }
    for (const [name, list] of atHand) {
      if (spares.has(name) || joinedAt.get(name) === list.length) continue; // nothing new at hand since the last try
      joinedAt.set(name, list.length);
      const key = await joined(name, list);
      if (key && await take({ kind: 'spare', name }, key)) more = true;
    }
  }
  const byTime = (a, b) => a.at - b.at || (a.name < b.name ? -1 : 1);
  return {
    keys: [...keys.values()].sort(byTime),
    missing: [...at.entries()].filter(([name]) => !keys.has(name)).map(([name, t]) => ({ name, at: t })).sort(byTime),
    spares: [...spares.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
    views: [...views.values()].sort(byTime),
    parts: opened,
  };
}

/** One part for another holder, as a line that travels alone (the hello back of a new device, her door). */
export async function partLine(p, holder) {
  const head = `part ${p.name} ${p.x} ${p.need} ${p.of}`;
  return `((${head}) (${await toOf(holder)}) (sealed ${await sealFor(holder, p.part, head)}))`;
}
/** The holder it was sealed for takes it. → { name, x, need, of, part }; throws if it is not hers. */
export async function readPartLine(text, how = {}) {
  const l = readLine(String(text).trim());
  if (l?.kind !== 'part') throw new Error('not a part');
  const open = (await openersOf(how)).get(l.to);
  if (!open) throw new Error('this part is sealed for another holder');
  return { name: l.name, x: l.x, need: l.need, of: l.of, part: await open(l.sealed, l.label) };
}

/**
 * Signer: a new group key that writes from now on, for every holder that stays. Whoever is not among them keeps the
 * keys she has and gets no line for this one. → { path, name, key, at }
 */
export async function renewKey({ store, signer, signers, devices = [], paper = null, holders = [], now = Date.now() }) {
  const latest = Math.max(0, ...timesOf(await keyNotes({ store, signers })).values());
  const at = Math.max(seconds(now), latest + 1000); // after every key there is, also when this device's clock is behind
  const key = newKey();
  const { path, keys } = await giveKeys({ store, signer, keys: [{ key, at }], devices, paper, holders, now });
  return { path, ...keys[0] };
}

/**
 * Signer on a new device, back in after every device was lost (user 27.11.: "that means new keys are made"):
 * device: { id, pickup } the new one · keys: the old group keys it opened (openKeys with 2 of 3) · devices: every
 * device that stays in (her own sharing point: only the new one) · parts: { need, holders } for the new spare key ·
 * holders: more holders of the new group key. The old keys stay readable to the new device and come under the new
 * spare key too; whatever is written from now on lies under a key no lost device has a line for.
 * → { key: { name, key, at }, spare: { name, key }, paths }
 */
export async function renewAfterLoss({ store, signer, signers, device, keys = [], devices = [device], parts = null, holders = [], now = Date.now() }) {
  const spare = await giveSpare({ store, signer, holders: [device], parts, now });
  const under = { spare: spare.key }, paths = [spare.path];
  if (keys.length) paths.push((await giveKeys({ store, signer, keys, devices: [device], holders: [under], now })).path);
  const next = await renewKey({ store, signer, signers, devices, holders: [under, ...holders], now });
  return { key: { name: next.name, key: next.key, at: next.at }, spare: { name: spare.name, key: spare.key }, paths: [...paths, next.path] };
}

/** Where every key and spare key lies → Map(name → { name, at, devices, paper, passkeys, things, spares, parts }). */
function held(notes, signers) {
  const out = new Map(), ordered = [...notes].sort((a, b) => a.written - b.written || (a.path < b.path ? -1 : 1));
  for (const n of ordered) {
    const splits = new Map();
    for (const l of n.lines) {
      const d = out.get(l.name) ?? { name: l.name, kind: l.kind === 'part' ? 'spare' : l.kind, at: l.at, by: new Set(), devices: new Set(), paper: false, passkeys: new Set(), things: new Set(), spares: new Set(), parts: [] };
      d.by.add(n.by);
      d.at = Math.min(d.at, l.at);
      out.set(l.name, d);
      if (l.kind === 'part') {
        const id = `${l.name} ${l.need} ${l.of}`;
        if (!splits.has(id)) { splits.set(id, { need: l.need, of: l.of, held: [] }); d.parts.push(splits.get(id)); }
        splits.get(id).held[l.x - 1] = l.to;
      } else if (l.to === 'paper') d.paper = true;
      else if (l.to.startsWith('q_')) d.devices.add(l.to);
      else d[`${l.to.slice(0, l.to.indexOf(' '))}s`].add(l.to.slice(l.to.indexOf(' ') + 1));
    }
  }
  for (const d of out.values()) {
    for (const s of d.parts) s.held = s.held.filter(Boolean);
    Object.assign(d, { by: [...d.by], devices: [...d.devices], passkeys: [...d.passkeys], things: [...d.things], spares: [...d.spares] });
    d.signers = d.devices.filter((q) => signers?.[q]).length;
  }
  return out;
}
const sorted = (list) => list.sort((a, b) => a.at - b.at || (a.name < b.name ? -1 : 1));
const where = (d) => ({ name: d.name, at: d.at, devices: d.devices, signers: d.signers, paper: d.paper, passkeys: d.passkeys, things: d.things });
/** Does it come back with no device of hers at all? The paper, a passkey, a thing, or enough parts of one split. */
const away = (d) => d.paper || d.passkeys.length > 0 || d.things.length > 0 || d.parts.some((s) => s.held.length >= s.need);

/**
 * Where each group key can still be opened → [{ name, at, devices: [q_…], signers: n, paper, passkeys: [<26>],
 * things: [<26>], spares: [name], safe }], oldest first.
 * safe = a signer's device holds it and it comes back without any device: by the paper, a passkey, a thing, or a
 * spare key that itself comes back so (spares()). A key that is not safe is one lost phone away from files nobody
 * opens again.
 */
export async function deposits({ store, signers }) {
  const notes = await keyNotes({ store, signers }), all = held(notes, signers), keys = timesOf(notes);
  return sorted([...all.values()].filter((d) => keys.has(d.name)).map((d) => ({ ...d, at: keys.get(d.name) }))).map((d) =>
    ({ ...where(d), spares: d.spares, safe: d.signers > 0 && (away(d) || d.spares.some((s) => all.has(s) && away(all.get(s)))) }));
}

/**
 * Where each spare key lies → [{ name, at, devices, signers, paper, passkeys, things, parts: [{ need, of, held:
 * [holder …] }] (one entry per split), safe }]. safe = it comes back without any device of hers: the paper, a
 * passkey, a thing, or enough parts of one split. Only then does a group key under it count as safe.
 */
export async function spares({ store, signers }) {
  const notes = await keyNotes({ store, signers }), all = held(notes, signers), names = spareNames(notes), keys = timesOf(notes);
  return sorted([...all.values()].filter((d) => names.has(d.name) && !keys.has(d.name))).map((d) => ({ ...where(d), parts: d.parts, safe: away(d) }));
}

/**
 * Who holds which view → [{ name, at, by: [q_ of the devices that gave it], devices, signers, paper, passkeys,
 * things, spares }], oldest first. Every member reads this: who gave a view to whom is open to the group, what the
 * view shows is not.
 */
export async function views({ store, signers, members = null }) {
  const notes = await keyNotes({ store, signers, members }), all = held(notes, { ...members, ...signers });
  return sorted([...all.values()].filter((d) => d.kind === 'view')).map((d) => ({ ...where(d), by: d.by, spares: d.spares }));
}
