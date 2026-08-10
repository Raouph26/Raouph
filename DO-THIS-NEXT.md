# Do this next

Six steps, in order. Don't read ahead. Do one, then the next.

---

### 1. Put the website up

Unzip `wordspyre-website.zip`. You get a bunch of loose files.

Drag **all of them** onto Netlify. Not the folder — open the folder, select everything inside,
drag that.

---

### 2. Check it worked

Type these two into your browser:

- `wordspyre.netlify.app/manifest.json`
- `wordspyre.netlify.app/privacy.html`

You should see a wall of text on the first one, and a privacy page on the second.

If either says "Page not found", step 1 didn't work. Try again before moving on.

---

### 3. Re-run PWABuilder

Go back to PWABuilder. Put in `wordspyre.netlify.app`. Hit test again.

The red errors should go. "Package For Stores" turns on.

Download the package.

---

### 4. Upload the pictures to Play Console

Open `wordspyre-store-assets.zip`. Inside is a `store` folder with nine pictures.

| Where it asks for | Give it |
|---|---|
| App icon | `app-icon-512.png` |
| Feature graphic | `feature-graphic-1024x500.png` |
| Phone screenshots | all eight numbered pictures (`01` to `08`) |
| 7-inch tablet screenshots | **the same eight pictures again** |
| 10-inch tablet screenshots | **the same eight pictures again** |

Yes — really, the same eight, three times. They're the right size for all three boxes.

Leave Chromebook, XR and "Play Games on PC" **empty**. You don't need them.

---

### 5. Paste the words in

Open `STORE-LISTING.md`. Copy and paste:

- **App name** → `WORDSPYRE`
- **Short description** → the first grey box
- **Full description** → the big grey box

---

### 6. The forms Google makes you fill in

**Privacy policy** — paste this into the box:
`https://wordspyre.netlify.app/privacy.html`

**Data safety** — first question: *"Does your app collect or share any user data?"* → **No**.
That's it, the rest disappears. It's true: your game saves everything on the player's own phone
and sends nothing anywhere.

**Content rating** — a list of questions. Answer **No** to all of them. Violence, sex, drugs,
gambling, all of it. Your game has none.

**Ads** — *"Does your app contain ads?"* → **No**. True for this build.

**Category** → Games → Word

**Target audience** → 13 and up. (Picking younger makes Google add extra rules and a longer
review. Not worth it.)

---

## That's it

Anything that isn't in this list, you don't need yet.

Stuck on a step? Tell me the number and what you see on screen.
