import { pose, derive, mirror, lerpPose, ease, I } from './pose.js';

// ─────────────────────────────────────────────────────────────────────────────
// Clips. An attack clip is three key poses — rest → peak (end of wind-up) →
// strike (end of the active frames) — played against the SIM's own timing, so
// the blade arrives exactly when the hit resolves. Locomotion is procedural.
// ─────────────────────────────────────────────────────────────────────────────

// ── stances ─────────────────────────────────────────────────────────────────
export const REST = pose({
  drop: -.02, lean: .06, nod: .04,
  rRaise: .18, rOut: .14, rElbow: .45, wPitch: .55, rWrist: .1,
  lRaise: .08, lOut: .16, lElbow: .3,
  rHip: .05, lHip: .05, rKnee: .1, lKnee: .1, rAnkle: -.05, lAnkle: -.05,
});

export const READY = pose({
  drop: -.07, lean: .14, spineTwist: .18, chestTwist: .08, nod: -.02, look: -.2,
  rRaise: .42, rOut: .2, rElbow: 1.05, rWrist: -.1, wPitch: 1.25, wRoll: 0,
  lRaise: .35, lOut: .35, lElbow: .9,
  rHip: -.12, lHip: .32, rKnee: .38, lKnee: .32, rHipOut: .06, lHipOut: .1, rAnkle: -.1, lAnkle: -.15,
});

export const GUARD = derive(READY, {
  lean: .2, spineTwist: -.12, chestTwist: -.1, look: .1,
  rRaise: 1.25, rOut: -.1, rElbow: 1.55, rWrist: .2, wPitch: .35, wRoll: 1.5,
  lRaise: 1.1, lOut: .1, lElbow: 1.7,
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

// ── player attacks ──────────────────────────────────────────────────────────
export const ATTACKS = {
  slashR: {
    peak:   pose({ drop: -.08, lean: .05, spineTwist: .85, chestTwist: .3, look: -.6, rRaise: .95, rOut: 1.25, rElbow: 1.45, rWrist: -.2, wPitch: 1.25, wRoll: 1.5, lRaise: .4, lOut: .5, lElbow: 1.0, rHip: -.2, lHip: .35, rKnee: .45, lKnee: .3 }),
    strike: pose({ drop: -.12, lean: .22, spineTwist: -.8, chestTwist: -.35, look: .35, rRaise: 1.25, rOut: -.45, rElbow: .15, rWrist: .2, wPitch: 1.3, wRoll: 1.5, lRaise: .1, lOut: .7, lElbow: .5, rHip: -.3, lHip: .55, rKnee: .35, lKnee: .5 }),
  },
  slashL: {
    peak:   pose({ drop: -.08, lean: .08, spineTwist: -.75, chestTwist: -.3, look: .4, rRaise: 1.35, rOut: -.55, rElbow: 1.7, rWrist: .1, wPitch: 1.1, wRoll: -1.5, lRaise: .3, lOut: .8, lElbow: .6, rHip: .2, lHip: .1, rKnee: .4, lKnee: .4 }),
    strike: pose({ drop: -.12, lean: .2, spineTwist: .75, chestTwist: .35, look: -.4, rRaise: 1.0, rOut: 1.2, rElbow: .12, rWrist: -.1, wPitch: 1.3, wRoll: -1.5, lRaise: .3, lOut: .3, lElbow: 1.0, rHip: -.25, lHip: .45, rKnee: .4, lKnee: .45 }),
  },
  thrust: {
    peak:   pose({ drop: -.1, lean: -.05, spineTwist: .6, chestTwist: .25, look: -.5, rRaise: -.45, rOut: .3, rElbow: 1.8, rWrist: -.2, wPitch: 1.5, lRaise: .7, lOut: .4, lElbow: 1.2, rHip: -.35, lHip: .35, rKnee: .5, lKnee: .35 }),
    strike: pose({ drop: -.16, lean: .38, spineTwist: -.25, chestTwist: -.1, look: .15, rRaise: 1.5, rOut: .08, rElbow: .05, rWrist: 0, wPitch: 1.55, lRaise: -.4, lOut: .6, lElbow: .3, rHip: -.45, lHip: .75, rKnee: .25, lKnee: .7 }),
  },
  lungeThrust: {
    peak:   pose({ drop: -.14, lean: .0, spineTwist: .7, chestTwist: .25, look: -.6, rRaise: -.5, rOut: .35, rElbow: 1.9, rWrist: -.2, wPitch: 1.5, lRaise: .9, lOut: .2, lElbow: 1.1, rHip: -.5, lHip: .5, rKnee: .7, lKnee: .5 }),
    strike: pose({ drop: -.3, lean: .55, spineTwist: -.3, chestTwist: -.1, look: .2, rRaise: 1.55, rOut: .05, rElbow: .02, wPitch: 1.57, lRaise: -.7, lOut: .5, lElbow: .2, rHip: -.75, lHip: 1.15, rKnee: .2, lKnee: 1.1 }),
  },
  overhead: {
    peak:   pose({ drop: -.04, lean: -.28, spineTwist: .25, chestLean: -.1, nod: -.25, rRaise: 2.7, rOut: .25, rElbow: 1.35, rWrist: .1, wPitch: 0.9, lRaise: 1.6, lOut: .2, lElbow: 1.2, rHip: -.1, lHip: .3, rKnee: .25, lKnee: .3 }),
    strike: pose({ drop: -.22, lean: .55, spineTwist: -.05, chestLean: .15, nod: .2, rRaise: .55, rOut: .05, rElbow: .1, rWrist: .25, wPitch: 1.35, lRaise: .4, lOut: .3, lElbow: .7, rHip: -.3, lHip: .75, rKnee: .5, lKnee: .8 }),
  },
  runSlash: null,   // filled below from overhead
  hammerR: null, hammerL: null, slam: null,
  spearPoke: {
    peak:   pose({ drop: -.1, lean: .02, spineTwist: .55, look: -.45, rRaise: -.3, rOut: .2, rElbow: 1.7, wPitch: 1.5, lRaise: .85, lOut: -.3, lElbow: 1.0, rHip: -.3, lHip: .35, rKnee: .5, lKnee: .35 }),
    strike: pose({ drop: -.15, lean: .32, spineTwist: -.1, look: .1, rRaise: 1.35, rOut: .05, rElbow: .1, wPitch: 1.55, lRaise: 1.2, lOut: -.35, lElbow: .2, rHip: -.45, lHip: .7, rKnee: .3, lKnee: .6 }),
  },
  spearSweep: null,
  reapR: null, reapL: null, spin: null,
};

// derived clips — variations on a theme, like real animation sets
ATTACKS.runSlash = { peak: derive(ATTACKS.overhead.peak, { lean: -.05, drop: .02 }), strike: derive(ATTACKS.overhead.strike, { lean: .7, drop: -.3 }) };
ATTACKS.hammerR = {
  peak: derive(ATTACKS.slashR.peak, { ...TWO, lRaise: .9, lOut: -.1, spineTwist: 1.0, rRaise: 1.2 }),
  strike: derive(ATTACKS.slashR.strike, { lRaise: 1.0, lOut: -.6, lElbow: .5, spineTwist: -.95 }),
};
ATTACKS.hammerL = {
  peak: derive(ATTACKS.slashL.peak, { ...TWO, lRaise: 1.1, lOut: .2, lElbow: 1.5, spineTwist: -1.0, wPitch: 1.1 }),
  strike: derive(ATTACKS.slashL.strike, { lRaise: .9, lOut: .6, lElbow: .6, spineTwist: .95, wPitch: 1.3 }),
};
ATTACKS.slam = {
  peak: derive(ATTACKS.overhead.peak, { ...TWO, lRaise: 2.5, lOut: -.2, lElbow: 1.3, lean: -.35, rRaise: 2.8 }),
  strike: derive(ATTACKS.overhead.strike, { lRaise: .6, lOut: -.3, lElbow: .2, lean: .75, drop: -.34, rKnee: .7, lKnee: .9 }),
};
ATTACKS.spearSweep = {
  peak: derive(ATTACKS.slashR.peak, { lRaise: .8, lOut: -.2, lElbow: 1.2, rRaise: .6, wPitch: 1.2 }),
  strike: derive(ATTACKS.slashR.strike, { lRaise: .8, lOut: .3, lElbow: .8, rRaise: .9, wPitch: 1.2 }),
};
ATTACKS.reapR = {
  peak: derive(ATTACKS.slashR.peak, { lRaise: 1.1, lOut: .1, lElbow: 1.2, rRaise: 1.6, spineTwist: 1.1, wPitch: 1.0 }),
  strike: derive(ATTACKS.slashR.strike, { lRaise: .6, lOut: .6, lElbow: .5, rRaise: .5, spineTwist: -1.0, lean: .4, drop: -.2 }),
};
ATTACKS.reapL = {
  peak: derive(ATTACKS.slashL.peak, { lRaise: 1.0, lOut: .5, lElbow: .9, rRaise: 1.5, spineTwist: -1.0, wPitch: 1.0 }),
  strike: derive(ATTACKS.slashL.strike, { lRaise: .5, lOut: .2, lElbow: 1.0, rRaise: .5, spineTwist: 1.0, lean: .4, drop: -.2 }),
};
ATTACKS.spin = { peak: ATTACKS.reapR.peak, strike: ATTACKS.reapR.strike, spin: true };

// ── actions with their own shapes ───────────────────────────────────────────
export const ACT = {
  parryPeak: pose({ drop: -.08, lean: .15, spineTwist: .6, look: -.3, rRaise: .5, rOut: 1.35, rElbow: 1.2, wPitch: .9, wRoll: 1.3, lRaise: .5, lOut: .6, lElbow: 1.1, rHip: -.15, lHip: .35, rKnee: .4, lKnee: .35 }),
  parryFlick: pose({ drop: -.1, lean: .2, spineTwist: -.6, look: .3, rRaise: 1.45, rOut: -.3, rElbow: .6, wPitch: 1.1, wRoll: 1.3, lRaise: .2, lOut: .9, lElbow: .5, rHip: -.2, lHip: .4, rKnee: .4, lKnee: .4 }),
  drink: pose({ drop: -.04, lean: -.05, nod: -.45, rRaise: .3, rOut: .25, rElbow: .6, wPitch: .6, lRaise: 1.75, lOut: .35, lElbow: 2.35, lWrist: .6, rHip: .05, lHip: .1, rKnee: .15, lKnee: .15 }),
  hurt: pose({ drop: -.06, lean: -.4, chestLean: -.2, nod: -.35, look: .2, rRaise: -.2, rOut: .6, rElbow: .6, lRaise: -.1, lOut: .7, lElbow: .5, rHip: .15, lHip: -.2, rKnee: .35, lKnee: .2 }),
  guardBroken: pose({ drop: -.1, lean: -.55, chestLean: -.2, nod: -.4, rRaise: 1.2, rOut: 1.3, rElbow: .3, wPitch: .6, lRaise: 1.0, lOut: 1.2, lElbow: .3, rHip: .2, lHip: -.3, rKnee: .5, lKnee: .3 }),
  downFlat: pose({ drop: .2, pitch: -1.45, nod: .3, rRaise: 1.6, rOut: .6, rElbow: .3, lRaise: 1.4, lOut: .7, lElbow: .4, rHip: .3, lHip: .6, rKnee: .5, lKnee: .9 }),
  kneel: pose({ drop: -.35, lean: .4, nod: .45, rRaise: .1, rOut: .3, rElbow: .4, wPitch: .8, lRaise: .4, lOut: .2, lElbow: .8, rHip: 1.35, lHip: -.25, rKnee: 1.55, lKnee: 1.7, rAnkle: -.6 }),
  dead: pose({ drop: .18, pitch: -1.52, roll: .25, nod: .5, look: .5, rRaise: 1.4, rOut: 1.0, rElbow: .2, lRaise: .9, lOut: 1.2, lElbow: .5, rHip: .2, lHip: .5, rKnee: .4, lKnee: .8 }),
  tuck: pose({ drop: -.45, lean: .9, chestLean: .3, nod: .6, rRaise: 1.1, rOut: .3, rElbow: 2.1, lRaise: 1.1, lOut: .3, lElbow: 2.1, rHip: 1.9, lHip: 1.9, rKnee: 2.2, lKnee: 2.2 }),
  hopBack: pose({ drop: .05, lean: -.3, nod: -.1, rRaise: .6, rOut: .4, rElbow: 1.1, lRaise: .5, lOut: .6, lElbow: .9, rHip: .5, lHip: .7, rKnee: 1.0, lKnee: 1.1 }),
  ripostePeak: pose({ drop: -.12, lean: .0, spineTwist: .6, look: -.3, rRaise: -.45, rOut: .35, rElbow: 1.85, wPitch: 1.55, lRaise: 1.0, lOut: .3, lElbow: 1.3, rHip: -.3, lHip: .5, rKnee: .5, lKnee: .5 }),
  riposteStab: pose({ drop: -.3, lean: .6, spineTwist: -.25, nod: .2, rRaise: 1.45, rOut: .05, rElbow: .05, wPitch: 1.57, lRaise: .8, lOut: .2, lElbow: .6, rHip: -.6, lHip: 1.0, rKnee: .6, lKnee: 1.2 }),
};

// ── boss tells (humanoid bosses). Same three-key structure. ─────────────────
const B = {};
B.swipeR = ATTACKS.slashR;
B.swipeL = ATTACKS.slashL;
B.overhead = ATTACKS.slam;
B.thrust = ATTACKS.lungeThrust;
B.jab = { peak: derive(ATTACKS.thrust.peak, { rElbow: 1.7, lean: .05 }), strike: derive(ATTACKS.thrust.strike, { lean: .3, drop: -.1 }) };
B.sweep = {
  peak: pose({ drop: -.2, lean: .35, spineTwist: 1.2, chestTwist: .3, look: -.7, rRaise: .5, rOut: 1.2, rElbow: .6, wPitch: .6, wRoll: 1.5, lRaise: .5, lOut: .5, lElbow: 1.0, rHip: .3, lHip: .5, rKnee: .9, lKnee: .8 }),
  strike: pose({ drop: -.3, lean: .45, spineTwist: -1.3, chestTwist: -.3, look: .6, rRaise: .6, rOut: -.6, rElbow: .2, wPitch: .6, wRoll: 1.5, lRaise: .2, lOut: 1.1, lElbow: .3, rHip: .45, lHip: .45, rKnee: 1.0, lKnee: .9 }),
};
B.spin = { peak: B.sweep.peak, strike: B.sweep.strike, spin: true };
B.stomp = {
  peak: pose({ drop: .05, lean: -.2, nod: -.3, rRaise: 2.2, rOut: .7, rElbow: .8, lRaise: 2.2, lOut: .7, lElbow: .8, rHip: 1.2, rKnee: 1.2, lKnee: .1, rAnkle: .3 }),
  strike: pose({ drop: -.32, lean: .45, nod: .35, rRaise: .3, rOut: .9, rElbow: .4, lRaise: .3, lOut: .9, lElbow: .4, rHip: .5, lHip: .3, rKnee: .9, lKnee: .8 }),
};
B.leap = {
  peak: pose({ drop: -.38, lean: .55, nod: -.2, rRaise: -.6, rOut: .3, rElbow: .6, lRaise: -.6, lOut: .3, lElbow: .6, rHip: 1.3, lHip: 1.3, rKnee: 1.9, lKnee: 1.9, rAnkle: -.4, lAnkle: -.4 }),
  strike: pose({ drop: -.35, lean: .7, nod: .3, rRaise: .5, rOut: .2, rElbow: .2, wPitch: .3, lRaise: .4, lOut: .6, lElbow: .4, rHip: .9, lHip: .2, rKnee: 1.4, lKnee: .9 }),
  air: pose({ drop: 0, lean: -.1, rRaise: 2.9, rOut: .2, rElbow: .9, lRaise: 2.4, lOut: .4, lElbow: .8, rHip: .7, lHip: .2, rKnee: 1.2, lKnee: .6 }),
};
B.backflip = { peak: ACT.tuck, strike: ACT.hopBack };
B.charge = {
  peak: pose({ drop: -.25, lean: .7, nod: -.3, rRaise: -.3, rOut: .4, rElbow: .8, lRaise: -.3, lOut: .4, lElbow: .8, rHip: .7, lHip: -.2, rKnee: 1.0, lKnee: .5 }),
  strike: pose({ drop: -.2, lean: .85, nod: -.4, rRaise: .9, rOut: .5, rElbow: .6, lRaise: .9, lOut: .5, lElbow: .6, rHip: .9, lHip: -.4, rKnee: .7, lKnee: .8 }),
};
B.throw = {
  peak: pose({ drop: -.05, lean: -.3, spineTwist: .9, look: -.4, rRaise: 2.3, rOut: .6, rElbow: 1.8, lRaise: 1.0, lOut: .8, lElbow: .5, rHip: -.3, lHip: .4, rKnee: .4, lKnee: .2 }),
  strike: pose({ drop: -.15, lean: .45, spineTwist: -.7, look: .3, rRaise: 1.1, rOut: -.2, rElbow: .1, lRaise: -.3, lOut: .6, lElbow: .4, rHip: -.4, lHip: .7, rKnee: .3, lKnee: .6 }),
};
B.cast = {
  peak: pose({ drop: -.05, lean: -.2, nod: -.25, rRaise: 1.9, rOut: .9, rElbow: .7, lRaise: 1.9, lOut: .9, lElbow: .7, rKnee: .2, lKnee: .2 }),
  strike: pose({ drop: -.12, lean: .35, nod: .1, rRaise: 1.45, rOut: .1, rElbow: .1, lRaise: 1.45, lOut: .1, lElbow: .1, rHip: -.2, lHip: .4, rKnee: .3, lKnee: .4 }),
};
B.type = {
  peak: pose({ drop: -.05, lean: .35, nod: .45, rRaise: .9, rOut: .1, rElbow: 1.4, rWrist: .5, lRaise: .9, lOut: .1, lElbow: 1.4, lWrist: .5, rKnee: .15, lKnee: .15 }),
  strike: pose({ drop: -.1, lean: .1, nod: -.1, rRaise: 1.5, rOut: .3, rElbow: .2, lRaise: .4, lOut: .5, lElbow: .8, rHip: -.2, lHip: .3, rKnee: .3, lKnee: .3 }),
};
B.flash = {
  peak: pose({ drop: -.05, lean: -.15, nod: -.2, rRaise: 2.0, rOut: .2, rElbow: .4, lRaise: 1.2, lOut: .6, lElbow: .6, rKnee: .2, lKnee: .2 }),
  strike: pose({ drop: -.05, lean: -.3, nod: -.35, rRaise: 2.6, rOut: .3, rElbow: .1, lRaise: 1.8, lOut: 1.0, lElbow: .2, rKnee: .2, lKnee: .2 }),
};
B.pincer = {
  peak: pose({ drop: -.15, lean: .25, spineTwist: .6, rRaise: 1.1, rOut: 1.1, rElbow: 1.3, lRaise: .6, lOut: .8, lElbow: 1.0, rKnee: .5, lKnee: .5 }),
  strike: pose({ drop: -.2, lean: .45, spineTwist: -.4, rRaise: 1.5, rOut: -.2, rElbow: .3, lRaise: .7, lOut: .6, lElbow: .9, rKnee: .55, lKnee: .55 }),
};
B.pincerL = { peak: mirror(B.pincer.peak), strike: mirror(B.pincer.strike) };
B.scuttle = { peak: pose({ drop: -.3, lean: .3, rRaise: 1.2, rOut: 1.2, rElbow: 1.4, lRaise: 1.2, lOut: 1.2, lElbow: 1.4, rHipOut: .5, lHipOut: .5, rKnee: .9, lKnee: .9 }),
  strike: pose({ drop: -.3, lean: .3, rRaise: 1.2, rOut: 1.3, rElbow: 1.2, lRaise: 1.2, lOut: 1.3, lElbow: 1.2, rHipOut: .7, lHipOut: .2, rKnee: .7, lKnee: 1.1 }) };
B.stance = {
  peak: pose({ drop: -.25, lean: .1, spineTwist: .5, look: -.3, rRaise: .6, rOut: .9, rElbow: 1.6, wPitch: 1.2, wRoll: 1.5, lRaise: 1.4, lOut: -.2, lElbow: .4, rHip: -.3, lHip: .6, rKnee: .7, lKnee: .7 }),
  strike: pose({ drop: -.25, lean: .1, spineTwist: .55, look: -.3, rRaise: .62, rOut: .92, rElbow: 1.62, wPitch: 1.2, wRoll: 1.5, lRaise: 1.42, lOut: -.2, lElbow: .42, rHip: -.3, lHip: .6, rKnee: .7, lKnee: .7 }),
};
B.wipe = {
  peak: pose({ drop: .02, lean: -.4, nod: -.5, rRaise: 2.7, rOut: .9, rElbow: .2, lRaise: 2.7, lOut: .9, lElbow: .2, rKnee: .1, lKnee: .1 }),
  strike: pose({ drop: .04, lean: -.45, nod: -.55, rRaise: 2.9, rOut: 1.0, rElbow: .1, lRaise: 2.9, lOut: 1.0, lElbow: .1 }),
};
B.roar = {
  peak: pose({ drop: -.1, lean: -.15, nod: -.2, rRaise: .6, rOut: .9, rElbow: .9, lRaise: .6, lOut: .9, lElbow: .9, rKnee: .4, lKnee: .4 }),
  strike: pose({ drop: -.05, lean: -.5, chestLean: -.2, nod: -.8, rRaise: 1.1, rOut: 1.6, rElbow: .5, lRaise: 1.1, lOut: 1.6, lElbow: .5, rKnee: .3, lKnee: .3 }),
};
export const BOSS = B;

// ── procedural locomotion ───────────────────────────────────────────────────
/**
 * Writes a locomotion pose. fwd/side are velocity in the character's frame
 * (m/s, +fwd forward, +side to its right); phase advances with distance.
 * Knees bend on the recovery half of each stride, never backwards.
 */
export function locomotion(out, base, phase, fwd, side, run, t, opts = {}) {
  out.set(base);
  const speed = Math.hypot(fwd, side);
  const k = Math.min(1, speed / (opts.runSpeed ?? 4.4));
  const sprint = Math.max(0, Math.min(1, (speed - 4.8) / 1.5));
  const s = Math.sin(phase), c = Math.cos(phase);
  const lift = (v) => Math.max(0, v);

  // mostly forward/back motion swings the hips; sideways motion steps out
  const fw = speed > 0.01 ? fwd / speed : 0, sw = speed > 0.01 ? side / speed : 0;
  const amp = 0.55 * k + 0.25 * sprint;
  out[I.rHip] += s * amp * fw;
  out[I.lHip] -= s * amp * fw;
  out[I.rHipOut] += s * 0.28 * k * -sw;
  out[I.lHipOut] -= s * 0.28 * k * -sw;
  out[I.rKnee] += (0.12 + lift(-c) * 1.05) * k;
  out[I.lKnee] += (0.12 + lift(c) * 1.05) * k;
  out[I.rAnkle] += (lift(-c) * 0.35 - s * 0.2 * fw) * k;
  out[I.lAnkle] += (lift(c) * 0.35 + s * 0.2 * fw) * k;

  // the body bobs twice a stride and leans into speed
  out[I.drop] += -Math.abs(c) * 0.05 * k - 0.03 * k;
  out[I.pelvisTwist] += s * 0.12 * k * fw;
  out[I.lean] += 0.1 * k * fw + 0.22 * sprint;
  out[I.tilt] += -sw * 0.08 * k;
  out[I.spineTwist] -= s * 0.1 * k * fw;
  out[I.nod] += -0.05 * sprint;

  if (!opts.armsBusy) {
    const arm = 0.45 * k + 0.4 * sprint;
    out[I.lRaise] += -s * arm * fw;
    out[I.lElbow] += 0.2 * k + 0.5 * sprint;
    out[I.rRaise] += s * arm * 0.55 * fw;       // the sword arm swings less — it's carrying something
    out[I.rElbow] += 0.15 * k + 0.3 * sprint;
  }

  // breathing when still
  const idle = 1 - k;
  out[I.lean] += Math.sin(t * 1.7) * 0.025 * idle;
  out[I.chestLean] += Math.sin(t * 1.7) * 0.02 * idle;
  out[I.nod] += -Math.sin(t * 1.7) * 0.02 * idle;
  return out;
}

/** Sample a three-key clip at a sim phase. */
export function sampleClip(out, clip, phase, k, rest) {
  if (phase === 'windup') lerpPose(out, rest, clip.peak, ease.inOut(k));
  else if (phase === 'hold') out.set(clip.peak);
  else if (phase === 'active') lerpPose(out, clip.peak, clip.strike, ease.outStrong(k));
  else lerpPose(out, clip.strike, rest, ease.inOut(k));
  return out;
}
