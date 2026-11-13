// connect.js — anything can be a sharing point: the own Nextcloud, a Sciebo folder, any WebDAV, a
// read-only link, the device. One call gives the entry for the person's list (never a secret) and
// the store to read and write (decision 08.11., 19.48).
//
// Purpose:   kinds
//              nextcloud  own account                  WebDAV of the account (or one folder in it)
//              sciebo     Sciebo folder shared into the own Nextcloud and accepted (lab principle):
//                         just a folder there, same login · or reached at Sciebo directly
//              webdav     any WebDAV server, read and write or read only
//              link       public read-only link (/public.php/dav/files/<token>/), no account
//              local      the device (OPFS / app folder)
//            Secrets stay in the keychain, found by the sharing point id (q_); entries hold none.
//            acceptExpected(): shares waiting in the own Nextcloud are taken in by themselves only
//            when they come from an address the person registered (her own Sciebo).
//            mountedSharingPoints(): every folder shared with me (internal or federated) becomes a
//            sharing point reached through the own Nextcloud: the native app and the PWA alike
//            (the PWA needs only the own Nextcloud to allow its origin).
// Depends:   webdav.js, nextcloud.js, memory.js (ExistsError)
// Test:      tests/connect.test.mjs
// Limits:    the browser reaches only servers that allow its origin (CORS, WebAppPassword); links
//            (/public.php) and accepting shares need the native app or the own domain.

import { WebDavStore } from './webdav.js';
import { webdavUrl, publicWebdavUrl } from './nextcloud.js';

export class ReadOnlyError extends Error {}

/** A store that only reads: list and read pass through, everything else is refused. */
export class ReadOnlyStore {
  constructor(store) { this.inner = store; this.readOnly = true; }
  list(prefix) { return this.inner.list(prefix); }
  read(path) { return this.inner.read(path); }
  async write(path) { throw new ReadOnlyError(`read only: ${path}`); }
  async remove(path) { throw new ReadOnlyError(`read only: ${path}`); }
  async move(path) { throw new ReadOnlyError(`read only: ${path}`); }
}

/** Where a spec points to (no secrets). */
export function pathOfSpec(spec) {
  switch (spec.kind) {
    case 'nextcloud': case 'sciebo': return webdavUrl(spec.server, spec.user, spec.folder ?? '');
    case 'webdav': return spec.url.endsWith('/') ? spec.url : `${spec.url}/`;
    case 'link': return publicWebdavUrl(spec.server, spec.token);
    case 'local': return 'local:';
    default: throw new Error(`unknown kind: ${spec.kind}`);
  }
}

/**
 * spec: { kind, label, id (q_), server, user, folder, url, token, readOnly } · secret: password or
 * app password from the keychain (link: the link password) · local: a store for kind 'local'.
 * → { entry: { label, path, id, kind, readOnly }, store }
 */
export function connect(spec, { secret = null, local = null, fetch = globalThis.fetch } = {}) {
  const path = pathOfSpec(spec);
  const readOnly = (spec.kind === 'link' && !spec.write) || Boolean(spec.readOnly); // write: a link that allows editing
  let store;
  if (spec.kind === 'local') store = local;
  else if (spec.kind === 'link') store = new WebDavStore({ base: path, user: spec.token, password: secret ?? '', fetch, name: spec.label });
  else store = new WebDavStore({ base: path, user: spec.user, password: secret, fetch, name: spec.label });
  return { entry: { label: spec.label, path, id: spec.id, kind: spec.kind, readOnly }, store: readOnly ? new ReadOnlyStore(store) : store };
}

/** "lena@uni.sciebo.de" → { owner: 'lena', remote: 'https://uni.sciebo.de' } */
export function cloudIdParts(cloudId) {
  const at = cloudId.lastIndexOf('@');
  return { owner: cloudId.slice(0, at), remote: `https://${cloudId.slice(at + 1).replace(/\/$/, '')}` };
}

/**
 * Take in waiting shares from registered addresses only. nc: Nextcloud (own account) · expected:
 * cloud ids the person registered, e.g. ['lena@uni.sciebo.de'] · → [{ label, folder, cloudId }]
 * (a stranger's share stays waiting; the person sees it and decides).
 */
export async function acceptExpected(nc, expected) {
  const wanted = expected.map((c) => ({ cloudId: c, ...cloudIdParts(c) }));
  const taken = [];
  for (const share of await nc.pending()) {
    const w = wanted.find((x) => share.owner === x.owner && String(share.remote).replace(/\/$/, '').startsWith(x.remote));
    if (!w) continue;
    const folder = await nc.accept(share.id, { owner: w.owner, remote: w.remote });
    taken.push({ label: share.name, folder, cloudId: w.cloudId });
  }
  return taken;
}

/** Folders shared with me → sharing point specs reached through the own Nextcloud (same login). */
export async function mountedSharingPoints(nc, { newId }) {
  return (await nc.sharedWithMe()).map((m) => ({ kind: 'nextcloud', label: m.label, id: newId(), server: nc.server, user: nc.user, folder: m.folder, from: m.from }));
}

/**
 * Take in one waiting share the person tapped (native app: in the background). nc: own Nextcloud ·
 * share: from nc.pending() · → a sharing point entry reached through the own account { label, path, id }.
 * The tap is the "expected": only this share, from exactly this owner and server, is accepted.
 */
export async function takeIn(nc, share, { newId }) {
  const folder = await nc.accept(share.id, { owner: share.owner, remote: String(share.remote).replace(/\/$/, '') });
  if (!folder) throw new Error(`share ${share.id} accepted but not found in the tree`);
  return { label: share.name, path: webdavUrl(nc.server, nc.user, folder), id: newId() };
}

/**
 * Where the other side accepts a share: the files page of its Nextcloud (its server comes from the
 * cloud id); it asks to log in first when needed, then shows the share to accept.
 * name@uni-koeln.de@uni-koeln.sciebo.de → https://uni-koeln.sciebo.de/index.php/apps/files/pendingshares
 */
export function acceptPage(cloudId) {
  return pendingPage(cloudIdParts(cloudId).remote);
}

/** The page of a server that lists shares waiting to be accepted (Nextcloud 28+; older ones open Files). */
export const pendingPage = (server) => `${server.replace(/\/$/, '')}/index.php/apps/files/pendingshares`;

/** My cloud id on a Nextcloud: user@host, what another cloud shares to. */
export const myCloudId = (server, user) => `${user}@${new URL(server).host}`;
