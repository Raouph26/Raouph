// Is the letter bag still the letter bag?
//
// A run threw up a bench of A E A A A E R A A L - six A's, when the whole bag
// only holds nine, and no discards left to escape it. Either that is a very
// unlucky draw or tiles are being duplicated somewhere. This plays real stages
// and, after every hand, counts every tile in the game - bench, staged word,
// bag and discard pile - and compares the multiset against the 98 tiles the
// run started with.
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');

const ROOT = '/home/user/Raouph';
const T = { '.html':'text/html', '.js':'application/javascript', '.png':'image/png',
            '.mp3':'audio/mpeg', '.json':'application/json' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(0);

const SRC = fs.readFileSync(ROOT + '/index.html', 'utf8');
const TILE_DIST = eval(SRC.match(/const TILE_DIST = (\[[\s\S]*?\n    \]);/)[1]);
const EXPECT = {}; let TOTAL = 0;
TILE_DIST.forEach(d => { EXPECT[d.letter] = d.qty; TOTAL += d.qty; });

const DICT = new Set(fs.readFileSync(ROOT + '/words.js', 'utf8')
  .match(/DICTIONARY_WORDS = "([\s\S]*?)";/)[1].split(' '));
const COMMON = require('./common-words.js').trim().split(/\s+/).filter(w => DICT.has(w) && w.length >= 3 && w.length <= 7);
const key = w => w.split('').sort().join('');
const BY_KEY = new Map();
for (const w of COMMON) { const k = key(w); BY_KEY.set(k, (BY_KEY.get(k) || []).concat(w)); }

let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '   ' + x : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html?nointro=1');
  await page.evaluate(() => { localStorage.clear();
    localStorage.setItem('wordspyre-settings', JSON.stringify({ music: 0, sounds: 0, vibration: false, shake: 0 })); });
  await page.reload(); await page.waitForTimeout(900);
  const click = id => page.evaluate(id => { const e = document.getElementById(id); if (e && !e.disabled) { e.click(); return true; } return false; }, id);
  for (const id of ['btn-play', 'btn-mode-classic', 'btn-start-run', 'btn-start-stage']) { await click(id); await page.waitForTimeout(950); }

  // The bag lives in the closure, so it is counted through the save file the
  // game writes for itself - the same record it would restore a run from.
  const census = () => page.evaluate(() => {
    const raw = localStorage.getItem('wordling-active-run');
    if (!raw) return null;
    const r = JSON.parse(raw);
    const all = [].concat(r.hand || [], r.activeWord || [], r.tileBag || [], r.discardPile || []).filter(Boolean);
    const c = {}; all.forEach(t => { const L = t.letter; c[L] = (c[L] || 0) + 1; });
    const ids = all.map(t => t.id);
    return { counts: c, total: all.length, dupIds: ids.length - new Set(ids).size,
             benchVowels: (r.hand || []).filter(t => t && 'AEIOU'.includes(t.letter)).length,
             bench: (r.hand || []).filter(Boolean).map(t => t.letter).join('') };
  });

  const tapLetter = L => page.evaluate(L => {
    const els = [...document.querySelectorAll('#hand-rack .tile-inner')];
    const i = els.findIndex(e => (e.querySelector('.tile-letter') || {}).textContent === L);
    if (i < 0) return false;
    els[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    els[i].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, L);

  const onBoard = () => page.evaluate(() => { const b = document.getElementById('btn-submit');
    if (!b) return false; const r = b.getBoundingClientRect(); if (r.width < 5) return false;
    const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(c && (c === b || b.contains(c))); });

  console.log('\nThe bag should always hold exactly these ' + TOTAL + ' tiles.\n');

  const start = await census();
  t('the run starts with all ' + TOTAL + ' tiles', start && start.total === TOTAL, start && ('found ' + start.total));
  t('every starting letter is in the right quantity',
     start && Object.keys(EXPECT).every(L => (start.counts[L] || 0) === EXPECT[L]),
     start && JSON.stringify(start.counts));

  let hands = 0, worstVowels = 0, worstBench = '', drift = null, dupSeen = 0;
  for (let i = 0; i < 45 && !drift; i++) {
    if (!(await onBoard())) {
      // walk whatever screen is up
      const moved = await page.evaluate(() => {
        const vis = x => { const r = x.getBoundingClientRect(); if (r.width < 5 || x.disabled) return false;
          const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return c && (c === x || x.contains(c)); };
        const b = [...document.querySelectorAll('button')].filter(vis)
          .find(x => /^(NEXT|CONTINUE|START STAGE|COLLECT)/i.test(x.textContent.trim()));
        if (b) { b.click(); return true; } return false;
      });
      if (!moved) break;
      await page.waitForTimeout(900); continue;
    }
    const rack = await page.evaluate(() => [...document.querySelectorAll('#hand-rack .tile-inner .tile-letter')].map(e => e.textContent));
    let want = null;
    for (let mask = 1; mask < (1 << rack.length) && !want; mask++) {
      const idx = []; for (let j = 0; j < rack.length; j++) if (mask & (1 << j)) idx.push(j);
      if (idx.length < 4 || idx.length > 6) continue;
      const ws = BY_KEY.get(key(idx.map(j => rack[j]).join('')));
      if (ws) want = ws[0];
    }
    if (!want) {
      // out of words: discard three and carry on
      const did = await page.evaluate(() => { const b = document.getElementById('btn-reroll');
        if (b && !b.disabled) { b.click(); return true; } return false; });
      if (!did) break;
      await page.waitForTimeout(250);
      for (const j of [0, 1, 2]) await page.evaluate(j => { const e = document.querySelectorAll('#hand-rack .tile-inner')[j];
        if (e) { e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, j);
      await page.waitForTimeout(150);
      await page.evaluate(() => { const b = document.getElementById('btn-reroll'); if (b && /CONFIRM/i.test(b.textContent)) b.click(); });
      await page.waitForTimeout(700);
    } else {
      for (const L of want.split('')) { await tapLetter(L); await page.waitForTimeout(70); }
      const ok = await page.evaluate(() => { const b = document.getElementById('btn-submit');
        if (b && !b.disabled) { b.click(); return true; } return false; });
      if (!ok) { await page.evaluate(() => document.getElementById('btn-clear').click()); await page.waitForTimeout(300); continue; }
      await page.waitForTimeout(5600);
      hands++;
    }
    const c = await census();
    if (!c) continue;
    if (c.benchVowels > worstVowels) { worstVowels = c.benchVowels; worstBench = c.bench; }
    if (c.dupIds > dupSeen) dupSeen = c.dupIds;
    const bad = c.total !== TOTAL || Object.keys(EXPECT).some(L => (c.counts[L] || 0) !== EXPECT[L]);
    if (bad) drift = { hands, total: c.total, counts: c.counts };
  }

  t('after ' + hands + ' hands the bag still holds exactly ' + TOTAL + ' tiles',
     !drift, drift && ('at hand ' + drift.hands + ' it held ' + drift.total + ': ' + JSON.stringify(drift.counts)));
  t('no tile was ever duplicated', dupSeen === 0, 'saw ' + dupSeen + ' duplicate ids');
  console.log('\n  worst bench seen: ' + worstBench + '  (' + worstVowels + ' vowels of ' + worstBench.length + ')');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
