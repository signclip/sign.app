// move-note.js — a sealed move (15.11.): the old sharing point says where its content went, so the person's other
//            devices follow. Written when a sharing point is taken away (↓) shortly after everything was copied from
//            it to another one (held on, then carried). It names the new path only, never a password.
//
// Purpose:   (move).chain.sign at the root of the old sharing point:
//              :chain!(…)'t(…)  ·  :sharing-point.1 id=q_… z_…  ·  ((move) =(new path))'t(…)
//            sealed with the device key (y_); a reader checks the seal with the key in its own def.
// Depends:   1-model (file, ids, crypto, filename)
// Test:      tests/storage.test.mjs
// Limits:    one move per sharing point (a later one replaces it) · one GET to read it (404 = none) · ~400 B.

import { readFile, headLine, defLine, fileText } from '../1-model/file.js';
import { newId, writeId } from '../1-model/ids.js';
import { signed, checkWitness } from '../1-model/crypto.js';
import { timeLabel } from '../1-model/filename.js';

export const MOVE_NOTE = '(move).chain.sign';
const enc = new TextEncoder(), dec = new TextDecoder();

/** Old sharing point: where everything went. device: { id, key (public) } · person: { id } */
export async function writeMove(store, { to, device, deviceKey = null, person, now = Date.now() }) {
  const at = timeLabel(now);
  const text = await signed(deviceKey, fileText(headLine('chain', { '!': writeId(newId({ q: device.id, n: person.id, now })), "'t": at }),
    [defLine('sharing-point.1', { id: `${device.id} z_${device.key}` })], [`((move) =(${to}))'t(${at})`]));
  await store.remove?.(MOVE_NOTE).catch(() => {}); // a later move replaces the earlier one
  await store.write(MOVE_NOTE, enc.encode(text));
}

/** → { to, device } when a sealed move note lies here, else null. */
export async function readMove(store) {
  let text;
  try { text = dec.decode(await store.read(MOVE_NOTE)); } catch { return null; }
  try {
    const f = readFile(text), d = f.defs.get('sharing-point.1'), to = /\(\(move\) =\(([^()\s]+)\)\)/.exec(f.rows[0]?.text ?? '')?.[1];
    if (!to || !d?.id?.z || !(await checkWitness(d.id.z.slice(2), text))) return null;
    return { to, device: d.id.q };
  } catch { return null; }
}
