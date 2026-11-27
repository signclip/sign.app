// dav-fetch.js — what the native app sends through its own plugin: the WebDAV verbs (14.11.) and every body of bytes (26.11.).
//
// Purpose:   Android's HttpURLConnection (behind CapacitorHttp) refuses PROPFIND, MKCOL, MOVE, COPY …: listing a
//            folder, making one, moving a file all failed in the APK. Those verbs go to the app's own plugin DavHttp
//            (OkHttp, sign.app native/android).
//            26.11.: bytes that are sent (PUT of a video, a sound, a wake, a piece for the object storage) go there
//            too. CapacitorHttp's fetch reads a Uint8Array body as text (native-bridge.js convertBody: TextDecoder)
//            and the native side writes that text as UTF-8: every byte that is no valid text becomes three others.
//            Counted with the bridge's own two steps: 8 MB of video bytes arrive as 14.5 MB and are no video any
//            more; only text files (.sign) come through whole.
//            DavHttp takes the body as Base64 and sends exactly these bytes. Reading (GET) stays with fetch: there
//            CapacitorHttp hands the answer over as it came.
// Depends:   browser fetch / Response; native: Capacitor.Plugins.DavHttp { request({ url, method, headers, data }) →
//            { status, headers, data } } with data in Base64.
// Test:      tests/storage.test.mjs (a fake plugin)
// Limits:    a body crosses the bridge as Base64 (+33 %): 8 MB of video = a text of 10.7 MB, made slice by slice
//            (768 KiB each; the screen gets its turn after every CALM_MS = 8 ms of work) · one body at most
//            BRIDGE_MAX = 48 MiB (≈ 25 s of video at 15 Mbit/s): beyond that the phone's memory is at risk (the bytes,
//            their Base64 and the copy on the native side are held at once, ≈ 3.5 × the file), so it is refused
//            with an error and the file stays where it is.
// EXTEND(S10, pieces): a file larger than BRIDGE_MAX goes in pieces (Nextcloud: chunked upload; object storage:
//            pieces of 16 MiB already, gateway-store.js) – then no body is ever larger than one piece. Or, once
//            takes lie in the app's own folder: sent by the native side from the file itself (RESEARCH: file transfer).

export const DAV_VERBS = new Set(['PROPFIND', 'PROPPATCH', 'MKCOL', 'MOVE', 'COPY', 'LOCK', 'UNLOCK', 'REPORT', 'SEARCH']);
export const BRIDGE_MAX = 48 * 1024 * 1024;
export const SLICE = 3 * 256 * 1024; // a multiple of 3: the Base64 of the slices, joined, is the Base64 of the whole
const CALM_MS = 8;

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64 ?? ''), (c) => c.charCodeAt(0));
const pause = () => new Promise((done) => setTimeout(done, 0));

/** Is this body made of bytes (not a text, not a form)? */
export const isBytes = (body) => body instanceof Uint8Array || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || (typeof Blob !== 'undefined' && body instanceof Blob);

async function bytesOf(body) {
  if (body == null) return null;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof Blob !== 'undefined' && body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return new Uint8Array(body);
}

/**
 * bytes → Base64, slice by slice, so a large file never holds the screen: after every CALM_MS of work the page gets
 * its turn. now: a clock in ms (tests pass their own). → the same text btoa would give for the whole.
 */
export async function toB64Calm(bytes, { now = () => performance.now(), slice = SLICE } = {}) {
  const parts = [];
  let since = now();
  for (let i = 0; i < bytes.length; i += slice) {
    parts.push(toB64(bytes.subarray(i, i + slice)));
    if (now() - since >= CALM_MS) { await pause(); since = now(); }
  }
  return parts.join('');
}

/** fetch that sends the WebDAV verbs and every body of bytes through plugin (DavHttp), everything else through base. */
export function davFetch(plugin, base) {
  return async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    if (!DAV_VERBS.has(method) && !isBytes(init.body)) return base(url, init);
    const headers = Object.fromEntries(new Headers(init.headers ?? {}).entries());
    const body = await bytesOf(init.body);
    if (body && body.length > BRIDGE_MAX) throw new Error(`too large for the bridge: ${Math.round(body.length / 1048576)} MiB (at most ${BRIDGE_MAX / 1048576})`);
    const data = !body ? null : body.length > SLICE ? await toB64Calm(body) : toB64(body);
    const r = await plugin.request({ url: String(url), method, headers, ...(body ? { data } : {}) });
    const empty = r.status === 204 || r.status === 304;
    return new Response(empty ? null : fromB64(r.data), { status: r.status, headers: r.headers ?? {} });
  };
}

/** In the native app: fetch learns the WebDAV verbs and sends bytes whole. In the browser nothing changes. → true when installed. */
export function installDavFetch(g = globalThis) {
  const plugin = g.Capacitor?.Plugins?.DavHttp;
  if (!plugin || !g.Capacitor?.isNativePlatform?.() || g.fetch?.dav) return false;
  const f = davFetch(plugin, g.fetch.bind(g));
  f.dav = true;
  g.fetch = f;
  return true;
}
