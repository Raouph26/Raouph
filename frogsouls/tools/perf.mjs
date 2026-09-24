// Draw calls and triangles per world, mid-fight. node tools/perf.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1500);
for (const id of ['hub', 'duck', 'moderator', 'vacuum', 'deadline', 'influencer', 'algorithm', 'hitbox', 'bluescreen']) {
  if (id === 'hub') await p.evaluate(() => window.__game.enterHub());
  else { await p.evaluate((i) => window.__game.startFight(i), id); await p.waitForFunction(() => window.__game.phase === 'combat' || window.__game.phase === 'intro', null, { timeout: 60000 }); }
  await p.waitForTimeout(2500);
  const info = await p.evaluate(() => {
    const G = window.__game, gl = G.R.gl; gl.info.autoReset = false; gl.info.reset();
    G.R.render(1 / 60, G.stage);                      // exactly one frame, all passes
    const r = gl.info.render, out = { calls: r.calls, tris: r.triangles }; gl.info.autoReset = true; gl.info.reset(); return out;
  });
  console.log(id.padEnd(11), 'draw calls', String(info.calls).padStart(4), ' triangles', String(info.tris).padStart(7));
  await p.screenshot({ path: `/tmp/claude-0/perf-${id}.png` });
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
