// gateway-store.js — a sharing point in an object storage, reached through the gateway (21.11., user).
//
// Purpose:   the same five calls as every store (list, read, write never over, remove, move). Each call is a wish
//            signed with this device's access key (Ed25519, non-extractable, 9-ui/device-keys.js): the gateway checks
//            it and answers with a link for exactly one object; the bytes go straight to and from the object storage.
//            No password travels, none is kept: the entry holds only the gateway's address and the prefix.
//              path of the entry:  https://<gateway>/s3/<prefix>     e.g. https://gw.example.org/s3/n_7QK…/
//            The right: a grant chain (8-join/grant.js) from a hello back or a group's invitation, kept in the keychain
//            (one text or a JSON array), goes along with every wish. revoke(): the owner of a prefix takes a grant back.
// Depends:   gateway-ask.js (the signed wish, gateway-2 and -3 to fall back on), memory.js (ExistsError, MissingError),
//            spec.js (gatewayParts), fetch, crypto.subtle
// Test:      tests/gateway.test.mjs (with the gateway and an object storage in memory)
//            Above 16 MiB a write goes in pieces (gateway/multipart.mjs): 8 MiB each (more above 80 GiB), 3 at once, each
//            with its own link and SHA-256; a piece that fails is sent again (3 tries); if the write still fails, the
//            next write of the same path in this session goes on with the pieces that arrived (partlist).
// Limits:    a write = 1 ask + 1 upload (≈ 2 round trips); in pieces 3 + n asks; a read = 1 ask + 1 download;
//            list = 1 ask (≤ 100,000 names) · whole ≤ MAX_BYTES of the gateway (default 1 GB) · the file lies whole
//            in memory (as it comes from the take), so on a phone ≈ some 100 MB · going on after a break only in the
//            same session; after a restart from the start (the pieces left go after 1 day) · device clock ± 5 min.

import { ExistsError, MissingError } from './memory.js';
import { gatewayParts } from './spec.js';
import { askGateway } from './gateway-ask.js';

export { gatewayParts };

const enc = new TextEncoder();
const MiB = 2 ** 20, IN_PIECES = 16 * MiB, AT_ONCE = 3, TRIES = 3;
/** Piece size: 8 MiB, or more so that a file needs at most 10,000 pieces. */
export const pieceSize = (bytes) => Math.max(8 * MiB, Math.ceil(bytes / 10000 / MiB) * MiB);
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };

export class GatewayStore {
  /** path: the entry's path · access: async () => { privateKey, public } (the device's access key) */
  constructor({ path, access, grant = null, fetch = globalThis.fetch.bind(globalThis), name = 'gateway', retryMs = 500 }) {
    const p = gatewayParts(path);
    if (!p) throw new Error(`not a gateway path: ${path}`);
    Object.assign(this, { api: p.api, prefix: p.prefix, access, grant, fetch, name, retryMs, open: new Map() });
  }
  ask(op, a, b, c) { return askGateway(this, op, a, b, c, this.grant ? { grant: this.grant } : {}); } // the grant goes along
  async list(prefix = '') {
    const { files } = await this.ask('list', this.prefix + prefix);
    return files.map((f) => ({ path: f.path.slice(this.prefix.length), size: f.size, ...(f.at ? { at: f.at } : {}) })); // at: the storage's time (signers.js: 48 h)
  }
  async read(path) {
    const { url } = await this.ask('get', this.prefix + path);
    const r = await this.fetch(url);
    if (r.status === 404) throw new MissingError(path);
    if (!r.ok) throw new Error(`object storage: read ${r.status} ${path}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async write(path, bytes) {
    const b = typeof bytes === 'string' ? enc.encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length > IN_PIECES) return this.writeInPieces(path, b);
    const sha = b64(await crypto.subtle.digest('SHA-256', b));
    const { url, headers } = await this.ask('put', this.prefix + path, b.length, sha);
    const { 'content-length': _length, ...send } = headers; // the browser sets the length itself
    const r = await this.fetch(url, { method: 'PUT', headers: send, body: b });
    if (r.status === 412) throw new ExistsError(path); // written once, like every store
    if (!r.ok) throw new Error(`object storage: write ${r.status} ${path}`);
  }
  async writeInPieces(path, b) {
    const key = this.prefix + path, size = pieceSize(b.length), count = Math.ceil(b.length / size);
    const lengthOf = (n) => Math.min(size, b.length - (n - 1) * size);
    let upload = this.open.get(key)?.bytes === b.length ? this.open.get(key).upload : null, have = new Set();
    if (upload) { // broke off earlier in this session: only the pieces that did not arrive
      try { have = new Set((await this.ask('partlist', key, upload)).parts.filter((p) => p.size === lengthOf(p.n)).map((p) => p.n)); } catch { upload = null; }
    }
    if (!upload) {
      try { ({ upload } = await this.ask('start', key, b.length)); } catch (err) { if (err.status === 409) throw new ExistsError(path); throw err; }
      this.open.set(key, { upload, bytes: b.length });
    }
    const queue = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !have.has(n));
    let broken = null;
    const send = async (n) => {
      const piece = b.subarray((n - 1) * size, (n - 1) * size + lengthOf(n));
      const sha = b64(await crypto.subtle.digest('SHA-256', piece));
      for (let tries = 1; ; tries++) {
        try {
          const { url, headers } = await this.ask('part', key, upload, `${n}:${piece.length}:${sha}`);
          const { 'content-length': _length, ...rest } = headers;
          const r = await this.fetch(url, { method: 'PUT', headers: rest, body: piece });
          if (r.ok) return;
          throw new Error(`object storage: piece ${n} ${r.status} ${path}`);
        } catch (err) { if (tries >= TRIES) throw err; await new Promise((ok) => setTimeout(ok, this.retryMs * tries)); }
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
      while (queue.length && !broken) { const n = queue.shift(); await send(n).catch((err) => { broken ??= err; }); }
    }));
    if (broken) throw broken; // the upload stays open: the next write of this path goes on
    try { await this.ask('done', key, upload); } catch (err) {
      if (err.status === 409) { this.open.delete(key); throw new ExistsError(path); }
      throw err;
    }
    this.open.delete(key);
  }
  /** Owner (w): no grant inside prefix counts any more for what (a grant's id, an access key, a device, a name). */
  revoke(what, prefix = this.prefix) { return this.ask('revoke', what, prefix); }
  async remove(path) { await this.ask('remove', this.prefix + path); }
  async move(from, to) {
    try { await this.ask('move', this.prefix + from, this.prefix + to); } catch (err) {
      if (err.status === 409) throw new ExistsError(to);
      if (err.status === 404) throw new MissingError(from);
      throw err;
    }
  }
}
