// Montage PNGs into one grid image (no image libraries needed: a browser canvas does it).
//   node tools/stitch.mjs <out.png> <cols> <a.png> <b.png> ...
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [out, cols = 3, ...files] = process.argv.slice(2);
const urls = files.map((f) => 'data:image/png;base64,' + readFileSync(f).toString('base64'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const size = await p.evaluate(async ([urls, cols]) => {
  const imgs = await Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const w = imgs[0].width, h = imgs[0].height, rows = Math.ceil(imgs.length / cols);
  const c = document.createElement('canvas'); c.width = w * cols; c.height = h * rows;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((im, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    g.drawImage(im, x, y);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 34, 18); g.fillStyle = '#fc6'; g.font = '13px monospace'; g.fillText(String(i), x + 4, y + 13);
    g.strokeStyle = '#333'; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
  });
  document.body.style.margin = 0; document.body.appendChild(c);
  return { w: c.width, h: c.height };
}, [urls, +cols]);
await p.setViewportSize({ width: size.w, height: size.h });
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: size.w, height: size.h } });
await b.close();
