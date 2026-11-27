// sharing-points.js — makes the list work: open every sharing point, and do what its rules say.
//
// Purpose:   the list says what goes where (list.js rulesOf); this file does it:
//              (always) no from    after a take: write the new files there        afterTake
//              (ask)               offered as a tile, sent only on a tap            offers
//              (show) [(write)]    brought into Similar, read only [writing too]    sources
//                                  (a public link writes only when it allows editing)
//              (always) [from →] to  what is NEW since the rule's time, again and again (catches up
//                                  what a take could not write, e.g. disk unplugged); a copy took the rest
//                                  once when it was made (share-mount)              runRules
//              (backup)            encrypted copy (backup.js)                      runRules
//              (show) from → to    give: a share of the folder, no copy (routes.give, Nextcloud) runRules
//              (consent)           nothing to do here: atlas reads it
//            Where a sharing point lies is its =(full path); the kind follows from it (spec.js).
//            Passwords live in the keychain by q_ (keychain.js), never in the list.
// Depends:   connect.js, spec.js, list.js, routes.js, backup.js, sharing-point.js, layout.js, memory.js
// Test:      tests/list.test.mjs
//            A picked folder or disk that is not there = waiting; there again → reconnect, runRules.
// Limits:    opening = one read of sharing-point.sign per sharing point (~0.2 s each over WebDAV), all at once
//            (26.11.: before, one after another – five sharing points and one that does not answer held all the
//            others and the start of the app), each at most OPEN_MS = 15 s: then it counts as not reached and is
//            tried again like any that failed (upkeep.js reopen, every 30 s while online);
//            a run lists source and target once; a failed sharing point is reported, the rest go on.

import { connect, ReadOnlyStore } from './connect.js';
import { wants } from './list.js';
import { copyRoute } from './routes.js';
import { backup } from './backup.js';
import { readDescription, describe, trusted, signerKeys } from './sharing-point.js';
import { signed } from '../1-model/crypto.js';
import { specOf } from './spec.js';
import { SELF } from './layout.js';
import { ExistsError } from './memory.js';
import { KINDS, withFollowers } from '../1-model/symbols.js';

const ALL = Object.keys(KINDS).filter((k) => k !== 'sharing-point' && k !== 'chain');
const dec = new TextDecoder();

export const OPEN_MS = 15_000;
/** work, or an error once ms have passed (the work itself is not stopped: its answer just no longer counts). */
const within = (ms, work) => new Promise((done, fail) => {
  const timer = setTimeout(() => fail(new Error(`not reached in ${Math.round(ms / 1000)} s`)), ms);
  work.then((v) => { clearTimeout(timer); done(v); }, (err) => { clearTimeout(timer); fail(err); });
});

/** Open one sharing point of the list. → { entry, spec, store, description } · { entry, spec, waiting } · throws */
async function openOne(entry, spec, { keychain, own, folders, fetch, access }) {
  if (spec.kind === 'folder') {
    const store = await folders?.open(entry.id);
    return store ? { entry, spec, store } : { entry, spec, waiting: true }; // not plugged in = waiting
  }
  const secret = spec.kind === 'local' ? null : spec.kind === 'gateway' ? await Promise.resolve(keychain?.get?.(entry.id)).catch(() => null) ?? null // the signer's grant (no secret; the access key signs)
    : await keychain.get(entry.id);
  let { store } = connect(spec, { secret, local: own, fetch, access });
  if (spec.kind === 'link') { // a public link: read only, read and write, or drop only ("File drop")
    const { read, write } = await store.inner.rights().catch(() => ({ read: true, write: false }));
    if (write) ({ store } = connect({ ...spec, write: true, drop: !read }, { secret, fetch }));
  }
  let description = null;
  try {
    const text = dec.decode(await store.read(SELF));
    description = readDescription(text);
    // verified = sealed (y_) by one of its signers; null = no signer named (a plain folder someone described)
    description.trusted = description.signers.length ? await trusted(text, signerKeys(description)) : null;
  } catch { /* not described yet */ }
  return { entry, spec, store, description };
}

/**
 * Open every sharing point of the list, all at once, each within limitMs. → Map(n → { entry, spec, store,
 * description }) or { entry, error } · own: store of this device · keychain: { get(q_) } · devices are skipped.
 * The numbers n and their order are those of the list, whichever answered first.
 */
export async function openAll(entries, { keychain, own, folders = null, fetch = globalThis.fetch, access = null, limitMs = OPEN_MS }) {
  const opened = await Promise.all(entries.map((entry) => {
    const spec = specOf(entry);
    if (!spec || spec.kind === 'cloud') return null; // devices and expected accounts have no store here
    return within(limitMs, openOne(entry, spec, { keychain, own, folders, fetch, access })).catch((err) => ({ entry, error: String(err.message ?? err) }));
  }));
  const open = new Map();
  opened.forEach((sp, i) => { if (sp) open.set(i + 1, sp); });
  return open;
}

/**
 * Make a sharing point of a folder that is not one yet: write its sharing-point.sign, this device as its signer,
 * sealed (y_). Never overwrites: a described folder stays as it is. signer: { device (q_), label, deviceKey }.
 * → the description, or null when it was described already or cannot be written.
 */
export async function describeNew(store, { id, label, path = null, signer, time, kinds = ALL }) {
  if (store.readOnly || store.dropOnly) return null;
  const text = await signed(signer.deviceKey, describe({ id, by: signer.label, time, label, path, kinds,
    signers: [{ label: signer.label, id: signer.device, key: signer.deviceKey.public }] }));
  try { await store.write(SELF, new TextEncoder().encode(text)); } catch (err) { if (err instanceof ExistsError) return null; throw err; }
  const description = readDescription(text);
  description.trusted = true;
  return description;
}

/** Kinds a rule may move to a sharing point: the rule's, inside what its sharing-point.sign allows. */
const kindsFor = (rule, target) => {
  const want = rule.kinds?.length ? rule.kinds : ALL;
  return target?.description ? want.filter((k) => target.description.kinds.includes(k)) : want;
};

/**
 * Does this (always) rule send this file to its sharing point? The rule's kinds inside what the sharing point's
 * description allows, and what follows a kind goes with it (26.11.: the wake with its :v – before, a rule that named
 * its kinds sent the picture without its wake). A description that allows none of the rule's kinds: nothing goes.
 * target: the opened sharing point, or none yet (then the rule alone decides; asked again when it is open).
 */
export function afterTakeWants(rule, target, path) {
  const kinds = withFollowers(kindsFor(rule, target));
  return kinds.length ? wants(kinds, path) : false;
}

/** After a take: which of its files go to which (always) sharing point – the decision only, nothing is written. → [{ n, path }] */
export function afterTakeTargets(rules, open, paths) {
  const out = [];
  for (const rule of rules.filter((r) => r.mark === 'always' && r.from == null)) for (const path of paths) if (afterTakeWants(rule, open.get(rule.to), path)) out.push({ n: rule.to, path });
  return out;
}

/**
 * After a take: files [{ path, bytes }] to every (always) target, written at once. → { saved, failed }
 * The app itself sends through sending.js since 26.11. (in the background, kept until it is there); this is the same
 * decision without a list, for tools and tests.
 */
export async function afterTake(rules, open, files) {
  const result = { saved: [], failed: [] };
  for (const rule of rules.filter((r) => r.mark === 'always' && r.from == null)) {
    const target = open.get(rule.to);
    for (const { path, bytes } of files.filter((f) => afterTakeWants(rule, target, f.path))) {
      try {
        if (!target?.store) throw new Error(target?.error ?? 'not open');
        await target.store.write(path, bytes);
        result.saved.push([rule.to, path]);
      }
      catch (err) { (err instanceof ExistsError ? result.saved : result.failed).push([rule.to, path]); }
    }
  }
  return result;
}

/** Tiles offered on a tap: (ask) targets → [{ n, kinds }]. */
export const offers = (rules) => rules
  .filter((r) => r.mark === 'ask' && r.from == null)
  .map((r) => ({ n: r.to, kinds: r.kinds }));

/** A store that only shows some kinds (a show rule with kinds). */
class KindsStore extends ReadOnlyStore {
  constructor(store, kinds) { super(store); this.kinds = kinds; }
  async list(prefix) { return (await this.inner.list(prefix)).filter((f) => wants(this.kinds, f.path)); }
}

/** What Similar reads: the own store and every (show) without from. → [{ name, store }] for buildIndex. */
export function sources(rules, open, own) {
  const out = [{ name: 'own', store: own, write: true }]; // write: may refresh its index/ parts (3-index/parts.js)
  for (const r of rules.filter((x) => x.mark === 'show' && x.from == null)) {
    const sp = open.get(r.to);
    if (!sp?.store || sp.store.dropOnly) continue; // a drop link shows nothing
    let store, write = false;
    if (r.write && !sp.store.readOnly) { store = sp.store; write = true; } // brought in for writing too
    else if (r.kinds.length) store = new KindsStore(sp.store, r.kinds); // only some kinds, read only
    else store = new ReadOnlyStore(sp.store);
    const id = `${sp.entry.id ?? sp.entry.label}${r.kinds.length && !write ? `.${r.kinds.join('')}` : ''}`; // its parts in the device cache
    out.push({ name: sp.entry.label, store, write, id });
  }
  return out;
}

/**
 * Copy and backup rules, one after another. backupKey: from the keychain (backup-key.js) ·
 * skip(path): removed ones (remove.quietIds) · give(rule, from, to): a share instead of a copy.
 * → [{ rule, result } | { rule, error }]
 */
export async function runRules(rules, open, { own, backupKey = null, skip = () => false, give = null }) {
  const report = [];
  const storeOf = (n) => (n == null ? own : open.get(n)?.store);
  for (const rule of rules) {
    const from = storeOf(rule.from), to = storeOf(rule.to), kinds = kindsFor(rule, open.get(rule.to));
    try {
      if (to?.dropOnly) continue; // a drop link cannot say what is missing: only new takes go there (afterTake)
      const waiting = (!from || !to) && [rule.from, rule.to].some((n) => open.get(n)?.waiting);
      if (waiting) report.push({ rule, waiting: true }); // disk not plugged in: no error, it runs when it is back
      else if (rule.mark === 'always') report.push({ rule, result: await copyRoute(from, to, { kinds, skip, since: rule.all ? null : rule.time }) }); // all: everything (a full copy keeps itself whole) · else new since the connection
      else if (rule.mark === 'backup') {
        if (!backupKey) throw new Error('no backup key on this device');
        const filter = (p) => wants(rule.kinds, p) && !skip(p);
        report.push({ rule, result: await backup(from, to, backupKey, { filter }) });
      } else if (rule.mark === 'show' && rule.from != null && give) {
        report.push({ rule, result: await give(rule, open.get(rule.from), open.get(rule.to)) });
      }
    } catch (err) { report.push({ rule, error: String(err.message ?? err) }); }
  }
  return report;
}

/** Folders that are there again (a disk plugged in): reopen them. → numbers n now open. */
export async function reconnect(open, folders, { ask = false, only = null } = {}) {
  const back = [];
  for (const [n, sp] of open) {
    if (!sp.waiting || (only && only !== n)) continue;
    const store = await folders.open(sp.entry.id, { ask });
    if (store) { open.set(n, { entry: sp.entry, spec: sp.spec, store }); back.push(n); }
  }
  return back;
}
