// ─────────────────────────────────────────────────────────────────────────────
// Weapons. Every number that decides how a weapon feels lives here.
//
// An attack is: startup (committed, no damage) → active (hits land) →
// recovery (committed; the last part can be cancelled into a roll).
// Hits are resolved from these arcs, never from the animated blade, so a swing
// can't visually "miss" its own timing window. `anim` only tells the renderer
// which clip to play; it has no effect on the outcome.
// ─────────────────────────────────────────────────────────────────────────────

const deg = (d) => (d * Math.PI) / 180;

export const WEAPONS = {
  cleaver: {
    id: 'cleaver', name: 'BOG CLEAVER', cls: 'sword',
    desc: 'Found it. Kept it. It was in a bog.',
    guard: 0.80, stability: 1.0, riposte: 95, trail: 0xc9e27a,
    light: [
      { anim: 'slashR',   startup: .15, active: .10, recovery: .30, dmg: 20, cost: 13, poise: 16, reach: 2.35, arc: deg(62), lunge: 0.9 },
      { anim: 'slashL',   startup: .13, active: .10, recovery: .31, dmg: 20, cost: 13, poise: 16, reach: 2.35, arc: deg(66), lunge: 0.8 },
      { anim: 'thrust',   startup: .19, active: .11, recovery: .42, dmg: 27, cost: 15, poise: 22, reach: 2.6,  arc: deg(30), lunge: 1.4 },
    ],
    heavy: [
      { anim: 'overhead', startup: .42, active: .13, recovery: .50, dmg: 44, cost: 28, poise: 40, reach: 2.45, arc: deg(40), lunge: 1.3, hyper: [.2, .55] },
      { anim: 'overhead', startup: .36, active: .13, recovery: .56, dmg: 48, cost: 28, poise: 42, reach: 2.45, arc: deg(40), lunge: 1.1, hyper: [.18, .5] },
    ],
    run:  { anim: 'runSlash', startup: .20, active: .12, recovery: .46, dmg: 30, cost: 18, poise: 26, reach: 2.5, arc: deg(55), lunge: 2.6 },
  },

  needle: {
    id: 'needle', name: 'REED NEEDLE', cls: 'thrust',
    desc: 'His, now. He will want it back. He will not get it back.',
    guard: 0.62, stability: 0.8, riposte: 128, trail: 0x9fd6f2,
    light: [
      { anim: 'thrust',   startup: .10, active: .08, recovery: .22, dmg: 16, cost: 9,  poise: 9,  reach: 2.75, arc: deg(28), lunge: 0.9 },
      { anim: 'thrust',   startup: .10, active: .08, recovery: .22, dmg: 16, cost: 9,  poise: 8,  reach: 2.75, arc: deg(26), lunge: 0.9 },
      { anim: 'slashR',   startup: .12, active: .09, recovery: .25, dmg: 17, cost: 10, poise: 10, reach: 2.5,  arc: deg(60), lunge: 0.6 },
      { anim: 'thrust',   startup: .15, active: .09, recovery: .36, dmg: 24, cost: 12, poise: 14, reach: 2.9,  arc: deg(26), lunge: 1.5 },
    ],
    heavy: [
      { anim: 'lungeThrust', startup: .30, active: .12, recovery: .44, dmg: 42, cost: 24, poise: 26, reach: 3.0, arc: deg(24), lunge: 3.0 },
    ],
    run:  { anim: 'lungeThrust', startup: .16, active: .10, recovery: .40, dmg: 24, cost: 14, poise: 14, reach: 2.9, arc: deg(24), lunge: 3.2 },
  },

  banhammer: {
    id: 'banhammer', name: 'THE BANHAMMER', cls: 'hammer',
    desc: 'Taken from the Moderator. Still warm. Still has opinions.',
    guard: 0.90, stability: 1.25, riposte: 120, trail: 0xe0a64b,
    light: [
      { anim: 'hammerR',  startup: .42, active: .14, recovery: .62, dmg: 34, cost: 27, poise: 44, reach: 2.55, arc: deg(55), lunge: 0.9, hyper: [.18, .56] },
      { anim: 'hammerL',  startup: .40, active: .14, recovery: .66, dmg: 36, cost: 27, poise: 44, reach: 2.55, arc: deg(55), lunge: 0.8, hyper: [.18, .54] },
    ],
    heavy: [
      { anim: 'slam', startup: .74, active: .15, recovery: .86, dmg: 64, cost: 44, poise: 80, reach: 2.7, arc: deg(36), lunge: 1.0, hyper: [.3, .89],
        shock: { radius: 3.0, dmg: 22 } },
    ],
    run:  { anim: 'slam', startup: .44, active: .14, recovery: .72, dmg: 46, cost: 30, poise: 60, reach: 2.6, arc: deg(40), lunge: 2.4, hyper: [.1, .54] },
  },

  lance: {
    id: 'lance', name: 'OVERTIME LANCE', cls: 'spear',
    desc: 'Billable. Every single thrust is billable.',
    guard: 0.85, stability: 1.1, riposte: 105, trail: 0xf0e2b0,
    light: [
      { anim: 'spearPoke', startup: .18, active: .09, recovery: .32, dmg: 15, cost: 12, poise: 12, reach: 3.3, arc: deg(18), lunge: 0.7 },
      { anim: 'spearPoke', startup: .16, active: .09, recovery: .32, dmg: 15, cost: 12, poise: 12, reach: 3.3, arc: deg(18), lunge: 0.7 },
      { anim: 'spearPoke', startup: .16, active: .09, recovery: .42, dmg: 19, cost: 13, poise: 16, reach: 3.45,  arc: deg(18), lunge: 1.0 },
    ],
    heavy: [
      { anim: 'spearSweep', startup: .36, active: .15, recovery: .52, dmg: 31, cost: 26, poise: 30, reach: 3.3, arc: deg(85), lunge: 0.6 },
    ],
    run:  { anim: 'lungeThrust', startup: .20, active: .12, recovery: .46, dmg: 32, cost: 18, poise: 24, reach: 3.6, arc: deg(18), lunge: 3.4 },
  },

  doomscroll: {
    id: 'doomscroll', name: 'THE DOOMSCROLL', cls: 'scythe',
    desc: 'It keeps going. You keep going. Neither of you knows why.',
    guard: 0.70, stability: 0.9, riposte: 115, trail: 0xc28bff,
    light: [
      { anim: 'reapR', startup: .30, active: .14, recovery: .44, dmg: 25, cost: 20, poise: 26, reach: 3.1, arc: deg(100), lunge: 0.7 },
      { anim: 'reapL', startup: .28, active: .14, recovery: .48, dmg: 26, cost: 20, poise: 26, reach: 3.1, arc: deg(100), lunge: 0.6 },
    ],
    heavy: [
      { anim: 'spin', startup: .46, active: .24, recovery: .60, dmg: 44, cost: 38, poise: 40, reach: 3.2, arc: Math.PI, lunge: 0.4, hyper: [.25, .7] },
    ],
    run:  { anim: 'reapR', startup: .22, active: .14, recovery: .48, dmg: 36, cost: 22, poise: 30, reach: 3.1, arc: deg(100), lunge: 2.4 },
  },
};

export const WEAPON_ORDER = ['cleaver', 'needle', 'banhammer', 'lance', 'doomscroll'];
