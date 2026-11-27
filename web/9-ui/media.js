// media.js — finding what a take is made of, for the screen: its picture, its wake (small picture), its context text.
//
// Purpose:   the surface shows takes by their small picture and their chips; the files say where those are only
//            through the chain (SCHEMA: references by ID, never by path). This file walks the index for that, once per
//            take, and keeps what it found for the session. Taken over from app.js of the version until 16.11.
//            (visualOf, contextTextOf, wakeOf), unchanged in what it does:
//              wake     the take's small picture, fastest first: the copy on this device (index/wake/<u_>.jpg) · its echo
//                       .w.jpg beside it (echo/w/<month>/ or the same folder, e.g. hello/; :~w since 26.11.) · else drawn
//                       from the video (frame.js)
//                       26.11.: also at a moment inside the video (picOf(where, ms): the right half of a cut), kept
//                       as index/wake/<u_>.<ms>.jpg; a dark frame is shown but not kept, so it is drawn anew next
//                       time; a folder's listing is asked again when a wake is missing (≥ LIST_AGAIN_MS later).
// Depends:   1-model (ids, filename, file), 9-ui/frame.js, 9-ui/debug.js
// Test:      needs a browser (pictures); the index it reads is tested in tests/index.test.mjs.
//            26.11. (user: the app hung, waiting before a take plays): a file of this device is no longer read to be
//            played – the browser plays it from the disk (store.blob, local.js), so an own take starts at once however
//            long it is (before: read whole, ≈ 2 MB per second of video, and copied once more). A wake that has to be
//            drawn from a video far away asks for the video's beginning only (WAKE_FIRST through readPiece, pieces.js: the first picture lies there)
//            instead of the whole file; only if that gives no picture the whole file is read as before – and not at
//            all when the phone saves data (ahead.js allowed).
//            27.11. (user: the first seconds are loaded ahead, the take starts at once): a video far away is no
//            longer read whole before it plays. Read ahead = its beginning (stream.js FIRST = 4 MiB ≈ 2 s); played =
//            fed to the video while the rest comes, piece by piece (readPiece). Where that cannot be (no ranges
//            from the store, a browser that cannot be fed, a kind of video not known here) the file is read whole
//            as before; a feeding that fails once switches it off until the app is opened again and is noted
//            (debug: stream). On a line slower than the take it starts once enough is here to play through
//            without a halt (stream.js startAt), not before.
// Limits:    what has come of far files and is not whole yet: at most KEPT = 96 MiB, the least recently used goes ·
//            one listing per folder, asked again at most every 30 s; pictures kept as object URLs for the session (≈ 5 KB each);
//            playable files: the last 10 (ahead.js MAX), a take ≈ 2 MB per second (15 Mbit/s); of those only the ones from
//            far away lie in memory · WAKE_FIRST = 1.5 MiB (≈ 0.8 s of video: its first whole picture and more), so
//            40 tiles without a wake ≈ 60 MB instead of 40 whole videos (≈ 350 MB at 4 s each).

import { writeId } from '../1-model/ids.js';
import { readName } from '../1-model/filename.js';
import { readFile } from '../1-model/file.js';
import { frameOf } from './frame.js';
import { note as debugNote } from './debug.js';
import { filesOf, allowed } from './ahead.js';
import { comingOf, streamOf, startAt, FIRST, HOLD } from './stream.js';
import { feedType } from '../1-model/media-codec.js';
import { secondsOf } from '../1-model/mp4-duration.js';

const dec = new TextDecoder();
/** A chain that only adds something computed on top of the chain below (an echo: Whisper, later landmarks), no take of its own. */
export const isEcho = (c) => Boolean(c?.defs?.has('chain.1')) && [...c.defs.values()].every((d) => d.kind === 'chain' || d.echo) && [...c.defs.values()].some((d) => d.kind !== 'chain' && d.echo && d.echo !== ':chain.1');
const LIST_AGAIN_MS = 30_000;
export const WAKE_FIRST = 3 * 512 * 1024;
export const KEPT = 96 * 2 ** 20;
const typeOf = (path) => (path.endsWith('.png') ? 'image/png' : path.endsWith('.wav') ? 'audio/wav' : path.endsWith('.webm') ? 'video/webm' : 'video/mp4'); // as recorded (settings.js pickVideoType)
/** A file of this device as the browser holds it (nothing read), under the type its name says; null where the store has none. */
const onDisk = async (p) => { const b = p.store.blob ? await p.store.blob(p.path).catch(() => null) : null; return b && b.type !== typeOf(p.path) ? b.slice(0, b.size, typeOf(p.path)) : b; };

/**
 * Bind to the device store and a getter for { index, sources }. frame: draws a picture from a video (frame.js; tests
 * pass their own) · Source: the browser's MediaSource (none = far videos are read whole) · first, piece: how much of a
 * far video comes at once (stream.js) · feed: hands a coming file to a video element (stream.js streamOf). → helpers
 */
export function mediaOf(store, now, { frame = frameOf, Source = globalThis.MediaSource, first = FIRST, piece = null, feed = streamOf } = {}) {
  const pics = new Map(), listings = new WeakMap();
  const comings = new Map(); // path → { file, type, ready }: far videos as they come, in order of last use
  let feeding = true; // off once a feeding failed (this browser, this kind of file): whole files from then on
  const at = (where) => {
    if (!where) return null;
    const [name, ...rest] = where.split(':');
    const src = now().sources.find((x) => x.name === name);
    return src ? { store: src.store, path: rest.join(':') } : null;
  };
  /** The first picture or video of a chain (or of the chains it lays on): { store, path } or null. */
  function visualOf(chain) {
    const { index } = now();
    const refs = [...chain.defs.values()];
    const inside = (list) => list.map((d) => index.chain(writeId(d.id))).flatMap((c) => (c ? [...c.defs.values()] : [])).find((d) => d.kind === 'v' && !d.echo);
    const visual = refs.find((d) => d.kind === 'v' && !d.echo)
      ?? inside(refs.filter((d) => d.kind === 'chain' && d.name !== 'chain.1'))
      ?? (isEcho(chain) ? inside(refs.filter((d) => d.name === 'chain.1')) : null); // an echo on top of a take (26.11.): the take's picture
    return visual ? at(index.sharingPoints(writeId(visual.id)).find((x) => /\.v\.(mp4|webm|png)$/.test(x))) : null; // webm: a browser without MP4 recording (settings.js pickVideoType)
  }
  /** The sound of a take chain (its :a strand, a .a.wav beside the picture, 20.11.): { store, path } or null. */
  function soundOf(chain) {
    const { index } = now();
    const a = chain && [...chain.defs.values()].find((d) => d.kind === 'a' && d.id && !d.echo);
    return a ? at(index.sharingPoints(writeId(a.id)).find((p) => /\.a\.wav$/.test(p))) : null;
  }
  /** The context text of a take chain (its :x strand), or ''. */
  async function contextTextOf(chain) {
    const { index } = now();
    const x = [...chain.defs.values()].find((d) => d.kind === 'x' && d.id);
    const where = x && at(index.sharingPoints(writeId(x.id)).find((p) => /\.x\.sign$/.test(p)));
    if (!where) return '';
    return readFile(dec.decode(await where.store.read(where.path))).rows.map((r) => r.text ?? '').join(' ').trim();
  }
  /** The playable file of a picture or video: { url, picture } — read once, kept among the last few (ahead.js). */
  const files = filesOf(async (p) => {
    const c = comings.get(p.path); // far away and partly here already (27.11.): the rest is read, nothing twice
    const came = c ? await c.ready.then(() => (c.file.keep ? c.file.whole() : null)).catch(() => null) : null;
    const blob = (await onDisk(p)) ?? new Blob(came ?? [await p.store.read(p.path)], { type: typeOf(p.path) }); // on this device: played from the disk, not read (26.11.)
    if (came) comings.delete(p.path); // whole now: kept here among the playable files, not twice
    return { url: URL.createObjectURL(blob), picture: p.path.endsWith('.png') };
  });

  // ---------- far away: a video plays while it comes (stream.js, 27.11.) ----------
  /** Can this file be played while it comes? A video, not on this device, from a store that gives ranges, in a browser that can be fed. */
  const comes = (p) => feeding && Boolean(Source) && /\.v\.(mp4|webm)$/.test(p.path) && !p.store.blob && typeof p.store.readPiece === 'function';
  /** The file as it comes (made once per path; its size from the folder's listing where there is one). */
  function comingFor(p) {
    const had = comings.get(p.path);
    if (had) { comings.delete(p.path); comings.set(p.path, had); return had; } // used last, goes last
    const c = { file: null, type: undefined, ready: null };
    c.ready = listOnce(p.store, p.path.slice(0, p.path.lastIndexOf('/') + 1)).then((list) => {
      const size = list.sizes?.get(p.path) ?? null;
      c.file = comingOf((from, to) => p.store.readPiece(p.path, from, to), { size, first, ...(piece ? { piece } : {}), keep: size == null || size <= HOLD });
      return c;
    });
    comings.set(p.path, c);
    let held = 0;
    for (const x of comings.values()) held += x.file?.bytes ?? 0;
    for (const [path, x] of comings) { if (held <= KEPT || path === p.path) break; held -= x.file?.bytes ?? 0; comings.delete(path); } // the least recently used go
    return c;
  }
  /** The beginning of a far video is here (read now, or read ahead before). → its entry */
  const begun = async (p) => { const c = await comingFor(p).ready; await c.file.piece(0); return c; };
  /** The words Whisper read from a take's sound (its newest echo on top, 26.11., heard.js), as written: (Wort)'t(…) … or ''. */
  async function heardOf(chain) {
    const { index } = now();
    const echoes = [...(index.tables.weave.get(chain?.key) ?? [])].map((k) => index.tables.chains.get(k)).filter((c) => c?.below === chain.key && isEcho(c));
    const top = echoes.sort((a, b) => String(b.head?.["'t"] ?? '').localeCompare(String(a.head?.["'t"] ?? '')))[0];
    const x = top && [...top.defs.values()].find((d) => d.kind === 'x' && /^whisper /.test(d.echo ?? '')); // :~x.1~(whisper …) – kind stays 'x', ~ says computed (G10)
    const where = x && at(index.sharingPoints(writeId(x.id)).find((p) => /\.x\.sign$/.test(p)));
    if (!where) return '';
    return readFile(dec.decode(await where.store.read(where.path))).rows.map((r) => r.text ?? '').join(' ').trim();
  }
  function listOnce(where, folder, { fresh = false } = {}) {
    if (!listings.has(where)) listings.set(where, new Map());
    const m = listings.get(where), have = m.get(folder);
    if (!have || (fresh && Date.now() - have.at > LIST_AGAIN_MS)) m.set(folder, { at: Date.now(), job: where.list(folder).then((fs) => Object.assign(fs.map((f) => f.path), { sizes: new Map(fs.map((f) => [f.path, f.size])) }), () => []) }); // the paths; their sizes ride along (27.11.)
    return m.get(folder).job;
  }
  async function wakeOf(p, ms = 0) {
    const n = readName(p.path.slice(p.path.lastIndexOf('/') + 1));
    const cached = n?.u && `index/wake/${n.u}${ms > 0 ? `.${ms}` : ''}.jpg`;
    const asUrl = (b) => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' }));
    if (cached) { const b = await store.read(cached).catch(() => null); if (b) return asUrl(b); }
    const keep = (b) => { if (cached && p.store !== store) store.write(cached, b).catch(() => {}); return asUrl(b); };
    if (n?.time && !ms) { // the take's own wake (its first picture, :~w), written beside it when it was made
      const beside = (list) => list.find((x) => x.endsWith('.w.jpg') && (({ echo, time, person } = readName(x.slice(x.lastIndexOf('/') + 1)) ?? {}) => echo === 'wake' && time === n.time && person === n.person)());
      for (const folder of new Set([p.path.slice(0, p.path.lastIndexOf('/') + 1), `echo/w/${n.time.slice(0, 7)}/`])) {
        const hit = beside(await listOnce(p.store, folder)) ?? beside(await listOnce(p.store, folder, { fresh: true })); // made after the folder was listed: asked again
        if (hit) { const b = await p.store.read(hit).catch(() => null); if (b) return keep(b); }
      }
    }
    // the file itself: the playable copy if it is there already (a take just looked at) · on this device the file on
    // the disk · else read for this picture only
    const near = files.has(p) || Boolean(p.store.blob);
    const whole = async () => (files.has(p) ? files.get(p).then((x) => fetch(x.url)).then((r) => r.blob()) : (await onDisk(p)) ?? new Blob([await p.store.read(p.path)], { type: typeOf(p.path) }));
    let f = null;
    try {
      // far away, its first picture (26.11.): only the video's beginning is fetched; a picture that came out dark or not at all is not believed
      const here = comings.get(p.path)?.file?.have[0]; // read ahead already (27.11.): its beginning is here
      if (!near && !ms && (here || p.store.readPiece)) f = await Promise.resolve(here ?? p.store.readPiece(p.path, 0, WAKE_FIRST)).then((bytes) => frame(new Blob([bytes], { type: typeOf(p.path) }), { path: p.path, at: 0 })).catch(() => null);
      if ((!f?.url || f.dark) && (near || allowed())) f = (await frame(await whole(), { path: p.path, at: ms / 1000 })) ?? f;
    } catch (err) { debugNote({ method: 'frame', where: p.path, error: `read: ${err?.message ?? err}`, ms: 0 }); throw err; }
    if (f?.url && cached && !f.dark) fetch(f.url).then((r) => r.arrayBuffer()).then((b) => store.write(cached, new Uint8Array(b))).catch(() => {}); // a dark frame is not kept: drawn anew next time
    return f?.url ?? null;
  }
  /** A small picture of a picture or video file (ms: at that moment of a video), once per path and moment. → object URL or null */
  async function picOf(p, ms = 0) {
    if (!p) return null;
    const picture = p.path.endsWith('.png'), key = !picture && ms > 0 ? `${p.path}@${ms}` : p.path;
    if (pics.has(key)) return pics.get(key);
    const job = (picture ? p.store.read(p.path).then((b) => URL.createObjectURL(new Blob([b], { type: 'image/png' }))) : wakeOf(p, ms)).catch(() => null);
    pics.set(key, job);
    job.then((url) => { if (!url) pics.delete(key); }); // no picture (not written yet, far away): asked again next time (20.11.)
    return job;
  }
  /**
   * What a video or picture element plays: { url, picture }. A far video that is not whole here yet is fed while it
   * comes ({ coming: true }: the address is for one element, once). whole: true = the file itself in any case (to
   * hand it on, to save it).
   */
  async function playable(p, { whole = false } = {}) {
    if (whole || !comes(p) || files.has(p)) return files.get(p);
    let c;
    try { c = await begun(p); } catch { comings.delete(p.path); return files.get(p); } // its beginning could not be read: the whole read says why
    if (c.type === undefined) c.type = c.file.have[0] ? feedType(c.file.have[0], p.path.slice(p.path.lastIndexOf('.') + 1)) : null;
    if (!c.type || !Source.isTypeSupported?.(c.type)) return files.get(p); // nothing this browser can be fed with: whole, as before
    // a line slower than the take: first as much as it takes to play through without a halt (stream.js startAt)
    const seconds = c.file.have[0] && p.path.endsWith('.mp4') ? secondsOf(c.file.have[0]) : null;
    while (!c.file.ended && c.file.bytes < startAt(c.file.size, seconds, c.file.speed)) await c.file.more();
    if (c.file.ended && c.file.keep) return files.get(p); // all of it has come: one address for everyone, like a file of this device
    const s = feed(c.file, c.type, { MediaSource: Source, onError: (err) => { feeding = false; debugNote({ method: 'stream', where: p.path, error: String(err?.message ?? err).slice(0, 200), ms: 0 }); } });
    return { url: s.url, picture: false, coming: true };
  }
  /**
   * Have these files ready so a tap starts at once (21.11.; not when the phone saves data), one after another:
   * of a far video its first seconds (27.11.), of everything else the file.
   */
  let aheadOf = Promise.resolve();
  const ahead = (list) => {
    if (!allowed()) return;
    for (const w of list) {
      if (!w) continue;
      if (comes(w) && !files.has(w)) aheadOf = aheadOf.then(() => begun(w)).catch(() => {});
      else files.ahead([w]);
    }
  };
  return { visualOf, soundOf, contextTextOf, heardOf, picOf, playable, ahead, at };
}
