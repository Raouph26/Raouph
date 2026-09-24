// Compare every weapon on the same bosses, same stats, same bot.
import { Fight, TICK } from '../src/sim/fight.js';
import { Bot, SKILL } from '../src/sim/bot.js';
import { bossForFight } from '../src/content/worlds.js';
import { WEAPON_ORDER } from '../src/sim/weapons.js';
const bosses = ['meeting', 'captcha', 'hitbox', 'deadline', 'algorithm'];
const stats = { vigor: 6, endurance: 4, strength: 6, flask: 2, potency: 1 };
for (const wpn of WEAPON_ORDER) {
  const row = [];
  for (const id of bosses) {
    let wins = 0, t = 0; const n = 40;
    for (let s = 0; s < n; s++) {
      const { def, hpMult, dmgMult } = bossForFight(id);
      const f = new Fight({ boss: def, stats: { ...stats, weapon: wpn }, seed: 300 + s * 7, hpMult, dmgMult });
      const bot = new Bot(f, SKILL.average, 300 + s * 7);
      for (let i = 0; i < 60 * 480 && !f.outcome; i++) { f.step(TICK, bot.intent(TICK)); f.events.length = 0; }
      if (f.outcome === 'won') { wins++; t += f.time; }
    }
    row.push(`${id} ${Math.round(wins / 40 * 100)}% ${wins ? Math.round(t / wins) : '-'}s`);
  }
  console.log(wpn.padEnd(11), row.join(' | '));
}
