// media.js — finding what a take is made of, for the screen: its picture, its small preview, its context text.
//
// Purpose:   the surface shows takes by their small picture and their chips; the files say where those are only
//            through the chain (SCHEMA: references by ID, never by path). This file walks the index for that, once per
//            take, and keeps what it found for the session. Taken over from app.js of the version until 16.11.
//            (visualOf, contextTextOf, previewOf), unchanged in what it does:
//              preview  fastest first: the copy on this device (index/preview/<u_>.jpg) · its echo .v.jpg beside it
//                       (echo/v/<month>/ or the same folder, e.g. hello/) · else drawn from the video (frame.js)
// Depends:   1-model (ids, filename, file), 9-ui/frame.js, 9-ui/debug.js
// Test:      needs a browser (pictures); the index it reads is tested in tests/index.test.mjs.
// Limits:    one listing per folder per session; pictures kept as object URLs for the session (≈ 5 KB each).

import { writeId } from '../1-model/ids.js';
import { readName } from '../1-model/filename.js';
import { readFile } from '../1-model/file.js';
import { firstFrame } from './frame.js';
import { note as debugNote } from './debug.js';

const dec = new TextDecoder();

/** Bind to the device store and a getter for { index, sources }. → helpers */
export function mediaOf(store, now) {
  const pics = new Map(), listings = new WeakMap();
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
    const visual = refs.find((d) => d.kind === 'v' && !d.echo)
      ?? refs.filter((d) => d.kind === 'chain' && d.name !== 'chain.1').map((d) => index.chain(writeId(d.id))).flatMap((c) => (c ? [...c.defs.values()] : [])).find((d) => d.kind === 'v' && !d.echo);
    return visual ? at(index.sharingPoints(writeId(visual.id)).find((x) => /\.v\.(mp4|png)$/.test(x))) : null;
  }
  /** The context text of a take chain (its :x strand), or ''. */
  async function contextTextOf(chain) {
    const { index } = now();
    const x = [...chain.defs.values()].find((d) => d.kind === 'x' && d.id);
    const where = x && at(index.sharingPoints(writeId(x.id)).find((p) => /\.x\.sign$/.test(p)));
    if (!where) return '';
    return readFile(dec.decode(await where.store.read(where.path))).rows.map((r) => r.text ?? '').join(' ').trim();
  }
  function listOnce(where, folder) {
    if (!listings.has(where)) listings.set(where, new Map());
    const m = listings.get(where);
    if (!m.has(folder)) m.set(folder, where.list(folder).then((fs) => fs.map((f) => f.path), () => []));
    return m.get(folder);
  }
  async function previewOf(p) {
    const n = readName(p.path.slice(p.path.lastIndexOf('/') + 1));
    const cached = n?.u && `index/preview/${n.u}.jpg`;
    const asUrl = (b) => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' }));
    if (cached) { const b = await store.read(cached).catch(() => null); if (b) return asUrl(b); }
    const keep = (b) => { if (cached && p.store !== store) store.write(cached, b).catch(() => {}); return asUrl(b); };
    if (n?.time) {
      for (const folder of new Set([p.path.slice(0, p.path.lastIndexOf('/') + 1), `echo/v/${n.time.slice(0, 7)}/`])) {
        const list = await listOnce(p.store, folder);
        const hit = list.find((x) => x.endsWith('.v.jpg') && (({ echo, time, person } = readName(x.slice(x.lastIndexOf('/') + 1)) ?? {}) => echo === 'preview' && time === n.time && person === n.person)());
        if (hit) { const b = await p.store.read(hit).catch(() => null); if (b) return keep(b); }
      }
    }
    let bytes;
    try { bytes = await p.store.read(p.path); } catch (err) { debugNote({ method: 'frame', where: p.path, error: `read: ${err?.message ?? err}`, ms: 0 }); throw err; }
    const url = await firstFrame(new Blob([bytes], { type: 'video/mp4' }), { path: p.path });
    if (url && cached) fetch(url).then((r) => r.arrayBuffer()).then((b) => store.write(cached, new Uint8Array(b))).catch(() => {});
    return url;
  }
  /** A small picture of a picture or video file, once per path. → object URL or null */
  async function picOf(p) {
    if (!p) return null;
    if (pics.has(p.path)) return pics.get(p.path);
    const job = (p.path.endsWith('.png') ? p.store.read(p.path).then((b) => URL.createObjectURL(new Blob([b], { type: 'image/png' }))) : previewOf(p)).catch(() => null);
    pics.set(p.path, job);
    return job;
  }
  /** The playable file of a picture or video: { url, picture } */
  async function playable(p) {
    const bytes = await p.store.read(p.path);
    const picture = p.path.endsWith('.png');
    const type = picture ? 'image/png' : p.path.endsWith('.webm') ? 'video/webm' : 'video/mp4'; // as recorded (settings.js pickVideoType)
    return { url: URL.createObjectURL(new Blob([bytes], { type })), picture };
  }
  return { visualOf, contextTextOf, picOf, playable, at };
}
