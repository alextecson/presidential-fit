// Presidential Fit: offline shell. One release is cached as a set, so files never mix versions.
// Calls to OpenAI and the weather service always go to the network.
const RELEASE = '1.0.2';
const CACHE = 'pf-shell-' + RELEASE;
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'sample-closet.json',
  'js/app.js', 'js/store.js', 'js/engine.js', 'js/mockup.js', 'js/figure.js', 'js/weather.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => { if (r.ok) return c.put(u, r); })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    return hit || fetch(req);
  }));
});
