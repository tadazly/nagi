import {
  METERS,
  MODES,
  SeededRandom,
  chordPitchClasses,
  clamp,
  metricStrengthAt,
  type BassLinePlan,
  type HarmonicScene,
  type MeterDefinition,
  type PhraseHarmonicPlan,
} from './generative.ts';
import {
  motifPitchClass,
  planMotifPhrase,
  type MotifCounterpointPlan,
  type MotifDNA,
  type MotifEvent,
} from './composition.ts';
import {
  classicalInitialIntervalSurprisal,
  classicalIntervalTransitionSurprisal,
} from './classical-prior.ts';

export type PhraseFormRole = 'A' | 'A-prime' | 'B' | 'A-double-prime';

export type PhraseMelodicRole =
  | 'pickup'
  | 'statement'
  | 'continuation'
  | 'climax'
  | 'cadence'
  | 'echo';

export type MelodicHarmonicIntent =
  | 'structural'
  | 'passing'
  | 'neighbor'
  | 'suspension'
  | 'appoggiatura';

export type PhraseMelodyEvent = MotifEvent & {
  accentedDissonanceAllowed: boolean;
  harmonicIntent: MelodicHarmonicIntent;
  mustResolveNext: boolean;
  phraseBeat: number;
  phrasePosition: number;
  phraseRole: PhraseMelodicRole;
  /** MIDI selected by the whole-phrase look-ahead decoder. */
  plannedMidi?: number;
  resolutionDirection: -1 | 0 | 1;
  resolutionMaximumStep: number;
  retainPreviousPitch: boolean;
  targetMidi: number;
};

export type PhraseRegisterArc = {
  arrivalMidi: number;
  climaxBeat: number;
  climaxMidi: number;
  counterHighMidi: number;
  counterLowMidi: number;
  leadHighMidi: number;
  leadLowMidi: number;
  startMidi: number;
};

export type PhraseCadencePlan = {
  approachBeat: number;
  approachDegree: number;
  arrivalBeat: number;
  arrivalDegree: number;
};

export type PhraseClimaxPlan = {
  beat: number;
  eventIndex: number;
  motifDegree: number;
  targetMidi: number;
};

export type PhraseCounterWindow = {
  enabled: boolean;
  entryBeat: number;
  exitBeat: number;
};

export type PhraseVariationPlan = {
  source: 'fresh' | 'opening' | 'previous';
  techniques: readonly (
    | 'rhythmic-displacement'
    | 'sequence'
    | 'contour-preservation'
    | 'middle-recomposition'
    | 'cadential-recomposition'
  )[];
};

export type PhraseMelodicPlan = {
  beatsPerBar: number;
  cadence: PhraseCadencePlan;
  climax: PhraseClimaxPlan;
  counterEvents: readonly PhraseMelodyEvent[];
  counterWindow: PhraseCounterWindow;
  formRole: PhraseFormRole;
  leadEvents: readonly PhraseMelodyEvent[];
  phraseBars: number;
  realization: PhraseMelodyRealizationDiagnostics;
  registerArc: PhraseRegisterArc;
  totalBeats: number;
  variation: PhraseVariationPlan;
};

export type PhraseMusicalQuality = {
  climaxProminence: number;
  corpusSurprisal: number;
  leapRecoveryRate: number;
  maximumRepeatedNotes: number;
  melodicRange: number;
  motifPitchClassRate: number;
  score: number;
  strongBeatChordToneRate: number;
};

export type PhraseMelodyRealizationDiagnostics = {
  beamWidth: number;
  candidatePathsEvaluated: number;
  counterCost: number;
  leadCost: number;
  quality: PhraseMusicalQuality;
};

export type PhraseMelodyOptions = {
  bassLinePlan?: BassLinePlan;
  beamWidth?: number;
  cadenceAtPhraseEnd?: boolean;
  counterEnabled?: boolean;
  counterEntryBar?: number;
  counterExitBar?: number;
  counterHighMidi?: number;
  counterLowMidi?: number;
  formRole?: PhraseFormRole;
  harmonyPlan?: PhraseHarmonicPlan;
  leadHighMidi?: number;
  leadLowMidi?: number;
  maximumCounterEvents?: number;
  maximumLeadEvents?: number;
  openingReference?: PhraseMelodicPlan;
  previousLeadMidi?: number;
  previousCounterMidi?: number;
  previousPhrase?: PhraseMelodicPlan;
};

export type PhraseMelodicSlice = MotifCounterpointPlan & {
  counterEvents: PhraseMelodyEvent[];
  endBar: number;
  leadEvents: PhraseMelodyEvent[];
  startBar: number;
};

export type RealizedPhraseMelodyEvent = PhraseMelodyEvent & {
  midi: number;
};

export type CounterpointCorrectionReason =
  | 'voice-crossing'
  | 'accented-vertical-dissonance'
  | 'parallel-perfect-interval';

export type CounterpointCorrection = {
  beat: number;
  correctedMidi: number;
  eventIndex: number;
  originalMidi: number;
  reason: CounterpointCorrectionReason;
};

export type PhraseCounterpointReconciliation = {
  corrections: readonly CounterpointCorrection[];
  counterEvents: readonly RealizedPhraseMelodyEvent[];
  leadEvents: readonly RealizedPhraseMelodyEvent[];
  terminalPair: CounterpointPairState | null;
};

export type CounterpointPairState = {
  counterMidi: number;
  interval: number;
  leadMidi: number;
};

export type PhraseCounterpointReconciliationOptions = {
  allowedPitchClasses?: readonly number[];
  avoidParallelPerfectIntervals?: boolean;
  counterHighMidi?: number;
  counterLowMidi?: number;
  minimumVoiceGapSemitones?: number;
  previousPair?: CounterpointPairState | null;
};

const wrap = (value: number, length: number) =>
  ((value % length) + length) % length;

const quantizeBeat = (beat: number, subdivisionsPerBeat: number) =>
  Math.round(beat * subdivisionsPerBeat) / subdivisionsPerBeat;

const closestDegreeClass = (degree: number, degreeClass: number) => {
  const normalizedClass = wrap(degreeClass, 7);
  const lower = Math.floor((degree - normalizedClass) / 7) * 7 + normalizedClass;
  const upper = lower + 7;
  return Math.abs(degree - lower) <= Math.abs(upper - degree) ? lower : upper;
};

const eventEnd = (event: Pick<MotifEvent, 'beat' | 'durationBeats'>) =>
  event.beat + event.durationBeats;

const overlapsAt = (
  event: Pick<MotifEvent, 'beat' | 'durationBeats'>,
  beat: number,
) => event.beat <= beat + 0.001 && eventEnd(event) > beat + 0.001;

const closestEventIndex = (
  events: readonly Pick<MotifEvent, 'beat'>[],
  targetBeat: number,
) => {
  let bestIndex = 0;
  let bestDistance = Infinity;
  events.forEach((event, index) => {
    const distance = Math.abs(event.beat - targetBeat);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
};

const interpolateArc = (
  position: number,
  climaxPosition: number,
  start: number,
  climax: number,
  arrival: number,
) => position <= climaxPosition
  ? start + (climax - start) * (position / Math.max(0.001, climaxPosition))
  : climax + (arrival - climax) * (
      (position - climaxPosition) / Math.max(0.001, 1 - climaxPosition)
    );

const variationReference = (
  formRole: PhraseFormRole,
  options: PhraseMelodyOptions,
) => {
  if (formRole === 'A-prime') {
    return options.openingReference ?? options.previousPhrase ?? null;
  }
  if (formRole === 'A-double-prime') {
    return options.openingReference ?? options.previousPhrase ?? null;
  }
  return null;
};

const variationSource = (
  reference: PhraseMelodicPlan | null,
  options: PhraseMelodyOptions,
): PhraseVariationPlan['source'] => {
  if (!reference) return 'fresh';
  if (reference === options.openingReference) return 'opening';
  return 'previous';
};

const transformReferenceLead = (
  generated: readonly MotifEvent[],
  reference: PhraseMelodicPlan,
  formRole: PhraseFormRole,
  totalBeats: number,
  meter: MeterDefinition,
  random: SeededRandom,
) => {
  if (reference.leadEvents.length < 2) {
    return generated.map((event) => ({ ...event }));
  }
  const middleStart = Math.floor(reference.leadEvents.length * 0.36);
  const middleEnd = Math.ceil(reference.leadEvents.length * 0.7);
  const displacementStart = formRole === 'A-double-prime'
    ? Math.max(1, middleStart)
    : 1;
  const displacementEnd = formRole === 'A-double-prime'
    ? Math.max(displacementStart + 1, middleEnd)
    : Math.max(2, reference.leadEvents.length - 1);
  const displacedIndex = displacementStart + Math.floor(
    random.next() * Math.max(1, displacementEnd - displacementStart),
  );
  const sequence = formRole === 'A-double-prime'
    ? 0
    : random.pick([-1, 0, 0, 1] as const);
  const cadenceStart = Math.max(0, reference.leadEvents.length - 2);
  const transformed = reference.leadEvents.map((source, index): MotifEvent => {
    const normalizedBeat = source.phraseBeat / Math.max(0.001, reference.totalBeats);
    const generatedIndex = closestEventIndex(
      generated,
      normalizedBeat * totalBeats,
    );
    const fallback = generated[generatedIndex] ?? source;
    const isMiddle = index >= middleStart && index < middleEnd;
    const recomposeMiddle = formRole === 'A-prime'
      ? isMiddle && index % 2 === 1
      : formRole === 'A-double-prime' && isMiddle && index === displacedIndex;
    const restoreOpening = formRole === 'A-double-prime' && !isMiddle;
    let motifDegree = source.motifDegree + sequence;
    if (recomposeMiddle || (!restoreOpening && index === displacedIndex)) {
      motifDegree = fallback.motifDegree;
    }
    const displacement = index === displacedIndex
      ? random.pick([-1, 1] as const) / meter.subdivisionsPerBeat
      : 0;
    const beat = quantizeBeat(
      clamp(
        normalizedBeat * totalBeats + displacement,
        0,
        totalBeats - 1 / meter.subdivisionsPerBeat,
      ),
      meter.subdivisionsPerBeat,
    );
    if (index === displacedIndex && formRole !== 'A-double-prime') {
      motifDegree += random.pick([-1, 1] as const);
    }
    return {
      accent: source.accent,
      beat,
      cadential: index >= cadenceStart ? source.cadential : undefined,
      cycle: fallback.cycle,
      durationBeats: clamp(
        source.durationBeats * totalBeats / Math.max(0.001, reference.totalBeats),
        0.35,
        Math.max(0.35, totalBeats - beat),
      ),
      humanizeBeats: fallback.humanizeBeats,
      metricStrength: metricStrengthAt(
        meter,
        beat,
      ),
      motifDegree,
      motifIndex: source.motifIndex,
      voiceRelation: source.voiceRelation,
    };
  });
  return transformed
    .sort((left, right) => left.beat - right.beat)
    .filter((event, index, events) =>
      index === 0 || event.beat > events[index - 1].beat + 0.001
    );
};

const cadenceScaleDegrees = (
  events: readonly MotifEvent[],
  harmonyPlan?: PhraseHarmonicPlan,
) => {
  const referenceDegree = events.at(-1)?.motifDegree ?? 0;
  const arrivalClass = harmonyPlan?.cadence.arrivalDegree ?? 0;
  const arrivalDegree = closestDegreeClass(referenceDegree, arrivalClass);
  const approachOffset = harmonyPlan?.cadence.type === 'authentic'
    ? harmonyPlan.cadence.usesLeadingTone ? -1 : 1
    : harmonyPlan?.cadence.type === 'half' ||
        harmonyPlan?.cadence.type === 'deceptive'
      ? -1
      : 1;
  return {
    approachDegree: closestDegreeClass(arrivalDegree, arrivalClass + approachOffset),
    arrivalDegree,
  };
};

const forceTerminalCadence = (
  events: readonly MotifEvent[],
  meter: MeterDefinition,
  totalBeats: number,
  harmonyPlan?: PhraseHarmonicPlan,
) => {
  if (events.length === 0) return [];
  const lastBarStart = Math.max(0, totalBeats - meter.beatsPerBar);
  const finalGridStep = 1 / meter.subdivisionsPerBeat;
  const arrivalOffset = meter.beatsPerBar <= 2
    ? 1
    : Math.max(1, Math.floor(meter.beatsPerBar / 2));
  const approachBeat = quantizeBeat(lastBarStart, meter.subdivisionsPerBeat);
  const arrivalBeat = quantizeBeat(
    Math.min(totalBeats - finalGridStep, lastBarStart + arrivalOffset),
    meter.subdivisionsPerBeat,
  );
  const prefix = events
    .filter((event) => event.beat < approachBeat - 0.001)
    .map((event) => ({ ...event, cadential: false }));
  const template = prefix.at(-1) ?? events[0];
  const { approachDegree, arrivalDegree } = cadenceScaleDegrees(events, harmonyPlan);
  const approach: MotifEvent = {
    ...template,
    accent: Math.max(0.82, metricStrengthAt(meter, approachBeat)),
    beat: approachBeat,
    cadential: true,
    durationBeats: Math.max(0.35, (arrivalBeat - approachBeat) * 0.78),
    humanizeBeats: 0,
    metricStrength: metricStrengthAt(meter, approachBeat),
    motifDegree: approachDegree,
  };
  const arrival: MotifEvent = {
    ...template,
    accent: Math.max(0.9, metricStrengthAt(meter, arrivalBeat)),
    beat: arrivalBeat,
    cadential: true,
    durationBeats: Math.max(0.35, totalBeats - arrivalBeat),
    humanizeBeats: 0,
    metricStrength: metricStrengthAt(meter, arrivalBeat),
    motifDegree: arrivalDegree,
    motifIndex: template.motifIndex + 1,
  };
  return [...prefix, approach, arrival];
};

const describeLeadEvent = (
  event: MotifEvent,
  index: number,
  events: readonly MotifEvent[],
  climaxIndex: number,
  cadenceStartIndex: number,
): Pick<
  PhraseMelodyEvent,
  | 'accentedDissonanceAllowed'
  | 'harmonicIntent'
  | 'mustResolveNext'
  | 'phraseRole'
> => {
  if (index >= cadenceStartIndex) {
    return {
      accentedDissonanceAllowed: index === cadenceStartIndex && event.metricStrength > 0.62,
      harmonicIntent: index === cadenceStartIndex ? 'suspension' : 'structural',
      mustResolveNext: index === cadenceStartIndex,
      phraseRole: 'cadence',
    };
  }
  if (index === climaxIndex) {
    return {
      accentedDissonanceAllowed: true,
      harmonicIntent: 'appoggiatura',
      mustResolveNext: true,
      phraseRole: 'climax',
    };
  }
  if (index === 0 && event.beat > 0 && event.metricStrength < 0.55) {
    return {
      accentedDissonanceAllowed: false,
      harmonicIntent: 'neighbor',
      mustResolveNext: false,
      phraseRole: 'pickup',
    };
  }
  if (index < Math.max(2, Math.floor(events.length * 0.28))) {
    return {
      accentedDissonanceAllowed: false,
      harmonicIntent: event.metricStrength > 0.68 ? 'structural' : 'neighbor',
      mustResolveNext: false,
      phraseRole: 'statement',
    };
  }
  return {
    accentedDissonanceAllowed: false,
    harmonicIntent: event.metricStrength > 0.72 ? 'structural' : 'passing',
    mustResolveNext: false,
    phraseRole: 'continuation',
  };
};

const decorateLead = (
  events: readonly MotifEvent[],
  registerArc: PhraseRegisterArc,
  totalBeats: number,
): PhraseMelodyEvent[] => {
  if (events.length === 0) return [];
  const climaxIndex = Math.min(
    closestEventIndex(events, registerArc.climaxBeat),
    Math.max(0, events.length - 3),
  );
  const cadenceStartIndex = Math.max(climaxIndex + 1, events.length - 2);

  return events.map((event, index) => {
    const phrasePosition = clamp(event.beat / Math.max(0.001, totalBeats), 0, 1);
    const baseDescription = describeLeadEvent(
      event,
      index,
      events,
      climaxIndex,
      cadenceStartIndex,
    );
    const previousDegree = events[index - 1]?.motifDegree;
    const nextDegree = events[index + 1]?.motifDegree;
    const harmonicIntent = baseDescription.harmonicIntent === 'suspension' &&
        previousDegree !== event.motifDegree
      ? 'appoggiatura'
      : baseDescription.harmonicIntent;
    const resolutionDirection = baseDescription.mustResolveNext && nextDegree !== undefined
      ? Math.sign(nextDegree - event.motifDegree) as -1 | 0 | 1
      : 0;
    const targetMidi = interpolateArc(
      phrasePosition,
      registerArc.climaxBeat / totalBeats,
      registerArc.startMidi,
      registerArc.climaxMidi,
      registerArc.arrivalMidi,
    );
    return {
      ...event,
      ...baseDescription,
      accent: index === climaxIndex
        ? Math.max(0.9, event.accent)
        : index === events.length - 1
          ? Math.max(0.86, event.accent)
          : event.accent,
      cadential: index >= cadenceStartIndex,
      harmonicIntent,
      phraseBeat: event.beat,
      phrasePosition,
      resolutionDirection,
      resolutionMaximumStep: baseDescription.mustResolveNext ? 2 : 0,
      retainPreviousPitch: harmonicIntent === 'suspension',
      targetMidi: index === climaxIndex
        ? registerArc.climaxMidi
        : index === events.length - 1
          ? registerArc.arrivalMidi
          : clamp(targetMidi, registerArc.leadLowMidi, registerArc.leadHighMidi),
    };
  });
};

const decorateCounter = (
  events: readonly MotifEvent[],
  registerArc: PhraseRegisterArc,
  totalBeats: number,
): PhraseMelodyEvent[] => events.map((event, index) => {
  const phrasePosition = clamp(event.beat / Math.max(0.001, totalBeats), 0, 1);
  const cadential = index === events.length - 1 && phrasePosition > 0.78;
  const target = interpolateArc(
    phrasePosition,
    registerArc.climaxBeat / totalBeats,
    registerArc.startMidi - 8,
    registerArc.climaxMidi - 10,
    registerArc.arrivalMidi - 7,
  );
  return {
    ...event,
    accentedDissonanceAllowed: false,
    cadential,
    harmonicIntent: cadential || event.metricStrength > 0.72
      ? 'structural'
      : 'passing',
    mustResolveNext: false,
    phraseBeat: event.beat,
    phrasePosition,
    phraseRole: cadential ? 'cadence' : 'echo',
    resolutionDirection: 0,
    resolutionMaximumStep: 0,
    retainPreviousPitch: false,
    targetMidi: clamp(
      target,
      registerArc.counterLowMidi,
      registerArc.counterHighMidi,
    ),
  };
});

const planRegisterArc = (
  scene: HarmonicScene,
  totalBeats: number,
  random: SeededRandom,
  options: PhraseMelodyOptions,
): PhraseRegisterArc => {
  const leadLowMidi = Math.round(options.leadLowMidi ?? 60);
  const leadHighMidi = Math.max(leadLowMidi + 7, Math.round(options.leadHighMidi ?? 84));
  const counterLowMidi = Math.round(options.counterLowMidi ?? 50);
  const counterHighMidi = Math.max(
    counterLowMidi + 5,
    Math.min(leadHighMidi - 4, Math.round(options.counterHighMidi ?? 74)),
  );
  const startMidi = clamp(
    Math.round(options.previousLeadMidi ?? random.between(66, 72)),
    leadLowMidi + 2,
    leadHighMidi - 5,
  );
  const climaxPosition = clamp(
    0.58 + scene.tension * 0.12 + random.between(-0.035, 0.035),
    0.54,
    0.77,
  );
  const climaxMidi = clamp(
    Math.round(startMidi + 5 + scene.arousal * 4 + scene.tension * 2),
    startMidi + 4,
    leadHighMidi,
  );
  const arrivalMidi = clamp(
    Math.round(startMidi + random.pick([-2, 0, 0, 2] as const)),
    leadLowMidi + 1,
    Math.min(leadHighMidi - 4, climaxMidi - 3),
  );
  return {
    arrivalMidi,
    climaxBeat: quantizeBeat(climaxPosition * totalBeats, 12),
    climaxMidi,
    counterHighMidi,
    counterLowMidi,
    leadHighMidi,
    leadLowMidi,
    startMidi,
  };
};

type UnrealizedPhrasePlan = Omit<PhraseMelodicPlan, 'realization'>;

type MelodicBeamState = {
  cost: number;
  diatonicIntervals: number[];
  pitches: number[];
  repeatedNotes: number;
};

type MelodicDecodeResult = {
  candidatePathsEvaluated: number;
  cost: number;
  events: RealizedPhraseMelodyEvent[];
};

const midiPitchClass = (midi: number) => wrap(midi, 12);

const modeClassForScene = (scene: HarmonicScene): 'major' | 'minor' =>
  MODES[scene.modeIndex].intervals[2] === 4 ? 'major' : 'minor';

const absoluteModalDegree = (scene: HarmonicScene, midi: number) => {
  const mode = MODES[scene.modeIndex].intervals;
  const pitchClassInMode = wrap(midi - scene.tonic, 12);
  const degree = mode.indexOf(pitchClassInMode);
  if (degree < 0) return Math.round((midi - scene.tonic) * 7 / 12);
  const octave = Math.round((midi - scene.tonic - mode[degree]) / 12);
  return octave * mode.length + degree;
};

const diatonicInterval = (
  scene: HarmonicScene,
  fromMidi: number,
  toMidi: number,
) => absoluteModalDegree(scene, toMidi) - absoluteModalDegree(scene, fromMidi);

const harmonyAtPhraseBeat = (
  harmony: PhraseHarmonicPlan | undefined,
  phraseBeat: number,
  beatsPerBar: number,
) => harmony?.events.find((event) => {
  const beat = event.startBar * beatsPerBar;
  return phraseBeat >= beat - 0.001 &&
    phraseBeat < beat + event.spanBars * beatsPerBar - 0.001;
}) ?? harmony?.events.at(-1);

const bassAtPhraseBeat = (
  bass: BassLinePlan | undefined,
  phraseBeat: number,
  beatsPerBar: number,
) => bass?.events.find((event) => {
  const beat = event.startBar * beatsPerBar;
  return phraseBeat >= beat - 0.001 &&
    phraseBeat < beat + event.spanBars * beatsPerBar - 0.001;
}) ?? bass?.events.at(-1);

const scaleClassDistance = (
  scene: HarmonicScene,
  fromPitchClass: number,
  toPitchClass: number,
) => {
  const mode = MODES[scene.modeIndex].intervals;
  const from = mode.indexOf(wrap(fromPitchClass - scene.tonic, 12));
  const to = mode.indexOf(wrap(toPitchClass - scene.tonic, 12));
  if (from < 0 || to < 0) return 3;
  const distance = Math.abs(from - to);
  return Math.min(distance, mode.length - distance);
};

const candidateMidisForEvent = (
  scene: HarmonicScene,
  event: PhraseMelodyEvent,
  previousMidi: number,
  lowMidi: number,
  highMidi: number,
) => {
  if (
    event.retainPreviousPitch &&
    previousMidi >= lowMidi &&
    previousMidi <= highMidi
  ) return [previousMidi];

  const mode = MODES[scene.modeIndex].intervals;
  const targetPitchClass = motifPitchClass(scene, event.motifDegree);
  const modal = Array.from(
    { length: Math.max(0, highMidi - lowMidi + 1) },
    (_, index) => lowMidi + index,
  ).filter((midi) => mode.includes(wrap(midi - scene.tonic, 12)));
  const exact = modal.filter((midi) => midiPitchClass(midi) === targetPitchClass);
  const structural = event.metricStrength >= 0.68 ||
    event.phraseRole === 'statement' ||
    event.phraseRole === 'climax' ||
    event.phraseRole === 'cadence';
  if (structural || event.motifIndex === 0) return exact.length > 0 ? exact : modal;
  const neighbors = modal.filter((midi) =>
    scaleClassDistance(scene, midiPitchClass(midi), targetPitchClass) <= 1
  );
  return neighbors.length > 0 ? neighbors : exact.length > 0 ? exact : modal;
};

const leadAtBeat = (
  leadEvents: readonly RealizedPhraseMelodyEvent[],
  beat: number,
) => leadEvents.findLast((event) =>
  event.beat <= beat + 0.001 && eventEnd(event) > beat + 0.001
  ) ?? leadEvents.findLast((event) => event.beat <= beat + 0.001) ?? leadEvents[0];

const stableCounterInterval = (interval: number) =>
  [0, 3, 4, 5, 7, 8, 9].includes(wrap(interval, 12));

const perfectCounterInterval = (interval: number) =>
  [0, 7].includes(wrap(interval, 12));

const pathGlobalCost = (
  events: readonly PhraseMelodyEvent[],
  pitches: readonly number[],
  role: 'lead' | 'counter',
) => {
  if (pitches.length === 0) return 0;
  let cost = 0;
  const range = Math.max(...pitches) - Math.min(...pitches);
  if (role === 'lead') {
    if (range < 5) cost += (5 - range) * 1.6;
    if (range > 16) cost += (range - 16) * 1.1;
    const climaxIndex = events.findIndex((event) => event.phraseRole === 'climax');
    if (climaxIndex >= 0) {
      const otherMaximum = Math.max(
        ...pitches.filter((_, index) => index !== climaxIndex),
        -Infinity,
      );
      const prominence = pitches[climaxIndex] - otherMaximum;
      if (prominence < 1) cost += (1 - prominence) * 5.5;
    }
  } else {
    if (range < 3) cost += (3 - range) * 0.8;
    if (range > 14) cost += (range - 14) * 0.9;
  }
  let oneDirectionRun = 0;
  let previousDirection = 0;
  for (let index = 1; index < pitches.length; index += 1) {
    const interval = pitches[index] - pitches[index - 1];
    const direction = Math.sign(interval);
    oneDirectionRun = direction !== 0 && direction === previousDirection
      ? oneDirectionRun + 1
      : direction === 0 ? 0 : 1;
    if (oneDirectionRun > 4) cost += (oneDirectionRun - 4) * 0.72;
    if (Math.abs(interval) >= 5 && index + 1 < pitches.length) {
      const recovery = pitches[index + 1] - pitches[index];
      const recovered = recovery !== 0 &&
        Math.sign(recovery) === -Math.sign(interval) &&
        Math.abs(recovery) <= 2;
      if (!recovered) cost += 12;
    }
    previousDirection = direction;
  }
  return cost;
};

const decodeMelodicVoice = (
  scene: HarmonicScene,
  events: readonly PhraseMelodyEvent[],
  plan: UnrealizedPhrasePlan,
  random: SeededRandom,
  options: PhraseMelodyOptions,
  role: 'lead' | 'counter',
  leadEvents: readonly RealizedPhraseMelodyEvent[] = [],
): MelodicDecodeResult => {
  if (events.length === 0) {
    return { candidatePathsEvaluated: 0, cost: 0, events: [] };
  }
  const beamWidth = Math.round(clamp(options.beamWidth ?? 16, 8, 32));
  const lowMidi = role === 'lead'
    ? plan.registerArc.leadLowMidi
    : plan.registerArc.counterLowMidi;
  const highMidi = role === 'lead'
    ? plan.registerArc.leadHighMidi
    : plan.registerArc.counterHighMidi;
  const initialMidi = role === 'lead'
    ? options.previousLeadMidi ?? plan.registerArc.startMidi
    : options.previousCounterMidi ?? Math.min(plan.registerArc.startMidi - 8, highMidi);
  const modeClass = modeClassForScene(scene);
  const modalRegister = Array.from(
    { length: Math.max(0, highMidi - lowMidi + 1) },
    (_, index) => lowMidi + index,
  ).filter((midi) =>
    MODES[scene.modeIndex].intervals.includes(wrap(midi - scene.tonic, 12))
  );
  const climaxEvent = role === 'lead'
    ? events.find((event) => event.phraseRole === 'climax')
    : undefined;
  const climaxAnchorMidi = climaxEvent
    ? candidateMidisForEvent(
        scene,
        climaxEvent,
        initialMidi,
        lowMidi,
        highMidi,
      ).sort((left, right) =>
        Math.abs(left - plan.registerArc.climaxMidi) -
          Math.abs(right - plan.registerArc.climaxMidi) || right - left
      )[0]
    : undefined;
  let candidatePathsEvaluated = 0;
  let beam: MelodicBeamState[] = [{
    cost: 0,
    diatonicIntervals: [],
    pitches: [],
    repeatedNotes: 0,
  }];

  events.forEach((event, eventIndex) => {
    const harmonyEvent = harmonyAtPhraseBeat(
      options.harmonyPlan,
      event.phraseBeat,
      plan.beatsPerBar,
    );
    const chordDegree = harmonyEvent?.degree ?? 0;
    const chordClasses = new Set(chordPitchClasses(scene, chordDegree));
    const bassMidi = bassAtPhraseBeat(
      options.bassLinePlan,
      event.phraseBeat,
      plan.beatsPerBar,
    )?.bassMidi;
    const targetPitchClass = motifPitchClass(scene, event.motifDegree);
    const leadReference = role === 'counter'
      ? leadAtBeat(leadEvents, event.phraseBeat)
      : undefined;
    const previousLeadReference = role === 'counter' && eventIndex > 0
      ? leadAtBeat(leadEvents, events[eventIndex - 1].phraseBeat)
      : undefined;
    const expanded: MelodicBeamState[] = [];

    for (const state of beam) {
      const previousMidi = state.pitches.at(-1) ?? initialMidi;
      const previousInterval = state.pitches.length >= 2
        ? state.pitches.at(-1)! - state.pitches.at(-2)!
        : 0;
      let candidates = candidateMidisForEvent(
        scene,
        event,
        previousMidi,
        lowMidi,
        highMidi,
      );
      if (
        event.metricStrength >= 0.66 &&
        event.phraseRole !== 'cadence' &&
        event.phraseRole !== 'climax'
      ) {
        candidates = [...new Set([
          ...candidates,
          ...modalRegister.filter((midi) => chordClasses.has(midiPitchClass(midi))),
        ])];
      }
      if (Math.abs(previousInterval) >= 5) {
        candidates = [...new Set([
          ...candidates,
          ...modalRegister.filter((midi) => {
            const recovery = midi - previousMidi;
            return recovery !== 0 &&
              Math.sign(recovery) === -Math.sign(previousInterval) &&
              Math.abs(recovery) <= 2;
          }),
        ])];
      }
      if (role === 'lead' && climaxAnchorMidi !== undefined) {
        candidates = event.phraseRole === 'climax'
          ? [climaxAnchorMidi]
          : candidates.filter((midi) => midi < climaxAnchorMidi);
        if (candidates.length === 0) {
          candidates = modalRegister.filter((midi) => midi < climaxAnchorMidi);
        }
      }
      for (const midi of candidates) {
        candidatePathsEvaluated += 1;
        const interval = midi - previousMidi;
        const distance = Math.abs(interval);
        const diatonic = diatonicInterval(scene, previousMidi, midi);
        const previousEvent = events[eventIndex - 1];
        const chordTone = chordClasses.has(midiPitchClass(midi));
        const pitchClassMatch = midiPitchClass(midi) === targetPitchClass;
        const tension = harmonyEvent?.tensionTarget ?? scene.tension;
        let cost = state.cost + Math.abs(midi - event.targetMidi) * 0.09;

        cost += pitchClassMatch
          ? -1.35
          : 1.2 + scaleClassDistance(scene, midiPitchClass(midi), targetPitchClass) * 0.82;
        if (event.metricStrength >= 0.68 || event.phraseRole === 'cadence') {
          cost += chordTone ? -1.45 : event.accentedDissonanceAllowed ? 0.65 : 7.5;
        } else if (event.harmonicIntent === 'passing' || event.harmonicIntent === 'neighbor') {
          cost += chordTone ? -0.2 : -0.48;
        }
        if (event.phraseRole === 'cadence' && eventIndex === events.length - 1) {
          cost += chordTone && pitchClassMatch ? -3.4 : 14;
        }
        if (event.phraseRole === 'climax') {
          cost += Math.abs(midi - plan.registerArc.climaxMidi) * 0.58;
        } else if (role === 'lead' && midi >= plan.registerArc.climaxMidi) {
          cost += 2.6 + (midi - plan.registerArc.climaxMidi) * 0.8;
        }

        cost += distance * 0.12;
        if (distance > (eventIndex === 0 && role === 'lead' ? 5 : 7)) {
          cost += (distance - (eventIndex === 0 && role === 'lead' ? 5 : 7)) * 8.5;
        }
        const repeatedNotes = distance === 0 ? state.repeatedNotes + 1 : 0;
        if (!event.retainPreviousPitch && repeatedNotes > 0) {
          cost += repeatedNotes * 1.8;
        }
        if (Math.abs(previousInterval) >= 5) {
          const recovers = interval !== 0 &&
            Math.sign(interval) === -Math.sign(previousInterval) &&
            distance <= 2;
          cost += recovers ? -3.2 : 6.8 + Math.max(0, distance - 2) * 1.1;
        }
        if (previousEvent?.mustResolveNext) {
          const directionMatches = previousEvent.resolutionDirection === 0 ||
            Math.sign(interval) === previousEvent.resolutionDirection;
          const maximumStep = previousEvent.resolutionMaximumStep || 2;
          cost += directionMatches && distance > 0 && distance <= maximumStep
            ? -4.5
            : 18;
        }
        if (previousEvent) {
          const intendedDirection = Math.sign(event.motifDegree - previousEvent.motifDegree) ||
            Math.sign(event.targetMidi - previousEvent.targetMidi);
          if (intendedDirection !== 0 && interval !== 0 && Math.sign(interval) !== intendedDirection) {
            cost += 1.5;
          }
        }
        const intervalHistory = state.diatonicIntervals;
        if (intervalHistory.length === 0) {
          cost += classicalInitialIntervalSurprisal(diatonic, modeClass) * 0.32;
        } else if (intervalHistory.length >= 2) {
          cost += classicalIntervalTransitionSurprisal(
            intervalHistory.at(-2)!,
            intervalHistory.at(-1)!,
            diatonic,
            modeClass,
            event.metricStrength,
          ) * 0.42;
        }
        // When harmony already carries surprise, the melody spends less of the
        // same perceptual budget on leaps and accented non-chord tones.
        if (tension > 0.62) {
          cost += Math.max(0, distance - 3) * 0.7 + (!chordTone ? 1.1 : 0);
        }
        if (bassMidi !== undefined) {
          const vertical = wrap(midi - bassMidi, 12);
          if ([1, 2, 10, 11].includes(vertical)) cost += 1.4;
        }

        if (role === 'counter' && leadReference) {
          const vertical = wrap(leadReference.midi - midi, 12);
          if (midi > leadReference.midi - 3) cost += 24;
          if (event.metricStrength >= 0.66 && !stableCounterInterval(vertical)) cost += 5.8;
          if (previousLeadReference && state.pitches.length > 0) {
            const previousCounter = state.pitches.at(-1)!;
            const previousVertical = wrap(previousLeadReference.midi - previousCounter, 12);
            const leadMotion = Math.sign(leadReference.midi - previousLeadReference.midi);
            const counterMotion = Math.sign(midi - previousCounter);
            if (
              perfectCounterInterval(previousVertical) &&
              perfectCounterInterval(vertical) &&
              leadMotion !== 0 && leadMotion === counterMotion
            ) cost += 11;
            if (leadMotion === 0 || counterMotion === 0 || leadMotion === -counterMotion) {
              cost -= 0.72;
            }
          }
        }
        cost += random.next() * 0.045;
        expanded.push({
          cost,
          diatonicIntervals: [...state.diatonicIntervals, diatonic].slice(-3),
          pitches: [...state.pitches, midi],
          repeatedNotes,
        });
      }
    }
    const unique = new Map<string, MelodicBeamState>();
    expanded
      .sort((left, right) => left.cost - right.cost)
      .forEach((state) => {
        const key = state.pitches.slice(-3).join(',');
        if (!unique.has(key)) unique.set(key, state);
      });
    beam = [...unique.values()].slice(0, beamWidth);
  });

  const selected = beam
    .map((state) => ({
      ...state,
      cost: state.cost + pathGlobalCost(events, state.pitches, role),
    }))
    .sort((left, right) => left.cost - right.cost)[0];
  const pitches = selected?.pitches ?? events.map((event) => Math.round(event.targetMidi));
  return {
    candidatePathsEvaluated,
    cost: selected?.cost ?? 0,
    events: events.map((event, index) => ({
      ...event,
      midi: pitches[index] ?? Math.round(event.targetMidi),
    })),
  };
};

export const evaluatePhraseRealization = (
  scene: HarmonicScene,
  plan: Pick<
    PhraseMelodicPlan,
    'beatsPerBar' | 'climax' | 'leadEvents' | 'registerArc'
  >,
  harmonyPlan?: PhraseHarmonicPlan,
): PhraseMusicalQuality => {
  const events = plan.leadEvents.filter((event) => event.plannedMidi !== undefined);
  const pitches = events.map((event) => event.plannedMidi!);
  if (pitches.length === 0) {
    return {
      climaxProminence: 0,
      corpusSurprisal: 7,
      leapRecoveryRate: 1,
      maximumRepeatedNotes: 0,
      melodicRange: 0,
      motifPitchClassRate: 0,
      score: 0,
      strongBeatChordToneRate: 0,
    };
  }
  const intervals = pitches.slice(1).map((pitch, index) => pitch - pitches[index]);
  const diatonicIntervals = pitches.slice(1).map((pitch, index) =>
    diatonicInterval(scene, pitches[index], pitch)
  );
  const modeClass = modeClassForScene(scene);
  const surprisals = diatonicIntervals.map((interval, index) => index < 2
    ? classicalInitialIntervalSurprisal(interval, modeClass)
    : classicalIntervalTransitionSurprisal(
        diatonicIntervals[index - 2],
        diatonicIntervals[index - 1],
        interval,
        modeClass,
        events[index + 1]?.metricStrength ?? 0.5,
      )
  );
  let leapAttempts = 0;
  let leapRecoveries = 0;
  intervals.slice(0, -1).forEach((interval, index) => {
    if (Math.abs(interval) < 5) return;
    leapAttempts += 1;
    const following = intervals[index + 1];
    if (
      following !== 0 &&
      Math.sign(following) === -Math.sign(interval) &&
      Math.abs(following) <= 2
    ) leapRecoveries += 1;
  });
  let repeated = 0;
  let maximumRepeatedNotes = 0;
  intervals.forEach((interval) => {
    repeated = interval === 0 ? repeated + 1 : 0;
    maximumRepeatedNotes = Math.max(maximumRepeatedNotes, repeated);
  });
  const strongBeatEvents = events.filter((event) => event.metricStrength >= 0.66);
  const strongBeatChordTones = strongBeatEvents.filter((event) => {
    const harmony = harmonyAtPhraseBeat(
      harmonyPlan,
      event.phraseBeat,
      plan.beatsPerBar,
    );
    return chordPitchClasses(scene, harmony?.degree ?? 0)
      .includes(midiPitchClass(event.plannedMidi!));
  }).length;
  const climaxIndex = Math.max(0, Math.min(plan.climax.eventIndex, pitches.length - 1));
  const otherMaximum = Math.max(
    ...pitches.filter((_, index) => index !== climaxIndex),
    -Infinity,
  );
  const climaxProminence = pitches[climaxIndex] - otherMaximum;
  const corpusSurprisal = surprisals.reduce((sum, value) => sum + value, 0) /
    Math.max(1, surprisals.length);
  const leapRecoveryRate = leapRecoveries / Math.max(1, leapAttempts);
  const melodicRange = Math.max(...pitches) - Math.min(...pitches);
  const motifPitchClassRate = events.filter((event) =>
    midiPitchClass(event.plannedMidi!) === motifPitchClass(scene, event.motifDegree)
  ).length / events.length;
  const strongBeatChordToneRate = strongBeatChordTones /
    Math.max(1, strongBeatEvents.length);
  const rangeScore = clamp(1 - Math.abs(melodicRange - 10) / 10);
  const corpusScore = clamp(1 - Math.max(0, corpusSurprisal - 1.8) / 4.2);
  const score = clamp(
    motifPitchClassRate * 0.24 +
      strongBeatChordToneRate * 0.22 +
      leapRecoveryRate * 0.17 +
      clamp((climaxProminence + 1) / 4) * 0.13 +
      rangeScore * 0.1 +
      clamp(1 - maximumRepeatedNotes / 3) * 0.06 +
      corpusScore * 0.08,
  );
  return {
    climaxProminence,
    corpusSurprisal,
    leapRecoveryRate,
    maximumRepeatedNotes,
    melodicRange,
    motifPitchClassRate,
    score,
    strongBeatChordToneRate,
  };
};

export const realizePhraseMelodyPlan = (
  scene: HarmonicScene,
  plan: UnrealizedPhrasePlan,
  random: SeededRandom,
  options: PhraseMelodyOptions,
): PhraseMelodicPlan => {
  const beamWidth = Math.round(clamp(options.beamWidth ?? 16, 8, 32));
  const realizationRandom = random.fork(
    `phrase-realization:${plan.formRole}:${plan.totalBeats}:` +
      `${plan.leadEvents[0]?.cycle ?? 0}:${plan.leadEvents.length}`,
  );
  const lead = decodeMelodicVoice(
    scene,
    plan.leadEvents,
    plan,
    realizationRandom,
    options,
    'lead',
  );
  const counter = decodeMelodicVoice(
    scene,
    plan.counterEvents,
    plan,
    realizationRandom,
    options,
    'counter',
    lead.events,
  );
  const reconciled = reconcilePhraseCounterpoint(lead.events, counter.events, {
    allowedPitchClasses: MODES[scene.modeIndex].intervals.map((interval) =>
      wrap(scene.tonic + interval, 12)
    ),
    counterHighMidi: plan.registerArc.counterHighMidi,
    counterLowMidi: plan.registerArc.counterLowMidi,
    minimumVoiceGapSemitones: 3,
  });
  const realizedPlan: UnrealizedPhrasePlan = {
    ...plan,
    counterEvents: plan.counterEvents.map((event, index) => ({
      ...event,
      plannedMidi: reconciled.counterEvents[index]?.midi ?? counter.events[index]?.midi,
    })),
    leadEvents: plan.leadEvents.map((event, index) => ({
      ...event,
      plannedMidi: reconciled.leadEvents[index]?.midi ?? lead.events[index]?.midi,
    })),
  };
  return {
    ...realizedPlan,
    realization: {
      beamWidth,
      candidatePathsEvaluated:
        lead.candidatePathsEvaluated + counter.candidatePathsEvaluated,
      counterCost: counter.cost,
      leadCost: lead.cost,
      quality: evaluatePhraseRealization(scene, realizedPlan, options.harmonyPlan),
    },
  };
};

export const planPhraseMelody = (
  scene: HarmonicScene,
  random: SeededRandom,
  leadMotif: MotifDNA,
  counterMotif: MotifDNA,
  options: PhraseMelodyOptions = {},
): PhraseMelodicPlan => {
  const meter = METERS[scene.meterIndex];
  const phraseBars = Math.max(
    1,
    Math.floor(options.harmonyPlan?.phraseBars ?? scene.phraseBars),
  );
  const totalBeats = phraseBars * meter.beatsPerBar;
  const formRole = options.formRole ?? 'A';
  const plannedLead = planMotifPhrase(
    scene,
    phraseBars,
    random,
    'lead',
    leadMotif,
    0,
    {
      cadenceAtPhraseEnd: options.cadenceAtPhraseEnd,
      maximumEvents: options.maximumLeadEvents ?? Math.max(12, phraseBars * 5),
    },
  );
  const generatedLead: MotifEvent[] = plannedLead.length > 0
    ? plannedLead
    : [{
        accent: 0.72,
        beat: 1 / meter.subdivisionsPerBeat,
        cycle: leadMotif.cycle,
        durationBeats: 0.8,
        humanizeBeats: 0,
        metricStrength: metricStrengthAt(meter, 1 / meter.subdivisionsPerBeat),
        motifDegree: leadMotif.anchorDegree,
        motifIndex: 0,
        voiceRelation: 'independent',
      }];
  const reference = variationReference(formRole, options);
  const transformedLead = reference
    ? transformReferenceLead(
        generatedLead,
        reference,
        formRole,
        totalBeats,
        meter,
        random,
      )
    : generatedLead;
  const leadSkeleton = options.cadenceAtPhraseEnd === false
    ? transformedLead
    : forceTerminalCadence(
        transformedLead,
        meter,
        totalBeats,
        options.harmonyPlan,
      );
  const registerArc = planRegisterArc(scene, totalBeats, random, options);
  const leadEvents = decorateLead(leadSkeleton, registerArc, totalBeats);
  const counterEnabled = options.counterEnabled ?? (
    formRole !== 'A' || scene.arousal + scene.tension > 0.72
  );
  const defaultEntryBar = formRole === 'A'
    ? Math.max(1, Math.floor(phraseBars * 0.5))
    : Math.max(0, Math.floor(phraseBars * 0.25));
  const entryBeat = clamp(
    (options.counterEntryBar ?? defaultEntryBar) * meter.beatsPerBar,
    0,
    totalBeats,
  );
  const exitBeat = clamp(
    (options.counterExitBar ?? Math.max(defaultEntryBar + 1, phraseBars - 0.5)) *
      meter.beatsPerBar,
    entryBeat,
    totalBeats,
  );
  const counterSpanBeats = Math.max(0, exitBeat - entryBeat);
  const counterSpanBars = counterSpanBeats / meter.beatsPerBar;
  const relativeLeadEvents = leadEvents
    .filter((event) =>
      event.beat < exitBeat - 0.001 && eventEnd(event) > entryBeat + 0.001
    )
    .map((event) => ({ ...event, beat: event.beat - entryBeat }));
  const rawCounter = counterEnabled
    ? planMotifPhrase(
        scene,
        counterSpanBars,
        random,
        'counter',
        counterMotif,
        entryBeat / meter.beatsPerBar,
        {
          cadenceAtPhraseEnd:
            options.cadenceAtPhraseEnd !== false && exitBeat >= totalBeats - 0.001,
          counterpointAgainst: relativeLeadEvents,
          maximumEvents: options.maximumCounterEvents ?? Math.max(5, Math.floor(leadEvents.length * 0.58)),
        },
      )
        .map((event) => ({
          ...event,
          beat: event.beat + entryBeat,
          durationBeats: Math.min(
            event.durationBeats,
            exitBeat - (event.beat + entryBeat),
          ),
        }))
    : [];
  const counterEvents = decorateCounter(rawCounter, registerArc, totalBeats);
  const climaxIndex = leadEvents.findIndex((event) => event.phraseRole === 'climax');
  const resolvedClimaxIndex = Math.max(0, climaxIndex);
  const climaxEvent = leadEvents[resolvedClimaxIndex];
  const cadenceEvents = leadEvents.filter((event) => event.phraseRole === 'cadence');
  const cadenceApproach = cadenceEvents.at(-2) ?? cadenceEvents[0] ?? climaxEvent;
  const cadenceArrival = cadenceEvents.at(-1) ?? climaxEvent;
  const techniques: PhraseVariationPlan['techniques'] = reference
    ? formRole === 'A-double-prime'
      ? ['contour-preservation', 'middle-recomposition', 'cadential-recomposition']
      : ['contour-preservation', 'rhythmic-displacement', 'sequence']
    : [];

  const plan: UnrealizedPhrasePlan = {
    beatsPerBar: meter.beatsPerBar,
    cadence: {
      approachBeat: cadenceApproach?.phraseBeat ?? totalBeats,
      approachDegree: cadenceApproach?.motifDegree ?? 0,
      arrivalBeat: cadenceArrival?.phraseBeat ?? totalBeats,
      arrivalDegree: cadenceArrival?.motifDegree ?? 0,
    },
    climax: {
      beat: climaxEvent?.phraseBeat ?? registerArc.climaxBeat,
      eventIndex: resolvedClimaxIndex,
      motifDegree: climaxEvent?.motifDegree ?? leadMotif.anchorDegree,
      targetMidi: climaxEvent?.targetMidi ?? registerArc.climaxMidi,
    },
    counterEvents,
    counterWindow: {
      enabled: counterEnabled,
      entryBeat,
      exitBeat,
    },
    formRole,
    leadEvents,
    phraseBars,
    registerArc,
    totalBeats,
    variation: {
      source: variationSource(reference, options),
      techniques,
    },
  };
  return realizePhraseMelodyPlan(scene, plan, random, options);
};

const sliceEvents = (
  events: readonly PhraseMelodyEvent[],
  startBeat: number,
  endBeat: number,
) => events
  .filter((event) => event.phraseBeat >= startBeat && event.phraseBeat < endBeat)
  .map((event) => ({
    ...event,
    beat: event.phraseBeat - startBeat,
  }));

export const slicePhraseMelody = (
  plan: PhraseMelodicPlan,
  startBar: number,
  spanBars: number,
  beatsPerBar = plan.beatsPerBar,
): PhraseMelodicSlice => {
  const safeStartBar = clamp(startBar, 0, plan.phraseBars);
  const endBar = clamp(safeStartBar + Math.max(0, spanBars), safeStartBar, plan.phraseBars);
  const startBeat = safeStartBar * beatsPerBar;
  const endBeat = endBar * beatsPerBar;
  return {
    counterEvents: sliceEvents(plan.counterEvents, startBeat, endBeat),
    endBar,
    leadEvents: sliceEvents(plan.leadEvents, startBeat, endBeat),
    startBar: safeStartBar,
  };
};

const intervalClass = (upperMidi: number, lowerMidi: number) =>
  wrap(Math.abs(upperMidi - lowerMidi), 12);

const isPerfectInterval = (interval: number) =>
  interval === 0 || interval === 7;

const isStableVerticalInterval = (interval: number) =>
  interval === 0 || interval === 3 || interval === 4 || interval === 5 ||
  interval === 7 || interval === 8 || interval === 9;

const overlappingLeads = (
  leadEvents: readonly RealizedPhraseMelodyEvent[],
  counterEvent: RealizedPhraseMelodyEvent,
) => leadEvents.filter((event) => (
  event.beat < eventEnd(counterEvent) - 0.001 &&
  counterEvent.beat < eventEnd(event) - 0.001
));

const candidateCounterMidis = (
  originalMidi: number,
  lowMidi: number,
  highMidi: number,
) => {
  const safeLow = Math.ceil(lowMidi);
  const safeHigh = Math.floor(highMidi);
  return Array.from(
    { length: Math.max(0, safeHigh - safeLow + 1) },
    (_, index) => safeLow + index,
  ).sort((left, right) =>
    Math.abs(left - originalMidi) - Math.abs(right - originalMidi) || left - right
  );
};

export const reconcilePhraseCounterpoint = (
  leadEvents: readonly RealizedPhraseMelodyEvent[],
  counterEvents: readonly RealizedPhraseMelodyEvent[],
  options: PhraseCounterpointReconciliationOptions = {},
): PhraseCounterpointReconciliation => {
  const minimumVoiceGapSemitones = Math.max(
    1,
    Math.floor(options.minimumVoiceGapSemitones ?? 3),
  );
  const counterLowMidi = Math.floor(options.counterLowMidi ?? 48);
  const counterHighMidi = Math.max(
    counterLowMidi,
    Math.floor(options.counterHighMidi ?? 76),
  );
  const avoidParallelPerfectIntervals = options.avoidParallelPerfectIntervals ?? true;
  const allowedPitchClasses = options.allowedPitchClasses
    ? new Set(options.allowedPitchClasses.map((value) => wrap(value, 12)))
    : null;
  const corrections: CounterpointCorrection[] = [];
  let previousPair: CounterpointPairState | null = options.previousPair
    ? { ...options.previousPair }
    : null;

  const correctedCounter = counterEvents.map((event, eventIndex) => {
    const leads = overlappingLeads(leadEvents, event);
    if (leads.length === 0) return { ...event };
    const lead = [...leads].sort((left, right) => {
      const leftAtCounterOnset = overlapsAt(left, event.beat) ? 0 : 1;
      const rightAtCounterOnset = overlapsAt(right, event.beat) ? 0 : 1;
      return leftAtCounterOnset - rightAtCounterOnset || left.beat - right.beat;
    })[0];
    const originalMidi = event.midi;
    const originalInterval = intervalClass(lead.midi, originalMidi);
    const crossing = leads.some(
      (overlappingLead) =>
        originalMidi > overlappingLead.midi - minimumVoiceGapSemitones,
    );
    const accentedDissonance = leads.some((overlappingLead) => {
      const accented = event.metricStrength >= 0.66 || overlappingLead.metricStrength >= 0.66;
      const allowed = event.accentedDissonanceAllowed ||
        overlappingLead.accentedDissonanceAllowed;
      return accented &&
        !allowed &&
        !isStableVerticalInterval(intervalClass(overlappingLead.midi, originalMidi));
    });
    const parallelPerfect = Boolean(
      avoidParallelPerfectIntervals &&
      previousPair &&
      isPerfectInterval(previousPair.interval) &&
      isPerfectInterval(originalInterval) &&
      Math.sign(lead.midi - previousPair.leadMidi) !== 0 &&
      Math.sign(lead.midi - previousPair.leadMidi) ===
        Math.sign(originalMidi - previousPair.counterMidi),
    );
    const reason: CounterpointCorrectionReason | null = crossing
      ? 'voice-crossing'
      : accentedDissonance
        ? 'accented-vertical-dissonance'
        : parallelPerfect
          ? 'parallel-perfect-interval'
          : null;
    if (!reason) {
      previousPair = {
        counterMidi: originalMidi,
        interval: originalInterval,
        leadMidi: lead.midi,
      };
      return { ...event };
    }

    const previousCounterMidi = previousPair?.counterMidi ?? originalMidi;
    const candidates = candidateCounterMidis(
      originalMidi,
      counterLowMidi,
      Math.min(
        counterHighMidi,
        ...leads.map((overlappingLead) =>
          overlappingLead.midi - minimumVoiceGapSemitones),
      ),
    );
    const correctedMidi = candidates
      .filter((candidate) => {
        if (allowedPitchClasses && !allowedPitchClasses.has(wrap(candidate, 12))) return false;
        if (leads.some((overlappingLead) =>
          candidate > overlappingLead.midi - minimumVoiceGapSemitones)) return false;
        const interval = intervalClass(lead.midi, candidate);
        if (
          accentedDissonance &&
          leads.some((overlappingLead) => {
            const accented = event.metricStrength >= 0.66 ||
              overlappingLead.metricStrength >= 0.66;
            return accented &&
              !isStableVerticalInterval(intervalClass(overlappingLead.midi, candidate));
          })
        ) return false;
        if (!parallelPerfect || !previousPair) return true;
        return !isPerfectInterval(interval) || interval !== previousPair.interval;
      })
      .sort((left, right) => {
        const leftCost = Math.abs(left - originalMidi) + Math.abs(left - previousCounterMidi) * 0.2;
        const rightCost = Math.abs(right - originalMidi) + Math.abs(right - previousCounterMidi) * 0.2;
        return leftCost - rightCost;
      })[0] ?? originalMidi;
    corrections.push({
      beat: event.beat,
      correctedMidi,
      eventIndex,
      originalMidi,
      reason,
    });
    previousPair = {
      counterMidi: correctedMidi,
      interval: intervalClass(lead.midi, correctedMidi),
      leadMidi: lead.midi,
    };
    return { ...event, midi: correctedMidi };
  });

  return {
    corrections,
    counterEvents: correctedCounter,
    leadEvents: leadEvents.map((event) => ({ ...event })),
    terminalPair: previousPair ? { ...previousPair } : null,
  };
};
