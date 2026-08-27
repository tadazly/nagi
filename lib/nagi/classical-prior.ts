import classicalModel from './classical-model.json' with { type: 'json' };

type RandomLike = {
  next: () => number;
};

type WeightedValue = [number | string, number];

export type ClassicalMetricClass = 'downbeat' | 'beat' | 'offbeat';

export type ClassicalContourContext = {
  /** Absolute or phrase-relative onsets, in the runtime transport's beat unit. */
  onsetBeats?: readonly number[];
  /** Meter length in quarter-note beats. Required when onsetBeats are bar-relative. */
  beatsPerBar?: number;
  /** Runtime metric strengths, indexed by note, when the caller already has them. */
  metricStrengths?: readonly number[];
  /** Blend the trained phrase-final interval distribution into the last motion. */
  cadenceStrength?: number;
};

type ClassicalModel = {
  bassIntervalWeights: number[];
  cadenceIntervals: Record<string, WeightedValue[]>;
  chordToneProbability: Record<string, number>;
  initialIntervals: Record<string, WeightedValue[]>;
  intervalTransitions: Record<string, WeightedValue[]>;
  intervalViews: Record<string, WeightedValue[]>;
  meta: {
    accompanimentNoteCount: number;
    composerCount: number;
    corpus: string;
    license: string;
    melodyNoteCount: number;
    phraseCount: number;
    revision: string;
    scoreCount: number;
    source: string;
  };
  motifNgrams: Array<[string, number]>;
  rhythmInitial: Record<string, WeightedValue[]>;
  rhythmTransitions: Record<string, WeightedValue[]>;
};

const model = classicalModel as unknown as ClassicalModel;

export const CLASSICAL_MODEL_META = model.meta;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const sampleRows = (
  random: RandomLike,
  rows: WeightedValue[],
  weightFor?: (value: number | string, count: number) => number,
) => {
  if (rows.length === 0) return 0;
  const weights = rows.map(([value, count]) =>
    Math.max(0.0001, weightFor ? weightFor(value, count) : count ** 0.78),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random.next() * total;
  for (let index = 0; index < rows.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return rows[index][0];
  }
  return rows.at(-1)?.[0] ?? 0;
};

const circularDistance = (value: number, target: number, period: number) => {
  const distance = Math.abs(value - target) % period;
  return Math.min(distance, period - distance);
};

export const classicalMetricClassAt = (
  onsetBeat: number,
  beatsPerBar = 4,
): ClassicalMetricClass => {
  const barLength = Math.max(1, beatsPerBar);
  const beatInBar = ((onsetBeat % barLength) + barLength) % barLength;
  if (circularDistance(beatInBar, 0, barLength) < 0.06) return 'downbeat';
  if (Math.abs(onsetBeat - Math.round(onsetBeat)) < 0.08) return 'beat';
  return 'offbeat';
};

const metricClassForNote = (
  noteIndex: number,
  context?: ClassicalContourContext,
): ClassicalMetricClass | null => {
  const strength = context?.metricStrengths?.[noteIndex];
  if (strength !== undefined) {
    if (strength >= 0.84) return 'downbeat';
    if (strength >= 0.42) return 'beat';
    return 'offbeat';
  }
  const onset = context?.onsetBeats?.[noteIndex];
  if (onset === undefined) return null;
  return classicalMetricClassAt(onset, context?.beatsPerBar);
};

const parseMotifNgram = (value: number | string) =>
  String(value)
    .split(',')
    .map(Number)
    .filter(Number.isFinite);

export const sampleClassicalMotifIntervals = (random: RandomLike) => {
  const sampled = sampleRows(random, model.motifNgrams, (value, count) => {
    const intervals = parseMotifNgram(value);
    const distinct = new Set(intervals).size;
    const stationary = intervals.filter((interval) => interval === 0).length;
    const variety = 0.34 + Math.min(3, distinct) * 0.28;
    const motion = 1 - Math.max(0, stationary - 1) * 0.13;
    return count ** 0.66 * variety * Math.max(0.28, motion);
  });
  return parseMotifNgram(sampled);
};

export const sampleClassicalCadenceInterval = (
  random: RandomLike,
  mode: 'major' | 'minor',
  currentDegree = 0,
) => {
  const rows = model.cadenceIntervals[mode] ?? model.cadenceIntervals.major;
  return Number(
    sampleRows(random, rows, (value, count) => {
      const interval = Number(value);
      const arrival = currentDegree + interval;
      let weight = count ** 0.72;
      // Preserve the corpus distribution while preferring singable, centered
      // phrase endings over repeated-note or registrally expanding gestures.
      if (interval === 0) weight *= 0.62;
      if (Math.abs(interval) <= 2) weight *= 1.18;
      weight *= 1 / (1 + Math.abs(arrival) * 0.08);
      return weight;
    }),
  );
};

export const sampleClassicalContour = (
  random: RandomLike,
  length: number,
  mode: 'major' | 'minor',
  context?: ClassicalContourContext,
) => {
  const size = Math.max(4, Math.min(9, Math.round(length)));
  const contour = [0];
  const intervals: number[] = [];
  const motifPrior = sampleClassicalMotifIntervals(random);
  const initialRows = model.initialIntervals[mode] ?? model.initialIntervals.major;
  const priorInitial = motifPrior[0];
  let initial = Number.isFinite(priorInitial) && random.next() < 0.68
    ? priorInitial
    : Number(
        sampleRows(random, initialRows, (value, count) => {
          const interval = Number(value);
          const priorAffinity = Number.isFinite(priorInitial)
            ? 1 / (1 + Math.abs(interval - priorInitial) * 0.36)
            : 1;
          return count ** 0.74 *
            (interval === 0 ? 0.2 : 1) *
            (Math.abs(interval) > 4 ? 0.35 : 1) *
            priorAffinity;
        }),
      );
  if (initial === 0) initial = random.next() < 0.5 ? -1 : 1;
  intervals.push(initial);
  contour.push(initial);

  while (contour.length < size) {
    const previousOne = intervals.at(-1) ?? 0;
    const previousTwo = intervals.at(-2) ?? 0;
    const metricClass = metricClassForNote(contour.length, context);
    const viewKey = metricClass
      ? `${mode}|${metricClass}|${previousTwo},${previousOne}`
      : null;
    const rows =
      (viewKey ? model.intervalViews[viewKey] : undefined) ??
      model.intervalTransitions[`${previousTwo},${previousOne}`] ??
      initialRows;
    const progress = contour.length / (size - 1);
    const archTarget = Math.sin(progress * Math.PI) * (mode === 'major' ? 2.2 : 1.7);
    const motifPriorInterval = motifPrior[intervals.length];
    const cadenceStrength = clamp(context?.cadenceStrength ?? 0, 0, 1);
    const cadenceCandidate = contour.length === size - 1 && cadenceStrength > 0
      ? sampleClassicalCadenceInterval(random, mode, contour.at(-1) ?? 0)
      : null;
    let interval: number;
    if (cadenceCandidate !== null && random.next() < cadenceStrength) {
      interval = cadenceCandidate;
    } else if (Number.isFinite(motifPriorInterval) && random.next() < 0.58) {
      interval = motifPriorInterval;
    } else {
      interval = Number(
        sampleRows(random, rows, (value, count) => {
          const candidate = Number(value);
          const proposed = contour.at(-1)! + candidate;
          const priorAffinity = Number.isFinite(motifPriorInterval)
            ? 1 / (1 + Math.abs(candidate - motifPriorInterval) * 0.3)
            : 1;
          let weight = count ** 0.72 * priorAffinity;
          if (candidate === 0 && previousOne === 0) weight *= 0.06;
          if (Math.abs(candidate) > 4) weight *= 0.28;
          if (Math.abs(proposed) > 5) weight *= 0.05;
          if (progress > 0.72) {
            weight *= 1 / (1 + Math.abs(proposed) * 0.42);
          } else {
            weight *= 1 / (1 + Math.abs(proposed - archTarget) * 0.16);
          }
          if (
            intervals.length >= 3 &&
            Math.sign(candidate) !== 0 &&
            intervals.slice(-3).every((value) => Math.sign(value) === Math.sign(candidate))
          ) {
            weight *= 0.28;
          }
          return weight;
        }),
      );
    }
    let proposed = contour.at(-1)! + interval;
    if (Math.abs(proposed) > 5) {
      interval = -Math.sign(proposed) * Math.max(1, Math.min(3, Math.abs(interval)));
      proposed = contour.at(-1)! + interval;
    }
    intervals.push(interval);
    contour.push(clamp(proposed, -5, 5));
  }

  return contour;
};

export const sampleClassicalRhythm = (
  random: RandomLike,
  length: number,
  mode: 'major' | 'minor',
  arousal: number,
) => {
  const size = Math.max(4, Math.min(9, Math.round(length)));
  const rows = model.rhythmInitial[mode] ?? model.rhythmInitial.major;
  const rhythm: number[] = [];
  let previous = String(sampleRows(random, rows));
  for (let index = 0; index < size; index += 1) {
    const choices = model.rhythmTransitions[`${mode}|${previous}`] ?? rows;
    const sampled = index === 0 ? previous : String(sampleRows(random, choices));
    const learned = Number(sampled);
    const moodScale = 1.28 - clamp(arousal, 0, 1) * 0.3;
    rhythm.push(clamp(learned * moodScale, 0.5, 2.5));
    previous = sampled;
  }
  return rhythm;
};

const metricName = (strength: number) => {
  if (strength >= 0.84) return 'downbeat';
  if (strength >= 0.42) return 'beat';
  return 'offbeat';
};

export const classicalChordToneProbability = (
  mode: 'major' | 'minor',
  metricStrength: number,
) => model.chordToneProbability[`${mode}|${metricName(metricStrength)}`] ?? 0.75;

export const classicalBassIntervalAffinity = (intervalClass: number) =>
  model.bassIntervalWeights[((intervalClass % 12) + 12) % 12] ?? 0.2;
