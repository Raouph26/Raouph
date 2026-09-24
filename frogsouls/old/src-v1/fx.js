import * as THREE from 'three';

// Hitstop, screen shake, flash and spark bursts — the feel layer.

export class FX {
  constructor(scene, cameraRig, flashEl) {
    this.scene = scene;
    this.rig = cameraRig;
    this.flashEl = flashEl;
    this.freeze = 0;
    this._flash = 0;

    const N = 220;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.13, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffd9a0,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._next = 0;
    this.N = N;
  }

  hitstop(s) { this.freeze = Math.max(this.freeze, s); }
  shake(a)   { this.rig.addShake(a); }
  flash(a)   { this._flash = Math.max(this._flash, a); }

  sparks(at, color = 0xffd9a0, n = 16) {
    this.mat.color.setHex(color);
    for (let i = 0; i < n; i++) {
      const j = this._next = (this._next + 1) % this.N;
      this.pos[j * 3] = at.x; this.pos[j * 3 + 1] = at.y; this.pos[j * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3;
      const s = 2.2 + Math.random() * 5.5;
      this.vel[j * 3] = Math.cos(a) * Math.cos(e) * s;
      this.vel[j * 3 + 1] = Math.sin(e) * s * 0.9 + 1.2;
      this.vel[j * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      this.life[j] = 0.42 + Math.random() * 0.3;
    }
  }

  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 22 * dt;
      this.pos[i * 3]     += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0 || this.pos[i * 3 + 1] < -1) { this.pos[i * 3 + 1] = -999; this.life[i] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true;

    if (this._flash > 0.001) {
      this._flash *= Math.exp(-9 * dt);
      this.flashEl.style.opacity = this._flash.toFixed(3);
    } else if (this.flashEl.style.opacity !== '0') this.flashEl.style.opacity = '0';
  }
}
