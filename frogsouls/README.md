# FROGSOULS — combat prototype

A souls-like boss rush. Roll, block, parry, riposte, stamina, lock-on.
Three.js, runs in the browser.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## Controls

| | |
|---|---|
| WASD | move (camera-relative; strafe when locked) |
| Shift | sprint |
| Space | roll (neutral = backstep) |
| Tab / middle-click | toggle lock-on |
| Left click | light attack (chains into a combo) |
| Right click **hold** | block |
| Right click **tap** | parry |
| Q | heavy attack |
| 1 / 2 / 3 | cleaver / rapier / maul |
| R | retry |

Click the canvas once to capture the mouse.

## Where things are

| File | What it owns |
|---|---|
| `src/config.js` | **every number that decides feel.** Tune here first. |
| `src/player.js` | player state machine, weapon sweep, damage intake |
| `src/boss.js` | boss pattern table, telegraphs, poise, stagger |
| `src/cameraRig.js` | free + lock-on camera |
| `src/input.js` | input with a 0.24 s buffer |
| `src/fx.js` | hitstop, shake, flash, sparks |
| `src/actor.js` | **placeholder** blocky rigs — replaced by real `.glb`s |
| `src/arena.js` | **placeholder** arena and lighting |

## Combat model

- **Stamina** gates every offensive and defensive action; regen pauses 0.55 s
  after any spend.
- **Roll** has 0.34 s of i-frames starting 0.055 s in — the single most important
  number in the game (`config.js → PLAYER.roll`).
- **Block** absorbs 78% of damage and chips stamina; running out of stamina under
  a hit is a guard break (1.35 s helpless).
- **Parry** is a 0.17 s window on a 0.63 s commitment. Whiffing it is punished.
  A successful parry staggers the boss for 2.4 s — walk in and light-attack to
  riposte for 62.
- **Poise**: the boss flinches when it takes 110 poise damage inside its regen
  window. Heavy attacks and the maul break poise much faster.
- **Phases** at 68% and 35% HP: shorter recovery, new moves, harder hits.

## Status

Phase 1 (combat feel) and a first boss are in. Next: real assets (`ASSETS.md`),
more bosses, audio, menus.
