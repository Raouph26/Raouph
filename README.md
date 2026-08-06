# Raouph
## Deploying as an installable app

The game is one self-contained `index.html`. To make it installable, serve
these files together over **HTTPS** (a service worker will not register without it):

```
index.html   manifest.json   sw.js
icon-192.png   icon-512.png   icon-maskable-512.png   apple-touch-icon.png
```

Any static host works — GitHub Pages, Netlify, Cloudflare Pages. Once served,
Android offers "Install app" and iOS offers "Add to Home Screen"; both launch
standalone in portrait with no browser chrome.

`index.html` still works opened on its own — the service worker simply skips
registration outside http(s), and the icon is embedded as a data URI.

**When you deploy an update, bump `CACHE` in `sw.js`** (e.g. `wordspyre-v2`),
or players keep the build they already cached.

Wrapping for the stores: point Capacitor, Cordova or a Trusted Web Activity at
the same folder. The manifest and icons are already the sizes both stores want.
