// local.js — the device as a sharing point: same contract, files in the browser's private
//            storage (OPFS) or a folder the native app gives (both offer a directory handle).
//
// Purpose:   local first (decision 07.11.): Takes, context and index work without an account;
//            after login the files are copied to the cloud, checked by hash.
// Depends:   a directory handle with getDirectoryHandle / getFileHandle / removeEntry / entries
//            (File System Access API: navigator.storage.getDirectory() in every current browser).
// Test:      tests/share.test.mjs (with a fake handle in memory)
// Limits:    the browser decides the quota (often up to ~60 % of free disk); Safari removes site
//            data after 7 days without use unless the PWA is installed (home screen) or the storage is
//            persisted: lasting() asks once at start; false = the device is only a cache, so its files
//            (and person and device id) must also go to a lasting sharing point (15.11., storage review).
//            Listing (26.11.): list(prefix) walks only the folder the prefix names (before: every folder of the
//            device for every question, and the size of every file asked anew – one question to the browser per
//            file, so a listing grew with everything ever taken). A file's size is asked once and remembered: files
//            are never written over here (write refuses, a part is removed and written anew through this store),
//            so a size holds. Kept: ≈ 150 B per file (20,000 takes ≈ 100,000 files ≈ 15 MB).

import { ExistsError, MissingError } from './memory.js';

const toBytes = (b) => (typeof b === 'string' ? new TextEncoder().encode(b) : b);

/**
 * Will the browser keep these files? Asks for persistent storage once (no prompt in Chrome, Safari
 * grants it to installed web apps). → true (kept) · false (may be removed after 7 days without use).
 * The native app (folder of the app) is always lasting.
 */
export async function lasting(storage = globalThis.navigator?.storage) {
  if (!storage?.persist) return false;
  try { return (await storage.persisted?.()) || (await storage.persist()); } catch { return false; }
}

export class LocalStore {
  /** root: a directory handle, e.g. await navigator.storage.getDirectory(). */
  constructor(root) {
    this.root = root;
    this.sizes = new Map(); // path → size, asked once
  }

  async dir(parts, create) {
    let d = this.root;
    for (const p of parts) {
      try { d = await d.getDirectoryHandle(p, { create }); } catch { return null; }
    }
    return d;
  }

  split(path) {
    const parts = path.split('/');
    return { folders: parts.slice(0, -1), name: parts.at(-1) };
  }

  async list(prefix = '') {
    const out = [];
    const sizeOf = async (p, h) => { if (!this.sizes.has(p)) this.sizes.set(p, (await h.getFile()).size); return this.sizes.get(p); };
    const walk = async (d, at) => {
      for await (const [name, h] of d.entries()) {
        const p = at + name;
        if (h.kind === 'directory') await walk(h, p + '/');
        else if (p.startsWith(prefix)) out.push({ path: p, size: await sizeOf(p, h) });
      }
    };
    const folders = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')).split('/') : []; // only the folder the prefix names
    const from = folders.length ? await this.dir(folders, false) : this.root;
    if (from) await walk(from, folders.length ? `${folders.join('/')}/` : '');
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(path) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, false);
    try { return new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer()); } catch { throw new MissingError(path); }
  }

  /**
   * The file itself, as the browser holds it on the disk (26.11.): nothing is read into memory. A video played from
   * it starts at once and reads only what it shows; before, a take of the device was read whole (≈ 2 MB per second
   * of video) and copied once more before its first picture. Only stores whose files lie on this device have this.
   */
  async blob(path) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, false);
    try { return await (await d.getFileHandle(name)).getFile(); } catch { throw new MissingError(path); }
  }

  async write(path, bytes) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, true);
    let exists = true;
    try { await d.getFileHandle(name); } catch { exists = false; }
    if (exists) throw new ExistsError(path);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    const data = toBytes(bytes);
    await w.write(data);
    await w.close();
    this.sizes.set(path, data.length ?? data.byteLength ?? data.size);
  }

  /** A range of a file (pieces.js): the device reads only these bytes from its disk. */
  async readPiece(path, from, to) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, false);
    let file;
    try { file = await (await d.getFileHandle(name)).getFile(); } catch { throw new MissingError(path); }
    if (typeof file.slice === 'function') return new Uint8Array(await file.slice(from, to).arrayBuffer());
    return new Uint8Array(await file.arrayBuffer()).subarray(from, to);
  }

  /** A file of any size, piece by piece (pieces.js): one piece in memory at a time; a write that breaks leaves nothing. */
  async writeFrom(path, pieces, { piece = 8 * 2 ** 20 } = {}) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, true);
    let exists = true;
    try { await d.getFileHandle(name); } catch { exists = false; }
    if (exists) throw new ExistsError(path);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    try {
      for (let at = 0; at < pieces.size; at += piece) await w.write(await pieces.slice(at, Math.min(at + piece, pieces.size)));
      await w.close();
    } catch (err) {
      try { await w.abort?.(); } catch { /* nothing was kept */ }
      try { await d.removeEntry(name); } catch { /* already gone */ }
      throw err;
    }
  }

  async remove(path) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, false);
    try { await d?.removeEntry(name); } catch { /* already gone */ }
    this.sizes.delete(path);
  }

  async move(from, to) {
    const bytes = await this.read(from);
    await this.write(to, bytes);
    await this.remove(from);
  }
}
