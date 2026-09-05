// Twenty runs of the actual game, played the way somebody would play it.
//
// Not the balance simulator - that models the maths. This drives the real page:
// taps real tiles in the real order, reads what is actually on screen, walks
// the shop and buys whatever it happens to be offered. No hand-picked glyphs,
// no rare-letter tricks, no ten-letter words. It plays the most ordinary word
// it can see, the way the studio and its testers described playing.
//
// It is hunting for BUGS, not win rates: anything thrown, a number that does
// not add up, a button that stops working, a screen that never appears, a run
// that gets stuck with no legal move and no way out.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http'), path = require('path');
// file:// blocks the sound fetches, which floods the log with CORS errors that
// never happen on a phone. Serve the game the way the app serves it.
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.png':'image/png',
                '.json':'application/json', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.webmanifest':'application/manifest+json' };
const ROOT = '/home/user/Raouph';
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = () => 'http://127.0.0.1:' + server.address().port + '/index.html?nointro=1';

const RUNS = +(process.argv[2] || 20);
const OUT = '/tmp/claude-0/-home-user-Raouph/34b49433-af43-500b-9941-94e8cd3dc926/scratchpad/PLAYBOT-FIXED.json';
const DICT = new Set(fs.readFileSync('/home/user/Raouph/words.js', 'utf8')
  .match(/DICTIONARY_WORDS = "([\s\S]*?)";/)[1].split(' '));

// The game's dictionary is a full tournament list - 172,000 entries. Turned
// loose on it a bot plays TOEA, NAOI and ALIYA, which says nothing about how
// the game feels, because no person is finding those. It plays out of a list
// of everyday words instead, every one of them checked against the game's own
// dictionary so a rejection is the game's doing and not the list's.
const COMMON = require('./common-words.js').trim().split(/\s+/)
  .filter(w => DICT.has(w) && w.length >= 3 && w.length <= 7);
const FREQ = 'ETAOINSRHLDCUMFPGWYBVKXJQZ';
const key = w => w.split('').sort().join('');
const BY_KEY = new Map();
for (const w of COMMON) { const k = key(w); BY_KEY.set(k, (BY_KEY.get(k) || []).concat(w)); }

const issues = [];
const note = (run, stage, what, detail) => {
  issues.push({ run, stage, what, detail: detail || '' });
  console.log('    !! ' + what + (detail ? '  — ' + detail : ''));
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();

  let errs = [];
  page.on('pageerror', e => errs.push('THROWN ' + String(e).split('\n')[0].slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') {
    const t = m.text().slice(0, 200);
    if (!/favicon|net::ERR|Failed to load resource|sw\.js/.test(t)) errs.push('CONSOLE ' + t);
  } });

  // Only buttons the player could actually press: on screen, and not covered.
  const visibleButtons = () => page.evaluate(() => {
    return [...document.querySelectorAll('button')].filter(x => {
      const r = x.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight) return false;
      const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return c && (c === x || x.contains(c));
    }).map(x => ({ id: x.id || '', text: x.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), off: x.disabled }));
  });

  const pressText = re => page.evaluate(src => {
    const re = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')].filter(x => {
      const r = x.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight || x.disabled) return false;
      const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return c && (c === x || x.contains(c));
    }).find(x => re.test(x.textContent.trim()));
    if (!b) return null;
    const t = b.textContent.trim().slice(0, 30); b.click(); return t;
  }, re.source || re);

  const pressId = id => page.evaluate(id => {
    const e = document.getElementById(id);
    if (!e || e.disabled) return false; e.click(); return true;
  }, id);

  const board = () => page.evaluate(() => {
    const n = s => { const e = document.getElementById(s); if (!e) return null;
      const m = e.textContent.replace(/,/g, '').match(/-?\d+/); return m ? +m[0] : null; };
    const pill = (document.getElementById('score-pill') || {}).textContent || '';
    const parts = pill.replace(/,/g, '').match(/(-?\d+)\s*\/\s*(\d+)/);
    return {
      rack: [...document.querySelectorAll('#hand-rack .tile-inner')].map(e => ({
        L: (e.querySelector('.tile-letter') || {}).textContent, cls: e.className })),
      word: [...document.querySelectorAll('#active-word-line .tile-letter')].map(e => e.textContent).join(''),
      score: parts ? +parts[1] : null, target: parts ? +parts[2] : null,
      hands: n('val-hands'), discards: n('val-rerolls'), bank: n('val-gold'),
      banner: ((document.getElementById('score-banner') || {}).textContent || '').trim(),
      onBoard: !!(() => { const b = document.getElementById('btn-submit'); if (!b) return false;
        const r = b.getBoundingClientRect(); if (r.width < 5) return false;
        const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return c && (c === b || b.contains(c)); })(),
      stage: ((document.getElementById('stage-pill') || document.getElementById('progress-wrap') || {}).textContent || '').trim().slice(0, 30)
    };
  });

  const tapLetter = L => page.evaluate(L => {
    const els = [...document.querySelectorAll('#hand-rack .tile-inner')];
    let i = els.findIndex(e => (e.querySelector('.tile-letter') || {}).textContent === L);
    if (i < 0) i = els.findIndex(e => (e.querySelector('.tile-letter') || {}).textContent === '*');
    if (i < 0) return false;
    els[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    els[i].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, L);

  // Every ordinary word this bench can spell, plainest first.
  const findWords = rack => {
    const letters = rack.map(t => t.L);
    const usable = letters.map((L, i) => ({ L, i })).filter(x => /^[A-Z]$/.test(x.L));
    const n = usable.length;
    if (n > 13) return [];
    const seen = new Set(); const out = [];
    for (let mask = 1; mask < (1 << n); mask++) {
      let c = 0; for (let m = mask; m; m >>= 1) c += m & 1;
      if (c < 3 || c > 7) continue;
      const pick = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) pick.push(usable[i].L);
      for (const w of (BY_KEY.get(key(pick.join(''))) || []))
        if (!seen.has(w)) { seen.add(w); out.push(w); }
    }
    // A person reaches for the longest word they can actually see, and most of
    // the words a person sees are four to six letters.
    out.sort((a, b) => b.length - a.length);
    return out;
  };

  const newRun = async () => {
    await page.goto(BASE());
    await page.evaluate(() => { localStorage.clear();
      localStorage.setItem('wordspyre-settings', JSON.stringify({ music: 0, sounds: 0, vibration: false, shake: 0 })); });
    await page.reload();
    await page.waitForTimeout(900);
    for (const id of ['btn-play', 'btn-mode-classic', 'btn-start-run', 'btn-start-stage']) {
      await pressId(id); await page.waitForTimeout(950);
    }
  };

  // Walk the stage-clear panel, the shop and the map until the board is back.
  const between = async (run, stage, bag) => {
    let shopping = null; const tried = new Set(); let spent = 0;
    for (let guard = 0; guard < 60; guard++) {
      // The board has to be STABLE, not merely present. Mid-transition the old
      // stage's board is still painted while the game has already moved on, and
      // acting then produced phantom "silent refusals" that were the bot's
      // doing, not the game's.
      const b = await board();
      if (b.onBoard) {
        await page.waitForTimeout(700);
        const c = await board();
        if (c.onBoard && c.hands === b.hands && c.score === b.score && c.rack.length) return 'board';
        continue;
      }
      const btns = await visibleButtons();
      const label = t => btns.find(x => new RegExp(t, 'i').test(x.text) && !x.off);

      if (label('RETRY RUN|MAIN MENU|Retry Run')) return 'over';

      // A normal player buys what they can pay for, then leaves. A shop card
      // has to be opened before the BUY appears, so open the cheapest one that
      // is still affordable and take it.
      const bought = await pressText(/^BUY/);
      if (bought) { bag.push(shopping || bought); shopping = null; spent++; await page.waitForTimeout(800); continue; }
      const open = await page.evaluate(skip => {
        const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return false;
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return t && (t === e || e.contains(t)); };
        const bank = +(((document.getElementById('val-gold') || {}).textContent || '0').replace(/[^0-9]/g, '')) || 0;
        const cards = [...document.querySelectorAll('.draft-card-wrap')].filter(vis).map(e => ({
          e, price: +(((e.querySelector('.draft-card-price') || {}).textContent || '').replace(/[^0-9]/g, '') || 0),
          label: ((e.querySelector('.draft-card-label') || {}).textContent || '').trim() }));
        // Whatever catches the eye and can be paid for. Always taking the
        // cheapest would quietly turn every run into a Manuscript run.
        const can = cards.filter(c => c.price > 0 && c.price <= bank && !skip.includes(c.label));
        if (!can.length) return null;
        const p = can[Math.floor(Math.random() * can.length)];
        p.e.click();
        return p.label + ' (' + p.price + ')';
      }, [...tried]);
      // Four purchases is a full shop trip. Past that it is looping on a card
      // it cannot actually buy, and the run needs to get on with itself.
      if (open && spent < 5) { shopping = open; tried.add(open.replace(/ \(\d+\)$/, '')); await page.waitForTimeout(600); continue; }
      if (shopping) { shopping = null; if (await pressText(/^BACK$/)) { await page.waitForTimeout(400); continue; } }
      const seq = [/^NEXT/, /^CONTINUE/, /^COLLECT/, /^START STAGE/, /^TO THE SHOP|^SHOP/,
                   /^LEAVE|^DONE|^SKIP/, /^OK$|^GOT IT/, /^CLOSE$/];
      let moved = false;
      for (const re of seq) { if (await pressText(re)) { moved = true; break; } }
      if (moved) { await page.waitForTimeout(650); continue; }

      // a shop card may need opening before it offers a BUY
      const opened = await page.evaluate(() => {
        const c = [...document.querySelectorAll('.draft-card, .shop-item, .draft-option')].find(e => {
          const r = e.getBoundingClientRect(); if (r.width < 5) return false;
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return t && (t === e || e.contains(t)); });
        if (c) { c.click(); return true; } return false;
      });
      if (opened) { await page.waitForTimeout(500); continue; }

      note(run, stage, 'stuck between stages with nothing pressable',
           btns.map(x => x.text).join(' / ').slice(0, 160));
      return 'stuck';
    }
    note(run, stage, 'between-stage screens never handed the board back');
    return 'stuck';
  };

  console.log('\n' + RUNS + ' runs of Classic on Draft. Ordinary words, whatever the shop offers.\n');
  const results = [];

  for (let run = 1; run <= RUNS; run++) {
    errs = [];
    await newRun();
    let b = await board();
    if (!b.onBoard) { note(run, 0, 'the run would not start', JSON.stringify((await visibleButtons()).map(x => x.text))); continue; }

    let stage = 1, ended = null, hands = 0;
    const played = [], stageLog = [], bag = [];

    run_loop:
    for (; stage <= 8; stage++) {
      let guard = 0, stageHands = 0, rejects = 0;
      // A Boss Blind refuses certain words. The refusal shows for 1.1 seconds
      // and then clears, so it has to be read straight after the tap. A player
      // reads it and plays something else; so does this.
      const refused = new Set(); const badLen = new Set(); let lastLen = null; let echo = false;
      const startScore = (await board()).score;

      while (guard++ < 40) {
        b = await board();
        if (!b.onBoard) break;
        if (b.word) { await pressId('btn-clear'); await page.waitForTimeout(300); b = await board(); }

        const opts = findWords(b.rack).filter(w =>
          !refused.has(w) && !badLen.has(w.length) && !(echo && w.length === lastLen));
        if (!opts.length) {
          if (b.discards > 0) {
            await pressId('btn-reroll'); await page.waitForTimeout(250);
            // ditch the three least useful letters
            const worst = b.rack.map((t, i) => ({ i, bad: FREQ.indexOf(t.L) }))
              .filter(x => x.bad >= 0).sort((a, c) => c.bad - a.bad).slice(0, 3);
            for (const w of worst) {
              await page.evaluate(i => { const e = document.querySelectorAll('#hand-rack .tile-inner')[i];
                if (e) { e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                         e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } }, w.i);
              await page.waitForTimeout(110);
            }
            const done = await pressText(/CONFIRM/);
            if (!done) { note(run, stage, 'DISCARD would not confirm after marking tiles',
                              'bench ' + b.rack.map(t => t.L).join('')); break run_loop; }
            await page.waitForTimeout(700); continue;
          }
          note(run, stage, 'no word on the bench and no discards left',
               'bench ' + b.rack.map(t => t.L).join('') + ', ' + b.hands + ' hands, ' + b.score + '/' + b.target);
          break;
        }

        const want = opts[0];
        if (!DICT.has(want)) { note(run, stage, 'my word list and the game disagree', want); refused.add(want); continue; }
        for (const L of want.split('')) { await tapLetter(L); await page.waitForTimeout(75); }
        const st = await board();
        if (st.word !== want) {
          note(run, stage, 'the tiles I tapped did not spell what I meant',
               'wanted ' + want + ', board shows "' + st.word + '"');
          await pressId('btn-clear'); await page.waitForTimeout(300); continue;
        }
        const before = st;
        const fired = await pressId('btn-submit');
        if (!fired) {
          note(run, stage, 'SUBMIT was dead on a real dictionary word',
               want + ' (hands ' + st.hands + ', banner "' + st.banner + '")');
          await pressId('btn-clear'); await page.waitForTimeout(300);
          if (++rejects > 2) break; continue;
        }
        await page.waitForTimeout(400);
        const flash = (await board()).banner;
        await page.waitForTimeout(5000);
        const after = await board();

        // A refusal that says why is the Boss doing its job. One that says
        // nothing at all is the bug worth catching.
        if (after.onBoard && after.hands === before.hands && after.score === before.score) {
          if (!flash || flash === '\u2014' || flash === before.banner) {
            note(run, stage, 'a word was refused with NO explanation on screen',
                 want + ' (hands stayed ' + after.hands + ', banner "' + flash + '")');
          } else if (/INVALID/i.test(flash)) {
            note(run, stage, 'a dictionary word was called invalid', want + ' - "' + flash + '"');
          } else {
            if (/echo|same length|twice/i.test(flash)) echo = true; else badLen.add(want.length);
            refused.add(want);
          }
          rejects++;
          await pressId('btn-clear'); await page.waitForTimeout(350);
          if (rejects > 8) { note(run, stage, 'eight words refused in a row', 'last: "' + flash + '"'); break; }
          continue;
        }
        rejects = 0; lastLen = want.length;
        if (after.onBoard && after.score !== null && before.score !== null) {
          const gained = after.score - before.score;
          if (gained < 0) note(run, stage, 'the score went DOWN after a word',
                               want + ': ' + before.score + ' -> ' + after.score);
          else if (gained === 0 && !/x0/i.test(flash))
            note(run, stage, 'a valid word scored nothing',
                 want + ' at ' + after.score + '/' + after.target + ' (banner "' + flash + '")');
          if (after.bank !== null && before.bank !== null && after.bank < before.bank)
            note(run, stage, 'Diamonds went down for playing a word',
                 before.bank + ' -> ' + after.bank);
        }
        played.push(want); hands++; stageHands++;
        if (!after.onBoard) break;
        if (after.hands !== null && after.hands <= 0) break;
      }
      if (guard >= 40) { note(run, stage, 'a stage would not end after 40 tries'); ended = stage; break; }

      const last = await board();
      stageLog.push({ stage, score: last.score, target: last.target, hands: stageHands });
      const where = await between(run, stage, bag);
      if (where !== 'board') { ended = stage; break; }
    }

    const reached = ended || (stage > 8 ? 'WON' : stage);
    errs.forEach(e => note(run, ended, 'javascript error', e));
    results.push({ run, reached, hands, played, stageLog, bag, errs: errs.slice() });
    console.log('  run ' + String(run).padStart(2) + ':  reached ' + String(reached).padEnd(4) +
                '  ' + String(hands).padStart(2) + ' hands   ' + played.slice(0, 7).join(' '));
    console.log('          bought: ' + (bag.length ? bag.join(' | ') : 'NOTHING'));
    console.log('          stages: ' + stageLog.map(x => x.stage + ') ' + x.score + '/' + x.target).join('  '));
    fs.writeFileSync(OUT, JSON.stringify({ results, issues }, null, 1));
  }

  console.log('\n' + '='.repeat(72));
  const wins = results.filter(r => r.reached === 'WON').length;
  const dist = {}; results.forEach(r => dist[r.reached] = (dist[r.reached] || 0) + 1);
  console.log('\n' + results.length + ' runs played, ' + wins + ' won (' +
              Math.round(wins / Math.max(1, results.length) * 100) + '%)');
  console.log('ended on: ' + Object.entries(dist).sort().map(([k, v]) => k + ' x' + v).join('   '));
  const allWords = results.flatMap(r => r.played);
  console.log('\n' + allWords.length + ' words played, average length ' +
              (allWords.reduce((n, w) => n + w.length, 0) / Math.max(1, allWords.length)).toFixed(1));
  const byLen = {}; allWords.forEach(w => byLen[w.length] = (byLen[w.length] || 0) + 1);
  console.log('lengths: ' + Object.entries(byLen).sort().map(([k, v]) => k + ':' + v).join('  '));

  console.log('\nISSUES: ' + issues.length);
  const grouped = {};
  issues.forEach(i => (grouped[i.what] = grouped[i.what] || []).push(i));
  Object.entries(grouped).sort((a, b) => b[1].length - a[1].length).forEach(([what, list]) => {
    console.log('\n  ' + String(list.length).padStart(3) + 'x  ' + what);
    list.slice(0, 5).forEach(i => console.log('         run ' + i.run + ' stage ' + i.stage + (i.detail ? ': ' + i.detail : '')));
  });
  fs.writeFileSync(OUT, JSON.stringify({ results, issues }, null, 1));
  await browser.close();
  server.close();
})();
