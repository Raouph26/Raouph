import * as THREE from 'three';

// One stage, relit per world. Geometry never changes between looks — that's
// what keeps six palettes reading as one game.

export const ARENA = { radius: 21 };

export function buildArena(scene) {
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3a3732, roughness: 1, metalness: 0, flatShading: true });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA.radius + 2, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // the flagstone rings are the constant across every world
  const rings = new THREE.Group();
  for (let i = 1; i <= 5; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(i * 3.6, i * 3.6 + 0.07, 96),
      new THREE.MeshBasicMaterial({ color: 0x8a8274, transparent: true, opacity: 0.35 }));
    r.rotation.x = -Math.PI / 2; r.position.y = 0.012;
    rings.add(r);
  }
  scene.add(rings);

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x3b3733, roughness: .95, flatShading: true });
  const pillarGeo = new THREE.BoxGeometry(1.15, 7.5, 1.15);
  const pillars = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(Math.sin(a) * (ARENA.radius + 1.6),
                   3.4 + ((i * 37) % 100) / 100 * 1.2,
                   Math.cos(a) * (ARENA.radius + 1.6));
    p.rotation.y = a;
    p.castShadow = true; p.receiveShadow = true;
    pillars.add(p);
  }
  scene.add(pillars);

  const hemi = new THREE.HemisphereLight(0x5d6b8a, 0x2a231b, 1.15);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe9c4, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  const sc = key.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.far = 80;
  key.shadow.bias = -0.0012;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6f93cc, 1.25);
  scene.add(rim);

  return { ground, rings, pillars, groundMat, pillarMat, hemi, key, rim };
}

export function clampToArena(pos, radius) {
  const d = Math.hypot(pos.x, pos.z);
  const max = ARENA.radius - radius;
  if (d > max) { pos.x = pos.x / d * max; pos.z = pos.z / d * max; }
  pos.y = 0;
}
