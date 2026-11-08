// sharing-points.js — makes the list work: open every sharing point, and do what its rules say.
//
// Purpose:   the list says what goes where (list.js rulesOf); this file does it:
//              (always) no from    after a take: write the new files there        afterTake
//              (ask)               offered as a tile, sent only on a tap            offers
//              (show) [(write)]    brought into search, read only [writing too]    sources
//              (always) from → to  copy what is missing, again and again           runRules
//              (backup)            encrypted copy (backup.js)                      runRules
//              (show) from → to    give: a share of the folder, no copy (routes.give, Nextcloud) runRules
//              (consent)           nothing to do here: atlas reads it
//            Where a sharing point lies is its =(full path); from that the kind follows (specOf):
//              local:  ·  …/remote.php/dav/files/<user>/<folder>/  ·  …/public.php/dav/files/<token>/
//              any other https = WebDAV, user in the address (https://lena@dav.example/…), never a password.
//            Passwords live in the keychain by q_ (keychain.js), never in the list.
// Depends:   connect.js, list.js, routes.js, backup.js, sharing-point.js, nextcloud.js, layout.js, memory.js
// Test:      tests/list.test.mjs
// Limits:    opening = one read of sharing-point.sign per sharing point (~0.2 s each over WebDAV);
//            a run lists source and target once; a failed sharing point is reported, the rest go on.

import { connect, ReadOnlyStore } from './connect.js';
import { wants } from './list.js';
import { copyRoute } from './routes.js';
import { backup } from './backup.js';
import { readDescription } from './sharing-point.js';
import { publicWebdavUrl } from './nextcloud.js';
import { SELF } from './layout.js';
import { ExistsError } from './memory.js';
import { KINDS } from '../1-model/symbols.js';

const ALL = Object.keys(KINDS).filter((k) => k !== 'sharing-point' && k !== 'chain');
const dec = new TextDecoder();

/** Entry of the list → spec for connect(), from its =(full path). Devices (key, no path) → null. */
export function specOf({ label, id, path, key }) {
  if (!path) return key ? null : { kind: 'local', label, id };
  if (path === 'local:') return { kind: 'local', label, id };
  const u = new URL(path);
  const where = u.origin + u.pathname;
  let m = /^(.*)\/public\.php\/dav\/files\/([^/]+)\/?$/.exec(where);
  if (m) return { kind: 'link', label, id, server: m[1], token: m[2] };
  m = /^(.*)\/remote\.php\/dav\/files\/([^/]+)\/(.*?)\/?$/.exec(where);
  if (m) return { kind: 'nextcloud', label, id, server: m[1], user: decodeURIComponent(m[2]), folder: decodeURIComponent(m[3]) };
  return { kind: 'webdav', label, id, url: where, user: decodeURIComponent(u.username) || null };
}

/**
 * Pasted text (clipboard instead of typing) → what to do with it:
 *   lena@uni.sciebo.de          { kind: 'cloud', cloudId }      give a folder to it (routes.give)
 *   https://host/s/AbC123       { kind: 'link', path }          a read-only link
 *   https://host                { kind: 'login', server }       one-click login (native app)
 *   https://host/remote.php/…   { kind: 'nextcloud', path, … }  · any other https: { kind: 'webdav', path }
 */
export function readPaste(text) {
  const s = String(text ?? '').trim();
  if (/^[^\s@/:]+@[^\s@/]+\.[a-z]{2,}$/i.test(s)) return { kind: 'cloud', cloudId: s };
  if (!/^https?:\/\/\S+$/.test(s)) return null;
  const u = new URL(s);
  const share = /^(.*?)\/(?:index\.php\/)?s\/([A-Za-z0-9]+)\/?$/.exec(u.origin + u.pathname);
  if (share) return { kind: 'link', server: share[1], token: share[2], path: publicWebdavUrl(share[1], share[2]) };
  if (u.pathname.replace(/\/$/, '') === '') return { kind: 'login', server: u.origin };
  return { ...specOf({ path: s }), path: s };
}

/**
 * Open every sharing point of the list. → Map(n → { entry, spec, store, description }) or
 * { entry, error } · own: store of this device · keychain: { get(q_) } · devices are skipped.
 */
export async function openAll(entries, { keychain, own, fetch = globalThis.fetch }) {
  const open = new Map();
  for (const [i, entry] of entries.entries()) {
    const spec = specOf(entry);
    if (!spec) continue;
    try {
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
      if (rule.mark === 'always' && rule.from != null) report.push({ rule, result: await copyRoute(from, to, { kinds, skip }) });
      else if (rule.mark === 'backup') {
        if (!backupKey) throw new Error('no backup key on this device');
        report.push({ rule, result: await backup(from, to, backupKey, { filter: (p) => wants(rule.kinds, p) && !skip(p) }) });
      } else if (rule.mark === 'show' && rule.from != null && give) report.push({ rule, result: await give(rule, open.get(rule.from), open.get(rule.to)) });
    } catch (err) { report.push({ rule, error: String(err.message ?? err) }); }
  }
  return report;
}
