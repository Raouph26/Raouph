// ─────────────────────────────────────────────────────────────────────────────
// Music: a small generative score, scheduled ahead on the audio clock.
// Each world has a key, a mode and a progression. Boss fights layer up with
// the phase: pulse → strings ostinato → taiko → choir. The hub is slow bells.
// ─────────────────────────────────────────────────────────────────────────────

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], lydian: [0, 2, 4, 6, 7, 9, 11],
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export const THEMES = {
  title:    { bpm: 58,  root: 38, mode: 'aeolian',  prog: [0, 5, 2, 6], bars: 2, kind: 'calm', bells: .25, choir: true },
  hub:      { bpm: 64,  root: 45, mode: 'dorian',   prog: [0, 3, 5, 4], bars: 2, kind: 'calm', bells: .45 },
  pond:     { bpm: 132, root: 40, mode: 'aeolian',  prog: [0, 5, 3, 4], bars: 2, kind: 'fight' },
  comments: { bpm: 138, root: 36, mode: 'phrygian', prog: [0, 1, 5, 0], bars: 2, kind: 'fight' },
  office:   { bpm: 126, root: 41, mode: 'lydian',   prog: [0, 1, 4, 3], bars: 2, kind: 'fight', detune: 18 },
  feed:     { bpm: 142, root: 44, mode: 'aeolian',  prog: [0, 6, 5, 4], bars: 2, kind: 'fight', bells: .2 },
  server:   { bpm: 150, root: 38, mode: 'harmonic', prog: [0, 5, 3, 4], bars: 1, kind: 'fight' },
  world:    { bpm: 70,  root: 40, mode: 'aeolian',  prog: [0, 5], bars: 4, kind: 'calm', bells: .15 },
};

export class Music {
  constructor(engine) {
    this.a = engine;
    this.theme = null;
    this.intensity = 0;
    this.step = 0;
    this.next = 0;
    this.timer = null;
    this.bus = null;
  }

  get ctx() { return this.a.ctx; }

  play(id, { intensity = 0, root } = {}) {
    if (!this.a.ready) { this._pending = [id, { intensity, root }]; return; }
    if (this.themeId === id && this.bus) { this.setIntensity(intensity); return; }
    this.stop(1.2);
    const ctx = this.ctx;
    this.themeId = id;
    this.theme = { ...THEMES[id], ...(root ? { root } : {}) };
    this.intensity = intensity;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
    this.bus.connect(this.a.musicBus);
    this.revSend = ctx.createGain(); this.revSend.gain.value = .45; this.bus.connect(this.revSend).connect(this.a.revSend);
    this.step = 0;
    this.next = ctx.currentTime + .1;
    clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 25);
  }

  resumePending() { if (this._pending && this.a.ready) { const [id, o] = this._pending; this._pending = null; this.play(id, o); } }

  setIntensity(n) { this.intensity = n; }

  stop(fade = 1) {
    if (!this.bus || !this.ctx) return;
    const b = this.bus, t = this.ctx.currentTime;
    b.gain.cancelScheduledValues(t);
    b.gain.setValueAtTime(Math.max(.0001, b.gain.value), t);
    b.gain.exponentialRampToValueAtTime(.0001, t + fade);
    setTimeout(() => { try { b.disconnect(); } catch { /* already gone */ } }, fade * 1000 + 200);
    this.bus = null;
    this.themeId = null;
    clearInterval(this.timer);
  }

  _tick() {
    if (!this.bus || !this.theme) return;
    const ctx = this.ctx, th = this.theme;
    const sixteenth = 60 / th.bpm / 4;
    while (this.next < ctx.currentTime + .25) {
      this._schedule(this.step, this.next, sixteenth);
      this.next += sixteenth;
      this.step++;
    }
  }

  _chord(stepIndex) {
    const th = this.theme, scale = MODES[th.mode];
    const bar = Math.floor(stepIndex / 16);
    const deg = th.prog[Math.floor(bar / th.bars) % th.prog.length];
    const note = (d) => th.root + scale[d % 7] + 12 * Math.floor(d / 7);
    return { root: note(deg), tones: [note(deg), note(deg + 2), note(deg + 4)], deg };
  }

  _schedule(s, t, sx) {
    const th = this.theme, I = this.intensity;
    const inBar = s % 16, bar = Math.floor(s / 16);
    const ch = this._chord(s);
    const chordStart = inBar === 0 && bar % th.bars === 0;
    const chordLen = sx * 16 * th.bars;

    if (th.kind === 'calm') {
      if (chordStart) {
        this._pad(t, ch.tones.map((m) => hz(m + 12)), chordLen, .06);
        this._bass(t, hz(ch.root - 12), chordLen * .95, .12, 'long');
        if (th.choir) this._choir(t, ch.tones.map((m) => hz(m + 12)), chordLen, .05);
      }
      if (Math.random() < (th.bells ?? .3) * (inBar % 4 === 0 ? 1 : .25)) {
        const m = ch.tones[Math.floor(Math.random() * 3)] + 24 + (Math.random() < .3 ? 12 : 0);
        this._bell(t, hz(m), .09);
      }
      return;
    }

    // ── fight ──
    if (chordStart) {
      this._pad(t, ch.tones.map((m) => hz(m + 12)), chordLen, .045 + I * .01, th.detune);
      if (I >= 3) this._choir(t, ch.tones.map((m) => hz(m + 12)), chordLen, .07);
    }
    // driving low pulse on 8ths, accented on the beat
    if (inBar % 2 === 0) this._bass(t, hz(ch.root - 12), sx * 1.6, inBar % 4 === 0 ? .2 : .12, 'pulse');
    // strings ostinato: arpeggiated chord tones in 16ths
    if (I >= 1) {
      const pat = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 0];
      const m = ch.tones[pat[inBar]] + 12 + (inBar >= 8 && I >= 2 ? 12 : 0);
      this._ostinato(t, hz(m), sx * .9, .05, th.detune);
    }
    // taiko
    if (I >= 2 && [0, 6, 8, 11, 14].includes(inBar)) this._taiko(t, inBar === 0 || inBar === 8 ? .5 : .3);
    if (I >= 3 && inBar % 2 === 1) this._hat(t, .05);
    if (I >= 2 && inBar === 4 || I >= 2 && inBar === 12) this._snare(t, .16);
    if (th.bells && Math.random() < th.bells * .3 && inBar % 2 === 0) this._bell(t, hz(ch.tones[Math.floor(Math.random() * 3)] + 36), .04);
  }

  // ── instruments ───────────────────────────────────────────────────────────
  _voice(type, f, t, dur, gain, { attack = .01, release = .1, filter = 1600, q = .7, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    fl.type = 'lowpass'; fl.frequency.value = filter; fl.Q.value = q;
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + release);
    o.connect(fl).connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + release + .05);
  }

  _pad(t, freqs, dur, gain, detune = 0) {
    for (const f of freqs) for (const d of [-9 + detune, 9]) this._voice('sawtooth', f, t, dur, gain * .5, { attack: .9, release: 1.2, filter: 700 + this.intensity * 250, detune: d });
  }
  _bass(t, f, dur, gain, style) {
    if (style === 'long') { this._voice('triangle', f, t, dur, gain, { attack: .4, release: .8, filter: 500 }); return; }
    this._voice('sawtooth', f, t, dur, gain, { attack: .005, release: .06, filter: 380, q: 2 });
    this._voice('sine', f / 2, t, dur, gain * .8, { attack: .005, release: .05, filter: 200 });
  }
  _ostinato(t, f, dur, gain, detune = 0) { this._voice('sawtooth', f, t, dur, gain, { attack: .004, release: .05, filter: 1500 + this.intensity * 400, q: 1.5, detune }); }
  _bell(t, f, gain) {
    for (const [p, g, d] of [[1, 1, 2.2], [2, .4, 1.4], [3, .2, .8], [4.2, .1, .5]]) this._voice('sine', f * p, t, .02, gain * g, { attack: .002, release: d, filter: 8000 });
  }
  _choir(t, freqs, dur, gain) {
    const ctx = this.ctx;
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5 + Math.random(); lg.gain.value = f * .012;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gain, t + .8);
      g.gain.setValueAtTime(gain, t + dur - .6); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .8);
      for (const [ff, q, a] of [[700, 6, 1], [1150, 8, .6], [2600, 10, .2]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q;
        const bg = ctx.createGain(); bg.gain.value = a; o.connect(bp).connect(bg).connect(g);
      }
      g.connect(this.bus);
      o.start(t); o.stop(t + dur + 1); lfo.start(t); lfo.stop(t + dur + 1);
    }
  }
  _taiko(t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .35);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + .55);
    this._noiseHit(t, gain * .5, 'lowpass', 900, .12);
  }
  _snare(t, gain) { this._noiseHit(t, gain, 'bandpass', 1800, .15); }
  _hat(t, gain) { this._noiseHit(t, gain, 'highpass', 7000, .04); }
  _noiseHit(t, gain, type, f, dur) {
    const ctx = this.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.a.noise; fl.type = type; fl.frequency.value = f;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl).connect(g).connect(this.bus);
    s.start(t, Math.random()); s.stop(t + dur + .02);
  }
}
