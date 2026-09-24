import * as THREE from 'three';

// A weapon trail: a ribbon between the blade's base and tip, remembered over
// the last few frames and faded by age. Only emits while the swing is live.

const VERT = `attribute float aAge; varying float vAge; attribute float aEdge; varying float vEdge;
  void main(){ vAge = aAge; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FRAG = `uniform vec3 uColor; uniform float uOpacity; varying float vAge; varying float vEdge;
  void main(){ float a = (1.0 - vAge) * (0.25 + 0.75 * vEdge) * uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(uColor * (0.6 + vEdge), a); }`;

export class Trail {
  constructor(scene, color = 0xffffff, n = 16) {
    this.n = n;
    this.pts = [];          // [{b:Vector3, t:Vector3, age}]
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
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: .85 } },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this._b = new THREE.Vector3(); this._t = new THREE.Vector3();
  }

  setColor(c) { this.mat.uniforms.uColor.value.set(c); }

  update(dt, baseObj, tipObj, emitting) {
    for (const p of this.pts) p.age += dt / 0.16;
    if (emitting && baseObj && tipObj) {
      baseObj.getWorldPosition(this._b); tipObj.getWorldPosition(this._t);
      this.pts.unshift({ b: this._b.clone(), t: this._t.clone(), age: 0 });
    }
    this.pts = this.pts.filter((p) => p.age < 1).slice(0, this.n);
    const m = this.pts.length;
    this.mesh.visible = m > 1;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, m - 1)];
      if (!p) { this.age[i * 2] = this.age[i * 2 + 1] = 1; continue; }
      this.pos.set([p.b.x, p.b.y, p.b.z], i * 6);
      this.pos.set([p.t.x, p.t.y, p.t.z], i * 6 + 3);
      const a = i < m ? Math.max(p.age, i / this.n) : 1;
      this.age[i * 2] = a; this.age[i * 2 + 1] = a;
    }
    const at = this.mesh.geometry.attributes;
    at.position.needsUpdate = true; at.aAge.needsUpdate = true;
  }
}
