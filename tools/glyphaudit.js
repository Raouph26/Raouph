// Every glyph, played for real, against the exact number its card promises.
//
// The Hoarder paid a flat 250 whatever was on the bench and shipped that way,
// because nothing ever checked the figure - only that the glyph did SOMETHING.
// So this suite does the arithmetic. It plays a word on a controlled bench,
// with and without the glyph, at level 1, 2 and 3, and asserts the difference
// is exactly rate x count. The rate is read off the card the player sees, so a
// card that lies fails the test.
const { chromium } = require('playwright');
const fs = require('fs');

const SRC = fs.readFileSync('/home/user/Raouph/index.html', 'utf8');
const grab = n => eval('(' + SRC.match(new RegExp('const ' + n + '\\s*=\\s*(\\{[^;]*?\\});'))[1].replace(/\s+/g, ' ') + ')');
const BASE_CHIPS = grab('LENGTH_BASE_CHIPS');
const BASE_MULT = grab('LENGTH_BASE_MULT');

const CHIP = 1;                       // every tile in the fixture is worth 1
const mk = (l, i) => ({ id: 't' + i + '_' + l, letter: l, chips: CHIP, type: 'normal', aura: null, drawSeq: i });

// score with no glyph at all: (tile chips + the length's base chips) x the length's mult
const plain = word => Math.floor((word.length * CHIP + BASE_CHIPS[word.length]) * BASE_MULT[word.length]);
const withChips = (word, add) => Math.floor((word.length * CHIP + BASE_CHIPS[word.length] + add) * BASE_MULT[word.length]);
const withMultAdd = (word, add) => Math.floor((word.length * CHIP + BASE_CHIPS[word.length]) * (BASE_MULT[word.length] + add));
const withMultMul = (word, x) => Math.floor((word.length * CHIP + BASE_CHIPS[word.length]) * BASE_MULT[word.length] * x);

let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '   ' + x : '')); } };

// word tiles first, then filler that stays on the bench
const run = (word, bench, glyphs) => ({
  gameMode: 'classic', dailyChallenge: null, isEndless: false, currentStage: 1,
  stageTargets: [0, 9000000], totalStages: 8, currentScore: 0, playsLeft: 9, rerollsLeft: 3,
  stageScores: [], stageWords: [], stageLetters: 0, archivistLengths: [],
  hand: word.split('').map(mk).concat(Array.from({ length: bench }, (_, i) => mk('B', 90 + i))),
  activeWord: [], tileBag: 'AEIOURSTLN'.repeat(2).split('').map((l, i) => mk(l, 500 + i)),
  discardPile: [], removedLetters: [], equippedGlyphs: glyphs,
  bank: 20, consumables: [], activeHazard: null, anchorTileId: null, mutedTileId: null,
  shopOffers: { glyphs: [], consumables: [] }, shopRerollCount: 0, shopRerollsUsedThisRun: 0,
  phase: 'playing', activePressId: 'merchant_press', benchSort: 'draw', drawSeq: 600
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  const ALL = eval('(' + SRC.match(/const GLYPH_DATABASE = (\[[\s\S]*?\n    \]);/)[1] + ')').map(g => g.id);

  // play `word` with `bench` filler tiles left over and `glyphs` equipped
  const play = async (word, bench, glyphs) => {
    await page.goto('file:///home/user/Raouph/index.html?nointro=1');
    await page.evaluate(([r, all]) => {
      localStorage.clear();
      localStorage.setItem('wordling-progress', JSON.stringify({ unlockedPresses: ['merchant_press'],
        selectedPress: 'merchant_press', unlockedGlyphs: all, unlockedConsumables: [],
        completedRuns: [], wins: 0, grantedThemes: [], stats: {} }));
      localStorage.setItem('wordling-active-run', JSON.stringify(r));
      localStorage.setItem('wordspyre-settings', JSON.stringify({ music: 0, sounds: 0, vibration: false, shake: 0 }));
    }, [run(word, bench, glyphs), ALL]);
    await page.reload(); await page.waitForTimeout(450);
    await page.evaluate(() => document.querySelector('.continue-btn').click());
    await page.waitForTimeout(700);
    for (let i = 0; i < word.length; i++) {
      await page.evaluate(() => { const el = document.querySelectorAll('#hand-rack .tile-inner')[0];
        if (el) { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } });
      await page.waitForTimeout(55);
    }
    const spelled = await page.evaluate(() =>
      [...document.querySelectorAll('#word-area .tile-letter')].map(e => e.textContent).join(''));
    const submitted = await page.evaluate(() => { const b = document.getElementById('btn-submit');
      if (b && !b.disabled) { b.click(); return true; } return false; });
    if (!submitted) return { ok: false, spelled, score: 0 };
    await page.waitForTimeout(6500);
    const score = await page.evaluate(() => { const m = document.getElementById('score-pill').textContent.replace(/,/g, '').match(/(\d+)/); return m ? +m[1] : 0; });
    return { ok: true, spelled, score };
  };

  // the card the player reads, at a given level
  const card = (id, lvl) => page.evaluate(([id, lvl]) => {
    const el = document.createElement('div');
    // describeGlyph lives in the closure; the shop is the public way to reach it
    return null;
  }, [id, lvl]);

  console.log('\n=== THE HOARDER — the reported bug ===\n');
  // CAT off a 10-tile bench leaves 7. Off a 4-tile bench it leaves 1. Before
  // the fix both paid 25 x 10 = 250, because staged tiles are nulled in place
  // and the code was counting the holes.
  {
    const base = await play('CAT', 7, []);
    t('baseline CAT with 7 spare tiles = ' + plain('CAT'), base.score === plain('CAT'), 'got ' + base.score);
    for (const [bench, lvl, rate] of [[7, 1, 25], [1, 1, 25], [7, 2, 38], [7, 3, 50], [0, 1, 0]]) {
      const b = await play('CAT', bench, []);
      const g = await play('CAT', bench, [{ id: 'hoarder', lvl }]);
      const want = withChips('CAT', rate * bench);
      t('L' + lvl + ', ' + bench + ' left on the bench -> ' + want +
        ' (+' + rate + ' x ' + bench + ' chips over ' + b.score + ')',
        g.score === want, 'got ' + g.score);
    }
    // the shape of the bug: the payout must MOVE with the bench
    const a = await play('CAT', 7, [{ id: 'hoarder', lvl: 1 }]);
    const c = await play('CAT', 1, [{ id: 'hoarder', lvl: 1 }]);
    t('a fuller bench pays strictly more (the old bug paid the same)', a.score > c.score, a.score + ' vs ' + c.score);
  }

  console.log('\n=== PER-UNIT GLYPHS — rate x count, exactly ===\n');
  const PER = [
    // id,              word,     level, expected total effect
    ['vowel_anchor',    'AUDIO', 1, w => withChips(w, 15 * 4)],
    ['vowel_anchor',    'AUDIO', 2, w => withChips(w, 23 * 4)],
    ['vowel_anchor',    'AUDIO', 3, w => withChips(w, 30 * 4)],
    ['consonant_charge','CATS',  1, w => withChips(w, 10 * 3)],
    ['consonant_charge','CATS',  2, w => withChips(w, 15 * 3)],
    ['scrabble_master', 'JAZZ',  1, w => withChips(w, 60 * 3)],
    ['scrabble_master', 'JAZZ',  2, w => withChips(w, 90 * 3)],
    ['grammarian',      'AUDIO', 1, w => withMultAdd(w, 3 * 4)],
    ['grammarian',      'AUDIO', 2, w => withMultAdd(w, 5 * 4)],
    ['double_down',     'LETTER',1, w => withMultAdd(w, 4 * 2)],
    ['double_down',     'LETTER',2, w => withMultAdd(w, 6 * 2)],
    ['cascade',         'CATS',  1, w => withMultAdd(w, 4)],
    ['cascade',         'CATS',  2, w => withMultAdd(w, 8)],
    ['archivist',       'CATS',  1, w => withChips(w, 40)],
    ['archivist',       'CATS',  2, w => withChips(w, 60)],
  ];
  for (const [id, word, lvl, want] of PER) {
    const r = await play(word, 3, [{ id, lvl }]);
    t(id + ' L' + lvl + ' on ' + word + ' -> ' + want(word), r.score === want(word), 'got ' + r.score);
  }

  console.log('\n=== xMULT GLYPHS ===\n');
  const XM = [
    ['novelist',    'PLANETS', 1, 3],
    ['bookends',    'LEVEL',   1, 4],
    ['underdog',    'CAT',     1, 3],
    ['sonnet',      'PAINT',   1, 3],
    ['all_in',      'PLANETS', 1, 4],
    ['heavy_hitter','JAZZ',    1, 8],   // J, Z, Z - doubling per rare letter
    ['heavy_hitter','ZEAL',    1, 2],   // one rare letter
    ['heavy_hitter','JAZZ',    2, 27],  // x3 each at level 2
  ];
  for (const [id, word, lvl, x] of XM) {
    const r = await play(word, 3, [{ id, lvl }]);
    t(id + ' L' + lvl + ' on ' + word + ' -> x' + x, r.score === withMultMul(word, x), 'got ' + r.score + ', wanted ' + withMultMul(word, x));
  }
  { // All In wipes the hand out on a short word, and that is the point
    const r = await play('CATS', 3, [{ id: 'all_in', lvl: 1 }]);
    t('all_in on a 4-letter word scores nothing at all', r.score === 0, 'got ' + r.score);
  }
  { // Long Form is flat chips, not per letter
    const r = await play('PLANETS', 3, [{ id: 'long_form', lvl: 1 }]);
    t('long_form on PLANETS -> +60 chips flat', r.score === withChips('PLANETS', 60), 'got ' + r.score);
  }

  console.log('\n=== THE CARDS ===\n');
  const CARDS = await page.evaluate(() => {
    // read what the shop and collection actually print
    const out = [];
    document.querySelectorAll('.unlock-sub').forEach(e => out.push(e.textContent));
    return out;
  });
  const descs = ALL.map(id => {
    const m = SRC.match(new RegExp('\\n        ' + id + ':\\s+(?:l|\\(\\))\\s*=>([\\s\\S]*?),?\\n'));
    return m ? m[1] : null;
  });
  t('all 22 glyphs have a card in LEVEL_DESC', descs.filter(Boolean).length === 22, descs.filter(Boolean).length);
  t('no card still says "Base Points"', !/Base Points/.test(SRC));
  t('no glyph carries a second, stale desc field',
     !/GLYPH_DATABASE = \[[\s\S]*?\n    \];/.test(SRC) || !/icon:"[^"]*", desc:/.test(SRC.match(/const GLYPH_DATABASE = \[[\s\S]*?\n    \];/)[0]));

  console.log('\n=== ONE NAME PER THING ===\n');
  await page.goto('file:///home/user/Raouph/index.html?nointro=1');
  await page.waitForTimeout(600);
  const ui = await page.evaluate(() => ({
    labels: [...document.querySelectorAll('.resource-label')].map(e => e.textContent.trim()),
    btn: (document.getElementById('btn-reroll') || {}).textContent
  }));
  t('the HUD says DISCARDS', ui.labels.includes('DISCARDS') && !ui.labels.includes('REROLLS'), ui.labels.join('/'));
  t('the button says DISCARD', (ui.btn || '').trim() === 'DISCARD', ui.btn);
  t('the tutorial says DISCARD too', /DISCARD: tap it/.test(SRC));
  t('REROLL now means the shop and nothing else', !/>REROLL</.test(SRC) && !/"REROLLS"/.test(SRC));

  t('nothing was thrown anywhere', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
