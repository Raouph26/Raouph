import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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
/** three.js strips '.', ':', '/', '[' and ']' from node names on load ("hand.r" → "handr"). */
const byName = (root, name) => root.getObjectByName(name) ?? root.getObjectByName(name.replace(/[\[\].:\/]/g, ''));
const cache = new Map();

export const STRETCH = { legs: 1.35, torso: 1.12, arms: 1.18 };

export const CHARACTERS = {
  knight: { url: 'kaykit/Knight.glb', height: 1.95, show: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'], idle: 'Idle' },
  barbarian: { url: 'kaykit/Barbarian.glb', height: 2.05, show: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'], idle: '2H_Melee_Idle' },
  // the skeleton bosses: weapons are separate props held in the hand slots
  skWarrior: { url: 'kaykit/Skeleton_Warrior.glb', height: 2.1, r: 'Skeleton_Axe', l: 'Skeleton_Shield_Large_A', idle: 'Idle_Combat', skeleton: true },
  skRogue: { url: 'kaykit/Skeleton_Rogue.glb', height: 2.0, r: 'Skeleton_Blade', idle: 'Idle_Combat', skeleton: true },
  skMage: { url: 'kaykit/Skeleton_Mage.glb', height: 2.05, r: 'Skeleton_Staff', idle: 'Idle_Combat', skeleton: true },
  skMinion: { url: 'kaykit/Skeleton_Minion.glb', height: 1.95, r: 'Skeleton_Blade', l: 'Skeleton_Shield_Small_A', idle: 'Idle_Combat', skeleton: true },
};
const PROPS = ['Skeleton_Axe', 'Skeleton_Blade', 'Skeleton_Staff', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Small_A'];

/** Which character plays a boss: the barbarian for the first, skeletons by fighting style after that. */
export function characterForBoss(def) {
  const body = def.visual?.body;
  if (body === 'vacuum') return null;
  if (def.id === 'duck') return 'barbarian';
  const st = def.style;
  if (st === 'brute' || st === 'sovereign') return 'skWarrior';
  if (st === 'caster' || st === 'sweeper') return 'skMage';
  if (st === 'duelist' || st === 'hound' || st === 'mirror') return 'skRogue';
  return 'skMinion';
}
const WEAPON_NODES = ['1H_Sword', '2H_Sword', '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield',
  '1H_Axe', '2H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug', 'Knight_Helmet', 'Knight_Cape', 'Barbarian_Hat', 'Barbarian_Cape'];

// the artifact host serves no .glb: published builds carry them as base64 text
async function loadGLB(url) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (!import.meta.env?.PROD) return loader.loadAsync(url);
  const r = await fetch(url + '.txt');
  if (!r.ok) throw new Error(url + ' ' + r.status);
  const bin = atob((await r.text()).trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return loader.parseAsync(u8.buffer, '');
}

const pending = new Map();
/** Load one character (and its props) once; later calls share the same promise. */
export function ensureCharacter(id) {
  if (cache.has(id)) return Promise.resolve();
  if (!pending.has(id)) {
    const c = CHARACTERS[id];
    const props = [c.r, c.l].filter(Boolean).filter((n) => !cache.has('prop:' + n));
    pending.set(id, Promise.all([
      loadGLB(BASE + c.url).then((g) => cache.set(id, g)),
      ...props.map((n) => loadGLB(BASE + 'kaykit/' + n + '.glb').then((g) => cache.set('prop:' + n, g.scene))),
    ]).catch((e) => { console.warn('character', id, e.message); pending.delete(id); }));
  }
  return pending.get(id);
}
export async function preloadCharacters() {
  await Promise.all(['knight', 'barbarian'].map(ensureCharacter));
  // the skeletons arrive in the background; a fight that starts first waits for its own
  setTimeout(() => { for (const id of ['skWarrior', 'skRogue', 'skMage', 'skMinion']) ensureCharacter(id); }, 1500);
}
export const hasCharacter = (id) => cache.has(id);

/** Strike frame of a clip: when the right hand moves fastest (as a 0..1 fraction). */
function strikeFrac(model, clip) {
  const hand = byName(model, 'handslot.r');
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
    for (const n of WEAPON_NODES) { const o = byName(this.model, n); if (o) o.visible = (c.show ?? []).includes(n); }
    this.idle = c.idle ?? 'Idle';
    const box = new THREE.Box3().setFromObject(this.model, true);
    // taller proportions: KayKit characters are chibi; every frame, after the
    // clips have posed the rig, the leg, spine and arm bones are lengthened
    // (the feet and hands are scaled back so they keep their size)
    this.stretch = [];
    const S = c.stretch ?? STRETCH;
    for (const [bone, k, undo] of [['upperleg.l', S.legs, 0], ['upperleg.r', S.legs, 0], ['foot.l', 1 / S.legs, 1], ['foot.r', 1 / S.legs, 1],
      ['spine', S.torso, 0], ['head', 1 / S.torso, 1], ['upperarm.l', S.arms, 0], ['upperarm.r', S.arms, 0], ['hand.l', 1 / S.arms, 1], ['hand.r', 1 / S.arms, 1]]) {
      const b = byName(this.model, bone);
      if (!b) continue;
      // lengthwise axis: the dominant direction of the child joint's offset
      const kid = b.children.find((o) => o.isBone);
      const v = kid ? kid.position : new THREE.Vector3(0, 1, 0);
      const ax = Math.abs(v.x) > Math.abs(v.y) && Math.abs(v.x) > Math.abs(v.z) ? 'x' : Math.abs(v.y) > Math.abs(v.z) ? 'y' : 'z';
      this.stretch.push({ b, k, undo, ax });
    }
    this.hips = byName(this.model, 'hips');
    this.legK = S.legs;
    this._applyStretch();
    this.model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(this.model, true);
    this.baseScale = c.height / (box2.max.y - box2.min.y);
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

    // separate props go into the hand slots
    for (const [side, name] of [['r', c.r], ['l', c.l]]) {
      const src = name && cache.get('prop:' + name);
      const slot = byName(this.model, 'handslot.' + side);
      if (!src || !slot) continue;
      const prop = src.clone(true); prop.name = name;
      prop.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } });
      slot.add(prop);
    }
    // weapon line for trails: the visible weapon, base → tip along its long axis
    const wn = [...(c.show ?? []), c.r].filter(Boolean).map((n) => byName(this.model, n)).find((o) => o && /Sword|Axe|Blade|Staff/.test(o.name));
    this.weaponName = wn?.name;
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

  _applyStretch(on = true) {
    // applied after the clips pose the rig, removed before the next update
    // (a bone no clip touches would otherwise stretch a bit more every frame)
    const p = on ? 1 : -1;
    for (const { b, k, undo, ax } of this.stretch) {
      const f = k ** p;
      if (undo) b.scale.multiplyScalar(f);      // hands, feet, head: back to their own size
      else b.scale[ax] *= f;
    }
    // the hips ride higher on longer legs, so the feet stay on the ground
    if (this.hips) this.hips.position.y *= (1 + (this.legK - 1) * .9) ** p;
    this.stretched = on;
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

  /** Play a one-shot clip at an explicit time (seconds into the clip). */
  poseAt(name, t, fadeIn = .1) {
    const a = this.action(name);
    if (!a) return;
    const restart = this.cur?.restart;
    if (!this.cur || this.cur.name !== name || restart) {
      // crossfade from wherever we were — even from the same clip, via a frozen copy
      if (this.cur) {
        const from = this.cur.name === name ? this._ghost(name) : this.cur.action;
        if (from !== this.cur.action) from.time = this.cur.action.time;
        this.prev = { action: from, w: 1 };
      }
      this.cur = { name, action: a, fade: this.cur ? fadeIn : fadeIn * .8 };
      this.fadeK = 0;
    }
    a.time = Math.min(Math.max(0, t), a.getClip().duration - 1e-3);
    this.want = 1;
  }

  /** A second action on the same clip (a clip can't crossfade with itself). */
  _ghost(name) {
    const key = name + '#ghost';
    let g = this.actions.get(key);
    if (!g) {
      const clip = this.clips.get(name).clone(); clip.name = key;
      g = this.mixer.clipAction(clip); g.play(); g.paused = true; g.setEffectiveWeight(0);
      this.actions.set(key, g);
    }
    return g;
  }

  pose(name, k, fadeIn) {
    const clip = this.clips.get(name);
    if (clip) this.poseAt(name, k * clip.duration, fadeIn);
  }

  /**
   * An attack whose hit must land on the sim's active window. The clip plays
   * at close to its own speed (0.6×–1.7×): a short wind-up starts part way
   * into the clip, a long one reaches the strike early and holds there —
   * the "raised and waiting" of a souls telegraph. After the strike it plays
   * on at natural speed and fades out when the sim is done with it.
   * @param t seconds into the current phase; dur that phase's length
   */
  poseTimed(name, phase, t, dur) {
    const clip = this.clips.get(name);
    if (!clip) return;
    const D = clip.duration, S = this.strikeOf(name) * D, pre = .03;
    let time;
    if (phase === 'windup') {
      const rate = Math.min(1.7, Math.max(.6, S / Math.max(dur, .01)));
      const start = Math.max(0, S - pre - dur * rate);
      time = Math.min(S - pre, start + t * rate);
    } else if (phase === 'hold') time = S - pre;
    else if (phase === 'active') time = S - pre + t * Math.max(1, pre * 2 / Math.max(dur, .01));
    else time = S + pre + t;
    this.poseAt(name, time, .07);
  }

  restart() { if (this.cur) this.cur.restart = true; }
  release() { this.want = 0; }

  /**
   * Looping layer. weights: { clip: w }; each clip runs at `rates[clip]`
   * (speed-matched strides) and walk/run cycles stay in phase.
   */
  locomotion(dt, weights, rates = {}) {
    for (const [name, w] of Object.entries(weights)) {
      const a = this.action(name);
      if (!a) continue;
      a.paused = false; a.timeScale = rates[name] ?? 1;
      const L = this.loco[name] ?? (this.loco[name] = { a, w: 0 });
      L.target = w;
    }
    // walking and running share one gait phase so the blend never scissors
    const walk = this.loco.Walking_A, run = this.loco.Running_A;
    if (walk && run && walk.w > .02 && run.w > .02) {
      const lead = walk.w > run.w ? walk.a : run.a, other = lead === walk.a ? run.a : walk.a;
      other.time = (lead.time / lead.getClip().duration) * other.getClip().duration;
    }
    for (const L of Object.values(this.loco)) {
      L.w += ((L.target ?? 0) - L.w) * (1 - Math.exp(-10 * dt));
      L.target = 0;
    }
  }

  update(dt) {
    // one-shot layer fades in fast and out a touch slower
    const tgt = this.want ?? 0;
    this.oneW += (tgt - this.oneW) * (1 - Math.exp(-(tgt > this.oneW ? 22 : 9) * dt));
    if (this.cur) {
      if (this.cur.restart) this.cur.restart = false;
      this.fadeK = Math.min(1, (this.fadeK ?? 1) + dt / Math.max(this.cur.fade, .001));
    }
    let locoSum = 0;
    for (const L of Object.values(this.loco)) locoSum += L.w;
    const one = this.oneW;
    for (const [name, a] of this.actions) {
      let w = 0;
      const fk = this.fadeK ?? 1, e = fk * fk * (3 - 2 * fk);
      if (this.cur && a === this.cur.action) w = one * (this.prev ? e : 1);
      else if (this.prev && a === this.prev.action) w = one * (1 - e);
      const L = this.loco[name];
      if (L) w += (1 - one) * (L.w / Math.max(locoSum, 1e-3));
      a.setEffectiveWeight(w);
    }
    if (this.fadeK >= 1) this.prev = null;
    if (tgt === 0 && one < .01) this.cur = null;
    this.want = 0;
    if (this.stretched) this._applyStretch(false);
    this.mixer.update(dt);
    this._applyStretch();
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

/**
 * Locomotion for either driver: idle ↔ walk ↔ run by speed, strafes and a
 * back-pedal by direction, every cycle played at the rate that matches its
 * stride to the ground speed (no skating). `sc` is the character's scale.
 */
function locoFor(ch, dt, vx, vz, yaw, sc) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const fwd = (vx * s + vz * c) / sc, side = (vx * c - vz * s) / sc;
  const sp = Math.hypot(fwd, side);
  const move = clamp01(sp / .9), run = clamp01((sp - 2.4) / 1.6);
  const W = { [ch.idle]: 1 - move }, R = {};
  if (move > 0) {
    if (Math.abs(side) > Math.abs(fwd) * 1.3) { const n = side > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right'; W[n] = move; R[n] = Math.max(.6, sp / 3.6); }
    else if (fwd < -.2) { W.Walking_Backwards = move; R.Walking_Backwards = Math.max(.6, sp / 1.7); }
    else {
      W.Walking_A = move * (1 - run); W.Running_A = move * run;
      R.Walking_A = Math.min(1.5, Math.max(.7, sp / 1.8)); R.Running_A = Math.min(1.4, Math.max(.75, sp / 4.8));
    }
  }
  ch.locomotion(dt, W, R);
}

/** Drives an AnimatedCharacter from the PlayerSim, the way PlayerAnimator drives the frog. */
export class AnimatedPlayer {
  constructor(ch, PLAYER) { this.ch = ch; this.P = PLAYER; this.yaw = null; this.drinking = 0; this.lastT = 0; this.lastState = null; }
  hurtFrom() {}
  parried() {}
  flinch() {}
  blockHit() {}
  _loco(dt, vx, vz, yaw) { locoFor(this.ch, dt, vx, vz, yaw, 1); }
  update(dt, p, { combat = true } = {}) {
    const ch = this.ch, P = this.P;
    ch.root.position.set(p.x, p.y ?? 0, p.z);
    this.yaw = this.yaw == null ? p.yaw : angLerp(this.yaw, p.yaw, 1 - Math.exp(-(p.state === 'attack' ? 30 : 20) * dt));
    ch.root.rotation.y = this.yaw;
    const restarted = p.state !== this.lastState || p.t < this.lastT - 1e-4;
    this.lastT = p.t; this.lastState = p.state;
    if (restarted) ch.restart();

    this._loco(dt, p.vx, p.vz, this.yaw, 1, combat);
    let drinking = 0;
    switch (p.state) {
      case 'attack': {
        const sp2 = p.atk.spec;
        const clip = PLAYER_ATTACK[sp2.anim] ?? '1H_Melee_Attack_Slice_Horizontal';
        if (p.t < sp2.startup) ch.poseTimed(clip, 'windup', p.t, sp2.startup);
        else if (p.t < sp2.startup + sp2.active) ch.poseTimed(clip, 'active', p.t - sp2.startup, sp2.active);
        else ch.poseTimed(clip, 'recovery', p.t - sp2.startup - sp2.active, sp2.recovery);
        break;
      }
      case 'roll': ch.pose(dodgeClip(p.rollRel ?? 0), clamp01(p.t / (P.roll.duration + P.roll.recovery)) * .92, .04); break;
      case 'block': ch.pose('Blocking', .5); break;
      case 'parry': { const tot = P.parry.startup + P.parry.window + P.parry.recovery; ch.pose('Block_Attack', clamp01(p.t / tot) * .7, .04); break; }
      case 'riposte':
        if (p.t < .18) ch.poseTimed('1H_Melee_Attack_Stab', 'windup', p.t, .18);
        else if (p.t < .4) ch.poseTimed('1H_Melee_Attack_Stab', 'active', p.t - .18, .22);
        else ch.poseTimed('1H_Melee_Attack_Stab', 'recovery', p.t - .4, 1);
        break;
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
  /** Clip for a tell; two-handed chops for the axe men, one-handed cuts for blades. */
  clipFor(tell) {
    const one = /Blade|Sword/.test(this.ch.weaponName ?? '');
    const c = BOSS_TELL[tell] ?? '2H_Melee_Attack_Chop';
    if (one) return ({ '2H_Melee_Attack_Slice': '1H_Melee_Attack_Slice_Horizontal', '2H_Melee_Attack_Chop': '1H_Melee_Attack_Chop', '2H_Melee_Attack_Stab': '1H_Melee_Attack_Stab' })[c] ?? c;
    if (this.ch.clips.has('1H_Melee_Attack_Jump_Chop') && tell === 'stomp') return '1H_Melee_Attack_Jump_Chop';
    return c;
  }
  update(dt, b) {
    const ch = this.ch;
    ch.root.position.set(b.x, b.y, b.z);
    this.yaw = this.yaw == null ? b.yaw : angLerp(this.yaw, b.yaw, 1 - Math.exp(-16 * dt));
    ch.root.rotation.y = this.yaw;
    const an = b.anim;
    const key = b.state + ':' + (an.moveId ?? '') + ':' + an.step;
    if (key !== this.lastKey) { ch.restart(); this.lastKey = key; }

    locoFor(ch, dt, b.vx, b.vz, this.yaw, .85 * (b.def?.scale ?? 1.6));

    switch (b.state) {
      case 'move': {
        const tell = an.tell;
        if (tell === 'leap' || tell === 'backflip') {
          if (an.phase === 'windup') ch.pose('Jump_Start', an.k);
          else if (an.phase === 'active') ch.pose(tell === 'backflip' ? 'Dodge_Backward' : 'Jump_Idle', tell === 'backflip' ? an.k : (an.k * 3) % 1);
          else ch.pose('Jump_Land', an.k);
        } else if (tell === 'charge' || tell === 'bounce' || tell === 'scuttle') {
          if (an.phase === 'active') { ch.release(); ch.locomotion(dt, { Running_B: 1 }, 1.6); }
          else ch.pose(this.ch.clips.has('Taunt') ? 'Taunt' : 'Cheer', an.k * .5);
        } else if (tell === 'spin' && an.phase === 'active') ch.pose('2H_Melee_Attack_Spinning', (an.k * 2) % 1);
        else {
          const run = b.run, st = run?.step;
          const clip = this.clipFor(tell);
          if (!st) ch.release();
          else if (an.phase === 'windup') ch.poseTimed(clip, 'windup', run.t, st.windup);
          else if (an.phase === 'hold') ch.poseTimed(clip, 'hold', 0, 1);
          else if (an.phase === 'active') ch.poseTimed(clip, 'active', run.t - st.windup - run.hold, st.active);
          else ch.poseTimed(clip, 'recovery', run.t - st.windup - run.hold - st.active, st.recovery);
        }
        break;
      }
      case 'stagger': ch.pose('Hit_B', clamp01(b.t / Math.max(b.stagDur, .1)), .03); break;
      case 'riposted': ch.pose('Death_A', clamp01(b.t / 1.5) * .95, .03); break;
      case 'getup': ch.pose('Lie_StandUp', clamp01(b.t / .75), .05); break;
      case 'transition': case 'pause': ch.pose(ch.clips.has('Taunt') ? 'Taunt' : 'Cheer', clamp01(b.t / 1.6)); break;
      case 'dodge': ch.pose(dodgeClip(angDiff(this.yaw, b.flags.dodgeYaw ?? this.yaw)), clamp01(b.t / .6)); break;
      case 'drink': ch.pose('Use_Item', clamp01(b.t / 1.25)); break;
      case 'dead': ch.pose('Death_A', clamp01(b.t / 1.2)); break;
      default: ch.release();
    }
    ch.update(dt);
  }
}
