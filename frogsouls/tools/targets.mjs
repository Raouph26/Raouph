// What a player has bought by each world: [normal bosses, world boss].
export const PROGRESSION = [
  [{},                                                     { vigor: 2, endurance: 1, strength: 1 }],
  [{ vigor: 3, endurance: 2, strength: 2, flask: 1 },       { vigor: 4, endurance: 2, strength: 3, flask: 1 }],
  [{ vigor: 5, endurance: 3, strength: 4, flask: 1 },       { vigor: 6, endurance: 3, strength: 5, flask: 1 }],
  [{ vigor: 6, endurance: 4, strength: 6, flask: 2, potency: 1 }, { vigor: 7, endurance: 4, strength: 7, flask: 2, potency: 1 }],
  [{ vigor: 8, endurance: 4, strength: 7, flask: 3, potency: 1 }, { vigor: 9, endurance: 5, strength: 8, flask: 3, potency: 2 }],
];
// Average-player targets per attempt. World bosses are meant to take a few tries.
export const TARGET = {
  normal: { win: 0.80, band: [0.70, 0.90], time: 80 },
  world:  { win: 0.45, band: [0.33, 0.58], time: 150 },
};
