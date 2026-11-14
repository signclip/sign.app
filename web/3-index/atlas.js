// atlas.js — the summary atlas makes over every account (decided 14.11.): atlas reads each Sign/ (shared read
// only with it when the account was made) and counts what lies there; only this summary goes on to the admin.
//
// Purpose:   the admin sees per account how many takes, chains and strands, and how much space — without
//            reading anyone's files. atlas itself is the index over all sharing points (SCHEMA B6).
// Depends:   a store per account (WebDAV on atlas's view of the share)
// Test:      tests/connect.test.mjs
// Limits:    one full listing per account per count (≈ 1 s per 1,000 files over WebDAV); counted at most
//            once an hour; the summary ≈ 120 bytes per account, ≤ 500 accounts.

export const SUMMARY = 'summary/accounts.json';
export const EVERY_MS = 60 * 60 * 1000;

const KIND = /\.([vaxl])\.(mp4|png|wav|sign|parquet)$/;

/** What lies in one account: { v, a, x, l, chains, bytes } (strands by kind, chain files, bytes of all). */
export async function countAccount(store) {
  const out = { v: 0, a: 0, x: 0, l: 0, chains: 0, bytes: 0 };
  for (const f of await store.list('')) {
    out.bytes += f.size ?? 0;
    if (f.path.endsWith('.chain.sign')) out.chains += 1;
    else { const m = KIND.exec(f.path); if (m) out[m[1]] += 1; }
  }
  return out;
}

/** shares: [{ owner, label, store }] → the summary (JSON text): { at, accounts: [{ user, label, v, a, x, l, chains, bytes }] }. */
export async function summarize(shares, { now = Date.now() } = {}) {
  const accounts = [];
  for (const s of shares.slice(0, 500)) {
    try { accounts.push({ user: s.owner, label: s.label, ...(await countAccount(s.store)) }); } catch { /* not reachable now */ }
  }
  return JSON.stringify({ at: new Date(now).toISOString(), accounts });
}

/** The summary as the admin reads it → Map(user → counts), or an empty map. */
export function readSummary(text) {
  try { return new Map((JSON.parse(text).accounts ?? []).map((a) => [a.user, a])); } catch { return new Map(); }
}
