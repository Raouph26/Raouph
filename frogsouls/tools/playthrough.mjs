// A scripted playthrough of the real game. node tools/playthrough.mjs [w h] [touch]
import { chromium } from 'playwright';
const [w = 1280, h = 720, touch] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGE: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|CERT|fonts\.g|404/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 300)); });
const tag = touch ? 'm-' : '';
const shot = (n) => p.screenshot({ path: `/tmp/claude-0/pt-${tag}${n}.png` });
const wait = (ms) => p.waitForTimeout(ms);
const g = (fn, arg) => p.evaluate(fn, arg);
const log = (...a) => console.log(...a);

await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await wait(1500);
await g(() => localStorage.clear());
if (touch) await p.touchscreen.tap(400, 300); else await p.keyboard.press('KeyX');
await wait(1500);
// NEW GAME
await g(() => window.__game.ui.menu.activate());
await wait(2200);
log('state after new game:', await g(() => window.__game.state));
await shot('1-hub');

// walk to the first portal (THE POND) and interact
await g(() => { const G = window.__game, gt = G.gates[0]; G.walker.x = gt.x; G.walker.z = gt.z; });
await wait(400);
await shot('2-portal-prompt');
await g(() => window.__game.input.press('interact'));
await wait(2000);
log('state after portal:', await g(() => `${window.__game.state} ${window.__game.world?.id}`));
await shot('3-world');

// walk to THE DUCK's gate
await g(() => { const G = window.__game, gt = G.gates[0]; G.walker.x = gt.x; G.walker.z = gt.z; });
await wait(300);
await g(() => window.__game.input.press('interact'));
await wait(1400);
await shot('4-intro');
const fps = await g(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
log('fps in this headless browser:', fps.toFixed(1));
await p.waitForFunction(() => window.__game.phase === 'combat', null, { timeout: 120000 });
await wait(500);
log('fight phase:', await g(() => `${window.__game.state} ${window.__game.phase} boss=${window.__game.fight?.boss.id}`));
await shot('5-combat');

// swing at it for a while: does damage land both ways?
const hp0 = await g(() => ({ b: window.__game.fight.boss.hp, p: window.__game.fight.player.hp, t: window.__game.fight.time }));
// keep swinging until four seconds of GAME time have passed (headless runs at a few fps)
for (let i = 0; i < 400; i++) {
  const t = await g(() => { const G = window.__game, f = G.fight; if (!f) return 99; const pl = f.player, bo = f.boss;
    const d = Math.hypot(bo.x - pl.x, bo.z - pl.z); if (d > 3) { pl.x += (bo.x - pl.x) / d * (d - 2.6); pl.z += (bo.z - pl.z) / d * (d - 2.6); }
    G.input.press('light'); return f.time; });
  if (t - hp0.t > 4) break;
  await wait(150);
  if (i === 12) await shot('6-swing');
}
const hp1 = await g(() => ({ b: window.__game.fight?.boss.hp, p: window.__game.fight?.player.hp, st: window.__game.fight?.player.state }));
log('boss hp', hp0.b, '->', hp1.b, '| player hp', hp0.p, '->', hp1.p);
await shot('7-midfight');

// force a death → YOU CROAKED → try again
await g(() => { const f = window.__game.fight; f.player.iframes = 0; f.player.enter('idle'); f.player.receiveHit({ dmg: 9999, x: f.boss.x, z: f.boss.z }); });
await wait(3500);
await shot('8-croaked');
log('menu after death:', await g(() => window.__game.ui.menuOpen));
await g(() => window.__game.ui.menu.activate());   // try again
await p.waitForFunction(() => window.__game.phase === 'combat', null, { timeout: 120000 });
log('retry:', await g(() => `${window.__game.state} ${window.__game.phase} attempt=${window.__game.attempt}`));

// force a win
await g(() => { const f = window.__game.fight; f.boss.hp = 1; f.boss.receiveHit({ dmg: 50, poise: 0 }); });
await p.waitForFunction(() => window.__game.fight?.outcome === 'won', null, { timeout: 60000 });
await wait(6000);
await shot('9-vanquished');
await p.waitForFunction(() => window.__game.state === 'world', null, { timeout: 180000 });
await wait(1500);
log('after win:', await g(() => `${window.__game.state} flies=${window.__game.save.d.flies} cleared=${Object.keys(window.__game.save.d.cleared)}`));
await shot('10-back-in-world');

// back to the lily and visit the toad
await g(() => { const G = window.__game; G.travel(() => G.enterHub()); });
await wait(1800);
await g(() => { const G = window.__game, t = G.gates.find((x) => x.label === 'THE OLD TOAD'); G.walker.x = t.x; G.walker.z = t.z + 1.5; });
await wait(300);
await g(() => window.__game.input.press('interact'));
await wait(600);
await shot('11-shop');
await g(() => { const m = window.__game.ui.menu; m.focus = 1; m.activate(); });
await wait(500);
log('after buy:', await g(() => `flies=${window.__game.save.d.flies} vigor=${window.__game.save.d.levels.vigor}`));
await shot('12-shop-bought');

log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await b.close();
