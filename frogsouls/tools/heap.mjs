// Where does each frame allocate? Chrome's sampling heap profiler over a
// scripted fight (rendering included). node tools/heap.mjs [bossId] [frames]
import { chromium } from 'playwright';
const [boss = 'duck', N = 300] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 } });
const p = await ctx.newPage();
await p.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.keyboard.press('KeyX'); await p.waitForTimeout(1200);
await p.evaluate((id) => window.__game.startFight(id), boss);
await p.waitForFunction(() => window.__game.phase === 'intro', null, { timeout: 60000 });
await p.evaluate(() => { const G = window.__game; G.manual = true; G.ui.fade(0, 0); G._beginCombat(); for (let i = 0; i < 60; i++) G.frame(1 / 60); });
const cdp = await ctx.newCDPSession(p);
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
await p.evaluate((N) => { const G = window.__game, keys = ['light', 'light', 'roll', 'heavy', 'parry', 'light', 'roll'];
  for (let i = 0; i < N; i++) { if (i % 25 === 0) G.input.press(keys[(i / 25) % keys.length | 0]); G.input.move.x = Math.sin(i / 40); G.input.move.y = Math.cos(i / 55); G.frame(1 / 60); } }, +N);
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const agg = new Map();
const walk = (n) => {
  const cf = n.callFrame, name = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
  if (n.selfSize) agg.set(name, (agg.get(name) ?? 0) + n.selfSize);
  for (const c of n.children) walk(c);
};
walk(profile.head);
// who calls a given function (TRACE=name): the stacks above it, weighted
if (process.env.TRACE) {
  const paths = new Map();
  const up = (n, stack) => {
    const nm = (n.callFrame.functionName || '(anon)') + ':' + (n.callFrame.lineNumber + 1);
    const st = [...stack, nm];
    if (n.callFrame.functionName === process.env.TRACE) {
      let size = 0; const sum = (x) => { size += x.selfSize; x.children.forEach(sum); }; sum(n);
      const key = st.slice(-9, -1).join(' < ');
      paths.set(key, (paths.get(key) ?? 0) + size);
    }
    for (const c of n.children) up(c, st);
  };
  up(profile.head, []);
  for (const [k, v] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log((v / 1024 / N).toFixed(2), k);
}
let total = 0; for (const [, v] of agg) total += v;
console.log('total KB/frame', (total / 1024 / N).toFixed(1));
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log((v / 1024 / N).toFixed(2).padStart(7), k);
await b.close();
