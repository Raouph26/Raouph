import { Game } from './game/game.js';
import { preloadModels } from './render/kit/model.js';

// Fonts first (canvas textures print with them), then the game.
const fonts = document.fonts?.ready ?? Promise.resolve();
Promise.all([Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]), preloadModels().catch((e) => console.warn(e))]).then(() => {
  try {
    const game = new Game();
    game.boot();
  } catch (e) {
    console.error(e);
    const m = document.getElementById('bootMsg');
    if (m) m.textContent = 'something broke: ' + e.message;
  }
});
