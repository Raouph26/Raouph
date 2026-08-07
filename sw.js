// Wordspyre offline cache.
// The game is one big self-contained file, so there is very little to cache and
// nothing to fetch at runtime. Bump CACHE when you deploy so players pick the
// new build up instead of sitting on a stale one forever.
const CACHE = 'wordspyre-v4';
const ASSETS = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './sounds/tap.mp3', './sounds/recall.mp3', './sounds/pop.mp3', './sounds/submit.mp3',
  './sounds/button.mp3', './sounds/shuffle.mp3', './sounds/swipe.mp3', './sounds/glyph.mp3',
  './sounds/reject.mp3', './sounds/stage.mp3', './sounds/victory.mp3', './sounds/gameover.mp3',
  './sounds/unlock.mp3'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page itself goes network-first so a deploy reaches players on their next
// online launch; everything else is cache-first because it never changes.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  if (isPage) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
