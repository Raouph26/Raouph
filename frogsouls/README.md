# FROGSOULS

A souls-like boss rush about a small frog knight and a very online pond.
Third person, roll / block / parry / riposte, stamina, lock-on. Plays in the
browser on desktop (keyboard + mouse or gamepad) and on phones in landscape
(touch). Three.js, no other runtime libraries.

## The game

- **The Lily** — the hub. Five portals, one Old Toad who trades flies for levels.
- **Five worlds**, each with four bosses and a world boss that opens once the
  four are down:

  | World | Bosses | World boss (reward) |
  |---|---|---|
  | The Pond | Duck · Grandpa Brick · Big Shrimp · Crab | The Other Frog (Reed Needle) |
  | The Comment Section | Reply Guy · Caps Lock · First Comment · Bot | The Moderator (Banhammer) |
  | The Back Office | Monday · Printer · Robot Vacuum · Meeting | The Deadline (Overtime Lance) |
  | The Feed | Unskippable Ad · Influencer · Captcha · Low Battery | The Algorithm (Doomscroll) |
  | The Server Farm | Lag · Hitbox · Patch Notes · Loading Screen | The Blue Screen (the ending, then NG+) |

- Every boss has phases and one gimmick (rules that change mid-fight, a
  mirror of your own moveset, a timer, lag that teleports, a hitbox that isn't
  where the body is…).
- **Flies** drop from bosses; the toad turns them into Vigor, Endurance,
  Strength, Flask and Potency levels.
- Five weapons, each a sidegrade with its own combo, heavy and running attack.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## Controls

| | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| move / look | WASD / mouse | left / right stick | left thumb / drag right side |
| sprint | Shift | hold B | push the stick to the edge |
| light · heavy | left click · F | R1 · R2 | ATK · HEAVY |
| block (hold) · parry | right click · C | L1 · L2 | BLOCK · PARRY |
| roll | Space | tap B | ROLL |
| heal | R | X | HEAL |
| lock on | Q / middle click | R3 / Y | LOCK |
| interact · pause | E · Esc | A · Start | gold button · II |

## Combat model

- **Stamina** pays for everything; regen pauses briefly after any spend.
- **Roll**: 0.30 s of invincibility starting 0.05 s in. Timing beats distance.
- **Block** eats most of a blockable hit and costs stamina; empty stamina under
  a hit is a guard break.
- **Parry**: a 0.16 s window. A parried boss staggers; attack it to riposte.
- **Telegraphs**: a boss glows while it winds up. Gold can be parried, red
  can't (roll).
- **Poise**: enough damage in a short window staggers a boss.
- First fights teach this in short one-time tips (Settings → combat tips).

## How it's built

```
src/sim/       the fight, headless: player, boss AI, moves, gimmicks, projectiles,
               hazards, and a human-like bot used to balance every boss
src/content/   bosses, worlds, progression, per-boss tuning (fitted by tools/tune.mjs)
src/render/    procedural low-poly characters (kit/), pose rig + clips sampled on
               sim timing (anim/), environments (env/), particles/trails/decals
               (fx/), looks + post-processing
src/audio/     synthesized sound effects, boss voices, generative music
src/input/     keyboard, mouse, gamepad and touch → one intent
src/game/      game flow, camera, save
src/ui/        HUD and menus
dev/           pose sheets, boss gallery, environment views
tools/         balance / tune / playthrough / screenshot / filmstrip tools
```

The simulation never reads the renderer. It runs at a fixed 60 Hz, and every
hit is decided from attack arcs and sim timing, so the animation can't disagree
with the damage, and the same code runs headless for balancing:

```bash
node tools/balance.mjs [novice|average|skilled] [runs] [bossId…]   # win rate + fight length
node tools/tune.mjs [runs] [bossId…]     # refit HP / damage to the targets in tools/targets.mjs
npx vite --port 5190 &                   # the browser tools expect the dev server here
node tools/playthrough.mjs 844 390 touch # scripted run of the real game on a phone-sized screen
```

## Models

Every character is built in code from small shapes. To swap in your own
Blender models later, see `ASSETS.md`.
