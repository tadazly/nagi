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
};

export type HarmonicScene = {
  cadenceBias: number;
  chordColor: number;
  modeIndex: number;
  motifRate: number;
  tempo: number;
  tonic: number;
};

export const MODES: readonly ModeDefinition[] = [
  { id: 'ionian', name: 'Ionian', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'aeolian', name: 'Aeolian', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'harmonic-minor', name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'melodic-minor', name: 'Melodic minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
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

const DEGREE_TRANSITIONS: readonly (readonly number[])[] = [
  [3, 5, 1, 4, 0, 2],
  [4, 3, 6, 0, 5],
  [5, 3, 1, 4, 0],
  [0, 4, 1, 5, 2],
  [0, 5, 3, 1, 6],
  [3, 1, 4, 0, 2],
  [0, 2, 4, 5, 1],
] as const;

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

export const sceneFromSeed = (seed: string): HarmonicScene => {
  const random = new SeededRandom(seedToNumber(seed) ^ 0xb5297a4d);
  return {
    cadenceBias: random.between(0.18, 0.68),
    chordColor: random.between(0.2, 0.92),
    modeIndex: Math.floor(random.next() * MODES.length),
    motifRate: random.between(0.34, 0.82),
    tempo: random.between(46, 68),
    tonic: Math.floor(random.next() * 12),
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

export const sceneName = (scene: HarmonicScene) =>
  `${NOTE_NAMES[scene.tonic]} ${MODES[scene.modeIndex].name}`;

export const chooseNextDegree = (
  currentDegree: number,
  scene: HarmonicScene,
  random: SeededRandom,
) => {
  const choices = DEGREE_TRANSITIONS[currentDegree] ?? DEGREE_TRANSITIONS[0];
  const shaped = Math.pow(random.next(), 1.1 + scene.cadenceBias * 0.8);
  return choices[Math.min(choices.length - 1, Math.floor(shaped * choices.length))];
};

export const chordPitchClasses = (
  scene: HarmonicScene,
  degree: number,
  color = scene.chordColor,
) => {
  const mode = MODES[scene.modeIndex].intervals;
  const indices = color > 0.68 ? [0, 2, 4, 6, 1] : color > 0.36 ? [0, 2, 4, 1] : [0, 2, 4];
  return indices.map((offset) => {
    const scaleIndex = degree + offset;
    const octave = Math.floor(scaleIndex / mode.length) * 12;
    return (scene.tonic + mode[scaleIndex % mode.length] + octave) % 12;
  });
};

export const chordRootMidi = (scene: HarmonicScene, degree: number) => {
  const mode = MODES[scene.modeIndex].intervals;
  const pitchClass = (scene.tonic + mode[degree % mode.length]) % 12;
  let midi = 36 + pitchClass;
  while (midi > 45) midi -= 12;
  while (midi < 34) midi += 12;
  return midi;
};

export const voiceLeadChord = (
  scene: HarmonicScene,
  degree: number,
  previous: readonly number[] = [],
) => {
  const classes = chordPitchClasses(scene, degree);
  const targets = previous.length >= 4 ? previous : [52, 57, 62, 67, 74];
  const notes = classes.map((pitchClass, index) => {
    const candidates: number[] = [];
    for (let midi = 52; midi <= 81; midi += 1) {
      if (midi % 12 === pitchClass) candidates.push(midi);
    }
    const target = targets[Math.min(index, targets.length - 1)] ?? 60 + index * 4;
    return candidates.reduce((best, candidate) =>
      Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best,
    );
  });
  notes.sort((a, b) => a - b);
  for (let index = 1; index < notes.length; index += 1) {
    while (notes[index] - notes[index - 1] < 3 && notes[index] + 12 <= 81) {
      notes[index] += 12;
    }
  }
  return notes.sort((a, b) => a - b);
};

export const chooseNeighborScene = (
  scene: HarmonicScene,
  random: SeededRandom,
): HarmonicScene => {
  const keyMoves = [0, 7, 5, 2, 9, 3] as const;
  const modeMoves = [-2, -1, 0, 1, 2] as const;
  const keyMove = keyMoves[Math.floor(Math.pow(random.next(), 1.7) * keyMoves.length)];
  const modeMove = random.pick(modeMoves);
  return {
    cadenceBias: random.between(0.18, 0.7),
    chordColor: random.between(0.22, 0.94),
    modeIndex: (scene.modeIndex + modeMove + MODES.length) % MODES.length,
    motifRate: random.between(0.34, 0.84),
    tempo: Math.min(70, Math.max(44, scene.tempo + random.between(-5, 5))),
    tonic: (scene.tonic + keyMove) % 12,
  };
};

export const findPivotDegree = (
  from: HarmonicScene,
  fromDegree: number,
  to: HarmonicScene,
) => {
  const source = new Set(chordPitchClasses(from, fromDegree));
  let bestDegree = 0;
  let bestScore = -1;
  for (let degree = 0; degree < 7; degree += 1) {
    const target = chordPitchClasses(to, degree);
    const shared = target.filter((pitch) => source.has(pitch)).length;
    const tonicBonus = degree === 0 ? 0.2 : 0;
    if (shared + tonicBonus > bestScore) {
      bestScore = shared + tonicBonus;
      bestDegree = degree;
    }
  }
  return bestDegree;
};

export const pickMelodyMidi = (
  scene: HarmonicScene,
  chordDegree: number,
  previousMidi: number,
  random: SeededRandom,
) => {
  const mode = MODES[scene.modeIndex].intervals;
  const chordClasses = new Set(chordPitchClasses(scene, chordDegree));
  const candidates: number[] = [];
  for (let midi = 58; midi <= 84; midi += 1) {
    const relative = (midi - scene.tonic + 120) % 12;
    if (mode.includes(relative)) candidates.push(midi);
  }
  const weighted = candidates
    .map((midi) => ({
      midi,
      score:
        Math.abs(midi - previousMidi) * 0.24 +
        (chordClasses.has(midi % 12) ? -1.4 : 0) +
        random.between(0, 2.2),
    }))
    .sort((a, b) => a.score - b.score);
  return weighted[0]?.midi ?? 69;
};
