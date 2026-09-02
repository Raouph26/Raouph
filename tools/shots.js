// Play Store screenshots off the CURRENT build.
//
// The old set was captured on 14 August and the game has had 27 commits to it
// since - it predates Word Levels, the Presses, the Lexicon, the Stakes and the
// button that now says DISCARD. Shipping those would show players a game they
// will not recognise when they open it.
//
// Everything is shot in `wordling`, the only theme a new install actually has.
// The other four need 1, 3, 5 and 10 wins, so putting them on the store page
// would advertise something nobody can see on day one.
//
// 1080x1920 exactly - Play wants 9:16 for phone shots, sides 320-3840px.
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');

const ROOT = '/home/user/Raouph';
const OUT = ROOT + '/store';
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.png':'image/png',
                '.json':'application/json', '.mp3':'audio/mpeg', '.webmanifest':'application/manifest+json' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(0);

const DICT = new Set(fs.readFileSync(ROOT + '/words.js', 'utf8')
  .match(/DICTIONARY_WORDS = "([\s\S]*?)";/)[1].split(' '));
const key = w => w.split('').sort().join('');

// 405 x 720 CSS at 2.6667x lands on 1080 x 1920 on the nose.
const VW = 405, VH = 720, DSF = 1080 / VW;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH },
                                         deviceScaleFactor: DSF, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  const BASE = 'http://127.0.0.1:' + server.address().port + '/index.html?nointro=1';
  const go = async () => { await page.goto(BASE); await page.waitForTimeout(300); };

  // A save that has seen a bit of the game, so the shots are not all empty
  // first-run screens - but still on the default theme and default Press.
  const seed = async () => {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('wordspyre-settings', JSON.stringify({ music: 0, sounds: 0, vibration: false, shake: 0 }));
      localStorage.setItem('wordling-progress', JSON.stringify({
        unlockedPresses: ['merchant_press'], selectedPress: 'merchant_press',
        unlockedGlyphs: ['scavenger','perfectionist','vowel_anchor','consonant_charge','long_form',
                         'grammarian','novelist','bookends','underdog','sonnet','hoarder','cascade',
                         'archivist','scrabble_master','double_down','deep_pockets'],
        unlockedConsumables: ['doubling_seal','scribes_seal','reprint','gilding'],
        completedRuns: [], wins: 0, grantedThemes: [], currentTheme: 'wordling',
        foundWords: 'CRANE SPIRE GLYPH TOKEN MARKET HARVEST ROUTINE SUITE DEFINE ANTHEM WHIRL MAIZE',
        stats: { lettersDiscarded: 40, inkSealsUsed: 3, specialTilesPlayed: 2,
                 highestStageReached: 6, fiveLetterWords: 22 }
      }));
    });
    await page.reload(); await page.waitForTimeout(800);
  };

  const shot = async (name, note) => {
    await page.waitForTimeout(450);
    const clipped = await page.evaluate(() =>
      document.documentElement.scrollHeight > window.innerHeight + 4);
    await page.screenshot({ path: OUT + '/' + name });
    const d = fs.statSync(OUT + '/' + name).size;
    console.log('  ' + name.padEnd(26) + (clipped ? 'CONTENT OVERFLOWS  ' : 'fits  ') +
                (d / 1024).toFixed(0) + 'KB   ' + note);
  };

  const click = id => page.evaluate(id => {
    const e = document.getElementById(id); if (e && !e.disabled) { e.click(); return true; } return false; }, id);
  const clickText = re => page.evaluate(src => {
    const r = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')].filter(x => {
      const q = x.getBoundingClientRect(); if (q.width < 5 || x.disabled) return false;
      const c = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return c && (c === x || x.contains(c)); }).find(x => r.test(x.textContent.trim()));
    if (b) { b.click(); return b.textContent.trim(); } return null; }, re);
  const tapLetter = L => page.evaluate(L => {
    const els = [...document.querySelectorAll('#hand-rack .tile-inner')];
    const i = els.findIndex(e => (e.querySelector('.tile-letter') || {}).textContent === L);
    if (i < 0) return false;
    els[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    els[i].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, L);

  console.log('\nShooting at ' + VW + 'x' + VH + ' CSS @' + DSF.toFixed(3) + 'x  ->  1080x1920\n');

  // ---------------------------------------------------------------- 1. menu
  await go(); await seed();
  await shot('01-menu.png', 'the front door');

  // ------------------------------------------------------- 2. press / stakes
  await click('btn-play'); await page.waitForTimeout(600);
  await click('btn-mode-classic'); await page.waitForTimeout(900);
  await shot('02-press-and-stakes.png', 'loadouts and difficulty ladder');

  // ------------------------------------------------------------- 3. the map
  await click('btn-start-run'); await page.waitForTimeout(1200);
  await shot('03-map.png', 'eight stages, boss blinds marked');

  // ------------------------------------------------------------ 4. the board
  await click('btn-start-stage'); await page.waitForTimeout(1300);
  // A store screenshot has to show a word a person recognises. YAGER is in the
  // tournament dictionary; nobody has heard of it. Redraw until the bench can
  // spell something ordinary.
  const COMMON = `MARKET HARVEST ROUTINE ANTHEM WHIRL MAIZE CRANE SPIRE TOKEN DEFINE SUITE PLANET
    GARDEN SILVER MASTER STREAM FLOWER BRIGHT CANDLE ORANGE PURPLE WINTER SUMMER AUTUMN FOREST
    ISLAND CASTLE DRAGON KNIGHT WIZARD POTION SHIELD TEMPLE MIRROR SHADOW THUNDER LIGHTNING
    JOURNEY MYSTERY LIBRARY MACHINE PICTURE KITCHEN MORNING EVENING HOLIDAY WEATHER HUSBAND
    STATION COUNTRY VILLAGE HISTORY FACTORY PRODUCT SERVICE PROBLEM PROJECT SUBJECT COMFORT
    BALANCE CAPTURE CULTURE FEATURE MEASURE PICTURE TEXTURE VENTURE CHAMBER CHAPTER CHARGE
    BOTTLE BASKET BUTTON CARPET CIRCLE COFFEE CORNER COTTON DANGER DINNER DOCTOR DOLLAR
    ENGINE FAMILY FATHER FINGER FLIGHT FRIEND FUTURE GARAGE GLOVES GOLDEN GROUND GROWTH
    HAMMER HANDLE HEALTH HEIGHT HIDDEN HOLLOW HUNGER INSECT ISLAND JACKET JUNGLE LADDER
    LAUNCH LEADER LEGEND LESSON LETTER LIQUID LISTEN MATTER MEADOW MEMORY METHOD MIDDLE
    MINUTE MOMENT MONKEY MOTHER MUSCLE NATURE NEEDLE NORMAL NOTICE NUMBER OFFICE ORANGE
    PALACE PARENT PARTNER PATTERN PENCIL PEOPLE PERIOD PERSON PLANET PLENTY POCKET POWDER
    PRAISE PRAYER PRISON PUBLIC PUZZLE RABBIT RANDOM REASON RECORD REGION REMOTE REPAIR
    REPORT RESCUE RESULT RETURN RIBBON RIVER ROCKET SADDLE SAFETY SALMON SAMPLE SCHOOL
    SEASON SECOND SECRET SENIOR SHADOW SHOULD SILENT SIMPLE SINGER SISTER SLEEVE SLIGHT
    SMOOTH SOCCER SOCIAL SPIRIT SPRING SQUARE STABLE STATUE STEADY STICKY STORM STRIKE
    STRONG STUDIO SUGAR SUNSET SUPPLY SURVEY SWITCH SYMBOL SYSTEM TALENT TARGET TEMPLE
    TENNIS THEORY THREAD THROAT TICKET TIMBER TISSUE TOMATO TONGUE TOWARD TRAVEL TUNNEL
    TWELVE UNCLE UNIQUE UNITED UPWARD VALLEY VELVET VICTIM VIOLIN VISION VOLUME VOYAGE
    WAGON WALNUT WANDER WEALTH WEAPON WHEEL WHISPER WINDOW WINTER WISDOM WONDER WOODEN
    WORKER WORTHY WRITER YELLOW CRATE STONE SLATE TRACE TRAIN BREAD CHAIR CLOUD DREAM
    EARTH FIELD FLAME FRAME GHOST GRAPE GREEN HEART HOUSE LIGHT MONEY MUSIC NIGHT OCEAN
    PAPER PARTY PEACE PHONE PIANO PLANE PLANT POINT POWER QUEEN QUIET RADIO RIVER ROBOT
    ROUND ROYAL SHARP SHEEP SHINE SHIRT SHORE SIGHT SILK SMILE SMOKE SNAKE SOUND SPACE
    SPARK SPEND SPOON STAGE STAIR STAND STARS STEAM STICK STORE STORM STORY SUGAR SWEET
    TABLE TEETH THANK THINK THREE TIGER TITLE TOAST TODAY TOWER TRACK TRADE TREAT TRIBE
    TRUCK TRUST TRUTH VOICE WATCH WATER WHALE WHEAT WHITE WHOLE WOMAN WORLD WORTH WRITE
    YOUNG`.trim().split(/\s+/).filter(w => DICT.has(w));
  const BY = new Map(); COMMON.forEach(w => BY.set(key(w), w));

  const findCommon = async () => {
    const r = await page.evaluate(() =>
      [...document.querySelectorAll('#hand-rack .tile-inner .tile-letter')].map(e => e.textContent));
    let best = null;
    for (let m = 1; m < (1 << r.length); m++) {
      const idx = []; for (let i = 0; i < r.length; i++) if (m & (1 << i)) idx.push(i);
      if (idx.length < 5 || idx.length > 7) continue;
      const w = BY.get(key(idx.map(i => r[i]).join('')));
      if (w && (!best || w.length > best.length)) best = w;
    }
    return best;
  };

  let word = await findCommon();
  for (let tries = 0; !word && tries < 3; tries++) {
    // throw the four least useful tiles back and look again
    await click('btn-reroll'); await page.waitForTimeout(250);
    const FREQ = 'ETAOINSRHLDCUMFPGWYBVKXJQZ';
    const order = await page.evaluate(F => {
      const els = [...document.querySelectorAll('#hand-rack .tile-inner')];
      return els.map((e, i) => ({ i, bad: F.indexOf((e.querySelector('.tile-letter') || {}).textContent) }))
                .filter(x => x.bad >= 0).sort((a, b) => b.bad - a.bad).slice(0, 3).map(x => x.i);
    }, FREQ);
    for (const i of order) {
      await page.evaluate(i => { const e = document.querySelectorAll('#hand-rack .tile-inner')[i];
        if (e) { e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                 e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, i);
      await page.waitForTimeout(110);
    }
    await clickText(/CONFIRM/); await page.waitForTimeout(800);
    word = await findCommon();
  }
  if (word) { for (const L of word.split('')) { await tapLetter(L); await page.waitForTimeout(90); } }
  else console.log('  !! no ordinary word available for the board shot');

  await shot('04-board.png', 'the core loop' + (word ? ' — spelling ' + word : ''));

  // --------------------------------------------------------------- 5. scoring
  if (word) {
    await click('btn-submit');
    await page.waitForTimeout(1500);
    await shot('05-scoring.png', 'chips x mult, the payoff moment');
    await page.waitForTimeout(5200);
  }

  // ------------------------------------------------------------------ 6. shop
  for (let i = 0; i < 6; i++) {
    if (await clickText(/^NEXT|^CONTINUE|^COLLECT/)) { await page.waitForTimeout(900); }
    const inShop = await page.evaluate(() => !!document.querySelector('.draft-card-wrap'));
    if (inShop) break;
  }
  await shot('06-shop.png', 'glyphs, manuscripts and seals');

  // -------------------------------------------------------------- 7. lexicon
  await go(); await page.waitForTimeout(700);
  await click('btn-menu-lexicon'); await page.waitForTimeout(900);
  await shot('07-lexicon.png', 'the word collection');

  // -------------------------------------------------------------- 8. unlocks
  await go(); await page.waitForTimeout(700);
  await click('btn-menu-unlocks'); await page.waitForTimeout(900);
  await shot('08-unlocks.png', 'everything there is to earn');

  console.log('\nerrors: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'));
  await browser.close(); server.close();
})();
