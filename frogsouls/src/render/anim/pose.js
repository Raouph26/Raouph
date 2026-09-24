// ─────────────────────────────────────────────────────────────────────────────
// A pose is a flat Float32Array of joint channels. Poses are authored with
// plain-language names — raise, out, elbow, knee — and every sign convention
// is resolved once, in applyPose, so no pose ever has to think about axes.
//
// Conventions (character faces +z; its right hand is on −x):
//   lean +  forward       twist +  turn to its right     tilt +  lean right
//   raise + arm forward/up   out + arm away from body     elbow + bend
//   hip +   thigh forward    knee + bend                  ankle + toes down
//   nod +   look down        look +  look right
// ─────────────────────────────────────────────────────────────────────────────

export const CH = [
  'drop', 'pitch', 'roll', 'twist',
  'pelvisY', 'pelvisTwist',
  'lean', 'spineTwist', 'tilt',
  'chestLean', 'chestTwist',
  'nod', 'look',
  'rRaise', 'rOut', 'rTwist', 'rElbow', 'rWrist', 'rWristZ',
  'lRaise', 'lOut', 'lTwist', 'lElbow', 'lWrist', 'lWristZ',
  'rHip', 'rHipOut', 'rKnee', 'rAnkle',
  'lHip', 'lHipOut', 'lKnee', 'lAnkle',
  'wRoll', 'wPitch',
];
export const I = Object.fromEntries(CH.map((c, i) => [c, i]));
export const N = CH.length;

export function pose(named = {}) {
  const p = new Float32Array(N);
  for (const k in named) {
    if (!(k in I)) throw new Error(`unknown channel ${k}`);
    p[I[k]] = named[k];
  }
  return p;
}

/** Start from a base pose and override some channels. */
export function derive(base, named) {
  const p = Float32Array.from(base);
  for (const k in named) p[I[k]] = named[k];
  return p;
}

/** Mirror a pose left↔right (swap limbs, flip twists and tilts). */
export function mirror(src) {
  const p = Float32Array.from(src);
  const swap = [['rRaise', 'lRaise'], ['rOut', 'lOut'], ['rTwist', 'lTwist'], ['rElbow', 'lElbow'], ['rWrist', 'lWrist'], ['rWristZ', 'lWristZ'],
    ['rHip', 'lHip'], ['rHipOut', 'lHipOut'], ['rKnee', 'lKnee'], ['rAnkle', 'lAnkle']];
  for (const [a, b] of swap) { p[I[a]] = src[I[b]]; p[I[b]] = src[I[a]]; }
  for (const k of ['twist', 'pelvisTwist', 'spineTwist', 'chestTwist', 'look', 'roll', 'tilt']) p[I[k]] = -src[I[k]];
  return p;
}

export function lerpPose(out, a, b, t) {
  for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export function copyPose(out, a) { out.set(a); return out; }

/** out = out*(1-w) + a*w, only over a channel mask (array of indices) if given. */
export function blendInto(out, a, w, mask = null) {
  if (w <= 0) return out;
  if (mask) { for (const i of mask) out[i] += (a[i] - out[i]) * w; }
  else for (let i = 0; i < N; i++) out[i] += (a[i] - out[i]) * w;
  return out;
}

export const UPPER = CH.map((c, i) => (/^(r|l)(Raise|Out|Twist|Elbow|Wrist|WristZ)$|^(lean|spineTwist|tilt|chestLean|chestTwist|nod|look|wRoll|wPitch)$/.test(c) ? i : -1)).filter((i) => i >= 0);
export const LOWER = CH.map((c, i) => (/^(r|l)(Hip|HipOut|Knee|Ankle)$|^(drop|pelvisY|pelvisTwist)$/.test(c) ? i : -1)).filter((i) => i >= 0);

/** out = b + (b − a)·t — carry a motion on past its end (follow-through). */
export function extrap(a, b, t) {
  const p = new Float32Array(N);
  for (let i = 0; i < N; i++) p[i] = b[i] + (b[i] - a[i]) * t;
  return p;
}

/** A pose part-way between two, with named overrides. */
export function mixPose(a, b, t, named = {}) {
  const p = lerpPose(new Float32Array(N), a, b, t);
  for (const k in named) p[I[k]] = named[k];
  return p;
}

// easing — strikes want fast arrivals, wind-ups want a little pull-back first
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  in: (t) => t * t,
  inCubic: (t) => t * t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  outStrong: (t) => 1 - Math.pow(1 - t, 3.2),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backIn: (t) => { const c = 1.6; return t * t * ((c + 1) * t - c); },          // dips back before going
  backOut: (t) => { const c = 1.5, u = t - 1; return 1 + u * u * ((c + 1) * u + c); },  // overshoots, settles
  inOutBack: (t) => { const c = 1.2 * 1.525; return t < .5 ? ((2 * t) ** 2 * ((c + 1) * 2 * t - c)) / 2 : ((2 * t - 2) ** 2 * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; },
};
export const easeClamped = (name, t) => (ease[name] ?? ease.inOut)(clamp01(t));
