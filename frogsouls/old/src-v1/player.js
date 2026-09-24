import * as THREE from 'three';
import { PLAYER as P, WEAPONS, FEEL } from './config.js';
import { buildActor, buildWeaponMesh } from './actor.js';
import { poseArm, poseLeg, walkCycle, damp, ease, arc, clamp01 } from './anim.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
const _tip = new THREE.Vector3(), _prevTip = new THREE.Vector3();

export class Player {
  constructor(scene, fx) {
    this.fx = fx;
    this.obj = buildActor({ scale: 1, skin: 0x6d8f4e, cloth: 0x23261f, accent: 0x8fae4b, build: 'normal' });
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

  // ── procedural animation ──────────────────────────────────────────────────
  // Rewritten against the two-bone rig: knees and elbows actually bend, the
  // torso leads every swing, and the roll is a real forward tuck.
  _animate(dt) {
    const r = this.rig, A = this._anim;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const stride = clamp01(speed / P.sprintSpeed);
    A.step += dt * (3.1 + speed * 2.15);

    // defaults every state can override
    let spineX = 0, spineY = 0, spineZ = 0, headX = 0, pelvisY = 0, bodyX = 0, bodyY = 0;
    let armR = null, armL = null;
    const RATE = 20;

    const grounded = !['roll', 'backstep', 'dead'].includes(this.state);
    if (grounded) {
      const c = walkCycle(r, A.step, stride, dt, 22);
      pelvisY = c.bob; spineZ = c.roll; bodyX = c.lean * .6; headX = -c.lean * .4;
      armL = { sx: c.armSwing, elbow: c.elbow, sz: .10 };
      // the weapon arm hangs heavier and swings less — it is carrying something
      armR = { sx: c.armSwingB * .55 - .12, elbow: c.elbow * .6 - .30,
               sz: -.20, wrist: -.18 };
    }

    switch (this.state) {
      case 'roll': {
        const k = clamp01(this.t / P.roll.duration);
        bodyX = k * Math.PI * 2;                       // forward tuck, not a barrel roll
        bodyY = -arc(k) * .40;
        const tuck = arc(k);
        poseLeg(r.legL, { hip: 1.9 * tuck, knee: -2.3 * tuck }, 26, dt);
        poseLeg(r.legR, { hip: 1.7 * tuck, knee: -2.2 * tuck }, 26, dt);
        armL = { sx: -.5 - 1.5 * tuck, elbow: -2.1 * tuck };
        armR = { sx: -.4 - 1.3 * tuck, elbow: -1.9 * tuck };
        spineX = .9 * tuck;
        break;
      }
      case 'backstep': {
        const k = clamp01(this.t / P.backstep.duration);
        const hop = arc(k);
        bodyY = hop * .18; bodyX = -.34 * hop;
        poseLeg(r.legL, { hip: -.7 * hop, knee: -1.5 * hop }, 26, dt);
        poseLeg(r.legR, { hip: -.5 * hop, knee: -1.3 * hop }, 26, dt);
        armL = { sx: .5 * hop, elbow: -.7 }; armR = { sx: .3 * hop, elbow: -.9, sz: -.2 };
        spineX = -.25 * hop;
        break;
      }
      case 'light': case 'heavy': {
        const a = this.weapon[this._attackKind];
        const total = a.startup + a.active + a.recovery;
        const windK = clamp01(this.t / a.startup);
        const swingK = clamp01((this.t - a.startup) / (a.active + a.recovery * .55));
        const heavy = this._attackKind === 'heavy';
        const side = this.comboStep % 2 === 1 ? -1 : 1;   // alternate the swing side

        if (this.t < a.startup) {
          const w = ease(windK);
          // load: weapon goes back and up, torso winds against it
          armR = { sx: -.4 - w * (heavy ? 2.55 : 1.85),
                   sz: -.25 - w * side * .55,
                   elbow: -(.4 + w * (heavy ? 1.5 : 1.0)),
                   wrist: -w * .5 };
          armL = { sx: -.2 + w * .5, elbow: -(.5 + w * .8), sz: w * .35 * side };
          spineY = w * .75 * side;
          spineX = -(heavy ? .34 : .20) * w;
          bodyX = -.10 * w;
          poseLeg(r.legL, { hip: -.18 * w, knee: -.30 - .25 * w }, 18, dt);
          poseLeg(r.legR, { hip: .22 * w, knee: -.24 }, 18, dt);
        } else {
          const sK = ease(clamp01(swingK * 1.35));
          // release: the torso unwinds first, the arm follows through past it
          armR = { sx: -.4 - (heavy ? 2.55 : 1.85) + sK * (heavy ? 4.1 : 3.3),
                   sz: -.25 - side * .55 + sK * side * 1.05,
                   elbow: -(.4 + (heavy ? 1.5 : 1.0)) + sK * (heavy ? 1.7 : 1.25),
                   wrist: -.5 + sK * .85 };
          armL = { sx: .3 - sK * .55, elbow: -(1.3) + sK * .5, sz: .35 * side - sK * .6 * side };
          spineY = .75 * side - sK * 1.5 * side;
          spineX = -(heavy ? .34 : .20) + sK * (heavy ? .72 : .5);
          bodyX = -.10 + sK * .26;
          poseLeg(r.legL, { hip: -.18 + sK * .55, knee: -.30 - .3 * (1 - sK) }, 18, dt);
          poseLeg(r.legR, { hip: .22 - sK * .45, knee: -.24 - sK * .35 }, 18, dt);
        }
        headX = spineX * .5;
        break;
      }
      case 'parry': {
        const total = P.parry.startup + P.parry.window + P.parry.recovery;
        const k = clamp01(this.t / total);
        const flick = arc(clamp01(k * 3.0));
        armR = { sx: -.55 - flick * 1.35, sz: -.9 + flick * 1.5,
                 elbow: -(.8 + flick * .7), wrist: flick * 1.1 };
        armL = { sx: -.4, elbow: -1.1, sz: .3 };
        spineY = -flick * .75;
        spineX = .1;
        break;
      }
      case 'block': {
        armR = { sx: -1.05, sz: -.62, elbow: -1.35, wrist: -.3 };
        armL = { sx: -1.25, sz: .55, elbow: -1.55 };
        spineY = .30; spineX = .16; bodyX = .10; headX = .1;
        poseLeg(r.legL, { hip: -.20, knee: -.45 }, 16, dt);
        poseLeg(r.legR, { hip: .26, knee: -.40 }, 16, dt);
        break;
      }
      case 'riposte': {
        const k = clamp01(this.t / P.riposte.duration);
        const thrust = ease(clamp01(k * 2.2));
        const settle = ease(clamp01((k - .55) / .45));
        armR = { sx: -2.3 + thrust * 3.5 - settle * .7, elbow: -1.6 + thrust * 1.5,
                 sz: -.3, wrist: -.4 + thrust * .8 };
        armL = { sx: -.9 + thrust * .6, elbow: -1.2 };
        spineX = -.3 + thrust * .85 - settle * .4;
        bodyX = thrust * .3 - settle * .25;
        poseLeg(r.legL, { hip: -.55 * thrust, knee: -.8 * thrust }, 18, dt);
        poseLeg(r.legR, { hip: .5 * thrust, knee: -.3 }, 18, dt);
        headX = .35 * thrust;
        break;
      }
      case 'hurt': {
        const k = clamp01(this.t / P.hurtStun);
        const j = arc(k);
        spineX = -.55 * j; bodyX = -.28 * j; headX = -.4 * j;
        armR = { sx: .55 * j, elbow: -.5, sz: -.5 * j };
        armL = { sx: .45 * j, elbow: -.45, sz: .5 * j };
        break;
      }
      case 'guardbreak': {
        const k = clamp01(this.t / P.block.guardBreakStun);
        const open = ease(clamp01(k * 3)) * (1 - ease(clamp01((k - .7) / .3)));
        spineX = -.78 * open; headX = -.6 * open;
        armR = { sx: 1.1 * open, sz: -.9 * open, elbow: -.25 };
        armL = { sx: .95 * open, sz: .9 * open, elbow: -.25 };
        poseLeg(r.legL, { hip: -.4 * open, knee: -.55 }, 14, dt);
        poseLeg(r.legR, { hip: .3 * open, knee: -.5 }, 14, dt);
        break;
      }
      case 'dead': {
        const k = ease(clamp01(this.t / 1.1));
        r.body.rotation.x = damp(r.body.rotation.x, -1.48, 8, dt);
        r.body.position.y = damp(r.body.position.y, -.46, 8, dt);
        r.body.rotation.z = damp(r.body.rotation.z, .22, 8, dt);
        poseLeg(r.legL, { hip: -.5, knee: -.9 }, 7, dt);
        poseLeg(r.legR, { hip: -.25, knee: -.55 }, 7, dt);
        poseArm(r.armL, { sx: .7, elbow: -.35, sz: .6 }, 7, dt);
        poseArm(r.armR, { sx: .55, elbow: -.4, sz: -.5 }, 7, dt);
        r.spine.rotation.x = damp(r.spine.rotation.x, .3, 7, dt);
        r.head.rotation.x = damp(r.head.rotation.x, .45, 7, dt);
        return;
      }
      default: {   // idle / move — a slow breath so the frame is never dead
        const br = Math.sin(this.t * 1.7) * .035 * (1 - stride);
        spineX = .04 + br; headX = -br * .8;
        break;
      }
    }

    if (armR) poseArm(r.armR, armR, RATE, dt);
    if (armL) poseArm(r.armL, armL, RATE, dt);

    r.pelvis.position.y = damp(r.pelvis.position.y, 0.92 + pelvisY, 18, dt);
    r.spine.rotation.x = damp(r.spine.rotation.x, spineX, RATE, dt);
    r.spine.rotation.y = damp(r.spine.rotation.y, spineY, RATE, dt);
    r.spine.rotation.z = damp(r.spine.rotation.z, spineZ, RATE, dt);
    r.chest.rotation.y = damp(r.chest.rotation.y, spineY * .45, RATE, dt);
    r.head.rotation.x  = damp(r.head.rotation.x, headX, 14, dt);
    r.head.rotation.y  = damp(r.head.rotation.y, -spineY * .55, 14, dt);
    const snap = this.state === 'roll' || this.state === 'backstep';
    r.body.rotation.x  = snap ? bodyX : damp(r.body.rotation.x, bodyX, 16, dt);
    r.body.rotation.z  = damp(r.body.rotation.z, 0, 16, dt);
    r.body.position.y  = snap ? bodyY : damp(r.body.position.y, bodyY, 16, dt);
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
