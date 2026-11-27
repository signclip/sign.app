// intake.js — files come into the app: dropped onto the window, or shared from another app (27.11., user).
//
// Purpose:   the screen side of 5-take/intake.js. A file dropped anywhere on the app, or shared to the installed web
//            app (manifest share_target → sw.js keeps the files → picked up here at the start), becomes a Take in the
//            own sharing point, goes on by the rules like every Take (engine.afterTake) and is found in Similar.
//            One short line says what came in and what was refused. No button, no menu: the window is the target.
// Depends:   browser; 5-take/intake.js, device-keys.js
// Test:      the logic in tests/intake.test.mjs; drop and share on a device.
// Limits:    files one after the other · a video's length is read from the file by the browser (≤ 3 s wait, else 0) ·
//            sharing into the app needs the installed web app on Android (Chrome); iOS has no share target for web
//            apps — there the way is the native app · a dropped folder is not walked: folders come in by Plus.

import { takeFromFile, sortFile } from '../5-take/intake.js';
import { deviceKeys } from './device-keys.js';

export const SHARED = 'sign-shared'; // the cache where sw.js lays shared files down

/** How long a video is, read by the browser. → ms (0 if it cannot tell) */
function lengthOf(blob) {
  return new Promise((done) => {
    const v = document.createElement('video'), url = URL.createObjectURL(blob);
    const end = (ms) => { URL.revokeObjectURL(url); done(ms); };
    v.preload = 'metadata'; v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0); v.onerror = () => end(0);
    setTimeout(() => end(0), 3000); v.src = url;
  });
}

export function intakeOf(A) {
  /** files: File[] or Blob-likes with a name → how many became Takes */
  async function take(files) {
    if (!A.store || !A.person) { A.say?.('noch nicht bereit'); return 0; }
    const deviceKey = (await deviceKeys().catch(() => null))?.device ?? null;
    let came = 0;
    const refused = [];
    for (const f of files) {
      const file = { name: f.name ?? 'file', type: f.type ?? '', size: f.size ?? 0 };
      try {
        if (sortFile(file).refused) { refused.push(file.name); continue; } // sorted before reading: a refused file is never loaded
        const bytes = new Uint8Array(await f.arrayBuffer());
        const got = await takeFromFile({ ...file, bytes }, { store: A.store, device: A.device, person: A.person, deviceKey, now: Date.now(), lengthMs: sortFile(file).as === 'v' ? await lengthOf(f) : 0 });
        if (got.refused) { refused.push(file.name); continue; }
        came += 1;
        A.engine?.afterTake(got.saved.paths).catch(() => {});
      } catch (err) { console.warn('intake', err); refused.push(file.name); }
    }
    if (came) A.reindex?.();
    A.say?.([came ? `${came} herein` : '', refused.length ? `nicht: ${refused.slice(0, 2).join(', ')}${refused.length > 2 ? ' …' : ''}` : ''].filter(Boolean).join(' · '));
    return came;
  }

  /** Files shared to the installed web app wait in a cache (sw.js): take them in, then clear. */
  async function shared() {
    if (!globalThis.caches || !A.store || !A.person) return 0; // not ready yet: the files wait in the cache
    const cache = await caches.open(SHARED), keys = await cache.keys();
    const files = [];
    for (const k of keys) {
      const res = await cache.match(k), blob = await res.blob();
      files.push(Object.assign(blob, { name: decodeURIComponent(res.headers.get('x-name') ?? 'shared') }));
      await cache.delete(k);
    }
    return files.length ? take(files) : 0;
  }

  function listen(target = document) {
    target.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    target.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      take(files);
    });
    shared().catch((err) => console.warn('shared', err));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) shared().catch(() => {}); });
  }

  return { take, shared, listen };
}
