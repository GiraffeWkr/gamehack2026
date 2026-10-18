/**
 * Procedural sound effects.
 *
 * The slice ships no audio assets (the original's clips are not in the exported data),
 * so every sound here is synthesised with WebAudio: short oscillator sweeps and filtered
 * noise bursts. That keeps the bundle tiny, avoids licensing, and lets each cue be tuned
 * by ear without a pipeline.
 *
 * Autoplay policy: no AudioContext is created until the first user gesture. Until then
 * `play()` is a no-op, which is exactly what browsers require.
 */

export type SfxName =
  | 'shoot'
  | 'tap'
  | 'hit'
  | 'kill'
  | 'coin'
  | 'gem'
  | 'portal'
  | 'clear'
  | 'death'
  | 'skill'
  | 'ui'
  | 'ready'
  | 'denied';

const MUTE_KEY = 'zad-archery-web/audio-muted';

/** Minimum spacing per cue, so a 20-enemy volley does not turn into a buzzsaw. */
const THROTTLE: Partial<Record<SfxName, number>> = {
  shoot: 0.045,
  hit: 0.035,
  kill: 0.05,
  coin: 0.03,
  gem: 0.06,
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private thrusterGain: GainNode | null = null;
  private bgm: HTMLAudioElement | null = null;
  private bgmFadeTimer: number | null = null;
  private thrusterOn = false;
  private last = new Map<SfxName, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage disabled: default to audible */
    }
  }

  /** True once the first gesture has created the audio graph. */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Creates/resumes the context. Safe to call on every gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.buildThruster();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    // The first gesture both creates the graph and starts the BGM; later gestures only
    // resume it if the tab was hidden or the player had muted it.
    if (this.bgm && this.bgm.paused) this.tryPlayMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
    if (this.bgm) {
      if (muted) this.bgm.pause();
      else this.tryPlayMusic();
    }
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  toggle(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Continuous, very quiet hover hum, faded in only while the archer is moving. */
  setThruster(on: boolean): void {
    if (!this.ctx || !this.thrusterGain) return;
    if (on === this.thrusterOn) return;
    this.thrusterOn = on;
    this.thrusterGain.gain.setTargetAtTime(on ? 0.022 : 0, this.ctx.currentTime, 0.18);
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const gap = THROTTLE[name] ?? 0;
    if (gap > 0 && now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);

    switch (name) {
      case 'shoot':
        this.tone('square', 920, 380, 0.07, 0.09);
        this.noise(0.05, 0.09, 'highpass', 2400, 1200);
        break;
      case 'tap':
        this.tone('sine', 230, 65, 0.2, 0.13);
        this.tone('sawtooth', 130, 55, 0.24, 0.05);
        this.noise(0.22, 0.08, 'lowpass', 1400, 220);
        break;
      case 'hit':
        this.noise(0.035, 0.09, 'highpass', 1900, 900);
        break;
      case 'kill':
        this.tone('square', 190, 55, 0.16, 0.08);
        this.noise(0.16, 0.11, 'lowpass', 900, 120);
        break;
      case 'coin':
        this.tone('sine', 1320, 1320, 0.05, 0.06);
        this.tone('sine', 1760, 1760, 0.06, 0.06, 0.05);
        break;
      case 'gem':
        this.tone('triangle', 880, 880, 0.07, 0.07);
        this.tone('triangle', 1320, 1320, 0.07, 0.06, 0.06);
        this.tone('triangle', 1760, 1760, 0.09, 0.06, 0.12);
        break;
      case 'portal':
        this.tone('sawtooth', 70, 220, 0.36, 0.09);
        this.noise(0.36, 0.05, 'bandpass', 300, 1000);
        break;
      case 'clear': {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.09, i * 0.11));
        break;
      }
      case 'death':
        this.tone('sawtooth', 320, 50, 0.55, 0.11);
        this.noise(0.5, 0.08, 'lowpass', 700, 80);
        break;
      case 'skill':
        this.noise(0.22, 0.1, 'bandpass', 600, 2400);
        this.tone('triangle', 420, 900, 0.18, 0.06);
        break;
      case 'ready':
        this.tone('sine', 660, 660, 0.09, 0.06);
        this.tone('sine', 990, 990, 0.12, 0.06, 0.09);
        break;
      case 'ui':
        this.tone('square', 760, 760, 0.03, 0.04);
        break;
      case 'denied':
        this.tone('square', 190, 120, 0.12, 0.06);
        break;
    }
  }

  // ---------------------------------------------------------------- synthesis

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(
    dur: number,
    gain: number,
    filter: BiquadFilterType,
    f0: number,
    f1: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // White noise with a linear fade, so the burst has a natural tail.
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(f0, ctx.currentTime);
    biquad.frequency.exponentialRampToValueAtTime(Math.max(40, f1), ctx.currentTime + dur);
    const env = ctx.createGain();
    env.gain.value = gain;
    src.connect(biquad).connect(env).connect(master);
    src.start();
  }

  /** BGM level; the HTML audio element has its own volume, separate from the SFX bus. */
  private static readonly MUSIC_VOLUME = 0.24;

  /** True once the BGM element exists (it is created on the first gesture). */
  get musicReady(): boolean {
    return this.bgm !== null;
  }

  /**
   * Background music from `public/audio/bgm.mp3`.
   *
   * A plain looped `<audio>` element instead of a WebAudio buffer: the track is a ~5MB
   * MP3 several minutes long, and decoding it into an AudioBuffer would cost tens of
   * megabytes of float samples on mobile for no benefit.
   */
  private startMusic(): void {
    if (this.bgm) return;
    const audio = new Audio('audio/bgm.mp3');
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this.bgm = audio;
  }

  /** Plays the BGM when it should be audible; safe to call repeatedly. */
  private tryPlayMusic(): void {
    if (!this.bgm || this.muted || document.hidden) return;
    const playing = this.bgm.play();
    if (playing) {
      playing.catch(() => {
        /* the gesture that unlocks audio may not have reached this element yet */
      });
    }
    this.fadeMusic(Sfx.MUSIC_VOLUME);
  }

  /** Pauses/resumes just the music, e.g. when the tab is hidden. */
  setMusicPaused(paused: boolean): void {
    if (!this.bgm) return;
    if (paused) this.bgm.pause();
    else this.tryPlayMusic();
  }

  private fadeMusic(target: number): void {
    if (!this.bgm) return;
    if (this.bgmFadeTimer !== null) window.clearInterval(this.bgmFadeTimer);
    this.bgmFadeTimer = window.setInterval(() => {
      if (!this.bgm) return;
      const v = this.bgm.volume;
      const next = v + (target > v ? 0.04 : -0.04);
      if (Math.abs(target - next) < 0.04 || next <= 0 || next >= 1) {
        this.bgm.volume = Math.max(0, Math.min(1, target));
        if (this.bgmFadeTimer !== null) window.clearInterval(this.bgmFadeTimer);
        this.bgmFadeTimer = null;
      } else {
        this.bgm.volume = next;
      }
    }, 40);
  }
  /** A one-second noise loop through a low-pass: the anti-grav hum under everything. */
  private buildThruster(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const frames = Math.floor(ctx.sampleRate * 1.0);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frames; i++) {
      // Brown-ish noise: softer and less hissy than white noise.
      last = (last + (Math.random() * 2 - 1) * 0.04) * 0.995;
      data[i] = last;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(master);
    src.start();
    this.thrusterGain = gain;
  }
}
