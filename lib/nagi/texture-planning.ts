import {
  METERS,
  clamp,
  metricStrengthAt,
  type EmotionalFormStage,
  type HarmonicScene,
  type SeededRandom,
  type WeatherProfile,
} from './generative.ts';

export const TEXTURE_ROLES = [
  'lead',
  'counter',
  'harmony',
  'bass',
  'accompaniment',
] as const;

export type TextureRole = (typeof TEXTURE_ROLES)[number];

export type TextureState =
  | 'sparse'
  | 'duo'
  | 'chamber'
  | 'full'
  | 'release';

export type AccompanimentPatternId =
  | 'sustain'
  | 'pulse'
  | 'arpeggio'
  | 'syncopated'
  | 'sparse';

export type AccompanimentPatternEvent = {
  /** Offset from the start of the repeating pattern cycle. */
  beatOffset: number;
  durationBeats: number;
  accent: number;
  /** Relative chord-tone index; the renderer may wrap it to its voicing. */
  voicingOffset: number;
};

export type AccompanimentPattern = {
  continuity: 'new' | 'retained' | 'varied';
  cycleBars: number;
  events: readonly AccompanimentPatternEvent[];
  id: AccompanimentPatternId;
  meterId: string;
  variation: number;
};

export type ScheduledAccompanimentEvent = AccompanimentPatternEvent & {
  /** Offset from the beginning of the requested render span. */
  beatOffset: number;
};

export type TextureHarmonyEvent = {
  index: number;
  spanBars: number;
  startBar: number;
};

export type PhraseTextureSegment = {
  activeRoles: readonly TextureRole[];
  harmonyEventIndices: readonly number[];
  index: number;
  spanBars: number;
  spotlight: TextureRole;
  startBar: number;
  state: TextureState;
  /**
   * Simultaneous sustained chord voices: bass plus the upper harmony layer.
   * Lead, counterpoint, and individual accompaniment onsets are excluded.
   * Zero therefore means a genuinely unaccompanied melodic texture.
   */
  totalChordVoices: number;
};

export type PhraseTexturePlan = {
  accompanimentPattern: AccompanimentPattern;
  /** Counterpoint and accompaniment are phrase-level decisions, never chord flicker. */
  continuousRoles: readonly Extract<TextureRole, 'counter' | 'accompaniment'>[];
  minimumSegmentBars: number;
  phraseBars: number;
  segments: readonly PhraseTextureSegment[];
  stage: EmotionalFormStage['id'];
};

export type PhraseTexturePlanningOptions = {
  harmonyEvents?: readonly TextureHarmonyEvent[];
  minimumSegmentBars?: number;
  phraseBars?: number;
  previousAccompanimentPattern?: AccompanimentPattern | null;
  previousTexturePlan?: PhraseTexturePlan | null;
};

const STATE_ROLE_RANGE: Readonly<Record<TextureState, readonly [number, number]>> = {
  sparse: [1, 2],
  duo: [2, 2],
  chamber: [3, 4],
  full: [5, 5],
  release: [1, 3],
};

const STATE_CHORD_RANGE: Readonly<Record<TextureState, readonly [number, number]>> = {
  sparse: [0, 1],
  duo: [1, 2],
  chamber: [2, 4],
  full: [4, 5],
  release: [0, 2],
};

const bridgePhraseBoundary = (
  segments: readonly PhraseTextureSegment[],
  previous: PhraseTexturePlan | null | undefined,
  continuousRoles: PhraseTexturePlan['continuousRoles'],
  density: number,
  random: SeededRandom,
) => {
  const first = segments[0];
  const previousLast = previous?.segments.at(-1);
  if (!first || !previousLast) return [...segments];
  if (first.activeRoles.some((role) => previousLast.activeRoles.includes(role))) {
    return [...segments];
  }

  const bridgeRole = (['harmony', 'lead', 'bass', 'accompaniment', 'counter'] as const)
    .find((role) => previousLast.activeRoles.includes(role));
  if (!bridgeRole) return [...segments];

  const [, maximum] = STATE_ROLE_RANGE[first.state];
  const activeRoles = [...first.activeRoles];
  if (activeRoles.length >= maximum) {
    const removableIndex = activeRoles.findLastIndex((role) =>
      !continuousRoles.includes(
        role as Extract<TextureRole, 'counter' | 'accompaniment'>,
      )
    );
    activeRoles.splice(removableIndex >= 0 ? removableIndex : activeRoles.length - 1, 1);
  }
  activeRoles.push(bridgeRole);
  const connectedRoles = uniqueRoles(activeRoles);
  const connectedFirst: PhraseTextureSegment = {
    ...first,
    activeRoles: connectedRoles,
    spotlight: connectedRoles.includes(first.spotlight)
      ? first.spotlight
      : bridgeRole,
    totalChordVoices: chordVoiceTarget(
      first.state,
      connectedRoles,
      density,
      random,
    ),
  };
  return [connectedFirst, ...segments.slice(1)];
};

const STAGE_STATES: Readonly<
  Record<EmotionalFormStage['id'], readonly TextureState[]>
> = {
  statement: ['sparse', 'duo'],
  development: ['duo', 'chamber'],
  intensification: ['chamber', 'full'],
  release: ['release', 'sparse'],
  return: ['duo', 'chamber'],
};

const PATTERNS_BY_STAGE: Readonly<
  Record<EmotionalFormStage['id'], readonly AccompanimentPatternId[]>
> = {
  statement: ['sustain', 'sparse', 'arpeggio'],
  development: ['pulse', 'arpeggio', 'syncopated', 'sustain'],
  intensification: ['pulse', 'arpeggio', 'syncopated'],
  release: ['sustain', 'sparse'],
  return: ['sustain', 'arpeggio', 'sparse', 'pulse'],
};

const weightedPick = <T>(
  values: readonly T[],
  weights: readonly number[],
  random: SeededRandom,
) => {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return values[0];
  let cursor = random.next() * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= Math.max(0, weights[index] ?? 0);
    if (cursor <= 0) return values[index];
  }
  return values.at(-1)!;
};

const uniqueRoles = (roles: readonly TextureRole[]) =>
  TEXTURE_ROLES.filter((role) => roles.includes(role));

const segmentState = (
  stage: EmotionalFormStage['id'],
  segmentIndex: number,
  segmentCount: number,
) => {
  const states = STAGE_STATES[stage];
  if (segmentCount <= 1) {
    if (stage === 'intensification') return 'full';
    if (stage === 'return') return 'chamber';
    return states[0];
  }
  const progress = segmentIndex / Math.max(1, segmentCount - 1);
  return states[Math.min(states.length - 1, Math.round(progress * (states.length - 1)))];
};

const chooseContinuousRoles = (
  scene: HarmonicScene,
  profile: WeatherProfile,
  stage: EmotionalFormStage['id'],
  random: SeededRandom,
) => {
  const accompanimentChance = clamp(
    profile.flow * 0.32 +
      profile.density * 0.27 +
      scene.groove * 0.75 +
      (stage === 'intensification' ? 0.25 : 0) -
      (stage === 'release' ? 0.24 : 0),
    0.12,
    0.92,
  );
  const counterChance = clamp(
    profile.density * 0.24 +
      scene.motifRate * 0.42 +
      scene.arousal * 0.15 +
      (stage === 'development' ? 0.18 : 0) +
      (stage === 'intensification' ? 0.16 : 0) -
      (stage === 'statement' ? 0.32 : 0) -
      (stage === 'release' ? 0.4 : 0),
    0.04,
    0.82,
  );
  const accompaniment = random.next() < accompanimentChance;
  let counter = random.next() < counterChance;

  // Duo/sparse stages need a focal line. Avoid two supporting roles consuming
  // their entire role budget; the chosen support still lasts the whole phrase.
  if (
    counter &&
    accompaniment &&
    (
      stage === 'statement' ||
      stage === 'development' ||
      stage === 'release' ||
      stage === 'return'
    )
  ) {
    counter = stage === 'development' && random.next() < 0.52;
    if (counter) return ['counter'] as const;
  }

  const roles: Array<Extract<TextureRole, 'counter' | 'accompaniment'>> = [];
  if (counter) roles.push('counter');
  if (accompaniment) roles.push('accompaniment');
  return roles;
};

const rolesForState = (
  state: TextureState,
  continuousRoles: PhraseTexturePlan['continuousRoles'],
  density: number,
  random: SeededRandom,
) => {
  const [minimum, maximum] = STATE_ROLE_RANGE[state];
  const target = minimum === maximum
    ? minimum
    : minimum + Math.round(clamp(density) * (maximum - minimum));
  const roles: TextureRole[] = [...continuousRoles, 'lead'];
  const priorities: Readonly<Record<TextureState, readonly TextureRole[]>> = {
    sparse: ['lead', 'bass', 'harmony', 'accompaniment', 'counter'],
    duo: ['lead', 'bass', 'accompaniment', 'counter', 'harmony'],
    chamber: ['lead', 'bass', 'harmony', 'accompaniment', 'counter'],
    full: ['lead', 'counter', 'harmony', 'bass', 'accompaniment'],
    release: ['lead', 'harmony', 'bass', 'accompaniment', 'counter'],
  };
  const candidates = [...priorities[state]];

  // Occasionally let the bass or harmony carry a sparse/release passage, but
  // never allow the role set to become empty.
  if (
    continuousRoles.length === 0 &&
    (state === 'sparse' || state === 'release') &&
    random.next() < 0.16
  ) {
    const alternate = random.next() < 0.55 ? 'harmony' : 'bass';
    candidates.splice(candidates.indexOf(alternate), 1);
    candidates.unshift(alternate);
    roles.length = 0;
  }
  for (const role of candidates) {
    if (roles.length >= target) break;
    if (!roles.includes(role)) roles.push(role);
  }
  while (roles.length > maximum) {
    const removable = roles.findIndex((role) => role !== 'lead');
    roles.splice(removable >= 0 ? removable : roles.length - 1, 1);
  }
  return uniqueRoles(roles.length > 0 ? roles : ['lead']);
};

const chordVoiceTarget = (
  state: TextureState,
  activeRoles: readonly TextureRole[],
  density: number,
  random: SeededRandom,
) => {
  const hasBass = activeRoles.includes('bass');
  const hasHarmony = activeRoles.includes('harmony');
  if (!hasBass && !hasHarmony) return 0;
  if (!hasHarmony) return hasBass ? 1 : 0;
  const [minimum, maximum] = STATE_CHORD_RANGE[state];
  const lowerBound = Math.max(hasBass ? 2 : 1, minimum);
  const target = lowerBound + Math.round(
    clamp(density * 0.78 + random.next() * 0.22) * (maximum - lowerBound),
  );
  return Math.max(lowerBound, Math.min(maximum, target));
};

const spotlightForRoles = (
  state: TextureState,
  activeRoles: readonly TextureRole[],
  random: SeededRandom,
) => {
  const weights = activeRoles.map((role) => {
    if (role === 'lead') return state === 'release' ? 2.4 : 5;
    if (role === 'counter') return state === 'chamber' ? 2 : 0.9;
    if (role === 'harmony') return state === 'release' ? 2.2 : 0.75;
    if (role === 'bass') return state === 'sparse' ? 1.5 : 0.55;
    return state === 'duo' ? 1.2 : 0.65;
  });
  return weightedPick(activeRoles, weights, random);
};

const textureSpans = (
  phraseBars: number,
  minimumSegmentBars: number,
  harmonyEvents: readonly TextureHarmonyEvent[],
) => {
  const boundaries = new Set<number>([0, phraseBars]);
  if (harmonyEvents.length === 0 && phraseBars >= minimumSegmentBars * 2) {
    boundaries.add(phraseBars / 2);
  }
  for (const event of harmonyEvents) {
    const start = clamp(event.startBar, 0, phraseBars);
    const end = clamp(event.startBar + event.spanBars, 0, phraseBars);
    boundaries.add(start);
    boundaries.add(end);
  }
  const candidates = [...boundaries].sort((a, b) => a - b);
  const accepted = [0];
  for (const boundary of candidates.slice(1, -1)) {
    const previous = accepted.at(-1)!;
    const remaining = phraseBars - boundary;
    if (boundary - previous >= minimumSegmentBars && remaining >= minimumSegmentBars) {
      accepted.push(boundary);
    }
  }
  accepted.push(phraseBars);
  return accepted.slice(0, -1).map((startBar, index) => ({
    spanBars: accepted[index + 1] - startBar,
    startBar,
  }));
};

const patternWeight = (
  id: AccompanimentPatternId,
  scene: HarmonicScene,
  profile: WeatherProfile,
) => {
  if (id === 'sustain') return 0.9 + profile.space * 1.25 + (1 - scene.groove) * 0.5;
  if (id === 'pulse') return 0.55 + scene.arousal * 1.15 + scene.groove * 1.4;
  if (id === 'arpeggio') return 0.75 + profile.flow * 1.2 + profile.sparkle * 0.55;
  if (id === 'syncopated') return 0.34 + scene.groove * 1.8 + scene.arousal * 0.55;
  return 0.72 + profile.space * 1.25 + (1 - profile.density) * 0.8;
};

const quantizedPatternEvents = (
  id: AccompanimentPatternId,
  scene: HarmonicScene,
  variation: number,
  random: SeededRandom,
) => {
  const meter = METERS[scene.meterIndex] ?? METERS[0];
  const subdivisions = meter.subdivisionsPerBeat;
  const cycleBars = id === 'arpeggio' || id === 'syncopated' ? 2 : 1;
  const stepsPerBar = meter.beatsPerBar * subdivisions;
  const totalSteps = stepsPerBar * cycleBars;
  const rows: Array<{ durationSteps: number; step: number; voicingOffset: number }> = [];
  const add = (step: number, durationSteps: number, voicingOffset: number) => {
    rows.push({
      durationSteps: Math.max(1, Math.round(durationSteps)),
      step: Math.max(0, Math.min(totalSteps - 1, Math.round(step))),
      voicingOffset,
    });
  };

  for (let bar = 0; bar < cycleBars; bar += 1) {
    const barStep = bar * stepsPerBar;
    if (id === 'sustain') {
      add(barStep, stepsPerBar, bar + variation);
      continue;
    }
    if (id === 'pulse') {
      for (let beat = 0; beat < meter.beatsPerBar; beat += 1) {
        add(barStep + beat * subdivisions, subdivisions, beat + variation);
      }
      continue;
    }
    if (id === 'arpeggio') {
      const stepSize = meter.id === 'compound'
        ? 1
        : meter.id === 'five'
          ? subdivisions
          : Math.max(1, subdivisions / 2);
      for (let step = 0; step < stepsPerBar; step += stepSize) {
        const order = Math.round(step / stepSize) + bar + variation;
        add(barStep + step, stepSize, order % 4);
      }
      continue;
    }
    if (id === 'syncopated') {
      const offbeat = meter.id === 'compound'
        ? subdivisions - 1
        : Math.max(1, Math.round(subdivisions / 2));
      for (let beat = 0; beat < meter.beatsPerBar; beat += 1) {
        if ((beat + bar + variation) % 4 === 3 && random.next() < 0.45) continue;
        add(
          barStep + beat * subdivisions + offbeat,
          Math.max(1, subdivisions - offbeat + Math.floor(subdivisions / 2)),
          beat + bar + variation,
        );
      }
      continue;
    }

    add(barStep, subdivisions, variation + bar);
    const secondaryBeat = meter.accents
      .map((accent, beat) => ({ accent, beat }))
      .slice(1)
      .sort((a, b) => b.accent - a.accent)[0]?.beat;
    if (secondaryBeat !== undefined && (bar + variation) % 2 === 0) {
      add(barStep + secondaryBeat * subdivisions, subdivisions, variation + bar + 2);
    }
  }

  return {
    cycleBars,
    events: rows
      .sort((a, b) => a.step - b.step)
      .map(({ durationSteps, step, voicingOffset }) => ({
        accent: clamp(metricStrengthAt(meter, step / subdivisions) * 0.76 + 0.2),
        beatOffset: step / subdivisions,
        durationBeats: durationSteps / subdivisions,
        voicingOffset: ((voicingOffset % 5) + 5) % 5,
      })),
  };
};

export const planAccompanimentPattern = (
  scene: HarmonicScene,
  profile: WeatherProfile,
  stage: EmotionalFormStage['id'],
  random: SeededRandom,
  previous: AccompanimentPattern | null = null,
): AccompanimentPattern => {
  const meter = METERS[scene.meterIndex] ?? METERS[0];
  const allowed = PATTERNS_BY_STAGE[stage];
  const compatiblePrevious = previous?.meterId === meter.id && allowed.includes(previous.id)
    ? previous
    : null;
  const continuityRoll = random.next();
  if (compatiblePrevious && continuityRoll < 0.52) {
    return {
      ...compatiblePrevious,
      continuity: 'retained',
      events: compatiblePrevious.events.map((event) => ({ ...event })),
    };
  }

  const varied = compatiblePrevious && continuityRoll < 0.8;
  const id = varied
    ? compatiblePrevious.id
    : weightedPick(
        allowed,
        allowed.map((candidate) => patternWeight(candidate, scene, profile)),
        random,
      );
  const variation = varied ? compatiblePrevious.variation + 1 : 0;
  const generated = quantizedPatternEvents(id, scene, variation, random);
  return {
    continuity: varied ? 'varied' : 'new',
    cycleBars: generated.cycleBars,
    events: generated.events,
    id,
    meterId: meter.id,
    variation,
  };
};

export const planPhraseTexture = (
  scene: HarmonicScene,
  profile: WeatherProfile,
  stage: EmotionalFormStage,
  random: SeededRandom,
  options: PhraseTexturePlanningOptions = {},
): PhraseTexturePlan => {
  const phraseBars = Math.max(1, options.phraseBars ?? scene.phraseBars);
  const minimumSegmentBars = clamp(
    options.minimumSegmentBars ?? phraseBars / 2,
    Math.min(1, phraseBars),
    phraseBars,
  );
  const harmonyEvents = options.harmonyEvents ?? [];
  const spans = textureSpans(phraseBars, minimumSegmentBars, harmonyEvents);
  const continuousRoles = chooseContinuousRoles(scene, profile, stage.id, random);
  const density = clamp(
    profile.density * 0.48 + scene.arousal * 0.28 + scene.tension * 0.14 +
      (stage.id === 'intensification' ? 0.18 : 0) -
      (stage.id === 'release' ? 0.2 : 0),
  );
  const generatedSegments = spans.map((span, index): PhraseTextureSegment => {
    const state = segmentState(stage.id, index, spans.length);
    const activeRoles = rolesForState(state, continuousRoles, density, random);
    const endBar = span.startBar + span.spanBars;
    return {
      activeRoles,
      harmonyEventIndices: harmonyEvents
        .filter((event) => (
          event.startBar < endBar && event.startBar + event.spanBars > span.startBar
        ))
        .map((event) => event.index),
      index,
      spanBars: span.spanBars,
      spotlight: spotlightForRoles(state, activeRoles, random),
      startBar: span.startBar,
      state,
      totalChordVoices: chordVoiceTarget(state, activeRoles, density, random),
    };
  });
  const segments = bridgePhraseBoundary(
    generatedSegments,
    options.previousTexturePlan,
    continuousRoles,
    density,
    random,
  );

  return {
    accompanimentPattern: planAccompanimentPattern(
      scene,
      profile,
      stage.id,
      random,
      options.previousAccompanimentPattern,
    ),
    continuousRoles,
    minimumSegmentBars,
    phraseBars,
    segments,
    stage: stage.id,
  };
};

export const textureSegmentAtBar = (
  plan: PhraseTexturePlan,
  phraseBar: number,
) => {
  const bar = clamp(phraseBar, 0, Math.max(0, plan.phraseBars - Number.EPSILON));
  return plan.segments.find(
    (segment) => bar >= segment.startBar && bar < segment.startBar + segment.spanBars,
  ) ?? plan.segments.at(-1);
};

export const textureSegmentForHarmonyEvent = (
  plan: PhraseTexturePlan,
  harmonyEventIndex: number,
) => plan.segments.find((segment) => (
  segment.harmonyEventIndices.includes(harmonyEventIndex)
));

export const textureSegmentsForRole = (
  plan: PhraseTexturePlan,
  role: TextureRole,
) => plan.segments.filter((segment) => segment.activeRoles.includes(role));

export const isTextureRoleActive = (
  plan: PhraseTexturePlan,
  role: TextureRole,
  phraseBar: number,
) => textureSegmentAtBar(plan, phraseBar)?.activeRoles.includes(role) ?? false;

export const accompanimentEventsForSpan = (
  pattern: AccompanimentPattern,
  meterIndex: number,
  startBar: number,
  spanBars: number,
): readonly ScheduledAccompanimentEvent[] => {
  const meter = METERS[meterIndex] ?? METERS[0];
  if (meter.id !== pattern.meterId || spanBars <= 0) return [];
  const cycleBeats = pattern.cycleBars * meter.beatsPerBar;
  const startBeat = startBar * meter.beatsPerBar;
  const endBeat = startBeat + spanBars * meter.beatsPerBar;
  const firstCycle = Math.floor(startBeat / cycleBeats) - 1;
  const lastCycle = Math.ceil(endBeat / cycleBeats);
  const events: ScheduledAccompanimentEvent[] = [];
  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    const cycleStart = cycle * cycleBeats;
    for (const event of pattern.events) {
      const absoluteBeat = cycleStart + event.beatOffset;
      if (absoluteBeat < startBeat || absoluteBeat >= endBeat) continue;
      events.push({
        ...event,
        beatOffset: absoluteBeat - startBeat,
      });
    }
  }
  return events.sort((a, b) => a.beatOffset - b.beatOffset);
};
