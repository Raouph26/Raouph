import * as THREE from 'three';
import { N, I, lerpPose, blendInto, UPPER, ease } from './pose.js';
import { REST, READY, BOSS_READY, GUARD, ATTACKS, BOSS, PLAYER_ACTS, BOSS_ACTS, sampleKeys, sampleClip, locomotion, hurtPose } from './clips.js';
import { PoseSpring, PROFILES, scaledProfile } from './spring.js';
import { applyPose } from '../kit/rig.js';
import { PLAYER } from '../../sim/player.js';

// ─────────────────────────────────────────────────────────────────────────────
// Animators turn sim state into poses, in layers:
//   1. procedural locomotion (stride-driven legs, bob, sway, breath)
//   2. the current action — a keyed clip sampled on the sim's own clock,
//      starting FROM whatever pose the body was in (so nothing ever pops)
//   3. additive life: lean into acceleration and turns, hit flinches
//   4. springs on every joint (spring.js): follow-through, weight, settle
// Rolls tumble around the tucked body's middle, in any of eight directions.
// ─────────────────────────────────────────────────────────────────────────────

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const angleLerp = (a, b, t) => a + angDiff(a, b) * t;
const _q = new THREE.Quaternion(), _axis = new THREE.Vector3(), _v = new THREE.Vector3();

// block = upper body + the crouch, so the legs keep strafing underneath
const BLOCK_MASK = [...UPPER, I.drop];

/** Make the off hand grab the weapon for two-handed props. */
export function twoHands(p) {
  p[I.lRaise] = p[I.rRaise] * 0.92 + 0.08;
  p[I.lOut] = -0.32 - p[I.rOut] * 0.25;
  p[I.lElbow] = Math.min(2.4, p[I.rElbow] * 0.85 + 0.35);
  p[I.lTwist] = 0.3;
}

const HURT_TMP = new Float32Array(N);

class BaseAnimator {
  constructor(rig, profile) {
    this.rig = rig;
    this.out = new Float32Array(N);        // what's on screen
    this.target = new Float32Array(N);     // what the layers ask for
    this.loco = new Float32Array(N);
    this.act = new Float32Array(N);
    this.lastAct = new Float32Array(N);
    this.from = new Float32Array(N);
    this.base = new Float32Array(N);
    this.spring = new PoseSpring(profile);
    this.w = 0;
    this.mask = null;
    this.lastMask = null;
    this.phase = 0;
    this.t = 0;
    this.yaw = null;
    this.actKey = null;
    this.lastT = 0;
    this.tumble = null;                    // { ax, az, angle, pivot }
    this.pivot = 0;
    this.speed = 0;
    // acceleration / turn tracking for additive lean
    this.pvx = 0; this.pvz = 0; this.accF = 0; this.accS = 0; this.yawRate = 0;
    this._fwd = 0; this._side = 0;
    this.shake = 0; this.shakeAmp = 0; this.shakeX = 0; this.shakeZ = 0;
  }

  /** A new action starts from exactly the pose on screen. */
  _begin(key) {
    if (key === this.actKey) return false;
    this.actKey = key;
    this.from.set(this.out);
    return true;
  }

  _track(dt, vx, vz, yaw) {
    if (dt <= 0) return;
    const ax = (vx - this.pvx) / dt, az = (vz - this.pvz) / dt;
    this.pvx = vx; this.pvz = vz;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const f = ax * s + az * c, sd = ax * c - az * s;       // sd > 0: toward its left
    const k = 1 - Math.exp(-10 * dt);
    this.accF += (Math.max(-30, Math.min(30, f)) - this.accF) * k;
    this.accS += (Math.max(-30, Math.min(30, sd)) - this.accS) * k;
  }

  _localVel(vx, vz, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    this._fwd = vx * s + vz * c;
    this._side = vx * c - vz * s;            // + toward its left
  }

  /**
   * An impulse from a hit. fromYaw: world direction toward the attacker.
   * s: 0.5 light … 1.5 knockdown.
   */
  flinch(fromYaw, s = 1) {
    const rel = angDiff(this.yaw ?? 0, fromYaw);
    const fwd = Math.cos(rel), side = Math.sin(rel);          // side > 0: hit from its left
    const sp = this.spring, k = s * (this.flinchScale ?? 1);
    sp.impulse(I.lean, -fwd * 7 * k); sp.impulse(I.chestLean, -fwd * 5 * k); sp.impulse(I.nod, -fwd * 9 * k);
    sp.impulse(I.tilt, side * 5 * k); sp.impulse(I.spineTwist, -side * 4 * k); sp.impulse(I.look, -side * 6 * k);
    sp.impulse(I.rOut, 4 * k); sp.impulse(I.lOut, 4 * k); sp.impulse(I.drop, -1.1 * k);
    // tremble in place through the hitstop (the victim shakes, the world holds)
    this.shake = .1 + .06 * s; this.shakeAmp = .045 * s * (this.flinchScale ?? 1);
    this.shakeX = Math.sin(fromYaw); this.shakeZ = Math.cos(fromYaw);
  }

  _compose(dt, active, rate = 30) {
    if (active) { this.w = Math.min(1, this.w + dt * rate); this.lastAct.set(this.act); this.lastMask = this.mask; }
    else this.w = Math.max(0, this.w - dt * 7);
    const T = this.target;
    T.set(this.loco);
    // fading out keeps the finished action's mask, so a block's crouch doesn't leak into the legs
    blendInto(T, active ? this.act : this.lastAct, ease.inOut(this.w), active ? this.mask : this.lastMask);
    this._additive(T, active);
    this.spring.update(T, dt, this.out);
    applyPose(this.rig, this.out, this.pivot);
    if (this.tumble) this._applyTumble(this.tumble);
    // the shake runs on real time: during hitstop the sim clock is frozen
    const rdt = this.realDt ?? dt;
    if (this.shake > 0) {
      this.shake -= rdt; this.shakeClock = (this.shakeClock ?? 0) + rdt;
      const j = Math.sin(this.shakeClock * 95) * this.shakeAmp * Math.min(1, this.shake * 12);
      this.rig.joints.body.position.x += j * this.shakeX; this.rig.joints.body.position.z += j * this.shakeZ;
    }
  }

  _additive(T, active) {
    // weight shifts: lean against acceleration, bank into turns
    if (active && !this.mask) return;
    T[I.lean] += Math.max(-.22, Math.min(.22, this.accF * .012));
    T[I.tilt] -= Math.max(-.2, Math.min(.2, this.accS * .01));
    T[I.tilt] += Math.max(-.18, Math.min(.18, this.yawRate * this.speed * .01));
    T[I.look] += Math.max(-.3, Math.min(.3, -this.yawRate * .06));
  }

  _applyTumble(tb) {
    const J = this.rig.joints;
    _axis.set(tb.ax, 0, tb.az);
    if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0); else _axis.normalize();
    _q.setFromAxisAngle(_axis, tb.angle);
    J.body.quaternion.premultiply(_q);
    // turn around the tucked body's middle, not the feet
    _v.set(0, tb.pivot, 0).applyQuaternion(_q);
    J.body.position.x -= _v.x;
    J.body.position.y += tb.pivot - _v.y;
    J.body.position.z -= _v.z;
  }

  _stiffArms(m) {
    const st = this.spring.stiff;
    for (let i = I.rRaise; i <= I.lWristZ; i++) st[i] = m;
    st[I.wRoll] = m; st[I.wPitch] = m; st[I.spineTwist] = m * .8; st[I.chestTwist] = m * .8; st[I.lean] = m * .7;
  }

  /** Directional tumble for a roll at k (0..1 through the roll), rel = roll dir vs facing. */
  _roll(a, k, rel, base) {
    sampleKeys(a, PLAYER_ACTS.roll, k, base, this.from);
    const tb = this.tumbleState;
    tb.ax = Math.cos(rel); tb.az = -Math.sin(rel);      // axis ⟂ to the roll, in the body's frame
    const u = clamp01((k - .04) / .68);
    tb.angle = ease.smoother(u) * TAU;
    tb.pivot = this.rig.spec.hipH + .04;              // the tucked ball's middle
    if (u > 0 && u < 1) this.tumble = tb;
  }
}

// ── the frog ────────────────────────────────────────────────────────────────
export class PlayerAnimator extends BaseAnimator {
  constructor(frog) {
    super(frog.rig, PROFILES.frog);
    this.frog = frog;
    this.scarfT = 0;
    this.prevChest = null;
    this.stance = 0;
    this.hurtFwd = 1; this.hurtSide = 0;
    this.tumbleState = { ax: 1, az: 0, angle: 0, pivot: 0 };
    this.drinking = 0;              // 0..1 flask-in-hand, read by the view
  }

  /** Where the last hit came from (world yaw toward the attacker). */
  hurtFrom(fromYaw) {
    const rel = angDiff(this.yaw ?? 0, fromYaw);
    this.hurtFwd = Math.cos(rel); this.hurtSide = Math.sin(rel);
  }

  blockHit(s = 1) {
    const sp = this.spring;
    sp.impulse(I.lRaise, -3 * s); sp.impulse(I.lElbow, 3 * s); sp.impulse(I.lean, -4 * s); sp.impulse(I.nod, -4 * s); sp.impulse(I.drop, -.9 * s);
    this.shake = .09; this.shakeAmp = .03 * s;
  }

  parried() {
    const sp = this.spring;
    sp.impulse(I.lOut, 5); sp.impulse(I.spineTwist, -2.5); sp.impulse(I.lean, -2); sp.impulse(I.nod, -3);
  }

  update(dt, p, { combat = true, weaponTwo = false } = {}) {
    this.t += dt;
    const root = this.rig.root;
    root.position.set(p.x, p.y ?? 0, p.z);
    const prevYaw = this.yaw ?? p.yaw;
    const turnRate = p.state === 'attack' ? 30 : 22;
    this.yaw = this.yaw == null ? p.yaw : angleLerp(this.yaw, p.yaw, 1 - Math.exp(-turnRate * dt));
    root.rotation.y = this.yaw;
    if (dt > 0) this.yawRate += (angDiff(prevYaw, this.yaw) / dt - this.yawRate) * (1 - Math.exp(-12 * dt));
    this._track(dt, p.vx, p.vz, this.yaw);

    // stance: relaxed out of combat, ready in it
    this.stance += ((combat ? 1 : 0) - this.stance) * (1 - Math.exp(-4 * dt));
    const base = lerpPose(this.base, REST, READY, this.stance);
    if (weaponTwo) twoHands(base);

    // locomotion, stride-driven so feet don't skate
    this._localVel(p.vx, p.vz, this.yaw);
    const speed = Math.hypot(this._fwd, this._side);
    this.speed = speed;
    const runK = Math.min(1, speed / 4.4), sprint = p.sprinting ? Math.min(1, Math.max(0, (speed - 4.6) / 1.4)) : 0;
    const stepLen = .5 + .3 * runK + .25 * sprint;
    this.phase += dt * (speed > .05 ? (speed / (2 * stepLen)) * TAU : 0);
    const busy = p.state === 'block' || p.state === 'heal';
    locomotion(this.loco, base, { phase: this.phase, fwd: this._fwd, side: this._side, run: 4.4, sprint, t: this.t, armsBusy: busy, guard: this.stance });
    if (weaponTwo && !busy) twoHands(this.loco);

    let active = true;
    this.mask = null;
    this.pivot = 0;
    this.tumble = null;
    const a = this.act;
    const restarted = p.t < this.lastT - 1e-4;
    this.lastT = p.t;
    let drinking = 0;
    switch (p.state) {
      case 'attack': {
        const s = p.atk.spec;
        this._begin(p.atk);
        const clip = ATTACKS[s.anim] ?? ATTACKS.slashR;
        let ph, k;
        if (p.t < s.startup) { ph = 'windup'; k = p.t / s.startup; }
        else if (p.t < s.startup + s.active) { ph = 'active'; k = (p.t - s.startup) / s.active; }
        else { ph = 'recovery'; k = (p.t - s.startup - s.active) / s.recovery; }
        sampleClip(a, clip, ph, clamp01(k), base, this.from);
        if (clip.spin && ph === 'active') a[I.twist] -= clamp01(k) * TAU;
        if (weaponTwo) twoHands(a);
        // crisp arms while the blade is live
        if (ph === 'active' || (ph === 'windup' && k > .8)) this._stiffArms(1.9);
        break;
      }
      case 'roll': {
        if (restarted) this.actKey = null;
        this._begin('roll');
        this._roll(a, clamp01(p.t / (PLAYER.roll.duration + PLAYER.roll.recovery)), p.rollRel ?? 0, base);
        break;
      }
      case 'block':
        this._begin('block');
        a.set(GUARD);
        this.mask = BLOCK_MASK;
        break;
      case 'parry': {
        this._begin('parry');
        const P = PLAYER.parry, total = P.startup + P.window + P.recovery;
        sampleKeys(a, PLAYER_ACTS.parry, clamp01(p.t / total), base, this.from);
        this._stiffArms(1.6);
        break;
      }
      case 'riposte': {
        this._begin('riposte');
        const k = clamp01(p.t / PLAYER.riposte.duration);
        sampleKeys(a, PLAYER_ACTS.riposte, k, base, this.from);
        if (weaponTwo && k < .6) twoHands(a);
        break;
      }
      case 'heal': {
        this._begin('heal');
        const k = clamp01(p.t / PLAYER.flask.duration);
        sampleKeys(a, PLAYER_ACTS.drink, k, base, this.from);
        this.mask = UPPER;
        drinking = k > .1 && k < .86 ? 1 : 0;
        break;
      }
      case 'hurt': {
        if (restarted) this.actKey = null;
        this._begin('hurt');
        hurtPose(HURT_TMP, this.hurtFwd, this.hurtSide);
        const k = clamp01(p.t / PLAYER.hurt);
        if (k < .18) lerpPose(a, this.from, HURT_TMP, ease.expoOut(k / .18));
        else lerpPose(a, HURT_TMP, base, ease.inOut((k - .18) / .82));
        break;
      }
      case 'knockdown':
        if (restarted) this.actKey = null;
        this._begin('knockdown');
        sampleKeys(a, PLAYER_ACTS.knockdown, clamp01(p.t / PLAYER.knockdown), base, this.from);
        break;
      case 'guardbreak':
        this._begin('guardbreak');
        sampleKeys(a, PLAYER_ACTS.guardbreak, clamp01(p.t / PLAYER.guardBreak), base, this.from);
        a[I.lean] += Math.sin(this.t * 9) * .05 * (1 - p.t / PLAYER.guardBreak);
        break;
      case 'dead':
        this._begin('dead');
        sampleKeys(a, PLAYER_ACTS.dead, clamp01(p.t / 1.3), base, this.from);
        break;
      default:
        active = false;
        this.actKey = null;
    }
    this.drinking += (drinking - this.drinking) * Math.min(1, dt * 20);
    this._compose(dt, active, p.state === 'attack' || p.state === 'roll' ? 60 : 30);
    this._scarf(dt);
  }

  /** Scarf tails: a damped spring chain that trails the chest's motion. */
  _scarf(dt) {
    const chest = this.rig.joints.chest;
    chest.updateWorldMatrix(true, false);
    const wp = chest.getWorldPosition(this._wp ?? (this._wp = new THREE.Vector3()));
    if (!this.prevChest) this.prevChest = wp.clone();
    const idt = 1 / Math.max(dt, 1e-3);
    const vx = (wp.x - this.prevChest.x) * idt, vz = (wp.z - this.prevChest.z) * idt, vy = (wp.y - this.prevChest.y) * idt;
    this.prevChest.copy(wp);
    const s = Math.sin(this.yaw ?? 0), c = Math.cos(this.yaw ?? 0);
    const fwd = vx * s + vz * c, side = -vx * c + vz * s;
    this.scarfT += dt;
    for (const tail of this.frog.scarf ?? []) {
      const segs = tail.segs;
      for (let i = 0; i < segs.length; i++) {
        const st = tail.state[i];
        const flutter = Math.sin(this.scarfT * (6 + i) + tail.side * 1.3 + i) * (0.05 + Math.min(1, Math.abs(fwd) / 5) * .12);
        const tx = Math.max(-1.35, Math.min(.35, fwd * .16 - vy * .05)) + flutter + (i ? .08 : .25);
        const tz = Math.max(-.8, Math.min(.8, side * -.12)) + tail.side * .06;
        st.vx += (tx - st.ax) * 90 * dt; st.vx *= Math.exp(-9 * dt); st.ax += st.vx * dt;
        st.vz += (tz - st.az) * 70 * dt; st.vz *= Math.exp(-9 * dt); st.az += st.vz * dt;
        segs[i].rotation.set(st.ax * (i ? .55 : 1), 0, st.az * (i ? .5 : 1));
      }
    }
  }
}

// ── bosses ──────────────────────────────────────────────────────────────────
const NO_TWO = new Set(['cast', 'type', 'flash', 'wipe', 'roar', 'stomp', 'leap', 'charge', 'pincer', 'pincerL', 'scuttle']);

export class BossAnimator extends BaseAnimator {
  constructor(built, def) {
    const frog = built.kind === 'frog';
    const scale = frog ? 1 : 0.85 * (def.scale ?? 1.6);
    super(built.rig, frog ? PROFILES.frog : scaledProfile(PROFILES.frog, scale));
    this.b = built;
    this.def = def;
    this.two = !!built.twoHand;
    this.frog = frog;
    this.rest = this.frog ? Float32Array.from(READY) : Float32Array.from(BOSS_READY);
    if (this.two) twoHands(this.rest);
    this.scale = scale;
    this.flinchScale = 1 / Math.sqrt(scale);
    if (built.root && !this.frog) built.root.scale.setScalar(this.scale);
    this.scarfer = this.frog ? new PlayerAnimator(built.frog) : null;
    this.lastPhase = null;
    this.tumbleState = { ax: 1, az: 0, angle: 0, pivot: 0 };
  }

  update(dt, b) {
    this.t += dt;
    const root = this.b.root;
    root.position.set(b.x, b.y, b.z);
    const prevYaw = this.yaw ?? b.yaw;
    this.yaw = this.yaw == null ? b.yaw : angleLerp(this.yaw, b.yaw, 1 - Math.exp(-16 * dt));
    root.rotation.y = this.yaw;
    if (dt > 0) this.yawRate += (angDiff(prevYaw, this.yaw) / dt - this.yawRate) * (1 - Math.exp(-12 * dt));
    this._track(dt, b.vx, b.vz, this.yaw);

    this._localVel(b.vx, b.vz, this.yaw);
    const sc = Math.max(.6, this.scale * .75);
    const speed = Math.hypot(this._fwd, this._side) / sc;
    this.speed = speed;
    const stepLen = .55 + .3 * Math.min(1, speed / 4.4);
    this.phase += dt * (speed > .05 ? (speed / (2 * stepLen)) * TAU : 0);
    locomotion(this.loco, this.rest, { phase: this.phase, fwd: this._fwd / sc, side: this._side / sc, run: 4.4, sprint: 0, t: this.t, guard: 1 });
    if (this.two) twoHands(this.loco);

    const a = this.act, an = b.anim;
    let active = true;
    this.mask = null;
    this.pivot = 0;
    this.tumble = null;
    const base = this.rest;
    switch (b.state) {
      case 'move': {
        // a new swing (or a repeat of the same one) starts from the pose on screen
        if (an.phase === 'windup' && this.lastPhase !== 'windup') this.actKey = null;
        this._begin(`${an.moveId}:${an.step}`);
        const lib = this.frog ? ATTACKS : BOSS;
        const clip = lib[an.tell] ?? ATTACKS[an.tell] ?? BOSS.swipeR;
        sampleClip(a, clip, an.phase, clamp01(an.k), base, this.from);
        if (an.phase === 'hold') {                        // a held blow trembles with intent
          a[I.drop] += Math.sin(this.t * 40) * .008; a[I.rRaise] += Math.sin(this.t * 33) * .03;
        }
        if (clip.spin && an.phase === 'active') a[I.twist] -= an.k * TAU;
        if (an.tell === 'leap' && an.phase === 'active') lerpPose(a, BOSS.leap.air, BOSS.leap.strike, ease.in(an.k));
        if (an.tell === 'scuttle' && an.phase === 'active') a[I.twist] = Math.PI / 2;
        if (this.two && !this.frog && !NO_TWO.has(an.tell)) twoHands(a);
        if (an.phase === 'active') this._stiffArms(1.6);
        break;
      }
      case 'stagger': {
        this._begin('stagger');
        const k = clamp01(b.t / Math.max(.1, b.stagDur));
        sampleKeys(a, b.stagWhy === 'parried' ? BOSS_ACTS.staggerParried : BOSS_ACTS.staggerPoise, k, base, this.from);
        a[I.drop] += Math.sin(this.t * 3.1) * .012; a[I.tilt] += Math.sin(this.t * 1.7) * .05 * (1 - k);
        break;
      }
      case 'riposted': this._begin('riposted'); sampleKeys(a, BOSS_ACTS.riposted, clamp01(b.t / 1.5), base, this.from); break;
      case 'getup': this._begin('getup'); sampleKeys(a, BOSS_ACTS.getup, clamp01(b.t / .75), base, this.from); break;
      case 'transition':
        this._begin('transition');
        sampleKeys(a, BOSS_ACTS.transition, clamp01(b.t / 1.6), base, this.from);
        if (b.t > .5 && b.t < 1.2) a[I.drop] += Math.sin(this.t * 30) * .01;
        break;
      case 'pause': {                                    // confused / jammed / not responding
        this._begin('pause');
        a.set(base);
        a[I.nod] = .25 + Math.sin(this.t * 1.3) * .08; a[I.look] = Math.sin(this.t * .9) * .5;
        a[I.tilt] = .18; a[I.rRaise] -= .15; a[I.drop] -= .04;
        break;
      }
      case 'dodge':
        this._begin('dodge');
        this._roll(a, clamp01(b.t / .6), angDiff(this.yaw, b.flags.dodgeYaw ?? this.yaw), base);
        break;
      case 'drink': this._begin('drink'); sampleKeys(a, BOSS_ACTS.drink, clamp01(b.t / 1.25), base, this.from); this.mask = UPPER; break;
      case 'dead': this._begin('dead'); sampleKeys(a, BOSS_ACTS.dead, clamp01(b.t / 1.6), base, this.from); break;
      default:
        active = false;
        this.actKey = null;
    }
    this.lastPhase = b.state === 'move' ? an.phase : null;
    this._compose(dt, active, 24);
    if (this.scarfer) { this.scarfer.yaw = this.yaw; this.scarfer._scarf(dt); }
  }
}

// ── the robot vacuum ────────────────────────────────────────────────────────
export class VacuumAnimator {
  constructor(built) { this.b = built; this.t = 0; this.spin = 0; this.yaw = null; this.shake = 0; this.wob = 0; this.wobV = 0; }
  flinch(fromYaw, s = 1) { this.wobV += 4 * s; this.shake = .12; }
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
    // a hit wobbles it on its suspension
    this.wobV += (-this.wob * 180 - this.wobV * 9) * dt; this.wob += this.wobV * dt;
    this.spin += spinRate * dt;
    V.turret.rotation.y = this.spin;
    V.body.rotation.x = tilt + this.wob * .05 + Math.sin(this.t * 9) * .01;
    V.knifeHand.rotation.x = armPitch + Math.sin(this.t * 4) * .05;
    const rdt = this.realDt ?? dt;
    if (this.shake > 0) { this.shake -= rdt; this.sc = (this.sc ?? 0) + rdt; V.root.position.x += Math.sin(this.sc * 95) * .04; }
  }
}
