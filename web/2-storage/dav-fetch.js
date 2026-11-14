// dav-fetch.js — the WebDAV verbs in the native app (14.11.).
//
// Purpose:   Android's HttpURLConnection (behind CapacitorHttp) refuses PROPFIND, MKCOL, MOVE, COPY …: listing a
//            folder, making one, moving a file all failed in the APK. Those verbs go to the app's own plugin DavHttp
//            (OkHttp, sign.app native/android); every other request stays with fetch (CapacitorHttp: no CORS).
// Depends:   browser fetch / Response; native: Capacitor.Plugins.DavHttp { request({ url, method, headers, data }) →
//            { status, headers, data } } with data in Base64.
// Test:      tests/storage.test.mjs (a fake plugin)
// Limits:    bodies cross the bridge as Base64 (+33 %): fine for WebDAV XML and folder listings (a few KB … 1 MB);
//            files (GET/PUT) never take this way.

export const DAV_VERBS = new Set(['PROPFIND', 'PROPPATCH', 'MKCOL', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'REPORT', 'SEARCH']);

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64 ?? ''), (c) => c.charCodeAt(0));
const bytesOf = (body) => (body == null ? null : typeof body === 'string' ? new TextEncoder().encode(body) : body instanceof Uint8Array ? body : new Uint8Array(body));

/** fetch that sends the WebDAV verbs through plugin (DavHttp), everything else through base. */
export function davFetch(plugin, base) {
  return async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    if (!DAV_VERBS.has(method)) return base(url, init);
    const headers = Object.fromEntries(new Headers(init.headers ?? {}).entries());
    const body = bytesOf(init.body);
    const r = await plugin.request({ url: String(url), method, headers, ...(body ? { data: toB64(body) } : {}) });
    const empty = r.status === 204 || r.status === 304;
    return new Response(empty ? null : fromB64(r.data), { status: r.status, headers: r.headers ?? {} });
  };
}

/** In the native app: fetch learns the WebDAV verbs. In the browser nothing changes. → true when installed. */
export function installDavFetch(g = globalThis) {
  const plugin = g.Capacitor?.Plugins?.DavHttp;
  if (!plugin || !g.Capacitor?.isNativePlatform?.() || g.fetch?.dav) return false;
  const f = davFetch(plugin, g.fetch.bind(g));
  f.dav = true;
  g.fetch = f;
  return true;
}
