import { N, I, pose, derive, lerpPose, blendInto, UPPER, ease } from './pose.js';
import { REST, READY, BOSS_READY, GUARD, ATTACKS, ACT, BOSS, locomotion, sampleClip } from './clips.js';
import { applyPose } from '../kit/rig.js';
import { PLAYER } from '../../sim/player.js';

// ─────────────────────────────────────────────────────────────────────────────
// Animators turn sim state into poses. Timing comes from the sim — an attack
// clip is sampled at the sim's own startup/active/recovery clock — so the
// animation can never disagree with the hit. Two layers: procedural
// locomotion underneath, the current action on top with a short crossfade.
// ─────────────────────────────────────────────────────────────────────────────

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const arc = (k) => Math.sin(Math.PI * clamp01(k));
const angleLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

/** Make the off hand grab the weapon for two-handed props. */
function twoHands(p) {
  p[I.lRaise] = p[I.rRaise] * 0.92 + 0.08;
  p[I.lOut] = -0.32 - p[I.rOut] * 0.25;
  p[I.lElbow] = Math.min(2.4, p[I.rElbow] * 0.85 + 0.35);
  p[I.lTwist] = 0.3;
}

class BaseAnimator {
  constructor(rig) {
    this.rig = rig;
    this.out = new Float32Array(N);
    this.loco = new Float32Array(N);
    this.act = new Float32Array(N);
    this.lastAct = new Float32Array(N);
    this.w = 0;                // action layer weight
    this.mask = null;
    this.phase = 0;
    this.t = 0;
    this.yaw = null;
    this.stance = 0;           // 0 relaxed … 1 combat
  }

  _localVel(vx, vz, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return { fwd: vx * s + vz * c, side: -vx * c + vz * s };
  }

  _compose(dt, active, rate = 22) {
    if (active) { this.w = Math.min(1, this.w + dt * rate); this.lastAct.set(this.act); }
    else this.w = Math.max(0, this.w - dt * 9);
    this.out.set(this.loco);
    const src = active ? this.act : this.lastAct;
    blendInto(this.out, src, ease.inOut(this.w), this.mask);
    applyPose(this.rig, this.out);
  }
}

// ── the frog ────────────────────────────────────────────────────────────────
export class PlayerAnimator extends BaseAnimator {
  constructor(frog) {
    super(frog.rig);
    this.frog = frog;
    this.scarfT = 0;
    this.prevChest = null;
  }

  update(dt, p, { combat = true, weaponTwo = false } = {}) {
    this.t += dt;
    const root = this.rig.root;
    root.position.set(p.x, p.y ?? 0, p.z);
    this.yaw = this.yaw == null ? p.yaw : angleLerp(this.yaw, p.yaw, 1 - Math.exp(-22 * dt));
    root.rotation.y = this.yaw;

    this.stance += ((combat ? 1 : 0) - this.stance) * (1 - Math.exp(-4 * dt));
    const stanceBase = lerpPose(new Float32Array(N), REST, READY, this.stance);
    if (weaponTwo) twoHands(stanceBase);

    const { fwd, side } = this._localVel(p.vx, p.vz, p.yaw);
    const speed = Math.hypot(fwd, side);
    this.phase += dt * (1.2 + speed * 2.05);
    const armsBusy = p.state === 'block' || p.state === 'heal';
    locomotion(this.loco, stanceBase, this.phase, fwd, side, p.sprinting, this.t, { armsBusy });

    let active = true;
    this.mask = null;
    const a = this.act;
    switch (p.state) {
      case 'attack': {
        const s = p.atk.spec;
        const clip = ATTACKS[s.anim] ?? ATTACKS.slashR;
        let ph, k;
        if (p.t < s.startup) { ph = 'windup'; k = p.t / s.startup; }
        else if (p.t < s.startup + s.active) { ph = 'active'; k = (p.t - s.startup) / s.active; }
        else { ph = 'recovery'; k = (p.t - s.startup - s.active) / s.recovery; }
        sampleClip(a, clip, ph, clamp01(k), stanceBase);
        if (clip.spin && ph === 'active') a[I.twist] -= k * Math.PI * 2;
        if (weaponTwo) twoHands(a);
        break;
      }
      case 'roll': {
        const k = clamp01(p.t / PLAYER.roll.duration);
        lerpPose(a, stanceBase, ACT.tuck, arc(k * 1.05));
        a[I.pitch] = k * Math.PI * 2;
        a[I.drop] = -arc(k) * .42 + Math.sin(k * Math.PI * 2) * .05;
        break;
      }
      case 'backstep': lerpPose(a, stanceBase, ACT.hopBack, arc(p.t / PLAYER.backstep.duration)); break;
      case 'block': a.set(GUARD); if (weaponTwo) twoHands(a); this.mask = UPPER; break;
      case 'parry': {
        const P = PLAYER.parry, total = P.startup + P.window + P.recovery;
        const k = p.t / total;
        if (k < .12) lerpPose(a, stanceBase, ACT.parryPeak, ease.out(k / .12));
        else if (k < .4) lerpPose(a, ACT.parryPeak, ACT.parryFlick, ease.outStrong((k - .12) / .28));
        else lerpPose(a, ACT.parryFlick, stanceBase, ease.inOut((k - .4) / .6));
        break;
      }
      case 'riposte': {
        const k = p.t / PLAYER.riposte.duration;
        if (k < .3) lerpPose(a, stanceBase, ACT.ripostePeak, ease.inOut(k / .3));
        else if (k < .5) lerpPose(a, ACT.ripostePeak, ACT.riposteStab, ease.outStrong((k - .3) / .2));
        else if (k < .75) a.set(ACT.riposteStab);
        else lerpPose(a, ACT.riposteStab, stanceBase, ease.inOut((k - .75) / .25));
        break;
      }
      case 'heal': {
        const k = p.t / PLAYER.flask.duration;
        lerpPose(a, stanceBase, ACT.drink, arc(Math.min(1, k * 1.25)) ** .6);
        this.mask = UPPER;
        break;
      }
      case 'hurt': lerpPose(a, stanceBase, ACT.hurt, arc(p.t / PLAYER.hurt)); break;
      case 'knockdown': {
        const k = p.t / PLAYER.knockdown;
        if (k < .25) lerpPose(a, stanceBase, ACT.downFlat, ease.out(k / .25));
        else if (k < .6) a.set(ACT.downFlat);
        else lerpPose(a, ACT.downFlat, ACT.kneel, ease.inOut((k - .6) / .25)), k > .85 && lerpPose(a, ACT.kneel, stanceBase, ease.inOut((k - .85) / .15));
        break;
      }
      case 'guardbreak': lerpPose(a, stanceBase, ACT.guardBroken, arc(Math.min(1, p.t / PLAYER.guardBreak * 1.4))); break;
      case 'dead': lerpPose(a, stanceBase, ACT.dead, ease.out(clamp01(p.t / .9))); break;
      default: active = false;
    }
    this._compose(dt, active, p.state === 'attack' || p.state === 'roll' ? 40 : 22);
    this._scarf(dt);
  }

  /** Scarf tails: a damped spring chain that trails the chest's motion. */
  _scarf(dt) {
    const chest = this.rig.joints.chest;
    chest.updateWorldMatrix(true, false);
    const wp = chest.getWorldPosition(this._wp ?? (this._wp = new chest.position.constructor()));
    if (!this.prevChest) this.prevChest = wp.clone();
    const vx = (wp.x - this.prevChest.x) / Math.max(dt, 1e-3), vz = (wp.z - this.prevChest.z) / Math.max(dt, 1e-3);
    const vy = (wp.y - this.prevChest.y) / Math.max(dt, 1e-3);
    this.prevChest.copy(wp);
    const s = Math.sin(this.yaw ?? 0), c = Math.cos(this.yaw ?? 0);
    const fwd = vx * s + vz * c, side = -vx * c + vz * s;
    this.scarfT += dt;
    for (const tail of this.frog.scarf ?? []) {
      tail.segs.forEach((seg, i) => {
        const st = tail.state[i];
        const flutter = Math.sin(this.scarfT * (6 + i) + tail.side * 1.3 + i) * (0.05 + Math.min(1, Math.abs(fwd) / 5) * .12);
        const tx = Math.max(-1.35, Math.min(.35, fwd * .16 - vy * .05)) + flutter + (i ? .08 : .25);
        const tz = Math.max(-.8, Math.min(.8, side * -.12)) + tail.side * .06;
        st.vx += (tx - st.ax) * 90 * dt; st.vx *= Math.exp(-9 * dt); st.ax += st.vx * dt;
        st.vz += (tz - st.az) * 70 * dt; st.vz *= Math.exp(-9 * dt); st.az += st.vz * dt;
        seg.rotation.set(st.ax * (i ? .55 : 1), 0, st.az * (i ? .5 : 1));
      });
    }
  }
}

// ── bosses ──────────────────────────────────────────────────────────────────
export class BossAnimator extends BaseAnimator {
  constructor(built, def) {
    super(built.rig);
    this.b = built;
    this.def = def;
    this.two = !!built.twoHand;
    this.frog = built.kind === 'frog';
    this.rest = this.frog ? READY : Float32Array.from(BOSS_READY);
    if (this.two) twoHands(this.rest);
    this.scale = this.frog ? 1 : 0.85 * (def.scale ?? 1.6);
    if (built.root && !this.frog) built.root.scale.setScalar(this.scale);
    this.scarfer = this.frog ? new PlayerAnimator(built.frog) : null;
  }

  update(dt, b) {
    this.t += dt;
    const root = this.b.root;
    root.position.set(b.x, b.y, b.z);
    this.yaw = this.yaw == null ? b.yaw : angleLerp(this.yaw, b.yaw, 1 - Math.exp(-16 * dt));
    root.rotation.y = this.yaw;

    const { fwd, side } = this._localVel(b.vx, b.vz, b.yaw);
    const speed = Math.hypot(fwd, side) / Math.max(.6, this.scale * .75);
    this.phase += dt * (1.0 + speed * 1.9);
    locomotion(this.loco, this.rest, this.phase, fwd / Math.max(.6, this.scale * .75), side / Math.max(.6, this.scale * .75), false, this.t, {});

    const a = this.act, an = b.anim;
    let active = true;
    this.mask = null;
    switch (b.state) {
      case 'move': {
        const lib = this.frog ? ATTACKS : BOSS;
        const clip = lib[an.tell] ?? ATTACKS[an.tell] ?? BOSS.swipeR;
        sampleClip(a, clip, an.phase, clamp01(an.k), this.rest);
        if (an.phase === 'hold') {                        // a held blow trembles with intent
          a[I.drop] += Math.sin(this.t * 40) * .008; a[I.rRaise] += Math.sin(this.t * 33) * .03;
        }
        if (clip.spin && an.phase === 'active') a[I.twist] -= an.k * Math.PI * 2;
        if (an.tell === 'leap' && an.phase === 'active') lerpPose(a, BOSS.leap.air, BOSS.leap.strike, ease.in(an.k));
        if (an.tell === 'scuttle' && an.phase === 'active') a[I.twist] = Math.PI / 2;
        if (this.two && !this.frog && !['cast', 'type', 'flash', 'wipe', 'roar', 'stomp', 'leap', 'charge', 'pincer', 'pincerL', 'scuttle'].includes(an.tell)) twoHands(a);
        break;
      }
      case 'stagger': {
        const k = b.t / Math.max(.1, b.stagDur);
        if (k < .15) lerpPose(a, this.rest, ACT.kneel, ease.out(k / .15));
        else if (k < .85) a.set(ACT.kneel), a[I.drop] += Math.sin(this.t * 3) * .01;
        else lerpPose(a, ACT.kneel, this.rest, ease.inOut((k - .85) / .15));
        break;
      }
      case 'riposted': lerpPose(a, ACT.kneel, ACT.downFlat, ease.out(clamp01(b.t / .4))); break;
      case 'getup': lerpPose(a, ACT.downFlat, this.rest, ease.inOut(clamp01(b.t / .75))); break;
      case 'transition': {
        const k = b.t / 1.6;
        if (k < .3) lerpPose(a, this.rest, BOSS.roar.peak, ease.inOut(k / .3));
        else if (k < .75) lerpPose(a, BOSS.roar.peak, BOSS.roar.strike, ease.out((k - .3) / .15 > 1 ? 1 : (k - .3) / .15)), a[I.drop] += Math.sin(this.t * 30) * .01;
        else lerpPose(a, BOSS.roar.strike, this.rest, ease.inOut((k - .75) / .25));
        break;
      }
      case 'pause': {                                    // confused / jammed / not responding
        a.set(this.rest);
        a[I.nod] = .25 + Math.sin(this.t * 1.3) * .08; a[I.look] = Math.sin(this.t * .9) * .5;
        a[I.tilt] = .18; a[I.rRaise] -= .15; a[I.drop] -= .04;
        break;
      }
      case 'dodge': {
        const k = clamp01(b.t / .5);
        lerpPose(a, this.rest, ACT.tuck, arc(k * 1.05));
        a[I.pitch] = k * Math.PI * 2; a[I.drop] = -arc(k) * .42;
        break;
      }
      case 'drink': lerpPose(a, this.rest, ACT.drink, arc(Math.min(1, b.t / 1.25 * 1.2)) ** .6); break;
      case 'dead': lerpPose(a, this.rest, ACT.dead, ease.out(clamp01(b.t / 1.2))); break;
      default: active = false;
    }
    this._compose(dt, active, 18);
    if (this.scarfer) { this.scarfer.yaw = this.yaw; this.scarfer._scarf(dt); }
  }
}

// ── the robot vacuum ────────────────────────────────────────────────────────
export class VacuumAnimator {
  constructor(built) { this.b = built; this.t = 0; this.spin = 0; this.yaw = null; }
  update(dt, b) {
    this.t += dt;
    const V = this.b;
    V.root.position.set(b.x, b.y, b.z);
    this.yaw = this.yaw == null ? b.yaw : angleLerp(this.yaw, b.yaw, 1 - Math.exp(-14 * dt));
    V.root.rotation.y = this.yaw;
    const an = b.anim;
    let tilt = 0, armPitch = 0, spinRate = 0;
    if (b.state === 'move') {
      if (an.tell === 'spin') spinRate = an.phase === 'active' ? 22 : an.phase === 'windup' ? 6 * an.k : 3;
      if (an.tell === 'bounce' || an.tell === 'charge') { tilt = an.phase === 'active' ? .12 : an.phase === 'windup' ? -.08 * an.k : 0; armPitch = an.phase === 'windup' ? -.6 * an.k : .3; }
    }
    if (b.state === 'stagger') { tilt = Math.sin(this.t * 18) * .08; armPitch = .9; }
    if (b.state === 'pause') armPitch = .6 + Math.sin(this.t * 2) * .1;
    if (b.state === 'dead') { tilt = -.2; armPitch = 1.4; }
    this.spin += spinRate * dt;
    V.turret.rotation.y = this.spin;
    V.body.rotation.x = tilt + Math.sin(this.t * 9) * .01;
    V.knifeHand.rotation.x = armPitch + Math.sin(this.t * 4) * .05;
  }
}
