// confirm-page.js — confirm.html: the Admin password typed in the browser, sealed for the asking device, handed back.
//
// Purpose:   see confirm-admin.js. Here: read what the app put in the # (its key, server, user, how back), seal
//            the typed password to that key, and go back — the app's own link (native) or a message to the app's tab
//            (web app), then close. The password leaves this page only sealed, and only to the app.
// Depends:   1-model/crypto.js (seal); browser: BroadcastChannel
// Test:      Chrome (harness): typed → the app holds it → join goes on
// Limits:    no check against Nextcloud here (a page on another address may not ask it): a wrong password shows in
//            the app at once (it asks again).

import { seal } from '../1-model/crypto.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.hash.slice(1));
const key = q.get('k'), back = q.get('b') === 'app' ? 'app' : 'tab';
$('user').textContent = q.get('u') || 'Admin';
$('username').value = q.get('u') || 'Admin';
$('server').textContent = (() => { try { return new URL(q.get('s')).host; } catch { return ''; } })();
const pw = $('password'), ok = $('ok'), note = $('note');
pw.addEventListener('input', () => { ok.disabled = !pw.value; });
if (!key) { pw.disabled = true; note.textContent = 'In der App noch einmal auf join tippen.'; }

$('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!key || !pw.value) return;
  ok.disabled = true;
  const sealed = await seal(key, pw.value);
  pw.value = '';
  if (back === 'app') {
    const link = `org.signclip.signapp://confirm#${encodeURIComponent(sealed)}`;
    note.innerHTML = '';
    note.append(Object.assign(document.createElement('a'), { href: link, textContent: '→ Sign' })); // if Android did not jump by itself: one tap
    location.href = link;
    return;
  }
  try { new BroadcastChannel('sign-confirm').postMessage(sealed); } catch { /* no channel */ }
  note.textContent = '→ Sign';
  setTimeout(() => window.close(), 300);
});
