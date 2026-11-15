// system-share.js — out of the app without ever showing a link or password: "copy" puts it on the
// clipboard, "send" opens the system share sheet (messenger, mail, AirDrop, Nearby Share).
// Prepared for the native app: uses Capacitor's Share/Clipboard when present, else the browser.
//
// Depends:   browser or Capacitor (dynamic); 4-save/remove (pathsOfStrand) for files of a take
// Test:      filesOf in tests/connect.test.mjs; the share sheet only on a device.
// Limits:    the browser shares files only where navigator.canShare({ files }) says yes (Android
//            Chrome, iOS Safari 15+); receiving shares into Sign comes with the native app
//            EXTEND(S4, receive): Android "share to Sign" / iOS share extension → a new Take.

import { pathsOfStrand } from '../4-save/remove.js';

const cap = () => globalThis.Capacitor?.Plugins ?? {};
const TYPES = { mp4: 'video/mp4', png: 'image/png', wav: 'audio/wav', sign: 'text/plain', json: 'application/json', parquet: 'application/octet-stream' };

/** Copy text (a link, a cloud id) to the clipboard. → true if it worked. */
export async function copy(text) {
  try { if (cap().Clipboard) await cap().Clipboard.write({ string: text }); else await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Native app: files go to the app's cache first; the share sheet takes their addresses (14.11.). → [uri] or null */
async function cached(files) {
  const fs = cap().Filesystem;
  if (!fs) return null;
  const uris = [];
  for (const f of files) {
    const path = `share/${f.name.replace(/[^\w.\-]+/g, '_')}`; // plain names: some apps stumble over ( ) ' @ !
    uris.push((await fs.writeFile({ path, data: b64(new Uint8Array(await f.arrayBuffer())), directory: 'CACHE', recursive: true })).uri);
  }
  return uris;
}
const mimeOf = (files) => { const t = [...new Set(files.map((f) => f.type || 'application/octet-stream'))]; return t.length === 1 ? t[0] : t.every((x) => x.startsWith('video/')) ? 'video/*' : '*/*'; };

/** Android: the apps that take a share, with their icons (ShareTargets plugin) → [{ label, pkg, cls, icon }] or []. */
export async function targets(mime = '*/*') {
  try { return (await cap().ShareTargets?.list({ mime }))?.targets ?? []; } catch { return []; }
}

/** Android: the person's own mail and messages apps → { mail, sms } (package names) or {}. */
export async function defaults() {
  try { return (await cap().ShareTargets?.defaults()) ?? {}; } catch { return {}; }
}

/** Android: save the files into a folder the person picks (the device's own file manager). → number saved, or 0. */
export async function saveFiles(files) {
  const plugin = cap().ShareTargets;
  if (!plugin?.saveFiles) return 0;
  const uris = (await cached(files)) ?? [];
  const r = await plugin.saveFiles({ paths: uris.map((u) => decodeURI(u.replace(/^file:\/\//, ''))), names: files.map((f) => f.name), mimes: files.map((f) => f.type || 'application/octet-stream') });
  return r?.saved ?? 0;
}

/** Android: print a PDF (the emergency sheet) through the print dialog. → true when it opened. */
export async function printFile(file) {
  const plugin = cap().ShareTargets;
  if (!plugin?.print) return false;
  const [uri] = (await cached([file])) ?? [];
  if (!uri) return false;
  await plugin.print({ path: decodeURI(uri.replace(/^file:\/\//, '')), name: file.name.replace(/\.pdf$/, '') });
  return true;
}

/** Android: straight to one app (target from targets()), or the system chooser without a target. → true when sent. */
export async function sendTo(target, { text = '', files = [] }) {
  const plugin = cap().ShareTargets;
  if (!plugin) return send({ text, files });
  const uris = (await cached(files)) ?? [];
  await plugin.send({ paths: uris.map((u) => decodeURI(u.replace(/^file:\/\//, ''))), mime: mimeOf(files), text, ...(target ? { pkg: target.pkg, cls: target.cls } : {}) });
  return true;
}

/**
 * Send through the system share sheet (the classic way to other apps: messenger, mail, print, Drive …): text
 * and/or files. Native: Capacitor Share (+ Filesystem for files) · browser: Web Share · else: text copied,
 * a single file downloaded.
 */
export async function send({ text = '', title = 'Sign', files = [] }) {
  if (cap().ShareTargets && files.length) return sendTo(null, { text, files }); // Android: content:// for every app, the chooser
  if (cap().Share) {
    const uris = files.length ? await cached(files) : [];
    if (uris) return cap().Share.share({ title, text, ...(uris.length ? { files: uris } : {}) });
  }
  if (navigator.canShare?.({ files, text })) return navigator.share({ title, text, files });
  if (files.length === 1 && globalThis.document) { // a computer without a share sheet: the file is downloaded
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(files[0]), download: files[0].name });
    a.click();
    return true;
  }
  if (text) return copy(text);
  return false;
}

/** Files of some strands of a take, ready for send(). ids: strand ids (from the chain). */
export async function filesOf(store, ids) {
  const out = [];
  for (const id of ids) {
    for (const p of await pathsOfStrand(store, id)) {
      if (p.endsWith('.json')) continue;
      const name = p.slice(p.lastIndexOf('/') + 1);
      out.push(new File([await store.read(p)], name, { type: TYPES[name.split('.').pop()] ?? 'application/octet-stream' }));
    }
  }
  return out;
}
