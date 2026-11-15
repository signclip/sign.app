// debug.js — what the app asked the network, to find a failure on a phone (15.11.).
//
// Purpose:   every request (method, address without query and token, answer or error, time) goes into a short log;
//            hold the line under the circles in the sharing menu = the log as a file into the share row.
//            Passwords, tokens and file contents never go in: only method, host, path, status, the error's text.
// Depends:   browser fetch, localStorage
// Test:      tests/ui.test.mjs (redact)
// Limits:    the last 120 requests, ≤ 40 KB · kept on this device until replaced.

const KEY = 'sign.debug', MAX = 120;

/** An address as it may be logged: no query (tokens), no user info. */
export function redact(url) {
  try { const u = new URL(String(url)); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return String(url).split('?')[0].slice(0, 200); }
}

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
export function note(entry) {
  try { localStorage.setItem(KEY, JSON.stringify([...read(), { t: new Date().toISOString().slice(11, 19), ...entry }].slice(-MAX))); } catch { /* full or private */ }
}

/** Every fetch from now on is logged (installed after dav-fetch.js, so WebDAV verbs are seen too). */
export function installDebug(g = globalThis) {
  if (!g.fetch || g.fetch.logged) return;
  const base = g.fetch;
  const f = async (url, init = {}) => {
    const start = Date.now(), method = String(init.method ?? 'GET').toUpperCase(), where = redact(url?.url ?? url);
    try {
      const res = await base(url, init);
      note({ method, where, status: res.status, ms: Date.now() - start });
      return res;
    } catch (err) {
      note({ method, where, error: String(err?.message ?? err).slice(0, 300), ms: Date.now() - start, online: g.navigator?.onLine, hidden: g.document?.hidden });
      throw err;
    }
  };
  f.logged = true; f.dav = base.dav;
  g.fetch = f;
}

/** The log as a text file (one line per request), with the app version and the device's view of the network. */
export function logFile(version = '') {
  const lines = read().map((e) => `${e.t} ${e.method} ${e.where} ${e.status ?? `ERROR ${e.error}`} ${e.ms}ms${e.hidden ? ' (in background)' : ''}${e.online === false ? ' (offline)' : ''}`);
  const head = `Sign ${version} · ${navigator.userAgent}\nonline: ${navigator.onLine}\n\n`;
  return new File([head + lines.join('\n') + '\n'], 'sign-debug.txt', { type: 'text/plain' });
}
