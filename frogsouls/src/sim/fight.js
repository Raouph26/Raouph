import { PlayerSim } from './player.js';
import { BossSim } from './boss.js';
import { updateProjectiles, updateHazards } from './effects.js';
import { makeRng } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// One boss fight, fully simulated. Step it with an Intent at a fixed rate.
// Emits events (hits, parries, phase changes…) that the renderer, the audio
// and the HUD drain each frame — the sim never calls into any of them.
// ─────────────────────────────────────────────────────────────────────────────

export const TICK = 1 / 60;

export const EMPTY_INTENT = Object.freeze({
  mx: 0, mz: 0, sprint: false, block: false, lock: true,
  light: false, heavy: false, roll: false, parry: false, heal: false,
});

export class Fight {
  constructor({ boss, stats = {}, seed = 1, hpMult = 1, dmgMult = 1, arena = 19 }) {
    this.rng = makeRng(seed);
    this.arena = arena;
    this.time = 0;
    this.outcome = null;          // 'won' | 'lost'
    this.events = [];
    this.projectiles = [];
    this.hazards = [];
    this.look = boss.look;
    this.dim = 0;
    this.mods = { noHeal: false, noBlock: false, staminaRegen: 1, iframes: 1, rollCost: 1, moveSpeed: 1, rollDistance: 1 };
    this.def = boss;

    this.player = new PlayerSim(this, stats);
    this.player.x = 0; this.player.z = 8; this.player.yaw = Math.PI;

    this.boss = new BossSim(this, boss, { hpMult, dmgMult });
    this.boss.x = 0; this.boss.z = -6; this.boss.yaw = 0;
  }

  enemies() { return this.boss.alive ? [this.boss] : []; }

  emit(e) {
    e.time = this.time;
    this.events.push(e);
    this.boss?.gimmick?.onEvent?.(this.boss, this, e);
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(dt, intent = EMPTY_INTENT) {
    this.time += dt;
    const lock = intent.lock && this.boss.alive ? this.boss : null;

    this.player.update(dt, intent, lock);
    this.boss.update(dt);
    updateProjectiles(this, dt);
    updateHazards(this, dt);
    this._collide();

    if (!this.outcome) {
      if (!this.player.alive) { this.outcome = 'lost'; this.emit({ type: 'outcome', outcome: 'lost' }); }
      else if (!this.boss.alive) { this.outcome = 'won'; this.emit({ type: 'outcome', outcome: 'won' }); }
    }
  }

  _collide() {
    const p = this.player, b = this.boss;
    clampToArena(p, this.arena);
    clampToArena(b, this.arena);
    if (b.y > 1.0 || !b.alive) return;           // leaping over you, or down
    const dx = p.x - b.x, dz = p.z - b.z;
    const d = Math.hypot(dx, dz);
    const min = p.radius + b.radius * 0.9;
    if (d > 1e-4 && d < min) {
      const push = min - d;
      // the frog is lighter; it gets moved, the boss barely does
      p.x += (dx / d) * push * 0.85; p.z += (dz / d) * push * 0.85;
      b.x -= (dx / d) * push * 0.15; b.z -= (dz / d) * push * 0.15;
      clampToArena(p, this.arena);
    }
  }

  /** Anything a boss bar should show besides HP (timers, rules, battery…). */
  bossHud() { return this.boss.gimmick?.hud?.(this.boss, this) ?? null; }
}

function clampToArena(a, R) {
  const d = Math.hypot(a.x, a.z);
  const max = R - a.radius;
  if (d > max) { a.x = (a.x / d) * max; a.z = (a.z / d) * max; }
}
