// Drive the real game in Chromium. node tools/play.mjs <scenario> [w h] [touch]
import { chromium } from 'playwright';
const [scenario = 'boot', w = 1280, h = 720, touch] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGE: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|CERT|fonts\.g/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 300)); });
const shot = async (name) => { await p.screenshot({ path: `/tmp/claude-0/play-${name}.png` }); };
const wait = (ms) => p.waitForTimeout(ms);
const g = (fn, arg) => p.evaluate(fn, arg);
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 }).catch(() => errs.push('game never constructed'));
await wait(2500);
await shot('boot');
if (scenario !== 'boot') {
  await p.keyboard.press('KeyX');            // "press anything"
  await wait(1800);
  await shot('title');
}
export { p, g, wait, shot, errs };
if (scenario === 'boot' || scenario === 'title') { console.log('ERRORS:', errs.length ? errs.join('\n') : 'none'); await b.close(); }
