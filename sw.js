// Wordspyre offline cache.
// The game is one big self-contained file, so there is very little to cache and
// nothing to fetch at runtime. Bump CACHE when you deploy so players pick the
// new build up instead of sitting on a stale one forever.
const CACHE = 'wordspyre-v18';

// What the game genuinely cannot run without. addAll is all-or-nothing, so a
// single failure here costs the whole install - which is why the list is this
// short and holds nothing optional.
const CORE = [
  './', './index.html', './manifest.json', './words.js',
  './phrog-logo.png', './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './apple-touch-icon.png'
];

// Eight megabytes of audio, plus the store packager's landing page. These used
// to sit in the same addAll as the core files, which made offline play
// all-or-nothing: one dropped request on a phone - and two of these are 4MB
// each - failed the install, left no cache at all, and the game would not open
// without a signal. They are fetched individually now and failures are shrugged
// off. The game is perfectly playable silent, and anything missed is kept by
// the runtime cache below the first time it is actually heard.
const EXTRA = [
  './app.html',
  './sounds/tap.mp3', './sounds/recall.mp3', './sounds/pop.mp3', './sounds/submit.mp3',
  './sounds/button.mp3', './sounds/shuffle.mp3', './sounds/swipe.mp3', './sounds/glyph.mp3',
  './sounds/reject.mp3', './sounds/stage.mp3', './sounds/victory.mp3', './sounds/gameover.mp3',
  './sounds/unlock.mp3', './sounds/music-menu.mp3', './sounds/music-game.mp3'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(EXTRA.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page goes network-first so a deploy reaches players on their next online
// launch; everything else is cache-first because it never changes.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);

  if (isPage) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      } catch (err) {
        // ignoreSearch matters here: the app can be launched with a query
        // string on the end of the URL, and an exact match would sail past the
        // copy that was saved without one.
        return (await caches.match(req, { ignoreSearch: true }))
            || (await caches.match('./index.html'))
            || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // Keep whatever the install missed - a track that failed, or a file added
      // in a later build - so the next launch has it with no connection.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
