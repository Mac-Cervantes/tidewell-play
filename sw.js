// Tidewell home-screen app: offline support (v0.1.58).
// Network first, so a new version always shows as soon as you're online; the saved copy is used
// when the network is gone or too slow (4 s). Every file the game loads is kept as it goes.
const CACHE = 'tidewell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const host = new URL(req.url).host;
  if (req.method !== 'GET' || (host !== location.host && !/^fonts\.(googleapis|gstatic)\.com$/.test(host))) return;   // the game's own files and its font
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    const slow = new Promise((ok) => setTimeout(ok, 4000));
    try {
      const res = await Promise.race([net, slow.then(async () => (await cache.match(req)) || net)]);
      return res || net;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
