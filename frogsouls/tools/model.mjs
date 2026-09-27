// Studio portraits of characters: a turntable on a grey sweep, no game around it.
//   node tools/model.mjs <out-prefix> <frog|bossId> [...]
// env: ANG (comma list of yaw angles, default 0.5,2.6) POSE=1 (a mid-swing pose)
import { chromium } from 'playwright';
const [out, ...ids] = process.argv.slice(2);
const angs = (process.env.ANG ?? '0.5,2.6').split(',').map(Number);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 520, height: 620 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5190/tools/blank.html'); await p.waitForTimeout(800);
if (process.env.POSE) await p.evaluate(() => { window.__POSE = 1; });
for (const id of ids) for (const a of angs) {
  const t = await p.evaluate(async ([id, a]) => {
    const src = await (await fetch('/src/render/kit/frog.js')).text();
    const url = src.match(/from ["']([^"']*three\.js[^"']*)["']/)[1];
    const THREE = await import(url);
    const { buildFrog } = await import('/src/render/kit/frog.js');
    const { buildBoss } = await import('/src/render/kit/boss.js');
    const { BOSSES } = await import('/src/content/bosses.js');
    const M = await import('/src/render/kit/model.js');
    if (!window.__pre) { await M.preloadModels(); window.__pre = 1; }
    const { pose } = await import('/src/render/anim/pose.js');
    const { applyPose } = await import('/src/render/kit/rig.js');
    const t0 = performance.now();
    let root, h = 1.9, rig;
    if (id === 'frog') { rig = buildFrog('hero').rig; root = rig.root; }
    else if (M.MODEL_CFG[id]) { rig = M.buildModelCharacter(id).rig; root = rig.root; }
    else { const def = BOSSES[id]; const bb = buildBoss(def); root = bb.root; rig = bb.rig; h = 2.4; }
    if (window.__POSE && rig) applyPose(rig, pose({ rRaise: 1.3, rOut: .3, rElbow: 1.2, lRaise: .3, lOut: .9, lElbow: .4, rHip: .7, rKnee: 1.0, lHip: -.3, lKnee: .3, spineTwist: .3, lean: .2 }));
    const ms = performance.now() - t0;
    const r = window.__r ??= new THREE.WebGLRenderer({ antialias: true });
    r.setSize(520, 620); document.body.appendChild(r.domElement);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x6c7078);
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x403830, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.6); sun.position.set(3, 6, 4); sun.castShadow = true; sc.add(sun);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshStandardMaterial({ color: 0x777b80 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; sc.add(fl);
    root.rotation.y = a; sc.add(root);
    const box = new THREE.Box3().setFromObject(root); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, 520 / 620, .1, 100);
    const d = Math.max(s.y, s.x) * 2.1; cam.position.set(0, c.y + s.y * .15, d); cam.lookAt(c);
    r.render(sc, cam);
    let tris = 0; root.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return { ms: Math.round(ms), tris: Math.round(tris) };
  }, [id, a]);
  console.log(id, a, JSON.stringify(t));
  await p.screenshot({ path: `${out}-${id}-${a}.png` });
}
if (errs.length) console.log('ERR', errs.slice(0, 5).join('\n'));
await b.close();
