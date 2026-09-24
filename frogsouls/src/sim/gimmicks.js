import { angleDiff, yawTo } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// Gimmicks: the one idea that makes a boss itself. Each is a bag of optional
// hooks the boss calls at the right moments:
//   init · update · chooseMove · beforeHit · afterHit · onMoveEnd · onPhase
//   onEvent (every fight event, so a boss can watch what you do)
//   hud → { label } for anything the boss bar should show (timers, %)
// The joke lives in how they fight, not only in what they're called.
// ─────────────────────────────────────────────────────────────────────────────

const G = {};

// THE OTHER FROG — he is also the main character
G.mirror = () => ({
  init(b) { b.flags.drinks = 0; b.flags.dodgeCd = 0; b.flags.seenSwing = null; },
  update(b, f, dt) {
    const pl = f.player;
    b.flags.dodgeCd -= dt;
    const d = Math.hypot(pl.x - b.x, pl.z - b.z);

    // reads your wind-up and rolls — once per swing, never frame-perfect
    if (pl.state === 'attack' && pl.atk && b.flags.seenSwing !== pl.atk && d < 4.6 &&
        (b.state === 'neutral' || (b.state === 'move' && b.run?.phase === 'windup'))) {
      b.flags.seenSwing = pl.atk;
      const reactOk = pl.t > 0.06 && pl.t < pl.atk.spec.startup;
      const chance = b.phase >= 2 ? 0.55 : 0.4;
      if (reactOk && b.flags.dodgeCd <= 0 && b.rng.chance(chance)) {
        const away = yawTo(pl.x, pl.z, b.x, b.z);
        const side = b.rng.chance(0.5) ? 1 : -1;
        b.startDodge(away + side * (b.rng.range(0.6, 1.3)), 4.0);
        b.flags.dodgeCd = 1.2;
        return;
      }
    }
    // backs off to drink when hurt, exactly like you do
    if (b.state === 'neutral' && b.hpFrac < 0.42 && b.flags.drinks < 3 && d > 5.2 &&
        pl.state !== 'attack' && b.rng.chance(dt * 1.6)) {
      b.flags.drinks++;
      b.startDrink(0.24);
      b.speak(['estus? never heard of it.', 'hold on.', 'one sec.'][b.flags.drinks - 1] ?? 'hold on.', 1.3);
    }
    if (b.hpFrac < 0.42 && b.flags.drinks < 3) b.neutral.mode = d < 5 ? 'backoff' : b.neutral.mode;
  },
});

// GRANDPA BRICK — sometimes forgets what he was doing
G.forgetful = () => ({
  onMoveEnd(b) {
    if (b.rng.chance(0.2)) { b.pause(2.1, '?'); return true; }
  },
});

// THE FIRST COMMENT — first.
G.first = () => ({
  init(b) { b.cd = 0; b.flags.opened = false; },
  chooseMove(b) {
    if (!b.flags.opened) { b.flags.opened = true; b.speak('first', 1.4); return b.moves.find((m) => m.id === 'thrust'); }
  },
});

// THE CAPS LOCK — IS NOT YELLING
G.caps = () => ({
  onPhase(b) { b.speak('I AM NOT YELLING', 2.2); },
});

// THE MODERATOR — the rules have changed
G.moderator = () => ({
  onPhase(b, f, phase) {
    if (phase === 2) {
      f.mods.noHeal = true;
      f.emit({ type: 'rule', text: 'RULE 1: NO HEALING' });
      b.speak('rule one. no healing.', 2.4);
    }
    if (phase === 3) {
      // the rules CHANGE — rule one is repealed, rule two takes its place
      f.mods.noHeal = false;
      f.mods.noBlock = true;
      f.emit({ type: 'rule', text: 'RULE 1 REPEALED · RULE 2: NO BLOCKING' });
      b.speak('rule one is repealed. rule two. no blocking.', 2.6);
    }
  },
  hud(b, f) {
    const r = [];
    if (f.mods.noHeal) r.push('NO HEALING');
    if (f.mods.noBlock) r.push('NO BLOCKING');
    return r.length ? { label: r.join(' · ') } : null;
  },
});

// THE MONDAY — again.
G.again = () => ({
  onMoveEnd(b, f, move, fromRepeat) {
    if (!fromRepeat && move.weight > 0) {
      b.speak('again.', 1.1);
      b.startMove(move.id, { repeat: true });
      return true;
    }
  },
});

// THE PRINTER — paper jam in tray 2
G.jam = () => ({
  onMoveEnd(b, f) {
    if (b.rng.chance(0.24)) { b.pause(2.5, 'PAPER JAM'); f.emit({ type: 'jam', x: b.x, z: b.z }); return true; }
  },
});

// THE MEETING — could have been an email
G.meeting = () => ({
  init(b) {
    // every blow is held a beat too long — patience is the whole fight
    b.moves = b.moves.map((m) => ({ ...m, steps: m.steps.map((s) => ({ ...s, delay: s.delay ?? { chance: 0.65, min: 0.3, max: 0.95 } })) }));
  },
  onMoveEnd(b) {
    if (b.rng.chance(0.14)) { b.pause(2.6, 'this could have been an email'); return true; }
  },
});

// THE DEADLINE — it was yesterday
G.deadline = (p = {}) => ({
  init(b) { b.flags.timer = p.seconds ?? 110; b.flags.overdue = false; },
  update(b, f, dt) {
    if (b.flags.overdue) return;
    b.flags.timer -= dt;
    if (b.flags.timer <= 0) {
      b.flags.timer = 0;
      b.flags.overdue = true;
      b.speed *= 1.35;
      b.cdMult *= 0.55;
      b.dmgMult *= 1.25;
      b.speak('OVERDUE', 2.5);
      f.emit({ type: 'rule', text: 'OVERDUE' });
    }
  },
  hud(b) {
    if (b.flags.overdue) return { label: 'OVERDUE', danger: true };
    const s = Math.ceil(b.flags.timer);
    return { label: `DUE IN ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, danger: s < 20 };
  },
});

// THE UNSKIPPABLE AD — skip in 5
G.unskippable = () => ({
  init(b) { b.flags.adTime = 5; },
  update(b, f, dt) { if (b.flags.adTime > 0) b.flags.adTime -= dt; },
  beforeHit(b, f) {
    if (b.flags.adTime > 0) {
      f.emit({ type: 'immune', x: b.x, z: b.z, text: `SKIP IN ${Math.ceil(b.flags.adTime)}` });
      return false;
    }
  },
  onPhase(b) { b.flags.adTime = 5; b.speak('ANOTHER AD', 2); },
  hud(b) { return b.flags.adTime > 0 ? { label: `SKIP IN ${Math.ceil(b.flags.adTime)}` } : null; },
});

// THE LOW BATTERY — 1%
G.battery = () => ({
  update(b, f) {
    const drain = 1 - b.hpFrac;
    b.speed = b.baseSpeed * (0.78 + 0.8 * drain);
    b.cdMult = 1.25 - 0.75 * drain;
    f.dim = drain * 0.7;
    if (b.hpFrac < 0.1 && !b.flags.onePct) { b.flags.onePct = true; b.speak('1%', 2); }
  },
  hud(b) { return { label: `BATTERY ${Math.max(1, Math.ceil(b.hpFrac * 100))}%`, danger: b.hpFrac < 0.2 }; },
});

// THE ALGORITHM — it already knows
G.algorithm = () => ({
  init(b) { b.flags.hist = []; b.flags.punish = 0; },
  onEvent(b, f, e) {
    const h = b.flags.hist;
    const push = (a) => { h.push(a); if (h.length > 14) h.shift(); };
    if (e.type === 'swing') push(e.heavy ? 'heavy' : 'light');
    else if (e.type === 'roll') push('roll');
    else if (e.type === 'block') push('block');
    else if (e.type === 'flaskStart') {
      push('heal');
      const pl = f.player;
      if (Math.hypot(pl.x - b.x, pl.z - b.z) < 10 && b.state === 'neutral' && b.rng.chance(0.65)) b.flags.punish = 1;
    }
  },
  chooseMove(b, f, d) {
    const h = b.flags.hist;
    const share = (a) => h.filter((x) => x === a).length / Math.max(6, h.length);
    const pick = (id) => {
      const m = b.moves.find((mm) => mm.id === id);
      if (m && (b.moveCd[id] ?? 0) <= 0) return m;
      return null;
    };
    if (b.flags.punish) {
      b.flags.punish = 0;
      const m = pick('thrust');
      if (m) { b.speak('recommended for you', 1.5); return m; }
    }
    if (share('light') > 0.45 && d < 5) {
      const m = pick('stance');
      if (m) { f.emit({ type: 'adapt', what: 'light' }); return m; }
    }
    if (share('block') > 0.3 && d < 5) {
      const m = pick('stomp');
      if (m) { f.emit({ type: 'adapt', what: 'block' }); b.speak('you like blocking', 1.4); return m; }
    }
    if (share('roll') > 0.4 && d < 4.5) {
      const m = pick('delayed');
      if (m) { f.emit({ type: 'adapt', what: 'roll' }); return m; }
    }
    return null;
  },
  hud(b) {
    const h = b.flags.hist;
    if (h.length < 6) return { label: 'LEARNING…' };
    const counts = {};
    for (const a of h) counts[a] = (counts[a] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, c) => c[1] - a[1])[0][0];
    return { label: `YOU LIKE: ${top.toUpperCase()}` };
  },
});

// THE LAG — rubber-bands
G.lag = () => ({
  init(b) { b.flags.hist = []; b.flags.next = 3.5; },
  update(b, f, dt) {
    const h = b.flags.hist;
    h.push([b.x, b.z]);
    if (h.length > 70) h.shift();
    b.flags.next -= dt;
    const inWindup = b.state === 'move' && b.run?.phase === 'windup';
    if (b.flags.next <= 0 && (b.state === 'neutral' || inWindup) && h.length > 50) {
      const [ox, oz] = h[h.length - 50];
      f.emit({ type: 'lag', fromX: b.x, fromZ: b.z, x: ox, z: oz });
      b.x = ox; b.z = oz;
      b.flags.next = b.rng.range(3.2, 5.5) * (b.phase >= 2 ? 0.7 : 1);
    }
  },
});

// THE HITBOX — you were nowhere near it
G.hitbox = () => ({
  init(b) { b.flags.reachMult = 1.4; b.flags.lastStep = null; },
  update(b, f) {
    // everything it does is drawn on the floor first, huge
    const r = b.run;
    if (r && r.step !== b.flags.lastStep && r.step.hit) {
      b.flags.lastStep = r.step;
      const h = r.step.hit;
      const life = r.step.windup + r.hold;
      if (h.shape === 'arc') f.emit({ type: 'decal', shape: 'arc', x: b.x, z: b.z, yaw: b.yaw, radius: h.range * 1.4, arc: h.arc, life, follow: b.id });
      else if (h.shape === 'circle') f.emit({ type: 'decal', shape: 'circle', x: b.x, z: b.z, radius: h.radius * 1.4, life, follow: b.id });
    }
    if (!r) b.flags.lastStep = null;
  },
});

// THE PATCH NOTES — nerfed: you
G.patch = () => ({
  onPhase(b, f, phase) {
    if (phase === 2) {
      f.mods.staminaRegen = 0.7;
      f.emit({ type: 'rule', text: 'PATCH 1.1 — YOUR STAMINA REGEN −30%' });
      b.speak('patch 1.1 is live', 2);
    }
    if (phase === 3) {
      f.mods.iframes = 0.8;
      b.dmgMult *= 1.1;
      f.emit({ type: 'rule', text: 'PATCH 1.2 — YOUR ROLL I-FRAMES −20%' });
      b.speak('patch 1.2 is live', 2);
    }
  },
  hud(b, f) {
    const r = [];
    if (f.mods.staminaRegen < 1) r.push('STAMINA −30%');
    if (f.mods.iframes < 1) r.push('I-FRAMES −20%');
    return r.length ? { label: r.join(' · ') } : { label: 'VERSION 1.0' };
  },
});

// THE LOADING SCREEN — tip: don't die
G.loading = () => ({
  init(b) { b.flags.next = 12; b.flags.tip = 6; },
  update(b, f, dt) {
    b.flags.next -= dt;
    b.flags.tip -= dt;
    if (b.flags.tip <= 0 && !b.say) {
      b.flags.tip = b.rng.range(7, 11);
      b.speak(b.rng.pick(['tip: don\'t die', 'tip: the boss can hurt you', 'tip: rolling is good',
        'tip: have you tried not getting hit', 'tip: this is a tip']), 2.4);
    }
    if (b.flags.next <= 0 && b.state === 'neutral') {
      b.flags.next = b.rng.range(16, 21) * (b.phase >= 2 ? 0.8 : 1);
      b.iframes = 2.6;
      b.speak('LOADING…', 2.4);
      f.emit({ type: 'loading', x: b.x, z: b.z });
      b.startMove('orbRing');
    }
  },
});

// THE BLUE SCREEN — a fatal exception has occurred
G.bluescreen = () => ({
  init(b) { b.flags.wipeClock = 0; },
  update(b, f, dt) { if (b.phase >= 3) b.flags.wipeClock += dt; },
  onPhase(b, f, phase) {
    if (phase === 3) {
      f.look = 'silhouette';
      f.emit({ type: 'look', look: 'silhouette' });
      f.emit({ type: 'rule', text: 'CRITICAL ERROR' });
      b.speak(':(', 3);
      b.flags.wipeClock = 12;
    }
  },
  chooseMove(b) {
    if (b.phase >= 3 && b.flags.wipeClock > 15 && (b.moveCd.wipe ?? 0) <= 0) {
      b.flags.wipeClock = 0;
      return b.moves.find((m) => m.id === 'wipe') ?? null;
    }
  },
  onMoveEnd(b) {
    if (b.rng.chance(0.12)) { b.pause(1.9, 'not responding'); return true; }
  },
  hud(b) {
    if (b.state === 'move' && b.run?.move.id === 'wipe') {
      const s = b.run.step;
      const k = Math.min(1, Math.max(0, (b.run.t - s.windup) / 3.9));
      return { label: `COLLECTING ERROR INFO ${Math.floor(k * 100)}%`, danger: true };
    }
    return null;
  },
});

// THE ROBOT VACUUM — it has a knife
G.vacuum = () => ({
  onMoveEnd(b) {
    if (b.rng.chance(0.08)) { b.pause(1.6, 'please empty the dustbin'); return true; }
  },
});

export function makeGimmick(spec, boss, fight) {
  if (!spec) return null;
  const id = typeof spec === 'string' ? spec : spec.id;
  const make = G[id];
  if (!make) throw new Error(`unknown gimmick ${id}`);
  const g = make(typeof spec === 'object' ? spec : {});
  g.id = id;
  g.init?.(boss, fight);
  return g;
}
