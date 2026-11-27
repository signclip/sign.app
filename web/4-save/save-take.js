// save-take.js — one Take: bytes in, files out, in the order that never leaves a broken link.
//
// Purpose:   video (no sound) .v.mp4 · audio .a.wav (32 bit float, head inside) · context
//            .x.sign · one chain file with one line "recorded here": _({:v.1 :a.1 :x.1}), with a video
//            {:~w.1 _({:v.1 :a.1 :x.1})} (its wake in front).
//            Originals are written first, the chain last: if anything fails, nothing points into
//            nothing (SCHEMA.md B5, decisions 06.–07.11.).
// Depends:   1-model (ids, hash, file, json, wav, filename), 2-storage/layout
// Test:      tests/storage.test.mjs
// Limits:    a 4.2 s Take = 4 files (+ its wake ≈ 3 KB): ≈ 8 MB video + 0.8 MB audio + 1 small text file + 1 chain file ·
//            (.json is made on demand by 1-model/json.js, never stored: 15.11.) ·
//            every strand may be missing (only audio, only text …).
//            onto + keep: adding to an existing combination (SCHEMA G4b): the kept strands come from the
//            chain below by reference, the new ones are recorded: {:x.1 _({:v.1})} and {:chain.1} at the bottom.
// Heads (14.11.): every strand carries its own head with ID and y_ (media-head.js: wav chunk, png tEXt, mp4 uuid box).
// Wake (16.11., renamed and own kind 26.11., user): a video take brings its small picture along as echo, in the same
//            chain: .w.jpg 96 × 96 in echo/w/ and :~w.1~(wake :v.1)!(…) (no head inside: the hash in the chain covers it;
//            recomputable any time). It stands first in the line, beside what was recorded: {:~w.1 _({:v.1 :a.1 :x.1})}
//            (G10: ~ = exists only computed; G6: not recorded, so outside _( ), its definition says where it came from).
// From outside (27.11., user: "the from → to pattern, as with sharing points"): a file dropped in or shared to the app
//            is an original, not computed. Its own name is the Bezeichnung of its strand: :v.1(Urlaub_Ostsee.mp4)!(…)
//            (names = { v: … }). Where it came from – the source, the earlier folder or path – is the first step, so the
//            lowest line, written as G4a writes sharing: {:v.1} {:sharing-point.1} {:sharing-point.2}'t(…) with
//            :sharing-point.1^(source)=(path)!(q_…) and :sharing-point.2!(q_ this device). No known source, no line.
// EXTEND(S5, landmarks): :~l .l.parquet and :~m .m.mp4 come as echo in a new chain on top of this one (add-echo.js).

import { relationLine } from '../2-storage/relations.js';
import { newId, writeId, uOf } from '../1-model/ids.js';
import { hashBytes, storedText } from '../1-model/hash.js';
import { headLine, defLine, fileText, readFile } from '../1-model/file.js';
import { encodeWav, wavSamples } from '../1-model/wav.js';
import { headed, sealHead } from '../1-model/media-head.js';
import { withDuration } from '../1-model/mp4-duration.js';
import { flatWords, timeLabel } from '../1-model/filename.js';
import { pathOf } from '../2-storage/layout.js';
import { artOf, strandName, inOrder, withFollowers } from '../1-model/symbols.js';
import { signed } from '../1-model/crypto.js';

const enc = new TextEncoder();

/**
 * device: q_ id · person: { id: n_…, label } · cell: H3 cell or null · where: label of the room or town, or null
 * now: start in ms · lengthMs · context: text of the gestures · video: Uint8Array or null · picture: PNG bytes (lossless) or null
 * audio: { channels: [Float32Array], sampleRate } or null · store: storage adapter
 * deviceKey: from crypto.newDeviceKey(); if given, every text file gets its witness y_
 * wake: JPEG bytes of the first picture (96 × 96) or null · onto: path of the chain it adds to · keep: kinds taken over from there by reference (state.toKeep)
 * ontoStore: where that chain lies, if not in store (21.11.: a take of someone else – the new chain is one's own, with a reference)
 * waiting: a template (21.11.) – the context with an empty take _() beside it, waiting for takes
 * Returns { chain: { path, id }, paths }.
 */
export async function saveTake({ device, person, cell = null, where = null, now = Date.now(), lengthMs = 0, context = '', video = null, picture = null, audio = null, store, deviceKey = null, onto = null, ontoStore = null, keep = [], wake = null, waiting = false, from = null, names = {} }) {
  if (from && onto) throw new Error('an import is an original: from and onto never together');
  const time = timeLabel(now, lengthMs);
  const words = context ? flatWords(context) : [];
  const base = { words, person: person.label, time };
  const make = () => newId({ q: device, n: person.id, o: cell, now });
  const head = (kind, id) => headLine(kind, { '!': writeId(id), '@': person.label, "'t": time });
  const files = [];
  const defs = [];
  const used = [];
  const echoes = []; // the wake: in the line, in front, but not recorded (outside _( ))

  const add = async (kind, id, bytes, { ext, echo } = {}) => {
    const path = pathOf({ ...base, kind, u: uOf(id), ...(ext ? { ext } : {}), ...(echo ? { echo: echo.split(' ')[0] } : {}) });
    files.push({ path, bytes });
    const n = defs.filter((d) => d.startsWith(`:${artOf(kind, Boolean(echo))}.`)).length + 1;
    defs.push(defLine(strandName(kind, n, Boolean(echo)), { label: echo ? undefined : names[kind], id: writeId(id, await hashBytes(bytes)), ...(echo ? { echo } : {}) })); // names: the file's own name, as Bezeichnung
    (echo ? echoes : used).push(strandName(kind, n, Boolean(echo)));
  };

  // every strand carries its own head with ID and seal (media-head.js); the chain then holds the hash of the whole file
  if (video) { // 'ftyp' = MP4; its real length goes into the moov before head and seal (21.11.: players that read only the moov)
    const id = make(), ext = video[4] === 0x66 && video[5] === 0x74 ? 'mp4' : 'webm';
    await add('v', id, await headed(ext, ext === 'mp4' ? withDuration(video) : video, head('v', id), deviceKey));
  }
  else if (picture) { const id = make(); await add('v', id, await headed('png', picture, head('v', id), deviceKey), { ext: 'png' }); } // one picture (14.11.): the visual strand as .v.png, lossless
  if (audio) {
    const id = make(), samples = wavSamples(audio.channels);
    await add('a', id, encodeWav(audio.channels, audio.sampleRate, await sealHead(deviceKey, head('a', id), samples), samples));
  }
  if (context) {
    const id = make();
    const text = await signed(deviceKey, fileText(head('x', id), [], [storedText(context).replace(/\s*\n\s*/g, ' ').trim()]));
    await add('x', id, enc.encode(text));
  }
  if (!used.length && !(onto && keep.length)) throw new Error('a Take needs at least one strand'); // on top of a take: keeping it without its context is a change too (21.11.)
  if (wake && video) await add('w', make(), wake, { echo: 'wake :v.1' }); // the small picture, as echo of the video

  const chainId = make();
  const chainHead = headLine('chain', { '!': writeId(chainId), '@': person.label, '°': where, "'t": time });
  const refs = (names) => inOrder(names).map((u) => `:${u}`);
  const took = used.length ? `_({${refs(used).join(' ')}})` : '';
  let line = waiting ? `{${refs(used).join(' ')} _()}'t(${time})` : echoes.length ? `{${[...refs(echoes), took].join(' ')}}'t(${time})` : `${took}'t(${time})`, below = [];
  if (onto) { // adding: kept definitions as they stand below, the old combination as :chain.1
    const baseText = new TextDecoder().decode(await (ontoStore ?? store).read(onto));
    const kept = baseText.split('\n').filter((l) => withFollowers(keep).some((k) => l.startsWith(`:${artOf(k)}.`))); // the wake goes with its :v
    defs.unshift(...kept, defLine('chain.1', { id: writeId(readFile(baseText).head.id, await hashBytes(enc.encode(baseText))) }));
    const nameOf = (l) => /^:(~?[a-z]+\.\d+)/.exec(l)[1];
    const wakes = [...kept.filter((l) => l.startsWith(`:${artOf('w')}.`)).map(nameOf), ...echoes]; // in front, like a new take's
    const elements = kept.filter((l) => !l.includes('~(')).map(nameOf); // other echoes (a small picture before 26.11.) are defined, not elements
    line = `{${[...refs(wakes), ...refs(elements), took].filter(Boolean).join(' ')}}'t(${time})`;
    below = ['{:chain.1}'];
  }
  if (from?.path || from?.id) { // came from a known source (27.11., user: the from → to pattern of sharing, G4a): the first step, lowest line
    defs.push(defLine('sharing-point.1', { hint: from.label ?? undefined, path: from.path ?? undefined, id: from.id ?? undefined }), defLine('sharing-point.2', { id: device }));
    below = [relationLine({ what: from.what, from: 1, to: 2, time })];
  }
  const chainText = await signed(deviceKey, fileText(chainHead, defs, [line, ...below]));
  const chainPath = pathOf({ ...base, where, kind: 'chain', u: uOf(chainId) });
  files.push({ path: chainPath, bytes: enc.encode(chainText) });

  for (const f of files) await store.write(f.path, f.bytes); // originals first, chain last
  return { chain: { path: chainPath, id: chainId }, paths: files.map((f) => f.path) };
}
