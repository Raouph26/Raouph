import { N, CH } from './pose.js';

// ─────────────────────────────────────────────────────────────────────────────
// The spring layer. Poses say where each joint SHOULD be; springs decide how
// it gets there. Every channel chases its target like a damped spring, so:
//   • transitions never pop — a combo cut short flows into the next swing
//   • heads and spines lag and overshoot a touch — weight, follow-through
//   • a hit is an impulse (a kick of velocity) and the body rings and settles
// Legs and root rotation are near-rigid so feet don't swim and spins don't lag.
// ─────────────────────────────────────────────────────────────────────────────

// ω (rad/s, stiffness) and ζ (damping ratio: <1 overshoots, 1 doesn't)
export const PROFILES = {
  frog: {
    pass:   { pass: true },                       // pitch / roll / twist: exact
    root:   { w: 42, z: .8 },                     // drop, pelvis
    legs:   { w: 64, z: 1 },
    spine:  { w: 26, z: .7 },
    chest:  { w: 24, z: .66 },
    head:   { w: 17, z: .6 },
    armR:   { w: 34, z: .72 },
    armL:   { w: 30, z: .72 },
    weapon: { w: 38, z: .8 },
  },
};

// heavier bodies move with more inertia
export function scaledProfile(base, massScale) {
  const k = 1 / Math.sqrt(Math.max(.5, massScale));
  const out = {};
  for (const g in base) out[g] = base[g].pass ? base[g] : { w: base[g].w * k, z: Math.min(1, base[g].z + (1 - k) * .1) };
  return out;
}

export function groupOf(name) {
  if (name === 'pitch' || name === 'roll' || name === 'twist') return 'pass';
  if (name === 'drop' || name === 'pelvisY' || name === 'pelvisTwist') return 'root';
  if (/^(r|l)(Hip|HipOut|Knee|Ankle)$/.test(name)) return 'legs';
  if (name === 'lean' || name === 'spineTwist' || name === 'tilt') return 'spine';
  if (name === 'chestLean' || name === 'chestTwist') return 'chest';
  if (name === 'nod' || name === 'look') return 'head';
  if (name === 'wRoll' || name === 'wPitch') return 'weapon';
  if (name[0] === 'r') return 'armR';
  return 'armL';
}
const GROUPS = CH.map(groupOf);
export const GROUP_INDEX = (g) => GROUPS.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0);

const SUB = 1 / 240;

export class PoseSpring {
  constructor(profile = PROFILES.frog) {
    this.x = new Float32Array(N);
    this.v = new Float32Array(N);
    this.w = new Float32Array(N);
    this.z = new Float32Array(N);
    this.pass = new Uint8Array(N);
    this.stiff = new Float32Array(N).fill(1);       // per-frame stiffness multiplier
    this.ready = false;
    this.setProfile(profile);
  }

  setProfile(p) {
    for (let i = 0; i < N; i++) {
      const g = p[GROUPS[i]];
      this.pass[i] = g.pass ? 1 : 0;
      this.w[i] = g.w ?? 30; this.z[i] = g.z ?? .8;
    }
  }

  /** Kick a channel with angular velocity (rad/s). */
  impulse(i, vel) { this.v[i] += vel; }

  /** Jump straight to a pose (spawning, teleports). */
  reset(p) { this.x.set(p); this.v.fill(0); this.ready = true; }

  update(target, dt, out) {
    if (!this.ready) this.reset(target);
    const x = this.x, v = this.v, w0 = this.w, z0 = this.z, pass = this.pass, st = this.stiff;
    const steps = Math.max(1, Math.ceil(dt / SUB)), h = dt / steps;
    for (let i = 0; i < N; i++) {
      if (pass[i]) { x[i] = target[i]; v[i] = 0; continue; }
      const w = w0[i] * st[i], zeta = z0[i], T = target[i];
      let xi = x[i], vi = v[i];
      for (let s = 0; s < steps; s++) {
        vi += (w * w * (T - xi) - 2 * zeta * w * vi) * h;
        xi += vi * h;
      }
      x[i] = xi; v[i] = vi;
    }
    out.set(x);
    st.fill(1);
    return out;
  }
}
