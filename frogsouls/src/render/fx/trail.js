import * as THREE from 'three';

// A weapon trail: a ribbon along the outer part of the blade, remembered over
// the last few frames and faded by age. A fast swing moves the blade a long way
// between frames, so the ribbon is rebuilt each frame through a Catmull-Rom
// spline of the samples: the arc stays round instead of turning into slabs.
// Only emits while the swing is live.

const VERT = `attribute float aAge; varying float vAge; attribute float aEdge; varying float vEdge;
  void main(){ vAge = aAge; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FRAG = `uniform vec3 uColor; uniform float uOpacity; varying float vAge; varying float vEdge;
  void main(){
    float life = 1.0 - vAge;
    float a = life * life * (vEdge * vEdge) * uOpacity;
    a += smoothstep(0.86, 1.0, vEdge) * life * 0.55 * uOpacity;      // bright cutting edge
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.55 + 0.9 * vEdge), a);
  }`;

const cr = (a, b, c, d, u) => {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
};

export class Trail {
  constructor(scene, color = 0xffffff, { raw = 9, sub = 5, life = 0.17, inner = 0.38 } = {}) {
    this.maxRaw = raw; this.sub = sub; this.life = life; this.inner = inner;
    this.raw = [];                                 // newest first: {b:[x,y,z], t:[x,y,z], age}
    this.pool = [];
    this.rows = (raw - 1) * sub + 1;
    const n = this.rows;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.age = new Float32Array(n * 2).fill(1);
    const edge = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { edge[i * 2] = 0; edge[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: .9 } },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this._b = new THREE.Vector3(); this._t = new THREE.Vector3();
  }

  setColor(c) { this.mat.uniforms.uColor.value.set(c); }

  clear() { this.raw.length = 0; this.mesh.visible = false; }

  update(dt, baseObj, tipObj, emitting) {
    for (const p of this.raw) p.age += dt / this.life;
    if (emitting && baseObj && tipObj) {
      baseObj.getWorldPosition(this._b); tipObj.getWorldPosition(this._t);
      this._b.lerp(this._t, this.inner);          // the ribbon covers the outer part of the blade
      const r = this.pool.pop() ?? { b: [0, 0, 0], t: [0, 0, 0], age: 0 };
      this._b.toArray(r.b); this._t.toArray(r.t); r.age = 0;
      this.raw.unshift(r);
    }
    while (this.raw.length && (this.raw.length > this.maxRaw || this.raw[this.raw.length - 1].age >= 1)) this.pool.push(this.raw.pop());
    const R = this.raw, m = R.length;
    this.mesh.visible = m > 1;
    if (m < 2) return;

    const P = this.pos, A = this.age, sub = this.sub;
    let row = 0;
    const put = (bx, by, bz, tx, ty, tz, age) => {
      const o = row * 6;
      P[o] = bx; P[o + 1] = by; P[o + 2] = bz; P[o + 3] = tx; P[o + 4] = ty; P[o + 5] = tz;
      A[row * 2] = A[row * 2 + 1] = Math.min(1, age);
      row++;
    };
    for (let i = 0; i < m - 1; i++) {
      const p0 = R[Math.max(0, i - 1)], p1 = R[i], p2 = R[i + 1], p3 = R[Math.min(m - 1, i + 2)];
      for (let s = 0; s < sub; s++) {
        const u = s / sub;
        put(
          cr(p0.b[0], p1.b[0], p2.b[0], p3.b[0], u), cr(p0.b[1], p1.b[1], p2.b[1], p3.b[1], u), cr(p0.b[2], p1.b[2], p2.b[2], p3.b[2], u),
          cr(p0.t[0], p1.t[0], p2.t[0], p3.t[0], u), cr(p0.t[1], p1.t[1], p2.t[1], p3.t[1], u), cr(p0.t[2], p1.t[2], p2.t[2], p3.t[2], u),
          // fade toward the tail as well as with age, so the end never cuts off hard
          Math.max(p1.age + (p2.age - p1.age) * u, (row / (this.rows - 1)) * 0.9),
        );
      }
    }
    const last = R[m - 1];
    put(last.b[0], last.b[1], last.b[2], last.t[0], last.t[1], last.t[2], 1);
    // collapse the unused rows onto the tail
    while (row < this.rows) put(last.b[0], last.b[1], last.b[2], last.t[0], last.t[1], last.t[2], 1);
    const at = this.mesh.geometry.attributes;
    at.position.needsUpdate = true; at.aAge.needsUpdate = true;
  }
}
