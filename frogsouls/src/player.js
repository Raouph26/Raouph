import * as THREE from 'three';
import { PLAYER as P, WEAPONS, FEEL } from './config.js';
import { buildActor, buildWeaponMesh } from './actor.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
const _tip = new THREE.Vector3(), _prevTip = new THREE.Vector3();

export class Player {
  constructor(scene, fx) {
    this.fx = fx;
    this.obj = buildActor({ scale: 1, skin: 0x6d8f4e, cloth: 0x2a2d28, accent: 0x8fae4b });
    scene.add(this.obj);
    this.rig = this.obj.userData.rig;

    this.position = this.obj.position;
    this.velocity = new THREE.Vector3();
    this.facing = 0;                      // yaw, radians
    this.lockHeight = 1.5;
    this.radius = P.radius;

    this.hp = P.maxHp;
    this.stamina = P.maxStamina;
    this.staminaLock = 0;

    this.state = 'idle';
    this.t = 0;                            // time in current state
    this.iframes = 0;
    this.comboStep = 0;
    this.comboGrace = 0;
    this.alive = true;
    this.deaths = 0;

    this.weaponKey = 'cleaver';
    this._weaponMesh = null;
    this.setWeapon('cleaver');

    this._hitThisSwing = new Set();
    this._anim = { swing: 0, lean: 0, step: 0 };
  }

  get weapon() { return WEAPONS[this.weaponKey]; }

  setWeapon(key) {
    if (!WEAPONS[key] || this.state === 'dead') return;
    this.weaponKey = key;
    if (this._weaponMesh) this.rig.weapon.remove(this._weaponMesh);
    this._weaponMesh = buildWeaponMesh(key, WEAPONS[key].accent);
    this.rig.weapon.add(this._weaponMesh);
  }

  get busy() {
    return ['roll', 'backstep', 'light', 'heavy', 'parry', 'riposte', 'hurt', 'guardbreak', 'dead']
      .includes(this.state);
  }
  get guarding() { return this.state === 'block'; }
  get parrying() {
    return this.state === 'parry' && this.t >= P.parry.startup &&
           this.t < P.parry.startup + P.parry.window;
  }

  spend(n) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaLock = P.staminaRegenDelay;
  }
  get canAct() { return this.stamina > 0; }

  enter(s) { this.state = s; this.t = 0; }

  // ── input → state ──────────────────────────────────────────────────────────
  handleInput(input, cam, enemies) {
    if (!this.alive) { if (input.take('retry')) this.wantRetry = true; return; }

    for (const [k, w] of [['w1', 'cleaver'], ['w2', 'rapier'], ['w3', 'maul']])
      if (input.take(k) && !this.busy) this.setWeapon(w);

    if (this.busy) {
      // combo continuation is the one thing allowed during attack recovery
      if ((this.state === 'light') && this.t > this.weapon.light.startup + this.weapon.light.active
          && input.peek('light') && this.comboStep + 1 < this.weapon.combo && this.canAct) {
        input.take('light');
        this.comboStep++;
        this._startAttack('light');
      }
      return;
    }

    if (input.take('roll') && this.canAct) {
      const moving = input.moveAxis(_d);
      this.spend(moving ? P.roll.cost : P.backstep.cost);
      if (moving) {
        this._aimFromInput(input, cam);
        this.enter('roll');
      } else this.enter('backstep');
      return;
    }
    if (input.take('parry') && this.canAct) { this.spend(P.parry.cost); this.enter('parry'); return; }
    if (input.take('heavy') && this.canAct)  { this.comboStep = 0; this._startAttack('heavy'); return; }
    if (input.take('light') && this.canAct)  { this.comboStep = 0; this._startAttack('light'); return; }

    if (input.blocking && this.canAct) { if (this.state !== 'block') this.enter('block'); }
    else if (this.state === 'block') this.enter('idle');
  }

  _startAttack(kind) {
    this._hitThisSwing.clear();
    const a = this.weapon[kind];
    this.spend(a.cost);
    this.enter(kind);
    this._attackKind = kind;
    this._lunge = a.step;
  }

  _aimFromInput(input, cam) {
    if (!input.moveAxis(_d)) return;
    cam.basis(_f, _r);
    const dir = new THREE.Vector3()
      .addScaledVector(_f, -_d.y)
      .addScaledVector(_r, -_d.x).normalize();
    this.facing = Math.atan2(dir.x, dir.z);
    this._rollDir = dir;
  }

  // ── per-frame ──────────────────────────────────────────────────────────────
  update(dt, input, cam, enemies) {
    this.t += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.comboGrace = Math.max(0, this.comboGrace - dt);
    this.staminaLock = Math.max(0, this.staminaLock - dt);
    if (this.staminaLock === 0 && this.alive)
      this.stamina = Math.min(P.maxStamina, this.stamina + P.staminaRegen * dt);

    const locked = cam.target;

    switch (this.state) {
      case 'roll': {
        if (this.t >= P.roll.startup && this.t < P.roll.startup + P.roll.iframes) this.iframes = 0.02;
        const k = Math.min(1, this.t / P.roll.duration);
        const speed = (P.roll.distance / P.roll.duration) * (1.55 * (1 - k) + 0.35);
        if (this._rollDir) this.velocity.copy(this._rollDir).multiplyScalar(speed);
        if (this.t >= P.roll.duration + P.roll.recovery) this.enter('idle');
        break;
      }
      case 'backstep': {
        if (this.t < P.backstep.iframes) this.iframes = 0.02;
        const k = Math.min(1, this.t / P.backstep.duration);
        const sp = (P.backstep.distance / P.backstep.duration) * (1.7 * (1 - k) + 0.2);
        _d.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(-sp);
        this.velocity.copy(_d);
        if (this.t >= P.backstep.duration) this.enter('idle');
        break;
      }
      case 'light': case 'heavy': {
        const a = this.weapon[this._attackKind];
        if (this.t < a.startup) {
          const sp = this._lunge / Math.max(a.startup, .001) * 0.55;
          _d.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(sp);
          this.velocity.lerp(_d, 1 - Math.exp(-12 * dt));
        } else this.velocity.multiplyScalar(Math.exp(-11 * dt));
        if (this.t >= a.startup && this.t < a.startup + a.active) this._sweep(enemies, a);
        if (this.t >= a.startup + a.active + a.recovery) { this.comboStep = 0; this.enter('idle'); }
        break;
      }
      case 'parry':
        this.velocity.multiplyScalar(Math.exp(-14 * dt));
        if (this.t >= P.parry.startup + P.parry.window + P.parry.recovery) this.enter('idle');
        break;
      case 'riposte':
        this.velocity.set(0, 0, 0);
        if (this.t >= P.riposte.duration) this.enter('idle');
        break;
      case 'hurt':
        this.velocity.multiplyScalar(Math.exp(-7 * dt));
        if (this.t >= P.hurtStun) this.enter('idle');
        break;
      case 'guardbreak':
        this.velocity.multiplyScalar(Math.exp(-6 * dt));
        if (this.t >= P.block.guardBreakStun) this.enter('idle');
        break;
      case 'dead':
        this.velocity.multiplyScalar(Math.exp(-5 * dt));
        break;
      default: this._locomote(dt, input, cam, locked); break;
    }

    this.position.addScaledVector(this.velocity, dt);

    // face the lock target unless mid-roll
    if (locked && locked.alive && !['roll', 'backstep'].includes(this.state)) {
      _d.subVectors(locked.position, this.position);
      const want = Math.atan2(_d.x, _d.z);
      this.facing = angleLerp(this.facing, want, 1 - Math.exp(-16 * dt));
    }
    this.obj.rotation.y = this.facing;
    this._animate(dt);
  }

  _locomote(dt, input, cam, locked) {
    const moving = input.moveAxis(_d);
    const blocking = this.state === 'block';
    let target = _f.set(0, 0, 0);

    if (moving) {
      cam.basis(_f, _r);
      target = new THREE.Vector3()
        .addScaledVector(_f, -_d.y)
        .addScaledVector(_r, -_d.x).normalize();

      let sp = locked ? P.lockStrafeSpeed : P.walkSpeed;
      if (input.sprinting && !blocking && this.stamina > 6) {
        sp = P.sprintSpeed;
        if (!locked || _d.y < -0.4) this.stamina = Math.max(0, this.stamina - 11 * dt);
      }
      if (blocking) sp *= P.block.moveScale;
      target.multiplyScalar(sp);

      if (!locked) {
        const want = Math.atan2(target.x, target.z);
        this.facing = angleLerp(this.facing, want, 1 - Math.exp(-P.turnRate * dt));
      }
      if (this.state === 'idle') this.state = 'move';
    } else if (this.state === 'move') this.state = 'idle';

    const a = moving ? P.accel : P.friction;
    this.velocity.lerp(target, 1 - Math.exp(-a * dt * 0.42));
    if (!moving && this.velocity.lengthSq() < 0.004) this.velocity.set(0, 0, 0);
  }

  // ── weapon sweep: swept-sphere from last tip position to current ───────────
  _sweep(enemies, a) {
    const tipNode = this._weaponMesh?.userData.tip;
    if (!tipNode) return;
    tipNode.getWorldPosition(_tip);
    if (!this._prevValid) { _prevTip.copy(_tip); this._prevValid = true; }

    for (const e of enemies) {
      if (!e.alive || this._hitThisSwing.has(e)) continue;
      if (segmentHitsCapsule(_prevTip, _tip, e.position, e.radius + 0.42, e.capsuleHeight ?? 2.0)) {
        this._hitThisSwing.add(e);
        e.takeHit(a.dmg, a.poise, this.position);
        const heavy = this._attackKind === 'heavy';
        this.fx.hitstop(heavy ? FEEL.hitstopHeavy : FEEL.hitstopLight);
        this.fx.shake(heavy ? FEEL.shakeHeavy : FEEL.shakeLight);
        this.fx.sparks(_tip, this.weapon.accent);
      }
    }
    _prevTip.copy(_tip);
  }

  // ── incoming ───────────────────────────────────────────────────────────────
  /** @returns 'parried' | 'blocked' | 'hit' | 'iframe' */
  receive(dmg, fromPos, attacker) {
    if (!this.alive) return 'iframe';
    if (this.iframes > 0) return 'iframe';

    if (this.parrying) {
      this.fx.hitstop(FEEL.hitstopParry);
      this.fx.shake(FEEL.shakeParry);
      this.fx.flash(FEEL.flashParry);
      attacker?.stagger?.();
      return 'parried';
    }

    // facing check: blocks only work on the front arc
    _d.subVectors(fromPos, this.position).normalize();
    const front = _d.x * Math.sin(this.facing) + _d.z * Math.cos(this.facing);

    if (this.guarding && front > 0.15) {
      const chip = dmg * P.block.staminaPerDamage;
      if (chip >= this.stamina) {
        this.stamina = 0;
        this.staminaLock = P.block.guardBreakRegenDelay;
        this.enter('guardbreak');
        this.hp -= dmg * (1 - P.block.absorb * 0.5);
        this.fx.shake(0.3);
      } else {
        this.spend(chip);
        this.hp -= dmg * (1 - P.block.absorb);
        this.fx.hitstop(0.05);
        this.fx.shake(0.1);
      }
    } else {
      this.hp -= dmg;
      this.iframes = P.invulnAfterHit;
      this.enter('hurt');
      _d.multiplyScalar(-4.2); _d.y = 0;
      this.velocity.copy(_d);
      this.fx.hitstop(0.07);
      this.fx.shake(0.2);
    }

    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.deaths++; this.enter('dead'); }
    return 'hit';
  }

  riposte(target) {
    this.enter('riposte');
    target.takeHit(P.riposte.damage, 999, this.position, true);
    this.fx.hitstop(FEEL.hitstopRiposte);
    this.fx.shake(0.3);
  }

  respawn(at) {
    this.hp = P.maxHp; this.stamina = P.maxStamina;
    this.alive = true; this.iframes = 0.8;
    this.velocity.set(0, 0, 0);
    this.position.copy(at);
    this.enter('idle');
    this.wantRetry = false;
  }

  // ── procedural animation (placeholder rig only) ────────────────────────────
  _animate(dt) {
    const r = this.rig, A = this._anim;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    A.step += dt * (2.2 + speed * 1.55);

    const stride = Math.min(speed / P.sprintSpeed, 1);
    const sw = Math.sin(A.step * 2.4) * stride * 0.85;

    r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
    r.armL.rotation.x = -sw * 0.55;
    r.pelvis.position.y = 0.92 + Math.abs(Math.sin(A.step * 2.4)) * stride * 0.055;

    let armR = -sw * 0.55, lean = 0, roll = 0, bodyY = 0;

    switch (this.state) {
      case 'roll': {
        const k = Math.min(1, this.t / P.roll.duration);
        roll = k * Math.PI * 2;
        bodyY = -Math.sin(k * Math.PI) * 0.34;
        r.legL.rotation.x = r.legR.rotation.x = -1.5 * Math.sin(k * Math.PI);
        armR = -2.2 * Math.sin(k * Math.PI);
        break;
      }
      case 'backstep': lean = -0.4 * Math.sin(Math.min(1, this.t / P.backstep.duration) * Math.PI); break;
      case 'light': case 'heavy': {
        const a = this.weapon[this._attackKind];
        const total = a.startup + a.active + a.recovery;
        const k = Math.min(1, this.t / total);
        const wind = a.startup / total;
        if (k < wind) {
          const w = k / wind;
          armR = -1.1 - w * 1.5;               // big readable wind-up
          lean = -0.28 * w;
        } else {
          const s = (k - wind) / (1 - wind);
          armR = -2.6 + Math.min(1, s * 4.4) * 4.0;
          lean = -0.28 + Math.min(1, s * 3.6) * 0.62;
        }
        if (this.comboStep % 2 === 1) r.chest.rotation.y = Math.sin(k * Math.PI) * 0.5;
        else r.chest.rotation.y = -Math.sin(k * Math.PI) * 0.35;
        break;
      }
      case 'parry': {
        const k = Math.min(1, this.t / (P.parry.startup + P.parry.window + P.parry.recovery));
        armR = -0.6 - Math.sin(Math.min(1, k * 3.2) * Math.PI) * 1.9;
        r.chest.rotation.y = -Math.sin(Math.min(1, k * 3) * Math.PI) * 0.6;
        break;
      }
      case 'block':
        armR = -1.35; r.armL.rotation.x = -1.15; lean = 0.12;
        r.chest.rotation.y = 0.24;
        break;
      case 'riposte': {
        const k = Math.min(1, this.t / P.riposte.duration);
        armR = -2.4 + Math.min(1, k * 2.4) * 3.6;
        lean = 0.4 * Math.sin(k * Math.PI);
        break;
      }
      case 'hurt':      lean = -0.5 * (1 - this.t / P.hurtStun); break;
      case 'guardbreak':lean = -0.75; armR = 0.9; r.armL.rotation.x = 0.7; break;
      case 'dead': {
        const k = Math.min(1, this.t / 0.9);
        r.body.rotation.x = k * -1.5; r.body.position.y = -k * 0.42;
        this.rig.chest.rotation.y = 0;
        return;
      }
    }

    r.armR.rotation.x = armR;
    r.body.rotation.x = lean;
    r.body.rotation.z = roll;
    r.body.position.y = bodyY;
    if (!['light', 'heavy', 'parry', 'block'].includes(this.state))
      r.chest.rotation.y *= Math.exp(-9 * dt);
    r.head.rotation.x = -lean * 0.6;
  }
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Swept sphere (segment) vs upright capsule, cheap and good enough. */
function segmentHitsCapsule(p0, p1, base, radius, height) {
  const ay = base.y, by = base.y + height;
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = p0.x + (p1.x - p0.x) * t;
    const y = p0.y + (p1.y - p0.y) * t;
    const z = p0.z + (p1.z - p0.z) * t;
    const cy = Math.max(ay, Math.min(by, y));
    const dx = x - base.x, dy = y - cy, dz = z - base.z;
    if (dx * dx + dy * dy + dz * dz <= radius * radius) return true;
  }
  return false;
}
