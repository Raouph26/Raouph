// Step the real game at a true 60 fps and capture a strip of frames.
//   node tools/filmstrip.mjs <boss> <script> <frames> <every> <out>
// script: 'combo' | 'roll' | 'boss' | 'heavy' | 'parry'
import { chromium } from 'playwright';
const [boss = 'duck', script = 'combo', frames = 60, every = 6, out = '/tmp/claude-0/strip'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 480, height: 300 } })).newPage();
p.on('pageerror', (e) => console.log('PAGE', e.message));
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1200);
await p.evaluate((id) => window.__game.startFight(id), boss);
await p.waitForFunction(() => window.__game.phase === 'intro', null, { timeout: 60000 });
await p.evaluate(() => { const G = window.__game; G.manual = true; G.ui.fade(0, 0); G._beginCombat(); });
if (process.env.CAM === 'near') await p.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
// place the fighters side-on to the camera so motion reads
await p.evaluate(() => { const G = window.__game, f = G.fight; f.player.x = -1.6; f.player.z = 0; f.boss.x = 2.2 + f.boss.radius; f.boss.z = 0; f.player.yaw = Math.PI / 2; f.boss.yaw = -Math.PI / 2; f.boss.cd = 99; G.lockOn = false;
  G.cam.mode = 'free'; });
// CAM=near frames the frog; the default frames both fighters
const CAMS = { far: [0.4, 1.7, 7.5, 0.4, 1.3, 0], near: [-1.0, 1.25, 3.6, -1.0, 1.0, 0], boss: [0.8, 2.2, 9.5, 1.2, 1.6, 0] };
const cam = CAMS[process.env.CAM ?? 'far'];
const step = (n, act) => p.evaluate(([n, act, cam]) => { const G = window.__game; for (let i = 0; i < n; i++) { if (act && i === 0) G.input.press(act); G.frame(1 / 60); const c = G.R.camera; c.position.set(cam[0], cam[1], cam[2]); c.lookAt(cam[3], cam[4], cam[5]); G.R.render(0, G.stage); } }, [n, act, cam]);
await step(10);
const plan = {
  combo: [[0, 'light'], [16, 'light'], [32, 'light']],
  heavy: [[0, 'heavy']],
  roll: [[0, 'roll']],
  parry: [[0, 'parry']],
  boss: [],
}[script];
if (script === 'roll') await p.evaluate(() => { window.__game.input.keys.add('KeyD'); });   // roll toward the boss, side-on
if (script === 'boss') await p.evaluate(() => { const G = window.__game, b = G.fight.boss; b.cd = 0; b.moveCd = {}; b.startMove(b.moves[0]); });
for (let fr = 0; fr < +frames; fr++) {
  const act = plan.find(([t]) => t === fr)?.[1];
  await step(1, act);
  if (fr % +every === 0) await p.screenshot({ path: `${out}-${String(fr).padStart(3, '0')}.png` });
}
await b.close();
