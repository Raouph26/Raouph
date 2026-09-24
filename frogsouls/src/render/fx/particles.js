import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Particles: one pooled Points system per blend mode, updated on the CPU,
// drawn with a soft round sprite. Presets are named after what they're for.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying vec3 vColor; varying float vAlpha;
  uniform float uScale;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * 0.01 * uScale / max(0.1, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vColor = aColor; vAlpha = aAlpha;
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, 0.0, r);
    a *= a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
    #include <fog_fragment>
  }`;

export class Particles {
  constructor(scene, { max = 2500, additive = true } = {}) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.pos.fill(-9999);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 300 } }]),
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.next = 0;
    this.geo = g;
  }

  setScale(px) { this.mat.uniforms.uScale.value = px; }

  emit(x, y, z, vx, vy, vz, color, size, life, o = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = _c.set(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0;
    this.s0[i] = size; this.s1[i] = o.sizeEnd ?? size * 0.3;
    this.a0[i] = o.alpha ?? 1;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -9999; continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.25; this.vel[i * 3] *= .6; this.vel[i * 3 + 2] *= .6; }
      const k = this.life[i] / this.maxLife[i];
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      this.alpha[i] = this.a0[i] * Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 12 + .2);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
}
const _c = new THREE.Color();

// ── presets ─────────────────────────────────────────────────────────────────
export class FX {
  constructor(scene) {
    this.add = new Particles(scene, { max: 2600, additive: true });
    this.norm = new Particles(scene, { max: 1600, additive: false });
    this.flies = [];     // swarms flying to the frog after a kill
  }

  setScale(px) { this.add.setScale(px); this.norm.setScale(px); }

  sparks(x, y, z, color = 0xffd9a0, n = 18, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.1;
      const s = (3 + Math.random() * 7) * power;
      this.add.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * .9 + 1.5, Math.sin(a) * Math.cos(e) * s,
        color, 10 + Math.random() * 10, .25 + Math.random() * .35, { gravity: 14, drag: 2.5, sizeEnd: 2 });
    }
    this.add.emit(x, y, z, 0, 0, 0, color, 90 * power, .12, { sizeEnd: 30 });
  }

  goo(x, y, z, color, n = 14) {           // what a boss leaks when hit
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.norm.emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, color, 14 + Math.random() * 16, .5 + Math.random() * .4, { gravity: 18, drag: 1, sizeEnd: 6, alpha: .95 });
    }
  }

  dust(x, z, n = 10, r = 0.6, color = 0x8a7f70, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 2.5) * power;
      this.norm.emit(x + Math.cos(a) * r * .3, .15, z + Math.sin(a) * r * .3, Math.cos(a) * s, .4 + Math.random() * 1.2, Math.sin(a) * s,
        color, 30 + Math.random() * 40, .6 + Math.random() * .5, { drag: 3, sizeEnd: 70, alpha: .45 });
    }
  }

  ringBurst(x, z, radius, color = 0xd9a441) {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      this.add.emit(x + Math.cos(a) * radius * .3, .2, z + Math.sin(a) * radius * .3, Math.cos(a) * radius * 3, .6, Math.sin(a) * radius * 3,
        color, 16, .35, { drag: 5, sizeEnd: 4 });
    }
  }

  heal(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = .3 + Math.random() * .4;
      this.add.emit(x + Math.cos(a) * r, y - .6 + Math.random() * .8, z + Math.sin(a) * r, 0, 1.2 + Math.random() * 1.6, 0,
        i % 3 ? 0x8dff72 : 0xe8ffd8, 10 + Math.random() * 12, .8 + Math.random() * .6, { drag: .5, sizeEnd: 2 });
    }
  }

  parry(x, y, z) {
    this.sparks(x, y, z, 0xfff2c4, 34, 1.5);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.add.emit(x, y, z, Math.cos(a) * 9, Math.sin(a) * 2, Math.sin(a) * 9, 0xffffff, 12, .2, { drag: 6, sizeEnd: 2 });
    }
  }

  glitch(x, y, z) {
    for (let i = 0; i < 20; i++) {
      this.add.emit(x + (Math.random() - .5) * 2, y + Math.random() * 3, z + (Math.random() - .5) * 2, (Math.random() - .5) * 2, 0, (Math.random() - .5) * 2,
        [0xff3bd4, 0x3bd4ff, 0x57ffb0][i % 3], 20 + Math.random() * 20, .25, { sizeEnd: 20 });
    }
  }

  /** A boss bursts into flies that swarm to the frog: the currency, made visible. */
  flySwarm(from, count, getTarget) {
    for (let i = 0; i < count; i++) {
      this.flies.push({
        x: from.x + (Math.random() - .5) * 2, y: from.y + Math.random() * 2.5, z: from.z + (Math.random() - .5) * 2,
        vx: (Math.random() - .5) * 8, vy: 2 + Math.random() * 5, vz: (Math.random() - .5) * 8,
        t: -Math.random() * .6, getTarget,
      });
    }
  }

  update(dt) {
    for (const f of this.flies) {
      f.t += dt;
      if (f.t < 0) continue;
      const tg = f.getTarget();
      const dx = tg.x - f.x, dy = tg.y + 1.2 - f.y, dz = tg.z - f.z;
      const d = Math.hypot(dx, dy, dz);
      const pull = Math.min(40, 4 + f.t * 26);
      f.vx += (dx / d) * pull * dt + (Math.random() - .5) * 30 * dt;
      f.vy += (dy / d) * pull * dt + (Math.random() - .5) * 30 * dt;
      f.vz += (dz / d) * pull * dt + (Math.random() - .5) * 30 * dt;
      const damp = Math.exp(-2.2 * dt);
      f.vx *= damp; f.vy *= damp; f.vz *= damp;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      this.norm.emit(f.x, f.y, f.z, 0, 0, 0, 0x14100c, 9, .06, { sizeEnd: 7 });
      this.add.emit(f.x, f.y, f.z, 0, 0, 0, 0x9fd06a, 5, .05, { sizeEnd: 3, alpha: .5 });
      if (d < .6 || f.t > 4) f.done = true;
    }
    this.flies = this.flies.filter((f) => !f.done);
    this.add.update(dt);
    this.norm.update(dt);
  }
}

// ── ambient: GPU-animated drifting motes per world ──────────────────────────
const AVERT = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime; uniform float uScale; uniform vec3 uDrift; uniform float uWobble; uniform float uHeight; uniform float uArea; uniform float uSize; uniform float uBlink;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    float t = uTime * (0.6 + aSeed.x * 0.8);
    p += uDrift * uTime * (0.5 + aSeed.y);
    p.y = mod(p.y, uHeight);
    p.x = mod(p.x + uArea, uArea * 2.0) - uArea;
    p.z = mod(p.z + uArea, uArea * 2.0) - uArea;
    p.x += sin(t + aSeed.z * 6.28) * uWobble;
    p.z += cos(t * 0.8 + aSeed.w * 6.28) * uWobble;
    p.y += sin(t * 1.3 + aSeed.x * 6.28) * uWobble * 0.5;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * 0.01 * (0.5 + aSeed.y) * uScale / max(0.1, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    float blink = mix(1.0, 0.5 + 0.5 * sin(uTime * (2.0 + aSeed.z * 3.0) + aSeed.w * 20.0), uBlink);
    float edge = smoothstep(0.0, uHeight * 0.15, p.y) * smoothstep(uHeight, uHeight * 0.8, p.y);
    vAlpha = blink * edge;
    #include <fog_vertex>
  }`;
const AFRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, r); a *= a * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
  }`;

export class Ambient {
  constructor(scene) {
    const n = 900;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 40; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() * 2 - 1) * 40;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.u = {
      uTime: { value: 0 }, uScale: { value: 300 }, uDrift: { value: new THREE.Vector3(0, .2, 0) }, uWobble: { value: .5 },
      uHeight: { value: 12 }, uArea: { value: 40 }, uSize: { value: 8 }, uBlink: { value: 0 },
      uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: .6 },
    };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: AVERT, fragmentShader: AFRAG, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.u]),
      blending: THREE.AdditiveBlending,
    });
    this.u = this.mat.uniforms;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  set(p) {
    const u = this.u;
    u.uColor.value.set(p.color ?? 0xffffff);
    u.uDrift.value.set(...(p.drift ?? [0, .2, 0]));
    u.uWobble.value = p.wobble ?? .5;
    u.uSize.value = p.size ?? 8;
    u.uBlink.value = p.blink ?? 0;
    u.uOpacity.value = p.opacity ?? .6;
    u.uHeight.value = p.height ?? 12;
    this.mat.blending = p.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.points.geometry.setDrawRange(0, p.count ?? 600);
    this.points.visible = (p.count ?? 600) > 0;
  }

  update(dt, scale) { this.u.uTime.value += dt; this.u.uScale.value = scale; }
}
