// login-flow.js — one-click login to a Nextcloud (Login Flow v2): the person logs in once in the
// browser, the app receives its own app password by itself. Nobody types or sees a password.
//
// Purpose:   start(server) → { login (page to open), poll } · then poll until the person is done
//            → { server, user, appPassword } → into the keychain, never on screen.
// Depends:   fetch (native app: CapacitorHttp; the browser is blocked by CORS on these endpoints)
// Test:      tests/connect.test.mjs (fake server)
// Limits:    Nextcloud keeps a login open 20 min; poll every 2 s (≤ 600 requests); an app password
//            can be revoked in Nextcloud → Settings → Security at any time (lost phone).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Begin: Nextcloud returns the page to open and the poll address. */
export async function startLogin(server, { fetch = globalThis.fetch, appName = 'Sign' } = {}) {
  const res = await fetch(`${server.replace(/\/$/, '')}/index.php/login/v2`, { method: 'POST', headers: { 'User-Agent': appName } });
  if (!res.ok) throw new Error(`login start: ${res.status}`);
  const d = await res.json();
  return { login: d.login, poll: { token: d.poll.token, endpoint: d.poll.endpoint } };
}

/** Wait until the person has logged in. → { server, user, appPassword } or throws after maxMs. */
export async function waitLogin(poll, { fetch = globalThis.fetch, everyMs = 2000, maxMs = 20 * 60e3, now = Date.now } = {}) {
  const until = now() + maxMs;
  while (now() < until) {
    const res = await fetch(poll.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(poll.token)}` });
    if (res.ok) { const d = await res.json(); return { server: d.server, user: d.loginName, appPassword: d.appPassword }; }
    if (res.status !== 404) throw new Error(`login poll: ${res.status}`);
    await sleep(everyMs);
  }
  throw new Error('login not finished in time');
}
