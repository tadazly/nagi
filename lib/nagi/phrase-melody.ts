import {
  METERS,
  SeededRandom,
  clamp,
  metricStrengthAt,
  type HarmonicScene,
  type MeterDefinition,
  type PhraseHarmonicPlan,
} from './generative.ts';
import {
  planMotifPhrase,
  type MotifCounterpointPlan,
  type MotifDNA,
  type MotifEvent,
} from './composition.ts';

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
  registerArc: PhraseRegisterArc;
  totalBeats: number;
  variation: PhraseVariationPlan;
};

export type PhraseMelodyOptions = {
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
  const rawCounter = counterEnabled
    ? planMotifPhrase(
        scene,
        phraseBars,
        random,
        'counter',
        counterMotif,
        0,
        {
          cadenceAtPhraseEnd: options.cadenceAtPhraseEnd,
          counterpointAgainst: leadEvents,
          maximumEvents: options.maximumCounterEvents ?? Math.max(5, Math.floor(leadEvents.length * 0.58)),
        },
      )
        .filter((event) => event.beat >= entryBeat && event.beat < exitBeat)
        .map((event) => ({
          ...event,
          durationBeats: Math.min(event.durationBeats, exitBeat - event.beat),
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

  return {
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
  const candidates = new Set<number>();
  for (let octave = -3; octave <= 3; octave += 1) {
    for (const adjustment of [0, -1, 1, -2, 2]) {
      const midi = originalMidi + octave * 12 + adjustment;
      if (midi >= lowMidi && midi <= highMidi) candidates.add(midi);
    }
  }
  return [...candidates];
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
