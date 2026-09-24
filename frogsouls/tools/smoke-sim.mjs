import { Fight, TICK, EMPTY_INTENT } from '../src/sim/fight.js';
import { BOSSES } from '../src/content/bosses.js';
import { bossForFight } from '../src/content/worlds.js';

let fails = 0;
for (const id of Object.keys(BOSSES)) {
  try {
    const { def, hpMult, dmgMult } = bossForFight(id);
    const f = new Fight({ boss: def, seed: 3, hpMult, dmgMult });
    const kinds = new Set(); let moves = new Set();
    // a flailing player: swings and rolls at random so every code path gets poked
    let rs = 11;
    const r = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 60 * 120 && !f.outcome; i++) {
      const it = { ...EMPTY_INTENT, mx: Math.sin(i / 50), mz: Math.cos(i / 70),
        light: r() < .04, heavy: r() < .01, roll: r() < .03, parry: r() < .01, heal: r() < .003, block: r() < .3 };
      f.step(TICK, it);
      for (const e of f.drain()) { kinds.add(e.type); if (e.type === 'bossMove') moves.add(e.id); }
      // force phases so late-phase code runs too
      if (i === 60 * 20) { f.boss.hp = f.boss.maxHp * .45; f.boss._checkPhase(); }
      if (i === 60 * 40) { f.boss.hp = f.boss.maxHp * .25; f.boss._checkPhase(); }
      if (!f.player.alive) { f.player.alive = true; f.player.hp = 1e6; f.player.enter('idle'); f.outcome = null; }
    }
    console.log(id.padEnd(13), 'phase', f.boss.phase, 'moves', [...moves].join(','));
  } catch (e) { fails++; console.log(id, 'FAILED', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log(fails ? `${fails} FAILED` : 'all 25 bosses ran');
