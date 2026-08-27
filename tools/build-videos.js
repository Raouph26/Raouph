// Turn the raw captures into files that can actually be posted.
//
// Two problems with the .webm files the recorder writes. Instagram does not
// accept the format at all, and each one opens on four or five seconds of menu
// before anything happens - the exact seconds a social video has to earn.
//
// Both are fixed here. Every clip is cut to the frame the board appears, using
// the timing manifest the recorder wrote alongside it, and encoded to H.264 in
// an MP4 at the spec Instagram, Facebook, TikTok and YouTube all take.
//
// Each clip is written twice: once with the game's own music under it, once
// silent. Silent is not a mistake - on Reels and TikTok, audio added inside the
// app reaches further than audio baked into the file.
const { execFileSync } = require('child_process');
const fs = require('fs');
const p = require('path');

const FF = p.join(__dirname, 'node_modules/ffmpeg-static/ffmpeg');
const FP = p.join(__dirname, 'node_modules/ffprobe-static/bin/linux/x64/ffprobe');
const REPO = p.resolve(__dirname, '..');
const SRC = REPO + '/promo';
const OUT = REPO + '/promo-mp4';
const CARDS = __dirname + '/cards';
const MUSIC = REPO + '/sounds/music-game.mp3';
// measured: 36s-60s is the fullest part of the track
const MUSIC_IN = 36;

if (!process.argv.includes('--trailer')) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const TIMING = JSON.parse(fs.readFileSync(SRC + '/timing.json', 'utf8'));

const ff = args => execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const dur = f => +execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();

// the encode every file shares, so nothing is posted at the wrong spec
const VIDEO = ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'slow',
  '-crf', '21', '-maxrate', '9M', '-bufsize', '14M', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart'];
const AUDIO = ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2'];

// ---------------------------------------------------------------- the singles
const TRAILER_ONLY = process.argv.includes('--trailer');
console.log('\nsingles');
const singles = TRAILER_ONLY ? [] : fs.readdirSync(SRC).filter(f => f.endsWith('.webm')).sort();
for (const f of singles) {
  const name = f.replace('.webm', '');
  const src = SRC + '/' + f;
  const marks = TIMING[name] || {};
  // half a second of the board before anything moves reads as intent, not as a
  // clip that started late
  const start = Math.max(0, (marks.board || 0) - 0.5);
  const len = +(dur(src) - start).toFixed(2);

  ff([...['-ss', String(start), '-i', src],
      '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p',
      '-an', ...VIDEO, OUT + '/' + name + '-silent.mp4']);

  ff(['-ss', String(start), '-i', src,
      '-ss', String(MUSIC_IN), '-t', String(len), '-i', MUSIC,
      '-filter_complex',
        '[0:v]fps=30,scale=1080:1920:flags=lanczos,format=yuv420p[v];' +
        `[1:a]afade=t=in:st=0:d=1.0,afade=t=out:st=${(len - 1.5).toFixed(2)}:d=1.5,volume=0.5[a]`,
      '-map', '[v]', '-map', '[a]', '-t', String(len),
      ...VIDEO, ...AUDIO, OUT + '/' + name + '-music.mp4']);

  console.log('  ' + name.padEnd(24) + 'cut ' + start.toFixed(1) + 's  ->  ' + len.toFixed(1) + 's');
}

// ---------------------------------------------------------------- the trailer
// SPELL / COLLECT / DEFEAT / WIN, each opening a section of real footage. Every
// in-point comes from the manifest, so a re-record moves the cuts with it.
const m = k => TIMING[k];
const SEQ = [
  { card: 'spell',   t: 0.9 },
  // start late enough that the word is nearly complete: a half-built word reads
  // INVALID WORD in red, which is not what the opening of a trailer should say
  { clip: '03-zyzzyva',            at: m('03-zyzzyva').wordIn - 1.1,       t: 3.2 },
  // wordIn is stamped on the last TAP, and the tile takes about half a second
  // to land and the banner to catch up, so the cut waits for it
  { clip: '05-kerfuffle',          at: m('05-kerfuffle').wordIn + 0.6,     t: 2.5 },
  { card: 'collect', t: 0.9 },
  { clip: '14-word-levels',        at: m('14-word-levels').board + 0.2,    t: 2.6 },
  { clip: '14-word-levels',        at: m('14-word-levels').board + 3.2,    t: 2.6 },
  { clip: '13-new-run-and-stakes', at: m('13-new-run-and-stakes').board + 0.2, t: 2.6 },
  { card: 'defeat',  t: 0.9 },
  { clip: '16-boss-blind',         at: m('16-boss-blind').board + 1.0,     t: 2.4 },
  { clip: '16-boss-blind',         at: m('16-boss-blind').reject + 0.1,    t: 2.4 },
  { card: 'win',     t: 0.9 },
  // The score does not visibly count up at this size - it snaps. What is worth
  // watching is the multiplier stacking: 432, then 2,592, then 20,752, with the
  // MULT chips firing off the glyphs. That, and the total it lands on.
  { clip: '10-jackpot',            at: m('10-jackpot').submit + 4.9,       t: 4.6 },
  // the payout panel lands late, so the last frame is held rather than cut short
  { clip: '12-stage-cleared',      at: m('12-stage-cleared').submit + 10.2, t: 1.9, hold: 0.8 },
  { card: 'end',     t: 4.0 }
];

const inputs = [];
const parts = [];
SEQ.forEach((s, i) => {
  if (s.card) {
    inputs.push('-loop', '1', '-t', String(s.t), '-i', CARDS + '/' + s.card + '.png');
    parts.push(`[${i}:v]fps=30,scale=1080:1920,format=yuv420p,setpts=PTS-STARTPTS[p${i}]`);
  } else {
    inputs.push('-ss', String(s.at.toFixed(2)), '-t', String(s.t), '-i', SRC + '/' + s.clip + '.webm');
    const freeze = s.hold ? `,tpad=stop_mode=clone:stop_duration=${s.hold}` : '';
    parts.push(`[${i}:v]fps=30,scale=1080:1920:flags=lanczos,format=yuv420p${freeze},setpts=PTS-STARTPTS[p${i}]`);
  }
});
const total = SEQ.reduce((n, s) => n + s.t + (s.hold || 0), 0);
inputs.push('-ss', String(MUSIC_IN), '-t', String(total), '-i', MUSIC);

const chain = parts.join(';') + ';' +
  SEQ.map((_, i) => `[p${i}]`).join('') + `concat=n=${SEQ.length}:v=1:a=0[v];` +
  `[${SEQ.length}:a]afade=t=in:st=0:d=1.0,afade=t=out:st=${(total - 2.2).toFixed(2)}:d=2.2,volume=0.55[a]`;

console.log('\ntrailer (' + total.toFixed(1) + 's)');
ff([...inputs, '-filter_complex', chain, '-map', '[v]', '-map', '[a]',
    '-t', String(total), ...VIDEO, ...AUDIO, OUT + '/00-TRAILER.mp4']);

// and a silent cut, for adding audio in-app
ff([...inputs.slice(0, inputs.length - 6), '-filter_complex',
    parts.join(';') + ';' + SEQ.map((_, i) => `[p${i}]`).join('') + `concat=n=${SEQ.length}:v=1:a=0[v]`,
    '-map', '[v]', '-an', '-t', String(total), ...VIDEO, OUT + '/00-TRAILER-silent.mp4']);

console.log('\n' + fs.readdirSync(OUT).length + ' files in ' + OUT);
let mb = 0;
fs.readdirSync(OUT).sort().forEach(f => {
  const kb = fs.statSync(OUT + '/' + f).size / 1024; mb += kb / 1024;
  console.log('  ' + f.padEnd(34) + dur(OUT + '/' + f).toFixed(1) + 's  ' + Math.round(kb) + 'KB');
});
console.log('  total ' + mb.toFixed(0) + 'MB');
