// node tools/diagnose.mjs bossId [skill] [runs]  — what hits the bot, and how often it dodges
import { Fight, TICK } from '../src/sim/fight.js';
import { Bot, SKILL } from '../src/sim/bot.js';
import { bossForFight, WORLDS, worldOfBoss } from '../src/content/worlds.js';
const id = process.argv[2], skill = SKILL[process.argv[3] ?? 'average'], runs = +(process.argv[4] ?? 30);
const hitsBy = {}, dodges = {}, blocks = {}, parries = {};
let dodged = 0, wins = 0, rolls = 0, attacks = 0, riposte = 0, swings = 0, time = 0;
const wi = WORLDS.indexOf(worldOfBoss(id));
const stats = [{}, { vigor: 3, endurance: 2, strength: 2, flask: 1 }, { vigor: 5, endurance: 3, strength: 4, flask: 1 },
  { vigor: 6, endurance: 4, strength: 6, flask: 2, potency: 1 }, { vigor: 8, endurance: 4, strength: 7, flask: 3, potency: 1 }][wi];
for (let s = 0; s < runs; s++) {
  const { def, hpMult, dmgMult } = bossForFight(id);
  const f = new Fight({ boss: def, stats, seed: 1000 + s * 17, hpMult, dmgMult });
  const bot = new Bot(f, skill, 1000 + s * 17);
  let cur = null;
  for (let i = 0; i < 60 * 600 && !f.outcome; i++) {
    f.step(TICK, bot.intent(TICK));
    for (const e of f.drain()) {
      if (e.type === 'bossMove') cur = e.id;
      if (e.type === 'hit' && e.target === 'player') hitsBy[f.player.lastHitBy ?? cur] = (hitsBy[f.player.lastHitBy ?? cur] ?? 0) + 1;
      if (e.type === 'dodged') { dodged++; dodges[cur] = (dodges[cur] ?? 0) + 1; }
      if (e.type === 'block') blocks[cur] = (blocks[cur] ?? 0) + 1;
      if (e.type === 'roll') rolls++;
      if (e.type === 'swing') swings++;
      if (e.type === 'riposte') riposte++;
    }
  }
  if (f.outcome === 'won') wins++;
  time += f.time;
}
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / runs).toFixed(1)}`).join('  ');
console.log(`${id}: win ${(wins / runs * 100).toFixed(0)}%  avg t ${(time / runs).toFixed(0)}s  rolls/fight ${(rolls / runs).toFixed(1)}  swings ${(swings / runs).toFixed(1)}  ripostes ${(riposte / runs).toFixed(1)}`);
console.log('  hits taken by move :', fmt(hitsBy));
console.log('  dodged (iframes)   :', fmt(dodges));
console.log('  blocked            :', fmt(blocks));
