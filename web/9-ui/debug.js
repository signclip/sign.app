// debug.js — what the app asked the network, to find a failure on a phone (15.11.).
//
// Purpose:   every request (method, address without query and token, answer or error, time) goes into a short log;
//            hold the line under the circles in the sharing menu = the log as a file into the share row.
//            Passwords, tokens, accounts, file names and contents never go in: only method, host, the kind of path
//            (redact), status, the error's text.
// Depends:   browser fetch, localStorage
// Test:      tests/ui.test.mjs (redact)
// Limits:    the last 120 requests, ≤ 40 KB · kept on this device until replaced.

const KEY = 'sign.debug', MAX = 120;

// Path parts that say what was asked and nothing about whom or what: the servers' own words, Sign's folders.
const PLAIN = new Set(('remote.php public.php index.php status.php dav webdav files uploads ocs v1.php v2.php v1 v2 apps cloud core login flow poll '
  + 'files_sharing provisioning_api api shares users groups capabilities user s s3 '
  + 'take echo chain hello join within quiet signer e2e run key index backup').split(' '));

/**
 * An address as it may be logged: no query, no user info, and of the path only what names no one (27.11., audit N1) –
 * a link's token, an account, a file's name (its context words, its person) become "…"; the last part keeps its ending.
 *   https://cloud/public.php/dav/files/AbCdEf123/take/2026.11/(Essen)@(Lena)….v.webm
 *   → https://cloud/public.php/dav/files/…/take/2026.11/….v.webm
 */
export function redact(url) {
  try {
    const u = new URL(String(url));
    const parts = u.pathname.split('/').map((p, i, all) => {
      let d = p;
      try { d = decodeURIComponent(p); } catch { /* as it stands */ }
      if (!d || PLAIN.has(d) || /^\d{4}\.\d{2}$/.test(d)) return d;
      return `…${i === all.length - 1 ? (/(\.[a-z0-9]{1,8}){1,2}$/i.exec(d)?.[0] ?? '') : ''}`;
    });
    return `${u.protocol}//${u.host}${parts.join('/')}`;
  } catch { return String(url).split(/[?#]/)[0].slice(0, 200); } // the app's own files (relative): nothing of anyone in them
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
