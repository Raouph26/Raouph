import { clamp, yawTo, angleDiff } from './util.js';

// Projectiles and ground hazards. Both are pure data the renderer mirrors;
// every one of them is telegraphed before it can hurt you.

let NEXT_ID = 1;

// ── projectiles ─────────────────────────────────────────────────────────────
export function spawnProjectiles(fight, boss, p) {
  const player = fight.player;
  const out = [];
  const ox = boss.x + Math.sin(boss.yaw) * (boss.radius * 0.7);
  const oz = boss.z + Math.cos(boss.yaw) * (boss.radius * 0.7);
  const oy = 1.3 * boss.scale;
  const dmg = p.dmg * boss.dmgMult;

  if (p.type === 'brick') {
    // ballistic arc onto where the frog will be
    const lead = p.lead ?? 0.35;
    const tx = player.x + player.vx * lead, tz = player.z + player.vz * lead;
    const T = p.flight;
    const g = 22;
    out.push(proj('brick', ox, oy, oz, (tx - ox) / T, (0 - oy + 0.5 * g * T * T) / T, (tz - oz) / T,
      { radius: p.radius, dmg, gravity: g, life: T + 0.5, aoe: p.aoe, tx, tz, blockable: true }));
    fight.emit({ type: 'decal', shape: 'circle', x: tx, z: tz, radius: p.aoe ?? 1.2, life: T });
  }
  else if (p.type === 'paper') {
    const n = p.count ?? 5, spread = (p.spread ?? 45) * Math.PI / 180;
    const base = yawTo(ox, oz, player.x, player.z);
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      out.push(proj('paper', ox, 1.1, oz, Math.sin(a) * p.speed, 0, Math.cos(a) * p.speed,
        { radius: p.radius, dmg, life: p.life ?? 2, blockable: true }));
    }
  }
  else if (p.type === 'orb') {
    if (p.ring) {
      for (let i = 0; i < p.ring; i++) {
        const a = (i / p.ring) * Math.PI * 2 + boss.t;
        out.push(proj('orb', boss.x, 1.1, boss.z, Math.sin(a) * p.speed, 0, Math.cos(a) * p.speed,
          { radius: p.radius, dmg, life: p.life, blockable: true }));
      }
    } else {
      const a = yawTo(ox, oz, player.x, player.z) + fight.rng.range(-0.25, 0.25);
      out.push(proj('orb', ox, oy, oz, Math.sin(a) * p.speed, 0, Math.cos(a) * p.speed,
        { radius: p.radius, dmg, life: p.life, homing: p.homing, blockable: true, fall: true }));
    }
  }
  else if (p.type === 'phantom') {
    const n = p.count ?? 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + fight.rng.range(0, Math.PI * 2);
      const r = 5.5;
      const px = clamp(player.x + Math.sin(a) * r, -16, 16);
      const pz = clamp(player.z + Math.cos(a) * r, -16, 16);
      out.push(proj('phantom', px, 0, pz, 0, 0, 0, {
        radius: p.radius, dmg, life: p.delay + p.dashTime + 0.2, delay: p.delay + i * 0.35,
        speed: p.speed, dashTime: p.dashTime, blockable: true, knockdown: false,
        yaw: yawTo(px, pz, player.x, player.z),
      }));
    }
  }
  for (const o of out) { fight.projectiles.push(o); fight.emit({ type: 'projectile', kind: o.kind, id: o.id }); }
}

function proj(kind, x, y, z, vx, vy, vz, o) {
  return { id: NEXT_ID++, kind, x, y, z, vx, vy, vz, age: 0, dead: false, hit: false,
           gravity: 0, homing: 0, delay: 0, blockable: true, knockdown: false, ...o };
}

export function updateProjectiles(fight, dt) {
  const pl = fight.player;
  for (const p of fight.projectiles) {
    if (p.dead) continue;
    p.age += dt;
    if (p.age > p.life) { p.dead = true; continue; }

    if (p.kind === 'phantom') {
      if (p.delay > 0) {
        p.delay -= dt;
        p.yaw = yawTo(p.x, p.z, pl.x, pl.z);       // tracks you while it winds up
        if (p.delay <= 0) {
          p.vx = Math.sin(p.yaw) * p.speed; p.vz = Math.cos(p.yaw) * p.speed;
          fight.emit({ type: 'phantomDash', id: p.id, x: p.x, z: p.z });
        }
        continue;
      }
      p.dashTime -= dt;
      if (p.dashTime <= 0) { p.dead = true; continue; }
    }

    if (p.homing && pl.alive && Math.hypot(pl.x - p.x, pl.z - p.z) < 2.4) p.homing = 0;   // committed
    if (p.homing && pl.alive) {
      const cur = Math.atan2(p.vx, p.vz);
      const want = yawTo(p.x, p.z, pl.x, pl.z);
      const sp = Math.hypot(p.vx, p.vz);
      const na = cur + clamp(angleDiff(cur, want), -p.homing * dt, p.homing * dt);
      p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp;
    }
    if (p.fall) p.y += (1.1 - p.y) * Math.min(1, dt * 2.5);

    p.vy -= p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

    // body contact with the frog (a capsule from 0.2 to 1.6)
    if (!p.hit && pl.alive) {
      const cy = clamp(p.y, 0.2, 1.6);
      const d = Math.hypot(p.x - pl.x, p.y - cy, p.z - pl.z);
      if (d < p.radius + pl.radius) {
        const res = pl.receiveHit({ dmg: p.dmg, x: p.x - p.vx * 0.2, z: p.z - p.vz * 0.2,
          parryable: false, unblockable: !p.blockable, knockdown: p.knockdown, kind: p.kind });
        if (res !== 'dodged') { p.hit = true; p.dead = true; fight.emit({ type: 'projHit', kind: p.kind, x: p.x, y: p.y, z: p.z, res }); }
      }
    }

    // ground contact
    if (p.gravity && p.y <= 0) {
      p.dead = true;
      fight.emit({ type: 'projLand', kind: p.kind, x: p.x, z: p.z });
      if (p.aoe && !p.hit && pl.alive && Math.hypot(pl.x - p.x, pl.z - p.z) < p.aoe + pl.radius) {
        pl.receiveHit({ dmg: p.dmg * 0.8, x: p.x, z: p.z, parryable: false, unblockable: false, kind: p.kind });
      }
    }
    if (Math.hypot(p.x, p.z) > fight.arena + 6) p.dead = true;
  }
  fight.projectiles = fight.projectiles.filter((p) => !p.dead);
}

// ── hazards ─────────────────────────────────────────────────────────────────
export function spawnHazard(fight, boss, kind, p) {
  const pl = fight.player;
  const dmgMult = boss.dmgMult;
  const push = (h) => { h.id = NEXT_ID++; h.age = 0; fight.hazards.push(h); fight.emit({ type: 'hazard', kind: h.kind, id: h.id }); };

  if (kind === 'ring') {
    push({ kind: 'ring', x: boss.x, z: boss.z, r: 0.6, speed: p.speed, maxR: p.maxR, width: p.width,
           dmg: p.dmg * dmgMult, pushForce: p.push ?? 0, hitDone: false });
  }
  else if (kind === 'aoe') {
    push({ kind: 'aoe', x: p.x, z: p.z, radius: p.radius, delay: p.delay, dmg: p.dmg * dmgMult,
           knockdown: !!p.knockdown, unblockable: !!p.unblockable, fired: false });
  }
  else if (kind === 'line') {
    const a = yawTo(boss.x, boss.z, pl.x, pl.z);
    for (let i = 0; i < p.count; i++) {
      const d = 1.6 + i * p.spacing;
      push({ kind: 'aoe', x: boss.x + Math.sin(a) * d, z: boss.z + Math.cos(a) * d, radius: p.radius,
             delay: p.delay + i * p.delayStep, dmg: p.dmg * dmgMult, knockdown: false, unblockable: true, fired: false, eruption: true });
    }
  }
  else if (kind === 'tiles') {
    // a 6×6 grid over the arena; some squares are "frogs" and will verify you
    const size = 5.2, n = 6, origin = -(n * size) / 2;
    const cells = [];
    const pattern = fight.rng.int(0, 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let on;
      if (pattern === 0) on = (i + j) % 2 === 0;
      else if (pattern === 1) on = i % 2 === 0;
      else if (pattern === 2) on = j % 2 === 1;
      else on = fight.rng.chance(0.5);
      // never leave the frog without a way out: its own neighbourhood mixes
      if (on) cells.push([i, j]);
    }
    push({ kind: 'tiles', size, n, origin, cells, delay: p.delay, dmg: p.dmg * dmgMult, fired: false });
  }
  else if (kind === 'wipe') {
    // a safe circle somewhere away from the boss; everywhere else gets erased
    let sx = 0, sz = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = fight.rng.range(0, Math.PI * 2), r = fight.rng.range(5, 13);
      sx = Math.sin(a) * r; sz = Math.cos(a) * r;
      if (Math.hypot(sx - boss.x, sz - boss.z) > 7) break;
    }
    push({ kind: 'wipe', x: sx, z: sz, safeRadius: p.safeRadius, delay: p.delay, dmg: p.dmg * dmgMult, fired: false });
  }
}

export function updateHazards(fight, dt) {
  const pl = fight.player;
  for (const h of fight.hazards) {
    h.age += dt;
    if (h.kind === 'ring') {
      h.r += h.speed * dt;
      if (!h.hitDone && pl.alive) {
        const d = Math.hypot(pl.x - h.x, pl.z - h.z);
        if (Math.abs(d - h.r) < h.width / 2 + pl.radius) {
          h.hitDone = true;
          if (h.dmg > 0) pl.receiveHit({ dmg: h.dmg, x: h.x, z: h.z, parryable: false, unblockable: true, kind: 'ring' });
          else if (!pl.invulnerable) {   // a roar: shoves, doesn't hurt
            const a = yawTo(h.x, h.z, pl.x, pl.z);
            pl.vx += Math.sin(a) * h.pushForce; pl.vz += Math.cos(a) * h.pushForce;
          }
        }
      }
      if (h.r > h.maxR) h.dead = true;
    }
    else if (h.kind === 'aoe') {
      if (!h.fired && h.age >= h.delay) {
        h.fired = true;
        fight.emit({ type: 'aoeFire', x: h.x, z: h.z, radius: h.radius, eruption: !!h.eruption });
        if (pl.alive && Math.hypot(pl.x - h.x, pl.z - h.z) < h.radius + pl.radius) {
          pl.receiveHit({ dmg: h.dmg, x: h.x, z: h.z, parryable: false, unblockable: h.unblockable, knockdown: h.knockdown, kind: 'aoe' });
        }
      }
      if (h.age > h.delay + 0.35) h.dead = true;
    }
    else if (h.kind === 'tiles') {
      if (!h.fired && h.age >= h.delay) {
        h.fired = true;
        fight.emit({ type: 'tilesFire' });
        const i = Math.floor((pl.x - h.origin) / h.size), j = Math.floor((pl.z - h.origin) / h.size);
        if (pl.alive && h.cells.some(([a, b]) => a === i && b === j)) {
          pl.receiveHit({ dmg: h.dmg, x: pl.x, z: pl.z + 0.01, parryable: false, unblockable: true, kind: 'tiles' });
        }
      }
      if (h.age > h.delay + 0.5) h.dead = true;
    }
    else if (h.kind === 'wipe') {
      if (!h.fired && h.age >= h.delay) {
        h.fired = true;
        fight.emit({ type: 'wipeFire' });
        if (pl.alive && Math.hypot(pl.x - h.x, pl.z - h.z) > h.safeRadius) {
          pl.receiveHit({ dmg: h.dmg, x: pl.x + 0.01, z: pl.z, parryable: false, unblockable: true, knockdown: true, kind: 'wipe' });
        }
      }
      if (h.age > h.delay + 0.6) h.dead = true;
    }
  }
  fight.hazards = fight.hazards.filter((h) => !h.dead);
}
