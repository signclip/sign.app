// remove-request.js — ask a foreign sharing point (a group, a course) to remove strands.
//
// Purpose:   the person cannot delete in a sharing point she does not hold; she drops a request into
//            its hello/ (the same drop as for joining):
//              :v.1!(q_ n_ t_ u_ HASH) …        what she asks to remove
//              {:v.1} (quiet)'t(…)
//            The signer's app honours it by itself when the request comes from the author: her n_
//            is in the strand's id and the request is sealed by one of her devices (authorKeys).
//            Anything else waits for the signer. The request moves to quiet/ as the record.
// Depends:   1-model (file, ids, crypto, filename), 4-save/remove (pathsOfStrand)
// Test:      tests/remove.test.mjs
// Limits:    one request ≈ 0.3 KB + 80 B per strand; honouring = one list + one delete per file.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, shortU } from '../1-model/ids.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { timeLabel, buildName } from '../1-model/filename.js';
import { pathsOfStrand } from '../4-save/remove.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** Person: ask to remove. strands: [{ name, id }] as defined in her own chain. → path in hello/ */
export async function askRemove({ store, strands, device, person, deviceKey = null, now = Date.now() }) {
  const id = newId({ q: device, n: person.id, now });
  const at = timeLabel(now);
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }),
    strands.map((s) => defLine(s.name, { id: writeId(s.id, s.id.hash) })),
    [`{${strands.map((s) => `:${s.name}`).join(' ')}} (quiet)'t(${at})`]));
  const path = `hello/${buildName({ words: ['quiet'], person: person.label, time: at, u: shortU(id), kind: 'chain', ext: 'sign' })}`;
  await store.write(path, enc.encode(text));
  return path;
}

/**
 * Signer's app: honour a request. authorKeys: { q_…: z_ } of the requesting person's devices.
 * → { removed: [paths], waiting: [names] } — waiting = not hers or not sealed: the signer decides.
 */
export async function honorRemove({ store, requestPath, authorKeys = {} }) {
  const text = dec.decode(await store.read(requestPath));
  const f = readFile(text);
  let sealed = false;
  for (const key of Object.values(authorKeys)) sealed ||= await checkWitness(key, text);
  const result = { removed: [], waiting: [] };
  for (const d of f.defs.values()) {
    if (!sealed || d.id?.n !== f.head.id.n) { result.waiting.push(d.name); continue; }
    for (const p of await pathsOfStrand(store, d.id)) { await store.remove(p); result.removed.push(p); }
  }
  if (!result.waiting.length) await store.move(requestPath, `quiet/${requestPath.slice('hello/'.length)}`);
  return result;
}
