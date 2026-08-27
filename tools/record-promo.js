// Vertical clips at a real 1080x1920, recorded off the CURRENT build.
//
// Two things changed from the last set. Nothing is drawn on top - no captions,
// no hooks - so the clips ship clean and the words get written wherever they
// are posted. And they run longer: slower tile placement, a beat before the
// submit, and a proper hold on the count-up so the number can actually be read.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const OUT = ROOT + '/promo';
const MIME = { '.html':'text/html', '.json':'application/json', '.js':'application/javascript', '.png':'image/png', '.mp3':'audio/mpeg' };

const ONLY = process.argv.slice(2);
if (!ONLY.length) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const CHIPS = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10 };
const tile = (l, i) => ({ id: 't_v' + i + '_' + l, letter: l, chips: CHIPS[l] || 1, type: 'normal', aura: null, drawSeq: i });

// the roster as it stands - the old script still equipped glyphs that were cut
const ALL_GLYPHS = ['scavenger','perfectionist','deep_pockets','vowel_anchor','consonant_charge',
  'scrabble_master','long_form','grammarian','novelist','bookends','heavy_hitter','double_down',
  'underdog','wildcard_rune','vowel_shifter','insurance_policy','piggy_bank','archivist',
  'cascade','hoarder','all_in','sonnet'];
const ALL_SEALS = ['doubling_seal','letterpress','gilding','scribes_seal','blot','reprint','the_flood','the_blank'];

const L3 = ids => ids.map(id => ({ id, lvl: 3 }));
const LONG     = L3(['vowel_anchor','long_form','grammarian','novelist','heavy_hitter','cascade']);
const BOOKENDS = L3(['vowel_anchor','grammarian','bookends','novelist','heavy_hitter','cascade']);
const SHORT    = L3(['vowel_anchor','grammarian','underdog','hoarder','cascade','archivist']);

// every length levelled, so the scoring shows what a real late run looks like
const levels = n => { const o = {}; for (let i = 3; i <= 10; i++) o[i] = n; return o; };

const BY_LEN = (() => {
  const m = fs.readFileSync(ROOT + '/words.js', 'utf8').match(/DICTIONARY_WORDS = "([\s\S]*?)";/);
  const b = {}; for (let l = 2; l <= 7; l++) b[l] = new Map();
  for (const w of m[1].split(' ')) { const l = w.length;
    if (l < 2 || l > 7 || !/^[A-Z]+$/.test(w)) continue;
    const k = w.split('').sort().join(''); if (!b[l].has(k)) b[l].set(k, w); }
  return b;
})();
function solve(bench, want, taken) {
  const out = [];
  const rec = (s, acc) => { if (out.length > 3000) return;
    if (acc.length === want) { out.push(acc.slice()); return; }
    for (let i = s; i < bench.length; i++) rec(i + 1, acc.concat(bench[i])); };
  rec(0, []);
  for (const c of out) { const w = BY_LEN[want] && BY_LEN[want].get(c.slice().sort().join(''));
    if (w && !taken.has(w)) return w; }
  return null;
}

// Every field the current save format carries. A run missing lengthLevels or
// stake resumes into a board that scores nothing, which is how the last set
// would have gone out wrong.
const run = (word, glyphs, target, extra) => Object.assign({
  gameMode: 'classic', dailyChallenge: null, isEndless: false,
  currentStage: 6, stageTargets: [0,150,1200,9000,26000,80000,target,target,target], totalStages: 8,
  currentScore: 0, playsLeft: 4, rerollsLeft: 3, stageScores: [], stageWords: [],
  hand: word ? word.split('').map((l, i) => tile(l, i)) : [], activeWord: [],
  tileBag: 'AEIOURSTLNMDCPBH'.repeat(3).split('').map((l, i) => tile(l, 900 + i)), discardPile: [],
  removedLetters: [], equippedGlyphs: glyphs, bank: 40, consumables: [],
  activeHazard: null, anchorTileId: null, mutedTileId: null,
  shopOffers: { glyphs: [], consumables: [] }, shopRerollCount: 0, shopRerollsUsedThisRun: 0,
  phase: 'playing', activePressId: 'merchant_press', benchSort: 'draw', drawSeq: 50,
  discardsUsedThisStage: 0,
  archivistLengths: [], serialTriggers: 0, stageLetters: 0, bonusHands: 0, floodTiles: 0,
  doubleNext: false, lengthLevels: levels(9), stake: 1, lastHazard: null
}, extra || {});

const progress = extra => Object.assign({
  unlockedPresses: ['merchant_press','deep_pockets_press','recycler_press','ink_master_press','wildcard_press'],
  selectedPress: 'merchant_press', selectedStake: 1,
  stakeUnlocked: 5, pressStakes: { merchant_press: 3, deep_pockets_press: 1 },
  unlockedGlyphs: ALL_GLYPHS, unlockedConsumables: ALL_SEALS, completedRuns: ['merchant_press'],
  wins: 12, grantedThemes: [], foundWords: '', completedSets: [],
  stats: { highestStageReached: 8, lettersDiscarded: 60, inkSealsUsed: 9, specialTilesPlayed: 4, fiveLetterWords: 30 }
}, extra || {});

const CLIPS = [
  // the pair. cut together, this is the whole game in one clip
  { f: '01-before-no-upgrades', kind: 'word', word: 'BAMBOOZLE', g: [],       t: 900000, lv: 1, th: 'wordling', pal: 'coral-sky' },
  { f: '02-after-six-upgrades', kind: 'word', word: 'BAMBOOZLE', g: LONG,     t: 900000, lv: 9, th: 'wordling', pal: 'coral-sky' },
  // the fun words
  { f: '03-zyzzyva',            kind: 'word', word: 'ZYZZYVA',   g: LONG,     t: 900000, lv: 9, th: 'cyber-arcade' },
  { f: '04-hullabaloo',         kind: 'word', word: 'HULLABALOO',g: LONG,     t: 900000, lv: 9, th: 'wordling', pal: 'coral-sky' },
  { f: '05-kerfuffle',          kind: 'word', word: 'KERFUFFLE', g: LONG,     t: 900000, lv: 9, th: 'renegade-crimson' },
  { f: '06-muumuu',             kind: 'word', word: 'MUUMUU',    g: LONG,     t: 900000, lv: 9, th: 'pale-terminal' },
  { f: '07-flummox',            kind: 'word', word: 'FLUMMOX',   g: LONG,     t: 900000, lv: 9, th: 'wordling', pal: 'black-grey' },
  { f: '08-squelch',            kind: 'word', word: 'SQUELCH',   g: LONG,     t: 900000, lv: 9, th: 'typewriter' },
  { f: '09-quixotic',           kind: 'word', word: 'QUIXOTIC',  g: LONG,     t: 900000, lv: 9, th: 'renegade-crimson' },
  // everything firing at once
  { f: '10-jackpot',            kind: 'word', word: 'SQUEEZES',  g: BOOKENDS, t: 90000000, lv: 14, th: 'wordling', pal: 'coral-sky' },
  // three letters, levelled up, beating a stage on its own
  { f: '11-three-letters',      kind: 'word', word: 'CAT',       g: SHORT,    t: 900000, lv: 16, th: 'cyber-arcade' },
  // one word takes the whole stage, so the clip ends on the payout
  { f: '12-stage-cleared',      kind: 'word', word: 'GIZZARD',   g: LONG,     t: 60000,  lv: 9, th: 'wordling', pal: 'coral-sky', clear: true },
  // the new screens
  { f: '13-new-run-and-stakes', kind: 'newrun',  th: 'wordling', pal: 'coral-sky' },
  { f: '14-word-levels',        kind: 'shop',    th: 'wordling', pal: 'coral-sky' },
  { f: '15-the-lexicon',        kind: 'lexicon', th: 'typewriter' },
  { f: '16-boss-blind',         kind: 'boss',    th: 'renegade-crimson' },
  { f: '17-blitz',              kind: 'blitz',   th: 'cyber-arcade' }
];

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const full = p.join(ROOT, f);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': MIME[p.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8925, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const base = 'http://localhost:8925';
  const results = [];

  for (const c of CLIPS) {
    if (ONLY.length && !ONLY.some(o => c.f.indexOf(o) !== -1)) continue;
    const ctx = await browser.newContext({
      viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1,
      recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } }
    });
    const T0 = Date.now();
    const marks = {};
    const mark = k => { marks[k] = (Date.now() - T0) / 1000; };
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 140)));

    const game = async () => { for (let i = 0; i < 40; i++) {
      const f = page.frames().find(x => /index\.html/.test(x.url())); if (f) return f;
      await page.waitForTimeout(150); } throw new Error('no game frame'); };
    const wait = ms => page.waitForTimeout(ms);

    // what this clip needs sitting in storage before the game boots
    let saved = null;
    if (c.kind === 'word') saved = run(c.word, c.g, c.t, { lengthLevels: levels(c.lv) });
    if (c.kind === 'shop') saved = run(null, LONG.slice(0, 5), 900000, {
      phase: 'shop', currentStage: 3, bank: 40, lengthLevels: levels(4),
      shopOffers: { glyphs: [], consumables: [] } });
    if (c.kind === 'boss') saved = run('PAINTERS', LONG, 150000, {
      currentStage: 6, activeHazard: 'editor', lengthLevels: levels(9),
      tileBag: 'AEIOURSTLN'.repeat(3).split('').map((l, i) => tile(l, 900 + i)) });

    await page.goto(base + '/promo-stage.html');
    await wait(1200);
    let fr = await game();
    await fr.evaluate(([th, pal, r, prog]) => {
      localStorage.clear();
      localStorage.setItem('wordling-theme', th);
      if (pal) localStorage.setItem('wordling-palette', pal);
      localStorage.setItem('wordling-progress', JSON.stringify(prog));
      if (r) localStorage.setItem('wordling-active-run', JSON.stringify(r));
      localStorage.setItem('wordspyre-settings', JSON.stringify({ music: 0, sounds: 0, vibration: false, shake: 100 }));
    }, [c.th, c.pal || null, saved, progress(
      c.kind === 'lexicon'
        ? { foundWords: 'INK PAGE QUILL SCRIPT CHAPTER CAT DOG FOX OWL BEAR WOLF LION CROW TIGER OTTER RED TAN JADE PLUM RUST AMBER FOG ICE HAIL MIST SNOW GALE RIB JAW EAR HEEL SHIN LUNG JAZZ QUIZ ZEST JINX PAINT GARDEN LANTERN HOUSE STONE RIVER BRIDGE MOUNTAIN QUIVER FLICKER',
            completedSets: [] }
        : {})]);

    await page.reload(); await wait(1600);
    fr = await game();

    let ok = false;

    // ---- a word, played slowly enough to follow, then held on the count-up
    const playWord = async (word, clear) => {
      await fr.evaluate(() => document.querySelector('.continue-btn').click());
      await wait(1500);
      mark('board');
      for (const ch of word) {
        await fr.evaluate(x => {
          const t = [...document.querySelectorAll('#hand-rack .tile-inner')]
            .find(y => y.querySelector('.tile-letter').textContent === x && !y.dataset.u);
          if (t) { t.dataset.u = '1';
            t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, ch);
        await wait(300);
      }
      mark('wordIn');
      await wait(1400);
      mark('submit');
      const hit = await fr.evaluate(() => { const b = document.getElementById('btn-submit');
        if (b && !b.disabled) { b.click(); return true; } return false; });
      await wait(clear ? 11000 : 9500);
      await wait(1100);
      return hit;
    };

    if (c.kind === 'word') {
      ok = await playWord(c.word, c.clear);

    } else if (c.kind === 'newrun') {
      // browse the presses, read a stake, take a harder one, start the run
      await fr.evaluate(() => document.getElementById('btn-play').click());
      await wait(1600);
      await fr.evaluate(() => document.getElementById('btn-mode-classic').click());
      await wait(2200);
      mark('board');
      for (let i = 0; i < 2; i++) {
        await fr.evaluate(() => document.getElementById('press-next').click());
        await wait(1500);
      }
      await fr.evaluate(() => document.getElementById('press-prev').click());
      await wait(1600);
      for (const n of ['2', '4', '5', '3']) {
        await fr.evaluate(s => { const b = document.querySelector('.stake-chip[data-stake="' + s + '"]'); if (b) b.click(); }, n);
        await wait(1700);
      }
      await fr.evaluate(() => document.getElementById('btn-start-run').click());
      await wait(3200);
      ok = await fr.evaluate(() => !document.getElementById('view-map').classList.contains('hidden'));
      await wait(1500);

    } else if (c.kind === 'shop') {
      // the shop, then a Manuscript bought and the level moving
      await fr.evaluate(() => document.querySelector('.continue-btn').click());
      await wait(2600);
      mark('board');
      await fr.evaluate(() => { const card = [...document.querySelectorAll('#view-draft .draft-card-wrap')]
        .find(x => /MANUSCRIPT/i.test(x.textContent)); if (card) card.click(); });
      await wait(3000);
      ok = await fr.evaluate(() => { const b = [...document.querySelectorAll('#view-draft button')]
        .find(x => x.textContent.trim() === 'BUY'); if (b) { b.click(); return true; } return false; });
      await wait(2600);
      await fr.evaluate(() => { const b = [...document.querySelectorAll('#view-draft button')]
        .find(x => x.textContent.trim() === 'CONTINUE'); if (b) b.click(); });
      await wait(2800);
      await fr.evaluate(() => { const b = document.getElementById('btn-start-stage'); if (b) b.click(); });
      await wait(2400);
      await fr.evaluate(() => { const b = document.getElementById('btn-run-info'); if (b) b.click(); });
      await wait(3000);

    } else if (c.kind === 'lexicon') {
      await fr.evaluate(() => document.getElementById('btn-menu-lexicon').click());
      await wait(2200);
      mark('board');
      await fr.evaluate(() => { const v = document.getElementById('view-lexicon');
        v.scrollTo({ top: v.scrollHeight, behavior: 'smooth' }); });
      await wait(3000);
      await fr.evaluate(() => { const b = document.querySelector('.lex-set[data-set="long_form"]'); if (b) b.click(); });
      await wait(3400);
      await fr.evaluate(() => document.getElementById('btn-back-lexicon').click());
      await wait(1600);
      ok = await fr.evaluate(() => { const b = document.querySelector('.lex-set[data-set="bestiary"]'); if (b) { b.click(); return true; } return false; });
      await wait(3400);

    } else if (c.kind === 'boss') {
      // The Editor bans six letters or more: the long word bounces, a short one lands
      await fr.evaluate(() => document.querySelector('.continue-btn').click());
      await wait(1500);
      mark('board');
      await fr.evaluate(() => { const b = document.getElementById('btn-run-info'); if (b) b.click(); });
      await wait(3600);
      await fr.evaluate(() => { const b = document.getElementById('btn-close-run-info'); if (b) b.click(); });
      await wait(1600);
      for (const ch of 'PAINTERS') {
        await fr.evaluate(x => { const t = [...document.querySelectorAll('#hand-rack .tile-inner')]
          .find(y => y.querySelector('.tile-letter').textContent === x && !y.dataset.u);
          if (t) { t.dataset.u = '1';
            t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, ch);
        await wait(280);
      }
      await wait(1200);
      // the rejection message only holds for about a second, so it gets tried
      // twice - which is also what a player actually does before they believe it
      mark('reject');
      await fr.evaluate(() => { const b = document.getElementById('btn-submit'); if (b) b.click(); });
      await wait(2200);
      await fr.evaluate(() => { const b = document.getElementById('btn-submit'); if (b) b.click(); });
      await wait(2200);
      await fr.evaluate(() => { const b = document.getElementById('btn-clear'); if (b && !b.disabled) b.click(); });
      await wait(1400);
      await fr.evaluate(() => document.querySelectorAll('#hand-rack .tile-inner').forEach(t => delete t.dataset.u));
      for (const ch of 'PAINT') {
        await fr.evaluate(x => { const t = [...document.querySelectorAll('#hand-rack .tile-inner')]
          .find(y => y.querySelector('.tile-letter').textContent === x && !y.dataset.u);
          if (t) { t.dataset.u = '1';
            t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, ch);
        await wait(320);
      }
      await wait(1300);
      ok = await fr.evaluate(() => { const b = document.getElementById('btn-submit');
        if (b && !b.disabled) { b.click(); return true; } return false; });
      await wait(9500);
      await wait(1100);

    } else if (c.kind === 'blitz') {
      await fr.evaluate(() => document.getElementById('btn-play').click());
      await wait(1400);
      await fr.evaluate(() => document.getElementById('btn-mode-blitz').click());
      await wait(1600);
      mark('board');
      const taken = new Set();
      for (const want of [5, 6, 4, 7, 3, 2]) {
        for (let a = 0; a < 2; a++) {
          const bench = await fr.evaluate(() => [...document.querySelectorAll('#hand-rack .tile-inner .tile-letter')].map(t => t.textContent));
          const w = solve(bench, want, taken);
          if (!w) { await fr.evaluate(() => { const b = document.getElementById('btn-reroll'); if (b && !b.disabled) b.click(); }); await wait(700); continue; }
          for (const ch of w) {
            await fr.evaluate(x => { const t = [...document.querySelectorAll('#hand-rack .tile-inner')]
              .find(y => y.querySelector('.tile-letter').textContent === x && !y.dataset.u);
              if (t) { t.dataset.u = '1';
                t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, ch);
            await wait(170);
          }
          const hit = await fr.evaluate(() => { const b = document.getElementById('btn-submit');
            if (b && !b.disabled) { b.click(); return true; }
            const cl = document.getElementById('btn-clear'); if (cl && !cl.disabled) cl.click(); return false; });
          await wait(hit ? 1700 : 500);
          await fr.evaluate(() => document.querySelectorAll('#hand-rack .tile-inner').forEach(t => delete t.dataset.u));
          if (hit) { taken.add(w); break; }
        }
      }
      await wait(2500);
      ok = taken.size >= 4;
    }

    // what the clip actually ended up showing, so a silent failure cannot ship
    const shown = await fr.evaluate(() => {
      const sc = document.querySelector('.stage-clear-score');
      if (sc) return sc.textContent.trim();
      const pill = document.getElementById('score-pill');
      return pill ? pill.textContent.trim() : '';
    }).catch(() => '');

    mark('end');
    const v = await page.video().path();
    await ctx.close();
    const dest = OUT + '/' + c.f + '.webm';
    fs.renameSync(v, dest);
    // the video starts when the context does, so these offsets are frame-accurate
    const manifest = OUT + '/timing.json';
    const all = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : {};
    all[c.f] = marks;
    fs.writeFileSync(manifest, JSON.stringify(all, null, 2));
    const kb = Math.round(fs.statSync(dest).size / 1024);
    results.push({ f: c.f, ok, shown, kb, errs: errs.length });
    console.log('  ' + c.f.padEnd(24) + (ok ? 'ok  ' : 'CHECK') + '  ' +
      String(shown).padEnd(18) + kb + 'KB' + (errs.length ? '  ERRORS: ' + errs[0] : ''));
  }

  const bad = results.filter(r => !r.ok || r.errs);
  console.log('\n' + results.length + ' clips, ' +
    Math.round(results.reduce((n, r) => n + r.kb, 0) / 1024) + 'MB total');
  console.log(bad.length ? 'LOOK AT: ' + bad.map(b => b.f).join(', ') : 'all clean');
  await browser.close();
  server.close();
})();
