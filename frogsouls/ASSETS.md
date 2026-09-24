# Using your own models

Right now every character, weapon and prop is built in code from small
shapes (`src/render/kit/`). Nothing in the fight reads geometry: hits come
from attack arcs in the simulation (`src/sim/`), timed by the sim's clock. So
a hand-made model can replace a built one without changing how the game
plays. It only has to move the same joints.

A model loader isn't wired in yet. This page is the spec to follow so that
hooking one up is a small job.

## Format

- **glTF 2.0 binary (`.glb`)**, one file per character, textures embedded.
- **+Y up, facing +Z.** Blender's glTF exporter does this by default.
- **Metres.** The frog is about 1.8 m tall including the head. Bosses are
  scaled in game (`scale` in `src/content/bosses.js`), so author them at
  roughly human size, about 2.1 m.
- Origin at the feet, centred, at world zero.
- Low poly and flat shaded, to match the rest: frog 3k–8k tris, bosses
  5k–15k, weapons under 1.5k. Vertex colours or small palette textures both
  work.

## Skeleton

The game animates these joints (names from `src/render/kit/rig.js`). Name
your bones the same, or send a mapping. Extra bones are fine and are ignored.

```
root                     at the feet; the game moves and turns this
  body                   whole-body tilt: rolls, knockdowns
    pelvis               at hip height
      spine
        chest
          neck
            head
          upperR  foreR  handR     right arm (the weapon hand)
            socket                 weapon attach point (see below)
          upperL  foreL  handL     left arm
            offhand
      thighR  shinR  footR
      thighL  shinL  footL
```

- Rest pose: standing straight, **arms hanging straight down** (along −Y
  from the shoulders), legs straight. Not a T-pose.
- The character's **right** side is **−X** when it faces +Z.

## Weapons

- One `.glb` per weapon, grip at the origin, **blade pointing up +Y**.
- Two empties on it: `base` where the blade starts, `tip` at the end. The
  swing trail is drawn between them. The damage area is set in
  `src/sim/weapons.js`, so the trail just needs to look right.

## Animation

There are two ways to do this:

1. **Keep the game's animation (easiest).** Skin your mesh to the skeleton
   above and don't send any clips. The game already poses those joints for
   every attack, roll, parry and hit, at the exact frames the fight uses.
2. **Bring your own clips (Mixamo or hand-keyed).** Clips need to line up
   with the sim's timing. Each attack has a wind-up, active and recovery
   time in `src/sim/weapons.js` (player) and `src/sim/moves.js` (bosses).
   The loader, once added, would stretch each clip's three sections to fit.
   For that, mark the frame where the swing starts to hurt and the frame
   where it stops.
   Mixamo's auto-rigger gives a humanoid skeleton that maps onto the one
   above with a name table.

## Where it plugs in

- `src/render/kit/frog.js` → `buildFrog()` returns `{ rig, material, … }`
- `src/render/kit/boss.js` → `buildBoss(def)` returns `{ rig, root, weapon, … }`
- `src/render/kit/weapons.js` → `buildWeapon(id, material)` returns a group with
  `userData.base` and `userData.tip`

A loaded model would return the same shapes from these functions, and
nothing else needs to change.
