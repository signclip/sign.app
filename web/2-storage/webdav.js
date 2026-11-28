// webdav.js — storage adapter for any WebDAV server (own Nextcloud, Storage Box, NAS …).
//
// Purpose:   same four functions as memory.js over HTTP (RFC 4918). Writing uses
//            "If-None-Match: *" so the server refuses to overwrite (RFC 9110 → 412).
//            27.11.: a Nextcloud takes a file of any size, piece by piece (writeFrom, pieces.js) – its "chunked
//            upload": a folder at …/remote.php/dav/uploads/<user>/<id>/, the pieces put there as 00001, 00002 …,
//            then one MOVE of its .file to where the file belongs (Overwrite: F, so never over). Every request
//            names that address (Destination), as version 2 of the protocol asks; version 1 ignores it.
//            After a break the next try goes on where it stopped: the folder's name comes from the file's address
//            and size, so the same file finds its folder again and asks which pieces lie there – nothing is kept
//            on the device for it.
// Depends:   memory.js (errors), pieces.js (piece size, WHOLE), 1-model/hash.js (the folder's name), a fetch function
//            (browser, Node, or CapacitorHttp in the app).
// Test:      tests/storage.test.mjs (against a small fake server)
// Limits:    the browser needs CORS on the server (Nextcloud: WebAppPassword app); the native
//            app has no CORS limit. Listing walks folders with Depth 1 (Depth infinity is often
//            switched off): one request per folder.
//            Pieces: 8 MiB each (the server asks 5 MB to 5 GB, the last one may be smaller), at most 10,000 – so
//            8 MiB up to 78 GiB, larger pieces above · one piece in memory at a time (in the native app with its
//            Base64 ≈ 3.5 × that, dav-fetch.js) · a file of one piece or less goes as one PUT, as before · before
//            a large file 2 small requests (is it there? is its folder there?), after it 1 (the MOVE) · the
//            server clears a folder of pieces 24 h after its last piece: a break longer than that starts anew ·
//            a piece that lies there with the right size counts as arrived, it is not read back · only for an
//            address …/remote.php/dav/files/<user>/…: any other server (NAS, Storage Box, a public link) and one
//            that has no such uploads folder gets the file whole, up to WHOLE = 256 MiB.
//            Not tried against a real Nextcloud yet (27.11.): built by its manual, tested against the fake server.
// Security:  credentials are passed in, never stored here (they live in the device keychain).
// EXTEND(W2, storage): OC-Total-Length on every piece (the server then says "full" at the first piece, not at the
//            MOVE) once the web app's CORS list is known to allow it · other WebDAV servers: one streamed PUT.

import { ExistsError, MissingError } from './memory.js';
import { pieceSize, TooLargeError } from './pieces.js';
import { limit } from '../1-model/limits.js';
import { hashBytes } from '../1-model/hash.js';

/** Where a Nextcloud takes the pieces of a file: …/remote.php/dav/files/<user>/… → …/remote.php/dav/uploads/<user>/ · any other address: null. */
export function uploadsOf(base) {
  const m = /^(https?:\/\/.+?\/remote\.php\/dav)\/files\/([^/]+)\//.exec(base);
  return m ? `${m[1]}/uploads/${m[2]}/` : null;
}

const SIZE_ONLY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>';

export class WebDavStore {
  /** base: e.g. https://cloud.example/remote.php/dav/files/lena/Sign/ */
  constructor({ base, user, password, fetch = globalThis.fetch, name = 'webdav' }) {
    this.base = base.endsWith('/') ? base : base + '/';
    this.auth = 'Basic ' + btoa(`${user}:${password}`);
    this.fetch = fetch;
    this.name = name;
    this.uploads = uploadsOf(this.base);
    this.known = new Set(); // folders known to be there (asked once before a file goes in pieces)
    if (this.uploads) this.writeFrom = (path, pieces, how) => this.writeInPieces(path, pieces, how); // a store without it gets a file whole (pieces.js)
  }

  url(path) {
    return this.base + path.split('/').map(encodeURIComponent).join('/');
  }

  async request(method, path, { body, headers = {} } = {}) {
    return this.fetch(this.url(path), { method, body, headers: { Authorization: this.auth, ...headers } });
  }

  async list(prefix = '') {
    const out = [];
    const folder = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
    await this.walk(folder, out);
    return out.filter((f) => f.path.startsWith(prefix)).sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  /** One level of a folder: [{ path, folder: true|false, size, at (ms, when the server has it), stored (ms, Nextcloud:
   *  when it took the file; the writer cannot set it) }]. */
  async propfind(folder) {
    const res = await this.request('PROPFIND', folder, {
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getcontentlength/><d:resourcetype/><d:getlastmodified/><nc:upload_time/></d:prop></d:propfind>',
    });
    if (res.status === 404) return [];
    if (res.status !== 207) throw new Error(`PROPFIND ${folder}: ${res.status}`);
    const xml = await res.text();
    const basePath = decodeURIComponent(new URL(this.base).pathname); // decoded like every href (16.11.): a user or folder with a space, @ or umlaut stays relative
    return xml.split(/<d:response>/i).slice(1).map((block) => {
      const href = decodeURIComponent(/<d:href>([^<]*)<\/d:href>/i.exec(block)?.[1] ?? '');
      const at = Date.parse(/<d:getlastmodified>([^<]*)/i.exec(block)?.[1] ?? ''); // the server's time (22.11.: signers.js counts 48 h by it, not by anything a signer writes)
      const stored = Number(/<nc:upload_time>(\d+)/i.exec(block)?.[1] ?? 0) * 1000; // when the server took the file: no writer sets it (27.11.; getlastmodified follows X-OC-MTime)
      return { path: href.startsWith(basePath) ? href.slice(basePath.length) : href, folder: /<d:collection\s*\/>/i.test(block), size: Number(/<d:getcontentlength>(\d+)/i.exec(block)?.[1] ?? 0), ...(at ? { at } : {}), ...(stored ? { stored } : {}) };
    }).filter((e) => e.path !== folder);
  }

  async walk(folder, out) {
    for (const e of await this.propfind(folder)) if (e.folder) await this.walk(e.path, out); else out.push({ path: e.path, size: e.size, ...(e.at ? { at: e.at } : {}), ...(e.stored ? { stored: e.stored } : {}) });
  }

  /**
   * What may I do here? (a public Nextcloud link: read only, read and write, or drop only = "File drop").
   * Asks the folder's own permissions: oc:permissions G = read, C = create; nc:share-permissions bit 1 =
   * read, bit 4 = create. A server that names none (plain WebDAV) counts as read. → { read, write }
   */
  async rights() {
    const res = await this.request('PROPFIND', '', { headers: { Depth: '0', 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><oc:permissions/><nc:share-permissions/></d:prop></d:propfind>' });
    if (res.status !== 207) return { read: false, write: false };
    const xml = await res.text();
    const perms = /<oc:permissions>([^<]*)</i.exec(xml)?.[1];
    const share = /<nc:share-permissions>(\d+)</i.exec(xml)?.[1];
    if (perms == null && share == null) return { read: true, write: false };
    const bits = Number(share ?? 0);
    return { read: (perms ?? '').includes('G') || (bits & 1) === 1, write: (perms ?? '').includes('C') || (bits & 4) === 4 };
  }

  /** May I write here? → true | false (see rights). */
  async canWrite() { return (await this.rights()).write; }

  /** Folders directly inside one folder (to choose which one to bring in). → ['Kurs 3/', 'Sign/'] */
  async folders(folder = '') { return (await this.propfind(folder)).filter((e) => e.folder).map((e) => e.path); }

  async read(path) {
    const res = await this.request('GET', path);
    if (res.status === 404) throw new MissingError(path);
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** A range of a file (pieces.js): HTTP Range (RFC 9110); a server that ignores it sends the whole file, cut here. */
  async readPiece(path, from, to) {
    if (to <= from) return new Uint8Array();
    const res = await this.request('GET', path, { headers: { Range: `bytes=${from}-${to - 1}` } });
    if (res.status === 404) throw new MissingError(path);
    if (res.status === 416) return new Uint8Array(); // the range lies behind the end
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return res.status === 206 ? bytes : bytes.subarray(from, to);
  }

  /** Is there a file (or folder) at this path? One small request, nothing is read. */
  async has(path) {
    const res = await this.request('PROPFIND', path, { headers: { Depth: '0', 'Content-Type': 'application/xml' }, body: SIZE_ONLY });
    if (res.status === 207) return true;
    if (res.status === 404) return false;
    throw new Error(`PROPFIND ${path}: ${res.status}`);
  }

  /** The pieces that lie in a folder of pieces: Map(number → bytes) · null when the server has no such folder. */
  async piecesAt(folder) {
    const res = await this.fetch(folder, { method: 'PROPFIND', body: SIZE_ONLY, headers: { Authorization: this.auth, Depth: '1', 'Content-Type': 'application/xml' } });
    if ([404, 405, 501].includes(res.status)) return null;
    if (res.status !== 207) throw new Error(`PROPFIND pieces: ${res.status}`);
    const there = new Map();
    for (const block of (await res.text()).split(/<d:response>/i).slice(1)) {
      const name = decodeURIComponent(/<d:href>([^<]*)<\/d:href>/i.exec(block)?.[1] ?? '').replace(/\/$/, '').split('/').pop();
      if (/^\d+$/.test(name)) there.set(Number(name), Number(/<d:getcontentlength>(\d+)/i.exec(block)?.[1] ?? -1)); // 00003 and 3 are the same piece
    }
    return there;
  }

  /** A file the server takes only whole: up to WHOLE, said in numbers beyond. */
  async writeWhole(path, pieces) {
    const whole = limit('whole');
    if (pieces.size > whole) throw new TooLargeError(`${this.name} takes a file only whole: ${path} has ${pieces.size} bytes, more than ${whole}`);
    return this.write(path, await pieces.slice(0, pieces.size));
  }

  /**
   * A file of any size to a Nextcloud, piece by piece (pieces.js writeFrom): never over (ExistsError, asked before
   * the first byte goes and once more by the MOVE); after a break the next call sends only what did not arrive.
   * pieces: { size, slice(from, to) → Uint8Array } · piece: bytes per piece (tests pass a small one).
   */
  async writeInPieces(path, pieces, { piece = pieceSize(pieces.size) } = {}) {
    const size = pieces.size;
    if (!this.uploads || size <= piece) return this.writeWhole(path, pieces); // one piece: one PUT, as every small file
    if (await this.has(path)) throw new ExistsError(path);
    const parent = path.slice(0, path.lastIndexOf('/') + 1);
    if (parent && !this.known.has(parent)) { if (!(await this.has(parent))) await this.makeFolders(path); this.known.add(parent); }
    const to = this.url(path), folder = `${this.uploads}sign-${(await hashBytes(`${to}\n${size}\n${piece}`)).slice(0, 32)}/`;
    const ask = (method, name = '', { body, headers = {} } = {}) => this.fetch(folder + name, { method, body, headers: { Authorization: this.auth, Destination: to, ...headers } });
    let there = new Map();
    const made = await ask('MKCOL');
    if (made.status !== 201) {
      const had = made.status === 405 ? await this.piecesAt(folder) : null; // 405 = it is there: an earlier try broke off
      if (!had && [404, 405, 501].includes(made.status)) { this.uploads = null; return this.writeWhole(path, pieces); } // this server has no uploads folder: whole, as before
      if (!had) throw new Error(`MKCOL pieces of ${path}: ${made.status}`);
      there = had;
    }
    for (let n = 1, from = 0; from < size; n++, from += piece) {
      const length = Math.min(piece, size - from);
      if (there.get(n) === length) continue; // arrived before the break
      const body = await pieces.slice(from, from + length);
      if (body.length !== length) throw new Error(`piece ${n} came with ${body.length} bytes instead of ${length}: ${path}`);
      const res = await ask('PUT', String(n).padStart(5, '0'), { body });
      if (!res.ok) throw new Error(`PUT piece ${n} of ${path}: ${res.status}`);
    }
    const res = await ask('MOVE', '.file', { headers: { Overwrite: 'F' } });
    if (res.status === 412) { // someone else wrote it meanwhile: the pieces are of no use
      try { await this.fetch(folder, { method: 'DELETE', headers: { Authorization: this.auth } }); } catch { /* the server clears them after 24 h */ }
      throw new ExistsError(path);
    }
    if (!res.ok) throw new Error(`MOVE pieces of ${path}: ${res.status}`);
  }

  async write(path, bytes) {
    const body = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    let res = await this.request('PUT', path, { body, headers: { 'If-None-Match': '*' } });
    if (res.status === 409) { // parent folder missing: create it, then try once more
      await this.makeFolders(path);
      res = await this.request('PUT', path, { body, headers: { 'If-None-Match': '*' } });
    }
    if (res.status === 412) throw new ExistsError(path);
    if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  }

  async makeFolders(path) {
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const res = await this.request('MKCOL', parts.slice(0, i).join('/') + '/');
      if (![201, 405].includes(res.status)) throw new Error(`MKCOL: ${res.status}`); // 405 = exists
    }
  }

  async move(from, to) {
    const go = () => this.request('MOVE', from, { headers: { Destination: this.url(to), Overwrite: 'F' } });
    let res = await go();
    if (res.status === 409) { // the folder it moves into is missing (17.11.: within/@(name)!(n_…)/ at the first move): make it, once more
      await this.makeFolders(to);
      res = await go();
    }
    if (res.status === 412) throw new ExistsError(to);
    if (res.status === 404) throw new MissingError(from);
    if (!res.ok) throw new Error(`MOVE ${from}: ${res.status}`);
  }

  async remove(path) {
    const res = await this.request('DELETE', path);
    if (!res.ok && res.status !== 404) throw new Error(`DELETE ${path}: ${res.status}`);
  }
}
