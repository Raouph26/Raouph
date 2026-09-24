import * as THREE from 'three';
import { LOOKS } from './looks.js';

// A walkable space with gates. Step onto a gate and hold for a beat to enter —
// no button, because a button is one more thing to find on a phone.

const DWELL = 0.7;

export function applyLook(scene, renderer, lights, lookKey) {
  const L = LOOKS[lookKey] ?? LOOKS.ashen;
  scene.fog = new THREE.FogExp2(L.fogCol, L.fog);
  scene.background = new THREE.Color(L.bg);
  renderer.toneMappingExposure = L.exposure;

  lights.hemi.intensity = L.amb;
  lights.hemi.color.setHex(L.ambSky);
  lights.hemi.groundColor.setHex(L.ambGnd);

  const a = L.sun * Math.PI / 180, e = L.ele * Math.PI / 180;
  lights.key.intensity = L.key;
  lights.key.color.setHex(L.keyCol);
  lights.key.position.set(Math.sin(a) * Math.cos(e) * 24, Math.sin(e) * 24 + 2,
                          Math.cos(a) * Math.cos(e) * 24);
  lights.rim.intensity = L.rim;
  lights.rim.color.setHex(L.rimCol);
  lights.rim.position.set(-Math.sin(a) * 15, 7, -Math.cos(a) * 15);

  lights.groundMat.color.setHex(L.ground);
  lights.pillarMat.color.setHex(L.pillar);
  return L;
}

export class Gate {
  constructor(scene, { position, label, sub, tint = 0xd9a441, locked = false, cleared = false, payload }) {
    this.label = label; this.sub = sub; this.payload = payload;
    this.locked = locked; this.cleared = cleared;
    this.position = position.clone();
    this.dwell = 0;
    this.near = false;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    const col = locked ? 0x6b6f78 : (cleared ? 0x74856d : tint);
    this.col = col;

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: col, roughness: .7, metalness: .1,
        emissive: col, emissiveIntensity: locked ? 0.14 : 0.28, flatShading: true }));
    pad.position.y = 0.06; pad.receiveShadow = true;
    this.group.add(pad);
    this.pad = pad;

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.25, 2.45, 48),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .55,
        side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.14;
    this.group.add(this.ring);

    // fill ring that sweeps round as you stand on it
    this.fill = new THREE.Mesh(
      new THREE.RingGeometry(2.25, 2.62, 48, 1, -Math.PI / 2, 0.001),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9,
        side: THREE.DoubleSide }));
    this.fill.rotation.x = -Math.PI / 2; this.fill.position.y = 0.16;
    this.group.add(this.fill);

    // a standing marker so gates read from across the space
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, cleared ? 1.6 : 4.4, 0.3),
      new THREE.MeshStandardMaterial({ color: col, roughness: .6,
        emissive: col, emissiveIntensity: locked ? 0.18 : 0.45, flatShading: true }));
    mast.position.y = (cleared ? 1.6 : 4.4) / 2;
    mast.castShadow = true;
    this.group.add(mast);
    this.mast = mast;
  }

  update(dt, playerPos, t) {
    const d = Math.hypot(playerPos.x - this.position.x, playerPos.z - this.position.z);
    this.near = d < 2.35;

    if (this.near && !this.locked) this.dwell = Math.min(DWELL, this.dwell + dt);
    else this.dwell = Math.max(0, this.dwell - dt * 2.4);

    const k = this.dwell / DWELL;
    this.fill.geometry.dispose();
    this.fill.geometry = new THREE.RingGeometry(2.25, 2.62, 48, 1,
      -Math.PI / 2, Math.max(0.001, k * Math.PI * 2));
    this.fill.visible = k > 0.01;

    const pulse = 0.28 + Math.sin(t * 2.2 + this.position.x) * 0.1 + k * 0.9;
    if (!this.locked) {
      this.pad.material.emissiveIntensity = pulse;
      this.mast.material.emissiveIntensity = 0.45 + k * 1.2;
    }
    this.ring.material.opacity = 0.4 + (this.near ? 0.45 : 0) + k * 0.3;

    return this.dwell >= DWELL;
  }

  dispose(scene) { scene.remove(this.group); }
}
