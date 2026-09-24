import * as THREE from 'three';
import { LOOKS } from './looks.js';
import { Sky } from './env/sky.js';
import { Water } from './env/water.js';
import { ENVS } from './env/worlds.js';
import { Ambient } from './fx/particles.js';
import { groundTexture } from './textures.js';
import { ACTOR_FILL, ACTOR_ENV } from './kit/builder.js';
import { WIND } from './env/props.js';

// ─────────────────────────────────────────────────────────────────────────────
// The stage: lights, sky, floor, water, set dressing and the air, for whichever
// world is loaded. Looks change by easing every value toward the new target,
// so a palette shift mid-fight (the Blue Screen) is a transition, not a cut.
// ─────────────────────────────────────────────────────────────────────────────

const C = (h) => new THREE.Color(h);
const NUM_KEYS = ['fog', 'exposure', 'key', 'amb', 'rim', 'moon', 'fill', 'bloom', 'vignette', 'sat', 'contrast'];
const COL_KEYS = ['fogCol', 'skyTop', 'skyHor', 'keyCol', 'ambSky', 'ambGnd', 'rimCol'];
const WHITE = new THREE.Color(0xffffff);

export class Stage {
  constructor(scene) {
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0x101820, 0.03);

    this.hemi = new THREE.HemisphereLight(0x4a6a8e, 0x1b221c, 1.2);
    this.key = new THREE.DirectionalLight(0xbcd2ff, 1.9);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    // a tight box around the fight: sharper shadows from the same map
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 90;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.025;
    this.rim = new THREE.DirectionalLight(0x7fd0c0, 1.6);
    scene.add(this.hemi, this.key, this.key.target, this.rim);

    this.sky = new Sky(scene);
    this.water = new Water(scene);
    this.ambient = new Ambient(scene);

    // floor: a textured disc for island worlds, a wide plane for indoor ones
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    this.island = new THREE.Mesh(new THREE.CylinderGeometry(21, 21.6, .6, 64, 1), [this.groundMat, this.groundMat, this.groundMat]);
    this.island.position.y = -.3;
    this.island.receiveShadow = true;
    this.plane = new THREE.Mesh(new THREE.CircleGeometry(140, 64), this.groundMat);
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.receiveShadow = true;
    scene.add(this.island, this.plane);

    // the flagstone rings: the one thing every world has in common
    this.rings = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xcfd8e0, transparent: true, opacity: .11, depthWrite: false });
    for (let i = 1; i <= 5; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(i * 3.6, i * 3.6 + .07, 128), this.ringMat);
      r.rotation.x = -Math.PI / 2; r.position.y = .015;
      this.rings.add(r);
    }
    scene.add(this.rings);

    this.envGroup = new THREE.Group();
    scene.add(this.envGroup);
    this.env = null;
    this.envId = null;
    this.t = 0;

    this.cur = this._lookState(LOOKS.hub);
    this.target = this._lookState(LOOKS.hub);
    this.dim = 0;
  }

  _lookState(L) {
    return {
      fog: L.fog, fogCol: C(L.fogCol), skyTop: C(L.skyTop), skyHor: C(L.skyHor), exposure: L.exposure,
      key: L.key, keyCol: C(L.keyCol), amb: L.amb, ambSky: C(L.ambSky), ambGnd: C(L.ambGnd), rim: L.rim, rimCol: C(L.rimCol),
      sun: L.sun, ele: L.ele, moon: L.moon ? 1 : 0, fill: L.fill ?? .3, bloom: L.bloom, vignette: L.vignette, sat: L.sat, contrast: L.contrast,
      tint: new THREE.Vector3(...L.tint),
    };
  }

  setLook(name, instant = false) {
    this.lookName = name;
    this.target = this._lookState(LOOKS[name] ?? LOOKS.hub);
    if (instant) this.cur = this._lookState(LOOKS[name] ?? LOOKS.hub);
    this._bakeEnv(LOOKS[name] ?? LOOKS.hub);
  }

  /** The renderer, for baking reflection maps. */
  setRenderer(gl) { this.gl = gl; this.pmrem = new THREE.PMREMGenerator(gl); }

  /**
   * Bake this look's sky into a small prefiltered environment map for the
   * actors: their sky above, their ground below, and a hot spot where the key
   * light is, so glossy surfaces show a highlight that matches the scene.
   */
  _bakeEnv(L) {
    if (!this.pmrem) return;
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      this.envU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) } };
      const m = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms: this.envU,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uTop, uHor, uGnd, uSun, uSunDir; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            vec3 c = d.y > 0.0 ? mix(uHor, uTop, pow(d.y, .6)) : mix(uHor, uGnd, pow(-d.y, .45));
            float s = max(dot(d, uSunDir), 0.0);
            c += uSun * (pow(s, 160.0) * 7.0 + pow(s, 10.0) * .35);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
    }
    const u = this.envU;
    // lift the sky a little: a dark sky still reflects something on wet skin
    u.uTop.value.set(L.skyTop).lerp(new THREE.Color(L.ambSky), .5).multiplyScalar(1.4);
    u.uHor.value.set(L.skyHor).lerp(new THREE.Color(L.fogCol), .3).multiplyScalar(1.5);
    u.uGnd.value.set(L.ambGnd).multiplyScalar(.9);
    u.uSun.value.set(L.keyCol).multiplyScalar(L.key * .6);
    const a = L.sun * Math.PI / 180, e = L.ele * Math.PI / 180;
    u.uSunDir.value.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
    const rt = this.pmrem.fromScene(this.envScene, .02);
    const old = this.envRT;
    this.envRT = rt;
    ACTOR_ENV.set(rt.texture, .75);
    old?.dispose();
  }

  setWorld(envId) {
    if (envId === this.envId) return;
    this.envId = envId;
    for (const c of [...this.envGroup.children]) {
      this.envGroup.remove(c);
      c.traverse?.((o) => { o.geometry?.dispose?.(); });
    }
    this.env = (ENVS[envId] ?? ENVS.hub)(this.envGroup);
    const e = this.env;
    this.groundMat.map = groundTexture(e.ground ?? 'mud');
    this.groundMat.needsUpdate = true;
    const hasWater = !!e.water;
    this.water.mesh.visible = hasWater;
    this.island.visible = hasWater;
    this.plane.visible = !hasWater;
    if (hasWater) {
      const w = this.water.u;
      w.uDeep.value.set(e.water.deep); w.uShallow.value.set(e.water.shallow); w.uSky.value.set(e.water.sky); w.uLight.value.set(e.water.light);
    }
    this.ambient.set(e.ambient ?? { count: 0 });
  }

  update(dt, camera, quality) {
    this.t += dt;
    WIND.uTime.value = this.t % 1000;
    const k = 1 - Math.exp(-2.2 * dt), c = this.cur, t = this.target;
    for (const key of NUM_KEYS) c[key] += (t[key] - c[key]) * k;
    ACTOR_FILL.value = c.fill * (1 - this.dim * .6);
    c.sun += (t.sun - c.sun) * k; c.ele += (t.ele - c.ele) * k;
    for (const key of COL_KEYS) c[key].lerp(t[key], k);
    c.tint.lerp(t.tint, k);

    const dim = 1 - this.dim;
    this.scene.fog.color.copy(c.fogCol);
    this.scene.fog.density = c.fog;
    this.hemi.intensity = c.amb * dim; this.hemi.color.copy(c.ambSky); this.hemi.groundColor.copy(c.ambGnd);
    this.key.intensity = c.key * dim; this.key.color.copy(c.keyCol);
    this.rim.intensity = c.rim * dim; this.rim.color.copy(c.rimCol);
    const a = c.sun * Math.PI / 180, e = c.ele * Math.PI / 180;
    // the shadow frustum follows the camera's focus so the fight stays covered
    const fx = camera.userData.focus?.x ?? 0, fz = camera.userData.focus?.z ?? 0;
    this.key.position.set(fx + Math.sin(a) * Math.cos(e) * 40, Math.sin(e) * 40 + 4, fz + Math.cos(a) * Math.cos(e) * 40);
    this.key.target.position.set(fx, 0, fz);
    this.rim.position.set(-Math.sin(a) * 20, 9, -Math.cos(a) * 20);
    this.sky.u.uTop.value.copy(c.skyTop); this.sky.u.uHor.value.copy(c.skyHor); this.sky.u.uMoon.value = c.moon;
    this.ringMat.color.copy(c.keyCol).lerp(WHITE, .3);
    this.water.u.uLightDir.value.set(Math.sin(a), Math.sin(e) + .2, Math.cos(a)).normalize();

    this.sky.update(dt, camera);
    this.water.update(dt);
    this.ambient.update(dt, quality.pointScale);
    this.env?.update?.(dt, this.t);
  }

  /** Values the final grading pass reads. */
  get grade() { return this.cur; }
}
