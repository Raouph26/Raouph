# Asset spec — what to export from Blender

The prototype runs on blocky placeholder rigs built in code (`src/actor.js`).
Nothing in the combat code reads geometry — it only reads **named nodes** and
**named animation clips**. Match the names below and your models drop in with no
gameplay changes.

## Format

- **glTF 2.0 binary (`.glb`)**, one file per character, into `public/models/`.
- **+Z forward, +Y up.** In Blender export with *+Y up* ticked (the default).
- **Units: metres.** Player should be ~1.7 m tall at export scale 1.0.
- Origin at the **feet**, centred between them, at world zero.
- Textures embedded. No external image files.
- Meshes joined per material where you can — draw calls are cheap here but not free.

## Poly budget (generous; low-poly style, not a hard limit)

| Asset | Tris |
|---|---|
| Player | 4k–9k |
| Boss | 10k–25k |
| Weapon | 400–1,500 |
| Arena | 30k–80k |

## Required bone / node names

Rig freely — extra bones are fine and ignored. These specific names must exist:

```
root
  hips
    spine
      chest
        neck / head
        shoulder.L  upperarm.L  forearm.L  hand.L
        shoulder.R  upperarm.R  forearm.R  hand.R
    thigh.L  shin.L  foot.L
    thigh.R  shin.R  foot.R
```

Plus **two empties**, parented as shown, which the game uses directly:

- `socket.weapon` — parented to `hand.R`. The weapon model attaches here.
- `socket.tip` — on the **weapon** model, at the far end of the blade.
  **This is the hitbox.** The swing is a swept sphere traced along this point's
  path between frames, so put it where the damage should come from.

## Required animation clips

Name clips exactly. Lengths are what the prototype is tuned to — send whatever
feels right and I'll retune `src/config.js` to your timings, that's a one-line
change per move.

**Player**

| Clip | Loop | ~Length | Notes |
|---|---|---|---|
| `idle` | yes | 2–4 s | |
| `walk_f` `walk_b` `walk_l` `walk_r` | yes | ~1 s | strafe set, used when locked on |
| `run_f` | yes | ~0.7 s | |
| `roll` | no | 0.52 s | **i-frames are 0.055–0.395 s in** — the tuck must read there |
| `backstep` | no | 0.34 s | |
| `attack_light_1/2/3` | no | ~0.55 s | wind-up ≈ first 30%, impact at 30%, recovery after |
| `attack_heavy_1/2` | no | ~1.1 s | big readable wind-up, ~45% |
| `block_idle` | yes | 2 s | |
| `block_hit` | no | 0.3 s | |
| `guard_break` | no | 1.35 s | |
| `parry` | no | 0.63 s | **active window 0.04–0.21 s** — the deflect must be unmistakable there |
| `riposte` | no | 0.85 s | |
| `hit_front` `hit_back` | no | 0.34 s | |
| `death` | no | ~1.5 s | |

**Boss** — one set per boss

| Clip | Loop | Notes |
|---|---|---|
| `idle` | yes | |
| `walk` `run` | yes | |
| `atk_slam` | no | windup 0.78 s / hit 0.78 s / recover to 1.84 s |
| `atk_swipe_a` `atk_swipe_b` | no | combo pair, hits at 0.46 s and 0.30 s |
| `atk_lunge` | no | hits at 0.62 s, travels ~7 m |
| `atk_sweep` | no | 360° low sweep, hits at 0.55 s |
| `atk_stomp` | no | phase-2 unblockable AoE, hits at 0.92 s |
| `flinch` | no | 0.42 s poise break |
| `stagger` | no | 2.4 s — the riposte-able opening, must read as *helpless* |
| `roar` | no | 1.15 s phase transition |
| `death` | no | ~2 s |

**Root motion:** don't bake it. The game drives position; animations should play
in place. Exception: `atk_lunge` and `roll`, where a little forward motion baked
in looks better — tell me if you bake it and I'll subtract it.

## Telegraph rule (the most important art note)

Every boss attack must be **readable from its silhouette in the first 3 frames of
wind-up**, at lock-on camera distance, in fog. If two attacks share a starting
pose, the fight becomes a coin flip and players will rightly hate it.

Concretely: different arm, different height, different body lean per move. The
code also pushes an emissive glow during wind-up (stronger for unblockable
attacks) — leave a material slot that can take emissive, or tell me to drive a
separate mesh instead.

## Arena

One `.glb`, playable area a flat ring of radius **21 m** centred on origin.
Decorate outward freely. Ground must be flat at `y = 0` — no ramps or steps yet;
the controller has no ground raycast.

## Weapons

One `.glb` each, origin **at the grip** where the hand closes, blade pointing
**−Y** from there, plus the `socket.tip` empty at the far end.
Current three: `cleaver`, `rapier`, `maul`.

## Sending them over

Drop `.glb` files into `public/models/` and tell me the filenames. I'll write the
loader, wire the clip names to the state machine, and retune timings to your
actual animation lengths.
