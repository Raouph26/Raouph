// Flies are the currency: bosses burst into them, the Old Toad eats them and
// makes you stronger. Levels cost more the more you've bought, souls-style,
// so the choice of what to buy matters more than the grind.

export const STATS = [
  { id: 'vigor',     name: 'VIGOR',       desc: '+11 max HP',            max: 25 },
  { id: 'endurance', name: 'ENDURANCE',   desc: '+8 max stamina',        max: 25 },
  { id: 'strength',  name: 'STRENGTH',    desc: '+6.5% damage',          max: 25 },
  { id: 'flask',     name: 'DEW FLASKS',  desc: '+1 flask per fight',    max: 3 },
  { id: 'potency',   name: 'DEW POTENCY', desc: '+4% healing per flask', max: 6 },
];

export const levelCost = (totalLevels) => Math.round(90 * Math.pow(1.12, totalLevels));

export function totalLevels(levels) {
  return STATS.reduce((n, s) => n + (levels[s.id] ?? 0), 0);
}

export function flyReward(boss, world, firstClear, ngCycle = 0) {
  const base = boss.world ? 450 : 150;
  const ng = 1 + ngCycle * 0.5;
  return Math.round(base * world.flyMult * ng * (firstClear ? 1 : 0.3));
}

// The Old Toad has opinions.
export const TOAD_LINES = {
  greet: [
    'ribbit. or don\'t. i\'m not your dad.',
    'you again. good.',
    'flies. i require flies.',
    'the pond remembers. the pond is also very wet.',
    'sit. or stand. both are allowed here.',
  ],
  buy: ['yes. yes.', 'delicious. stronger now.', 'crunchy.', 'that one had legs. good legs.', 'more.'],
  poor: ['you do not have the flies.', 'no flies, no gains.', 'come back crunchier.'],
  max: ['that is as strong as that gets.', 'enough. even for you.'],
  equip: ['a fine stick.', 'yes, hit things with that.', 'fashion.'],
};
