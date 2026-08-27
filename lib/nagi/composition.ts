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
  sampleClassicalCadenceInterval,
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
  lastPlannedDegree?: number;
  mutations: number;
  remainingBeats: number;
  rhythmBeats: number[];
  sequenceDegree: number;
  sourceName: string;
};

export type MotifEvent = RhythmEvent & {
  accentedDissonanceAllowed?: boolean;
  cadential?: boolean;
  cycle: number;
  harmonicIntent?:
    | 'structural'
    | 'passing'
    | 'neighbor'
    | 'suspension'
    | 'appoggiatura';
  mustResolveNext?: boolean;
  motifDegree: number;
  motifIndex: number;
  phraseRole?:
    | 'pickup'
    | 'statement'
    | 'continuation'
    | 'climax'
    | 'cadence'
    | 'echo';
  voiceRelation?: 'independent' | 'contrary' | 'oblique' | 'response';
};

export type MotifCreationContext = {
  meterIndex?: number;
  modeIndex?: number;
};

export type MotifPhrasePlanningOptions = {
  cadenceAtPhraseEnd?: boolean;
  counterpointAgainst?: readonly MotifEvent[];
  maximumEvents?: number;
  minimumOnsetSeparationBeats?: number;
};

export type MotifCounterpointPlan = {
  counterEvents: MotifEvent[];
  leadEvents: MotifEvent[];
};

const wrap = (value: number, length: number) =>
  ((value % length) + length) % length;

const clonePattern = (pattern: readonly number[]) => [...pattern];

const rotatePattern = <T>(pattern: readonly T[], amount: number) => {
  if (pattern.length === 0) return [];
  const offset = wrap(amount, pattern.length);
  return [...pattern.slice(offset), ...pattern.slice(0, offset)];
};

const quantizeDuration = (beats: number, subdivisionsPerBeat: number) => {
  const sharedGrid = Math.max(12, subdivisionsPerBeat);
  return Math.max(1 / sharedGrid, Math.round(beats * sharedGrid) / sharedGrid);
};

export const createMotif = (
  random: SeededRandom,
  arousal: number,
  role: RhythmRole,
  related?: MotifDNA,
  valence = 0.5,
  context: MotifCreationContext = {},
): MotifDNA => {
  if (role === 'counter' && related) {
    const sourceContour = related.contour.slice(
      0,
      Math.max(4, related.contour.length - 1),
    );
    const sourceIntervals = sourceContour
      .slice(1)
      .map((degree, index) => degree - sourceContour[index]);
    const responseIntervals = random.next() < 0.32
      ? [...sourceIntervals].reverse()
      : sourceIntervals;
    const contour = [0];
    for (const interval of responseIntervals) {
      contour.push(clamp(contour.at(-1)! - interval, -5, 5));
    }
    const rhythmBeats = related.rhythmBeats
      .slice(0, contour.length)
      .map((beat) => clamp(beat * random.between(1.08, 1.34), 0.75, 2.25));
    return {
      anchorDegree: wrap(related.anchorDegree + random.pick([2, 3, 4] as const), 7),
      contour,
      cursor: 0,
      cycle: 0,
      direction: random.next() < 0.16 ? -1 : 1,
      familiar: related.familiar,
      lastPlannedDegree: undefined,
      mutations: 0,
      remainingBeats: Math.round(random.between(0.75, 2.25) * 12) / 12,
      rhythmBeats,
      sequenceDegree: 0,
      sourceName: related.sourceName,
    };
  }

  const configuredMode = context.modeIndex === undefined
    ? null
    : MODES[context.modeIndex] ?? null;
  const mode = configuredMode
    ? (configuredMode.intervals[2] === 4 ? 'major' : 'minor')
    : (valence >= 0.48 ? 'major' : 'minor');
  // Familiar material is a structural prior, not a quotation engine. Most
  // motifs come from the corpus model; archetypes are rotated, transposed in
  // scale space and often inverted before they enter the live composition.
  // Recognisable public-domain DNA is an occasional easter egg rather than a
  // default stylistic crutch. Most seeds should establish NAGI's own identity.
  const useFamiliarTheme = random.next() < 0.08;
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
  const learnedRhythm = familiarTheme
    ? null
    : sampleClassicalRhythm(random, motifLength, mode, arousal);
  const meter = context.meterIndex === undefined
    ? null
    : METERS[context.meterIndex] ?? null;
  const learnedOnsets = learnedRhythm?.reduce<number[]>(
    (onsets, duration, index) => {
      if (index + 1 < motifLength) {
        onsets.push(
          (onsets.at(-1) ?? 0) +
            quantizeDuration(duration, meter?.subdivisionsPerBeat ?? 12),
        );
      }
      return onsets;
    },
    [0],
  );
  let contour = rotatedTheme
    ? rotatedTheme
        .slice(0, motifLength)
        .map((degree) => clamp(degree - themeOrigin, -5, 5))
    : sampleClassicalContour(
        random,
        motifLength,
        mode,
        meter
          ? {
              beatsPerBar: meter.beatsPerBar,
              metricStrengths: learnedOnsets?.map((beat) =>
                metricStrengthAt(meter, beat)
              ),
              onsetBeats: learnedOnsets,
            }
          : undefined,
      );
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
    : learnedRhythm!;
  return {
    anchorDegree: random.pick([0, 0, 2, 4, 5] as const),
    contour,
    cursor: 0,
    cycle: 0,
    direction: random.next() < 0.22 ? -1 : 1,
    familiar: Boolean(familiarTheme),
    lastPlannedDegree: undefined,
    mutations: 0,
    remainingBeats: 0,
    rhythmBeats: clonePattern(rhythm),
    sequenceDegree: 0,
    sourceName: familiarTheme
      ? `${familiarTheme.composer} · ${familiarTheme.name}`
      : 'OpenScore Lieder corpus',
  };
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
  options: MotifPhrasePlanningOptions = {},
) => {
  const meter = METERS[scene.meterIndex];
  const totalBeats = spanBars * meter.beatsPerBar;
  const maximumEvents = Math.max(
    1,
    Math.floor(options.maximumEvents ?? (role === 'lead' ? 16 : 9)),
  );
  let beat = Math.max(0, motif.remainingBeats);
  const events: MotifEvent[] = [];
  const previousPhraseDegree = motif.lastPlannedDegree;

  if (beat >= totalBeats) {
    motif.remainingBeats = beat - totalBeats;
    return events;
  }

  while (beat < totalBeats && events.length < maximumEvents) {
    const motifIndex = motif.cursor;
    const rawIoi = motif.rhythmBeats[motifIndex % motif.rhythmBeats.length];
    const ioi = quantizeDuration(rawIoi, meter.subdivisionsPerBeat);
    if (role === 'counter' && options.counterpointAgainst?.length) {
      const minimumSeparation = options.minimumOnsetSeparationBeats ??
        Math.max(0.3, 1 / meter.subdivisionsPerBeat);
      const responseStep = 1 / meter.subdivisionsPerBeat;
      const maximumAttempts = Math.ceil(totalBeats * meter.subdivisionsPerBeat) + 1;
      for (let attempts = 0; attempts < maximumAttempts; attempts += 1) {
        const collision = options.counterpointAgainst.find(
          (event) =>
            !event.cadential &&
            Math.abs(event.beat - beat) < minimumSeparation,
        );
        if (!collision) break;
        beat = quantizeDuration(
          Math.max(beat + responseStep, collision.beat + responseStep),
          meter.subdivisionsPerBeat,
        );
      }
      if (beat >= totalBeats) break;
    }
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
    const articulation = clamp(
      0.58 + scene.valence * 0.18 + (1 - scene.arousal) * 0.17 + random.between(-0.04, 0.04),
      0.5,
      0.94,
    );
    const contour = motif.contour[motifIndex % motif.contour.length];
    let motifDegree =
      motif.anchorDegree + motif.sequenceDegree + motif.direction * contour;
    let voiceRelation: MotifEvent['voiceRelation'] = 'independent';
    if (role === 'counter' && options.counterpointAgainst?.length) {
      const leadIndex = options.counterpointAgainst.findLastIndex(
        (event) => event.beat <= beat + 0.001,
      );
      const lead = options.counterpointAgainst[Math.max(0, leadIndex)];
      const earlierLead = options.counterpointAgainst[Math.max(0, leadIndex - 1)];
      const previousCounterDegree = events.at(-1)?.motifDegree ?? previousPhraseDegree;
      const leadMotion = lead && earlierLead
        ? Math.sign(lead.motifDegree - earlierLead.motifDegree)
        : 0;
      const counterMotion = previousCounterDegree === undefined
        ? 0
        : Math.sign(motifDegree - previousCounterDegree);
      if (previousCounterDegree !== undefined && leadMotion !== 0 && leadMotion === counterMotion) {
        motifDegree = previousCounterDegree -
          leadMotion * Math.max(1, Math.min(3, Math.abs(motifDegree - previousCounterDegree)));
        voiceRelation = 'contrary';
      } else if (leadMotion === 0 || counterMotion === 0) {
        voiceRelation = 'oblique';
      } else if (lead && beat > lead.beat + 0.001) {
        voiceRelation = 'response';
      }
    }
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
      motifDegree,
      motifIndex,
      voiceRelation,
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

  const phraseEndsInSpan = phraseBar + spanBars >= scene.phraseBars;
  const cadenceEvent = events.at(-1);
  if (
    cadenceEvent &&
    phraseEndsInSpan &&
    options.cadenceAtPhraseEnd !== false
  ) {
    const previousDegree = events.at(-2)?.motifDegree ?? previousPhraseDegree ??
      motif.anchorDegree;
    const mode = MODES[scene.modeIndex].intervals[2] === 4 ? 'major' : 'minor';
    cadenceEvent.motifDegree = previousDegree + sampleClassicalCadenceInterval(
      random,
      mode,
      previousDegree - motif.anchorDegree,
    );
    cadenceEvent.cadential = true;
    cadenceEvent.accent = Math.max(cadenceEvent.accent, role === 'lead' ? 0.86 : 0.76);
  }

  motif.lastPlannedDegree = events.at(-1)?.motifDegree ?? motif.lastPlannedDegree;
  motif.remainingBeats = Math.max(0, beat - totalBeats);
  return events;
};

export const createMotifPair = (
  random: SeededRandom,
  scene: HarmonicScene,
) => {
  const context = {
    meterIndex: scene.meterIndex,
    modeIndex: scene.modeIndex,
  };
  const lead = createMotif(
    random,
    scene.arousal,
    'lead',
    undefined,
    scene.valence,
    context,
  );
  const counter = createMotif(
    random,
    scene.arousal,
    'counter',
    lead,
    scene.valence,
    context,
  );
  return { counter, lead };
};

export const planMotifCounterpoint = (
  scene: HarmonicScene,
  spanBars: number,
  random: SeededRandom,
  leadMotif: MotifDNA,
  counterMotif: MotifDNA,
  phraseBar: number,
  includeCounter = true,
  ensureOpening = false,
): MotifCounterpointPlan => {
  const leadEvents = planMotifPhrase(
    scene,
    spanBars,
    random,
    'lead',
    leadMotif,
    phraseBar,
  );
  const meter = METERS[scene.meterIndex];
  const firstGridBeat = 1 / meter.subdivisionsPerBeat;
  if (
    ensureOpening &&
    (leadEvents.length === 0 ||
      !leadEvents.some((event) => event.beat <= firstGridBeat))
  ) {
    leadEvents.unshift({
      accent: 0.72,
      beat: firstGridBeat,
      cycle: leadMotif.cycle,
      durationBeats: 0.8,
      humanizeBeats: 0,
      metricStrength: metricStrengthAt(meter, firstGridBeat),
      motifDegree: leadMotif.anchorDegree,
      motifIndex: 0,
      voiceRelation: 'independent',
    });
  }
  const counterEvents = includeCounter
    ? planMotifPhrase(
        scene,
        spanBars,
        random,
        'counter',
        counterMotif,
        phraseBar,
        {
          counterpointAgainst: leadEvents,
          maximumEvents: Math.max(1, Math.floor(leadEvents.length * 0.48)),
        },
      )
    : [];
  return { counterEvents, leadEvents };
};

export const motifPitchClass = (scene: HarmonicScene, motifDegree: number) => {
  const mode = MODES[scene.modeIndex].intervals;
  const wrappedDegree = wrap(motifDegree, mode.length);
  return wrap(scene.tonic + mode[wrappedDegree], 12);
};
