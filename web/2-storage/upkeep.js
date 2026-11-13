// upkeep.js — keeps the sharing points up to date by themselves: no button, no settings page.
//
// Purpose:   the list says what goes where (list.js), sharing-points.js knows how to do one run.
//            This file says WHEN and WITH WHAT, so nothing waits for the next start of the app:
//              due        a rule is due: copies daily (catch up what a take could not write) and at once
//                         when a take could not be written there (retry), backups every 7 days
//                         (decision 08.11.), any rule right after it was made
//              backup key made once on the first backup, kept in the keychain; sealed for this device
//                         next to every backup (backup-key.js); lost keychain on the same device =
//                         opened again from there; a paper password from the clipboard opens it too
//              summary    a run → one state per sharing point: ok · waiting (disk away) · error,
//                         and how many files went; the menu shows it on the tile and in one line
//              reopen     a sharing point that could not be opened (offline at start) is tried again
//              bring home a sharing point dropped on this device (tile 0): from a backup = restore,
//                         from anything else = copy what is missing here (once, no rule)
// Depends:   sharing-points.js (openAll), routes.js (copyRoute), backup.js, backup-key.js, list.js (wants)
// Test:      tests/upkeep.test.mjs
// Limits:    a run lists source and target: ~500 B per file over WebDAV, so 20,000 takes × 4 files ≈ 40 MB;
//            hence copies daily (plus retries), backups weekly (both changeable per call) · one run at a time ·
//            a backup without the paper sheet can only be opened by a device it was sealed for: losing
//            all of them = the backup is lost (paper password: EXTEND(S9, paper), printed sheet).

import { openAll } from './sharing-points.js';
import { copyRoute } from './routes.js';
import { restore, newBackupKey, FOLDER } from './backup.js';
import { sealBackupKey, openBackupKey, KEYS } from './backup-key.js';
import { ExistsError } from './memory.js';

export const EVERY = Object.freeze({ always: 24 * 60 * 60e3, backup: 7 * 24 * 60 * 60e3 });
export const KEYCHAIN_ID = 'backup'; // the backup key in the keychain (never in a file, never on screen)

/** One name per rule, to remember when it ran last: "from>to mark kinds". */
export const ruleKey = (r) => `${r.from ?? 0}>${r.to} ${r.mark} ${(r.kinds ?? []).join('')}`;

/**
 * Rules due now. last: { [ruleKey]: ms of the last run } · now: ms · every: { always, backup } in ms.
 * A rule never run is due at once; show, ask and consent have nothing to run.
 */
export function dueRules(rules, last = {}, now = Date.now(), every = EVERY) {
  return rules.filter((r) => {
    if (!(r.mark in every)) return false;
    const at = last[ruleKey(r)];
    return at == null || now - at >= every[r.mark];
  });
}

/** After a run: remember it for every rule that ran (waiting ones did not run). → new last */
export function remember(last, report, now = Date.now()) {
  const out = { ...last };
  for (const x of report) if (!x.waiting && !x.error) out[ruleKey(x.rule)] = now;
  return out;
}

/** A take could not be written to these sharing points (afterTake failed): their copy rules are due again. */
export function retry(last, rules, failedTo) {
  const out = { ...last };
  for (const r of rules) if (r.mark === 'always' && failedTo.includes(r.to)) delete out[ruleKey(r)];
  return out;
}

/** A sealed key file for this device at the backup target, written once. */
async function sealFor(store, key, host) {
  try { await sealBackupKey(store, key, { hosts: [{ id: host.id, pickup: host.pickup }] }); }
  catch (err) { if (!(err instanceof ExistsError)) throw err; }
}

/**
 * The backup key for a backup into `store`. keychain: { get, set } · host: { id (q_), pickup (public, Base32),
 * privateKey } of this device · paper(): a paper password or null (e.g. from the clipboard).
 * Order: keychain → sealed for this device in the store → paper → a new key (only when the store holds
 * no backup yet, so a second key never splits a backup). → key (52 Base32 chars)
 */
export async function backupKey(store, { keychain, host, paper = async () => null }) {
  let key = await keychain.get(KEYCHAIN_ID);
  const existing = (await store.list(FOLDER).catch(() => [])).some((f) => f.path.endsWith('.sealed'));
  if (!key && existing) {
    key = await openBackupKey(store, { host }).catch(() => null);
    if (!key) {
      const word = await paper();
      key = word ? await openBackupKey(store, { paper: word }).catch(() => null) : null;
    }
    if (!key) throw new Error('backup key: open it on a device it was sealed for, or with the paper password');
  }
  if (!key) key = newBackupKey();
  await keychain.set(KEYCHAIN_ID, key);
  await sealFor(store, key, host); // every backup target can be opened by this device
  return key;
}

/**
 * A run (sharing-points.runRules) → one line per sharing point that took part:
 * Map(n → { state: 'ok' | 'waiting' | 'error', copied, failed, marks: ['always' | 'backup'], error? }).
 * n is the target; the device (null) is never a target here.
 */
export function summary(report) {
  const out = new Map();
  for (const x of report) {
    const n = x.rule.to;
    const s = out.get(n) ?? { state: 'ok', copied: 0, failed: 0, marks: [] };
    if (!s.marks.includes(x.rule.mark)) s.marks.push(x.rule.mark);
    if (x.error) Object.assign(s, { state: 'error', error: x.error });
    else if (x.waiting && s.state !== 'error') s.state = 'waiting';
    else if (x.result) {
      s.copied += x.result.copied?.length ?? 0;
      s.failed += x.result.failed?.length ?? 0;
      if (s.failed && s.state === 'ok') s.state = 'error';
    }
    out.set(n, s);
  }
  return out;
}

/** Sharing points that could not be opened (offline at start): open them again. → numbers n now open. */
export async function reopen(open, entries, opts) {
  const back = [];
  for (const [n, sp] of open) {
    if (!sp.error) continue;
    const again = (await openAll([entries[n - 1]], opts)).get(1);
    if (again && !again.error) { open.set(n, again); back.push(n); }
  }
  return back;
}

/** Does this store hold an encrypted backup? */
export const holdsBackup = async (store) => (await store.list(FOLDER).catch(() => [])).some((f) => f.path.endsWith('.sealed'));

/**
 * A sharing point dropped on this device: bring its files here, once. A backup is opened (backupKey, the
 * same order) and restored; anything else: copy what is missing. skip(path): removed ones never come back.
 * → { restored: [path] } | { copied, kept, failed }
 */
export async function bringHome(from, own, { keychain, host, paper, skip = () => false, kinds = ['v', 'a', 'x', 'l', 'm'] }) {
  if (await holdsBackup(from)) {
    const key = await backupKey(from, { keychain, host, paper });
    return { restored: await restore(from, own, key, { skip }) };
  }
  return copyRoute(from, own, { kinds, skip: (p) => p.startsWith(FOLDER) || p.startsWith(KEYS) || skip(p) });
}
