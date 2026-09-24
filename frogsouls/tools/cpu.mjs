// CPU cost per frame (render skipped) and heap churn during a fight.
//   node tools/cpu.mjs [bossId] [frames]
import { chromium } from 'playwright';
const [boss = 'duck', frames = 600] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
p.on('pageerror', (e) => console.log('PAGE', e.message));
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1200);
await p.evaluate((id) => window.__game.startFight(id), boss);
await p.waitForFunction(() => window.__game.phase === 'intro', null, { timeout: 60000 });
const r = await p.evaluate((n) => {
  const G = window.__game; G.manual = true; G.ui.fade(0, 0); G._beginCombat();
  const realRender = G.R.render.bind(G.R); G.R.render = () => {};
  // a bot drives the frog so the frame exercises attacks, rolls and hits
  const keys = ['light', 'light', 'roll', 'heavy', 'parry', 'light', 'roll'];
  for (let i = 0; i < 120; i++) G.frame(1 / 60);
  window.gc?.();
  const h0 = performance.memory.usedJSHeapSize;
  let t = 0, worst = 0, drops = 0, last = h0, alloc = 0;
  for (let i = 0; i < n; i++) {
    if (i % 25 === 0) G.input.press(keys[(i / 25) % keys.length | 0]);
    G.input.move.x = Math.sin(i / 40); G.input.move.y = Math.cos(i / 55);
    const a = performance.now(); G.frame(1 / 60); const d = performance.now() - a;
    t += d; worst = Math.max(worst, d);
    const h = performance.memory.usedJSHeapSize;
    if (h < last) drops++; else alloc += h - last;      // every rise is an allocation; drops are collections
    last = h;
  }
  G.R.render = realRender;
  return { avgMs: t / n, worstMs: worst, gcDrops: drops, allocKBPerFrame: alloc / 1024 / n };
}, +frames);
console.log(JSON.stringify(r, null, 1));
await b.close();
