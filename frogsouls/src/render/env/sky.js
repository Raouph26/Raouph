import * as THREE from 'three';

// A gradient dome with an optional moon and a thin scatter of stars.
export class Sky {
  constructor(scene) {
    this.u = {
      uTop: { value: new THREE.Color(0x05080f) }, uHor: { value: new THREE.Color(0x1a2a38) },
      uMoon: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-.4, .45, -.8).normalize() }, uTime: { value: 0 },
    };
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.u,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uTop, uHor, uMoonDir; uniform float uMoon, uTime; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(uHor, uTop, smoothstep(-0.05, 0.6, y));
          float md = dot(normalize(vDir), uMoonDir);
          c += uMoon * (smoothstep(0.9985, 0.9992, md) * vec3(0.95, 0.97, 1.0) + pow(max(md, 0.0), 60.0) * vec3(0.18, 0.22, 0.3));
          vec3 cell = floor(vDir * 180.0);
          float s = step(0.9965, h(cell)) * smoothstep(0.1, 0.5, y) * uMoon;
          c += s * (0.5 + 0.5 * sin(uTime * 2.0 + h(cell + 1.0) * 30.0)) * 0.8;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), m);
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
  }
  update(dt, cam) { this.u.uTime.value += dt; this.mesh.position.copy(cam.position); }
}
