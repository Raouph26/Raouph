// ─────────────────────────────────────────────────────────────────────────────
// Save data, in localStorage. Every access is guarded: a private window or a
// blocked store just means the game runs without saving.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'frogsouls.save.v2';

export const DEFAULT_SETTINGS = {
  master: .8, music: .6, sfx: .9, sens: 1, invertY: false, quality: 'auto', vibration: true, hints: true,
};

const blank = () => ({
  v: 2, flies: 0, totalFlies: 0,
  levels: { vigor: 0, endurance: 0, strength: 0, flask: 0, potency: 0 },
  weapons: ['cleaver'], weapon: 'cleaver',
  cleared: {}, attempts: {}, best: {}, deaths: 0, ng: 0, playtime: 0, seenHelp: false, tips: {},
  settings: { ...DEFAULT_SETTINGS },
});

export class Save {
  constructor() {
    this.d = blank();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        this.d = { ...blank(), ...s, levels: { ...blank().levels, ...s.levels }, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
      }
    } catch { /* play without a save */ }
    this.exists = this.d.playtime > 0 || Object.keys(this.d.cleared).length > 0;
  }

  write() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch { /* ignore */ } }

  newGame() {
    const settings = this.d.settings;
    this.d = blank();
    this.d.settings = settings;
    this.exists = true;
    this.write();
  }

  newGamePlus() {
    this.d.ng += 1;
    this.d.cleared = {};
    this.write();
  }

  get settings() { return this.d.settings; }
  setSetting(k, v) { this.d.settings[k] = v; this.write(); }

  isCleared(id) { return (this.d.cleared[id] ?? 0) > 0; }
  clear(id, time) {
    const first = !this.isCleared(id);
    this.d.cleared[id] = (this.d.cleared[id] ?? 0) + 1;
    if (!this.d.best[id] || time < this.d.best[id]) this.d.best[id] = time;
    this.write();
    return first;
  }
  attempt(id) { this.d.attempts[id] = (this.d.attempts[id] ?? 0) + 1; this.write(); return this.d.attempts[id]; }
  died() { this.d.deaths++; this.write(); }

  addFlies(n) { this.d.flies += n; this.d.totalFlies += n; this.write(); }
  spend(n) { if (this.d.flies < n) return false; this.d.flies -= n; this.write(); return true; }

  unlockWeapon(id) { if (!this.d.weapons.includes(id)) { this.d.weapons.push(id); this.write(); return true; } return false; }
  equip(id) { if (this.d.weapons.includes(id)) { this.d.weapon = id; this.write(); } }

  worldUnlocked(worlds, i) { return i === 0 || this.isCleared(worlds[i - 1].boss); }
  worldBossUnlocked(world) { return world.bosses.every((b) => this.isCleared(b)); }
  worldProgress(world) { return world.bosses.filter((b) => this.isCleared(b)).length; }

  tick(dt) { this.d.playtime += dt; }

  stats() { return { ...this.d.levels, weapon: this.d.weapon }; }
}
