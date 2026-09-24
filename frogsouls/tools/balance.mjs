// Headless balance runner.
//   node tools/balance.mjs [skill=average] [runs=40] [bossId…]
// Plays every boss many times with the bot at the stats a player would
// plausibly have by that point, and reports win rate and fight length.

import { Fight, TICK } from '../src/sim/fight.js';
import { Bot, SKILL } from '../src/sim/bot.js';
import { WORLDS, bossForFight, worldOfBoss } from '../src/content/worlds.js';
import { BOSSES } from '../src/content/bosses.js';

const skillName = process.argv[2] ?? 'average';
const runs = +(process.argv[3] ?? 40);
const only = process.argv.slice(4);

import { PROGRESSION, TARGET as _T } from './targets.mjs';
const TARGET = { normal: _T.normal.band, world: _T.world.band };

function runOne(bossId, stats, skill, seed) {
  const { def, hpMult, dmgMult } = bossForFight(bossId);
  const f = new Fight({ boss: def, stats, seed, hpMult, dmgMult });
  const bot = new Bot(f, skill, seed);
  const maxT = 60 * 60 * 6;
  for (let i = 0; i < maxT && !f.outcome; i++) {
    f.step(TICK, bot.intent(TICK));
    f.drain();
  }
  return { won: f.outcome === 'won', t: f.time, bossHpLeft: f.boss.hpFrac, st: f.player.stats, flasks: f.player.flasks, hp: f.player.hp / f.player.maxHp };
}

const skill = SKILL[skillName];
const rows = [];
for (const w of WORLDS) {
  const wi = WORLDS.indexOf(w);
  for (const id of [...w.bosses, w.boss]) {
    if (only.length && !only.includes(id)) continue;
    const isWorld = id === w.boss;
    const stats = PROGRESSION[wi][isWorld ? 1 : 0];
    let wins = 0, tWin = 0, hpLeftLoss = 0, losses = 0, taken = 0, landed = 0, parries = 0, heals = 0;
    for (let s = 0; s < runs; s++) {
      const r = runOne(id, stats, skill, 1000 + s * 17);
      if (r.won) { wins++; tWin += r.t; } else { losses++; hpLeftLoss += r.bossHpLeft; }
      taken += r.st.hitsTaken; landed += r.st.hitsLanded; parries += r.st.parries; heals += r.st.heals;
    }
    const wr = wins / runs;
    const tgt = TARGET[isWorld ? 'world' : 'normal'];
    const flag = wr < tgt[0] ? 'HARD' : wr > tgt[1] ? 'EASY' : 'ok';
    rows.push({ id, wr, flag });
    console.log(
      `${id.padEnd(13)} ${isWorld ? 'W' : ' '} win ${(wr * 100).toFixed(0).padStart(3)}%  ` +
      `t ${(wins ? tWin / wins : 0).toFixed(0).padStart(4)}s  ` +
      `bossLeftOnLoss ${(losses ? hpLeftLoss / losses * 100 : 0).toFixed(0).padStart(3)}%  ` +
      `hitsTaken ${(taken / runs).toFixed(1).padStart(5)}  landed ${(landed / runs).toFixed(0).padStart(3)}  ` +
      `parry ${(parries / runs).toFixed(1)}  heals ${(heals / runs).toFixed(1)}  ${flag}`);
  }
}
const off = rows.filter((r) => r.flag !== 'ok');
console.log(`\n${rows.length - off.length}/${rows.length} in target band for "${skillName}"`);
