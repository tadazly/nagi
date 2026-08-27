import {
  METERS,
  MODES,
  SeededRandom,
  chordRootMidi,
  chooseChordSpanBars,
  chooseNeighborScene,
  clamp,
  degreeTensionForScene,
  deriveSeedNumber,
  emotionalFormFromSeed,
  emotionalFormEmotionAt,
  emotionalFormStageAt,
  findPivotDegree,
  initialEmotionFromSeed,
  interpolateProfile,
  isChordTone,
  midiToFrequency,
  nextSeed,
  phraseHarmonicGoalForFormStage,
  phraseHarmonyEventAtBar,
  planBassLine,
  planPhraseHarmony,
  planPhraseHarmonyVariation,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  shapeSceneWithEmotionalForm,
  shapeSceneWithEmotionalFormMemory,
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
  type MotifDNA,
} from './composition';
import {
  planPhraseMelody,
  reconcilePhraseCounterpoint,
  slicePhraseMelody,
  type CounterpointPairState,
  type PhraseFormRole,
  type PhraseMelodicPlan,
  type PhraseMelodyEvent,
  type RealizedPhraseMelodyEvent,
} from './phrase-melody';
import {
  INSTRUMENTS,
  INSTRUMENT_OUTPUT_TRIM,
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
  type PhraseRole,
  type TimbreRecipe,
  type VoiceExpression,
} from './performance';
import {
  accompanimentEventsForSpan,
  planPhraseTexture,
  textureSegmentAtBar,
  type AccompanimentPattern,
  type PhraseTexturePlan,
  type TextureRole,
  type TextureState,
} from './texture-planning';

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
  brassActive: boolean;
  brassInstrument: string;
  beat: number;
  beatPhase: number;
  bpm: number;
  chordDegree: number;
  contextState: AudioContextState | 'uninitialized';
  counterNoteEvents: number;
  counterArticulation: string;
  counterInstrument: string;
  currentSeed: string;
  formCycleComplete: boolean;
  harmonicScene: string;
  harmonyInstrument: string;
  harmonyLevel: number;
  harmonicVoiceCount: number;
  soundingChordVoices: number;
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
  percussionActive: boolean;
  percussionInstrument: string;
  scheduledEvents: number;
  schedulerRecoveries: number;
  transition: number;
  treble: number;
  textureRoles: readonly TextureRole[];
  textureSpotlight: TextureRole;
  textureState: TextureState;
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

type ToneLayer = {
  instrument: InstrumentId;
  level: number;
  recipe: TimbreRecipe;
  wave: PeriodicWave;
};

type PlannedSourceWindow = {
  end: number;
  start: number;
};

const SCHEDULER_INTERVAL_MS = 120;
const SCHEDULE_HORIZON_SECONDS = 3.2;
const MAX_SOURCE_OVERLAP = 40;
const NOISE_SOURCE_OVERLAP_LIMIT = 30;
// Leave a small reservation for bass, cadential brass and percussion, which
// are scheduled after the sustained upper harmony layer.
const HARMONY_OVERLAP_LIMIT = 34;
const BASS_OVERLAP_LIMIT = MAX_SOURCE_OVERLAP;
const DUAL_TIMBRE_OVERLAP_LIMIT = 34;
const ACCOMPANIMENT_OVERLAP_LIMIT = 36;
export const DEFAULT_VOLUME = 0.72;
export const MAX_VOLUME = 0.86;

export class NagiAudioEngine {
  private readonly options: EngineOptions;
  private readonly trackedSources = new Set<AudioScheduledSourceNode>();
  private readonly plannedSourceWindows = new Map<
    AudioScheduledSourceNode,
    PlannedSourceWindow
  >();
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
  private brassActive = false;
  private brassContinuousGestureSeconds = 0;
  private chordDegree = 0;
  private bassLinePlan!: BassLinePlan;
  private barsUntilSceneChange = 0;
  private compressor?: DynamicsCompressorNode;
  private context?: AudioContext;
  private currentProfile: WeatherProfile;
  private currentSeed: string;
  private currentVoicing: number[] = [];
  private currentAPhraseHarmonyPlan: PhraseHarmonicPlan | null = null;
  private currentAPhraseMelodyPlan: PhraseMelodicPlan | null = null;
  private currentArousal: number;
  private currentValence: number;
  private counterpointPairState: CounterpointPairState | null = null;
  private delayA?: DelayNode;
  private delayB?: DelayNode;
  private dry?: GainNode;
  private effectsBus?: GainNode;
  private emotionalForm: EmotionalFormPlan;
  private filter?: BiquadFilterNode;
  private fastSeedTransition = false;
  private formCycleComplete = false;
  private formSceneIndex = 0;
  private globalPanner?: StereoPannerNode;
  private harmonicVoiceCount = 3;
  private soundingChordVoices = 3;
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
  private lastLeadInterval = 0;
  private lastCounterInterval = 0;
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
  private openingHarmonicScene: HarmonicScene;
  private openingPhraseHarmonyPlan: PhraseHarmonicPlan | null = null;
  private performanceFrom: PerformancePlan;
  private performanceMix = 1;
  private performanceTarget: PerformancePlan;
  private percussionActive = false;
  private phraseMelodyPlan!: PhraseMelodicPlan;
  private phraseOrdinal = 0;
  private phraseTexturePlan!: PhraseTexturePlan;
  private phraseHarmonyPlan!: PhraseHarmonicPlan;
  private phraseBar = 0;
  private playing = false;
  private arrangementRandom!: SeededRandom;
  private openingPhraseMelodyPlan: PhraseMelodicPlan | null = null;
  private previousAccompanimentPattern: AccompanimentPattern | null = null;
  private previousPhraseHarmonyPlan: PhraseHarmonicPlan | null = null;
  private previousPhraseMelodyPlan: PhraseMelodicPlan | null = null;
  private previousPhraseTexturePlan: PhraseTexturePlan | null = null;
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
  private activeTextureRoles: readonly TextureRole[] = ['lead', 'harmony', 'bass'];
  private textureSpotlight: TextureRole = 'lead';
  private textureState: TextureState = 'chamber';
  private transportTimeline: TransportSegment[] = [];
  private transportTempo: number;
  private leadNeedsResolution = false;
  private leadResolutionDirection: -1 | 0 | 1 = 0;
  private leadResolutionMaximumStep = 0;
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
    this.openingHarmonicScene = this.harmonicScene;
    this.resetRandomStreams(seed);
    this.currentArousal = this.harmonicScene.arousal;
    this.currentValence = this.harmonicScene.valence;
    this.targetArousal = this.currentArousal;
    this.targetValence = this.currentValence;
    this.transportTempo = this.harmonicScene.tempo;
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
    this.barsUntilSceneChange = options.debugFast
      ? 2
      : 12 + Math.floor(this.harmonyRandom.next() * 9);
    this.options = options;
  }

  private resetRandomStreams(seed: string) {
    const root = deriveSeedNumber(seed, 'engine');
    this.arrangementRandom = new SeededRandom(deriveSeedNumber(root, 'arrangement'));
    this.harmonyRandom = new SeededRandom(deriveSeedNumber(root, 'harmony'));
    this.melodyRandom = new SeededRandom(deriveSeedNumber(root, 'melody'));
    this.orchestrationRandom = new SeededRandom(deriveSeedNumber(root, 'orchestration'));
    this.performanceRandom = new SeededRandom(deriveSeedNumber(root, 'performance'));
    this.textureRandom = new SeededRandom(deriveSeedNumber(root, 'timbre-detail'));
    this.atmosphereRandom = new SeededRandom(deriveSeedNumber(root, 'atmosphere'));
    this.waveCache.clear();
  }

  private phraseFormRole(stage: EmotionalFormPlan['stages'][number]): PhraseFormRole {
    if (stage.id === 'return') return 'A-double-prime';
    if (stage.id === 'intensification') return 'B';
    if (stage.id === 'release') return 'A-prime';
    if (stage.id === 'statement') {
      return this.openingPhraseMelodyPlan ? 'A-prime' : 'A';
    }
    return this.phraseOrdinal % 2 === 0 ? 'B' : 'A-prime';
  }

  private planFormalPhrase(scene: HarmonicScene) {
    const stage = emotionalFormStageAt(this.emotionalForm, this.formSceneIndex);
    const formRole = this.phraseFormRole(stage);
    const harmonyReference = formRole === 'A-double-prime'
      ? this.openingPhraseHarmonyPlan ?? this.previousPhraseHarmonyPlan
      : formRole === 'A-prime' || formRole === 'B'
        ? this.currentAPhraseHarmonyPlan ??
          this.openingPhraseHarmonyPlan ??
          this.previousPhraseHarmonyPlan
        : null;
    this.phraseHarmonyPlan = harmonyReference
      ? planPhraseHarmonyVariation(scene, harmonyReference, this.harmonyRandom, {
          goal: phraseHarmonicGoalForFormStage(stage),
          phraseBars: scene.phraseBars,
          relationship: formRole,
          startDegree: this.chordDegree,
        })
      : planPhraseHarmony(scene, this.harmonyRandom, {
          goal: phraseHarmonicGoalForFormStage(stage),
          phraseBars: scene.phraseBars,
          startDegree: this.chordDegree,
        });
    if (!this.openingPhraseHarmonyPlan && formRole === 'A') {
      this.openingPhraseHarmonyPlan = this.phraseHarmonyPlan;
    }
    if (formRole === 'A') this.currentAPhraseHarmonyPlan = this.phraseHarmonyPlan;
    this.previousPhraseHarmonyPlan = this.phraseHarmonyPlan;
    this.bassLinePlan = planBassLine(scene, this.phraseHarmonyPlan, this.harmonyRandom, {
      pedalStrength: 0.58 + (1 - scene.arousal) * 0.46,
      previousBassMidi: this.lastBassMidi,
      stepwiseStrength: 0.76 + (1 - scene.tension) * 0.24,
    });
    const profile = this.getSnapshot().profile;
    this.phraseTexturePlan = planPhraseTexture(
      scene,
      profile,
      stage,
      this.arrangementRandom,
      {
        harmonyEvents: this.phraseHarmonyPlan.events,
        phraseBars: scene.phraseBars,
        previousAccompanimentPattern: this.previousAccompanimentPattern,
        previousTexturePlan: this.previousPhraseTexturePlan,
      },
    );
    this.previousPhraseTexturePlan = this.phraseTexturePlan;
    this.previousAccompanimentPattern = this.phraseTexturePlan.accompanimentPattern;
    const counterSegments = this.phraseTexturePlan.segments.filter((segment) =>
      segment.activeRoles.includes('counter')
    );
    const previousPhrase = formRole === 'A-prime'
      ? this.currentAPhraseMelodyPlan ??
        this.openingPhraseMelodyPlan ??
        this.previousPhraseMelodyPlan
      : this.previousPhraseMelodyPlan;
    this.phraseMelodyPlan = planPhraseMelody(
      scene,
      this.melodyRandom,
      this.leadMotif,
      this.counterMotif,
      {
        bassLinePlan: this.bassLinePlan,
        counterEnabled: counterSegments.length > 0,
        counterEntryBar: counterSegments[0]?.startBar,
        counterExitBar: counterSegments.length > 0
          ? counterSegments.at(-1)!.startBar + counterSegments.at(-1)!.spanBars
          : undefined,
        formRole,
        harmonyPlan: this.phraseHarmonyPlan,
        openingReference: this.openingPhraseMelodyPlan ?? undefined,
        previousCounterMidi: this.lastCounterMidi,
        previousLeadMidi: this.lastMelodyMidi,
        previousPhrase: previousPhrase ?? undefined,
      },
    );
    if (!this.openingPhraseMelodyPlan && formRole === 'A') {
      this.openingPhraseMelodyPlan = this.phraseMelodyPlan;
    }
    if (formRole === 'A') this.currentAPhraseMelodyPlan = this.phraseMelodyPlan;
    this.previousPhraseMelodyPlan = this.phraseMelodyPlan;
    this.phraseOrdinal += 1;
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

    this.delayA = context.createDelay(2);
    this.delayB = context.createDelay(2);
    const openingBeatSeconds = 60 / this.transportTempo;
    this.delayA.delayTime.value = clamp(openingBeatSeconds * 0.5, 0.18, 0.9);
    this.delayB.delayTime.value = clamp(openingBeatSeconds * 1.5, 0.48, 1.8);
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
    this.effectsBus.connect(this.delayA);
    this.effectsBus.connect(this.delayB);
    this.delayA.connect(delayLevelA);
    this.delayB.connect(delayLevelB);
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
      context.currentTime - this.lastInteractionSoundAt < 0.22 + (1 - impulse) * 0.34
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
    const now = this.context?.currentTime ?? 0;
    const transport = this.getTransportState(now);
    const performance = this.getPerformancePlan();
    return {
      accompanimentPulseEvents: this.accompanimentPulseEvents,
      accompanimentInstrument: this.getTimbre('accompaniment').label,
      activeSources: this.activeSourceCountAt(now),
      arousal: this.currentArousal,
      bar: transport.bar,
      barPhase: transport.barPhase,
      bass: this.bands.bass,
      bassInstrument: this.getTimbre('bass').label,
      brassActive: this.brassActive,
      brassInstrument: this.getTimbre('brass').label,
      beat: transport.beat + transport.beatPhase,
      beatPhase: transport.beatPhase,
      bpm: transport.bpm,
      chordDegree: transport.chordDegree,
      contextState: this.context?.state ?? 'uninitialized',
      counterNoteEvents: this.counterNoteEvents,
      counterArticulation: articulationName(performance.counter),
      counterInstrument: this.getTimbre('counter').label,
      currentSeed: snapshot.currentSeed,
      formCycleComplete: this.formCycleComplete,
      harmonicScene: transport.sceneName,
      harmonyInstrument: this.getTimbre('harmony').label,
      harmonyLevel: this.harmonyLevel,
      harmonicVoiceCount: this.harmonicVoiceCount,
      soundingChordVoices: this.soundingChordVoices,
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
      percussionActive: this.percussionActive,
      percussionInstrument: this.getTimbre('percussion').label,
      scheduledEvents: this.scheduledEvents,
      schedulerRecoveries: this.schedulerRecoveries,
      transition: snapshot.transition,
      treble: this.bands.treble,
      textureRoles: this.activeTextureRoles,
      textureSpotlight: this.textureSpotlight,
      textureState: this.textureState,
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
    this.plannedSourceWindows.clear();
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
      this.scheduleAtmosphere(effectTime, profile);
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
        tension: degreeTensionForScene(this.harmonicScene, this.chordDegree),
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
      // An automatic weather change must not cut off the first complete formal
      // arc. Manual Random requests remain immediate because they express an
      // explicit listener choice.
      if (!this.formCycleComplete) return;
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
    const beatSeconds = 60 / Math.max(1, this.transportTempo);
    this.delayA?.delayTime.setTargetAtTime(
      clamp(beatSeconds * 0.5, 0.18, 0.9),
      now,
      0.65,
    );
    this.delayB?.delayTime.setTargetAtTime(
      clamp(beatSeconds * 1.5, 0.48, 1.8),
      now,
      0.65,
    );
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

  private getWaveForInstrument(instrument: InstrumentId, midi = 60) {
    if (!this.context) return undefined;
    const pitchBucket = Math.round(midi / 3) * 3;
    const key = `${instrument}:${pitchBucket}`;
    const cached = this.waveCache.get(key);
    if (cached) return cached;
    const recipe = INSTRUMENTS[instrument];
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
        (deriveSeedNumber(0x51f2e9ad, `${instrument}:${harmonic}`) / 0x100000000) *
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

  private normalizeSourceWindow(start: number, end: number): PlannedSourceWindow {
    const safeStart = Math.max(0, start);
    return {
      end: Math.max(safeStart + 0.001, end),
      start: safeStart,
    };
  }

  private maxPlannedSourceOverlap(start: number, end: number) {
    const candidate = this.normalizeSourceWindow(start, end);
    const events: Array<{ change: -1 | 1; time: number }> = [];
    for (const window of this.plannedSourceWindows.values()) {
      const overlapStart = Math.max(candidate.start, window.start);
      const overlapEnd = Math.min(candidate.end, window.end);
      if (overlapStart >= overlapEnd) continue;
      events.push({ change: 1, time: overlapStart });
      events.push({ change: -1, time: overlapEnd });
    }
    events.sort((left, right) =>
      left.time - right.time || left.change - right.change
    );
    let active = 0;
    let maximum = 0;
    for (const event of events) {
      active += event.change;
      maximum = Math.max(maximum, active);
    }
    return maximum;
  }

  private canScheduleSourceWindow(
    start: number,
    end: number,
    sourceCount = 1,
    overlapLimit = MAX_SOURCE_OVERLAP,
  ) {
    return this.maxPlannedSourceOverlap(start, end) + sourceCount <= overlapLimit;
  }

  private activeSourceCountAt(at: number) {
    let active = 0;
    for (const window of this.plannedSourceWindows.values()) {
      if (window.start <= at && window.end > at) active += 1;
    }
    return active;
  }

  private sourceOverlapLimitForRole(role: keyof OrchestrationPlan) {
    if (role === 'harmony') return HARMONY_OVERLAP_LIMIT;
    if (role === 'brass') return BASS_OVERLAP_LIMIT;
    if (role === 'bass') return BASS_OVERLAP_LIMIT;
    if (role === 'accompaniment') return ACCOMPANIMENT_OVERLAP_LIMIT;
    return MAX_SOURCE_OVERLAP;
  }

  private getToneLayers(
    role: keyof OrchestrationPlan,
    midi: number,
    sourceStart: number,
    sourceEnd: number,
  ): ToneLayer[] {
    const from = this.orchestrationFrom[role];
    const to = this.orchestrationTarget[role];
    const mix = clamp(this.orchestrationMix);
    const dominant = mix < 0.5 ? from : to;
    const overlapLimit = this.sourceOverlapLimitForRole(role);
    const singleLayer = (instrument: InstrumentId): ToneLayer[] => {
      if (!this.canScheduleSourceWindow(sourceStart, sourceEnd, 1, overlapLimit)) {
        return [];
      }
      const wave = this.getWaveForInstrument(instrument, midi);
      return wave
        ? [{
            instrument,
            level: INSTRUMENT_OUTPUT_TRIM[instrument],
            recipe: INSTRUMENTS[instrument],
            wave,
          }]
        : [];
    };
    if (
      from === to ||
      mix <= 0.04 ||
      mix >= 0.96 ||
      !this.canScheduleSourceWindow(
        sourceStart,
        sourceEnd,
        2,
        Math.min(overlapLimit, DUAL_TIMBRE_OVERLAP_LIMIT),
      )
    ) {
      return singleLayer(dominant);
    }
    const fromWave = this.getWaveForInstrument(from, midi);
    const toWave = this.getWaveForInstrument(to, midi);
    if (!fromWave || !toWave) return singleLayer(dominant);
    return [
      {
        instrument: from,
        level:
          Math.cos(mix * Math.PI * 0.5) * INSTRUMENT_OUTPUT_TRIM[from],
        recipe: INSTRUMENTS[from],
        wave: fromWave,
      },
      {
        instrument: to,
        level:
          Math.sin(mix * Math.PI * 0.5) * INSTRUMENT_OUTPUT_TRIM[to],
        recipe: INSTRUMENTS[to],
        wave: toWave,
      },
    ];
  }

  private textureRoleGain(role: TextureRole) {
    if (!this.activeTextureRoles.includes(role)) return 0;
    const leadActive = this.activeTextureRoles.includes('lead');
    const counterActive = this.activeTextureRoles.includes('counter');
    const harmonyActive = this.activeTextureRoles.includes('harmony');
    const activeRoleCount = this.activeTextureRoles.length;
    let gain = 1;
    if (role === 'counter') {
      gain = leadActive ? 0.9 : 1;
    } else if (role === 'harmony') {
      const upperVoiceCount = Math.max(
        1,
        this.soundingChordVoices - Number(this.activeTextureRoles.includes('bass')),
      );
      // Equal-power normalization: denser harmony gains colour, not a sudden
      // loudness jump. Two upper voices are the reference orchestral weight.
      gain = clamp(Math.sqrt(2 / upperVoiceCount), 0.68, 1.08);
      if (leadActive && counterActive) gain *= 0.88;
      else if (leadActive) gain *= 0.95;
    } else if (role === 'bass') {
      gain = harmonyActive ? 0.94 : 1.04;
    } else if (role === 'accompaniment') {
      gain = leadActive ? 0.82 : 0.94;
      if (counterActive) gain *= 0.9;
      if (
        this.phraseTexturePlan?.accompanimentPattern.id === 'arpeggio' ||
        this.phraseTexturePlan?.accompanimentPattern.id === 'syncopated'
      ) gain *= 0.9;
    }
    if (
      activeRoleCount >= 4 &&
      role !== 'lead' &&
      role !== 'bass'
    ) gain *= 0.92;
    if (this.textureSpotlight === role) {
      gain *= role === 'lead' ? 1.06 : 1.08;
    }
    return clamp(gain, 0.58, 1.1);
  }

  private orchestralSectionGain(role: 'brass' | 'percussion') {
    const leadActive = this.activeTextureRoles.includes('lead');
    if (role === 'brass') {
      const densityTrim = this.activeTextureRoles.length >= 4 ? 0.88 : 1;
      return densityTrim * (leadActive ? 0.82 : 0.94);
    }
    return (leadActive ? 0.78 : 0.9) * (this.textureState === 'full' ? 1 : 0.86);
  }

  private getWave(role: keyof OrchestrationPlan, midi = 60) {
    return this.getWaveForInstrument(this.getInstrument(role), midi);
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
    if (this.orchestrationTarget.brass !== this.orchestrationFrom.brass) {
      this.brassContinuousGestureSeconds = 0;
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
        this.formCycleComplete = false;
        this.harmonicScene = nextScene;
        this.openingHarmonicScene = nextScene;
        this.currentAPhraseHarmonyPlan = null;
        this.currentAPhraseMelodyPlan = null;
        this.openingPhraseHarmonyPlan = null;
        this.openingPhraseMelodyPlan = null;
        this.previousPhraseHarmonyPlan = null;
        this.previousPhraseMelodyPlan = null;
        this.previousAccompanimentPattern = null;
        this.phraseOrdinal = 0;
        this.counterpointPairState = null;
        this.leadNeedsResolution = false;
        this.counterNeedsResolution = false;
        this.leadResolutionDirection = 0;
        this.leadResolutionMaximumStep = 0;
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
        this.barsUntilSceneChange = this.options.debugFast
          ? 2
          : 12 + Math.floor(this.harmonyRandom.next() * 9);
      } else if (this.barsUntilSceneChange <= 0 && this.phraseBar === 0) {
        this.formSceneIndex += 1;
        this.formCycleComplete ||=
          this.formSceneIndex >=
            this.emotionalForm.stages.length * this.emotionalForm.scenesPerStage;
        const nextScene = shapeSceneWithEmotionalFormMemory(
          chooseNeighborScene(this.harmonicScene, this.harmonyRandom),
          this.openingHarmonicScene,
          this.emotionalForm,
          this.formSceneIndex,
        );
        this.chordDegree = findPivotDegree(this.harmonicScene, this.chordDegree, nextScene);
        this.harmonicScene = nextScene;
        this.targetArousal = nextScene.arousal;
        this.targetValence = nextScene.valence;
        this.phraseBar = 0;
        sceneChanged = true;
        this.barsUntilSceneChange = this.options.debugFast
          ? 2 + Math.floor(this.harmonyRandom.next() * 2)
          : 12 + Math.floor(this.harmonyRandom.next() * 13);
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
    const textureSegment = textureSegmentAtBar(this.phraseTexturePlan, this.phraseBar);
    const activeRoles = textureSegment?.activeRoles ?? ['lead', 'harmony', 'bass'];
    this.activeTextureRoles = activeRoles;
    this.textureSpotlight = textureSegment?.spotlight ?? 'lead';
    this.textureState = textureSegment?.state ?? 'chamber';
    if (!activeRoles.includes('lead')) this.leadContinuousGestureSeconds = 0;
    if (!activeRoles.includes('counter')) {
      this.counterContinuousGestureSeconds = 0;
      this.counterpointPairState = null;
    }
    const bassActive = activeRoles.includes('bass');
    const harmonyActive = activeRoles.includes('harmony');
    const accompanimentActive = activeRoles.includes('accompaniment');
    const formalStage = emotionalFormStageAt(
      this.emotionalForm,
      this.formSceneIndex,
    );
    this.brassActive = harmonyActive && (
      this.textureState === 'full' ||
      (
        formalStage.id === 'intensification' &&
        (phraseHarmonyEvent?.tensionTarget ?? sceneForChord.tension) >= 0.52
      ) ||
      Boolean(
        phraseHarmonyEvent?.cadential &&
        sceneForChord.arousal >= 0.64 &&
        sceneForChord.tension >= 0.42
      )
    );
    this.percussionActive = (
      this.textureState === 'full' ||
      formalStage.id === 'intensification'
    ) && Boolean(
      phraseHarmonyEvent?.cadential ||
      (phraseHarmonyEvent?.tensionTarget ?? 0) >= 0.68
    );
    const upperHarmonyVoiceCount = harmonyActive
      ? Math.max(1, (textureSegment?.totalChordVoices ?? 3) - (bassActive ? 1 : 0))
      : 0;
    this.soundingChordVoices = (bassActive ? 1 : 0) + upperHarmonyVoiceCount;
    // Voice leading retains one hidden bass anchor even in a bass-less texture;
    // it is a planning constraint, not necessarily a sounding instrument.
    this.harmonicVoiceCount = Math.max(
      1 + upperHarmonyVoiceCount,
      accompanimentActive ? 3 : 1,
    );
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
              degreeTensionForScene(sceneForChord, this.chordDegree) * 0.38,
          )
        : degreeTensionForScene(sceneForChord, this.chordDegree),
      tempo: sceneForChord.tempo,
    });

    // Reserve the finite source budget for the phrase-bearing voices first.
    // Sustained beds, bass reinforcement, handoff layers, noise, and finally
    // accompaniment degrade around them instead of truncating the melody.
    this.scheduleMelodicVoices(
      start,
      beatSeconds,
      spanBars,
      sceneForChord,
      profile,
      activeRoles,
    );

    if (harmonyActive) {
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
      this.currentVoicing
        .slice(1, 1 + upperHarmonyVoiceCount)
        .forEach((midi, index) => {
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
    } else {
      this.harmonyContinuousGestureSeconds = 0;
    }
    const bassMidi = this.currentVoicing[0] ?? chordRootMidi(sceneForChord, this.chordDegree);
    if (bassActive) {
      const previousBassMidi = this.lastBassMidi;
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
    } else {
      this.bassContinuousGestureSeconds = 0;
    }
    if (this.brassActive) {
      const upperVoicing = this.currentVoicing.slice(1);
      const brassVoiceCount = this.textureState === 'full' &&
          phraseHarmonyEvent?.cadential
        ? 2
        : 1;
      upperVoicing.slice(-brassVoiceCount).forEach((midi, index) => {
        const instrument = this.getInstrument('brass');
        const registerMidi = instrument === 'trombone' && midi > 67
          ? midi - 12
          : instrument === 'trumpet' && midi < 60
            ? midi + 12
            : midi;
        this.scheduleBrassVoice(
          start,
          Math.min(duration * 0.88, barSeconds * 1.5),
          registerMidi,
          index,
          profile,
          phraseProgress,
          Boolean(phraseHarmonyEvent?.cadential),
        );
      });
    } else {
      this.brassContinuousGestureSeconds = 0;
    }
    if (this.percussionActive) {
      const percussionBars = phraseHarmonyEvent?.cadential
        ? Math.min(2, spanBars)
        : 1;
      for (let bar = 0; bar < percussionBars; bar += 1) {
        this.scheduleTimpani(
          start + bar * barSeconds,
          bassMidi,
          profile,
          bar === 0 ? 1 : 0.72,
        );
      }
    }
    if (accompanimentActive) {
      this.scheduleAccompaniment(
        start,
        beatSeconds,
        spanBars,
        sceneForChord,
        profile,
      );
    }
    this.nextHarmonyAt = start + duration;
    this.advanceExpressiveTransition(spanBars, sceneForChord.phraseBars);
    this.scheduledBars += spanBars;
    this.phraseBar = (this.phraseBar + spanBars) % sceneForChord.phraseBars;
    this.barsUntilSceneChange -= spanBars;
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
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const padCutoff =
      (620 + profile.brightness * 980 + this.currentArousal * 220 + index * 68) *
      (0.72 + recipe.brightness * 0.54);
    filter.frequency.setValueAtTime(padCutoff, performanceStart);
    filter.frequency.exponentialRampToValueAtTime(
      padCutoff * (1.04 + gesture.dynamic * 0.055),
      performanceStart + Math.max(0.08, duration * 0.56),
    );
    filter.frequency.exponentialRampToValueAtTime(
      padCutoff * 0.94,
      performanceStart + Math.max(0.12, duration),
    );
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
      3.2,
      Math.max(
        0.42,
        idiomaticRelease * gesture.decay.releaseScale,
        duration - sustainDuration + 0.18,
      ),
    );
    const end = performanceStart + sustainDuration + release;
    const peak =
      (opening ? 0.017 : 0.0125) *
      (0.86 + profile.density * 0.24) *
      bedBreath *
      gesture.dynamic *
      this.textureRoleGain('harmony');
    const sourceStart = Math.max(context.currentTime + 0.001, performanceStart - 0.008);
    const sourceEnd = end + 0.025;
    const toneLayers = this.getToneLayers('harmony', midi, sourceStart, sourceEnd);
    if (toneLayers.length === 0) return;
    const toneMixer = context.createGain();
    const oscillators = toneLayers.map((layer) => {
      const oscillator = context.createOscillator();
      const layerGain = context.createGain();
      oscillator.setPeriodicWave(layer.wave);
      oscillator.frequency.setValueAtTime(midiToFrequency(midi), performanceStart);
      layerGain.gain.value = layer.level;
      oscillator.connect(layerGain);
      layerGain.connect(toneMixer);
      return { layer, layerGain, oscillator };
    });
    const detune = this.textureRandom.between(-1.25, 1.25);
    oscillators.forEach(({ layer, oscillator }) => {
      this.scheduleVibrato(
        oscillator.detune,
        performanceStart,
        duration,
        layer.recipe,
        expressionState,
        detune,
        gesture.vibrato,
      );
    });
    envelope.gain.setValueAtTime(0, Math.max(0, performanceStart - 0.008));
    envelope.gain.setValueAtTime(0, performanceStart);
    envelope.gain.linearRampToValueAtTime(peak, performanceStart + attack);
    envelope.gain.setValueAtTime(peak, performanceStart + sustainDuration);
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.006);
    envelope.gain.linearRampToValueAtTime(0, end);

    toneMixer.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.harmonyBus);
    oscillators.forEach(({ oscillator }) => {
      oscillator.start(sourceStart);
      oscillator.stop(sourceEnd);
    });
    this.trackSourceGroup(
      oscillators.map(({ oscillator }) => oscillator),
      [toneMixer, ...oscillators.map(({ layerGain }) => layerGain), filter, envelope, panner],
      sourceStart,
      sourceEnd,
    );
    // A chord bed needs one shared bow/breath texture, not a separate noise
    // source for every pitch. The latter consumed the overlap budget and made
    // later chord voices disappear unpredictably in dense passages.
    if (index === 0) {
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
    }
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
      legatoRequested:
        this.bassContinuousGestureSeconds > 0 && expressionState.articulation > 0.94,
      metricStrength: accent,
      phraseProgress,
      variation: this.textureRandom.between(-0.018, 0.018),
    });
    this.bassContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    const performanceStart = start + gesture.boundary.breakBeforeSeconds;
    const body = Math.max(
      0.3,
      duration * gesture.articulation + gesture.connection.overlapSeconds,
    );
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const bassCutoff =
      (270 + profile.warmth * 260) * (0.76 + recipe.brightness * 0.62);
    filter.frequency.setValueAtTime(bassCutoff, performanceStart);
    filter.frequency.exponentialRampToValueAtTime(
      bassCutoff * (1.03 + gesture.dynamic * 0.045),
      performanceStart + Math.max(0.06, body * 0.52),
    );
    filter.frequency.exponentialRampToValueAtTime(
      bassCutoff * 0.91,
      performanceStart + Math.max(0.1, body),
    );
    const envelope = context.createGain();
    const idiomaticRelease = gesture.decay.kind === 'natural'
      ? Math.min(recipe.release, gesture.decay.naturalDecaySeconds)
      : recipe.release;
    const release = Math.min(1.8, idiomaticRelease * gesture.decay.releaseScale);
    const end = performanceStart + body + release;
    const attack = Math.min(body * 0.42, recipe.attack * gesture.attackScale);
    const peak =
      (0.017 + profile.warmth * 0.006) *
      accent *
      gesture.dynamic *
      this.textureRoleGain('bass');
    const sourceStart = Math.max(context.currentTime + 0.001, performanceStart - 0.008);
    const sourceEnd = end + 0.025;
    const toneLayers = this.getToneLayers('bass', midi, sourceStart, sourceEnd);
    if (toneLayers.length === 0) return;
    const toneMixer = context.createGain();
    const baseDetune = this.textureRandom.between(-0.8, 0.8);
    const oscillators = toneLayers.map((layer) => {
      const oscillator = context.createOscillator();
      const layerGain = context.createGain();
      oscillator.setPeriodicWave(layer.wave);
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
        layer.recipe,
        expressionState,
        baseDetune,
        gesture.vibrato,
      );
      layerGain.gain.value = layer.level;
      oscillator.connect(layerGain);
      layerGain.connect(toneMixer);
      return { layerGain, oscillator };
    });
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
    toneMixer.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.harmonyBus);
    oscillators.forEach(({ oscillator }) => {
      oscillator.start(sourceStart);
      oscillator.stop(sourceEnd);
    });
    this.trackSourceGroup(
      oscillators.map(({ oscillator }) => oscillator),
      [toneMixer, ...oscillators.map(({ layerGain }) => layerGain), filter, envelope],
      sourceStart,
      sourceEnd,
    );
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

  private scheduleBrassVoice(
    start: number,
    duration: number,
    midi: number,
    index: number,
    profile: WeatherProfile,
    phraseProgress: number,
    cadential: boolean,
  ) {
    if (!this.context || !this.harmonyBus) return;
    const context = this.context;
    const recipe = this.getTimbre('brass');
    const expressionState = this.getPerformancePlan().harmony;
    const instrument = this.getInstrument('brass');
    const gesture = planNoteGesture({
      connectionRandom: this.textureRandom.next(),
      continuousGestureSeconds: this.brassContinuousGestureSeconds,
      durationSeconds: duration,
      expression: expressionState,
      instrument,
      intervalSemitones: 0,
      legatoRequested: this.brassContinuousGestureSeconds > 0,
      metricStrength: cadential ? 0.94 : 0.74,
      phraseProgress,
      phraseRole: cadential ? 'cadence' : 'continuation',
      variation: this.textureRandom.between(-0.015, 0.015),
    });
    this.brassContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    const performanceStart = start + gesture.boundary.breakBeforeSeconds;
    const body = Math.max(0.3, duration * (0.78 + gesture.articulation * 0.18));
    const release = Math.min(1.45, recipe.release * gesture.decay.releaseScale);
    const end = performanceStart + body + release;
    const sourceStart = Math.max(context.currentTime + 0.001, performanceStart - 0.008);
    const sourceEnd = end + 0.025;
    const toneLayers = this.getToneLayers('brass', midi, sourceStart, sourceEnd);
    if (toneLayers.length === 0) return;
    const toneMixer = context.createGain();
    const oscillators = toneLayers.map((layer) => {
      const oscillator = context.createOscillator();
      const layerGain = context.createGain();
      oscillator.setPeriodicWave(layer.wave);
      oscillator.frequency.setValueAtTime(midiToFrequency(midi), performanceStart);
      layerGain.gain.value = layer.level;
      oscillator.connect(layerGain);
      layerGain.connect(toneMixer);
      return { layer, layerGain, oscillator };
    });
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = (1350 + profile.brightness * 1850) *
      (0.72 + recipe.brightness * 0.54);
    filter.frequency.setValueAtTime(cutoff * 0.78, performanceStart);
    filter.frequency.exponentialRampToValueAtTime(
      cutoff,
      performanceStart + Math.min(body * 0.56, 0.72),
    );
    filter.Q.value = 0.32;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = (index === 0 ? -0.12 : 0.12) * profile.spread;
    const peak =
      (cadential ? 0.0088 : 0.0068) *
      gesture.dynamic *
      this.orchestralSectionGain('brass');
    const attack = Math.min(0.34, Math.max(0.045, recipe.attack * gesture.attackScale));
    envelope.gain.setValueAtTime(0, Math.max(0, performanceStart - 0.008));
    envelope.gain.setValueAtTime(0, performanceStart);
    envelope.gain.linearRampToValueAtTime(peak, performanceStart + attack);
    envelope.gain.setValueAtTime(peak * 0.86, performanceStart + body * 0.72);
    envelope.gain.exponentialRampToValueAtTime(0.00001, end - 0.006);
    envelope.gain.linearRampToValueAtTime(0, end);
    const detune = this.textureRandom.between(-1.1, 1.1);
    oscillators.forEach(({ layer, oscillator }) => {
      this.scheduleVibrato(
        oscillator.detune,
        performanceStart,
        body,
        layer.recipe,
        expressionState,
        detune,
        gesture.vibrato,
      );
    });
    toneMixer.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.harmonyBus);
    oscillators.forEach(({ oscillator }) => {
      oscillator.start(sourceStart);
      oscillator.stop(sourceEnd);
    });
    this.trackSourceGroup(
      oscillators.map(({ oscillator }) => oscillator),
      [toneMixer, ...oscillators.map(({ layerGain }) => layerGain), filter, envelope, panner],
      sourceStart,
      sourceEnd,
    );
    if (index === 0) {
      this.scheduleTimbreNoise(
        performanceStart,
        Math.min(body + release, 1.8),
        midi,
        peak,
        recipe,
        'brass',
        panner.pan.value,
        profile,
      );
    }
    this.scheduledEvents += 1;
  }

  private scheduleTimpani(
    start: number,
    bassMidi: number,
    profile: WeatherProfile,
    accent: number,
  ) {
    if (!this.context || !this.harmonyBus) return;
    const context = this.context;
    const midi = clamp(bassMidi - 7, 36, 48);
    const duration = 1.15 + profile.space * 0.55;
    const sourceStart = Math.max(context.currentTime + 0.001, start - 0.008);
    const sourceEnd = start + duration + 0.025;
    const toneLayers = this.getToneLayers('percussion', midi, sourceStart, sourceEnd);
    if (toneLayers.length === 0) return;
    const toneMixer = context.createGain();
    const oscillators = toneLayers.map((layer) => {
      const oscillator = context.createOscillator();
      const layerGain = context.createGain();
      oscillator.setPeriodicWave(layer.wave);
      const frequency = midiToFrequency(midi);
      oscillator.frequency.setValueAtTime(frequency * 1.035, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.11);
      layerGain.gain.value = layer.level;
      oscillator.connect(layerGain);
      layerGain.connect(toneMixer);
      return { layerGain, oscillator };
    });
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260 + profile.warmth * 170;
    filter.Q.value = 0.58;
    const envelope = context.createGain();
    const peak =
      0.0135 *
      accent *
      this.orchestralSectionGain('percussion');
    envelope.gain.setValueAtTime(0, Math.max(0, start - 0.008));
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration - 0.006);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    toneMixer.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.harmonyBus);
    oscillators.forEach(({ oscillator }) => {
      oscillator.start(sourceStart);
      oscillator.stop(sourceEnd);
    });
    this.trackSourceGroup(
      oscillators.map(({ oscillator }) => oscillator),
      [toneMixer, ...oscillators.map(({ layerGain }) => layerGain), filter, envelope],
      sourceStart,
      sourceEnd,
    );
    this.scheduleTimbreNoise(
      start,
      duration,
      midi,
      peak,
      this.getTimbre('percussion'),
      'percussion',
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
    activeRoles: readonly TextureRole[],
  ) {
    if (!this.context || !this.effectsBus) return;
    const meter = METERS[scene.meterIndex];
    const melodicSlice = slicePhraseMelody(
      this.phraseMelodyPlan,
      this.phraseBar,
      spanBars,
      meter.beatsPerBar,
    );
    const leadEvents: PhraseMelodyEvent[] = activeRoles.includes('lead')
      ? [...melodicSlice.leadEvents]
      : [];
    const counterEvents: PhraseMelodyEvent[] = activeRoles.includes('counter')
      ? [...melodicSlice.counterEvents]
      : [];
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
    let localLeadNeedsResolution = this.leadNeedsResolution;
    let localCounterNeedsResolution = this.counterNeedsResolution;
    let localLeadResolutionDirection = this.leadResolutionDirection;
    let localLeadResolutionMaximumStep = this.leadResolutionMaximumStep;
    let localLeadInterval = this.lastLeadInterval;
    let localCounterInterval = this.lastCounterInterval;
    const harmonyNotes = activeRoles.includes('harmony')
      ? this.currentVoicing.slice(1)
      : [];
    const soundingBassMidi = activeRoles.includes('bass')
      ? this.currentVoicing[0] ?? chordRootMidi(scene, this.chordDegree)
      : undefined;
    type PendingMelody = {
      event: PhraseMelodyEvent;
      index: number;
      midi: number;
      role: 'lead' | 'counter';
      voiceEventCount: number;
    };
    const pending: PendingMelody[] = [];

    for (const item of melodicTimeline) {
      const { event, index, role, voiceEventCount } = item;
      const previous = role === 'lead' ? localLeadMidi : localCounterMidi;
      const mustResolve = role === 'lead'
        ? localLeadNeedsResolution
        : localCounterNeedsResolution;
      const cadenceArrival = phraseEndsWithChord &&
        event.phraseRole === 'cadence' &&
        !event.mustResolveNext &&
        index === voiceEventCount - 1;
      const plannedTargetMidi = event.retainPreviousPitch
        ? previous
        : event.targetMidi;
      const directionDelta = plannedTargetMidi - previous;
      const plannedDirection: -1 | 0 | 1 = directionDelta > 0.8
        ? 1
        : directionDelta < -0.8
          ? -1
          : 0;
      const direction = role === 'lead' && mustResolve && localLeadResolutionDirection !== 0
        ? localLeadResolutionDirection
        : plannedDirection;
      const targetPitchClass = event.retainPreviousPitch
        ? ((previous % 12) + 12) % 12
        : motifPitchClass(scene, event.motifDegree);
      const phraseOpening = role === 'lead' &&
        event.phraseBeat === this.phraseMelodyPlan.leadEvents[0]?.phraseBeat;
      const midi = event.plannedMidi ?? pickMelodyMidi(
        scene,
        this.chordDegree,
        previous,
        this.melodyRandom,
        {
          allowAccentedDissonance: event.accentedDissonanceAllowed,
          backgroundNotes: [
            ...(soundingBassMidi === undefined ? [] : [soundingBassMidi]),
            ...harmonyNotes,
          ],
          bassMidi: soundingBassMidi,
          direction,
          maximumInterval: role === 'lead' && mustResolve
            ? localLeadResolutionMaximumStep || 2
            : phraseOpening
              ? 5
              : 7,
          metricStrength: event.metricStrength,
          mustResolve: mustResolve || cadenceArrival,
          otherVoiceMidi: role === 'counter'
            ? localLeadMidi
            : counterEvents.length > 0
              ? localCounterMidi
              : undefined,
          previousInterval: role === 'lead'
            ? localLeadInterval
            : localCounterInterval,
          registerHigh: role === 'lead'
            ? this.phraseMelodyPlan.registerArc.leadHighMidi
            : this.phraseMelodyPlan.registerArc.counterHighMidi,
          registerLow: role === 'lead'
            ? this.phraseMelodyPlan.registerArc.leadLowMidi
            : this.phraseMelodyPlan.registerArc.counterLowMidi,
          phraseRole: event.phraseRole,
          targetMidi: plannedTargetMidi,
          targetPitchClass,
        },
      );
      const chordTone = isChordTone(scene, this.chordDegree, midi);
      if (role === 'lead') {
        localLeadInterval = midi - previous;
        localLeadMidi = midi;
        localLeadNeedsResolution = !chordTone || event.mustResolveNext;
        if (event.mustResolveNext) {
          localLeadResolutionDirection = event.resolutionDirection;
          localLeadResolutionMaximumStep = event.resolutionMaximumStep;
        } else if (mustResolve) {
          localLeadResolutionDirection = 0;
          localLeadResolutionMaximumStep = 0;
        }
      } else {
        localCounterInterval = midi - previous;
        localCounterMidi = midi;
        localCounterNeedsResolution = !chordTone || event.mustResolveNext;
      }
      pending.push({ event, index, midi, role, voiceEventCount });
    }

    const realizedLead = pending
      .filter((item) => item.role === 'lead')
      .map((item): RealizedPhraseMelodyEvent => ({ ...item.event, midi: item.midi }));
    const realizedCounter = pending
      .filter((item) => item.role === 'counter')
      .map((item): RealizedPhraseMelodyEvent => ({ ...item.event, midi: item.midi }));
    const reconciled = reconcilePhraseCounterpoint(realizedLead, realizedCounter, {
      allowedPitchClasses: MODES[scene.modeIndex].intervals.map((interval) =>
        (scene.tonic + interval) % 12),
      counterHighMidi: this.phraseMelodyPlan.registerArc.counterHighMidi,
      counterLowMidi: this.phraseMelodyPlan.registerArc.counterLowMidi,
      minimumVoiceGapSemitones: 3,
      previousPair: this.counterpointPairState,
    });
    let leadScheduleIndex = 0;
    let counterScheduleIndex = 0;
    let scheduledLeadPrevious = this.lastMelodyMidi;
    let scheduledCounterPrevious = this.lastCounterMidi;
    const schedulingOrder = [...pending].sort((left, right) =>
      left.role === right.role
        ? left.event.beat - right.event.beat
        : left.role === 'lead'
          ? -1
          : 1
    );
    for (const item of schedulingOrder) {
      const corrected = item.role === 'lead'
        ? reconciled.leadEvents[leadScheduleIndex++]
        : reconciled.counterEvents[counterScheduleIndex++];
      const midi = corrected?.midi ?? item.midi;
      const soundingPrevious = item.role === 'lead'
        ? scheduledLeadPrevious
        : scheduledCounterPrevious;
      const humanizeSeconds = item.event.humanizeBeats * beatSeconds;
      this.maxHumanizeMs = Math.max(
        this.maxHumanizeMs,
        Math.abs(humanizeSeconds) * 1000,
      );
      const noteStart = Math.max(
        start + 0.035,
        start + item.event.beat * beatSeconds + humanizeSeconds,
      );
      const maximumDuration = Math.max(
        0.42,
        start + totalChordBeats * beatSeconds + 0.58 - noteStart,
      );
      const scheduled = this.scheduleMotifNote(
        noteStart,
        midi,
        soundingPrevious,
        profile,
        item.index,
        item.voiceEventCount,
        item.role,
        item.event.accent,
        item.event.metricStrength,
        item.event.durationBeats * beatSeconds,
        maximumDuration,
        item.event.phrasePosition,
        item.event.phraseRole,
      );
      if (!scheduled) continue;
      if (item.role === 'lead') {
        this.leadNoteEvents += 1;
        this.lastLeadInterval = midi - soundingPrevious;
        this.lastMelodyMidi = midi;
        scheduledLeadPrevious = midi;
        this.leadNeedsResolution =
          !isChordTone(scene, this.chordDegree, midi) || item.event.mustResolveNext;
        this.leadResolutionDirection = item.event.mustResolveNext
          ? item.event.resolutionDirection
          : 0;
        this.leadResolutionMaximumStep = item.event.mustResolveNext
          ? item.event.resolutionMaximumStep
          : 0;
      } else {
        this.counterNoteEvents += 1;
        this.lastCounterInterval = midi - soundingPrevious;
        this.lastCounterMidi = midi;
        scheduledCounterPrevious = midi;
        this.counterNeedsResolution =
          !isChordTone(scene, this.chordDegree, midi) || item.event.mustResolveNext;
      }
    }
    if (reconciled.counterEvents.length > 0) {
      this.counterpointPairState = reconciled.terminalPair;
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
    const events = accompanimentEventsForSpan(
      this.phraseTexturePlan.accompanimentPattern,
      scene.meterIndex,
      this.phraseBar,
      spanBars,
    );
    for (const [eventIndex, event] of events.entries()) {
      // voicingOffset already describes the arpeggio's voice path. Rotating it
      // again by scale degree made every chord change jump to a different desk
      // and broke otherwise smooth voice leading.
      const noteIndex = event.voicingOffset % accompanimentVoicing.length;
      let midi = accompanimentVoicing[noteIndex];
      if (midi > 74) midi -= 12;
      const absolutePhraseBeat = this.phraseBar * meter.beatsPerBar + event.beatOffset;
      this.scheduleHarmonicPulse(
        start + event.beatOffset * beatSeconds,
        event.durationBeats * beatSeconds,
        midi,
        event.accent,
        profile,
        eventIndex % 2 === 0 ? -0.16 : 0.16,
        (absolutePhraseBeat / meter.beatsPerBar) / scene.phraseBars,
      );
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
    if (!this.context || !this.harmonyBus) return;
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
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const pulseCutoff =
      (820 + profile.brightness * 1160) * (0.7 + recipe.brightness * 0.62);
    filter.frequency.setValueAtTime(pulseCutoff, start);
    filter.frequency.exponentialRampToValueAtTime(
      pulseCutoff * 0.76,
      start + Math.max(0.05, duration),
    );
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
    const peak =
      (0.0042 + this.currentArousal * 0.0032) *
      accent *
      dynamic *
      this.textureRoleGain('accompaniment');
    const sourceStart = Math.max(context.currentTime + 0.001, start - 0.008);
    const sourceEnd = end + 0.025;
    const toneLayers = this.getToneLayers(
      'accompaniment',
      midi,
      sourceStart,
      sourceEnd,
    );
    if (toneLayers.length === 0) return;
    const toneMixer = context.createGain();
    const oscillators = toneLayers.map((layer) => {
      const oscillator = context.createOscillator();
      const layerGain = context.createGain();
      oscillator.setPeriodicWave(layer.wave);
      oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
      layerGain.gain.value = layer.level;
      oscillator.connect(layerGain);
      layerGain.connect(toneMixer);
      return { layerGain, oscillator };
    });
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
    toneMixer.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.harmonyBus);
    oscillators.forEach(({ oscillator }) => {
      oscillator.start(sourceStart);
      oscillator.stop(sourceEnd);
    });
    this.trackSourceGroup(
      oscillators.map(({ oscillator }) => oscillator),
      [toneMixer, ...oscillators.map(({ layerGain }) => layerGain), filter, envelope, panner],
      sourceStart,
      sourceEnd,
    );
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
    phraseRole: PhraseRole,
  ) {
    if (
      !this.context ||
      !this.effectsBus ||
      !this.melodyBus
    ) return false;
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
      legatoRequested:
        continuousGestureSeconds > 0 &&
        expressionState.articulation > (role === 'lead' ? 0.7 : 0.76),
      metricStrength,
      phraseProgress,
      phraseRole,
      variation: this.textureRandom.between(-0.025, 0.025),
    });
    const performanceStart = start + gesture.boundary.breakBeforeSeconds;
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
    const sourceStart = Math.max(context.currentTime + 0.001, performanceStart - 0.008);
    const sourceEnd = performanceStart + duration + 0.025;
    const toneLayers = this.getToneLayers(role, midi, sourceStart, sourceEnd);
    if (toneLayers.length === 0) return false;
    if (role === 'lead') {
      this.leadContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    } else {
      this.counterContinuousGestureSeconds = gesture.boundary.continuousSecondsAfter;
    }
    const toneMixer = context.createGain();
    const frequency = midiToFrequency(midi);
    const oscillators = toneLayers.map((layer) => {
      const oscillator = context.createOscillator();
      const layerGain = context.createGain();
      oscillator.setPeriodicWave(layer.wave);
      if (gesture.connection.kind === 'portamento' && gesture.connection.glideSeconds > 0) {
        oscillator.frequency.setValueAtTime(midiToFrequency(previousMidi), performanceStart);
        oscillator.frequency.exponentialRampToValueAtTime(
          frequency,
          performanceStart + gesture.connection.glideSeconds,
        );
      } else {
        oscillator.frequency.setValueAtTime(frequency, performanceStart);
      }
      layerGain.gain.value = layer.level;
      oscillator.connect(layerGain);
      layerGain.connect(toneMixer);
      return { layer, layerGain, oscillator };
    });
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const motifCutoff =
      ((role === 'lead' ? 1420 : 1050) +
        profile.brightness * (role === 'lead' ? 2300 : 1700)) *
      (0.72 + recipe.brightness * 0.58);
    const filterFallOffset = Math.max(
      0.09,
      Math.min(duration, maximumDuration, rhythmicDuration + recipe.release),
    );
    const filterRiseOffset = Math.min(
      Math.max(0.04, rhythmicDuration * 0.48),
      filterFallOffset - 0.01,
    );
    filter.frequency.setValueAtTime(motifCutoff * 0.92, performanceStart);
    filter.frequency.exponentialRampToValueAtTime(
      motifCutoff * (1.02 + gesture.dynamic * 0.06),
      performanceStart + filterRiseOffset,
    );
    filter.frequency.exponentialRampToValueAtTime(
      motifCutoff * 0.86,
      performanceStart + filterFallOffset,
    );
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
    const peakBase = role === 'lead'
      ? this.textureRandom.between(0.021, 0.032)
      : this.textureRandom.between(0.006, 0.011);
    const dynamic = gesture.dynamic;
    const peak =
      peakBase *
      accent *
      (0.84 + profile.sparkle * 0.22) *
      dynamic *
      this.textureRoleGain(role);
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
    const baseDetune = this.textureRandom.between(-2.1, 2.1);
    oscillators.forEach(({ layer, oscillator }) => {
      this.scheduleVibrato(
        oscillator.detune,
        performanceStart,
        duration,
        layer.recipe,
        expressionState,
        baseDetune,
        gesture.vibrato,
      );
    });
    toneMixer.connect(highpass);
    highpass.connect(filter);
    filter.connect(presence);
    presence.connect(envelope);
    envelope.connect(panner);
    panner.connect(role === 'lead' ? this.melodyBus : this.effectsBus);
    oscillators.forEach(({ oscillator }) => {
      oscillator.start(sourceStart);
      oscillator.stop(sourceEnd);
    });
    this.trackSourceGroup(
      oscillators.map(({ oscillator }) => oscillator),
      [
        toneMixer,
        ...oscillators.map(({ layerGain }) => layerGain),
        highpass,
        filter,
        presence,
        envelope,
        panner,
      ],
      sourceStart,
      sourceEnd,
    );
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
    return true;
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
      !this.melodyBus
    ) return;
    const breath = recipe.breath ?? 0;
    const transient = recipe.transient ?? 0;
    if (breath + transient < 0.035) return;

    const context = this.context;
    const transientDuration = Math.min(0.12, Math.max(0.035, duration * 0.12));
    const bodyDuration = Math.max(
      transientDuration + 0.02,
      Math.min(duration, transient > breath ? 0.28 + breath * duration : duration),
    );
    const end = start + bodyDuration;
    const sourceStart = Math.max(context.currentTime + 0.001, start - 0.004);
    const sourceEnd = end + 0.015;
    if (!this.canScheduleSourceWindow(
      sourceStart,
      sourceEnd,
      1,
      NOISE_SOURCE_OVERLAP_LIMIT,
    )) return;
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
      sourceStart,
      this.textureRandom.between(0, Math.max(0.01, this.noiseBuffer.duration - 0.4)),
    );
    source.stop(sourceEnd);
    this.trackSource(source, [filter, envelope, panner], sourceStart, sourceEnd);
    this.scheduledEvents += 1;
  }

  private scheduleInteractionRipple(start: number, energy: number) {
    if (!this.context || !this.effectsBus) return;
    const context = this.context;
    const voicing = this.currentVoicing.length > 0 ? this.currentVoicing : [60, 64, 67, 72];
    const index = Math.min(voicing.length - 1, Math.floor(this.interactionX * voicing.length));
    const midi = voicing[index] + (this.interactionY < 0.42 ? 12 : 0);
    const duration = 0.85 + energy * 1.45;
    const sourceStart = Math.max(context.currentTime + 0.001, start - 0.008);
    const sourceEnd = start + duration + 0.025;
    if (!this.canScheduleSourceWindow(sourceStart, sourceEnd)) return;
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
    oscillator.start(sourceStart);
    oscillator.stop(sourceEnd);
    this.trackSource(oscillator, [filter, envelope, panner], sourceStart, sourceEnd);
    this.scheduledEvents += 1;
  }

  private scheduleAtmosphere(start: number, profile: WeatherProfile) {
    if (!this.context || !this.effectsBus || !this.noiseBuffer) return;
    const context = this.context;
    const duration = this.atmosphereRandom.between(2.8, 6.2);
    const sourceStart = Math.max(context.currentTime + 0.001, start - 0.008);
    const sourceEnd = start + duration + 0.025;
    if (!this.canScheduleSourceWindow(
      sourceStart,
      sourceEnd,
      1,
      NOISE_SOURCE_OVERLAP_LIMIT,
    )) return;
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
      sourceStart,
      this.atmosphereRandom.between(0, 0.35),
      duration + 0.016,
    );
    source.stop(sourceEnd);
    this.trackSource(source, [filter, envelope, panner], sourceStart, sourceEnd);
    this.scheduledEvents += 1;
  }

  private trackSource(
    source: AudioScheduledSourceNode,
    nodes: AudioNode[],
    start: number,
    end: number,
  ) {
    this.trackSourceGroup([source], nodes, start, end);
  }

  private trackSourceGroup(
    sources: AudioScheduledSourceNode[],
    nodes: AudioNode[],
    start: number,
    end: number,
  ) {
    const window = this.normalizeSourceWindow(start, end);
    let remaining = sources.length;
    sources.forEach((source) => {
      this.trackedSources.add(source);
      this.plannedSourceWindows.set(source, window);
      source.onended = () => {
        source.disconnect();
        this.trackedSources.delete(source);
        this.plannedSourceWindows.delete(source);
        remaining -= 1;
        if (remaining <= 0) nodes.forEach((node) => node.disconnect());
      };
    });
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
