// add-line.js — lay elements onto a chain: a new line on top, the old chain below (decision 07.11., G4b/G4c).
//
// Purpose:   a Similar result dropped on the line, all of Similar, or two elements of the line put after or
//            together: each element is another chain (a take, a similar), referenced, never copied.
//              :chain.1!(the chain below, hash)  :chain.2!(element, hash)  :chain.3!(…)
//              {:chain.2} {:chain.3}'t(…)        after: one bracket each, one after another
//              {:chain.2 :chain.3}'t(…)          together: one bracket, at the same time
//              {:chain.1}
//            Without a chain below (nothing recorded yet) the new chain is the first: no :chain.1.
// Depends:   1-model (file, ids, hash, crypto, json, filename), 2-storage/layout
// Test:      tests/take.test.mjs
// Limits:    one line ≈ 0.3 KB + 0.15 KB per element; at most 64 elements per line (a longer one = two lines).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel } from '../1-model/filename.js';
import { toJson } from '../1-model/json.js';
import { pathOf, partsOf, jsonPath } from '../2-storage/layout.js';

export const MAX_ELEMENTS = 64;
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * own: store · chainPath: the chain to lay onto, or null · elements: [{ bytes }] the chains' file bytes (their id
 * and hash are read from them) · together: false = after · device, person, deviceKey, now.
 * → { chain: path of the new chain on top }
 */
export async function addLine({ own, chainPath = null, elements, together = false, device, person, deviceKey = null, now = Date.now() }) {
  if (!elements?.length) throw new Error('a line needs at least one element');
  if (elements.length > MAX_ELEMENTS) throw new Error(`at most ${MAX_ELEMENTS} elements in one line`);
  const at = timeLabel(now);
  const defs = [];
  let below = null;
  if (chainPath) {
    const bytes = await own.read(chainPath);
    below = readFile(dec.decode(bytes));
    defs.push(defLine('chain.1', { id: writeId(below.head.id, await hashBytes(bytes)) }));
  }
  const names = [];
  for (const { bytes } of elements) {
    const head = readFile(dec.decode(bytes)).head;
    const name = `chain.${defs.length + 1}`;
    defs.push(defLine(name, { id: writeId(head.id, await hashBytes(bytes)) }));
    names.push(`:${name}`);
  }
  const line = together ? `{${names.join(' ')}}'t(${at})` : `${names.map((n) => `{${n}}`).join(' ')}'t(${at})`;
  const id = newId({ q: device, n: person.id, now });
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }), defs, below ? [line, '{:chain.1}'] : [line]));
  const name = chainPath ? partsOf(chainPath) : { words: [] };
  const path = pathOf({ words: name.words ?? [], person: person.label, where: name.where, time: at, kind: 'chain', u: shortU(id) });
  await own.write(path, enc.encode(text));
  await own.write(jsonPath(path), enc.encode(toJson(text)));
  return { chain: path };
}
