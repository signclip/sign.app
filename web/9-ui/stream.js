// stream.js — a take from far away plays while it is still coming (27.11., user: the first seconds are loaded ahead,
//             the take starts at once and the rest follows).
//
// Purpose:   until 27.11. a take that lay at a sharing point far away was read whole before its first picture showed
//            (≈ 2 MB per second of video: 8 MB for 4 s = 1.3 s at 50 Mbit/s, 13 s at 5). The takes are written in
//            pieces of a second each (fragmented MP4, mp4-duration.js; WebM alike) and a store gives a range of a
//            file (readPiece, pieces.js). So:
//              coming   a file as it comes: its beginning (FIRST) when it is read ahead, then piece after piece
//                       (PIECE) when someone plays it. One read at a time; whoever asks meanwhile shares it.
//              stream   a video element is fed from a coming file through a MediaSource: what is there plays, what
//                       comes is appended, the end is told. The same file can be fed to several elements, each
//                       from its beginning.
//              startAt  how much of a take must be here before it plays through without a halt: nothing when
//                       the line brings at least what the take needs per second; otherwise the share the line
//                       cannot bring in time (a line of 8 Mbit/s and a take of 15: 47 % of it first). A sign that
//                       halts in the middle reads worse than one that starts a moment later.
//            The wake stays the picture that shows first (user 27.11.: the wake is the small picture, no clip).
// Depends:   browser MediaSource for stream (passed in for tests); nothing else
// Test:      tests/stream.test.mjs (fakes) · in Chrome with a real take: see the PR (first picture, played to its end)
// Limits:    FIRST = 4 MiB ≈ 2 s of video at 15 Mbit/s (more seconds at a lower rate), PIECE = 2 MiB ≈ 1 s ·
//            a file that is played lies twice in memory while it plays (its pieces here, and what the browser holds
//            to show them) · a file longer than HOLD = 64 MiB (≈ 34 s) is passed on without keeping its pieces
//            (keep: false): it plays while it comes but is read again the next time · the browser holds ≈ 150 MB
//            of video per element; beyond that it lets go of what was played, and until it has room the next piece
//            waits (tried again every second) · to keep playing without a halt the line must bring what the take
//            needs: 17 Mbit/s today · jumping ahead of what has come waits until it has come (pieces come in order).
// EXTEND(S10, iPhone): there the browser only has ManagedMediaSource, which opens only for a video element marked
//            disableRemotePlayback – to be tried on a phone; until then an iPhone reads a far take whole, as before.
// EXTEND(W2, sealed): a sealed sharing point gives no range yet (sealed-store.js: readPiece per sealed piece of
//            8 MiB) – with end-to-end sealing as the default (user 27.11.) that is the step that makes this count.

export const FIRST = 4 * 2 ** 20, PIECE = 2 * 2 ** 20, HOLD = 64 * 2 ** 20;

/**
 * A file as it comes. read(from, to) → Uint8Array (a range; shorter or empty at the file's end) · size: when known
 * (a listing), else the end is where a piece comes shorter than asked · keep: false = a piece is let go once the
 * next one is asked for (long files).
 * → { have, bytes, ended, piece(i), more(), rest(), whole() }
 */
export function comingOf(read, { size = null, first = FIRST, piece = PIECE, keep = true } = {}) {
  const have = []; // the pieces in order; null where one was let go
  let bytes = 0, ended = false, job = null, spent = 0; // spent: ms the reads took, for the speed of the line
  const clock = () => globalThis.performance?.now() ?? Date.now();

  /** Read the next piece. → true when one came, false at the end. One read at a time. */
  function more() {
    if (ended) return Promise.resolve(false);
    job ??= (async () => {
      const from = bytes, want = have.length ? piece : first, to = size != null ? Math.min(from + want, size) : from + want;
      const t0 = clock();
      const got = to > from ? await read(from, to) : new Uint8Array();
      if (got.length) { have.push(got); bytes += got.length; spent += clock() - t0; }
      if (got.length < to - from || !got.length || (size != null && bytes >= size)) ended = true;
      return got.length > 0;
    })().finally(() => { job = null; });
    return job;
  }
  /** The i-th piece, read if it has not come yet; null when the file ends before it (or the piece was let go). */
  async function pieceAt(i) {
    while (have.length <= i && !ended) await more();
    const bytesOf = have[i] ?? null;
    if (!keep && i > 0 && have[i - 1]) have[i - 1] = null; // long files: only the piece on its way stays
    return bytesOf;
  }
  /** Read to the end. */
  async function rest() { while (await more()); }
  /** The whole file as its pieces (for a Blob); throws when pieces were let go. */
  async function whole() {
    await rest();
    if (have.some((x) => !x)) throw new Error('not kept: this file is passed on, not held');
    return have;
  }
  return { have, piece: pieceAt, more, rest, whole, keep, size, get bytes() { return bytes; }, get ended() { return ended; },
    /** What the line brought so far, in bytes per second (0 = not known yet). */
    get speed() { return spent > 0 ? (bytes / spent) * 1000 : 0; } };
}

/**
 * How many bytes of a take must be here before it plays through without a halt. size: of the file · seconds: how
 * long it plays · line: bytes per second the line brings (counted with a tenth less, lines waver). 0 = start now.
 */
export function startAt(size, seconds, line) {
  if (!size || !seconds || !line) return 0;
  const needs = size / seconds, brings = line * 0.9;
  return brings >= needs ? 0 : Math.ceil(size * (1 - brings / needs));
}

/**
 * Feed a video element from a coming file. type: what the file holds ('video/mp4; codecs="avc1.640028"',
 * 1-model/media-codec.js). → { url, done, stop() } · url: for video.src · done: Promise(true) when everything was
 * handed over, Promise(false) when it could not be (told to onError) · stop(): no more pieces.
 */
export function streamOf(coming, type, { MediaSource: Source = globalThis.MediaSource, urlOf = (x) => URL.createObjectURL(x), revoke = (u) => URL.revokeObjectURL(u), wait = (ms) => new Promise((r) => setTimeout(r, ms)), onError = () => {} } = {}) {
  const source = new Source();
  const url = urlOf(source);
  let stopped = false;
  const open = () => source.readyState === 'open';
  const done = new Promise((resolve) => {
    source.addEventListener('sourceopen', async () => {
      revoke(url); // the element holds the source now; the address is not needed again
      try {
        const buffer = source.addSourceBuffer(type);
        const append = (bytes) => new Promise((ok, bad) => {
          const end = () => { buffer.removeEventListener('updateend', end); buffer.removeEventListener('error', fail); ok(); };
          const fail = () => { buffer.removeEventListener('updateend', end); buffer.removeEventListener('error', fail); bad(new Error('the browser did not take a piece')); };
          buffer.addEventListener('updateend', end); buffer.addEventListener('error', fail);
          try { buffer.appendBuffer(bytes); } catch (err) { buffer.removeEventListener('updateend', end); buffer.removeEventListener('error', fail); bad(err); }
        });
        for (let i = 0; !stopped && open(); i++) {
          const bytes = await coming.piece(i);
          if (!bytes) break;
          for (;;) { // full: the browser lets go of what was played; the piece waits until there is room
            if (stopped || !open()) return resolve(false);
            try { await append(bytes); break; } catch (err) { if (err?.name !== 'QuotaExceededError') throw err; await wait(1000); }
          }
        }
        if (!stopped && open()) source.endOfStream();
        resolve(!stopped);
      } catch (err) {
        onError(err);
        try { if (open()) source.endOfStream('decode'); } catch { /* closed meanwhile */ }
        resolve(false);
      }
    }, { once: true });
  });
  return { url, done, stop() { stopped = true; } };
}
