import * as THREE from 'three';

// Placeholder arena: a fogged stone ring. Swap for a modelled GLB later —
// gameplay only reads ARENA.radius and the flat ground plane at y=0.

export const ARENA = { radius: 21 };

export function buildArena(scene) {
  scene.fog = new THREE.FogExp2(0x14161c, 0.020);
  scene.background = new THREE.Color(0x14161c);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA.radius + 2, 64),
    new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 1, metalness: 0, flatShading: true }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // faint concentric flagstones so movement reads
  for (let i = 1; i <= 5; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(i * 3.6, i * 3.6 + 0.07, 96),
      new THREE.MeshBasicMaterial({ color: 0x5a544a, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012;
    scene.add(ring);
  }

  // boundary pillars
  const pillarGeo = new THREE.BoxGeometry(1.15, 7.5, 1.15);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3b3733, roughness: .95, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(Math.sin(a) * (ARENA.radius + 1.6), 3.4 + Math.random() * 1.2, Math.cos(a) * (ARENA.radius + 1.6));
    p.rotation.y = a + (Math.random() - .5) * .3;
    p.castShadow = true;
    scene.add(p);
  }

  scene.add(new THREE.HemisphereLight(0x5d6b8a, 0x2a231b, 1.15));

  const key = new THREE.DirectionalLight(0xffe9c4, 2.5);
  key.position.set(11, 18, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const d = 26;
  key.shadow.camera.left = -d; key.shadow.camera.right = d;
  key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0012;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6f93cc, 1.25);
  rim.position.set(-9, 6, -12);
  scene.add(rim);

  return { ground };
}

/** Keep an actor inside the ring. */
export function clampToArena(pos, radius) {
  const d = Math.hypot(pos.x, pos.z);
  const max = ARENA.radius - radius;
  if (d > max) { pos.x = pos.x / d * max; pos.z = pos.z / d * max; }
  pos.y = 0;
}
