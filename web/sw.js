// sw.js — the web app starts offline: the shell and all modules are kept on the device.
// Limits: the cache is the app (≈ 200 KB); Takes never go here (they live in OPFS / sharing points).
// Network first (14.11.): a new version is used at once; the cache only answers when offline or after 3 s.
// Older caches are deleted, so modules of two versions never mix (cache-first kept old code after an update).
const SHELL = 'sign-shell-16';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.json', './icons/icon.svg', './icons/icon-192.png']))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const fresh = fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
    return res;
  });
  const late = new Promise((ok) => setTimeout(ok, 3000)).then(() => caches.match(e.request, { cacheName: SHELL }));
  e.respondWith(Promise.race([fresh, late.then((hit) => hit ?? fresh)]).catch(() => caches.match(e.request, { cacheName: SHELL })));
});
