// pass-request.js — passing on someone else's take (21.11., user: free for all, or a request lands with the author).
//
// Purpose:   a take may be passed on when its author wrote so (G4a, SCHEMA: passing on foreign content only with the
//            author's leave): in its chain or in a chain pointing to it, a relation to everyone or to this person,
//              {} {} (always)                           everything, from her, to everyone
//              {:chain.1} {} {:person.1} (always)       this take, from her, to this person (her answer to a request)
//            Otherwise the one who wants to pass it on drops a request into hello/ of the sharing point where it lies
//            (as a removal request does):
//              :chain.1!(the take's chain id + hash)
//              {:chain.1} (ask)'t(…)
//            The author's app finds requests about her takes (hers = her n_ in the chain's id) and decides:
//            allowed = the answer above as a chain of her own beside the take, the request moves to quiet/ ·
//            declined = it only moves to quiet/.
// Depends:   1-model (file, ids, hash, crypto, filename), 2-storage/layout
// Test:      tests/pass.test.mjs
// Limits:    one request or answer ≈ 0.3 KB; finding requests = one listing of hello/ per sharing point.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel, buildName } from '../1-model/filename.js';
import { pathOf } from '../2-storage/layout.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const rowsOf = (c) => (c?.rows ?? c?.lines ?? []).map((r) => r.text ?? '');

/** The relations (always) in a chain: → [{ to: 'all' | person id }] */
export function leavesOf(chain) {
  const out = [];
  for (const row of rowsOf(chain)) {
    if (!/\(always\)/.test(row)) continue;
    const groups = row.match(/\{[^{}]*\}/g) ?? [];
    if (groups.length < 2) continue;
    const to = groups.at(-1).slice(1, -1).trim();
    if (!to) { out.push({ to: 'all' }); continue; }
    const name = /^:(person\.\d+)$/.exec(to)?.[1];
    const n = name && chain.defs?.get(name)?.id?.n;
    if (n) out.push({ to: n });
  }
  return out;
}

/** May `me` pass the take on? chains: its chain and the chains pointing to it; its author always may. */
export function mayPassOn(chains, me) {
  const [take] = chains;
  if (take?.head?.id?.n && take.head.id.n === me) return true;
  return chains.some((c) => leavesOf(c).some((l) => l.to === 'all' || l.to === me));
}

/** The one passing on: a request into hello/ of the take's sharing point. → path */
export async function askPassOn({ store, chainBytes, device, person, deviceKey = null, now = Date.now() }) {
  const take = readFile(dec.decode(chainBytes)), at = timeLabel(now), id = newId({ q: device, n: person.id, now });
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }),
    [defLine('chain.1', { id: writeId(take.head.id, await hashBytes(chainBytes)) })], [`{:chain.1} (ask)'t(${at})`]));
  const path = `hello/${buildName({ words: ['ask'], person: person.label, time: at, u: uOf(id), kind: 'chain', ext: 'sign' })}`;
  await store.write(path, enc.encode(text));
  return path;
}

/** The author: requests about her takes in a sharing point. → [{ path, from, fromId, take (id with hash) }] */
export async function asksFor(store, me) {
  const out = [];
  for (const { path } of await store.list('hello/').catch(() => [])) {
    if (!/\(ask\).*\.chain\.sign$/.test(path)) continue;
    try {
      const f = readFile(dec.decode(await store.read(path))), take = f.defs.get('chain.1')?.id;
      if (take?.n === me && rowsOf(f).some((r) => /\(ask\)/.test(r))) out.push({ path, from: f.head['@'] ?? '', fromId: f.head.id.n, take });
    } catch { /* not a request */ }
  }
  return out;
}

/** The author allows: her answer beside the take, the request to quiet/. → path of the answer */
export async function allowPassOn({ store, ask, device, person, deviceKey = null, now = Date.now() }) {
  const at = timeLabel(now), id = newId({ q: device, n: person.id, now });
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }),
    [defLine('chain.1', { id: writeId(ask.take, ask.take.hash) }), defLine('person.1', { id: writeId({ n: ask.fromId }) })],
    [`{:chain.1} {} {:person.1} (always)'t(${at})`]));
  const path = pathOf({ words: [], person: person.label, time: at, kind: 'chain', u: uOf(id) });
  await store.write(path, enc.encode(text));
  await store.move(ask.path, `quiet/${ask.path.slice('hello/'.length)}`);
  return path;
}

/** The author declines: the request only moves to quiet/. */
export async function declinePassOn({ store, ask }) {
  await store.move(ask.path, `quiet/${ask.path.slice('hello/'.length)}`);
}
