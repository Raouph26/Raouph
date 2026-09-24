import * as THREE from 'three';
import { Renderer } from '../src/render/renderer.js';
import { Stage } from '../src/render/stage.js';
import { buildFrog } from '../src/render/kit/frog.js';
import { buildWeapon } from '../src/render/kit/weapons.js';
import { buildBoss } from '../src/render/kit/boss.js';
import { applyPose } from '../src/render/kit/rig.js';
import { READY, BOSS_READY } from '../src/render/anim/clips.js';
import { BOSSES } from '../src/content/bosses.js';
import { WORLDS } from '../src/content/worlds.js';
import { Gate } from '../src/render/env/props.js';

const q = new URLSearchParams(location.search);
const env = q.get('env') ?? 'pond';
const world = WORLDS.find((w) => w.env === env);
const R = new Renderer(document.getElementById('c'), q.get('q') ?? 'high');
const stage = new Stage(R.scene);
stage.setWorld(env);
stage.setLook(q.get('look') ?? world?.look ?? 'hub', true);

const frog = buildFrog('hero');
frog.rig.joints.socket.add(buildWeapon('cleaver', frog.material));
applyPose(frog.rig, READY);
frog.rig.root.position.set(0, 0, 5);
frog.rig.root.rotation.y = Math.PI;
R.scene.add(frog.rig.root);

const bossId = q.get('boss') ?? world?.bosses[0];
if (bossId) {
  const def = BOSSES[bossId];
  const b = buildBoss(def);
  if (b.rig) { applyPose(b.rig, b.kind === 'frog' ? READY : BOSS_READY); if (b.kind !== 'frog') b.root.scale.setScalar(.85 * def.scale); }
  b.root.position.set(0, 0, -3);
  R.scene.add(b.root);
}
if (env === 'hub') {
  WORLDS.forEach((w, i) => {
    const a = (i / 5) * Math.PI * 2 + Math.PI;
    new Gate(stage.envGroup, { x: Math.sin(a) * 15.5, z: Math.cos(a) * 15.5, yaw: a + Math.PI, color: w.tint, label: w.name, sub: '0 / 4', pips: 4, pipsLit: i === 0 ? 2 : 0, sealed: i > 1 });
  });
}
// a third-person view over the frog's shoulder toward the boss
const cam = R.camera;
cam.position.set(2.2, 3.1, 11.5);
cam.lookAt(0, 1.8, -2);
cam.userData.focus.set(0, 0, 1);
let t = 0;
const loop = () => {
  const dt = 1 / 60; t += dt;
  stage.update(dt, cam, { pointScale: R.pointScale });
  R.render(dt, stage);
};
for (let i = 0; i < 24; i++) loop();
window.__ready = true;
