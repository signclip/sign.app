// memory.js — storage adapter in RAM. Reference for every other adapter.
//
// Purpose:   the storage contract in its simplest form (SCHEMA.md B6):
//              list(prefix) → [{ path, size }]   read(path) → Uint8Array
//              write(path, bytes) → never overwrites (ExistsError)   remove(path)
//              move(from, to) → rename only (content and hash stay; nothing points to paths)
//            Tests and the index run against it; WebDAV must behave the same.
// Depends:   nothing.
// Test:      tests/storage.test.mjs
// EXTEND(W2, storage): device folder (OPFS / app folder) and S3 via short-lived links get
//                      their own adapter with the same four functions.

export class ExistsError extends Error {}
export class MissingError extends Error {}

export class MemoryStore {
  constructor(name = 'memory') {
    this.name = name;
    this.files = new Map();
  }

  async list(prefix = '') {
    return [...this.files.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, bytes]) => ({ path, size: bytes.length }))
      .sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  async read(path) {
    if (!this.files.has(path)) throw new MissingError(path);
    return this.files.get(path);
  }

  async write(path, bytes) {
    if (this.files.has(path)) throw new ExistsError(path); // files are written once
    this.files.set(path, bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes));
  }

  async remove(path) {
    this.files.delete(path);
  }

  async move(from, to) {
    if (!this.files.has(from)) throw new MissingError(from);
    if (this.files.has(to)) throw new ExistsError(to);
    this.files.set(to, this.files.get(from));
    this.files.delete(from);
  }
}
