import * as THREE from 'three';
import { buildFrog } from '../src/render/kit/frog.js';
import { buildWeapon } from '../src/render/kit/weapons.js';
import { applyPose } from '../src/render/kit/rig.js';
import { REST, READY, GUARD, ATTACKS, ACT, BOSS } from '../src/render/anim/clips.js';

const q = new URLSearchParams(location.search);
const set = q.get('set') ?? 'player';
const view = q.get('view') ?? 'front';     // front | side | back
const weaponId = q.get('w') ?? 'cleaver';

const entries = [];
if (set === 'player') {
  entries.push(['REST', REST], ['READY', READY], ['GUARD', GUARD]);
  for (const k of ['slashR', 'slashL', 'thrust', 'overhead']) entries.push([k + ' peak', ATTACKS[k].peak], [k + ' strike', ATTACKS[k].strike]);
} else if (set === 'player2') {
  for (const k of ['lungeThrust', 'runSlash', 'hammerR', 'hammerL', 'slam', 'spearPoke']) entries.push([k + ' peak', ATTACKS[k].peak], [k + ' strike', ATTACKS[k].strike]);
} else if (set === 'act') {
  for (const k of Object.keys(ACT)) entries.push([k, ACT[k]]);
} else if (set === 'boss') {
  for (const k of ['sweep', 'stomp', 'leap', 'charge', 'throw', 'cast']) entries.push([k + ' peak', BOSS[k].peak], [k + ' strike', BOSS[k].strike]);
} else if (set === 'boss2') {
  for (const k of ['type', 'flash', 'pincer', 'scuttle', 'stance', 'wipe', 'roar']) entries.push([k + ' peak', BOSS[k].peak], [k + ' strike', BOSS[k].strike]);
  entries.push(['leap air', BOSS.leap.air]);
}

const cols = Math.min(entries.length, +(q.get('cols') ?? 6));
const rows = Math.ceil(entries.length / cols);
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2f36);
scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x3a3228, 1.7));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.2); sun.position.set(6, 10, 8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 20, bottom: -20, far: 400 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 60), new THREE.MeshStandardMaterial({ color: 0x3a3f46 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const yaw = view === 'side' ? Math.PI / 2 : view === 'back' ? Math.PI : view === 'top' ? 0 : 0.5;
entries.forEach(([name, p], i) => {
  const f = buildFrog(q.get('variant') ?? 'hero');
  const wpn = buildWeapon(weaponId, f.material);
  f.rig.joints.socket.add(wpn);
  applyPose(f.rig, p);
  f.rig.root.position.set(i * 12 - 100, 0, 0);
  f.rig.root.rotation.y = yaw;
  scene.add(f.rig.root);
  entries[i].push(f);
});
const cw = W / cols, ch = H / rows;
const cam = new THREE.PerspectiveCamera(34, cw / ch, .1, 100);
const lab = document.getElementById('labels');
entries.forEach((e, i) => {
  const f = e[2], c = i % cols, r = Math.floor(i / cols);
  const x = f.rig.root.position.x;
  cam.position.set(x, 1.35, 4.3);
  if (view === 'top') cam.position.set(x, 5, .01);
  cam.lookAt(x, .85, 0);
  cam.updateProjectionMatrix();
  const vy = H - (r + 1) * ch;
  renderer.setViewport(c * cw, vy, cw, ch);
  renderer.setScissor(c * cw + 1, vy + 1, cw - 2, ch - 2);
  renderer.render(scene, cam);
  const d = document.createElement('div');
  d.textContent = e[0];
  d.style.left = (c * cw + cw / 2) + 'px'; d.style.top = (r * ch + 6) + 'px';
  lab.appendChild(d);
});
window.__ready = true;
