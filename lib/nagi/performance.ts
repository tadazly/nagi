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
  brightness: number;
  label: string;
  partials: readonly number[];
  release: number;
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

const PARTIAL_COUNT = 9;

export const INSTRUMENTS: Readonly<Record<InstrumentId, TimbreRecipe>> = {
  celesta: {
    attack: 0.014,
    brightness: 0.92,
    label: 'celesta',
    partials: [0, 1, 0.34, 0.09, 0.2, 0.035, 0.018, 0.028, 0.012],
    release: 1.28,
    vibratoCents: 0.35,
    vibratoHz: 5.1,
  },
  flute: {
    attack: 0.075,
    brightness: 0.58,
    label: 'flute',
    partials: [0, 1, 0.17, 0.052, 0.022, 0.011, 0.006, 0.003, 0.002],
    release: 0.72,
    vibratoCents: 7.4,
    vibratoHz: 5.2,
  },
  clarinet: {
    attack: 0.052,
    brightness: 0.48,
    label: 'clarinet',
    partials: [0, 1, 0.045, 0.31, 0.026, 0.13, 0.014, 0.065, 0.009],
    release: 0.62,
    vibratoCents: 3.8,
    vibratoHz: 4.8,
  },
  violin: {
    attack: 0.115,
    brightness: 0.72,
    label: 'violin',
    partials: [0, 1, 0.72, 0.48, 0.31, 0.21, 0.15, 0.1, 0.065],
    release: 0.92,
    vibratoCents: 9.6,
    vibratoHz: 5.7,
  },
  oboe: {
    attack: 0.058,
    brightness: 0.76,
    label: 'oboe',
    partials: [0, 1, 0.61, 0.33, 0.24, 0.15, 0.095, 0.058, 0.034],
    release: 0.58,
    vibratoCents: 4.4,
    vibratoHz: 5.0,
  },
  strings: {
    attack: 0.46,
    brightness: 0.57,
    label: 'string ensemble',
    partials: [0, 1, 0.57, 0.31, 0.18, 0.105, 0.061, 0.035, 0.02],
    release: 1.85,
    vibratoCents: 4.2,
    vibratoHz: 5.4,
  },
  choir: {
    attack: 0.62,
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
    brightness: 0.5,
    label: 'soft horns',
    partials: [0, 1, 0.38, 0.19, 0.095, 0.047, 0.024, 0.012, 0.006],
    release: 1.5,
    vibratoCents: 2.2,
    vibratoHz: 4.9,
  },
  cello: {
    attack: 0.16,
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
    vibratoCents: 0.2,
    vibratoHz: 5.0,
  },
  'felt-piano': {
    attack: 0.009,
    brightness: 0.64,
    label: 'felt piano',
    partials: [0, 1, 0.4, 0.17, 0.075, 0.035, 0.017, 0.009, 0.004],
    release: 0.72,
    vibratoCents: 0.15,
    vibratoHz: 5.0,
  },
  pizzicato: {
    attack: 0.008,
    brightness: 0.76,
    label: 'pizzicato strings',
    partials: [0, 1, 0.58, 0.31, 0.17, 0.095, 0.052, 0.029, 0.016],
    release: 0.38,
    vibratoCents: 0.1,
    vibratoHz: 5.0,
  },
  marimba: {
    attack: 0.011,
    brightness: 0.55,
    label: 'marimba',
    partials: [0, 1, 0.08, 0.23, 0.035, 0.075, 0.018, 0.032, 0.009],
    release: 0.62,
    vibratoCents: 0.1,
    vibratoHz: 5.0,
  },
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

  return { accompaniment, bass, counter, harmony, lead };
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
    brightness: lerp(from.brightness, to.brightness),
    label: mix < 0.5 ? from.label : to.label,
    partials,
    release: lerp(from.release, to.release),
    vibratoCents: lerp(from.vibratoCents, to.vibratoCents),
    vibratoHz: lerp(from.vibratoHz, to.vibratoHz),
  };
}
