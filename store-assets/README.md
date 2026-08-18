# Store assets

Everything the Google Play listing needs, in one folder. Nothing here is drawn
by hand — `npm run assets` paints the icons with the same routine that draws the
game's menu mark and photographs the screenshots from the real running build,
writes them into `public/`, and copies them here. Regenerate rather than edit;
an edited file is silently overwritten on the next run.

The same command also writes `thrum-store-assets.zip` at the repository root,
which is this whole folder in one download.

## Icons

| File | Size | Where it goes |
| --- | --- | --- |
| `icons/icon-512.png` | 512×512 | Play Console → **App icon** |
| `icons/icon-192.png` | 192×192 | PWA install icon (already referenced by the manifest) |
| `icons/icon-maskable-512.png` | 512×512 | PWA adaptive icon — the mark is inset so a launcher can crop it to a circle, squircle or rounded square without clipping |

Play only asks for the 512. The other two are here because PWABuilder reads them
from the manifest and it is easier to have the set together than to hunt for it.

## Screenshots

All 1080×1920 (Play's phone size), 2–8 required, five supplied.

| File | What it shows |
| --- | --- |
| `screenshots/play-1-menu.png` | The main menu, on a save with progress — an empty menu photographs badly |
| `screenshots/play-2-puzzle.png` | Chapter 1 mid-solve: two colours, one board, obviously doable |
| `screenshots/play-3-solved.png` | Chapter 12, solved: three colours, hubs, a darker theme — what the game grows into |
| `screenshots/play-4-chapters.png` | Chapter select, showing the scale of the thing |
| `screenshots/play-5-themes.png` | The themes screen |

Upload them in this order; Play shows them in the order given, and the first is
the one most people see.

## Not in here

Two things the Play listing needs that the game cannot generate:

- **Feature graphic, 1024×500.** A marketing banner, not a game asset. Make one
  from `icons/icon-512.png` and a line of copy.
- **Privacy policy URL.** Required even with no ads, because progress is stored
  on the device and the Data safety form asks about it.

Listing copy and the rest of the submission steps are in
[../RELEASE.md](../RELEASE.md).
