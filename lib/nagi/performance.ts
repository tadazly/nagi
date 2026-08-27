import {
  clamp,
  type EmotionalFormStage,
  type HarmonicScene,
  type SeededRandom,
  type WeatherProfile,
} from './generative.ts';

export type InstrumentId =
  | 'celesta'
  | 'flute'
  | 'clarinet'
  | 'violin'
  | 'oboe'
  | 'strings'
  | 'choir'
  | 'soft-organ'
  | 'soft-horns'
  | 'cello'
  | 'contrabass'
  | 'bassoon'
  | 'soft-bass'
  | 'harp'
  | 'felt-piano'
  | 'pizzicato'
  | 'marimba';

export type TimbreRecipe = {
  attack: number;
  breath?: number;
  brightness: number;
  label: string;
  partials: readonly number[];
  release: number;
  transient?: number;
  vibratoCents: number;
  vibratoHz: number;
};

export type OrchestrationPlan = {
  accompaniment: InstrumentId;
  bass: InstrumentId;
  counter: InstrumentId;
  harmony: InstrumentId;
  lead: InstrumentId;
};

export type VoiceExpression = {
  articulation: number;
  attackScale: number;
  dynamic: number;
  releaseScale: number;
  swell: number;
  vibratoScale: number;
};

export type PerformancePlan = {
  accompaniment: VoiceExpression;
  bass: VoiceExpression;
  counter: VoiceExpression;
  harmony: VoiceExpression;
  lead: VoiceExpression;
};

/** A note's rhetorical job inside a phrase, independent of its instrument. */
export type PhraseRole =
  | 'pickup'
  | 'statement'
  | 'continuation'
  | 'climax'
  | 'cadence'
  | 'echo';

export type InstrumentFamily =
  | 'air'
  | 'bowed'
  | 'keyboard'
  | 'plucked'
  | 'struck'
  | 'sustained'
  | 'voice';

export type LegatoKind =
  | 'detached'
  | 'fingered-legato'
  | 'slur'
  | 'bowed-legato'
  | 'portamento'
  | 'overlap';

export type GestureBoundaryKind =
  | 'none'
  | 'breath'
  | 'bow-change'
  | 'rearticulation';

export type DecayKind = 'natural' | 'sustained';

export type InstrumentGestureProfile = {
  family: InstrumentFamily;
  legato: {
    kind: Exclude<LegatoKind, 'detached' | 'portamento'> | 'none';
    maxIntervalSemitones: number;
    overlapSeconds: number;
    portamentoChance: number;
    portamentoMaxIntervalSemitones: number;
    portamentoSeconds: readonly [number, number];
  };
  continuity: {
    boundary: Exclude<GestureBoundaryKind, 'none'> | 'none';
    maxSeconds: number;
    resetSeconds: number;
  };
  decay: {
    kind: DecayKind;
    naturalDecaySeconds: number;
    sustainLevel: number;
  };
  vibrato: {
    depthScale: number;
    minimumDurationSeconds: number;
    onsetSeconds: number;
    rampSeconds: number;
  };
};

export type NoteExpression = VoiceExpression & {
  phraseRole: PhraseRole;
};

export type NoteGestureInput = {
  connectionRandom?: number;
  continuousGestureSeconds?: number;
  durationSeconds: number;
  expression: VoiceExpression;
  instrument: InstrumentId;
  intervalSemitones?: number;
  legatoRequested?: boolean;
  metricStrength: number;
  phraseProgress: number;
  phraseRole?: PhraseRole;
  variation?: number;
};

export type NoteGesturePlan = {
  articulation: number;
  attackScale: number;
  boundary: {
    breakAfterSeconds: number;
    breakBeforeSeconds: number;
    continuousSecondsAfter: number;
    kind: GestureBoundaryKind;
  };
  connection: {
    glideSeconds: number;
    kind: LegatoKind;
    overlapSeconds: number;
  };
  decay: {
    kind: DecayKind;
    naturalDecaySeconds: number;
    releaseScale: number;
    sustainLevel: number;
  };
  dynamic: number;
  phraseRole: PhraseRole;
  vibrato: {
    depthCents: number;
    enabled: boolean;
    onsetSeconds: number;
    rampSeconds: number;
    rateHz: number;
  };
};

const PARTIAL_COUNT = 9;

export const INSTRUMENTS: Readonly<Record<InstrumentId, TimbreRecipe>> = {
  celesta: {
    attack: 0.014,
    brightness: 0.92,
    label: 'celesta',
    partials: [0, 1, 0.34, 0.09, 0.2, 0.035, 0.018, 0.028, 0.012],
    release: 1.28,
    transient: 0.24,
    vibratoCents: 0.35,
    vibratoHz: 5.1,
  },
  flute: {
    attack: 0.075,
    breath: 0.3,
    brightness: 0.58,
    label: 'flute',
    partials: [0, 1, 0.17, 0.052, 0.022, 0.011, 0.006, 0.003, 0.002],
    release: 0.72,
    vibratoCents: 7.4,
    vibratoHz: 5.2,
  },
  clarinet: {
    attack: 0.052,
    breath: 0.12,
    brightness: 0.48,
    label: 'clarinet',
    partials: [0, 1, 0.045, 0.31, 0.026, 0.13, 0.014, 0.065, 0.009],
    release: 0.62,
    vibratoCents: 3.8,
    vibratoHz: 4.8,
  },
  violin: {
    attack: 0.115,
    breath: 0.08,
    brightness: 0.72,
    label: 'violin',
    partials: [0, 1, 0.72, 0.48, 0.31, 0.21, 0.15, 0.1, 0.065],
    release: 0.92,
    vibratoCents: 9.6,
    vibratoHz: 5.7,
  },
  oboe: {
    attack: 0.058,
    breath: 0.18,
    brightness: 0.76,
    label: 'oboe',
    partials: [0, 1, 0.61, 0.33, 0.24, 0.15, 0.095, 0.058, 0.034],
    release: 0.58,
    vibratoCents: 4.4,
    vibratoHz: 5.0,
  },
  strings: {
    attack: 0.46,
    breath: 0.07,
    brightness: 0.57,
    label: 'string ensemble',
    partials: [0, 1, 0.57, 0.31, 0.18, 0.105, 0.061, 0.035, 0.02],
    release: 1.85,
    vibratoCents: 4.2,
    vibratoHz: 5.4,
  },
  choir: {
    attack: 0.62,
    breath: 0.16,
    brightness: 0.38,
    label: 'wordless choir',
    partials: [0, 1, 0.21, 0.105, 0.051, 0.025, 0.012, 0.006, 0.003],
    release: 2.2,
    vibratoCents: 2.8,
    vibratoHz: 4.6,
  },
  'soft-organ': {
    attack: 0.11,
    brightness: 0.45,
    label: 'soft organ',
    partials: [0, 1, 0.47, 0.28, 0.16, 0.095, 0.052, 0.03, 0.017],
    release: 1.05,
    vibratoCents: 1.2,
    vibratoHz: 5.0,
  },
  'soft-horns': {
    attack: 0.34,
    breath: 0.1,
    brightness: 0.5,
    label: 'soft horns',
    partials: [0, 1, 0.38, 0.19, 0.095, 0.047, 0.024, 0.012, 0.006],
    release: 1.5,
    vibratoCents: 2.2,
    vibratoHz: 4.9,
  },
  cello: {
    attack: 0.16,
    breath: 0.05,
    brightness: 0.44,
    label: 'cello',
    partials: [0, 1, 0.49, 0.25, 0.13, 0.07, 0.038, 0.021, 0.012],
    release: 1.05,
    vibratoCents: 5.5,
    vibratoHz: 5.0,
  },
  contrabass: {
    attack: 0.24,
    brightness: 0.28,
    label: 'contrabass',
    partials: [0, 1, 0.34, 0.14, 0.062, 0.029, 0.014, 0.007, 0.003],
    release: 1.42,
    vibratoCents: 2.6,
    vibratoHz: 4.3,
  },
  bassoon: {
    attack: 0.09,
    breath: 0.1,
    brightness: 0.51,
    label: 'bassoon',
    partials: [0, 1, 0.17, 0.29, 0.09, 0.12, 0.038, 0.056, 0.02],
    release: 0.78,
    vibratoCents: 3.1,
    vibratoHz: 4.7,
  },
  'soft-bass': {
    attack: 0.08,
    brightness: 0.22,
    label: 'soft bass',
    partials: [0, 1, 0.13, 0.045, 0.017, 0.007, 0.003, 0.001, 0],
    release: 1.18,
    vibratoCents: 0.7,
    vibratoHz: 4.2,
  },
  harp: {
    attack: 0.012,
    brightness: 0.9,
    label: 'harp',
    partials: [0, 1, 0.48, 0.25, 0.14, 0.08, 0.045, 0.026, 0.015],
    release: 0.92,
    transient: 0.22,
    vibratoCents: 0.2,
    vibratoHz: 5.0,
  },
  'felt-piano': {
    attack: 0.009,
    brightness: 0.64,
    label: 'felt piano',
    partials: [0, 1, 0.4, 0.17, 0.075, 0.035, 0.017, 0.009, 0.004],
    release: 0.72,
    transient: 0.28,
    vibratoCents: 0.15,
    vibratoHz: 5.0,
  },
  pizzicato: {
    attack: 0.008,
    brightness: 0.76,
    label: 'pizzicato strings',
    partials: [0, 1, 0.58, 0.31, 0.17, 0.095, 0.052, 0.029, 0.016],
    release: 0.38,
    transient: 0.32,
    vibratoCents: 0.1,
    vibratoHz: 5.0,
  },
  marimba: {
    attack: 0.011,
    brightness: 0.55,
    label: 'marimba',
    partials: [0, 1, 0.08, 0.23, 0.035, 0.075, 0.018, 0.032, 0.009],
    release: 0.62,
    transient: 0.26,
    vibratoCents: 0.1,
    vibratoHz: 5.0,
  },
};

type GestureProfileOptions = {
  boundary?: InstrumentGestureProfile['continuity']['boundary'];
  decayKind?: DecayKind;
  depthScale?: number;
  family: InstrumentFamily;
  legatoKind?: InstrumentGestureProfile['legato']['kind'];
  maxContinuousSeconds?: number;
  maxIntervalSemitones?: number;
  naturalDecaySeconds?: number;
  overlapSeconds?: number;
  portamentoChance?: number;
  portamentoMaxIntervalSemitones?: number;
  portamentoSeconds?: readonly [number, number];
  resetSeconds?: number;
  sustainLevel?: number;
  vibratoMinimumSeconds?: number;
  vibratoOnsetSeconds?: number;
  vibratoRampSeconds?: number;
};

function gestureProfile(options: GestureProfileOptions): InstrumentGestureProfile {
  return {
    family: options.family,
    legato: {
      kind: options.legatoKind ?? 'none',
      maxIntervalSemitones: options.maxIntervalSemitones ?? 0,
      overlapSeconds: options.overlapSeconds ?? 0,
      portamentoChance: options.portamentoChance ?? 0,
      portamentoMaxIntervalSemitones:
        options.portamentoMaxIntervalSemitones ?? 0,
      portamentoSeconds: options.portamentoSeconds ?? [0, 0],
    },
    continuity: {
      boundary: options.boundary ?? 'none',
      maxSeconds: options.maxContinuousSeconds ?? Number.POSITIVE_INFINITY,
      resetSeconds: options.resetSeconds ?? 0,
    },
    decay: {
      kind: options.decayKind ?? 'sustained',
      naturalDecaySeconds: options.naturalDecaySeconds ?? 0,
      sustainLevel: options.sustainLevel ?? 0.72,
    },
    vibrato: {
      depthScale: options.depthScale ?? 0,
      minimumDurationSeconds: options.vibratoMinimumSeconds ?? Number.POSITIVE_INFINITY,
      onsetSeconds: options.vibratoOnsetSeconds ?? 0,
      rampSeconds: options.vibratoRampSeconds ?? 0,
    },
  };
}

/**
 * Physical-performance limits used by the note scheduler. The values are
 * intentionally conservative: generated gestures should sound playable before
 * they sound conspicuously expressive.
 */
export const INSTRUMENT_GESTURES: Readonly<
  Record<InstrumentId, InstrumentGestureProfile>
> = {
  celesta: gestureProfile({
    decayKind: 'natural',
    family: 'struck',
    naturalDecaySeconds: 1.15,
    sustainLevel: 0.08,
  }),
  flute: gestureProfile({
    boundary: 'breath',
    depthScale: 1,
    family: 'air',
    legatoKind: 'slur',
    maxContinuousSeconds: 8.2,
    maxIntervalSemitones: 12,
    overlapSeconds: 0.014,
    resetSeconds: 0.16,
    sustainLevel: 0.76,
    vibratoMinimumSeconds: 0.72,
    vibratoOnsetSeconds: 0.3,
    vibratoRampSeconds: 0.2,
  }),
  clarinet: gestureProfile({
    boundary: 'breath',
    depthScale: 0.68,
    family: 'air',
    legatoKind: 'fingered-legato',
    maxContinuousSeconds: 9.4,
    maxIntervalSemitones: 12,
    overlapSeconds: 0.012,
    resetSeconds: 0.14,
    sustainLevel: 0.8,
    vibratoMinimumSeconds: 1,
    vibratoOnsetSeconds: 0.4,
    vibratoRampSeconds: 0.24,
  }),
  violin: gestureProfile({
    boundary: 'bow-change',
    depthScale: 1,
    family: 'bowed',
    legatoKind: 'bowed-legato',
    maxContinuousSeconds: 4.8,
    maxIntervalSemitones: 12,
    overlapSeconds: 0.018,
    portamentoChance: 0.2,
    portamentoMaxIntervalSemitones: 7,
    portamentoSeconds: [0.035, 0.09],
    resetSeconds: 0.02,
    sustainLevel: 0.78,
    vibratoMinimumSeconds: 0.64,
    vibratoOnsetSeconds: 0.24,
    vibratoRampSeconds: 0.18,
  }),
  oboe: gestureProfile({
    boundary: 'breath',
    depthScale: 0.78,
    family: 'air',
    legatoKind: 'slur',
    maxContinuousSeconds: 7.2,
    maxIntervalSemitones: 10,
    overlapSeconds: 0.012,
    resetSeconds: 0.17,
    sustainLevel: 0.77,
    vibratoMinimumSeconds: 0.82,
    vibratoOnsetSeconds: 0.32,
    vibratoRampSeconds: 0.22,
  }),
  strings: gestureProfile({
    boundary: 'bow-change',
    depthScale: 0.66,
    family: 'bowed',
    legatoKind: 'bowed-legato',
    maxContinuousSeconds: 6.4,
    maxIntervalSemitones: 12,
    overlapSeconds: 0.032,
    portamentoChance: 0.06,
    portamentoMaxIntervalSemitones: 5,
    portamentoSeconds: [0.04, 0.1],
    resetSeconds: 0.028,
    sustainLevel: 0.84,
    vibratoMinimumSeconds: 0.9,
    vibratoOnsetSeconds: 0.38,
    vibratoRampSeconds: 0.3,
  }),
  choir: gestureProfile({
    boundary: 'breath',
    depthScale: 0.55,
    family: 'voice',
    legatoKind: 'overlap',
    maxContinuousSeconds: 9.2,
    maxIntervalSemitones: 7,
    overlapSeconds: 0.04,
    portamentoChance: 0.08,
    portamentoMaxIntervalSemitones: 4,
    portamentoSeconds: [0.045, 0.11],
    resetSeconds: 0.2,
    sustainLevel: 0.88,
    vibratoMinimumSeconds: 1.25,
    vibratoOnsetSeconds: 0.52,
    vibratoRampSeconds: 0.34,
  }),
  'soft-organ': gestureProfile({
    family: 'keyboard',
    legatoKind: 'fingered-legato',
    maxIntervalSemitones: 12,
    overlapSeconds: 0.018,
    sustainLevel: 0.92,
  }),
  'soft-horns': gestureProfile({
    boundary: 'breath',
    depthScale: 0.42,
    family: 'air',
    legatoKind: 'slur',
    maxContinuousSeconds: 6.8,
    maxIntervalSemitones: 9,
    overlapSeconds: 0.018,
    resetSeconds: 0.2,
    sustainLevel: 0.85,
    vibratoMinimumSeconds: 1.3,
    vibratoOnsetSeconds: 0.52,
    vibratoRampSeconds: 0.32,
  }),
  cello: gestureProfile({
    boundary: 'bow-change',
    depthScale: 0.92,
    family: 'bowed',
    legatoKind: 'bowed-legato',
    maxContinuousSeconds: 5.4,
    maxIntervalSemitones: 12,
    overlapSeconds: 0.022,
    portamentoChance: 0.18,
    portamentoMaxIntervalSemitones: 7,
    portamentoSeconds: [0.04, 0.1],
    resetSeconds: 0.024,
    sustainLevel: 0.8,
    vibratoMinimumSeconds: 0.7,
    vibratoOnsetSeconds: 0.28,
    vibratoRampSeconds: 0.2,
  }),
  contrabass: gestureProfile({
    boundary: 'bow-change',
    depthScale: 0.62,
    family: 'bowed',
    legatoKind: 'bowed-legato',
    maxContinuousSeconds: 5.2,
    maxIntervalSemitones: 9,
    overlapSeconds: 0.024,
    portamentoChance: 0.07,
    portamentoMaxIntervalSemitones: 5,
    portamentoSeconds: [0.045, 0.11],
    resetSeconds: 0.03,
    sustainLevel: 0.82,
    vibratoMinimumSeconds: 0.9,
    vibratoOnsetSeconds: 0.36,
    vibratoRampSeconds: 0.26,
  }),
  bassoon: gestureProfile({
    boundary: 'breath',
    depthScale: 0.58,
    family: 'air',
    legatoKind: 'fingered-legato',
    maxContinuousSeconds: 8,
    maxIntervalSemitones: 9,
    overlapSeconds: 0.014,
    resetSeconds: 0.18,
    sustainLevel: 0.8,
    vibratoMinimumSeconds: 1.05,
    vibratoOnsetSeconds: 0.42,
    vibratoRampSeconds: 0.26,
  }),
  'soft-bass': gestureProfile({
    family: 'sustained',
    legatoKind: 'fingered-legato',
    maxIntervalSemitones: 12,
    overlapSeconds: 0.02,
    sustainLevel: 0.9,
  }),
  harp: gestureProfile({
    decayKind: 'natural',
    family: 'plucked',
    naturalDecaySeconds: 1.45,
    sustainLevel: 0.14,
  }),
  'felt-piano': gestureProfile({
    decayKind: 'natural',
    family: 'struck',
    naturalDecaySeconds: 1.1,
    sustainLevel: 0.12,
  }),
  pizzicato: gestureProfile({
    decayKind: 'natural',
    family: 'plucked',
    naturalDecaySeconds: 0.5,
    sustainLevel: 0.06,
  }),
  marimba: gestureProfile({
    decayKind: 'natural',
    family: 'struck',
    naturalDecaySeconds: 0.78,
    sustainLevel: 0.08,
  }),
};

type Weighted<T> = { value: T; weight: number };

function weightedPick<T>(choices: readonly Weighted<T>[], random: SeededRandom) {
  const total = choices.reduce((sum, choice) => sum + Math.max(0.001, choice.weight), 0);
  let cursor = random.next() * total;
  for (const choice of choices) {
    cursor -= Math.max(0.001, choice.weight);
    if (cursor <= 0) return choice.value;
  }
  return choices[choices.length - 1].value;
}

function continuityWeight(id: InstrumentId, current: InstrumentId | undefined) {
  return id === current ? 1.35 : 0;
}

export function chooseOrchestration(
  scene: HarmonicScene,
  stage: EmotionalFormStage,
  profile: WeatherProfile,
  random: SeededRandom,
  current?: OrchestrationPlan,
): OrchestrationPlan {
  const brightJoy = scene.valence * (0.45 + scene.arousal * 0.75);
  const tender = (1 - scene.arousal) * (0.65 + (1 - scene.tension) * 0.35);
  const dramatic = scene.tension * (0.55 + scene.arousal * 0.65);
  const spacious = profile.space * (0.55 + (1 - scene.arousal) * 0.45);
  const intensifying = stage.id === 'intensification' ? 0.75 : 0;

  const lead = weightedPick<InstrumentId>([
    { value: 'celesta', weight: 0.45 + profile.sparkle * 1.25 + brightJoy * 0.5 + continuityWeight('celesta', current?.lead) },
    { value: 'flute', weight: 0.72 + tender * 0.8 + brightJoy * 0.55 + continuityWeight('flute', current?.lead) },
    { value: 'clarinet', weight: 0.68 + (1 - scene.valence) * 0.62 + continuityWeight('clarinet', current?.lead) },
    { value: 'violin', weight: 0.64 + tender * 0.72 + dramatic * 0.58 + continuityWeight('violin', current?.lead) },
    { value: 'oboe', weight: 0.48 + dramatic * 0.76 + profile.warmth * 0.4 + continuityWeight('oboe', current?.lead) },
  ], random);

  let counter = weightedPick<InstrumentId>([
    { value: 'celesta', weight: 0.34 + profile.sparkle * 0.7 + continuityWeight('celesta', current?.counter) },
    { value: 'flute', weight: 0.55 + brightJoy * 0.55 + continuityWeight('flute', current?.counter) },
    { value: 'clarinet', weight: 0.78 + tender * 0.45 + continuityWeight('clarinet', current?.counter) },
    { value: 'violin', weight: 0.58 + dramatic * 0.54 + continuityWeight('violin', current?.counter) },
    { value: 'oboe', weight: 0.42 + dramatic * 0.6 + continuityWeight('oboe', current?.counter) },
  ], random);
  if (counter === lead && random.next() < 0.72) {
    counter = lead === 'flute' ? 'clarinet' : 'flute';
  }

  const harmony = weightedPick<InstrumentId>([
    { value: 'strings', weight: 1.1 + tender * 0.85 + dramatic * 0.32 + continuityWeight('strings', current?.harmony) },
    { value: 'choir', weight: 0.42 + spacious * 1.12 + continuityWeight('choir', current?.harmony) },
    { value: 'soft-organ', weight: 0.58 + profile.warmth * 0.7 + continuityWeight('soft-organ', current?.harmony) },
    { value: 'soft-horns', weight: 0.35 + dramatic * 0.9 + intensifying * 0.45 + continuityWeight('soft-horns', current?.harmony) },
  ], random);

  const bass = weightedPick<InstrumentId>([
    { value: 'cello', weight: 0.82 + tender * 0.6 + continuityWeight('cello', current?.bass) },
    { value: 'contrabass', weight: 0.62 + spacious * 0.5 + (1 - scene.arousal) * 0.45 + continuityWeight('contrabass', current?.bass) },
    { value: 'bassoon', weight: 0.45 + dramatic * 0.64 + scene.valence * 0.25 + continuityWeight('bassoon', current?.bass) },
    { value: 'soft-bass', weight: 0.54 + (1 - scene.tension) * 0.52 + continuityWeight('soft-bass', current?.bass) },
  ], random);

  const accompaniment = weightedPick<InstrumentId>([
    { value: 'harp', weight: 0.66 + tender * 0.7 + brightJoy * 0.28 + continuityWeight('harp', current?.accompaniment) },
    { value: 'felt-piano', weight: 0.92 + (1 - Math.abs(scene.valence - 0.52)) * 0.45 + continuityWeight('felt-piano', current?.accompaniment) },
    { value: 'pizzicato', weight: 0.25 + scene.arousal * 0.92 + brightJoy * 0.38 + continuityWeight('pizzicato', current?.accompaniment) },
    { value: 'marimba', weight: 0.28 + brightJoy * 0.74 + profile.motion * 0.42 + continuityWeight('marimba', current?.accompaniment) },
  ], random);

  const proposal: OrchestrationPlan = {
    accompaniment,
    bass,
    counter,
    harmony,
    lead,
  };
  if (!current) return proposal;

  // Re-orchestrate like an ensemble handing material between desks: preserve
  // most of the palette and change at most two roles at a formal boundary.
  // This prevents a new random draw from sounding like a whole new track.
  const roles = Object.keys(proposal) as Array<keyof OrchestrationPlan>;
  const changed = roles.filter((role) => proposal[role] !== current[role]);
  const budget = stage.id === 'development' || stage.id === 'intensification'
    ? 2
    : 1;
  const roleWeight: Record<keyof OrchestrationPlan, number> = {
    accompaniment: stage.id === 'release' ? 1.1 : 0.8,
    bass: stage.id === 'intensification' ? 1.05 : 0.52,
    counter: stage.id === 'development' ? 1.18 : 0.82,
    harmony: stage.id === 'intensification' ? 1.3 : 0.7,
    lead: stage.id === 'return' ? 0.72 : 1,
  };
  const selected = new Set<keyof OrchestrationPlan>();
  const remaining = [...changed];
  while (selected.size < budget && remaining.length > 0) {
    const role = weightedPick(
      remaining.map((candidate) => ({
        value: candidate,
        weight: roleWeight[candidate],
      })),
      random,
    );
    selected.add(role);
    remaining.splice(remaining.indexOf(role), 1);
  }
  const result = { ...current };
  selected.forEach((role) => {
    result[role] = proposal[role];
  });
  if (result.counter === result.lead) {
    if (selected.has('counter')) {
      result.counter = proposal.counter !== result.lead
        ? proposal.counter
        : result.lead === 'flute' ? 'clarinet' : 'flute';
    } else if (selected.has('lead')) {
      result.lead = proposal.lead !== result.counter
        ? proposal.lead
        : result.counter === 'flute' ? 'clarinet' : 'flute';
    }
  }
  return result;
}

function expression(
  articulation: number,
  attackScale: number,
  dynamic: number,
  releaseScale: number,
  swell: number,
  vibratoScale: number,
): VoiceExpression {
  return {
    articulation: clamp(articulation, 0.32, 1.1),
    attackScale: clamp(attackScale, 0.55, 1.7),
    dynamic: clamp(dynamic, 0.68, 1.18),
    releaseScale: clamp(releaseScale, 0.55, 1.65),
    swell: clamp(swell, 0.02, 0.28),
    vibratoScale: clamp(vibratoScale, 0, 1.25),
  };
}

export function choosePerformancePlan(
  scene: HarmonicScene,
  stage: EmotionalFormStage,
  random: SeededRandom,
): PerformancePlan {
  const stageEnergy = stage.id === 'intensification'
    ? 0.13
    : stage.id === 'development'
      ? 0.05
      : stage.id === 'release'
        ? -0.08
        : 0;
  const phraseConnection = clamp(
    1.04 - scene.arousal * 0.43 + (1 - scene.valence) * 0.1 - scene.tension * 0.07 - stageEnergy,
    0.48,
    1.08,
  );
  const dynamic = clamp(0.82 + scene.arousal * 0.24 + stageEnergy, 0.76, 1.12);
  const softness = 1 - scene.arousal;
  const variance = () => random.between(-0.045, 0.045);

  return {
    lead: expression(
      phraseConnection + variance(),
      0.82 + softness * 0.36,
      dynamic + 0.035,
      0.88 + softness * 0.42,
      0.08 + scene.tension * 0.09 + softness * 0.06,
      0.46 + softness * 0.42 + (1 - scene.valence) * 0.18,
    ),
    counter: expression(
      phraseConnection + 0.055 + variance(),
      0.92 + softness * 0.42,
      dynamic * 0.78,
      1 + softness * 0.38,
      0.07 + scene.tension * 0.07,
      0.38 + softness * 0.34,
    ),
    harmony: expression(
      1.03 + variance() * 0.25,
      1.08 + softness * 0.34,
      0.86 + scene.arousal * 0.08,
      1.18 + softness * 0.24,
      0.09 + scene.tension * 0.08,
      0.22 + softness * 0.2,
    ),
    bass: expression(
      0.83 + softness * 0.16 + variance(),
      0.88 + softness * 0.34,
      0.86 + scene.arousal * 0.12,
      1.04 + softness * 0.28,
      0.055 + scene.tension * 0.07,
      0.2 + softness * 0.25,
    ),
    accompaniment: expression(
      clamp(phraseConnection - 0.16 - scene.arousal * 0.08 + variance(), 0.38, 0.9),
      0.72 + softness * 0.22,
      0.78 + scene.arousal * 0.16,
      0.78 + softness * 0.2,
      0.045 + scene.tension * 0.05,
      0.08,
    ),
  };
}

function interpolateExpression(
  from: VoiceExpression,
  to: VoiceExpression,
  amount: number,
): VoiceExpression {
  const mix = clamp(amount);
  const lerp = (a: number, b: number) => a + (b - a) * mix;
  return {
    articulation: lerp(from.articulation, to.articulation),
    attackScale: lerp(from.attackScale, to.attackScale),
    dynamic: lerp(from.dynamic, to.dynamic),
    releaseScale: lerp(from.releaseScale, to.releaseScale),
    swell: lerp(from.swell, to.swell),
    vibratoScale: lerp(from.vibratoScale, to.vibratoScale),
  };
}

export function interpolatePerformancePlan(
  from: PerformancePlan,
  to: PerformancePlan,
  amount: number,
): PerformancePlan {
  return {
    accompaniment: interpolateExpression(from.accompaniment, to.accompaniment, amount),
    bass: interpolateExpression(from.bass, to.bass, amount),
    counter: interpolateExpression(from.counter, to.counter, amount),
    harmony: interpolateExpression(from.harmony, to.harmony, amount),
    lead: interpolateExpression(from.lead, to.lead, amount),
  };
}

export function articulationName(expressionState: VoiceExpression) {
  if (expressionState.articulation < 0.5) return 'staccato';
  if (expressionState.articulation < 0.7) return 'portato';
  if (expressionState.articulation < 0.94) return 'tenuto';
  if (expressionState.releaseScale > 1.22) return 'sostenuto';
  return 'legato';
}

export function phraseDynamic(
  expressionState: VoiceExpression,
  phraseProgress: number,
  metricStrength: number,
  variation = 0,
) {
  const progress = clamp(phraseProgress);
  const arch = Math.sin(progress * Math.PI);
  const cadenceEase = smoothCadence(progress);
  return clamp(
    expressionState.dynamic *
      (1 + arch * expressionState.swell - cadenceEase * expressionState.swell * 0.42) *
      (0.9 + metricStrength * 0.1 + variation),
    0.62,
    1.22,
  );
}

type PhraseRoleShape = {
  articulation: number;
  attack: number;
  dynamic: number;
  release: number;
  swell: number;
  vibrato: number;
};

const PHRASE_ROLE_SHAPES: Readonly<Record<PhraseRole, PhraseRoleShape>> = {
  pickup: {
    articulation: 0.84,
    attack: 0.9,
    dynamic: 0.88,
    release: 0.8,
    swell: 0.72,
    vibrato: 0.5,
  },
  statement: {
    articulation: 0.96,
    attack: 0.92,
    dynamic: 1.02,
    release: 1,
    swell: 0.92,
    vibrato: 0.78,
  },
  continuation: {
    articulation: 1,
    attack: 1,
    dynamic: 0.98,
    release: 1,
    swell: 1,
    vibrato: 0.9,
  },
  climax: {
    articulation: 1.03,
    attack: 0.88,
    dynamic: 1.1,
    release: 1.06,
    swell: 1.12,
    vibrato: 1.12,
  },
  cadence: {
    articulation: 1.05,
    attack: 1.04,
    dynamic: 0.94,
    release: 1.16,
    swell: 0.84,
    vibrato: 0.78,
  },
  echo: {
    articulation: 0.9,
    attack: 1.12,
    dynamic: 0.79,
    release: 1.08,
    swell: 0.62,
    vibrato: 0.54,
  },
};

/**
 * A deterministic default phrase-role classifier. Callers with structural
 * knowledge (for example a planned appoggiatura or echo) should pass the role
 * explicitly to `planNoteGesture` instead.
 */
export function inferPhraseRole(
  phraseProgress: number,
  metricStrength: number,
): PhraseRole {
  const progress = clamp(phraseProgress);
  const strength = clamp(metricStrength);
  if (progress < 0.1) return strength < 0.68 ? 'pickup' : 'statement';
  if (progress >= 0.82) return 'cadence';
  if (progress >= 0.5 && progress <= 0.72 && strength >= 0.72) return 'climax';
  return 'continuation';
}

/** Apply phrase rhetoric to one note without mutating the scene-level plan. */
export function shapeNoteExpression(
  expressionState: VoiceExpression,
  phraseRole: PhraseRole,
  phraseProgress: number,
  metricStrength: number,
  variation = 0,
): NoteExpression {
  const shape = PHRASE_ROLE_SHAPES[phraseRole];
  return {
    articulation: clamp(
      expressionState.articulation * shape.articulation,
      0.32,
      1.1,
    ),
    attackScale: clamp(expressionState.attackScale * shape.attack, 0.5, 1.8),
    dynamic: clamp(
      phraseDynamic(
        expressionState,
        phraseProgress,
        metricStrength,
        clamp(variation, -0.08, 0.08),
      ) * shape.dynamic,
      0.58,
      1.24,
    ),
    phraseRole,
    releaseScale: clamp(
      expressionState.releaseScale * shape.release,
      0.5,
      1.8,
    ),
    swell: clamp(expressionState.swell * shape.swell, 0.015, 0.3),
    vibratoScale: clamp(
      expressionState.vibratoScale * shape.vibrato,
      0,
      1.3,
    ),
  };
}

/**
 * Resolve a playable note gesture for a concrete instrument. The function is
 * pure and consumes no random stream; pass a stable [0, 1] draw through
 * `connectionRandom` when occasional string/voice portamento is desired.
 */
export function planNoteGesture(input: NoteGestureInput): NoteGesturePlan {
  const profile = INSTRUMENT_GESTURES[input.instrument];
  const recipe = INSTRUMENTS[input.instrument];
  const duration = Math.max(0.04, input.durationSeconds);
  const interval = Math.abs(input.intervalSemitones ?? 0);
  const role = input.phraseRole ?? inferPhraseRole(
    input.phraseProgress,
    input.metricStrength,
  );
  const shaped = shapeNoteExpression(
    input.expression,
    role,
    input.phraseProgress,
    input.metricStrength,
    input.variation,
  );
  const continuousBefore = Math.max(0, input.continuousGestureSeconds ?? 0);
  const continuity = profile.continuity;
  const hasContinuityLimit = Number.isFinite(continuity.maxSeconds);
  const exceedsContinuity =
    hasContinuityLimit && continuousBefore + duration > continuity.maxSeconds;
  const plannedPhraseReset =
    hasContinuityLimit &&
    role === 'statement' &&
    continuousBefore > continuity.maxSeconds * 0.72;
  const breakBeforeSeconds = exceedsContinuity || plannedPhraseReset
    ? continuity.resetSeconds
    : 0;
  const breakAfterSeconds =
    continuity.boundary !== 'none' &&
    (role === 'cadence' || role === 'echo')
      ? continuity.resetSeconds
      : 0;
  const boundaryKind: GestureBoundaryKind = breakBeforeSeconds > 0 || breakAfterSeconds > 0
    ? continuity.boundary
    : profile.decay.kind === 'natural'
      ? 'rearticulation'
      : 'none';
  const continuousAfter = breakAfterSeconds > 0
    ? 0
    : (breakBeforeSeconds > 0 ? 0 : continuousBefore) + duration;

  const wantsLegato = input.legatoRequested ?? shaped.articulation >= 0.94;
  const canConnect =
    wantsLegato &&
    breakBeforeSeconds === 0 &&
    profile.legato.kind !== 'none' &&
    interval > 0 &&
    interval <= profile.legato.maxIntervalSemitones;
  const portamentoRoleScale = role === 'climax'
    ? 1.18
    : role === 'cadence'
      ? 0.42
      : role === 'pickup' || role === 'echo'
        ? 0
        : 1;
  const portamentoChance =
    profile.legato.portamentoChance * portamentoRoleScale;
  const canUsePortamento =
    canConnect &&
    interval >= 2 &&
    interval <= profile.legato.portamentoMaxIntervalSemitones &&
    clamp(input.connectionRandom ?? 1) < portamentoChance;
  const portamentoSpan = profile.legato.portamentoSeconds;
  const portamentoProgress = profile.legato.portamentoMaxIntervalSemitones > 0
    ? clamp(interval / profile.legato.portamentoMaxIntervalSemitones)
    : 0;
  const requestedGlide =
    portamentoSpan[0] +
    (portamentoSpan[1] - portamentoSpan[0]) * portamentoProgress;
  const glideSeconds = canUsePortamento
    ? Math.min(requestedGlide, duration * 0.22)
    : 0;
  const connectionKind: LegatoKind = canUsePortamento
    ? 'portamento'
    : canConnect
      ? profile.legato.kind as Exclude<LegatoKind, 'detached' | 'portamento'>
      : 'detached';
  const overlapSeconds = canConnect && !canUsePortamento
    ? Math.min(profile.legato.overlapSeconds, duration * 0.1)
    : 0;

  const articulation = profile.decay.kind === 'natural'
    ? Math.min(shaped.articulation, 0.9)
    : canConnect
      ? Math.max(shaped.articulation, 1)
      : shaped.articulation;
  const soundingDuration = duration * articulation;
  const vibratoDepth =
    recipe.vibratoCents * shaped.vibratoScale * profile.vibrato.depthScale;
  const vibratoEnabled =
    soundingDuration >= profile.vibrato.minimumDurationSeconds &&
    vibratoDepth >= 0.35 &&
    role !== 'pickup';
  const vibratoOnset = vibratoEnabled
    ? Math.min(profile.vibrato.onsetSeconds, soundingDuration * 0.46)
    : 0;
  const vibratoRamp = vibratoEnabled
    ? Math.min(
        profile.vibrato.rampSeconds,
        Math.max(0.04, soundingDuration - vibratoOnset),
      )
    : 0;

  return {
    articulation,
    attackScale: shaped.attackScale * (breakBeforeSeconds > 0 ? 1.08 : 1),
    boundary: {
      breakAfterSeconds,
      breakBeforeSeconds,
      continuousSecondsAfter: continuousAfter,
      kind: boundaryKind,
    },
    connection: {
      glideSeconds,
      kind: connectionKind,
      overlapSeconds,
    },
    decay: {
      kind: profile.decay.kind,
      naturalDecaySeconds: profile.decay.naturalDecaySeconds,
      releaseScale: shaped.releaseScale,
      sustainLevel: profile.decay.sustainLevel,
    },
    dynamic: shaped.dynamic,
    phraseRole: role,
    vibrato: {
      depthCents: vibratoEnabled ? vibratoDepth : 0,
      enabled: vibratoEnabled,
      onsetSeconds: vibratoOnset,
      rampSeconds: vibratoRamp,
      rateHz: recipe.vibratoHz,
    },
  };
}

function smoothCadence(progress: number) {
  const edge = clamp((progress - 0.78) / 0.22);
  return edge * edge * (3 - 2 * edge);
}

export function interpolateTimbre(
  fromId: InstrumentId,
  toId: InstrumentId,
  amount: number,
): TimbreRecipe {
  const from = INSTRUMENTS[fromId];
  const to = INSTRUMENTS[toId];
  const mix = clamp(amount);
  const lerp = (a: number, b: number) => a + (b - a) * mix;
  const partials = Array.from({ length: PARTIAL_COUNT }, (_, index) =>
    lerp(from.partials[index] ?? 0, to.partials[index] ?? 0),
  );
  return {
    attack: lerp(from.attack, to.attack),
    breath: lerp(from.breath ?? 0, to.breath ?? 0),
    brightness: lerp(from.brightness, to.brightness),
    label: mix < 0.5 ? from.label : to.label,
    partials,
    release: lerp(from.release, to.release),
    transient: lerp(from.transient ?? 0, to.transient ?? 0),
    vibratoCents: lerp(from.vibratoCents, to.vibratoCents),
    vibratoHz: lerp(from.vibratoHz, to.vibratoHz),
  };
}
