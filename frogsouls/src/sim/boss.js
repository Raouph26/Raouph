import { getMove } from './moves.js';
import { spawnProjectiles, spawnHazard } from './effects.js';
import { makeGimmick } from './gimmicks.js';
import { angleDiff, clamp, damp, inArc, smooth, turnToward, yawTo } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// A boss: neutral spacing AI + a step runner that plays moves from the library.
// Neutral is where a fight breathes — circling, closing, backing off — so the
// boss isn't a turret that swings the instant its cooldown ends.
// ─────────────────────────────────────────────────────────────────────────────

const STYLE = {
  // prefer = the gap it likes to hold between attacks; strafe = how much it circles
  brute:     { prefer: [2.5, 5.0], strafe: .35, approach: 1.00, turn: 3.6 },
  duelist:   { prefer: [3.0, 5.5], strafe: .65, approach: 1.10, turn: 5.0 },
  hound:     { prefer: [2.0, 4.0], strafe: .50, approach: 1.35, turn: 6.0 },
  sweeper:   { prefer: [3.0, 6.0], strafe: .55, approach: 1.00, turn: 4.2 },
  caster:    { prefer: [6.0, 10.], strafe: .70, approach: .85,  turn: 4.5 },
  sovereign: { prefer: [3.0, 6.5], strafe: .55, approach: 1.15, turn: 4.6 },
  crab:      { prefer: [2.5, 5.0], strafe: .95, approach: 1.05, turn: 5.2 },
  vacuum:    { prefer: [3.0, 9.0], strafe: .80, approach: .90,  turn: 7.0 },
  mirror:    { prefer: [3.0, 6.0], strafe: .75, approach: 1.20, turn: 8.0 },
};

export class BossSim {
  constructor(fight, def, opts = {}) {
    this.fight = fight;
    this.def = def;
    this.kind = 'boss';
    this.id = def.id;
    this.rng = fight.rng;

    const hpMult = opts.hpMult ?? 1, dmgMult = opts.dmgMult ?? 1;
    this.maxHp = Math.round(def.hp * hpMult);
    this.hp = this.maxHp;
    this.scale = def.scale ?? 1.6;
    this.radius = def.radius ?? 0.55 * this.scale;
    this.height = def.height ?? 1.9 * this.scale;
    this.baseSpeed = def.speed ?? 3.0;
    this.speed = this.baseSpeed;
    this.dmgMult = (def.dmg ?? 1) * dmgMult;
    this.cdRange = def.cooldown ?? [0.8, 1.8];
    this.cdMult = 1;
    this.style = STYLE[def.style ?? 'duelist'] ?? STYLE.duelist;

    this.maxPoise = def.poise ?? 90;
    this.poise = this.maxPoise;
    this.poiseIdle = 0;

    this.x = 0; this.z = -7; this.y = 0;
    this.vx = 0; this.vz = 0;
    this.yaw = 0;

    this.state = 'neutral';
    this.t = 0;
    this.alive = true;
    this.iframes = 0;
    this.untargetable = false;
    this.phase = 1;
    this.phaseQueue = (def.phases ?? []).map((p, i) => ({ ...p, index: i + 2 }));
    this.pendingPhase = null;

    this.moves = (def.moves ?? []).map((m) => (typeof m === 'string' ? getMove(m) : getMove(m.id, m)));
    this.moveCd = {};
    this.cd = def.openingDelay ?? 1.1;
    this.run = null;
    this.lastMove = null;

    this.neutral = { mode: 'approach', timer: 0, dir: 1 };
    this.stagDur = 0;
    this.pauseDur = 0;
    this.say = null;               // { text, t } — speech the renderer floats above it
    this.anim = { tell: 'idle', phase: 'idle', k: 0, step: 0 };
    this.flags = {};               // per-fight scratch for gimmicks

    this.gimmick = makeGimmick(def.gimmick, this, fight);
  }

  get hpFrac() { return this.hp / this.maxHp; }
  get ripostable() { return this.alive && this.state === 'stagger' && this.t < this.stagDur - 0.1 && this.stagRip; }
  get attacking() { return this.state === 'move'; }

  speak(text, dur = 2.2) { this.say = { text, t: dur }; this.fight.emit({ type: 'say', text }); }

  enter(state) { this.state = state; this.t = 0; }

  // ── moves ─────────────────────────────────────────────────────────────────
  startMove(move, opts = {}) {
    if (typeof move === 'string') move = this.moves.find((m) => m.id === move) ?? getMove(move);
    this.run = { move, i: -1, repeat: opts.repeat ?? false };
    this.lastMove = move.id;
    this.enter('move');
    this._nextStep();
    this.fight.emit({ type: 'bossMove', id: move.id });
  }

  _nextStep() {
    const r = this.run;
    r.i++;
    if (r.i >= r.move.steps.length) { this._endMove(); return; }
    const s = r.move.steps[r.i];
    r.step = s;
    r.t = 0;
    r.phase = 'windup';
    r.hitDone = false;
    r.hitTimer = 0;
    r.fired = {};
    r.hold = 0;
    if (s.delay && this.rng.chance(s.delay.chance)) r.hold = this.rng.range(s.delay.min ?? 0.2, s.delay.max);
    if (s.say) this.speak(s.say, 1.6);
    this._spawnAt('windup');
  }

  _endMove() {
    const m = this.run.move;
    this.moveCd[m.id] = m.cd;
    const fromRepeat = this.run.repeat;
    this.run = null;
    this.enter('neutral');
    this.cd = this.rng.range(this.cdRange[0], this.cdRange[1]) * this.cdMult;
    this.neutral.timer = 0;

    if (this.gimmick?.onMoveEnd?.(this, this.fight, m, fromRepeat)) return;

    for (const f of m.followUps ?? []) {
      if (this.rng.chance(f.chance)) { this.startMove(f.id); return; }
    }
  }

  _spawnAt(when) {
    const s = this.run.step;
    for (const sp of s.spawn ?? []) {
      if (sp.at !== when || this.run.fired[sp.kind + when]) continue;
      this.run.fired[sp.kind + when] = true;
      if (sp.kind === 'projectile') spawnProjectiles(this.fight, this, sp.p);
      else if (sp.kind === 'flash') this.fight.emit({ type: 'flash', x: this.x, z: this.z });
      else spawnHazard(this.fight, this, sp.kind, sp.p);
    }
  }

  _stepMove(dt) {
    const r = this.run, s = r.step, pl = this.fight.player;
    r.t += dt;
    const toP = yawTo(this.x, this.z, pl.x, pl.z);

    if (r.phase === 'windup' || r.phase === 'hold') {
      const rate = r.phase === 'hold' ? s.track * 0.5 : s.track;
      if (!s.charge?.sideways || r.phase === 'windup') this.yaw = turnToward(this.yaw, toP, rate * dt);
      if (s.retreat) {
        const k = r.t / Math.max(s.windup, 0.01);
        const sp = (s.retreat / (s.windup + s.active)) * 1.2;
        this.vx = -Math.sin(this.yaw) * sp * k; this.vz = -Math.cos(this.yaw) * sp * k;
      } else this._friction(dt, 8);

      if (r.phase === 'windup' && r.t >= s.windup) {
        if (r.hold > 0) { r.phase = 'hold'; }
        else this._beginActive();
      } else if (r.phase === 'hold' && r.t >= s.windup + r.hold) this._beginActive();
    }
    else if (r.phase === 'active') {
      const at = r.t - s.windup - r.hold;
      const k = Math.min(1, at / Math.max(s.active, 0.001));
      if (s.trackActive) this.yaw = turnToward(this.yaw, toP, s.trackActive * dt);

      if (s.leap) this._leap(k);
      else if (s.charge) { this._charge(dt, s); if (this.run !== r) return; }
      else if (s.retreat) {
        const sp = (s.retreat / (s.windup + s.active)) * 1.2;
        this.vx = -Math.sin(this.yaw) * sp; this.vz = -Math.cos(this.yaw) * sp;
      } else if (s.advance) {
        // most of the step lands in the first part of the active window
        const sp = (s.advance / Math.max(s.active + 0.1, 0.1)) * (1.4 - k);
        // stop short of walking straight through the frog
        const d = Math.hypot(pl.x - this.x, pl.z - this.z);
        const brake = d < this.radius + pl.radius + 0.6 ? 0.1 : 1;
        this.vx = Math.sin(this.yaw) * sp * brake; this.vz = Math.cos(this.yaw) * sp * brake;
      } else this._friction(dt, 10);

      if (s.counter) this.flags.countering = true;

      if (s.hit && !s.leap) { this._resolveHit(s, dt); if (this.run !== r) return; }
      if (at >= s.active) {
        if (s.leap) { this._land(s); if (this.run !== r) return; }
        this.flags.countering = false;
        r.phase = 'recovery';
        this._spawnAt('end');
        this.untargetable = false;
        this.y = 0;
      }
    }
    else if (r.phase === 'recovery') {
      this._friction(dt, 7);
      if (r.t >= s.windup + r.hold + s.active + s.recovery) { this._nextStep(); return; }
    }
    if (this.run !== r) return;

    // timed spawns
    for (const sp of s.spawn ?? []) {
      if (typeof sp.at === 'number' && r.t >= sp.at && !r.fired['t' + sp.at]) {
        r.fired['t' + sp.at] = true;
        if (sp.kind === 'projectile') spawnProjectiles(this.fight, this, sp.p);
        else spawnHazard(this.fight, this, sp.kind, sp.p);
      }
    }
  }

  _beginActive() {
    const r = this.run, s = r.step, pl = this.fight.player;
    r.phase = 'active';
    this.fight.emit({ type: 'bossActive', id: r.move.id, sfx: s.sfx, x: this.x, z: this.z });
    if (s.leap) {
      const lead = s.leap.predict ?? 0.3;
      let tx = pl.x + pl.vx * lead, tz = pl.z + pl.vz * lead;
      const d = Math.hypot(tx - this.x, tz - this.z);
      if (d > s.leap.max) { tx = this.x + (tx - this.x) / d * s.leap.max; tz = this.z + (tz - this.z) / d * s.leap.max; }
      const lim = this.fight.arena - this.radius - 0.5, dd = Math.hypot(tx, tz);
      if (dd > lim) { tx = tx / dd * lim; tz = tz / dd * lim; }
      r.leap = { sx: this.x, sz: this.z, tx, tz };
      this.untargetable = true;
      this.fight.emit({ type: 'decal', shape: 'circle', x: tx, z: tz, radius: s.hit.radius, life: s.active });
    }
    if (s.charge) {
      r.charge = { dir: this.yaw, bounces: s.charge.bounces ?? 0 };
    }
    this._spawnAt('active');
  }

  _leap(k) {
    const r = this.run, L = r.step.leap;
    const e = smooth(k);
    this.x = r.leap.sx + (r.leap.tx - r.leap.sx) * e;
    this.z = r.leap.sz + (r.leap.tz - r.leap.sz) * e;
    this.y = Math.sin(Math.PI * k) * L.height;
    this.vx = 0; this.vz = 0;
    this.yaw = yawTo(r.leap.sx, r.leap.sz, r.leap.tx, r.leap.tz);
  }

  _land(s) {
    this.y = 0;
    this.untargetable = false;
    this.fight.emit({ type: 'slam', x: this.x, z: this.z, radius: s.hit.radius, big: true });
    const pl = this.fight.player;
    if (Math.hypot(pl.x - this.x, pl.z - this.z) < s.hit.radius + pl.radius) this._apply(s.hit);
  }

  _charge(dt, s) {
    const r = this.run, c = r.charge;
    const pl = this.fight.player;
    // a little homing so it isn't trivially sidestepped, but never a lot
    c.dir = turnToward(c.dir, yawTo(this.x, this.z, pl.x, pl.z), 0.55 * dt);
    this.vx = Math.sin(c.dir) * s.charge.speed;
    this.vz = Math.cos(c.dir) * s.charge.speed;
    if (!s.charge.sideways) this.yaw = c.dir;

    const lim = this.fight.arena - this.radius;
    const d = Math.hypot(this.x, this.z);
    if (d > lim - 0.2) {
      const nx = this.x / d, nz = this.z / d;
      this.fight.emit({ type: 'bonk', x: this.x, z: this.z });
      if (s.charge.stunOnWall && this.rng.chance(s.charge.stunOnWall)) {
        this.run = null;
        this.stagger(2.2, true, 'bonk');
        return;
      }
      if (c.bounces > 0) {
        c.bounces--;
        // reflect off the wall, aimed back roughly at the frog
        const vx = Math.sin(c.dir), vz = Math.cos(c.dir);
        const dot = vx * nx + vz * nz;
        const rx = vx - 2 * dot * nx, rz = vz - 2 * dot * nz;
        c.dir = Math.atan2(rx, rz);
        c.dir = turnToward(c.dir, yawTo(this.x, this.z, pl.x, pl.z), 0.6);
        this.run.hitDone = false;
      } else {
        // out of bounces: end the charge here
        const s2 = this.run.step;
        this.run.t = s2.windup + this.run.hold + s2.active;
      }
    }
  }

  _resolveHit(s, dt) {
    const r = this.run, pl = this.fight.player, h = s.hit;
    if (h.multi) {
      r.hitTimer -= dt;
      if (r.hitTimer > 0) return;
    } else if (r.hitDone) return;

    let inside = false;
    if (h.shape === 'arc') {
      const range = h.range * (this.flags.reachMult ?? 1) * (this.scale / 1.6) ** 0.35;
      inside = inArc(this.x, this.z, this.yaw, range, h.arc, pl.x, pl.z, pl.radius);
    } else if (h.shape === 'circle') {
      const ox = this.x + Math.sin(this.yaw) * (h.offset ?? 0), oz = this.z + Math.cos(this.yaw) * (h.offset ?? 0);
      inside = Math.hypot(pl.x - ox, pl.z - oz) < h.radius * (this.flags.reachMult ?? 1) + pl.radius;
    } else if (h.shape === 'body') {
      inside = Math.hypot(pl.x - this.x, pl.z - this.z) < this.radius + pl.radius + 0.35;
    }
    if (!inside) return;
    const res = this._apply(h);
    if (res === 'dodged') return;          // rolled through it — keep checking
    r.hitDone = true;
    if (h.multi) r.hitTimer = h.multi;
  }

  _apply(h) {
    const pl = this.fight.player;
    const dmg = h.dmg * this.dmgMult;
    return pl.receiveHit({ dmg, x: this.x, z: this.z, parryable: !!h.parryable, unblockable: !!h.unblockable,
      knockdown: !!h.knockdown, source: this, name: this.run?.move.id });
  }

  // ── reactions ─────────────────────────────────────────────────────────────
  parried(player) {
    if (!this.alive) return;
    this.run = null;
    this.flags.countering = false;
    this.stagger(2.1, true, 'parried');
    this.fight.emit({ type: 'bossParried', x: this.x, z: this.z });
  }

  stagger(dur, ripostable = true, why = 'poise') {
    this.run = null;
    this.untargetable = false;
    this.y = 0;
    this.stagDur = dur;
    this.stagRip = ripostable;
    this.enter('stagger');
    this.vx *= 0.2; this.vz *= 0.2;
    this.fight.emit({ type: 'bossStagger', why, x: this.x, z: this.z });
  }

  pause(dur, text) {
    this.run = null;
    this.pauseDur = dur;
    this.enter('pause');
    if (text) this.speak(text, dur);
  }

  receiveHit(hit) {
    if (!this.alive || this.untargetable) return false;
    if (this.iframes > 0) { this.fight.emit({ type: 'bossDodge', x: this.x, z: this.z }); return false; }

    if (this.gimmick?.beforeHit && this.gimmick.beforeHit(this, this.fight, hit) === false) return false;

    // a counter stance turns your swing into its opening
    if (this.flags.countering && this.run?.step.counter) {
      const c = this.run.step.counter;
      this.flags.countering = false;
      this.fight.emit({ type: 'counter', x: this.x, z: this.z });
      const pl = this.fight.player;
      this.yaw = yawTo(this.x, this.z, pl.x, pl.z);
      pl.receiveHit({ dmg: c.dmg * this.dmgMult, x: this.x, z: this.z, parryable: false, unblockable: true, knockdown: true, source: this, name: 'counter' });
      const s = this.run.step;
      this.run.t = s.windup + this.run.hold + s.active;   // skip to recovery
      this.run.phase = 'recovery';
      return false;
    }

    const dmg = hit.dmg * (this.flags.damageTaken ?? 1);
    this.hp -= dmg;
    this.fight.emit({ type: 'hit', target: 'boss', x: this.x, z: this.z, dmg, heavy: !!hit.heavy });

    if (this.state !== 'stagger' && this.state !== 'riposted' && this.state !== 'transition') {
      this.poise -= hit.poise * (this.flags.poiseTaken ?? 1);
      this.poiseIdle = 0;
      if (this.poise <= 0) { this.poise = this.maxPoise; this.stagger(1.75, true, 'poise'); }
    }

    this.gimmick?.afterHit?.(this, this.fight, hit, dmg);
    this._checkPhase();
    this._checkDeath();
    return true;
  }

  receiveRiposte(dmg) {
    this.hp -= dmg * (this.flags.damageTaken ?? 1);
    this.run = null;
    this.enter('riposted');
    this.fight.emit({ type: 'hit', target: 'boss', x: this.x, z: this.z, dmg, riposte: true });
    this._checkPhase();
    this._checkDeath();
  }

  _checkPhase() {
    if (!this.alive || this.pendingPhase) return;
    const next = this.phaseQueue[0];
    if (next && this.hpFrac <= next.at) { this.pendingPhase = this.phaseQueue.shift(); }
  }

  _checkDeath() {
    if (this.hp > 0 || !this.alive) return;
    this.hp = 0;
    this.alive = false;
    this.run = null;
    this.untargetable = false;
    this.y = 0;
    this.enter('dead');
    this.fight.emit({ type: 'bossDied', x: this.x, z: this.z });
  }

  _enterPhase(p) {
    this.phase = p.index;
    this.pendingPhase = null;
    if (p.speed) this.speed = this.baseSpeed * p.speed;
    if (p.cd) this.cdMult = p.cd;
    if (p.dmg) this.dmgMult *= p.dmg;
    for (const id of p.add ?? []) if (!this.moves.some((m) => m.id === id)) this.moves.push(getMove(id));
    this.run = null;
    this.enter('transition');
    this.iframes = 1.6;
    this.fight.emit({ type: 'phase', phase: this.phase, x: this.x, z: this.z });
    spawnHazard(this.fight, this, 'ring', { speed: 12, maxR: 7.5, width: 1.2, dmg: 0, push: 7 });
    if (p.say) this.speak(p.say, 2.4);
    this.gimmick?.onPhase?.(this, this.fight, this.phase);
  }

  // ── tick ──────────────────────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    if (this.iframes > 0) this.iframes = Math.max(0, this.iframes - dt);
    if (this.say) { this.say.t -= dt; if (this.say.t <= 0) this.say = null; }
    for (const k in this.moveCd) this.moveCd[k] -= dt;

    if (!this.alive) { this._friction(dt, 4); this._integrate(dt); this._anim(); return; }

    // poise recovers if you stop hitting it
    this.poiseIdle += dt;
    if (this.poiseIdle > 2.6) this.poise = Math.min(this.maxPoise, this.poise + 30 * dt);

    this.gimmick?.update?.(this, this.fight, dt);

    if (this.pendingPhase && (this.state === 'neutral' || this.state === 'move' || this.state === 'pause')) {
      this._enterPhase(this.pendingPhase);
    }

    const pl = this.fight.player;
    switch (this.state) {
      case 'neutral': this._neutral(dt); break;
      case 'move': this._stepMove(dt); break;
      case 'stagger':
        this._friction(dt, 6);
        if (this.t >= this.stagDur) this.enter('neutral');
        break;
      case 'riposted':
        this._friction(dt, 6);
        if (this.t >= 1.5) this.enter('getup');
        break;
      case 'getup':
        this._friction(dt, 8);
        if (this.t >= 0.75) { this.enter('neutral'); this.cd = Math.min(this.cd, 0.4); }
        break;
      case 'transition':
        this._friction(dt, 8);
        this.yaw = turnToward(this.yaw, yawTo(this.x, this.z, pl.x, pl.z), 3 * dt);
        if (this.t >= 1.6) { this.enter('neutral'); this.cd = 0.5; }
        break;
      case 'pause':
        this._friction(dt, 8);
        if (this.t >= this.pauseDur) { this.enter('neutral'); this.cd = 0.35; }
        break;
      case 'dodge': this._dodge(dt); break;
      case 'drink':
        this._friction(dt, 10);
        if (!this.flags.drank && this.t >= 0.7) {
          this.flags.drank = true;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * (this.flags.drinkAmt ?? 0.22));
          this.fight.emit({ type: 'bossHealed', x: this.x, z: this.z });
        }
        if (this.t >= 1.25) this.enter('neutral');
        break;
    }

    this._integrate(dt);
    this._anim();
  }

  _neutral(dt) {
    const pl = this.fight.player;
    const dx = pl.x - this.x, dz = pl.z - this.z;
    const d = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const st = this.style;
    this.yaw = turnToward(this.yaw, toP, st.turn * dt);

    if (!pl.alive) { this._friction(dt, 6); return; }

    const n = this.neutral;
    n.timer -= dt;
    if (n.timer <= 0) {
      if (d > st.prefer[1] + 1) n.mode = 'approach';
      else if (d < st.prefer[0] - 0.5) n.mode = this.rng.chance(0.55) ? 'backoff' : 'hold';
      else {
        const r = this.rng.next();
        n.mode = r < st.strafe ? 'strafe' : (r < st.strafe + 0.2 ? 'hold' : 'approach');
      }
      n.dir = this.rng.chance(0.5) ? 1 : -1;
      n.timer = this.rng.range(0.7, 2.0);
    }

    let tx = 0, tz = 0;
    const nx = dx / Math.max(d, 1e-3), nz = dz / Math.max(d, 1e-3);
    const sp = this.speed;
    if (n.mode === 'approach') {
      const run = d > 9 ? 1.45 : 1;
      tx = nx * sp * st.approach * run; tz = nz * sp * st.approach * run;
    } else if (n.mode === 'strafe') {
      tx = nz * n.dir * sp * 0.55; tz = -nx * n.dir * sp * 0.55;
      if (d > st.prefer[1]) { tx += nx * sp * 0.4; tz += nz * sp * 0.4; }
    } else if (n.mode === 'backoff') {
      tx = -nx * sp * 0.6; tz = -nz * sp * 0.6;
    }
    // the crab only ever moves sideways; it closes distance at an angle
    if (this.def.style === 'crab' && n.mode === 'approach') {
      tx = (nz * n.dir + nx * 0.8) * sp * 0.9; tz = (-nx * n.dir + nz * 0.8) * sp * 0.9;
    }
    this.vx = damp(this.vx, tx, 6, dt);
    this.vz = damp(this.vz, tz, 6, dt);

    this.cd -= dt;
    if (this.cd <= 0) {
      const m = this._choose(d);
      if (m) this.startMove(m);
      else this.cd = 0.3;
    }
  }

  _choose(d) {
    const forced = this.gimmick?.chooseMove?.(this, this.fight, d);
    if (forced) return forced;
    const items = [];
    for (const m of this.moves) {
      if ((m.phase ?? 1) > this.phase || (this.moveCd[m.id] ?? 0) > 0 || !m.weight) continue;
      const inBand = d >= m.dist[0] - 0.4 && d <= m.dist[1] + 0.4;
      let w = m.weight * (inBand ? 1 : 0);
      if (m.id === this.lastMove) w *= 0.45;        // avoid predictable repeats
      if (w > 0) items.push({ w, v: m });
    }
    if (!items.length) return null;
    return this.rng.weighted(items);
  }

  // ── mirror-frog abilities, usable by any gimmick ──────────────────────────
  startDodge(yaw, dist = 4.2) {
    this.run = null;
    this.flags.dodgeYaw = yaw;
    this.flags.dodgeDist = dist;
    this.enter('dodge');
    this.iframes = 0.34;
    this.fight.emit({ type: 'bossRoll', x: this.x, z: this.z });
  }

  _dodge(dt) {
    const dur = 0.5;
    const k = Math.min(1, this.t / dur);
    const sp = (this.flags.dodgeDist / dur) * (1.6 * (1 - k) + 0.25);
    this.vx = Math.sin(this.flags.dodgeYaw) * sp;
    this.vz = Math.cos(this.flags.dodgeYaw) * sp;
    if (this.t >= dur + 0.1) { this.enter('neutral'); this.cd = Math.min(this.cd, 0.25); }
  }

  startDrink(amt = 0.22) {
    this.run = null;
    this.flags.drank = false;
    this.flags.drinkAmt = amt;
    this.enter('drink');
    this.fight.emit({ type: 'bossDrink', x: this.x, z: this.z });
  }

  // ── plumbing ──────────────────────────────────────────────────────────────
  _friction(dt, rate) {
    this.vx = damp(this.vx, 0, rate, dt);
    this.vz = damp(this.vz, 0, rate, dt);
  }

  _integrate(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  _anim() {
    const a = this.anim;
    if (this.state === 'move' && this.run) {
      const r = this.run, s = r.step;
      a.tell = s.tell ?? r.move.tell;
      a.step = r.i;
      a.phase = r.phase;
      if (r.phase === 'windup') a.k = Math.min(1, r.t / Math.max(s.windup, 0.001));
      else if (r.phase === 'hold') a.k = 1;
      else if (r.phase === 'active') a.k = Math.min(1, (r.t - s.windup - r.hold) / Math.max(s.active, 0.001));
      else a.k = Math.min(1, (r.t - s.windup - r.hold - s.active) / Math.max(s.recovery, 0.001));
      a.moveId = r.move.id;
    } else {
      a.tell = this.state;
      a.phase = this.state;
      a.k = this.t;
      a.step = 0;
      a.moveId = null;
    }
  }
}
