// memory.js — storage adapter in RAM. Reference for every other adapter.
//
// Purpose:   the storage contract in its simplest form (SCHEMA.md B6):
//              list(prefix) → [{ path, size }]   read(path) → Uint8Array
//              write(path, bytes) → never overwrites (ExistsError)   remove(path)
//              move(from, to) → rename only (content and hash stay; nothing points to paths)
//            Tests and the index run against it; WebDAV must behave the same.
//            Two more calls a store may bring (pieces.js: a file of any size, piece by piece):
//              readPiece(path, from, to) → Uint8Array   writeFrom(path, pieces) → never over, pieces asked in order
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

  async readPiece(path, from, to) {
    return (await this.read(path)).subarray(from, to);
  }

  async writeFrom(path, pieces, { piece = 8 * 2 ** 20 } = {}) {
    if (this.files.has(path)) throw new ExistsError(path);
    const bytes = new Uint8Array(pieces.size); // this store is memory: here the file does lie whole
    for (let at = 0; at < pieces.size; at += piece) bytes.set(await pieces.slice(at, Math.min(at + piece, pieces.size)), at);
    if (this.files.has(path)) throw new ExistsError(path); // someone else wrote it meanwhile
    this.files.set(path, bytes);
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
