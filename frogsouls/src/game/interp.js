import { TICK } from '../sim/fight.js';

// ─────────────────────────────────────────────────────────────────────────────
// The fight runs in fixed 1/60 s steps; the screen refreshes at 60, 90 or
// 120 Hz, never exactly in step. Drawing the raw sim state makes things hop:
// two steps one frame, none the next. So every frame the fighters are drawn
// between their last two sim states (alpha = leftover time / TICK), and put
// back exactly before the sim runs again. Clocks that drive animation (state
// time, move phase) are advanced by the same leftover so poses glide too.
// ─────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const lerpAngle = (a, b, t) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
};

function snapOne(e) { e._px = e.x; e._py = e.y ?? 0; e._pz = e.z; e._pyaw = e.yaw ?? 0; }

export class Interp {
  constructor() { this.applied = null; this.alpha = 0; }

  /** Call right before each sim step. */
  snap(f) {
    snapOne(f.player); snapOne(f.boss);
    for (const p of f.projectiles) snapOne(p);
  }

  /** Move everything to its drawn position. */
  apply(f, alpha) {
    if (this.applied) this.restore();
    this.applied = f;
    this.alpha = alpha;
    const dt = alpha * TICK;
    this._one(f.player, alpha, true, dt);
    this._one(f.boss, alpha, true, dt);
    for (const p of f.projectiles) this._one(p, alpha, false, dt);
    // the boss's move clock: its phase fraction, pushed on by the leftover time
    const an = f.boss.anim;
    an._k = an.k;
    if (an.dur > 0 && an.phase !== 'hold') an.k = Math.min(1, an.k + dt / an.dur);
    else if (an.dur === 0) an.k += dt;           // idle states count seconds
  }

  _one(e, alpha, clocked, dt) {
    if (e._px === undefined) snapOne(e);
    e._cx = e.x; e._cy = e.y; e._cz = e.z; e._cyaw = e.yaw;
    e.x = e._px + (e.x - e._px) * alpha;
    e.z = e._pz + (e.z - e._pz) * alpha;
    if (e.y !== undefined) e.y = e._py + (e.y - e._py) * alpha;
    if (e.yaw !== undefined) e.yaw = lerpAngle(e._pyaw, e.yaw, alpha);
    if (clocked) { e._ct = e.t; e.t += dt; }
  }

  /** Put the sim state back exactly as the sim left it. */
  restore() {
    const f = this.applied;
    if (!f) return;
    this.applied = null;
    this._undo(f.player, true);
    this._undo(f.boss, true);
    for (const p of f.projectiles) if (p._cx !== undefined) this._undo(p, false);
    const an = f.boss.anim;
    if (an._k !== undefined) { an.k = an._k; an._k = undefined; }
  }

  _undo(e, clocked) {
    e.x = e._cx; e.z = e._cz;
    if (e._cy !== undefined) e.y = e._cy;
    if (e._cyaw !== undefined) e.yaw = e._cyaw;
    if (clocked) e.t = e._ct;
    e._cx = undefined;
  }
}
