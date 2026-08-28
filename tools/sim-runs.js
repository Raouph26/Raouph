// What a run ACTUALLY plays like.
//
// The old simulator assumed the player could spell a word of their chosen
// length every single hand. A real rack is ten random tiles, and an eight
// letter word is not in most of them. That one assumption is why the sim said
// every build clears stage 8 in three hands while forty real games could not
// get past stage 6.
//
// This one deals a real bag, finds the best word actually spellable from the
// rack, and plays it. Every constant is read out of index.html.
const fs = require('fs');
const SRC = fs.readFileSync(require('path').resolve(__dirname,'..','index.html'), 'utf8');
const WORDS = fs.readFileSync(require('path').resolve(__dirname,'..','words.js'), 'utf8');

const grab = name => {
  const m = SRC.match(new RegExp('const ' + name + '\\s*=\\s*(\\{[^;]*?\\});'));
  if (!m) throw new Error('cannot read ' + name);
  return eval('(' + m[1].replace(/\s+/g, ' ') + ')');
};
const CHIPS = grab('LENGTH_BASE_CHIPS');
const MULT = grab('LENGTH_BASE_MULT');
const GAIN = grab('LENGTH_LEVEL_GAIN');
const TARGETS = eval(SRC.match(/const CLASSIC_STAGE_TARGETS = (\[[^\]]*\])/)[1]);
const MAX_LEVEL = +SRC.match(/const MAX_LENGTH_LEVEL = (\d+)/)[1];
const HAND_SIZE = +SRC.match(/const BASE_HAND_SIZE = (\d+)/)[1];
const MS_PRICE = +SRC.match(/manuscript:(\d+)/)[1];
const GLYPH_PRICE = +SRC.match(/const SHOP_PRICES = \{ glyph:(\d+)/)[1];
const TILE_DIST = eval(SRC.match(/const TILE_DIST = (\[[\s\S]*?\]);/)[1]);
const STAKES = eval(SRC.slice(SRC.indexOf('const STAKES = ['), SRC.indexOf('const MAX_STAKE'))
  .replace('const STAKES = ', '').replace(/;\s*$/, '').replace(/\/\/[^\n]*/g, ''));

const key = w => w.split('').sort().join('');
// sorted-letters -> the highest-chip word with those letters, per length
const BY_KEY = new Map();
{
  const chipOf = {};
  TILE_DIST.forEach(d => { chipOf[d.letter] = d.chips; });
  const list = WORDS.match(/DICTIONARY_WORDS = "([\s\S]*?)";/)[1].split(' ');
  for (const w of list) {
    if (w.length < 3 || w.length > HAND_SIZE) continue;
    const k = key(w);
    if (!BY_KEY.has(k)) BY_KEY.set(k, w);
  }
}

const lengthKey = l => (l >= 10 ? 10 : l);
const baseChips = (l, lv) => CHIPS[lengthKey(l)] + (lv - 1) * GAIN[lengthKey(l)].c;
const baseMult = (l, lv) => MULT[lengthKey(l)] + (lv - 1) * GAIN[lengthKey(l)].m;

// the glyphs a real shop can offer, as they actually score
const GLYPHS = {
  vowel_anchor:     { chips: w => 15 * (w.match(/[AEIOU]/g) || []).length },
  consonant_charge: { chips: w => 10 * (w.match(/[^AEIOU]/g) || []).length },
  scrabble_master:  { chips: w => /[QXZJ]/.test(w) ? 40 : 0 },
  long_form:        { chips: w => w.length >= 6 ? 60 : 0 },
  grammarian:       { addMult: w => 3 * (w.match(/[AEIOU]/g) || []).length },
  bookends:         { addMult: w => w[0] === w[w.length - 1] ? 8 : 0 },
  double_down:      { addMult: w => 4 * (w.length - new Set(w).size) },
  novelist:         { xMult: w => w.length >= 6 ? 3 : 1 },
  underdog:         { xMult: w => w.length === 3 ? 3 : 1 },
  sonnet:           { xMult: w => (w.length === 4 || w.length === 5) ? 3 : 1 },
  heavy_hitter:     { xMult: w => Math.pow(2, (w.match(/[QXZJ]/g) || []).length) },
};
const GLYPH_POOL = Object.keys(GLYPHS);

function scoreWord(word, tiles, levels, glyphs) {
  const lv = levels[lengthKey(word.length)] || 1;
  let chips = tiles.reduce((n, t) => n + t.chips, 0) + baseChips(word.length, lv);
  let mult = baseMult(word.length, lv);
  glyphs.forEach(g => { const d = GLYPHS[g]; if (d && d.chips) chips += d.chips(word); });
  glyphs.forEach(g => { const d = GLYPHS[g]; if (d && d.addMult) mult += d.addMult(word); });
  glyphs.forEach(g => { const d = GLYPHS[g]; if (d && d.xMult) mult *= d.xMult(word); });
  return Math.floor(chips * mult);
}

function buildBag() {
  const bag = [];
  TILE_DIST.forEach(d => { for (let i = 0; i < d.qty; i++) bag.push({ letter: d.letter, chips: d.chips }); });
  for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

// every word spellable from this rack, scored - 2^10 subsets is nothing
function bestPlays(rack, levels, glyphs) {
  const out = [];
  const n = rack.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (idx.length < 3) continue;
    const tiles = idx.map(i => rack[i]);
    const w = BY_KEY.get(key(tiles.map(t => t.letter).join('')));
    if (!w) continue;
    out.push({ word: w, idx, score: scoreWord(w, tiles, levels, glyphs) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// ---------------------------------------------------------------- one run
// style: 'best'  - play the highest-scoring word available, level what you play
//        'long'  - hold out for 6+ letters, level 6+
function playRun(stake, style, skill) {
  // skill 1 = plays the optimal word every time (a solver, not a person)
  // skill 3 = picks among the best three it spotted
  // skill 6 = picks among the best six - a distracted player on a bus
  const choose = list => list.length
    ? list[Math.floor(Math.random() * Math.min(list.length, skill))] : null;
  const tMult = stake.targetMult || 1;
  const discardsPer = 3 - (stake.discardCut || 0);
  let bag = buildBag(), discardPile = [];
  const levels = {}; for (let i = 3; i <= 10; i++) levels[i] = 1;
  let glyphs = [], bank = 15;
  const played = {};

  const draw = rack => {
    while (rack.length < HAND_SIZE) {
      if (!bag.length) { bag = discardPile; discardPile = [];
        for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random()*(i+1))|0; [bag[i],bag[j]]=[bag[j],bag[i]]; }
        if (!bag.length) break; }
      rack.push(bag.pop());
    }
    return rack;
  };

  for (let stage = 1; stage <= 8; stage++) {
    const target = Math.floor(TARGETS[stage] * tMult);
    let hands = 4 + (stage >= 5 ? 1 : 0) + (stage >= 7 ? 1 : 0);
    let discards = discardsPer;
    let score = 0;
    let rack = draw([]);

    while (hands > 0 && score < target) {
      const plays = bestPlays(rack, levels, glyphs);
      let pick = choose(plays);
      if (style === 'long') {
        const longEnough = choose(plays.filter(p => p.word.length >= 6));
        // hold out for a long word while there are discards to spend on it
        if (longEnough) pick = longEnough;
        else if (discards > 0) {
          discards--;
          // throw the four weakest tiles
          const order = rack.map((t, i) => ({ t, i })).sort((a, b) => a.t.chips - b.t.chips);
          const toss = new Set(order.slice(0, 4).map(o => o.i));
          const kept = rack.filter((_, i) => !toss.has(i));
          rack.forEach((t, i) => { if (toss.has(i)) discardPile.push(t); });
          rack = draw(kept);
          continue;
        }
      }
      if (!pick) {
        if (discards > 0) { discards--; discardPile.push(...rack); rack = draw([]); continue; }
        break;
      }
      score += pick.score;
      played[pick.word.length] = (played[pick.word.length] || 0) + 1;
      const used = new Set(pick.idx);
      rack.forEach((t, i) => { if (used.has(i)) discardPile.push(t); });
      rack = draw(rack.filter((_, i) => !used.has(i)));
      hands--;
    }

    if (score < target) return { died: stage, levels, glyphs: glyphs.length };

    // ---- payout, exactly as the game pays it
    bank += 3 + hands + discards;
    bank += Math.min(5, Math.floor(bank / 5));
    discardPile.push(...rack);

    // ---- shop. One Manuscript on the shelf, then a glyph, then rerolls for
    // more Manuscripts while there is money spare.
    const favourite = style === 'long' ? 6
      : +Object.entries(played).sort((a, b) => b[1] - a[1])[0][0] || 5;
    const buyLevel = () => { if (bank >= MS_PRICE && levels[lengthKey(favourite)] < MAX_LEVEL) {
      bank -= MS_PRICE; levels[lengthKey(favourite)]++; return true; } return false; };
    buyLevel();
    if (bank >= GLYPH_PRICE && glyphs.length < Math.min(6, 4 + Math.floor(stage / 2))) {
      const want = style === 'long'
        ? ['long_form', 'novelist', 'grammarian', 'vowel_anchor', 'heavy_hitter', 'double_down']
        : ['grammarian', 'vowel_anchor', 'consonant_charge', 'sonnet', 'double_down', 'bookends'];
      const next = want.find(g => !glyphs.includes(g));
      if (next) { bank -= GLYPH_PRICE; glyphs.push(next); }
    }
    while (bank - (MS_PRICE + 3) >= 10 && buyLevel()) { bank -= 3; }
  }
  return { died: 0, levels, glyphs: glyphs.length };
}

// ---------------------------------------------------------------- report
const RUNS = +(process.argv[2] || 300);
console.log('\n' + RUNS + ' runs per cell.\n');
console.log('WIN RATE, by how the player plays and how well they see the board\n');
console.log('stake             solver  sharp  average  casual   |  style');
console.log('-'.repeat(64));
for (const stake of STAKES) {
  for (const style of ['long', 'best']) {
    const cells = [1, 3, 6, 10].map(skill => {
      let wins = 0;
      for (let i = 0; i < RUNS; i++) if (!playRun(stake, style, skill).died) wins++;
      return ((wins / RUNS * 100).toFixed(0) + '%').padStart(7);
    });
    console.log((stake.n + ' ' + stake.name).padEnd(17) + cells.join('') +
      '   |  ' + (style === 'long' ? 'commits to 6+ letters' : 'plays the best word it sees'));
  }
}

console.log('\n\nWHERE RUNS DIE at Draft (average player, 300 runs)\n');
for (const style of ['long', 'best']) {
  const died = new Array(10).fill(0);
  for (let i = 0; i < 300; i++) { const r = playRun(STAKES[0], style, 6); died[r.died || 9]++; }
  console.log((style === 'long' ? 'commits to 6+' : 'plays what it sees').padEnd(20) +
    [1,2,3,4,5,6,7,8].map(s => 'S' + s + ':' + String(Math.round(died[s]/3)).padStart(3) + '%').join('  ') +
    '   won:' + String(Math.round(died[9]/3)).padStart(3) + '%');
}

console.log('\nWhat a single word is worth with no glyphs, by length and level:');
console.log('len  ' + [1,3,5,8,12,16,20].map(l => ('lv' + l).padStart(10)).join(''));
for (let l = 3; l <= 9; l++) {
  const avgChips = l * 1.9;
  console.log(String(l).padEnd(5) + [1,3,5,8,12,16,20].map(lv =>
    Math.floor((baseChips(l, lv) + avgChips) * baseMult(l, lv)).toLocaleString().padStart(10)).join(''));
}
console.log('\nStage targets: ' + TARGETS.slice(1).map(t => t.toLocaleString()).join('  '));
