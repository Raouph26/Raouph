import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Third-person camera. Free: orbit behind the frog's shoulder. Locked: sit on
// the frog→boss line, pulled back and raised by the boss's size and distance,
// looking between them so both stay framed. Cinematic: scripted boss intros.
// ─────────────────────────────────────────────────────────────────────────────

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const angDamp = (a, b, r, dt) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * (1 - Math.exp(-r * dt)); };

export class CameraCtl {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;         // camera sits at yaw's direction from the target: behind a frog facing −z
    this.pitch = 0.28;
    this.dist = 4.8;
    this.pos = new THREE.Vector3(0, 3, 10);
    this.look = new THREE.Vector3(0, 1.4, 0);
    this.trauma = 0;
    this.fovKick = 0;
    this.baseFov = 58;
    this.mode = 'free';
    this.cine = null;
    this.bounds = 23;
    this.t = 0;
    this.snap = true;
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  kick(a) { this.fovKick = Math.min(8, this.fovKick + a); }

  /** Put the camera behind the frog right now (entering a place). */
  reset(p, yaw) {
    this.yaw = yaw ?? p.yaw + Math.PI;
    this.pitch = 0.28;
    this.snap = true;
  }

  cinematic(focus, radius, height, dur, fromYaw) {
    this.mode = 'cine';
    this.cine = { focus: focus.clone(), radius, height, dur, t: 0, yaw0: fromYaw };
  }

  endCinematic(p) { this.mode = 'free'; this.cine = null; this.reset(p, this.yaw); this.snap = false; }

  /**
   * @param p    the frog (x, z, yaw, vx, vz)
   * @param lock the lock-on target or null ({x, z, y, height, radius})
   * @param look {x, y} look delta from input
   */
  update(dt, p, lock, look, { touchFollow = false } = {}) {
    this.t += dt;
    const c = this.cam;
    let desiredPos, desiredLook;

    if (this.mode === 'cine' && this.cine) {
      const q = this.cine; q.t += dt;
      const k = Math.min(1, q.t / q.dur);
      const e = k * k * (3 - 2 * k);
      const a = q.yaw0 + (1 - e) * 1.1 - .35;
      desiredPos = _v.set(q.focus.x + Math.sin(a) * q.radius * (1.25 - e * .35), q.height * (1.2 - e * .5) + 1, q.focus.z + Math.cos(a) * q.radius * (1.25 - e * .35));
      desiredLook = _w.set(q.focus.x, q.height * .62, q.focus.z);
      this.pos.lerp(desiredPos, this.snap ? 1 : 1 - Math.exp(-5 * dt));
      this.look.lerp(desiredLook, this.snap ? 1 : 1 - Math.exp(-6 * dt));
      this.snap = false;
    } else if (lock) {
      this.mode = 'lock';
      const dx = lock.x - p.x, dz = lock.z - p.z;
      const d = Math.max(.001, Math.hypot(dx, dz));
      const toYaw = Math.atan2(dx, dz);
      // behind the frog on the boss line, low enough that bosses loom, and off
      // the right shoulder so the frog never hides what the boss is doing
      this.yaw = angDamp(this.yaw, toYaw + Math.PI, 7, dt);
      const size = lock.height ?? 3;
      const back = 3.5 + Math.min(d * .3, 2.8) + size * .32;
      const up = 1.95 + size * .25 + Math.min(d * .07, .7);
      const side = 1.15 + size * .07;
      const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
      desiredPos = _v.set(p.x + sx * back + sz * side, up, p.z + sz * back - sx * side);
      const w = Math.min(.5, .3 + size * .035);
      desiredLook = _w.set(p.x + dx * w, 1.25 + size * .3, p.z + dz * w);
      this.pitch = .22;
      this.pos.lerp(desiredPos, this.snap ? 1 : 1 - Math.exp(-8 * dt));
      this.look.lerp(desiredLook, this.snap ? 1 : 1 - Math.exp(-10 * dt));
      this.snap = false;
    } else {
      this.mode = 'free';
      this.yaw -= look.x;
      this.pitch = Math.max(-.35, Math.min(1.05, this.pitch + look.y));
      // on touch, drift behind the direction of travel when the thumb is off the camera
      if (touchFollow) {
        const sp = Math.hypot(p.vx, p.vz);
        if (sp > 1.5) this.yaw = angDamp(this.yaw, Math.atan2(p.vx, p.vz) + Math.PI, .9 * Math.min(1, sp / 4), dt);
      }
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
      desiredLook = _w.set(p.x + sz * .55, 1.4, p.z - sx * .55);          // over the right shoulder
      desiredPos = _v.set(desiredLook.x + sx * this.dist * cp, desiredLook.y + .35 + sp * this.dist, desiredLook.z + sz * this.dist * cp);
      this.pos.lerp(desiredPos, this.snap ? 1 : 1 - Math.exp(-14 * dt));
      this.look.lerp(desiredLook, this.snap ? 1 : 1 - Math.exp(-16 * dt));
      this.snap = false;
    }

    // keep the camera out of the scenery: inside the ring, above the floor
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > this.bounds) { this.pos.x *= this.bounds / r; this.pos.z *= this.bounds / r; }
    this.pos.y = Math.max(.6, this.pos.y);

    // shake: layered sines, scaled by trauma², decaying
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const s = this.trauma * this.trauma;
    const ox = (Math.sin(this.t * 71) + Math.sin(this.t * 133) * .5) * s * .32;
    const oy = (Math.sin(this.t * 89) + Math.sin(this.t * 151) * .5) * s * .26;
    c.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z);
    c.lookAt(this.look);
    c.rotateZ((Math.sin(this.t * 47) * s) * .05);

    // hold the horizontal view near 84°: a wide phone gets a narrower vertical
    // FOV instead of a fish-eye view where everything looks far away
    const hf = Math.tan((84 * Math.PI / 180) / 2);
    this.baseFov = Math.max(44, Math.min(60, 2 * Math.atan(hf / c.aspect) * 180 / Math.PI));
    this.fovKick = damp(this.fovKick, 0, 6, dt);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(c.fov - fov) > .01) { c.fov = fov; c.updateProjectionMatrix(); }
    c.userData.focus.set(p.x, 0, p.z);
  }

  /** Camera-relative stick → world direction (for the sim's intent). */
  worldMove(mx, my) {
    const f = Math.atan2(this.look.x - this.cam.position.x, this.look.z - this.cam.position.z);
    const sf = Math.sin(f), cf = Math.cos(f);
    // forward = (sf, cf); right = (-cf, sf)… with the character's right on −x:
    return { x: sf * my - cf * mx, z: cf * my + sf * mx };
  }
}
