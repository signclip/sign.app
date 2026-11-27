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
//            next write of the same path goes on with the pieces that arrived (partlist).
//            writeFrom(path, pieces) (26.11., pieces.js): the same for a file that never lies whole in memory – the
//            pieces are read in order, one after the other, ≤ 3 are on their way. A piece that is already there counts
//            only if its size and its SHA-256 are the ones of this file: another file of the same size never mixes in.
//            open: where a broken upload is remembered, { get, set, delete } as a Map has them (they may be async) – a
//            Map lasts for the session, a lasting one lets the upload go on after a restart.
//            readPiece(path, from, to): a range through the same link (HTTP Range); a link is used for 60 s.
// Limits:    a write = 1 ask + 1 upload (≈ 2 round trips); in pieces 3 + n asks; a read = 1 ask + 1 download; ranges
//            of one file within 60 s = 1 ask together; list = 1 ask (≤ 100,000 names) · whole ≤ MAX_BYTES of the gateway
//            (default 1 GB; a package needs it raised there) · write(bytes) holds the file as it is given; writeFrom
//            holds ≤ 4 pieces (32 MiB, 76 MiB at 190 GB) · the pieces of a broken upload go after 1 day (lifecycle):
//            going on works within that day · device clock ± 5 min.

import { ExistsError, MissingError } from './memory.js';
import { pieceSize } from './pieces.js';
import { gatewayParts } from './spec.js';
import { askGateway } from './gateway-ask.js';

export { gatewayParts };

const enc = new TextEncoder();
const MiB = 2 ** 20, IN_PIECES = 16 * MiB, AT_ONCE = 3, TRIES = 3, LINK_MS = 60000;
export { pieceSize }; // 8 MiB, or more so that a file needs at most 10,000 pieces (pieces.js: the Nextcloud cuts by the same)
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };

export class GatewayStore {
  /** path: the entry's path · access: async () => { privateKey, public } (the device's access key) */
  constructor({ path, access, grant = null, fetch = globalThis.fetch.bind(globalThis), name = 'gateway', retryMs = 500, open = new Map() }) {
    const p = gatewayParts(path);
    if (!p) throw new Error(`not a gateway path: ${path}`);
    Object.assign(this, { api: p.api, prefix: p.prefix, access, grant, fetch, name, retryMs, open, links: new Map() });
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
  /** A range of a file: the same link as read, asked for with Range. A link is good for 120 s; it is used for 60. */
  async readPiece(path, from, to) {
    if (to <= from) return new Uint8Array();
    for (let again = 0; ; again++) {
      let link = this.links.get(path);
      if (!link || link.until <= Date.now()) {
        link = { url: (await this.ask('get', this.prefix + path)).url, until: Date.now() + LINK_MS };
        this.links.set(path, link);
      }
      const r = await this.fetch(link.url, { headers: { range: `bytes=${from}-${to - 1}` } });
      if (r.status === 403 && !again) { this.links.delete(path); continue; } // the link ran out early: one new one
      if (r.status === 404) throw new MissingError(path);
      if (r.status === 416) return new Uint8Array(); // the range lies behind the end
      if (!r.ok) throw new Error(`object storage: read ${r.status} ${path}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      return r.status === 206 ? bytes : bytes.subarray(from, to); // a storage that ignores Range sends the whole file
    }
  }
  async write(path, bytes) {
    const b = typeof bytes === 'string' ? enc.encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length > IN_PIECES) return this.writeFrom(path, { size: b.length, slice: async (from, to) => b.subarray(from, to) });
    const sha = b64(await crypto.subtle.digest('SHA-256', b));
    const { url, headers } = await this.ask('put', this.prefix + path, b.length, sha);
    const { 'content-length': _length, ...send } = headers; // the browser sets the length itself
    const r = await this.fetch(url, { method: 'PUT', headers: send, body: b });
    if (r.status === 412) throw new ExistsError(path); // written once, like every store
    if (!r.ok) throw new Error(`object storage: write ${r.status} ${path}`);
  }
  /** A file of any size, piece by piece (pieces.js): pieces = { size, slice(from, to) → Uint8Array }, asked in order. */
  async writeFrom(path, pieces) {
    const total = pieces.size;
    if (total <= IN_PIECES) return this.write(path, await pieces.slice(0, total));
    const key = this.prefix + path, size = pieceSize(total), count = Math.ceil(total / size);
    const lengthOf = (n) => Math.min(size, total - (n - 1) * size);
    const kept = await this.open.get(key);
    let upload = kept?.bytes === total ? kept.upload : null, there = new Map();
    if (upload) { // broke off earlier: only the pieces that did not arrive
      try { there = new Map((await this.ask('partlist', key, upload)).parts.map((p) => [p.n, p])); } catch { upload = null; }
    }
    if (!upload) {
      try { ({ upload } = await this.ask('start', key, total)); } catch (err) { if (err.status === 409) throw new ExistsError(path); throw err; }
      await this.open.set(key, { upload, bytes: total });
    }
    const send = async (n, piece, sha) => {
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
    const flying = new Set();
    let broken = null;
    for (let n = 1; n <= count && !broken; n++) { // read in order (who gives the pieces sums the hash on the way), sent 3 at once
      const piece = await pieces.slice((n - 1) * size, (n - 1) * size + lengthOf(n));
      if (piece.length !== lengthOf(n)) { broken = new Error(`piece ${n} came with ${piece.length} bytes instead of ${lengthOf(n)}: ${path}`); break; }
      const sha = b64(await crypto.subtle.digest('SHA-256', piece));
      const had = there.get(n);
      if (had && had.size === piece.length && (!had.sha || had.sha === sha)) continue; // it arrived before the break, and it is this piece
      const job = send(n, piece, sha).catch((err) => { broken ??= err; }).finally(() => flying.delete(job));
      flying.add(job);
      if (flying.size >= AT_ONCE) await Promise.race(flying);
    }
    await Promise.all(flying);
    if (broken) throw broken; // the upload stays open: the next write of this path goes on
    try { await this.ask('done', key, upload); } catch (err) {
      if (err.status === 409) { await this.open.delete(key); throw new ExistsError(path); }
      throw err;
    }
    await this.open.delete(key);
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
