import { EMPTY_INTENT } from './fight.js';
import { PLAYER } from './player.js';
import { makeRng, yawTo } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// A scripted player for balancing. It plays by the same rules a person does:
// it only reacts to what's visible, after a human reaction delay, with timing
// error — and it can't see how long a delayed attack will be held. Once a
// combo has started it reads the rest by rhythm, the way practised players do.
// It is not an optimal AI. It's a stand-in for someone holding a controller.
// ─────────────────────────────────────────────────────────────────────────────

export const SKILL = {
  //          reaction      timing   defence mix       offence                        survival
  novice:  { react: .33, reactSd: .08, jitter: .115, parry: .03, block: .28, greed: 1.3, engage: .35, hover: 3.4, healAt: .38, holdGuess: .30 },
  average: { react: .27, reactSd: .06, jitter: .085, parry: .08, block: .14, greed: 1.8, engage: .55, hover: 3.0, healAt: .45, holdGuess: .22 },
  skilled: { react: .22, reactSd: .04, jitter: .060, parry: .18, block: .06, greed: 2.3, engage: .75, hover: 2.7, healAt: .48, holdGuess: .16 },
};

export class Bot {
  constructor(fight, skill = SKILL.average, seed = 1) {
    this.f = fight;
    this.s = skill;
    this.rng = makeRng(seed * 7919 + 13);
    this.stepKey = null;
    this.plans = [];
    this.hover = { dir: 1, t: 0 };
    this.window = { key: null, swings: 0, cap: 1 };
    this.lastRoll = -9;
    this.noticeStagger = -1;
    this.healCd = 0;
    this.decide = 0;
    this.string = 0;          // hits left in a neutral-window string
  }

  intent(dt) {
    const f = this.f, p = f.player, b = f.boss, s = this.s;
    const it = { ...EMPTY_INTENT, lock: true };
    if (!p.alive || !b.alive) return it;
    this.healCd -= dt;
    this.decide -= dt;

    const dx = b.x - p.x, dz = b.z - p.z;
    const dist = Math.hypot(dx, dz);
    const toBoss = Math.atan2(dx, dz);
    const reach = p.weapon.light[0].reach + b.radius - 0.3;

    // ── 1. read each boss step once, when it starts ────────────────────────
    const r = b.run;
    const key = r ? `${r.move.id}:${r.i}:${Math.round((f.time - r.t) * 60)}` : null;
    if (key && key !== this.stepKey) { this.stepKey = key; this._planForStep(r, dist); }
    if (!r) this.stepKey = null;

    // a held blow: guess the release, like a person would
    const held = this.plans.find((q) => q.hold && !q.reguessed);
    if (r && r.phase === 'hold' && held) {
      held.reguessed = true;
      const d = r.step.delay ?? { min: 0.4, max: 0.8 };
      const guess = f.time + Math.max(0.1, this.rng.gauss((d.min + d.max) / 2, s.holdGuess * 0.6 + (d.max - d.min) / 4));
      held.at = guess - 0.15;
      held.done = false;
      if (held.kind === 'block') held.until = guess + 0.4;
    }

    // ── 2. things flying at you or erupting under you ──────────────────────
    const evade = this._threats(dist);
    const inHazard = this._inHazard();

    // ── 3. execute the defensive plan ──────────────────────────────────────
    for (const pl of this.plans) {
      if (f.time >= pl.at && !pl.done) {
        pl.done = true;
        if (pl.kind === 'roll' && p.stamina > 4) this._roll(it, pl.dir ?? this._rollDir(toBoss));
        else if (pl.kind === 'parry') it.parry = true;
      }
      if (pl.kind === 'block' && f.time >= pl.at && f.time <= pl.until && p.stamina > 8) it.block = true;
    }
    this.plans = this.plans.filter((pl) => f.time <= (pl.until ?? pl.at + 0.6));
    if (evade && !it.roll) this._roll(it, evade.dir);

    const busy = it.roll || it.parry || it.block;
    const threatSoon = this.plans.some((pl) => !pl.done && pl.at - f.time < 0.55);

    // ── 4. ripostes come first ─────────────────────────────────────────────
    if (b.ripostable) {
      if (this.noticeStagger < 0) this.noticeStagger = f.time + s.react;
      if (f.time >= this.noticeStagger && !busy) {
        if (dist < 2.3 + b.radius) it.light = true;
        else { this._move(it, toBoss, 1); it.sprint = dist > 4; }
      }
      return it;
    }
    this.noticeStagger = -1;

    // ── 5. heal when it's safe, or when it has to be ───────────────────────
    const hpFrac = p.hp / p.maxHp;
    const recoveryLeft = r && r.phase === 'recovery' && r.i === r.move.steps.length - 1
      ? (r.step.windup + r.hold + r.step.active + r.step.recovery - r.t) : 0;
    const openState = ['pause', 'drink', 'getup', 'riposted', 'transition'].includes(b.state) || (b.state === 'stagger' && !b.ripostable);
    if (!busy && p.flasks > 0 && !f.mods.noHeal && this.healCd <= 0 && p.state !== 'heal' && !p.busy && !threatSoon) {
      const safe = recoveryLeft > 1.0 || openState || (b.state === 'neutral' && dist > 5.5);
      const panic = hpFrac < 0.25 && dist > 3.5 && !(r && r.phase !== 'recovery');
      if ((hpFrac < s.healAt && safe) || panic) { it.heal = true; this.healCd = 1.3; return it; }
    }
    if (p.state === 'heal') { this._move(it, toBoss + Math.PI, 0.5); return it; }

    // ── 6. punish ──────────────────────────────────────────────────────────
    const winKey = r ? `${r.move.id}:${r.i}` : b.state;
    if (winKey !== this.window.key) {
      this.window.key = winKey; this.window.swings = 0;
      this.window.cap = Math.max(1, Math.round(this.rng.gauss(s.greed, 0.6)));
    }
    let punish = false;
    if (recoveryLeft > p.weapon.light[0].startup + 0.08 + Math.max(0, dist - reach) / 5) punish = true;
    if (openState) punish = true;

    if (!busy && !inHazard && !threatSoon && punish && this.window.swings < this.window.cap && p.stamina > 16) {
      if (dist > reach) { this._move(it, toBoss, 1); it.sprint = dist > reach + 2.5; }
      else if (this._canSwing(p)) {
        if (this.rng.chance(0.2) && p.stamina > 45 && recoveryLeft > 0.9) it.heavy = true; else it.light = true;
        this.window.swings++;
      }
      return it;
    }

    // ── 7. neutral: stay near, circle, and take the openings it gives ──────
    if (!busy && !evade) {
      if (inHazard) { this._move(it, toBoss, 0.2); return it; }     // steering does the work

      if (b.state === 'neutral' && this.decide <= 0) {
        this.decide = 0.3;
        if (this.string <= 0 && dist < reach + 0.4 && p.stamina > 45 && this.rng.chance(s.engage * 0.4)) {
          this.string = this.rng.chance(0.5) ? 2 : 1;
        }
      }
      if (this.string > 0 && b.state === 'neutral' && !threatSoon) {
        if (dist > reach) this._move(it, toBoss, 1);
        else if (this._canSwing(p)) { it.light = true; this.string--; }
        return it;
      }
      if (b.state !== 'neutral') this.string = 0;

      const want = b.state === 'neutral' ? s.hover : s.hover + 1.0;
      this.hover.t -= dt;
      if (this.hover.t <= 0) { this.hover.t = this.rng.range(0.8, 2.0); this.hover.dir = this.rng.chance(0.5) ? 1 : -1; }
      if (dist > want + 0.7) {
        this._move(it, toBoss + this.hover.dir * 0.35, 1);
        it.sprint = dist > 7 && b.state !== 'move';
      } else if (dist < want - 0.9) {
        this._move(it, toBoss + Math.PI + this.hover.dir * 0.5, 0.8);
      } else {
        this._move(it, toBoss + this.hover.dir * Math.PI / 2, 0.5);
      }
    }
    return it;
  }

  _canSwing(p) {
    if (!p.busy) return true;
    return p.state === 'attack' && p.t > p.atk.spec.startup + p.atk.spec.active;
  }

  // ── planning ──────────────────────────────────────────────────────────────
  _planForStep(r, dist) {
    const f = this.f, p = f.player, s = this.s, step = r.step, b = f.boss;
    const h = step.hit;
    const stepStart = f.time - r.t;

    // a shockwave that leaves after the blow: learned, so plan a second dodge
    for (const sp of step.spawn ?? []) {
      if (sp.kind === 'ring' && typeof sp.at === 'number' && sp.p.dmg > 0) {
        const arrive = stepStart + sp.at + Math.max(0, dist - 0.6) / sp.p.speed;
        if (dist < sp.p.maxR) this.plans.push({ kind: 'roll', at: arrive - 0.12 + this.rng.gauss(0, s.jitter), until: arrive + 0.3,
          dir: yawTo(p.x, p.z, b.x, b.z) + this.rng.range(-0.4, 0.4) });
      }
    }
    if (!h || step.charge) return;              // charges are read live

    // the first blow is read on sight; follow-ups are read by rhythm
    const combo = r.i > 0;
    const notice = combo
      ? stepStart + Math.max(0.02, this.rng.gauss(0.05, 0.03))
      : stepStart + Math.max(0.08, this.rng.gauss(s.react, s.reactSd));
    let hitAt = stepStart + step.windup;
    if (step.leap) hitAt += step.active;

    const reachMult = b.flags.reachMult ?? 1;
    const range = h.shape === 'arc' ? h.range * reachMult + 1.6 :
                  h.shape === 'circle' ? h.radius * reachMult + 1.1 : 99;
    if (!step.leap && dist > range + (step.advance ?? 0) + 0.5) return;

    const tooLate = notice > hitAt - 0.1;
    let kind = 'roll';
    if (!tooLate && h.parryable && this.rng.chance(s.parry)) kind = 'parry';
    else if (!tooLate && !h.unblockable && !step.leap && this.rng.chance(s.block) && p.stamina > h.dmg * b.dmgMult * 1.2) kind = 'block';

    const err = this.rng.gauss(0, s.jitter * (combo ? 1.15 : 1));
    if (kind === 'roll') {
      const ideal = hitAt - 0.15;
      const away = h.shape === 'circle' && !step.leap ? yawTo(b.x, b.z, p.x, p.z) + this.rng.range(-0.5, 0.5) : undefined;
      this.plans.push({ kind, at: Math.max(notice, ideal + err), until: hitAt + step.active + 0.2, dir: away, hold: !!step.delay });
    } else if (kind === 'parry') {
      const ideal = hitAt - (PLAYER.parry.startup + PLAYER.parry.window * 0.5);
      this.plans.push({ kind, at: Math.max(notice, ideal + err * 0.9), until: hitAt + 0.3, hold: !!step.delay });
    } else {
      this.plans.push({ kind, at: notice, until: hitAt + step.active + 0.15, hold: !!step.delay });
    }
  }

  _inHazard() {
    const f = this.f, p = f.player;
    for (const h of f.hazards) {
      if (h.kind === 'aoe' && !h.fired && Math.hypot(p.x - h.x, p.z - h.z) < h.radius + 0.9) return true;
      if (h.kind === 'wipe' && !h.fired) return true;
      if (h.kind === 'tiles' && !h.fired) {
        const i = Math.floor((p.x - h.origin) / h.size), j = Math.floor((p.z - h.origin) / h.size);
        if (h.cells.some(([a, c]) => a === i && c === j)) return true;
      }
    }
    return false;
  }

  _threats(dist) {
    const f = this.f, p = f.player, b = f.boss;
    if (f.time - this.lastRoll < 0.3 || p.stamina < 8) return null;

    for (const q of f.projectiles) {
      if (q.kind === 'phantom' && q.delay > 0) continue;
      const rx = p.x - q.x, rz = p.z - q.z;
      const v2 = q.vx * q.vx + q.vz * q.vz;
      if (v2 < 0.01) continue;
      const tMin = (rx * q.vx + rz * q.vz) / v2;
      if (tMin < 0 || tMin > 0.3) continue;
      const cx = q.x + q.vx * tMin - p.x, cz = q.z + q.vz * tMin - p.z;
      if (Math.hypot(cx, cz) < q.radius + p.radius + 0.3 && this.rng.chance(0.85)) {
        return { dir: Math.atan2(q.vx, q.vz) + (this.rng.chance(0.5) ? 1.4 : -1.4) };
      }
    }
    for (const h of f.hazards) {
      if (h.kind === 'aoe' && !h.fired) {
        const left = h.delay - h.age;
        if (Math.hypot(p.x - h.x, p.z - h.z) < h.radius + p.radius + 0.2 && left < 0.3 && left > 0.05) return { dir: yawTo(h.x, h.z, p.x, p.z) };
      } else if (h.kind === 'ring' && !h.hitDone && h.dmg > 0) {
        const tt = (Math.hypot(p.x - h.x, p.z - h.z) - h.r) / h.speed;
        h._err ??= this.rng.gauss(0, this.s.jitter);
        if (tt > 0 && tt < 0.15 + h._err) return { dir: yawTo(p.x, p.z, h.x, h.z) + 0.5 };
      } else if (h.kind === 'tiles' && !h.fired) {
        const left = h.delay - h.age;
        const i = Math.floor((p.x - h.origin) / h.size), j = Math.floor((p.z - h.origin) / h.size);
        if (h.cells.some(([a, c]) => a === i && c === j) && left < 0.25 && left > 0.05) return { dir: this.rng.range(0, Math.PI * 2) };
      } else if (h.kind === 'wipe' && !h.fired) {
        const left = h.delay - h.age;
        if (Math.hypot(p.x - h.x, p.z - h.z) > h.safeRadius - 0.6 && left < 0.3 && left > 0.05) return { dir: yawTo(p.x, p.z, h.x, h.z) };
      }
    }
    // a charge coming at us: seen late-ish, timed with human error.
    // Each leg of a charge (a bounce starts a new leg) gets its own read.
    const r = b.run;
    if (r && r.step.charge && r.phase === 'active') {
      const sp = Math.hypot(b.vx, b.vz);
      const closing = ((p.x - b.x) * b.vx + (p.z - b.z) * b.vz) / Math.max(dist * sp, 1e-3);
      const leg = `${this.stepKey}:${r.charge?.bounces}`;
      if (closing > 0.6) {
        if (this.chargeLeg !== leg) {
          this.chargeLeg = leg;
          this.chargeSeen = f.time + Math.max(0.05, this.rng.gauss(this.s.react * 0.7, this.s.reactSd));
          this.chargeErr = this.rng.gauss(0, this.s.jitter * 1.4);
        }
        const tt = dist / Math.max(sp, 0.1);
        if (f.time >= this.chargeSeen && tt < 0.2 + this.chargeErr) {
          this.chargeLeg = leg + ':done';
          return { dir: Math.atan2(b.vx, b.vz) + (this.rng.chance(0.5) ? 1.5 : -1.5) };
        }
      }
    }
    return null;
  }

  // ── motor ─────────────────────────────────────────────────────────────────
  _rollDir(toBoss) {
    const side = this.rng.chance(0.5) ? 1 : -1;
    return toBoss + side * this.rng.range(1.2, 1.9);
  }

  _roll(it, dir) {
    it.roll = true;
    it.mx = Math.sin(dir); it.mz = Math.cos(dir);
    this.lastRoll = this.f.time;
  }

  _move(it, yaw, mag) {
    const f = this.f, p = f.player;
    let mx = Math.sin(yaw) * mag, mz = Math.cos(yaw) * mag;
    for (const h of f.hazards) {
      if (h.kind === 'aoe' && !h.fired) {
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d < h.radius + 1.2) { const a = yawTo(h.x, h.z, p.x, p.z); mx += Math.sin(a) * 1.6; mz += Math.cos(a) * 1.6; }
      } else if (h.kind === 'wipe' && !h.fired) {
        const a = yawTo(p.x, p.z, h.x, h.z);
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d > h.safeRadius * 0.5) { mx = Math.sin(a) * 1.2; mz = Math.cos(a) * 1.2; it.sprint = d > 3; }
      } else if (h.kind === 'tiles' && !h.fired) {
        const i = Math.floor((p.x - h.origin) / h.size), j = Math.floor((p.z - h.origin) / h.size);
        if (h.cells.some(([a, c]) => a === i && c === j)) {
          let best = null, bd = 1e9;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (h.cells.some(([a, c]) => a === ni && c === nj)) continue;
            const cx = h.origin + (ni + 0.5) * h.size, cz = h.origin + (nj + 0.5) * h.size;
            const dd = Math.hypot(cx - p.x, cz - p.z);
            if (dd < bd) { bd = dd; best = [cx, cz]; }
          }
          if (best) { const a = yawTo(p.x, p.z, best[0], best[1]); mx = Math.sin(a); mz = Math.cos(a); }
        }
      }
    }
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    it.mx = mx; it.mz = mz;
  }
}
