import {
  classicalBassIntervalAffinity,
  classicalChordToneProbability,
} from './classical-prior.ts';

export type WeatherProfile = {
  brightness: number;
  density: number;
  depth: number;
  flow: number;
  harmonicHue: number;
  motion: number;
  shape: number;
  space: number;
  sparkle: number;
  spread: number;
  warmth: number;
};

export type SeedSnapshot = {
  currentSeed: string;
  emotion: EmotionName;
  incomingEmotion: EmotionName | null;
  incomingSeed: string | null;
  profile: WeatherProfile;
  transition: number;
};

export type EmotionName =
  | 'CALM'
  | 'WARM'
  | 'DREAMY'
  | 'JOYFUL'
  | 'UPLIFTING'
  | 'ROMANTIC'
  | 'NOSTALGIC'
  | 'MELANCHOLIC'
  | 'LONELY'
  | 'MYSTERIOUS'
  | 'TENSE'
  | 'DARK';

export type EmotionPreset = {
  arousal: number;
  brightness: number;
  chordColor: number;
  density: number;
  dreaminess: number;
  groove: number;
  motifRate: number;
  space: number;
  tension: number;
  valence: number;
  warmth: number;
};

export const CORE_EMOTIONS: readonly EmotionName[] = [
  'CALM',
  'WARM',
  'DREAMY',
  'JOYFUL',
  'UPLIFTING',
  'ROMANTIC',
  'NOSTALGIC',
  'MELANCHOLIC',
  'LONELY',
  'MYSTERIOUS',
  'TENSE',
  'DARK',
] as const;

export const EMOTION_PRESETS: Readonly<Record<EmotionName, EmotionPreset>> = {
  CALM: { arousal: 0.2, brightness: 0.52, chordColor: 0.24, density: 0.25, dreaminess: 0.34, groove: 0.055, motifRate: 0.32, space: 0.48, tension: 0.14, valence: 0.66, warmth: 0.56 },
  WARM: { arousal: 0.34, brightness: 0.64, chordColor: 0.3, density: 0.4, dreaminess: 0.3, groove: 0.07, motifRate: 0.42, space: 0.3, tension: 0.17, valence: 0.78, warmth: 0.9 },
  DREAMY: { arousal: 0.3, brightness: 0.6, chordColor: 0.5, density: 0.3, dreaminess: 0.94, groove: 0.045, motifRate: 0.34, space: 0.9, tension: 0.27, valence: 0.62, warmth: 0.53 },
  JOYFUL: { arousal: 0.84, brightness: 0.88, chordColor: 0.3, density: 0.72, dreaminess: 0.22, groove: 0.145, motifRate: 0.82, space: 0.34, tension: 0.24, valence: 0.91, warmth: 0.66 },
  UPLIFTING: { arousal: 0.76, brightness: 0.86, chordColor: 0.38, density: 0.68, dreaminess: 0.44, groove: 0.12, motifRate: 0.74, space: 0.6, tension: 0.31, valence: 0.84, warmth: 0.69 },
  ROMANTIC: { arousal: 0.44, brightness: 0.68, chordColor: 0.56, density: 0.5, dreaminess: 0.54, groove: 0.07, motifRate: 0.5, space: 0.56, tension: 0.27, valence: 0.75, warmth: 0.9 },
  NOSTALGIC: { arousal: 0.33, brightness: 0.43, chordColor: 0.58, density: 0.35, dreaminess: 0.54, groove: 0.06, motifRate: 0.4, space: 0.64, tension: 0.34, valence: 0.5, warmth: 0.76 },
  MELANCHOLIC: { arousal: 0.25, brightness: 0.3, chordColor: 0.46, density: 0.29, dreaminess: 0.38, groove: 0.045, motifRate: 0.31, space: 0.62, tension: 0.43, valence: 0.25, warmth: 0.43 },
  LONELY: { arousal: 0.16, brightness: 0.25, chordColor: 0.34, density: 0.13, dreaminess: 0.5, groove: 0.03, motifRate: 0.24, space: 0.96, tension: 0.35, valence: 0.3, warmth: 0.25 },
  MYSTERIOUS: { arousal: 0.44, brightness: 0.36, chordColor: 0.68, density: 0.46, dreaminess: 0.8, groove: 0.075, motifRate: 0.48, space: 0.8, tension: 0.66, valence: 0.42, warmth: 0.33 },
  TENSE: { arousal: 0.78, brightness: 0.48, chordColor: 0.72, density: 0.8, dreaminess: 0.24, groove: 0.145, motifRate: 0.82, space: 0.44, tension: 0.88, valence: 0.28, warmth: 0.27 },
  DARK: { arousal: 0.4, brightness: 0.12, chordColor: 0.62, density: 0.56, dreaminess: 0.58, groove: 0.065, motifRate: 0.44, space: 0.7, tension: 0.73, valence: 0.18, warmth: 0.2 },
};

export type ModeDefinition = {
  id: string;
  intervals: readonly number[];
  name: string;
  valence: number;
};

export type MeterDefinition = {
  accents: readonly number[];
  beatsPerBar: number;
  id: string;
  label: string;
  subdivisionsPerBeat: number;
};

export type HarmonicFunction = 'tonic' | 'predominant' | 'dominant' | 'color';

export type HarmonicScene = {
  arousal: number;
  cadenceBias: number;
  chordColor: number;
  groove: number;
  meterIndex: number;
  modeIndex: number;
  motifRate: number;
  phraseBars: number;
  tempo: number;
  tension: number;
  tonic: number;
  valence: number;
};

export type EmotionalFormStage = {
  arousalDelta: number;
  id: 'statement' | 'development' | 'intensification' | 'release' | 'return';
  tensionDelta: number;
  valenceDelta: number;
};

export type EmotionalFormPlan = {
  emotionJourney: readonly EmotionName[];
  scenesPerStage: number;
  stages: readonly EmotionalFormStage[];
};

export type RhythmRole = 'lead' | 'counter';

export type RhythmEvent = {
  accent: number;
  beat: number;
  durationBeats: number;
  humanizeBeats: number;
  metricStrength: number;
};

export type MelodyChoiceContext = {
  backgroundNotes?: readonly number[];
  bassMidi?: number;
  direction?: -1 | 0 | 1;
  metricStrength?: number;
  mustResolve?: boolean;
  otherVoiceMidi?: number;
  registerHigh?: number;
  registerLow?: number;
  targetMidi?: number;
  targetPitchClass?: number;
};

export const MODES: readonly ModeDefinition[] = [
  { id: 'ionian', name: 'Ionian', intervals: [0, 2, 4, 5, 7, 9, 11], valence: 0.82 },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], valence: 0.56 },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], valence: 0.9 },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], valence: 0.7 },
  { id: 'aeolian', name: 'Aeolian', intervals: [0, 2, 3, 5, 7, 8, 10], valence: 0.3 },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], valence: 0.2 },
  { id: 'harmonic-minor', name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], valence: 0.28 },
  { id: 'melodic-minor', name: 'Melodic minor', intervals: [0, 2, 3, 5, 7, 9, 11], valence: 0.48 },
  { id: 'harmonic-major', name: 'Harmonic major', intervals: [0, 2, 4, 5, 7, 8, 11], valence: 0.54 },
  { id: 'lydian-dominant', name: 'Lydian dominant', intervals: [0, 2, 4, 6, 7, 9, 10], valence: 0.68 },
  { id: 'dorian-sharp-four', name: 'Dorian ♯4', intervals: [0, 2, 3, 6, 7, 9, 10], valence: 0.42 },
  { id: 'neapolitan-major', name: 'Neapolitan major', intervals: [0, 1, 3, 5, 7, 9, 11], valence: 0.36 },
] as const;

// Long-form ambient listening benefits from variety without making every mode
// equally likely. The lower values keep strongly tense modes as rare weather
// colours rather than the default harmonic climate.
const MODE_COMFORT_WEIGHT = [
  1,
  0.9,
  0.92,
  0.96,
  0.72,
  0.12,
  0.2,
  0.54,
  0.62,
  0.46,
  0.22,
  0.1,
] as const;

export const METERS: readonly MeterDefinition[] = [
  {
    id: 'common',
    label: '4/4',
    beatsPerBar: 4,
    subdivisionsPerBeat: 4,
    accents: [1, 0.38, 0.68, 0.42],
  },
  {
    id: 'triple',
    label: '3/4',
    beatsPerBar: 3,
    subdivisionsPerBeat: 4,
    accents: [1, 0.42, 0.52],
  },
  {
    id: 'compound',
    label: '6/8',
    beatsPerBar: 2,
    subdivisionsPerBeat: 3,
    accents: [1, 0.62],
  },
  {
    id: 'five',
    label: '5/4',
    beatsPerBar: 5,
    subdivisionsPerBeat: 2,
    accents: [1, 0.34, 0.7, 0.32, 0.48],
  },
] as const;

export const NOTE_NAMES = [
  'C',
  'D♭',
  'D',
  'E♭',
  'E',
  'F',
  'G♭',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
] as const;

const FUNCTION_BY_DEGREE: readonly HarmonicFunction[] = [
  'tonic',
  'predominant',
  'color',
  'predominant',
  'dominant',
  'tonic',
  'dominant',
] as const;

const FUNCTION_TRANSITIONS: Record<
  HarmonicFunction,
  Record<HarmonicFunction, number>
> = {
  tonic: { tonic: 0.18, predominant: 0.42, dominant: 0.2, color: 0.2 },
  predominant: { tonic: 0.18, predominant: 0.16, dominant: 0.54, color: 0.12 },
  dominant: { tonic: 0.62, predominant: 0.12, dominant: 0.1, color: 0.16 },
  color: { tonic: 0.34, predominant: 0.26, dominant: 0.24, color: 0.16 },
};

const DEGREE_TENSION = [0.04, 0.42, 0.24, 0.46, 0.78, 0.18, 0.7] as const;

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const smoothstep = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

export const normalizeSeed = (value: number) =>
  (value >>> 0).toString(16).toUpperCase().padStart(8, '0');

export const seedToNumber = (seed: string) =>
  Number.parseInt(seed.replace(/[^0-9a-f]/gi, '').slice(0, 8), 16) >>> 0;

export const randomSeed = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return normalizeSeed(values[0]);
};

export const nextSeed = (seed: string) => {
  let value = (seedToNumber(seed) ^ 0x9e3779b9) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return normalizeSeed(value || 0xa341316c);
};

export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    this.state =
      (typeof seed === 'number' ? seed : seedToNumber(seed)) || 0x6d2b79f5;
  }

  next() {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  between(min: number, max: number) {
    return min + (max - min) * this.next();
  }

  pick<T>(values: readonly T[]) {
    return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))];
  }
}

const weightedIndex = (weights: readonly number[], random: SeededRandom) => {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return 0;
  let cursor = random.next() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
};

const wrapDegree = (degree: number, length = 7) =>
  ((degree % length) + length) % length;

const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;

export const profileFromSeed = (seed: string): WeatherProfile => {
  const random = new SeededRandom(seed);
  return {
    brightness: random.between(0.24, 0.66),
    density: random.between(0.3, 0.68),
    depth: random.between(0.34, 0.9),
    flow: random.between(0.18, 0.86),
    harmonicHue: random.between(0.16, 0.86),
    motion: random.between(0.22, 0.72),
    shape: random.between(0.08, 0.94),
    space: random.between(0.38, 0.76),
    sparkle: random.between(0.1, 0.62),
    spread: random.between(0.48, 0.92),
    warmth: random.between(0.3, 0.78),
  };
};

export const tempoFromArousal = (arousal: number, valence = 0.5) =>
  clamp(
    58 + clamp(arousal) ** 1.05 * 70 + (clamp(valence) - 0.5) * 8,
    56,
    136,
  );

const chooseModeForValence = (valence: number, random: SeededRandom) =>
  weightedIndex(
    MODES.map(
      (mode, index) =>
        MODE_COMFORT_WEIGHT[index] *
        (0.04 + Math.exp(-Math.abs(mode.valence - valence) * 6.2)),
    ),
    random,
  );

export const sceneFromSeed = (seed: string): HarmonicScene => {
  const random = new SeededRandom(seedToNumber(seed) ^ 0xb5297a4d);
  const arousal = 0.12 + random.next() ** 0.9 * 0.84;
  const baseValence = 0.34 + random.next() ** 0.78 * 0.62;
  const valence = clamp(baseValence + Math.max(0, arousal - 0.68) * 0.16, 0.34, 0.96);
  return {
    arousal,
    cadenceBias: random.between(0.3, 0.72),
    chordColor: random.between(0.16, 0.68),
    groove: random.between(0.045, 0.16),
    meterIndex: weightedIndex([0.46, 0.16, 0.3, 0.08], random),
    modeIndex: chooseModeForValence(valence, random),
    motifRate: clamp(0.28 + arousal * 0.62 + random.between(-0.08, 0.08), 0.26, 0.9),
    phraseBars: arousal < 0.35
      ? random.pick([12, 16, 16] as const)
      : random.pick([8, 10, 12, 16] as const),
    tempo: tempoFromArousal(arousal, valence),
    tension: random.between(0.12, 0.54),
    tonic: Math.floor(random.next() * 12),
    valence,
  };
};

export const interpolateProfile = (
  from: WeatherProfile,
  to: WeatherProfile,
  amount: number,
): WeatherProfile => {
  const mix = smoothstep(amount);
  const lerp = (a: number, b: number) => a + (b - a) * mix;
  return {
    brightness: lerp(from.brightness, to.brightness),
    density: lerp(from.density, to.density),
    depth: lerp(from.depth, to.depth),
    flow: lerp(from.flow, to.flow),
    harmonicHue: lerp(from.harmonicHue, to.harmonicHue),
    motion: lerp(from.motion, to.motion),
    shape: lerp(from.shape, to.shape),
    space: lerp(from.space, to.space),
    sparkle: lerp(from.sparkle, to.sparkle),
    spread: lerp(from.spread, to.spread),
    warmth: lerp(from.warmth, to.warmth),
  };
};

export const midiToFrequency = (midi: number) =>
  440 * 2 ** ((midi - 69) / 12);

export const criticalBandwidthHz = (frequency: number) =>
  25 + 75 * (1 + 1.4 * (frequency / 1000) ** 2) ** 0.69;

export const sensoryRoughness = (midiA: number, midiB: number) => {
  if (midiA === midiB) return 0;
  const lowFrequency = midiToFrequency(Math.min(midiA, midiB));
  const highFrequency = midiToFrequency(Math.max(midiA, midiB));
  const normalizedDistance =
    (highFrequency - lowFrequency) /
    criticalBandwidthHz((lowFrequency + highFrequency) * 0.5);
  if (normalizedDistance >= 1) return 0;
  const x = Math.max(0, normalizedDistance);
  return clamp(5.82 * x * Math.exp(1 - 4 * x) * (1 - x) ** 1.3);
};

export const sceneName = (scene: HarmonicScene) =>
  `${NOTE_NAMES[scene.tonic]} ${MODES[scene.modeIndex].name}`;

export const harmonicFunctionForDegree = (
  scene: HarmonicScene,
  degree: number,
): HarmonicFunction =>
  FUNCTION_BY_DEGREE[wrapDegree(degree, MODES[scene.modeIndex].intervals.length)] ??
  'color';

export const degreeTension = (degree: number) =>
  DEGREE_TENSION[wrapDegree(degree, DEGREE_TENSION.length)];

export const degreeTriadComfort = (scene: HarmonicScene, degree: number) => {
  const mode = MODES[scene.modeIndex].intervals;
  const pitchAt = (scaleDegree: number) =>
    mode[wrapDegree(scaleDegree, mode.length)] +
    Math.floor(scaleDegree / mode.length) * 12;
  const root = pitchAt(degree);
  const third = pitchAt(degree + 2) - root;
  const fifth = pitchAt(degree + 4) - root;
  if ((third === 3 || third === 4) && fifth === 7) return 1;
  if ((third === 2 || third === 5) && fifth === 7) return 0.62;
  if (fifth === 6 || fifth === 8) return 0.1;
  return 0.38;
};

export const chooseNextDegree = (
  currentDegree: number,
  scene: HarmonicScene,
  random: SeededRandom,
  phraseProgress = 0.5,
) => {
  const modeLength = MODES[scene.modeIndex].intervals.length;
  const currentFunction = harmonicFunctionForDegree(scene, currentDegree);
  const normalizedPhrase = ((phraseProgress % 1) + 1) % 1;
  const phraseFunctionWeight = (harmonicFunction: HarmonicFunction) => {
    if (normalizedPhrase < 0.24) {
      return harmonicFunction === 'tonic' ? 1.7 : harmonicFunction === 'color' ? 0.82 : 0.68;
    }
    if (normalizedPhrase < 0.58) {
      return harmonicFunction === 'predominant'
        ? 1.62
        : harmonicFunction === 'color'
          ? 1.08
          : 0.78;
    }
    if (normalizedPhrase < 0.84) {
      return harmonicFunction === 'dominant'
        ? 1.9
        : harmonicFunction === 'predominant'
          ? 1.05
          : 0.58;
    }
    return harmonicFunction === 'tonic'
      ? 2.7
      : harmonicFunction === 'dominant'
        ? 0.92
        : 0.42;
  };
  const weights = Array.from({ length: modeLength }, (_, degree) => {
    const nextFunction = harmonicFunctionForDegree(scene, degree);
    let weight = FUNCTION_TRANSITIONS[currentFunction][nextFunction];
    weight *= phraseFunctionWeight(nextFunction);
    weight *= 0.12 + degreeTriadComfort(scene, degree) * 0.88;
    const tensionDistance = Math.abs(degreeTension(degree) - scene.tension);
    weight *= 1.2 - tensionDistance * 0.62;
    if (degree === wrapDegree(currentDegree, modeLength)) weight *= 0.22;
    if (degree === 0) {
      weight *= 1 + smoothstep((normalizedPhrase - 0.82) / 0.18) * (1.8 + scene.cadenceBias * 1.8);
    } else if (nextFunction === 'dominant' && normalizedPhrase >= 0.58) {
      weight *= 1 + scene.cadenceBias * 1.1;
    }
    if (currentFunction === 'dominant' && nextFunction === 'tonic') weight *= 2.15;
    if (degreeTension(degree) > 0.6) {
      weight *= 0.08 + scene.tension * 0.24;
    }
    if (nextFunction === 'color') weight *= 0.5;
    return Math.max(0.001, weight);
  });
  return weightedIndex(weights, random);
};

export const emotionalFormFromSeed = (seed: string): EmotionalFormPlan => {
  const random = new SeededRandom(seedToNumber(seed) ^ 0x3c6ef372);
  const valenceDirection = random.next() < 0.5 ? -1 : 1;
  const intensity = random.between(0.78, 1.08);
  const shapes: ReadonlyArray<ReadonlyArray<[number, number, number]>> = [
    [
      [-0.08, 0, -0.04],
      [0.02, 0.02, 0.015],
      [0.17, 0.055, 0.09],
      [-0.035, 0.025, -0.015],
      [-0.11, 0.01, -0.055],
    ],
    [
      [-0.12, -0.015, -0.05],
      [0.08, 0.02, 0.04],
      [0.12, -0.035, 0.075],
      [-0.02, 0.045, -0.01],
      [-0.09, 0.02, -0.045],
    ],
    [
      [-0.055, 0.025, -0.03],
      [0.11, 0.04, 0.055],
      [0.04, -0.02, 0.025],
      [-0.095, -0.035, -0.04],
      [-0.035, 0.015, -0.025],
    ],
  ];
  const shape = shapes[Math.floor(random.next() * shapes.length)];
  const ids: EmotionalFormStage['id'][] = [
    'statement',
    'development',
    'intensification',
    'release',
    'return',
  ];
  const stages = shape.map(([arousal, valence, tension], index) => ({
      arousalDelta: arousal * intensity,
      id: ids[index],
      tensionDelta: tension * intensity,
      valenceDelta: valence * valenceDirection,
    }));
  const emotionJourney: EmotionName[] = [random.pick(CORE_EMOTIONS)];
  for (let index = 1; index < stages.length; index += 1) {
    const previous = EMOTION_PRESETS[emotionJourney[index - 1]];
    const stage = stages[index];
    const targetArousal = clamp(previous.arousal + stage.arousalDelta * 1.8);
    const targetValence = clamp(previous.valence + stage.valenceDelta * 1.5);
    const targetTension = clamp(previous.tension + stage.tensionDelta * 1.7);
    const weights = CORE_EMOTIONS.map((emotion) => {
      const preset = EMOTION_PRESETS[emotion];
      const distance =
        Math.abs(preset.arousal - targetArousal) * 1.15 +
        Math.abs(preset.valence - targetValence) +
        Math.abs(preset.tension - targetTension) * 0.82;
      const stepDistance = Math.hypot(
        preset.arousal - previous.arousal,
        preset.valence - previous.valence,
        preset.tension - previous.tension,
      );
      if (stepDistance > 0.78) return 0;
      const continuity = Math.exp(-distance * 3.4);
      return continuity * (emotion === emotionJourney[index - 1] ? 0.32 : 1);
    });
    emotionJourney.push(CORE_EMOTIONS[weightedIndex(weights, random)]);
  }
  return {
    emotionJourney,
    scenesPerStage: random.pick([1, 2, 2, 3] as const),
    stages,
  };
};

export const emotionalFormStageAt = (
  form: EmotionalFormPlan,
  sceneIndex: number,
) => {
  const stageIndex =
    Math.floor(Math.max(0, sceneIndex) / Math.max(1, form.scenesPerStage)) %
    form.stages.length;
  return form.stages[stageIndex];
};

export const emotionalFormEmotionAt = (
  form: EmotionalFormPlan,
  sceneIndex: number,
) => {
  const stageIndex =
    Math.floor(Math.max(0, sceneIndex) / Math.max(1, form.scenesPerStage)) %
    form.emotionJourney.length;
  return form.emotionJourney[stageIndex];
};

export const shapeSceneWithEmotionalForm = (
  scene: HarmonicScene,
  form: EmotionalFormPlan,
  sceneIndex: number,
): HarmonicScene => {
  const stage = emotionalFormStageAt(form, sceneIndex);
  const emotion = EMOTION_PRESETS[emotionalFormEmotionAt(form, sceneIndex)];
  const arousal = clamp(
    scene.arousal * 0.56 + emotion.arousal * 0.44 + stage.arousalDelta * 0.22,
    0.08,
    0.98,
  );
  const valence = clamp(
    scene.valence * 0.54 + emotion.valence * 0.46 + stage.valenceDelta * 0.18,
    0.15,
    0.97,
  );
  const tension = clamp(
    scene.tension * 0.48 + emotion.tension * 0.52 + stage.tensionDelta * 0.2,
    0.08,
    0.9,
  );
  return {
    ...scene,
    arousal,
    chordColor: clamp(
      scene.chordColor * 0.58 + emotion.chordColor * 0.42 + stage.tensionDelta * 0.2,
      0.12,
      0.78,
    ),
    groove: clamp(scene.groove * 0.58 + emotion.groove * 0.42, 0.025, 0.17),
    motifRate: clamp(
      scene.motifRate * 0.56 + emotion.motifRate * 0.44 + stage.arousalDelta * 0.2,
      0.2,
      0.94,
    ),
    tempo: tempoFromArousal(arousal, valence),
    tension,
    valence,
  };
};

export const chordPitchClasses = (
  scene: HarmonicScene,
  degree: number,
  color = scene.chordColor,
) => {
  const mode = MODES[scene.modeIndex].intervals;
  const harmonicFunction = harmonicFunctionForDegree(scene, degree);
  let offsets: readonly number[] = [0, 2, 4];
  if (color > 0.76 && harmonicFunction === 'tonic') {
    offsets = [0, 2, 4, 5];
  } else if (color > 0.86 && harmonicFunction === 'dominant') {
    offsets = [0, 2, 4, 6];
  }
  const classes = offsets.map((offset) => {
    const scaleIndex = degree + offset;
    return pitchClass(scene.tonic + mode[wrapDegree(scaleIndex, mode.length)]);
  });
  return [...new Set(classes)];
};

export const chordRootMidi = (scene: HarmonicScene, degree: number) => {
  const mode = MODES[scene.modeIndex].intervals;
  const rootClass = pitchClass(scene.tonic + mode[wrapDegree(degree, mode.length)]);
  let midi = 36 + rootClass;
  while (midi < 40) midi += 12;
  return midi;
};

const voicingCost = (
  notes: readonly number[],
  previous: readonly number[],
  chordClasses: readonly number[],
  scene: HarmonicScene,
) => {
  const center = notes.reduce((sum, note) => sum + note, 0) / notes.length;
  let cost = Math.abs(center - 61) * 0.08;
  for (let index = 1; index < notes.length; index += 1) {
    const gap = notes[index] - notes[index - 1];
    const minimumGap = index === 1 ? 5 : 3;
    if (gap < minimumGap) cost += (minimumGap - gap) * 5.2;
    if (index > 1 && gap > 12) cost += (gap - 12) * 0.48;
    if (index === 1 && gap > 19) cost += (gap - 19) * 0.26;
    cost += sensoryRoughness(notes[index - 1], notes[index]) * 2.6;
  }
  if (notes[notes.length - 1] - notes[0] > 39) cost += 3.2;

  const representedClasses = new Set(notes.map(pitchClass));
  chordClasses.slice(0, Math.min(3, notes.length)).forEach((noteClass, index) => {
    if (!representedClasses.has(noteClass)) cost += index === 2 ? 1.2 : 4.4;
  });

  if (previous.length === notes.length) {
    for (let index = 0; index < notes.length; index += 1) {
      const motion = notes[index] - previous[index];
      cost += Math.abs(motion) * (index === 0 ? 0.18 : 0.34);
      if (Math.abs(motion) > 7) cost += (Math.abs(motion) - 7) * 1.4;
    }
    for (let low = 0; low < notes.length; low += 1) {
      for (let high = low + 1; high < notes.length; high += 1) {
        const previousInterval = pitchClass(previous[high] - previous[low]);
        const nextInterval = pitchClass(notes[high] - notes[low]);
        const lowMotion = notes[low] - previous[low];
        const highMotion = notes[high] - previous[high];
        if (
          (previousInterval === 0 || previousInterval === 7) &&
          nextInterval === previousInterval &&
          lowMotion !== 0 &&
          Math.sign(lowMotion) === Math.sign(highMotion)
        ) {
          cost += 11;
        }
      }
    }
    const leadingTone = pitchClass(scene.tonic + 11);
    previous.forEach((note, index) => {
      if (pitchClass(note) === leadingTone && pitchClass(notes[index]) !== pitchClass(scene.tonic)) {
        cost += 4.6;
      }
    });
  } else if (previous.length > 0) {
    cost += notes.reduce(
      (sum, note) => sum + Math.min(...previous.map((old) => Math.abs(note - old))) * 0.26,
      0,
    );
  }
  return cost;
};

export const chooseHarmonyVoiceCount = (
  scene: HarmonicScene,
  density: number,
  phraseProgress: number,
  previousCount: number,
  random: SeededRandom,
) => {
  const phraseArc = Math.sin(clamp(phraseProgress) * Math.PI);
  const energy = scene.arousal * 0.4 + clamp(density) * 0.35 + phraseArc * 0.18 + scene.tension * 0.07;
  const target = energy > 0.88
    ? 7
    : energy > 0.76
      ? 6
      : energy > 0.63
        ? 5
        : energy > 0.48
          ? 4
          : energy > 0.31
            ? 3
            : energy > 0.18
              ? 2
              : 1;
  const softened = random.next() < 0.22 ? target + random.pick([-1, 1] as const) : target;
  const bounded = Math.round(clamp(softened, 1, 7));
  if (previousCount < 1 || previousCount > 7) return bounded;
  return Math.round(clamp(bounded, previousCount - 1, previousCount + 1));
};

export const voiceLeadChord = (
  scene: HarmonicScene,
  degree: number,
  previous: readonly number[] = [],
  voiceCount = 3,
) => {
  const classes = chordPitchClasses(scene, degree);
  const count = Math.round(clamp(voiceCount, 1, 7));
  const ranges = Array.from({ length: count }, (_, voiceIndex) => {
    if (voiceIndex === 0) return [38, 55] as const;
    const position = count <= 2 ? 0.72 : (voiceIndex - 1) / Math.max(1, count - 2);
    const low = Math.round(47 + position * 20);
    return [low, Math.min(86, low + 15)] as const;
  });
  const rootClass = classes[0];
  const candidates = ranges.map(([low, high], voiceIndex) => {
    const values: number[] = [];
    for (let midi = low; midi <= high; midi += 1) {
      if (voiceIndex === 0 ? pitchClass(midi) === rootClass : classes.includes(pitchClass(midi))) {
        values.push(midi);
      }
    }
    const target = previous.length === count && previous[voiceIndex] !== undefined
      ? previous[voiceIndex]
      : voiceIndex === 0
        ? 46
        : 52 + ((voiceIndex - 1) / Math.max(1, count - 2)) * 28;
    return values.sort((a, b) => Math.abs(a - target) - Math.abs(b - target)).slice(0, 3);
  });
  let best: number[] | null = null;
  let bestCost = Infinity;
  const visit = (index: number, chosen: number[]) => {
    if (index >= candidates.length) {
      const notes = [...chosen];
      const cost = voicingCost(notes, previous, classes, scene);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
      return;
    }
    for (const midi of candidates[index]) {
      if (chosen.length > 0 && midi <= chosen.at(-1)!) continue;
      if (
        chosen.length > 0 &&
        midi - chosen.at(-1)! < (index === 1 ? 5 : 2)
      ) continue;
      visit(index + 1, [...chosen, midi]);
    }
  };
  visit(0, []);
  if (best) return best;
  const fallback = [chordRootMidi(scene, degree)];
  for (let index = 1; index < count; index += 1) {
    const targetClass = classes[index % classes.length];
    let midi = 48 + index * 5;
    while (pitchClass(midi) !== targetClass) midi += 1;
    while (midi <= fallback.at(-1)! + (index === 1 ? 4 : 1)) midi += 12;
    fallback.push(Math.min(88, midi));
  }
  return fallback;
};

export const emotionNameForState = (
  arousal: number,
  valence: number,
  tension = 0.5,
  features: Partial<Pick<EmotionPreset, 'brightness' | 'density' | 'dreaminess' | 'space' | 'warmth'>> = {},
): EmotionName => {
  const values = {
    arousal: clamp(arousal),
    brightness: features.brightness ?? clamp(valence * 0.72 + arousal * 0.18),
    density: features.density ?? clamp(0.2 + arousal * 0.68),
    dreaminess: features.dreaminess ?? 0.5,
    space: features.space ?? 0.5,
    tension: clamp(tension),
    valence: clamp(valence),
    warmth: features.warmth ?? clamp(valence * 0.7 + 0.12),
  };
  let best = CORE_EMOTIONS[0];
  let bestDistance = Infinity;
  for (const emotion of CORE_EMOTIONS) {
    const preset = EMOTION_PRESETS[emotion];
    const distance =
      (values.arousal - preset.arousal) ** 2 * 1.2 +
      (values.valence - preset.valence) ** 2 * 1.1 +
      (values.tension - preset.tension) ** 2 +
      (values.brightness - preset.brightness) ** 2 * 0.58 +
      (values.density - preset.density) ** 2 * 0.42 +
      (values.dreaminess - preset.dreaminess) ** 2 * 0.52 +
      (values.space - preset.space) ** 2 * 0.48 +
      (values.warmth - preset.warmth) ** 2 * 0.52;
    if (distance < bestDistance) {
      best = emotion;
      bestDistance = distance;
    }
  }
  return best;
};

export const initialEmotionFromSeed = (seed: string) => {
  const form = emotionalFormFromSeed(seed);
  return form.emotionJourney[0];
};

const scenePitchClasses = (scene: HarmonicScene) =>
  new Set(MODES[scene.modeIndex].intervals.map((interval) => pitchClass(scene.tonic + interval)));

export const chooseNeighborScene = (
  scene: HarmonicScene,
  random: SeededRandom,
): HarmonicScene => {
  const source = scenePitchClasses(scene);
  const arousal = clamp(scene.arousal + random.between(-0.19, 0.19), 0.1, 0.98);
  const valence = clamp(
    scene.valence + random.between(-0.14, 0.14) + Math.max(0, arousal - 0.72) * 0.05,
    0.32,
    0.97,
  );
  const keyMoves = [0, 0, 0, 7, 5, 2, 10, 9, 3] as const;
  const candidates: Array<{ modeIndex: number; score: number; tonic: number }> = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const modeIndex = random.next() < 0.5
      ? scene.modeIndex
      : chooseModeForValence(valence, random);
    const tonic = pitchClass(scene.tonic + random.pick(keyMoves));
    const target = new Set(
      MODES[modeIndex].intervals.map((interval) => pitchClass(tonic + interval)),
    );
    const shared = [...target].filter((note) => source.has(note)).length;
    const moodFit = 1 - Math.abs(MODES[modeIndex].valence - valence);
    const score =
      shared +
      moodFit * 0.7 +
      (modeIndex === scene.modeIndex ? 0.38 : 0) +
      (tonic === scene.tonic ? 0.26 : 0);
    candidates.push({ modeIndex, score, tonic });
  }
  candidates.sort((a, b) => b.score - a.score);
  const neighbor = candidates[Math.floor(random.next() ** 2 * Math.min(9, candidates.length))];
  const meterIndex = random.next() < 0.84
    ? scene.meterIndex
    : weightedIndex([0.46, 0.16, 0.3, 0.08], random);
  return {
    arousal,
    cadenceBias: random.between(0.3, 0.74),
    chordColor: clamp(scene.chordColor + random.between(-0.14, 0.14), 0.14, 0.72),
    groove: clamp(scene.groove + random.between(-0.035, 0.035), 0.035, 0.18),
    meterIndex,
    modeIndex: neighbor.modeIndex,
    motifRate: clamp(0.28 + arousal * 0.62 + random.between(-0.08, 0.08), 0.26, 0.9),
    phraseBars: random.next() < 0.74
      ? scene.phraseBars
      : arousal < 0.35
        ? random.pick([12, 16, 16] as const)
        : random.pick([8, 10, 12, 16] as const),
    tempo: tempoFromArousal(arousal, valence),
    tension: clamp(scene.tension + random.between(-0.13, 0.13), 0.1, 0.56),
    tonic: neighbor.tonic,
    valence,
  };
};

export const findPivotDegree = (
  from: HarmonicScene,
  fromDegree: number,
  to: HarmonicScene,
) => {
  const source = new Set(chordPitchClasses(from, fromDegree));
  const targetMode = MODES[to.modeIndex].intervals;
  let bestDegree = 0;
  let bestScore = -Infinity;
  for (let degree = 0; degree < targetMode.length; degree += 1) {
    const target = chordPitchClasses(to, degree);
    const shared = target.filter((note) => source.has(note)).length;
    const motion = Math.min(
      ...target.map((note) =>
        Math.min(
          ...[...source].map((old) => Math.min(Math.abs(note - old), 12 - Math.abs(note - old))),
        ),
      ),
    );
    const tonicBonus = degree === 0 ? 0.18 : 0;
    const comfort = degreeTriadComfort(to, degree);
    const score = shared * 1.4 - motion * 0.08 + tonicBonus + comfort * 0.52;
    if (score > bestScore) {
      bestScore = score;
      bestDegree = degree;
    }
  }
  return bestDegree;
};

export const euclideanPattern = (steps: number, pulses: number, rotation = 0) => {
  const length = Math.max(1, Math.floor(steps));
  const count = Math.max(0, Math.min(length, Math.floor(pulses)));
  const pattern = Array.from({ length }, () => 0);
  if (count === 0) return pattern;
  for (let pulse = 0; pulse < count; pulse += 1) {
    pattern[Math.floor((pulse * length) / count)] = 1;
  }
  const offset = wrapDegree(rotation, length);
  return pattern.map((_, index) => pattern[wrapDegree(index - offset, length)]);
};

export const metricStrengthAt = (meter: MeterDefinition, beat: number) => {
  const step = Math.round(beat * meter.subdivisionsPerBeat);
  const subdivision = wrapDegree(step, meter.subdivisionsPerBeat);
  const beatIndex = Math.floor(step / meter.subdivisionsPerBeat) % meter.beatsPerBar;
  if (subdivision === 0) return meter.accents[beatIndex] ?? 0.4;
  if (meter.subdivisionsPerBeat % 2 === 0 && subdivision === meter.subdivisionsPerBeat / 2) {
    return 0.3;
  }
  return meter.subdivisionsPerBeat === 3 && subdivision === 2 ? 0.24 : 0.14;
};

export const planRhythm = (
  scene: HarmonicScene,
  spanBars: number,
  random: SeededRandom,
  role: RhythmRole,
) => {
  const meter = METERS[scene.meterIndex];
  const totalBeats = meter.beatsPerBar * spanBars;
  const totalSteps = totalBeats * meter.subdivisionsPerBeat;
  const density = role === 'lead'
    ? 1.55 + scene.motifRate * 1.75
    : 0.78 + scene.motifRate * 1.08;
  const pulses = Math.max(
    role === 'lead' ? 2 : 1,
    Math.min(role === 'lead' ? 12 : 8, Math.round(spanBars * density)),
  );
  const rotation = Math.floor(random.next() * totalSteps);
  const pattern = euclideanPattern(totalSteps, pulses, rotation);
  const onsetSteps = pattern
    .map((active, step) => (active ? step : -1))
    .filter((step) => step >= 0);
  return onsetSteps.map((step, index): RhythmEvent => {
    const beat = step / meter.subdivisionsPerBeat;
    const nextStep = onsetSteps[index + 1] ?? totalSteps;
    const gapBeats = Math.max(1 / meter.subdivisionsPerBeat, (nextStep - step) / meter.subdivisionsPerBeat);
    const metricStrength = metricStrengthAt(meter, beat);
    const humanizeBeats =
      random.between(-1, 1) * scene.groove * 0.12 * (1 - metricStrength);
    const sustain = role === 'lead'
      ? random.between(0.55, 1.25)
      : random.between(0.9, 1.8);
    return {
      accent: clamp(0.52 + metricStrength * 0.42 + random.between(-0.05, 0.06), 0.45, 1),
      beat,
      durationBeats: Math.min(gapBeats * 0.82, sustain),
      humanizeBeats,
      metricStrength,
    };
  });
};

export const chooseChordSpanBars = (scene: HarmonicScene, random: SeededRandom) => {
  const meter = METERS[scene.meterIndex];
  if (meter.beatsPerBar <= 2) return random.pick([3, 4, 4, 5] as const);
  if (meter.beatsPerBar >= 5) return random.pick([1, 1, 2, 2] as const);
  if (scene.arousal > 0.72) return random.pick([1, 1, 1, 2] as const);
  if (scene.arousal > 0.5) return random.pick([1, 1, 2, 2] as const);
  return random.pick([1, 2, 2, 2, 3] as const);
};

export const isChordTone = (scene: HarmonicScene, degree: number, midi: number) =>
  chordPitchClasses(scene, degree).includes(pitchClass(midi));

export const pickMelodyMidi = (
  scene: HarmonicScene,
  chordDegree: number,
  previousMidi: number,
  random: SeededRandom,
  context: MelodyChoiceContext = {},
) => {
  const mode = MODES[scene.modeIndex].intervals;
  const chordClasses = new Set(chordPitchClasses(scene, chordDegree));
  const low = context.registerLow ?? 58;
  const high = context.registerHigh ?? 84;
  const metricStrength = context.metricStrength ?? 0.5;
  const target = context.targetMidi ?? (low + high) / 2;
  const candidates: number[] = [];
  for (let midi = low; midi <= high; midi += 1) {
    const relative = pitchClass(midi - scene.tonic);
    if (mode.includes(relative)) candidates.push(midi);
  }
  const weighted = candidates
    .map((midi) => {
      const interval = midi - previousMidi;
      const distance = Math.abs(interval);
      const chordTone = chordClasses.has(pitchClass(midi));
      const modeClass = scene.valence >= 0.48 ? 'major' : 'minor';
      const learnedChordToneProbability = classicalChordToneProbability(
        modeClass,
        metricStrength,
      );
      let score = distance * 0.16 + Math.abs(midi - target) * 0.075;
      if (distance === 0) score += 1.35;
      if (distance > 7) score += (distance - 7) * 0.75;
      score += chordTone ? -1.05 - metricStrength * 1.25 : metricStrength * 1.55;
      score += chordTone
        ? -(learnedChordToneProbability - 0.5) * 1.25
        : (learnedChordToneProbability - 0.5) * 1.25;
      if (context.mustResolve) {
        score += chordTone && distance <= 2 ? -2.7 : 2.2;
      }
      if (context.direction && interval !== 0 && Math.sign(interval) !== context.direction) {
        score += 0.62;
      }
      if (context.direction && interval === 0) score += 0.58;
      if (context.otherVoiceMidi !== undefined) {
        const vertical = pitchClass(Math.abs(midi - context.otherVoiceMidi));
        if ([1, 2, 10, 11].includes(vertical)) score += 1.8;
        if (vertical === 0) score += 0.72;
      }
      if (context.targetPitchClass !== undefined) {
        const pitchDistance = Math.abs(pitchClass(midi) - pitchClass(context.targetPitchClass));
        const circularDistance = Math.min(pitchDistance, 12 - pitchDistance);
        score += circularDistance * 0.42;
        if (circularDistance === 0) score -= 1.95;
      }
      if (context.backgroundNotes) {
        const roughness = context.backgroundNotes.reduce(
          (sum, backgroundMidi) => sum + sensoryRoughness(midi, backgroundMidi),
          0,
        );
        score += roughness * (0.45 + metricStrength * 1.05);
      }
      if (context.bassMidi !== undefined) {
        const bassInterval = pitchClass(midi - context.bassMidi);
        score -= classicalBassIntervalAffinity(bassInterval) * 0.72;
      }
      const scaleDegree = mode.indexOf(pitchClass(midi - scene.tonic));
      const tonalStability = [1, 0.44, 0.7, 0.58, 0.9, 0.64, 0.36][scaleDegree] ?? 0.45;
      score -= tonalStability * (0.18 + metricStrength * 0.52);
      score += random.between(0, 1.42);
      return { midi, score };
    })
    .sort((a, b) => a.score - b.score);
  return weighted[0]?.midi ?? Math.round(target);
};
