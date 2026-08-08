/**
 * Procedural audio. Every sound is synthesised at runtime — no files to load,
 * nothing for a content policy to block, and the whole engine costs a few kB.
 *
 * The tuning does the emotional work: notes are drawn from a major pentatonic
 * scale, so any combination of them is consonant. A player can draw lines in
 * any order, at any speed, and never produce a sour interval. That is what
 * keeps a puzzle that can be failed repeatedly still feeling calm.
 *
 * There is deliberately no background bed. An earlier version held a drone
 * through the reverb, and a *sustained* tone convolved with a noise impulse
 * smears into audible hiss — the tail never decays, so the noise floor is
 * always being re-excited. Only discrete notes are sent to the reverb now, and
 * the silence between them is left alone.
 */

/** Semitone offsets of a major pentatonic scale — no minor seconds, no tritone. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** G3. Low enough that the melody sits warm rather than bright. */
const ROOT_HZ = 196;
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
    reverb.buffer = this.buildImpulseResponse(ctx, 2.2, 2.6);
    reverb.connect(master);

    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    wet.connect(reverb);
    this.wet = wet;
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
    const peak = options.gain ?? 0.12;
    const duration = options.duration ?? 2.4;
    const frequency = frequencyForStep(step);

    // A slow swell rather than a struck attack. The sharp onset and the added
    // octave are exactly what read as "piano"; both are gone, leaving a soft
    // pad that blooms into the note.
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.075);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1250;
    filter.Q.value = 0.7;
    filter.connect(gain);

    // Two triangles a few cents apart: the slow beating between them is what
    // gives the tone its warmth and movement.
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.1);
    }

    gain.connect(master);
    gain.connect(wet);
  }

  /** Undoing a step answers with the same note, quieter and shorter. */
  retract(step: number): void {
    this.note(Math.max(0, step - 1), { gain: 0.045, duration: 1.1 });
  }

  /** Blocked moves stay silent on purpose: a buzzer would break the calm. */

  /** A slow rising arpeggio, the only moment the game raises its voice. */
  solved(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const steps = [0, 2, 4, 7];
    for (const [i, step] of steps.entries()) {
      window.setTimeout(
        () => this.note(step, { gain: 0.1, duration: 3.4 }),
        i * 190,
      );
    }
  }

  /** One note per piece as a finished line spins, echoing how it was drawn. */
  lineComplete(length: number): void {
    const notes = Math.min(5, Math.max(2, Math.round(length / 2)));
    for (let i = 0; i < notes; i++) {
      window.setTimeout(
        () => this.note(2 + i * 2, { gain: 0.07, duration: 2.2 }),
        i * 85,
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
