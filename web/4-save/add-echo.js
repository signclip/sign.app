// add-echo.js — add something computed to a Take: Whisper text now, landmarks and masks later.
//
// Purpose:   an echo is a new file (in echo/) plus a new chain on top (decision 07.11.):
//              :chain.1!(old chain, hash)  :a.1!(…)~(:chain.1)  :x.1!(new, hash)~(whisper small 3F9A2C1D :a.1)
//              {:x.1}'t(…)                  "text came from a.1 by Whisper"
//              {:chain.1}
//            Names (:x.1) are local to a file, so the new echo may reuse a number used below.
// Depends:   1-model (file, ids, hash, json, filename), 2-storage/layout
// Test:      tests/take.test.mjs
// Limits:    one echo ≈ its file + ~0.5 KB chain · a better model later = one more echo on top;
//            the old one stays valid.
// EXTEND(S5, binary echo): landmarks (.l.parquet) and masks (.m.mp4) pass bytes instead of text.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel, flatWords } from '../1-model/filename.js';
import { toJson } from '../1-model/json.js';
import { pathOf, partsOf, jsonPath } from '../2-storage/layout.js';

const enc = new TextEncoder();

/** own: store · chainPath · from: e.g. "a.1" · kind: e.g. "x" · row: the content (for text kinds) · echo: method label. */
export async function addEcho({ own, chainPath, from, kind, row, echo, device, person, now = Date.now(), deviceKey = null }) {
  const oldBytes = await own.read(chainPath);
  const file = readFile(new TextDecoder().decode(oldBytes));
  const src = file.defs.get(from);
  if (!src?.id) throw new Error(`not defined in this chain: :${from}`);
  const at = timeLabel(now);
  const id = newId({ q: device, n: person.id, now });
  const text = await signed(deviceKey, fileText(headLine(kind, { '!': writeId(id), '~': echo, '@': person.label, "'t": at }), [], [row]));
  const bytes = enc.encode(text);
  const name = partsOf(chainPath);
  const echoPath = pathOf({ words: flatWords(row), echo, person: person.label, time: at, kind, u: shortU(id) });
  await own.write(echoPath, bytes);
  await own.write(jsonPath(echoPath), enc.encode(toJson(text)));

  const mine = `${kind}.${kind === src.kind ? src.n + 1 : 1}`;
  const chainId = newId({ q: device, n: person.id, now });
  const chainText = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(chainId), '@': person.label, "'t": at }), [
    defLine('chain.1', { id: writeId(file.head.id, await hashBytes(oldBytes)) }),
    defLine(from, { id: writeId(src.id, src.id.hash), echo: ':chain.1' }),
    defLine(mine, { id: writeId(id, await hashBytes(bytes)), echo: `${echo} :${from}` }),
  ], [`{:${mine}}'t(${at})`, '{:chain.1}']));
  const path = pathOf({ words: name.words, person: person.label, where: name.where, time: at, kind: 'chain', u: shortU(chainId) });
  await own.write(path, enc.encode(chainText));
  await own.write(jsonPath(path), enc.encode(toJson(chainText)));
  return { echo: echoPath, chain: path };
}
