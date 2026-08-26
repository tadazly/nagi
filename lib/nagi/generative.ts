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
  incomingSeed: string | null;
  profile: WeatherProfile;
  transition: number;
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
    brightness: random.between(0.3, 0.76),
    density: random.between(0.38, 0.78),
    depth: random.between(0.34, 0.9),
    flow: random.between(0.18, 0.86),
    harmonicHue: random.between(0.16, 0.86),
    motion: random.between(0.22, 0.72),
    shape: random.between(0.08, 0.94),
    space: random.between(0.48, 0.9),
    sparkle: random.between(0.16, 0.82),
    spread: random.between(0.48, 0.92),
    warmth: random.between(0.3, 0.78),
  };
};

export const tempoFromArousal = (arousal: number, valence = 0.5) =>
  clamp(36 + clamp(arousal) ** 1.12 * 57 + (clamp(valence) - 0.5) * 4, 34, 96);

const chooseModeForValence = (valence: number, random: SeededRandom) =>
  weightedIndex(
    MODES.map((mode) => 0.08 + Math.exp(-Math.abs(mode.valence - valence) * 5.2)),
    random,
  );

export const sceneFromSeed = (seed: string): HarmonicScene => {
  const random = new SeededRandom(seedToNumber(seed) ^ 0xb5297a4d);
  const arousal = random.between(0.08, 0.9);
  const valence = random.between(0.16, 0.88);
  return {
    arousal,
    cadenceBias: random.between(0.18, 0.68),
    chordColor: random.between(0.2, 0.92),
    groove: random.between(0.045, 0.16),
    meterIndex: weightedIndex([0.46, 0.16, 0.3, 0.08], random),
    modeIndex: chooseModeForValence(valence, random),
    motifRate: clamp(0.28 + arousal * 0.62 + random.between(-0.08, 0.08), 0.26, 0.9),
    phraseBars: arousal < 0.35
      ? random.pick([12, 16, 16] as const)
      : random.pick([8, 10, 12, 16] as const),
    tempo: tempoFromArousal(arousal, valence),
    tension: random.between(0.2, 0.66),
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

export const chooseNextDegree = (
  currentDegree: number,
  scene: HarmonicScene,
  random: SeededRandom,
  phraseProgress = 0.5,
) => {
  const modeLength = MODES[scene.modeIndex].intervals.length;
  const currentFunction = harmonicFunctionForDegree(scene, currentDegree);
  const cadenceWindow = smoothstep((phraseProgress - 0.68) / 0.32);
  const weights = Array.from({ length: modeLength }, (_, degree) => {
    const nextFunction = harmonicFunctionForDegree(scene, degree);
    let weight = FUNCTION_TRANSITIONS[currentFunction][nextFunction];
    const tensionDistance = Math.abs(degreeTension(degree) - scene.tension);
    weight *= 1.2 - tensionDistance * 0.62;
    if (degree === wrapDegree(currentDegree, modeLength)) weight *= 0.22;
    if (degree === 0) {
      weight *= 1 + cadenceWindow * (1.7 + scene.cadenceBias * 1.6);
    } else if (nextFunction === 'dominant') {
      weight *= 1 + (1 - cadenceWindow) * scene.cadenceBias * 0.5;
    }
    return Math.max(0.001, weight);
  });
  return weightedIndex(weights, random);
};

export const chordPitchClasses = (
  scene: HarmonicScene,
  degree: number,
  color = scene.chordColor,
) => {
  const mode = MODES[scene.modeIndex].intervals;
  const harmonicFunction = harmonicFunctionForDegree(scene, degree);
  let offsets: readonly number[] = [0, 2, 4];
  if (color > 0.7) {
    offsets = harmonicFunction === 'tonic' ? [0, 2, 4, 5, 1] : [0, 2, 4, 6, 1];
  } else if (color > 0.38) {
    offsets =
      harmonicFunction === 'tonic'
        ? [0, 2, 4, 5]
        : harmonicFunction === 'dominant'
          ? [0, 2, 4, 6]
          : [0, 1, 2, 4];
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
  while (midi > 45) midi -= 12;
  while (midi < 34) midi += 12;
  return midi;
};

const voicingCost = (notes: readonly number[], previous: readonly number[]) => {
  const center = notes.reduce((sum, note) => sum + note, 0) / notes.length;
  let cost = Math.abs(center - 65) * 0.08;
  for (let index = 1; index < notes.length; index += 1) {
    const gap = notes[index] - notes[index - 1];
    if (gap < 3) cost += (3 - gap) * 3.2;
    if (gap > 12) cost += (gap - 12) * 0.18;
    cost += sensoryRoughness(notes[index - 1], notes[index]) * 2.6;
  }
  if (notes[notes.length - 1] - notes[0] > 30) cost += 2.5;
  if (previous.length === 0) return cost;
  const symmetricMotion =
    notes.reduce(
      (sum, note) => sum + Math.min(...previous.map((old) => Math.abs(note - old))),
      0,
    ) +
    previous.reduce(
      (sum, old) => sum + Math.min(...notes.map((note) => Math.abs(note - old))),
      0,
    );
  cost += symmetricMotion * 0.26;
  cost -= notes.filter((note) => previous.includes(note)).length * 1.8;
  cost += Math.max(0, Math.abs(notes.at(-1)! - previous.at(-1)!) - 7) * 0.65;
  return cost;
};

export const voiceLeadChord = (
  scene: HarmonicScene,
  degree: number,
  previous: readonly number[] = [],
) => {
  const classes = chordPitchClasses(scene, degree);
  const candidates = classes.map((noteClass) => {
    const values: number[] = [];
    for (let midi = 52; midi <= 82; midi += 1) {
      if (pitchClass(midi) === noteClass) values.push(midi);
    }
    return values;
  });
  let best: number[] | null = null;
  let bestCost = Infinity;
  const visit = (index: number, chosen: number[]) => {
    if (index >= candidates.length) {
      const notes = [...chosen].sort((a, b) => a - b);
      if (new Set(notes).size !== notes.length) return;
      const cost = voicingCost(notes, previous);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
      return;
    }
    for (const midi of candidates[index]) visit(index + 1, [...chosen, midi]);
  };
  visit(0, []);
  return best ?? classes.map((noteClass, index) => 52 + noteClass + index * 3);
};

const scenePitchClasses = (scene: HarmonicScene) =>
  new Set(MODES[scene.modeIndex].intervals.map((interval) => pitchClass(scene.tonic + interval)));

export const chooseNeighborScene = (
  scene: HarmonicScene,
  random: SeededRandom,
): HarmonicScene => {
  const source = scenePitchClasses(scene);
  const arousal = clamp(scene.arousal + random.between(-0.2, 0.2), 0.06, 0.94);
  const valence = clamp(scene.valence + random.between(-0.17, 0.17), 0.12, 0.9);
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
    cadenceBias: random.between(0.18, 0.7),
    chordColor: clamp(scene.chordColor + random.between(-0.2, 0.2), 0.2, 0.94),
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
    tension: clamp(scene.tension + random.between(-0.18, 0.18), 0.16, 0.72),
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
    const score = shared * 1.4 - motion * 0.08 + tonicBonus;
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
      let score = distance * 0.16 + Math.abs(midi - target) * 0.075;
      if (distance === 0) score += 1.35;
      if (distance > 7) score += (distance - 7) * 0.75;
      score += chordTone ? -1.05 - metricStrength * 1.25 : metricStrength * 1.55;
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
      const scaleDegree = mode.indexOf(pitchClass(midi - scene.tonic));
      const tonalStability = [1, 0.44, 0.7, 0.58, 0.9, 0.64, 0.36][scaleDegree] ?? 0.45;
      score -= tonalStability * (0.18 + metricStrength * 0.52);
      score += random.between(0, 1.42);
      return { midi, score };
    })
    .sort((a, b) => a.score - b.score);
  return weighted[0]?.midi ?? Math.round(target);
};
