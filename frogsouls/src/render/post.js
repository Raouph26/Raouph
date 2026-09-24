import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing, built for phones. The scene renders once into an HDR target
// (multisampled where the quality allows), then:
//   bloom   — a dual-filter chain: bright-pass to ½ res, down to 1/16, back up.
//             Nine small passes in total, versus ~13 for three's Unreal bloom.
//   final   — ONE full-screen pass: bloom add, exposure, ACES, sRGB, then the
//             grade (saturation, contrast, tint, vignette, grain) and the
//             combat overlays (chromatic kick, flash, hurt edges, fade).
// ─────────────────────────────────────────────────────────────────────────────

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const prefilterMat = () => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: .8 }, uKnee: { value: .35 } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee; varying vec2 vUv;
    void main(){
      // 4-tap box average: tames single-pixel sparkles before they bloom
      vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-.5, -.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.5, -.5)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2(-.5, .5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.5, .5)).rgb;
      c *= .25;
      float br = max(c.r, max(c.g, c.b));
      float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
      soft = soft * soft / (4.0 * uKnee + 1e-4);
      float w = max(soft, br - uThreshold) / max(br, 1e-4);
      gl_FragColor = vec4(min(c * w, vec3(64.0)), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

const downMat = () => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tSrc; uniform vec2 uHalf; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
      s += texture2D(tSrc, vUv - uHalf).rgb;
      s += texture2D(tSrc, vUv + uHalf).rgb;
      s += texture2D(tSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb;
      s += texture2D(tSrc, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
      gl_FragColor = vec4(s / 8.0, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

const upMat = () => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, tAdd: { value: null }, uHalf: { value: new THREE.Vector2() }, uSpread: { value: .8 } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tSrc, tAdd; uniform vec2 uHalf; uniform float uSpread; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tSrc, vUv + vec2(-uHalf.x * 2.0, 0.0)).rgb;
      s += texture2D(tSrc, vUv + vec2(-uHalf.x, uHalf.y)).rgb * 2.0;
      s += texture2D(tSrc, vUv + vec2(0.0, uHalf.y * 2.0)).rgb;
      s += texture2D(tSrc, vUv + vec2(uHalf.x, uHalf.y)).rgb * 2.0;
      s += texture2D(tSrc, vUv + vec2(uHalf.x * 2.0, 0.0)).rgb;
      s += texture2D(tSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb * 2.0;
      s += texture2D(tSrc, vUv + vec2(0.0, -uHalf.y * 2.0)).rgb;
      s += texture2D(tSrc, vUv + vec2(-uHalf.x, -uHalf.y)).rgb * 2.0;
      gl_FragColor = vec4(s / 12.0 * uSpread + texture2D(tAdd, vUv).rgb, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

const finalMat = () => new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: null }, tBloom: { value: null }, uBloom: { value: .6 }, uExposure: { value: 1 }, uBloomOn: { value: 1 },
    uTime: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: .5 }, uGrain: { value: .045 }, uAberration: { value: 0 }, uFlash: { value: 0 }, uHurt: { value: 0 },
    uBlue: { value: 0 }, uFade: { value: 0 }, uAspect: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure, uBloomOn;
    uniform float uTime, uSat, uContrast, uVignette, uGrain, uAberration, uFlash, uHurt, uBlue, uFade, uAspect; uniform vec3 uTint;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c = inM * (c * uExposure / 0.6); c = RRTAndODTFit(c); return clamp(outM * c, 0.0, 1.0);
    }
    vec3 srgb(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    vec3 hdr(vec2 uv){ return texture2D(tScene, uv).rgb + texture2D(tBloom, uv).rgb * uBloom * uBloomOn; }
    void main(){
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(uAspect, 1.0));
      vec3 c;
      if (uAberration > 0.002) {
        vec2 off = d * uAberration * 0.02;
        c = vec3(hdr(vUv + off).r, hdr(vUv).g, hdr(vUv - off).b);
      } else c = hdr(vUv);
      c = srgb(aces(c));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      c = mix(c, vec3(dot(c, vec3(.3, .4, .3))) * vec3(.35, .55, 1.4), uBlue);
      c *= 1.0 - uVignette * smoothstep(0.35, 0.95, r);
      c = mix(c, vec3(0.5, 0.02, 0.02), min(uHurt, 0.6) * smoothstep(0.62, 1.05, r));
      c += (rand(vUv * 800.0 + uTime) - 0.5) * uGrain;
      c = mix(c, vec3(1.0), uFlash);
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

export class Post {
  constructor(gl) {
    this.gl = gl;
    this.levels = 4;                             // ½, ¼, ⅛, 1/16
    const rt = (o = {}) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
    this.scene = rt({ depthBuffer: true, samples: 0 });
    this.down = Array.from({ length: this.levels }, () => rt());
    this.up = Array.from({ length: this.levels - 1 }, () => rt());
    this.pre = prefilterMat(); this.dn = downMat(); this.upm = upMat(); this.fin = finalMat();
    this.quad = new FullScreenQuad(this.pre);
    this.bloom = true;
    this.samples = 0;
  }

  get uniforms() { return this.fin.uniforms; }

  setSamples(n) {
    if (n === this.samples) return;
    this.samples = n;
    this.scene.dispose();
    this.scene = new THREE.WebGLRenderTarget(this.w || 1, this.h || 1, { type: THREE.HalfFloatType, depthBuffer: true, samples: n });
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.scene.setSize(w, h);
    let bw = w, bh = h;
    for (let i = 0; i < this.levels; i++) {
      bw = Math.max(1, Math.round(bw / 2)); bh = Math.max(1, Math.round(bh / 2));
      this.down[i].setSize(bw, bh);
      if (i < this.levels - 1) this.up[i].setSize(bw, bh);
    }
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.quad.render(this.gl);
  }

  render(scene, camera) {
    const gl = this.gl;
    gl.setRenderTarget(this.scene);
    gl.render(scene, camera);

    const f = this.fin.uniforms;
    if (this.bloom) {
      const src = this.scene.texture;
      this.pre.uniforms.tSrc.value = src;
      this.pre.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
      this._pass(this.pre, this.down[0]);
      for (let i = 1; i < this.levels; i++) {
        const s = this.down[i - 1];
        this.dn.uniforms.tSrc.value = s.texture;
        this.dn.uniforms.uHalf.value.set(.5 / s.width, .5 / s.height);
        this._pass(this.dn, this.down[i]);
      }
      // back up: each level adds the one below, blurred
      let low = this.down[this.levels - 1];
      for (let i = this.levels - 2; i >= 0; i--) {
        this.upm.uniforms.tSrc.value = low.texture;
        this.upm.uniforms.tAdd.value = this.down[i].texture;
        this.upm.uniforms.uHalf.value.set(.5 / low.width, .5 / low.height);
        this._pass(this.upm, this.up[i]);
        low = this.up[i];
      }
      f.tBloom.value = this.up[0].texture;
      f.uBloomOn.value = 1;
    } else {
      f.tBloom.value = this.scene.texture;
      f.uBloomOn.value = 0;
    }
    f.tScene.value = this.scene.texture;
    f.uAspect.value = this.w / this.h;
    this._pass(this.fin, null);
  }
}
