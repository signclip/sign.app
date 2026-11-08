// sw.js — the web app starts offline: the shell and all modules are kept on the device.
// Limits: the cache is the app (≈ 200 KB); Takes never go here (they live in OPFS / sharing points).
const SHELL = 'sign-shell-1';
self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.json']))));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(SHELL).then((c) => c.put(e.request, copy));
    return res;
  })));
});
