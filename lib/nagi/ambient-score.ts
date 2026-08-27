import {
  SeededRandom,
  clamp,
  deriveSeedNumber,
  seedToNumber,
  type EmotionName,
} from './generative.ts';

export const BEATS_PER_BAR = 4;
export const BARS_PER_PHRASE = 8;
export const PHRASES_PER_CYCLE = 4;
export const BARS_PER_CYCLE = BARS_PER_PHRASE * PHRASES_PER_CYCLE;
export const BEATS_PER_CYCLE = BARS_PER_CYCLE * BEATS_PER_BAR;

export type ListeningWorldId = 'lagoon' | 'hearth' | 'cloud' | 'memory';
export type AmbientVoice = 'breath' | 'bell';

export type ListeningWorld = {
  arousal: number;
  brightness: number;
  chordShapes: readonly (readonly number[])[];
  emotion: EmotionName;
  id: ListeningWorldId;
  label: string;
  melodyScale: readonly number[];
  progression: readonly (readonly number[])[];
  space: number;
  tempoRange: readonly [number, number];
  valence: number;
  warmth: number;
};

export type ListeningProfile = {
  arousal: number;
  brightness: number;
  emotion: EmotionName;
  keyName: string;
  seed: string;
  space: number;
  tempo: number;
  tonicMidi: number;
  valence: number;
  warmth: number;
  world: ListeningWorld;
};

export type AmbientChordEvent = {
  beat: number;
  durationBeats: number;
  intensity: number;
  midi: readonly [number, number, number];
  phrase: number;
};

export type AmbientNoteEvent = {
  beat: number;
  durationBeats: number;
  intensity: number;
  midi: number;
  pan: number;
  phrase: number;
  voice: AmbientVoice;
};

export type RestWindow = {
  beat: number;
  durationBeats: number;
  phrase: number;
};

export type AmbientCycle = {
  chords: readonly AmbientChordEvent[];
  cycleIndex: number;
  notes: readonly AmbientNoteEvent[];
  profile: ListeningProfile;
  rests: readonly RestWindow[];
  totalBeats: number;
};

export type TimbreRecipe = {
  attackSeconds: number;
  gain: number;
  highpassHz: number;
  lowpassHz: number;
  partials: readonly { amplitude: number; ratio: number }[];
  releaseSeconds: number;
  reverbSend: number;
};

export const AMBIENT_TIMBRES = {
  pad: {
    attackSeconds: 3.8,
    gain: 0.052,
    highpassHz: 54,
    lowpassHz: 1_380,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.13 },
      { ratio: 3, amplitude: 0.055 },
      { ratio: 4, amplitude: 0.018 },
    ],
    releaseSeconds: 4.6,
    reverbSend: 0.48,
  },
  breath: {
    attackSeconds: 0.38,
    gain: 0.05,
    highpassHz: 120,
    lowpassHz: 1_850,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.09 },
      { ratio: 3, amplitude: 0.025 },
    ],
    releaseSeconds: 1.1,
    reverbSend: 0.58,
  },
  bell: {
    attackSeconds: 0.018,
    gain: 0.044,
    highpassHz: 180,
    lowpassHz: 3_200,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.12 },
      { ratio: 3, amplitude: 0.035 },
    ],
    releaseSeconds: 2.5,
    reverbSend: 0.66,
  },
} as const satisfies Readonly<Record<'pad' | AmbientVoice, TimbreRecipe>>;

// Every sonority is deliberately an open three-note voicing. The low pair is
// never closer than a fifth, while colour tones live above middle C. This is a
// much safer foundation for long listening than imitating a dense orchestra.
export const LISTENING_WORLDS: readonly ListeningWorld[] = [
  {
    id: 'lagoon',
    label: 'still water',
    emotion: 'CALM',
    tempoRange: [57, 61],
    melodyScale: [0, 2, 4, 7, 9],
    chordShapes: [
      [0, 7, 16],
      [0, 7, 14],
      [-7, 0, 9],
      [-5, 2, 12],
    ],
    progression: [
      [0, 1, 2, 0],
      [0, 1, 3, 0],
      [2, 1, 3, 2],
      [0, 2, 1, 0],
    ],
    arousal: 0.16,
    brightness: 0.48,
    space: 0.78,
    valence: 0.68,
    warmth: 0.56,
  },
  {
    id: 'hearth',
    label: 'warm light',
    emotion: 'WARM',
    tempoRange: [59, 63],
    melodyScale: [0, 2, 4, 7, 9],
    chordShapes: [
      [0, 7, 16],
      [-3, 4, 12],
      [-7, 0, 9],
      [0, 7, 14],
    ],
    progression: [
      [0, 1, 2, 0],
      [0, 1, 3, 0],
      [2, 1, 0, 2],
      [0, 2, 1, 0],
    ],
    arousal: 0.2,
    brightness: 0.55,
    space: 0.66,
    valence: 0.74,
    warmth: 0.82,
  },
  {
    id: 'cloud',
    label: 'open sky',
    emotion: 'DREAMY',
    tempoRange: [55, 59],
    melodyScale: [0, 2, 3, 7, 9],
    chordShapes: [
      [0, 7, 15],
      [-5, 2, 10],
      [-3, 4, 12],
      [0, 7, 17],
    ],
    progression: [
      [0, 3, 1, 0],
      [0, 2, 1, 0],
      [1, 3, 2, 1],
      [0, 1, 3, 0],
    ],
    arousal: 0.15,
    brightness: 0.43,
    space: 0.86,
    valence: 0.6,
    warmth: 0.5,
  },
  {
    id: 'memory',
    label: 'evening memory',
    emotion: 'NOSTALGIC',
    tempoRange: [54, 58],
    melodyScale: [0, 2, 4, 7, 9],
    chordShapes: [
      [0, 7, 16],
      [-3, 4, 12],
      [-7, 0, 9],
      [-5, 2, 12],
    ],
    progression: [
      [0, 1, 2, 0],
      [0, 3, 2, 0],
      [2, 1, 3, 2],
      [0, 2, 1, 0],
    ],
    arousal: 0.13,
    brightness: 0.36,
    space: 0.8,
    valence: 0.56,
    warmth: 0.68,
  },
] as const;

const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'E♭',
  'E',
  'F',
  'F♯',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
] as const;

const TONIC_MIDI_CENTERS = [48, 50, 51, 53, 55] as const;
const MELODY_CONTOURS = [
  [0, 1, 2, 1, 0, 1],
  [2, 1, 0, 1, 3, 2],
  [1, 2, 3, 2, 1, 0],
  [0, 2, 1, 3, 2, 1],
] as const;
const MELODY_ONSETS = [3, 7, 11, 16, 21, 25] as const;
const MELODY_DURATIONS = [2.35, 2.1, 2.8, 2.75, 2.25, 2.45] as const;

const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;

export const listeningWorldFromSeed = (seed: string) =>
  LISTENING_WORLDS[
    deriveSeedNumber(seed, 'listening-world') % LISTENING_WORLDS.length
  ];

export const createListeningProfile = (seed: string): ListeningProfile => {
  const world = listeningWorldFromSeed(seed);
  const random = new SeededRandom(deriveSeedNumber(seed, 'listening-profile'));
  const tonicMidi =
    TONIC_MIDI_CENTERS[
      deriveSeedNumber(seed, 'tonic') % TONIC_MIDI_CENTERS.length
    ];
  const tonicPitchClass = pitchClass(tonicMidi);
  const [tempoLow, tempoHigh] = world.tempoRange;
  return {
    arousal: clamp(world.arousal + random.between(-0.018, 0.018), 0.1, 0.24),
    brightness: clamp(
      world.brightness + random.between(-0.035, 0.035),
      0.3,
      0.62,
    ),
    emotion: world.emotion,
    keyName: NOTE_NAMES[tonicPitchClass],
    seed,
    space: clamp(world.space + random.between(-0.025, 0.025), 0.6, 0.9),
    tempo: random.between(tempoLow, tempoHigh),
    tonicMidi,
    valence: clamp(world.valence + random.between(-0.025, 0.025), 0.52, 0.78),
    warmth: clamp(world.warmth + random.between(-0.035, 0.035), 0.44, 0.86),
    world,
  };
};

const chordToneNear = (
  targetMidi: number,
  chord: readonly number[],
  low = 60,
  high = 76,
) => {
  const pitchClasses = new Set(chord.map(pitchClass));
  const candidates: number[] = [];
  for (let midi = low; midi <= high; midi += 1) {
    if (pitchClasses.has(pitchClass(midi))) candidates.push(midi);
  }
  return candidates.reduce(
    (best, candidate) =>
      Math.abs(candidate - targetMidi) < Math.abs(best - targetMidi)
        ? candidate
        : best,
    candidates[0] ?? targetMidi,
  );
};

const melodyMidi = (
  profile: ListeningProfile,
  degree: number,
  chord: readonly number[],
  strongBeat: boolean,
) => {
  const safeDegree = Math.max(0, Math.min(profile.world.melodyScale.length - 1, degree));
  const target = profile.tonicMidi + 12 + profile.world.melodyScale[safeDegree];
  return strongBeat ? chordToneNear(target, chord) : target;
};

export const createAmbientCycle = (
  seed: string,
  cycleIndex = 0,
): AmbientCycle => {
  const profile = createListeningProfile(seed);
  const random = new SeededRandom(
    deriveSeedNumber(seedToNumber(seed) ^ cycleIndex, 'ambient-cycle'),
  );
  const chords: AmbientChordEvent[] = [];
  const notes: AmbientNoteEvent[] = [];
  const rests: RestWindow[] = [];

  for (let phrase = 0; phrase < PHRASES_PER_CYCLE; phrase += 1) {
    const phraseBeat = phrase * BARS_PER_PHRASE * BEATS_PER_BAR;
    const progression = profile.world.progression[phrase];
    const phraseChords: AmbientChordEvent[] = [];

    progression.forEach((shapeIndex, chordIndex) => {
      const shape = profile.world.chordShapes[shapeIndex];
      const midi = shape.map((offset) => profile.tonicMidi + offset) as [
        number,
        number,
        number,
      ];
      const event: AmbientChordEvent = {
        beat: phraseBeat + chordIndex * 8,
        durationBeats: chordIndex === progression.length - 1 ? 4 : 8,
        intensity: clamp(
          0.63 + phrase * 0.018 + random.between(-0.035, 0.035),
          0.56,
          0.72,
        ),
        midi,
        phrase,
      };
      phraseChords.push(event);
      chords.push(event);
    });

    rests.push({ beat: phraseBeat + 28, durationBeats: 4, phrase });

    const contour = MELODY_CONTOURS[
      (deriveSeedNumber(seed, `melody-${cycleIndex}-${phrase}`) + phrase) %
        MELODY_CONTOURS.length
    ];
    const contourShift = random.pick([-1, 0, 0, 0, 1] as const);

    MELODY_ONSETS.forEach((onset, noteIndex) => {
      const beat = phraseBeat + onset;
      const localBeat = onset;
      const chordIndex = Math.min(
        phraseChords.length - 1,
        Math.floor(localBeat / 8),
      );
      const chord = phraseChords[chordIndex].midi;
      const degree = Math.max(
        0,
        Math.min(
          profile.world.melodyScale.length - 1,
          contour[noteIndex] + contourShift,
        ),
      );
      const strongBeat = localBeat % BEATS_PER_BAR === 0;
      const voice = noteIndex === 0 || noteIndex === 3 ? 'bell' : 'breath';
      notes.push({
        beat,
        durationBeats: voice === 'bell' ? 1.2 : MELODY_DURATIONS[noteIndex],
        intensity: clamp(
          (noteIndex === 0 || noteIndex === 3 ? 0.43 : 0.39) +
            random.between(-0.035, 0.035),
          0.32,
          0.48,
        ),
        midi: melodyMidi(profile, degree, chord, strongBeat),
        pan: clamp(random.between(-0.26, 0.26), -0.3, 0.3),
        phrase,
        voice,
      });
    });
  }

  return {
    chords,
    cycleIndex,
    notes,
    profile,
    rests,
    totalBeats: BEATS_PER_CYCLE,
  };
};

export const midiToFrequency = (midi: number) =>
  440 * 2 ** ((midi - 69) / 12);

export const dyadRoughness = (midiA: number, midiB: number) => {
  const low = Math.min(midiToFrequency(midiA), midiToFrequency(midiB));
  const high = Math.max(midiToFrequency(midiA), midiToFrequency(midiB));
  const mean = (low + high) * 0.5;
  const criticalBandwidth = 25 + 75 * (1 + 1.4 * (mean / 1_000) ** 2) ** 0.69;
  const normalizedDistance = (high - low) / Math.max(1, criticalBandwidth);
  return Math.exp(-3.5 * normalizedDistance) - Math.exp(-5.75 * normalizedDistance);
};

export const chordRoughness = (midi: readonly number[]) => {
  let total = 0;
  let pairs = 0;
  for (let left = 0; left < midi.length; left += 1) {
    for (let right = left + 1; right < midi.length; right += 1) {
      total += Math.max(0, dyadRoughness(midi[left], midi[right]));
      pairs += 1;
    }
  }
  return pairs > 0 ? total / pairs : 0;
};

export const eventIsInsideRest = (
  event: { beat: number },
  rest: RestWindow,
) => event.beat >= rest.beat && event.beat < rest.beat + rest.durationBeats;
