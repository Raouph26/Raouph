# tools

Recording and cutting the promo video. Nothing here ships in the game.

## Why it exists

The first set of clips was recorded by hand, the rig was thrown away, and by the
time anyone looked at the files they were two versions out of date and in a
format Instagram does not accept. Re-recording meant rebuilding the rig first.
So the rig lives here, and a full recut is two commands.

## Recut everything

    npm i ffmpeg-static ffprobe-static     # once, into tools/
    node tools/record-promo.js             # ~12 min, writes promo/*.webm
    node tools/make-cards.js               # the trailer's text cards
    node tools/build-videos.js             # writes promo-mp4/*.mp4

`record-promo.js` takes clip-name fragments as arguments to recut just those:

    node tools/record-promo.js 16-boss-blind 10-jackpot

`build-videos.js --trailer` rebuilds only the trailer, leaving the singles alone.

## What comes out

`promo-mp4/` holds every clip twice - `-music.mp4` with the game's own soundtrack
under it, `-silent.mp4` with no audio at all. Silent is deliberate: on Reels and
TikTok, audio added inside the app reaches further than audio baked into a file.
Plus `00-TRAILER.mp4`, cut to SPELL / COLLECT / DEFEAT / WIN.

Everything is 1080x1920, H.264 High, 30fps, AAC 128k - the spec Instagram,
Facebook, TikTok and YouTube all take.

## The parts that are easy to get wrong

**The save fixture must carry every field the game reads.** A run without
`lengthLevels` or `stake` resumes onto a board that scores nothing, and the clip
looks broken in a way that is not obvious until someone watches it.

**The recorder writes `promo/timing.json`.** Video recording starts when the
browser context does, so the offsets in there are frame-accurate: they are what
`build-videos.js` cuts on. Do not hand-tune cut points against a stopwatch.

**`wordIn` is stamped on the last tap, not the last landed tile.** A tile takes
about half a second to fly in and the banner another beat to catch up, so a cut
placed exactly on `wordIn` still shows INVALID WORD in red.

**The stage loads `index.html?nointro=1`.** Without it the studio splash eats the
first five seconds of every clip.
