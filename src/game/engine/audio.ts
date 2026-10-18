// ============================================================
// Hammer of the Emperor — procedural audio engine
// All music and sound effects are synthesized at runtime with WebAudio.
// No external audio files.
// ============================================================

export type MusicIntensity = 'menu' | 'hub' | 'battle' | 'boss';

type SfxOptions = {
  volume?: number;
  pitch?: number;
  pan?: number;
  reverb?: number;
  delay?: number;
};

type Track = {
  bpm: number;
  chords: number[][];
  arp: number[];
  bassEvery: number;
  arpEvery: number;
  padType: OscillatorType;
  padGain: number;
  padFilter: number;
  kickPattern: number[];
  snarePattern: number[];
  hatPattern: number[];
  bellPattern: number[];
  hornPattern: number[];
  droneMidi: number;
  filterFreq: number;
};

const TRACKS: Record<MusicIntensity, Track> = {
  menu: {
    bpm: 56,
    chords: [
      [50, 53, 57, 62],
      [46, 50, 53, 58],
      [43, 46, 50, 55],
      [45, 49, 52, 57],
    ],
    arp: [0, 2, 1, 3, 2, 1],
    bassEvery: 8,
    arpEvery: 8,
    padType: 'triangle',
    padGain: 0.06,
    padFilter: 1300,
    kickPattern: [0, 10],
    snarePattern: [],
    hatPattern: [],
    bellPattern: [0, 8, 16, 24],
    hornPattern: [],
    droneMidi: 26,
    filterFreq: 1600,
  },
  hub: {
    bpm: 70,
    chords: [
      [50, 53, 57, 62],
      [46, 50, 53, 58],
      [53, 57, 60, 65],
      [45, 49, 52, 57],
    ],
    arp: [0, 1, 2, 3, 2, 1],
    bassEvery: 4,
    arpEvery: 4,
    padType: 'sawtooth',
    padGain: 0.03,
    padFilter: 950,
    kickPattern: [0, 8],
    snarePattern: [12],
    hatPattern: [2, 6, 10, 14, 18, 22, 26, 30],
    bellPattern: [8, 24],
    hornPattern: [],
    droneMidi: 26,
    filterFreq: 1200,
  },
  battle: {
    bpm: 112,
    chords: [
      [38, 50, 53, 57],
      [34, 46, 50, 53],
      [36, 48, 52, 55],
      [33, 45, 49, 52],
    ],
    arp: [0, 2, 1, 3, 2, 0, 3, 1],
    bassEvery: 2,
    arpEvery: 2,
    padType: 'sawtooth',
    padGain: 0.04,
    padFilter: 1050,
    kickPattern: [0, 4, 8, 12],
    snarePattern: [4, 12],
    hatPattern: [2, 6, 10, 14, 18, 22, 26, 30],
    bellPattern: [],
    hornPattern: [0, 16],
    droneMidi: 26,
    filterFreq: 1900,
  },
  boss: {
    bpm: 134,
    chords: [
      [37, 49, 52, 56],
      [38, 50, 53, 57],
      [34, 46, 49, 53],
      [32, 44, 48, 51],
    ],
    arp: [0, 3, 1, 2, 0, 3, 2, 1],
    bassEvery: 1,
    arpEvery: 1,
    padType: 'sawtooth',
    padGain: 0.03,
    padFilter: 1200,
    kickPattern: [0, 2, 4, 8, 10, 12],
    snarePattern: [4, 12],
    hatPattern: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    bellPattern: [],
    hornPattern: [0, 8, 16, 24],
    droneMidi: 25,
    filterFreq: 2200,
  },
};

const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Uint8Array | null = null;

  private musicBus: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicMakeup: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientDrone: OscillatorNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private intensity: MusicIntensity = 'menu';
  private energy = 0;
  private musicVolume = 0.6;
  private sfxVolume = 0.78;
  private started = false;
  private lastPlayed = new Map<string, number>();
  private statusListeners = new Set<() => void>();
  private ambientStarted = false;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.emitStatus();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.86;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -15;
      compressor.knee.value = 18;
      compressor.ratio.value = 7;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.22;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      master.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(ctx.destination);

      const musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      const musicDuck = ctx.createGain();
      musicDuck.gain.value = 1;
      const musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 1400;
      musicFilter.Q.value = 0.6;
      const musicMakeup = ctx.createGain();
      musicMakeup.gain.value = 3.2;
      musicBus.connect(musicDuck);
      musicDuck.connect(musicFilter);
      musicFilter.connect(musicMakeup);
      musicMakeup.connect(master);

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = this.sfxVolume;
      sfxBus.connect(master);

      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.28;
      const convolver = ctx.createConvolver();
      convolver.buffer = this.buildImpulse(ctx, 1.9, 2.6);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.35;
      reverbSend.connect(convolver);
      convolver.connect(reverbReturn);
      reverbReturn.connect(master);

      const ambientGain = ctx.createGain();
      ambientGain.gain.value = 0;
      const ambientFilter = ctx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 280;
      ambientFilter.Q.value = 0.8;
      ambientFilter.connect(ambientGain);
      ambientGain.connect(master);

      const buffer = this.buildNoiseBuffer(ctx, 2.2);
      this.ctx = ctx;
      this.master = master;
      this.compressor = compressor;
      this.analyser = analyser;
      this.levelData = new Uint8Array(analyser.fftSize);
      this.musicBus = musicBus;
      this.musicDuck = musicDuck;
      this.musicFilter = musicFilter;
      this.musicMakeup = musicMakeup;
      this.sfxBus = sfxBus;
      this.reverbSend = reverbSend;
      this.reverbReturn = reverbReturn;
      this.ambientGain = ambientGain;
      this.ambientFilter = ambientFilter;
      this.noiseBuffer = buffer;
      this.musicVolume = this.musicVolume;
      this.sfxVolume = this.sfxVolume;
      musicBus.gain.value = 0;
      if (ctx.state === 'suspended') void ctx.resume();
      this.emitStatus();
    } catch (error) {
      console.warn('Audio unavailable', error);
    }
  }

  unlock(): void {
    this.init();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.emitStatus();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (!this.ctx) return;
    if (this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.currentMusicGain(), this.ctx.currentTime, 0.08);
    }
    if (this.sfxBus) {
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  startMusic(intensity: MusicIntensity = 'menu'): void {
    this.init();
    if (!this.ctx) return;
    const changed = this.started && intensity !== this.intensity;
    this.intensity = intensity;
    this.applyIntensityMix(changed);
    this.startAmbient();
    if (this.musicTimer !== null) return;
    this.started = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.12;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 140);
    this.scheduleMusic();
  }

  setIntensity(intensity: MusicIntensity): void {
    if (intensity === this.intensity && this.started) {
      this.applyIntensityMix();
      return;
    }
    this.intensity = intensity;
    if (!this.ctx) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.applyIntensityMix(true);
  }

  setBattleEnergy(energy: number): void {
    this.energy = Math.max(0, Math.min(1, energy));
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.started = false;
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.ambientGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  duckMusic(amount = 0.6, duration = 0.8): void {
    if (!this.ctx || !this.musicDuck) return;
    const now = this.ctx.currentTime;
    const gain = this.musicDuck.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.04, gain.value), now);
    gain.linearRampToValueAtTime(Math.max(0.06, 1 - amount), now + 0.035);
    gain.linearRampToValueAtTime(1, now + Math.max(0.2, duration));
  }

  getStatus(): { initialized: boolean; state: AudioContextState | 'uninitialized'; intensity: MusicIntensity; level: number } {
    return {
      initialized: !!this.ctx,
      state: this.ctx?.state ?? 'uninitialized',
      intensity: this.intensity,
      level: this.getLevel(),
    };
  }

  getLevel(): number {
    if (!this.ctx || !this.analyser || !this.levelData) return 0;
    this.analyser.getByteTimeDomainData(this.levelData);
    let sum = 0;
    for (let i = 0; i < this.levelData.length; i++) {
      const v = (this.levelData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.levelData.length) * 5.2);
  }

  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(): void {
    for (const listener of this.statusListeners) listener();
  }

  private currentMusicGain(): number {
    const target = {
      menu: 0.8,
      hub: 0.7,
      battle: 0.85,
      boss: 0.55,
    }[this.intensity];
    return this.musicVolume * target;
  }

  private applyIntensityMix(crossfade = false): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.musicBus) {
      const target = this.currentMusicGain();
      const gain = this.musicBus.gain;
      if (crossfade) {
        // Cut the outgoing track quickly so its already-scheduled notes cannot
        // pile up underneath the new track.
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(Math.max(0.0001, gain.value), now);
        gain.linearRampToValueAtTime(0.0001, now + 0.05);
        gain.setValueAtTime(0.0001, now + 0.45);
        gain.linearRampToValueAtTime(target, now + 0.95);
      } else {
        gain.setTargetAtTime(target, now, 0.22);
      }
    }
    if (this.musicFilter) {
      this.musicFilter.frequency.setTargetAtTime(TRACKS[this.intensity].filterFreq, now, 0.35);
    }
    if (this.ambientGain) {
      const amb = { menu: 0.012, hub: 0.014, battle: 0.027, boss: 0.032 }[this.intensity];
      this.ambientGain.gain.setTargetAtTime(amb * this.musicVolume, now, 0.4);
    }
    if (this.ambientFilter) {
      const freq = { menu: 190, hub: 240, battle: 620, boss: 420 }[this.intensity];
      this.ambientFilter.frequency.setTargetAtTime(freq, now, 0.5);
    }
    this.emitStatus();
  }

  private startAmbient(): void {
    if (!this.ctx || !this.noiseBuffer || this.ambientStarted) return;
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = this.ambientFilter!;
      source.connect(filter);
      source.start();
      this.ambientSource = source;
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 46;
      const droneGain = this.ctx.createGain();
      droneGain.gain.value = 0.006;
      drone.connect(droneGain);
      droneGain.connect(this.ambientGain!);
      drone.start();
      this.ambientDrone = drone;
      this.ambientStarted = true;
    } catch {
      /* ignore */
    }
  }

  // ============================================================
  // Music scheduling
  // ============================================================

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    // Keep a generous look-ahead so background-tab timer throttling cannot
    // leave holes in the music.
    if (this.nextNoteTime < this.ctx.currentTime - 0.3) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    const horizon = this.ctx.currentTime + 0.6;
    while (this.nextNoteTime < horizon) {
      this.scheduleStep(this.step, this.nextNoteTime);
      const track = TRACKS[this.intensity];
      const stepDuration = 60 / track.bpm / 4;
      this.nextNoteTime += stepDuration;
      this.step = (this.step + 1) % 32;
    }
  }

  private scheduleStep(step: number, when: number): void {
    const track = TRACKS[this.intensity];
    const stepDuration = 60 / track.bpm / 4;
    const chordIndex = Math.floor(step / 16) % track.chords.length;
    const chord = track.chords[chordIndex];

    if (step % 16 === 0) {
      this.schedulePad(chord, when, 16 * stepDuration, track);
    }
    if (step % track.bassEvery === 0) {
      const bassGain = this.intensity === 'menu' ? 0.13 : 0.1;
      this.musicTone(midiToFreq(chord[0] - 12), when, Math.min(0.7, 3.5 * stepDuration), 'sine', bassGain, 0.12);
    }
    if (step % track.arpEvery === 0 && (this.intensity !== 'menu' || step % 8 === 0)) {
      const note = chord[track.arp[(step / Math.max(1, track.arpEvery)) % track.arp.length] % chord.length];
      const arpGain = this.intensity === 'boss' ? 0.03 : this.intensity === 'battle' ? 0.042 : this.intensity === 'hub' ? 0.03 : 0.028;
      this.musicTone(midiToFreq(note + 12), when, stepDuration * 1.55, 'triangle', arpGain, 0.35);
    }
    if (track.bellPattern.includes(step % 32)) {
      const bellGain = this.intensity === 'menu' ? 0.045 : 0.03;
      this.musicTone(midiToFreq(chord[2] + 24), when, 0.9, 'sine', bellGain, 0.58, 0.05);
    }
    if (this.intensity === 'menu' && step % 8 === 4) {
      this.musicTone(midiToFreq(chord[3] + 12), when, stepDuration * 6, 'sine', 0.022, 0.55);
    }
    if (track.hornPattern.includes(step % 32)) {
      this.horn(chord, when, stepDuration * 3.5, this.intensity === 'boss' ? 0.04 : 0.045);
    }
    if (this.intensity === 'boss' && step % 16 === 8) {
      this.choir(chord, when, stepDuration * 7, 0.02);
    }
    if (track.kickPattern.includes(step % 16)) {
      this.musicKick(when, this.intensity === 'boss' ? 0.16 : 0.2);
    }
    if (track.snarePattern.includes(step % 16)) {
      this.musicNoise(when, 0.11, this.intensity === 'boss' ? 0.16 : 0.22, 1300, 1.1, 'bandpass', 0.07);
    }
    if (track.hatPattern.includes(step % 16)) {
      const energyBoost = this.intensity === 'battle' || this.intensity === 'boss' ? this.energy : 0;
      if (step % 2 === 0 || energyBoost > 0.45) {
        this.musicNoise(when, 0.032, this.intensity === 'boss' ? 0.05 : 0.075, 6200, 0.8, 'highpass', 0.025);
      }
    }
    if (this.intensity === 'boss' && step % 8 === 4) {
      this.musicTom(when, 0.09, 0.12);
    }
    if (this.intensity === 'menu' && step === 0) {
      this.heartbeat(when);
    }
  }

  private schedulePad(chord: number[], when: number, duration: number, track: Track): void {
    for (let i = 0; i < 3; i++) {
      const midi = chord[Math.min(chord.length - 1, i)];
      this.musicTone(
        midiToFreq(midi - 12),
        when,
        duration,
        track.padType,
        track.padGain * (i === 0 ? 1.2 : 0.82),
        0.45,
        i * 0.06,
        track.padFilter,
      );
    }
  }

  private musicTone(
    freq: number,
    when: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    reverb = 0.2,
    detune = 0,
    filterFreq?: number,
  ): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), when);
    if (detune) osc.detune.setValueAtTime(detune, when);
    const amp = ctx.createGain();
    const attack = Math.min(0.22, duration * 0.25);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), when + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    let output: AudioNode = amp;
    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.8;
      amp.connect(filter);
      output = filter;
    }
    output.connect(this.musicBus);
    if (reverb > 0 && this.reverbSend) {
      const send = ctx.createGain();
      send.gain.value = reverb * 0.09;
      output.connect(send);
      send.connect(this.reverbSend);
    }
    osc.connect(amp);
    osc.start(when);
    osc.stop(when + duration + 0.08);
  }

  private musicKick(when: number, gainValue: number): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.22);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gainValue, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(amp);
    amp.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.32);
    this.musicNoise(when, 0.028, 0.06, 900, 0.8, 'lowpass', 0.03);
  }

  private musicNoise(
    when: number,
    duration: number,
    gainValue: number,
    filterFreq: number,
    filterQ: number,
    type: BiquadFilterType,
    reverb = 0,
  ): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gainValue, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.musicBus);
    if (reverb > 0 && this.reverbSend) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      amp.connect(send);
      send.connect(this.reverbSend);
    }
    source.start(when);
    source.stop(when + duration + 0.03);
  }

  private musicTom(when: number, gainValue: number, duration: number): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(80, when + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gainValue, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.05);
    osc.connect(amp);
    amp.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + duration + 0.08);
  }

  private heartbeat(when: number): void {
    this.musicKick(when, 0.09);
    this.musicKick(when + 0.24, 0.065);
  }

  private horn(chord: number[], when: number, duration: number, gainValue: number): void {
    for (const midi of [chord[0] - 12, chord[1] - 12]) {
      if (!this.ctx || !this.musicBus) continue;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(midi);
      osc.detune.value = -4 + Math.random() * 8;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 460;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.linearRampToValueAtTime(gainValue, when + 0.25);
      amp.gain.linearRampToValueAtTime(0.0001, when + duration);
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(this.musicBus);
      osc.start(when);
      osc.stop(when + duration + 0.05);
    }
  }

  private choir(chord: number[], when: number, duration: number, gainValue: number): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const midi = chord[i];
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(midi - 12);
      osc.detune.value = (i - 1) * 8;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.linearRampToValueAtTime(gainValue, when + 0.8);
      amp.gain.linearRampToValueAtTime(0.0001, when + duration);
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(this.musicBus);
      osc.start(when);
      osc.stop(when + duration + 0.1);
    }
  }

  // ============================================================
  // SFX
  // ============================================================

  play(name: string, options: SfxOptions = {}): void {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const now = performance.now();
    const minIntervals: Record<string, number> = {
      bolter: 38,
      hit: 28,
      kill: 32,
      coin: 50,
      step: 120,
      ui_hover: 55,
    };
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < (minIntervals[name] ?? 16)) return;
    this.lastPlayed.set(name, now);

    const pitch = options.pitch ?? 1;
    const vol = options.volume ?? 1;
    const pan = options.pan;
    const reverb = options.reverb ?? 0;
    switch (name) {
      case 'ui_hover':
        this.sfxTone(840 * pitch, 0.03, 'triangle', 0.009 * vol, { pan, reverb: 0.1 });
        break;
      case 'ui_click':
      case 'ui_tab':
        this.sfxTone(520 * pitch, 0.055, 'square', 0.018 * vol, {
          pan,
          glideTo: 430 * pitch,
          reverb: 0.08,
        });
        this.sfxNoise(0.035, 0.008 * vol, 2400, 'bandpass', pan);
        break;
      case 'ui_confirm':
      case 'purchase':
        this.sfxChord([392, 523.25, 659.25], 0.09, 0.38, 'triangle', 0.022 * vol, pan, 0.3);
        this.sfxNoise(0.06, 0.009 * vol, 2100, 'bandpass', pan);
        break;
      case 'ui_back':
      case 'ui_cancel':
        this.sfxTone(340, 0.12, 'triangle', 0.02 * vol, { pan, glideTo: 170, reverb: 0.2 });
        break;
      case 'ui_error':
        this.sfxTone(150, 0.13, 'sawtooth', 0.04 * vol, { pan, glideTo: 70 });
        this.sfxTone(103, 0.18, 'square', 0.022 * vol, { pan, glideTo: 60, delay: 0.06 });
        break;
      case 'coin':
        this.sfxTone(960 * pitch, 0.055, 'triangle', 0.018 * vol, { pan, glideTo: 1280 * pitch });
        this.sfxTone(1440 * pitch, 0.08, 'sine', 0.01 * vol, { pan, delay: 0.03 });
        break;
      case 'pickup':
        this.sfxChord([659.25, 880, 1174.66], 0.07, 0.25, 'triangle', 0.022 * vol, pan, 0.25);
        break;
      case 'heal':
        this.sfxChord([392, 523.25, 659.25, 783.99], 0.12, 0.6, 'sine', 0.035 * vol, pan, 0.4);
        this.sfxNoise(0.3, 0.012 * vol, 1200, 'bandpass', pan);
        break;
      case 'shield':
        this.sfxChord([523.25, 783.99, 1046.5], 0.08, 0.45, 'sine', 0.018 * vol, pan, 0.5);
        this.sfxNoise(0.25, 0.018 * vol, 4200, 'highpass', pan);
        break;
      case 'dash':
        this.sfxNoise(0.2, 0.045 * vol, 1900, 'highpass', pan);
        this.sfxTone(260, 0.16, 'sawtooth', 0.018 * vol, { pan, glideTo: 720, reverb: 0.15 });
        break;
      case 'hurt':
      case 'player_hit':
        this.sfxTone(92, 0.25, 'sine', 0.09 * vol, { pan: pan ?? 0, glideTo: 42 });
        this.sfxNoise(0.12, 0.05 * vol, 620, 'lowpass', pan);
        this.sfxTone(240, 0.08, 'square', 0.018 * vol, { pan, glideTo: 130 });
        break;
      case 'death':
      case 'defeat':
        this.sfxTone(110, 2.1, 'sawtooth', 0.07 * vol, { glideTo: 34, reverb: 0.5 });
        this.sfxTone(82, 2.3, 'sine', 0.055 * vol, { glideTo: 28, delay: 0.1, reverb: 0.5 });
        this.sfxNoise(1.6, 0.04 * vol, 280, 'lowpass', pan);
        this.duckMusic(0.45, 2.4);
        break;
      case 'bolter':
        this.sfxNoise(0.055, 0.065 * vol, 2300 + Math.random() * 700, 'bandpass', pan);
        this.sfxTone(112 * pitch + Math.random() * 18, 0.055, 'square', 0.03 * vol, {
          pan,
          glideTo: 48,
        });
        break;
      case 'chainsword':
        this.sfxNoise(0.16, 0.05 * vol, 2600, 'bandpass', pan);
        this.sfxTone(210, 0.22, 'sawtooth', 0.028 * vol, { pan, glideTo: 760, reverb: 0.08 });
        this.sfxTone(420, 0.1, 'square', 0.012 * vol, { pan, delay: 0.05, glideTo: 260 });
        break;
      case 'hammer':
        this.sfxNoise(0.35, 0.11 * vol, 640, 'lowpass', pan);
        this.sfxTone(62, 0.48, 'sine', 0.1 * vol, { pan, glideTo: 26, reverb: 0.35 });
        this.sfxTone(140, 0.16, 'square', 0.024 * vol, { pan, glideTo: 55 });
        break;
      case 'plasma':
        this.sfxTone(780, 0.24, 'sawtooth', 0.03 * vol, { pan, glideTo: 190, reverb: 0.2 });
        this.sfxNoise(0.18, 0.04 * vol, 3200, 'bandpass', pan);
        this.sfxTone(1560, 0.1, 'sine', 0.014 * vol, { pan, delay: 0.03 });
        break;
      case 'plasma_burst':
        this.sfxNoise(0.32, 0.09 * vol, 1100, 'bandpass', pan);
        this.sfxTone(96, 0.38, 'sine', 0.07 * vol, { pan, glideTo: 36, reverb: 0.3 });
        this.sfxNoise(0.1, 0.04 * vol, 4200, 'highpass', pan);
        break;
      case 'banner':
        this.sfxChord([196, 261.63, 329.63, 392], 0.12, 0.8, 'triangle', 0.03 * vol, pan, 0.4);
        this.sfxNoise(0.28, 0.015 * vol, 900, 'bandpass', pan);
        break;
      case 'enemy_hit':
      case 'hit':
        this.sfxNoise(0.03, 0.018 * vol, 1800 * pitch, 'bandpass', pan);
        break;
      case 'enemy_bolt':
        this.sfxTone(280, 0.09, 'sawtooth', 0.012 * vol, { pan, glideTo: 140 });
        this.sfxNoise(0.05, 0.008 * vol, 2200, 'bandpass', pan);
        break;
      case 'enemy_die':
      case 'kill':
        this.sfxNoise(0.1, 0.035 * vol, 720, 'lowpass', pan);
        this.sfxTone(75 * pitch, 0.08, 'square', 0.016 * vol, { pan, glideTo: 42 });
        break;
      case 'elite_die':
        this.sfxNoise(0.2, 0.06 * vol, 950, 'lowpass', pan);
        this.sfxTone(120, 0.22, 'sawtooth', 0.03 * vol, { pan, glideTo: 44, reverb: 0.1 });
        this.sfxChord([880, 1174.66], 0.07, 0.2, 'triangle', 0.018 * vol, pan, 0.2);
        break;
      case 'orbital_call':
      case 'strike_call':
        this.sfxNoise(0.28, 0.02 * vol, 900, 'bandpass', pan);
        this.sfxTone(560, 0.4, 'sine', 0.028 * vol, { pan, glideTo: 120, reverb: 0.4 });
        this.sfxTone(760, 0.12, 'square', 0.011 * vol, { pan, delay: 0.09 });
        break;
      case 'orbital_incoming':
        this.sfxTone(1280, 0.62, 'sine', 0.018 * vol, { pan, glideTo: 100, reverb: 0.4 });
        break;
      case 'orbital_hit':
      case 'strike_land':
        this.sfxTone(92, 0.85, 'sine', 0.18 * vol, { pan, glideTo: 25, reverb: 0.5 });
        this.sfxNoise(0.7, 0.17 * vol, 520, 'lowpass', pan);
        this.sfxNoise(0.22, 0.08 * vol, 3400, 'bandpass', pan);
        this.sfxTone(48, 0.55, 'triangle', 0.075 * vol, { pan, glideTo: 22, delay: 0.012 });
        this.duckMusic(0.5, 0.85);
        break;
      case 'strike_ready':
        this.sfxTone(880, 0.1, 'triangle', 0.022 * vol, { pan, reverb: 0.25 });
        this.sfxTone(1320, 0.14, 'sine', 0.012 * vol, { pan, delay: 0.04 });
        break;
      case 'warning':
        this.sfxTone(440, 0.12, 'square', 0.035 * vol, { pan });
        this.sfxTone(440, 0.12, 'square', 0.03 * vol, { pan, delay: 0.2 });
        break;
      case 'battle_start':
        this.sfxChord([130.81, 196, 261.63], 0.18, 1.1, 'sawtooth', 0.042 * vol, pan, 0.45);
        this.sfxNoise(0.9, 0.055 * vol, 520, 'lowpass', pan);
        this.sfxTone(65.41, 1.1, 'sine', 0.075 * vol, { pan, glideTo: 49 });
        break;

      case 'skill':
        this.sfxTone(220, 0.25, 'sawtooth', 0.04 * vol, { pan, glideTo: 700, reverb: 0.2 });
        this.sfxTone(440, 0.3, 'triangle', 0.02 * vol, { pan, glideTo: 990, delay: 0.04 });
        break;
      case 'skill_volley':
        for (let i = 0; i < 4; i++) {
          this.sfxNoise(0.05, 0.04 * vol, 2400, 'bandpass', pan, i * 0.035);
          this.sfxTone(100 + i * 12, 0.05, 'square', 0.018 * vol, { pan, glideTo: 48 });
        }
        break;
      case 'skill_buff':
        this.sfxChord([261.63, 329.63, 392, 523.25], 0.1, 0.55, 'triangle', 0.03 * vol, pan, 0.3);
        break;
      case 'skill_bomb':
      case 'melta':
        this.sfxNoise(0.4, 0.1 * vol, 700, 'lowpass', pan);
        this.sfxTone(72, 0.45, 'sine', 0.11 * vol, { pan, glideTo: 30 });
        this.sfxNoise(0.18, 0.06 * vol, 2800, 'bandpass', pan);
        break;
      case 'skill_summon':
      case 'summon':
        this.sfxTone(130, 0.14, 'square', 0.03 * vol, { pan, glideTo: 280 });
        this.sfxTone(290, 0.18, 'square', 0.02 * vol, { pan, glideTo: 520, delay: 0.09 });
        this.sfxNoise(0.15, 0.015 * vol, 1800, 'bandpass', pan);
        break;
      case 'servitor':
      case 'conversion':
        this.sfxTone(180, 0.09, 'square', 0.035 * vol, { pan, glideTo: 560 });
        this.sfxTone(560, 0.14, 'square', 0.018 * vol, { pan, glideTo: 260, delay: 0.07 });
        this.sfxNoise(0.2, 0.015 * vol, 3000, 'highpass', pan);
        break;
      case 'skill_sniper':
        this.sfxNoise(0.035, 0.055 * vol, 1900, 'bandpass', pan);
        this.sfxTone(1800, 0.15, 'sawtooth', 0.028 * vol, { pan, glideTo: 240, reverb: 0.4 });
        break;
      case 'skill_piercing':
        this.sfxTone(1400, 0.16, 'sawtooth', 0.025 * vol, { pan, glideTo: 170 });
        this.sfxNoise(0.08, 0.03 * vol, 3200, 'highpass', pan);
        break;
      case 'skill_execute':
        this.sfxChord([110, 164.81, 220, 329.63], 0.18, 0.9, 'sawtooth', 0.032 * vol, pan, 0.5);
        this.sfxNoise(0.4, 0.03 * vol, 700, 'lowpass', pan);
        break;
      case 'skill_flame':
      case 'flame':
        this.sfxNoise(0.5, 0.07 * vol, 1200, 'bandpass', pan);
        this.sfxTone(180, 0.35, 'sawtooth', 0.02 * vol, { pan, glideTo: 500 });
        break;
      case 'skill_chain':
      case 'lightning':
        for (let i = 0; i < 5; i++) {
          this.sfxNoise(0.04, 0.03 * vol, 3400, 'highpass', pan, i * 0.055);
          this.sfxTone(900 + i * 180, 0.06, 'sawtooth', 0.018 * vol, { pan, delay: i * 0.05 });
        }
        break;
      case 'skill_frost':
      case 'frost':
        this.sfxChord([784, 987.77, 1174.66, 1567.98], 0.07, 0.65, 'sine', 0.022 * vol, pan, 0.5);
        this.sfxNoise(0.5, 0.025 * vol, 4600, 'highpass', pan);
        break;
      case 'skill_singularity':
        this.sfxTone(55, 1.2, 'sawtooth', 0.055 * vol, { pan, glideTo: 420, reverb: 0.5 });
        this.sfxNoise(1.0, 0.03 * vol, 600, 'lowpass', pan);
        break;
      case 'skill_entropy':
        this.sfxTone(110, 0.6, 'sawtooth', 0.035 * vol, { pan, glideTo: 70, reverb: 0.4 });
        this.sfxNoise(0.5, 0.03 * vol, 900, 'bandpass', pan);
        break;
      case 'skill_scarab':
        for (let i = 0; i < 4; i++) {
          this.sfxNoise(0.04, 0.02 * vol, 2400 + i * 400, 'highpass', pan, i * 0.03);
        }
        break;
      case 'boss_roar':
      case 'boss_roar_phase':
        this.sfxTone(58, 1.1, 'sawtooth', 0.16 * vol, { pan, glideTo: 34, reverb: 0.3 });
        this.sfxTone(82, 0.9, 'square', 0.06 * vol, { pan, glideTo: 55, delay: 0.04 });
        this.sfxNoise(1.0, 0.1 * vol, 360, 'lowpass', pan);
        this.duckMusic(0.4, 1.4);
        break;
      case 'boss_telegraph':
        this.sfxTone(330, 0.16, 'square', 0.035 * vol, { pan, glideTo: 520 });
        this.sfxTone(330, 0.16, 'square', 0.03 * vol, { pan, glideTo: 520, delay: 0.22 });
        break;
      case 'boss_slam':
        this.sfxTone(68, 0.55, 'sine', 0.18 * vol, { pan, glideTo: 25 });
        this.sfxNoise(0.5, 0.14 * vol, 420, 'lowpass', pan);
        this.duckMusic(0.45, 0.8);
        break;
      case 'boss_volley':
        for (let i = 0; i < 5; i++) {
          this.sfxNoise(0.08, 0.035 * vol, 1200 + i * 300, 'bandpass', pan, i * 0.04);
        }
        break;
      case 'boss_charge':
        this.sfxNoise(0.5, 0.06 * vol, 600, 'lowpass', pan);
        this.sfxTone(90, 0.4, 'sawtooth', 0.04 * vol, { pan, glideTo: 240 });
        break;
      case 'boss_summon':
        this.sfxTone(100, 0.7, 'sawtooth', 0.05 * vol, { pan, glideTo: 420, reverb: 0.45 });
        this.sfxNoise(0.6, 0.04 * vol, 1400, 'bandpass', pan);
        break;
      case 'boss_die':
        this.sfxTone(90, 1.9, 'sawtooth', 0.13 * vol, { pan, glideTo: 22, reverb: 0.45 });
        this.sfxNoise(1.6, 0.18 * vol, 380, 'lowpass', pan);
        this.sfxTone(45, 1.4, 'sine', 0.08 * vol, { pan, glideTo: 18, delay: 0.15 });
        this.duckMusic(0.7, 2.2);
        break;
      case 'victory':
        this.sfxChord([220, 277.18, 329.63, 440, 554.37], 0.16, 1.5, 'triangle', 0.045 * vol, pan, 0.4);
        this.sfxTone(55, 1.8, 'sine', 0.08 * vol, { pan });
        this.sfxNoise(1.2, 0.02 * vol, 3500, 'highpass', pan);
        this.duckMusic(0.25, 1.8);
        break;
      case 'achievement':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) =>
          this.sfxTone(freq, 0.26, 'triangle', 0.026 * vol, {
            pan,
            delay: index * 0.1,
            reverb: 0.4,
          }),
        );
        break;
      case 'unlock':
        this.sfxChord([261.63, 329.63, 392, 523.25, 659.25], 0.12, 0.8, 'triangle', 0.03 * vol, pan, 0.4);
        this.sfxNoise(0.5, 0.025 * vol, 2400, 'highpass', pan);
        break;
      case 'forge':
        this.sfxNoise(0.12, 0.08 * vol, 2800, 'bandpass', pan);
        this.sfxTone(175, 0.18, 'square', 0.05 * vol, { pan, glideTo: 72 });
        this.sfxNoise(0.3, 0.025 * vol, 900, 'lowpass', pan, 0.02);
        break;
      case 'forge_success':
        this.sfxChord([392, 523.25, 659.25], 0.1, 0.55, 'triangle', 0.033 * vol, pan, 0.4);
        this.sfxTone(1320, 0.3, 'sine', 0.018 * vol, { pan, delay: 0.07, reverb: 0.4 });
        break;
      case 'consecrate':
        this.sfxChord([196, 293.66, 392, 587.33], 0.2, 1.0, 'sawtooth', 0.025 * vol, pan, 0.55);
        this.sfxNoise(0.7, 0.02 * vol, 2800, 'highpass', pan);
        break;
      case 'upgrade':
        this.sfxTone(240, 0.1, 'square', 0.035 * vol, { pan, glideTo: 500 });
        this.sfxTone(500, 0.12, 'square', 0.02 * vol, { pan, glideTo: 300, delay: 0.08 });
        this.sfxNoise(0.12, 0.02 * vol, 2400, 'bandpass', pan);
        break;
      case 'forge_fail':
      case 'fail':
        this.sfxTone(160, 0.22, 'sawtooth', 0.045 * vol, { pan, glideTo: 65 });
        this.sfxNoise(0.2, 0.03 * vol, 500, 'lowpass', pan);
        break;
      case 'salvage':
        this.sfxNoise(0.25, 0.06 * vol, 800, 'lowpass', pan);
        this.sfxTone(120, 0.18, 'square', 0.022 * vol, { pan, glideTo: 60 });
        this.sfxTone(880, 0.06, 'triangle', 0.015 * vol, { pan, delay: 0.12 });
        break;
      case 'equip':
        this.sfxNoise(0.09, 0.04 * vol, 2200, 'bandpass', pan);
        this.sfxTone(220, 0.12, 'square', 0.03 * vol, { pan, glideTo: 160 });
        break;
      case 'mine_upgrade':
        this.sfxNoise(0.4, 0.03 * vol, 600, 'lowpass', pan);
        this.sfxTone(100, 0.35, 'sawtooth', 0.025 * vol, { pan, glideTo: 220 });
        this.sfxTone(340, 0.12, 'square', 0.02 * vol, { pan, delay: 0.22 });
        break;
      case 'crate':
        this.sfxTone(120, 0.18, 'square', 0.04 * vol, { pan, glideTo: 55 });
        this.sfxNoise(0.25, 0.03 * vol, 1200, 'bandpass', pan);
        break;
      case 'victory_drums':
        for (let i = 0; i < 4; i++) this.musicKick(this.ctx.currentTime + i * 0.16, 0.12);
        break;
      default:
        this.sfxTone(440, 0.06, 'square', 0.02 * vol, { pan });
    }
  }

  private sfxTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    opts: {
      glideTo?: number;
      delay?: number;
      pan?: number;
      reverb?: number;
      filter?: number;
      detune?: number;
    } = {},
  ): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), when);
    if (opts.glideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glideTo), when + duration);
    }
    if (opts.detune) osc.detune.value = opts.detune;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), when + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    let output: AudioNode = amp;
    if (opts.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.filter;
      filter.Q.value = 0.7;
      amp.connect(filter);
      output = filter;
    }
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    output.connect(panner);
    panner.connect(this.sfxBus);
    if (opts.reverb && this.reverbSend) {
      const send = ctx.createGain();
      send.gain.value = opts.reverb;
      panner.connect(send);
      send.connect(this.reverbSend);
    }
    osc.connect(amp);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  private sfxNoise(
    duration: number,
    gainValue: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'bandpass',
    pan = 0,
    delay = 0,
    reverb = 0,
  ): void {
    if (!this.ctx || !this.noiseBuffer || !this.sfxBus) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, when);
    filter.Q.value = 0.9;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gainValue, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter);
    filter.connect(amp);
    amp.connect(panner);
    panner.connect(this.sfxBus);
    if (reverb > 0 && this.reverbSend) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      panner.connect(send);
      send.connect(this.reverbSend);
    }
    source.start(when);
    source.stop(when + duration + 0.03);
  }

  private sfxChord(
    freqs: number[],
    attack: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    pan = 0,
    reverb = 0.2,
  ): void {
    freqs.forEach((freq, index) =>
      this.sfxTone(freq, duration, type, gainValue / Math.max(1, freqs.length * 0.6), {
        pan,
        reverb,
        delay: index * attack * 0.35,
      }),
    );
  }

  private buildNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = last * 0.9 + white * 0.1;
    }
    return buffer;
  }

  private buildImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }
}

export const audio = new AudioEngine();
