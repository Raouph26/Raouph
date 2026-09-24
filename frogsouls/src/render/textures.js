import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Every texture in the game is painted here at load, on a canvas. No image
// files: grounds, screens, faces and particle sprites are all procedural.
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map();

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, { repeat = 1, srgb = true, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
  return t;
}

// ── tiny seeded value noise ─────────────────────────────────────────────────
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function valueNoise(seed, cells) {
  const r = rng(seed);
  const g = new Float32Array((cells + 1) * (cells + 1)).map(() => r());
  // tile seamlessly: last row/col copies the first
  for (let i = 0; i <= cells; i++) { g[i * (cells + 1) + cells] = g[i * (cells + 1)]; g[cells * (cells + 1) + i] = g[i]; }
  const sm = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x) % cells, yi = Math.floor(y) % cells;
    const xf = sm(x - Math.floor(x)), yf = sm(y - Math.floor(y));
    const a = g[yi * (cells + 1) + xi], b = g[yi * (cells + 1) + xi + 1];
    const c = g[(yi + 1) * (cells + 1) + xi], d = g[(yi + 1) * (cells + 1) + xi + 1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
function fbm(seed, octaves = 4, base = 4) {
  const n = Array.from({ length: octaves }, (_, i) => valueNoise(seed + i * 101, base << i));
  return (u, v) => {
    let s = 0, amp = 0.5, norm = 0;
    for (const f of n) { s += f(u, v) * amp; norm += amp; amp *= 0.5; }
    return s / norm;
  };
}

function hex(c) { return `#${c.toString(16).padStart(6, '0')}`; }
function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t];
}

/** Paint a noise field between two colours, with optional speckle. */
function noiseField(size, seed, c0, c1, { octaves = 4, base = 4, speck = 0, speckCol = 0x000000, contrast = 1 } = {}) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const f = fbm(seed, octaves, base);
  const r = rng(seed + 7);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let t = f(x / size, y / size);
    t = Math.min(1, Math.max(0, (t - 0.5) * contrast + 0.5));
    let [R, G, B] = mix(c0, c1, t);
    if (speck && r() < speck) [R, G, B] = mix(speckCol, c1, r() * 0.4);
    const i = (y * size + x) * 4;
    img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ── grounds ─────────────────────────────────────────────────────────────────
export function groundTexture(kind) {
  if (cache.has('g:' + kind)) return cache.get('g:' + kind);
  let c;
  const S = 512;
  if (kind === 'mud') {
    c = noiseField(S, 11, 0x34422a, 0x5e7042, { contrast: 1.5, speck: 0.02, speckCol: 0x1a2016 });
    const ctx = c.getContext('2d');
    const r = rng(3);
    for (let i = 0; i < 40; i++) {          // small moss tufts and pebbles
      ctx.fillStyle = r() < 0.5 ? 'rgba(92,120,62,0.55)' : 'rgba(40,36,30,0.6)';
      ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 2 + r() * 7, 2 + r() * 5, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'flagstone') {
    c = noiseField(S, 21, 0x55565a, 0x76777c, { contrast: 1.3, speck: 0.01 });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(18,18,20,0.75)'; ctx.lineWidth = 3;
    const r = rng(9);
    for (let row = 0; row < 8; row++) {
      const y = row * 64, off = (row % 2) * 40;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
      for (let x = -off; x < S; x += 70 + r() * 30) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke(); }
    }
  } else if (kind === 'carpet') {
    c = canvas(S); const ctx = c.getContext('2d');
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const shade = ((tx + ty) % 2) ? '#8d9199' : '#9ca0a7';
      ctx.fillStyle = shade; ctx.fillRect(tx * 128, ty * 128, 128, 128);
      ctx.strokeStyle = 'rgba(60,64,72,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(tx * 128 + 1, ty * 128 + 1, 126, 126);
      // the loop pile: fine alternating stripes
      ctx.fillStyle = 'rgba(70,74,84,0.05)';
      for (let i = 0; i < 128; i += 4) {
        if ((tx + ty) % 2) ctx.fillRect(tx * 128 + i, ty * 128, 2, 128); else ctx.fillRect(tx * 128, ty * 128 + i, 128, 2);
      }
    }
    const n = noiseField(S, 5, 0x000000, 0xffffff, { contrast: 1 });
    ctx.globalAlpha = 0.08; ctx.drawImage(n, 0, 0); ctx.globalAlpha = 1;
  } else if (kind === 'planks') {
    c = canvas(S); const ctx = c.getContext('2d');
    const r = rng(17);
    for (let i = 0; i < 8; i++) {
      const base = 0x2a1c14 + Math.floor(r() * 3) * 0x040302;
      ctx.fillStyle = hex(base); ctx.fillRect(0, i * 64, S, 64);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(S, i * 64); ctx.stroke();
      for (let k = 0; k < 18; k++) {          // grain
        ctx.strokeStyle = `rgba(${60 + r() * 30},${40 + r() * 20},${24},0.25)`;
        ctx.beginPath(); const y = i * 64 + r() * 64; ctx.moveTo(0, y); ctx.bezierCurveTo(S * .3, y + r() * 6 - 3, S * .6, y + r() * 6 - 3, S, y); ctx.stroke();
      }
      const seam = r() * S; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(seam, i * 64, 2, 64);
    }
  } else if (kind === 'grating') {
    c = canvas(S); const ctx = c.getContext('2d');
    ctx.fillStyle = '#17181a'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 32) {
      ctx.fillStyle = '#3a3b3f'; ctx.fillRect(i, 0, 6, S); ctx.fillRect(0, i, S, 6);
      ctx.fillStyle = '#56575c'; ctx.fillRect(i, 0, 2, S); ctx.fillRect(0, i, S, 2);
    }
    const n = noiseField(S, 31, 0x000000, 0xffffff);
    ctx.globalAlpha = 0.12; ctx.drawImage(n, 0, 0); ctx.globalAlpha = 1;
  } else if (kind === 'lily') {
    // the hub: a lily pad seen from above — radial veins from the centre
    c = noiseField(S, 41, 0x1f4a2c, 0x2f6b3a, { contrast: 1.2 });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(150,190,110,0.16)'; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(S / 2, S / 2);
      ctx.quadraticCurveTo(S / 2 + Math.cos(a + 0.12) * S * 0.25, S / 2 + Math.sin(a + 0.12) * S * 0.25, S / 2 + Math.cos(a) * S * 0.5, S / 2 + Math.sin(a) * S * 0.5);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(210,230,150,0.35)'); g.addColorStop(0.15, 'rgba(210,230,150,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  } else {
    c = noiseField(S, 1, 0x333333, 0x555555);
  }
  const tex = toTex(c, { repeat: kind === 'lily' ? 1 : 6 });
  if (kind === 'lily') { tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1, 1); }
  cache.set('g:' + kind, tex);
  return tex;
}

// ── particles ───────────────────────────────────────────────────────────────
export function softSprite() {
  if (cache.has('sprite')) return cache.get('sprite');
  const c = canvas(64), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = toTex(c, { srgb: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('sprite', t);
  return t;
}

// ── screens: the faces of the bosses that have them ─────────────────────────
// Each returns a CanvasTexture plus a redraw(state) so a face can change mid-fight.
export function screenTexture(kind, w = 256, h = 192) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const tex = toTex(c, { repeat: 1 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const font = (px, weight = 700) => `${weight} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const center = (text, y, px, col, weight) => { ctx.font = font(px, weight); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, y); };
  const scan = () => { ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2); };

  const draw = {
    crt(s = {}) {        // THE BLUE SCREEN
      ctx.fillStyle = s.crit ? '#0a0a0a' : '#1f4fd8'; ctx.fillRect(0, 0, w, h);
      center(':(', h * 0.42, 96, '#f4f7ff');
      ctx.font = font(15, 500); ctx.fillStyle = '#dbe4ff'; ctx.textAlign = 'left';
      ctx.fillText(s.line ?? 'your pond ran into a problem', 18, h * 0.8);
      scan();
    },
    ad(s = {}) {         // THE UNSKIPPABLE AD
      ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ff3b6b'); g.addColorStop(1, '#ffb23f');
      ctx.fillStyle = g; ctx.fillRect(10, 10, w - 20, h - 64);
      center('AD', h * 0.36, 70, '#ffffff');
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(w - 128, h - 48, 118, 38);
      ctx.font = font(20, 600); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(s.skip > 0 ? `skip in ${s.skip}` : 'skip ad ▶', w - 69, h - 29);
      scan();
    },
    phone(s = {}) {      // THE INFLUENCER
      ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f7e9ee'; ctx.fillRect(14, 14, w - 28, h - 28);
      ctx.fillStyle = '#ff7ac2'; ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101014'; ctx.fillRect(w / 2 - 16, h * 0.38, 7, 7); ctx.fillRect(w / 2 + 9, h * 0.38, 7, 7);
      ctx.fillRect(w / 2 - 12, h * 0.49, 24, 4);
      center('link in bio', h * 0.78, 22, '#ff3b8b', 700);
    },
    captcha(s = {}) {    // THE CAPTCHA
      ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3f8cff'; ctx.fillRect(0, 0, w, 40);
      ctx.font = font(15, 600); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('select all squares with a', 10, 20);
      ctx.font = font(22, 800); ctx.fillText('FROG', 170, 20);
      const cs = 44;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = 55 + i * (cs + 4), y = 48 + j * (cs + 4);
        ctx.fillStyle = (s.sel ?? []).includes(i * 3 + j) ? '#3f8cff' : ['#7a8a5a', '#8a9aa4', '#6a7a4a'][(i + j) % 3];
        ctx.fillRect(x, y, cs, cs);
      }
    },
    battery(s = {}) {    // THE LOW BATTERY
      const pct = s.pct ?? 1;
      ctx.fillStyle = '#0d0e10'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 8; ctx.strokeRect(34, 44, w - 90, h - 88);
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(w - 56, h / 2 - 20, 16, 40);
      ctx.fillStyle = pct < 0.2 ? '#ff3b30' : '#46d160';
      ctx.fillRect(44, 54, Math.max(6, (w - 110) * pct), h - 108);
      if (pct < 0.2) center(`${Math.max(1, Math.round(pct * 100))}%`, h / 2, 40, '#ffffff');
    },
    ai(s = {}) {         // THE ALGORITHM — an iris in a prism
      ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, h * 0.45);
      g.addColorStop(0, '#000'); g.addColorStop(0.18, '#000'); g.addColorStop(0.2, '#e8e0ff'); g.addColorStop(0.5, '#c28bff'); g.addColorStop(1, '#2a1c44');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2 + (s.lookX ?? 0) * 20, h / 2, h * 0.42, 0, Math.PI * 2); ctx.fill();
    },
    projector(s = {}) {  // THE MEETING — a slide nobody asked for
      ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, w, h);
      ctx.font = font(18, 700); ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.fillText('Q3 SYNERGY ALIGNMENT', 14, 24);
      const bars = [0.4, 0.7, 0.55, 0.9, 0.3];
      bars.forEach((b, i) => { ctx.fillStyle = i === 3 ? '#ff3b3b' : '#7a8aa0'; ctx.fillRect(24 + i * 44, h - 20 - b * 110, 30, b * 110); });
    },
    glitch(s = {}) {     // THE LAG
      ctx.fillStyle = '#0b0c10'; ctx.fillRect(0, 0, w, h);
      const r = rng(Math.floor((s.t ?? 0) * 12));
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = ['#57ffb0', '#ff3bd4', '#3bd4ff', '#ffffff'][Math.floor(r() * 4)];
        ctx.fillRect(r() * w, r() * h, r() * 120, 4 + r() * 18);
      }
      center('...', h / 2, 60, '#ffffff');
    },
    spinner(s = {}) {    // THE LOADING SCREEN
      ctx.fillStyle = '#101118'; ctx.fillRect(0, 0, w, h);
      const t = s.t ?? 0;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 5;
        ctx.fillStyle = `rgba(224,230,255,${(i / 12)})`;
        ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 50, h / 2 + Math.sin(a) * 50, 8, 0, Math.PI * 2); ctx.fill();
      }
    },
  };

  const fn = draw[kind] ?? draw.crt;
  let last = '';
  const redraw = (state = {}) => {
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    ctx.clearRect(0, 0, w, h);
    fn(state);
    tex.needsUpdate = true;
  };
  redraw({});
  return { tex, redraw };
}

// ── small printed labels (keycaps, signs, bubbles) ──────────────────────────
export function labelTexture(text, { w = 256, h = 128, bg = '#f2f2f2', fg = '#111', px = 64, weight = 800, radius = 18 } = {}) {
  const key = `l:${text}:${w}:${h}:${bg}:${fg}:${px}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h), ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, radius); ctx.fill();
  }
  ctx.fillStyle = fg; ctx.font = `${weight} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

/** A tiny scrolling feed post for the 3 A.M. world's floating phones. */
export function feedTexture(seed) {
  const key = 'feed:' + seed;
  if (cache.has(key)) return cache.get(key);
  const w = 160, h = 300, c = canvas(w, h), ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = '#0e0f13'; ctx.fillRect(0, 0, w, h);
  for (let y = 10; y < h; y += 96) {
    ctx.fillStyle = ['#ffb257', '#ff7ac2', '#57a8ff', '#46d160'][Math.floor(r() * 4)];
    ctx.beginPath(); ctx.arc(20, y + 12, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d8de'; ctx.fillRect(36, y + 6, 60 + r() * 40, 5); ctx.fillRect(36, y + 15, 40 + r() * 30, 4);
    ctx.fillStyle = `hsl(${Math.floor(r() * 360)},45%,${30 + r() * 25}%)`; ctx.fillRect(10, y + 30, w - 20, 48);
    ctx.fillStyle = '#ff3b6b'; ctx.fillText?.('♥', 12, y + 90);
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}
