// Progress lives in localStorage. It can throw or come back empty (private
// windows, cleared data), so every access is guarded and the game plays fine
// with no save at all.

const KEY = 'frogsouls.progress.v1';
const blank = () => ({ cleared: {}, deaths: 0, weapon: 'cleaver' });

let state = blank();

try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...blank(), ...JSON.parse(raw) };
} catch { /* no save; carry on */ }

function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const Save = {
  get raw() { return state; },
  isCleared: (id) => !!state.cleared[id],
  clear(id) { state.cleared[id] = true; flush(); },
  addDeath() { state.deaths++; flush(); },
  get deaths() { return state.deaths; },
  get weapon() { return state.weapon; },
  setWeapon(w) { state.weapon = w; flush(); },
  /** A world boss unlocks only once all four of its bosses are down. */
  worldUnlocked(world) { return world.bosses.every(x => state.cleared[x.id]); },
  worldDone(world) { return this.worldUnlocked(world) && state.cleared[world.boss.id]; },
  reset() { state = blank(); flush(); },
};
