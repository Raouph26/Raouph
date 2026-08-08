/**
 * Procedural audio. Every sound is synthesised at runtime — no files to load,
 * nothing for a content policy to block, and the whole engine costs a few kB.
 *
 * The tuning does the emotional work: notes are drawn from a major pentatonic
 * scale, so any combination of them is consonant. A player can draw lines in
 * any order, at any speed, and never produce a sour interval. That is what
 * keeps a puzzle that can be failed repeatedly still feeling calm.
 */

/** Semitone offsets of a major pentatonic scale — no minor seconds, no tritone. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** A3. Low enough to stay warm rather than chiming. */
const ROOT_HZ = 220;
/** Notes climb as a line grows, then wrap so long lines never turn shrill. */
const STEPS_BEFORE_WRAP = 13;

function frequencyForStep(step: number): number {
  const wrapped = ((step % STEPS_BEFORE_WRAP) + STEPS_BEFORE_WRAP) % STEPS_BEFORE_WRAP;
  const octave = Math.floor(wrapped / PENTATONIC.length);
  const semitone = PENTATONIC[wrapped % PENTATONIC.length] + octave * 12;
  return ROOT_HZ * Math.pow(2, semitone / 12);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Reverb send. Shared by every voice so the space stays coherent. */
  private wet: GainNode | null = null;
  private padNodes: OscillatorNode[] = [];
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Browsers refuse to start audio outside a user gesture, so this is called
   * from the first pointer press and is a no-op afterwards.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 1;
    master.connect(ctx.destination);
    this.master = master;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.buildImpulseResponse(ctx, 2.6, 2.2);
    reverb.connect(master);

    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    wet.connect(reverb);
    this.wet = wet;

    this.startPad();
  }

  /**
   * A decaying noise burst makes a convincing reverb tail without shipping an
   * impulse response file. Slight stereo decorrelation widens the space.
   */
  private buildImpulseResponse(
    ctx: AudioContext,
    seconds: number,
    decay: number,
  ): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return buffer;
  }

  /** A slow, very quiet drone so silence between moves still feels inhabited. */
  private startPad(): void {
    const ctx = this.ctx;
    const master = this.master;
    const wet = this.wet;
    if (!ctx || !master || !wet) return;

    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    padGain.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 6);
    padGain.connect(master);
    padGain.connect(wet);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    filter.connect(padGain);

    // Root, fifth and octave — an open voicing that never implies major or minor.
    for (const [i, ratio] of [1, 1.5, 2].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = (ROOT_HZ / 2) * ratio;
      osc.detune.value = (i - 1) * 6;
      osc.connect(filter);
      osc.start();
      this.padNodes.push(osc);
    }

    // Slow filter drift keeps the drone from sounding static or synthetic.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 170;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();
    this.padNodes.push(lfo);
  }

  /**
   * One soft note. `step` rises with the length of the line being drawn, so a
   * line sings an ascending phrase as it is built.
   */
  note(step: number, options: { gain?: number; duration?: number } = {}): void {
    const ctx = this.ctx;
    const master = this.master;
    const wet = this.wet;
    if (!ctx || !master || !wet || this.muted) return;

    const now = ctx.currentTime;
    const peak = options.gain ?? 0.13;
    const duration = options.duration ?? 1.5;
    const frequency = frequencyForStep(step);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    filter.connect(gain);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(filter);

    // A quiet octave above adds body without brightening the tone much.
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = frequency * 2;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.16;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);

    gain.connect(master);
    gain.connect(wet);

    osc.start(now);
    shimmer.start(now);
    osc.stop(now + duration + 0.1);
    shimmer.stop(now + duration + 0.1);
  }

  /** Undoing a step answers with the same note, quieter and shorter. */
  retract(step: number): void {
    this.note(Math.max(0, step - 1), { gain: 0.05, duration: 0.7 });
  }

  /** Blocked moves stay silent on purpose: a buzzer would break the calm. */

  /** A slow rising arpeggio, the only moment the game raises its voice. */
  solved(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const steps = [0, 2, 4, 7];
    for (const [i, step] of steps.entries()) {
      window.setTimeout(
        () => this.note(step, { gain: 0.11, duration: 2.6 }),
        i * 130,
      );
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    if (!this.master || !ctx) return;
    // Ramped, never stepped — an abrupt cut is itself a jarring sound.
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  }
}
