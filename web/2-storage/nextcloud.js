// nextcloud.js — what only a Nextcloud (or Sciebo) can do: shares between clouds, links for
//                other programs. Everything else goes through the storage contract (webdav.js).
//
// Purpose:   "show my folder elsewhere" with one tap:
//              A  our Nextcloud → Sciebo        shareToCloud: federated share to lena@uni.sciebo.de
//              B  Sciebo → our Nextcloud        pending / accept: the folder appears in our tree,
//                                               reached with the same WebDAV login
//              C  other programs                webdavUrl (Finder, Explorer, Android), loginLink
//                                               (Nextcloud apps on iPhone/Android, then Apple Files),
//                                               readOnlyLink: read only, without any account
//            Provider-specific code lives only here; another provider gets its own file.
// Depends:   fetch (browser, Node 18+). OCS API of Nextcloud (files_sharing).
// Test:      tests/share.test.mjs (against a fake server)
// Limits:    federated folders answer ~0.1–0.3 s slower (two servers per request) · iPhone Files
//            has no WebDAV: use the Nextcloud app (loginLink) · links and passwords are never shown,
//            only copied or sent · public WebDAV path /public.php/dav/files/<token>/ (Nextcloud docs);
//            non-GET requests need X-Requested-With: XMLHttpRequest unless outgoing server-to-server
//            sharing is on (it is, for Sciebo) – Finder and Explorer checked on the test day.
// EXTEND(S4, app passwords): the admin APK creates one app password per program (8-admin).

const PERMS = { read: 1, write: 1 | 2 | 4 | 8, all: 31 };

export class Nextcloud {
  /** server: https://cloud.example.org · user, password: user and app password of this device. */
  // via: 'webapppassword' in the browser (that Nextcloud app allows CORS for shares, address in its field
  // "Files sharing"; tested in lab/storage-test) · 'ocs' in the native app (no browser block there).
  constructor({ server, user, password, fetch = globalThis.fetch, via = globalThis.Capacitor ? 'ocs' : 'webapppassword' }) {
    this.via = via;
    this.server = server.replace(/\/$/, '');
    this.user = user;
    this.fetch = fetch;
    this.auth = 'Basic ' + btoa(`${user}:${password}`);
  }

  async ocs(method, path, params = null) {
    const base = this.via === 'webapppassword' && path.startsWith('shares') ? 'index.php/apps/webapppassword/api/v1' : 'ocs/v2.php/apps/files_sharing/api/v1';
    const res = await this.fetch(`${this.server}/${base}/${path}${path.includes('?') ? '&' : '?'}format=json`, {
      method,
      headers: { Authorization: this.auth, 'OCS-APIRequest': 'true', Accept: 'application/json', ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: params ? new URLSearchParams(params).toString() : undefined,
    });
    if (!res.ok) throw new Error(`OCS ${method} ${path}: ${res.status}`);
    return (await res.json()).ocs.data;
  }

  /** A: share a folder of ours with a cloud id (user@uni.sciebo.de). access: read | write | all. */
  async shareToCloud({ path, cloudId, access = 'read' }) {
    const d = await this.ocs('POST', 'shares', { path, shareType: 6, shareWith: cloudId, permissions: PERMS[access] });
    return { id: String(d.id), path, cloudId };
  }

  /** B: shares from other clouds that wait for "accept". */
  async pending() {
    return (await this.ocs('GET', 'remote_shares/pending')).map((s) => ({ id: String(s.id), name: s.name, owner: s.owner, remote: s.remote }));
  }

  /**
   * B: accept one; it then appears as a folder in our tree. Returns its folder name.
   * expect: { owner, remote } the person asked for (e.g. her own Sciebo); anything else is refused,
   * so a stranger's share is never taken in by itself.
   */
  async accept(id, expect) {
    const share = (await this.pending()).find((s) => s.id === String(id));
    if (!share) throw new Error(`no pending share ${id}`);
    if (!expect || share.owner !== expect.owner || !String(share.remote).startsWith(expect.remote)) {
      throw new Error(`share ${id} is not the one asked for`);
    }
    await this.ocs('POST', `remote_shares/pending/${id}`);
    const mounted = (await this.ocs('GET', 'remote_shares')).find((s) => String(s.id) === String(id));
    return mounted?.mountpoint?.replace(/^\//, '') ?? null;
  }

  /**
   * Read only, without any account: a public link with read permission and a password.
   * Other programs reach it by WebDAV with user = token, password = link password; writing fails.
   */
  async readOnlyLink({ path, password, expires = null }) {
    const d = await this.ocs('POST', 'shares', { path, shareType: 3, permissions: PERMS.read, password, ...(expires ? { expireDate: expires } : {}) });
    return { id: String(d.id), token: d.token, url: d.url, webdav: publicWebdavUrl(this.server, d.token) };
  }

  /** Folders others shared with me, as they appear in my tree (internal and accepted federated). */
  async sharedWithMe() {
    const inner = (await this.ocs('GET', 'shares?shared_with_me=true')).map((s) => ({ label: s.file_target?.replace(/^\//, '') ?? s.path, folder: (s.file_target ?? s.path).replace(/^\//, ''), from: s.uid_owner }));
    const fed = (await this.ocs('GET', 'remote_shares')).map((s) => ({ label: s.name, folder: s.mountpoint.replace(/^\//, ''), from: `${s.owner}@${new URL(s.remote).host}` }));
    return [...inner, ...fed];
  }

  /** Stop a link or share at once (lost laptop, course over). */
  async stopShare(id) {
    await this.ocs('DELETE', `shares/${id}`);
  }

  /** Our cloud id, given to Sciebo by "copy" or "send" ("share with"). */
  cloudId() {
    return `${this.user}@${new URL(this.server).host}`;
  }
}

/** C: WebDAV address for Finder (Mac), Explorer (Windows), Android file apps. */
export function webdavUrl(server, user, folder = '') {
  const base = `${server.replace(/\/$/, '')}/remote.php/dav/files/${encodeURIComponent(user)}/`;
  return folder ? base + folder.split('/').map(encodeURIComponent).join('/') + '/' : base;
}

/** C, read only: WebDAV address of a public link (user = token, password = link password). */
export function publicWebdavUrl(server, token) {
  return `${server.replace(/\/$/, '')}/public.php/dav/files/${token}/`;
}

/** C: login link the Nextcloud apps accept; only given to "copy" or "send", never shown. */
export function loginLink(server, user, appPassword) {
  return `nc://login/user:${user}&password:${appPassword}&server:${server.replace(/\/$/, '')}`;
}

/** A sharing point entry for a folder reached through our Nextcloud (case B) or directly (WebDAV). */
export function sharingPointFor({ label, server, user, folder, id }) {
  return { label, path: webdavUrl(server, user, folder), id };
}
