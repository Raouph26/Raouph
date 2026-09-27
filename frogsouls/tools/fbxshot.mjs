import { chromium } from 'playwright';
const [f, out, yaw = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 700, height: 700 } })).newPage();
await p.goto('http://localhost:5190/tools/blank.html'); await p.waitForTimeout(800);
await p.evaluate(async ([f, yaw]) => {
  const src = await (await fetch('/src/render/kit/frog.js')).text();
  const THREE = await import(src.match(/from ["']([^"']*three\.js[^"']*)["']/)[1]);
  const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
  const o = await new FBXLoader().loadAsync(f);
  o.traverse((c) => { if (c.isMesh) c.material = new THREE.MeshNormalMaterial(); });
  const r = new THREE.WebGLRenderer(); r.setSize(700, 700); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x333333); o.rotation.y = +yaw; sc.add(o);
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const m = Math.max(s.x, s.y, s.z) * .55;
  const cam = new THREE.OrthographicCamera(-m, m, m, -m, -1e5, 1e5); cam.position.set(c.x, c.y, c.z + 1000); cam.lookAt(c);
  // grid lines every 10% of height
  for (let i = 0; i <= 10; i++) { const y = box.min.y + s.y * i / 10; const g = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x - m, y, c.z + s.z), new THREE.Vector3(c.x + m, y, c.z + s.z)]), new THREE.LineBasicMaterial({ color: i % 5 ? 0x777777 : 0xffff00 })); sc.add(g); }
  for (let i = -5; i <= 5; i++) { const x = c.x + s.y * i / 10; const g = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, c.y - m, c.z + s.z), new THREE.Vector3(x, c.y + m, c.z + s.z)]), new THREE.LineBasicMaterial({ color: i ? 0x777777 : 0x00ffff })); sc.add(g); }
  r.render(sc, cam);
}, [f, yaw]);
await p.screenshot({ path: out });
await b.close();
