// import-take.js — a Take whose strands come from files instead of camera and microphone (27.11., user: import).
//
// Purpose:   a video, a picture or a sound that was made elsewhere – picked on the device, sent from another app, lying
//            in a sharing point, a track of a package like a DCP – becomes a Take like any other: it lies in take/v/ or
//            take/a/, a chain says "taken into this Take", context can stand beside it, it is found, shared and built on.
//            Three things differ from a Take that was recorded here (SCHEMA.md B5, proposal of 27.11.):
//              1 the bytes stay as they came – no head is written into them; the hash in the chain covers the file (as
//                with the wake). The same file gets the same hash on every device and outside of Sign.
//              2 its definition carries its name from outside and says where it came from – a sharing point, as
//                everything outside is one:   :sharing-point.1^(WhatsApp)
//                                             :v.1(IMG_2041.mov)~(:sharing-point.1)!(q_… u_… HASH)
//                A reference in ~( ) is no method, so the strand stays :v, not :~v (G10); the form is the one a shared
//                Take has at its target (~(:chain.1) there).
//              3 it goes in pieces (2-storage/pieces.js): any size the sharing point takes, read once, hashed on the way.
//            The line is the one of every Take: {:~w.1 _({:v.1 :a.1 :x.1})}'t(when it was made, how long).
//            Originals first, the chain last: if anything fails, nothing points into nothing. A try that broke gives
//            its plan back (err.plan: the IDs and times it had chosen); the next try with that plan writes the same
//            names, so files that arrived are not sent again and the object storage goes on with its pieces.
// Depends:   1-model (ids, hash, file, filename, symbols, crypto), 2-storage (layout, pieces, memory)
// Test:      tests/import.test.mjs
// Limits:    a file's size = what its sharing point takes (pieces.js: device and object storage any, WebDAV and a
//            sealed one whole up to 256 MiB today) · kinds: visual (video/*, image/*) and sound (audio/*) by type or
//            ending; anything else needs its kind said by the caller (a track of a package), otherwise it is refused by
//            name – there is no strand for a PDF yet · the name from outside: ≤ 120 characters, brackets taken out ·
//            when it was made and how long it runs: what the caller knows (a file's own date is often the day it was
//            copied); unknown = now, length 0 · the same file imported twice lies twice (the same hash shows it;
//            EXTEND: point to the first instead) · a wake only if the caller could draw one (a phone draws none from
//            JPEG 2000 or ProRes).
// EXTEND(W2, import): a package (DCP: CPL → one line per reel, PKL hashes checked against ours) on top of this ·
//                     a file already there by its hash = a reference, no second copy.

import { newId, writeId, uOf } from '../1-model/ids.js';
import { storedText } from '../1-model/hash.js';
import { headLine, defLine, fileText } from '../1-model/file.js';
import { flatWords, timeLabel } from '../1-model/filename.js';
import { strandName, inOrder } from '../1-model/symbols.js';
import { signed } from '../1-model/crypto.js';
import { pathOf } from '../2-storage/layout.js';
import { piecesOf, writePieces, hashPieces } from '../2-storage/pieces.js';

const enc = new TextEncoder();

const VISUAL = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff'];
const SOUND = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff'];
const BY_TYPE = { jpeg: 'jpg', quicktime: 'mov', mpeg: 'mp3', 'x-wav': 'wav', 'x-m4a': 'm4a', 'svg+xml': 'svg' };

/** The ending a file keeps: its own, small letters; without one, what its type says. → 'mov' | null */
export function endingOf({ name = '', type = '' }) {
  const own = /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1].toLowerCase();
  if (own) return own;
  const sub = type.split('/')[1]?.split(';')[0].trim().toLowerCase();
  if (!sub) return null;
  return BY_TYPE[sub] ?? (/^[a-z0-9]{1,8}$/.test(sub) ? sub : null);
}

/** Which strand a file becomes: 'v' visual, 'a' sound – by what the caller says, then its type, then its ending. → kind | null */
export function kindOfFile({ name = '', type = '', kind = null }) {
  if (kind) return kind;
  if (/^(video|image)\//.test(type)) return 'v';
  if (/^audio\//.test(type)) return 'a';
  const end = endingOf({ name });
  return VISUAL.includes(end) ? 'v' : SOUND.includes(end) ? 'a' : null;
}

/** A name from outside as it may stand in ( ): no brackets, no line breaks, one space between words, ≤ 120 characters. */
export const nameOutside = (name) => String(name ?? '').replace(/[()\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/ \./g, '.').trim().slice(0, 120);

/**
 * device: q_ id · person: { id: n_…, label } · cell: H3 cell or null · where: label of the room or town, or null
 * files: [{ data, name, type, kind }] – data: bytes, a Blob or File, or pieces (pieces.js); name: as it is called outside;
 *        type: its media type if known; kind: 'v' or 'a' only when type and ending do not say it
 * from:  { label, path } – where they came from: the name of an app, a folder, a profile, and its address if there is one; or null
 * context: text of the gestures, typed here · wake: JPEG bytes 96 × 96 of the first visual, or null
 * made: when the first file was made, in ms, if known · lengthMs: how long it runs, if known · now: the moment of the import
 * store: where it goes · deviceKey: seals the chain and the context · onPiece({ file, done, size }): for the running rim
 * plan: what an earlier try gave back in err.plan – the same names again, files that arrived are kept
 * Returns { chain: { path, id }, paths, files: [{ path, kind, size, hash }], plan }.
 */
export async function importTake({ device, person, cell = null, where = null, now = Date.now(), files = [], from = null, context = '', wake = null, made = null, lengthMs = 0, store, deviceKey = null, onPiece = null, plan = null }) {
  if (!files.length) throw new Error('an import needs at least one file');
  const again = Boolean(plan);
  const make = () => newId({ q: device, n: person.id, o: cell, now: plan.now });
  plan ??= { now, made: made ?? now, lengthMs };
  plan.ids ??= { files: files.map(make), context: context ? make() : null, wake: wake ? make() : null, chain: make() };
  const time = timeLabel(plan.made, plan.lengthMs);
  const words = context ? flatWords(context) : [];
  const base = { words, person: person.label, time };
  const head = (kind, id) => headLine(kind, { '!': writeId(id), '@': person.label, "'t": time });

  const sorted = files.map((f, i) => {
    const kind = kindOfFile(f), ext = endingOf(f);
    if (!['v', 'a'].includes(kind) || !ext) throw new Error(`no strand for this file yet: ${nameOutside(f.name) || f.type || 'without a name'}`);
    return { ...f, kind, ext, id: plan.ids.files[i] };
  });
  const origin = from?.label ? defLine('sharing-point.1', { hint: nameOutside(from.label), ...(from.path ? { path: from.path } : {}) }) : null;
  const defs = origin ? [origin] : [], used = [], echoes = [], paths = [], written = [];
  const numbered = (kind, computed = false) => {
    const all = computed ? echoes : used;
    const name = strandName(kind, all.filter((n) => n.startsWith(strandName(kind, '', computed))).length + 1, computed);
    all.push(name);
    return name;
  };

  /** On a second try: does this file lie there already (with this size, if one is given)? One listing of its folder. */
  const arrived = async (path, size = null) => (await store.list(path.slice(0, path.lastIndexOf('/') + 1))).some((f) => f.path === path && (size == null || f.size === size));

  try {
    for (const [i, f] of sorted.entries()) { // the bytes as they came, in pieces, hashed on the way
      const path = pathOf({ ...base, kind: f.kind, u: uOf(f.id), ext: f.ext });
      const pieces = piecesOf(f.data);
      let got;
      if (again && await arrived(path, pieces.size)) got = { size: pieces.size, hash: await hashPieces(pieces) }; // it is there from the first try: nothing travels, its hash is read from the file at hand
      else got = await writePieces(store, path, pieces, { onPiece: onPiece ? (step) => onPiece({ file: i, ...step }) : null });
      defs.push(defLine(numbered(f.kind), { label: nameOutside(f.name) || null, ...(origin ? { echo: ':sharing-point.1' } : {}), id: writeId(f.id, got.hash) }));
      paths.push(path); written.push({ path, kind: f.kind, ...got });
    }
    const small = async (kind, id, bytes, { echo } = {}) => { // what is made here: the context that was typed, the wake that was drawn
      const path = pathOf({ ...base, kind, u: uOf(id), ...(echo ? { echo: echo.split(' ')[0] } : {}) });
      const got = again && await arrived(path) ? { hash: await hashPieces(await store.read(path)) } // as it was written then (a seal differs each time)
        : await writePieces(store, path, bytes);
      defs.push(defLine(numbered(kind, Boolean(echo)), { id: writeId(id, got.hash), ...(echo ? { echo } : {}) }));
      paths.push(path);
    };
    if (context) {
      const id = plan.ids.context;
      await small('x', id, enc.encode(await signed(deviceKey, fileText(head('x', id), [], [storedText(context).replace(/\s*\n\s*/g, ' ').trim()]))));
    }
    if (wake && plan.ids.wake && used.includes(strandName('v', 1))) await small('w', plan.ids.wake, wake, { echo: 'wake :v.1' });

    const refs = (names) => inOrder(names).map((u) => `:${u}`);
    const took = `_({${refs(used).join(' ')}})`;
    const line = `${echoes.length ? `{${[...refs(echoes), took].join(' ')}}` : took}'t(${time})`;
    const chainHead = headLine('chain', { '!': writeId(plan.ids.chain), '@': person.label, '°': where, "'t": time });
    const chainPath = pathOf({ ...base, where, kind: 'chain', u: uOf(plan.ids.chain) });
    await store.write(chainPath, enc.encode(await signed(deviceKey, fileText(chainHead, defs, [line])))); // the chain last
    paths.push(chainPath);
    return { chain: { path: chainPath, id: plan.ids.chain }, paths, files: written, plan };
  } catch (err) {
    err.plan = plan; // the next try with it writes the same names
    throw err;
  }
}
