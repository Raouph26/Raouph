import * as THREE from 'three';
import { buildActor } from './actor.js';
import { poseArm, poseLeg, walkCycle, damp, ease, arc, clamp01 } from './anim.js';
import { ARCHETYPES } from './content.js';

const _d = new THREE.Vector3(), _p = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────
// Boss = a weighted pattern table + committed, telegraphed attacks.
// Every attack: windup (readable, no damage) → active (hitbox) → recovery.
// Attacks with `parryable` open the player's parry window during `active`.
// ─────────────────────────────────────────────────────────────────────────────

const MOVES = {
  slam: {
    windup: 0.78, active: 0.14, recovery: 0.92, dmg: 26, range: 3.4, arc: 1.1,
    advance: 2.2, parryable: true, tell: 'rear',
  },
  doubleSwipe: {
    windup: 0.46, active: 0.11, recovery: 0.28, dmg: 17, range: 3.1, arc: 1.5,
    advance: 1.4, parryable: true, tell: 'wind', followUp: 'swipeB',
  },
  swipeB: {
    windup: 0.30, active: 0.11, recovery: 0.74, dmg: 19, range: 3.1, arc: 1.5,
    advance: 1.2, parryable: true, tell: 'wind',
  },
  lunge: {
    windup: 0.62, active: 0.16, recovery: 0.86, dmg: 30, range: 3.0, arc: 0.55,
    advance: 7.4, parryable: false, tell: 'crouch',
  },
  sweep: {
    windup: 0.55, active: 0.18, recovery: 0.66, dmg: 22, range: 3.9, arc: 2.9,
    advance: 0.4, parryable: true, tell: 'spin',
  },
  stomp: {   // phase 2+: unblockable shockwave, must roll
    windup: 0.92, active: 0.20, recovery: 1.05, dmg: 34, range: 5.2, arc: Math.PI * 2,
    advance: 0, parryable: false, unblockable: true, tell: 'rise',
  },
};

export class Boss {
  constructor(scene, fx, def = {}) {
    this.fx = fx;
    this.def = def;
    const A = ARCHETYPES[def.archetype] ?? ARCHETYPES.duelist;
    this.arch = A;
    this.name = def.name ?? 'THE FINANCIER';
    this.epithet = def.epithet ?? '';
    this.maxHp = def.hp ?? 900;
    this.hp = this.maxHp;
    this.scale = def.scale ?? A.scale;
    this.walkSpeed = A.speed;
    this.cooldowns = A.cd;
    this.pool = A.moves;

    const SKIN = { brute:0x6a5f4e, duelist:0x7a6a55, hound:0x5f5344,
                   sweeper:0x6d6152, sovereign:0x7d6c4f };
    const BUILD = { brute:'heavy', duelist:'normal', hound:'lean',
                    sweeper:'long', sovereign:'crowned' };
    this.obj = buildActor({
      scale: this.scale,
      skin: SKIN[def.archetype] ?? 0x6a5f4e,
      cloth: 0x1d1a17,
      accent: def.isWorldBoss ? 0xd9c07a : 0xb8933f,
      build: BUILD[def.archetype] ?? 'normal',
    });
    scene.add(this.obj);
    this.rig = this.obj.userData.rig;

    this.position = this.obj.position;
    this.position.set(0, 0, -10);
    this.velocity = new THREE.Vector3();
    this.facing = Math.PI;

    this.radius = 0.9 * this.scale;
    this.capsuleHeight = 2.0 * this.scale;
    this.lockHeight = 1.9 * this.scale;

    this.maxPoise = A.poise;
    this.poise = this.maxPoise;
    this.poiseRegen = 22;

    this.alive = true;
    this.state = 'idle';
    this.t = 0;
    this.move = null;
    this.phase = 1;
    this.staggered = false;
    this._hitPlayer = false;
    this._step = 0;

    this.aggroRange = 30;
    this.tint = new THREE.Color(0xb8933f);
  }

  get hpFrac() { return this.hp / this.maxHp; }
  get open() { return this.state === 'stagger'; }   // riposte-able

  stagger() {
    if (!this.alive) return;
    this.state = 'stagger'; this.t = 0; this.staggered = true;
    this.poise = this.maxPoise;
    this.velocity.set(0, 0, 0);
  }

  takeHit(dmg, poise, fromPos, isRiposte = false) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.fx.sparks(_p.copy(this.position).setY(1.1 * this.scale), 0xd9b26a);

    if (this.state === 'stagger' && !isRiposte) { /* free hits while open */ }
    else if (!isRiposte) {
      this.poise -= poise;
      if (this.poise <= 0) { this.poise = this.maxPoise; this._flinch(); }
    }

    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.state = 'dead'; this.t = 0;
      this.fx.hitstop(0.36); this.fx.shake(0.4);
    }
  }

  _flinch() { this.state = 'flinch'; this.t = 0; this.velocity.set(0, 0, 0); }

  _choose(dist) {
    // weight this archetype's own moves by how well they fit the current gap
    const FIT = {
      slam:        d => d < 4.6 ? 3 : 1,
      doubleSwipe: d => d < 4.2 ? 3 : 0,
      sweep:       d => d < 5.0 ? 3 : 0,
      lunge:       d => d > 3.0 ? 4 : 1,
      stomp:       d => (this.phase >= 2 && d < 6.5) ? 3 : 0,
    };
    const pool = [];
    for (const m of this.pool) {
      const n = FIT[m] ? FIT[m](dist) : 1;
      for (let i = 0; i < n; i++) pool.push(m);
    }
    if (!pool.length) return this.pool[0] ?? 'lunge';
    return pool[(Math.random() * pool.length) | 0];
  }

  update(dt, player) {
    this.t += dt;
    if (!this.alive) { this._animate(dt, player); return; }

    this.poise = Math.min(this.maxPoise, this.poise + this.poiseRegen * dt);

    const newPhase = this.hpFrac <= 0.35 ? 3 : (this.hpFrac <= 0.68 ? 2 : 1);
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.fx.shake(0.3);
      this.state = 'roar'; this.t = 0;
    }

    _d.subVectors(player.position, this.position); _d.y = 0;
    const dist = _d.length();
    _d.normalize();

    switch (this.state) {
      case 'idle': case 'approach': {
        const want = Math.atan2(_d.x, _d.z);
        this.facing = angleLerp(this.facing, want, 1 - Math.exp(-6 * dt));
        if (!player.alive) { this.velocity.multiplyScalar(Math.exp(-8 * dt)); break; }
        if (dist > this.aggroRange) { this.velocity.set(0, 0, 0); break; }

        const speed = this.walkSpeed * (this.phase >= 2 ? 1.22 : 1);
        if (dist > 3.0) this.velocity.copy(_d).multiplyScalar(speed);
        else this.velocity.multiplyScalar(Math.exp(-9 * dt));

        // commit to an attack when the cooldown has run out
        this._cd = (this._cd ?? 0.9) - dt;
        if (this._cd <= 0 && dist < 10.5) this._begin(this._choose(dist));
        break;
      }
      case 'attack': {
        const m = this.move;
        this.facing = this.t < m.windup * 0.72
          ? angleLerp(this.facing, Math.atan2(_d.x, _d.z), 1 - Math.exp(-7 * dt))
          : this.facing;

        if (this.t < m.windup) {
          this.velocity.multiplyScalar(Math.exp(-7 * dt));
        } else if (this.t < m.windup + m.active) {
          const sp = m.advance / Math.max(m.active + 0.12, .001);
          this.velocity.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(sp);
          if (!this._hitPlayer) this._tryHit(player, m);
        } else {
          this.velocity.multiplyScalar(Math.exp(-6 * dt));
          if (this.t >= m.windup + m.active + m.recovery) {
            if (m.followUp && Math.random() < 0.72) this._begin(m.followUp);
            else { this.state = 'idle'; this.t = 0; this._cd = this.cooldowns[Math.min(this.phase, 3) - 1]; }
          }
        }
        break;
      }
      case 'flinch':
        this.velocity.multiplyScalar(Math.exp(-9 * dt));
        if (this.t > 0.42) { this.state = 'idle'; this.t = 0; this._cd = 0.3; }
        break;
      case 'stagger':
        this.velocity.set(0, 0, 0);
        if (this.t > 2.4) { this.state = 'idle'; this.t = 0; this._cd = 0.5; this.staggered = false; }
        break;
      case 'roar':
        this.velocity.set(0, 0, 0);
        if (this.t > 1.15) { this.state = 'idle'; this.t = 0; this._cd = 0.4; }
        break;
    }

    this.position.addScaledVector(this.velocity, dt);
    this.obj.rotation.y = this.facing;
    this._animate(dt, player);
  }

  _begin(key) {
    this.move = MOVES[key];
    this.moveKey = key;
    this.state = 'attack';
    this.t = 0;
    this._hitPlayer = false;
  }

  _tryHit(player, m) {
    _d.subVectors(player.position, this.position); _d.y = 0;
    const dist = _d.length();
    if (dist > m.range + this.radius + player.radius) return;
    _d.normalize();
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const cos = _d.x * fx + _d.z * fz;
    if (Math.acos(Math.max(-1, Math.min(1, cos))) > m.arc) return;

    this._hitPlayer = true;
    const dmg = m.dmg * (this.phase >= 3 ? 1.15 : 1);
    const res = player.receive(m.unblockable && player.guarding ? dmg * 1.4 : dmg, this.position, m.parryable ? this : null);
    if (res === 'parried') { this._hitPlayer = true; }
  }

  // Telegraph: each move owns a distinct wind-up pose, and the body glows
  // while it loads. Two moves must never start from the same silhouette.
  _animate(dt, player) {
    const r = this.rig;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const stride = clamp01(speed / Math.max(this.walkSpeed, .1));
    this._step += dt * (2.4 + speed * 1.7);

    let spineX = 0, spineY = 0, headX = 0, bodyX = 0, bodyY = 0, pelvisY = 0, glow = 0;
    let armR = null, armL = null;
    const RATE = 16;

    if (!['dead', 'stagger'].includes(this.state)) {
      const c = walkCycle(r, this._step, stride, dt, 18);
      pelvisY = c.bob; bodyX = c.lean * .5;
      armL = { sx: c.armSwing, elbow: c.elbow - .3 };
      armR = { sx: c.armSwingB, elbow: c.elbow - .3 };
    }

    if (this.state === 'attack') {
      const m = this.move, k = this.t;
      const loading = k < m.windup;
      const w = loading ? ease(clamp01(k / m.windup)) : 1;
      const s = loading ? 0
        : ease(clamp01((k - m.windup) / Math.max(m.active + m.recovery * .4, .001)));
      glow = loading ? w * w : Math.max(0, 1 - s * 3);

      switch (m.tell) {
        case 'rear':    // overhead slam — both arms up and back, body arched
          armR = { sx: -.5 - w * 2.75 + s * 4.2, sz: -.2, elbow: -(.3 + w * 1.25) + s * 1.5 };
          armL = { sx: -.4 - w * 2.35 + s * 3.7, sz: .2, elbow: -(.3 + w * 1.1) + s * 1.3 };
          spineX = -.42 * w + s * 1.0; bodyX = -.22 * w + s * .5;
          headX = -.3 * w + s * .5;
          poseLeg(r.legL, { hip: -.3 * w + s * .6, knee: -.35 - .3 * w }, 16, dt);
          poseLeg(r.legR, { hip: .25 * w - s * .4, knee: -.3 }, 16, dt);
          break;
        case 'wind':    // side swipe — heavy torso twist, one arm cocked wide
          armR = { sx: -.35 - w * 1.5 + s * 2.6, sz: -.5 - w * .95 + s * 1.9,
                   elbow: -(.4 + w * .85) + s * 1.1 };
          armL = { sx: -.2 + w * .45, elbow: -.8, sz: .35 * w };
          spineY = -1.15 * w + s * 2.3;
          spineX = -.12 * w + s * .3;
          headX = .1;
          break;
        case 'crouch':  // lunge — coils low, then fires flat and long
          bodyY = -.42 * w + s * .5; spineX = .55 * w - s * .85;
          armR = { sx: -.3 - w * .9 + s * 2.9, elbow: -(1.4 - w * .3) + s * 1.5, sz: -.3 };
          armL = { sx: -.25 - w * .8 + s * 2.5, elbow: -1.3 + s * 1.3, sz: .3 };
          poseLeg(r.legL, { hip: 1.0 * w - s * 1.5, knee: -1.6 * w + s * 1.4 }, 20, dt);
          poseLeg(r.legR, { hip: .8 * w - s * 1.2, knee: -1.4 * w + s * 1.2 }, 20, dt);
          headX = -.35 * w + s * .5;
          break;
        case 'spin':    // 360 sweep — arms out flat, whole body rotates
          armR = { sx: -1.45, sz: -1.25 * w, elbow: -.25 };
          armL = { sx: -1.45, sz: 1.25 * w, elbow: -.25 };
          spineY = -1.8 * w + s * 6.4;
          bodyX = .12; pelvisY = -.08 * w;
          poseLeg(r.legL, { hip: -.3, knee: -.5 }, 14, dt);
          poseLeg(r.legR, { hip: .3, knee: -.45 }, 14, dt);
          break;
        case 'rise':    // unblockable stomp — rears up tall, then drives down
          bodyY = .72 * w - clamp01(s * 4) * .95;
          armR = { sx: -3.0 * w + clamp01(s * 4) * 3.5, sz: -.45, elbow: -.5 * w };
          armL = { sx: -3.0 * w + clamp01(s * 4) * 3.5, sz: .45, elbow: -.5 * w };
          spineX = -.5 * w + clamp01(s * 4) * 1.15;
          headX = -.55 * w + clamp01(s * 4) * .9;
          poseLeg(r.legL, { hip: -.55 * w + clamp01(s * 4) * 1.0, knee: -.2 - .5 * w }, 18, dt);
          poseLeg(r.legR, { hip: -.5 * w + clamp01(s * 4) * .9, knee: -.2 - .45 * w }, 18, dt);
          break;
      }

    } else if (this.state === 'stagger') {
      // the riposte window: unmistakably helpless, down on one knee
      const k = clamp01(this.t / 2.4);
      const up = ease(clamp01((k - .82) / .18));
      const down = 1 - up;
      spineX = .95 * down; bodyX = .38 * down; headX = .55 * down; bodyY = -.46 * down;
      armR = { sx: .85 * down, elbow: -.3, sz: -.55 * down };
      armL = { sx: .7 * down, elbow: -.35, sz: .55 * down };
      poseLeg(r.legL, { hip: 1.25 * down, knee: -1.85 * down }, 12, dt);
      poseLeg(r.legR, { hip: -.4 * down, knee: -.6 * down }, 12, dt);

    } else if (this.state === 'flinch') {
      const j2 = arc(clamp01(this.t / 0.42));
      spineX = -.5 * j2; headX = -.45 * j2; spineY = .35 * j2;
      armR = { sx: .5 * j2, elbow: -.4 }; armL = { sx: .4 * j2, elbow: -.4 };

    } else if (this.state === 'roar') {
      const k = clamp01(this.t / 1.15), a2 = arc(k);
      spineX = -.62 * a2; headX = -.85 * a2;
      armR = { sx: -2.5 * a2, sz: -.9 * a2, elbow: -.6 * a2 };
      armL = { sx: -2.5 * a2, sz: .9 * a2, elbow: -.6 * a2 };
      bodyY = a2 * .16; glow = a2;

    } else if (this.state === 'dead') {
      r.body.rotation.x = damp(r.body.rotation.x, -1.42, 5, dt);
      r.body.position.y = damp(r.body.position.y, -.55, 5, dt);
      r.body.rotation.z = damp(r.body.rotation.z, -.26, 5, dt);
      poseLeg(r.legL, { hip: -.45, knee: -1.0 }, 5, dt);
      poseLeg(r.legR, { hip: -.2, knee: -.6 }, 5, dt);
      poseArm(r.armL, { sx: .8, elbow: -.3, sz: .7 }, 5, dt);
      poseArm(r.armR, { sx: .65, elbow: -.35, sz: -.6 }, 5, dt);
      r.spine.rotation.x = damp(r.spine.rotation.x, .35, 5, dt);
      r.head.rotation.x = damp(r.head.rotation.x, .5, 5, dt);
      this._paint(0);
      return;

    } else {
      const br = Math.sin(this.t * 1.3) * .05 * (1 - stride);
      spineX = .05 + br; headX = -br;
    }

    if (armR) poseArm(r.armR, armR, RATE, dt);
    if (armL) poseArm(r.armL, armL, RATE, dt);

    r.pelvis.position.y = damp(r.pelvis.position.y, 0.92 + pelvisY, 15, dt);
    r.spine.rotation.x = damp(r.spine.rotation.x, spineX, RATE, dt);
    r.spine.rotation.y = damp(r.spine.rotation.y, spineY, RATE, dt);
    r.chest.rotation.y = damp(r.chest.rotation.y, spineY * .4, RATE, dt);
    r.head.rotation.x  = damp(r.head.rotation.x, headX, 12, dt);
    r.head.rotation.y  = damp(r.head.rotation.y, -spineY * .5, 12, dt);
    r.body.rotation.x  = damp(r.body.rotation.x, bodyX, 14, dt);
    r.body.position.y  = damp(r.body.position.y, bodyY, 14, dt);

    this._paint(glow);
  }

  _paint(glow) {
    const em = this.phase >= 3 ? 0xd1452e : (this.move?.unblockable ? 0xff5a2a : 0xd9a441);
    const k = glow * (this.move?.unblockable ? 1.6 : 0.9);
    this.obj.traverse((o) => {
      if (o.isMesh && o.material?.emissive) {
        o.material.emissive.setHex(em);
        o.material.emissiveIntensity = k;
      }
    });
  }
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
