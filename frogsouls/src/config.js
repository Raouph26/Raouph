// ─────────────────────────────────────────────────────────────────────────────
// Every number that decides how the game FEELS lives here. Nothing else.
// Times are in seconds. Tune these first; touch systems second.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAYER = {
  radius: 0.42,
  height: 1.7,

  walkSpeed: 3.1,
  sprintSpeed: 6.0,
  lockStrafeSpeed: 2.7,
  accel: 26,          // ground acceleration (m/s^2)
  friction: 16,
  turnRate: 13,       // rad/s when unlocked

  maxHp: 100,
  maxStamina: 110,
  staminaRegen: 26,        // per second
  staminaRegenDelay: 0.55, // after any spend
  guardBreakRegenDelay: 1.6,

  // ── Roll: the single most important set of numbers in the game ──
  roll: {
    cost: 26,
    startup: 0.055,   // committed, no i-frames yet
    iframes: 0.34,    // invulnerable window (starts at `startup`)
    duration: 0.52,   // total locomotion time
    recovery: 0.14,   // can't act
    distance: 4.05,
    // input buffered this long before roll becomes available again
    buffer: 0.22,
  },

  backstep: { cost: 15, duration: 0.34, distance: 2.1, iframes: 0.10 },

  // ── Block ──
  block: {
    moveScale: 0.42,
    absorb: 0.78,            // fraction of damage negated while guarding
    staminaPerDamage: 0.85,  // stamina chipped per point of incoming damage
    guardBreakStun: 1.35,
  },

  // ── Parry: tap RMB. Window opens fast, closes fast. ──
  parry: {
    cost: 14,
    startup: 0.04,
    window: 0.17,     // active parry frames
    recovery: 0.42,   // brutal if you whiff — this is the risk
  },

  riposte: { damage: 62, duration: 0.85, lockDistance: 2.4 },

  hurtStun: 0.34,
  invulnAfterHit: 0.35,
};

// ── Weapons. Three archetypes that genuinely change the fight. ──
export const WEAPONS = {
  cleaver: {
    name: 'Bog Cleaver', accent: 0x8fae4b, reach: 2.25,
    light: { dmg: 17, cost: 15, startup: 0.17, active: 0.10, recovery: 0.30, poise: 14, step: 1.05 },
    heavy: { dmg: 36, cost: 30, startup: 0.46, active: 0.14, recovery: 0.55, poise: 34, step: 1.7 },
    combo: 3,
  },
  rapier: {
    name: 'Reed Needle', accent: 0x6fa8c9, reach: 2.6,
    light: { dmg: 11, cost: 10, startup: 0.11, active: 0.07, recovery: 0.19, poise: 7, step: 1.5 },
    heavy: { dmg: 25, cost: 22, startup: 0.30, active: 0.09, recovery: 0.38, poise: 18, step: 2.6 },
    combo: 4,
  },
  maul: {
    name: 'Mire Maul', accent: 0xc0793a, reach: 2.7,
    light: { dmg: 29, cost: 26, startup: 0.34, active: 0.13, recovery: 0.46, poise: 30, step: 1.2 },
    heavy: { dmg: 58, cost: 46, startup: 0.72, active: 0.18, recovery: 0.82, poise: 60, step: 2.0 },
    combo: 2,
  },
};

export const CAMERA = {
  distance: 6.2,
  height: 2.1,
  lockHeight: 2.35,
  lockBack: 6.4,
  lockShoulder: 1.55,
  lookAtHeight: 1.25,
  followLerp: 9.5,
  lockLerp: 7.0,
  mouseSens: 0.0026,
  pitchMin: -0.62,
  pitchMax: 0.92,
  fov: 58,
  lockRange: 26,
  shake: { decay: 5.2, max: 0.42 },
};

export const FEEL = {
  hitstopLight: 0.055,
  hitstopHeavy: 0.10,
  hitstopParry: 0.19,
  hitstopRiposte: 0.30,
  shakeLight: 0.10,
  shakeHeavy: 0.22,
  shakeParry: 0.26,
  flashParry: 0.55,
};
