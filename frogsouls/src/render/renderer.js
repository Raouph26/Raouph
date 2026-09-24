import * as THREE from 'three';
import { Post } from './post.js';

// ─────────────────────────────────────────────────────────────────────────────
// Renderer: the WebGL context, the camera, quality presets and the adaptive
// resolution that keeps phones near 60 fps. All post-processing lives in
// post.js (one HDR scene pass, a cheap bloom, one final grade pass).
// ─────────────────────────────────────────────────────────────────────────────

export const QUALITY = {
  low:    { pixelRatio: 1.0,  shadow: 0,    bloom: false, samples: 0 },
  medium: { pixelRatio: 1.5,  shadow: 1024, bloom: true,  samples: 4 },
  high:   { pixelRatio: 2.0,  shadow: 2048, bloom: true,  samples: 4 },
};

const coarse = () => matchMedia('(pointer: coarse)').matches;

export class Renderer {
  constructor(container, qualityName = 'auto') {
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;          // post.js tone maps
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.gl.domElement);
    this.container = container;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    this.camera.userData.focus = new THREE.Vector3();

    this.post = new Post(this.gl);
    this.fx = { flash: 0, hurt: 0, aberration: 0, blue: 0, fade: 0 };
    this.viewShift = 0;          // slide the picture left (fraction of width) so touch buttons don't cover the action
    this.t = 0;
    this.pointScale = 1;
    this.setQuality(qualityName);
    addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    this.auto = name === 'auto';
    this.qName = this.auto ? (coarse() ? 'medium' : 'high') : name;
    this.q = { ...QUALITY[this.qName] };
    this.scale = 1;              // live resolution scale for 'auto'
    this._ad = { n: 0, sum: 0, lastScale: 1, lastAvg: 0, hold: 0 };
    this.gl.shadowMap.enabled = this.q.shadow > 0;
    this.post.bloom = this.q.bloom;
    this.post.setSamples(this.q.samples);
    this.resize();
  }

  get pixelRatio() { return Math.min(devicePixelRatio || 1, this.q.pixelRatio) * this.scale; }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    if (this.viewShift) this.camera.setViewOffset(w, h, w * this.viewShift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const pr = this.pixelRatio;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.post.setSize(Math.round(w * pr), Math.round(h * pr));
  }

  setViewShift(v) { if (v !== this.viewShift) { this.viewShift = v; this.resize(); } }

  /**
   * Hold ~60 fps on phones by trading resolution in small steps. If dropping
   * resolution doesn't speed frames up, the cap isn't ours (battery saver's
   * 30 fps, a background tab): undo it and leave resolution alone for a while.
   */
  _adapt(dt) {
    if (!this.auto) return;
    const a = this._ad;
    if (a.hold > 0) { a.hold -= dt; return; }
    a.sum += Math.min(dt, .1); a.n++;
    if (a.n < 50) return;
    const avg = a.sum / a.n;
    a.sum = 0; a.n = 0;
    const before = this.scale;
    if (a.lastScale > this.scale && avg > a.lastAvg * .92) {
      // the last drop bought nothing: go back and stop trying for 20 s
      this.scale = a.lastScale; a.hold = 20;
    } else if (avg > 1 / 50 && this.scale > .6) {
      a.lastScale = this.scale; a.lastAvg = avg;
      this.scale = Math.max(.6, this.scale - .1);
    } else if (avg < 1 / 57 && this.scale < 1) {
      a.lastScale = this.scale; a.lastAvg = avg;
      this.scale = Math.min(1, this.scale + .05);
    } else a.lastScale = this.scale;
    if (before !== this.scale) this.resize();
  }

  render(dt, stage) {
    this.t += dt;
    this._adapt(dt);
    this.pointScale = (this.h * this.pixelRatio) / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
    const g = stage.grade, u = this.post.uniforms;
    u.uExposure.value = g.exposure;
    u.uTime.value = this.t % 100;
    u.uSat.value = g.sat; u.uContrast.value = g.contrast; u.uTint.value.copy(g.tint);
    u.uVignette.value = g.vignette;
    u.uGrain.value = this.qName === 'low' ? 0 : .04;
    u.uBloom.value = g.bloom;
    const f = this.fx;
    f.flash *= Math.exp(-9 * dt); f.hurt *= Math.exp(-3 * dt); f.aberration *= Math.exp(-8 * dt);
    u.uFlash.value = f.flash; u.uHurt.value = f.hurt; u.uAberration.value = f.aberration; u.uBlue.value = f.blue; u.uFade.value = f.fade;
    const shadowSize = this.q.shadow;
    if (shadowSize && stage.key.shadow.mapSize.x !== shadowSize) {
      stage.key.shadow.mapSize.set(shadowSize, shadowSize);
      stage.key.shadow.map?.dispose(); stage.key.shadow.map = null;
    }
    stage.key.castShadow = shadowSize > 0;
    this.post.render(this.scene, this.camera);
  }
}
