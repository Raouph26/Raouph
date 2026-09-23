import * as THREE from 'three';
import { CAMERA } from './config.js';
import { Input } from './input.js';
import { CameraRig } from './cameraRig.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { Boss } from './boss.js';
import { buildArena, clampToArena, ARENA } from './arena.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.1, 400);

buildArena(scene);

const input = new Input(renderer.domElement);
const rig = new CameraRig(camera);
const fx = new FX(scene, rig, document.getElementById('flash'));
const hud = new HUD();

const player = new Player(scene, fx);
player.position.set(0, 0, 7);

let boss = new Boss(scene, fx);
const enemies = [boss];

const SPAWN = new THREE.Vector3(0, 0, 7);
let outcome = null;       // 'dead' | 'won' | null
let outcomeT = 0;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function resetFight() {
  scene.remove(boss.obj);
  boss = new Boss(scene, fx);
  enemies.length = 0; enemies.push(boss);
  player.respawn(SPAWN);
  rig.target = null;
  outcome = null; outcomeT = 0;
  hud.clearBanner();
  hud.resetGhosts();
  input.clear();
}

// Riposte: hit a staggered boss while close to execute it.
function tryRiposte() {
  if (!boss.open || !player.alive || player.busy) return false;
  if (player.position.distanceTo(boss.position) > boss.radius + 2.4) return false;
  player.riposte(boss);
  return true;
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 1 / 20);
  let dt = raw;

  // hitstop freezes simulation but not the camera or the UI
  if (fx.freeze > 0) { fx.freeze -= raw; dt = 0; }

  if (dt > 0) {
    if (input.take('lock')) rig.toggleLock(player, enemies);

    // riposte steals the light-attack input when the boss is open
    if (input.peek('light') && boss.open && !player.busy &&
        player.position.distanceTo(boss.position) <= boss.radius + 2.4) {
      input.take('light');
      tryRiposte();
    } else {
      player.handleInput(input, rig, enemies);
    }

    player.update(dt, input, rig, enemies);
    boss.update(dt, player);

    clampToArena(player.position, player.radius);
    clampToArena(boss.position, boss.radius);

    // soft body separation so they don't stand inside each other
    const dx = player.position.x - boss.position.x, dz = player.position.z - boss.position.z;
    const d = Math.hypot(dx, dz), min = player.radius + boss.radius * 0.85;
    if (d > 0.0001 && d < min) {
      const push = (min - d);
      player.position.x += dx / d * push;
      player.position.z += dz / d * push;
      clampToArena(player.position, player.radius);
    }

    if (!outcome) {
      if (!player.alive) { outcome = 'dead'; outcomeT = 0; hud.banner('YOU DIED', 'press R'); }
      else if (!boss.alive) { outcome = 'won'; outcomeT = 0; hud.banner('VICTORY', 'press R to fight again'); }
    } else {
      outcomeT += dt;
      if (input.take('retry') && outcomeT > 0.5) resetFight();
    }
    if (outcome !== 'dead' && input.take('retry')) resetFight();
  }

  rig.update(raw, player, input);
  fx.update(raw);
  hud.update(raw, player, boss, rig.reticle(innerWidth, innerHeight));

  input.endFrame(raw);
  renderer.render(scene, camera);
}

hud.banner('CLICK TO BEGIN', 'mouse lock required');
renderer.domElement.addEventListener('click', () => hud.clearBanner(), { once: true });
frame();

// debug handle for automated testing
window.__game = { get player(){return player;}, get boss(){return boss;}, get rig(){return rig;} };
