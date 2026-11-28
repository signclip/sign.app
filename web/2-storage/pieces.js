// pieces.js — a file of any size, from wherever it comes, to any sharing point: piece by piece (26.11., user:
//            "we build abstract, the possibilities stay").
//
// Purpose:   until now a file lay whole in memory on its way (a phone: some 100 MB) and only the object storage took
//            pieces. Here is the one form for every way in and every way on:
//              pieces      { size, slice(from, to) → Uint8Array }   the bytes [from, to) of one file, asked for when needed
//              piecesOf    bytes, a text, a Blob or File (picked, sent from another app, a recording) → pieces
//              piecesIn    a file that lies in a sharing point → pieces (read in ranges)
//              writePieces pieces → any sharing point, written once; gives { size, hash } – the hash of hash.js,
//                          summed while the pieces pass, so the file is read once
//              copyPieces  from one sharing point to another: device, disk, NAS, Nextcloud, object storage, later
//                          another device – nothing between them holds more than a few pieces
//            A store may bring two more calls beside the five of memory.js; it stays a store without them:
//              readPiece(path, from, to) → Uint8Array     a range of a file
//              writeFrom(path, pieces)                    never over; asks pieces.slice in order, each byte once
//            A store without them gets and gives a file whole, up to WHOLE; above that TooLargeError says so in
//            numbers instead of filling the memory. Nothing is forbidden anywhere: a store that learns writeFrom
//            takes any size from then on, and no caller changes.
// Depends:   1-model/hash-stream.js, memory.js (MissingError)
// Test:      tests/pieces.test.mjs · the object storage: tests/gateway.test.mjs
// Limits:    in memory at once: 1 piece (device, disk, memory) or ≤ 4 (object storage: 3 on their way, 1 being
//            read) – 8 MiB each up to 78 GiB, 19 MiB at 190 GB · the hash costs ≈ 165 MB/s on a server CPU
//            (hash-stream.js), a phone less: it is the slowest step on a fast line, the line is on a slow one –
//            who only sends (sending.js, routes.js) asks for no hash ({ hash: false }) ·
//            who has which calls today: memory, device and folder both; object storage both; a Nextcloud both
//            (27.11., webdav.js: pieces into its uploads folder); any other WebDAV server (NAS, Storage Box, a public
//            link) readPiece only, so it takes a file up to WHOLE = 256 MiB (≈ 2 min of video at 17 Mbit/s) until
//            it learns writeFrom; a sealed sharing point (sealed-store.js) neither yet ·
//            a copy is not read back: the object storage checks SHA-256 per piece, the device writes to a file of
//            its own first; whoever needs more compares the hash given here with the one in the chain.
// EXTEND(W2, storage): writeFrom for the other WebDAV servers (one streamed PUT) · sealed pieces from pieces
//                      (sealed.js already seals 8 MiB at a time) ·
//                      another device as a store (near, direct) brings the same two calls.

import { hashStream } from '../1-model/hash-stream.js';
import { MissingError } from './memory.js';
import { limit, LIMITS } from '../1-model/limits.js';

const MiB = 2 ** 20;
/** The piece every store cuts by, unless it has a reason (the object storage: at most 10,000 pieces). */
export const PIECE = LIMITS.piece.value; // the preselection, 8 MiB; what counts: limit('piece')
/** The most a store without readPiece / writeFrom gives or takes in one piece. */
export const WHOLE = LIMITS.whole.value; // the preselection, 256 MiB; what counts: limit('whole')
/** The piece a store cuts by that takes at most 10,000 of them (object storage, Nextcloud): 8 MiB, or more for a file above 78 GiB. */
export const pieceSize = (bytes, piece = limit('piece')) => Math.max(piece, Math.ceil(bytes / 10000 / MiB) * MiB);

/** A file too big for a store that only knows whole files. */
export class TooLargeError extends Error {}

const enc = new TextEncoder();
const isPieces = (x) => x != null && typeof x === 'object' && typeof x.size === 'number' && typeof x.slice === 'function' && typeof x.arrayBuffer !== 'function' && !ArrayBuffer.isView(x);

/**
 * Whatever holds a file → its pieces. Takes bytes (Uint8Array, ArrayBuffer), a text (UTF-8), a Blob or File
 * (nothing is read until a piece is asked for) or pieces as they are.
 */
export function piecesOf(from) {
  if (typeof from === 'string') from = enc.encode(from);
  if (from instanceof ArrayBuffer) from = new Uint8Array(from);
  if (from instanceof Uint8Array) return { size: from.length, slice: async (a, b) => from.subarray(a, b) };
  if (typeof Blob !== 'undefined' && from instanceof Blob) return { size: from.size, slice: async (a, b) => new Uint8Array(await from.slice(a, b).arrayBuffer()) };
  if (isPieces(from)) return from;
  throw new TypeError('no bytes, no text, no Blob, no pieces');
}

/**
 * A file that lies in a sharing point → its pieces. size: from the index or a listing when the caller has it,
 * otherwise the folder is listed once.
 */
export async function piecesIn(store, path, { size = null, whole = limit('whole') } = {}) {
  if (size == null) {
    const found = (await store.list(path.slice(0, path.lastIndexOf('/') + 1))).find((f) => f.path === path); // its folder: the object storage lists folders only
    if (!found) throw new MissingError(path);
    size = found.size;
  }
  if (typeof store.readPiece === 'function') return { size, slice: (a, b) => store.readPiece(path, a, Math.min(b, size)) };
  if (size > whole) throw new TooLargeError(`${store.name ?? 'this store'} gives a file only whole: ${path} has ${size} bytes, more than ${whole}`);
  let bytes = null; // read once, when the first piece is asked for
  return { size, slice: async (a, b) => (bytes ??= await store.read(path)).subarray(a, b) };
}

/** The hash of a file (as hashBytes gives it), read piece by piece. */
export async function hashPieces(from, { piece = limit('piece') } = {}) {
  const pieces = piecesOf(from), sum = hashStream();
  for (let at = 0; at < pieces.size; at += piece) sum.add(await pieces.slice(at, Math.min(at + piece, pieces.size)));
  return sum.done();
}

/**
 * Write a file to a sharing point, piece by piece, never over an existing one (ExistsError, as every write).
 * onPiece({ done, size }): after every piece that was read – for the running rim of a tile.
 * → { size, hash }: the hash for the definition in the chain; summed on the way when the store asks in order and
 * for every byte (a store that goes on after a break skips what is there), otherwise in a second pass.
 * hash: false – who only sends needs none ({ size, hash: null }): the sum is the slowest step on a phone.
 */
export async function writePieces(store, path, from, { whole = limit('whole'), onPiece = null, hash = true } = {}) {
  const pieces = piecesOf(from), size = pieces.size, sum = hash ? hashStream() : null;
  let next = 0, inOrder = true;
  const passing = {
    size,
    async slice(a, b) {
      const bytes = await pieces.slice(a, b);
      if (sum && inOrder && a === next) { sum.add(bytes); next = a + bytes.length; } else inOrder = false;
      onPiece?.({ done: Math.min(b, size), size });
      return bytes;
    },
  };
  if (typeof store.writeFrom === 'function') await store.writeFrom(path, passing);
  else {
    if (size > whole) throw new TooLargeError(`${store.name ?? 'this store'} takes a file only whole: ${path} has ${size} bytes, more than ${whole}`);
    await store.write(path, await passing.slice(0, size));
  }
  return { size, hash: !hash ? null : inOrder && next === size ? sum.done() : await hashPieces(pieces) };
}

/** Copy one file from a sharing point to another (as: its path there). → { size, hash } */
export async function copyPieces(from, to, path, { as = path, size = null, whole = limit('whole'), onPiece = null, hash = true } = {}) {
  return writePieces(to, as, await piecesIn(from, path, { size, whole }), { whole, onPiece, hash });
}
