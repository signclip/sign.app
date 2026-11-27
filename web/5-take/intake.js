// intake.js — a file from outside becomes a Take (27.11., user): dropped onto the window, shared from another app.
//
// Purpose:   three ways bring content in, and each does one thing:
//              Plus (sharing menu)      a whole folder, disk or account as a sharing point: stays where it lies
//              drop onto the Take       single files: each becomes a Take here, ← was already done, ↑ shares it on
//              shared from another app  the same as a drop (installed web app: manifest share_target; native: later)
//            What a file becomes:
//              .mp4 (video)             a Take with :v, its context = the words of the file name
//              .md .markdown .txt       a Take of words: title, [[pages]] and #tags (1-model/markdown.js)
//              anything else            refused with its reason — no strand holds it yet (pictures, PDF, DCP, sound
//                                       in other forms): which strand does is a decision of the schema, not of this file
//            Its own name stands at its strand as Bezeichnung: :v.1(Urlaub_Ostsee.mp4). Where it came from – source,
//            earlier folder, path – is written as sharing writes where something went (G4a, from → to), lowest in the
//            chain because it is the first step: {:v.1} {:sharing-point.1} {:sharing-point.2}, to = this device.
//            The browser never says from which folder a dropped or shared file came (name, size, type, date only):
//            then there is no such line. The file stays an original (no ~).
//            sortFile decides, takeFromFile saves; both know no screen.
// Depends:   4-save/save-take.js, 1-model/markdown.js
// Test:      tests/intake.test.mjs
// Limits:    a file is read whole into memory: ≈ 2 × its size for a moment, so a phone takes ≈ 200–500 MB at once;
//            larger files need reading in pieces (the sealed pieces of 8 MiB are there, the stores still take a file
//            whole) · the length of a video is given by the caller (the browser reads it from the file) ·
//            at most 12 words of a file name go into the context.

import { saveTake } from '../4-save/save-take.js';
import { readMarkdown, noteContext } from '../1-model/markdown.js';

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\-]*/gu;
const dec = new TextDecoder();
export const MOST_AT_ONCE = 500 * 2 ** 20;

/** The words of a file name, without its ending: 'Urlaub_Ostsee 2024.mp4' → '(Urlaub Ostsee 2024)'. */
export function nameContext(name) {
  const words = [...new Set(String(name).replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/_/g, ' ').normalize('NFC').match(WORD) ?? [])].slice(0, 12);
  return words.length ? `(${words.join(' ')})` : '';
}

/** A name as it may stand in ( ): no brackets, one line, ≤ 120 characters. */
export const nameLabel = (name) => String(name || 'file').replace(/[()[\]{}\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

/** What a file becomes. file: { name, type, size } → { as: 'v' | 'note' } or { refused: reason } */
export function sortFile({ name = '', type = '', size = 0 }) {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? '';
  if (size > MOST_AT_ONCE) return { refused: 'too large to read at once' };
  if (ext === 'mp4' || type === 'video/mp4') return { as: 'v' };
  if (['md', 'markdown', 'txt'].includes(ext) || type === 'text/markdown' || type === 'text/plain') return { as: 'note' };
  return { refused: `no strand for .${ext || type || '?'} yet` };
}

/**
 * Save one file as a Take. file: { name, type, size, bytes } · lengthMs: of a video · from: where it came from
 * ({ label, path, id }: a folder brought in by Plus, later a sending app or a link) – missing = not known (the browser
 * names no folder for a dropped or shared file) · the rest as saveTake.
 * → { saved (what saveTake gives), as } or { refused }
 */
export async function takeFromFile(file, { store, device, person, deviceKey = null, now = Date.now(), lengthMs = 0, cell = null, from = null }) {
  const sorted = sortFile(file);
  if (sorted.refused) return sorted;
  const context = sorted.as === 'note' ? noteContext(readMarkdown(dec.decode(file.bytes), file.name)) : nameContext(file.name);
  if (sorted.as === 'note' && context === '()') return { refused: 'no words in this note' };
  // its name stands at its strand (:v.1(name)); where it came from is the from → to line of sharing (G4a), only when known
  const kind = sorted.as === 'v' ? 'v' : 'x';
  const origin = from ? { label: from.label ?? null, path: from.path ?? null, id: from.id ?? null, what: [`${kind}.1`] } : null;
  const saved = await saveTake({ store, device, person, deviceKey, now, cell, lengthMs, context, video: kind === 'v' ? file.bytes : null, from: origin, names: { [kind]: nameLabel(file.name) } });
  return { saved, as: sorted.as };
}
