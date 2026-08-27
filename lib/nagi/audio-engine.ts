import {
  METERS,
  SeededRandom,
  chordRootMidi,
  chooseChordSpanBars,
  chooseHarmonyVoiceCount,
  chooseNeighborScene,
  clamp,
  degreeTension,
  deriveSeedNumber,
  emotionalFormFromSeed,
  emotionalFormEmotionAt,
  emotionalFormStageAt,
  findPivotDegree,
  initialEmotionFromSeed,
  interpolateProfile,
  isChordTone,
  metricStrengthAt,
  midiToFrequency,
  nextSeed,
  phraseHarmonicGoalForFormStage,
  phraseHarmonyEventAtBar,
  planBassLine,
  planPhraseHarmony,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  shapeSceneWithEmotionalForm,
  smoothstep,
  smootherstep,
  tempoFromArousal,
  voiceLeadChord,
  type HarmonicScene,
  type BassLinePlan,
  type EmotionalFormPlan,
  type PhraseHarmonicPlan,
  type SeedSnapshot,
  type WeatherProfile,
} from './generative';
import {
  createMotifPair,
  motifPitchClass,
  planMotifCounterpoint,
  type MotifDNA,
} from './composition';
import {
  articulationName,
  chooseOrchestration,
  choosePerformancePlan,
  interpolatePerformancePlan,
  interpolateTimbre,
  planNoteGesture,
  type InstrumentId,
  type NoteGesturePlan,
  type OrchestrationPlan,
  type PerformancePlan,
  type TimbreRecipe,
  type VoiceExpression,
} from './performance';

type EngineOptions = {
  debugFast?: boolean;
  onSnapshot?: (snapshot: SeedSnapshot) => void;
};

export type AudioBands = {
  arousal: number;
  barPhase: number;
  bass: number;
  beatPhase: number;
  interaction: number;
  mid: number;
  phrase: number;
  pulse: number;
  tension: number;
  treble: number;
  valence: number;
};

export type NagiDiagnostics = {
  accompanimentPulseEvents: number;
  accompanimentInstrument: string;
  activeSources: number;
  arousal: number;
  bar: number;
  barPhase: number;
  bass: number;
  bassInstrument: string;
  beat: number;
  beatPhase: number;
  bpm: number;
  chordDegree: number;
  contextState: AudioContextState | 'uninitialized';
  counterNoteEvents: number;
  counterArticulation: string;
  counterInstrument: string;
  currentSeed: string;
  harmonicScene: string;
  harmonyInstrument: string;
  harmonyLevel: number;
  harmonicVoiceCount: number;
  incomingSeed: string | null;
  interaction: number;
  leadMotifCycle: number;
  leadMotifMutations: number;
  leadNoteEvents: number;
  leadArticulation: string;
  leadInstrument: string;
  melodyLevel: number;
  leadTheme: string;
  limiterReduction: number;
  musicalFormStage: string;
  maxHumanizeMs: number;
  maxSampleDelta: number;
  maxSchedulerJitterMs: number;
  meter: string;
  mid: number;
  outputPeak: number;
  outputRms: number;
  orchestrationTransition: number;
  pulse: number;
  scheduledEvents: number;
  schedulerRecoveries: number;
  transition: number;
  treble: number;
  valence: number;
  volume: number;
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
  accent: number;
  bar: number;
  barPhase: number;
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

const SCHEDULER_INTERVAL_MS = 120;
const SCHEDULE_HORIZON_SECONDS = 3.2;
export const DEFAULT_VOLUME = 0.72;
export const MAX_VOLUME = 0.86;

export class NagiAudioEngine {
  private readonly options: EngineOptions;
  private readonly trackedSources = new Set<AudioScheduledSourceNode>();
  private analyser?: AnalyserNode;
  private analyserData?: Uint8Array<ArrayBuffer>;
  private analyserTimeData?: Float32Array<ArrayBuffer>;
  private bands: AudioBands = {
    arousal: 0,
    barPhase: 0,
    bass: 0,
    beatPhase: 0,
    mid: 0,
    treble: 0,
    interaction: 0,
    phrase: 0,
    pulse: 0,
    tension: 0,
    valence: 0,
  };
  private accompanimentPulseEvents = 0;
  private bassContinuousGestureSeconds = 0;
  private chordDegree = 0;
  private bassLinePlan!: BassLinePlan;
  private chordsUntilSceneChange = 0;
  private compressor?: DynamicsCompressorNode;
  private context?: AudioContext;
  private currentProfile: WeatherProfile;
  private currentSeed: string;
  private currentVoicing: number[] = [];
  private currentArousal: number;
  private currentValence: number;
  private dry?: GainNode;
  private effectsBus?: GainNode;
  private emotionalForm: EmotionalFormPlan;
  private filter?: BiquadFilterNode;
  private fastSeedTransition = false;
  private formSceneIndex = 0;
  private globalPanner?: StereoPannerNode;
  private harmonicVoiceCount = 3;
  private harmonyBus?: GainNode;
  private harmonyLevel = 0.92;
  private harmonyContinuousGestureSeconds = 0;
  private harmonicScene: HarmonicScene;
  private incomingProfile: WeatherProfile | null = null;
  private incomingSeed: string | null = null;
  private interactionEnergy = 0;
  private interactionPressed = false;
  private interactionX = 0.5;
  private interactionY = 0.5;
  private lastInteractionSoundAt = -Infinity;
  private leadContinuousGestureSeconds = 0;
  private lastCounterMidi = 62;
  private lastBassMidi = 46;
  private lastEmotionAt = 0;
  private lastMelodyMidi = 69;
  private counterContinuousGestureSeconds = 0;
  private lastSnapshotAt = -Infinity;
  private lastTickWall = 0;
  private master?: GainNode;
  private melodyBus?: GainNode;
  private melodyLevel = 1.38;
  private maxHumanizeMs = 0;
  private maxSampleDelta = 0;
  private maxSchedulerJitterMs = 0;
  private leadNoteEvents = 0;
  private counterNoteEvents = 0;
  private muted = false;
  private nextFxAt = 0;
  private nextHarmonyAt = 0;
  private nextSeedAt = 0;
  private noiseBuffer?: AudioBuffer;
  private orchestrationFrom: OrchestrationPlan;
  private orchestrationMix = 1;
  private orchestrationTarget: OrchestrationPlan;
  private performanceFrom: PerformancePlan;
  private performanceMix = 1;
  private performanceTarget: PerformancePlan;
  private phraseHarmonyPlan!: PhraseHarmonicPlan;
  private phraseBar = 0;
  private playing = false;
  private atmosphereRandom!: SeededRandom;
  private harmonyRandom!: SeededRandom;
  private melodyRandom!: SeededRandom;
  private orchestrationRandom!: SeededRandom;
  private performanceRandom!: SeededRandom;
  private textureRandom!: SeededRandom;
  private queuedSeed: string | null = null;
  private scheduledBars = 0;
  private scheduledEvents = 0;
  private schedulerRecoveries = 0;
  private outputPeak = 0;
  private outputRms = 0;
  private limiter?: DynamicsCompressorNode;
  private pendingScene: HarmonicScene | null = null;
  private pendingForm: EmotionalFormPlan | null = null;
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
  private volume = DEFAULT_VOLUME;
  private wet?: GainNode;
  private readonly waveCache = new Map<string, PeriodicWave>();

  constructor(seed: string, options: EngineOptions = {}) {
    this.currentSeed = seed;
    this.currentProfile = profileFromSeed(seed);
    this.emotionalForm = emotionalFormFromSeed(seed);
    this.harmonicScene = shapeSceneWithEmotionalForm(
      sceneFromSeed(seed),
      this.emotionalForm,
      0,
    );
    this.resetRandomStreams(seed);
    this.currentArousal = this.harmonicScene.arousal;
    this.currentValence = this.harmonicScene.valence;
    this.targetArousal = this.currentArousal;
    this.targetValence = this.currentValence;
    this.transportTempo = this.harmonicScene.tempo;
    this.planFormalPhrase(this.harmonicScene);
    const motifPair = createMotifPair(this.melodyRandom, this.harmonicScene);
    this.leadMotif = motifPair.lead;
    this.counterMotif = motifPair.counter;
    const initialStage = emotionalFormStageAt(this.emotionalForm, 0);
    this.orchestrationFrom = chooseOrchestration(
      this.harmonicScene,
      initialStage,
      this.currentProfile,
      this.orchestrationRandom,
    );
    this.orchestrationTarget = this.orchestrationFrom;
    this.performanceFrom = choosePerformancePlan(
      this.harmonicScene,
      initialStage,
      this.performanceRandom,
    );
    this.performanceTarget = this.performanceFrom;
    this.chordsUntilSceneChange = options.debugFast
      ? 2
      : 7 + Math.floor(this.harmonyRandom.next() * 7);
    this.options = options;
  }

  private resetRandomStreams(seed: string) {
    const root = deriveSeedNumber(seed, 'engine');
    this.harmonyRandom = new SeededRandom(deriveSeedNumber(root, 'harmony'));
    this.melodyRandom = new SeededRandom(deriveSeedNumber(root, 'melody'));
    this.orchestrationRandom = new SeededRandom(deriveSeedNumber(root, 'orchestration'));
    this.performanceRandom = new SeededRandom(deriveSeedNumber(root, 'performance'));
    this.textureRandom = new SeededRandom(deriveSeedNumber(root, 'timbre-detail'));
    this.atmosphereRandom = new SeededRandom(deriveSeedNumber(root, 'atmosphere'));
    this.waveCache.clear();
  }

  private planFormalPhrase(scene: HarmonicScene) {
    const stage = emotionalFormStageAt(this.emotionalForm, this.formSceneIndex);
    this.phraseHarmonyPlan = planPhraseHarmony(scene, this.harmonyRandom, {
      goal: phraseHarmonicGoalForFormStage(stage),
      phraseBars: scene.phraseBars,
      startDegree: this.chordDegree,
    });
    this.bassLinePlan = planBassLine(scene, this.phraseHarmonyPlan, this.harmonyRandom, {
      pedalStrength: 0.58 + (1 - scene.arousal) * 0.46,
      previousBassMidi: this.lastBassMidi,
      stepwiseStrength: 0.76 + (1 - scene.tension) * 0.24,
    });
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
    this.harmonyBus = context.createGain();
    this.harmonyBus.gain.value = 0.92;
    this.melodyBus = context.createGain();
    this.melodyBus.gain.value = 1.38;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 5600;
    this.filter.Q.value = 0.2;

    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = 'highpass';
    rumbleFilter.frequency.value = 42;
    rumbleFilter.Q.value = 0.5;
    const warmthShelf = context.createBiquadFilter();
    warmthShelf.type = 'lowshelf';
    warmthShelf.frequency.value = 180;
    warmthShelf.gain.value = 1.2;
    const presenceDip = context.createBiquadFilter();
    presenceDip.type = 'peaking';
    presenceDip.frequency.value = 2850;
    presenceDip.Q.value = 0.72;
    presenceDip.gain.value = -2.4;

    this.dry = context.createGain();
    this.dry.gain.value = 0.88;
    const convolver = context.createConvolver();
    convolver.buffer = this.createImpulse(context, 4.6);
    this.wet = context.createGain();
    this.wet.gain.value = 0.22;

    const delayA = context.createDelay(2);
    const delayB = context.createDelay(2);
    delayA.delayTime.value = 0.37;
    delayB.delayTime.value = 0.61;
    const delayLevelA = context.createGain();
    const delayLevelB = context.createGain();
    delayLevelA.gain.value = 0.07;
    delayLevelB.gain.value = 0.05;
    const delayPanA = context.createStereoPanner();
    const delayPanB = context.createStereoPanner();
    delayPanA.pan.value = -0.62;
    delayPanB.pan.value = 0.66;

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 2;
    this.compressor.attack.value = 0.16;
    this.compressor.release.value = 1.4;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -5.5;
    this.limiter.knee.value = 1.5;
    this.limiter.ratio.value = 18;
    this.limiter.attack.value = 0.0025;
    this.limiter.release.value = 0.2;
    this.globalPanner = context.createStereoPanner();
    const makeup = context.createGain();
    makeup.gain.value = 1.78;

    this.master = context.createGain();
    this.master.gain.value = 0;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyserTimeData = new Float32Array(this.analyser.fftSize);

    this.harmonyBus.connect(this.sourceBus);
    this.melodyBus.connect(this.effectsBus);
    this.effectsBus.connect(this.sourceBus);
    this.effectsBus.connect(delayA);
    this.effectsBus.connect(delayB);
    delayA.connect(delayLevelA);
    delayB.connect(delayLevelB);
    delayLevelA.connect(delayPanA);
    delayLevelB.connect(delayPanB);
    delayPanA.connect(this.sourceBus);
    delayPanB.connect(this.sourceBus);
    this.sourceBus.connect(rumbleFilter);
    rumbleFilter.connect(warmthShelf);
    warmthShelf.connect(this.filter);
    this.filter.connect(presenceDip);
    presenceDip.connect(this.dry);
    this.dry.connect(this.compressor);
    presenceDip.connect(convolver);
    convolver.connect(this.wet);
    this.wet.connect(this.compressor);
    this.compressor.connect(makeup);
    makeup.connect(this.limiter);
    this.limiter.connect(this.globalPanner);
    this.globalPanner.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(context.destination);

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
    this.volume = Math.min(MAX_VOLUME, Math.max(0.04, value));
    if (!this.context || !this.master || this.muted) return;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.2);
  }

  transitionToSeed(seed: string) {
    if (!/^[0-9a-f]{8}$/i.test(seed)) return 'ignored' as const;
    const normalized = seed.toUpperCase();
    if (
      normalized === this.currentSeed ||
      normalized === this.incomingSeed ||
      normalized === this.queuedSeed
    ) return 'ignored' as const;
    if (this.incomingSeed) {
      this.queuedSeed = normalized;
      return 'queued' as const;
    }
    const now = this.context?.currentTime ?? 0;
    this.beginSeedTransition(normalized, now, true);
    return 'started' as const;
  }

  private beginSeedTransition(seed: string, now: number, fast: boolean) {
    this.incomingSeed = seed;
    this.incomingProfile = profileFromSeed(seed);
    this.pendingForm = emotionalFormFromSeed(seed);
    this.pendingScene = shapeSceneWithEmotionalForm(
      sceneFromSeed(seed),
      this.pendingForm,
      0,
    );
    this.targetArousal = this.pendingScene.arousal;
    this.targetValence = this.pendingScene.valence;
    this.transitionStartedAt = now;
    this.transitionDuration = this.options.debugFast
      ? fast ? 3.5 : 10
      : fast
        ? 8 + this.incomingProfile.space * 5
        : 190 + this.incomingProfile.space * 155;
    this.fastSeedTransition = fast;
    this.nextSeedAt = Infinity;
    this.options.onSnapshot?.(this.getSnapshot());
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
    const immediateStart = context.currentTime + 0.012;
    const subdivisionStart = this.snapToSubdivision(immediateStart);
    const start =
      subdivisionStart >= context.currentTime + 0.008 &&
      subdivisionStart <= context.currentTime + 0.09
        ? subdivisionStart
        : immediateStart;
    this.scheduleInteractionRipple(start, impulse);
  }

  getSnapshot(): SeedSnapshot {
    const now = this.context?.currentTime ?? 0;
    const transition = this.getTransition(now);
    return {
      currentSeed: this.currentSeed,
      emotion: emotionalFormEmotionAt(this.emotionalForm, this.formSceneIndex),
      incomingEmotion: this.incomingSeed
        ? initialEmotionFromSeed(this.incomingSeed)
        : null,
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
      let sampleDelta = 0;
      for (let index = 0; index < this.analyserTimeData.length; index += 1) {
        const sample = this.analyserTimeData[index];
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
        if (index > 0) {
          sampleDelta = Math.max(
            sampleDelta,
            Math.abs(sample - this.analyserTimeData[index - 1]),
          );
        }
      }
      const rms = Math.sqrt(sumSquares / this.analyserTimeData.length);
      this.outputRms += (rms - this.outputRms) * 0.12;
      this.outputPeak = Math.max(peak, this.outputPeak * 0.94);
      this.maxSampleDelta = Math.max(sampleDelta, this.maxSampleDelta * 0.97);
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
    this.bands.pulse = transport.pulse;
    this.bands.beatPhase = transport.beatPhase;
    this.bands.barPhase = transport.barPhase;
    this.bands.phrase += (transport.phrase - this.bands.phrase) * 0.045;
    this.bands.tension += (transport.tension - this.bands.tension) * 0.035;
    this.bands.arousal += (this.currentArousal - this.bands.arousal) * 0.08;
    this.bands.valence += (this.currentValence - this.bands.valence) * 0.08;
    return this.bands;
  }

  getDiagnostics(): NagiDiagnostics {
    const snapshot = this.getSnapshot();
    const transport = this.getTransportState(this.context?.currentTime ?? 0);
    const performance = this.getPerformancePlan();
    return {
      accompanimentPulseEvents: this.accompanimentPulseEvents,
      accompanimentInstrument: this.getTimbre('accompaniment').label,
      activeSources: this.trackedSources.size,
      arousal: this.currentArousal,
      bar: transport.bar,
      barPhase: transport.barPhase,
      bass: this.bands.bass,
      bassInstrument: this.getTimbre('bass').label,
      beat: transport.beat + transport.beatPhase,
      beatPhase: transport.beatPhase,
      bpm: transport.bpm,
      chordDegree: transport.chordDegree,
      contextState: this.context?.state ?? 'uninitialized',
      counterNoteEvents: this.counterNoteEvents,
      counterArticulation: articulationName(performance.counter),
      counterInstrument: this.getTimbre('counter').label,
      currentSeed: snapshot.currentSeed,
      harmonicScene: transport.sceneName,
      harmonyInstrument: this.getTimbre('harmony').label,
      harmonyLevel: this.harmonyLevel,
      harmonicVoiceCount: this.harmonicVoiceCount,
      incomingSeed: snapshot.incomingSeed,
      interaction: this.bands.interaction,
      leadMotifCycle: this.leadMotif.cycle,
      leadMotifMutations: this.leadMotif.mutations,
      leadNoteEvents: this.leadNoteEvents,
      leadArticulation: articulationName(performance.lead),
      leadInstrument: this.getTimbre('lead').label,
      melodyLevel: this.melodyLevel,
      leadTheme: this.leadMotif.sourceName,
      limiterReduction: Math.round((this.limiter?.reduction ?? 0) * 10) / 10,
      maxHumanizeMs: Math.round(this.maxHumanizeMs * 10) / 10,
      maxSampleDelta: this.maxSampleDelta,
      maxSchedulerJitterMs: Math.round(this.maxSchedulerJitterMs),
      meter: transport.meter,
      mid: this.bands.mid,
      musicalFormStage: emotionalFormStageAt(
        this.emotionalForm,
        this.formSceneIndex,
      ).id,
      outputPeak: this.outputPeak,
      outputRms: this.outputRms,
      orchestrationTransition: this.orchestrationMix,
      pulse: transport.pulse,
      scheduledEvents: this.scheduledEvents,
      schedulerRecoveries: this.schedulerRecoveries,
      transition: snapshot.transition,
      treble: this.bands.treble,
      valence: this.currentValence,
      volume: this.volume,
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
      this.nextFxAt +=
        this.atmosphereRandom.between(13, 28) * (1.16 - profile.density * 0.26);
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
    const timeConstant = this.options.debugFast
      ? 2.4
      : this.fastSeedTransition
        ? 3.2
        : 42;
    const amount = 1 - Math.exp(-elapsed / timeConstant);
    this.currentArousal += (this.targetArousal - this.currentArousal) * amount;
    this.currentValence += (this.targetValence - this.currentValence) * amount;
  }

  private getTransportState(at: number): TransportState {
    const segment = this.getTransportSegment(at);
    if (!segment) {
      const meter = METERS[this.harmonicScene.meterIndex];
      return {
        accent: meter.accents[0] ?? 1,
        bar: 0,
        barPhase: 0,
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
    const barPhase = (beatInBar % meter.beatsPerBar) / meter.beatsPerBar;
    const phraseBars = Math.max(1, segment.phraseBars);
    const phrase =
      ((segment.phraseBar + elapsedBeats / meter.beatsPerBar) % phraseBars) /
      phraseBars;
    return {
      accent,
      bar: segment.startBar + elapsedBars,
      barPhase,
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
      this.beginSeedTransition(nextSeed(this.currentSeed), now, false);
      return;
    }
    if (
      this.incomingSeed !== null &&
      now >= this.transitionStartedAt + this.transitionDuration &&
      this.pendingScene === null
    ) {
      this.currentSeed = this.incomingSeed;
      this.currentProfile = this.incomingProfile!;
      this.incomingSeed = null;
      this.incomingProfile = null;
      this.fastSeedTransition = false;
      this.nextSeedAt = now + this.dwellSeconds(this.currentProfile);
      this.options.onSnapshot?.(this.getSnapshot());
      if (this.queuedSeed) {
        const queued = this.queuedSeed;
        this.queuedSeed = null;
        this.beginSeedTransition(queued, now, true);
      }
    }
  }

  private getTransition(now: number) {
    if (this.incomingSeed === null || this.transitionDuration <= 0) return 0;
    return smootherstep((now - this.transitionStartedAt) / this.transitionDuration);
  }

  private dwellSeconds(profile: WeatherProfile) {
    if (this.options.debugFast) return 11 + profile.motion * 5;
    return 430 + profile.motion * 330;
  }

  private updateMix(profile: WeatherProfile, now: number) {
    if (!this.filter || !this.dry || !this.wet || !this.globalPanner) return;
    const pointerBrightness = (1 - this.interactionY) * 850;
    const emotionalBrightness = this.currentValence * 520 + this.currentArousal * 420;
    const cutoff =
      3100 +
      profile.brightness * 2700 +
      emotionalBrightness +
      pointerBrightness +
      this.interactionEnergy * 520;
    this.filter.frequency.setTargetAtTime(cutoff, now, 1.2);
    const reverbMix = clamp(
      0.16 +
        profile.space * 0.18 +
        (1 - this.currentArousal) * 0.035 +
        this.interactionY * 0.02,
      0.14,
      0.38,
    );
    this.dry.gain.setTargetAtTime(Math.sqrt(1 - reverbMix) * 0.92, now, 2.4);
    this.wet.gain.setTargetAtTime(Math.sqrt(reverbMix) * 0.48, now, 2.4);
    this.globalPanner.pan.setTargetAtTime((this.interactionX - 0.5) * 0.16, now, 0.45);
  }

  private getPerformancePlan() {
    return interpolatePerformancePlan(
      this.performanceFrom,
      this.performanceTarget,
      this.performanceMix,
    );
  }

  private getTimbre(role: keyof OrchestrationPlan) {
    return interpolateTimbre(
      this.orchestrationFrom[role],
      this.orchestrationTarget[role],
      this.orchestrationMix,
    );
  }

  private getInstrument(role: keyof OrchestrationPlan): InstrumentId {
    return this.orchestrationMix < 0.5
      ? this.orchestrationFrom[role]
      : this.orchestrationTarget[role];
  }

  private getWave(role: keyof OrchestrationPlan, midi = 60) {
    if (!this.context) return undefined;
    const from = this.orchestrationFrom[role];
    const to = this.orchestrationTarget[role];
    const mix = Math.round(this.orchestrationMix * 12) / 12;
    const pitchBucket = Math.round(midi / 3) * 3;
    const key = `${from}:${to}:${mix.toFixed(2)}:${pitchBucket}`;
    const cached = this.waveCache.get(key);
    if (cached) return cached;
    const recipe = interpolateTimbre(from, to, mix);
    const real = new Float32Array(recipe.partials.length);
    const imaginary = new Float32Array(recipe.partials.length);
    const fundamental = midiToFrequency(pitchBucket);
    const nyquist = this.context.sampleRate * 0.5;
    for (let harmonic = 1; harmonic < recipe.partials.length; harmonic += 1) {
      const harmonicHz = fundamental * harmonic;
      const antiAlias = clamp((nyquist - harmonicHz) / (nyquist * 0.12));
      const pitchTilt = Math.exp(-Math.max(0, pitchBucket - 60) * harmonic * 0.0028);
      const amplitude = recipe.partials[harmonic] * antiAlias * pitchTilt;
      const phase =
        (deriveSeedNumber(0x51f2e9ad, `${from}:${to}:${harmonic}`) / 0x100000000) *
        Math.PI *
        2;
      real[harmonic] = amplitude * Math.cos(phase);
      imaginary[harmonic] = amplitude * Math.sin(phase);
    }
    const wave = this.context.createPeriodicWave(
      real,
      imaginary,
      { disableNormalization: false },
    );
    if (this.waveCache.size >= 384) this.waveCache.clear();
    this.waveCache.set(key, wave);
    return wave;
  }

  private beginExpressiveTransition(scene: HarmonicScene, profile: WeatherProfile) {
    const stage = emotionalFormStageAt(this.emotionalForm, this.formSceneIndex);
    this.orchestrationFrom = this.orchestrationTarget;
    this.orchestrationTarget = chooseOrchestration(
      scene,
      stage,
      profile,
      this.orchestrationRandom,
      this.orchestrationFrom,
    );
    if (this.orchestrationTarget.harmony !== this.orchestrationFrom.harmony) {
      this.harmonyContinuousGestureSeconds = 0;
    }
    if (this.orchestrationTarget.bass !== this.orchestrationFrom.bass) {
      this.bassContinuousGestureSeconds = 0;
    }
    if (this.orchestrationTarget.lead !== this.orchestrationFrom.lead) {
      this.leadContinuousGestureSeconds = 0;
    }
    if (this.orchestrationTarget.counter !== this.orchestrationFrom.counter) {
      this.counterContinuousGestureSeconds = 0;
    }
    this.orchestrationMix = this.orchestrationsMatch() ? 1 : 0;
    this.performanceFrom = this.getPerformancePlan();
    this.performanceTarget = choosePerformancePlan(scene, stage, this.performanceRandom);
    this.performanceMix = 0;
  }

  private evolvePerformance(scene: HarmonicScene) {
    const stage = emotionalFormStageAt(this.emotionalForm, this.formSceneIndex);
    this.performanceFrom = this.getPerformancePlan();
    this.performanceTarget = choosePerformancePlan(scene, stage, this.performanceRandom);
    this.performanceMix = 0;
  }

  private orchestrationsMatch() {
    return (Object.keys(this.orchestrationFrom) as (keyof OrchestrationPlan)[])
      .every((role) => this.orchestrationFrom[role] === this.orchestrationTarget[role]);
  }

  private advanceExpressiveTransition(spanBars: number, phraseBars: number) {
    const phraseScale = 4 / Math.max(4, phraseBars);
    const amount = Math.min(0.3, spanBars * 0.14 * phraseScale);
    this.orchestrationMix = clamp(this.orchestrationMix + amount);
    this.performanceMix = clamp(this.performanceMix + amount);
  }

  private scheduleVibrato(
    parameter: AudioParam,
    start: number,
    duration: number,
    recipe: TimbreRecipe,
    expressionState: VoiceExpression,
    baseDetune: number,
    gestureVibrato?: NoteGesturePlan['vibrato'],
  ) {
    const depth = gestureVibrato?.enabled
      ? gestureVibrato.depthCents
      : recipe.vibratoCents * expressionState.vibratoScale;
    if ((gestureVibrato && !gestureVibrato.enabled) || depth < 0.35 || duration < 0.46) {
      parameter.setValueAtTime(baseDetune, start);
      return;
    }
    const delay = gestureVibrato
      ? Math.min(duration * 0.48, gestureVibrato.onsetSeconds)
      : Math.min(duration * 0.34, 0.34);
    parameter.setValueAtTime(baseDetune, start);
    parameter.setValueAtTime(baseDetune, start + delay);
    const vibratoDuration = Math.max(0.12, duration - delay);
    const vibratoRate = gestureVibrato?.rateHz ?? recipe.vibratoHz;
    const samples = Math.max(12, Math.min(72, Math.ceil(vibratoDuration * vibratoRate * 8)));
    const curve = new Float32Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const progress = index / Math.max(1, samples - 1);
      const onsetFraction = gestureVibrato
        ? clamp(gestureVibrato.rampSeconds / vibratoDuration, 0.05, 0.72)
        : 0.22;
      const onset = smoothstep(progress / onsetFraction);
      curve[index] = baseDetune + Math.sin(progress * vibratoDuration * vibratoRate * Math.PI * 2) * depth * onset;
    }
    parameter.setValueCurveAtTime(curve, start + delay, vibratoDuration);
  }

  private scheduleHarmony(start: number, opening: boolean) {
    const context = this.context;
    if (!context || !this.sourceBus || !this.effectsBus) return;

    let sceneChanged = false;
    if (!opening) {
      if (
        this.pendingScene &&
        (this.incomingSeed === null || this.getTransition(start) >= 0.3) &&
        (this.phraseBar === 0 || this.getTransition(start) >= 0.92)
      ) {
        const nextScene = this.pendingScene;
        this.chordDegree = findPivotDegree(this.harmonicScene, this.chordDegree, nextScene);
        if (this.pendingForm) this.emotionalForm = this.pendingForm;
        this.pendingForm = null;
        this.formSceneIndex = 0;
        this.harmonicScene = nextScene;
        this.targetArousal = nextScene.arousal;
        this.targetValence = nextScene.valence;
        this.phraseBar = 0;
        this.resetRandomStreams(this.incomingSeed ?? this.currentSeed);
        const motifPair = createMotifPair(this.melodyRandom, nextScene);
        this.leadMotif = motifPair.lead;
        this.counterMotif = motifPair.counter;
        this.leadContinuousGestureSeconds = 0;
        this.counterContinuousGestureSeconds = 0;
        this.pendingScene = null;
        sceneChanged = true;
        this.chordsUntilSceneChange = this.options.debugFast
          ? 2
          : 8 + Math.floor(this.harmonyRandom.next() * 7);
      } else if (this.chordsUntilSceneChange <= 0 && this.phraseBar === 0) {
        this.formSceneIndex += 1;
        const nextScene = shapeSceneWithEmotionalForm(
          chooseNeighborScene(this.harmonicScene, this.harmonyRandom),
          this.emotionalForm,
          this.formSceneIndex,
        );
        this.chordDegree = findPivotDegree(this.harmonicScene, this.chordDegree, nextScene);
        this.harmonicScene = nextScene;
        this.targetArousal = nextScene.arousal;
        this.targetValence = nextScene.valence;
        this.phraseBar = 0;
        sceneChanged = true;
        this.chordsUntilSceneChange = this.options.debugFast
          ? 2 + Math.floor(this.harmonyRandom.next() * 2)
          : 7 + Math.floor(this.harmonyRandom.next() * 8);
      }
    }

    const profile = this.getSnapshot().profile;
    if (sceneChanged) {
      this.beginExpressiveTransition(this.harmonicScene, profile);
    } else if (
      !opening &&
      this.phraseBar === 0 &&
      this.performanceMix >= 0.98 &&
      this.performanceRandom.next() < 0.58
    ) {
      this.evolvePerformance(this.harmonicScene);
    }
    const targetTempo = tempoFromArousal(this.currentArousal, this.currentValence);
    const maxTempoStep = Math.max(0.7, this.transportTempo * 0.014);
    this.transportTempo = opening
      ? targetTempo
      : this.transportTempo +
        clamp(targetTempo - this.transportTempo, -maxTempoStep, maxTempoStep);
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
    if (
      opening ||
      sceneChanged ||
      this.phraseBar === 0 ||
      this.phraseHarmonyPlan.phraseBars !== sceneForChord.phraseBars
    ) {
      this.planFormalPhrase(sceneForChord);
    }
    const phraseHarmonyEvent = phraseHarmonyEventAtBar(
      this.phraseHarmonyPlan,
      this.phraseBar,
    );
    if (phraseHarmonyEvent) this.chordDegree = phraseHarmonyEvent.degree;
    const spanBars = phraseHarmonyEvent?.spanBars ?? chooseChordSpanBars(
      sceneForChord,
      this.harmonyRandom,
      sceneForChord.phraseBars - this.phraseBar,
    );
    const bassLineEvent = phraseHarmonyEvent
      ? this.bassLinePlan.events[phraseHarmonyEvent.index]
      : undefined;
    const barSeconds = beatSeconds * meter.beatsPerBar;
    const duration = barSeconds * spanBars;
    const phraseProgress =
      (this.phraseBar % sceneForChord.phraseBars) /
      Math.max(1, sceneForChord.phraseBars);
    if (opening || this.phraseBar === 0 || this.harmonyRandom.next() < 0.38) {
      this.harmonicVoiceCount = chooseHarmonyVoiceCount(
        sceneForChord,
        profile.density,
        phraseProgress,
        this.harmonicVoiceCount,
        this.harmonyRandom,
      );
    }
    this.currentVoicing = voiceLeadChord(
      sceneForChord,
      this.chordDegree,
      this.currentVoicing,
      this.harmonicVoiceCount,
      bassLineEvent
        ? {
            bassMidi: bassLineEvent.bassMidi,
            inversion: bassLineEvent.inversion,
          }
        : undefined,
    );
    const performance = this.getPerformancePlan();
    const harmonyLevel = clamp(
      0.95 - Math.max(0, this.harmonicVoiceCount - 3) * 0.035 -
        this.currentArousal * 0.025 + performance.harmony.dynamic * 0.025,
      0.72,
      0.98,
    );
    const melodyLevel = clamp(
      1.3 + Math.max(0, this.harmonicVoiceCount - 3) * 0.018 +
        (1 - profile.density) * 0.055 + performance.lead.dynamic * 0.035,
      1.3,
      1.48,
    );
    this.harmonyLevel = harmonyLevel;
    this.melodyLevel = melodyLevel;
    this.harmonyBus?.gain.setTargetAtTime(harmonyLevel, start, 0.9);
    this.melodyBus?.gain.setTargetAtTime(melodyLevel, start, 0.9);
    const bedBreath = 0.78 + Math.abs(Math.cos(phraseProgress * Math.PI)) * 0.22;

    this.transportTimeline.push({
      chordDegree: this.chordDegree,
      end: start + duration,
      meterIndex: sceneForChord.meterIndex,
      phraseBar: this.phraseBar,
      phraseBars: sceneForChord.phraseBars,
      sceneName: sceneName(sceneForChord),
      start,
      startBar: this.scheduledBars,
      tension: phraseHarmonyEvent
        ? clamp(
            phraseHarmonyEvent.tensionTarget * 0.62 +
              degreeTension(this.chordDegree) * 0.38,
          )
        : degreeTension(this.chordDegree),
      tempo: sceneForChord.tempo,
    });

    const harmonyGesture = planNoteGesture({
      connectionRandom: this.textureRandom.next(),
      continuousGestureSeconds: this.harmonyContinuousGestureSeconds,
      durationSeconds: duration,
      expression: performance.harmony,
      instrument: this.getInstrument('harmony'),
      intervalSemitones: 0,
      legatoRequested: true,
      metricStrength: phraseHarmonyEvent?.cadential ? 0.9 : 0.68,
      phraseProgress,
      variation: this.textureRandom.between(-0.018, 0.018),
    });
    this.harmonyContinuousGestureSeconds =
      harmonyGesture.boundary.continuousSecondsAfter;
    this.currentVoicing.slice(1).forEach((midi, index) => {
      this.schedulePadVoice(
        start,
        duration,
        midi,
        index,
        opening,
        profile,
        bedBreath,
        harmonyGesture,
      );
    });
    const previousBassMidi = this.lastBassMidi;
    const bassMidi = this.currentVoicing[0] ?? chordRootMidi(sceneForChord, this.chordDegree);
    this.lastBassMidi = bassMidi;
    this.scheduleBass(
      start,
      Math.min(duration * 0.72, barSeconds * 1.3),
      bassMidi,
      opening,
      profile,
      bedBreath,
      previousBassMidi,
      phraseProgress,
    );
    if (spanBars >= 3 && this.harmonyRandom.next() < 0.32) {
      this.scheduleBass(
        start + (spanBars - 1) * barSeconds,
        barSeconds * 0.58,
        bassMidi,
        false,
        profile,
        bedBreath * 0.64,
        bassMidi,
        phraseProgress,
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
    this.scheduleAccompaniment(
      start,
      beatSeconds,
      spanBars,
      sceneForChord,
      profile,
    );
    this.nextHarmonyAt = start + duration;
    this.advanceExpressiveTransition(spanBars, sceneForChord.phraseBars);
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
    bedBreath: number,
    gesture: NoteGesturePlan,
  ) {
    if (!this.context || !this.harmonyBus) return;
    const context = this.context;
    const recipe = this.getTimbre('harmony');
    const expressionState = this.getPerformancePlan().harmony;
    const performanceStart = start + gesture.boundary.breakBeforeSeconds;
    const wave = this.getWave('harmony', midi);
    if (!wave) return;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(wave);
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), performanceStart);
    const detune = this.textureRandom.between(-1.25, 1.25);
    this.scheduleVibrato(
      oscillator.detune,
      performanceStart,
      duration,
      recipe,
      expressionState,
      detune,
      gesture.vibrato,
    );

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      (620 + profile.brightness * 980 + this.currentArousal * 220 + index * 68) *
      (0.72 + recipe.brightness * 0.54);
    filter.Q.value = 0.2 + profile.warmth * 0.18;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const spread = [-0.78, 0.5, -0.22, 0.76, 0.16][index] ?? 0;
    panner.pan.value = spread * profile.spread;

    const naturalAttack = recipe.attack * gesture.attackScale;
    const attack = opening
      ? Math.max(0.08 + index * 0.028, naturalAttack * 0.72)
      : Math.min(
          2.6,
          Math.max(naturalAttack, duration * (0.12 + (1 - this.currentArousal) * 0.08)),
        );
    const sustainDuration = Math.min(
      duration * 1.04,
      duration * (0.76 + gesture.articulation * 0.24) * bedBreath,
    );
    const idiomaticRelease = gesture.decay.kind === 'natural'
      ? Math.min(recipe.release, gesture.decay.naturalDecaySeconds)
      : recipe.release;
    const release = Math.min(
      2.7,
      Math.max(0.42, idiomaticRelease * gesture.decay.releaseScale),
    );
    const end = performanceStart + sustainDuration + release;
    const peak =
      (opening ? 0.017 : 0.0125) *
      (0.86 + profile.density * 0.24) *
      bedBreath *
      gesture.dynamic;
    envelope.gain.setValueAtTime(0, Math.max(0, performanceStart - 0.008));
    envelope.gain.setValueAtTime(0, performanceStart);
    envelope.gain.linearRampToValueAtTime(peak, performanceStart + attack);
    envelope.gain.setValueAtTime(peak, performanceStart + sustainDuration);
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.006);
    envelope.gain.linearRampToValueAtTime(0, end);

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.harmonyBus);
    oscillator.start(Math.max(context.currentTime + 0.001, performanceStart - 0.008));
    oscillator.stop(end + 0.025);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduleTimbreNoise(
      performanceStart,
      Math.min(sustainDuration + release, 3.2),
      midi,
      peak,
      recipe,
      'harmony',
      panner.pan.value,
      profile,
    );
    this.scheduledEvents += 1;
  }

  private scheduleBass(
    start: number,
    duration: number,
    midi: number,
    opening: boolean,
    profile: WeatherProfile,
    accent = 1,
    previousMidi = midi,
    phraseProgress = 0.5,
  ) {
    if (!this.context || !this.harmonyBus) return;
    const context = this.context;
    const recipe = this.getTimbre('bass');
    const expressionState = this.getPerformancePlan().bass;
    const gesture = planNoteGesture({
      connectionRandom: this.textureRandom.next(),
      continuousGestureSeconds: this.bassContinuousGestureSeconds,
      durationSeconds: duration,
      expression: expressionState,
      instrument: this.getInstrument('bass'),
      intervalSemitones: midi - previousMidi,
      legatoRequested: expressionState.articulation > 0.94,
      metricStrength: accent,
      phraseProgress,
      variation: this.textureRandom.between(-0.018, 0.018),
    });
    this.bassContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    const performanceStart = start + gesture.boundary.breakBeforeSeconds;
    const wave = this.getWave('bass', midi);
    if (!wave) return;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(wave);
    if (gesture.connection.kind === 'portamento' && gesture.connection.glideSeconds > 0) {
      oscillator.frequency.setValueAtTime(midiToFrequency(previousMidi), performanceStart);
      oscillator.frequency.exponentialRampToValueAtTime(
        midiToFrequency(midi),
        performanceStart + gesture.connection.glideSeconds,
      );
    } else {
      oscillator.frequency.setValueAtTime(midiToFrequency(midi), performanceStart);
    }
    this.scheduleVibrato(
      oscillator.detune,
      performanceStart,
      duration,
      recipe,
      expressionState,
      this.textureRandom.between(-0.8, 0.8),
      gesture.vibrato,
    );
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      (270 + profile.warmth * 260) * (0.76 + recipe.brightness * 0.62);
    const envelope = context.createGain();
    const body = Math.max(
      0.3,
      duration * gesture.articulation + gesture.connection.overlapSeconds,
    );
    const idiomaticRelease = gesture.decay.kind === 'natural'
      ? Math.min(recipe.release, gesture.decay.naturalDecaySeconds)
      : recipe.release;
    const release = Math.min(1.8, idiomaticRelease * gesture.decay.releaseScale);
    const end = performanceStart + body + release;
    const attack = Math.min(body * 0.42, recipe.attack * gesture.attackScale);
    const peak =
      (0.017 + profile.warmth * 0.006) * accent * gesture.dynamic;
    envelope.gain.setValueAtTime(0, Math.max(0, performanceStart - 0.008));
    envelope.gain.setValueAtTime(0, performanceStart);
    envelope.gain.linearRampToValueAtTime(
      peak,
      performanceStart +
        (opening ? Math.min(0.22, attack) : Math.max(0.018, attack)),
    );
    envelope.gain.setValueAtTime(
      peak * (gesture.decay.kind === 'natural' ? gesture.decay.sustainLevel : 0.72),
      performanceStart + body * 0.7,
    );
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.006);
    envelope.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.harmonyBus);
    oscillator.start(Math.max(context.currentTime + 0.001, performanceStart - 0.008));
    oscillator.stop(end + 0.025);
    this.trackSource(oscillator, [filter, envelope]);
    this.scheduleTimbreNoise(
      performanceStart,
      Math.min(body + release, 2.4),
      midi,
      peak,
      recipe,
      'bass',
      0,
      profile,
    );
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
    if (!this.context || !this.effectsBus) return;
    const meter = METERS[scene.meterIndex];
    const includeCounter = profile.density > 0.43 &&
      (opening || this.melodyRandom.next() < 0.35 + this.currentArousal * 0.36);
    const counterpoint = planMotifCounterpoint(
      scene,
      spanBars,
      this.melodyRandom,
      this.leadMotif,
      this.counterMotif,
      this.phraseBar,
      includeCounter,
      opening,
    );
    const leadEvents = counterpoint.leadEvents;
    const counterEvents = counterpoint.counterEvents;
    const totalChordBeats = meter.beatsPerBar * spanBars;
    const phraseEndsWithChord = this.phraseBar + spanBars >= scene.phraseBars;
    const melodicTimeline = [
      ...leadEvents.map((event, index) => ({
        event,
        index,
        role: 'lead' as const,
        voiceEventCount: leadEvents.length,
      })),
      ...counterEvents.map((event, index) => ({
        event,
        index,
        role: 'counter' as const,
        voiceEventCount: counterEvents.length,
      })),
    ].sort((a, b) => a.event.beat - b.event.beat || (a.role === 'lead' ? -1 : 1));
    let localLeadMidi = this.lastMelodyMidi;
    let localCounterMidi = this.lastCounterMidi;

    for (const item of melodicTimeline) {
        const { event, index, role, voiceEventCount } = item;
        if (this.trackedSources.size >= 40) break;
        const phraseProgress =
          ((this.phraseBar + event.beat / meter.beatsPerBar) % scene.phraseBars) /
          scene.phraseBars;
        const contour = Math.sin(phraseProgress * Math.PI * 2 + scene.tension * Math.PI);
        const direction: -1 | 0 | 1 = contour > 0.16 ? 1 : contour < -0.16 ? -1 : 0;
        const previous = role === 'lead' ? localLeadMidi : localCounterMidi;
        const mustResolve = role === 'lead'
          ? this.leadNeedsResolution
          : this.counterNeedsResolution;
        // A performer does not cadence at every harmony change. Preserve
        // suspensions and passing tones across chord boundaries; apply strong
        // resolution pressure only at the actual end of the formal phrase.
        const cadenceSoon = phraseEndsWithChord && (
          event.beat + event.durationBeats >= totalChordBeats - 0.5 ||
          index === voiceEventCount - 1
        );
        const targetMidi =
          (role === 'lead' ? 70 : 62) + contour * (role === 'lead' ? 4.2 : 3.1);
        const targetPitchClass = motifPitchClass(scene, event.motifDegree);
        const bassMidi = this.currentVoicing[0] ?? chordRootMidi(scene, this.chordDegree);
        const backgroundNotes = [...this.currentVoicing];
        const midi = pickMelodyMidi(
          scene,
          this.chordDegree,
          previous,
          this.melodyRandom,
          {
            backgroundNotes,
            bassMidi,
            direction,
            metricStrength: event.metricStrength,
            mustResolve: mustResolve || cadenceSoon,
            otherVoiceMidi: role === 'counter' ? localLeadMidi : localCounterMidi,
            registerHigh: role === 'lead' ? 84 : 74,
            registerLow: role === 'lead' ? 60 : 52,
            targetMidi,
            targetPitchClass,
          },
        );
        if (role === 'lead') {
          this.leadNoteEvents += 1;
          localLeadMidi = midi;
          this.lastMelodyMidi = midi;
          this.leadNeedsResolution = !isChordTone(scene, this.chordDegree, midi);
        } else {
          this.counterNoteEvents += 1;
          localCounterMidi = midi;
          this.lastCounterMidi = midi;
          this.counterNeedsResolution = !isChordTone(scene, this.chordDegree, midi);
        }
        const humanizeSeconds = event.humanizeBeats * beatSeconds;
        this.maxHumanizeMs = Math.max(this.maxHumanizeMs, Math.abs(humanizeSeconds) * 1000);
        const noteStart = Math.max(
          start + 0.035,
          start + event.beat * beatSeconds + humanizeSeconds,
        );
        const maximumDuration = Math.max(
          0.42,
          start + totalChordBeats * beatSeconds + 0.58 - noteStart,
        );
        this.scheduleMotifNote(
          noteStart,
          midi,
          previous,
          profile,
          index,
          voiceEventCount,
          role,
          event.accent,
          event.metricStrength,
          event.durationBeats * beatSeconds,
          maximumDuration,
          phraseProgress,
        );
    }
  }

  private scheduleAccompaniment(
    start: number,
    beatSeconds: number,
    spanBars: number,
    scene: HarmonicScene,
    profile: WeatherProfile,
  ) {
    if (!this.context || !this.harmonyBus || this.currentVoicing.length < 2) return;
    const meter = METERS[scene.meterIndex];
    const accompanimentVoicing = this.currentVoicing.slice(1);
    for (let bar = 0; bar < spanBars; bar += 1) {
      for (let beat = 0; beat < meter.beatsPerBar; beat += 1) {
        const strength = metricStrengthAt(meter, beat);
        if (scene.arousal < 0.34 && strength < 0.58) continue;
        const noteIndex =
          (bar * meter.beatsPerBar + beat + this.chordDegree) %
          accompanimentVoicing.length;
        let midi = accompanimentVoicing[noteIndex];
        if (midi > 74) midi -= 12;
        this.scheduleHarmonicPulse(
          start + (bar * meter.beatsPerBar + beat) * beatSeconds,
          beatSeconds * (0.42 + (1 - scene.arousal) * 0.16),
          midi,
          0.52 + strength * 0.48,
          profile,
          beat % 2 === 0 ? -0.16 : 0.16,
          ((this.phraseBar + bar + beat / meter.beatsPerBar) % scene.phraseBars) /
            scene.phraseBars,
        );
        if (
          scene.arousal > 0.78 &&
          (beat + bar) % 2 === 0 &&
          this.trackedSources.size < 38
        ) {
          const upper = accompanimentVoicing[(noteIndex + 1) % accompanimentVoicing.length];
          this.scheduleHarmonicPulse(
            start + (bar * meter.beatsPerBar + beat + 0.5) * beatSeconds,
            beatSeconds * 0.28,
            upper,
            0.34,
            profile,
            beat % 2 === 0 ? 0.2 : -0.2,
            ((this.phraseBar + bar + (beat + 0.5) / meter.beatsPerBar) %
              scene.phraseBars) /
              scene.phraseBars,
          );
        }
      }
    }
  }

  private scheduleHarmonicPulse(
    start: number,
    duration: number,
    midi: number,
    accent: number,
    profile: WeatherProfile,
    pan: number,
    phraseProgress: number,
  ) {
    if (!this.context || !this.harmonyBus || this.trackedSources.size >= 38) return;
    const context = this.context;
    const recipe = this.getTimbre('accompaniment');
    const expressionState = this.getPerformancePlan().accompaniment;
    const gesture = planNoteGesture({
      connectionRandom: this.textureRandom.next(),
      durationSeconds: duration,
      expression: expressionState,
      instrument: this.getInstrument('accompaniment'),
      intervalSemitones: 0,
      legatoRequested: false,
      metricStrength: accent,
      phraseProgress,
      variation: this.textureRandom.between(-0.025, 0.025),
    });
    const wave = this.getWave('accompaniment', midi);
    if (!wave) return;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(wave);
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      (820 + profile.brightness * 1160) * (0.7 + recipe.brightness * 0.62);
    filter.Q.value = 0.22;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = pan * profile.spread;
    const body = Math.max(0.075, duration * gesture.articulation);
    const idiomaticRelease = gesture.decay.kind === 'natural'
      ? Math.min(recipe.release, gesture.decay.naturalDecaySeconds)
      : recipe.release;
    const release = Math.min(
      Math.max(0.12, duration * 0.72),
      idiomaticRelease * gesture.decay.releaseScale,
    );
    const end = start + body + release;
    const dynamic = gesture.dynamic;
    const peak = (0.0042 + this.currentArousal * 0.0032) * accent * dynamic;
    const attack = Math.min(body * 0.32, recipe.attack * gesture.attackScale);
    envelope.gain.setValueAtTime(0, Math.max(0, start - 0.008));
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + Math.max(0.006, attack));
    envelope.gain.exponentialRampToValueAtTime(
      peak * (gesture.decay.kind === 'natural' ? gesture.decay.sustainLevel : 0.32),
      start + body * 0.62,
    );
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.006);
    envelope.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.harmonyBus);
    oscillator.start(Math.max(context.currentTime + 0.001, start - 0.008));
    oscillator.stop(end + 0.025);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduleTimbreNoise(
      start,
      Math.min(duration + release, 1.8),
      midi,
      peak,
      recipe,
      'accompaniment',
      panner.pan.value,
      profile,
    );
    this.accompanimentPulseEvents += 1;
    this.scheduledEvents += 1;
  }

  private scheduleMotifNote(
    start: number,
    midi: number,
    previousMidi: number,
    profile: WeatherProfile,
    index: number,
    count: number,
    role: 'lead' | 'counter',
    accent: number,
    metricStrength: number,
    rhythmicDuration: number,
    maximumDuration: number,
    phraseProgress: number,
  ) {
    if (
      !this.context ||
      !this.effectsBus ||
      !this.melodyBus
    ) return;
    const context = this.context;
    const recipe = this.getTimbre(role);
    const expressionState = this.getPerformancePlan()[role];
    const instrument = this.getInstrument(role);
    const continuousGestureSeconds = role === 'lead'
      ? this.leadContinuousGestureSeconds
      : this.counterContinuousGestureSeconds;
    const gesture = planNoteGesture({
      connectionRandom: this.textureRandom.next(),
      continuousGestureSeconds,
      durationSeconds: Math.min(maximumDuration, rhythmicDuration + recipe.release),
      expression: expressionState,
      instrument,
      intervalSemitones: midi - previousMidi,
      legatoRequested: expressionState.articulation > 0.94,
      metricStrength,
      phraseProgress,
      variation: this.textureRandom.between(-0.025, 0.025),
    });
    if (role === 'lead') {
      this.leadContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    } else {
      this.counterContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    }
    const performanceStart = start + gesture.boundary.breakBeforeSeconds;
    const wave = this.getWave(role, midi);
    if (!wave) return;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(wave);
    const frequency = midiToFrequency(midi);
    if (gesture.connection.kind === 'portamento' && gesture.connection.glideSeconds > 0) {
      oscillator.frequency.setValueAtTime(midiToFrequency(previousMidi), performanceStart);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency,
        performanceStart + gesture.connection.glideSeconds,
      );
    } else {
      oscillator.frequency.setValueAtTime(frequency, performanceStart);
    }
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      ((role === 'lead' ? 1420 : 1050) +
        profile.brightness * (role === 'lead' ? 2300 : 1700)) *
      (0.72 + recipe.brightness * 0.58);
    filter.Q.value = role === 'lead' ? 0.34 : 0.28;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = role === 'lead' ? 260 : 190;
    highpass.Q.value = 0.5;
    const presence = context.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = role === 'lead' ? 2200 : 1550;
    presence.Q.value = role === 'lead' ? 0.78 : 0.66;
    presence.gain.value = role === 'lead' ? 1.7 : -0.6;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const spatialAnchor = role === 'lead' ? 0.2 : -0.24;
    const spatialDrift = Math.sin((index / Math.max(1, count)) * Math.PI * 2) * 0.11;
    panner.pan.value = (spatialAnchor + spatialDrift) * profile.spread;
    const body = Math.max(
      0.095,
      rhythmicDuration * gesture.articulation + gesture.connection.overlapSeconds,
    );
    const idiomaticRelease = gesture.decay.kind === 'natural'
      ? Math.min(recipe.release, gesture.decay.naturalDecaySeconds)
      : recipe.release;
    const release =
      idiomaticRelease *
      gesture.decay.releaseScale *
      (0.52 + expressionState.articulation * 0.46) *
      (role === 'lead' ? 0.9 : 1.08);
    const availableDuration = Math.max(
      0.12,
      maximumDuration - gesture.boundary.breakBeforeSeconds,
    );
    const duration = Math.min(
      availableDuration,
      (body + release) * (0.9 + profile.space * 0.18),
    );
    const peakBase = role === 'lead'
      ? this.textureRandom.between(0.021, 0.032)
      : this.textureRandom.between(0.006, 0.011);
    const dynamic = gesture.dynamic;
    const peak = peakBase * accent * (0.84 + profile.sparkle * 0.22) * dynamic;
    const attack = Math.min(
      body * 0.45,
      recipe.attack * gesture.attackScale,
    );
    const releaseStart = Math.min(
      performanceStart + duration - 0.035,
      performanceStart + body,
    );
    envelope.gain.setValueAtTime(0, Math.max(0, performanceStart - 0.008));
    envelope.gain.setValueAtTime(0, performanceStart);
    envelope.gain.linearRampToValueAtTime(
      peak,
      performanceStart + Math.max(0.008, attack),
    );
    if (gesture.decay.kind === 'natural') {
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.00001, peak * gesture.decay.sustainLevel),
        releaseStart,
      );
    } else {
      envelope.gain.setValueAtTime(
        peak * (0.68 + gesture.articulation * 0.2),
        releaseStart,
      );
    }
    envelope.gain.exponentialRampToValueAtTime(
      0.00001,
      performanceStart + duration - 0.006,
    );
    envelope.gain.linearRampToValueAtTime(0, performanceStart + duration);
    this.scheduleVibrato(
      oscillator.detune,
      performanceStart,
      duration,
      recipe,
      expressionState,
      this.textureRandom.between(-2.1, 2.1),
      gesture.vibrato,
    );
    oscillator.connect(highpass);
    highpass.connect(filter);
    filter.connect(presence);
    presence.connect(envelope);
    envelope.connect(panner);
    panner.connect(role === 'lead' ? this.melodyBus : this.effectsBus);
    oscillator.start(Math.max(context.currentTime + 0.001, performanceStart - 0.008));
    oscillator.stop(performanceStart + duration + 0.025);
    this.trackSource(oscillator, [highpass, filter, presence, envelope, panner]);
    this.scheduleTimbreNoise(
      performanceStart,
      duration,
      midi,
      peak,
      recipe,
      role,
      panner.pan.value,
      profile,
    );
    this.scheduledEvents += 1;
  }

  private scheduleTimbreNoise(
    start: number,
    duration: number,
    midi: number,
    tonalPeak: number,
    recipe: TimbreRecipe,
    role: keyof OrchestrationPlan,
    pan: number,
    profile: WeatherProfile,
  ) {
    if (
      !this.context ||
      !this.noiseBuffer ||
      !this.harmonyBus ||
      !this.effectsBus ||
      !this.melodyBus ||
      this.trackedSources.size >= 40
    ) return;
    const breath = recipe.breath ?? 0;
    const transient = recipe.transient ?? 0;
    if (breath + transient < 0.035) return;

    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = this.textureRandom.between(0.92, 1.08);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = clamp(
      midiToFrequency(midi) *
        (3.2 + profile.brightness * 3.6 + transient * 7.5),
      480,
      7600,
    );
    filter.Q.value = 0.5 + (1 - breath) * 0.42;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    const transientDuration = Math.min(0.12, Math.max(0.035, duration * 0.12));
    const bodyDuration = Math.max(
      transientDuration + 0.02,
      Math.min(duration, transient > breath ? 0.28 + breath * duration : duration),
    );
    const end = start + bodyDuration;
    const peak = tonalPeak * (breath * 0.16 + transient * 0.3);
    const sustain = peak * clamp(breath / Math.max(0.08, breath + transient), 0.08, 0.72);
    envelope.gain.setValueAtTime(0, Math.max(0, start - 0.006));
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(
      peak,
      start + (transient > 0.04 ? 0.006 : Math.min(0.05, duration * 0.16)),
    );
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.00001, sustain),
      start + transientDuration,
    );
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.006);
    envelope.gain.linearRampToValueAtTime(0, end);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(
      role === 'lead'
        ? this.melodyBus
        : role === 'counter'
          ? this.effectsBus
          : this.harmonyBus,
    );
    source.start(
      Math.max(context.currentTime + 0.001, start - 0.004),
      this.textureRandom.between(0, Math.max(0.01, this.noiseBuffer.duration - 0.4)),
    );
    source.stop(end + 0.015);
    this.trackSource(source, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private scheduleInteractionRipple(start: number, energy: number) {
    if (!this.context || !this.effectsBus) return;
    const context = this.context;
    const voicing = this.currentVoicing.length > 0 ? this.currentVoicing : [60, 64, 67, 72];
    const index = Math.min(voicing.length - 1, Math.floor(this.interactionX * voicing.length));
    const midi = voicing[index] + (this.interactionY < 0.42 ? 12 : 0);
    const oscillator = context.createOscillator();
    const wave = this.getWave('counter', midi);
    if (!wave) return;
    oscillator.setPeriodicWave(wave);
    const frequency = midiToFrequency(midi);
    oscillator.frequency.setValueAtTime(frequency * (0.985 + energy * 0.025), start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.28);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 760 + (1 - this.interactionY) * 2250;
    filter.Q.value = 0.48;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = (this.interactionX - 0.5) * 1.6;
    const duration = 0.85 + energy * 1.45;
    const peak = 0.003 + energy * 0.008;
    envelope.gain.setValueAtTime(0, Math.max(0, start - 0.008));
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration - 0.006);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.effectsBus);
    oscillator.start(Math.max(context.currentTime + 0.001, start - 0.008));
    oscillator.stop(start + duration + 0.025);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private scheduleAtmosphere(start: number, profile: WeatherProfile) {
    if (!this.context || !this.effectsBus || !this.noiseBuffer) return;
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = this.atmosphereRandom.between(0.55, 1.08);
    const filter = context.createBiquadFilter();
    filter.type = this.atmosphereRandom.next() < 0.78 ? 'bandpass' : 'lowpass';
    filter.frequency.value =
      this.atmosphereRandom.between(620, 2600) *
      (0.78 + profile.brightness * 0.28);
    filter.Q.value = this.atmosphereRandom.between(0.28, 0.68);
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = this.atmosphereRandom.between(-profile.spread, profile.spread);
    const duration = this.atmosphereRandom.between(2.8, 6.2);
    const peak =
      this.atmosphereRandom.between(0.0007, 0.0019) *
      (0.76 + profile.sparkle * 0.3);
    envelope.gain.setValueAtTime(0, Math.max(0, start - 0.008));
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + duration * 0.36);
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration - 0.006);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.effectsBus);
    source.start(
      Math.max(context.currentTime + 0.001, start - 0.008),
      this.atmosphereRandom.between(0, 0.35),
      duration + 0.016,
    );
    source.stop(start + duration + 0.025);
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
      smoothed = smoothed * 0.82 + (random.next() * 2 - 1) * 0.18;
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
        smoothed = smoothed * 0.68 + (random.next() * 2 - 1) * 0.32;
        channel[index] = smoothed * (1 - progress) ** 3.45;
      }
    }
    return buffer;
  }
}
