// Auto-tuner: node tools/tune.mjs [runs=60] [bossId…]
// Per boss: fit the damage multiplier to the target win rate by bisection
// (log scale), fit HP to the target fight length, repeat twice, write
// src/content/tuning.js. Win rates are per attempt — people retry.
import { writeFileSync } from 'node:fs';
import { Fight, TICK } from '../src/sim/fight.js';
import { Bot, SKILL } from '../src/sim/bot.js';
import { WORLDS, worldOfBoss } from '../src/content/worlds.js';
import { BOSSES } from '../src/content/bosses.js';
import { TUNING as OLD } from '../src/content/tuning.js';
import { PROGRESSION, TARGET } from './targets.mjs';

const runs = +(process.argv[2] ?? 60);
const only = process.argv.slice(3);
const out = { ...OLD };

function trial(id, hpK, dmgK, n) {
  const w = worldOfBoss(id), wi = WORLDS.indexOf(w), isWorld = id === w.boss;
  const stats = PROGRESSION[wi][isWorld ? 1 : 0];
  let wins = 0, tw = 0;
  for (let s = 0; s < n; s++) {
    const f = new Fight({ boss: { ...BOSSES[id], look: w.look }, stats, seed: 5000 + s * 31, hpMult: w.hp * hpK, dmgMult: w.dmg * dmgK });
    const bot = new Bot(f, SKILL.average, 5000 + s * 31);
    for (let i = 0; i < 60 * 480 && !f.outcome; i++) { f.step(TICK, bot.intent(TICK)); f.events.length = 0; }
    if (f.outcome === 'won') { wins++; tw += f.time; }
  }
  return { wr: wins / n, t: wins ? tw / wins : 0 };
}

for (const w of WORLDS) for (const id of [...w.bosses, w.boss]) {
  if (only.length && !only.includes(id)) continue;
  const tgt = TARGET[id === w.boss ? 'world' : 'normal'];
  let hpK = 1, dmgK = 1, r;
  for (let outer = 0; outer < 3; outer++) {
    // win rate falls as damage rises: bisect log(dmgK)
    let lo = Math.log(0.35), hi = Math.log(3.0);
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      r = trial(id, hpK, Math.exp(mid), runs);
      if (r.wr > tgt.win) lo = mid; else hi = mid;
    }
    dmgK = Math.exp((lo + hi) / 2);
    r = trial(id, hpK, dmgK, runs);
    if (outer < 2 && r.t > 0) hpK = Math.min(2.6, Math.max(0.45, hpK * Math.pow(tgt.time / r.t, 0.9)));
  }
  r = trial(id, hpK, dmgK, runs * 2);
  out[id] = { hp: +hpK.toFixed(3), dmg: +dmgK.toFixed(3) };
  const ok = r.wr >= tgt.band[0] && r.wr <= tgt.band[1] ? 'ok' : 'OFF';
  console.log(`${id.padEnd(13)} ${id === w.boss ? 'W' : ' '} hp×${hpK.toFixed(2)} dmg×${dmgK.toFixed(2)}  →  win ${(r.wr * 100).toFixed(0)}%  t ${r.t.toFixed(0)}s  ${ok}`);
}

const lines = Object.entries(out).map(([k, v]) => `  ${k}: { hp: ${v.hp}, dmg: ${v.dmg} },`).join('\n');
writeFileSync(new URL('../src/content/tuning.js', import.meta.url),
`// Per-boss multipliers written by tools/tune.mjs from simulated fights.
// hp scales the health pool (fight length); dmg scales every hit (lethality).
// Regenerate after changing moves, bosses or the player: node tools/tune.mjs
export const TUNING = {
${lines}
};
`);
