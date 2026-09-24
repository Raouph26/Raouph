import { pose, derive, mirror, lerpPose, extrap, mixPose, easeClamped, I, N } from './pose.js';

// ─────────────────────────────────────────────────────────────────────────────
// Clips are key poses on a normalised timeline, sampled on the SIM's clock so
// the blade always arrives when the hit resolves. Every swing follows the same
// grammar animators use:
//   wind-up   from wherever the body was → the peak (arrive early, hang) → coil
//   active    coil → strike (explosive, expo-out) → follow-through (overshoot)
//   recovery  follow → settle (weight drops into the knees) → the live stance
// Two markers stand in for poses that only exist at run time:
//   FROM  the pose the character was in when this action began (no pops)
//   BASE  the live stance underneath (combat-ready, relaxed, two-handed…)
// A key is [time 0..1, pose | FROM | BASE, easing into this key].
// ─────────────────────────────────────────────────────────────────────────────

export const FROM = 'from';
export const BASE = 'base';

/** Sample keys at k ∈ [0, 1] into `out`. */
export function sampleKeys(out, keys, k, base, from) {
  const n = keys.length;
  if (k <= keys[0][0]) return copyKey(out, keys[0][1], base, from);
  for (let i = 1; i < n; i++) {
    const [t1, p1, e] = keys[i];
    if (k <= t1 || i === n - 1) {
      const [t0, p0] = keys[i - 1];
      const u = t1 > t0 ? (k - t0) / (t1 - t0) : 1;
      const a = resolve(p0, base, from), b = resolve(p1, base, from);
      return lerpPose(out, a, b, easeClamped(e ?? 'inOut', u));
    }
  }
  return out;
}
const resolve = (p, base, from) => (p === BASE ? base : p === FROM ? (from ?? base) : p);
const copyKey = (out, p, base, from) => { out.set(resolve(p, base, from)); return out; };

// ── stances ─────────────────────────────────────────────────────────────────
export const REST = pose({
  drop: -.02, lean: .06, nod: .04,
  rRaise: .18, rOut: .14, rElbow: .45, wPitch: .55, rWrist: .1,
  lRaise: .12, lOut: .18, lElbow: .38,
  rHip: .05, lHip: .05, rKnee: .1, lKnee: .1, rAnkle: -.05, lAnkle: -.05,
});

// combat-ready: blade forward, buckler forward, weight on the balls of the feet
export const READY = pose({
  drop: -.08, lean: .15, spineTwist: .18, chestTwist: .08, nod: -.02, look: -.2,
  rRaise: .42, rOut: .2, rElbow: 1.05, rWrist: -.1, wPitch: 1.25, wRoll: 0,
  lRaise: .72, lOut: .32, lElbow: 1.85, lTwist: .15,          // the pad up at chest height, facing the enemy
  rHip: -.12, lHip: .32, rKnee: .4, lKnee: .34, rHipOut: .06, lHipOut: .1, rAnkle: -.1, lAnkle: -.15,
});

// block: the lily pad up in front of the face, blade low and ready to punish
export const GUARD = derive(READY, {
  drop: -.13, lean: .24, spineTwist: .02, chestTwist: -.08, nod: .08, look: 0,
  lRaise: 1.55, lOut: .12, lElbow: 1.95, lTwist: .1, lWrist: .15,
  rRaise: .32, rOut: .32, rElbow: 1.2, rWrist: -.1, wPitch: 1.2,
  rHip: -.2, lHip: .42, rKnee: .52, lKnee: .48,
});

// bosses hold their weapons low so their faces — the joke — stay visible
export const BOSS_READY = pose({
  drop: -.05, lean: .1, spineTwist: .12, look: -.1,
  rRaise: .28, rOut: .32, rElbow: .55, rWrist: 0, wPitch: 1.05,
  lRaise: .2, lOut: .3, lElbow: .5,
  rHip: -.08, lHip: .22, rKnee: .28, lKnee: .24, rHipOut: .08, lHipOut: .1,
});

// two-handed weapons rest the off hand near the grip
const TWO = { lRaise: .7, lOut: -.35, lElbow: 1.35 };

/** Weight drops into the knees after a swing. */
function settleOf(follow, strike) {
  const p = mixPose(follow, strike, .35);
  p[I.drop] -= .05; p[I.rKnee] += .12; p[I.lKnee] += .12; p[I.lean] += .04;
  return p;
}

/**
 * Build an attack clip from its two defining poses. Everything else (the
 * coil before the strike, the follow-through, the settle) is derived, and
 * can be overridden per clip.
 */
export function atk(o) {
  const { peak, strike } = o;
  const coil = o.coil ?? extrap(strike, peak, .07);
  const follow = o.follow ?? extrap(peak, strike, .14);
  const settle = o.settle ?? settleOf(follow, strike);
  const windup = o.anticip
    ? [[0, FROM], [.3, o.anticip, 'inOut'], [.78, peak, 'outCubic'], [1, coil, 'inOut']]
    : [[0, FROM], [.72, peak, 'outCubic'], [1, coil, 'inOut']];
  return {
    peak, strike, coil, follow, settle, spin: o.spin,
    windup: o.windup ?? windup,
    active: o.active ?? [[0, coil], [o.hitAt ?? .38, strike, 'expoOut'], [1, follow, 'outCubic']],
    recovery: o.recovery ?? [[0, follow], [.4, settle, 'out'], [1, BASE, 'inOut']],
  };
}

/** Sample an attack clip at a sim phase. */
export function sampleClip(out, clip, phase, k, base, from) {
  if (phase === 'windup') return sampleKeys(out, clip.windup, k, base, from);
  if (phase === 'hold') { out.set(clip.coil); return out; }
  if (phase === 'active') return sampleKeys(out, clip.active, k, base, from);
  return sampleKeys(out, clip.recovery, k, base, from);
}

// ── player attacks ──────────────────────────────────────────────────────────
const P = {
  slashR: {
    peak:   pose({ drop: -.1, lean: .02, spineTwist: .95, chestTwist: .35, look: -.6, rRaise: 1.0, rOut: 1.3, rElbow: 1.5, rWrist: -.25, wPitch: 1.25, wRoll: 1.5, lRaise: .6, lOut: .55, lElbow: 1.2, rHip: -.22, lHip: .38, rKnee: .5, lKnee: .32 }),
    strike: pose({ drop: -.14, lean: .26, spineTwist: -.85, chestTwist: -.4, look: .35, rRaise: 1.25, rOut: -.45, rElbow: .15, rWrist: .2, wPitch: 1.3, wRoll: 1.5, lRaise: .25, lOut: .75, lElbow: .7, rHip: -.32, lHip: .6, rKnee: .38, lKnee: .55 }),
  },
  slashL: {
    peak:   pose({ drop: -.1, lean: .08, spineTwist: -.8, chestTwist: -.32, look: .4, rRaise: 1.35, rOut: -.6, rElbow: 1.75, rWrist: .1, wPitch: 1.1, wRoll: -1.5, lRaise: .45, lOut: .9, lElbow: .8, rHip: .2, lHip: .1, rKnee: .42, lKnee: .42 }),
    strike: pose({ drop: -.14, lean: .24, spineTwist: .8, chestTwist: .38, look: -.4, rRaise: 1.0, rOut: 1.25, rElbow: .12, rWrist: -.1, wPitch: 1.3, wRoll: -1.5, lRaise: .45, lOut: .35, lElbow: 1.15, rHip: -.28, lHip: .5, rKnee: .42, lKnee: .5 }),
  },
  thrust: {
    peak:   pose({ drop: -.12, lean: -.05, spineTwist: .65, chestTwist: .28, look: -.5, rRaise: -.45, rOut: .3, rElbow: 1.85, rWrist: -.2, wPitch: 1.5, lRaise: .85, lOut: .4, lElbow: 1.3, rHip: -.38, lHip: .38, rKnee: .55, lKnee: .38 }),
    strike: pose({ drop: -.18, lean: .42, spineTwist: -.28, chestTwist: -.12, look: .15, rRaise: 1.5, rOut: .08, rElbow: .05, rWrist: 0, wPitch: 1.55, lRaise: -.3, lOut: .6, lElbow: .4, rHip: -.5, lHip: .82, rKnee: .25, lKnee: .75 }),
  },
  lungeThrust: {
    peak:   pose({ drop: -.16, lean: .0, spineTwist: .75, chestTwist: .28, look: -.6, rRaise: -.5, rOut: .35, rElbow: 1.95, rWrist: -.2, wPitch: 1.5, lRaise: 1.0, lOut: .2, lElbow: 1.2, rHip: -.55, lHip: .55, rKnee: .75, lKnee: .55 }),
    strike: pose({ drop: -.32, lean: .58, spineTwist: -.32, chestTwist: -.12, look: .2, rRaise: 1.55, rOut: .05, rElbow: .02, wPitch: 1.57, lRaise: -.6, lOut: .5, lElbow: .25, rHip: -.8, lHip: 1.2, rKnee: .2, lKnee: 1.15 }),
  },
  overhead: {
    peak:   pose({ drop: -.04, lean: -.3, spineTwist: .25, chestLean: -.12, nod: -.25, rRaise: 2.75, rOut: .25, rElbow: 1.4, rWrist: .1, wPitch: 0.9, lRaise: 1.7, lOut: .25, lElbow: 1.3, rHip: -.1, lHip: .3, rKnee: .25, lKnee: .3 }),
    strike: pose({ drop: -.24, lean: .6, spineTwist: -.05, chestLean: .18, nod: .22, rRaise: .55, rOut: .05, rElbow: .1, rWrist: .25, wPitch: 1.35, lRaise: .45, lOut: .35, lElbow: .8, rHip: -.32, lHip: .8, rKnee: .52, lKnee: .85 }),
    anticip: pose({ drop: -.16, lean: .2, spineTwist: .1, nod: .1, rRaise: .9, rOut: .3, rElbow: 1.6, wPitch: 1.3, lRaise: .8, lOut: .3, lElbow: 1.4, rHip: -.2, lHip: .45, rKnee: .6, lKnee: .55 }),
  },
  spearPoke: {
    peak:   pose({ drop: -.12, lean: .02, spineTwist: .6, look: -.45, rRaise: -.3, rOut: .2, rElbow: 1.75, wPitch: 1.5, lRaise: .9, lOut: -.3, lElbow: 1.05, rHip: -.32, lHip: .38, rKnee: .52, lKnee: .38 }),
    strike: pose({ drop: -.17, lean: .35, spineTwist: -.12, look: .1, rRaise: 1.35, rOut: .05, rElbow: .1, wPitch: 1.55, lRaise: 1.2, lOut: -.35, lElbow: .2, rHip: -.48, lHip: .72, rKnee: .3, lKnee: .62 }),
  },
};

export const ATTACKS = {
  slashR: atk(P.slashR),
  slashL: atk(P.slashL),
  thrust: atk({ ...P.thrust, hitAt: .3 }),
  lungeThrust: atk({ ...P.lungeThrust, hitAt: .3 }),
  overhead: atk(P.overhead),
  spearPoke: atk({ ...P.spearPoke, hitAt: .3 }),
};
ATTACKS.runSlash = atk({ peak: derive(P.overhead.peak, { lean: -.05, drop: .02 }), strike: derive(P.overhead.strike, { lean: .72, drop: -.32 }) });
ATTACKS.hammerR = atk({
  peak: derive(P.slashR.peak, { ...TWO, lRaise: .9, lOut: -.1, spineTwist: 1.05, rRaise: 1.2 }),
  strike: derive(P.slashR.strike, { lRaise: 1.0, lOut: -.6, lElbow: .5, spineTwist: -1.0 }),
  anticip: derive(READY, { ...TWO, drop: -.16, spineTwist: -.25, rKnee: .6, lKnee: .55 }),
});
ATTACKS.hammerL = atk({
  peak: derive(P.slashL.peak, { ...TWO, lRaise: 1.1, lOut: .2, lElbow: 1.5, spineTwist: -1.05, wPitch: 1.1 }),
  strike: derive(P.slashL.strike, { lRaise: .9, lOut: .6, lElbow: .6, spineTwist: 1.0, wPitch: 1.3 }),
});
ATTACKS.slam = atk({
  peak: derive(P.overhead.peak, { ...TWO, lRaise: 2.55, lOut: -.2, lElbow: 1.3, lean: -.38, rRaise: 2.85 }),
  strike: derive(P.overhead.strike, { lRaise: .6, lOut: -.3, lElbow: .2, lean: .8, drop: -.36, rKnee: .75, lKnee: .95 }),
  anticip: derive(P.overhead.anticip, { ...TWO, drop: -.2 }),
});
ATTACKS.spearSweep = atk({
  peak: derive(P.slashR.peak, { lRaise: .8, lOut: -.2, lElbow: 1.2, rRaise: .6, wPitch: 1.2 }),
  strike: derive(P.slashR.strike, { lRaise: .8, lOut: .3, lElbow: .8, rRaise: .9, wPitch: 1.2 }),
});
ATTACKS.reapR = atk({
  peak: derive(P.slashR.peak, { lRaise: 1.1, lOut: .1, lElbow: 1.2, rRaise: 1.6, spineTwist: 1.15, wPitch: 1.0 }),
  strike: derive(P.slashR.strike, { lRaise: .6, lOut: .6, lElbow: .5, rRaise: .5, spineTwist: -1.05, lean: .42, drop: -.22 }),
});
ATTACKS.reapL = atk({
  peak: derive(P.slashL.peak, { lRaise: 1.0, lOut: .5, lElbow: .9, rRaise: 1.5, spineTwist: -1.05, wPitch: 1.0 }),
  strike: derive(P.slashL.strike, { lRaise: .5, lOut: .2, lElbow: 1.0, rRaise: .5, spineTwist: 1.05, lean: .42, drop: -.22 }),
});
ATTACKS.spin = { ...ATTACKS.reapR, spin: true };

// ── actions with their own shapes ───────────────────────────────────────────
const TUCK = pose({ drop: -.3, lean: .95, chestLean: .35, nod: .7, rRaise: 1.15, rOut: .25, rElbow: 2.15, wPitch: 1.5, lRaise: 1.15, lOut: .25, lElbow: 2.15,
  rHip: 1.95, lHip: 1.95, rKnee: 2.25, lKnee: 2.25, rAnkle: .4, lAnkle: .4 });
const DIVE = pose({ drop: -.2, lean: .6, nod: .35, rRaise: 1.3, rOut: .2, rElbow: .9, wPitch: 1.3, lRaise: 1.4, lOut: .25, lElbow: .7,
  rHip: .8, lHip: -.3, rKnee: .9, lKnee: .4 });
const LAND = pose({ drop: -.32, lean: .45, nod: .15, rRaise: .6, rOut: .45, rElbow: 1.1, wPitch: 1.25, lRaise: .7, lOut: .5, lElbow: 1.0,
  rHip: 1.2, lHip: -.15, rKnee: 1.7, lKnee: 1.35, rAnkle: -.3 });

const PARRY_WIND = pose({ drop: -.12, lean: .18, spineTwist: .45, chestTwist: .3, look: -.25,
  lRaise: 1.25, lOut: -.55, lElbow: 1.75, lTwist: .2,
  rRaise: .3, rOut: .45, rElbow: 1.35, wPitch: 1.1, rHip: -.18, lHip: .42, rKnee: .5, lKnee: .42 });
const PARRY_FLICK = pose({ drop: -.14, lean: .22, spineTwist: -.45, chestTwist: -.3, look: .25,
  lRaise: 1.45, lOut: 1.05, lElbow: .95, lTwist: -.2, lWrist: -.3,
  rRaise: .25, rOut: .55, rElbow: 1.45, wPitch: 1.05, rHip: -.22, lHip: .5, rKnee: .52, lKnee: .45 });

const HURT_FRONT = pose({ drop: -.1, lean: -.45, chestLean: -.25, nod: -.4, look: .1,
  rRaise: .1, rOut: .75, rElbow: .6, wPitch: .9, lRaise: .25, lOut: .85, lElbow: .5, rHip: .2, lHip: -.25, rKnee: .4, lKnee: .25 });
const HURT_BACK = pose({ drop: -.14, lean: .6, chestLean: .25, nod: .35,
  rRaise: -.3, rOut: .5, rElbow: .4, wPitch: 1.0, lRaise: -.3, lOut: .6, lElbow: .4, rHip: -.3, lHip: .45, rKnee: .6, lKnee: .3 });
// hit on its left side: the body folds to its right
const HURT_LEFT = pose({ drop: -.1, lean: .05, tilt: .38, spineTwist: .35, nod: .1, look: .4,
  rRaise: .2, rOut: .9, rElbow: .5, wPitch: 1.0, lRaise: .45, lOut: .35, lElbow: 1.4, rHip: -.1, lHip: .2, rHipOut: .15, rKnee: .5, lKnee: .2 });
const HURT_RIGHT = mirror(HURT_LEFT);

const RIPOSTE_DRAW = pose({ drop: -.14, lean: .1, spineTwist: .7, chestTwist: .25, look: -.3, rRaise: -.5, rOut: .35, rElbow: 1.9, wPitch: 1.55,
  lRaise: 1.1, lOut: .35, lElbow: 1.35, rHip: -.3, lHip: .55, rKnee: .5, lKnee: .5 });
const RIPOSTE_STAB = pose({ drop: -.32, lean: .62, spineTwist: -.28, nod: .2, rRaise: 1.45, rOut: .05, rElbow: .05, wPitch: 1.57,
  lRaise: .9, lOut: .25, lElbow: .7, rHip: -.62, lHip: 1.05, rKnee: .62, lKnee: 1.2 });
const RIPOSTE_GRIND = derive(RIPOSTE_STAB, { spineTwist: -.45, chestTwist: -.2, wRoll: 1.4, rOut: -.1, lean: .7, nod: .3, lRaise: 1.2, lOut: -.1, lElbow: 1.4 });
const RIPOSTE_KICK = pose({ drop: -.05, lean: -.3, spineTwist: -.1, nod: -.1, rRaise: .7, rOut: .5, rElbow: 1.5, wPitch: 1.3, wRoll: .6,
  lRaise: .9, lOut: .6, lElbow: .7, rHip: -.25, rKnee: .35, lHip: 1.55, lKnee: .15, lAnkle: -.3 });

const DRINK_REACH = pose({ drop: -.08, lean: .18, spineTwist: -.2, nod: .25, look: .25, lRaise: -.25, lOut: .35, lElbow: .5, lTwist: .3,
  rRaise: .4, rOut: .3, rElbow: 1.1, wPitch: 1.1, rHip: -.1, lHip: .25, rKnee: .35, lKnee: .3 });
const DRINK = pose({ drop: -.04, lean: -.1, chestLean: -.15, nod: -.55, look: 0, lRaise: 1.8, lOut: .3, lElbow: 2.4, lWrist: .6,
  rRaise: .35, rOut: .35, rElbow: .8, wPitch: .9, rHip: .05, lHip: .12, rKnee: .18, lKnee: .18 });
const DRINK_GULP = derive(DRINK, { nod: -.75, lean: -.2, lWrist: .95, lRaise: 1.95 });

export const ACT = {
  tuck: TUCK, dive: DIVE, land: LAND,
  parryWind: PARRY_WIND, parryFlick: PARRY_FLICK,
  hurtFront: HURT_FRONT, hurtBack: HURT_BACK, hurtLeft: HURT_LEFT, hurtRight: HURT_RIGHT,
  guardBroken: pose({ drop: -.12, lean: -.55, chestLean: -.2, nod: -.45, rRaise: 1.0, rOut: 1.3, rElbow: .3, wPitch: .6, lRaise: 2.1, lOut: 1.0, lElbow: .4, rHip: .2, lHip: -.3, rKnee: .5, lKnee: .3 }),
  downFlat: pose({ drop: .2, pitch: -1.45, nod: .3, rRaise: 1.6, rOut: .6, rElbow: .3, lRaise: 1.4, lOut: .7, lElbow: .4, rHip: .3, lHip: .6, rKnee: .5, lKnee: .9 }),
  downFace: pose({ drop: .16, pitch: 1.48, nod: -.4, look: .5, rRaise: 2.4, rOut: .5, rElbow: .4, lRaise: 2.2, lOut: .7, lElbow: .6, rHip: -.1, lHip: .2, rKnee: .3, lKnee: .5 }),
  kneel: pose({ drop: -.35, lean: .4, nod: .45, rRaise: .1, rOut: .3, rElbow: .4, wPitch: .8, lRaise: .4, lOut: .2, lElbow: .8, rHip: 1.35, lHip: -.25, rKnee: 1.55, lKnee: 1.7, rAnkle: -.6 }),
  dead: pose({ drop: .18, pitch: -1.52, roll: .25, nod: .5, look: .5, rRaise: 1.4, rOut: 1.0, rElbow: .2, lRaise: .9, lOut: 1.2, lElbow: .5, rHip: .2, lHip: .5, rKnee: .4, lKnee: .8 }),
  drinkReach: DRINK_REACH, drink: DRINK, gulp: DRINK_GULP,
  riposteDraw: RIPOSTE_DRAW, riposteStab: RIPOSTE_STAB, riposteGrind: RIPOSTE_GRIND, riposteKick: RIPOSTE_KICK,
  hopBack: pose({ drop: .05, lean: -.3, nod: -.1, rRaise: .6, rOut: .4, rElbow: 1.1, lRaise: .5, lOut: .6, lElbow: .9, rHip: .5, lHip: .7, rKnee: 1.0, lKnee: 1.1 }),
};

/** Keyed timelines for the player's non-attack actions, k = state time / duration. */
export const PLAYER_ACTS = {
  // the tumble itself is a rotation applied on top (see animator)
  roll: [[0, FROM], [.12, DIVE, 'outCubic'], [.3, TUCK, 'inOut'], [.66, TUCK, 'linear'], [.82, LAND, 'inOut'], [1, BASE, 'inOut']],
  parry: [[0, FROM], [.08, PARRY_WIND, 'outCubic'], [.19, PARRY_FLICK, 'expoOut'], [.36, PARRY_FLICK, 'linear'], [1, BASE, 'inOut']],
  riposte: [[0, FROM], [.2, RIPOSTE_DRAW, 'outCubic'], [.31, RIPOSTE_STAB, 'expoOut'], [.56, RIPOSTE_GRIND, 'inOut'], [.7, RIPOSTE_KICK, 'outCubic'], [1, BASE, 'inOut']],
  drink: [[0, FROM], [.14, DRINK_REACH, 'outCubic'], [.36, DRINK, 'inOut'], [.46, DRINK_GULP, 'inOut'], [.56, DRINK, 'inOut'], [.64, DRINK_GULP, 'inOut'], [.74, DRINK, 'inOut'], [1, BASE, 'inOut']],
  knockdown: [[0, FROM], [.22, ACT.downFlat, 'inCubic'], [.3, derive(ACT.downFlat, { drop: .26, nod: .1 }), 'out'], [.36, ACT.downFlat, 'in'], [.56, ACT.downFlat, 'linear'], [.8, ACT.kneel, 'inOut'], [1, BASE, 'inOut']],
  guardbreak: [[0, FROM], [.1, ACT.guardBroken, 'expoOut'], [.55, derive(ACT.guardBroken, { lean: -.35, lRaise: 1.4, nod: -.2 }), 'inOut'], [1, BASE, 'inOut']],
  dead: [[0, FROM], [.25, ACT.kneel, 'outCubic'], [.4, derive(ACT.kneel, { lean: .6, nod: .6 }), 'inOut'], [1, ACT.downFace, 'inCubic']],
};

/** Directional hurt: blend of four poses by where the hit came from (local). */
export function hurtPose(out, fwd, side) {
  // fwd > 0: from the front; side > 0: from its left
  const f = Math.max(0, fwd), b = Math.max(0, -fwd), l = Math.max(0, side), r = Math.max(0, -side);
  const s = f + b + l + r || 1;
  for (let i = 0; i < N; i++) out[i] = (HURT_FRONT[i] * f + HURT_BACK[i] * b + HURT_LEFT[i] * l + HURT_RIGHT[i] * r) / s;
  return out;
}

// ── boss tells (humanoid bosses) ────────────────────────────────────────────
const B = {};
const bp = (o) => pose(o);
B.swipeR = atk(P.slashR);
B.swipeL = atk(P.slashL);
B.overhead = ATTACKS.slam;
B.thrust = atk({ ...P.lungeThrust, hitAt: .3 });
B.jab = atk({ peak: derive(P.thrust.peak, { rElbow: 1.7, lean: .05 }), strike: derive(P.thrust.strike, { lean: .3, drop: -.1 }), hitAt: .3 });
B.sweep = atk({
  peak: bp({ drop: -.22, lean: .35, spineTwist: 1.2, chestTwist: .3, look: -.7, rRaise: .5, rOut: 1.2, rElbow: .6, wPitch: .6, wRoll: 1.5, lRaise: .5, lOut: .5, lElbow: 1.0, rHip: .3, lHip: .5, rKnee: .95, lKnee: .85 }),
  strike: bp({ drop: -.32, lean: .45, spineTwist: -1.3, chestTwist: -.3, look: .6, rRaise: .6, rOut: -.6, rElbow: .2, wPitch: .6, wRoll: 1.5, lRaise: .2, lOut: 1.1, lElbow: .3, rHip: .45, lHip: .45, rKnee: 1.0, lKnee: .9 }),
});
B.spin = { ...B.sweep, spin: true };
B.stomp = atk({
  peak: bp({ drop: .05, lean: -.2, nod: -.3, rRaise: 2.2, rOut: .7, rElbow: .8, lRaise: 2.2, lOut: .7, lElbow: .8, rHip: 1.25, rKnee: 1.2, lKnee: .1, rAnkle: .3 }),
  strike: bp({ drop: -.34, lean: .45, nod: .35, rRaise: .3, rOut: .9, rElbow: .4, lRaise: .3, lOut: .9, lElbow: .4, rHip: .5, lHip: .3, rKnee: .95, lKnee: .85 }),
  hitAt: .3,
});
B.leap = atk({
  peak: bp({ drop: -.4, lean: .55, nod: -.2, rRaise: -.6, rOut: .3, rElbow: .6, lRaise: -.6, lOut: .3, lElbow: .6, rHip: 1.3, lHip: 1.3, rKnee: 1.95, lKnee: 1.95, rAnkle: -.4, lAnkle: -.4 }),
  strike: bp({ drop: -.36, lean: .7, nod: .3, rRaise: .5, rOut: .2, rElbow: .2, wPitch: .3, lRaise: .4, lOut: .6, lElbow: .4, rHip: .9, lHip: .2, rKnee: 1.4, lKnee: .9 }),
});
B.leap.air = bp({ drop: 0, lean: -.1, rRaise: 2.9, rOut: .2, rElbow: .9, lRaise: 2.4, lOut: .4, lElbow: .8, rHip: .7, lHip: .2, rKnee: 1.2, lKnee: .6 });
B.backflip = atk({ peak: TUCK, strike: ACT.hopBack });
B.charge = atk({
  peak: bp({ drop: -.26, lean: .72, nod: -.3, rRaise: -.3, rOut: .4, rElbow: .8, lRaise: -.3, lOut: .4, lElbow: .8, rHip: .7, lHip: -.2, rKnee: 1.0, lKnee: .5 }),
  strike: bp({ drop: -.22, lean: .88, nod: -.4, rRaise: .9, rOut: .5, rElbow: .6, lRaise: .9, lOut: .5, lElbow: .6, rHip: .9, lHip: -.4, rKnee: .7, lKnee: .8 }),
});
B.throw = atk({
  peak: bp({ drop: -.05, lean: -.3, spineTwist: .95, look: -.4, rRaise: 2.3, rOut: .6, rElbow: 1.8, lRaise: 1.0, lOut: .8, lElbow: .5, rHip: -.3, lHip: .4, rKnee: .4, lKnee: .2 }),
  strike: bp({ drop: -.15, lean: .48, spineTwist: -.75, look: .3, rRaise: 1.1, rOut: -.2, rElbow: .1, lRaise: -.3, lOut: .6, lElbow: .4, rHip: -.4, lHip: .7, rKnee: .3, lKnee: .6 }),
});
B.cast = atk({
  peak: bp({ drop: -.05, lean: -.22, nod: -.28, rRaise: 1.95, rOut: .9, rElbow: .7, lRaise: 1.95, lOut: .9, lElbow: .7, rKnee: .2, lKnee: .2 }),
  strike: bp({ drop: -.12, lean: .38, nod: .1, rRaise: 1.45, rOut: .1, rElbow: .1, lRaise: 1.45, lOut: .1, lElbow: .1, rHip: -.2, lHip: .4, rKnee: .3, lKnee: .4 }),
});
B.type = atk({
  peak: bp({ drop: -.05, lean: .35, nod: .45, rRaise: .9, rOut: .1, rElbow: 1.4, rWrist: .5, lRaise: .9, lOut: .1, lElbow: 1.4, lWrist: .5, rKnee: .15, lKnee: .15 }),
  strike: bp({ drop: -.1, lean: .1, nod: -.1, rRaise: 1.5, rOut: .3, rElbow: .2, lRaise: .4, lOut: .5, lElbow: .8, rHip: -.2, lHip: .3, rKnee: .3, lKnee: .3 }),
});
B.flash = atk({
  peak: bp({ drop: -.05, lean: -.15, nod: -.2, rRaise: 2.0, rOut: .2, rElbow: .4, lRaise: 1.2, lOut: .6, lElbow: .6, rKnee: .2, lKnee: .2 }),
  strike: bp({ drop: -.05, lean: -.3, nod: -.35, rRaise: 2.6, rOut: .3, rElbow: .1, lRaise: 1.8, lOut: 1.0, lElbow: .2, rKnee: .2, lKnee: .2 }),
});
B.pincer = atk({
  peak: bp({ drop: -.16, lean: .25, spineTwist: .65, rRaise: 1.15, rOut: 1.1, rElbow: 1.3, lRaise: .6, lOut: .8, lElbow: 1.0, rKnee: .5, lKnee: .5 }),
  strike: bp({ drop: -.22, lean: .48, spineTwist: -.45, rRaise: 1.5, rOut: -.2, rElbow: .3, lRaise: .7, lOut: .6, lElbow: .9, rKnee: .55, lKnee: .55 }),
});
B.pincerL = atk({ peak: mirror(B.pincer.peak), strike: mirror(B.pincer.strike) });
B.scuttle = atk({
  peak: bp({ drop: -.3, lean: .3, rRaise: 1.2, rOut: 1.2, rElbow: 1.4, lRaise: 1.2, lOut: 1.2, lElbow: 1.4, rHipOut: .5, lHipOut: .5, rKnee: .9, lKnee: .9 }),
  strike: bp({ drop: -.3, lean: .3, rRaise: 1.2, rOut: 1.3, rElbow: 1.2, lRaise: 1.2, lOut: 1.3, lElbow: 1.2, rHipOut: .7, lHipOut: .2, rKnee: .7, lKnee: 1.1 }),
  follow: bp({ drop: -.3, lean: .3, rRaise: 1.2, rOut: 1.25, rElbow: 1.3, lRaise: 1.2, lOut: 1.25, lElbow: 1.3, rHipOut: .6, lHipOut: .35, rKnee: .8, lKnee: 1.0 }),
});
B.stance = atk({
  peak: bp({ drop: -.25, lean: .1, spineTwist: .5, look: -.3, rRaise: .6, rOut: .9, rElbow: 1.6, wPitch: 1.2, wRoll: 1.5, lRaise: 1.4, lOut: -.2, lElbow: .4, rHip: -.3, lHip: .6, rKnee: .7, lKnee: .7 }),
  strike: bp({ drop: -.25, lean: .1, spineTwist: .55, look: -.3, rRaise: .62, rOut: .92, rElbow: 1.62, wPitch: 1.2, wRoll: 1.5, lRaise: 1.42, lOut: -.2, lElbow: .42, rHip: -.3, lHip: .6, rKnee: .7, lKnee: .7 }),
  coil: bp({ drop: -.26, lean: .1, spineTwist: .52, look: -.3, rRaise: .61, rOut: .91, rElbow: 1.61, wPitch: 1.2, wRoll: 1.5, lRaise: 1.41, lOut: -.2, lElbow: .41, rHip: -.3, lHip: .6, rKnee: .72, lKnee: .72 }),
});
B.wipe = atk({
  peak: bp({ drop: .02, lean: -.4, nod: -.5, rRaise: 2.7, rOut: .9, rElbow: .2, lRaise: 2.7, lOut: .9, lElbow: .2, rKnee: .1, lKnee: .1 }),
  strike: bp({ drop: .04, lean: -.45, nod: -.55, rRaise: 2.9, rOut: 1.0, rElbow: .1, lRaise: 2.9, lOut: 1.0, lElbow: .1 }),
});
B.roar = atk({
  peak: bp({ drop: -.12, lean: -.15, nod: -.2, rRaise: .6, rOut: .9, rElbow: .9, lRaise: .6, lOut: .9, lElbow: .9, rKnee: .45, lKnee: .45 }),
  strike: bp({ drop: -.05, lean: -.5, chestLean: -.2, nod: -.8, rRaise: 1.1, rOut: 1.6, rElbow: .5, lRaise: 1.1, lOut: 1.6, lElbow: .5, rKnee: .3, lKnee: .3 }),
});
export const BOSS = B;

// the boss's own reactions
const B_PARRIED = pose({ drop: -.04, lean: -.6, chestLean: -.3, nod: -.55, look: .2, rRaise: 2.3, rOut: 1.1, rElbow: .5, wPitch: .4, lRaise: 1.6, lOut: 1.2, lElbow: .5,
  rHip: .35, lHip: -.4, rKnee: .5, lKnee: .3 });
const B_SLUMP = pose({ drop: -.2, lean: .35, nod: .55, look: -.2, rRaise: .1, rOut: .5, rElbow: .3, wPitch: .5, lRaise: .05, lOut: .45, lElbow: .3,
  rHip: .3, lHip: -.1, rKnee: .75, lKnee: .55 });
const B_RECOIL = pose({ drop: -.08, lean: -.4, chestLean: -.2, nod: -.4, rRaise: .6, rOut: .9, rElbow: .5, lRaise: .5, lOut: .9, lElbow: .5, rHip: .25, lHip: -.3, rKnee: .5, lKnee: .3 });
const B_IMPALED = pose({ drop: -.12, lean: .55, chestLean: .3, nod: .6, rRaise: .3, rOut: .4, rElbow: .6, wPitch: .5, lRaise: .7, lOut: .1, lElbow: 1.2, rHip: .2, lHip: .1, rKnee: .5, lKnee: .45 });

export const BOSS_ACTS = {
  staggerPoise: [[0, FROM], [.07, B_RECOIL, 'expoOut'], [.24, ACT.kneel, 'inOut'], [.82, derive(ACT.kneel, { nod: .6, lean: .5 }), 'linear'], [1, BASE, 'inOut']],
  staggerParried: [[0, FROM], [.05, B_PARRIED, 'expoOut'], [.22, B_SLUMP, 'inOut'], [.84, derive(B_SLUMP, { nod: .7, drop: -.25 }), 'linear'], [1, BASE, 'inOut']],
  riposted: [[0, FROM], [.12, B_IMPALED, 'expoOut'], [.4, derive(B_IMPALED, { nod: .75, lean: .65 }), 'linear'], [.56, ACT.downFlat, 'inCubic'], [.62, derive(ACT.downFlat, { drop: .26 }), 'out'], [.7, ACT.downFlat, 'in'], [1, ACT.downFlat, 'linear']],
  getup: [[0, FROM], [.5, ACT.kneel, 'inOut'], [1, BASE, 'inOut']],
  transition: [[0, FROM], [.3, B.roar.peak, 'inOut'], [.42, B.roar.strike, 'expoOut'], [.75, B.roar.strike, 'linear'], [1, BASE, 'inOut']],
  drink: [[0, FROM], [.3, DRINK, 'inOut'], [.75, DRINK_GULP, 'inOut'], [1, BASE, 'inOut']],
  dead: [[0, FROM], [.18, B_RECOIL, 'expoOut'], [.45, ACT.kneel, 'inOut'], [.7, derive(ACT.kneel, { lean: .7, nod: .7 }), 'inOut'], [1, ACT.downFace, 'inCubic']],
};

// ── procedural locomotion ───────────────────────────────────────────────────
/**
 * Writes a locomotion pose into `out`, on top of `base`.
 *   s.phase   stride phase (radians; one cycle = two steps), advanced by distance
 *   s.fwd/side  velocity in the character's frame, m/s (+fwd forward, +side its left)
 *   s.run     run speed (m/s) at which the cycle is fully open
 *   s.sprint  0..1
 *   s.guard   0..1 — combat stance: arms stay up, steps stay short
 * Knees bend on each leg's swing half, never backwards; the body bobs twice a
 * stride, rolls its hips, counter-twists its shoulders and leans into speed.
 */
export function locomotion(out, base, s) {
  out.set(base);
  const speed = Math.hypot(s.fwd, s.side);
  const k = Math.min(1, speed / (s.run ?? 4.4));
  const sprint = s.sprint ?? 0;
  const ph = s.phase, sn = Math.sin(ph), cs = Math.cos(ph);
  const lift = (v) => (v > 0 ? v : 0);
  const fw = speed > .01 ? s.fwd / speed : 0, sw = speed > .01 ? s.side / speed : 0;

  // legs: forward/back motion swings the hips; sideways motion steps out
  const amp = .5 * k + .28 * sprint;
  out[I.rHip] += sn * amp * fw;
  out[I.lHip] -= sn * amp * fw;
  out[I.rHipOut] += (sn * .3 * -sw) * k;
  out[I.lHipOut] -= (sn * .3 * -sw) * k;
  out[I.rKnee] += (.1 + lift(-cs) * (1.0 + .5 * sprint)) * k;
  out[I.lKnee] += (.1 + lift(cs) * (1.0 + .5 * sprint)) * k;
  out[I.rAnkle] += (lift(-cs) * .35 - sn * .22 * fw) * k;
  out[I.lAnkle] += (lift(cs) * .35 + sn * .22 * fw) * k;

  // the body bobs twice a stride, rolls its hips, leans into speed
  out[I.drop] += (-Math.abs(cs) * .055 - .03) * k - .04 * sprint;
  out[I.pelvisTwist] += sn * .13 * k * fw;
  out[I.tilt] += cs * .05 * k - sw * .09 * k;
  out[I.lean] += (.08 * fw) * k + .28 * sprint;
  out[I.spineTwist] -= sn * .12 * k * fw;
  out[I.chestTwist] -= sn * .06 * k * fw;
  out[I.nod] += -.06 * sprint + Math.abs(cs) * .03 * k;

  if (!s.armsBusy) {
    const arm = (.42 * (1 - (s.guard ?? 0) * .6)) * k + .5 * sprint;
    out[I.lRaise] += -sn * arm * fw;
    out[I.lElbow] += .15 * k + .6 * sprint;
    out[I.rRaise] += sn * arm * .5 * fw;       // the sword arm swings less — it's carrying something
    out[I.rElbow] += .1 * k + .25 * sprint;
    // sprinting drags the blade back and low, the way souls characters run
    out[I.rRaise] -= .55 * sprint; out[I.rOut] += .15 * sprint; out[I.wPitch] -= .35 * sprint;
  }

  // standing: breath and a slow shift of weight between the feet
  const idle = 1 - k;
  const br = Math.sin(s.t * 1.7), sway = Math.sin(s.t * .45);
  out[I.lean] += br * .022 * idle;
  out[I.chestLean] += br * .025 * idle;
  out[I.nod] -= br * .02 * idle;
  out[I.rRaise] += br * .02 * idle; out[I.lRaise] += br * .02 * idle;
  out[I.tilt] += sway * .03 * idle;
  out[I.rKnee] += (sway > 0 ? sway * .06 : 0) * idle;
  out[I.lKnee] += (sway < 0 ? -sway * .06 : 0) * idle;
  return out;
}
