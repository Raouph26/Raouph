import { BOSSES } from './bosses.js';
import { TUNING } from './tuning.js';

// Five worlds, ordered so the palettes make an arc: green at home, then grey,
// flat white, one warm light in the dark, fire — and the last fight drains
// the colour out of the game entirely.

export const WORLDS = [
  { id: 'pond', name: 'THE POND', epithet: 'where it started. where it is still going.',
    look: 'verdigris', env: 'pond', tint: 0x53c9a6,
    bosses: ['duck', 'grandpa', 'shrimp', 'crab'], boss: 'otherfrog', flyMult: 1.0, dmg: 1.0, hp: 1.0 },
  { id: 'comments', name: 'THE COMMENT SECTION', epithet: 'everyone agrees, loudly, about nothing.',
    look: 'ashen', env: 'comments', tint: 0x8fa6c4,
    bosses: ['replyguy', 'capslock', 'firstcomment', 'bot'], boss: 'moderator', flyMult: 1.6, dmg: 1.12, hp: 1.0 },
  { id: 'office', name: 'THE BACK OFFICE', epithet: 'flat white light. nowhere to sit down.',
    look: 'bone', env: 'office', tint: 0xe8e0c8,
    bosses: ['monday', 'printer', 'vacuum', 'meeting'], boss: 'deadline', flyMult: 2.4, dmg: 1.25, hp: 1.0 },
  { id: 'feed', name: 'THE 3 A.M. FEED', epithet: 'one warm light. everything else is scrolling.',
    look: 'sodium', env: 'feed', tint: 0xffb257,
    bosses: ['unskippable', 'influencer', 'captcha', 'battery'], boss: 'algorithm', flyMult: 3.4, dmg: 1.38, hp: 1.0 },
  { id: 'server', name: 'THE SERVER FARM', epithet: 'it is on fire. it is fine.',
    look: 'ember', env: 'server', tint: 0xd1452e,
    bosses: ['lag', 'hitbox', 'patchnotes', 'loading'], boss: 'bluescreen', flyMult: 4.6, dmg: 1.5, hp: 1.0 },
];

export const worldById = (id) => WORLDS.find((w) => w.id === id);
export const worldOfBoss = (bossId) => WORLDS.find((w) => w.boss === bossId || w.bosses.includes(bossId));

/** Everything a fight needs about a boss: its definition plus its world's scaling. */
export function bossForFight(bossId, ngCycle = 0) {
  const def = BOSSES[bossId];
  const w = worldOfBoss(bossId);
  const ng = 1 + ngCycle * 0.5;
  const t = TUNING[bossId] ?? { hp: 1, dmg: 1 };
  return {
    def: { ...def, look: def.look ?? w.look },
    world: w,
    hpMult: w.hp * ng * t.hp,
    dmgMult: w.dmg * (1 + ngCycle * 0.35) * t.dmg,
  };
}
