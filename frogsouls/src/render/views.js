import * as THREE from 'three';
import { buildFrog } from './kit/frog.js';
import { buildWeapon } from './kit/weapons.js';
import { buildBoss } from './kit/boss.js';
import { PlayerAnimator, BossAnimator, VacuumAnimator } from './anim/animator.js';
import { Trail } from './fx/trail.js';
import { WEAPONS } from '../sim/weapons.js';
import { glowMaterial } from './kit/builder.js';

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
    this.weaponId = null;
    this.flash = 0;
    this.stepT = 0;
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
  update(dt, p, combat) {
    this.setWeapon(p.weaponId);
    this.anim.update(dt, p, { combat, weaponTwo: TWO_HANDED.has(p.weaponId) });
    const live = p.state === 'attack' && p.atk && p.t >= p.atk.spec.startup * 0.7 && p.t <= p.atk.spec.startup + p.atk.spec.active + 0.06;
    this.trail.update(dt, this.weapon?.userData.base, this.weapon?.userData.tip, live || p.state === 'riposte' && p.t > .3 && p.t < .5);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.frog.material.userData.u.uFlash.value = this.flash * .6;
    this.frog.rig.root.visible = true;
  }

  hitFlash() { this.flash = 1; }
  get root() { return this.frog.rig.root; }
  get chest() { return this.frog.rig.joints.chest; }

  dispose() { this.scene.remove(this.frog.rig.root); this.scene.remove(this.trail.mesh); }
}

export class BossView {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.b = buildBoss(def);
    scene.add(this.b.root);
    if (this.b.kind === 'vacuum') this.anim = new VacuumAnimator(this.b);
    else this.anim = new BossAnimator(this.b, def);
    this.trail = new Trail(scene, def.visual?.accent ?? 0xffc27a, 14);
    this.trail.mat.uniforms.uOpacity.value = .6;
    this.flash = 0;
    this.glow = 0;
    this.t = 0;
    this.deadT = 0;
    this.u = this.b.material.userData.u;
  }

  update(dt, boss, fight) {
    this.t += dt;
    this.anim.update(dt, boss);

    // telegraph glow: builds through the wind-up, flashes red for unblockables
    const an = boss.anim;
    let target = 0;
    if (boss.state === 'move') {
      const s = boss.run?.step;
      if (an.phase === 'windup') target = an.k * an.k;
      else if (an.phase === 'hold') target = .85 + Math.sin(this.t * 22) * .15;
      else if (an.phase === 'active') target = Math.max(0, 1 - an.k * 2.5);
      const red = s?.hit?.unblockable || !s?.hit?.parryable;
      this.u.uGlowColor.value.set(boss.phase >= 3 ? 0xff5a3a : red ? 0xff5a3a : 0xffc46a);
    } else if (boss.state === 'transition') { target = .7 + Math.sin(this.t * 18) * .3; this.u.uGlowColor.value.set(0xffffff); }
    else if (boss.flags.countering) { target = .8; this.u.uGlowColor.value.set(0x6ab8ff); }
    if (boss.iframes > 0 && boss.def.gimmick === 'loading') { target = .6; this.u.uGlowColor.value.set(0x57a8ff); }
    this.glow += (target - this.glow) * Math.min(1, dt * 18);
    this.u.uGlow.value = this.glow * 1.4;

    this.flash = Math.max(0, this.flash - dt * 7);
    this.u.uFlash.value = this.flash * .55;

    const live = boss.state === 'move' && (an.phase === 'active' || (an.phase === 'windup' && an.k > .85));
    this.trail.update(dt, this.b.weapon?.userData.base, this.b.weapon?.userData.tip, live);

    this._living(dt, boss, fight);

    // death: it kneels, sinks and goes
    if (!boss.alive) {
      this.deadT += dt;
      if (this.deadT > 1.3) {
        const k = Math.min(1, (this.deadT - 1.3) / 1.4);
        this.b.root.position.y = -k * 2.5;
        this.b.root.scale.setScalar((this.anim.scale ?? 1) * (1 - k * .3));
      }
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

  hitFlash() { this.flash = 1; }
  get root() { return this.b.root; }
  dispose() { this.scene.remove(this.b.root); this.scene.remove(this.trail.mesh); }
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
