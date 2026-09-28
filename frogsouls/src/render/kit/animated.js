import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Animated characters: rigged GLB models with their own animation clips
// (KayKit Adventurers, CC0 — Kay Lousberg). The fight simulation still decides
// everything; this only chooses a clip for each sim state and sets its time so
// the clip's own strike frame lands exactly on the sim's hit frame.
//
// Each clip's strike frame is found at load time — the moment the weapon hand
// moves fastest — so no timing tables are hand-typed.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env?.BASE_URL ?? './';
const cache = new Map();

export const CHARACTERS = {
  knight: { url: 'kaykit/Knight.glb', height: 1.75, show: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'] },
  barbarian: { url: 'kaykit/Barbarian.glb', height: 1.9, show: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'] },
};
const WEAPON_NODES = ['1H_Sword', '2H_Sword', '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield',
  '1H_Axe', '2H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug', 'Knight_Helmet', 'Knight_Cape', 'Barbarian_Hat', 'Barbarian_Cape'];

// the artifact host serves no .glb: published builds carry them as base64 text
async function loadGLB(url) {
  const loader = new GLTFLoader();
  if (!import.meta.env?.PROD) return loader.loadAsync(url);
  const r = await fetch(url + '.txt');
  if (!r.ok) throw new Error(url + ' ' + r.status);
  const bin = atob((await r.text()).trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return loader.parseAsync(u8.buffer, '');
}

export async function preloadCharacters() {
  await Promise.all(Object.entries(CHARACTERS).map(async ([id, c]) => {
    try { cache.set(id, await loadGLB(BASE + c.url)); } catch (e) { console.warn('character', id, e.message); }
  }));
}
export const hasCharacter = (id) => cache.has(id);

/** Strike frame of a clip: when the right hand moves fastest (as a 0..1 fraction). */
function strikeFrac(model, clip) {
  const hand = model.getObjectByName('handslot.r');
  if (!hand) return .45;
  const mixer = new THREE.AnimationMixer(model);
  const act = mixer.clipAction(clip); act.play();
  const N = 40, p = new THREE.Vector3(), q = new THREE.Vector3();
  let best = 0, at = .45;
  for (let i = 0; i <= N; i++) {
    mixer.setTime(clip.duration * i / N);
    model.updateMatrixWorld(true);
    hand.getWorldPosition(p);
    if (i > 0) { const v = p.distanceTo(q); if (v > best && i / N > .15 && i / N < .85) { best = v; at = (i - .5) / N; } }
    q.copy(p);
  }
  act.stop(); mixer.uncacheRoot(model);
  return at;
}

export class AnimatedCharacter {
  constructor(id) {
    const c = CHARACTERS[id], gltf = cache.get(id);
    this.id = id;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    for (const n of WEAPON_NODES) { const o = this.model.getObjectByName(n); if (o) o.visible = c.show.includes(n); }
    const box = new THREE.Box3().setFromObject(this.model);
    this.baseScale = c.height / (box.max.y - box.min.y);
    this.model.scale.setScalar(this.baseScale);
    this.root.add(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        // one material per character copy, so a hit flash or a dissolve only touches this one
        o.material = o.material.clone();
        o.material.roughness = Math.max(o.material.roughness ?? 1, .55);
      }
    });
    this.mats = []; this.model.traverse((o) => { if (o.isMesh) this.mats.push(o.material); });

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = new Map(gltf.animations.map((a) => [a.name, a]));
    this.actions = new Map();
    this.strike = new Map();
    this.cur = null;          // the one-shot layer: { name, action }
    this.oneW = 0;            // its weight
    this.loco = {};           // looping layers by name, with weights
    this.locoT = 0;

    // weapon line for trails: the visible weapon, base → tip along its long axis
    const wn = c.show.map((n) => this.model.getObjectByName(n)).find((o) => o && /Sword|Axe/.test(o.name));
    this.weapon = { userData: { base: new THREE.Object3D(), tip: new THREE.Object3D() } };
    if (wn) {
      const wb = new THREE.Box3();
      wn.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); wb.union(o.geometry.boundingBox); } });
      const s = wb.getSize(new THREE.Vector3());
      const ax = s.x > s.y && s.x > s.z ? 'x' : s.y > s.z ? 'y' : 'z';
      const far = Math.abs(wb.max[ax]) > Math.abs(wb.min[ax]) ? wb.max[ax] : wb.min[ax];
      this.weapon.userData.tip.position[ax] = far;
      this.weapon.userData.base.position[ax] = far * .35;
      wn.add(this.weapon.userData.base, this.weapon.userData.tip);
    }
    // a flash/dissolve interface like the built characters' material
    this.material = { userData: { u: {
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(0xfff2dc) }, uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(0xffc46a) },
      uDissolve: { value: 0 }, uDissolveColor: { value: new THREE.Color(0xffb35a) }, uRimColor: { value: new THREE.Color() }, uRimStrength: { value: 0 },
    } } };
  }

  action(name) {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      a.play(); a.setEffectiveWeight(0); a.paused = true;
      this.actions.set(name, a);
    }
    return a;
  }

  strikeOf(name) {
    if (!this.strike.has(name)) {
      const clip = this.clips.get(name);
      const probe = SkeletonUtils.clone(cache.get(this.id).scene);
      this.strike.set(name, clip ? strikeFrac(probe, clip) : .45);
    }
    return this.strike.get(name);
  }

  /** Play a one-shot clip at an explicit 0..1 point of its length. */
  pose(name, k, fadeIn = .08) {
    const a = this.action(name);
    if (!a) return;
    if (!this.cur || this.cur.name !== name || this.cur.restart) {
      if (this.cur && this.cur.name !== name) this.prev = { action: this.cur.action, w: this.oneW };
      this.cur = { name, action: a, fade: fadeIn };
      this.fadeK = 0;
    }
    a.time = Math.min(.999, Math.max(0, k)) * a.getClip().duration;
    this.want = 1;
  }

  /** Map a sim windup/active/recovery onto a clip so its strike lands on the active frame. */
  poseStrike(name, phase, k) {
    const s = this.strikeOf(name);
    const lead = .06;                                 // the swing is already under way as the hit opens
    let f;
    if (phase === 'windup') f = k * (s - lead);
    else if (phase === 'hold') f = s - lead;
    else if (phase === 'active') f = s - lead + k * lead * 2;
    else f = s + lead + k * (1 - s - lead);
    this.pose(name, f);
  }

  restart() { if (this.cur) this.cur.restart = true; }
  release() { this.want = 0; }

  /** Loop layer: blend locomotion clips by weight (they run on their own time). */
  locomotion(dt, weights, rate = 1) {
    for (const [name, w] of Object.entries(weights)) {
      const a = this.action(name);
      if (!a) continue;
      a.paused = false; a.timeScale = rate;
      const L = this.loco[name] ?? (this.loco[name] = { a, w: 0 });
      L.target = w;
    }
    for (const L of Object.values(this.loco)) {
      L.w += ((L.target ?? 0) - L.w) * (1 - Math.exp(-14 * dt));
      L.target = 0;
    }
  }

  update(dt) {
    // one-shot layer fades in fast and out a touch slower
    const tgt = this.want ?? 0;
    this.oneW += (tgt - this.oneW) * (1 - Math.exp(-(tgt > this.oneW ? 28 : 12) * dt));
    if (this.cur) {
      if (this.cur.restart) this.cur.restart = false;
      this.fadeK = Math.min(1, (this.fadeK ?? 1) + dt / Math.max(this.cur.fade, .001));
    }
    let locoSum = 0;
    for (const L of Object.values(this.loco)) locoSum += L.w;
    const one = this.oneW;
    for (const [name, a] of this.actions) {
      let w = 0;
      if (this.cur && a === this.cur.action) w = one * (this.fadeK ?? 1);
      else if (this.prev && a === this.prev.action) w = one * (1 - (this.fadeK ?? 1));
      const L = this.loco[name];
      if (L) w += (1 - one) * (L.w / Math.max(locoSum, 1e-3));
      a.setEffectiveWeight(w);
    }
    if (this.fadeK >= 1) this.prev = null;
    if (tgt === 0 && one < .01) this.cur = null;
    this.want = 0;
    this.mixer.update(dt);
    // flash / dissolve on the real materials
    const u = this.material.userData.u;
    const f = u.uFlash.value, g = u.uGlow.value;
    for (const m of this.mats) {
      m.emissive?.copy(u.uFlashColor.value).multiplyScalar(f * 1.2).add(new THREE.Color().copy(u.uGlowColor.value).multiplyScalar(g * .35));
      const dis = u.uDissolve.value;
      if (dis > 0) { m.transparent = true; m.opacity = 1 - dis; } else if (m.transparent) { m.transparent = false; m.opacity = 1; }
    }
  }
}

// ── the sim → clip mapping ──────────────────────────────────────────────────
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const angLerp = (a, b, t) => a + angDiff(a, b) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

const PLAYER_ATTACK = {
  slashR: '1H_Melee_Attack_Slice_Horizontal', slashL: '1H_Melee_Attack_Slice_Diagonal', thrust: '1H_Melee_Attack_Stab',
  lungeThrust: '1H_Melee_Attack_Stab', spearPoke: '1H_Melee_Attack_Stab', overhead: '2H_Melee_Attack_Chop', runSlash: '1H_Melee_Attack_Chop',
  spin: '2H_Melee_Attack_Spin',
};
const dodgeClip = (rel) => {
  const a = Math.abs(rel);
  if (a < Math.PI / 4) return 'Dodge_Forward';
  if (a > Math.PI * .75) return 'Dodge_Backward';
  return rel > 0 ? 'Dodge_Left' : 'Dodge_Right';
};

/** Drives an AnimatedCharacter from the PlayerSim, the way PlayerAnimator drives the frog. */
export class AnimatedPlayer {
  constructor(ch, PLAYER) { this.ch = ch; this.P = PLAYER; this.yaw = null; this.drinking = 0; this.lastT = 0; this.lastState = null; }
  hurtFrom() {}
  parried() {}
  flinch() {}
  blockHit() {}
  update(dt, p, { combat = true } = {}) {
    const ch = this.ch, P = this.P;
    ch.root.position.set(p.x, p.y ?? 0, p.z);
    this.yaw = this.yaw == null ? p.yaw : angLerp(this.yaw, p.yaw, 1 - Math.exp(-(p.state === 'attack' ? 30 : 20) * dt));
    ch.root.rotation.y = this.yaw;
    const restarted = p.state !== this.lastState || p.t < this.lastT - 1e-4;
    this.lastT = p.t; this.lastState = p.state;
    if (restarted) ch.restart();

    // locomotion: idle / walk / run / strafe / back, by velocity relative to facing
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const fwd = p.vx * s + p.vz * c, side = p.vx * c - p.vz * s;
    const sp = Math.hypot(p.vx, p.vz);
    const run = clamp01((sp - 2.2) / 2), move = clamp01(sp / 1.2);
    const W = {};
    W.Idle = 1 - move;
    if (move > 0) {
      const back = fwd < -Math.abs(side) * .7, strafe = Math.abs(side) > Math.abs(fwd) * 1.2;
      if (strafe) W[side > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right'] = move;
      else if (back) W.Walking_Backwards = move;
      else { W.Walking_A = move * (1 - run); W.Running_A = move * run; }
    }
    ch.locomotion(dt, W, 1);

    let drinking = 0;
    switch (p.state) {
      case 'attack': {
        const sp2 = p.atk.spec;
        const ph = p.t < sp2.startup ? 'windup' : p.t < sp2.startup + sp2.active ? 'active' : 'recovery';
        const k = ph === 'windup' ? p.t / sp2.startup : ph === 'active' ? (p.t - sp2.startup) / sp2.active : (p.t - sp2.startup - sp2.active) / sp2.recovery;
        ch.poseStrike(PLAYER_ATTACK[sp2.anim] ?? '1H_Melee_Attack_Slice_Horizontal', ph, clamp01(k));
        break;
      }
      case 'roll': ch.pose(dodgeClip(p.rollRel ?? 0), clamp01(p.t / (P.roll.duration + P.roll.recovery)) * .92, .04); break;
      case 'block': ch.pose('Blocking', .5); break;
      case 'parry': { const tot = P.parry.startup + P.parry.window + P.parry.recovery; ch.pose('Block_Attack', clamp01(p.t / tot) * .7, .04); break; }
      case 'riposte': ch.poseStrike('1H_Melee_Attack_Stab', p.t < .18 ? 'windup' : p.t < .4 ? 'active' : 'recovery', p.t < .18 ? p.t / .18 : p.t < .4 ? (p.t - .18) / .22 : clamp01((p.t - .4) / (P.riposte.duration - .4))); break;
      case 'heal': { const k = clamp01(p.t / P.flask.duration); ch.pose('Use_Item', k); drinking = k > .1 && k < .86 ? 1 : 0; break; }
      case 'hurt': ch.pose(this.hurtB ? 'Hit_B' : 'Hit_A', clamp01(p.t / P.hurt), .03); break;
      case 'knockdown': {
        const k = clamp01(p.t / P.knockdown);
        if (k < .45) ch.pose('Death_A', k / .45 * .95, .04); else ch.pose('Lie_StandUp', (k - .45) / .55, .12);
        break;
      }
      case 'guardbreak': ch.pose('Block_Hit', clamp01(p.t / P.guardBreak)); break;
      case 'dead': ch.pose('Death_A', clamp01(p.t / 1.0)); break;
      default: ch.release();
    }
    if (restarted && p.state === 'hurt') this.hurtB = !this.hurtB;
    this.drinking += (drinking - this.drinking) * Math.min(1, dt * 20);
    ch.update(dt);
  }
}

const BOSS_TELL = {
  swipeR: '2H_Melee_Attack_Slice', swipeL: '1H_Melee_Attack_Slice_Diagonal', overhead: '2H_Melee_Attack_Chop', thrust: '2H_Melee_Attack_Stab',
  sweep: '2H_Melee_Attack_Slice', spin: '2H_Melee_Attack_Spin', stomp: '2H_Melee_Attack_Chop', jab: '1H_Melee_Attack_Stab',
  pincer: '1H_Melee_Attack_Slice_Horizontal', pincerL: '1H_Melee_Attack_Slice_Diagonal', throw: 'Throw', cast: 'Spellcast_Shoot', type: 'Spellcast_Shoot',
  flash: 'Spellcast_Raise', roar: 'Cheer', stance: 'Blocking', wipe: 'Spellcast_Long', slashR: '1H_Melee_Attack_Slice_Horizontal', lungeThrust: '2H_Melee_Attack_Stab',
};

/** Drives an AnimatedCharacter from a BossSim. */
export class AnimatedBoss {
  constructor(ch, def) {
    this.ch = ch; this.def = def; this.yaw = null; this.lastKey = null;
    ch.root.scale.setScalar(.85 * (def.scale ?? 1.6));
  }
  flinch() {}
  update(dt, b) {
    const ch = this.ch;
    ch.root.position.set(b.x, b.y, b.z);
    this.yaw = this.yaw == null ? b.yaw : angLerp(this.yaw, b.yaw, 1 - Math.exp(-16 * dt));
    ch.root.rotation.y = this.yaw;
    const an = b.anim;
    const key = b.state + ':' + (an.moveId ?? '') + ':' + an.step;
    if (key !== this.lastKey) { ch.restart(); this.lastKey = key; }

    const sc = .85 * (b.def?.scale ?? 1.6);
    const sp = Math.hypot(b.vx, b.vz) / sc;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const side = (b.vx * c - b.vz * s) / sc, fwd = (b.vx * s + b.vz * c) / sc;
    const move = clamp01(sp / .8), run = clamp01((sp - 2) / 1.5);
    const W = { '2H_Melee_Idle': 1 - move };
    if (move > 0) {
      if (Math.abs(side) > Math.abs(fwd) * 1.2) W[side > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right'] = move;
      else if (fwd < 0) W.Walking_Backwards = move;
      else { W.Walking_A = move * (1 - run); W.Running_A = move * run; }
    }
    ch.locomotion(dt, W, 1);

    switch (b.state) {
      case 'move': {
        const tell = an.tell;
        if (tell === 'leap' || tell === 'backflip') {
          if (an.phase === 'windup') ch.pose('Jump_Start', an.k);
          else if (an.phase === 'active') ch.pose(tell === 'backflip' ? 'Dodge_Backward' : 'Jump_Idle', tell === 'backflip' ? an.k : (an.k * 3) % 1);
          else ch.pose('Jump_Land', an.k);
        } else if (tell === 'charge' || tell === 'bounce' || tell === 'scuttle') {
          if (an.phase === 'active') { ch.release(); ch.locomotion(dt, { Running_B: 1 }, 1.6); }
          else ch.poseStrike('2H_Melee_Attack_Chop', an.phase === 'recovery' ? 'recovery' : 'windup', an.phase === 'windup' ? an.k * .4 : an.k);
        } else if (tell === 'spin' && an.phase === 'active') ch.pose('2H_Melee_Attack_Spinning', (an.k * 2) % 1);
        else ch.poseStrike(BOSS_TELL[tell] ?? '2H_Melee_Attack_Chop', an.phase, clamp01(an.k));
        break;
      }
      case 'stagger': ch.pose('Hit_B', clamp01(b.t / Math.max(b.stagDur, .1)), .03); break;
      case 'riposted': ch.pose('Death_A', clamp01(b.t / 1.5) * .95, .03); break;
      case 'getup': ch.pose('Lie_StandUp', clamp01(b.t / .75), .05); break;
      case 'transition': case 'pause': ch.pose('Cheer', clamp01(b.t / 1.6)); break;
      case 'dodge': ch.pose(dodgeClip(angDiff(this.yaw, b.flags.dodgeYaw ?? this.yaw)), clamp01(b.t / .6)); break;
      case 'drink': ch.pose('Use_Item', clamp01(b.t / 1.25)); break;
      case 'dead': ch.pose('Death_A', clamp01(b.t / 1.2)); break;
      default: ch.release();
    }
    ch.update(dt);
  }
}
