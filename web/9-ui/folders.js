// folders.js — a folder on this device or on a plugged-in disk as a sharing point, =(folder:Name).
//
// Purpose:   the person picks a folder once (a disk, a USB stick, a synced folder of another cloud
//            such as iCloud Drive or Dropbox on the computer); the app keeps the folder handle by
//            the sharing point's q_ and opens it again whenever it is there. Not there (disk
//            unplugged) = "nicht verbunden", nothing fails; there again = its rules run (backup).
// Depends:   browser: File System Access API (showDirectoryPicker: Chrome/Edge on the computer;
//            not Safari, not Chrome on Android) · IndexedDB keeps the handle (no secret in it).
//            native app: EXTEND(S4, folders): Android folder access (SAF) / iOS document picker,
//            same three functions.
// Test:      needs a browser; the store behind it is LocalStore (tests/share.test.mjs).
// Limits:    the browser asks once per session for permission (a tap on the tile); one handle per
//            sharing point; a check whether it is there costs one directory read (~1 ms).

import { LocalStore } from '../2-storage/local.js';

const DB = 'sign-folders', STORE = 'handles';

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const canPick = () => typeof globalThis.showDirectoryPicker === 'function';

export const folders = {
  /** Let the person pick a folder (needs a tap). → { name } and the handle kept under id. */
  async pick(id) {
    const handle = await globalThis.showDirectoryPicker({ id: 'sign', mode: 'readwrite' });
    await run('readwrite', (s) => s.put(handle, id));
    return { name: handle.name };
  },
  /**
   * The folder as a store, or null when it is not there now. ask: true only inside a tap
   * (the browser shows its permission question then).
   */
  async open(id, { ask = false } = {}) {
    const handle = await run('readonly', (s) => s.get(id));
    if (!handle) return null;
    let state = await handle.queryPermission?.({ mode: 'readwrite' }) ?? 'granted';
    if (state !== 'granted' && ask) state = await handle.requestPermission({ mode: 'readwrite' });
    if (state !== 'granted') return null;
    try { for await (const _ of handle.keys()) break; } catch { return null; } // unplugged disk
    return new LocalStore(handle);
  },
  async remove(id) { await run('readwrite', (s) => s.delete(id)); },
};
