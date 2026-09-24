// Film a real fight: the balancing bot plays the frog through the actual game
// (real camera, HUD, effects), stepped at a true 60 fps.
//   node tools/botfilm.mjs <bossId> <frames> <every> <out-prefix> [skill] [seed]
// env: W H (default phone landscape 844×390), TOUCH=0 for the desktop HUD
import { chromium } from 'playwright';
const [boss = 'duck', frames = 240, every = 8, out = '/tmp/claude-0/bf', skill = 'average', seed = 7] = process.argv.slice(2);
const W = +(process.env.W ?? 844), H = +(process.env.H ?? 390), touch = process.env.TOUCH !== '0';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n')[1]));
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.evaluate(() => { try { localStorage.setItem('frogsouls.save.v2', JSON.stringify({ v: 2, playtime: 1, tips: { start: 1, glow: 1, red: 1, riposte: 1, heal: 1, stamina: 1 }, seenHelp: true })); } catch {} });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1200);
await p.evaluate((id) => window.__game.startFight(id), boss);
await p.waitForFunction(() => window.__game.phase === 'intro', null, { timeout: 60000 });
await p.evaluate(async ([skill, seed]) => {
  const G = window.__game;
  G.manual = true; G.ui.fade(0, 0); G._beginCombat();
  const { Bot, SKILL } = await import('/src/sim/bot.js');
  const bot = new Bot(G.fight, SKILL[skill], +seed);
  G._intent = () => bot.intent(1 / 60);
}, [skill, seed]);
await p.waitForTimeout(1200);                       // intro card and HUD transitions
for (let fr = 0; fr < +frames; fr += +every) {
  await p.evaluate((n) => { const G = window.__game; for (let i = 0; i < n; i++) G.frame(1 / 60); }, +every);
  await p.screenshot({ path: `${out}-${String(fr).padStart(4, '0')}.png` });
}
const st = await p.evaluate(() => { const f = window.__game.fight; return { t: f.time.toFixed(1), boss: Math.round(f.boss.hp), frog: Math.round(f.player.hp), outcome: f.outcome }; });
console.log(JSON.stringify(st));
if (errs.length) console.log('ERRORS', errs.slice(0, 5).join('\n'));
await b.close();
