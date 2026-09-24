// Pure math for the simulation. No three.js, no DOM — this layer must run in
// Node so fights can be simulated thousands of times for balancing.
//
// World convention: ground plane is (x, z), y is up. A yaw of θ faces the
// direction (sin θ, cos θ), so yaw 0 looks down +z.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => clamp(v, 0, 1);
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

export function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function turnToward(current, target, maxStep) {
  const d = angleDiff(current, target);
  return current + clamp(d, -maxStep, maxStep);
}

export const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

/** Frame-rate independent exponential approach. */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Is point (px,pz) within an arc of `halfAngle` around yaw, reach `range`? */
export function inArc(ox, oz, yaw, range, halfAngle, px, pz, targetRadius = 0) {
  const dx = px - ox, dz = pz - oz;
  const d = Math.hypot(dx, dz);
  if (d > range + targetRadius) return false;
  if (d < targetRadius + 0.2) return true;          // standing inside it
  const a = Math.abs(angleDiff(yaw, Math.atan2(dx, dz)));
  // a wide body is easier to clip with the edge of a swing
  const slack = Math.atan2(targetRadius, Math.max(d, 0.001));
  return a <= halfAngle + slack;
}

// ── seeded RNG (mulberry32) so simulated fights are reproducible ─────────────
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gauss: (mu = 0, sigma = 1) => {
      const u = Math.max(1e-9, next()), v = next();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    },
    weighted(items) {           // items: [{w, v}]
      let total = 0;
      for (const it of items) total += it.w;
      let r = next() * total;
      for (const it of items) { r -= it.w; if (r <= 0) return it.v; }
      return items[items.length - 1]?.v;
    },
  };
}
