import { Fight, TICK } from '/home/user/Raouph/frogsouls/src/sim/fight.js';
import { Bot, SKILL } from '/home/user/Raouph/frogsouls/src/sim/bot.js';
import { WORLDS, worldOfBoss } from '/home/user/Raouph/frogsouls/src/content/worlds.js';
import { BOSSES } from '/home/user/Raouph/frogsouls/src/content/bosses.js';
import { PROGRESSION } from '/home/user/Raouph/frogsouls/tools/targets.mjs';
const id = process.argv[2], hpK = +process.argv[3];
const w = worldOfBoss(id), wi = WORLDS.indexOf(w), stats = PROGRESSION[wi][id === w.boss ? 1 : 0];
for (const d of process.argv.slice(4).map(Number)) {
  let wins = 0, n = 80;
  for (let s = 0; s < n; s++) {
    const f = new Fight({ boss: { ...BOSSES[id], look: w.look }, stats, seed: 9000 + s * 13, hpMult: w.hp * hpK, dmgMult: w.dmg * d });
    const bot = new Bot(f, SKILL.average, 9000 + s * 13);
    for (let i = 0; i < 60 * 480 && !f.outcome; i++) { f.step(TICK, bot.intent(TICK)); f.events.length = 0; }
    if (f.outcome === 'won') wins++;
  }
  console.log(id, 'dmg×' + d, 'win', Math.round(wins / n * 100) + '%');
}
