import * as THREE from 'three';
import { PartBuilder, glowMaterial } from '../kit/builder.js';
import { labelTexture } from '../textures.js';

// Environment building blocks. Repeated things are instanced: one draw for
// three hundred reeds. Everything is flat-shaded vertex colour, like the cast.

export const envMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .92, metalness: .02 });

/** Shared clock for everything the wind moves. The stage advances it. */
export const WIND = { uTime: { value: 0 } };

/**
 * Environment material that sways in the wind: the higher a vertex is above
 * its prop's base, the further it moves; each instance gets its own phase.
 */
const swayChunk = (amp) => `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #endif
          float h = max(0.0, position.y);
          float gust = sin(uTime * .55 + ip.x * .08) * .5 + .5;
          float w = sin(uTime * 1.6 + ip.x * .35 + ip.z * .27) * (.45 + .55 * gust) + sin(uTime * 3.3 + ip.z * .9) * .18;
          transformed.x += w * h * h * ${amp.toFixed(3)};
          transformed.z += w * .45 * h * h * ${amp.toFixed(3)};
        }`;
const injectSway = (m, amp) => {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', swayChunk(amp));
  };
  m.customProgramCacheKey = () => 'sway' + amp;
  return m;
};

export function swayMat(amp = .1) {
  const m = injectSway(envMat(), amp);
  m.userData.sway = amp;
  return m;
}

// Instanced props cast shadows through their own depth material. three.js
// otherwise draws every caster with ONE shared depth material, and flipping it
// between instanced and plain meshes re-derives its shader settings each time.
const INST_DEPTH = new THREE.MeshDepthMaterial();
const SWAY_DEPTH = new Map();
function depthFor(mat) {
  const amp = mat.userData.sway;
  if (amp == null) return INST_DEPTH;
  if (!SWAY_DEPTH.has(amp)) SWAY_DEPTH.set(amp, injectSway(new THREE.MeshDepthMaterial(), amp));   // shadows sway with the reeds
  return SWAY_DEPTH.get(amp);
}

let rs = 7;
export const rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
export const seed = (s) => { rs = s; };
export const range = (a, b) => a + (b - a) * rnd();

/**
 * three.js picks a shader per material; a material shared by instanced AND
 * plain meshes flips between two shaders every frame (and re-derives its
 * settings each time). So a material serves one kind only: the other kind
 * gets a twin.
 */
function forKind(mat, instancedKind) {
  const key = instancedKind ? 'inst' : 'plain', other = instancedKind ? 'plain' : 'inst';
  if (!mat.userData[other]) { mat.userData[key] = true; return mat; }
  return mat.userData[key + 'Twin'] ?? (mat.userData[key + 'Twin'] = mat.clone());
}

/** Build one merged prototype with a PartBuilder, then instance it. */
export function instanced(group, build, count, place, mat = envMat()) {
  mat = forKind(mat, true);
  const b = new PartBuilder();
  build(b);
  const proto = b.build(mat);
  const mesh = new THREE.InstancedMesh(proto.geometry, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const t = place(i);
    p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    q.setFromEuler(e);
    s.setScalar(t.s ?? 1); if (t.sy) s.y = t.sy; if (t.sx) s.x = t.sx; if (t.sz) s.z = t.sz;
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
    if (t.color != null) mesh.setColorAt(i, new THREE.Color(t.color));
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depthFor(mat);
  group.add(mesh);
  return mesh;
}

/** Scatter points in an annulus. */
export function ring(i, rMin, rMax, jitter = 1) {
  const a = rnd() * Math.PI * 2;
  const r = rMin + (rMax - rMin) * Math.sqrt(rnd());
  return { x: Math.sin(a) * r + (rnd() - .5) * jitter, z: Math.cos(a) * r + (rnd() - .5) * jitter, a };
}

export function mesh(group, build, mat = envMat()) {
  mat = forKind(mat, false);
  const b = new PartBuilder();
  build(b);
  const m = b.build(mat);
  group.add(m);
  return m;
}

// ── recurring pieces ────────────────────────────────────────────────────────
export function reedsProto(b) {
  for (let i = 0; i < 5; i++) {
    const h = 1.4 + (i % 3) * .5, x = (i - 2) * .09, rz = (i - 2) * .06;
    b.box(.035, h, .035, 0x3f5a2a, { x, y: h / 2, rz, shade: .5 });
    if (i % 2 === 0) b.cyl(.05, .05, .32, 0x5a3a22, { x: x + Math.sin(rz) * -h, y: h + .1, rz, seg: 6 });
  }
  b.box(.3, .5, .02, 0x4d6a30, { y: .25, ry: .6, rz: .2, shade: .5 });
}

/** A clump of grass blades fanning out from one root. */
export function grassProto(b) {
  const cols = [0x4f7a2e, 0x628f36, 0x3f6526, 0x7a9a3c];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i * .7, lean = .25 + (i % 3) * .12, h = .45 + (i % 4) * .12;
    b.box(.03, h, .012, cols[i % 4], { x: Math.sin(a) * .06, y: h / 2, z: Math.cos(a) * .06, rx: Math.cos(a) * lean, rz: -Math.sin(a) * lean, ry: a, shade: .55 });
  }
}

export function lilyProto(b) {
  b.disc(1, 0x2f6b3a, { seg: 10, y: .01 }).box(.9, .015, .08, 0x1f4a2c, { x: .45, y: .02, rz: 0 });
}

export function deadTree(group, x, z, h = 9, s = 1) {
  return mesh(group, (b) => {
    b.cyl(.28 * s, .45 * s, h, 0x241c16, { y: h / 2, seg: 6, shade: .4 });
    for (let i = 0; i < 5; i++) {
      const y = h * (.45 + i * .1), a = i * 2.2, len = h * (.35 - i * .04);
      b.cyl(.06 * s, .14 * s, len, 0x241c16, { x: Math.cos(a) * len * .35, y: y + len * .3, z: Math.sin(a) * len * .35, rz: Math.cos(a) * .9, rx: Math.sin(a) * .9, seg: 5 });
    }
  }).position.set(x, 0, z);
}

export function rock(b, s = 1, color = 0x3a3a36) {
  b.blob(.9 * s, .55 * s, .8 * s, color, { y: .2 * s, detail: 0 }).blob(.5 * s, .4 * s, .55 * s, color, { x: .5 * s, y: .15 * s, z: .2 * s, detail: 0 });
}

/** A world-name sign that always faces the camera. */
export function signSprite(text, sub, color = '#e8e4dc') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  const fit = (t) => { let px = 58; ctx.font = `600 ${px}px "IM Fell English SC", Georgia, serif`; while (ctx.measureText(t).width > 480 && px > 24) { px -= 2; ctx.font = `600 ${px}px "IM Fell English SC", Georgia, serif`; } };
  ctx.fillStyle = color; fit(text);
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 12;
  ctx.fillText(text, 256, 70);
  if (sub) { ctx.font = '500 28px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(232,228,220,.75)'; ctx.fillText(sub, 256, 122); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(6.4, 2, 1);
  sp.userData.redraw = (t, s) => {
    ctx.clearRect(0, 0, 512, 160);
    ctx.fillStyle = color; fit(t); ctx.fillText(t, 256, 70);
    if (s) { ctx.font = '500 28px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(232,228,220,.75)'; ctx.fillText(s, 256, 122); }
    tex.needsUpdate = true;
  };
  return sp;
}

// ── fog gates: the doors between places ─────────────────────────────────────
const GATE_FRAG = `uniform float uTime; uniform vec3 uColor; uniform float uOpen; varying vec2 vUv;
  float n(vec2 p){ return sin(p.x*3.1+uTime*1.3)*sin(p.y*2.7-uTime*1.1)+sin((p.x+p.y)*5.3+uTime*2.0)*.5; }
  void main(){ vec2 p = vUv*2.0-1.0; float r = length(p*vec2(1.0,.8));
    float swirl = n(p*2.0 + vec2(sin(uTime*.3), cos(uTime*.4)));
    float a = smoothstep(1.0, .55, r) * (.55 + .25*swirl) * uOpen;
    vec3 c = uColor * (1.1 + .5*swirl) + vec3(.15) * smoothstep(.9, .2, r);
    gl_FragColor = vec4(c, a); }`;

export class Gate {
  constructor(group, { x, z, yaw, color = 0x7fd0c0, frame = 0x5a5a5e, label, sub, scale = 1, sealed = false, cleared = false, pips = 0, pipsLit = 0, style = 'stone' }) {
    this.g = new THREE.Group();
    this.g.position.set(x, 0, z);
    this.g.rotation.y = yaw;
    this.g.scale.setScalar(scale);
    group.add(this.g);
    const f = sealed ? 0x2c2c30 : frame;
    mesh(this.g, (b) => {
      if (style === 'stone') {
        b.box(.7, 4.6, .8, f, { x: -1.7, y: 2.3, shade: .35 }).box(.7, 4.6, .8, f, { x: 1.7, y: 2.3, shade: .35 });
        for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI; b.box(.8, .7, .8, f, { x: Math.cos(a) * 1.7, y: 4.6 + Math.sin(a) * 1.1, rz: a - Math.PI / 2 }); }
        b.box(1, .3, 1, 0x3a3a3c, { x: -1.7, y: .15 }).box(1, .3, 1, 0x3a3a3c, { x: 1.7, y: .15 });
      } else {         // a plain frame, for worlds that aren't carved stone
        b.box(.3, 5, .3, f, { x: -1.7, y: 2.5 }).box(.3, 5, .3, f, { x: 1.7, y: 2.5 }).box(3.7, .3, .3, f, { y: 5 });
      }
      if (sealed) for (let i = 0; i < 4; i++) b.box(.1, .1, 3.8, 0x5a5048, { y: 1.2 + i * .9, rz: Math.PI / 2 + (i % 2 ? .25 : -.25), rx: Math.PI / 2 });
    });
    this.u = { uTime: { value: Math.random() * 10 }, uColor: { value: new THREE.Color(sealed ? 0x222228 : color) }, uOpen: { value: sealed ? .35 : 1 } };
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.8), new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: GATE_FRAG,
    }));
    plane.position.y = 2.6;
    this.g.add(plane);
    this.plane = plane;
    if (!sealed) {
      const light = new THREE.PointLight(color, 6, 9, 2);
      light.position.set(0, 2.4, 1);
      this.g.add(light);
      this.light = light;
    }
    // progress pips: one lantern per boss cleared in that world
    for (let i = 0; i < pips; i++) {
      const lit = i < pipsLit;
      const m = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), lit ? glowMaterial(color) : new THREE.MeshStandardMaterial({ color: 0x2a2a2e }));
      m.position.set((i - (pips - 1) / 2) * .5, 6.3, .2);
      this.g.add(m);
    }
    if (cleared) {
      const crown = new THREE.Mesh(new THREE.OctahedronGeometry(.3), glowMaterial(0xffe8a0));
      crown.position.set(0, 6.9, .2); this.g.add(crown); this.crown = crown;
    }
    if (label) {
      this.sign = signSprite(label, sub);
      this.sign.position.set(0, 7.6, 0);
      this.g.add(this.sign);
    }
    this.sealed = sealed;
  }
  update(dt, t, near) {
    this.u.uTime.value += dt;
    this.u.uOpen.value += ((this.sealed ? .35 : near ? 1.35 : 1) - this.u.uOpen.value) * Math.min(1, dt * 4);
    if (this.crown) this.crown.rotation.y += dt;
    if (this.light) this.light.intensity = 6 + Math.sin(t * 2 + this.g.position.x) * 1.2 + (near ? 4 : 0);
  }
  dispose(group) { group.remove(this.g); }
}
