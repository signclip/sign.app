// confirm-admin.js — the Admin account's own password, typed in the browser and handed to the app sealed (20.11.).
//
// Purpose:   Nextcloud makes and changes accounts only with the account's own password ("Password confirmation is
//            required"); the one-click login gives the app an app password, enough for files. The password is not on
//            the phone to copy (user, 20.11.), so the app opens confirm.html in the browser: one field, typed there.
//            The page seals it to a key this app made for this one question (ECDH P-256 + AES-GCM, crypto.js seal) and
//            gives it back: native app = the app's own link org.signclip.signapp://confirm#… (Android opens the app
//            with it), web app = a message to the app's tab (BroadcastChannel, same origin). Only this device can
//            open it; it goes into the keychain, never on screen, never into a file.
// Depends:   1-model/crypto.js (newPickupKey, unseal); browser: BroadcastChannel; native: Capacitor App (appUrlOpen),
//            Browser (open, close)
// Test:      tests/ui.test.mjs (the link both ways); the page in Chrome (harness)
// Limits:    one question at a time; the key lives in memory: if Android ends the app while the browser is open, the
//            answer cannot be opened — then join is tapped once more (it asks again). Answer ≤ 2 KB (a URL).

import { newPickupKey, unseal } from '../1-model/crypto.js';

export const LINK = 'org.signclip.signapp://confirm';
const CHANNEL = 'sign-confirm';

/** The page's address with what it needs in its # (never sent to a server). */
export function confirmUrl(web, { key, server, user, back }) {
  return `${new URL('confirm.html', web).href}#${new URLSearchParams({ k: key, s: server, u: user, b: back })}`;
}
/** What came back: from the app link or the message → the sealed text, or null. */
export function answerOf(url) {
  const s = String(url ?? '');
  if (!s.startsWith(LINK)) return null;
  const i = s.indexOf('#');
  return i < 0 ? null : decodeURIComponent(s.slice(i + 1));
}

/**
 * web: where the web app lives (project.json web; in the browser its own address) · keychain · onDone(id) after the
 * password was kept · open(url): opens a page outside the app. → { ask({ id, server, user }) }
 */
export function confirmAdmin({ web, keychain, onDone, open }) {
  const native = Boolean(globalThis.Capacitor?.isNativePlatform?.());
  let pending = null; // { id, privateKey }

  async function take(sealed) {
    const p = pending;
    if (!p || !sealed) return false;
    let password;
    try { password = await unseal(p.privateKey, sealed); } catch { return false; } // not for this question
    pending = null;
    await keychain.set(p.id, password);
    globalThis.Capacitor?.Plugins?.Browser?.close?.().catch?.(() => {});
    onDone?.(p.id);
    return true;
  }
  globalThis.Capacitor?.Plugins?.App?.addListener?.('appUrlOpen', ({ url }) => { const a = answerOf(url); if (a) take(a); });
  try { const ch = new BroadcastChannel(CHANNEL); ch.onmessage = (e) => take(String(e.data ?? '')); } catch { /* no channel: the native app only */ }

  async function ask({ id, server, user }) {
    const k = await newPickupKey();
    pending = { id, privateKey: k.privateKey };
    const at = native ? web : globalThis.location?.href;
    return open(confirmUrl(at, { key: k.public, server, user, back: native ? 'app' : 'tab' }));
  }
  return { ask, take, get waiting() { return Boolean(pending); } };
}
