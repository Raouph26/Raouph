# Shipping Thrum to Google Play

Everything here uses only GitHub and PWABuilder. No other service is involved.

---

## Read this first: ads and PWABuilder do not mix

PWABuilder packages a web app as a **Trusted Web Activity** — Chrome rendering
your site full-screen inside an app. That has one consequence worth deciding on
before you spend a fortnight on release:

- **AdMob cannot run in a TWA.** Chrome owns the whole surface, so native ad
  views cannot be drawn over it. There is no supported way to do it.
- **AdSense injected into the page is against policy** for app wrappers.

So the ad code in `src/ads/` — the placement policy, the rewarded hints, the
frequency caps — is all written and tested, but **a PWABuilder release cannot
earn ad revenue**. Three honest options:

| Option | Ads | Effort |
| --- | --- | --- |
| **Ship the TWA now, no ads** | None | Ready today |
| **Ship the TWA, charge for it** | None; paid or IAP | Ready today, plus Play billing |
| **Switch to Capacitor** | Full AdMob | A native shell, plus an Android build toolchain |

The ad layer already sits behind a provider interface, so switching to Capacitor
later changes no game code — `AdMobAds` is written and waiting. Nothing here is
wasted either way.

---

## 1. Publish the site (once)

The Android package is generated from a live HTTPS URL, so the game has to be
hosted. GitHub Pages does it from this repository.

1. Push to `main`.
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. The `Deploy` workflow runs tests, builds, and publishes.
4. Your URL will be `https://<user>.github.io/<repo>/`.

Confirm before continuing: opening that URL on a phone should offer "Add to
Home screen", which means the manifest and service worker were found.

## 2. Generate the Android package

1. Go to **pwabuilder.com** and enter your Pages URL.
2. It will report a score and list the manifest and service worker it found.
3. **Package for stores → Android → Google Play**.
4. Settings that matter:
   - **Package ID**: `com.<you>.thrum` — permanent once published, choose carefully.
   - **App name**: Thrum
   - **Signing key**: choose **"Create new"**, then **download the `.zip` and
     keep `signing.keystore` and its passwords somewhere safe.** Losing that key
     means you can never update the app again — a new package ID and a new
     listing is the only recovery.
5. You get an `.aab` for Play, plus the key and an `assetlinks.json`.

## 3. Prove you own the site

The TWA hides the browser bar only if the site vouches for the app.

1. From the PWABuilder download, take `assetlinks.json`.
2. Put it at `public/.well-known/assetlinks.json` in this repository.
3. Push, and check it is live at
   `https://<user>.github.io/<repo>/.well-known/assetlinks.json`.

Skip this and the app shows a browser address bar — it will look broken.

## 4. Play Console

**Before anything else, check what kind of account you have.** A *personal*
account created after 13 November 2023 must run a closed test with **12 testers
who actually install, for 14 continuous days**, then apply for production access
(reviewed in up to about a week). That is roughly three weeks of calendar time
that cannot be shortened, so line up twelve people now. *Organisation* accounts
(which need a D-U-N-S number) are exempt.

Assets in this repository, all generated from the game by `npm run assets`:

| Play needs | Where it is |
| --- | --- |
| App icon, 512×512 | `public/icons/icon-512.png` |
| Phone screenshots, 1080×1920 (2–8) | `public/screenshots/play-*.png` |
| Feature graphic, 1024×500 | **Not generated — see below** |
| Privacy policy URL | **You must write and host one** |

The feature graphic is a marketing banner, not a game asset; make one from the
icon and a line of copy. The privacy policy is required even with no ads,
because the app stores progress locally — the Data safety form asks about it.

Suggested listing copy:

> **Short description**
> A calm line-drawing puzzle. One line per colour, through every piece.
>
> **Full description**
> Draw one continuous line for each colour, passing through every piece of that
> colour exactly once. Lines may cross only at hubs, and each hub must be
> crossed exactly as many times as it shows.
>
> No timer. No score. No way to lose. Just the board and how long you want to
> look at it.
>
> • 20 chapters of 32 puzzles, plus a new set of 32 every day
> • Every puzzle has exactly one solution — verified, never guesswork
> • Five themes that change the whole feel, unlocked as you go
> • Plays entirely offline

## 5. Regenerating assets

```bash
npm run assets   # icons and screenshots, from the running game
npm run build    # production build into dist/
npm test         # rules, catalogue, ad pacing, hints
npm run validate # generates and verifies all 672 levels
```

Icons are painted by the same routine that draws the menu mark, and screenshots
are captured from the real build, so neither can drift out of date.

---

## Still to do, in order

1. **Decide ads vs TWA** — the table at the top
2. **Write and host a privacy policy** (hard blocker)
3. **Make a 1024×500 feature graphic**
4. **Line up 12 testers**, if your account is personal and post-Nov-2023
5. Confirm the name — *Thrum* searched clean, but that is not trademark
   clearance
