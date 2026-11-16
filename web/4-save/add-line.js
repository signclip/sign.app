// add-line.js — lay elements onto a chain: a new line on top, the old chain below (decision 07.11., G4b/G4c).
//
// Purpose:   a Similar result dropped on the line, all of Similar, or two elements of the line put after or
//            together: each element is another chain (a take, a similar), referenced, never copied.
//              :chain.1!(the chain below, hash)  :chain.2!(element, hash)  :chain.3!(…)
//              {:chain.2} {:chain.3}'t(…)        after: one bracket each, one after another
//              {:chain.2 :chain.3}'t(…)          together: one bracket, at the same time
//              {:chain.1}
//              {:chain.2'(0_1200)} {:chain.2'(1200_2400)}  split (15.11.): one take as two parts, '( ) in ms, no new file
//              (Essen)({:chain.2} {:chain.3})'t(…)  a context for every element of the line (16.11.), multiplied out
//              -(Essen)({:chain.2} {:chain.3})'t(…) that context out of all of them (- = without)
//            Without a chain below (nothing recorded yet) the new chain is the first: no :chain.1.
//            The chain below may also come as bytes from elsewhere (below): in Similar · Doppel the result is the
//            line underneath and the new take is laid on it (14.11.).
// Depends:   1-model (file, ids, hash, crypto, json, filename), 2-storage/layout
// Test:      tests/take.test.mjs
// Limits:    one line ≈ 0.3 KB + 0.15 KB per element; at most 64 elements per line (a longer one = two lines).

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel } from '../1-model/filename.js';
import { pathOf, partsOf } from '../2-storage/layout.js';

export const MAX_ELEMENTS = 64;
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * own: store · chainPath: the chain to lay onto, or null · below: its bytes instead (a chain of another store) · elements: [{ bytes }] the chains' file bytes (their id
 * and hash are read from them), part: [fromMs, toMs] = only that part ('( )) · together: false = after · context: '(Essen)' for all of
 * them, without: true = that context out of all of them · device, person, deviceKey, now.
 * → { chain: path of the new chain on top }
 */
export async function addLine({ own, chainPath = null, below: belowBytes = null, elements, together = false, context = null, without = false, device, person, deviceKey = null, now = Date.now() }) {
  if (!elements?.length) throw new Error('a line needs at least one element');
  if (elements.length > MAX_ELEMENTS) throw new Error(`at most ${MAX_ELEMENTS} elements in one line`);
  const at = timeLabel(now);
  const defs = [];
  let below = null;
  if (chainPath || belowBytes) {
    const bytes = belowBytes ?? await own.read(chainPath);
    below = readFile(dec.decode(bytes));
    defs.push(defLine('chain.1', { id: writeId(below.head.id, await hashBytes(bytes)) }));
  }
  const names = [];
  const seen = new Map(); // the same take twice (split): one definition
  for (const { bytes, part } of elements) {
    const head = readFile(dec.decode(bytes)).head, hash = await hashBytes(bytes);
    let name = seen.get(hash);
    if (!name) { name = `chain.${defs.length + 1}`; seen.set(hash, name); defs.push(defLine(name, { id: writeId(head.id, hash) })); }
    names.push(part ? `:${name}'(${Math.round(part[0])}_${Math.round(part[1])})` : `:${name}`);
  }
  const inner = together ? `{${names.join(' ')}}` : names.map((n) => `{${n}}`).join(' ');
  const line = context ? `${without ? '-' : ''}${context}(${inner})'t(${at})` : `${inner}'t(${at})`; // a context before the bracket: for all inside
  const id = newId({ q: device, n: person.id, now });
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }), defs, below ? [line, '{:chain.1}'] : [line]));
  const name = chainPath ? partsOf(chainPath) : { words: [] };
  const path = pathOf({ words: name.words ?? [], person: person.label, where: name.where, time: at, kind: 'chain', u: uOf(id) });
  await own.write(path, enc.encode(text));
  return { chain: path };
}
