// save-take.js — one Take: bytes in, files out, in the order that never leaves a broken link.
//
// Purpose:   video (no sound) .v.mp4 · audio .a.wav (32 bit float, head inside) · context
//            .x.sign + .x.json · one chain file with one line "recorded here": _({:v.1 :a.1 :x.1}).
//            Originals are written first, the chain last: if anything fails, nothing points into
//            nothing (SCHEMA.md B5, decisions 06.–07.11.).
// Depends:   1-model (ids, hash, file, json, wav, filename), 2-storage/layout
// Test:      tests/storage.test.mjs
// Limits:    a 4.2 s Take ≈ 8 MB video + 0.8 MB audio + 2 small text files + 2 chain files ·
//            every strand may be missing (only audio, only text …).
//            onto + keep: adding to an existing combination (SCHEMA G4b): the kept strands come from the
//            chain below by reference, the new ones are recorded: {:x.1 _({:v.1})} and {:chain.1} at the bottom.
// EXTEND(S2, video head): write the head line into the MP4 (udta box) once real recordings exist.
// EXTEND(S5, landmarks): .l.parquet and .m.mp4 come as echo in a new chain on top of this one.

import { newId, writeId, shortU } from '../1-model/ids.js';
import { hashBytes, storedText } from '../1-model/hash.js';
import { headLine, defLine, fileText, readFile } from '../1-model/file.js';
import { toJson } from '../1-model/json.js';
import { encodeWav } from '../1-model/wav.js';
import { flatWords, timeLabel } from '../1-model/filename.js';
import { pathOf, jsonPath } from '../2-storage/layout.js';
import { signed } from '../1-model/crypto.js';

const enc = new TextEncoder();

/**
 * device: q_ id · person: { id: n_…, label } · cell: H3 cell or null · where: label of the room or town, or null
 * now: start in ms · lengthMs · context: text of the gestures · video: Uint8Array or null · picture: PNG bytes (lossless) or null
 * audio: { channels: [Float32Array], sampleRate } or null · store: storage adapter
 * deviceKey: from crypto.newDeviceKey(); if given, every text file gets its witness y_
 * onto: path of the chain it adds to · keep: kinds taken over from there by reference (state.toKeep)
 * Returns { chain: { path, id }, paths }.
 */
export async function saveTake({ device, person, cell = null, where = null, now = Date.now(), lengthMs = 0, context = '', video = null, picture = null, audio = null, store, deviceKey = null, onto = null, keep = [] }) {
  const time = timeLabel(now, lengthMs);
  const words = context ? flatWords(context) : [];
  const base = { words, person: person.label, time };
  const make = () => newId({ q: device, n: person.id, o: cell, now });
  const head = (kind, id) => headLine(kind, { '!': writeId(id), '@': person.label, "'t": time });
  const files = [];
  const defs = [];
  const used = [];

  const add = async (kind, id, bytes, { json = null, ext } = {}) => {
    const path = pathOf({ ...base, kind, u: shortU(id), ...(ext ? { ext } : {}) });
    files.push({ path, bytes });
    if (json) files.push({ path: jsonPath(path), bytes: enc.encode(json) });
    const n = used.filter((u) => u.startsWith(`${kind}.`)).length + 1;
    defs.push(defLine(`${kind}.${n}`, { id: writeId(id, await hashBytes(bytes)) }));
    used.push(`${kind}.${n}`);
  };

  if (video) { const id = make(); await add('v', id, video); }
  else if (picture) { const id = make(); await add('v', id, picture, { ext: 'png' }); } // one picture (14.11.): the visual strand as .v.png, lossless
  if (audio) { const id = make(); await add('a', id, encodeWav(audio.channels, audio.sampleRate, head('a', id))); }
  if (context) {
    const id = make();
    const text = await signed(deviceKey, fileText(head('x', id), [], [storedText(context).replace(/\s*\n\s*/g, ' ').trim()]));
    await add('x', id, enc.encode(text), { json: toJson(text) });
  }
  if (!used.length) throw new Error('a Take needs at least one strand');

  const chainId = make();
  const chainHead = headLine('chain', { '!': writeId(chainId), '@': person.label, '°': where, "'t": time });
  const took = `_({${used.map((u) => `:${u}`).join(' ')}})`;
  let line = `${took}'t(${time})`, below = [];
  if (onto) { // adding: kept definitions as they stand below, the old combination as :chain.1
    const baseText = new TextDecoder().decode(await store.read(onto));
    const kept = baseText.split('\n').filter((l) => keep.some((k) => l.startsWith(`:${k}.`)));
    defs.unshift(...kept, defLine('chain.1', { id: writeId(readFile(baseText).head.id, await hashBytes(enc.encode(baseText))) }));
    line = `{${kept.map((l) => /^:[a-z]+\.\d+/.exec(l)[0]).join(' ')} ${took}}'t(${time})`;
    below = ['{:chain.1}'];
  }
  const chainText = await signed(deviceKey, fileText(chainHead, defs, [line, ...below]));
  const chainPath = pathOf({ ...base, where, kind: 'chain', u: shortU(chainId) });
  files.push({ path: chainPath, bytes: enc.encode(chainText) }, { path: jsonPath(chainPath), bytes: enc.encode(toJson(chainText)) });

  for (const f of files) await store.write(f.path, f.bytes); // originals first, chain last
  return { chain: { path: chainPath, id: chainId }, paths: files.map((f) => f.path) };
}
