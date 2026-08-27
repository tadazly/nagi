import {
  INSTRUMENTS,
  type InstrumentId,
} from './performance.ts';

export const INSTRUMENT_RENDERER_VERSION = 'spectral-sample-bank-v1';

export type InstrumentRenderKind =
  | 'air-column'
  | 'bowed-string'
  | 'ensemble'
  | 'organ'
  | 'voice'
  | 'plucked-string'
  | 'felt-string'
  | 'bar'
  | 'brass'
  | 'membrane'
  | 'subtractive';

type Formant = readonly [frequencyHz: number, widthHz: number, gain: number];
type Mode = readonly [frequencyRatio: number, gain: number, decayScale: number];

export type InstrumentRenderProfile = {
  airNoise: number;
  attackBrightness: number;
  decaySeconds: number;
  decayTilt: number;
  dynamicBrightness: number;
  formants: readonly Formant[];
  harmonicCount: number;
  inharmonicity: number;
  kind: InstrumentRenderKind;
  loop: boolean;
  model: string;
  modes?: readonly Mode[];
  motion: number;
  oddBias: number;
  pluckPosition?: number;
  roundRobins: number;
  sampleSeconds: number;
  stereoSpread: number;
  sustainBrightness: number;
  transientNoise: number;
  unisonCents?: readonly number[];
};

/**
 * Lightweight source models for every orchestral identity exposed by NAGI.
 * The profiles describe the excitation and resonator, while performance.ts
 * remains responsible for articulation, phrasing, vibrato and orchestration.
 */
export const INSTRUMENT_RENDER_PROFILES: Readonly<
  Record<InstrumentId, InstrumentRenderProfile>
> = {
  celesta: {
    airNoise: 0,
    attackBrightness: 1.35,
    decaySeconds: 2.35,
    decayTilt: 0.27,
    dynamicBrightness: 0.34,
    formants: [[2100, 1050, 0.18]],
    harmonicCount: 13,
    inharmonicity: 0.0017,
    kind: 'bar',
    loop: false,
    model: 'celesta-metal-resonator',
    modes: [[1, 1, 1], [2.76, 0.24, 0.63], [5.4, 0.13, 0.46], [8.93, 0.055, 0.34]],
    motion: 0,
    oddBias: 0,
    roundRobins: 3,
    sampleSeconds: 2.55,
    stereoSpread: 0.08,
    sustainBrightness: 0.58,
    transientNoise: 0.18,
  },
  flute: {
    airNoise: 0.13,
    attackBrightness: 0.72,
    decaySeconds: 2,
    decayTilt: 0.06,
    dynamicBrightness: 0.22,
    formants: [[900, 650, 0.18], [2600, 1450, 0.12]],
    harmonicCount: 12,
    inharmonicity: 0,
    kind: 'air-column',
    loop: true,
    model: 'flute-edge-tone',
    motion: 0.035,
    oddBias: -0.04,
    roundRobins: 2,
    sampleSeconds: 0.46,
    stereoSpread: 0.03,
    sustainBrightness: 0.46,
    transientNoise: 0.09,
  },
  clarinet: {
    airNoise: 0.055,
    attackBrightness: 0.73,
    decaySeconds: 2,
    decayTilt: 0.05,
    dynamicBrightness: 0.34,
    formants: [[1150, 430, 0.34], [2350, 720, 0.16]],
    harmonicCount: 15,
    inharmonicity: 0,
    kind: 'air-column',
    loop: true,
    model: 'clarinet-closed-bore',
    motion: 0.026,
    oddBias: 0.48,
    roundRobins: 2,
    sampleSeconds: 0.48,
    stereoSpread: 0.025,
    sustainBrightness: 0.52,
    transientNoise: 0.055,
  },
  violin: {
    airNoise: 0.045,
    attackBrightness: 1.12,
    decaySeconds: 2,
    decayTilt: 0.1,
    dynamicBrightness: 0.5,
    formants: [[480, 250, 0.2], [2700, 900, 0.42]],
    harmonicCount: 22,
    inharmonicity: 0,
    kind: 'bowed-string',
    loop: true,
    model: 'violin-bowed-body',
    motion: 0.055,
    oddBias: 0.04,
    roundRobins: 3,
    sampleSeconds: 0.5,
    stereoSpread: 0.035,
    sustainBrightness: 0.78,
    transientNoise: 0.08,
  },
  oboe: {
    airNoise: 0.075,
    attackBrightness: 1.08,
    decaySeconds: 2,
    decayTilt: 0.06,
    dynamicBrightness: 0.45,
    formants: [[1050, 350, 0.38], [2650, 760, 0.28]],
    harmonicCount: 18,
    inharmonicity: 0,
    kind: 'air-column',
    loop: true,
    model: 'oboe-double-reed',
    motion: 0.032,
    oddBias: 0.08,
    roundRobins: 2,
    sampleSeconds: 0.47,
    stereoSpread: 0.025,
    sustainBrightness: 0.78,
    transientNoise: 0.075,
  },
  strings: {
    airNoise: 0.035,
    attackBrightness: 0.9,
    decaySeconds: 2,
    decayTilt: 0.08,
    dynamicBrightness: 0.38,
    formants: [[520, 310, 0.18], [2450, 1000, 0.24]],
    harmonicCount: 18,
    inharmonicity: 0,
    kind: 'ensemble',
    loop: true,
    model: 'string-ensemble-bowed',
    motion: 0.085,
    oddBias: 0.02,
    roundRobins: 3,
    sampleSeconds: 0.56,
    stereoSpread: 0.22,
    sustainBrightness: 0.61,
    transientNoise: 0.04,
  },
  choir: {
    airNoise: 0.065,
    attackBrightness: 0.58,
    decaySeconds: 2,
    decayTilt: 0.07,
    dynamicBrightness: 0.26,
    formants: [[720, 170, 0.58], [1180, 250, 0.35], [2750, 620, 0.13]],
    harmonicCount: 18,
    inharmonicity: 0,
    kind: 'voice',
    loop: true,
    model: 'choir-vowel-ooh',
    motion: 0.072,
    oddBias: 0,
    roundRobins: 3,
    sampleSeconds: 0.58,
    stereoSpread: 0.2,
    sustainBrightness: 0.42,
    transientNoise: 0.035,
  },
  'soft-organ': {
    airNoise: 0.006,
    attackBrightness: 0.58,
    decaySeconds: 2,
    decayTilt: 0,
    dynamicBrightness: 0.08,
    formants: [[900, 720, 0.12], [2200, 1500, 0.08]],
    harmonicCount: 16,
    inharmonicity: 0,
    kind: 'organ',
    loop: true,
    model: 'organ-covered-flute-stops',
    motion: 0.012,
    oddBias: 0.03,
    roundRobins: 1,
    sampleSeconds: 0.42,
    stereoSpread: 0.14,
    sustainBrightness: 0.56,
    transientNoise: 0.012,
  },
  'soft-horns': {
    airNoise: 0.035,
    attackBrightness: 0.62,
    decaySeconds: 2,
    decayTilt: 0.05,
    dynamicBrightness: 0.44,
    formants: [[540, 320, 0.38], [1500, 720, 0.16]],
    harmonicCount: 15,
    inharmonicity: 0,
    kind: 'brass',
    loop: true,
    model: 'horn-section-muted',
    motion: 0.055,
    oddBias: 0.02,
    roundRobins: 3,
    sampleSeconds: 0.54,
    stereoSpread: 0.18,
    sustainBrightness: 0.5,
    transientNoise: 0.035,
  },
  cello: {
    airNoise: 0.032,
    attackBrightness: 0.86,
    decaySeconds: 2,
    decayTilt: 0.08,
    dynamicBrightness: 0.39,
    formants: [[300, 180, 0.32], [720, 360, 0.2], [2100, 850, 0.16]],
    harmonicCount: 18,
    inharmonicity: 0,
    kind: 'bowed-string',
    loop: true,
    model: 'cello-bowed-body',
    motion: 0.048,
    oddBias: 0.035,
    roundRobins: 3,
    sampleSeconds: 0.54,
    stereoSpread: 0.045,
    sustainBrightness: 0.56,
    transientNoise: 0.055,
  },
  contrabass: {
    airNoise: 0.018,
    attackBrightness: 0.66,
    decaySeconds: 2,
    decayTilt: 0.1,
    dynamicBrightness: 0.31,
    formants: [[145, 85, 0.28], [420, 230, 0.24], [1250, 650, 0.1]],
    harmonicCount: 15,
    inharmonicity: 0,
    kind: 'bowed-string',
    loop: true,
    model: 'contrabass-bowed-body',
    motion: 0.042,
    oddBias: 0.04,
    roundRobins: 3,
    sampleSeconds: 0.59,
    stereoSpread: 0.04,
    sustainBrightness: 0.4,
    transientNoise: 0.045,
  },
  bassoon: {
    airNoise: 0.045,
    attackBrightness: 0.73,
    decaySeconds: 2,
    decayTilt: 0.06,
    dynamicBrightness: 0.34,
    formants: [[480, 260, 0.32], [1280, 470, 0.3], [2500, 900, 0.11]],
    harmonicCount: 15,
    inharmonicity: 0,
    kind: 'air-column',
    loop: true,
    model: 'bassoon-double-reed',
    motion: 0.03,
    oddBias: 0.22,
    roundRobins: 2,
    sampleSeconds: 0.52,
    stereoSpread: 0.025,
    sustainBrightness: 0.52,
    transientNoise: 0.05,
  },
  'soft-bass': {
    airNoise: 0.004,
    attackBrightness: 0.42,
    decaySeconds: 2,
    decayTilt: 0.05,
    dynamicBrightness: 0.18,
    formants: [[110, 80, 0.25], [360, 240, 0.12]],
    harmonicCount: 11,
    inharmonicity: 0,
    kind: 'subtractive',
    loop: true,
    model: 'soft-bass-rounded',
    motion: 0.018,
    oddBias: -0.08,
    roundRobins: 2,
    sampleSeconds: 0.5,
    stereoSpread: 0.015,
    sustainBrightness: 0.31,
    transientNoise: 0.018,
  },
  harp: {
    airNoise: 0,
    attackBrightness: 1.42,
    decaySeconds: 3.2,
    decayTilt: 0.18,
    dynamicBrightness: 0.42,
    formants: [[520, 340, 0.16], [1850, 1100, 0.22]],
    harmonicCount: 20,
    inharmonicity: 0.00075,
    kind: 'plucked-string',
    loop: false,
    model: 'harp-plucked-soundboard',
    motion: 0,
    oddBias: 0.015,
    pluckPosition: 0.2,
    roundRobins: 4,
    sampleSeconds: 3.35,
    stereoSpread: 0.09,
    sustainBrightness: 0.5,
    transientNoise: 0.17,
  },
  'felt-piano': {
    airNoise: 0,
    attackBrightness: 1.12,
    decaySeconds: 3.5,
    decayTilt: 0.25,
    dynamicBrightness: 0.4,
    formants: [[250, 180, 0.14], [1150, 720, 0.16], [2700, 1300, 0.08]],
    harmonicCount: 20,
    inharmonicity: 0.0012,
    kind: 'felt-string',
    loop: false,
    model: 'felt-piano-three-string',
    motion: 0,
    oddBias: 0,
    roundRobins: 4,
    sampleSeconds: 3.6,
    stereoSpread: 0.1,
    sustainBrightness: 0.38,
    transientNoise: 0.12,
    unisonCents: [-0.85, 0, 0.9],
  },
  pizzicato: {
    airNoise: 0,
    attackBrightness: 1.28,
    decaySeconds: 1.15,
    decayTilt: 0.2,
    dynamicBrightness: 0.48,
    formants: [[430, 270, 0.2], [1900, 950, 0.18]],
    harmonicCount: 18,
    inharmonicity: 0.00035,
    kind: 'plucked-string',
    loop: false,
    model: 'pizzicato-string-body',
    motion: 0,
    oddBias: 0.04,
    pluckPosition: 0.27,
    roundRobins: 4,
    sampleSeconds: 1.55,
    stereoSpread: 0.06,
    sustainBrightness: 0.42,
    transientNoise: 0.2,
  },
  marimba: {
    airNoise: 0,
    attackBrightness: 1.08,
    decaySeconds: 2.15,
    decayTilt: 0.2,
    dynamicBrightness: 0.32,
    formants: [[250, 190, 0.12], [980, 620, 0.25]],
    harmonicCount: 10,
    inharmonicity: 0.002,
    kind: 'bar',
    loop: false,
    model: 'marimba-bar-resonator',
    modes: [[1, 1, 1], [2.76, 0.028, 0.37], [4, 0.36, 0.52], [10.1, 0.13, 0.3]],
    motion: 0,
    oddBias: 0,
    roundRobins: 4,
    sampleSeconds: 2.45,
    stereoSpread: 0.07,
    sustainBrightness: 0.38,
    transientNoise: 0.18,
  },
  trumpet: {
    airNoise: 0.03,
    attackBrightness: 1.25,
    decaySeconds: 2,
    decayTilt: 0.04,
    dynamicBrightness: 0.72,
    formants: [[1100, 500, 0.24], [2500, 850, 0.42], [4300, 1300, 0.18]],
    harmonicCount: 22,
    inharmonicity: 0,
    kind: 'brass',
    loop: true,
    model: 'trumpet-cylindrical-brass',
    motion: 0.045,
    oddBias: 0.015,
    roundRobins: 3,
    sampleSeconds: 0.48,
    stereoSpread: 0.11,
    sustainBrightness: 0.9,
    transientNoise: 0.075,
  },
  trombone: {
    airNoise: 0.026,
    attackBrightness: 1.03,
    decaySeconds: 2,
    decayTilt: 0.05,
    dynamicBrightness: 0.58,
    formants: [[650, 380, 0.28], [1800, 780, 0.3], [3400, 1200, 0.12]],
    harmonicCount: 19,
    inharmonicity: 0,
    kind: 'brass',
    loop: true,
    model: 'trombone-cylindrical-brass',
    motion: 0.04,
    oddBias: 0.02,
    roundRobins: 3,
    sampleSeconds: 0.52,
    stereoSpread: 0.1,
    sustainBrightness: 0.72,
    transientNoise: 0.06,
  },
  timpani: {
    airNoise: 0,
    attackBrightness: 0.72,
    decaySeconds: 2.45,
    decayTilt: 0.15,
    dynamicBrightness: 0.22,
    formants: [[105, 75, 0.34], [280, 190, 0.12]],
    harmonicCount: 9,
    inharmonicity: 0.008,
    kind: 'membrane',
    loop: false,
    model: 'timpani-membrane-kettle',
    modes: [[0.83, 0.24, 0.54], [1, 1, 1], [1.5, 0.38, 0.7], [1.99, 0.29, 0.58], [2.44, 0.17, 0.45], [2.89, 0.1, 0.34]],
    motion: 0,
    oddBias: 0,
    roundRobins: 4,
    sampleSeconds: 2.7,
    stereoSpread: 0.05,
    sustainBrightness: 0.28,
    transientNoise: 0.34,
  },
};

export type RenderedInstrumentSampleData = {
  channels: readonly Float32Array[];
  dynamicBucket: 0 | 1 | 2;
  instrument: InstrumentId;
  loop: boolean;
  loopEnd: number;
  loopStart: number;
  model: string;
  peak: number;
  rootMidi: number;
  variant: number;
};

export type RenderedInstrumentSample = Omit<
  RenderedInstrumentSampleData,
  'channels'
> & {
  buffer: AudioBuffer;
};

const TAU = Math.PI * 2;
const TARGET_PEAK = 0.84;

function midiToHz(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomSequence(seed: number) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function formantGain(frequency: number, formants: readonly Formant[]) {
  let gain = 1;
  for (const [center, width, amount] of formants) {
    const distance = (frequency - center) / Math.max(40, width);
    gain *= 1 + amount * Math.exp(-0.5 * distance * distance);
  }
  return gain;
}

function bucketDynamic(dynamic: number): 0 | 1 | 2 {
  if (dynamic < 0.48) return 0;
  if (dynamic < 0.76) return 1;
  return 2;
}

function dynamicForBucket(bucket: 0 | 1 | 2) {
  return [0.36, 0.62, 0.9][bucket];
}

function rootPitchForMidi(midi: number) {
  return clamp(Math.round(midi / 3) * 3, 24, 96);
}

type Component = {
  amplitude: number;
  beatingDepth: number;
  beatingHz: number;
  decayScale: number;
  motionCycles: number;
  motionPhase: number;
  phase: number;
  ratio: number;
};

function buildComponents(
  instrument: InstrumentId,
  profile: InstrumentRenderProfile,
  rootFrequency: number,
  dynamic: number,
  variant: number,
  nyquist: number,
) {
  const random = randomSequence(hash(`${instrument}:${variant}:partials`));
  const recipe = INSTRUMENTS[instrument];
  const components: Component[] = [];
  const source = profile.modes ?? Array.from(
    { length: profile.harmonicCount },
    (_, index) => [index + 1, 1, 1] as const,
  );
  for (let index = 0; index < source.length; index += 1) {
    const [baseRatio, modeGain, decayScale] = source[index];
    const harmonic = index + 1;
    const stretchedRatio = profile.modes
      ? baseRatio
      : baseRatio * Math.sqrt(1 + profile.inharmonicity * harmonic * harmonic);
    const tableAmplitude = profile.modes ? 1 : recipe.partials[harmonic] ??
      Math.max(0.0004, recipe.partials.at(-1) ?? 0.001) *
        Math.exp(-(harmonic - recipe.partials.length + 1) * 0.42);
    const oddScale = harmonic % 2 === 1
      ? 1 + profile.oddBias
      : 1 - profile.oddBias * 0.72;
    const dynamicTilt = Math.exp(
      (dynamic - 0.5) * profile.dynamicBrightness * (harmonic - 1) * 0.13,
    );
    const registerTilt = Math.exp(-Math.max(0, rootFrequency - 440) * harmonic * 0.000025);
    const pluckComb = profile.pluckPosition
      ? Math.max(0.035, Math.abs(Math.sin(Math.PI * harmonic * profile.pluckPosition)))
      : 1;
    const amplitude =
      tableAmplitude *
      modeGain *
      oddScale *
      pluckComb *
      dynamicTilt *
      registerTilt;
    const unisons = profile.unisonCents ?? [0];
    const centerCents = unisons.reduce((sum, cents) => sum + cents, 0) / unisons.length;
    const maximumCents = Math.max(...unisons.map((cents) => Math.abs(cents - centerCents)));
    const ratio = stretchedRatio * 2 ** (centerCents / 1200);
    const frequency = rootFrequency * ratio;
    if (frequency >= nyquist * 0.94) continue;
    components.push({
      amplitude: amplitude * formantGain(frequency, profile.formants),
      beatingDepth: unisons.length > 1 ? 0.12 : 0,
      beatingHz: rootFrequency * ratio * (2 ** (maximumCents / 1200) - 1),
      decayScale,
      motionCycles: 1 + (harmonic % 3),
      motionPhase: random() * TAU,
      phase: random() * TAU,
      ratio,
    });
  }
  return components;
}

function renderChannel(
  instrument: InstrumentId,
  profile: InstrumentRenderProfile,
  components: readonly Component[],
  rootFrequency: number,
  dynamic: number,
  variant: number,
  channel: number,
  length: number,
  sampleRate: number,
  loopStart: number,
  loopEnd: number,
) {
  const output = new Float32Array(length);
  const recipe = INSTRUMENTS[instrument];
  const attackSeconds = Math.max(0.004, Math.min(0.22, recipe.attack * 0.78));
  const loopDuration = Math.max(0.02, loopEnd - loopStart);
  const spectralFrames = Math.max(
    1,
    Math.round(Math.max(attackSeconds * 2.4, loopStart) * sampleRate),
  );

  // Add one resonant component at a time. Trigonometric recurrence avoids
  // millions of Math.sin/Math.exp calls on a scheduler cache miss while
  // producing the same deterministic PCM model.
  components.forEach((component, componentIndex) => {
    const partialOrder = Math.max(1, component.ratio);
    const attackTilt = Math.exp(
      -Math.max(0, 1 - profile.attackBrightness) * (partialOrder - 1) * 0.16,
    );
    const sustainTilt = Math.exp(
      -Math.max(0, 1 - profile.sustainBrightness) * (partialOrder - 1) * 0.16,
    );
    const ensemblePhase =
      channel * profile.stereoSpread * (0.55 + componentIndex * 0.09);
    const phase = component.phase + ensemblePhase;
    const phaseStep = TAU * rootFrequency * component.ratio / sampleRate;
    const sinStep = Math.sin(phaseStep);
    const cosStep = Math.cos(phaseStep);
    let sinPhase = Math.sin(phase);
    let cosPhase = Math.cos(phase);
    const decaySeconds = Math.max(
      0.08,
      profile.decaySeconds * component.decayScale /
        (1 + profile.decayTilt * Math.max(0, partialOrder - 1)),
    );
    const decayMultiplier = profile.loop
      ? 1
      : Math.exp(-1 / (decaySeconds * sampleRate));
    let decay = 1;

    const motionDepth = profile.loop ? profile.motion : component.beatingDepth;
    const motionFrequency = profile.loop
      ? component.motionCycles / loopDuration
      : component.beatingHz;
    const motionPhase = profile.loop
      ? component.motionPhase - TAU * component.motionCycles * loopStart / loopDuration
      : component.motionPhase;
    const motionStep = TAU * motionFrequency / sampleRate;
    const sinMotionStep = Math.sin(motionStep);
    const cosMotionStep = Math.cos(motionStep);
    let sinMotion = Math.sin(motionPhase);
    let cosMotion = Math.cos(motionPhase);
    for (let index = 0; index < length; index += 1) {
      const spectralProgress = Math.min(1, index / spectralFrames);
      const spectralTilt =
        attackTilt + (sustainTilt - attackTilt) * spectralProgress;
      const motion = motionDepth > 0 ? 1 + motionDepth * sinMotion : 1;
      output[index] +=
        component.amplitude * spectralTilt * decay * motion * sinPhase;

      const nextSinPhase = sinPhase * cosStep + cosPhase * sinStep;
      cosPhase = cosPhase * cosStep - sinPhase * sinStep;
      sinPhase = nextSinPhase;
      if (motionDepth > 0) {
        const nextSinMotion = sinMotion * cosMotionStep + cosMotion * sinMotionStep;
        cosMotion = cosMotion * cosMotionStep - sinMotion * sinMotionStep;
        sinMotion = nextSinMotion;
      }
      decay *= decayMultiplier;
      if ((index & 2047) === 2047) {
        const phaseScale = 1 / Math.max(1e-9, Math.hypot(sinPhase, cosPhase));
        sinPhase *= phaseScale;
        cosPhase *= phaseScale;
        if (motionDepth > 0) {
          const motionScale = 1 / Math.max(1e-9, Math.hypot(sinMotion, cosMotion));
          sinMotion *= motionScale;
          cosMotion *= motionScale;
        }
      }
    }
  });

  const random = randomSequence(hash(`${instrument}:${variant}:${channel}:excitation`));
  const attackMultiplier = Math.exp(-5.5 / Math.max(1, attackSeconds * sampleRate));
  const bodyDecayMultiplier = profile.loop
    ? 1
    : Math.exp(-1 / (Math.max(0.08, profile.decaySeconds) * sampleRate));
  const transientMultiplier = Math.exp(
    -1 / ((0.012 + recipe.attack * 0.38) * sampleRate),
  );
  const airMultiplier = Math.exp(
    -1 / (Math.max(0.15, profile.decaySeconds * 0.72) * sampleRate),
  );
  const tailFrames = profile.loop ? 0 : Math.min(length - 1, Math.ceil(sampleRate * 0.045));
  let coloredNoise = 0;
  let attackDecay = 1;
  let bodyDecay = 1;
  let transientDecay = 1;
  let airDecay = 1;
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const rawNoise = random() * 2 - 1;
    coloredNoise += (rawNoise - coloredNoise) * (0.08 + profile.airNoise * 0.24);
    const loopExcitationTaper = profile.loop
      ? clamp((loopStart - time) / 0.035, 0, 1)
      : 1;
    const spectralProgress = Math.min(1, index / spectralFrames);
    const transientEnvelope = transientDecay * loopExcitationTaper;
    const airEnvelope = profile.loop
      ? loopExcitationTaper * (1 - spectralProgress)
      : airDecay;
    let sample = output[index] + coloredNoise * (
      profile.transientNoise * transientEnvelope * (0.45 + dynamic * 0.55) +
      profile.airNoise * airEnvelope * 0.32
    );
    const bodyEnvelope = (1 - attackDecay) * bodyDecay;
    if (!profile.loop && index >= length - tailFrames) {
      const tailProgress = (length - 1 - index) / Math.max(1, tailFrames - 1);
      sample *= Math.sin(Math.PI * 0.5 * tailProgress) ** 2;
    }
    output[index] = sample * bodyEnvelope;
    attackDecay *= attackMultiplier;
    bodyDecay *= bodyDecayMultiplier;
    transientDecay *= transientMultiplier;
    airDecay *= airMultiplier;
  }
  return output;
}

/** Pure renderer used by the browser sample bank and Node-side audits. */
export function renderInstrumentSampleData(
  instrument: InstrumentId,
  midi: number,
  dynamic = 0.64,
  variant = 0,
  sampleRate = 48000,
): RenderedInstrumentSampleData {
  const profile = INSTRUMENT_RENDER_PROFILES[instrument];
  const dynamicBucket = bucketDynamic(dynamic);
  const bucketedDynamic = dynamicForBucket(dynamicBucket);
  const rootMidi = rootPitchForMidi(midi);
  const rootFrequency = midiToHz(rootMidi);
  const normalizedVariant = ((variant % profile.roundRobins) + profile.roundRobins) %
    profile.roundRobins;
  const loopStartCycles = Math.max(3, Math.ceil(rootFrequency * 0.16));
  const loopCycles = Math.max(12, Math.round(rootFrequency * 0.24));
  const loopStart = profile.loop ? loopStartCycles / rootFrequency : 0;
  const loopEnd = profile.loop
    ? loopStart + loopCycles / rootFrequency
    : profile.sampleSeconds;
  const length = Math.max(64, Math.ceil(
    (profile.loop ? loopEnd + 1 / rootFrequency : profile.sampleSeconds) * sampleRate,
  ));
  const components = buildComponents(
    instrument,
    profile,
    rootFrequency,
    bucketedDynamic,
    normalizedVariant,
    sampleRate * 0.5,
  );
  const channelCount = profile.stereoSpread >= 0.15 ? 2 : 1;
  const channels = Array.from({ length: channelCount }, (_, channel) =>
    renderChannel(
      instrument,
      profile,
      components,
      rootFrequency,
      bucketedDynamic,
      normalizedVariant,
      channel,
      length,
      sampleRate,
      loopStart,
      loopEnd,
    ),
  );

  let peak = 0;
  for (const channel of channels) {
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  }
  const normalization = peak > 0 ? TARGET_PEAK / peak : 1;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] *= normalization;
    }
  }

  return {
    channels,
    dynamicBucket,
    instrument,
    loop: profile.loop,
    loopEnd,
    loopStart,
    model: profile.model,
    peak: peak * normalization,
    rootMidi,
    variant: normalizedVariant,
  };
}

export type InstrumentSampleBankDiagnostics = {
  bytes: number;
  entries: number;
  evictions: number;
  hits: number;
  maximumRenderMs: number;
  misses: number;
  rendererVersion: string;
  totalRenderMs: number;
};

/**
 * Context-local LRU. Samples are created synchronously so scheduler timing and
 * seed determinism do not depend on network or asynchronous decode order.
 */
export class InstrumentSampleBank {
  private readonly cache = new Map<string, RenderedInstrumentSample>();
  private readonly context: BaseAudioContext;
  private readonly maximumEntries: number;
  private readonly maximumBytes: number;
  private bytes = 0;
  private evictions = 0;
  private hits = 0;
  private maximumRenderMs = 0;
  private misses = 0;
  private totalRenderMs = 0;

  constructor(
    context: BaseAudioContext,
    maximumEntries = 192,
    maximumBytes = 48 * 1024 * 1024,
  ) {
    this.context = context;
    this.maximumEntries = maximumEntries;
    this.maximumBytes = maximumBytes;
  }

  clear() {
    this.cache.clear();
    this.bytes = 0;
  }

  diagnostics(): InstrumentSampleBankDiagnostics {
    return {
      bytes: this.bytes,
      entries: this.cache.size,
      evictions: this.evictions,
      hits: this.hits,
      maximumRenderMs: this.maximumRenderMs,
      misses: this.misses,
      rendererVersion: INSTRUMENT_RENDERER_VERSION,
      totalRenderMs: this.totalRenderMs,
    };
  }

  get(instrument: InstrumentId, midi: number, dynamic: number, variant: number) {
    const profile = INSTRUMENT_RENDER_PROFILES[instrument];
    const rootMidi = rootPitchForMidi(midi);
    const dynamicBucket = bucketDynamic(dynamic);
    const normalizedVariant = ((variant % profile.roundRobins) + profile.roundRobins) %
      profile.roundRobins;
    const key = `${instrument}:${rootMidi}:${dynamicBucket}:${normalizedVariant}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.hits += 1;
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    this.misses += 1;
    const renderStartedAt = performance.now();
    // The production mix is already low-passed below 8 kHz. A 32 kHz source
    // rate preserves the audible instrument band while cutting cold-render
    // CPU and cache memory by one third on common 48 kHz devices.
    const synthesisSampleRate = Math.min(this.context.sampleRate, 32000);
    const data = renderInstrumentSampleData(
      instrument,
      rootMidi,
      dynamicForBucket(dynamicBucket),
      normalizedVariant,
      synthesisSampleRate,
    );
    const buffer = this.context.createBuffer(
      data.channels.length,
      data.channels[0].length,
      synthesisSampleRate,
    );
    data.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel));
    const renderMs = performance.now() - renderStartedAt;
    this.maximumRenderMs = Math.max(this.maximumRenderMs, renderMs);
    this.totalRenderMs += renderMs;
    const rendered: RenderedInstrumentSample = {
      buffer,
      dynamicBucket: data.dynamicBucket,
      instrument: data.instrument,
      loop: data.loop,
      loopEnd: data.loopEnd,
      loopStart: data.loopStart,
      model: data.model,
      peak: data.peak,
      rootMidi: data.rootMidi,
      variant: data.variant,
    };
    const renderedBytes = buffer.length * buffer.numberOfChannels * 4;
    while (
      this.cache.size >= this.maximumEntries ||
      (this.cache.size > 0 && this.bytes + renderedBytes > this.maximumBytes)
    ) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      const evicted = this.cache.get(oldest);
      if (evicted) {
        this.bytes -=
          evicted.buffer.length * evicted.buffer.numberOfChannels * 4;
      }
      this.cache.delete(oldest);
      this.evictions += 1;
    }
    this.cache.set(key, rendered);
    this.bytes += renderedBytes;
    return rendered;
  }
}

export function playbackRateForMidi(midi: number, rootMidi: number) {
  return 2 ** ((midi - rootMidi) / 12);
}
