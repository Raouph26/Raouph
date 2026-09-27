import { chromium } from 'playwright';
const files = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('console', (m) => console.log('  [c]', m.text().slice(0, 200)));
await p.goto('http://localhost:5190/tools/blank.html');
await p.waitForTimeout(1000);
for (const f of files) {
  const r = await p.evaluate(async (f) => {
    const src = await (await fetch('/src/render/kit/frog.js')).text();
    const url = src.match(/from ["']([^"']*three\.js[^"']*)["']/)[1];
    const THREE = await import(url);
    const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
    const o = await new FBXLoader().loadAsync(f);
    const out = { meshes: [], bones: [], anims: o.animations.map((a) => a.name + ':' + a.duration.toFixed(1)) };
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    out.size = box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
    out.min = box.min.toArray().map((v) => +v.toFixed(2));
    out.rootScale = o.scale.toArray();
    o.traverse((c) => {
      if (c.isBone) out.bones.push(c.name);
      if (c.isMesh) {
        const ms = [].concat(c.material);
        out.meshes.push({ n: c.name, skinned: !!c.isSkinnedMesh, v: c.geometry.attributes.position.count,
          mats: ms.map((m) => `${m.type}:${m.name} map=${m.map ? (m.map.image ? m.map.image.width : 'noimg') : '-'} nrm=${!!m.normalMap}`) });
      }
    });
    return out;
  }, f);
  console.log(f, JSON.stringify(r, null, 0));
}
await b.close();
