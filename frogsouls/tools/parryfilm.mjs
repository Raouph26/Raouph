// Film a parry → riposte: the boss swings, the frog parries on time, then ripostes.
//   node tools/parryfilm.mjs <bossId> <moveId> <every> <out-prefix>
import { chromium } from 'playwright';
const [boss = 'duck', move = 'swipe', every = 5, out = '/tmp/claude-0/pf'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 560, height: 360 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1200);
await p.evaluate((id) => window.__game.startFight(id), boss);
await p.waitForFunction(() => window.__game.phase === 'intro', null, { timeout: 60000 });
await p.evaluate((mv) => {
  const G = window.__game; G.manual = true; G.ui.fade(0, 0); G._beginCombat(); document.getElementById('ui').style.display = 'none';
  const f = G.fight;
  f.player.x = -1.3; f.player.z = 0; f.player.yaw = Math.PI / 2;
  f.boss.x = 1.3 + f.boss.radius * .6; f.boss.z = 0; f.boss.yaw = -Math.PI / 2; f.boss.cd = 99;
  G.lockOn = true;
  for (let i = 0; i < 10; i++) { f.boss.cd = 99; G.frame(1 / 60); }
  f.boss.startMove(mv);
  G._pf = { parried: false, riposted: false, n: 0 };
}, move);
for (let shot = 0; shot < 44; shot++) {
  const st = await p.evaluate((n) => {
    const G = window.__game, f = G.fight, b = f.boss, r = b.run;
    for (let i = 0; i < n; i++) {
      if (!G._pf.parried && r && r.phase === 'windup' && r.t >= r.step.windup - .07) { G.input.press('parry'); G._pf.parried = true; }
      if (G._pf.parried && !G._pf.riposted && b.ripostable && b.t > .35) { G.input.press('light'); G._pf.riposted = true; }
      b.cd = 99;
      G.frame(1 / 60);
      const c = G.R.camera; c.position.set(.2, 1.7, 5.4); c.lookAt(.2, 1.2, 0); G.R.render(0, G.stage);
    }
    return `${b.state} ${f.player.state}`;
  }, +every);
  await p.screenshot({ path: `${out}-${String(shot).padStart(2, '0')}.png` });
  if (shot % 8 === 0) console.log(shot, st);
}
if (errs.length) console.log('ERR', errs.join('\n'));
await b.close();
