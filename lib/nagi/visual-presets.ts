import type { EmotionName } from './generative.ts';

export type ShaderTemplate = {
  label: string;
  params: readonly [number, number, number, number];
  weights: readonly number[];
};

const shaderTemplate = (
  label: string,
  primary: number,
  secondary: number,
  accent: number,
  params: readonly [number, number, number, number],
): ShaderTemplate => {
  const weights = Array.from({ length: 12 }, () => 0);
  weights[primary] += 0.66;
  weights[secondary] += 0.26;
  weights[accent] += 0.08;
  return { label, params, weights };
};

export const EMOTION_COLOR_PALETTES: Readonly<
  Record<EmotionName, readonly [string, string, string]>
> = {
  CALM: ['#061621', '#164b55', '#9bc6c3'],
  WARM: ['#1b1018', '#75402f', '#e3b77d'],
  DREAMY: ['#0b102b', '#513f82', '#9ed7df'],
  JOYFUL: ['#071923', '#167b83', '#f0c96f'],
  UPLIFTING: ['#07162a', '#286fa1', '#e8c877'],
  ROMANTIC: ['#1b0d1d', '#7d3f68', '#e5a8a0'],
  NOSTALGIC: ['#17140f', '#625b3c', '#d0b98d'],
  MELANCHOLIC: ['#080f1d', '#2b4058', '#8399ad'],
  LONELY: ['#030811', '#142641', '#70859d'],
  MYSTERIOUS: ['#080b1d', '#38315f', '#5ca2a2'],
  TENSE: ['#12080d', '#5d2433', '#c68a61'],
  DARK: ['#02040a', '#151a31', '#53536b'],
};

// Original compact recipes built from common real-time shader idioms
// (mist, rays, ribbons, lattices, vortices, and particles); no shader source is copied.
export const EMOTION_SHADER_TEMPLATES: Readonly<
  Record<EmotionName, readonly [ShaderTemplate, ShaderTemplate, ShaderTemplate]>
> = {
  CALM: [
    shaderTemplate('mist tide', 0, 2, 1, [0.82, 0.55, 0.72, 0.32]),
    shaderTemplate('breathing halo', 1, 0, 10, [0.74, 0.42, 0.82, 0.22]),
    shaderTemplate('lagoon flow', 2, 0, 9, [0.9, 0.58, 0.68, 0.28]),
  ],
  WARM: [
    shaderTemplate('hearth bloom', 5, 1, 0, [0.88, 0.52, 0.76, 0.26]),
    shaderTemplate('amber tide', 0, 5, 9, [0.82, 0.48, 0.7, 0.24]),
    shaderTemplate('soft sunrays', 4, 1, 5, [0.76, 0.46, 0.8, 0.3]),
  ],
  DREAMY: [
    shaderTemplate('quiet aurora', 3, 0, 10, [1.06, 0.62, 0.78, 0.34]),
    shaderTemplate('orbital mist', 10, 0, 5, [0.96, 0.5, 0.72, 0.3]),
    shaderTemplate('ribbon haze', 9, 3, 0, [1.12, 0.66, 0.74, 0.36]),
  ],
  JOYFUL: [
    shaderTemplate('spark ribbons', 11, 9, 5, [1.14, 0.9, 0.9, 0.66]),
    shaderTemplate('sunlit rays', 4, 5, 11, [1.02, 0.82, 0.92, 0.58]),
    shaderTemplate('bright lagoon', 2, 11, 4, [1.08, 0.86, 0.84, 0.62]),
  ],
  UPLIFTING: [
    shaderTemplate('aurora rise', 3, 4, 5, [1.04, 0.78, 0.88, 0.48]),
    shaderTemplate('ascending silk', 9, 4, 3, [1.1, 0.76, 0.86, 0.46]),
    shaderTemplate('horizon bloom', 5, 2, 4, [0.98, 0.7, 0.9, 0.44]),
  ],
  ROMANTIC: [
    shaderTemplate('rose halo', 1, 5, 9, [0.9, 0.52, 0.8, 0.3]),
    shaderTemplate('silk orbit', 9, 10, 5, [1, 0.58, 0.76, 0.34]),
    shaderTemplate('velvet tide', 0, 2, 5, [0.86, 0.5, 0.74, 0.28]),
  ],
  NOSTALGIC: [
    shaderTemplate('faded mist', 0, 1, 7, [0.78, 0.4, 0.66, 0.2]),
    shaderTemplate('memory rings', 10, 2, 1, [0.84, 0.44, 0.7, 0.22]),
    shaderTemplate('late sunrays', 4, 0, 5, [0.8, 0.42, 0.72, 0.24]),
  ],
  MELANCHOLIC: [
    shaderTemplate('rain veil', 8, 0, 7, [0.86, 0.46, 0.78, 0.18]),
    shaderTemplate('moon ripple', 1, 2, 0, [0.76, 0.38, 0.7, 0.16]),
    shaderTemplate('deep drift', 7, 10, 0, [0.9, 0.42, 0.68, 0.14]),
  ],
  LONELY: [
    shaderTemplate('sparse stars', 11, 0, 10, [0.72, 0.34, 0.7, 0.1]),
    shaderTemplate('distant halo', 1, 10, 7, [0.68, 0.3, 0.74, 0.08]),
    shaderTemplate('empty tide', 2, 0, 10, [0.74, 0.32, 0.66, 0.09]),
  ],
  MYSTERIOUS: [
    shaderTemplate('slow vortex', 10, 7, 3, [1.08, 0.56, 0.88, 0.24]),
    shaderTemplate('shadow lattice', 10, 8, 0, [1, 0.5, 0.8, 0.2]),
    shaderTemplate('hidden aurora', 3, 7, 9, [1.12, 0.6, 0.84, 0.28]),
  ],
  TENSE: [
    shaderTemplate('soft crystal', 6, 0, 7, [1.16, 0.78, 0.82, 0.3]),
    shaderTemplate('rolling storm', 7, 0, 9, [1.14, 0.8, 0.8, 0.32]),
    shaderTemplate('light lattice', 7, 8, 0, [1.08, 0.76, 0.78, 0.3]),
  ],
  DARK: [
    shaderTemplate('black current', 7, 0, 10, [0.92, 0.48, 0.9, 0.12]),
    shaderTemplate('eclipse rings', 10, 6, 7, [0.88, 0.44, 0.94, 0.1]),
    shaderTemplate('dim lattice', 8, 7, 0, [0.98, 0.52, 0.92, 0.14]),
  ],
};
