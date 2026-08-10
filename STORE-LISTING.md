# WORDSPYRE — Play Store listing

Everything to copy and paste into Play Console. Fields marked **YOU** need something only you can
provide or decide.

---

## App name (max 30)

```
WORDSPYRE
```

---

## Short description (max 80)

Pick one. The first is the recommendation — it names the genre mash-up, which is what makes
someone tap.

```
Spell words, forge glyphs, beat the run. A word game with roguelite teeth.
```
(74 characters)

Alternatives:

```
Build words. Collect glyphs. Push your luck. A roguelite word game.
```
(66 characters)

```
A word game that fights back. Spell, upgrade, and survive eight stages.
```
(70 characters)

---

## Full description (max 4000)

```
Every word you play is a weapon.

WORDSPYRE is a word game with a roguelite spine. You get a rack of letters, a target score, and
four hands to reach it. Spell a word, watch it score, and try to stay ahead of a target that
doubles every stage. Fall short and the run is over — start again from nothing.

The words alone will not carry you. Between stages you spend Diamonds in the shop on Glyphs:
small, permanent upgrades that change how scoring works. One pays out for every vowel. One
triples any word of six letters or more. One only fires when your word starts and ends with the
same letter. Slot them in the right order, overclock the ones that are carrying you, sell the ones
that are not, and a 300-point word becomes a 30,000-point word.

No two runs are the same. The shop deals a different hand every time, boss stages throw in twists
that break your usual plan, and Ink Seals let you bend a bad rack back into a good one.

TWO WAYS TO PLAY

Classic — eight stages, rising targets, one life. Build a board that can keep up. Beat the final
boss and you can claim the win or push on into Endless, where the targets keep climbing until you
finally fall.

Blitz — ninety seconds, six slots numbered two through seven. A word of five letters fills slot
five. Fill all six before the clock runs out, and chase your own best score.

FEATURES

• A dictionary of over 170,000 words — if it is a word, you can play it
• 22 Glyphs to unlock, each one changing the maths in a different way
• Three upgrade levels per Glyph, so a favourite can carry a whole run
• Boss stages with rules that force you off your usual line
• Ink Seals for the moments a rack goes bad
• Eight visual themes to unlock, from clean and colourful to a red-and-black punk skin and a
  stripped-back terminal look
• Play offline, forever — no account, no sign-in, no internet needed
• No ads
• Backup codes, so your progress moves with you

Made for one hand and short sessions. A Blitz run takes ninety seconds. A Classic run takes about
fifteen minutes, and losing one is the point.

Spell. Score. Survive.
```

(About 1,900 characters — well inside the 4,000 limit.)

---

## Graphics — all generated, in the `store/` folder

| Play Console field | File | Size |
|---|---|---|
| App icon | `icon-512.png` (repo root) | 512 × 512 |
| Feature graphic | `store/feature-graphic-1024x500.png` | 1024 × 500 |
| Phone screenshots | `store/01-menu.png` … `08-unlocks.png` | 1080 × 1920 each |
| 7-inch tablet screenshots | reuse the same 1080 × 1920 files | valid — 9:16, sides within range |
| 10-inch tablet screenshots | reuse the same 1080 × 1920 files | valid — 1080 is exactly the minimum |

Suggested screenshot order (Play shows the first 2–3 in search results, so lead with the strongest):

1. `02-board.png` — a word on the board, mid-run
2. `01-menu.png` — the logo
3. `03-shop.png` — the shop and the glyphs
4. `04-blitz.png` — Blitz with five slots filled
5. `07-theme-board.png` — the same game in another skin
6. `05-themes.png` — the theme shelf
7. `06-map.png` — the stage map
8. `08-unlocks.png` — what there is to unlock

---

## Privacy policy — **YOU** must host it

`privacy.html` is written and sits in the repo root. Two things to do:

1. Open it and replace `YOUR-EMAIL-HERE` with a contact address. Deliberately left blank rather
   than filled with your personal address — once it is on a public page it is public forever, so
   consider a separate address for this.
2. Upload it with the rest of the site. The URL you give Play Console is then
   `https://your-site.netlify.app/privacy.html`

It is written to match what the app actually does, verified against the code: the only network
request the game makes is loading its own sound files, and the only external address in the whole
app is the bug-report form.

---

## Data safety form — **YOU** fill it in, here are the true answers

Play asks a long questionnaire. Based on what the code actually does:

- **Does your app collect or share any of the required user data types?** → **No**
- **Is all of the user data collected by your app encrypted in transit?** → not asked if you
  answered No above
- **Do you provide a way for users to request that their data is deleted?** → not asked if you
  answered No above

Why "No" is the honest answer: the game has no accounts, makes no network calls except fetching
its own `.mp3` files, and everything it remembers is in on-device storage. The bug report opens
Google Forms in the user's browser and only if they tap it — that is the user submitting a form
themselves, not the app collecting data.

**If you later switch ads back on, this answer changes** and the form has to be updated before
that version ships.

---

## Content rating — **YOU** answer the questionnaire

Straightforward for this game. Expect to answer No to violence, sexuality, drugs, gambling and
user-to-user communication. One to be careful about:

- **Does the app contain profanity?** The dictionary is a standard word list with 290 profane
  entries removed by exact match. Answer honestly if asked about user-generated content — players
  can only submit words that exist in that filtered list, so nothing offensive can be spelled and
  displayed.
- **Digital purchases?** Not currently — the "Remove Ads" purchase is hidden and there is no real
  billing wired up.

Likely outcome: rated for everyone / PEGI 3.

---

## The rest of the Play Console form — **YOU**

- **App category:** Games → Word (or Puzzle; Word is the better fit)
- **Tags:** word game, puzzle, roguelike, offline
- **Contact email:** required and shown publicly on your listing
- **Website:** your Netlify URL
- **Ads declaration:** "No, my app does not contain ads" — true of this build
- **Target audience:** 13+ is simplest. Selecting under-13 pulls in Families Policy requirements
  and extra review.
- **Video:** optional, skip it for now

---

## Optional, skip for launch

**Google Play Games on PC assets** — only needed if you opt into Play Games on PC. Needs a
600 × 400 transparent logo and a separate 16:9 feature graphic. Not worth doing before you have
players.

**Chromebook and Android XR screenshots** — leave empty. The game is built for phones.
