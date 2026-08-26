import {
  SeededRandom,
  chordRootMidi,
  chooseNeighborScene,
  chooseNextDegree,
  clamp,
  findPivotDegree,
  interpolateProfile,
  midiToFrequency,
  nextSeed,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  smoothstep,
  voiceLeadChord,
  type HarmonicScene,
  type SeedSnapshot,
  type WeatherProfile,
} from './generative';

type EngineOptions = {
  debugFast?: boolean;
  onSnapshot?: (snapshot: SeedSnapshot) => void;
};

export type AudioBands = {
  bass: number;
  interaction: number;
  mid: number;
  treble: number;
};

export type NagiDiagnostics = {
  activeSources: number;
  bass: number;
  chordDegree: number;
  contextState: AudioContextState | 'uninitialized';
  currentSeed: string;
  harmonicScene: string;
  incomingSeed: string | null;
  interaction: number;
  maxSchedulerJitterMs: number;
  mid: number;
  outputPeak: number;
  outputRms: number;
  scheduledEvents: number;
  transition: number;
  treble: number;
};

const PAD_PARTIALS = new Float32Array([0, 1, 0.22, 0.085, 0.032, 0.014, 0.006]);
const BELL_PARTIALS = new Float32Array([0, 1, 0.08, 0.31, 0.025, 0.12, 0.018, 0.05]);
const AIR_PARTIALS = new Float32Array([0, 1, 0.34, 0.14, 0.06, 0.026]);

export class NagiAudioEngine {
  private readonly options: EngineOptions;
  private readonly trackedSources = new Set<AudioScheduledSourceNode>();
  private airWave?: PeriodicWave;
  private analyser?: AnalyserNode;
  private analyserData?: Uint8Array<ArrayBuffer>;
  private analyserTimeData?: Float32Array<ArrayBuffer>;
  private bands: AudioBands = { bass: 0, mid: 0, treble: 0, interaction: 0 };
  private bellWave?: PeriodicWave;
  private chordDegree = 0;
  private chordsUntilSceneChange = 0;
  private compressor?: DynamicsCompressorNode;
  private context?: AudioContext;
  private currentProfile: WeatherProfile;
  private currentSeed: string;
  private currentVoicing: number[] = [];
  private effectsBus?: GainNode;
  private filter?: BiquadFilterNode;
  private globalPanner?: StereoPannerNode;
  private harmonicScene: HarmonicScene;
  private incomingProfile: WeatherProfile | null = null;
  private incomingSeed: string | null = null;
  private interactionEnergy = 0;
  private interactionPressed = false;
  private interactionX = 0.5;
  private interactionY = 0.5;
  private lastInteractionSoundAt = -Infinity;
  private lastMelodyMidi = 69;
  private lastSnapshotAt = -Infinity;
  private lastTickWall = 0;
  private master?: GainNode;
  private maxSchedulerJitterMs = 0;
  private muted = false;
  private nextFxAt = 0;
  private nextHarmonyAt = 0;
  private nextSeedAt = 0;
  private noiseBuffer?: AudioBuffer;
  private padWave?: PeriodicWave;
  private playing = false;
  private random: SeededRandom;
  private scheduledEvents = 0;
  private outputPeak = 0;
  private outputRms = 0;
  private sourceBus?: GainNode;
  private timer?: ReturnType<typeof setInterval>;
  private transitionDuration = 0;
  private transitionStartedAt = 0;
  private volume = 0.72;
  private wet?: GainNode;

  constructor(seed: string, options: EngineOptions = {}) {
    this.currentSeed = seed;
    this.currentProfile = profileFromSeed(seed);
    this.harmonicScene = sceneFromSeed(seed);
    this.random = new SeededRandom(seedToNumber(seed) ^ 0x51f2e9ad);
    this.chordsUntilSceneChange = 7 + Math.floor(this.random.next() * 7);
    this.options = options;
  }

  async start() {
    if (this.context) {
      await this.resume();
      return;
    }

    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is not supported');
    const context = new AudioContextClass({ latencyHint: 'interactive' });
    this.context = context;
    this.sourceBus = context.createGain();
    this.effectsBus = context.createGain();
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 7200;
    this.filter.Q.value = 0.36;

    const dry = context.createGain();
    dry.gain.value = 0.82;
    const convolver = context.createConvolver();
    convolver.buffer = this.createImpulse(context, 7.2);
    this.wet = context.createGain();
    this.wet.gain.value = 0.34;

    const delayA = context.createDelay(2);
    const delayB = context.createDelay(2);
    delayA.delayTime.value = 0.37;
    delayB.delayTime.value = 0.61;
    const delayLevelA = context.createGain();
    const delayLevelB = context.createGain();
    delayLevelA.gain.value = 0.12;
    delayLevelB.gain.value = 0.09;
    const delayPanA = context.createStereoPanner();
    const delayPanB = context.createStereoPanner();
    delayPanA.pan.value = -0.62;
    delayPanB.pan.value = 0.66;

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.11;
    this.compressor.release.value = 1.15;
    this.globalPanner = context.createStereoPanner();
    const makeup = context.createGain();
    makeup.gain.value = 2.8;

    this.master = context.createGain();
    this.master.gain.value = 0;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyserTimeData = new Float32Array(this.analyser.fftSize);

    this.effectsBus.connect(this.sourceBus);
    this.effectsBus.connect(delayA);
    this.effectsBus.connect(delayB);
    delayA.connect(delayLevelA);
    delayB.connect(delayLevelB);
    delayLevelA.connect(delayPanA);
    delayLevelB.connect(delayPanB);
    delayPanA.connect(this.compressor);
    delayPanB.connect(this.compressor);
    this.sourceBus.connect(this.filter);
    this.filter.connect(dry);
    dry.connect(this.compressor);
    this.filter.connect(convolver);
    convolver.connect(this.wet);
    this.wet.connect(this.compressor);
    this.compressor.connect(makeup);
    makeup.connect(this.globalPanner);
    this.globalPanner.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(context.destination);

    this.padWave = context.createPeriodicWave(
      new Float32Array(PAD_PARTIALS.length),
      PAD_PARTIALS,
      { disableNormalization: false },
    );
    this.bellWave = context.createPeriodicWave(
      new Float32Array(BELL_PARTIALS.length),
      BELL_PARTIALS,
      { disableNormalization: false },
    );
    this.airWave = context.createPeriodicWave(
      new Float32Array(AIR_PARTIALS.length),
      AIR_PARTIALS,
      { disableNormalization: false },
    );
    this.noiseBuffer = this.createNoise(context, 4.2);

    if (context.state !== 'running') await context.resume();
    const now = context.currentTime;
    this.playing = true;
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(this.volume, now + 0.38);
    this.scheduleHarmony(now + 0.025, true);
    this.nextFxAt = now + 2.1;
    this.nextSeedAt = now + this.dwellSeconds(this.currentProfile);
    this.lastTickWall = 0;
    this.timer = setInterval(() => this.tick(), 180);
    this.tick();
  }

  async pause() {
    if (!this.context || !this.master || !this.playing) return;
    this.playing = false;
    this.lastTickWall = 0;
    const context = this.context;
    this.master.gain.cancelScheduledValues(context.currentTime);
    this.master.gain.setTargetAtTime(0.0001, context.currentTime, 0.13);
    await new Promise((resolve) => setTimeout(resolve, 430));
    if (!this.playing && context.state === 'running') await context.suspend();
  }

  async resume() {
    if (!this.context || !this.master) return;
    this.playing = true;
    this.lastTickWall = 0;
    if (this.context.state !== 'running') await this.context.resume();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(
      this.muted ? 0.0001 : this.volume,
      this.context.currentTime,
      0.28,
    );
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(
      muted ? 0.0001 : this.volume,
      this.context.currentTime,
      0.24,
    );
  }

  setVolume(value: number) {
    this.volume = Math.min(0.9, Math.max(0.06, value));
    if (!this.context || !this.master || this.muted) return;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.2);
  }

  setInteraction(x: number, y: number, velocity: number, pressed = false) {
    this.interactionX = clamp(x);
    this.interactionY = clamp(y);
    this.interactionPressed = pressed;
    const impulse = clamp(velocity * 1.65 + (pressed ? 0.28 : 0));
    this.interactionEnergy = Math.max(this.interactionEnergy, impulse);

    const context = this.context;
    if (
      !context ||
      !this.playing ||
      context.state !== 'running' ||
      impulse < 0.12 ||
      context.currentTime - this.lastInteractionSoundAt < 0.22 + (1 - impulse) * 0.34 ||
      this.trackedSources.size >= 40
    ) {
      return;
    }
    this.lastInteractionSoundAt = context.currentTime;
    this.scheduleInteractionRipple(context.currentTime + 0.012, impulse);
  }

  getSnapshot(): SeedSnapshot {
    const now = this.context?.currentTime ?? 0;
    const transition = this.getTransition(now);
    return {
      currentSeed: this.currentSeed,
      incomingSeed: this.incomingSeed,
      profile:
        this.incomingProfile === null
          ? this.currentProfile
          : interpolateProfile(this.currentProfile, this.incomingProfile, transition),
      transition,
    };
  }

  readAudioBands(): AudioBands {
    if (!this.analyser || !this.analyserData || !this.context) return this.bands;
    this.analyser.getByteFrequencyData(this.analyserData);
    if (this.analyserTimeData) {
      this.analyser.getFloatTimeDomainData(this.analyserTimeData);
      let sumSquares = 0;
      let peak = 0;
      for (let index = 0; index < this.analyserTimeData.length; index += 1) {
        const sample = this.analyserTimeData[index];
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = Math.sqrt(sumSquares / this.analyserTimeData.length);
      this.outputRms += (rms - this.outputRms) * 0.12;
      this.outputPeak = Math.max(peak, this.outputPeak * 0.94);
    }
    const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
    const bandEnergy = (fromHz: number, toHz: number) => {
      const from = Math.max(1, Math.floor(fromHz / hzPerBin));
      const to = Math.min(this.analyserData!.length, Math.ceil(toHz / hzPerBin));
      let total = 0;
      let peak = 0;
      for (let index = from; index < to; index += 1) {
        const value = this.analyserData![index];
        total += value;
        peak = Math.max(peak, value);
      }
      return {
        average: total / Math.max(1, to - from) / 255,
        peak: peak / 255,
      };
    };
    const low = bandEnergy(40, 190);
    const middle = bandEnergy(210, 1800);
    const high = bandEnergy(2100, 7600);
    const bassNow = low.average * 0.72 + low.peak * 0.28;
    const midNow = middle.average * 0.48 + middle.peak * 0.52;
    const trebleNow = high.average * 0.3 + high.peak * 0.7;
    this.bands.bass += (bassNow - this.bands.bass) * 0.075;
    this.bands.mid += (midNow - this.bands.mid) * 0.085;
    this.bands.treble += (trebleNow - this.bands.treble) * 0.1;
    this.bands.interaction +=
      (this.interactionEnergy - this.bands.interaction) * 0.12;
    return this.bands;
  }

  getDiagnostics(): NagiDiagnostics {
    const snapshot = this.getSnapshot();
    return {
      activeSources: this.trackedSources.size,
      bass: this.bands.bass,
      chordDegree: this.chordDegree,
      contextState: this.context?.state ?? 'uninitialized',
      currentSeed: snapshot.currentSeed,
      harmonicScene: sceneName(this.harmonicScene),
      incomingSeed: snapshot.incomingSeed,
      interaction: this.bands.interaction,
      maxSchedulerJitterMs: Math.round(this.maxSchedulerJitterMs),
      mid: this.bands.mid,
      outputPeak: this.outputPeak,
      outputRms: this.outputRms,
      scheduledEvents: this.scheduledEvents,
      transition: snapshot.transition,
      treble: this.bands.treble,
    };
  }

  async destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const source of this.trackedSources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // It may already have stopped between iteration and cleanup.
      }
      source.disconnect();
    }
    this.trackedSources.clear();
    this.playing = false;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }

  private tick() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.playing) return;
    const wall = performance.now();
    if (this.lastTickWall > 0) {
      this.maxSchedulerJitterMs = Math.max(
        this.maxSchedulerJitterMs,
        Math.abs(wall - this.lastTickWall - 180),
      );
    }
    this.lastTickWall = wall;

    const now = context.currentTime;
    const horizon = now + 2.8;
    this.updateSeed(now);
    const profile = this.getSnapshot().profile;
    this.updateMix(profile, now);

    while (this.nextHarmonyAt < horizon) this.scheduleHarmony(this.nextHarmonyAt, false);
    while (this.nextFxAt < horizon) {
      if (this.trackedSources.size < 40) this.scheduleAtmosphere(this.nextFxAt, profile);
      this.nextFxAt += this.random.between(8, 19) * (1.18 - profile.density * 0.32);
    }

    this.interactionEnergy *= this.interactionPressed ? 0.965 : 0.91;
    if (this.interactionEnergy < 0.001) this.interactionEnergy = 0;
    if (now - this.lastSnapshotAt > 0.75) {
      this.lastSnapshotAt = now;
      this.options.onSnapshot?.(this.getSnapshot());
    }
  }

  private updateSeed(now: number) {
    if (this.incomingSeed === null && now >= this.nextSeedAt) {
      this.incomingSeed = nextSeed(this.currentSeed);
      this.incomingProfile = profileFromSeed(this.incomingSeed);
      this.transitionStartedAt = now;
      this.transitionDuration = this.options.debugFast
        ? 10
        : 190 + this.incomingProfile.space * 155;
      this.options.onSnapshot?.(this.getSnapshot());
      return;
    }
    if (
      this.incomingSeed !== null &&
      now >= this.transitionStartedAt + this.transitionDuration
    ) {
      this.currentSeed = this.incomingSeed;
      this.currentProfile = this.incomingProfile!;
      this.incomingSeed = null;
      this.incomingProfile = null;
      this.random = new SeededRandom(
        seedToNumber(this.currentSeed) ^ this.scheduledEvents ^ 0x51f2e9ad,
      );
      this.nextSeedAt = now + this.dwellSeconds(this.currentProfile);
      this.options.onSnapshot?.(this.getSnapshot());
    }
  }

  private getTransition(now: number) {
    if (this.incomingSeed === null || this.transitionDuration <= 0) return 0;
    return smoothstep((now - this.transitionStartedAt) / this.transitionDuration);
  }

  private dwellSeconds(profile: WeatherProfile) {
    if (this.options.debugFast) return 11 + profile.motion * 5;
    return 430 + profile.motion * 330;
  }

  private updateMix(profile: WeatherProfile, now: number) {
    if (!this.filter || !this.wet || !this.globalPanner) return;
    const pointerBrightness = (1 - this.interactionY) * 2300;
    const cutoff = 4100 + profile.brightness * 4800 + pointerBrightness + this.interactionEnergy * 1600;
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.7);
    this.wet.gain.setTargetAtTime(
      0.24 + profile.space * 0.3 + this.interactionY * 0.06,
      now,
      1.8,
    );
    this.globalPanner.pan.setTargetAtTime((this.interactionX - 0.5) * 0.24, now, 0.32);
  }

  private scheduleHarmony(start: number, opening: boolean) {
    const context = this.context;
    if (!context || !this.sourceBus || !this.effectsBus) return;

    if (!opening) {
      if (this.chordsUntilSceneChange <= 0) {
        const nextScene = chooseNeighborScene(this.harmonicScene, this.random);
        this.chordDegree = findPivotDegree(this.harmonicScene, this.chordDegree, nextScene);
        this.harmonicScene = nextScene;
        this.chordsUntilSceneChange = 7 + Math.floor(this.random.next() * 8);
      } else {
        this.chordDegree = chooseNextDegree(this.chordDegree, this.harmonicScene, this.random);
      }
    }

    const beat = 60 / this.harmonicScene.tempo;
    const beats = this.random.pick([6, 8, 8, 10] as const);
    const duration = beat * beats * this.random.between(0.97, 1.04);
    const profile = this.getSnapshot().profile;
    const color = clamp(
      this.harmonicScene.chordColor * 0.72 + profile.harmonicHue * 0.28,
    );
    const sceneForChord = { ...this.harmonicScene, chordColor: color };
    this.currentVoicing = voiceLeadChord(
      sceneForChord,
      this.chordDegree,
      this.currentVoicing,
    );

    this.currentVoicing.forEach((midi, index) => {
      this.schedulePadVoice(start, duration, midi, index, opening, profile);
    });
    this.scheduleBass(start, duration, chordRootMidi(sceneForChord, this.chordDegree), opening, profile);
    this.scheduleMotif(start, duration, sceneForChord, profile, opening);
    this.nextHarmonyAt = start + duration;
    this.chordsUntilSceneChange -= 1;
  }

  private schedulePadVoice(
    start: number,
    duration: number,
    midi: number,
    index: number,
    opening: boolean,
    profile: WeatherProfile,
  ) {
    if (!this.context || !this.sourceBus || !this.padWave) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(this.padWave);
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
    oscillator.detune.setValueAtTime(this.random.between(-3.8, 3.8), start);
    oscillator.detune.linearRampToValueAtTime(this.random.between(-4.5, 4.5), start + duration);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1050 + profile.brightness * 3100 + index * 145;
    filter.Q.value = 0.32 + profile.warmth * 0.32;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const spread = [-0.78, 0.5, -0.22, 0.76, 0.16][index] ?? 0;
    panner.pan.value = spread * profile.spread;

    const attack = opening ? 0.16 + index * 0.035 : Math.min(2.2, duration * 0.24);
    const release = Math.min(3.4, duration * 0.42);
    const end = start + duration + release;
    const peak = (opening ? 0.021 : 0.0165) * (0.8 + profile.density * 0.38);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + attack);
    envelope.gain.setValueAtTime(peak, start + duration);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sourceBus);
    oscillator.start(start);
    oscillator.stop(end + 0.08);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private scheduleBass(
    start: number,
    duration: number,
    midi: number,
    opening: boolean,
    profile: WeatherProfile,
  ) {
    if (!this.context || !this.sourceBus) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 310 + profile.warmth * 280;
    const envelope = context.createGain();
    const end = start + duration + 2.4;
    const peak = 0.026 + profile.warmth * 0.011;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + (opening ? 0.2 : 0.7));
    envelope.gain.setValueAtTime(peak * 0.82, start + duration * 0.72);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.sourceBus);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
    this.trackSource(oscillator, [filter, envelope]);
    this.scheduledEvents += 1;
  }

  private scheduleMotif(
    start: number,
    duration: number,
    scene: HarmonicScene,
    profile: WeatherProfile,
    opening: boolean,
  ) {
    if (!this.context || !this.effectsBus || !this.bellWave) return;
    const count = Math.max(
      opening ? 4 : 2,
      Math.round(2 + scene.motifRate * 4 + this.interactionEnergy * 1.4),
    );
    const segment = duration / (count + 0.55);
    for (let index = 0; index < count; index += 1) {
      if (this.trackedSources.size >= 40) break;
      const offset = segment * (index + 0.48) + this.random.between(-0.11, 0.16) * segment;
      const noteStart = start + Math.max(opening && index === 0 ? 0.42 : 0.12, offset);
      const midi = pickMelodyMidi(scene, this.chordDegree, this.lastMelodyMidi, this.random);
      this.lastMelodyMidi = midi;
      this.scheduleMotifNote(noteStart, midi, profile, index, count);
    }
  }

  private scheduleMotifNote(
    start: number,
    midi: number,
    profile: WeatherProfile,
    index: number,
    count: number,
  ) {
    if (!this.context || !this.effectsBus || !this.bellWave) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(this.bellWave);
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
    oscillator.detune.value = this.random.between(-2.4, 2.4);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800 + profile.brightness * 4100;
    filter.Q.value = 0.5;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = ((index / Math.max(1, count - 1)) * 2 - 1) * profile.spread * 0.72;
    const duration = this.random.between(2.2, 4.8) * (0.82 + profile.space * 0.28);
    const peak = this.random.between(0.012, 0.022) * (0.82 + profile.sparkle * 0.25);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.effectsBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private scheduleInteractionRipple(start: number, energy: number) {
    if (!this.context || !this.effectsBus || !this.airWave) return;
    const context = this.context;
    const voicing = this.currentVoicing.length > 0 ? this.currentVoicing : [60, 64, 67, 72];
    const index = Math.min(voicing.length - 1, Math.floor(this.interactionX * voicing.length));
    const midi = voicing[index] + (this.interactionY < 0.42 ? 12 : 0);
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(this.airWave);
    const frequency = midiToFrequency(midi);
    oscillator.frequency.setValueAtTime(frequency * (0.985 + energy * 0.025), start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.28);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + (1 - this.interactionY) * 3600;
    filter.Q.value = 0.72;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = (this.interactionX - 0.5) * 1.6;
    const duration = 0.85 + energy * 1.45;
    const peak = 0.004 + energy * 0.012;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.effectsBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private scheduleAtmosphere(start: number, profile: WeatherProfile) {
    if (!this.context || !this.effectsBus || !this.noiseBuffer) return;
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = this.random.between(0.55, 1.08);
    const filter = context.createBiquadFilter();
    filter.type = this.random.next() < 0.58 ? 'bandpass' : 'highpass';
    filter.frequency.value = this.random.between(1200, 5100) * (0.72 + profile.brightness * 0.38);
    filter.Q.value = this.random.between(0.42, 1.4);
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = this.random.between(-profile.spread, profile.spread);
    const duration = this.random.between(1.5, 4.1);
    const peak = this.random.between(0.0014, 0.0038) * (0.72 + profile.sparkle * 0.4);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + duration * 0.36);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.effectsBus);
    source.start(start, this.random.between(0, 0.35), duration);
    source.stop(start + duration + 0.05);
    this.trackSource(source, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private trackSource(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.trackedSources.add(source);
    source.onended = () => {
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      this.trackedSources.delete(source);
    };
  }

  private createNoise(context: AudioContext, seconds: number) {
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    const random = new SeededRandom(seedToNumber(this.currentSeed) ^ 0x87c4ad21);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      smoothed = smoothed * 0.68 + (random.next() * 2 - 1) * 0.32;
      channel[index] = smoothed;
    }
    return buffer;
  }

  private createImpulse(context: AudioContext, seconds: number) {
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const random = new SeededRandom(seedToNumber(this.currentSeed) ^ 0xe31a9f02);
    for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      let smoothed = 0;
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        smoothed = smoothed * 0.22 + (random.next() * 2 - 1) * 0.78;
        channel[index] = smoothed * (1 - progress) ** 3.05;
      }
    }
    return buffer;
  }
}
