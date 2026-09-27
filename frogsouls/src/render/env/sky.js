import * as THREE from 'three';

// The sky: a graded dome with a sun (or moon) disc and its halo, a band of
// scattered light along the horizon toward the sun, and two layers of drifting
// painterly clouds lit from the sun's side. Stars come out when it's night.
export class Sky {
  constructor(scene) {
    this.u = {
      uTop: { value: new THREE.Color(0x05080f) }, uHor: { value: new THREE.Color(0x1a2a38) },
      uMoon: { value: 0 }, uSunDir: { value: new THREE.Vector3(-.4, .45, -.8).normalize() }, uTime: { value: 0 },
      uSunCol: { value: new THREE.Color(0xffd9a0) }, uSun: { value: 1 }, uCloud: { value: .5 },
      uCloudCol: { value: new THREE.Color(0xffffff) }, uCloudShade: { value: new THREE.Color(0x404860) },
      uGlow: { value: new THREE.Color(0xff9a50) },
    };
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.u,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uTop, uHor, uSunDir, uSunCol, uCloudCol, uCloudShade, uGlow; uniform float uMoon, uTime, uSun, uCloud; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float a = .5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = clamp(d.y, -0.2, 1.0);
          vec3 c = mix(uHor, uTop, pow(smoothstep(-0.02, 0.75, y), .8));
          float sd = max(dot(d, uSunDir), 0.0);
          // horizon scattering, strongest toward the sun
          float band = exp(-max(y, 0.0) * 7.0);
          c += uGlow * band * (0.25 + 0.9 * pow(sd, 3.0)) * uSun;
          // sun: a hot disc, a tight halo, a wide bloom of light
          c += uSunCol * (smoothstep(0.9993, 0.9997, sd) * 18.0 + pow(sd, 350.0) * 2.2 + pow(sd, 24.0) * .35) * uSun;
          // clouds: a sheet above, projected so they flatten toward the horizon
          if (d.y > 0.0 && uCloud > 0.0) {
            vec2 uv = d.xz / (d.y + .12) * .55 + vec2(uTime * .006, uTime * .002);
            float n = fbm(uv * 1.6);
            float cov = smoothstep(.62 - uCloud * .35, .95 - uCloud * .25, n);
            float lit = clamp(fbm(uv * 1.6 + uSunDir.xz * .08) - n + .55, 0.0, 1.0);    // brighter on the side facing the sun
            vec3 cc = mix(uCloudShade, uCloudCol, lit) + uSunCol * pow(sd, 6.0) * .9 * uSun;
            c = mix(c, cc, cov * smoothstep(0.0, 0.18, d.y) * .9);
          }
          // night: a moon and stars
          c += uMoon * pow(sd, 60.0) * vec3(0.18, 0.22, 0.3);
          vec3 cell = floor(d * 180.0);
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
