// node tools/shot.mjs <url-path> <out.png> [w] [h]  — screenshot a dev page
import { chromium } from 'playwright';
const [path, out, w = 1400, h = 900] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|CERT|fonts/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:5190' + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }).catch(() => errs.push('never ready'));
await p.waitForTimeout(300);
await p.screenshot({ path: out });
if (errs.length) console.log('ERRORS:', errs.slice(0, 5).join('\n'));
await b.close();
