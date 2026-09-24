// ─────────────────────────────────────────────────────────────────────────────
// Boss move library. A move is a list of steps; each step is
//   windup (readable, harmless) → active (hits land) → recovery (punishable).
// `tell` names the pose the renderer plays — every tell starts from a
// distinct silhouette so no two attacks can be confused at the wind-up.
//
// Hit shapes:  arc {range, arc(half-angle)} · circle {radius, offset}
//              body (contact during a charge) · landing (leap, on touchdown)
// Spawns fire at a step phase: 'windup' | 'active' | 'end', or at time `t`.
// Base damage is tuned for a 100 HP frog; each boss scales it by `dmg`.
// ─────────────────────────────────────────────────────────────────────────────

const R = Math.PI / 180;
const arc = (range, deg, dmg, o = {}) => ({ shape: 'arc', range, arc: deg * R, dmg, parryable: true, ...o });
const circle = (radius, dmg, o = {}) => ({ shape: 'circle', radius, offset: 0, dmg, parryable: false, ...o });
const step = (windup, active, recovery, o = {}) => ({ windup, active, recovery, track: 5, trackActive: 0.6, advance: 0, ...o });

export const MOVES = {
  // ── plain melee ───────────────────────────────────────────────────────────
  swipe: { tell: 'swipeR', dist: [0, 3.8], weight: 3, cd: 1.2, steps: [
    step(.58, .12, .62, { hit: arc(3.1, 72, 18), advance: 1.3, sfx: 'whoosh' }),
  ]},
  swipe2: { tell: 'swipeR', dist: [0, 3.8], weight: 3, cd: 2.0, steps: [
    step(.52, .12, .30, { hit: arc(3.1, 72, 17), advance: 1.2, sfx: 'whoosh' }),
    step(.34, .12, .70, { tell: 'swipeL', hit: arc(3.1, 72, 18), advance: 1.3, sfx: 'whoosh' }),
  ]},
  swipe3: { tell: 'swipeR', dist: [0, 3.8], weight: 2, cd: 3.2, phase: 2, steps: [
    step(.50, .11, .26, { hit: arc(3.1, 72, 16), advance: 1.0, sfx: 'whoosh' }),
    step(.30, .11, .26, { tell: 'swipeL', hit: arc(3.1, 72, 16), advance: 1.0, sfx: 'whoosh' }),
    step(.46, .14, .95, { tell: 'overhead', hit: arc(3.3, 38, 24), advance: 1.4, sfx: 'slam' }),
  ]},
  overhead: { tell: 'overhead', dist: [0, 4.0], weight: 3, cd: 1.8, steps: [
    step(.80, .14, .95, { hit: arc(3.3, 38, 25), advance: 1.7, sfx: 'slam' }),
  ]},
  delayed: { tell: 'overhead', dist: [0, 4.0], weight: 2, cd: 2.6, steps: [
    // the souls classic: it holds the blow until you've already rolled
    step(.72, .14, 1.0, { hit: arc(3.3, 38, 27), advance: 1.8, delay: { chance: 1, min: .52, max: .72 }, sfx: 'slam' }),
  ]},
  thrust: { tell: 'thrust', dist: [3.0, 9.0], weight: 3, cd: 2.2, steps: [
    step(.62, .18, .82, { hit: arc(3.3, 24, 22), advance: 5.8, track: 6, trackActive: .9, sfx: 'whoosh' }),
  ]},
  sweep: { tell: 'sweep', dist: [0, 4.0], weight: 2, cd: 2.2, steps: [
    step(.62, .16, .72, { hit: arc(3.6, 100, 19), advance: .5, sfx: 'whooshBig' }),
  ]},
  spin: { tell: 'spin', dist: [0, 3.6], weight: 2, cd: 3.2, steps: [
    step(.72, .40, .85, { hit: circle(3.3, 21, { parryable: false }), track: 3, trackActive: 0, sfx: 'whooshBig' }),
  ]},
  stomp: { tell: 'stomp', dist: [0, 4.6], weight: 2, cd: 4.0, phase: 2, steps: [
    step(.92, .10, 1.05, { hit: circle(4.3, 26, { unblockable: true, knockdown: true }), track: 2, sfx: 'boom' }),
  ]},
  jab3: { tell: 'jab', dist: [0, 3.4], weight: 3, cd: 2.0, steps: [
    step(.40, .08, .16, { hit: arc(2.9, 26, 11), advance: .6, sfx: 'whooshSmall' }),
    step(.22, .08, .16, { hit: arc(2.9, 26, 11), advance: .5, sfx: 'whooshSmall' }),
    step(.22, .08, .68, { hit: arc(3.0, 26, 13), advance: .8, sfx: 'whooshSmall' }),
  ]},
  leap: { tell: 'leap', dist: [4.5, 14], weight: 3, cd: 4.0, steps: [
    step(.56, .78, .92, { leap: { height: 4.2, predict: .35, max: 12 }, hit: circle(3.0, 27, { knockdown: true, landing: true }), track: 7, sfx: 'boom' }),
  ]},
  backflip: { tell: 'backflip', dist: [0, 3.2], weight: 1, cd: 5.0, steps: [
    step(.18, .40, .20, { retreat: 5.2, track: 4 }),
  ], followUps: [{ id: 'thrust', chance: .6 }, { id: 'leap', chance: .4 }] },
  charge: { tell: 'charge', dist: [5, 16], weight: 2, cd: 4.0, steps: [
    step(.75, 1.05, .80, { charge: { speed: 12.5 }, hit: { shape: 'body', dmg: 22, knockdown: true, parryable: false }, track: 6, sfx: 'charge' }),
  ]},

  // ── projectiles ───────────────────────────────────────────────────────────
  throw: { tell: 'throw', dist: [4, 16], weight: 3, cd: 2.6, steps: [
    step(.70, .10, .62, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'brick', dmg: 17, arc: true, flight: .85, radius: .4, aoe: 1.4 } }], track: 6, sfx: 'throw' }),
  ]},
  throw3: { tell: 'throw', dist: [4, 16], weight: 2, cd: 4.5, phase: 2, steps: [
    step(.55, .08, .16, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'brick', dmg: 15, arc: true, flight: .8, radius: .4, aoe: 1.3 } }], track: 7, sfx: 'throw' }),
    step(.30, .08, .16, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'brick', dmg: 15, arc: true, flight: .8, radius: .4, aoe: 1.3, lead: .6 } }], track: 7, sfx: 'throw' }),
    step(.30, .08, .70, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'brick', dmg: 15, arc: true, flight: .8, radius: .4, aoe: 1.3, lead: 1.0 } }], track: 7, sfx: 'throw' }),
  ]},
  volley: { tell: 'cast', dist: [3, 14], weight: 3, cd: 3.2, steps: [
    step(.66, .10, .75, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'paper', count: 5, spread: 50, speed: 11, dmg: 11, radius: .3, life: 2.2 } }], track: 6, sfx: 'cast' }),
  ]},
  orbs: { tell: 'type', dist: [3, 16], weight: 3, cd: 4.0, steps: [
    step(1.10, .10, .20, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'orb', speed: 5.6, homing: 1.35, dmg: 11, radius: .36, life: 3.2 } }], track: 4, sfx: 'cast', say: '...' }),
    step(.24, .10, .20, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'orb', speed: 5.6, homing: 1.35, dmg: 11, radius: .36, life: 3.2 } }], track: 4, sfx: 'cast' }),
    step(.24, .10, .70, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'orb', speed: 5.6, homing: 1.35, dmg: 11, radius: .36, life: 3.2 } }], track: 4, sfx: 'cast' }),
  ]},
  orbRing: { tell: 'cast', dist: [0, 20], weight: 2, cd: 6.0, steps: [
    step(.90, .10, .80, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'orb', ring: 12, speed: 6.5, dmg: 13, radius: .36, life: 3.4 } }], track: 0, sfx: 'cast' }),
  ]},
  phantoms: { tell: 'cast', dist: [0, 20], weight: 2, cd: 7.0, steps: [
    step(.80, .10, .90, { spawn: [{ at: 'active', kind: 'projectile', p: { type: 'phantom', count: 2, dmg: 18, radius: .85, delay: .85, speed: 15, dashTime: .5 } }], track: 3, sfx: 'cast', say: 'great post!' }),
  ]},

  // ── hazards ───────────────────────────────────────────────────────────────
  shout: { tell: 'overhead', dist: [0, 5], weight: 3, cd: 3.0, steps: [
    step(.78, .14, 1.05, { hit: arc(3.3, 40, 22), advance: 1.3, spawn: [{ at: 1.40, kind: 'ring', p: { speed: 7.5, maxR: 11, width: .8, dmg: 16 } }], sfx: 'boom', say: 'HELLO??' }),
  ]},
  eruption: { tell: 'stomp', dist: [2, 14], weight: 2, cd: 4.5, steps: [
    step(.80, .10, .90, { spawn: [{ at: 'active', kind: 'line', p: { count: 7, spacing: 1.75, delay: .50, delayStep: .12, radius: 1.1, dmg: 20 } }], track: 6, sfx: 'boom' }),
  ]},
  tiles: { tell: 'cast', dist: [0, 20], weight: 3, cd: 5.0, steps: [
    step(.60, .10, .30, { spawn: [{ at: 'active', kind: 'tiles', p: { delay: 1.45, dmg: 24 } }], track: 0, sfx: 'cast', say: 'select all squares with a frog' }),
  ]},
  flash: { tell: 'flash', dist: [2, 10], weight: 3, cd: 4.2, steps: [
    step(.70, .06, .10, { spawn: [{ at: 'active', kind: 'flash' }], track: 5, sfx: 'flash' }),
    step(.28, .16, .80, { tell: 'thrust', hit: arc(3.3, 26, 22), advance: 6.2, track: 8, trackActive: 1.2, sfx: 'whoosh' }),
  ]},

  // ── signature pieces ──────────────────────────────────────────────────────
  pincer: { tell: 'pincer', dist: [0, 3.6], weight: 3, cd: 2.0, steps: [
    step(.55, .12, .22, { hit: arc(3.0, 60, 16), advance: .8, sfx: 'snip' }),
    step(.30, .12, .72, { tell: 'pincerL', hit: arc(3.0, 60, 17), advance: .8, sfx: 'snip' }),
  ]},
  clawSlam: { tell: 'overhead', dist: [0, 4], weight: 2, cd: 2.4, steps: [
    step(.74, .14, .92, { hit: arc(3.2, 40, 25), advance: 1.3, sfx: 'slam' }),
  ]},
  scuttle: { tell: 'scuttle', dist: [3, 14], weight: 2, cd: 4.0, steps: [
    step(.60, .85, .70, { charge: { speed: 10.5, sideways: true }, hit: { shape: 'body', dmg: 19, knockdown: false, parryable: false }, track: 6, sfx: 'charge' }),
  ]},
  bounce: { tell: 'bounce', dist: [0, 20], weight: 3, cd: 3.0, steps: [
    step(.72, 2.6, .60, { charge: { speed: 14.5, bounces: 3, stunOnWall: .16 }, hit: { shape: 'body', dmg: 18, knockdown: false, parryable: false, multi: .6 }, track: 7, sfx: 'charge' }),
  ]},
  knifeSpin: { tell: 'spin', dist: [0, 4], weight: 3, cd: 2.4, steps: [
    step(.58, .75, .60, { hit: circle(3.3, 14, { multi: .25 }), advance: 0, track: 2, trackActive: 0, sfx: 'whirr' }),
  ]},
  stance: { tell: 'stance', dist: [0, 5], weight: 0, cd: 6.0, steps: [
    step(.25, 1.35, .30, { counter: { dmg: 30 }, track: 8, trackActive: 5, say: 'predicted.' }),
  ]},
  wipe: { tell: 'wipe', dist: [0, 30], weight: 0, cd: 16.0, steps: [
    step(.60, .10, 4.4, { spawn: [{ at: 'active', kind: 'wipe', p: { delay: 3.9, dmg: 58, safeRadius: 3.0 } }], track: 0, sfx: 'error', say: 'collecting error info' }),
  ]},
  roar: { tell: 'roar', dist: [0, 30], weight: 0, cd: 99, steps: [
    step(.20, 1.0, .40, { spawn: [{ at: 'active', kind: 'ring', p: { speed: 12, maxR: 7, width: 1.2, dmg: 0, push: 7 } }], sfx: 'roar' }),
  ]},

  // ── the other frog uses the frog's own kit ────────────────────────────────
  mLight3: { tell: 'slashR', dist: [0, 3.2], weight: 4, cd: 1.1, rig: 'player', steps: [
    step(.44, .09, .18, { tell: 'thrust', hit: arc(2.9, 28, 12), advance: .9, sfx: 'whooshSmall' }),
    step(.24, .09, .18, { tell: 'thrust', hit: arc(2.9, 28, 12), advance: .7, sfx: 'whooshSmall' }),
    step(.28, .10, .56, { tell: 'slashR', hit: arc(2.8, 62, 15), advance: .8, sfx: 'whoosh' }),
  ]},
  mHeavy: { tell: 'lungeThrust', dist: [2.5, 6], weight: 2, cd: 2.6, rig: 'player', steps: [
    step(.42, .12, .60, { hit: arc(3.1, 22, 24), advance: 3.4, track: 7, sfx: 'whoosh' }),
  ]},
  mRun: { tell: 'lungeThrust', dist: [5, 14], weight: 3, cd: 2.4, rig: 'player', steps: [
    step(.30, .14, .56, { hit: arc(3.1, 24, 18), advance: 7.5, track: 8, trackActive: 1.4, sfx: 'whoosh' }),
  ]},
};

export function getMove(id, overrides) {
  const base = MOVES[id];
  if (!base) throw new Error(`unknown move ${id}`);
  if (!overrides) return { id, ...base };
  return { id, ...base, ...overrides };
}
