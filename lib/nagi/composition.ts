import {
  METERS,
  MODES,
  SeededRandom,
  clamp,
  metricStrengthAt,
  type HarmonicScene,
  type RhythmEvent,
  type RhythmRole,
} from './generative.ts';
import {
  sampleClassicalContour,
  sampleClassicalRhythm,
} from './classical-prior.ts';
import { chooseFamiliarClassicalTheme } from './classical-themes.ts';

export type MotifDNA = {
  anchorDegree: number;
  contour: number[];
  cursor: number;
  cycle: number;
  direction: -1 | 1;
  familiar: boolean;
  mutations: number;
  remainingBeats: number;
  rhythmBeats: number[];
  sequenceDegree: number;
  sourceName: string;
};

export type MotifEvent = RhythmEvent & {
  cycle: number;
  motifDegree: number;
  motifIndex: number;
};

const wrap = (value: number, length: number) =>
  ((value % length) + length) % length;

const clonePattern = (pattern: readonly number[]) => [...pattern];

const rotatePattern = <T>(pattern: readonly T[], amount: number) => {
  if (pattern.length === 0) return [];
  const offset = wrap(amount, pattern.length);
  return [...pattern.slice(offset), ...pattern.slice(0, offset)];
};

export const createMotif = (
  random: SeededRandom,
  arousal: number,
  role: RhythmRole,
  related?: MotifDNA,
  valence = 0.5,
): MotifDNA => {
  if (role === 'counter' && related) {
    const contour = related.contour
      .slice(0, Math.max(4, related.contour.length - 1))
      .reverse()
      .map((interval, index) => (index === 0 ? 0 : clamp(-interval, -4, 4)));
    const rhythmBeats = related.rhythmBeats
      .slice(0, contour.length)
      .reverse()
      .map((beat) => clamp(beat * random.between(1.15, 1.5), 0.75, 2.25));
    return {
      anchorDegree: wrap(related.anchorDegree + random.pick([2, 3, 4] as const), 7),
      contour,
      cursor: 0,
      cycle: 0,
      direction: random.next() < 0.5 ? -1 : 1,
      familiar: related.familiar,
      mutations: 0,
      remainingBeats: Math.round(random.between(0.75, 2.25) * 12) / 12,
      rhythmBeats,
      sequenceDegree: 0,
      sourceName: related.sourceName,
    };
  }

  const mode = valence >= 0.48 ? 'major' : 'minor';
  // Familiar material is a structural prior, not a quotation engine. Most
  // motifs come from the corpus model; archetypes are rotated, transposed in
  // scale space and often inverted before they enter the live composition.
  const useFamiliarTheme = random.next() < 0.34;
  const familiarTheme = useFamiliarTheme
    ? chooseFamiliarClassicalTheme(random, mode)
    : null;
  const motifLength = 5 + Math.floor(random.next() * 4);
  const themeRotation = familiarTheme
    ? Math.floor(random.next() * familiarTheme.contour.length)
    : 0;
  const rotatedTheme = familiarTheme
    ? rotatePattern(familiarTheme.contour, themeRotation)
    : null;
  const themeOrigin = rotatedTheme?.[0] ?? 0;
  let contour = rotatedTheme
    ? rotatedTheme
        .slice(0, motifLength)
        .map((degree) => clamp(degree - themeOrigin, -5, 5))
    : sampleClassicalContour(random, motifLength, mode);
  if (familiarTheme && random.next() < 0.48) {
    contour = contour.map((degree) => -degree);
  }
  if (familiarTheme && random.next() < 0.3) {
    contour = [0, ...contour.slice(1).reverse()];
  }
  const rhythm = familiarTheme
    ? rotatePattern(familiarTheme.rhythmBeats, themeRotation)
        .slice(0, contour.length)
        .map((beat) =>
          clamp(
            beat * (1.16 - arousal * 0.22) * random.between(0.9, 1.12),
            0.5,
            2.5,
          ),
        )
    : sampleClassicalRhythm(random, contour.length, mode, arousal);
  return {
    anchorDegree: random.pick([0, 0, 2, 4, 5] as const),
    contour,
    cursor: 0,
    cycle: 0,
    direction: random.next() < 0.22 ? -1 : 1,
    familiar: Boolean(familiarTheme),
    mutations: 0,
    remainingBeats: 0,
    rhythmBeats: clonePattern(rhythm),
    sequenceDegree: 0,
    sourceName: familiarTheme
      ? `${familiarTheme.composer} · ${familiarTheme.name}`
      : 'OpenScore Lieder corpus',
  };
};

const quantizeDuration = (beats: number, subdivisionsPerBeat: number) => {
  const sharedGrid = Math.max(12, subdivisionsPerBeat);
  return Math.max(1 / sharedGrid, Math.round(beats * sharedGrid) / sharedGrid);
};

const evolveMotif = (motif: MotifDNA, random: SeededRandom) => {
  motif.cycle += 1;
  motif.sequenceDegree = [0, 1, 0, -1][motif.cycle % 4];
  if (motif.cycle % 12 !== 0 || motif.contour.length < 4) return;
  const index = 1 + Math.floor(random.next() * (motif.contour.length - 1));
  motif.contour[index] = clamp(
    motif.contour[index] + random.pick([-1, 1] as const),
    -4,
    4,
  );
  if (motif.cycle % 36 === 0) {
    const rhythmIndex = Math.floor(random.next() * motif.rhythmBeats.length);
    motif.rhythmBeats[rhythmIndex] = clamp(
      motif.rhythmBeats[rhythmIndex] * random.pick([0.8, 1.25] as const),
      0.5,
      2.25,
    );
  }
  motif.mutations += 1;
};

export const planMotifPhrase = (
  scene: HarmonicScene,
  spanBars: number,
  random: SeededRandom,
  role: RhythmRole,
  motif: MotifDNA,
  phraseBar: number,
) => {
  const meter = METERS[scene.meterIndex];
  const totalBeats = spanBars * meter.beatsPerBar;
  const maximumEvents = role === 'lead' ? 16 : 9;
  let beat = Math.max(0, motif.remainingBeats);
  const events: MotifEvent[] = [];

  if (beat >= totalBeats) {
    motif.remainingBeats = beat - totalBeats;
    return events;
  }

  while (beat < totalBeats && events.length < maximumEvents) {
    const motifIndex = motif.cursor;
    const metricStrength = metricStrengthAt(meter, beat);
    const phrasePosition =
      ((phraseBar + beat / meter.beatsPerBar) % scene.phraseBars) /
      scene.phraseBars;
    // Keep expressive timing inside the shared transport grid. Strong beats
    // remain virtually exact; weaker notes may breathe by only a few ms.
    const rubatoDepth =
      (0.006 + (1 - scene.arousal) * 0.014) * (1 - metricStrength);
    const correlatedRubato =
      Math.sin((phrasePosition * 2 + motif.cycle * 0.17) * Math.PI) * rubatoDepth;
    const humanizeBeats =
      correlatedRubato + random.between(-0.0035, 0.0035) * (1 - metricStrength);
    const rawIoi = motif.rhythmBeats[motifIndex % motif.rhythmBeats.length];
    const ioi = quantizeDuration(rawIoi, meter.subdivisionsPerBeat);
    const articulation = clamp(
      0.58 + scene.valence * 0.18 + (1 - scene.arousal) * 0.17 + random.between(-0.04, 0.04),
      0.5,
      0.94,
    );
    const contour = motif.contour[motifIndex % motif.contour.length];
    events.push({
      accent: clamp(
        0.58 + metricStrength * 0.32 + (motifIndex === 0 ? 0.08 : 0) + random.between(-0.035, 0.035),
        0.48,
        1,
      ),
      beat,
      cycle: motif.cycle,
      durationBeats: Math.max(0.35, ioi * articulation),
      humanizeBeats,
      metricStrength,
      motifDegree:
        motif.anchorDegree + motif.sequenceDegree + motif.direction * contour,
      motifIndex,
    });

    beat += ioi;
    motif.cursor += 1;
    if (motif.cursor >= motif.contour.length) {
      motif.cursor = 0;
      evolveMotif(motif, random);
      const breath = role === 'lead'
        ? random.between(0.45, 1.15 + (1 - scene.arousal) * 1.1)
        : random.between(1.2, 2.4 + (1 - scene.arousal) * 1.2);
      beat += quantizeDuration(breath, meter.subdivisionsPerBeat);
    }
  }

  motif.remainingBeats = Math.max(0, beat - totalBeats);
  return events;
};

export const motifPitchClass = (scene: HarmonicScene, motifDegree: number) => {
  const mode = MODES[scene.modeIndex].intervals;
  const wrappedDegree = wrap(motifDegree, mode.length);
  return wrap(scene.tonic + mode[wrappedDegree], 12);
};
