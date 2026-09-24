import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Floor telegraphs. Every hazard that isn't an obvious swing is drawn on the
// ground before it can hurt you: landing spots, AoE circles, shockwave rings,
// captcha tiles, the blue screen's safe zone, the Hitbox's giant arcs.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

// a filled disc/sector whose fill grows toward the edge as it charges
const TELE_FRAG = `
  uniform vec3 uColor; uniform float uProgress; uniform float uTime; uniform float uArc; uniform float uAlpha;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float ang = abs(atan(p.x, p.y));
    if (ang > uArc) discard;
    float edge = smoothstep(0.93, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r));
    float fill = step(r, uProgress) * 0.28;
    float front = smoothstep(uProgress - 0.06, uProgress, r) * (1.0 - smoothstep(uProgress, uProgress + 0.02, r));
    float pulse = 0.75 + 0.25 * sin(uTime * 14.0);
    float a = (edge * 0.9 * pulse + fill + front * 0.7) * uAlpha;
    gl_FragColor = vec4(uColor * (1.0 + front), a);
  }`;

const RING_FRAG = `
  uniform vec3 uColor; uniform float uR; uniform float uW; uniform float uMax; uniform float uAlpha;
  varying vec2 vUv;
  void main(){
    float r = length(vUv * 2.0 - 1.0) * uMax;
    float d = abs(r - uR) / (uW * 0.5);
    if (d > 1.0) discard;
    float a = (1.0 - d * d) * uAlpha;
    gl_FragColor = vec4(uColor * (1.2 - d * 0.4), a);
  }`;

function mat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: frag, uniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
  });
}

export class Decals {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.byHazard = new Map();
    this.transient = [];
    this.time = 0;
    this.warn = new THREE.Color(0xff8a3a);
    this.danger = new THREE.Color(0xff3b3b);
    this.safe = new THREE.Color(0x7dffb0);
  }

  _tele(x, z, radius, color, arc = Math.PI, yaw = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat(TELE_FRAG, {
      uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 }, uTime: { value: 0 }, uArc: { value: arc }, uAlpha: { value: 1 },
    }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = yaw + Math.PI;   // spin on the floor so the sector faces the boss's yaw
    m.position.set(x, 0.04, z);
    m.renderOrder = 3;
    this.group.add(m);
    return m;
  }

  /** One-shot decal from a sim 'decal' event (leap landings, bricks, hitbox arcs). */
  event(e, followTarget) {
    const color = e.shape === 'arc' ? this.danger : this.warn;
    const m = this._tele(e.x, e.z, e.radius, color, e.shape === 'arc' ? e.arc : Math.PI, e.yaw ?? 0);
    this.transient.push({ m, life: e.life, t: 0, follow: e.follow ? followTarget : null });
  }

  /** Mirror the sim's hazards: create, update, retire. */
  sync(hazards, dt) {
    this.time += dt;
    const seen = new Set();
    for (const h of hazards) {
      seen.add(h.id);
      let d = this.byHazard.get(h.id);
      if (!d) { d = this._make(h); this.byHazard.set(h.id, d); }
      this._update(d, h);
    }
    for (const [id, d] of this.byHazard) {
      if (!seen.has(id)) {
        d.fade = (d.fade ?? 1) - dt * 5;
        for (const m of d.meshes) m.material.uniforms.uAlpha.value = Math.max(0, d.fade);
        if (d.fade <= 0) { for (const m of d.meshes) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); } this.byHazard.delete(id); }
      }
    }
    for (const t of this.transient) {
      t.t += dt;
      const u = t.m.material.uniforms;
      u.uProgress.value = Math.min(1, t.t / Math.max(t.life, .01));
      u.uTime.value = this.time;
      u.uAlpha.value = t.t > t.life ? Math.max(0, 1 - (t.t - t.life) * 6) : 1;
      if (t.follow) { t.m.position.x = t.follow.x; t.m.position.z = t.follow.z; t.m.rotation.z = t.follow.yaw + Math.PI; }
    }
    this.transient = this.transient.filter((t) => { const dead = t.t > t.life + .2; if (dead) { this.group.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose(); } return !dead; });
  }

  _make(h) {
    const d = { meshes: [] };
    if (h.kind === 'aoe') d.meshes.push(this._tele(h.x, h.z, h.radius, h.eruption ? 0xffb14a : this.warn));
    else if (h.kind === 'ring') {
      const size = h.maxR + 1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), mat(RING_FRAG, {
        uColor: { value: new THREE.Color(h.dmg > 0 ? 0xff9a4a : 0xcfe0ff) }, uR: { value: h.r }, uW: { value: h.width + .3 }, uMax: { value: size }, uAlpha: { value: h.dmg > 0 ? 1 : .5 },
      }));
      m.rotation.x = -Math.PI / 2; m.position.set(h.x, .05, h.z); m.renderOrder = 3;
      this.group.add(m); d.meshes.push(m);
    } else if (h.kind === 'tiles') {
      for (const [i, j] of h.cells) {
        const cx = h.origin + (i + .5) * h.size, cz = h.origin + (j + .5) * h.size;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(h.size * .96, h.size * .96), mat(TELE_FRAG.replace('if (r > 1.0) discard;', '').replace('if (ang > uArc) discard;', '').replace('float r = length(p);', 'float r = max(abs(p.x), abs(p.y));'), {
          uColor: { value: new THREE.Color(0x3f8cff) }, uProgress: { value: 0 }, uTime: { value: 0 }, uArc: { value: Math.PI }, uAlpha: { value: 1 },
        }));
        m.rotation.x = -Math.PI / 2; m.position.set(cx, .045, cz); m.renderOrder = 3;
        this.group.add(m); d.meshes.push(m);
      }
    } else if (h.kind === 'wipe') {
      const safe = this._tele(h.x, h.z, h.safeRadius, this.safe);
      d.meshes.push(safe);
    }
    return d;
  }

  _update(d, h) {
    for (const m of d.meshes) {
      const u = m.material.uniforms;
      if (u.uTime) u.uTime.value = this.time;
      if (h.kind === 'ring') { u.uR.value = h.r; continue; }
      const delay = h.delay ?? 1;
      if (u.uProgress) u.uProgress.value = h.kind === 'wipe' ? 1 : Math.min(1, h.age / delay);
    }
  }
}
