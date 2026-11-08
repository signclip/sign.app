// webdav.js — storage adapter for any WebDAV server (own Nextcloud, Storage Box, NAS …).
//
// Purpose:   same four functions as memory.js over HTTP (RFC 4918). Writing uses
//            "If-None-Match: *" so the server refuses to overwrite (RFC 9110 → 412).
// Depends:   memory.js (errors), a fetch function (browser, Node, or CapacitorHttp in the app).
// Test:      tests/storage.test.mjs (against a small fake server)
// Limits:    the browser needs CORS on the server (Nextcloud: WebAppPassword app); the native
//            app has no CORS limit. Listing walks folders with Depth 1 (Depth infinity is often
//            switched off): one request per folder.
// Security:  credentials are passed in, never stored here (they live in the device keychain).

import { ExistsError, MissingError } from './memory.js';

export class WebDavStore {
  /** base: e.g. https://cloud.example/remote.php/dav/files/lena/Sign/ */
  constructor({ base, user, password, fetch = globalThis.fetch, name = 'webdav' }) {
    this.base = base.endsWith('/') ? base : base + '/';
    this.auth = 'Basic ' + btoa(`${user}:${password}`);
    this.fetch = fetch;
    this.name = name;
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

  /** One level of a folder: [{ path, folder: true|false, size }]. */
  async propfind(folder) {
    const res = await this.request('PROPFIND', folder, {
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>',
    });
    if (res.status === 404) return [];
    if (res.status !== 207) throw new Error(`PROPFIND ${folder}: ${res.status}`);
    const xml = await res.text();
    const basePath = new URL(this.base).pathname;
    return xml.split(/<d:response>/i).slice(1).map((block) => {
      const href = decodeURIComponent(/<d:href>([^<]*)<\/d:href>/i.exec(block)?.[1] ?? '');
      return { path: href.startsWith(basePath) ? href.slice(basePath.length) : href, folder: /<d:collection\s*\/>/i.test(block), size: Number(/<d:getcontentlength>(\d+)/i.exec(block)?.[1] ?? 0) };
    }).filter((e) => e.path !== folder);
  }

  async walk(folder, out) {
    for (const e of await this.propfind(folder)) if (e.folder) await this.walk(e.path, out); else out.push({ path: e.path, size: e.size });
  }

  /** Folders directly inside one folder (to choose which one to bring in). → ['Kurs 3/', 'Sign/'] */
  async folders(folder = '') { return (await this.propfind(folder)).filter((e) => e.folder).map((e) => e.path); }

  async read(path) {
    const res = await this.request('GET', path);
    if (res.status === 404) throw new MissingError(path);
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
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
    const res = await this.request('MOVE', from, { headers: { Destination: this.url(to), Overwrite: 'F' } });
    if (res.status === 412) throw new ExistsError(to);
    if (res.status === 404) throw new MissingError(from);
    if (!res.ok) throw new Error(`MOVE ${from}: ${res.status}`);
  }

  async remove(path) {
    const res = await this.request('DELETE', path);
    if (!res.ok && res.status !== 404) throw new Error(`DELETE ${path}: ${res.status}`);
  }
}
