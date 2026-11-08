// local.js — the device as a sharing point: same contract, files in the browser's private
//            storage (OPFS) or a folder the native app gives (both offer a directory handle).
//
// Purpose:   local first (decision 07.11.): Takes, context and index work without an account;
//            after login the files are copied to the cloud, checked by hash.
// Depends:   a directory handle with getDirectoryHandle / getFileHandle / removeEntry / entries
//            (File System Access API: navigator.storage.getDirectory() in every current browser).
// Test:      tests/share.test.mjs (with a fake handle in memory)
// Limits:    the browser decides the quota (often up to ~60 % of free disk); Safari removes site
//            data after 7 days without use unless the PWA is installed.

import { ExistsError, MissingError } from './memory.js';

const toBytes = (b) => (typeof b === 'string' ? new TextEncoder().encode(b) : b);

export class LocalStore {
  /** root: a directory handle, e.g. await navigator.storage.getDirectory(). */
  constructor(root) {
    this.root = root;
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
    const walk = async (d, at) => {
      for await (const [name, h] of d.entries()) {
        const p = at + name;
        if (h.kind === 'directory') await walk(h, p + '/');
        else if (p.startsWith(prefix)) out.push({ path: p, size: (await h.getFile()).size });
      }
    };
    await walk(this.root, '');
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(path) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, false);
    try { return new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer()); } catch { throw new MissingError(path); }
  }

  async write(path, bytes) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, true);
    let exists = true;
    try { await d.getFileHandle(name); } catch { exists = false; }
    if (exists) throw new ExistsError(path);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(toBytes(bytes));
    await w.close();
  }

  async remove(path) {
    const { folders, name } = this.split(path);
    const d = await this.dir(folders, false);
    try { await d?.removeEntry(name); } catch { /* already gone */ }
  }

  async move(from, to) {
    const bytes = await this.read(from);
    await this.write(to, bytes);
    await this.remove(from);
  }
}
