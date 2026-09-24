import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// PartBuilder: compose many small primitives, each with its own colour, then
// merge them into ONE mesh per joint. Detail without draw calls — a character
// with ninety parts still costs about fifteen draws, which is what keeps this
// running on a phone.
// ─────────────────────────────────────────────────────────────────────────────

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export class PartBuilder {
  constructor() { this.parts = []; }

  _add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    _p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? 'XYZ');
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
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
    // normals are recomputed in the shader (flat shading) but shadows want them
    g.computeVertexNormals();
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, o) { return this._add(new THREE.BoxGeometry(w, h, d), color, o); }
  /** Faceted ellipsoid — low-poly spheres read far better than smooth ones here. */
  blob(rx, ry, rz, color, o = {}) { return this._add(new THREE.IcosahedronGeometry(1, o.detail ?? 1), color, { ...o, sx: rx, sy: ry, sz: rz }); }
  sphere(r, color, o = {}) { return this._add(new THREE.SphereGeometry(r, o.seg ?? 10, o.rings ?? 7), color, o); }
  cyl(rt, rb, h, color, o = {}) { return this._add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 7), color, o); }
  cone(r, h, color, o = {}) { return this._add(new THREE.ConeGeometry(r, h, o.seg ?? 6), color, o); }
  torus(r, t, color, o = {}) { return this._add(new THREE.TorusGeometry(r, t, o.tseg ?? 5, o.seg ?? 12, o.arc ?? Math.PI * 2), color, o); }
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

  build(material) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
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

export function actorMaterial({ rim = 0x9fb7d0, rimStrength = 0.35, rough = 0.82, metal = 0.06, wire = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: rough, metalness: metal, wireframe: wire,
  });
  const u = {
    uRimColor: { value: new THREE.Color(rim) },
    uRimStrength: { value: rimStrength },
    uGlowColor: { value: new THREE.Color(0xd9a441) },
    uGlow: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0xfff2dc) },
    uFill: ACTOR_FILL,
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRimColor; uniform float uRimStrength;
        uniform vec3 uGlowColor; uniform float uGlow; uniform float uFlash; uniform vec3 uFlashColor; uniform float uFill;`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 vdir = normalize(vViewPosition);
          float facing = clamp(dot(normal, vdir), 0.0, 1.0);
          float fres = pow(1.0 - clamp(abs(dot(normal, vdir)), 0.0, 1.0), 2.6);
          outgoingLight += diffuseColor.rgb * uFill * (0.3 + 0.7 * facing);
          outgoingLight += uRimColor * fres * uRimStrength;
          outgoingLight += uGlowColor * uGlow * (0.05 + fres * 1.8);         // a rim of light; the body stays readable
          outgoingLight = mix(outgoingLight, uFlashColor, uFlash * (0.5 + 0.5 * fres));   // keeps the form readable
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'actor' + (wire ? 'w' : '');
  return mat;
}

/** A plain unlit material for glowing bits (eyes, screens, LEDs). */
export function glowMaterial(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });
}
