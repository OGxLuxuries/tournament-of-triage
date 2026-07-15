/**
 * BitPoint Arcade — Dynamic Synthwave audio engine.
 *
 * Everything is synthesized client-side with the Web Audio API so there are
 * no external assets to 404. One looping synthwave bed (pads, bass, arps,
 * drums) runs on a look-ahead scheduler; SFX are one-shot voices.
 *
 * The "PERFECT!" call-out uses the browser's SpeechSynthesis for that
 * digitized-announcer flavor, layered under a proper winner fanfare.
 */

const MUTE_KEY = "bitpoint.muted";

const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Am — F — C — G, voiced mid-keyboard. The eternal synthwave progression. */
const PROGRESSION: number[][] = [
  [57, 60, 64], // A minor
  [53, 57, 60], // F major
  [60, 64, 67], // C major
  [55, 59, 62], // G major
];
const ARP_STEPS = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1, 0, 1, 2, 3];

class ArcadeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private arpDelay: DelayNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private urgent = false;

  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  /* ── Core graph ────────────────────────────────────────────────────── */

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    // Feedback delay on the arp line = instant synthwave.
    this.arpDelay = ctx.createDelay(1);
    this.arpDelay.delayTime.value = 0.29;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    this.arpDelay.connect(feedback);
    feedback.connect(this.arpDelay);
    this.arpDelay.connect(this.musicBus);

    // 1s of white noise, reused by drums/lasers/explosions.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    return ctx;
  }

  /** Call from any user gesture: resumes the context and starts the bed. */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (this.schedulerId === null) this.startMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* storage blocked — session-only mute */
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
    if (muted) window.speechSynthesis?.cancel();
  }

  /** Fast-tempo mode while the countdown is under 10 seconds. */
  setUrgent(urgent: boolean): void {
    this.urgent = urgent;
  }

  /* ── Voice helpers ─────────────────────────────────────────────────── */

  private tone(opts: {
    type: OscillatorType;
    freq: number;
    at: number;
    dur: number;
    gain: number;
    dest?: AudioNode;
    slideTo?: number;
    lowpass?: number;
    detune?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dest = opts.dest ?? this.sfxBus!;
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, opts.at);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), opts.at + opts.dur);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, opts.at);
    gain.gain.linearRampToValueAtTime(opts.gain, opts.at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.dur);

    osc.connect(gain);
    if (opts.lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = opts.lowpass;
      gain.connect(filter);
      filter.connect(dest);
    } else {
      gain.connect(dest);
    }
    osc.start(opts.at);
    osc.stop(opts.at + opts.dur + 0.05);
  }

  private noise(opts: {
    at: number;
    dur: number;
    gain: number;
    filterType?: BiquadFilterType;
    freq?: number;
    freqEnd?: number;
    dest?: AudioNode;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType ?? "lowpass";
    filter.frequency.setValueAtTime(opts.freq ?? 8000, opts.at);
    if (opts.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, opts.freqEnd), opts.at + opts.dur);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, opts.at);
    gain.gain.linearRampToValueAtTime(opts.gain, opts.at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(opts.dest ?? this.sfxBus!);
    src.start(opts.at);
    src.stop(opts.at + opts.dur + 0.05);
  }

  /* ── Music scheduler (Chris Wilson look-ahead pattern) ─────────────── */

  private tempo(): number {
    return this.urgent ? 149 : 109;
  }

  private startMusic(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.step = 0;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.schedulerId = window.setInterval(() => this.pump(), 28);
  }

  stopMusic(): void {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private pump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const sixteenth = 60 / this.tempo() / 4;
    while (this.nextStepTime < ctx.currentTime + 0.14) {
      this.scheduleStep(this.step, this.nextStepTime, sixteenth);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += sixteenth;
    }
  }

  private scheduleStep(globalStep: number, at: number, sixteenth: number): void {
    const music = this.musicBus!;
    const bar = Math.floor(globalStep / 16) % PROGRESSION.length;
    const beat = globalStep % 16;
    const chord = PROGRESSION[bar];

    // Kick: four on the floor — a sine drop from 150Hz.
    if (beat % 4 === 0) {
      this.tone({ type: "sine", freq: 150, slideTo: 40, at, dur: 0.16, gain: 0.5, dest: music });
    }
    // Snare on 2 and 4.
    if (beat === 4 || beat === 12) {
      this.noise({ at, dur: 0.12, gain: 0.16, filterType: "bandpass", freq: 1900, dest: music });
    }
    // Hats on the off-16ths.
    if (beat % 2 === 1) {
      this.noise({ at, dur: 0.03, gain: 0.05, filterType: "highpass", freq: 7000, dest: music });
    }
    // Bass: driving 8ths on the root, octave hop at the phrase turn.
    if (beat % 2 === 0) {
      const octaveHop = beat === 14 ? 12 : 0;
      this.tone({
        type: "square",
        freq: midiHz(chord[0] - 12 + octaveHop),
        at,
        dur: sixteenth * 1.7,
        gain: 0.11,
        dest: music,
        lowpass: 700,
      });
    }
    // Pad: two detuned saws sustained for the whole bar.
    if (beat === 0) {
      for (const note of chord) {
        for (const detune of [-7, 7]) {
          this.tone({
            type: "sawtooth",
            freq: midiHz(note),
            at,
            dur: sixteenth * 15.5,
            gain: 0.028,
            dest: music,
            lowpass: 850,
            detune,
          });
        }
      }
    }
    // Arp: 16th-note sparkle an octave up, into the feedback delay.
    const arpNotes = [...chord, chord[0] + 12];
    this.tone({
      type: "triangle",
      freq: midiHz(arpNotes[ARP_STEPS[beat]] + 12),
      at,
      dur: sixteenth * 0.9,
      gain: 0.05,
      dest: this.arpDelay ?? music,
    });
    // Urgent mode: a pitch-bend siren riding over every half bar.
    if (this.urgent && beat % 8 === 0) {
      this.tone({
        type: "sawtooth",
        freq: 420,
        slideTo: 980,
        at,
        dur: sixteenth * 7,
        gain: 0.05,
        dest: music,
        lowpass: 2400,
      });
    }
  }

  /* ── SFX ───────────────────────────────────────────────────────────── */

  private now(): number | null {
    const ctx = this.ensure();
    if (!ctx) return null;
    if (ctx.state === "suspended") void ctx.resume();
    return ctx.currentTime;
  }

  /** Classic two-blip coin drop — a player has joined. */
  coin(): void {
    const t = this.now();
    if (t === null) return;
    this.tone({ type: "square", freq: midiHz(83), at: t, dur: 0.09, gain: 0.16 }); // B5
    this.tone({ type: "square", freq: midiHz(88), at: t + 0.09, dur: 0.42, gain: 0.16 }); // E6
  }

  /** Mechanical clunk — the cabinet vote buttons. */
  thunk(): void {
    const t = this.now();
    if (t === null) return;
    this.noise({ at: t, dur: 0.05, gain: 0.3, freq: 420 });
    this.tone({ type: "triangle", freq: 170, slideTo: 68, at: t, dur: 0.09, gain: 0.34 });
  }

  /** Lighter click for regular UI buttons. */
  click(): void {
    const t = this.now();
    if (t === null) return;
    this.noise({ at: t, dur: 0.025, gain: 0.12, freq: 1200 });
    this.tone({ type: "square", freq: 660, slideTo: 330, at: t, dur: 0.05, gain: 0.09 });
  }

  /** Harsh alarm buzz + falling saw — TILT! */
  tilt(): void {
    const t = this.now();
    if (t === null) return;
    this.tone({ type: "sawtooth", freq: 480, slideTo: 55, at: t, dur: 0.65, gain: 0.28, lowpass: 1600 });
    for (let i = 0; i < 3; i++) {
      this.tone({ type: "square", freq: i % 2 ? 392 : 311, at: t + i * 0.14, dur: 0.11, gain: 0.18 });
    }
  }

  /** Rising zap — one laser beam per teammate during the victory volley. */
  laser(index: number): void {
    const t = this.now();
    if (t === null) return;
    this.tone({
      type: "sawtooth",
      freq: 1900 + index * 120,
      slideTo: 180,
      at: t,
      dur: 0.2,
      gain: 0.16,
      lowpass: 4200,
    });
  }

  /** Boss HP hits zero. */
  explosion(): void {
    const t = this.now();
    if (t === null) return;
    this.noise({ at: t, dur: 0.7, gain: 0.5, freq: 3200, freqEnd: 90 });
    this.tone({ type: "sine", freq: 90, slideTo: 28, at: t, dur: 0.6, gain: 0.45 });
  }

  /** Round start power-up arp. */
  powerup(): void {
    const t = this.now();
    if (t === null) return;
    [262, 392, 523, 784].forEach((freq, i) => {
      this.tone({ type: "square", freq, at: t + i * 0.06, dur: 0.09, gain: 0.12 });
    });
  }

  /** Votes on the table — a quick riser + stab. */
  reveal(): void {
    const t = this.now();
    if (t === null) return;
    this.noise({ at: t, dur: 0.35, gain: 0.1, filterType: "bandpass", freq: 500, freqEnd: 4000 });
    [523.25, 659.25, 783.99].forEach((freq) => {
      this.tone({ type: "square", freq, at: t + 0.32, dur: 0.3, gain: 0.08 });
    });
  }

  /** Glorious winner fanfare. */
  fanfare(): void {
    const t = this.now();
    if (t === null) return;
    const run = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    run.forEach((freq, i) => {
      this.tone({ type: "square", freq, at: t + i * 0.09, dur: 0.14, gain: 0.14 });
    });
    const chordAt = t + run.length * 0.09;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq) => {
      this.tone({ type: "sawtooth", freq, at: chordAt, dur: 0.9, gain: 0.07, lowpass: 3000 });
      this.tone({ type: "square", freq: freq * 2, at: chordAt, dur: 0.5, gain: 0.03 });
    });
    this.noise({ at: chordAt, dur: 0.5, gain: 0.06, filterType: "highpass", freq: 6000 });
  }

  /** Unanimous consensus: fanfare + digitized "PERFECT!" announcer. */
  perfect(): void {
    this.fanfare();
    if (this.muted) return;
    try {
      const utterance = new SpeechSynthesisUtterance("PERFECT!");
      utterance.rate = 0.72;
      utterance.pitch = 0.42;
      utterance.volume = 1;
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(utterance);
    } catch {
      /* no speech synthesis — the fanfare carries it */
    }
  }

  /** Per-second tick while the clock is under 10s; pitch climbs as it drains. */
  urgentTick(secondsLeft: number): void {
    const t = this.now();
    if (t === null) return;
    const freq = 540 + (10 - Math.min(10, Math.max(0, secondsLeft))) * 68;
    this.tone({ type: "square", freq, at: t, dur: 0.055, gain: 0.13 });
  }

  /** The full DEFEATED! sequence, timed to match the CSS animation. */
  victorySequence(playerCount: number): void {
    const beams = Math.min(Math.max(playerCount, 1), 8);
    for (let i = 0; i < beams; i++) {
      window.setTimeout(() => this.laser(i), i * 130);
    }
    window.setTimeout(() => this.explosion(), beams * 130 + 350);
    window.setTimeout(() => this.fanfare(), beams * 130 + 1000);
  }
}

/** Singleton — one audio graph per tab. */
export const audio = new ArcadeAudio();
