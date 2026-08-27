// The trailer's text cards, drawn in the browser with the game's own typeface
// and palette rather than burned in by ffmpeg's text renderer - which cannot
// letter-space, cannot balance, and would not match the game.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/cards';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const CARDS = [
  { f: 'spell',   word: 'SPELL',   sub: 'ten letters, one target' },
  { f: 'collect', word: 'COLLECT', sub: 'glyphs, seals, levels' },
  { f: 'defeat',  word: 'DEFEAT',  sub: 'seven boss blinds' },
  { f: 'win',     word: 'WIN!',    sub: 'eight stages, one life' }
];

const page = (body, extra) => `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&display=swap">
<style>
  html,body{margin:0;padding:0;width:1080px;height:1920px;overflow:hidden;
    font-family:'Poppins',sans-serif;-webkit-font-smoothing:antialiased}
  /* the game's own split field, so a card never looks bolted on */
  .bg{position:absolute;inset:0;background:linear-gradient(135deg,#FF5A5A 0 42%,#3B82F6 42% 100%)}
  .bg::after{content:'';position:absolute;inset:0;opacity:.10;
    background-image:repeating-linear-gradient(45deg,#fff 0 28px,transparent 28px 84px),
                     repeating-linear-gradient(-45deg,#fff 0 28px,transparent 28px 84px)}
  .mid{position:absolute;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:28px;text-align:center;padding:0 70px}
  ${extra || ''}
</style>
<div class="bg"></div>
<div class="mid">${body}</div>`;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();

  for (const c of CARDS) {
    await p.setContent(page(
      `<div class="word">${c.word}</div><div class="sub">${c.sub}</div>`,
      `.word{font-size:190px;font-weight:900;letter-spacing:-4px;line-height:.95;color:#fff;
         text-shadow:0 14px 0 rgba(15,23,42,.32), 0 26px 60px rgba(0,0,0,.35)}
       .sub{font-size:44px;font-weight:700;letter-spacing:3px;text-transform:uppercase;
         color:#fff;opacity:.9}`));
    await p.waitForTimeout(700);
    await p.screenshot({ path: OUT + '/' + c.f + '.png' });
    console.log('card: ' + c.word);
  }

  // the end card: what it is called, and where to get it
  const logo = fs.readFileSync(require('path').resolve(__dirname,'..','icon-512.png')).toString('base64');
  await p.setContent(page(
    `<img class="icon" src="data:image/png;base64,${logo}">
     <div class="title">WORDSPYRE</div>
     <div class="tag">A WORD GAME WITH ROGUELITE TEETH</div>
     <div class="cta">FREE ON ANDROID</div>`,
    `.icon{width:300px;height:300px;border-radius:64px;box-shadow:0 18px 0 rgba(15,23,42,.3),0 30px 70px rgba(0,0,0,.4)}
     .title{font-size:132px;font-weight:900;letter-spacing:-2px;color:#fff;
       text-shadow:0 12px 0 rgba(15,23,42,.32), 0 24px 56px rgba(0,0,0,.35)}
     .tag{font-size:38px;font-weight:700;letter-spacing:3px;color:#fff;opacity:.9;margin-top:-14px}
     .cta{margin-top:26px;font-size:46px;font-weight:900;letter-spacing:3px;
       background:#FFC107;color:#241a00;padding:26px 56px;border-radius:28px;
       box-shadow:0 12px 0 #C68A00}`));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/end.png' });
  console.log('card: END');

  await b.close();
})();
