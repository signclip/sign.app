// sw.js — the web app starts offline: the shell and all modules are kept on the device.
// Limits: the cache is the app (≈ 200 KB); Takes never go here (they live in OPFS / sharing points).
// Network first (14.11.): a new version is used at once; the cache only answers when offline or after 3 s.
// Older caches are deleted, so modules of two versions never mix (cache-first kept old code after an update).
const SHELL = 'sign-shell-18'; // 16.11.: new surface (9-ui rewritten)
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.json', './icons/icon.svg', './icons/icon-192.png', './9-ui/look.css']))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== 'sign-shared').map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  // shared to the installed app (manifest share_target, 27.11.): the files wait in their own cache, the app takes them in (9-ui/intake.js)
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData(), cache = await caches.open('sign-shared');
      let n = 0;
      for (const f of form.getAll('files')) if (f && typeof f !== 'string') await cache.put(`./shared/${Date.now()}-${n++}`, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'shared') } }));
      return Response.redirect('./index.html', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const fresh = fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
    return res;
  });
  const late = new Promise((ok) => setTimeout(ok, 3000)).then(() => caches.match(e.request, { cacheName: SHELL }));
  e.respondWith(Promise.race([fresh, late.then((hit) => hit ?? fresh)]).catch(() => caches.match(e.request, { cacheName: SHELL })));
});
