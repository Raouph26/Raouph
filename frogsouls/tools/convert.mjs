// FBX → game-ready GLB: bake transforms, face +Z, scale to height, feet at 0,
// weld and decimate (meshoptimizer), split by material. Run with vite up.
//   node tools/convert.mjs <in.fbx url> <out.glb> <height m> <yaw rad> <tris budget>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [src, out, height, yaw, budget] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('console', (m) => console.log('  ', m.text().slice(0, 300)));
await p.goto('http://localhost:5190/tools/blank.html'); await p.waitForTimeout(800);
const b64 = await p.evaluate(async ([src, height, yaw, budget]) => {
  const s = await (await fetch('/src/render/kit/frog.js')).text();
  const THREE = await import(s.match(/from ["']([^"']*three\.js[^"']*)["']/)[1]);
  const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const BU = await import('/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');
  const { MeshoptSimplifier } = await import('/node_modules/meshoptimizer/index.js');
  await MeshoptSimplifier.ready;
  const o = await new FBXLoader().loadAsync(src);
  o.rotation.y = yaw; o.updateMatrixWorld(true);
  // split every mesh by material into world-space pieces
  const groups = new Map();
  o.traverse((c) => {
    if (!c.isMesh) return;
    const mats = [].concat(c.material);
    let g = c.geometry.clone().applyMatrix4(c.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    const parts = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    const ng = g.index ? g.toNonIndexed() : g;
    for (const gr of parts) {
      const m = mats[gr.materialIndex] ?? mats[0];
      const key = (m.name || 'mat') + '|' + (m.map?.name || '');
      const piece = new THREE.BufferGeometry();
      for (const k of Object.keys(ng.attributes)) {
        const a = ng.attributes[k];
        piece.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
      }
      if (!piece.attributes.uv) piece.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gr.count * 2), 2));
      if (!groups.has(key)) groups.set(key, { m, pieces: [] });
      groups.get(key).pieces.push(piece);
    }
  });
  const box = new THREE.Box3();
  for (const { pieces } of groups.values()) for (const pc of pieces) { pc.computeBoundingBox(); box.union(pc.boundingBox); }
  const sc = height / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const total = [...groups.values()].reduce((n, g) => n + g.pieces.reduce((a, pc) => a + pc.attributes.position.count / 3, 0), 0);
  const ratio = Math.min(1, budget / total);
  console.log('tris in', total, 'ratio', ratio.toFixed(3), 'scale', sc);
  const scene = new THREE.Scene();
  for (const [key, { m, pieces }] of groups) {
    let g = BU.mergeGeometries(pieces, false);
    g.translate(-cx, -box.min.y, -cz); g.scale(sc, sc, sc);
    g = BU.mergeVertices(g, 1e-5);
    if (ratio < 1) {
      const pos = g.attributes.position.array, idx = new Uint32Array(g.index.array);
      const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
      const [res] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.02, []);
      g.setIndex(new THREE.BufferAttribute(res, 1));
    }
    // drop unused vertices
    g = BU.mergeVertices(g.toNonIndexed(), 1e-6);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ name: key, color: m.color ?? 0xffffff });
    const mesh = new THREE.Mesh(g, mat); mesh.name = key;
    scene.add(mesh);
    console.log(key, 'tris', g.index.count / 3);
  }
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true });
  const u8 = new Uint8Array(buf); let str = '';
  for (let i = 0; i < u8.length; i += 32768) str += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return btoa(str);
}, [src, +height, +yaw, +budget]);
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out, Buffer.from(b64, 'base64').length);
await b.close();
