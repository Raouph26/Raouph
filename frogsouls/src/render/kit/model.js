import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRig } from './rig.js';
import { actorMaterial } from './builder.js';

// ─────────────────────────────────────────────────────────────────────────────
// Imported models (test hookup). A GLB made by tools/convert.mjs is a static
// mesh in T-pose, facing +Z, feet at 0. Here it's auto-rigged: the game's own
// joint hierarchy is fitted inside it from a few landmarks (shoulder, elbow,
// hip, knee… as fractions of height), every vertex is weighted to its two
// nearest bones, and the mesh is bound in T-pose. From then on every existing
// animation drives it exactly like the built characters.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = (import.meta.env?.BASE_URL ?? './');
export const MODEL_CFG = {
  hero: {
    url: 'models/hero.glb', height: 1.8,
    // fractions of height; x is distance from the centre line
    pelvis: .5, chest: .62, neck: .8, top: 1,
    shoulder: [.09, .74], elbow: [.21, .74], wrist: [.32, .74], tip: [.39, .74],
    hip: [.055, .49], knee: [.06, .27], ankle: [.065, .065], toe: .07,
    skirt: .045,
    tint: { 'Boy1|base_color_texture': 0xd8d0c4 },
    maps: { 'Boy1|base_color_texture': { map: 'Boy_01_basecolor.jpg', normal: 'Boy_01_normal.jpg', rough: 'Boy_01_roughness.jpg', metal: 'Boy_01_metallic.jpg' } },
  },
  broly: {
    url: 'models/broly.glb', height: 1.95,
    pelvis: .47, chest: .6, neck: .79, top: 1,
    shoulder: [.17, .715], elbow: [.35, .715], wrist: [.47, .715], tip: [.56, .715],
    hip: [.08, .45], knee: [.085, .24], ankle: [.09, .06], toe: .07,
    tint: {
      'BezierCurve.015|hair_F.png': 0xe6d45a, 'Material.003|hand band tex.png.001': 0xc9a44e, 'body|body tex.png.001': 0xd9a07a,
      'face|face tex.png': 0xd9a07a, 'Material.001|cloths.png': 0xf2efe6, 'Material.004|': 0xc0392b,
    },
    maps: {
      'BezierCurve.015|hair_F.png': { map: 'hair_F.png' }, 'Material.003|hand band tex.png.001': { map: 'hand band tex.png' },
      'body|body tex.png.001': { map: 'body tex.png', normal: 'body_N.png' }, 'face|face tex.png': { map: 'face tex.png' },
      'Material.001|cloths.png': { map: 'cloths.png' },
    },
  },
};

const cache = new Map();
// the artifact host serves no .glb, so published builds carry each model as base64 text
async function loadGLB(loader, url) {
  if (!import.meta.env?.PROD) return loader.loadAsync(url);
  const r = await fetch(url + '.txt');
  if (!r.ok) throw new Error(url + ' ' + r.status);
  const bin = atob((await r.text()).trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return loader.parseAsync(u8.buffer, '');
}
/** Load every configured model up front, so building a character stays synchronous. */
export async function preloadModels() {
  const loader = new GLTFLoader();
  await Promise.all([
    ...Object.entries(MODEL_CFG).map(async ([id, c]) => {
      try { cache.set(id, (await loadGLB(loader, BASE + c.url)).scene); } catch (e) { console.warn('model', id, e.message); }
    }),
    loadGLB(loader, BASE + 'models/sword.glb').then((g) => cache.set('sword', g.scene)).catch(() => {}),
  ]);
  // textures, where they've been supplied (models/tex/…); missing ones are just skipped
  const tl = new THREE.TextureLoader();
  const want = new Set();
  for (const c of Object.values(MODEL_CFG)) for (const m of Object.values(c.maps ?? {})) for (const f of Object.values(m)) want.add(f);
  await Promise.all([...want].map((f) => tl.loadAsync(BASE + 'models/tex/' + encodeURIComponent(f)).then((t) => { t.flipY = false; cache.set('tex:' + f, t); }).catch(() => {})));
}
export const hasModel = (id) => cache.has(id);

// distance from p to segment ab
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function segDist(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const t = Math.min(1, Math.max(0, _ap.dot(_ab) / Math.max(_ab.lengthSq(), 1e-9)));
  return _ap.sub(_ab.multiplyScalar(t)).length();
}

/** A rigged character from a loaded model: same shape as buildFrog's result. */
export function buildModelCharacter(id) {
  const c = MODEL_CFG[id], src = cache.get(id);
  const H = c.height;
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  const P = {
    pelvis: V(0, c.pelvis * H), chest: V(0, c.chest * H), neck: V(0, c.neck * H), top: V(0, c.top * H),
  };
  for (const k of ['shoulder', 'elbow', 'wrist', 'tip', 'hip', 'knee', 'ankle']) for (const s of [-1, 1]) P[k + (s < 0 ? 'R' : 'L')] = V(s * c[k][0] * H, c[k][1] * H);
  for (const s of ['R', 'L']) P['toe' + s] = V(P['ankle' + s].x, 0, c.toe * H * 1.8);

  // fit the joints: every group sits at its landmark in T-pose
  const rig = createRig('normal');
  const J = rig.joints, S = rig.spec;
  S.hipH = P.pelvis.y;
  J.pelvis.position.set(0, P.pelvis.y, 0);
  J.spine.position.set(0, (P.chest.y - P.pelvis.y) * .35, 0);
  J.chest.position.set(0, P.chest.y - P.pelvis.y - J.spine.position.y, 0);
  J.neck.position.set(0, P.neck.y - P.chest.y, 0);
  for (const s of ['R', 'L']) {
    const sh = J['upper' + s].parent, el = J['fore' + s].parent, wr = J['hand' + s].parent;
    sh.position.set(P['shoulder' + s].x, P['shoulder' + s].y - P.chest.y, 0);
    el.position.set(0, -P['shoulder' + s].distanceTo(P['elbow' + s]), 0);
    wr.position.set(0, -P['elbow' + s].distanceTo(P['wrist' + s]), 0);
    // T-pose: the arm's rest axis (-y) turned out to the side
    J['upper' + s].rotation.set(0, 0, s === 'R' ? -Math.PI / 2 : Math.PI / 2);
    const hp = J['thigh' + s].parent, kn = J['shin' + s].parent, an = J['foot' + s].parent;
    hp.position.set(P['hip' + s].x, P['hip' + s].y - P.pelvis.y, 0);
    kn.position.set(P['knee' + s].x - P['hip' + s].x, P['knee' + s].y - P['hip' + s].y, 0);
    an.position.set(P['ankle' + s].x - P['knee' + s].x, P['ankle' + s].y - P['knee' + s].y, 0);
  }
  rig.root.updateMatrixWorld(true);

  // bones and the segments that claim vertices for them (bind pose, root space)
  const bones = [], segs = [];
  const bone = (j) => { let i = bones.indexOf(j); if (i < 0) i = bones.push(j) - 1; return i; };
  const seg = (j, a, b) => segs.push({ b: bone(j), a: a.clone(), c: b.clone() });
  const L = (a, b, t) => a.clone().lerp(b, t);
  seg(J.pelvis, P.pelvis, J.chest.getWorldPosition(new THREE.Vector3()).lerp(P.pelvis, .6));
  seg(J.pelvis, L(P.hipR, P.hipL, .15), L(P.hipR, P.hipL, .85));
  if (c.skirt) seg(J.pelvis, P.pelvis, V(0, P.kneeR.y * .8));
  seg(J.spine, J.spine.getWorldPosition(new THREE.Vector3()), P.chest);
  seg(J.chest, P.chest, P.neck);
  seg(J.chest, L(P.shoulderR, P.shoulderL, .2), L(P.shoulderR, P.shoulderL, .8));
  seg(J.head, P.neck, P.top);
  for (const s of ['R', 'L']) {
    seg(J['upper' + s], L(P['shoulder' + s], P['elbow' + s], .2), P['elbow' + s]);
    seg(J['fore' + s], P['elbow' + s], P['wrist' + s]);
    seg(J['hand' + s], P['wrist' + s], P['tip' + s]);
    seg(J['thigh' + s], L(P['hip' + s], P['knee' + s], .12), P['knee' + s]);
    seg(J['shin' + s], P['knee' + s], P['ankle' + s]);
    seg(J['foot' + s], P['ankle' + s], P['toe' + s]);
  }

  const pelvisBone = bone(J.pelvis);
  const legBones = new Set(['thighR', 'thighL', 'shinR', 'shinL'].map((k) => bone(J[k])));
  const u0 = actorMaterial({ rim: 0xffe3b8, rimStrength: .35 });
  const shared = u0.userData.u;
  const skeleton = new THREE.Skeleton(bones);
  const k = H / src.userData.__h;
  const p = new THREE.Vector3();
  let first = null;
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.scale(k, k, k);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position, i);
      let b1 = 0, d1 = Infinity, b2 = 0, d2 = Infinity;
      const best = new Map();
      for (const s of segs) { const d = segDist(p, s.a, s.c); const cur = best.get(s.b); if (cur === undefined || d < cur) best.set(s.b, d); }
      for (const [b, d] of best) { if (d < d1) { b2 = b1; d2 = d1; b1 = b; d1 = d; } else if (d < d2) { b2 = b; d2 = d; } }
      let w1 = d2 ** 4 / (d1 ** 4 + d2 ** 4 + 1e-12);
      // a long coat: cloth well away from the leg follows the hips, so a
      // raised knee lifts the leg inside the coat instead of tearing it
      if (c.skirt && legBones.has(b1) && p.y < P.pelvis.y) {
        const f = Math.min(1, Math.max(0, (d1 - c.skirt * H) / (c.skirt * H * 1.2)));
        if (f > 0) { b2 = pelvisBone; w1 = 1 - f; }
      }
      si[i * 4] = b1; sw[i * 4] = w1; si[i * 4 + 1] = b2; sw[i * 4 + 1] = 1 - w1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const col = new Float32Array(n * 3);
    const tint = new THREE.Color(c.tint?.[o.material.name] ?? 0xcccccc);
    const maps = c.maps?.[o.material.name] ?? {};
    const tex = (f) => (f ? cache.get('tex:' + f) : null);
    if (tex(maps.map)) tint.set(0xffffff);
    for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const m = first ? actorMaterial({ rim: 0xffe3b8, rimStrength: .35 }, shared) : u0;
    m.roughness = .7; m.metalness = .05;
    m.map = tex(maps.map); if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    m.normalMap = tex(maps.normal); m.roughnessMap = tex(maps.rough); m.metalnessMap = tex(maps.metal);
    if (m.metalnessMap) m.metalness = 1;
    if (m.roughnessMap) m.roughness = 1;
    const key = `actor-m${!!m.map}${!!m.normalMap}${!!m.roughnessMap}${!!m.metalnessMap}`;
    m.customProgramCacheKey = () => key;
    const mesh = new THREE.SkinnedMesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial();
    rig.root.add(mesh);
    mesh.bind(skeleton);
    rig.meshes.push(mesh);
    first ??= mesh;
  });
  rig.skinned = first;
  // back to the rest pose the animations expect (arms down); they overwrite it anyway
  for (const s of ['R', 'L']) J['upper' + s].rotation.set(0, 0, 0);
  return { rig, material: u0, scarf: [], kind: 'model', palette: {}, height: H };
}

/** The imported sword, authored point-down: turned blade-up with the grip at 0. */
export function buildModelSword(material) {
  const src = cache.get('sword');
  const g = new THREE.Group();
  const len = 1.35, grip = .9;                       // grip at 90% of the length from the tip
  src.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    const h = src.userData.__h;
    geo.scale(len / h, len / h, len / h);
    geo.rotateX(Math.PI);
    geo.translate(0, len * grip, 0);
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(.8), 3));
    const mt = new Float32Array(n * 2); for (let i = 0; i < n; i++) { mt[i * 2] = .25; mt[i * 2 + 1] = .9; }
    geo.setAttribute('aMat', new THREE.BufferAttribute(mt, 2));
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    g.add(m);
  });
  const base = new THREE.Object3D(); base.position.y = len * .3;
  const tip = new THREE.Object3D(); tip.position.y = len * grip;
  g.add(base, tip);
  g.userData = { base, tip, id: 'model-sword' };
  return g;
}

// record each source's height once it's loaded (the GLBs carry their own scale)
const _set = cache.set.bind(cache);
cache.set = (k, v) => {
  if (v?.isObject3D) { v.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(v); v.userData.__h = b.max.y - b.min.y; }
  return _set(k, v);
};
