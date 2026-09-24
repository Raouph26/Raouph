import { Game } from './game/game.js';

// Fonts first (canvas textures print with them), then the game.
const fonts = document.fonts?.ready ?? Promise.resolve();
Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(() => {
  try {
    const game = new Game();
    game.boot();
  } catch (e) {
    console.error(e);
    const m = document.getElementById('bootMsg');
    if (m) m.textContent = 'something broke: ' + e.message;
  }
});
