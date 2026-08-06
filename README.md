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

## Analytics

Every event goes through one funnel. To start receiving them, define this
before or after the game loads — either works, a late provider gets the backlog:

```js
window.WordspyreAnalytics = {
  track(event, props) { /* forward to GA4, PostHog, Firebase, your own endpoint */ }
};
```

Events emitted: `run_start`, `stage_cleared`, `run_lost`, `run_won`,
`ad_watched`, `shop_purchase`, `blitz_finished`, `save_restored`.
`stage_cleared` and `run_lost` carry the stage, score, target, glyph count and
hands left — that is the data that answers "which stage is killing people".

Without a provider, events queue in memory (capped at 200) and **nothing leaves
the device**.

## Save backup codes

Settings → BACK UP SAVE produces a `WSPY1.…` string containing progress,
records, leaderboard, theme and any live theme trial. Pasting one back replaces
that device's save. An in-flight run is deliberately not included, so restoring
never mixes two runs together.
