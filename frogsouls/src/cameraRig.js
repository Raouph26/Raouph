import * as THREE from 'three';
import { CAMERA as C } from './config.js';

// Souls camera: free orbit when unlocked, framed two-shot when locked on.
// Lock/unlock is a toggle; locking also picks the nearest valid target.

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;
    this.pitch = 0.22;
    this.target = null;            // locked enemy, or null
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this._t = 0;
    this._initialised = false;
  }

  addShake(a) { this.shake = Math.min(C.shake.max, this.shake + a); }

  toggleLock(player, enemies) {
    if (this.target) { this.target = null; return false; }
    let best = null, bestScore = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(player.position);
      if (d > C.lockRange) continue;
      // prefer things near the centre of the screen, then near the player
      _v.copy(e.position).sub(player.position).normalize();
      this.cam.getWorldDirection(_v2);
      const facing = 1 - _v.dot(_v2);
      const score = d * 0.35 + facing * 14;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    this.target = best;
    return !!this.target;
  }

  /** Direction the player should move relative to, on the ground plane. */
  basis(outFwd, outRight) {
    this.cam.getWorldDirection(_v);
    outFwd.set(_v.x, 0, _v.z).normalize();
    outRight.set(outFwd.z, 0, -outFwd.x);   // left-hand perpendicular
  }

  update(dt, player, input) {
    if (this.target && !this.target.alive) this.target = null;

    this.yaw   -= input.mouse.dx * C.mouseSens;
    this.pitch += input.mouse.dy * C.mouseSens;
    this.pitch = Math.max(C.pitchMin, Math.min(C.pitchMax, this.pitch));

    const focus = _v.copy(player.position); focus.y += C.lookAtHeight;

    let desired = _v2, lookAt = new THREE.Vector3();

    if (this.target) {
      // Frame both actors: sit behind the player on the player→enemy axis.
      const toEnemy = new THREE.Vector3().subVectors(this.target.position, player.position);
      const dist = toEnemy.length();
      toEnemy.normalize();
      const back = C.lockBack + Math.min(dist * 0.5, 4.2);
      // lateral shoulder offset — keeps the player out from behind the target
      const side = new THREE.Vector3(toEnemy.z, 0, -toEnemy.x).multiplyScalar(C.lockShoulder);
      desired.copy(player.position)
        .addScaledVector(toEnemy, -back)
        .add(side)
        .add(new THREE.Vector3(0, C.lockHeight + Math.min(dist * 0.13, 1.5), 0));
      // keep yaw in sync so unlocking doesn't snap
      this.yaw = Math.atan2(-toEnemy.x, -toEnemy.z);
      lookAt.copy(player.position).addScaledVector(toEnemy, dist * 0.5)
        .addScaledVector(side, 0.35);
      lookAt.y += C.lookAtHeight + 0.55;
      this.pos.lerp(desired, 1 - Math.exp(-C.lockLerp * dt));
      this.look.lerp(lookAt, 1 - Math.exp(-C.lockLerp * dt));
    } else {
      const cp = Math.cos(this.pitch);
      desired.set(
        focus.x + Math.sin(this.yaw) * C.distance * cp,
        focus.y + C.height + Math.sin(this.pitch) * C.distance,
        focus.z + Math.cos(this.yaw) * C.distance * cp,
      );
      this.pos.lerp(desired, 1 - Math.exp(-C.followLerp * dt));
      this.look.lerp(focus, 1 - Math.exp(-C.followLerp * dt));
    }

    if (!this._initialised) { this.pos.copy(desired); this.look.copy(this.target ? lookAt : focus); this._initialised = true; }

    this.pos.y = Math.max(this.pos.y, 0.85);   // don't clip through the floor

    // shake
    this._t += dt;
    let sx = 0, sy = 0;
    if (this.shake > 0.0005) {
      const s = this.shake;
      sx = Math.sin(this._t * 74) * s * 0.55 + Math.sin(this._t * 131) * s * 0.3;
      sy = Math.cos(this._t * 89) * s * 0.55 + Math.sin(this._t * 157) * s * 0.25;
      this.shake *= Math.exp(-C.shake.decay * dt);
    } else this.shake = 0;

    this.cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.cam.lookAt(this.look);
  }

  /** Screen position of the lock-on reticle, or null. */
  reticle(w, h) {
    if (!this.target || !this.target.alive) return null;
    const p = new THREE.Vector3().copy(this.target.position);
    p.y += this.target.lockHeight ?? 1.4;
    p.project(this.cam);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  }
}
