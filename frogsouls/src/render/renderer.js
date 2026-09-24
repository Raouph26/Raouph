import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ─────────────────────────────────────────────────────────────────────────────
// Renderer + post. Bloom for telegraphs, eyes and screens; then one grading
// pass: saturation, contrast, tint, vignette, grain, a chromatic kick on big
// hits, the parry flash, damage edges and the Blue Screen's tint.
// Quality presets trade shadow size, bloom and resolution; 'auto' also scales
// resolution live to hold frame rate on phones.
// ─────────────────────────────────────────────────────────────────────────────

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: .5 }, uGrain: { value: .05 }, uAberration: { value: 0 }, uFlash: { value: 0 }, uHurt: { value: 0 },
    uBlue: { value: 0 }, uFade: { value: 0 }, uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSat, uContrast, uVignette, uGrain, uAberration, uFlash, uHurt, uBlue, uFade, uAspect; uniform vec3 uTint;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(uAspect, 1.0));
      vec2 off = d * uAberration * 0.02;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      c = mix(c, vec3(dot(c, vec3(.3,.4,.3))) * vec3(.35, .55, 1.4), uBlue);
      c *= 1.0 - uVignette * smoothstep(0.35, 0.95, r);
      c = mix(c, vec3(0.55, 0.02, 0.02), uHurt * smoothstep(0.45, 1.0, r));
      c += (rand(vUv * 800.0 + uTime) - 0.5) * uGrain;
      c = mix(c, vec3(1.0), uFlash);
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export const QUALITY = {
  low:    { pixelRatio: 0.85, shadow: 0,    bloom: false, antialias: false, pointScale: 1 },
  medium: { pixelRatio: 1.25, shadow: 1024, bloom: true,  antialias: false, pointScale: 1 },
  high:   { pixelRatio: 2.0,  shadow: 2048, bloom: true,  antialias: true,  pointScale: 1 },
};

export class Renderer {
  constructor(container, qualityName = 'auto') {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.auto = qualityName === 'auto';
    this.qName = this.auto ? (coarse ? 'medium' : 'high') : qualityName;
    this.q = { ...QUALITY[this.qName] };

    this.gl = new THREE.WebGLRenderer({ antialias: this.q.antialias, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.shadowMap.enabled = this.q.shadow > 0;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.gl.domElement);
    this.container = container;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    this.camera.userData.focus = new THREE.Vector3();

    this.composer = new EffectComposer(this.gl);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .6, .55, .82);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    // grade AFTER tonemapping: contrast and saturation belong in display space,
    // where a contrast pivot of 0.5 doesn't crush every shadow to black
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);

    this.fx = { flash: 0, hurt: 0, aberration: 0, blue: 0, fade: 0 };
    this.scale = 1;              // live resolution scale for 'auto'
    this._ft = [];
    this.t = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    this.auto = name === 'auto';
    this.qName = this.auto ? (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high') : name;
    this.q = { ...QUALITY[this.qName] };
    this.scale = 1;
    this.gl.shadowMap.enabled = this.q.shadow > 0;
    this.resize();
  }

  get pixelRatio() { return Math.min(devicePixelRatio || 1, this.q.pixelRatio) * this.scale; }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * this.pixelRatio * .5, h * this.pixelRatio * .5);
    this.grade.uniforms.uAspect.value = w / h;
    this.pointScale = (h * this.pixelRatio) / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
  }

  /** Hold ~50+ fps on phones by trading resolution, in small steps. */
  _adapt(dt) {
    if (!this.auto) return;
    this._ft.push(dt);
    if (this._ft.length < 45) return;
    const avg = this._ft.reduce((a, b) => a + b, 0) / this._ft.length;
    this._ft.length = 0;
    const before = this.scale;
    if (avg > 1 / 45 && this.scale > .55) this.scale = Math.max(.55, this.scale - .1);
    else if (avg < 1 / 58 && this.scale < 1) this.scale = Math.min(1, this.scale + .05);
    if (before !== this.scale) this.resize();
  }

  render(dt, stage) {
    this.t += dt;
    this._adapt(dt);
    const g = stage.grade, u = this.grade.uniforms;
    this.gl.toneMappingExposure = g.exposure;
    u.uTime.value = this.t;
    u.uSat.value = g.sat; u.uContrast.value = g.contrast; u.uTint.value.copy(g.tint);
    u.uVignette.value = g.vignette;
    u.uGrain.value = this.qName === 'low' ? 0 : .045;
    const f = this.fx;
    f.flash *= Math.exp(-9 * dt); f.hurt *= Math.exp(-3 * dt); f.aberration *= Math.exp(-8 * dt);
    u.uFlash.value = f.flash; u.uHurt.value = f.hurt; u.uAberration.value = f.aberration; u.uBlue.value = f.blue; u.uFade.value = f.fade;
    this.bloom.enabled = this.q.bloom;
    this.bloom.strength = g.bloom;
    const shadowSize = this.q.shadow;
    if (shadowSize && stage.key.shadow.mapSize.x !== shadowSize) {
      stage.key.shadow.mapSize.set(shadowSize, shadowSize);
      stage.key.shadow.map?.dispose(); stage.key.shadow.map = null;
    }
    stage.key.castShadow = shadowSize > 0;
    this.composer.render(dt);
  }
}
