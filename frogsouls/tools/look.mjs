// Screenshot real fights as the player sees them (lock-on camera, HUD on).
//   node tools/look.mjs <out-prefix> <bossId> [bossId...]
// env: W H (viewport, default phone landscape 844×390), TOUCH=0 for desktop UI,
//      DIST (frog↔boss gap), FRAMES (settle frames), FREE=1 for the free camera
import { chromium } from 'playwright';
const [out, ...ids] = process.argv.slice(2);
const W = +(process.env.W ?? 844), H = +(process.env.H ?? 390), touch = process.env.TOUCH !== '0';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1500);
for (const id of ids) {
  await p.evaluate((id) => window.__game.startFight(id), id);
  await p.waitForFunction(() => window.__game.phase === 'intro', null, { timeout: 60000 });
  await p.evaluate(([dist, frames, free]) => {
    const G = window.__game; G.manual = true; G.ui.fade(0, 0); G._beginCombat();
    const f = G.fight;
    f.player.x = 0; f.player.z = 6; f.player.yaw = Math.PI;
    f.boss.x = 0; f.boss.z = 6 - dist - f.boss.radius; f.boss.yaw = 0; f.boss.cd = 99;
    G.lockOn = !free; G.cam.snap = true;
    for (let i = 0; i < frames; i++) { f.boss.cd = 99; G.frame(1 / 60); }
  }, [+(process.env.DIST ?? 4), +(process.env.FRAMES ?? 50), process.env.FREE === '1']);
  await p.waitForTimeout(1300);                     // let CSS transitions (intro card, HUD) finish
  await p.evaluate(() => { const G = window.__game; G.fight.boss.cd = 99; G.frame(1 / 60); });
  await p.screenshot({ path: `${out}-${id}.png` });
  if (process.env.PORTRAIT) {
    // face-on close-ups of both fighters, HUD hidden
    await p.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; });
    for (const who of ['player', 'boss']) {
      await p.evaluate((who) => {
        const G = window.__game, f = G.fight, e = f[who], h = who === 'boss' ? e.height : 1.9;
        G.R.setViewShift(0);
        const c = G.R.camera, d = h * 1.25 + 1.2;
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
        c.position.set(e.x + fx * d + fz * d * .35, h * .72, e.z + fz * d - fx * d * .35);
        c.lookAt(e.x, h * .5, e.z);
        G.R.render(0, G.stage);
      }, who);
      await p.screenshot({ path: `${out}-${id}-${who}.png` });
    }
    await p.evaluate(() => { document.getElementById('ui').style.visibility = ''; });
  }
  await p.evaluate(() => { const G = window.__game; G.manual = false; G._leaveFight?.(); });
}
if (errs.length) console.log('ERRORS:', errs.slice(0, 5).join('\n'));
await b.close();
