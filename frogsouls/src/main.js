import * as THREE from 'three';
import { CAMERA } from './config.js';
import { Input } from './input.js';
import { Touch } from './touch.js';
import { CameraRig } from './cameraRig.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { Boss } from './boss.js';
import { buildArena, clampToArena, ARENA } from './arena.js';
import { Gate, applyLook } from './zone.js';
import { WORLDS, worldById } from './content.js';
import { Save } from './save.js';

// ── renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 400);
const stageEl = document.getElementById('stage');

const lights = buildArena(scene);
const input = new Input(renderer.domElement);
const touch = new Touch(document.getElementById('ui'), input);
input.touch = touch;
const rig = new CameraRig(camera);
const fx = new FX(scene, rig, document.getElementById('flash'));
const hud = new HUD();

const player = new Player(scene, fx);
player.setWeapon(Save.weapon);
player.deaths = Save.deaths;

let mode = 'hub';       // 'hub' | 'world' | 'fight'
let gates = [];
let boss = null;
let currentWorld = null;
let currentFight = null;
let outcome = null, outcomeT = 0, transition = 0;
const enemies = [];

function resize() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));

// ── mode transitions ──────────────────────────────────────────────────────
function clearGates() { for (const g of gates) g.dispose(scene); gates = []; }
function clearBoss() {
  if (boss) { scene.remove(boss.obj); boss = null; }
  enemies.length = 0;
}

function setZoneCamera() { rig.distScale = 2.05; rig.heightScale = 2.5; rig.pitch = 0.46; }
function setFightCamera() { rig.distScale = 1; rig.heightScale = 1; }

function enterHub() {
  mode = 'hub'; setZoneCamera(); clearGates(); clearBoss();
  currentWorld = null; currentFight = null; outcome = null;
  applyLook(scene, renderer, lights, 'hub');
  lights.pillars.visible = true;

  WORLDS.forEach((w, i) => {
    const a = (i / WORLDS.length) * Math.PI * 2 - Math.PI / 2;
    const prev = i === 0 ? null : WORLDS[i - 1];
    const locked = prev ? !Save.worldDone(prev) : false;
    gates.push(new Gate(scene, {
      position: new THREE.Vector3(Math.cos(a) * 12.5, 0, Math.sin(a) * 12.5),
      label: w.name, sub: locked ? 'sealed' : w.blurb,
      tint: TINT[w.look], locked, cleared: Save.worldDone(w), payload: w,
    }));
  });

  player.position.set(0, 0, 0);
  player.velocity.set(0, 0, 0);
  player.hp = 100; player.stamina = 110; player.alive = true; player.enter('idle');
  rig.target = null;
  hud.setPlace('THE LILY', 'five ways down');
  hud.clearBanner(); hud.setCombat(false);
  transition = 0.55;
}

function enterWorld(w) {
  mode = 'world'; setZoneCamera(); clearGates(); clearBoss();
  currentWorld = w; currentFight = null; outcome = null;
  applyLook(scene, renderer, lights, w.look);
  lights.pillars.visible = true;

  w.bosses.forEach((bdef, i) => {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    gates.push(new Gate(scene, {
      position: new THREE.Vector3(Math.cos(a) * 11, 0, Math.sin(a) * 11),
      label: bdef.name, sub: bdef.epithet,
      tint: TINT[w.look], cleared: Save.isCleared(bdef.id), payload: bdef,
    }));
  });
  const unlocked = Save.worldUnlocked(w);
  gates.push(new Gate(scene, {
    position: new THREE.Vector3(0, 0, 0),
    label: w.boss.name, sub: unlocked ? w.boss.epithet : 'four must fall first',
    tint: 0xffffff, locked: !unlocked, cleared: Save.isCleared(w.boss.id), payload: w.boss,
  }));
  // exit back to the hub
  gates.push(new Gate(scene, {
    position: new THREE.Vector3(0, 0, 17),
    label: 'THE LILY', sub: 'go back up', tint: 0x7fd0c0, payload: '__hub',
  }));

  player.position.set(0, 0, 14);
  player.velocity.set(0, 0, 0);
  player.hp = 100; player.stamina = 110; player.alive = true; player.enter('idle');
  rig.target = null;
  hud.setPlace(w.name, w.blurb);
  hud.clearBanner(); hud.setCombat(false);
  transition = 0.55;
}

function enterFight(def) {
  mode = 'fight'; setFightCamera(); clearGates(); clearBoss();
  currentFight = def;
  applyLook(scene, renderer, lights, def.look ?? currentWorld.look);
  lights.pillars.visible = true;

  boss = new Boss(scene, fx, def);
  enemies.push(boss);

  player.position.set(0, 0, 9);
  player.velocity.set(0, 0, 0);
  player.hp = 100; player.stamina = 110; player.alive = true;
  player.iframes = 1.0; player.enter('idle');
  rig.target = boss;
  outcome = null; outcomeT = 0;
  hud.setPlace(def.name, def.epithet);
  hud.clearBanner(); hud.setCombat(true);
  hud.resetGhosts();
  input.clear();
  transition = 0.5;
}

const TINT = { ashen:0x8fa6c4, verdigris:0x53c9a6, bone:0xe8e0c8,
               sodium:0xffb257, ember:0xd1452e, silhouette:0xcfd8e2, hub:0x7fd0c0 };

// ── loop ──────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let t = 0;

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  let dt = raw;
  if (fx.freeze > 0) { fx.freeze -= raw; dt = 0; }
  t += raw;
  if (transition > 0) transition = Math.max(0, transition - raw);

  if (dt > 0) {
    if (input.take('lock')) rig.toggleLock(player, enemies);
    for (const [k, w] of [['w1','cleaver'],['w2','rapier'],['w3','maul']])
      if (input.peek(k)) { input.take(k); player.setWeapon(w); Save.setWeapon(w); }

    if (mode === 'fight') stepFight(dt);
    else stepZone(dt);
  }

  rig.update(raw, player, input);
  fx.update(raw);
  hud.update(raw, player, boss, rig.reticle(stageEl.clientWidth, stageEl.clientHeight), mode);
  input.endFrame(raw);
  renderer.render(scene, camera);
}

function stepZone(dt) {
  player.handleInput(input, rig, enemies);
  player.update(dt, input, rig, enemies);
  clampToArena(player.position, player.radius);

  let prompt = null;
  for (const g of gates) {
    const done = g.update(dt, player.position, t);
    if (g.near) prompt = g;
    if (done && transition === 0) {
      if (g.payload === '__hub') { enterHub(); return; }
      if (mode === 'hub') { enterWorld(g.payload); return; }
      enterFight({ ...g.payload, look: g.payload.look ?? currentWorld.look });
      return;
    }
  }
  hud.setPrompt(prompt);
}

function stepFight(dt) {
  player.handleInput(input, rig, enemies);

  // a light attack on a staggered boss becomes a riposte
  if (input.peek('light') && boss.open && !player.busy &&
      player.position.distanceTo(boss.position) <= boss.radius + 2.4) {
    input.take('light'); player.riposte(boss);
  }

  player.update(dt, input, rig, enemies);
  boss.update(dt, player);

  clampToArena(player.position, player.radius);
  clampToArena(boss.position, boss.radius);

  const dx = player.position.x - boss.position.x, dz = player.position.z - boss.position.z;
  const d = Math.hypot(dx, dz), min = player.radius + boss.radius * 0.85;
  if (d > 0.0001 && d < min) {
    player.position.x += dx / d * (min - d);
    player.position.z += dz / d * (min - d);
    clampToArena(player.position, player.radius);
  }

  if (!outcome) {
    if (!player.alive) {
      outcome = 'dead'; outcomeT = 0; Save.addDeath();
      hud.banner('YOU DIED', 'retry');
    } else if (!boss.alive) {
      outcome = 'won'; outcomeT = 0;
      Save.clear(currentFight.id);
      hud.banner(currentFight.isWorldBoss ? 'WORLD CLEARED' : 'VICTORY', currentFight.name);
    }
  } else {
    outcomeT += dt;
    if (outcomeT > 0.7 && (input.take('retry') || input.take('light'))) {
      if (outcome === 'dead') enterFight(currentFight);
      else enterWorld(currentWorld);
    }
    // after a win, drift back on its own if they do nothing
    if (outcome === 'won' && outcomeT > 5.5) enterWorld(currentWorld);
  }
}

// ── boot ──────────────────────────────────────────────────────────────────
resize();
enterHub();
frame();

document.getElementById('boot').classList.add('gone');
setTimeout(() => document.getElementById('boot')?.remove(), 700);

document.getElementById('resetBtn')?.addEventListener('click', () => {
  Save.reset(); player.deaths = 0; enterHub();
});

window.__game = { get player(){return player;}, get boss(){return boss;},
                  get mode(){return mode;}, enterFight, enterWorld, enterHub, WORLDS, Save };
