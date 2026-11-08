// ask-take.js — ask for something that is missing: a take that a device or a server fills.
//
// Purpose:   no requests/ folder (decision 07.11.): a job is a take _( ) in a new chain on top:
//              :chain.1!(old chain, hash)  :v.1!(…)~(:chain.1)  :_.1(:m)~(:v.1)
//              {:_.1}                       "a mask that comes from v.1 is missing"
//              {:chain.1}
//            The index lists it under takes(); whoever fills it writes the next chain on top.
// Depends:   1-model (file, ids, hash, json), 2-storage/layout
// Test:      tests/share.test.mjs
// Limits:    one ask ≈ 0.5 KB · two devices may fill the same take: both results are valid
//            files, the app shows the newest.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes } from '../1-model/hash.js';
import { signed } from '../1-model/crypto.js';
import { timeLabel } from '../1-model/filename.js';
import { toJson } from '../1-model/json.js';
import { pathOf, partsOf, jsonPath } from '../2-storage/layout.js';

const enc = new TextEncoder();

/** own: store · chainPath: the chain · of: e.g. "v.1" · kind: what is missing, e.g. "m" or "l". */
export async function askTake({ own, chainPath, of, kind, device, person, now = Date.now(), deviceKey = null }) {
  const bytes = await own.read(chainPath);
  const file = readFile(new TextDecoder().decode(bytes));
  const src = file.defs.get(of);
  if (!src?.id) throw new Error(`not defined in this chain: :${of}`);
  const id = newId({ q: device, n: person.id, now });
  const at = timeLabel(now);
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(id), '@': person.label, "'t": at }), [
    defLine('chain.1', { id: writeId(file.head.id, await hashBytes(bytes)) }),
    defLine(of, { id: writeId(src.id, src.id.hash), echo: ':chain.1' }),
    defLine('_.1', { body: `(:${kind})`, echo: `:${of}` }),
  ], [`{:_.1}'t(${at})`, '{:chain.1}']));
  const name = partsOf(chainPath);
  const path = pathOf({ words: name.words, person: person.label, where: name.where, time: at, kind: 'chain', u: shortU(id) });
  await own.write(path, enc.encode(text));
  await own.write(jsonPath(path), enc.encode(toJson(text)));
  return path;
}
