export type WeatherProfile = {
  brightness: number;
  density: number;
  harmonicHue: number;
  motion: number;
  space: number;
  spread: number;
  warmth: number;
};

export type SeedSnapshot = {
  currentSeed: string;
  incomingSeed: string | null;
  profile: WeatherProfile;
  transition: number;
};

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
}

export const profileFromSeed = (seed: string): WeatherProfile => {
  const random = new SeededRandom(seed);
  return {
    brightness: random.between(0.28, 0.7),
    density: random.between(0.3, 0.72),
    harmonicHue: random.between(0.18, 0.82),
    motion: random.between(0.2, 0.68),
    space: random.between(0.5, 0.88),
    spread: random.between(0.45, 0.9),
    warmth: random.between(0.32, 0.76),
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
    harmonicHue: lerp(from.harmonicHue, to.harmonicHue),
    motion: lerp(from.motion, to.motion),
    space: lerp(from.space, to.space),
    spread: lerp(from.spread, to.spread),
    warmth: lerp(from.warmth, to.warmth),
  };
};

export const midiToFrequency = (midi: number) =>
  440 * 2 ** ((midi - 69) / 12);

export const pickAmbientPitch = (
  profile: WeatherProfile,
  random: SeededRandom,
  register = 0,
) => {
  const openMode = [0, 2, 4, 7, 9, 11, 14, 16, 19, 21];
  const shadedMode = [0, 2, 3, 7, 9, 10, 14, 15, 19, 21];
  const mode = random.next() < profile.harmonicHue ? openMode : shadedMode;
  const roll = Math.pow(random.next(), 1.32);
  const index = Math.min(mode.length - 1, Math.floor(roll * mode.length));
  const octave = random.next() < 0.17 ? 12 : 0;
  return midiToFrequency(38 + register + mode[index] + octave);
};
