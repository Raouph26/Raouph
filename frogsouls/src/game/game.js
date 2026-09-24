import * as THREE from 'three';
import { Renderer } from '../render/renderer.js';
import { Stage } from '../render/stage.js';
import { PlayerView, BossView, ProjectileViews } from '../render/views.js';
import { FX } from '../render/fx/particles.js';
import { Decals } from '../render/fx/decals.js';
import { Gate } from '../render/env/props.js';
import { CameraCtl } from './camera.js';
import { Save } from './save.js';
import { Input } from '../input/input.js';
import { AudioEngine } from '../audio/engine.js';
import { Music } from '../audio/music.js';
import { UI } from '../ui/ui.js';
import { Fight, TICK, EMPTY_INTENT } from '../sim/fight.js';
import { PlayerSim } from '../sim/player.js';
import { WEAPONS, WEAPON_ORDER } from '../sim/weapons.js';
import { WORLDS, bossForFight, worldOfBoss } from '../content/worlds.js';
import { BOSSES } from '../content/bosses.js';
import { STATS, levelCost, totalLevels, flyReward, TOAD_LINES } from '../content/progression.js';

// ─────────────────────────────────────────────────────────────────────────────
// The game: places, fights and the menus between them.
//   boot → title → the Lily (hub) → a world (its arena, with fog gates)
//   → a fight in that same arena → back to the world.
// Fights run the pure simulation at a fixed 60 Hz; everything here is
// presentation: camera, hitstop, sound, particles and UI reacting to events.
// ─────────────────────────────────────────────────────────────────────────────

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const KEY = { kb: { interact: 'E', confirm: 'Enter' }, pad: { interact: 'A', confirm: 'A' }, touch: { interact: 'TAP', confirm: 'TAP' } };
const KILLED_BY = {
  overhead: 'an overhead', delayed: 'a delayed blow', swipe: 'a swipe', swipe2: 'a combo', swipe3: 'a long combo', thrust: 'a lunge',
  sweep: 'a sweep', spin: 'a spin', stomp: 'a stomp', jab3: 'three jabs', leap: 'a leap', charge: 'a charge', bounce: 'a ricochet',
  brick: 'a brick', paper: 'paper', orb: 'a reply', phantom: 'a bot', ring: 'a shockwave', aoe: 'the ground', tiles: 'a captcha',
  wipe: 'a fatal exception', counter: 'a prediction', pincer: 'the claws', clawSlam: 'a claw', scuttle: 'sideways', knifeSpin: 'the knife',
  shout: 'a shout', flash: 'a selfie', mLight3: 'your own moves', mHeavy: 'your own moves', mRun: 'your own moves', eruption: 'the floor',
};

class Sandbox {                     // a fight-shaped world with nobody in it
  constructor() { this.mods = { noHeal: false, noBlock: false, staminaRegen: 1, iframes: 1, rollCost: 1, moveSpeed: 1, rollDistance: 1 }; this.time = 0; this.events = []; this.boss = null; }
  emit(e) { this.events.push(e); }
  enemies() { return []; }
  drain() { const e = this.events; this.events = []; return e; }
}

export class Game {
  constructor() {
    this.save = new Save();
    const S = this.save.settings;
    this.ui = new UI(document.getElementById('ui'));
    this.R = new Renderer(document.getElementById('stage'), S.quality);
    this.scene = this.R.scene;
    this.stage = new Stage(this.scene);
    this.decals = new Decals(this.scene);
    this.fx = new FX(this.scene);
    this.projViews = new ProjectileViews(this.scene);
    this.cam = new CameraCtl(this.R.camera);
    this.input = new Input(this.R.gl.domElement, this.ui);
    this.input.sens = S.sens; this.input.invertY = S.invertY;
    this.audio = new AudioEngine();
    this.audio.setVolumes({ master: S.master, music: S.music, sfx: S.sfx });
    this.music = new Music(this.audio);
    this.playerView = new PlayerView(this.scene);

    this.state = 'boot';
    this.world = null;
    this.walker = null;
    this.sandbox = new Sandbox();
    this.fight = null;
    this.bossView = null;
    this.gates = [];
    this.gateGroup = new THREE.Group();
    this.scene.add(this.gateGroup);
    this.lockOn = true;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.acc = 0;
    this.stepDist = 0;
    this.t = 0;
    this.paused = false;
    this.busy = false;
    this.heartT = 0;
    this._v = new THREE.Vector3();
    this.clock = new THREE.Clock();
    window.__game = this;
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  boot() {
    this.enterHub({ title: true });
    const boot = document.getElementById('boot');
    document.getElementById('bootMsg').textContent = 'the pond is awake';
    const go = document.getElementById('bootGo');
    go.hidden = false;
    const start = () => {
      removeEventListener('pointerdown', start); removeEventListener('keydown', start);
      this.audio.unlock();
      this.music.resumePending();
      boot.classList.add('gone');
      setTimeout(() => boot.remove(), 900);
      this.ui.fade(0, 1.2);
      this.showTitle();
    };
    addEventListener('pointerdown', start); addEventListener('keydown', start);
    // gamepads can't fire DOM events; poll for any button
    const padPoll = () => {
      if (!document.getElementById('boot')) return;
      const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.buttons.some((b) => b.pressed));
      if (gp) start(); else requestAnimationFrame(padPoll);
    };
    padPoll();
    this.clock.start();
    this.loop();
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    const raw = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.manual) return;          // test harness steps frames itself
    this.frame(raw);
  };

  sfx(name, o) { this.audio.play(name, o); }

  // ── places ────────────────────────────────────────────────────────────────
  _clearGates() { for (const g of this.gates) g.visual?.dispose(this.gateGroup); this.gates = []; }

  _spawnWalker(x, z, yaw) {
    this.sandbox = new Sandbox();
    this.walker = new PlayerSim(this.sandbox, this.save.stats());
    this.walker.x = x; this.walker.z = z; this.walker.yaw = yaw;
    this.cam.reset(this.walker, yaw + Math.PI);
    this.playerView.anim.yaw = yaw;
  }

  enterHub({ title = false } = {}) {
    this._leaveFight();
    this.state = title ? 'title' : 'hub';
    this.world = null;
    this.stage.setWorld('hub');
    this.stage.setLook('hub', true);
    this.stage.dim = 0;
    this.R.fx.blue = 0;
    this._clearGates();
    WORLDS.forEach((w, i) => {
      const a = (i / WORLDS.length) * Math.PI * 2 + Math.PI;
      const x = Math.sin(a) * 15.5, z = Math.cos(a) * 15.5;
      const unlocked = this.save.worldUnlocked(WORLDS, i);
      const prog = this.save.worldProgress(w);
      const done = this.save.isCleared(w.boss);
      const visual = new Gate(this.gateGroup, { x, z, yaw: a + Math.PI, color: w.tint, label: w.name,
        sub: unlocked ? `${prog} / 4${done ? ' · cleared' : ''}` : 'sealed', pips: 4, pipsLit: prog, sealed: !unlocked, cleared: done });
      this.gates.push({ x: x * .86, z: z * .86, r: 3.2, visual, label: w.name, sub: unlocked ? w.epithet : `clear ${WORLDS[i - 1]?.name ?? ''} first`, locked: !unlocked,
        action: () => this.travel(() => this.enterWorld(w)) });
    });
    this.gates.push({ x: 0, z: -6, r: 3.6, label: 'THE OLD TOAD', sub: 'level up · equip', action: () => this.openShop() });
    this._spawnWalker(0, 5, Math.PI);
    this.audio.setReverb(3.2, .55);
    if (!title) {
      this.music.play('hub');
      this.ui.showHud(true);
      this.ui.area('THE LILY', 'five ways down. one old toad.');
    } else this.music.play('title');
  }

  enterWorld(w) {
    this._leaveFight();
    this.ui.showTitle(false);
    this.state = 'world';
    this.world = w;
    this.stage.setWorld(w.env);
    this.stage.setLook(w.look, true);
    this.stage.dim = 0;
    this.R.fx.blue = 0;
    this._clearGates();
    const bossUnlocked = this.save.worldBossUnlocked(w);
    const place = (a, r) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });
    const slots = [Math.PI + 1.25, Math.PI + .55, Math.PI - .55, Math.PI - 1.25];
    w.bosses.forEach((id, i) => {
      const p = place(slots[i], 16.8), b = BOSSES[id], done = this.save.isCleared(id);
      const visual = new Gate(this.gateGroup, { ...p, yaw: slots[i] + Math.PI, color: w.tint, label: b.name, sub: done ? 'vanquished' : b.epithet, cleared: done, style: w.env === 'pond' || w.env === 'comments' ? 'stone' : 'frame', frame: 0x4a4a50 });
      this.gates.push({ x: p.x * .88, z: p.z * .88, r: 3, visual, label: b.name, sub: b.epithet, action: () => this.startFight(id) });
    });
    const bp = place(Math.PI, 17.2), wb = BOSSES[w.boss];
    const visual = new Gate(this.gateGroup, { ...bp, yaw: 0, color: bossUnlocked ? 0xffffff : 0x333, label: wb.name, sub: bossUnlocked ? wb.epithet : `${this.save.worldProgress(w)} / 4 must fall`, sealed: !bossUnlocked, scale: 1.35, cleared: this.save.isCleared(w.boss), frame: 0x6a6a70 });
    this.gates.push({ x: bp.x * .9, z: bp.z * .9, r: 3.4, visual, label: wb.name, sub: bossUnlocked ? wb.epithet : 'four must fall first', locked: !bossUnlocked, action: () => this.startFight(w.boss) });
    const rp = place(0, 17.5);
    const back = new Gate(this.gateGroup, { ...rp, yaw: Math.PI, color: 0x7fd0c0, label: 'THE LILY', sub: 'go back up', style: 'frame', frame: 0x3a4a48 });
    this.gates.push({ x: rp.x * .88, z: rp.z * .88, r: 3, visual: back, label: 'THE LILY', sub: 'go back up', action: () => this.travel(() => this.enterHub()) });
    this._spawnWalker(0, 11, Math.PI);
    this.gateGroup.visible = true;
    this.audio.setReverb(w.env === 'office' ? 1.4 : w.env === 'server' ? 2.2 : 2.8, .5);
    this.music.play('world', { root: { pond: 40, comments: 36, office: 41, feed: 44, server: 38 }[w.env] });
    this.ui.showHud(true);
    this.ui.area(w.name, w.epithet);
  }

  async travel(fn) {
    if (this.busy) return;
    this.busy = true;
    this.sfx('gate');
    await this.ui.fade(1, .45);
    fn();
    await new Promise((r) => setTimeout(r, 120));
    await this.ui.fade(0, .6);
    this.busy = false;
  }

  // ── fights ────────────────────────────────────────────────────────────────
  async startFight(id) {
    if (this.busy) return;
    this.busy = true;
    this.sfx('gate');
    await this.ui.fade(1, .4);
    this._leaveFight();
    const { def, hpMult, dmgMult, world } = bossForFight(id, this.save.d.ng);
    this.world = world;
    this.fight = new Fight({ boss: def, stats: this.save.stats(), seed: (Math.random() * 1e9) | 0, hpMult, dmgMult });
    this.fightId = id;
    this.fightDef = def;
    this.attempt = this.save.attempt(id);
    this.bossView = new BossView(this.scene, def);
    this.gateGroup.visible = false;
    this.state = 'fight';
    this.phase = 'intro';
    this.introT = 0;
    this.outcomeT = 0;
    this.lockOn = true;
    this.hitstop = 0; this.timeScale = 1; this.slowT = 0; this.acc = 0;
    this.stage.setWorld(world.env);                 // a fight always happens in its own world
    this.stage.setLook(def.look ?? world.look, true);
    this.stage.dim = 0;
    this.R.fx.blue = 0;
    this.ui.showTitle(false);
    this.input.menuMode = false;
    this.ui.resetBossBar();
    this.ui.hideBanner();
    this.ui.closeMenu();
    this.ui.prompt(null);
    this.ui.showHud(true, { boss: false, controls: false });
    this.cam.cinematic(new THREE.Vector3(this.fight.boss.x, 0, this.fight.boss.z), 6 + this.fight.boss.scale * 2.4, this.fight.boss.height, 2.8, Math.PI * .1);
    this.cam.snap = true;
    this.music.stop(.6);
    await this.ui.fade(0, .5);
    this.ui.intro(def.name, def.epithet, world.name);
    setTimeout(() => this.audio.voice(def.voice, 'roar', { pos: this.fight?.boss }), 500);
    this.busy = false;
  }

  _beginCombat() {
    this.phase = 'combat';
    this.combatT = 0;
    this.cam.endCinematic(this.fight.player);
    this.cam.yaw = Math.PI * 0 + this.fight.player.yaw + Math.PI;
    this.ui.showHud(true, { boss: true });
    const theme = this.world.env;
    this.music.play(theme, { intensity: this.fightDef.world ? 2 : 1 });
  }

  _leaveFight() {
    if (this.bossView) { this.bossView.dispose(); this.bossView = null; }
    this.projViews.clear();
    this.fight = null;
    this.decals.sync([], 1);
  }

  _fightFrame(dt) {
    const f = this.fight, p = f.player, b = f.boss;
    if (this.phase === 'intro') {
      this.introT += dt;
      this.bossView.update(dt, b, f);
      this.playerView.update(dt, p, true);
      if (this.introT > 2.8 || (this.introT > .8 && (this.input.took('confirm') || this.input.took('light') || this.input.took('interact') || this.input.took('tap')))) this._beginCombat();
      return;
    }

    // time: hitstop freezes, slow-motion stretches, fixed steps underneath
    let simDt = dt;
    if (this.hitstop > 0) { this.hitstop -= dt; simDt = 0; }
    if (this.slowT > 0) { this.slowT -= dt; simDt *= this.timeScale; if (this.slowT <= 0) this.timeScale = 1; }

    if (this.phase === 'combat' && this.input.took('lock')) { this.lockOn = !this.lockOn; this.sfx('uiMove'); }

    const intent = this._intent(this.phase === 'combat');
    this.acc += simDt;
    let first = true;
    while (this.acc >= TICK) {
      f.step(TICK, first ? intent : { ...intent, light: false, heavy: false, roll: false, parry: false, heal: false });
      first = false;
      this.acc -= TICK;
      this._events(f.drain());
    }

    this.bossView.update(simDt, b, f);
    this.playerView.update(simDt, p, true);
    if (this.phase === 'combat') this.combatT += simDt;
    this._coach(dt);
    this.projViews.sync(simDt, f.projectiles, f.time);
    this.decals.sync(f.hazards, simDt);
    this.stage.dim += ((f.dim ?? 0) - this.stage.dim) * Math.min(1, dt * 2);
    const wipe = f.hazards.find((h) => h.kind === 'wipe');
    this.R.fx.blue += ((wipe ? .45 : 0) - this.R.fx.blue) * Math.min(1, dt * 3);
    this._footsteps(simDt, p);

    // low health heartbeat
    this.heartT -= dt;
    if (p.alive && p.hp / p.maxHp < .22 && this.heartT <= 0) { this.sfx('heartbeat'); this.heartT = .95; }

    if (f.outcome && this.phase === 'combat') this._outcome(f.outcome);
    if (this.phase === 'outcome') {
      this.outcomeT += dt;
      if (this.outcomeT > 5.2 && f.outcome === 'won' && !this.ui.menuOpen && !this.busy) this._afterWin();
    }
  }

  _intent(active) {
    const I = this.input;
    if (!active || this.paused) return { ...EMPTY_INTENT, lock: this.lockOn };
    const mv = this.cam.worldMove(I.move.x, I.move.y);
    return {
      mx: mv.x, mz: mv.z, sprint: I.held.sprint, block: I.held.block, lock: this.lockOn,
      light: I.has('light'), heavy: I.has('heavy'), roll: I.has('roll'), parry: I.has('parry'), heal: I.has('heal'),
    };
  }

  _footsteps(dt, p) {
    const sp = Math.hypot(p.vx, p.vz);
    if (p.state === 'roll' || p.state === 'backstep' || !p.alive) return;
    this.stepDist += sp * dt;
    if (this.stepDist > 1.25 && sp > .8) {
      this.stepDist = 0;
      const surface = { pond: 700, comments: 1400, office: 500, feed: 900, server: 2200, hub: 800 }[this.stage.envId] ?? 900;
      this.sfx('step', { pos: p, surface, gain: sp > 5 ? 1.3 : 1 });
    }
  }

  // ── fight events → sound, light, particles, camera, UI ────────────────────
  _events(events) {
    const f = this.fight;
    if (!f) return;
    const p = f.player, b = f.boss;
    const pos = (e) => ({ x: e.x ?? b.x, z: e.z ?? b.z });
    const rumble = (s, w, ms) => this._rumble(s, w, ms);
    for (const e of events) {
      switch (e.type) {
        case 'swing': this.sfx(e.heavy ? 'whoosh' : 'whoosh', { pos: p, heavy: e.heavy }); break;
        case 'roll': this.sfx('roll', { pos: p }); this.fx.dust(p.x, p.z, 8, .5, 0x8a8070, .8); break;
        case 'backstep': this.sfx('whooshSmall', { pos: p }); break;
        case 'dodged': this.sfx('dodged', { pos: p }); break;
        case 'hit':
          if (e.target === 'boss') {
            const heavy = e.heavy || e.riposte;
            this.sfx('hit', { pos: e, heavy });
            this.fx.sparks(e.x, 1.2 * b.scale, e.z, 0xffd9a0, heavy ? 26 : 16, heavy ? 1.3 : 1);
            this.fx.goo(e.x, 1.1 * b.scale, e.z, b.def.visual?.accent ?? 0x9fd06a, heavy ? 16 : 8);
            this.bossView?.hitFlash();
            this.hitstop = Math.max(this.hitstop, e.riposte ? .24 : heavy ? .085 : .05);
            this.cam.shake(e.riposte ? .45 : heavy ? .24 : .12);
            rumble(heavy ? .6 : .3, .3, heavy ? 120 : 60);
          } else {
            this.sfx('hurt', { pos: p });
            this.fx.sparks(p.x, 1.1, p.z, 0xff5a4a, 14, .9);
            this.playerView.hitFlash();
            this.R.fx.hurt = Math.min(1, this.R.fx.hurt + (e.knockdown ? .9 : .6));
            this.R.fx.aberration = 1;
            this.hitstop = Math.max(this.hitstop, e.knockdown ? .11 : .07);
            this.cam.shake(e.knockdown ? .55 : .36);
            this.cam.kick(2.5);
            rumble(.9, .7, 220);
          }
          break;
        case 'parry':
          this.sfx('parry', { pos: e });
          this.fx.parry(e.x, 1.3, e.z);
          this.R.fx.flash = .45; this.R.fx.aberration = 1.2;
          this.hitstop = Math.max(this.hitstop, .16);
          this.cam.shake(.3);
          rumble(.5, .9, 140);
          break;
        case 'block': this.sfx('block', { pos: p }); this.fx.sparks(p.x + Math.sin(p.yaw) * .6, 1.2, p.z + Math.cos(p.yaw) * .6, 0xffe2a8, 10, .7); this.cam.shake(.14); rumble(.3, .3, 80); break;
        case 'guardbreak': this.sfx('guardbreak', { pos: p }); this.cam.shake(.4); this.R.fx.aberration = 1; break;
        case 'riposte': this.sfx('riposte', { pos: e }); this.R.fx.flash = .2; this.cam.kick(4); break;
        case 'flaskStart': this.sfx('flask', { pos: p }); break;
        case 'healed': this.sfx('healed', { pos: p }); this.fx.heal(p.x, 1.3, p.z); break;
        case 'flaskEmpty': this.sfx('flaskEmpty'); this.ui.toast('no dew left'); break;
        case 'denied': this.sfx('denied'); this.ui.toast(f.mods.noHeal ? 'healing is against the rules' : 'not allowed'); break;
        case 'bossMove': this.audio.voice(b.def.voice, 'attack', { pos: b }); break;
        case 'bossActive': if (e.sfx) this.sfx(e.sfx, { pos: e }); break;
        case 'slam': this.sfx('slam', { pos: e }); this.fx.dust(e.x, e.z, 22, e.radius, 0x9a8f7a, 1.6); this.fx.ringBurst(e.x, e.z, e.radius, 0xffc46a); this._distShake(e, .5); break;
        case 'aoeFire': this.sfx(e.eruption ? 'shock' : 'slam', { pos: e, gain: .6 }); this.fx.dust(e.x, e.z, 10, e.radius, 0xb09a7a, 1.2); this.fx.sparks(e.x, .3, e.z, 0xffa14a, 10, .8); this._distShake(e, .2); break;
        case 'hazard': if (e.kind === 'ring') this.sfx('shock', { pos: b }); if (e.kind === 'tiles') this.sfx('tiles'); break;
        case 'tilesFire': this.sfx('tilesFire'); this.cam.shake(.2); break;
        case 'wipeFire': this.sfx('wipeFire'); this.R.fx.flash = .8; this.cam.shake(.7); break;
        case 'projectile': if (e.kind === 'brick') this.sfx('throw', { pos: b }); else if (e.kind === 'phantom') this.sfx('cast', { pos: b }); break;
        case 'projLand': this.sfx('brickLand', { pos: e }); this.fx.dust(e.x, e.z, 8, .6, 0x9a5a3a); break;
        case 'projHit': this.sfx('projHit', { pos: e }); break;
        case 'phantomDash': this.sfx('whooshBig', { pos: e }); break;
        case 'decal': this.decals.event(e, e.follow ? b : null); break;
        case 'bossParried': this.audio.voice(b.def.voice, 'hurt', { pos: b }); break;
        case 'bossStagger': this.sfx('bossStagger', { pos: b }); if (e.why === 'bonk') this.sfx('bonk', { pos: b }); this.hitstop = Math.max(this.hitstop, .1); break;
        case 'bonk': this.sfx('bonk', { pos: e }); this.fx.sparks(e.x, .5, e.z, 0xffffff, 12); this._distShake(e, .25); break;
        case 'bossRoll': this.sfx('roll', { pos: b }); break;
        case 'bossDrink': this.sfx('flask', { pos: b }); break;
        case 'bossHealed': this.fx.heal(b.x, 1.3, b.z); this.ui.toast('he drank. of course he did.'); break;
        case 'bossDodge': this.sfx('dodged', { pos: b }); break;
        case 'counter': this.sfx('counter', { pos: b }); this.R.fx.flash = .25; this.ui.toast('predicted.'); break;
        case 'immune': this.sfx('immune', { pos: b }); break;
        case 'flash': this.sfx('flash', { pos: b }); if (this._facing(b)) this.R.fx.flash = .85; break;
        case 'lag': this.sfx('lag', { pos: e }); this.fx.glitch(e.fromX, 0, e.fromZ); this.fx.glitch(e.x, 0, e.z); this.R.fx.aberration = 1.5; break;
        case 'jam': this.sfx('jam', { pos: e }); break;
        case 'loading': this.sfx('cast', { pos: b }); break;
        case 'shock': this.sfx('slam', { pos: e, gain: .7 }); this.fx.dust(e.x, e.z, 14, e.radius); break;
        case 'phase':
          this.sfx('phase', { pos: b });
          this.audio.voice(b.def.voice, 'roar', { pos: b });
          this.cam.shake(.5); this.R.fx.aberration = 1.2;
          this.music.setIntensity(Math.min(3, (this.fightDef.world ? 2 : 1) + (e.phase - 1)));
          break;
        case 'rule': this.sfx('rule'); this.ui.rule(e.text); break;
        case 'look': this.stage.setLook(e.look); this.sfx('error'); break;
        case 'say': break;
        case 'bossDied':
          this.audio.voice(b.def.voice, 'die', { pos: b });
          this.hitstop = .3; this.timeScale = .28; this.slowT = 1.6;
          this.R.fx.flash = .6; this.cam.shake(.6); this.cam.kick(5);
          this.fx.sparks(b.x, 1.5 * b.scale, b.z, 0xfff0c0, 60, 1.8);
          rumble(1, 1, 400);
          break;
        case 'playerDied': this.cam.shake(.7); this.R.fx.hurt = 1; this.slowT = 1.4; this.timeScale = .35; break;
        case 'outcome': break;
      }
    }
  }

  // ── first-time tips: each taught once, in the moment it matters ───────────
  _btn(a) {
    const d = this.input.device;
    const T = { touch: { light: 'ATK', heavy: 'HEAVY', roll: 'ROLL', parry: 'PARRY', heal: 'HEAL', block: 'BLOCK', lock: 'LOCK' },
      pad: { light: 'R1', heavy: 'R2', roll: 'B', parry: 'L2', heal: 'X', block: 'L1', lock: 'R3' },
      kb: { light: 'CLICK', heavy: 'F', roll: 'SPACE', parry: 'C', heal: 'R', block: 'RIGHT CLICK', lock: 'Q' } };
    return (T[d] ?? T.kb)[a];
  }

  _tip(id, text, dur = 4.2) {
    const t = this.save.d.tips ?? (this.save.d.tips = {});
    if (t[id] || this.tipCd > 0 || this.save.settings.hints === false) return;
    t[id] = true; this.save.write();
    this.ui.toast(text, dur);
    this.tipCd = dur + .6;
  }

  _coach(dt) {
    this.tipCd = Math.max(0, (this.tipCd ?? 0) - dt);
    const f = this.fight;
    if (!f || this.phase !== 'combat') return;
    const p = f.player, b = f.boss;
    if (this.combatT > .6) this._tip('start', `${this._btn('light')} to hit · ${this._btn('roll')} to dodge through attacks`, 4.6);
    if (b.state === 'move') {
      const h = b.run?.step?.hit, red = !h || h.unblockable || !h.parryable;
      if (red) this._tip('red', `red glow = can't parry it. ${this._btn('roll')}!`);
      else this._tip('glow', `gold glow = incoming. ${this._btn('parry')} as it lands, or ${this._btn('roll')}`, 4.6);
    }
    if (b.ripostable) this._tip('riposte', `it's open — ${this._btn('light')}!`, 3);
    if (p.alive && p.hp / p.maxHp < .55 && p.flasks > 0 && !f.mods.noHeal) this._tip('heal', `${this._btn('heal')} to drink dew — away from the boss`);
    if (p.stamina <= 1) this._tip('stamina', 'out of breath — back off a moment');
  }

  _facing(b) {
    const c = this.R.camera; c.getWorldDirection(this._v);
    const dx = b.x - c.position.x, dz = b.z - c.position.z, d = Math.hypot(dx, dz);
    return (dx * this._v.x + dz * this._v.z) / Math.max(d, 1e-3) > .55;
  }

  _distShake(e, amt) {
    const p = this.fight?.player ?? this.walker;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    this.cam.shake(amt * Math.max(0, 1 - d / 22));
  }

  _rumble(strong, weak, ms) {
    if (!this.save.settings.vibration) return;
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected);
    if (gp?.vibrationActuator?.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => {});
    else if (this.input.device === 'touch') navigator.vibrate?.(Math.min(ms, 120));
  }

  _outcome(result) {
    this.phase = 'outcome';
    this.outcomeT = 0;
    this.ui.showHud(true, { boss: false, controls: false });
    const f = this.fight, def = this.fightDef, w = this.world;
    this.input.releasePointer();
    if (result === 'lost') {
      this.save.died();
      this.music.stop(2.5);
      setTimeout(() => {
        this.sfx('died');
        const by = KILLED_BY[f.player.lastHitBy] ?? 'the boss';
        this.ui.banner('YOU CROAKED', `${def.name.toLowerCase()} · ${by} · attempt ${this.attempt}`, 'death');
        setTimeout(() => this._deathMenu(), 1600);
      }, 1100);
      return;
    }
    const first = this.save.clear(this.fightId, f.time);
    const flies = flyReward(def, w, first, this.save.d.ng);
    this.pendingFlies = flies;
    setTimeout(() => {
      this.sfx('victory');
      this.music.stop(3);
      this.ui.banner(def.world ? 'WORLD CLEARED' : 'VANQUISHED', `${def.name.toLowerCase()} · ${fmtTime(f.time)}${first ? '' : ' · again'}`, 'win');
      this.fx.flySwarm({ x: f.boss.x, y: f.boss.height * .5, z: f.boss.z }, Math.min(90, 20 + flies / 12), () => ({ x: f.player.x, y: 0, z: f.player.z }));
      this.sfx('flies', { pos: f.boss });
      setTimeout(() => { this.save.addFlies(flies); this.ui.toast(`+${flies.toLocaleString()} flies`); this.sfx('buy'); }, 1400);
      if (first && def.reward?.weapon && this.save.unlockWeapon(def.reward.weapon)) {
        const wpn = WEAPONS[def.reward.weapon];
        setTimeout(() => this.ui.toast(`${wpn.name} — ${wpn.desc.toLowerCase()}`, 4.5), 2600);
      }
    }, 1500);
  }

  _deathMenu() {
    const m = this.ui.openMenu({
      cls: 'death', items: [
        { label: 'try again', action: () => { this.ui.closeMenu(); this.ui.hideBanner(); this.startFight(this.fightId); } },
        { label: 'retreat', action: () => { this.ui.closeMenu(); this.ui.hideBanner(); this.travel(() => this.enterWorld(this.world)); } },
      ],
      onBack: () => {},
    });
    void m;
  }

  _afterWin() {
    const def = this.fightDef;
    this.ui.hideBanner();
    if (def.reward?.ending && this.save.d.cleared[this.fightId] === 1) { this.showEnding(); return; }
    this.travel(() => this.enterWorld(this.world));
  }

  // ── walking around (hub and worlds) ───────────────────────────────────────
  _walkFrame(dt) {
    const w = this.walker;
    const intent = this._intent(!this.ui.menuOpen && !this.busy);
    intent.lock = false;
    w.update(dt, intent, null);
    const lim = 19.2 - w.radius, d = Math.hypot(w.x, w.z);
    if (d > lim) { w.x *= lim / d; w.z *= lim / d; }
    // don't walk through the toad
    if (this.state === 'hub') {
      const tx = 0, tz = -8.5, td = Math.hypot(w.x - tx, w.z - tz);
      if (td < 2.2) { w.x = tx + (w.x - tx) / td * 2.2; w.z = tz + (w.z - tz) / td * 2.2; }
    }
    this.sandbox.time += dt;
    for (const e of this.sandbox.drain()) {
      if (e.type === 'swing') this.sfx('whoosh', { pos: w, heavy: e.heavy });
      if (e.type === 'roll') { this.sfx('roll', { pos: w }); this.fx.dust(w.x, w.z, 8, .5); }
      if (e.type === 'flaskStart') this.sfx('flask', { pos: w });
      if (e.type === 'healed') this.fx.heal(w.x, 1.3, w.z);
    }
    w.flasks = w.maxFlasks;           // no fights here; the dew refills itself
    this.playerView.update(dt, w, false);
    this._footsteps(dt, w);

    // nearest interactable
    let near = null, nd = 1e9;
    for (const g of this.gates) {
      const dd = Math.hypot(w.x - g.x, w.z - g.z);
      g.visual?.update(dt, this.t, dd < g.r);
      if (dd < g.r && dd < nd) { nd = dd; near = g; }
    }
    const k = KEY[this.input.device] ?? KEY.kb;
    this.ui.prompt(near && !this.ui.menuOpen ? { key: k.interact, text: near.label, sub: near.sub, locked: near.locked } : null);
    if (near && this.input.took('interact') && !this.busy && !this.ui.menuOpen) {
      if (near.locked) { this.sfx('deny'); this.ui.toast(near.sub); }
      else { this.sfx('uiOk'); near.action(); }
    }
  }

  // ── the Old Toad ──────────────────────────────────────────────────────────
  openShop(line) {
    this.input.releasePointer();
    this.input.menuMode = true;
    const S = this.save, L = S.d.levels;
    const say = line ?? pick(TOAD_LINES.greet);
    const stats = () => {
      const w = new PlayerSim(new Sandbox(), S.stats());
      return `<p>“${say}”</p><br><p>HP <b>${w.maxHp}</b> · STAMINA <b>${w.maxStamina}</b></p><p>DAMAGE <b>${Math.round(w.dmgMult * 100)}%</b> · DEW <b>${w.maxFlasks}</b> × <b>${Math.round(w.flaskHeal * 100)}%</b></p><p>LEVEL <b>${totalLevels(L)}</b></p><br><p>FLIES <b>${S.d.flies.toLocaleString()}</b></p>`;
    };
    const items = () => {
      const cost = levelCost(totalLevels(L));
      const list = [{ html: 'grow stronger' , cls: 'head' }];
      for (const s of STATS) {
        const lv = L[s.id], maxed = lv >= s.max;
        list.push({ label: `${s.name}  ${lv}`, sub: s.desc, value: maxed ? '<b>max</b>' : `<span class="cost">${cost.toLocaleString()}</span>`,
          disabled: maxed || S.d.flies < cost, action: () => this._buy(s.id) });
      }
      list.push({ html: 'weapons' });
      for (const id of WEAPON_ORDER) {
        const wpn = WEAPONS[id], owned = S.d.weapons.includes(id), eq = S.d.weapon === id;
        list.push({ label: wpn.name, sub: owned ? wpn.desc : 'somebody else has this one', cls: eq ? 'equipped' : owned ? 'owned' : '', disabled: !owned,
          value: eq ? '<b>equipped</b>' : '', action: () => { S.equip(id); this.sfx('uiOk'); this.openShop(pick(TOAD_LINES.equip)); } });
      }
      list.push({ label: 'leave', action: () => this.closeMenu() });
      return list;
    };
    this.ui.openMenu({ cls: 'shop', kicker: 'the lily', title: 'The Old Toad', side: stats(), items: items(),
      onBack: () => this.closeMenu(), onDenied: (it) => { this.sfx('deny'); if (it.label && !it.label.startsWith('THE') && S.d.flies < levelCost(totalLevels(L))) this.openShop(pick(TOAD_LINES.poor)); } });
  }

  _buy(id) {
    const S = this.save, L = S.d.levels;
    const s = STATS.find((x) => x.id === id);
    if (L[id] >= s.max) { this.sfx('deny'); return this.openShop(pick(TOAD_LINES.max)); }
    const cost = levelCost(totalLevels(L));
    if (!S.spend(cost)) { this.sfx('deny'); return this.openShop(pick(TOAD_LINES.poor)); }
    L[id] += 1;
    S.write();
    this.sfx('buy');
    this.walker?.applyStats(S.stats());
    if (this.walker) { this.walker.hp = this.walker.maxHp; this.walker.stamina = this.walker.maxStamina; }
    this.openShop(pick(TOAD_LINES.buy));
  }

  closeMenu() { this.ui.closeMenu(); this.input.menuMode = false; this.paused = false; }

  // ── title, pause, settings, controls, ending ──────────────────────────────
  showTitle() {
    this.state = 'title';
    this.ui.showTitle(true);
    this.ui.showHud(false);
    this.input.menuMode = true;
    const has = this.save.exists;
    this.ui.openMenu({ cls: 'title', items: [
      ...(has ? [{ label: 'continue', sub: `${this._progressLine()}`, action: () => this._start(false) }] : []),
      { label: 'new game', sub: has ? 'starts over — keeps your settings' : 'a small knight, a large problem', action: () => (has ? this._confirmNew() : this._start(true)) },
      { label: 'settings', action: () => this.openSettings(() => this.showTitle()) },
      { label: 'controls', action: () => this.openControls(() => this.showTitle()) },
    ], onBack: () => {} });
  }

  _progressLine() {
    const n = Object.keys(this.save.d.cleared).length;
    return `${n} / 25 bosses · ${this.save.d.deaths} deaths · ${fmtTime(this.save.d.playtime)}${this.save.d.ng ? ` · NG+${this.save.d.ng}` : ''}`;
  }

  _confirmNew() {
    this.ui.openMenu({ kicker: 'new game', title: 'Start over?', lead: 'Your flies, levels, weapons and cleared bosses will be gone. The pond will not remember you.', items: [
      { label: 'yes, start over', action: () => this._start(true) },
      { label: 'no', action: () => this.showTitle() },
    ], onBack: () => this.showTitle() });
  }

  _start(fresh) {
    if (fresh) this.save.newGame();
    this.ui.showTitle(false);
    this.closeMenu();
    this.travel(() => {
      this.enterHub();
      if (!this.save.d.seenHelp) {
        this.save.d.seenHelp = true; this.save.write();
        setTimeout(() => this.ui.toast(this.input.device === 'touch' ? 'left thumb moves · drag right to look · walk to a portal' : this.input.device === 'pad' ? 'walk to a portal and press A' : 'WASD to move · mouse to look · E at a portal', 5), 3800);
      }
    });
  }

  togglePause() {
    if (this.ui.menuOpen) { if (this.paused) this.closeMenu(); return; }
    if (this.state === 'title' || this.busy) return;
    if (this.state === 'fight' && this.phase !== 'combat') return;
    this.paused = true;
    this.input.menuMode = true;
    this.input.releasePointer();
    const inFight = this.state === 'fight';
    this.ui.openMenu({ kicker: inFight ? this.fightDef.name : (this.world?.name ?? 'the lily'), title: 'Paused', items: [
      { label: 'resume', action: () => this.closeMenu() },
      { label: 'settings', action: () => this.openSettings(() => { this.closeMenu(); this.togglePause(); }) },
      { label: 'controls', action: () => this.openControls(() => { this.closeMenu(); this.togglePause(); }) },
      ...(inFight ? [{ label: 'retreat', sub: 'leave this fight', action: () => { this.closeMenu(); this.travel(() => this.enterWorld(this.world)); } }] : []),
      ...(this.state === 'world' ? [{ label: 'return to the lily', action: () => { this.closeMenu(); this.travel(() => this.enterHub()); } }] : []),
      { label: 'quit to title', action: () => { this.closeMenu(); this.travel(() => { this.enterHub({ title: true }); this.showTitle(); }); } },
    ], onBack: () => this.closeMenu() });
  }

  openSettings(back) {
    const S = this.save;
    const set = (k, v) => {
      S.setSetting(k, v);
      if (k === 'master' || k === 'music' || k === 'sfx') this.audio.setVolumes({ [k]: v });
      if (k === 'sens') this.input.sens = v;
      if (k === 'invertY') this.input.invertY = v;
      if (k === 'quality') this.R.setQuality(v);
    };
    this.ui.openMenu({ kicker: 'settings', title: 'Settings', items: [
      { label: 'master volume', slider: true, min: 0, max: 1, step: .05, get: () => S.settings.master, set: (v) => set('master', v) },
      { label: 'music', slider: true, min: 0, max: 1, step: .05, get: () => S.settings.music, set: (v) => set('music', v) },
      { label: 'effects', slider: true, min: 0, max: 1, step: .05, get: () => S.settings.sfx, set: (v) => { set('sfx', v); this.sfx('uiMove'); } },
      { label: 'camera speed', slider: true, min: .3, max: 2.5, step: .1, get: () => S.settings.sens, set: (v) => set('sens', v), fmt: (v) => v.toFixed(1) + '×' },
      { label: 'invert camera y', toggle: true, get: () => S.settings.invertY, set: (v) => set('invertY', v) },
      { label: 'graphics', choice: true, options: ['auto', 'low', 'medium', 'high'], get: () => S.settings.quality, set: (v) => set('quality', v) },
      { label: 'vibration', toggle: true, get: () => S.settings.vibration, set: (v) => set('vibration', v) },
      { label: 'combat tips', toggle: true, get: () => S.settings.hints !== false, set: (v) => { set('hints', v); if (v) S.d.tips = {}; } },
      { label: 'erase save', sub: 'everything but these settings', action: () => this._confirmErase(back) },
      { label: 'back', action: back },
    ], onBack: back });
  }

  _confirmErase(back) {
    this.ui.openMenu({ kicker: 'erase save', title: 'Erase everything?', lead: 'Flies, levels, weapons, cleared bosses. This cannot be undone.', items: [
      { label: 'erase', action: () => { this.save.newGame(); this.save.exists = false; this.sfx('died'); this.travel(() => { this.enterHub({ title: true }); this.showTitle(); }); } },
      { label: 'keep it', action: () => this.openSettings(back) },
    ], onBack: () => this.openSettings(back) });
  }

  openControls(back) {
    const d = this.input.device;
    const rows = d === 'pad'
      ? [['move / look', 'left stick / right stick'], ['light · heavy', 'R1 · R2'], ['block · parry', 'L1 (hold) · L2'], ['roll · sprint', 'B tap · B hold'], ['heal', 'X'], ['lock on', 'R3 or Y'], ['interact', 'A'], ['pause', 'start']]
      : d === 'touch'
        ? [['move', 'left thumb — push to the edge to sprint'], ['look', 'drag the right side'], ['attack', 'ATK · HEAVY'], ['defend', 'BLOCK (hold) · PARRY · ROLL'], ['heal', 'HEAL'], ['lock on', 'LOCK'], ['interact', 'the gold button'], ['pause', 'II']]
        : [['move / look', 'WASD / mouse'], ['light · heavy', 'left click · F'], ['block · parry', 'right click (hold) · C'], ['roll · sprint', 'space · shift'], ['heal', 'R'], ['lock on', 'Q or middle click'], ['interact', 'E'], ['pause', 'esc']];
    this.ui.openMenu({ kicker: 'controls', title: 'How to not croak',
      lead: 'Parry opens a boss for a riposte — walk in and attack. Rolling has invincibility; timing matters more than distance. Glowing bosses are about to swing. Red glow can\'t be blocked.',
      items: [...rows.map(([a, b]) => ({ html: `<b style="color:var(--ink);font-weight:500">${a}</b> — ${b}` })), { label: 'back', action: back }], onBack: back });
  }

  showEnding() {
    this.input.menuMode = true;
    this.input.releasePointer();
    this.music.play('title');
    const d = this.save.d;
    this.ui.openMenu({ kicker: 'the server farm is quiet', title: 'It Is Fine Now',
      lead: `The last error is cleared. The pond is still there. So are you. ${d.deaths} deaths, ${fmtTime(d.playtime)}, ${d.totalFlies.toLocaleString()} flies eaten by a toad.`,
      side: '<p>FROGSOULS</p><p>design, code, sound — made together with Claude</p><p>no real people were harmed. several fake ones were.</p>',
      items: [
        { label: 'new game +', sub: 'everything harder · keep your levels and weapons', action: () => { this.save.newGamePlus(); this.closeMenu(); this.travel(() => this.enterHub()); } },
        { label: 'back to the lily', action: () => { this.closeMenu(); this.travel(() => this.enterHub()); } },
      ], onBack: () => {} });
  }

  // ── the frame ─────────────────────────────────────────────────────────────
  frame(dt) {
    this.t += dt;
    this.input.update(dt);
    this.ui.setDevice(this.input.device);
    if (this.state !== 'title' && this.state !== 'boot') this.save.tick(dt);

    if (this.ui.menuOpen) {
      this.ui.menu.handle(this.input, (n) => this.sfx(n));
    } else if (this.input.took('pause')) this.togglePause();

    const frozen = this.paused;
    const gdt = frozen ? 0 : dt;
    if (this.state === 'fight' && this.fight) this._fightFrame(gdt);
    else if (this.walker) {
      if (this.state === 'title') {
        this.walker.update(gdt, EMPTY_INTENT, null);
        this.playerView.update(gdt, this.walker, false);
      } else this._walkFrame(gdt);
    }

    // camera
    const p = this.fight?.player ?? this.walker;
    const look = this.input.consumeLook();
    if (this.state === 'title') {
      this.cam.mode = 'free';
      this.cam.yaw += dt * .06;
      this.cam.pitch = .18;
      this.cam.update(dt, p, null, { x: 0, y: 0 });
    } else {
      const b = this.fight?.boss;
      const lock = this.state === 'fight' && this.phase === 'combat' && this.lockOn && b?.alive ? b : null;
      this.cam.update(dt, p, lock, frozen ? { x: 0, y: 0 } : look, { touchFollow: this.input.device === 'touch' && this.input.touch.look == null });
    }
    this.cam.bounds = this.state === 'fight' ? 22 : 24;
    // on touch the buttons cover the right third: slide the picture left a little
    this.R.setViewShift(this.input.device === 'touch' && this.state !== 'title' ? .07 : 0);
    const c = this.R.camera;
    this.audio.listener = { x: c.position.x, z: c.position.z, yaw: Math.atan2(this.cam.look.x - c.position.x, this.cam.look.z - c.position.z) };

    // world
    this.fx.update(gdt * (this.hitstop > 0 ? .15 : 1));
    this.fx.setScale(this.R.pointScale);
    this.stage.update(dt, c, { pointScale: this.R.pointScale });

    // HUD
    if (p && this.state !== 'title') {
      const b = this.fight?.boss;
      let reticle = null, say = null, boss = null;
      if (b && this.state === 'fight') {
        const hud = this.fight.bossHud();
        boss = { name: this.fightDef.name, epithet: this.fightDef.epithet, hpFrac: b.hpFrac, label: hud?.label, danger: hud?.danger };
        if (this.lockOn && b.alive && this.phase === 'combat') reticle = this._screen(b.x, b.y + b.height * .55, b.z);
        if (b.say && b.alive) { const s = this._screen(b.x, b.y + b.height * 1.08, b.z); if (s) say = { text: b.say.text, ...s }; }
      }
      this.ui.updateHud(dt, { hp: p.hp, maxHp: p.maxHp, stamina: p.stamina, maxStamina: p.maxStamina, flasks: p.flasks, flies: this.save.d.flies,
        noHeal: this.fight?.mods.noHeal, boss, reticle, say });
    }

    this.R.render(dt, this.stage);
    this.input.endFrame();
  }

  _screen(x, y, z) {
    const v = this._v.set(x, y, z).project(this.R.camera);
    if (v.z > 1) return null;
    return { x: (v.x * .5 + .5) * this.R.w, y: (-v.y * .5 + .5) * this.R.h };
  }
}

function fmtTime(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
}
