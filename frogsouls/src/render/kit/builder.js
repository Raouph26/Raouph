import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// PartBuilder: compose many small primitives, each with its own colour, then
// merge them into ONE mesh per joint. Detail without draw calls — a character
// with ninety parts still costs about fifteen draws, which is what keeps this
// running on a phone.
// ─────────────────────────────────────────────────────────────────────────────

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export class PartBuilder {
  /**
   * @param hints Map<color, {rough, metal}> — surface by colour, so a frog's
   *   skin can be wet and glossy while its tunic stays matte cloth.
   */
  constructor(hints = null) { this.parts = []; this.hints = hints; }

  _add(geo, color, o = {}) {
    let g = geo;
    g.deleteAttribute('uv');
    _p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? 'XYZ');
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    // round things get smooth normals (shared across their faces); boxes and
    // flat plates keep hard edges, so blades and armour still read crisply
    const smooth = o.smooth ?? o._round ?? false;
    if (smooth) {
      g.deleteAttribute('normal');
      g = mergeVertices(g, 1e-4);
      g.computeVertexNormals();
      g = g.toNonIndexed();
    } else {
      g = g.index ? g.toNonIndexed() : g;
      g.computeVertexNormals();
    }
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    if (o.shade) {
      // cheap baked gradient: darker toward the bottom of the part
      const pos = g.attributes.position;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) { const y = pos.getY(i); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      for (let i = 0; i < n; i++) {
        const k = (pos.getY(i) - minY) / Math.max(1e-4, maxY - minY);
        const f = 1 - o.shade * (1 - k);
        col[i * 3] = _c.r * f; col[i * 3 + 1] = _c.g * f; col[i * 3 + 2] = _c.b * f;
      }
    } else {
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // baked occlusion: faces turned to the ground sit in their own shadow
    const nrm = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const ao = .72 + .28 * (nrm.getY(i) * .5 + .5);
      col[i * 3] *= ao; col[i * 3 + 1] *= ao; col[i * 3 + 2] *= ao;
    }
    // surface: 0 means "the material's default"
    const h = (o.rough != null || o.metal != null) ? o : this.hints?.get(color);
    const mat = new Float32Array(n * 2);
    if (h) for (let i = 0; i < n; i++) { mat[i * 2] = h.rough ?? 0; mat[i * 2 + 1] = h.metal ?? 0; }
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, o) { return this._add(new THREE.BoxGeometry(w, h, d), color, o); }
  /** Faceted ellipsoid — low-poly spheres read far better than smooth ones here. */
  blob(rx, ry, rz, color, o = {}) { return this._add(new THREE.IcosahedronGeometry(1, o.detail ?? 2), color, { _round: true, ...o, sx: rx, sy: ry, sz: rz }); }
  sphere(r, color, o = {}) { return this._add(new THREE.SphereGeometry(r, Math.max(o.seg ?? 14, 12), Math.max(o.rings ?? 10, 8)), color, { _round: true, ...o }); }
  cyl(rt, rb, h, color, o = {}) { return this._add(new THREE.CylinderGeometry(rt, rb, h, Math.max(o.seg ?? 12, 10)), color, { _round: true, ...o }); }
  cone(r, h, color, o = {}) { return this._add(new THREE.ConeGeometry(r, h, o.seg ?? 10), color, { _round: (o.seg ?? 10) > 5, ...o }); }
  torus(r, t, color, o = {}) { return this._add(new THREE.TorusGeometry(r, t, Math.max(o.tseg ?? 7, 6), Math.max(o.seg ?? 18, 12), o.arc ?? Math.PI * 2), color, { _round: true, ...o }); }
  /** Flat disc/ring lying in XZ. */
  disc(r, color, o = {}) { return this._add(new THREE.CircleGeometry(r, o.seg ?? 12), color, { rx: -Math.PI / 2, ...o }); }
  /** Extruded 2D outline (x,y points), e.g. a halberd head or a speech bubble. */
  shape(points, depth, color, o = {}) {
    const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this._add(g, color, o);
  }

  get empty() { return this.parts.length === 0; }

  /** The merged geometry alone (for skinning), or null if nothing was added. */
  geometry() {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return geo;
  }

  build(material) {
    const geo = this.geometry();
    if (!geo) return null;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actor material: vertex colours, flat shading, plus two things the standard
// material doesn't do — a fresnel rim so silhouettes survive heavy fog, and a
// glow term the boss pushes during a wind-up (the telegraph).
// ─────────────────────────────────────────────────────────────────────────────
// One shared fill uniform for every actor: a soft light from the camera's side
// that keeps fighters readable when an arena is backlit or dark. The stage
// sets it per world.
export const ACTOR_FILL = { value: 0.3 };

/**
 * Reflections for actors: every actor material shares one environment map,
 * baked per world from its sky (see stage.js), so wet skin and steel catch
 * the light of the place they're in.
 */
export const ACTOR_ENV = {
  map: null, intensity: .7, mats: new Set(),
  set(tex, intensity = this.intensity) {
    const recompile = !this.map !== !tex;
    this.map = tex; this.intensity = intensity;
    for (const m of this.mats) { m.envMap = tex; m.envMapIntensity = intensity; if (recompile) m.needsUpdate = true; }
  },
};

export function actorMaterial(opts = {}, shared = null) {
  const { rim = 0x9fb7d0, rimStrength = 0.35, rough = 0.82, metal = 0.06, wire = false } = opts;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: false, roughness: rough, metalness: metal, wireframe: wire,
  });
  mat.userData.opts = opts;
  const u = shared ?? {
    uRimColor: { value: new THREE.Color(rim) },
    uRimStrength: { value: rimStrength },
    uGlowColor: { value: new THREE.Color(0xd9a441) },
    uGlow: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0xfff2dc) },
    uFill: ACTOR_FILL,
    uDissolve: { value: 0 },
    uDissolveColor: { value: new THREE.Color(0xffb35a) },
  };
  mat.userData.u = u;
  mat.envMap = ACTOR_ENV.map;
  mat.envMapIntensity = ACTOR_ENV.intensity;
  ACTOR_ENV.mats.add(mat);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDisPos; attribute vec2 aMat; varying vec2 vMat;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDisPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vMat = aMat;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRimColor; uniform float uRimStrength;
        uniform vec3 uGlowColor; uniform float uGlow; uniform float uFlash; uniform vec3 uFlashColor; uniform float uFill;
        uniform float uDissolve; uniform vec3 uDissolveColor; varying vec3 vDisPos; varying vec2 vMat;
        float disHash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float disNoise(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(disHash(i), disHash(i + vec3(1,0,0)), f.x), mix(disHash(i + vec3(0,1,0)), disHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(disHash(i + vec3(0,0,1)), disHash(i + vec3(1,0,1)), f.x), mix(disHash(i + vec3(0,1,1)), disHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vMat.x > 0.0) roughnessFactor = vMat.x;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (vMat.y > 0.0) metalnessFactor = vMat.y;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float disN = 0.0, disEdge = -1.0;
        if (uDissolve > 0.0) {
          // come apart in patches, top first: embers, not a fade
          disN = disNoise(vDisPos * 4.5) * .75 + disNoise(vDisPos * 11.0) * .25 + clamp(vDisPos.y * .06, 0.0, .25);
          disEdge = uDissolve * 1.35 - .1;
          if (disN < disEdge) discard;
        }`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 vdir = normalize(vViewPosition);
          float facing = clamp(dot(normal, vdir), 0.0, 1.0);
          float fres = pow(1.0 - clamp(abs(dot(normal, vdir)), 0.0, 1.0), 2.6);
          outgoingLight += diffuseColor.rgb * uFill * (0.3 + 0.7 * facing);
          outgoingLight += uRimColor * fres * uRimStrength;
          outgoingLight += uGlowColor * uGlow * (0.05 + fres * 1.8);         // a rim of light; the body stays readable
          outgoingLight = mix(outgoingLight, uFlashColor, uFlash * (0.5 + 0.5 * fres));   // keeps the form readable
          if (uDissolve > 0.0) outgoingLight += uDissolveColor * smoothstep(disEdge + .09, disEdge, disN) * 4.0;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'actor' + (wire ? 'w' : '');
  return mat;
}

/**
 * The same actor material for a different kind of mesh (skinned vs plain).
 * three.js compiles a shader per material; one material shared by skinned and
 * plain meshes flips between shaders on every draw. The twin shares every
 * uniform, so a hit flash or a dissolve still lands on body and weapon alike.
 */
export function actorTwin(mat) {
  return mat.userData.twin ?? (mat.userData.twin = actorMaterial(mat.userData.opts ?? {}, mat.userData.u));
}

/** A plain unlit material for glowing bits (eyes, screens, LEDs). */
export function glowMaterial(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });
}
