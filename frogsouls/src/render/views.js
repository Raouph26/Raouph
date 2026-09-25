import * as THREE from 'three';
import { buildFrog } from './kit/frog.js';
import { buildWeapon } from './kit/weapons.js';
import { buildBoss } from './kit/boss.js';
import { PlayerAnimator, BossAnimator, VacuumAnimator } from './anim/animator.js';
import { Trail } from './fx/trail.js';
import { WEAPONS, ARMOURS } from '../sim/weapons.js';
import { glowMaterial } from './kit/builder.js';
import { glintTexture, softSprite } from './textures.js';

/** A soft dark disc under a character: grounds it even where there are no shadow maps. */
function contactShadow(scene, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ map: softSprite(), color: 0x000000, transparent: true, opacity: .5, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  scene.add(m);
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Views mirror sim entities every frame. They own meshes, animators, trails
// and the little living details; they never change what happens in a fight.
// ─────────────────────────────────────────────────────────────────────────────

const TWO_HANDED = new Set(['banhammer', 'lance', 'doomscroll']);

export class PlayerView {
  constructor(scene) {
    this.scene = scene;
    this.frog = buildFrog('hero');
    this.anim = new PlayerAnimator(this.frog);
    scene.add(this.frog.rig.root);
    this.trail = new Trail(scene, 0xc9e27a);
    this.frog.material.userData.u.uFlashColor.value.set(0xff7a5c);    // getting hit reads red
    this.blob = contactShadow(scene, .75);
    this.weaponId = null;
    this.flash = 0;
    this.stepT = 0;
  }

  /** A new armour is a new frog: its colours are baked into the mesh. */
  setArmour(id) {
    if (id === this.armourId) return;
    const first = this.armourId == null;
    this.armourId = id;
    if (first && id === 'rags') return;
    const ar = ARMOURS[id] ?? ARMOURS.rags;
    const old = this.frog, yaw = this.anim.yaw;
    this.scene.remove(old.rig.root);
    this.frog = buildFrog('hero', { cloth: ar.cloth, metal: ar.metal, trim: ar.trim });
    this.frog.material.userData.u.uFlashColor.value.set(0xff7a5c);
    this.anim = new PlayerAnimator(this.frog);
    this.anim.yaw = yaw;
    this.scene.add(this.frog.rig.root);
    const w = this.weaponId; this.weaponId = null; this.weapon = null;
    if (w) this.setWeapon(w);
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    if (this.weapon) this.frog.rig.joints.socket.remove(this.weapon);
    this.weapon = buildWeapon(id, this.frog.material);
    this.frog.rig.joints.socket.add(this.weapon);
    this.weaponId = id;
    this.trail.setColor(WEAPONS[id]?.trail ?? 0xffffff);
  }

  /** p: the PlayerSim, or anything with the same shape (the hub walker). */
  update(dt, p, combat, realDt = dt) {
    this.setArmour(p.armourId ?? 'rags');
    this.setWeapon(p.weaponId);
    this.anim.realDt = realDt;
    const o = this._ao ?? (this._ao = { combat: true, weaponTwo: false });
    o.combat = combat; o.weaponTwo = TWO_HANDED.has(p.weaponId);
    this.anim.update(dt, p, o);
    // the dew bottle comes out of the hip and into the hand while drinking
    const inHand = this.anim.drinking > .5;
    this.frog.bottle.visible = inHand; this.frog.hipDew.visible = !inHand;
    this.blob.position.set(p.x, .03, p.z);
    this.blob.material.opacity = .5 / (1 + (p.y ?? 0) * 2);
    const live = p.state === 'attack' && p.atk && p.t >= p.atk.spec.startup * 0.75 && p.t <= p.atk.spec.startup + p.atk.spec.active + 0.05;
    this.trail.update(dt, this.weapon?.userData.base, this.weapon?.userData.tip, live || p.state === 'riposte' && p.t > .18 && p.t < .4);
    this.flash = Math.max(0, this.flash - realDt * 7);
    this.frog.material.userData.u.uFlash.value = this.flash * this.flash * .7;
    this.frog.rig.root.visible = true;
  }

  hitFlash() { this.flash = 1; }
  get root() { return this.frog.rig.root; }
  get chest() { return this.frog.rig.joints.chest; }

  dispose() { this.scene.remove(this.frog.rig.root); this.scene.remove(this.trail.mesh); this.scene.remove(this.blob); }
}

export class BossView {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.b = buildBoss(def);
    scene.add(this.b.root);
    if (this.b.kind === 'vacuum') this.anim = new VacuumAnimator(this.b);
    else this.anim = new BossAnimator(this.b, def);
    this.trail = new Trail(scene, def.visual?.accent ?? 0xffc27a, { raw: 8, inner: .45 });
    this.trail.mat.uniforms.uOpacity.value = .6;
    this.flash = 0;
    this.glow = 0;
    this.t = 0;
    this.deadT = 0;
    this.u = this.b.material.userData.u;
    // the glint: a star that flashes on the weapon just before it swings
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xfff1c8, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glint.renderOrder = 9;
    this.glint.visible = false;
    this.glintT = -1;
    this.glintKey = null;
    scene.add(this.glint);
    this.blob = contactShadow(scene, 1);
    this.blobR = def.radius ?? .55 * (def.scale ?? 1.6) * 1.5;
  }

  update(dt, boss, fight, realDt = dt) {
    this.t += dt;
    this.anim.realDt = realDt;
    this.anim.update(dt, boss);

    // telegraph: a rim of light builds through the wind-up (gold: parryable,
    // red: not), then a glint flashes on the weapon just before it swings
    const an = boss.anim;
    let target = 0, red = false;
    if (boss.state === 'move') {
      const s = boss.run?.step;
      if (an.phase === 'windup') target = .15 + an.k * an.k * .45;
      else if (an.phase === 'hold') target = .5 + Math.sin(this.t * 22) * .15;
      else if (an.phase === 'active') target = Math.max(0, .6 - an.k * 2);
      red = !!(s?.hit?.unblockable || !s?.hit?.parryable);
      this.u.uGlowColor.value.set(red ? 0xff4a2a : 0xffc46a);
      const key = `${an.moveId}:${an.step}`;
      if (an.phase === 'windup' && an.k > .8 && this.glintKey !== key) { this.glintKey = key; this._glint(red); }
    } else if (boss.state === 'transition') { target = .7 + Math.sin(this.t * 18) * .3; this.u.uGlowColor.value.set(0xffffff); }
    else if (boss.flags.countering) { target = .8; this.u.uGlowColor.value.set(0x6ab8ff); }
    if (boss.state !== 'move') this.glintKey = null;
    if (boss.iframes > 0 && boss.def.gimmick === 'loading') { target = .6; this.u.uGlowColor.value.set(0x57a8ff); }
    this.glow += (target - this.glow) * Math.min(1, dt * 18);
    this.u.uGlow.value = this.glow;
    this._updateGlint(realDt);

    this.flash = Math.max(0, this.flash - realDt * 9);      // real time: a flash shouldn't freeze with the hitstop
    this.u.uFlash.value = this.flash * this.flash * .42;

    const live = boss.state === 'move' && (an.phase === 'active' || (an.phase === 'windup' && an.k > .85));
    this.trail.update(dt, this.b.weapon?.userData.base, this.b.weapon?.userData.tip, live);

    this._living(dt, boss, fight);
    this.blob.position.set(boss.x, .035, boss.z);
    this.blob.scale.setScalar(this.blobR * (1 + boss.y * .15));
    this.blob.material.opacity = (.5 / (1 + boss.y * .8)) * (1 - (this.dissolve ?? 0));

    // death: it falls, then comes apart into embers
    this.dissolve = 0;
    if (!boss.alive) {
      this.deadT += dt;                         // game time: the death slow-mo stretches it, as it should
      this.dissolve = Math.min(1, Math.max(0, (this.deadT - 1.35) / 1.6));
      this.u.uDissolve.value = this.dissolve;
      if (this.dissolve > 0 && !this.shadowsOff) { this.shadowsOff = true; this.b.root.traverse((o) => { o.castShadow = false; }); }
      this.u.uDissolveColor.value.set(this.def.visual?.accent ?? 0xffb35a).lerp(new THREE.Color(0xffc27a), .5);
      if (this.dissolve >= 1) this.b.root.visible = false;
    }
  }

  _living(dt, boss, fight) {
    const fx = this.b.fx;
    for (const s of fx.spin) s.obj.rotation[s.axis] += s.speed * dt * (boss.state === 'move' ? 2 : 1);
    for (const s of fx.bob) s.obj.position.y += Math.sin(this.t * s.speed) * s.amp * dt;
    // the reply guy types while it winds up a reply
    const typing = boss.state === 'move' && boss.anim.tell === 'type';
    fx.dots.forEach((d, i) => { d.position.y = .26 + (typing ? Math.max(0, Math.sin(this.t * 10 - i * 1.1)) * .06 : 0); });
    for (const r of fx.rgb) r.obj.position.x = r.dx * (1 + Math.sin(this.t * 31) * 2) + (Math.random() < .05 ? (Math.random() - .5) * .3 : 0);
    for (const scr of fx.screens) {
      const g = boss.flags;
      if (scr.kind === 'ad') scr.redraw({ skip: g.adTime > 0 ? Math.ceil(g.adTime) : 0 });
      else if (scr.kind === 'battery') scr.redraw({ pct: Math.round(boss.hpFrac * 20) / 20 });
      else if (scr.kind === 'crt') scr.redraw({ crit: boss.phase >= 3, line: boss.phase >= 3 ? 'CRITICAL_PROCESS_DIED' : 'your pond ran into a problem' });
      else if (scr.kind === 'glitch') scr.redraw({ t: Math.floor(this.t * 8) / 8 });
      else if (scr.kind === 'spinner') scr.redraw({ t: Math.floor(this.t * 10) / 10 });
      else if (scr.kind === 'captcha') scr.redraw({ sel: boss.state === 'move' && boss.anim.tell === 'cast' ? [0, 4, 8] : [] });
      else if (scr.kind === 'ai') {
        const pl = fight?.player;
        const lx = pl ? Math.max(-1, Math.min(1, ((pl.x - boss.x) * Math.cos(boss.yaw) - (pl.z - boss.z) * Math.sin(boss.yaw)) / 6)) : 0;
        scr.redraw({ lookX: Math.round(-lx * 4) / 4 });
      }
    }
  }

  _glint(red) {
    this.glintT = 0;
    this.glint.material.color.set(red ? 0xff5a3a : 0xfff1c8);
    this.onGlint?.(red);
  }

  _updateGlint(dt) {
    const g = this.glint;
    if (this.glintT < 0) { g.visible = false; return; }
    this.glintT += dt;
    const k = this.glintT / .32;
    if (k >= 1) { this.glintT = -1; g.visible = false; return; }
    // at the weapon's tip if it has one, else at its hand
    const tip = this.b.weapon?.userData.tip ?? this.b.rig?.joints.handR ?? this.b.root;
    tip.getWorldPosition(g.position);
    const pop = k < .25 ? k / .25 : 1 - (k - .25) / .75;
    const size = (.55 + .5 * (this.anim.scale ?? 1)) * (0.4 + pop * 1.1);
    g.scale.set(size, size, 1);
    g.material.rotation = k * 1.2;
    g.material.opacity = Math.min(1, pop * 1.4);
    g.visible = true;
  }

  hitFlash() { this.flash = 1; }
  get root() { return this.b.root; }
  dispose() { this.scene.remove(this.b.root); this.scene.remove(this.trail.mesh); this.scene.remove(this.glint); this.scene.remove(this.blob); }
}

// ── projectiles ─────────────────────────────────────────────────────────────
const PROTO = {
  brick: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(.46, .22, .22), new THREE.MeshStandardMaterial({ color: 0x9a3e2a, roughness: .9, flatShading: true })); m.castShadow = true; return m; },
  paper: () => new THREE.Mesh(new THREE.PlaneGeometry(.42, .56), new THREE.MeshStandardMaterial({ color: 0xf6f3ec, side: THREE.DoubleSide, roughness: .8 })),
  orb: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.24, 12, 8), glowMaterial(0xffffff)));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 8), glowMaterial(0x7ab8ff, { transparent: true, opacity: .35, depthWrite: false }));
    g.add(halo);
    return g;
  },
  phantom: () => {
    const g = new THREE.Group();
    const mat = glowMaterial(0x9ab8ff, { transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.45, 1.4, 4, 8), mat); body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.5, .45, .45), mat); head.position.y = 2.3; g.add(head);
    return g;
  },
};

export class ProjectileViews {
  constructor(scene) { this.scene = scene; this.map = new Map(); this.pool = {}; }

  _get(kind) {
    const list = this.pool[kind] ??= [];
    const m = list.pop() ?? (PROTO[kind] ?? PROTO.orb)();
    this.scene.add(m);
    m.visible = true;
    return m;
  }

  sync(dt, projectiles, time) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p.id);
      let m = this.map.get(p.id);
      if (!m) { m = this._get(p.kind); m.userData.kind = p.kind; this.map.set(p.id, m); }
      m.position.set(p.x, p.kind === 'phantom' ? 0 : p.y, p.z);
      if (p.kind === 'brick') { m.rotation.x += dt * 9; m.rotation.z += dt * 5; }
      if (p.kind === 'paper') { m.rotation.set(time * 7 + p.id, time * 9, time * 5); }
      if (p.kind === 'orb') { const s = 1 + Math.sin(time * 20 + p.id) * .1; m.scale.setScalar(s); }
      if (p.kind === 'phantom') {
        m.rotation.y = p.yaw ?? Math.atan2(p.vx, p.vz);
        const winding = p.delay > 0;
        m.children.forEach((c) => { c.material.opacity = winding ? .2 + Math.sin(time * 18) * .1 : .5; });
      }
    }
    for (const [id, m] of this.map) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      (this.pool[m.userData.kind] ??= []).push(m);
      this.map.delete(id);
    }
  }

  clear() { for (const [, m] of this.map) this.scene.remove(m); this.map.clear(); }
}
