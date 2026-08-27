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

export type SeedSnapshot = {
  currentSeed: string;
  emotion: EmotionName;
  incomingEmotion: EmotionName | null;
  incomingSeed: string | null;
  profile: WeatherProfile;
  transition: number;
};

// The complete visual library remains available, but the listening engine only
// chooses the four low-arousal states below. Keeping the full list here makes
// old shared links visually stable without reintroducing tense music.
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

const RELAXING_SEED_EMOTIONS = [
  'CALM',
  'WARM',
  'DREAMY',
  'NOSTALGIC',
] as const satisfies readonly EmotionName[];

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const smoothstep = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

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

export const initialEmotionFromSeed = (seed: string) =>
  RELAXING_SEED_EMOTIONS[
    deriveSeedNumber(seed, 'listening-world') % RELAXING_SEED_EMOTIONS.length
  ];

const EMOTION_VISUAL_BASE: Readonly<
  Record<
    (typeof RELAXING_SEED_EMOTIONS)[number],
    Pick<WeatherProfile, 'brightness' | 'density' | 'motion' | 'sparkle' | 'warmth'>
  >
> = {
  CALM: { brightness: 0.44, density: 0.3, motion: 0.2, sparkle: 0.18, warmth: 0.5 },
  WARM: { brightness: 0.54, density: 0.34, motion: 0.23, sparkle: 0.2, warmth: 0.78 },
  DREAMY: { brightness: 0.46, density: 0.32, motion: 0.27, sparkle: 0.28, warmth: 0.48 },
  NOSTALGIC: { brightness: 0.36, density: 0.27, motion: 0.18, sparkle: 0.14, warmth: 0.64 },
};

export const profileFromSeed = (seed: string): WeatherProfile => {
  const random = new SeededRandom(deriveSeedNumber(seed, 'weather'));
  const emotion = initialEmotionFromSeed(seed);
  const base = EMOTION_VISUAL_BASE[emotion];
  const variation = () => random.between(-0.035, 0.035);
  return {
    brightness: clamp(base.brightness + variation(), 0.3, 0.6),
    density: clamp(base.density + variation(), 0.22, 0.4),
    depth: clamp(0.66 + random.between(-0.08, 0.1), 0.56, 0.8),
    flow: clamp(0.36 + random.between(-0.08, 0.1), 0.26, 0.48),
    harmonicHue: random.between(0.18, 0.82),
    motion: clamp(base.motion + variation(), 0.14, 0.32),
    shape: random.between(0.22, 0.78),
    space: clamp(0.7 + random.between(-0.06, 0.08), 0.62, 0.8),
    sparkle: clamp(base.sparkle + variation(), 0.1, 0.32),
    spread: clamp(0.68 + random.between(-0.06, 0.08), 0.6, 0.8),
    warmth: clamp(base.warmth + variation(), 0.42, 0.82),
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
