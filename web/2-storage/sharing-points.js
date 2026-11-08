// sharing-points.js — makes the list work: open every sharing point, and do what its rules say.
//
// Purpose:   the list says what goes where (list.js rulesOf); this file does it:
//              (always) no from    after a take: write the new files there        afterTake
//              (ask)               offered as a tile, sent only on a tap            offers
//              (show) [(write)]    brought into search, read only [writing too]    sources
//              (always) [from →] to  copy what is missing, again and again (catches up
//                                  what a take could not write, e.g. disk unplugged)  runRules
//              (backup)            encrypted copy (backup.js)                      runRules
//              (show) from → to    give: a share of the folder, no copy (routes.give, Nextcloud) runRules
//              (consent)           nothing to do here: atlas reads it
//            Where a sharing point lies is its =(full path); the kind follows from it (spec.js).
//            Passwords live in the keychain by q_ (keychain.js), never in the list.
// Depends:   connect.js, spec.js, list.js, routes.js, backup.js, sharing-point.js, layout.js, memory.js
// Test:      tests/list.test.mjs
//            A picked folder or disk that is not there = waiting; there again → reconnect, runRules.
// Limits:    opening = one read of sharing-point.sign per sharing point (~0.2 s each over WebDAV);
//            a run lists source and target once; a failed sharing point is reported, the rest go on.

import { connect, ReadOnlyStore } from './connect.js';
import { wants } from './list.js';
import { copyRoute } from './routes.js';
import { backup } from './backup.js';
import { readDescription } from './sharing-point.js';
import { specOf } from './spec.js';
import { SELF } from './layout.js';
import { ExistsError } from './memory.js';
import { KINDS } from '../1-model/symbols.js';

const ALL = Object.keys(KINDS).filter((k) => k !== 'sharing-point' && k !== 'chain');
const dec = new TextDecoder();

/**
 * Open every sharing point of the list. → Map(n → { entry, spec, store, description }) or
 * { entry, error } · own: store of this device · keychain: { get(q_) } · devices are skipped.
 */
export async function openAll(entries, { keychain, own, folders = null, fetch = globalThis.fetch }) {
  const open = new Map();
  for (const [i, entry] of entries.entries()) {
    const spec = specOf(entry);
    if (!spec) continue;
    try {
      if (spec.kind === 'folder') { const store = await folders?.open(entry.id); open.set(i + 1, store ? { entry, spec, store } : { entry, spec, waiting: true }); continue; }
      const secret = spec.kind === 'local' ? null : await keychain.get(entry.id);
      const { store } = connect(spec, { secret, local: own, fetch });
      let description = null;
      try { description = readDescription(dec.decode(await store.read(SELF))); } catch { /* not described yet */ }
      open.set(i + 1, { entry, spec, store, description });
    } catch (err) { open.set(i + 1, { entry, error: String(err.message ?? err) }); }
  }
  return open;
}

/** Kinds a rule may move to a sharing point: the rule's, inside what its sharing-point.sign allows. */
const kindsFor = (rule, target) => {
  const want = rule.kinds?.length ? rule.kinds : ALL;
  return target?.description ? want.filter((k) => target.description.kinds.includes(k)) : want;
};

/** After a take: files [{ path, bytes }] to every (always) target. → { saved, failed } */
export async function afterTake(rules, open, files) {
  const result = { saved: [], failed: [] };
  for (const rule of rules.filter((r) => r.mark === 'always' && r.from == null)) {
    const target = open.get(rule.to);
    const kinds = kindsFor(rule, target);
    for (const { path, bytes } of files.filter((f) => wants(kinds, f.path))) {
      try { if (!target?.store) throw new Error(target?.error ?? 'not open'); await target.store.write(path, bytes); result.saved.push([rule.to, path]); }
      catch (err) { (err instanceof ExistsError ? result.saved : result.failed).push([rule.to, path]); }
    }
  }
  return result;
}

/** Tiles offered on a tap: (ask) targets → [{ n, kinds }]. */
export const offers = (rules) => rules.filter((r) => r.mark === 'ask' && r.from == null).map((r) => ({ n: r.to, kinds: r.kinds }));

/** A store that only shows some kinds (a show rule with kinds). */
class KindsStore extends ReadOnlyStore {
  constructor(store, kinds) { super(store); this.kinds = kinds; }
  async list(prefix) { return (await this.inner.list(prefix)).filter((f) => wants(this.kinds, f.path)); }
}

/** What search reads: the own store and every (show) without from. → [{ name, store }] for buildIndex. */
export function sources(rules, open, own) {
  const out = [{ name: 'own', store: own }];
  for (const r of rules.filter((x) => x.mark === 'show' && x.from == null)) {
    const sp = open.get(r.to);
    if (!sp?.store) continue;
    const store = r.write && !sp.store.readOnly ? sp.store : r.kinds.length ? new KindsStore(sp.store, r.kinds) : new ReadOnlyStore(sp.store);
    out.push({ name: sp.entry.label, store });
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
      if ((!from || !to) && [rule.from, rule.to].some((n) => open.get(n)?.waiting)) report.push({ rule, waiting: true }); // disk not plugged in
      else if (rule.mark === 'always') report.push({ rule, result: await copyRoute(from, to, { kinds, skip }) });
      else if (rule.mark === 'backup') {
        if (!backupKey) throw new Error('no backup key on this device');
        report.push({ rule, result: await backup(from, to, backupKey, { filter: (p) => wants(rule.kinds, p) && !skip(p) }) });
      } else if (rule.mark === 'show' && rule.from != null && give) report.push({ rule, result: await give(rule, open.get(rule.from), open.get(rule.to)) });
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
