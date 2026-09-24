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
// place the fighters side-on to the camera so motion reads
await p.evaluate(() => { const G = window.__game, f = G.fight; f.player.x = -1.6; f.player.z = 0; f.boss.x = 2.2 + f.boss.radius; f.boss.z = 0; f.player.yaw = Math.PI / 2; f.boss.yaw = -Math.PI / 2; f.boss.cd = 99; G.lockOn = false;
  G.cam.mode = 'free'; });
const step = (n, act) => p.evaluate(([n, act]) => { const G = window.__game; for (let i = 0; i < n; i++) { if (act && i === 0) G.input.press(act); G.frame(1 / 60); const c = G.R.camera; c.position.set(0.4, 1.7, 7.5); c.lookAt(0.4, 1.3, 0); G.R.render(0, G.stage); } }, [n, act]);
await step(10);
const plan = {
  combo: [[0, 'light'], [16, 'light'], [32, 'light']],
  heavy: [[0, 'heavy']],
  roll: [[0, 'roll']],
  parry: [[0, 'parry']],
  boss: [],
}[script];
if (script === 'roll') await p.evaluate(() => { window.__game.input.move.y = 1; });
if (script === 'boss') await p.evaluate(() => { const G = window.__game, b = G.fight.boss; b.cd = 0; b.moveCd = {}; b.startMove(b.moves[0]); });
for (let fr = 0; fr < +frames; fr++) {
  const act = plan.find(([t]) => t === fr)?.[1];
  await step(1, act);
  if (fr % +every === 0) await p.screenshot({ path: `${out}-${String(fr).padStart(3, '0')}.png` });
}
await b.close();
