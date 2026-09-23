import * as THREE from 'three';
import { buildActor } from './actor.js';
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

    this.obj = buildActor({ scale: this.scale, skin: 0x6a5f4e, cloth: 0x1d1a17, accent: 0xb8933f });
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

  // Telegraph colour: the boss glows in the wind-up so attacks are readable.
  _animate(dt, player) {
    const r = this.rig;
    this._step += dt * (2 + Math.hypot(this.velocity.x, this.velocity.z) * 1.3);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const stride = Math.min(speed / 3.4, 1);
    const sw = Math.sin(this._step * 2.1) * stride * 0.8;
    r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
    r.armL.rotation.x = -sw * 0.5; r.armR.rotation.x = -sw * 0.5;
    r.pelvis.position.y = 0.92 + Math.abs(Math.sin(this._step * 2.1)) * stride * 0.05;

    let glow = 0;

    if (this.state === 'attack') {
      const m = this.move, k = this.t;
      if (k < m.windup) {
        const w = k / m.windup;
        glow = w * w;
        switch (m.tell) {
          case 'rear':   r.armR.rotation.x = -0.5 - w * 2.6; r.body.rotation.x = -0.35 * w; break;
          case 'wind':   r.armR.rotation.x = -0.4 - w * 2.0; r.chest.rotation.y = -1.0 * w; break;
          case 'crouch': r.body.position.y = -0.34 * w; r.legL.rotation.x = r.legR.rotation.x = 0.85 * w;
                         r.body.rotation.x = 0.4 * w; break;
          case 'spin':   r.chest.rotation.y = -1.6 * w; r.armR.rotation.x = -1.5;
                         r.armL.rotation.x = -1.5; break;
          case 'rise':   r.body.position.y = 0.6 * w; r.armR.rotation.x = -2.8 * w;
                         r.armL.rotation.x = -2.8 * w; break;
        }
      } else {
        const s = Math.min(1, (k - m.windup) / Math.max(m.active + m.recovery * 0.35, .001));
        glow = Math.max(0, 1 - s * 3);
        switch (m.tell) {
          case 'rear':   r.armR.rotation.x = -3.1 + s * 4.3; r.body.rotation.x = -0.35 + s * 0.8; break;
          case 'wind':   r.armR.rotation.x = -2.4 + s * 3.6; r.chest.rotation.y = -1.0 + s * 2.0; break;
          case 'crouch': r.body.position.y = -0.34 + s * 0.34; r.body.rotation.x = 0.4 - s * 0.55;
                         r.legL.rotation.x = 0.85 - s * 1.5; r.legR.rotation.x = 0.85 - s * 1.2; break;
          case 'spin':   r.chest.rotation.y = -1.6 + s * 5.2; break;
          case 'rise':   r.body.position.y = 0.6 - Math.min(1, s * 5) * 0.82;
                         r.armR.rotation.x = -2.8 + Math.min(1, s * 5) * 3.4;
                         r.armL.rotation.x = -2.8 + Math.min(1, s * 5) * 3.4; break;
        }
      }
    } else if (this.state === 'stagger') {
      const k = Math.min(1, this.t / 2.4);
      r.body.rotation.x = 0.85; r.body.position.y = -0.4;
      r.armL.rotation.x = 0.5; r.armR.rotation.x = 0.5;
      r.head.rotation.x = 0.5;
      glow = 0;
    } else if (this.state === 'flinch') {
      const k = this.t / 0.42;
      r.body.rotation.x = -0.45 * (1 - k);
      r.chest.rotation.y = 0.3 * (1 - k);
    } else if (this.state === 'roar') {
      const k = Math.min(1, this.t / 1.15);
      r.body.rotation.x = -0.55 * Math.sin(k * Math.PI);
      r.armL.rotation.x = -2.4 * Math.sin(k * Math.PI);
      r.armR.rotation.x = -2.4 * Math.sin(k * Math.PI);
      r.head.rotation.x = -0.8 * Math.sin(k * Math.PI);
      glow = Math.sin(k * Math.PI);
    } else if (this.state === 'dead') {
      const k = Math.min(1, this.t / 1.6);
      r.body.rotation.x = k * -1.45;
      r.body.position.y = -k * 0.5;
      r.armL.rotation.x = r.armR.rotation.x = k * 0.6;
    } else {
      r.body.rotation.x *= Math.exp(-8 * dt);
      r.body.position.y *= Math.exp(-8 * dt);
      r.chest.rotation.y *= Math.exp(-8 * dt);
      r.head.rotation.x *= Math.exp(-8 * dt);
    }

    // paint the telegraph
    const em = this.phase >= 3 ? 0xd1452e : 0xd9a441;
    this.obj.traverse((o) => {
      if (o.isMesh && o.material?.emissive) {
        o.material.emissive.setHex(em);
        o.material.emissiveIntensity = glow * (this.move?.unblockable ? 1.5 : 0.85);
      }
    });
  }
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
