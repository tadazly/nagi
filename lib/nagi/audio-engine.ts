import {
  METERS,
  SeededRandom,
  chordRootMidi,
  chooseChordSpanBars,
  chooseNeighborScene,
  chooseNextDegree,
  clamp,
  degreeTension,
  findPivotDegree,
  interpolateProfile,
  isChordTone,
  midiToFrequency,
  nextSeed,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  smoothstep,
  tempoFromArousal,
  voiceLeadChord,
  type HarmonicScene,
  type SeedSnapshot,
  type WeatherProfile,
} from './generative';
import {
  createMotif,
  motifPitchClass,
  planMotifPhrase,
  type MotifDNA,
} from './composition';

type EngineOptions = {
  debugFast?: boolean;
  onSnapshot?: (snapshot: SeedSnapshot) => void;
};

export type AudioBands = {
  arousal: number;
  bass: number;
  interaction: number;
  mid: number;
  phrase: number;
  pulse: number;
  tension: number;
  treble: number;
  valence: number;
};

export type NagiDiagnostics = {
  activeSources: number;
  arousal: number;
  bar: number;
  bass: number;
  beat: number;
  bpm: number;
  chordDegree: number;
  contextState: AudioContextState | 'uninitialized';
  counterNoteEvents: number;
  currentSeed: string;
  harmonicScene: string;
  incomingSeed: string | null;
  interaction: number;
  leadMotifCycle: number;
  leadMotifMutations: number;
  leadNoteEvents: number;
  maxHumanizeMs: number;
  maxSchedulerJitterMs: number;
  meter: string;
  mid: number;
  outputPeak: number;
  outputRms: number;
  scheduledEvents: number;
  schedulerRecoveries: number;
  transition: number;
  treble: number;
  valence: number;
};

type TransportSegment = {
  chordDegree: number;
  end: number;
  meterIndex: number;
  phraseBar: number;
  phraseBars: number;
  sceneName: string;
  start: number;
  startBar: number;
  tension: number;
  tempo: number;
};

type TransportState = {
  bar: number;
  beat: number;
  beatPhase: number;
  bpm: number;
  chordDegree: number;
  meter: string;
  phrase: number;
  pulse: number;
  sceneName: string;
  tension: number;
};

const PAD_PARTIALS = new Float32Array([0, 1, 0.22, 0.085, 0.032, 0.014, 0.006]);
const BELL_PARTIALS = new Float32Array([0, 1, 0.3, 0.12, 0.052, 0.022, 0.009]);
const AIR_PARTIALS = new Float32Array([0, 1, 0.19, 0.075, 0.032, 0.013]);
const SCHEDULER_INTERVAL_MS = 120;
const SCHEDULE_HORIZON_SECONDS = 3.2;

export class NagiAudioEngine {
  private readonly options: EngineOptions;
  private readonly trackedSources = new Set<AudioScheduledSourceNode>();
  private airWave?: PeriodicWave;
  private analyser?: AnalyserNode;
  private analyserData?: Uint8Array<ArrayBuffer>;
  private analyserTimeData?: Float32Array<ArrayBuffer>;
  private bands: AudioBands = {
    arousal: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    interaction: 0,
    phrase: 0,
    pulse: 0,
    tension: 0,
    valence: 0,
  };
  private bellWave?: PeriodicWave;
  private chordDegree = 0;
  private chordsUntilSceneChange = 0;
  private compressor?: DynamicsCompressorNode;
  private context?: AudioContext;
  private currentProfile: WeatherProfile;
  private currentSeed: string;
  private currentVoicing: number[] = [];
  private currentArousal: number;
  private currentValence: number;
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
  private lastCounterMidi = 62;
  private lastEmotionAt = 0;
  private lastMelodyMidi = 69;
  private lastSnapshotAt = -Infinity;
  private lastTickWall = 0;
  private master?: GainNode;
  private maxHumanizeMs = 0;
  private maxSchedulerJitterMs = 0;
  private leadNoteEvents = 0;
  private counterNoteEvents = 0;
  private muted = false;
  private nextFxAt = 0;
  private nextHarmonyAt = 0;
  private nextSeedAt = 0;
  private noiseBuffer?: AudioBuffer;
  private padWave?: PeriodicWave;
  private phraseBar = 0;
  private playing = false;
  private random: SeededRandom;
  private scheduledBars = 0;
  private scheduledEvents = 0;
  private schedulerRecoveries = 0;
  private outputPeak = 0;
  private outputRms = 0;
  private sourceBus?: GainNode;
  private targetArousal: number;
  private targetValence: number;
  private timer?: ReturnType<typeof setInterval>;
  private transitionDuration = 0;
  private transitionStartedAt = 0;
  private transportTimeline: TransportSegment[] = [];
  private transportTempo: number;
  private leadNeedsResolution = false;
  private counterNeedsResolution = false;
  private leadMotif: MotifDNA;
  private counterMotif: MotifDNA;
  private volume = 0.72;
  private wet?: GainNode;

  constructor(seed: string, options: EngineOptions = {}) {
    this.currentSeed = seed;
    this.currentProfile = profileFromSeed(seed);
    this.harmonicScene = sceneFromSeed(seed);
    this.random = new SeededRandom(seedToNumber(seed) ^ 0x51f2e9ad);
    this.currentArousal = this.harmonicScene.arousal;
    this.currentValence = this.harmonicScene.valence;
    this.targetArousal = this.currentArousal;
    this.targetValence = this.currentValence;
    this.transportTempo = this.harmonicScene.tempo;
    this.leadMotif = createMotif(this.random, this.currentArousal, 'lead');
    this.counterMotif = createMotif(
      this.random,
      this.currentArousal,
      'counter',
      this.leadMotif,
    );
    this.chordsUntilSceneChange = options.debugFast
      ? 2
      : 7 + Math.floor(this.random.next() * 7);
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
    this.nextHarmonyAt = now + 0.025;
    this.scheduleHarmony(this.nextHarmonyAt, true);
    this.nextFxAt = now + 2.1;
    this.nextSeedAt = now + this.dwellSeconds(this.currentProfile);
    this.lastTickWall = 0;
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
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
    const transport = this.getTransportState(this.context.currentTime);
    this.bands.pulse += (transport.pulse - this.bands.pulse) * 0.28;
    this.bands.phrase += (transport.phrase - this.bands.phrase) * 0.045;
    this.bands.tension += (transport.tension - this.bands.tension) * 0.035;
    this.bands.arousal += (this.currentArousal - this.bands.arousal) * 0.08;
    this.bands.valence += (this.currentValence - this.bands.valence) * 0.08;
    return this.bands;
  }

  getDiagnostics(): NagiDiagnostics {
    const snapshot = this.getSnapshot();
    const transport = this.getTransportState(this.context?.currentTime ?? 0);
    return {
      activeSources: this.trackedSources.size,
      arousal: this.currentArousal,
      bar: transport.bar,
      bass: this.bands.bass,
      beat: transport.beat + transport.beatPhase,
      bpm: transport.bpm,
      chordDegree: transport.chordDegree,
      contextState: this.context?.state ?? 'uninitialized',
      counterNoteEvents: this.counterNoteEvents,
      currentSeed: snapshot.currentSeed,
      harmonicScene: transport.sceneName,
      incomingSeed: snapshot.incomingSeed,
      interaction: this.bands.interaction,
      leadMotifCycle: this.leadMotif.cycle,
      leadMotifMutations: this.leadMotif.mutations,
      leadNoteEvents: this.leadNoteEvents,
      maxHumanizeMs: Math.round(this.maxHumanizeMs * 10) / 10,
      maxSchedulerJitterMs: Math.round(this.maxSchedulerJitterMs),
      meter: transport.meter,
      mid: this.bands.mid,
      outputPeak: this.outputPeak,
      outputRms: this.outputRms,
      scheduledEvents: this.scheduledEvents,
      schedulerRecoveries: this.schedulerRecoveries,
      transition: snapshot.transition,
      treble: this.bands.treble,
      valence: this.currentValence,
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
    this.transportTimeline = [];
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
        Math.abs(wall - this.lastTickWall - SCHEDULER_INTERVAL_MS),
      );
    }
    this.lastTickWall = wall;

    const now = context.currentTime;
    const horizon = now + SCHEDULE_HORIZON_SECONDS;
    this.updateSeed(now);
    this.updateEmotion(now);
    const profile = this.getSnapshot().profile;
    this.updateMix(profile, now);

    if (this.nextHarmonyAt < now - 0.08) {
      this.schedulerRecoveries += 1;
      this.nextHarmonyAt = now + 0.045;
      this.transportTimeline = this.transportTimeline.filter((segment) => segment.end > now);
    }
    while (this.nextHarmonyAt < horizon) this.scheduleHarmony(this.nextHarmonyAt, false);
    while (this.nextFxAt < horizon) {
      const effectTime = this.snapToSubdivision(this.nextFxAt);
      if (this.trackedSources.size < 40) this.scheduleAtmosphere(effectTime, profile);
      this.nextFxAt += this.random.between(8, 19) * (1.18 - profile.density * 0.32);
    }

    this.transportTimeline = this.transportTimeline.filter(
      (segment, index, segments) => segment.end > now - 4 || index === segments.length - 1,
    );

    this.interactionEnergy *= this.interactionPressed ? 0.965 : 0.91;
    if (this.interactionEnergy < 0.001) this.interactionEnergy = 0;
    if (now - this.lastSnapshotAt > 0.75) {
      this.lastSnapshotAt = now;
      this.options.onSnapshot?.(this.getSnapshot());
    }
  }

  private getTransportSegment(at: number) {
    let active = this.transportTimeline[0];
    for (const segment of this.transportTimeline) {
      if (segment.start <= at) active = segment;
      else break;
    }
    return active;
  }

  private updateEmotion(now: number) {
    if (this.lastEmotionAt === 0) {
      this.lastEmotionAt = now;
      return;
    }
    const elapsed = Math.max(0, now - this.lastEmotionAt);
    this.lastEmotionAt = now;
    const timeConstant = this.options.debugFast ? 4.5 : 42;
    const amount = 1 - Math.exp(-elapsed / timeConstant);
    this.currentArousal += (this.targetArousal - this.currentArousal) * amount;
    this.currentValence += (this.targetValence - this.currentValence) * amount;
  }

  private getTransportState(at: number): TransportState {
    const segment = this.getTransportSegment(at);
    if (!segment) {
      const meter = METERS[this.harmonicScene.meterIndex];
      return {
        bar: 0,
        beat: 0,
        beatPhase: 0,
        bpm: this.transportTempo,
        chordDegree: this.chordDegree,
        meter: meter.label,
        phrase: 0,
        pulse: 0,
        sceneName: sceneName(this.harmonicScene),
        tension: degreeTension(this.chordDegree),
      };
    }
    const meter = METERS[segment.meterIndex];
    const beatSeconds = 60 / segment.tempo;
    const elapsedBeats = Math.max(0, (at - segment.start) / beatSeconds);
    const elapsedBars = Math.floor(elapsedBeats / meter.beatsPerBar);
    const beatInBar = elapsedBeats - elapsedBars * meter.beatsPerBar;
    const beat = Math.floor(beatInBar);
    const beatPhase = beatInBar - beat;
    const accent = meter.accents[beat] ?? 0.4;
    const pulse = Math.exp(-beatPhase * 5.4) * (0.26 + accent * 0.74);
    const phraseBars = Math.max(1, segment.phraseBars);
    const phrase =
      ((segment.phraseBar + elapsedBeats / meter.beatsPerBar) % phraseBars) /
      phraseBars;
    return {
      bar: segment.startBar + elapsedBars,
      beat,
      beatPhase,
      bpm: segment.tempo,
      chordDegree: segment.chordDegree,
      meter: meter.label,
      phrase,
      pulse,
      sceneName: segment.sceneName,
      tension: segment.tension,
    };
  }

  private snapToSubdivision(at: number) {
    const segment = this.getTransportSegment(at);
    if (!segment) return at;
    const meter = METERS[segment.meterIndex];
    const stepSeconds = 60 / segment.tempo / meter.subdivisionsPerBeat;
    const step = Math.max(0, Math.round((at - segment.start) / stepSeconds));
    return Math.min(segment.end - 0.001, segment.start + step * stepSeconds);
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
    const emotionalBrightness = this.currentValence * 1300 + this.currentArousal * 900;
    const cutoff =
      3300 +
      profile.brightness * 4100 +
      emotionalBrightness +
      pointerBrightness +
      this.interactionEnergy * 1600;
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.7);
    this.wet.gain.setTargetAtTime(
      0.2 +
        profile.space * 0.28 +
        (1 - this.currentArousal) * 0.08 +
        this.interactionY * 0.06,
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
        this.targetArousal = nextScene.arousal;
        this.targetValence = nextScene.valence;
        this.phraseBar = 0;
        this.chordsUntilSceneChange = this.options.debugFast
          ? 2 + Math.floor(this.random.next() * 2)
          : 7 + Math.floor(this.random.next() * 8);
      } else {
        this.chordDegree = chooseNextDegree(
          this.chordDegree,
          this.harmonicScene,
          this.random,
          this.phraseBar / Math.max(1, this.harmonicScene.phraseBars),
        );
      }
    }

    const profile = this.getSnapshot().profile;
    const targetTempo = tempoFromArousal(this.currentArousal, this.currentValence);
    this.transportTempo = opening
      ? targetTempo
      : this.transportTempo + clamp(targetTempo - this.transportTempo, -2.6, 2.6);
    const color = clamp(
      this.harmonicScene.chordColor * 0.55 +
        profile.harmonicHue * 0.2 +
        this.currentValence * 0.25,
    );
    const sceneForChord = {
      ...this.harmonicScene,
      arousal: this.currentArousal,
      chordColor: color,
      motifRate: clamp(0.26 + this.currentArousal * 0.66, 0.24, 0.92),
      tempo: this.transportTempo,
      valence: this.currentValence,
    };
    const meter = METERS[sceneForChord.meterIndex];
    const beatSeconds = 60 / sceneForChord.tempo;
    const spanBars = chooseChordSpanBars(sceneForChord, this.random);
    const barSeconds = beatSeconds * meter.beatsPerBar;
    const duration = barSeconds * spanBars;
    this.currentVoicing = voiceLeadChord(
      sceneForChord,
      this.chordDegree,
      this.currentVoicing,
    );

    this.transportTimeline.push({
      chordDegree: this.chordDegree,
      end: start + duration,
      meterIndex: sceneForChord.meterIndex,
      phraseBar: this.phraseBar,
      phraseBars: sceneForChord.phraseBars,
      sceneName: sceneName(sceneForChord),
      start,
      startBar: this.scheduledBars,
      tension: degreeTension(this.chordDegree),
      tempo: sceneForChord.tempo,
    });

    this.currentVoicing.forEach((midi, index) => {
      this.schedulePadVoice(start, duration, midi, index, opening, profile);
    });
    const bassMidi = chordRootMidi(sceneForChord, this.chordDegree);
    for (let bar = 0; bar < spanBars; bar += 1) {
      this.scheduleBass(
        start + bar * barSeconds,
        barSeconds * 0.9,
        bassMidi,
        opening && bar === 0,
        profile,
        bar === 0 ? 1 : 0.78,
      );
    }
    this.scheduleMelodicVoices(
      start,
      beatSeconds,
      spanBars,
      sceneForChord,
      profile,
      opening,
    );
    this.nextHarmonyAt = start + duration;
    this.scheduledBars += spanBars;
    this.phraseBar = (this.phraseBar + spanBars) % sceneForChord.phraseBars;
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
    filter.frequency.value =
      900 + profile.brightness * 2500 + this.currentArousal * 620 + index * 125;
    filter.Q.value = 0.32 + profile.warmth * 0.32;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const spread = [-0.78, 0.5, -0.22, 0.76, 0.16][index] ?? 0;
    panner.pan.value = spread * profile.spread;

    const attack = opening
      ? 0.16 + index * 0.035
      : Math.min(2.4, duration * (0.28 - this.currentArousal * 0.1));
    const release = Math.min(3.4, duration * 0.42);
    const end = start + duration + release;
    const peak = (opening ? 0.0185 : 0.0138) * (0.82 + profile.density * 0.34);
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
    accent = 1,
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
    const peak = (0.024 + profile.warmth * 0.011) * accent;
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

  private scheduleMelodicVoices(
    start: number,
    beatSeconds: number,
    spanBars: number,
    scene: HarmonicScene,
    profile: WeatherProfile,
    opening: boolean,
  ) {
    if (!this.context || !this.effectsBus || !this.bellWave || !this.airWave) return;
    const meter = METERS[scene.meterIndex];
    const leadEvents = planMotifPhrase(
      scene,
      spanBars,
      this.random,
      'lead',
      this.leadMotif,
      this.phraseBar,
    );
    const firstGridBeat = 1 / meter.subdivisionsPerBeat;
    if (opening && !leadEvents.some((event) => event.beat <= firstGridBeat)) {
      leadEvents.unshift({
        accent: 0.72,
        beat: firstGridBeat,
        cycle: this.leadMotif.cycle,
        durationBeats: 0.8,
        humanizeBeats: 0,
        metricStrength: 0.28,
        motifDegree: this.leadMotif.anchorDegree,
        motifIndex: 0,
      });
    }
    const counterEvents =
      profile.density > 0.43 &&
      (opening || this.random.next() < 0.35 + this.currentArousal * 0.36)
        ? planMotifPhrase(
            scene,
            spanBars,
            this.random,
            'counter',
            this.counterMotif,
            this.phraseBar,
          )
        : [];

    const scheduleVoice = (role: 'lead' | 'counter') => {
      const events = role === 'lead' ? leadEvents : counterEvents;
      for (let index = 0; index < events.length; index += 1) {
        if (this.trackedSources.size >= 40) break;
        const event = events[index];
        const phraseProgress =
          ((this.phraseBar + event.beat / meter.beatsPerBar) % scene.phraseBars) /
          scene.phraseBars;
        const contour = Math.sin(phraseProgress * Math.PI * 2 + scene.tension * Math.PI);
        const direction: -1 | 0 | 1 = contour > 0.16 ? 1 : contour < -0.16 ? -1 : 0;
        const previous = role === 'lead' ? this.lastMelodyMidi : this.lastCounterMidi;
        const mustResolve = role === 'lead'
          ? this.leadNeedsResolution
          : this.counterNeedsResolution;
        const targetMidi =
          (role === 'lead' ? 70 : 62) + contour * (role === 'lead' ? 4.2 : 3.1);
        const targetPitchClass = motifPitchClass(scene, event.motifDegree);
        const backgroundNotes = [
          ...this.currentVoicing,
          chordRootMidi(scene, this.chordDegree),
        ];
        const midi = pickMelodyMidi(scene, this.chordDegree, previous, this.random, {
          backgroundNotes,
          direction,
          metricStrength: event.metricStrength,
          mustResolve,
          otherVoiceMidi: role === 'counter' ? this.lastMelodyMidi : this.lastCounterMidi,
          registerHigh: role === 'lead' ? 84 : 74,
          registerLow: role === 'lead' ? 60 : 52,
          targetMidi,
          targetPitchClass,
        });
        if (role === 'lead') {
          this.leadNoteEvents += 1;
          this.lastMelodyMidi = midi;
          this.leadNeedsResolution = !isChordTone(scene, this.chordDegree, midi);
        } else {
          this.counterNoteEvents += 1;
          this.lastCounterMidi = midi;
          this.counterNeedsResolution = !isChordTone(scene, this.chordDegree, midi);
        }
        const humanizeSeconds = event.humanizeBeats * beatSeconds;
        this.maxHumanizeMs = Math.max(this.maxHumanizeMs, Math.abs(humanizeSeconds) * 1000);
        const noteStart = Math.max(
          start + 0.035,
          start + event.beat * beatSeconds + humanizeSeconds,
        );
        this.scheduleMotifNote(
          noteStart,
          midi,
          profile,
          index,
          events.length,
          role,
          event.accent,
          event.durationBeats * beatSeconds,
        );
      }
    };

    scheduleVoice('lead');
    scheduleVoice('counter');
  }

  private scheduleMotifNote(
    start: number,
    midi: number,
    profile: WeatherProfile,
    index: number,
    count: number,
    role: 'lead' | 'counter',
    accent: number,
    rhythmicDuration: number,
  ) {
    if (!this.context || !this.effectsBus || !this.bellWave || !this.airWave) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(role === 'lead' ? this.bellWave : this.airWave);
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
    oscillator.detune.value = this.random.between(-2.1, 2.1);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      (role === 'lead' ? 1800 : 1250) + profile.brightness * (role === 'lead' ? 4100 : 2900);
    filter.Q.value = role === 'lead' ? 0.5 : 0.38;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const spatialAnchor = role === 'lead' ? 0.2 : -0.24;
    const spatialDrift = Math.sin((index / Math.max(1, count)) * Math.PI * 2) * 0.11;
    panner.pan.value = (spatialAnchor + spatialDrift) * profile.spread;
    const tail = this.random.between(
      role === 'lead' ? 1.45 : 2.4,
      role === 'lead' ? 3.4 : 4.7,
    );
    const duration = Math.max(rhythmicDuration, tail) * (0.84 + profile.space * 0.24);
    const peakBase = role === 'lead'
      ? this.random.between(0.021, 0.033)
      : this.random.between(0.007, 0.014);
    const peak = peakBase * accent * (0.84 + profile.sparkle * 0.22);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + (role === 'lead' ? 0.022 : 0.055));
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
