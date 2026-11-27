// add-echo.js — add something computed to a Take: Whisper text now, landmarks and masks later.
//
// Purpose:   an echo is a new file (in echo/) plus a new chain on top (decision 07.11.):
//              :chain.1!(old chain, hash)  :a.1~(:chain.1)!(…)  :~x.1~(whisper small 3F9A2C1D :a.1)!(new, hash)
//              {:~x.1}'t(…)                 "text came from a.1 by Whisper" (~ before the letter: computed, G10)
//              {:chain.1}
//            Names (:~x.1) are local to a file, so the new echo may reuse a number used below.
// Depends:   1-model (file, ids, hash, json, filename), 2-storage/layout
// Test:      tests/take.test.mjs
// Limits:    one echo ≈ its file + ~0.5 KB chain · a better model later = one more echo on top;
//            the old one stays valid.
//            Landmarks :~l pass bytes instead of text (27.11., 6-compute); masks :~m (.m.mp4) will the same way.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel, flatWords } from '../1-model/filename.js';
import { pathOf, partsOf } from '../2-storage/layout.js';
import { strandName, artOf } from '../1-model/symbols.js';

const enc = new TextEncoder();

/**
 * own: store the echo and its chain are written to · chainPath · from: e.g. "a.1" · kind: e.g. "x" · echo: method label ·
 * row: the content (text kinds) or bytes: the file as it is (27.11.: landmarks :~l – no head of its own, the hash in the
 * chain holds it, as for the wake) · source: the store the take's chain lies in, if not own (27.11.: someone else's take,
 * shared to read – the echo and the chain on top lie with whoever computed, the take stays untouched).
 */
export async function addEcho({ own, chainPath, from, kind, row, bytes: given = null, echo, device, person, now = Date.now(), deviceKey = null, source = own }) {
  const oldBytes = await source.read(chainPath);
  const file = readFile(new TextDecoder().decode(oldBytes));
  const src = file.defs.get(from);
  if (!src?.id) throw new Error(`not defined in this chain: :${from}`);
  const at = timeLabel(now);
  const id = newId({ q: device, n: person.id, now });
  const name = partsOf(chainPath);
  const bytes = given ?? enc.encode(await signed(deviceKey, fileText(headLine(artOf(kind, true), { '!': writeId(id), '~': echo, '@': person.label, "'t": at }), [], [row])));
  const echoPath = pathOf({ words: given ? name.words : flatWords(row), echo, person: person.label, time: at, kind, u: uOf(id) });
  await own.write(echoPath, bytes);

  const mine = strandName(kind, src.art === artOf(kind, true) ? src.n + 1 : 1, true); // an echo: ~x.1, ~l.1 (G10); from an echo of the same kind: the next number
  const chainId = newId({ q: device, n: person.id, now });
  const chainText = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(chainId), '@': person.label, "'t": at }), [
    defLine('chain.1', { id: writeId(file.head.id, await hashBytes(oldBytes)) }),
    defLine(from, { id: writeId(src.id, src.id.hash), echo: ':chain.1' }),
    defLine(mine, { id: writeId(id, await hashBytes(bytes)), echo: `${echo} :${from}` }),
  ], [`{:${mine}}'t(${at})`, '{:chain.1}']));
  const path = pathOf({ words: name.words, person: person.label, where: name.where, time: at, kind: 'chain', u: uOf(chainId) });
  await own.write(path, enc.encode(chainText));
  return { echo: echoPath, chain: path };
}
