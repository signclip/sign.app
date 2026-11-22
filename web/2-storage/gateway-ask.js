// gateway-ask.js — one wish to the gateway, with gateway-2 and gateway-3 to fall back on (21.11., user).
//
// Purpose:   askGateway(): the wish "access:<op> <a> <b> <c> <time ms> <nonce>", signed with this device's access key,
//            goes to the gateway of the entry. If that one does not answer (no connection, no such name, 8 s silence,
//            502–504), the same wish goes to the same name with "-2", then "-3" after its first part:
//              https://gateway.sign.day/api → https://gateway-2.sign.day/api → https://gateway-3.sign.day/api
//            A second gateway is one more DNS entry; no device keeps a list, no entry changes. The gateway that
//            answered is asked first for 5 min, then the first one again. A refusal (4xx) is an answer: no fall back.
// Depends:   1-model/crypto.js (sign), fetch
// Test:      tests/gateway.test.mjs
// Limits:    ≤ 3 gateways per entry · ≤ 8 s per gateway before the next · hyphen, not "_" (no "_" in host names) ·
//            no fall back for IP addresses and names without a dot (localhost) · every gateway needs the same grants
//            (today the same access.json, see md/INFRASTRUCTURE.md).

import { sign } from '../1-model/crypto.js';

export const WAIT_MS = 8000, STAY_MS = 5 * 60 * 1000;
const field = (x) => (x == null ? '-' : encodeURIComponent(String(x)));
const nonce = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
const answered = new Map(); // api of the entry → { at: index of the gateway that answered, until: ms }

/** The gateways of an entry, in order: the name itself, then -2 and -3 after its first part. */
export function gatewaysOf(api) {
  const u = new URL(api);
  if (!u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return [api];
  const [first, ...rest] = u.hostname.split('.');
  return [api, ...[2, 3].map((n) => { const v = new URL(api); v.hostname = [`${first}-${n}`, ...rest].join('.'); return v.href; })];
}

async function within(fetch, url, init, ms) {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), ms);
  try { return await fetch(url, { ...init, signal: stop.signal }); } finally { clearTimeout(timer); }
}

/** Ask the gateway: op and up to three fields (null = "-"), extra goes into the body (label for pair) → its answer. */
export async function askGateway({ api, access, fetch, wait = WAIT_MS }, op, a = null, b = null, c = null, extra = {}) {
  const k = await access();
  const ask = `access:${op} ${field(a)} ${field(b)} ${field(c)} ${Date.now()} ${nonce()}`;
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask, sig: await sign(k.privateKey, ask), key: k.public, ...extra }) };
  const all = gatewaysOf(api), last = answered.get(api);
  const order = last && Date.now() < last.until ? [all[last.at], ...all.filter((_, i) => i !== last.at)] : all;
  let silent = null;
  for (const url of order) {
    let r;
    try { r = await within(fetch, url, init, wait); } catch (err) { silent = err; continue; }
    if (r.status >= 502 && r.status <= 504) { silent = Object.assign(new Error(`gateway: ${r.status}`), { status: r.status }); continue; }
    const at = all.indexOf(url);
    if (at > 0) answered.set(api, { at, until: Date.now() + STAY_MS }); else answered.delete(api);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`gateway: ${body.error ?? r.status}`), { status: r.status });
    return body;
  }
  throw silent ?? new Error('gateway: no answer');
}
