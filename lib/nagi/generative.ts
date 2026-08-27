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

export type CadenceType =
  | 'authentic'
  | 'plagal'
  | 'half'
  | 'deceptive'
  | 'modal';

export type PhraseHarmonicGoal =
  | 'statement'
  | 'continuation'
  | 'question'
  | 'intensify'
  | 'release'
  | 'resolve';

export type HarmonicStructuralRole =
  | 'establish'
  | 'departure'
  | 'development'
  | 'cadence-preparation'
  | 'cadence-arrival';

export type CadenceRecipe = {
  arrivalDegree: number;
  degrees: readonly number[];
  modeAwareName: string;
  strength: number;
  type: CadenceType;
  usesLeadingTone: boolean;
};

export type PhraseHarmonyEvent = {
  cadential: boolean;
  degree: number;
  harmonicFunction: HarmonicFunction;
  index: number;
  spanBars: number;
  startBar: number;
  structuralRole: HarmonicStructuralRole;
  tensionTarget: number;
};

export type PhraseHarmonicPlan = {
  cadence: CadenceRecipe;
  events: readonly PhraseHarmonyEvent[];
  goal: PhraseHarmonicGoal;
  phraseBars: number;
};

export type PhraseHarmonyOptions = {
  cadenceType?: CadenceType;
  goal?: PhraseHarmonicGoal;
  phraseBars?: number;
  startDegree?: number;
};

export type ChordInversion = 0 | 1 | 2 | 3;

export type BassMotion = 'initial' | 'pedal' | 'stepwise' | 'leap';

export type BassLineEvent = {
  bassMidi: number;
  bassPitchClass: number;
  degree: number;
  inversion: ChordInversion;
  motion: BassMotion;
  spanBars: number;
  startBar: number;
};

export type BassLinePlan = {
  events: readonly BassLineEvent[];
  nonRootBassCount: number;
  pedalMotionCount: number;
  stepwiseMotionCount: number;
};

export type BassLineOptions = {
  highMidi?: number;
  lowMidi?: number;
  pedalStrength?: number;
  previousBassMidi?: number;
  stepwiseStrength?: number;
};

export type ChordVoicingOptions = {
  bassMidi?: number;
  inversion?: ChordInversion;
};

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

// C2-continuous easing avoids the acceleration kink that is still present in
// cubic smoothstep. It is used for long weather and seed transitions where a
// second-derivative discontinuity can be heard or seen as a change of gear.
export const smootherstep = (value: number) => {
  const x = clamp(value);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const normalizeSeed = (value: number) =>
  (value >>> 0).toString(16).toUpperCase().padStart(8, '0');

export const seedToNumber = (seed: string) =>
  Number.parseInt(seed.replace(/[^0-9a-f]/gi, '').slice(0, 8), 16) >>> 0;

export const mixUint32 = (input: number) => {
  let value = input >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
};

const hashDomain = (domain: string | number) => {
  if (typeof domain === 'number') return mixUint32(domain);
  let hash = 0x811c9dc5;
  for (let index = 0; index < domain.length; index += 1) {
    hash ^= domain.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return mixUint32(hash);
};

export const deriveSeedNumber = (
  seed: string | number,
  domain: string | number,
) => mixUint32(
  (typeof seed === 'number' ? seed : seedToNumber(seed)) ^ hashDomain(domain),
);

export const seedUnit = (seed: string | number, domain: string | number) =>
  deriveSeedNumber(seed, domain) / 4294967296;

export const visualVariantFromSeed = (seed: string, variants = 3) =>
  deriveSeedNumber(seed, 'visual-style') % Math.max(1, Math.floor(variants));

export const randomSeed = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return normalizeSeed(values[0]);
};

export const nextSeed = (seed: string) => {
  const value = deriveSeedNumber(seed, 0x9e3779b9);
  return normalizeSeed(value || 0xa341316c);
};

export class SeededRandom {
  private readonly origin: number;
  private state: number;

  constructor(seed: number | string) {
    this.origin =
      (typeof seed === 'number' ? seed : seedToNumber(seed)) || 0x6d2b79f5;
    this.state = this.origin;
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

  fork(domain: string | number) {
    return new SeededRandom(deriveSeedNumber(this.origin, domain));
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
  const random = new SeededRandom(deriveSeedNumber(seed, 'weather'));
  const light = random.next();
  const intimacy = random.next();
  const activity = random.next();
  const fluidity = random.next();
  const shimmer = clamp(light * 0.58 + activity * 0.24 + random.next() * 0.18);
  const openness = clamp((1 - intimacy) * 0.72 + fluidity * 0.18 + random.next() * 0.1);
  return {
    brightness: clamp(0.24 + light * 0.42 + random.between(-0.025, 0.025), 0.22, 0.7),
    density: clamp(0.28 + activity * 0.34 + intimacy * 0.08, 0.28, 0.7),
    depth: clamp(0.4 + openness * 0.48 + random.between(-0.035, 0.035), 0.34, 0.92),
    flow: clamp(0.18 + fluidity * 0.65 + activity * 0.08, 0.18, 0.9),
    harmonicHue: random.between(0.16, 0.86),
    motion: clamp(0.2 + activity * 0.42 + fluidity * 0.16, 0.2, 0.76),
    shape: random.between(0.08, 0.94),
    space: clamp(0.36 + openness * 0.46, 0.36, 0.82),
    sparkle: clamp(0.08 + shimmer * 0.56, 0.08, 0.66),
    spread: clamp(0.48 + openness * 0.4, 0.48, 0.92),
    warmth: clamp(0.28 + (light * 0.58 + intimacy * 0.42) * 0.5, 0.28, 0.8),
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
  const mix = smootherstep(amount);
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

const modeHasLeadingTone = (scene: HarmonicScene) =>
  MODES[scene.modeIndex].intervals.includes(11);

const stableCadenceDegree = (
  scene: HarmonicScene,
  preferred: number,
  alternatives: readonly number[],
) => [preferred, ...alternatives].find(
  (degree) => degreeTriadComfort(scene, degree) >= 0.5,
) ?? preferred;

const modalCadenceDegrees = (scene: HarmonicScene) => {
  const modeId = MODES[scene.modeIndex].id;
  if (modeId === 'phrygian' || modeId === 'neapolitan-major') {
    return {
      degrees: [3, 1, 0] as const,
      name: '♭II–I Phrygian cadence',
    };
  }
  if (modeId === 'lydian') {
    return {
      degrees: [1, 4, 0] as const,
      name: 'II–V–I Lydian cadence',
    };
  }
  if (
    modeId === 'dorian' ||
    modeId === 'mixolydian' ||
    modeId === 'aeolian' ||
    modeId === 'dorian-sharp-four' ||
    modeId === 'lydian-dominant'
  ) {
    return {
      degrees: [3, 6, 0] as const,
      name: 'IV–♭VII–I modal cadence',
    };
  }
  return {
    degrees: [3, 0] as const,
    name: 'IV–I modal cadence',
  };
};

export const cadenceRecipeForScene = (
  scene: HarmonicScene,
  type: CadenceType,
): CadenceRecipe => {
  const usesLeadingTone = modeHasLeadingTone(scene);
  const predominantDegree = stableCadenceDegree(scene, 3, [1, 5, 2]);
  const dominantDegree = stableCadenceDegree(scene, 4, [6, 1, 2]);
  const deceptiveArrival = stableCadenceDegree(scene, 5, [2, 3, 0]);
  if (type === 'modal') {
    const modal = modalCadenceDegrees(scene);
    const modalDegrees = modal.degrees.map((degree, index) =>
      index === modal.degrees.length - 1
        ? 0
        : stableCadenceDegree(scene, degree, [1, 3, 4, 6, 5, 2]),
    );
    return {
      arrivalDegree: 0,
      degrees: modalDegrees,
      modeAwareName: modal.name,
      strength: scene.tension > 0.62 ? 0.76 : 0.84,
      type,
      usesLeadingTone: false,
    };
  }
  if (type === 'plagal') {
    return {
      arrivalDegree: 0,
      degrees: [predominantDegree, 0],
      modeAwareName: 'IV–I plagal cadence',
      strength: 0.76,
      type,
      usesLeadingTone: false,
    };
  }
  if (type === 'half') {
    return {
      arrivalDegree: dominantDegree,
      degrees: [
        stableCadenceDegree(scene, 1, [3, 5, 2]),
        predominantDegree,
        dominantDegree,
      ],
      modeAwareName: usesLeadingTone
        ? 'predominant–V half cadence'
        : 'modal dominant half cadence',
      strength: usesLeadingTone ? 0.68 : 0.58,
      type,
      usesLeadingTone,
    };
  }
  if (type === 'deceptive') {
    return {
      arrivalDegree: deceptiveArrival,
      degrees: [predominantDegree, dominantDegree, deceptiveArrival],
      modeAwareName: usesLeadingTone
        ? 'IV–V–VI deceptive cadence'
        : 'modal V–VI evasion',
      strength: usesLeadingTone ? 0.64 : 0.52,
      type,
      usesLeadingTone,
    };
  }
  return {
    arrivalDegree: 0,
    degrees: [predominantDegree, dominantDegree, 0],
    modeAwareName: usesLeadingTone
      ? 'IV–V–I authentic cadence'
      : 'modal V–I cadence',
    strength: usesLeadingTone ? 1 : 0.7,
    type,
    usesLeadingTone,
  };
};

export const chooseCadenceType = (
  scene: HarmonicScene,
  random: SeededRandom,
  goal: PhraseHarmonicGoal = 'resolve',
): CadenceType => {
  const hasLeadingTone = modeHasLeadingTone(scene);
  const modalWeight = hasLeadingTone ? 0.16 : 1.1;
  const goalWeights: Record<PhraseHarmonicGoal, readonly number[]> = {
    statement: [hasLeadingTone ? 0.8 : 0.28, 0.8, 0.12, 0.08, modalWeight],
    continuation: [0.2, 0.24, 1, 0.42, modalWeight * 0.72],
    question: [0.08, 0.06, 1.5, 0.32, modalWeight * 0.38],
    intensify: [0.22, 0.08, 1.2, 0.86, modalWeight * 0.38],
    release: [0.3, 1.12, 0.12, 0.5, modalWeight],
    resolve: [hasLeadingTone ? 1.5 : 0.38, 0.82, 0.04, 0.08, modalWeight],
  };
  const types: readonly CadenceType[] = [
    'authentic',
    'plagal',
    'half',
    'deceptive',
    'modal',
  ];
  const weights = [...goalWeights[goal]];
  weights[0] *= 0.65 + scene.cadenceBias * 0.8;
  weights[2] *= 0.72 + scene.tension * 0.72;
  weights[3] *= 0.64 + scene.tension * 0.82;
  return types[weightedIndex(weights, random)];
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
  const stages = shape.map(([arousal, valence, tension], index) => {
    const id = ids[index];
    return {
      arousalDelta: id === 'intensification'
        ? Math.max(arousal * intensity, 0.14)
        : arousal * intensity,
      id,
      tensionDelta: id === 'intensification'
        ? Math.max(tension * intensity, 0.055)
        : tension * intensity,
      valenceDelta: valence * valenceDirection,
    };
  });
  const initialEmotion = random.pick(CORE_EMOTIONS);
  const positiveJourney =
    valenceDirection > 0 && EMOTION_PRESETS[initialEmotion].valence >= 0.5;
  const emotionJourney: EmotionName[] = [initialEmotion];
  for (let index = 1; index < stages.length; index += 1) {
    const previous = EMOTION_PRESETS[emotionJourney[index - 1]];
    const stage = stages[index];
    const targetArousal = clamp(
      Math.max(
        previous.arousal + stage.arousalDelta * 1.8,
        positiveJourney && stage.id === 'development'
          ? 0.58
          : positiveJourney && stage.id === 'intensification'
            ? 0.82
            : 0,
      ),
    );
    const targetValence = clamp(Math.max(
      previous.valence + stage.valenceDelta * 1.5,
      positiveJourney && stage.id === 'intensification' ? 0.72 : 0,
    ));
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

export const phraseHarmonicGoalForFormStage = (
  stage: EmotionalFormStage,
): PhraseHarmonicGoal => {
  if (stage.id === 'development') return 'continuation';
  if (stage.id === 'intensification') return 'intensify';
  if (stage.id === 'release') return 'release';
  if (stage.id === 'return') return 'resolve';
  return 'statement';
};

export const shapeSceneWithEmotionalForm = (
  scene: HarmonicScene,
  form: EmotionalFormPlan,
  sceneIndex: number,
): HarmonicScene => {
  const stage = emotionalFormStageAt(form, sceneIndex);
  const emotion = EMOTION_PRESETS[emotionalFormEmotionAt(form, sceneIndex)];
  const formLift: Record<EmotionalFormStage['id'], number> = {
    statement: -0.035,
    development: 0.035,
    intensification: 0.14,
    release: 0.025,
    return: -0.045,
  };
  const arousal = clamp(
    scene.arousal * 0.56 +
      emotion.arousal * 0.44 +
      stage.arousalDelta * 0.22 +
      formLift[stage.id],
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
  // Extensions are intentionally sparse: they colour structurally stable
  // chords, but do not turn every sustained bed into a dense seventh chord.
  if (color > 0.64 && harmonicFunction === 'tonic') {
    offsets = [0, 2, 4, 5];
  } else if (color > 0.69 && harmonicFunction === 'dominant') {
    offsets = [0, 2, 4, 6];
  } else if (color > 0.73 && harmonicFunction === 'predominant') {
    offsets = [0, 1, 2, 4];
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

export const chordBassPitchClass = (
  scene: HarmonicScene,
  degree: number,
  inversion: ChordInversion = 0,
) => {
  const classes = chordPitchClasses(scene, degree);
  return classes[Math.min(inversion, classes.length - 1)] ?? classes[0] ?? scene.tonic;
};

type BassCandidate = {
  inversion: ChordInversion;
  midi: number;
};

type BassPathState = BassCandidate & {
  cost: number;
  previousIndex: number;
};

const bassCandidatesForChord = (
  scene: HarmonicScene,
  degree: number,
  lowMidi: number,
  highMidi: number,
) => {
  const classes = chordPitchClasses(scene, degree);
  const candidates: BassCandidate[] = [];
  classes.slice(0, 4).forEach((noteClass, classIndex) => {
    for (let midi = lowMidi; midi <= highMidi; midi += 1) {
      if (pitchClass(midi) === noteClass) {
        candidates.push({
          inversion: Math.min(3, classIndex) as ChordInversion,
          midi,
        });
      }
    }
  });
  return candidates.length > 0
    ? candidates
    : [{ inversion: 0 as ChordInversion, midi: chordRootMidi(scene, degree) }];
};

export const planBassLine = (
  scene: HarmonicScene,
  harmony: PhraseHarmonicPlan,
  random: SeededRandom,
  options: BassLineOptions = {},
): BassLinePlan => {
  const lowMidi = Math.round(options.lowMidi ?? 38);
  const highMidi = Math.max(lowMidi, Math.round(options.highMidi ?? 55));
  const pedalStrength = clamp(options.pedalStrength ?? 0.78, 0, 2);
  const stepwiseStrength = clamp(options.stepwiseStrength ?? 0.86, 0, 2);
  const layers: BassPathState[][] = [];
  harmony.events.forEach((event, eventIndex) => {
    const candidates = bassCandidatesForChord(
      scene,
      event.degree,
      lowMidi,
      highMidi,
    );
    const previousLayer = layers[eventIndex - 1];
    const isArrival = event.structuralRole === 'cadence-arrival';
    const states = candidates.map((candidate): BassPathState => {
      const inversionCost = candidate.inversion === 0
        ? 0
        : candidate.inversion === 1
          ? 0.3
          : candidate.inversion === 2
            ? 0.68
            : 1.05;
      const registerCost = Math.abs(candidate.midi - 46) * 0.045;
      const cadenceCost = isArrival && candidate.inversion !== 0
        ? harmony.cadence.type === 'half'
          ? 3.2
          : 8.5
        : 0;
      const randomTieBreak = random.next() * 0.055;
      if (!previousLayer || previousLayer.length === 0) {
        const previousMidi = options.previousBassMidi;
        const openingDistance = previousMidi === undefined
          ? 0
          : Math.abs(candidate.midi - previousMidi);
        const openingMotion = openingDistance * 0.28 +
          Math.max(0, openingDistance - 7) * 4.8;
        return {
          ...candidate,
          cost: inversionCost + registerCost + cadenceCost + openingMotion + randomTieBreak,
          previousIndex: -1,
        };
      }
      let bestCost = Infinity;
      let bestPreviousIndex = 0;
      previousLayer.forEach((previous, previousIndex) => {
        const distance = Math.abs(candidate.midi - previous.midi);
        let transitionCost = distance * 0.26;
        if (distance > 7) transitionCost += (distance - 7) * 1.45;
        if (distance === 0) transitionCost -= pedalStrength * 1.55;
        else if (distance <= 2) transitionCost -= stepwiseStrength * 1.28;
        else if (distance <= 4) transitionCost -= stepwiseStrength * 0.24;
        if (
          harmony.cadence.type === 'authentic' &&
          event.structuralRole === 'cadence-preparation' &&
          event.degree === 4 &&
          candidate.inversion !== 0
        ) {
          transitionCost += 2.4;
        }
        const total = previous.cost +
          transitionCost +
          inversionCost +
          registerCost +
          cadenceCost +
          randomTieBreak;
        if (total < bestCost) {
          bestCost = total;
          bestPreviousIndex = previousIndex;
        }
      });
      return {
        ...candidate,
        cost: bestCost,
        previousIndex: bestPreviousIndex,
      };
    });
    layers.push(states);
  });

  const selected: BassCandidate[] = Array.from({ length: layers.length });
  let stateIndex = layers.at(-1)?.reduce(
    (bestIndex, state, index, states) =>
      state.cost < states[bestIndex].cost ? index : bestIndex,
    0,
  ) ?? -1;
  for (let eventIndex = layers.length - 1; eventIndex >= 0; eventIndex -= 1) {
    const state = layers[eventIndex][stateIndex];
    if (!state) break;
    selected[eventIndex] = { inversion: state.inversion, midi: state.midi };
    stateIndex = state.previousIndex;
  }

  const events = harmony.events.map((event, index): BassLineEvent => {
    const selectedBass = selected[index] ?? {
      inversion: 0 as ChordInversion,
      midi: chordRootMidi(scene, event.degree),
    };
    const previousMidi = index === 0
      ? options.previousBassMidi
      : selected[index - 1]?.midi;
    const distance = previousMidi === undefined
      ? Infinity
      : Math.abs(selectedBass.midi - previousMidi);
    const motion: BassMotion = previousMidi === undefined
      ? 'initial'
      : distance === 0
        ? 'pedal'
        : distance <= 2
          ? 'stepwise'
          : 'leap';
    return {
      bassMidi: selectedBass.midi,
      bassPitchClass: pitchClass(selectedBass.midi),
      degree: event.degree,
      inversion: selectedBass.inversion,
      motion,
      spanBars: event.spanBars,
      startBar: event.startBar,
    };
  });
  return {
    events,
    nonRootBassCount: events.filter((event) => event.inversion !== 0).length,
    pedalMotionCount: events.filter((event) => event.motion === 'pedal').length,
    stepwiseMotionCount: events.filter((event) => event.motion === 'stepwise').length,
  };
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
    if (modeHasLeadingTone(scene)) {
      const leadingTone = pitchClass(scene.tonic + 11);
      previous.forEach((note, index) => {
        if (pitchClass(note) === leadingTone && pitchClass(notes[index]) !== pitchClass(scene.tonic)) {
          cost += 4.6;
        }
      });
    }
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
  options: ChordVoicingOptions = {},
) => {
  const classes = chordPitchClasses(scene, degree);
  const count = Math.round(clamp(voiceCount, 1, 7));
  const ranges = Array.from({ length: count }, (_, voiceIndex) => {
    if (voiceIndex === 0) return [38, 55] as const;
    const position = count <= 2 ? 0.72 : (voiceIndex - 1) / Math.max(1, count - 2);
    const low = Math.round(47 + position * 20);
    return [low, Math.min(86, low + 15)] as const;
  });
  const requestedBassMidi = options.bassMidi !== undefined &&
      classes.includes(pitchClass(options.bassMidi))
    ? Math.round(options.bassMidi)
    : undefined;
  const bassClass = requestedBassMidi === undefined
    ? chordBassPitchClass(scene, degree, options.inversion ?? 0)
    : pitchClass(requestedBassMidi);
  const candidates = ranges.map(([low, high], voiceIndex) => {
    const values: number[] = [];
    for (let midi = low; midi <= high; midi += 1) {
      if (
        voiceIndex === 0
          ? requestedBassMidi === undefined
            ? pitchClass(midi) === bassClass
            : midi === requestedBassMidi
          : classes.includes(pitchClass(midi))
      ) {
        values.push(midi);
      }
    }
    const target = voiceIndex === 0 && requestedBassMidi !== undefined
      ? requestedBassMidi
      : previous.length === count && previous[voiceIndex] !== undefined
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
  let fallbackBass = requestedBassMidi ?? 36 + bassClass;
  while (fallbackBass < 40) fallbackBass += 12;
  while (fallbackBass > 55) fallbackBass -= 12;
  const fallback = [fallbackBass];
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

export const sceneScaleCommonTones = (
  from: HarmonicScene,
  to: HarmonicScene,
) => {
  const source = scenePitchClasses(from);
  return [...scenePitchClasses(to)].filter((note) => source.has(note)).length;
};

const circularPitchDistance = (from: number, to: number) => {
  const distance = Math.abs(pitchClass(to) - pitchClass(from));
  return Math.min(distance, 12 - distance);
};

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
  const keyMoves = [0, 7, 5, 2, 10, 9, 3] as const;
  const candidates: Array<{ modeIndex: number; score: number; tonic: number }> = [];
  for (const move of keyMoves) {
    const tonic = pitchClass(scene.tonic + move);
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex += 1) {
      const target = new Set(
        MODES[modeIndex].intervals.map((interval) => pitchClass(tonic + interval)),
      );
      const shared = [...target].filter((note) => source.has(note)).length;
      if (shared < 4) continue;
      const moodFit = 1 - Math.abs(MODES[modeIndex].valence - valence);
      const comfort = MODE_COMFORT_WEIGHT[modeIndex];
      const tonicDistance = circularPitchDistance(scene.tonic, tonic);
      const unchanged = modeIndex === scene.modeIndex && tonic === scene.tonic;
      const score =
        shared * 1.15 +
        moodFit * 1.4 +
        comfort * 0.7 +
        (modeIndex === scene.modeIndex ? 0.34 : 0) +
        (tonic === scene.tonic ? 0.2 : 0) -
        tonicDistance * 0.08 -
        (unchanged ? 0.62 : 0);
      candidates.push({ modeIndex, score, tonic });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const neighborhood = candidates.slice(0, Math.min(12, candidates.length));
  const floor = neighborhood.at(-1)?.score ?? 0;
  const neighbor = neighborhood[
    weightedIndex(
      neighborhood.map((candidate) => Math.exp((candidate.score - floor) * 1.35)),
      random,
    )
  ] ?? { modeIndex: scene.modeIndex, tonic: scene.tonic };
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

export const chooseChordSpanBars = (
  scene: HarmonicScene,
  random: SeededRandom,
  remainingPhraseBars = Infinity,
) => {
  const meter = METERS[scene.meterIndex];
  const chosen = meter.beatsPerBar <= 2
    ? random.pick([3, 4, 4, 5] as const)
    : meter.beatsPerBar >= 5
      ? random.pick([1, 1, 2, 2] as const)
      : scene.arousal > 0.72
        ? random.pick([1, 1, 1, 2] as const)
        : scene.arousal > 0.5
          ? random.pick([1, 1, 2, 2] as const)
          : random.pick([1, 2, 2, 2, 3] as const);
  return Math.max(1, Math.min(chosen, Math.max(1, Math.floor(remainingPhraseBars))));
};

const allocatePhraseSpans = (
  phraseBars: number,
  eventCount: number,
  cadenceEventCount: number,
  random: SeededRandom,
) => {
  const spans = Array.from({ length: eventCount }, () => 1);
  let remaining = phraseBars - eventCount;
  while (remaining > 0) {
    const index = weightedIndex(
      spans.map((span, eventIndex) => {
        const cadenceIndex = eventIndex - (eventCount - cadenceEventCount);
        const arrivalWeight = eventIndex === eventCount - 1 ? 1.32 : 1;
        const cadenceWeight = cadenceIndex >= 0 ? 0.9 : 1;
        const lengthPenalty = span >= 3 ? 0.16 : span === 2 ? 0.64 : 1;
        return arrivalWeight * cadenceWeight * lengthPenalty;
      }),
      random,
    );
    spans[index] += 1;
    remaining -= 1;
  }
  return spans;
};

const structuralTensionTarget = (
  role: HarmonicStructuralRole,
  cadence: CadenceRecipe,
  scene: HarmonicScene,
) => {
  if (role === 'establish') return Math.min(scene.tension, 0.22);
  if (role === 'departure') return clamp(scene.tension * 0.76 + 0.18, 0.22, 0.58);
  if (role === 'development') return clamp(scene.tension * 0.82 + 0.24, 0.3, 0.7);
  if (role === 'cadence-preparation') {
    return cadence.type === 'plagal' || cadence.type === 'modal' ? 0.56 : 0.78;
  }
  if (cadence.type === 'half') return 0.82;
  if (cadence.type === 'deceptive') return 0.48;
  return 0.08;
};

export const planPhraseHarmony = (
  scene: HarmonicScene,
  random: SeededRandom,
  options: PhraseHarmonyOptions = {},
): PhraseHarmonicPlan => {
  const phraseBars = Math.max(1, Math.round(options.phraseBars ?? scene.phraseBars));
  const goal = options.goal ?? (scene.tension > 0.62 ? 'release' : 'resolve');
  const cadenceType = options.cadenceType ?? chooseCadenceType(scene, random, goal);
  const cadence = cadenceRecipeForScene(scene, cadenceType);
  const averageSpan = scene.arousal > 0.72 ? 1.3 : scene.arousal > 0.46 ? 1.65 : 2.15;
  const minimumEventCount = Math.min(phraseBars, cadence.degrees.length + 2);
  const eventCount = Math.max(
    1,
    Math.min(
      phraseBars,
      Math.max(minimumEventCount, Math.round(phraseBars / averageSpan)),
    ),
  );
  const cadenceDegrees = cadence.degrees.slice(-Math.min(cadence.degrees.length, eventCount));
  const prefixCount = eventCount - cadenceDegrees.length;
  const planningScene = goal === 'intensify'
    ? { ...scene, tension: clamp(scene.tension + 0.16) }
    : goal === 'release'
      ? { ...scene, tension: clamp(scene.tension - 0.1) }
      : scene;
  const degrees: number[] = [];
  let degree = wrapDegree(options.startDegree ?? 0, MODES[scene.modeIndex].intervals.length);
  for (let index = 0; index < prefixCount; index += 1) {
    if (index > 0 || options.startDegree === undefined) {
      degree = chooseNextDegree(
        degree,
        planningScene,
        random,
        index / Math.max(1, eventCount - 1),
      );
    }
    degrees.push(degree);
  }
  degrees.push(...cadenceDegrees);
  const spans = allocatePhraseSpans(
    phraseBars,
    eventCount,
    cadenceDegrees.length,
    random,
  );
  let startBar = 0;
  const events = degrees.map((eventDegree, index): PhraseHarmonyEvent => {
    const cadenceStart = eventCount - cadenceDegrees.length;
    const cadential = index >= cadenceStart;
    const structuralRole: HarmonicStructuralRole = cadential
      ? index === eventCount - 1
        ? 'cadence-arrival'
        : 'cadence-preparation'
      : index === 0
        ? 'establish'
        : index / Math.max(1, cadenceStart) < 0.56
          ? 'departure'
          : 'development';
    const spanBars = spans[index];
    const event = {
      cadential,
      degree: wrapDegree(eventDegree, MODES[scene.modeIndex].intervals.length),
      harmonicFunction: harmonicFunctionForDegree(scene, eventDegree),
      index,
      spanBars,
      startBar,
      structuralRole,
      tensionTarget: structuralTensionTarget(structuralRole, cadence, scene),
    };
    startBar += spanBars;
    return event;
  });
  return { cadence, events, goal, phraseBars };
};

export const phraseHarmonyEventAtBar = (
  plan: PhraseHarmonicPlan,
  phraseBar: number,
) => {
  if (plan.events.length === 0) return undefined;
  const normalizedBar = Math.max(0, phraseBar) % Math.max(1, plan.phraseBars);
  return plan.events.find(
    (event) => normalizedBar >= event.startBar &&
      normalizedBar < event.startBar + event.spanBars,
  ) ?? plan.events.at(-1);
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
      // Randomness breaks ties; it must not outweigh contour, harmonic
      // resolution, or register. This keeps the motif audible as an identity.
      score += random.between(0, 0.62);
      return { midi, score };
    })
    .sort((a, b) => a.score - b.score);
  return weighted[0]?.midi ?? Math.round(target);
};
