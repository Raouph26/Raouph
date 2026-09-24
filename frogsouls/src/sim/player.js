import { WEAPONS } from './weapons.js';
import { angleDiff, clamp, damp, inArc, turnToward, yawTo } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// The frog, as pure simulation. Reads an Intent each tick, never a device.
// Keyboard, touch, gamepad and the balancing bot all speak the same Intent:
//   { mx, mz }     desired move direction in WORLD space, magnitude 0..1
//   sprint         held
//   block          held
//   light heavy roll parry heal   pressed this tick (buffered here)
// ─────────────────────────────────────────────────────────────────────────────

export const PLAYER = {
  radius: 0.45,
  height: 1.8,
  baseHp: 100,
  baseStamina: 100,
  walk: 3.3, run: 4.4, sprint: 6.4, strafe: 3.1,
  accel: 13, decel: 16,
  turn: 14, lockTurn: 11, attackTurn: 7,

  staminaRegen: 46, regenDelay: 0.55, blockRegenScale: 0.35,
  sprintDrain: 13,

  // DS3's medium roll is invincible for 13 frames of 30 (0.43 s); a thumb on
  // glass is slower than a thumb on a pad, so ours sits closer to that
  roll:     { cost: 22, startup: .04, iframes: .34, duration: .56, recovery: .10, distance: 4.1 },

  parry: { cost: 12, startup: .05, window: .16, recovery: .42 },
  riposte: { duration: 1.05, range: 2.7, iframes: 1.05, hitAt: .3 },     // the blade lands at hitAt

  flask: { duration: 1.05, applyAt: .56, moveScale: .35 },

  hurt: .38, knockdown: 1.15, knockdownIframes: .85, knockdownRollAfter: .6,
  guardBreak: 1.25, invulnAfterHit: .25,

  buffer: .28,
};

const ACTIONS = ['light', 'heavy', 'roll', 'parry', 'heal'];

export class PlayerSim {
  constructor(fight, stats = {}) {
    this.fight = fight;
    this.kind = 'player';
    this.id = 'player';

    this.x = 0; this.z = 8; this.y = 0;
    this.vx = 0; this.vz = 0;
    this.yaw = Math.PI;             // face the arena centre / boss spawn
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;

    this.applyStats(stats);
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.flasks = this.maxFlasks;

    this.state = 'idle';
    this.t = 0;
    this.iframes = 0;
    this.hyper = false;
    this.regenLock = 0;
    this.alive = true;
    this.sprinting = false;
    this.moving = 0;              // 0..1 locomotion blend, read by the renderer

    this.atk = null;              // { spec, kind, idx, hit:Set }
    this.buf = null;              // { action, age }
    this.healApplied = false;
    this.rollDir = 0;
    this.rollRel = 0;
    this.lastHitBy = null;

    this.stats = { hitsTaken: 0, hitsLanded: 0, parries: 0, blocks: 0, rolls: 0, heals: 0, dmgDealt: 0, dmgTaken: 0 };
  }

  applyStats(s) {
    this.weaponId = s.weapon ?? this.weaponId ?? 'cleaver';
    this.maxHp = PLAYER.baseHp + (s.vigor ?? 0) * 11;
    this.maxStamina = PLAYER.baseStamina + (s.endurance ?? 0) * 8;
    this.dmgMult = 1 + (s.strength ?? 0) * 0.065;
    this.maxFlasks = 3 + (s.flask ?? 0);
    this.flaskHeal = 0.40 + (s.potency ?? 0) * 0.04;
  }

  get weapon() { return WEAPONS[this.weaponId]; }
  get mods() { return this.fight.mods; }

  get busy() {
    return !(this.state === 'idle' || this.state === 'move' || this.state === 'block');
  }
  get guarding() { return this.state === 'block' && !this.mods.noBlock; }
  get parryActive() {
    return this.state === 'parry' && this.t >= PLAYER.parry.startup &&
           this.t < PLAYER.parry.startup + PLAYER.parry.window;
  }
  get invulnerable() { return this.iframes > 0 || !this.alive; }

  enter(state) { this.state = state; this.t = 0; }

  spend(n) {
    this.stamina = Math.max(0, this.stamina - n);
    this.regenLock = PLAYER.regenDelay;
  }

  // ── intent ────────────────────────────────────────────────────────────────
  readIntent(intent) {
    for (const a of ACTIONS) {
      if (intent[a]) this.buf = { action: a, age: 0 };
    }
  }

  /** Try to start whatever is buffered. Returns true if something started. */
  _consumeBuffer(intent, target) {
    if (!this.buf) return false;
    const a = this.buf.action;
    if (a === 'light' && this.fight.boss?.ripostable && this.tryRiposte(this.fight.boss)) { this.buf = null; return true; }
    let ok = false;
    if (a === 'roll')  ok = this._startRoll(intent, target);
    if (a === 'light') ok = this._startAttack('light', intent, target);
    if (a === 'heavy') ok = this._startAttack('heavy', intent, target);
    if (a === 'parry') ok = this._startParry();
    if (a === 'heal')  ok = this._startHeal();
    if (ok) this.buf = null;
    return ok;
  }

  /**
   * Rolls go any of eight ways. Locked on, the frog keeps its eyes on the boss
   * and rolls relative to it (forward, back, sideways, diagonals). Free, it
   * turns into the roll. No direction at all rolls backwards, away from trouble.
   */
  _startRoll(intent, lockOn) {
    if (this.stamina <= 0) return false;
    this.spend(PLAYER.roll.cost * (this.mods.rollCost ?? 1));
    this.atk = null;
    const m = Math.hypot(intent.mx, intent.mz);
    const face = lockOn ? yawTo(this.x, this.z, lockOn.x, lockOn.z) : this.yaw;
    this.rollDir = m > 0.2 ? Math.atan2(intent.mx, intent.mz) : face + Math.PI;
    if (lockOn) this.yaw = face;
    else if (m > 0.2) this.yaw = this.rollDir;
    this.rollRel = angleDiff(this.yaw, this.rollDir);   // 0 forward, ±π back, +π/2 its left
    this.enter('roll');
    this.stats.rolls++;
    this.fight.emit({ type: 'roll', x: this.x, z: this.z, rel: this.rollRel });
    return true;
  }

  _startAttack(kind, intent, target, chainIdx = 0) {
    if (this.stamina <= 0) return false;
    const w = this.weapon;
    let spec;
    if (kind === 'light' && this.sprinting && chainIdx === 0 && w.run) { spec = w.run; kind = 'run'; }
    else spec = w[kind][chainIdx % w[kind].length];

    this.spend(spec.cost);
    this.atk = { spec, kind, idx: chainIdx, hit: new Set(), shockDone: false };
    this.enter('attack');

    // aim: locked target wins, otherwise the stick, otherwise a soft assist
    // toward an enemy roughly in front (thumbs on glass aren't precise)
    const m = Math.hypot(intent.mx, intent.mz);
    if (target && target.alive) this.yaw = turnToward(this.yaw, yawTo(this.x, this.z, target.x, target.z), 1.2);
    else if (m > 0.2) this.yaw = Math.atan2(intent.mx, intent.mz);
    else {
      const e = this.fight.enemies()[0];
      if (e) {
        const to = yawTo(this.x, this.z, e.x, e.z);
        if (Math.abs(angleDiff(this.yaw, to)) < 1.3 && Math.hypot(e.x - this.x, e.z - this.z) < 7 + e.radius) this.yaw = turnToward(this.yaw, to, 0.9);
      }
    }

    this.fight.emit({ type: 'swing', kind, anim: spec.anim, weapon: this.weaponId, heavy: kind !== 'light' });
    return true;
  }

  _startParry() {
    if (this.stamina <= 0) return false;
    this.spend(PLAYER.parry.cost);
    this.enter('parry');
    this.fight.emit({ type: 'parryAttempt' });
    return true;
  }

  _startHeal() {
    if (this.mods.noHeal) { this.fight.emit({ type: 'denied', what: 'heal' }); return true; }
    if (this.flasks <= 0) { this.fight.emit({ type: 'flaskEmpty' }); return true; }
    this.flasks--;
    this.healApplied = false;
    this.enter('heal');
    this.stats.heals++;
    this.fight.emit({ type: 'flaskStart' });
    return true;
  }

  // ── tick ──────────────────────────────────────────────────────────────────
  update(dt, intent, target) {
    this.t += dt;
    if (this.iframes > 0) this.iframes = Math.max(0, this.iframes - dt);
    if (this.buf) { this.buf.age += dt; if (this.buf.age > PLAYER.buffer) this.buf = null; }

    if (!this.alive) { this._friction(dt, 5); this._integrate(dt); return; }

    this.readIntent(intent);
    this._regen(dt, intent);

    const lockOn = target && target.alive ? target : null;

    switch (this.state) {
      case 'idle': case 'move': case 'block':
        if (this._consumeBuffer(intent, lockOn)) break;
        if (intent.block && !this.mods.noBlock && this.stamina > 0) {
          if (this.state !== 'block') this.enter('block');
        } else if (this.state === 'block') this.enter('idle');
        this._locomote(dt, intent, lockOn);
        break;

      case 'roll': this._roll(dt, intent); break;
      case 'attack': this._attack(dt, intent, lockOn); break;

      case 'parry':
        this._friction(dt, 14);
        if (this.t >= PLAYER.parry.startup + PLAYER.parry.window + PLAYER.parry.recovery) this.enter('idle');
        break;

      case 'riposte':
        this.iframes = Math.max(this.iframes, 0.05);
        this._friction(dt, 20);
        if (this.rip && !this.rip.done && this.t >= PLAYER.riposte.hitAt) {
          const r = this.rip; r.done = true;
          r.target.receiveRiposte(r.dmg, this);
          this.stats.dmgDealt += r.dmg;
          this.fight.emit({ type: 'riposte', x: r.target.x, z: r.target.z, dmg: r.dmg });
        }
        if (this.t >= PLAYER.riposte.duration) { this.rip = null; this.enter('idle'); }
        break;

      case 'heal': {
        this._locomote(dt, intent, lockOn, PLAYER.flask.moveScale);
        if (!this.healApplied && this.t >= PLAYER.flask.applyAt) {
          this.healApplied = true;
          const amt = this.maxHp * this.flaskHeal;
          this.hp = Math.min(this.maxHp, this.hp + amt);
          this.fight.emit({ type: 'healed', amount: amt });
        }
        if (this.t >= PLAYER.flask.duration) this.enter('idle');
        break;
      }

      case 'hurt':
        this._friction(dt, 7);
        if (this.t >= PLAYER.hurt) this.enter('idle');
        break;

      case 'knockdown':
        this._friction(dt, 5);
        // you can roll out of a knockdown once you're back on your feet
        if (this.t >= PLAYER.knockdownRollAfter && this.buf?.action === 'roll') {
          if (this._consumeBuffer(intent, lockOn)) break;
        }
        if (this.t >= PLAYER.knockdown) this.enter('idle');
        break;

      case 'guardbreak':
        this._friction(dt, 6);
        if (this.t >= PLAYER.guardBreak) this.enter('idle');
        break;
    }

    // face the lock target unless the move owns facing
    if (lockOn && (this.state === 'idle' || this.state === 'move' || this.state === 'block' || this.state === 'heal') && !this.sprinting) {
      this.yaw = turnToward(this.yaw, yawTo(this.x, this.z, lockOn.x, lockOn.z), PLAYER.lockTurn * dt);
    }

    this._integrate(dt);
  }

  _regen(dt, intent) {
    if (this.regenLock > 0) { this.regenLock -= dt; return; }
    let rate = PLAYER.staminaRegen * (this.mods.staminaRegen ?? 1);
    if (this.state === 'block') rate *= PLAYER.blockRegenScale;
    if (this.sprinting) rate = -PLAYER.sprintDrain;
    if (this.state === 'attack' || this.state === 'roll' || this.state === 'parry') rate = 0;
    this.stamina = clamp(this.stamina + rate * dt, 0, this.maxStamina);
  }

  _locomote(dt, intent, lockOn, scale = 1) {
    const m = Math.min(1, Math.hypot(intent.mx, intent.mz));
    const wantSprint = intent.sprint && m > 0.5 && this.stamina > 1 && this.state !== 'block' && this.state !== 'heal';
    this.sprinting = wantSprint;
    if (wantSprint) this.regenLock = Math.max(this.regenLock, 0.25);

    let speed;
    if (this.state === 'block') speed = PLAYER.strafe * 0.62;
    else if (wantSprint) speed = PLAYER.sprint;
    else if (lockOn) speed = PLAYER.strafe * (0.45 + 0.55 * m);
    else speed = m > 0.7 ? PLAYER.run : PLAYER.walk * (m / 0.7);
    speed *= scale * (this.mods.moveSpeed ?? 1);

    let tx = 0, tz = 0;
    if (m > 0.05) {
      tx = (intent.mx / Math.max(m, 1e-6)) * speed * Math.min(1, m / 0.35);
      tz = (intent.mz / Math.max(m, 1e-6)) * speed * Math.min(1, m / 0.35);
      if (!lockOn || wantSprint) {
        this.yaw = turnToward(this.yaw, Math.atan2(intent.mx, intent.mz), PLAYER.turn * dt);
      }
      if (this.state === 'idle') this.state = 'move';
    } else if (this.state === 'move') this.state = 'idle';

    const rate = m > 0.05 ? PLAYER.accel : PLAYER.decel;
    this.vx = damp(this.vx, tx, rate, dt);
    this.vz = damp(this.vz, tz, rate, dt);
    this.moving = Math.hypot(this.vx, this.vz);
  }

  _roll(dt, intent) {
    const R = PLAYER.roll;
    const iframeMult = this.mods.iframes ?? 1;
    if (this.t >= R.startup && this.t < R.startup + R.iframes * iframeMult) this.iframes = Math.max(this.iframes, 0.02);
    const k = Math.min(1, this.t / R.duration);
    // front-loaded burst that bleeds off — reads as a committed tumble
    if (this.t < R.duration) {
      const sp = (R.distance / R.duration) * (1.62 * (1 - k) + 0.28) * (this.mods.rollDistance ?? 1);
      this.vx = Math.sin(this.rollDir) * sp;
      this.vz = Math.cos(this.rollDir) * sp;
    }
    this.sprinting = false;
    if (this.t >= R.duration) {
      this._friction(dt, 30);
      if (this.t >= R.duration + R.recovery) this.enter('idle');
    }
  }

  _attack(dt, intent, lockOn) {
    const a = this.atk, s = a.spec;
    const total = s.startup + s.active + s.recovery;
    this.sprinting = false;

    // track the target through the wind-up, then commit
    if (this.t < s.startup) {
      if (lockOn) this.yaw = turnToward(this.yaw, yawTo(this.x, this.z, lockOn.x, lockOn.z), PLAYER.attackTurn * dt);
      else {
        const m = Math.hypot(intent.mx, intent.mz);
        if (m > 0.3) this.yaw = turnToward(this.yaw, Math.atan2(intent.mx, intent.mz), PLAYER.attackTurn * 0.6 * dt);
      }
    }

    // lunge across startup + active, eased so the step lands with the blow
    const moveT = s.startup + s.active;
    if (this.t < moveT) {
      let sp = (s.lunge / moveT) * 1.5 * (1 - this.t / moveT) + 0.1;
      // don't lunge through a target you're already touching
      if (lockOn && Math.hypot(lockOn.x - this.x, lockOn.z - this.z) < lockOn.radius + this.radius + 0.9) sp *= 0.15;
      this.vx = Math.sin(this.yaw) * sp;
      this.vz = Math.cos(this.yaw) * sp;
    } else this._friction(dt, 12);

    this.hyper = !!(s.hyper && this.t >= s.hyper[0] && this.t <= s.hyper[1]);

    if (this.t >= s.startup && this.t < s.startup + s.active) this._resolveSwing(a);

    // combo continuation
    const comboOpen = s.startup + s.active + 0.05;
    if (this.t >= comboOpen && this.buf && (this.buf.action === 'light' || this.buf.action === 'heavy')) {
      const kind = this.buf.action;
      if (kind === 'light' && this.fight.boss?.ripostable && this.tryRiposte(this.fight.boss)) { this.buf = null; return; }
      const chain = this.weapon[kind];
      const next = a.kind === kind ? a.idx + 1 : 0;
      if (this.stamina > 0) {
        this.buf = null;
        this._startAttack(kind, intent, lockOn, next % chain.length);
        return;
      }
    }

    // late recovery can be cancelled into a roll, heal or parry
    const cancelAt = s.startup + s.active + s.recovery * 0.55;
    if (this.t >= cancelAt && this.buf && (this.buf.action === 'roll' || this.buf.action === 'parry' || this.buf.action === 'heal')) {
      this.hyper = false;
      if (this._consumeBuffer(intent, lockOn)) return;
    }

    if (this.t >= total) { this.hyper = false; this.atk = null; this.enter('idle'); }
  }

  _resolveSwing(a) {
    const s = a.spec;
    for (const e of this.fight.enemies()) {
      if (!e.alive || a.hit.has(e) || e.untargetable) continue;
      if (e.y > 1.1) continue;                    // airborne — swing passes under
      if (!inArc(this.x, this.z, this.yaw, s.reach, s.arc, e.x, e.z, e.radius)) continue;
      a.hit.add(e);
      const dmg = s.dmg * this.dmgMult;
      const landed = e.receiveHit({ dmg, poise: s.poise, from: this, heavy: a.kind !== 'light', kind: a.kind });
      if (landed) {
        this.stats.hitsLanded++;
        this.stats.dmgDealt += dmg;
      }
    }
    if (s.shock && !a.shockDone && this.t >= s.startup + s.active * 0.5) {
      a.shockDone = true;
      const fx = this.x + Math.sin(this.yaw) * 1.6, fz = this.z + Math.cos(this.yaw) * 1.6;
      this.fight.emit({ type: 'shock', x: fx, z: fz, radius: s.shock.radius });
      for (const e of this.fight.enemies()) {
        if (!e.alive || a.hit.has(e) || e.y > 1.1) continue;
        if (Math.hypot(e.x - fx, e.z - fz) <= s.shock.radius + e.radius) {
          a.hit.add(e);
          e.receiveHit({ dmg: s.shock.dmg * this.dmgMult, poise: 30, from: this, heavy: true, kind: 'shock' });
        }
      }
    }
  }

  tryRiposte(target) {
    if (!target?.alive || !target.ripostable) return false;
    const d = Math.hypot(target.x - this.x, target.z - this.z);
    if (d > PLAYER.riposte.range + target.radius) return false;
    this.atk = null;
    this.yaw = yawTo(this.x, this.z, target.x, target.z);
    this.enter('riposte');
    this.iframes = PLAYER.riposte.iframes;
    // the boss is caught now; the damage lands when the stab does
    this.rip = { target, dmg: this.weapon.riposte * this.dmgMult, done: false };
    target.beginRiposted?.(this);
    this.fight.emit({ type: 'riposteStart', x: target.x, z: target.z });
    return true;
  }

  // ── incoming ──────────────────────────────────────────────────────────────
  /**
   * @param hit { dmg, x, z (origin), parryable, unblockable, knockdown, source, kind }
   * @returns 'dodged' | 'parried' | 'blocked' | 'guardbreak' | 'hit'
   */
  receiveHit(hit) {
    if (!this.alive) return 'dodged';
    if (this.iframes > 0) {
      if (this.fight.time - (this._lastDodge ?? -9) > 0.3) this.fight.emit({ type: 'dodged', x: this.x, z: this.z });
      this._lastDodge = this.fight.time;
      return 'dodged';
    }

    const toSrc = yawTo(this.x, this.z, hit.x, hit.z);
    const facing = Math.abs(angleDiff(this.yaw, toSrc)) < 1.15;   // ~130° front arc

    if (this.parryActive && hit.parryable && facing) {
      this.stats.parries++;
      this.fight.emit({ type: 'parry', x: (this.x + hit.x) / 2, z: (this.z + hit.z) / 2 });
      hit.source?.parried?.(this);
      return 'parried';
    }

    if (this.guarding && facing && !hit.unblockable) {
      const w = this.weapon;
      const chip = hit.dmg * 0.95 / w.stability;
      if (chip >= this.stamina) {
        this.stamina = 0;
        this.regenLock = 1.2;
        this._takeDamage(hit.dmg * (1 - w.guard * 0.5), hit);
        if (this.alive) this.enter('guardbreak');
        this.fight.emit({ type: 'guardbreak', x: this.x, z: this.z, fx: hit.x, fz: hit.z });
        return 'guardbreak';
      }
      this.spend(chip);
      this._takeDamage(hit.dmg * (1 - w.guard), hit, true);
      this.stats.blocks++;
      this.fight.emit({ type: 'block', x: this.x, z: this.z, dmg: hit.dmg, fx: hit.x, fz: hit.z });
      // blocking a heavy blow still shoves you
      const push = Math.min(4, hit.dmg * 0.09);
      this.vx = -Math.sin(toSrc) * push; this.vz = -Math.cos(toSrc) * push;
      return 'blocked';
    }

    this._takeDamage(hit.dmg, hit);
    if (!this.alive) return 'hit';

    this.stats.hitsTaken++;
    const knock = hit.knockdown || hit.dmg >= this.maxHp * 0.3;
    if (this.hyper && !knock) {
      this.fight.emit({ type: 'hit', target: 'player', x: this.x, z: this.z, dmg: hit.dmg, hyper: true, fx: hit.x, fz: hit.z });
      return 'hit';
    }
    this.atk = null;
    this.hyper = false;
    const kb = knock ? 6.5 : 3.6;
    this.vx = -Math.sin(toSrc) * kb; this.vz = -Math.cos(toSrc) * kb;
    if (knock) { this.enter('knockdown'); this.iframes = PLAYER.knockdownIframes; }
    else { this.enter('hurt'); this.iframes = PLAYER.invulnAfterHit; }
    this.fight.emit({ type: 'hit', target: 'player', x: this.x, z: this.z, dmg: hit.dmg, knockdown: knock, fx: hit.x, fz: hit.z });
    return 'hit';
  }

  _takeDamage(d, hit, blocked = false) {
    this.hp -= d;
    this.stats.dmgTaken += d;
    this.lastHitBy = hit.name ?? hit.kind ?? null;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.atk = null;
      this.enter('dead');
      this.fight.emit({ type: 'playerDied', x: this.x, z: this.z, blocked });
    }
  }

  _friction(dt, rate) {
    this.vx = damp(this.vx, 0, rate, dt);
    this.vz = damp(this.vz, 0, rate, dt);
    this.moving = Math.hypot(this.vx, this.vz);
  }

  _integrate(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }
}
