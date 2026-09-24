// Small pose helpers. Everything is written as "set this joint to this angle",
// so swapping in real clip playback later means deleting calls, not untangling.

export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const ease = (k) => k * k * (3 - 2 * k);              // smoothstep
export const arc  = (k) => Math.sin(Math.max(0, Math.min(1, k)) * Math.PI);
export const clamp01 = (k) => Math.max(0, Math.min(1, k));

/** Two-bone arm: shoulder pitch/yaw/roll, elbow bend, wrist pitch. */
export function poseArm(arm, p, rate, dt) {
  arm.upper.rotation.x = damp(arm.upper.rotation.x, p.sx ?? 0, rate, dt);
  arm.upper.rotation.z = damp(arm.upper.rotation.z, p.sz ?? 0, rate, dt);
  arm.upper.rotation.y = damp(arm.upper.rotation.y, p.sy ?? 0, rate, dt);
  arm.fore.rotation.x  = damp(arm.fore.rotation.x,  p.elbow ?? 0, rate, dt);
  arm.hand.rotation.x  = damp(arm.hand.rotation.x,  p.wrist ?? 0, rate, dt);
  arm.hand.rotation.z  = damp(arm.hand.rotation.z,  p.wristZ ?? 0, rate, dt);
}

/** Two-bone leg: hip pitch/roll, knee bend, ankle pitch. */
export function poseLeg(leg, p, rate, dt) {
  leg.thigh.rotation.x = damp(leg.thigh.rotation.x, p.hip ?? 0, rate, dt);
  leg.thigh.rotation.z = damp(leg.thigh.rotation.z, p.hipZ ?? 0, rate, dt);
  leg.shin.rotation.x  = damp(leg.shin.rotation.x,  p.knee ?? 0, rate, dt);
  leg.ankle.rotation.x = damp(leg.ankle.rotation.x, p.ankle ?? 0, rate, dt);
}

/**
 * Grounded walk/run cycle. `phase` advances with distance travelled, `stride`
 * is 0..1 speed blend. Knees only bend on the recovery half, which is what
 * separates a walk from a pair of swinging sticks.
 */
export function walkCycle(rig, phase, stride, dt, rate = 22) {
  const sw = Math.sin(phase);
  const swB = Math.sin(phase + Math.PI);
  const lift = (s) => Math.max(0, -s);          // 1 while that leg is swinging through

  poseLeg(rig.legL, {
    hip: sw * .78 * stride,
    knee: -(.15 + lift(sw) * 1.25) * stride,
    ankle: (-sw * .3 + lift(sw) * .35) * stride,
  }, rate, dt);
  poseLeg(rig.legR, {
    hip: swB * .78 * stride,
    knee: -(.15 + lift(swB) * 1.25) * stride,
    ankle: (-swB * .3 + lift(swB) * .35) * stride,
  }, rate, dt);

  // counter-swing, with the elbow trailing the shoulder
  return {
    armSwing: -sw * .62 * stride,
    armSwingB: -swB * .62 * stride,
    elbow: -(.22 + stride * .35),
    bob: Math.abs(Math.sin(phase)) * .045 * stride,
    roll: Math.sin(phase) * .05 * stride,
    lean: stride * .13,
  };
}
