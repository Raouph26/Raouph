import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER RIG.
// Blocky stand-in bodies with named joints, driven procedurally so combat can
// be tuned before any art exists. Every part is a named node, so a real rigged
// GLB drops in later by matching the joint names (see ASSETS.md) — nothing in
// the combat code reads geometry, only these transforms.
// ─────────────────────────────────────────────────────────────────────────────

const box = (w, h, d, color) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: .04, flatShading: true }));

/** Pivot helper: a box whose top edge sits at the origin, so it swings from the joint. */
function limb(w, h, d, color) {
  const g = new THREE.Group();
  const m = box(w, h, d, color);
  m.position.y = -h / 2;
  m.castShadow = true;
  g.add(m);
  g.userData.mesh = m;
  return g;
}

export function buildActor({ scale = 1, skin = 0x5c7a45, cloth = 0x2b2f2a, accent = 0x8fae4b }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.92;
  body.add(pelvis);

  const torso = box(0.62, 0.72, 0.42, cloth);
  torso.position.y = 0.36; torso.castShadow = true;
  pelvis.add(torso);

  const chest = new THREE.Group();
  chest.position.y = 0.72;
  pelvis.add(chest);

  const head = new THREE.Group();
  chest.add(head);
  const skull = box(0.46, 0.38, 0.44, skin);
  skull.position.y = 0.2; skull.castShadow = true;
  head.add(skull);
  // frog eyes — two domes riding high and wide on the skull
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xe9e5d6, roughness: .5, flatShading: true }));
    eye.position.set(s * 0.16, 0.38, 0.06);
    head.add(eye);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: .4 }));
    pupil.position.set(s * 0.16, 0.39, 0.15);
    head.add(pupil);
  }

  const armL = limb(0.19, 0.62, 0.19, skin); armL.position.set(-0.38, 0.6, 0);
  const armR = limb(0.19, 0.62, 0.19, skin); armR.position.set( 0.38, 0.6, 0);
  pelvis.add(armL, armR);

  const legL = limb(0.22, 0.86, 0.24, cloth); legL.position.set(-0.17, 0.02, 0);
  const legR = limb(0.22, 0.86, 0.24, cloth); legR.position.set( 0.17, 0.02, 0);
  pelvis.add(legL, legR);

  // Weapon socket, parented to the right hand.
  const hand = new THREE.Group();
  hand.position.y = -0.62;
  armR.add(hand);

  const weapon = new THREE.Group();
  hand.add(weapon);

  root.userData.rig = { body, pelvis, torso, chest, head, armL, armR, legL, legR, hand, weapon };
  root.userData.accent = accent;
  return root;
}

export function buildWeaponMesh(kind, accent) {
  const g = new THREE.Group();
  const mat = (c, r = .7, m = .25) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true });

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.30, 0.08), mat(0x241c15, .95, 0));
  grip.position.y = -0.10;
  g.add(grip);

  let blade;
  if (kind === 'rapier') {
    blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.55, 0.05), mat(0xb9c4cc, .35, .7));
    blade.position.y = -1.02;
  } else if (kind === 'maul') {
    const haft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.35, 0.09), mat(0x2f2519, .95, 0));
    haft.position.y = -0.92; g.add(haft);
    blade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.34), mat(0x6e6a63, .8, .35));
    blade.position.y = -1.62;
  } else { // cleaver
    blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.15, 0.06), mat(0xa8b0b4, .45, .6));
    blade.position.y = -0.85;
  }
  blade.castShadow = true;
  g.add(blade);

  const band = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.13), mat(accent, .5, .3));
  band.position.y = -0.26;
  g.add(band);

  // Tip marker — combat reads the hitbox from this node's world position.
  const tip = new THREE.Object3D();
  tip.position.y = kind === 'maul' ? -1.62 : (kind === 'rapier' ? -1.78 : -1.42);
  g.add(tip);
  g.userData.tip = tip;

  g.rotation.x = Math.PI; // point the blade away from the hand
  return g;
}
