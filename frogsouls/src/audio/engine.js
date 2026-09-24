// ─────────────────────────────────────────────────────────────────────────────
// Audio: every sound in the game is synthesised here with WebAudio — no files.
// Buses: sfx and music into a compressor, with a shared convolution reverb
// whose impulse is generated too. Positional sounds pan and attenuate from
// the camera. All sounds get a little random variation so repeats don't grate.
// ─────────────────────────────────────────────────────────────────────────────

const rnd = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.9 };
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.enabled = true;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.ratio.value = 4; this.comp.attack.value = .004; this.comp.release.value = .2;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.revSend = ctx.createGain(); this.revSend.gain.value = .5;
    this.revSend.connect(this.reverb).connect(this.master);
    this.noise = this._noiseBuffer(2);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, .05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, .05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * .55, t, .05);
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }

  setReverb(size = 2.6, wet = .5) {
    if (!this.ctx) return;
    this.reverb.buffer = this._impulse(size, 2.4);
    this.revSend.gain.setTargetAtTime(wet, this.ctx.currentTime, .1);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── building blocks ───────────────────────────────────────────────────────
  /** An output node for one sound: gain → pan → sfx bus (+ reverb send). */
  _out(opts = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let gain = opts.gain ?? 1, pan = 0;
    if (opts.pos) {
      const dx = opts.pos.x - this.listener.x, dz = opts.pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      gain *= 1 / (1 + Math.max(0, d - 4) * .08);
      const rightX = -Math.cos(this.listener.yaw), rightZ = Math.sin(this.listener.yaw);
      pan = Math.max(-.85, Math.min(.85, (dx * rightX + dz * rightZ) / Math.max(4, d)));
    }
    g.gain.value = gain;
    let node = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(opts.bus ?? this.sfxBus);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; node.connect(s); s.connect(this.revSend); }
    return g;
  }

  _env(param, t, a, peak, d, sustain = 0, r = 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
    if (r) param.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  }

  _osc(type, freq, t, dur, dest, { gain = .5, a = .005, freqEnd, curve = 'exp', detune = 0 } = {}) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (freqEnd) curve === 'lin' ? o.frequency.linearRampToValueAtTime(freqEnd, t + dur) : o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    this._env(g.gain, t, a, gain, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + a + dur + .05);
    return o;
  }

  _noise(t, dur, dest, { gain = .5, a = .003, type = 'bandpass', f = 1000, fEnd, q = 1, rate = 1 } = {}) {
    const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; s.playbackRate.value = rate;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    this._env(g.gain, t, a, gain, dur);
    s.connect(fl).connect(g).connect(dest);
    const off = Math.random() * 1.5;
    s.start(t, off); s.stop(t + a + dur + .05);
  }

  /** Inharmonic partials: bells, clangs, parries. */
  _metal(t, base, dest, { partials = [1, 2.76, 5.4, 8.93, 13.34], gain = .3, dur = 1.2, bright = 1 } = {}) {
    partials.forEach((p, i) => {
      this._osc('sine', base * p * rnd(.995, 1.005), t, dur * (1 - i * .13) * (i ? 1 : 1.3), dest, { gain: gain * Math.pow(.62, i) * (i ? bright : 1), a: .001 });
    });
  }

  // ── the sound library ─────────────────────────────────────────────────────
  play(name, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const fn = SFX[name];
    if (!fn) return;
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    try { fn.call(this, t, opts); } catch { /* a missing node on an old browser shouldn't stop the game */ }
  }

  voice(preset, kind = 'attack', opts = {}) {
    if (!this.ready) return;
    const v = VOICES[preset] ?? VOICES.drone;
    const t = this.ctx.currentTime;
    try { v.call(this, t, kind, opts); } catch { /* ignore */ }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
const SFX = {
  whoosh(t, o) {
    const out = this._out({ ...o, gain: .55 * (o.gain ?? 1) });
    const h = o.heavy ? .55 : 1;
    this._noise(t, .2 / h, out, { gain: .7, a: .03, f: 2600 * h * rnd(.9, 1.1), fEnd: 500 * h, q: 1.2 });
    if (o.heavy) this._osc('sine', 110, t + .02, .25, out, { gain: .25, freqEnd: 60 });
  },
  whooshBig(t, o) {
    const out = this._out({ ...o, gain: .6 });
    this._noise(t, .42, out, { gain: .8, a: .06, f: 1100 * rnd(.9, 1.1), fEnd: 180, q: 1 });
    this._osc('sine', 70, t + .05, .4, out, { gain: .2, freqEnd: 40 });
  },
  whooshSmall(t, o) {
    const out = this._out({ ...o, gain: .4 });
    this._noise(t, .12, out, { gain: .6, a: .02, f: 3200 * rnd(.9, 1.1), fEnd: 900, q: 1.5 });
  },
  hit(t, o) {                       // your blade landing on a boss
    const out = this._out({ ...o, gain: .8, rev: .12 });
    const h = o.heavy ? 1.35 : 1;
    this._noise(t, .09 * h, out, { gain: .9, type: 'lowpass', f: 2400, fEnd: 400 });
    this._osc('sine', 150 * rnd(.9, 1.1) / h, t, .16 * h, out, { gain: .7 * h, freqEnd: 50 });
    this._osc('triangle', 900, t, .03, out, { gain: .25, freqEnd: 300 });
    if (o.heavy) this._noise(t + .01, .22, out, { gain: .5, type: 'lowpass', f: 700, fEnd: 120 });
  },
  hurt(t, o) {                      // the frog gets hit — and croaks
    const out = this._out({ ...o, gain: .8, rev: .1 });
    this._noise(t, .12, out, { gain: .9, f: 1100, fEnd: 300, q: .8 });
    this._osc('sine', 200, t, .18, out, { gain: .6, freqEnd: 70 });
    const v = this.ctx.createBiquadFilter(); v.type = 'bandpass'; v.frequency.value = 850; v.Q.value = 5; v.connect(out);
    this._osc('sawtooth', 190 * rnd(.95, 1.05), t + .03, .16, v, { gain: .35, freqEnd: 120 });
  },
  parry(t, o) {
    const out = this._out({ ...o, gain: .75, rev: .7 });
    this._noise(t, .04, out, { gain: 1, type: 'highpass', f: 3000 });
    this._metal(t, 520 * rnd(.97, 1.03), out, { gain: .45, dur: 1.6, bright: 1.1 });
    this._metal(t, 780, out, { gain: .2, dur: .9 });
  },
  glint(t, o) {                    // a blade catching the light: the swing is coming
    const out = this._out({ ...o, gain: .5, rev: .55 });
    this._noise(t, .1, out, { gain: .3, type: 'highpass', f: 5200, fEnd: 9500 });
    this._metal(t, o.red ? 760 : 1900, out, { partials: [1, 2.02, 3.1, 4.7], gain: o.red ? .16 : .11, dur: o.red ? .5 : .32, bright: 1.25 });
    if (o.red) this._osc('sawtooth', 190, t, .22, out, { gain: .07, freqEnd: 160 });
  },
  block(t, o) {
    const out = this._out({ ...o, gain: .7, rev: .2 });
    this._noise(t, .08, out, { gain: .7, type: 'lowpass', f: 1600, fEnd: 300 });
    this._metal(t, 300 * rnd(.95, 1.05), out, { partials: [1, 2.3, 3.9], gain: .3, dur: .3 });
  },
  guardbreak(t, o) {
    const out = this._out({ ...o, gain: .85, rev: .4 });
    this._metal(t, 240, out, { gain: .45, dur: .9 });
    this._noise(t, .3, out, { gain: .8, type: 'lowpass', f: 900, fEnd: 90 });
    this._osc('square', 110, t, .3, out, { gain: .12, freqEnd: 55 });
  },
  roll(t, o) {
    const out = this._out({ ...o, gain: .45 });
    this._noise(t, .3, out, { gain: .5, a: .05, type: 'lowpass', f: 900, fEnd: 300 });
    this._osc('sine', 85, t + .32, .1, out, { gain: .35, freqEnd: 50 });
  },
  step(t, o) {
    const out = this._out({ ...o, gain: .22 * (o.gain ?? 1) });
    this._noise(t, .045, out, { gain: .6, type: 'lowpass', f: (o.surface ?? 900) * rnd(.85, 1.15) });
  },
  flask(t, o) {
    const out = this._out({ ...o, gain: .6, rev: .3 });
    for (let i = 0; i < 3; i++) {
      const tt = t + i * .14;
      this._osc('sine', rnd(260, 320), tt, .09, out, { gain: .35, freqEnd: rnd(520, 700) });
      this._noise(tt, .05, out, { gain: .2, f: 1400, q: 4 });
    }
  },
  healed(t, o) {
    const out = this._out({ ...o, gain: .45, rev: .8 });
    [784, 988, 1175, 1568].forEach((f, i) => this._osc('sine', f, t + i * .07, .6, out, { gain: .18 }));
  },
  flaskEmpty(t, o) {
    const out = this._out({ ...o, gain: .5 });
    this._metal(t, 900, out, { partials: [1, 2.1], gain: .15, dur: .12 });
  },
  denied(t, o) {
    const out = this._out({ ...o, gain: .5 });
    this._osc('square', 140, t, .22, out, { gain: .14 }); this._osc('square', 147, t, .22, out, { gain: .14 });
  },
  riposte(t, o) {
    const out = this._out({ ...o, gain: .9, rev: .45 });
    this._noise(t, .06, out, { gain: .9, type: 'highpass', f: 2200 });
    this._osc('sine', 120, t + .02, .45, out, { gain: .9, freqEnd: 32 });
    this._noise(t + .02, .35, out, { gain: .7, type: 'lowpass', f: 800, fEnd: 80 });
    this._metal(t, 420, out, { gain: .2, dur: .6 });
  },
  slam(t, o) {                      // a boss's heavy blow hitting the ground
    const out = this._out({ ...o, gain: 1, rev: .5 });
    this._osc('sine', 64, t, .7, out, { gain: 1, freqEnd: 26 });
    this._noise(t, .45, out, { gain: .8, type: 'lowpass', f: 600, fEnd: 60 });
    this._noise(t, .08, out, { gain: .4, type: 'highpass', f: 1800 });
  },
  boom(t, o) { SFX.slam.call(this, t, { ...o, gain: 1.2 }); },
  shock(t, o) {
    const out = this._out({ ...o, gain: .7, rev: .5 });
    this._noise(t, .6, out, { gain: .6, a: .02, f: 400, fEnd: 2400, q: .7 });
    this._osc('sine', 90, t, .5, out, { gain: .5, freqEnd: 45 });
  },
  throw(t, o) { SFX.whoosh.call(this, t, { ...o, gain: .8 }); },
  projHit(t, o) {
    const out = this._out({ ...o, gain: .6 });
    this._noise(t, .1, out, { gain: .7, type: 'lowpass', f: 1200, fEnd: 200 });
    this._osc('sine', 130, t, .12, out, { gain: .4, freqEnd: 60 });
  },
  brickLand(t, o) {
    const out = this._out({ ...o, gain: .6, rev: .15 });
    this._noise(t, .14, out, { gain: .7, f: 900, fEnd: 250, q: 1.5 });
    this._metal(t, 180, out, { partials: [1, 1.9, 3.1], gain: .2, dur: .15 });
  },
  cast(t, o) {
    const out = this._out({ ...o, gain: .45, rev: .6 });
    this._osc('sine', 380, t, .45, out, { gain: .3, freqEnd: 1300 });
    this._osc('triangle', 570, t + .05, .4, out, { gain: .15, freqEnd: 1900 });
    this._noise(t, .4, out, { gain: .2, f: 3000, q: 3 });
  },
  flash(t, o) {
    const out = this._out({ ...o, gain: .7, rev: .4 });
    this._noise(t, .03, out, { gain: 1, type: 'highpass', f: 4000 });
    this._osc('sine', 2093, t + .02, .5, out, { gain: .25 });
    this._osc('sine', 3136, t + .02, .4, out, { gain: .15 });
  },
  charge(t, o) {
    const out = this._out({ ...o, gain: .55 });
    this._noise(t, .6, out, { gain: .6, a: .1, f: 300, fEnd: 1400, q: 1 });
  },
  whirr(t, o) {
    const out = this._out({ ...o, gain: .45 });
    this._osc('sawtooth', 110, t, .7, out, { gain: .12, a: .1, freqEnd: 240 });
    this._noise(t, .7, out, { gain: .3, a: .1, f: 2200, q: 2 });
  },
  snip(t, o) {
    const out = this._out({ ...o, gain: .6 });
    this._metal(t, 1400, out, { partials: [1, 1.7], gain: .15, dur: .08 });
    this._noise(t, .05, out, { gain: .5, type: 'highpass', f: 2500 });
  },
  bonk(t, o) {
    const out = this._out({ ...o, gain: .8, rev: .2 });
    this._osc('sine', 330, t, .25, out, { gain: .6, freqEnd: 110 });
    this._noise(t, .06, out, { gain: .6, f: 700, q: 2 });
  },
  jam(t, o) {
    const out = this._out({ ...o, gain: .6 });
    for (let i = 0; i < 6; i++) this._noise(t + i * .07, .05, out, { gain: .5, f: 500 + (i % 2) * 400, q: 3 });
    this._osc('square', 80, t, .5, out, { gain: .08 });
  },
  error(t, o) {
    const out = this._out({ ...o, gain: .6, rev: .5 });
    for (const f of [311, 330, 466]) this._osc('square', f, t, .7, out, { gain: .07 });
  },
  wipeFire(t, o) {
    const out = this._out({ ...o, gain: 1, rev: .8 });
    this._osc('sine', 48, t, 1.4, out, { gain: 1, freqEnd: 22 });
    this._noise(t, 1.0, out, { gain: .7, type: 'lowpass', f: 3000, fEnd: 100 });
    this._noise(t, .6, out, { gain: .25, type: 'highpass', f: 5000, rate: .5 });
  },
  tiles(t, o) {
    const out = this._out({ ...o, gain: .45 });
    for (let i = 0; i < 3; i++) this._osc('square', 880, t + i * .35, .08, out, { gain: .08 });
  },
  tilesFire(t, o) {
    const out = this._out({ ...o, gain: .6 });
    this._osc('sawtooth', 110, t, .35, out, { gain: .18 }); this._osc('sawtooth', 117, t, .35, out, { gain: .18 });
  },
  lag(t, o) {
    const out = this._out({ ...o, gain: .5 });
    for (let i = 0; i < 5; i++) this._osc('square', rnd(200, 1200), t + i * .025, .02, out, { gain: .12 });
  },
  counter(t, o) {
    const out = this._out({ ...o, gain: .8, rev: .5 });
    this._metal(t, 1200, out, { gain: .3, dur: .5 });
    SFX.whoosh.call(this, t + .05, o);
  },
  immune(t, o) {
    const out = this._out({ ...o, gain: .45 });
    this._metal(t, 640, out, { partials: [1, 2.02], gain: .15, dur: .2 });
  },
  rule(t, o) {                      // a gavel, then a brass stab of authority
    const out = this._out({ gain: .8, rev: .6 });
    for (let i = 0; i < 2; i++) { this._noise(t + i * .18, .06, out, { gain: .9, f: 700, q: 2 }); this._osc('sine', 160, t + i * .18, .12, out, { gain: .6, freqEnd: 80 }); }
    for (const f of [146.8, 174.6, 220]) this._osc('sawtooth', f, t + .45, .9, out, { gain: .07, a: .03 });
  },
  phase(t, o) { SFX.shock.call(this, t, o); SFX.rule.call(this, t + .1, { ...o, gain: .5 }); },
  bossStagger(t, o) {
    const out = this._out({ ...o, gain: .7, rev: .4 });
    this._metal(t, 190, out, { gain: .35, dur: .8 });
    this._osc('sine', 90, t, .4, out, { gain: .5, freqEnd: 45 });
  },
  dodged(t, o) {
    const out = this._out({ ...o, gain: .25 });
    this._noise(t, .09, out, { gain: .4, type: 'highpass', f: 5200 });
  },
  gate(t, o) {
    const out = this._out({ ...o, gain: .55, rev: .9 });
    this._noise(t, 1.2, out, { gain: .5, a: .3, f: 300, fEnd: 3000, q: .6 });
    [392, 523, 659].forEach((f, i) => this._osc('sine', f, t + .2 + i * .1, 1.1, out, { gain: .1, a: .1 }));
  },
  flies(t, o) {
    const out = this._out({ ...o, gain: .35 });
    for (let i = 0; i < 5; i++) {
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2; f.connect(out);
      const osc = this._osc('sawtooth', rnd(190, 260), t + i * .05, 1.2, f, { gain: .06, a: .1 });
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = rnd(18, 30); lg.gain.value = 25; lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + 1.4);
    }
  },
  victory(t) {
    const out = this._out({ gain: .7, rev: 1, bus: this.sfxBus });
    [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => this._osc('triangle', f, t + i * .12, 2.2 - i * .2, out, { gain: .16, a: .02 }));
    this._metal(t + .6, 261.6, out, { gain: .25, dur: 3 });
  },
  died(t) {                          // YOU CROAKED
    const out = this._out({ gain: .9, rev: 1 });
    this._metal(t, 55, out, { partials: [1, 2.4, 3.9, 5.1], gain: .6, dur: 4.5, bright: .8 });
    this._osc('sine', 110, t, 3, out, { gain: .3, a: .5, freqEnd: 82 });
    const v = this.ctx.createBiquadFilter(); v.type = 'bandpass'; v.frequency.value = 650; v.Q.value = 4; v.connect(out);
    this._osc('sawtooth', 140, t + 1.2, .6, v, { gain: .35, freqEnd: 70 });
  },
  uiMove(t) { const out = this._out({ gain: .25 }); this._osc('triangle', 880, t, .04, out, { gain: .3 }); },
  uiOk(t) { const out = this._out({ gain: .35 }); this._osc('triangle', 660, t, .07, out, { gain: .3 }); this._osc('triangle', 990, t + .06, .1, out, { gain: .3 }); },
  uiBack(t) { const out = this._out({ gain: .35 }); this._osc('triangle', 700, t, .07, out, { gain: .3 }); this._osc('triangle', 470, t + .06, .1, out, { gain: .3 }); },
  buy(t) {
    const out = this._out({ gain: .5, rev: .4 });
    SFX.flies.call(this, t, { gain: .5 });
    [880, 1318].forEach((f, i) => this._osc('sine', f, t + .1 + i * .08, .5, out, { gain: .2 }));
  },
  deny(t) { const out = this._out({ gain: .4 }); this._osc('square', 120, t, .2, out, { gain: .12 }); },
  heartbeat(t) {
    const out = this._out({ gain: .45 });
    this._osc('sine', 62, t, .12, out, { gain: .8, freqEnd: 40 });
    this._osc('sine', 58, t + .2, .14, out, { gain: .6, freqEnd: 38 });
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Boss voices. kind: 'attack' (a grunt on each move), 'roar' (phase change),
// 'hurt' (staggered), 'die'.
function formantVoice(t, out, f0, formants, dur, { type = 'sawtooth', bend = .7, gain = .35, vibrato = 0 } = {}) {
  const src = this.ctx.createOscillator();
  src.type = type; src.frequency.setValueAtTime(f0, t); src.frequency.exponentialRampToValueAtTime(f0 * bend, t + dur);
  if (vibrato) { const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 6; lg.gain.value = f0 * vibrato; l.connect(lg).connect(src.frequency); l.start(t); l.stop(t + dur + .1); }
  const g = this.ctx.createGain();
  this._env(g.gain, t, .02, gain, dur);
  for (const [f, q, a] of formants) {
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const bg = this.ctx.createGain(); bg.gain.value = a;
    src.connect(bp).connect(bg).connect(g);
  }
  g.connect(out);
  src.start(t); src.stop(t + dur + .1);
}

const V = (base, formants, o = {}) => function (t, kind, opts) {
  const out = this._out({ pos: opts.pos, gain: o.gain ?? .9, rev: kind === 'roar' || kind === 'die' ? .7 : .3 });
  const mult = kind === 'roar' ? 1.8 : kind === 'die' ? 2.6 : kind === 'hurt' ? .6 : 1;
  const f0 = base * (kind === 'hurt' ? 1.25 : kind === 'die' ? .85 : 1) * rnd(.93, 1.07);
  formantVoice.call(this, t, out, f0, formants, (o.dur ?? .35) * mult, { type: o.type, bend: o.bend ?? .7, gain: o.vgain ?? .35, vibrato: kind === 'roar' ? .03 : 0 });
  if (o.noise) this._noise(t, (o.dur ?? .35) * mult, out, { gain: o.noise, f: formants[0][0], q: 1 });
};

const VOICES = {
  duck(t, kind, opts) {             // QUACK
    const out = this._out({ pos: opts.pos, gain: 1, rev: .3 });
    const n = kind === 'roar' ? 3 : kind === 'die' ? 4 : 1;
    for (let i = 0; i < n; i++) formantVoice.call(this, t + i * .22, out, 520 * rnd(.95, 1.05), [[1150, 5, 1], [2600, 6, .5]], .17, { bend: .62, gain: .5 });
  },
  frog(t, kind, opts) {             // a croak, a little too much like yours
    const out = this._out({ pos: opts.pos, gain: .9, rev: .3 });
    formantVoice.call(this, t, out, 120 * rnd(.9, 1.1), [[520, 4, 1], [1300, 6, .4]], kind === 'roar' ? .6 : .25, { bend: .85, gain: .5, type: 'square' });
  },
  old: V(95, [[500, 3, 1], [1100, 5, .5]], { dur: .5, noise: .15 }),
  shrimp(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .7 }); for (let i = 0; i < (kind === 'roar' ? 10 : 4); i++) this._noise(t + i * .045, .02, out, { gain: .6, f: 3500, q: 6 }); },
  crab(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .7 }); for (let i = 0; i < (kind === 'roar' ? 8 : 3); i++) this._metal(t + i * .07, 1600, out, { partials: [1, 1.5], gain: .12, dur: .05 }); },
  nasal: V(210, [[1500, 8, 1], [2500, 8, .5]], { type: 'square', dur: .3, bend: 1.15, vgain: .25 }),
  shout: V(160, [[700, 3, 1], [1200, 4, .8]], { dur: .45, noise: .3, vgain: .45 }),
  squeak: V(640, [[2000, 6, 1]], { dur: .15, bend: 1.4 }),
  robot(t, kind, opts) {
    const out = this._out({ pos: opts.pos, gain: .6 });
    const n = kind === 'roar' ? 6 : 3;
    for (let i = 0; i < n; i++) this._osc('square', [440, 660, 550, 880, 330, 990][i], t + i * .08, .07, out, { gain: .12 });
  },
  judge: V(80, [[400, 3, 1], [900, 5, .6]], { dur: .55, vgain: .45 }),
  groan: V(70, [[380, 3, 1], [800, 4, .5]], { dur: .8, bend: .8 }),
  machine(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .6 }); for (let i = 0; i < 8; i++) this._noise(t + i * .06, .045, out, { gain: .5, f: 800 + (i % 2) * 300, q: 4 }); },
  whirr(t, kind, opts) { SFX.whirr.call(this, t, { pos: opts.pos }); },
  drone: V(110, [[500, 4, 1], [1500, 6, .4]], { dur: .7, bend: .95, vgain: .25 }),
  tick(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .6 }); for (let i = 0; i < (kind === 'roar' ? 6 : 2); i++) this._noise(t + i * .25, .02, out, { gain: .8, f: 4000, q: 8 }); },
  jingle(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .6, rev: .3 }); [523, 659, 784, 1046].slice(0, kind === 'roar' ? 4 : 3).forEach((f, i) => this._osc('square', f, t + i * .09, .12, out, { gain: .1 })); },
  bright(t, kind, opts) { SFX.flash.call(this, t, { pos: opts.pos, gain: .5 }); },
  beep(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .5 }); this._osc('square', 1046, t, .07, out, { gain: .1 }); },
  lowbat(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .5 }); this._osc('square', 880, t, .12, out, { gain: .1 }); this._osc('square', 660, t + .15, .2, out, { gain: .1 }); },
  choir(t, kind, opts) {
    const out = this._out({ pos: opts.pos, gain: .7, rev: .9 });
    for (const f of [146.8, 220, 293.7, 349.2]) formantVoice.call(this, t, out, f, [[700, 6, 1], [1100, 8, .6]], kind === 'roar' ? 1.6 : .6, { bend: 1, gain: .12, vibrato: .01 });
  },
  glitch(t, kind, opts) { SFX.lag.call(this, t, { pos: opts.pos }); },
  buzz: V(55, [[200, 2, 1], [2000, 4, .3]], { type: 'square', dur: .4, bend: 1, vgain: .2 }),
  papery(t, kind, opts) { const out = this._out({ pos: opts.pos, gain: .5 }); this._noise(t, .3, out, { gain: .6, f: 3000, fEnd: 1500, q: 1 }); },
  hum: V(98, [[300, 3, 1]], { type: 'sine', dur: .9, bend: 1, vgain: .3 }),
  error(t, kind, opts) { SFX.error.call(this, t, { pos: opts.pos }); },
};
