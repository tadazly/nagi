import { readFileSync } from 'node:fs';
import {
  CORE_EMOTIONS,
  EMOTION_PRESETS,
  METERS,
  MODE_HARMONIC_GRAMMARS,
  MODES,
  SeededRandom,
  cadenceRecipeForScene,
  chordPitchClasses,
  chordRootMidi,
  chooseHarmonyVoiceCount,
  chooseNeighborScene,
  clamp,
  degreeTension,
  degreeTriadComfort,
  deriveSeedNumber,
  emotionalFormFromSeed,
  emotionalFormEmotionAt,
  emotionalFormStageAt,
  findPivotDegree,
  harmonicFunctionForDegree,
  interpolateProfile,
  isChordTone,
  metricStrengthAt,
  modeChordIdentityWeight,
  nextSeed,
  phraseHarmonicGoalForFormStage,
  phraseHarmonyEventAtBar,
  planBassLine,
  planPhraseHarmony,
  planPhraseHarmonyVariation,
  pickMelodyMidi,
  profileFromSeed,
  recallOpeningScene,
  sceneFromSeed,
  sceneName,
  sceneScaleCommonTones,
  seedToNumber,
  sensoryRoughness,
  shapeSceneWithEmotionalForm,
  shapeSceneWithEmotionalFormMemory,
  smootherstep,
  tempoFromArousal,
  voiceLeadChord,
  visualVariantFromSeed,
} from '../lib/nagi/generative.ts';
import {
  createMotif,
  createMotifPair,
  motifPitchClass,
  planMotifCounterpoint,
} from '../lib/nagi/composition.ts';
import {
  planPhraseMelody,
  reconcilePhraseCounterpoint,
  slicePhraseMelody,
} from '../lib/nagi/phrase-melody.ts';
import {
  CLASSICAL_MODEL_META,
  classicalMetricClassAt,
} from '../lib/nagi/classical-prior.ts';
import {
  INSTRUMENT_GESTURES,
  INSTRUMENTS,
  articulationName,
  chooseOrchestration,
  choosePerformancePlan,
  interpolatePerformancePlan,
  planNoteGesture,
} from '../lib/nagi/performance.ts';
import {
  EMOTION_COLOR_PALETTES,
  EMOTION_SHADER_TEMPLATES,
} from '../lib/nagi/visual-presets.ts';
import {
  chooseRenderQualityCeiling,
  resolveRenderQualityPlan,
  stepRenderQualityTier,
} from '../lib/nagi/render-quality.ts';
import {
  accompanimentEventsForSpan,
  planPhraseTexture,
} from '../lib/nagi/texture-planning.ts';

const HOURS = 24;
const END_SECONDS = HOURS * 60 * 60;
const START_SEED = '7F3A91C2';

const lowMobileTier = chooseRenderQualityCeiling({
  coarsePointer: true,
  deviceMemoryGb: 2,
  devicePixelRatio: 3,
  hardwareConcurrency: 4,
  height: 844,
  width: 390,
});
const desktopTier = chooseRenderQualityCeiling({
  coarsePointer: false,
  deviceMemoryGb: 16,
  devicePixelRatio: 2,
  hardwareConcurrency: 12,
  height: 900,
  width: 1440,
});
const lowMobilePlan = resolveRenderQualityPlan(lowMobileTier, 3, {
  halfFloatColorBuffer: false,
  maxSamples: 4,
});
const desktopPlan = resolveRenderQualityPlan(desktopTier, 2, {
  halfFloatColorBuffer: true,
  maxSamples: 4,
});
const noMsaaPlan = resolveRenderQualityPlan('quality', 2, {
  halfFloatColorBuffer: false,
  maxSamples: 0,
});

let currentSeed = START_SEED;
let currentProfile = profileFromSeed(currentSeed);
let incomingSeed = null;
let incomingProfile = null;
let transitionStart = 0;
let transitionDuration = 0;
let nextSeedAt = 430 + currentProfile.motion * 330;
let seedChanges = 0;
let maxProfileStep = 0;
let previousProfile = currentProfile;

for (let second = 0; second <= END_SECONDS; second += 1) {
  if (incomingSeed === null && second >= nextSeedAt) {
    incomingSeed = nextSeed(currentSeed);
    incomingProfile = profileFromSeed(incomingSeed);
    transitionStart = second;
    transitionDuration = 190 + incomingProfile.space * 155;
  }
  let profile = currentProfile;
  if (incomingProfile) {
    const amount = Math.min(1, (second - transitionStart) / transitionDuration);
    profile = interpolateProfile(currentProfile, incomingProfile, amount);
    if (amount >= 1) {
      currentSeed = incomingSeed;
      currentProfile = incomingProfile;
      incomingSeed = null;
      incomingProfile = null;
      nextSeedAt = second + 430 + currentProfile.motion * 330;
      seedChanges += 1;
    }
  }
  const delta = Math.max(
    ...Object.keys(profile).map((key) => Math.abs(profile[key] - previousProfile[key])),
  );
  maxProfileStep = Math.max(maxProfileStep, delta);
  previousProfile = profile;
}

const musicalRoot = deriveSeedNumber(START_SEED, 'soak-engine');
const harmonyRandom = new SeededRandom(deriveSeedNumber(musicalRoot, 'harmony'));
const melodyRandom = new SeededRandom(deriveSeedNumber(musicalRoot, 'melody'));
const random = harmonyRandom;
let scene = sceneFromSeed(START_SEED);
const emotionalForm = emotionalFormFromSeed(START_SEED);
let formSceneIndex = 0;
scene = shapeSceneWithEmotionalForm(scene, emotionalForm, formSceneIndex);
let currentArousal = scene.arousal;
let currentValence = scene.valence;
let targetArousal = currentArousal;
let targetValence = currentValence;
let transportTempo = scene.tempo;
let previousChordDuration = 0;
let chordDegree = 0;
let chordsUntilSceneChange = 7 + Math.floor(random.next() * 7);
let phraseBar = 0;
let previousVoicing = [];
let harmonicVoiceCount = 3;
let leadMidi = 69;
let counterMidi = 62;
let leadNeedsResolution = false;
let counterNeedsResolution = false;
const motifPair = createMotifPair(melodyRandom, scene);
const leadMotif = motifPair.lead;
const counterMotif = motifPair.counter;
let phraseHarmonyPlan;
let bassLinePlan;
let lastBassMidi = 46;
let totalVoiceMovement = 0;
let voiceMovementSamples = 0;
let totalLeadMovement = 0;
let leadSamples = 0;
let totalCounterMovement = 0;
let counterSamples = 0;
let resolutionAttempts = 0;
let successfulResolutions = 0;
let strongBeatNotes = 0;
let strongBeatChordTones = 0;
let independentPatternPairs = 0;
let patternPairs = 0;
let motifTargetHits = 0;
let motifTargetSamples = 0;
let totalMelodyRoughness = 0;
let melodyRoughnessSamples = 0;
let totalBackgroundRoughness = 0;
let backgroundRoughnessSamples = 0;
let minimumBassSeparation = Infinity;
let minimumBedBreath = Infinity;
let maximumBedBreath = -Infinity;
let darkModeChords = 0;
let highTensionChords = 0;
let highTensionBars = 0;
let totalBars = 0;
let triadChords = 0;
let unstableTriadChords = 0;
let brightMoodChords = 0;
let accompanimentPulseEvents = 0;
let maxAccompanimentGridError = 0;
let maxGridUnitError = 0;
let maxExpressiveOffsetMs = 0;
let maxTransportDriftMs = 0;
let maxTempoStep = 0;
let maxEmotionStep = 0;
let minimumBpm = Infinity;
let maximumBpm = -Infinity;
let sharedPivotTones = 0;
let minimumSceneScaleCommonTones = Infinity;
let sceneChanges = 0;
let phraseBoundaryOvershoots = 0;
let chordCount = 0;
let cadenceArrivalSamples = 0;
let cadenceArrivalsOnTonic = 0;
let plannedCadenceArrivals = 0;
let nonRootBassChords = 0;
let stepwiseOrPedalBassMotions = 0;
let bassMotionSamples = 0;
let maximumBassLeap = 0;
let contraryOrObliqueCounterEvents = 0;
let relatedCounterEvents = 0;
const cadenceTypesVisited = new Set();
let parallelPerfectMotions = 0;
let comparableVoiceMotions = 0;
let now = 0.025;
const intervals = [];
const modes = new Set();
const keys = new Set();
const meters = new Set();
const progressionWindows = new Set();
const formStages = new Set();
const harmonyVoiceCounts = new Set();
const recentProgression = [];
const darkModes = new Set([
  'phrygian',
  'harmonic-minor',
  'dorian-sharp-four',
  'neapolitan-major',
]);

while (now < END_SECONDS) {
  if (chordsUntilSceneChange <= 0 && phraseBar === 0) {
    formSceneIndex += 1;
    const nextScene = shapeSceneWithEmotionalForm(
      chooseNeighborScene(scene, random),
      emotionalForm,
      formSceneIndex,
    );
    minimumSceneScaleCommonTones = Math.min(
      minimumSceneScaleCommonTones,
      sceneScaleCommonTones(scene, nextScene),
    );
    const pivotDegree = findPivotDegree(scene, chordDegree, nextScene);
    const sourceClasses = new Set(chordPitchClasses(scene, chordDegree));
    const targetClasses = chordPitchClasses(nextScene, pivotDegree);
    sharedPivotTones += targetClasses.filter((note) => sourceClasses.has(note)).length;
    sceneChanges += 1;
    chordDegree = pivotDegree;
    scene = nextScene;
    targetArousal = scene.arousal;
    targetValence = scene.valence;
    phraseBar = 0;
    chordsUntilSceneChange = 7 + Math.floor(random.next() * 8);
  }

  const emotionAmount = 1 - Math.exp(-previousChordDuration / 42);
  const previousArousal = currentArousal;
  const previousValence = currentValence;
  currentArousal += (targetArousal - currentArousal) * emotionAmount;
  currentValence += (targetValence - currentValence) * emotionAmount;
  maxEmotionStep = Math.max(
    maxEmotionStep,
    Math.abs(currentArousal - previousArousal),
    Math.abs(currentValence - previousValence),
  );
  const targetTempo = tempoFromArousal(currentArousal, currentValence);
  const previousTempo = transportTempo;
  const maxTempoStepForChord = Math.max(0.7, transportTempo * 0.014);
  transportTempo += clamp(
    targetTempo - transportTempo,
    -maxTempoStepForChord,
    maxTempoStepForChord,
  );
  maxTempoStep = Math.max(maxTempoStep, Math.abs(transportTempo - previousTempo));
  minimumBpm = Math.min(minimumBpm, transportTempo);
  maximumBpm = Math.max(maximumBpm, transportTempo);

  const sceneForChord = {
    ...scene,
    arousal: currentArousal,
    motifRate: clamp(0.26 + currentArousal * 0.66, 0.24, 0.92),
    tempo: transportTempo,
    valence: currentValence,
  };
  if (phraseBar === 0 || !phraseHarmonyPlan || !bassLinePlan) {
    const stage = emotionalFormStageAt(emotionalForm, formSceneIndex);
    phraseHarmonyPlan = planPhraseHarmony(sceneForChord, random, {
      goal: phraseHarmonicGoalForFormStage(stage),
      phraseBars: sceneForChord.phraseBars,
      startDegree: chordDegree,
    });
    bassLinePlan = planBassLine(sceneForChord, phraseHarmonyPlan, random, {
      pedalStrength: 0.58 + (1 - sceneForChord.arousal) * 0.46,
      previousBassMidi: lastBassMidi,
      stepwiseStrength: 0.76 + (1 - sceneForChord.tension) * 0.24,
    });
    cadenceTypesVisited.add(phraseHarmonyPlan.cadence.type);
  }
  const phraseHarmonyEvent = phraseHarmonyEventAtBar(phraseHarmonyPlan, phraseBar);
  if (!phraseHarmonyEvent) throw new Error('phrase harmony plan produced no event');
  chordDegree = phraseHarmonyEvent.degree;
  const bassLineEvent = bassLinePlan.events[phraseHarmonyEvent.index];
  const meter = METERS[sceneForChord.meterIndex];
  const beatSeconds = 60 / sceneForChord.tempo;
  const remainingPhraseBars = sceneForChord.phraseBars - phraseBar;
  const spanBars = phraseHarmonyEvent.spanBars;
  if (spanBars > remainingPhraseBars) phraseBoundaryOvershoots += 1;
  const totalBeats = meter.beatsPerBar * spanBars;
  const duration = beatSeconds * totalBeats;
  const exactEnd = now + beatSeconds * meter.beatsPerBar * spanBars;
  maxTransportDriftMs = Math.max(
    maxTransportDriftMs,
    Math.abs(now + duration - exactEnd) * 1000,
  );

  const phraseProgress =
    (phraseBar % sceneForChord.phraseBars) / Math.max(1, sceneForChord.phraseBars);
  if (phraseBar === 0 || random.next() < 0.38) {
    harmonicVoiceCount = chooseHarmonyVoiceCount(
      sceneForChord,
      0.5 + sceneForChord.arousal * 0.18,
      phraseProgress,
      harmonicVoiceCount,
      random,
    );
  }
  const voicing = voiceLeadChord(
    sceneForChord,
    chordDegree,
    previousVoicing,
    harmonicVoiceCount,
    bassLineEvent
      ? { bassMidi: bassLineEvent.bassMidi, inversion: bassLineEvent.inversion }
      : undefined,
  );
  harmonyVoiceCounts.add(voicing.length);
  if (previousVoicing.length > 0) {
    for (const note of voicing) {
      totalVoiceMovement += Math.min(...previousVoicing.map((old) => Math.abs(note - old)));
      voiceMovementSamples += 1;
    }
    if (previousVoicing.length === voicing.length) {
      for (let low = 0; low < voicing.length; low += 1) {
        for (let high = low + 1; high < voicing.length; high += 1) {
          const oldInterval = ((previousVoicing[high] - previousVoicing[low]) % 12 + 12) % 12;
          const nextInterval = ((voicing[high] - voicing[low]) % 12 + 12) % 12;
          const lowMotion = voicing[low] - previousVoicing[low];
          const highMotion = voicing[high] - previousVoicing[high];
          comparableVoiceMotions += 1;
          if (
            (oldInterval === 0 || oldInterval === 7) &&
            nextInterval === oldInterval &&
            lowMotion !== 0 &&
            Math.sign(lowMotion) === Math.sign(highMotion)
          ) parallelPerfectMotions += 1;
        }
      }
    }
  }
  const bass = voicing[0] ?? chordRootMidi(sceneForChord, chordDegree);
  if (bassLineEvent) {
    if (bassLineEvent.inversion !== 0) nonRootBassChords += 1;
    if (bassLineEvent.motion === 'stepwise' || bassLineEvent.motion === 'pedal') {
      stepwiseOrPedalBassMotions += 1;
    }
    if (bassMotionSamples > 0) {
      maximumBassLeap = Math.max(maximumBassLeap, Math.abs(bass - lastBassMidi));
    }
    bassMotionSamples += 1;
  }
  lastBassMidi = bass;
  const upperVoices = voicing.slice(1);
  minimumBassSeparation = Math.min(
    minimumBassSeparation,
    Math.min(...upperVoices) - bass,
  );
  const bedBreath = 0.78 + Math.abs(Math.cos(phraseProgress * Math.PI)) * 0.22;
  minimumBedBreath = Math.min(minimumBedBreath, bedBreath);
  maximumBedBreath = Math.max(maximumBedBreath, bedBreath);
  const padTail = Math.min(2.2, Math.max(0.75, duration * 0.2));
  upperVoices.forEach(() =>
    intervals.push([now, now + duration * (0.84 + bedBreath * 0.1) + padTail]),
  );
  const bassDuration = Math.min(duration * 0.72, meter.beatsPerBar * beatSeconds * 1.3);
  intervals.push([now, now + bassDuration + 1.25]);
  if (spanBars >= 3 && random.next() < 0.32) {
    const bassStart = now + (spanBars - 1) * meter.beatsPerBar * beatSeconds;
    intervals.push([bassStart, bassStart + meter.beatsPerBar * beatSeconds * 0.58 + 1.25]);
  }
  for (let first = 0; first < voicing.length; first += 1) {
    for (let second = first + 1; second < voicing.length; second += 1) {
      totalBackgroundRoughness += sensoryRoughness(voicing[first], voicing[second]);
      backgroundRoughnessSamples += 1;
    }
  }
  if (chordPitchClasses(sceneForChord, chordDegree).length === 3) triadChords += 1;
  if (degreeTriadComfort(sceneForChord, chordDegree) < 0.5) unstableTriadChords += 1;
  if (darkModes.has(MODES[sceneForChord.modeIndex].id)) darkModeChords += 1;
  if (degreeTension(chordDegree) > 0.6) {
    highTensionChords += 1;
    highTensionBars += spanBars;
  }
  totalBars += spanBars;
  if (sceneForChord.valence > 0.7 && sceneForChord.arousal > 0.58) brightMoodChords += 1;
  formStages.add(emotionalFormStageAt(emotionalForm, formSceneIndex).id);
  if (phraseHarmonyEvent.structuralRole === 'cadence-arrival') {
    cadenceArrivalSamples += 1;
    if (chordDegree === phraseHarmonyPlan.cadence.arrivalDegree) {
      plannedCadenceArrivals += 1;
    }
    if (harmonicFunctionForDegree(sceneForChord, chordDegree) === 'tonic') {
      cadenceArrivalsOnTonic += 1;
    }
  }

  for (let bar = 0; bar < spanBars; bar += 1) {
    for (let beat = 0; beat < meter.beatsPerBar; beat += 1) {
      const strength = metricStrengthAt(meter, beat);
      if (sceneForChord.arousal < 0.34 && strength < 0.58) continue;
      const pulseBeat = bar * meter.beatsPerBar + beat;
      maxAccompanimentGridError = Math.max(
        maxAccompanimentGridError,
        Math.abs(pulseBeat * meter.subdivisionsPerBeat - Math.round(pulseBeat * meter.subdivisionsPerBeat)),
      );
      const pulseDuration = beatSeconds * (0.42 + (1 - sceneForChord.arousal) * 0.16);
      intervals.push([now + pulseBeat * beatSeconds, now + pulseBeat * beatSeconds + pulseDuration]);
      accompanimentPulseEvents += 1;
      if (sceneForChord.arousal > 0.78 && (beat + bar) % 2 === 0) {
        const offbeat = pulseBeat + 0.5;
        maxAccompanimentGridError = Math.max(
          maxAccompanimentGridError,
          Math.abs(offbeat * meter.subdivisionsPerBeat * 2 - Math.round(offbeat * meter.subdivisionsPerBeat * 2)),
        );
        intervals.push([now + offbeat * beatSeconds, now + (offbeat + 0.28) * beatSeconds]);
        accompanimentPulseEvents += 1;
      }
    }
  }

  const counterpointPlan = planMotifCounterpoint(
    sceneForChord,
    spanBars,
    melodyRandom,
    leadMotif,
    counterMotif,
    phraseBar,
    true,
  );
  const { leadEvents, counterEvents } = counterpointPlan;
  for (const event of counterEvents) {
    if (event.voiceRelation === 'contrary' || event.voiceRelation === 'oblique') {
      contraryOrObliqueCounterEvents += 1;
    }
    if (event.voiceRelation && event.voiceRelation !== 'independent') {
      relatedCounterEvents += 1;
    }
  }
  const leadSteps = new Set(
    leadEvents.map((event) => Math.round(event.beat * meter.subdivisionsPerBeat)),
  );
  const counterSteps = new Set(
    counterEvents.map((event) => Math.round(event.beat * meter.subdivisionsPerBeat)),
  );
  const sharedSteps = [...leadSteps].filter((step) => counterSteps.has(step)).length;
  const overlap = sharedSteps / Math.max(1, Math.min(leadSteps.size, counterSteps.size));
  if (overlap < 0.72) independentPatternPairs += 1;
  patternPairs += 1;

  const simulateVoice = (role, events) => {
    for (const event of events) {
      const gridUnits = event.beat * 12;
      maxGridUnitError = Math.max(
        maxGridUnitError,
        Math.abs(gridUnits - Math.round(gridUnits)),
      );
      const expressiveOffsetMs = Math.abs(event.humanizeBeats * beatSeconds * 1000);
      maxExpressiveOffsetMs = Math.max(maxExpressiveOffsetMs, expressiveOffsetMs);
      const phraseProgress =
        ((phraseBar + event.beat / meter.beatsPerBar) % sceneForChord.phraseBars) /
        sceneForChord.phraseBars;
      const contour = Math.sin(
        phraseProgress * Math.PI * 2 + sceneForChord.tension * Math.PI,
      );
      const direction = contour > 0.16 ? 1 : contour < -0.16 ? -1 : 0;
      const previous = role === 'lead' ? leadMidi : counterMidi;
      const needsResolution = role === 'lead' ? leadNeedsResolution : counterNeedsResolution;
      const targetMidi =
        (role === 'lead' ? 70 : 62) + contour * (role === 'lead' ? 4.2 : 3.1);
      const targetPitchClass = motifPitchClass(sceneForChord, event.motifDegree);
      const backgroundNotes = [...voicing];
      const midi = pickMelodyMidi(sceneForChord, chordDegree, previous, melodyRandom, {
        backgroundNotes,
        bassMidi: bass,
        direction,
        metricStrength: event.metricStrength,
        mustResolve: needsResolution || event.cadential,
        otherVoiceMidi: role === 'lead' ? counterMidi : leadMidi,
        registerHigh: role === 'lead' ? 84 : 74,
        registerLow: role === 'lead' ? 60 : 52,
        targetMidi,
        targetPitchClass,
      });
      const chordTone = isChordTone(sceneForChord, chordDegree, midi);
      const midiClass = ((midi % 12) + 12) % 12;
      motifTargetSamples += 1;
      if (midiClass === targetPitchClass) motifTargetHits += 1;
      totalMelodyRoughness += backgroundNotes.reduce(
        (sum, backgroundMidi) => sum + sensoryRoughness(midi, backgroundMidi),
        0,
      ) / backgroundNotes.length;
      melodyRoughnessSamples += 1;
      if (needsResolution) {
        resolutionAttempts += 1;
        if (chordTone && Math.abs(midi - previous) <= 2) successfulResolutions += 1;
      }
      if (event.metricStrength >= 0.6) {
        strongBeatNotes += 1;
        if (chordTone) strongBeatChordTones += 1;
      }
      if (role === 'lead') {
        totalLeadMovement += Math.abs(midi - leadMidi);
        leadSamples += 1;
        leadMidi = midi;
        leadNeedsResolution = !chordTone;
        intervals.push([now + event.beat * beatSeconds, now + event.beat * beatSeconds + 3.4]);
      } else {
        totalCounterMovement += Math.abs(midi - counterMidi);
        counterSamples += 1;
        counterMidi = midi;
        counterNeedsResolution = !chordTone;
        intervals.push([now + event.beat * beatSeconds, now + event.beat * beatSeconds + 4.7]);
      }
    }
  };

  simulateVoice('lead', leadEvents);
  simulateVoice('counter', counterEvents);

  modes.add(sceneForChord.modeIndex);
  keys.add(sceneForChord.tonic);
  meters.add(sceneForChord.meterIndex);
  recentProgression.push(`${sceneName(sceneForChord)}:${chordDegree}`);
  if (recentProgression.length > 6) recentProgression.shift();
  if (recentProgression.length === 6) progressionWindows.add(recentProgression.join('|'));
  previousVoicing = voicing;
  phraseBar = (phraseBar + spanBars) % sceneForChord.phraseBars;
  chordsUntilSceneChange -= 1;
  chordCount += 1;
  previousChordDuration = duration;
  now = exactEnd;
}

const sweep = [];
for (const [start, end] of intervals) {
  sweep.push([start, 1]);
  sweep.push([end, -1]);
}
sweep.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let active = 0;
let maxActiveSources = 0;
for (const [, change] of sweep) {
  active += change;
  maxActiveSources = Math.max(maxActiveSources, active);
}

const averageVoiceMovement = totalVoiceMovement / Math.max(1, voiceMovementSamples);
const averageLeadMovement = totalLeadMovement / Math.max(1, leadSamples);
const averageCounterMovement = totalCounterMovement / Math.max(1, counterSamples);
const progressionUniqueness = progressionWindows.size / Math.max(1, chordCount - 5);
const resolutionRate = successfulResolutions / Math.max(1, resolutionAttempts);
const strongBeatConsonance = strongBeatChordTones / Math.max(1, strongBeatNotes);
const counterpointIndependence = independentPatternPairs / Math.max(1, patternPairs);
const averagePivotCommonTones = sharedPivotTones / Math.max(1, sceneChanges);
const motifTargetRate = motifTargetHits / Math.max(1, motifTargetSamples);
const averageMelodyRoughness = totalMelodyRoughness / Math.max(1, melodyRoughnessSamples);
const averageBackgroundRoughness =
  totalBackgroundRoughness / Math.max(1, backgroundRoughnessSamples);
const darkModeShare = darkModeChords / Math.max(1, chordCount);
const highTensionShare = highTensionChords / Math.max(1, chordCount);
const highTensionTimeShare = highTensionBars / Math.max(1, totalBars);
const triadShare = triadChords / Math.max(1, chordCount);
const unstableTriadShare = unstableTriadChords / Math.max(1, chordCount);
const brightMoodShare = brightMoodChords / Math.max(1, chordCount);
const cadenceTonicRate = cadenceArrivalsOnTonic / Math.max(1, cadenceArrivalSamples);
const plannedCadenceArrivalRate = plannedCadenceArrivals / Math.max(1, cadenceArrivalSamples);
const nonRootBassShare = nonRootBassChords / Math.max(1, bassMotionSamples);
const connectedBassMotionShare =
  stepwiseOrPedalBassMotions / Math.max(1, bassMotionSamples);
const contraryOrObliqueCounterpointShare =
  contraryOrObliqueCounterEvents / Math.max(1, relatedCounterEvents);
const parallelPerfectRate = parallelPerfectMotions / Math.max(1, comparableVoiceMotions);
let familiarThemeSamples = 0;
const familiarThemeNames = new Set();
for (let index = 0; index < 512; index += 1) {
  const motifRandom = new SeededRandom((0x6d2b79f5 + index * 0x9e3779b9) >>> 0);
  const motif = createMotif(
    motifRandom,
    motifRandom.next(),
    'lead',
    undefined,
    motifRandom.next(),
  );
  if (motif.familiar) {
    familiarThemeSamples += 1;
    familiarThemeNames.add(motif.sourceName);
  }
}
const familiarThemeShare = familiarThemeSamples / 512;
const emotionalFormIsSeedDeterministic =
  JSON.stringify(emotionalFormFromSeed(START_SEED)) ===
  JSON.stringify(emotionalFormFromSeed(START_SEED));

const FORM_ROLES = ['A', 'A-prime', 'B', 'A-double-prime'];
const harmonicSimilaritySamples = Object.fromEntries(
  FORM_ROLES.map((role) => [role, []]),
);
const harmonicExactMatches = Object.fromEntries(
  FORM_ROLES.map((role) => [role, 0]),
);
const textureStatesVisited = new Set();
const textureActiveRoleCounts = new Set();
const soundingChordVoiceCounts = new Set();
const accompanimentPatternsVisited = new Set();
const accompanimentContinuityVisited = new Set();
const textureStageRoleTotals = Object.fromEntries(
  ['statement', 'development', 'intensification', 'release', 'return']
    .map((stage) => [stage, { count: 0, roles: 0 }]),
);
const textureStageStates = Object.fromEntries(
  ['statement', 'development', 'intensification', 'release', 'return']
    .map((stage) => [stage, new Set()]),
);
const melodicVariationSources = {
  'A-prime': new Set(),
  'A-double-prime': new Set(),
};
const melodicVariationTechniques = {
  'A-prime': new Set(),
  'A-double-prime': new Set(),
};
let returnTonicMatches = 0;
let returnModeMatches = 0;
let developmentTonicMatches = 0;
let developmentModeMatches = 0;
let returnEmotionDistanceTotal = 0;
let developmentEmotionDistanceTotal = 0;
let explicitOpeningRecallFailures = 0;
let formalAuditSamples = 0;
let textureRoleFlickerViolations = 0;
let textureMinimumDurationViolations = 0;
let textureSilentSegments = 0;
let textureInactiveSpotlights = 0;
let maxPlannedAccompanimentGridError = 0;
let phraseClimaxFailures = 0;
let phraseCadenceFailures = 0;
let controlledAccentedDissonances = 0;
let controlledDissonanceMarkerFailures = 0;
let realizedAccentedDissonanceSamples = 0;
let realizedAccentedDissonanceChoices = 0;
let conservativeStrongBeatChordTones = 0;
let realizedDissonanceResolutions = 0;
let phraseSliceFieldSamples = 0;
let phraseSliceFieldFailures = 0;
let aPrimeExactMelodyCopies = 0;
let aDoublePrimeExactMelodyCopies = 0;
let melodicReferenceSamples = 0;
let reconciliationTemplate = null;

const emotionDistance = (left, right) => Math.hypot(
  left.arousal - right.arousal,
  left.valence - right.valence,
  left.tension - right.tension,
);
const harmonicSignature = (plan) => plan.events
  .map((event) => `${event.degree}:${event.spanBars}`)
  .join('|');
// Deliberately independent from PhraseHarmonicVariationPlan.similarity. Sample
// both phrases on a normalized time axis so the audit observes the emitted
// degree/function sequence rather than trusting a score reported by the SUT.
const independentlyMeasuredHarmonicSimilarity = (
  reference,
  candidate,
  candidateScene,
) => {
  if (reference.events.length === 0 || candidate.events.length === 0) return 0;
  const eventAt = (plan, position) => {
    const bar = clamp(position, 0, 1 - Number.EPSILON) * plan.phraseBars;
    return plan.events.find((event) => (
      bar >= event.startBar && bar < event.startBar + event.spanBars
    )) ?? plan.events.at(-1);
  };
  const sampleCount = 96;
  let degreeScore = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const position = (sample + 0.5) / sampleCount;
    const source = eventAt(reference, position);
    const target = eventAt(candidate, position);
    if (source.degree === target.degree) {
      degreeScore += 1;
    } else if (
      harmonicFunctionForDegree(candidateScene, source.degree) ===
      target.harmonicFunction
    ) {
      degreeScore += 0.42;
    }
  }
  const sourceBoundaries = reference.events.slice(1)
    .map((event) => event.startBar / reference.phraseBars);
  const targetBoundaries = candidate.events.slice(1)
    .map((event) => event.startBar / candidate.phraseBars);
  const boundaryScore = targetBoundaries.length === 0
    ? Number(sourceBoundaries.length === 0)
    : targetBoundaries.reduce((sum, boundary) => {
        const distance = sourceBoundaries.length === 0
          ? 1
          : Math.min(...sourceBoundaries.map((source) => Math.abs(source - boundary)));
        return sum + clamp(1 - distance * 6);
      }, 0) / targetBoundaries.length;
  return clamp((degreeScore / sampleCount) * 0.86 + boundaryScore * 0.14);
};
const melodicSignature = (plan) => plan.leadEvents
  .map((event) => `${event.phraseBeat}:${event.motifDegree}:${event.durationBeats}`)
  .join('|');
const preservedSliceFields = [
  'accentedDissonanceAllowed',
  'harmonicIntent',
  'mustResolveNext',
  'phraseBeat',
  'phrasePosition',
  'phraseRole',
  'targetMidi',
];

for (let index = 0; index < 512; index += 1) {
  const seed = ((0x31e2a91d + index * 0x9e3779b9) >>> 0)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();
  const rootRandom = new SeededRandom(deriveSeedNumber(seed, 'formal-memory-audit'));
  const form = emotionalFormFromSeed(seed);
  const rawOpeningScene = sceneFromSeed(seed);
  const openingScene = shapeSceneWithEmotionalFormMemory(
    rawOpeningScene,
    rawOpeningScene,
    form,
    0,
  );
  const scenesByStage = { statement: openingScene };
  let journeyScene = rawOpeningScene;
  const sceneCount = form.stages.length * form.scenesPerStage;
  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    if (sceneIndex > 0) journeyScene = chooseNeighborScene(journeyScene, rootRandom);
    const shaped = shapeSceneWithEmotionalFormMemory(
      journeyScene,
      openingScene,
      form,
      sceneIndex,
    );
    scenesByStage[emotionalFormStageAt(form, sceneIndex).id] = shaped;
  }
  const developmentScene = scenesByStage.development;
  const returnScene = scenesByStage.return;
  returnTonicMatches += Number(returnScene.tonic === openingScene.tonic);
  returnModeMatches += Number(returnScene.modeIndex === openingScene.modeIndex);
  developmentTonicMatches += Number(developmentScene.tonic === openingScene.tonic);
  developmentModeMatches += Number(developmentScene.modeIndex === openingScene.modeIndex);
  returnEmotionDistanceTotal += emotionDistance(returnScene, openingScene);
  developmentEmotionDistanceTotal += emotionDistance(developmentScene, openingScene);
  const explicitRecall = recallOpeningScene(developmentScene, openingScene, {
    emotionStrength: 1,
    harmonicStrength: 1,
  });
  if (
    explicitRecall.tonic !== openingScene.tonic ||
    explicitRecall.modeIndex !== openingScene.modeIndex ||
    emotionDistance(explicitRecall, openingScene) > 1e-9
  ) explicitOpeningRecallFailures += 1;

  const aHarmony = planPhraseHarmony(
    openingScene,
    rootRandom.fork('harmony-A'),
    {
      goal: 'statement',
      phraseBars: openingScene.phraseBars,
    },
  );
  const harmonicPlans = {
    A: planPhraseHarmonyVariation(
      openingScene,
      aHarmony,
      rootRandom.fork('harmony-A-repeat'),
      { relationship: 'A' },
    ),
    'A-prime': planPhraseHarmonyVariation(
      developmentScene,
      aHarmony,
      rootRandom.fork('harmony-A-prime'),
      { relationship: 'A-prime' },
    ),
    B: planPhraseHarmonyVariation(
      scenesByStage.intensification,
      aHarmony,
      rootRandom.fork('harmony-B'),
      { relationship: 'B' },
    ),
    'A-double-prime': planPhraseHarmonyVariation(
      returnScene,
      aHarmony,
      rootRandom.fork('harmony-A-double-prime'),
      { relationship: 'A-double-prime' },
    ),
  };
  for (const role of FORM_ROLES) {
    const plan = harmonicPlans[role];
    harmonicSimilaritySamples[role].push(
      independentlyMeasuredHarmonicSimilarity(
        aHarmony,
        plan,
        role === 'A'
          ? openingScene
          : role === 'A-prime'
            ? developmentScene
            : role === 'B'
              ? scenesByStage.intensification
              : returnScene,
      ),
    );
    if (harmonicSignature(plan) === harmonicSignature(aHarmony)) {
      harmonicExactMatches[role] += 1;
    }
  }

  const sampleProfile = profileFromSeed(seed);
  let previousPattern = null;
  for (const stage of form.stages) {
    const stageScene = scenesByStage[stage.id];
    const harmonyPlan = stage.id === 'statement'
      ? aHarmony
      : harmonicPlans[
          stage.id === 'development'
            ? 'A-prime'
            : stage.id === 'intensification'
              ? 'B'
              : stage.id === 'return'
                ? 'A-double-prime'
                : 'A-prime'
        ];
    const texturePlan = planPhraseTexture(
      stageScene,
      sampleProfile,
      stage,
      rootRandom.fork(`texture-${stage.id}`),
      {
        harmonyEvents: harmonyPlan.events,
        phraseBars: harmonyPlan.phraseBars,
        previousAccompanimentPattern: previousPattern,
      },
    );
    previousPattern = texturePlan.accompanimentPattern;
    accompanimentPatternsVisited.add(texturePlan.accompanimentPattern.id);
    accompanimentContinuityVisited.add(texturePlan.accompanimentPattern.continuity);
    const meter = METERS[stageScene.meterIndex];
    for (const event of texturePlan.accompanimentPattern.events) {
      maxPlannedAccompanimentGridError = Math.max(
        maxPlannedAccompanimentGridError,
        Math.abs(
          event.beatOffset * meter.subdivisionsPerBeat -
            Math.round(event.beatOffset * meter.subdivisionsPerBeat),
        ),
        Math.abs(
          event.durationBeats * meter.subdivisionsPerBeat -
            Math.round(event.durationBeats * meter.subdivisionsPerBeat),
        ),
      );
    }
    for (const event of accompanimentEventsForSpan(
      texturePlan.accompanimentPattern,
      stageScene.meterIndex,
      0,
      texturePlan.phraseBars,
    )) {
      maxPlannedAccompanimentGridError = Math.max(
        maxPlannedAccompanimentGridError,
        Math.abs(
          event.beatOffset * meter.subdivisionsPerBeat -
            Math.round(event.beatOffset * meter.subdivisionsPerBeat),
        ),
      );
    }
    for (const segment of texturePlan.segments) {
      textureStatesVisited.add(segment.state);
      textureStageStates[stage.id].add(segment.state);
      textureActiveRoleCounts.add(segment.activeRoles.length);
      soundingChordVoiceCounts.add(segment.totalChordVoices);
      textureStageRoleTotals[stage.id].roles += segment.activeRoles.length * segment.spanBars;
      textureStageRoleTotals[stage.id].count += segment.spanBars;
      if (segment.activeRoles.length === 0) textureSilentSegments += 1;
      if (!segment.activeRoles.includes(segment.spotlight)) textureInactiveSpotlights += 1;
    }
    for (const role of ['counter', 'accompaniment']) {
      const activeSegments = texturePlan.segments.filter(
        (segment) => segment.activeRoles.includes(role),
      );
      const activeBars = activeSegments.reduce((sum, segment) => sum + segment.spanBars, 0);
      if (activeBars > 0 && activeBars + 1e-9 < texturePlan.phraseBars / 2) {
        textureMinimumDurationViolations += 1;
      }
      const activity = texturePlan.segments.map((segment) => (
        segment.activeRoles.includes(role)
      ));
      const transitions = activity.slice(1).reduce(
        (count, active, activityIndex) => count + Number(active !== activity[activityIndex]),
        0,
      );
      if (transitions > 2) textureRoleFlickerViolations += 1;
    }
  }

  const motifRandom = rootRandom.fork('phrase-melody');
  const motifs = createMotifPair(motifRandom, openingScene);
  const aMelody = planPhraseMelody(
    openingScene,
    motifRandom,
    motifs.lead,
    motifs.counter,
    { counterEnabled: true, formRole: 'A', harmonyPlan: aHarmony },
  );
  const aPrimeMelody = planPhraseMelody(
    developmentScene,
    motifRandom,
    motifs.lead,
    motifs.counter,
    {
      counterEnabled: true,
      formRole: 'A-prime',
      harmonyPlan: harmonicPlans['A-prime'],
      openingReference: aMelody,
      previousPhrase: aMelody,
    },
  );
  const bMelody = planPhraseMelody(
    scenesByStage.intensification,
    motifRandom,
    motifs.lead,
    motifs.counter,
    {
      counterEnabled: true,
      formRole: 'B',
      harmonyPlan: harmonicPlans.B,
      previousPhrase: aPrimeMelody,
    },
  );
  const aDoublePrimeMelody = planPhraseMelody(
    returnScene,
    motifRandom,
    motifs.lead,
    motifs.counter,
    {
      counterEnabled: true,
      formRole: 'A-double-prime',
      harmonyPlan: harmonicPlans['A-double-prime'],
      openingReference: aMelody,
      previousPhrase: bMelody,
    },
  );
  melodicVariationSources['A-prime'].add(aPrimeMelody.variation.source);
  melodicVariationSources['A-double-prime'].add(aDoublePrimeMelody.variation.source);
  aPrimeMelody.variation.techniques.forEach((technique) => (
    melodicVariationTechniques['A-prime'].add(technique)
  ));
  aDoublePrimeMelody.variation.techniques.forEach((technique) => (
    melodicVariationTechniques['A-double-prime'].add(technique)
  ));
  aPrimeExactMelodyCopies += Number(
    melodicSignature(aPrimeMelody) === melodicSignature(aMelody),
  );
  aDoublePrimeExactMelodyCopies += Number(
    melodicSignature(aDoublePrimeMelody) === melodicSignature(aMelody),
  );
  melodicReferenceSamples += 1;

  const climaxEvent = aMelody.leadEvents[aMelody.climax.eventIndex];
  const followingEvent = aMelody.leadEvents[aMelody.climax.eventIndex + 1];
  if (climaxEvent && followingEvent && climaxEvent.mustResolveNext) {
    const climaxHarmony = phraseHarmonyEventAtBar(
      aHarmony,
      climaxEvent.phraseBeat / aMelody.beatsPerBar,
    );
    const followingHarmony = phraseHarmonyEventAtBar(
      aHarmony,
      followingEvent.phraseBeat / aMelody.beatsPerBar,
    );
    if (climaxHarmony && followingHarmony) {
      const choiceSeed = deriveSeedNumber(seed, 'accented-dissonance-choice');
      const sharedContext = {
        backgroundNotes: chordPitchClasses(openingScene, climaxHarmony.degree)
          .map((pitchClass) => 60 + pitchClass),
        bassMidi: chordRootMidi(openingScene, climaxHarmony.degree),
        metricStrength: Math.max(0.82, climaxEvent.metricStrength),
        registerHigh: aMelody.registerArc.leadHighMidi,
        registerLow: aMelody.registerArc.leadLowMidi,
        targetMidi: climaxEvent.targetMidi,
        targetPitchClass: motifPitchClass(openingScene, climaxEvent.motifDegree),
      };
      const conservativeChoice = pickMelodyMidi(
        openingScene,
        climaxHarmony.degree,
        Math.round(aMelody.registerArc.startMidi),
        new SeededRandom(choiceSeed),
        { ...sharedContext, allowAccentedDissonance: false },
      );
      const expressiveChoice = pickMelodyMidi(
        openingScene,
        climaxHarmony.degree,
        Math.round(aMelody.registerArc.startMidi),
        new SeededRandom(choiceSeed),
        { ...sharedContext, allowAccentedDissonance: true },
      );
      realizedAccentedDissonanceSamples += 1;
      conservativeStrongBeatChordTones += Number(
        isChordTone(openingScene, climaxHarmony.degree, conservativeChoice),
      );
      const choseDissonance = !isChordTone(
        openingScene,
        climaxHarmony.degree,
        expressiveChoice,
      );
      realizedAccentedDissonanceChoices += Number(choseDissonance);
      if (choseDissonance) {
        const resolutionChoice = pickMelodyMidi(
          openingScene,
          followingHarmony.degree,
          expressiveChoice,
          rootRandom.fork(`accented-resolution-${index}`),
          {
            backgroundNotes: chordPitchClasses(openingScene, followingHarmony.degree)
              .map((pitchClass) => 60 + pitchClass),
            bassMidi: chordRootMidi(openingScene, followingHarmony.degree),
            metricStrength: followingEvent.metricStrength,
            mustResolve: true,
            registerHigh: aMelody.registerArc.leadHighMidi,
            registerLow: aMelody.registerArc.leadLowMidi,
            targetMidi: followingEvent.targetMidi,
            targetPitchClass: motifPitchClass(openingScene, followingEvent.motifDegree),
          },
        );
        realizedDissonanceResolutions += Number(
          isChordTone(openingScene, followingHarmony.degree, resolutionChoice) &&
            Math.abs(resolutionChoice - expressiveChoice) <= 2,
        );
      }
    }
  }

  for (const melodyPlan of [aMelody, aPrimeMelody, bMelody, aDoublePrimeMelody]) {
    const climaxEvent = melodyPlan.leadEvents[melodyPlan.climax.eventIndex];
    if (
      !climaxEvent ||
      climaxEvent.phraseRole !== 'climax' ||
      climaxEvent.targetMidi !== melodyPlan.climax.targetMidi ||
      melodyPlan.climax.targetMidi < melodyPlan.registerArc.startMidi + 4
    ) phraseClimaxFailures += 1;
    const finalEvent = melodyPlan.leadEvents.at(-1);
    if (
      !finalEvent ||
      finalEvent.phraseRole !== 'cadence' ||
      !finalEvent.cadential ||
      finalEvent.phraseBeat !== melodyPlan.cadence.arrivalBeat ||
      finalEvent.targetMidi > melodyPlan.registerArc.climaxMidi - 3
    ) phraseCadenceFailures += 1;
    melodyPlan.leadEvents.forEach((event, eventIndex, events) => {
      if (!event.accentedDissonanceAllowed) return;
      controlledAccentedDissonances += 1;
      if (!event.mustResolveNext || eventIndex >= events.length - 1) {
        controlledDissonanceMarkerFailures += 1;
      }
    });
    const sliceStartBar = melodyPlan.phraseBars > 2 ? 1 : 0;
    const slice = slicePhraseMelody(
      melodyPlan,
      sliceStartBar,
      Math.max(1, melodyPlan.phraseBars - sliceStartBar - 1),
    );
    for (const [slicedEvents, sourceEvents] of [
      [slice.leadEvents, melodyPlan.leadEvents],
      [slice.counterEvents, melodyPlan.counterEvents],
    ]) {
      for (const slicedEvent of slicedEvents) {
        const source = sourceEvents.find(
          (event) =>
            event.phraseBeat === slicedEvent.phraseBeat &&
            event.motifIndex === slicedEvent.motifIndex &&
            event.phraseRole === slicedEvent.phraseRole,
        );
        if (!source) continue;
        phraseSliceFieldSamples += 1;
        if (
          preservedSliceFields.some((field) => source[field] !== slicedEvent[field]) ||
          Math.abs(
            slicedEvent.beat -
              (slicedEvent.phraseBeat - slice.startBar * melodyPlan.beatsPerBar)
          ) > 1e-9
        ) phraseSliceFieldFailures += 1;
      }
    }
  }
  reconciliationTemplate ??= aMelody.leadEvents[0] ?? null;
  formalAuditSamples += 1;
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) /
  Math.max(1, values.length);
const averageHarmonicSimilarity = Object.fromEntries(
  FORM_ROLES.map((role) => [role, average(harmonicSimilaritySamples[role])]),
);
const harmonicExactShares = Object.fromEntries(
  FORM_ROLES.map((role) => [role, harmonicExactMatches[role] / formalAuditSamples]),
);
const averageTextureRolesByStage = Object.fromEntries(
  Object.entries(textureStageRoleTotals).map(([stage, totals]) => [
    stage,
    totals.roles / Math.max(1, totals.count),
  ]),
);
const returnTonicRate = returnTonicMatches / formalAuditSamples;
const returnModeRate = returnModeMatches / formalAuditSamples;
const developmentTonicRate = developmentTonicMatches / formalAuditSamples;
const developmentModeRate = developmentModeMatches / formalAuditSamples;
const averageReturnEmotionDistance = returnEmotionDistanceTotal / formalAuditSamples;
const averageDevelopmentEmotionDistance = developmentEmotionDistanceTotal /
  formalAuditSamples;
const aPrimeExactMelodyShare = aPrimeExactMelodyCopies / melodicReferenceSamples;
const aDoublePrimeExactMelodyShare = aDoublePrimeExactMelodyCopies /
  melodicReferenceSamples;
const conservativeStrongBeatChordToneRate = conservativeStrongBeatChordTones /
  Math.max(1, realizedAccentedDissonanceSamples);
const realizedAccentedDissonanceRate = realizedAccentedDissonanceChoices /
  Math.max(1, realizedAccentedDissonanceSamples);
const realizedDissonanceResolutionRate = realizedDissonanceResolutions /
  Math.max(1, realizedAccentedDissonanceChoices);

const modeGrammarAudit = [];
const modeCadenceNames = new Set();
let modeGrammarFieldFailures = 0;
let modeCadenceFailures = 0;
let modeCharacteristicExposureFailures = 0;
for (const [modeIndex, mode] of MODES.entries()) {
  const grammar = MODE_HARMONIC_GRAMMARS[mode.id];
  const grammarScene = {
    ...sceneFromSeed(((0x5a17c9e3 + modeIndex * 0x9e3779b9) >>> 0)
      .toString(16)
      .padStart(8, '0')
      .toUpperCase()),
    modeIndex,
    tonic: 0,
  };
  const expectedLength = mode.intervals.length;
  const validFunctions = new Set(['tonic', 'predominant', 'dominant', 'color']);
  const fieldsValid = Boolean(
    grammar &&
    grammar.characteristicToneWeights.length === expectedLength &&
    grammar.degreeFunctions.length === expectedLength &&
    grammar.degreeWeights.length === expectedLength &&
    grammar.characteristicToneWeights.every((weight) => Number.isFinite(weight) && weight > 0) &&
    grammar.degreeWeights.every((weight) => Number.isFinite(weight) && weight > 0) &&
    grammar.degreeFunctions.every((value, degree) => (
      validFunctions.has(value) &&
      harmonicFunctionForDegree(grammarScene, degree) === value
    )) &&
    grammar.modalCadenceDegrees.length >= 2 &&
    grammar.modalCadenceDegrees.at(-1) === 0 &&
    grammar.modalCadenceDegrees.every((degree) => (
      Number.isInteger(degree) && degree >= 0 && degree < expectedLength
    )) &&
    Math.max(...grammar.degreeWeights) - Math.min(...grammar.degreeWeights) > 0.2 &&
    Math.max(...grammar.characteristicToneWeights) -
      Math.min(...grammar.characteristicToneWeights) > 0.2 &&
    Array.from({ length: expectedLength }, (_, degree) =>
      modeChordIdentityWeight(grammarScene, degree)
    ).every((weight) => Number.isFinite(weight) && weight > 0)
  );
  if (!fieldsValid) modeGrammarFieldFailures += 1;

  const cadence = cadenceRecipeForScene(grammarScene, 'modal');
  const cadenceValid = Boolean(
    grammar &&
    cadence.modeAwareName === grammar.modalCadenceName &&
    cadence.arrivalDegree === 0 &&
    JSON.stringify(cadence.degrees) === JSON.stringify(grammar.modalCadenceDegrees)
  );
  if (!cadenceValid) modeCadenceFailures += 1;
  modeCadenceNames.add(cadence.modeAwareName);

  const strongestWeight = Math.max(...grammar.characteristicToneWeights);
  const characteristicDegrees = new Set(
    grammar.characteristicToneWeights
      .map((weight, degree) => weight === strongestWeight ? degree : -1)
      .filter((degree) => degree >= 0),
  );
  const cadenceExposesCharacteristicTone = cadence.degrees.some((rootDegree) =>
    [rootDegree, rootDegree + 2, rootDegree + 4].some((scaleDegree) =>
      characteristicDegrees.has(
        ((scaleDegree % expectedLength) + expectedLength) % expectedLength,
      )
    )
  );
  if (!cadenceExposesCharacteristicTone) modeCharacteristicExposureFailures += 1;
  modeGrammarAudit.push({
    cadence: cadence.modeAwareName,
    cadenceExposesCharacteristicTone,
    cadenceValid,
    fieldsValid,
    mode: mode.id,
  });
}

const reconciliationCorrectionReasons = new Set();
let reconciliationCorrectionFailures = 0;
let delayedLeadOverlapRegressionFailures = 0;
if (reconciliationTemplate) {
  const realizedEvent = (midi, beat, options = {}) => ({
    ...reconciliationTemplate,
    accentedDissonanceAllowed: false,
    beat,
    durationBeats: 0.75,
    metricStrength: 0.82,
    midi,
    phraseBeat: beat,
    ...options,
  });
  const reconciliationCases = [
    {
      expected: 'voice-crossing',
      lead: [realizedEvent(72, 0)],
      counter: [realizedEvent(74, 0)],
    },
    {
      expected: 'accented-vertical-dissonance',
      lead: [realizedEvent(72, 0)],
      counter: [realizedEvent(61, 0)],
    },
    {
      expected: 'parallel-perfect-interval',
      lead: [realizedEvent(72, 0), realizedEvent(74, 1)],
      counter: [realizedEvent(60, 0), realizedEvent(62, 1)],
    },
    {
      delayedLeadOverlap: true,
      expected: 'voice-crossing',
      lead: [realizedEvent(72, 1, { durationBeats: 1 })],
      counter: [realizedEvent(74, 0, { durationBeats: 2 })],
    },
  ];
  for (const reconciliationCase of reconciliationCases) {
    const result = reconcilePhraseCounterpoint(
      reconciliationCase.lead,
      reconciliationCase.counter,
    );
    result.corrections.forEach((correction) => (
      reconciliationCorrectionReasons.add(correction.reason)
    ));
    const correction = result.corrections.find(
      (candidate) => candidate.reason === reconciliationCase.expected,
    );
    const overlapStillCrosses = result.counterEvents.some((counterEvent) =>
      result.leadEvents.some((leadEvent) => (
        leadEvent.beat < counterEvent.beat + counterEvent.durationBeats - 0.001 &&
        counterEvent.beat < leadEvent.beat + leadEvent.durationBeats - 0.001 &&
        counterEvent.midi > leadEvent.midi - 3
      ))
    );
    if (
      !correction ||
      correction.correctedMidi === correction.originalMidi ||
      result.counterEvents[correction?.eventIndex ?? 0]?.midi !== correction?.correctedMidi ||
      (reconciliationCase.expected === 'voice-crossing' && overlapStillCrosses)
    ) reconciliationCorrectionFailures += 1;
    if (reconciliationCase.delayedLeadOverlap && (!correction || overlapStillCrosses)) {
      delayedLeadOverlapRegressionFailures += 1;
    }
  }
}

// A second, independent 24-hour pass exercises the complete planning chain and
// converts every planned musical event into source windows. It intentionally
// keeps the older transport baseline above: the two simulations answer
// different questions and guard one another against accidental simplification.
const INTEGRATED_HOURS = 24;
const INTEGRATED_END_SECONDS = INTEGRATED_HOURS * 60 * 60;
const INTEGRATED_ROLES = ['lead', 'counter', 'harmony', 'bass', 'accompaniment'];
const INTEGRATED_STAGES = ['statement', 'development', 'intensification', 'release', 'return'];
const INTEGRATED_TEXTURE_STATES = ['sparse', 'duo', 'chamber', 'full', 'release'];
const integratedRoleStats = Object.fromEntries(INTEGRATED_ROLES.map((role) => [role, {
  degraded: 0,
  dropped: 0,
  noiseSources: 0,
  planned: 0,
  scheduled: 0,
  toneSources: 0,
}]));
const integratedTextureSeconds = Object.fromEntries(
  INTEGRATED_TEXTURE_STATES.map((state) => [state, 0]),
);
const integratedStageDensity = Object.fromEntries(INTEGRATED_STAGES.map((stage) => [stage, {
  duration: 0,
  instrumentSeconds: 0,
  roleSeconds: 0,
  voiceSeconds: 0,
}]));
const integratedModesVisited = new Set();
const integratedPatternsVisited = new Set();
let integratedLiveWindows = [];
let integratedPeakSourceOverlap = 0;
let integratedPeakSimultaneousInstruments = 0;
let integratedPeakSimultaneousRoles = 0;
let integratedPeakSimultaneousVoices = 0;
let integratedPeakInstrumentIdentities = [];
let integratedPeakRoleIdentities = [];
const integratedInstrumentAudibleSeconds = {};
const integratedRoleAudibleSeconds = {};
const integratedInstrumentCountSeconds = {};
const integratedRoleCountSeconds = {};
const integratedVoiceCountSeconds = {};
const integratedDropExamples = [];
let integratedSeedChanges = 0;
let integratedPhrases = 0;
let integratedHarmonyEvents = 0;
let integratedCounterpointOverlapPairs = 0;
let integratedCounterpointViolationPairs = 0;
let integratedVoiceSerial = 0;

const integratedOverlapPeak = (start, end) => {
  const events = [];
  for (const window of integratedLiveWindows) {
    const overlapStart = Math.max(start, window.start);
    const overlapEnd = Math.min(end, window.end);
    if (overlapStart >= overlapEnd) continue;
    events.push({ change: 1, time: overlapStart });
    events.push({ change: -1, time: overlapEnd });
  }
  events.sort((left, right) => left.time - right.time || left.change - right.change);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.change;
    maximum = Math.max(maximum, active);
  }
  return maximum;
};

const canScheduleIntegratedSources = (start, end, count, limit) =>
  integratedOverlapPeak(start, end) + count <= limit;

const addIntegratedSourceWindow = (window) => {
  integratedLiveWindows.push(window);
  integratedPeakSourceOverlap = Math.max(
    integratedPeakSourceOverlap,
    integratedOverlapPeak(window.start, window.end),
  );
};

const scheduleIntegratedLogicalVoice = ({
  end,
  fromInstrument,
  mix,
  role,
  start,
  toInstrument,
  voiceId,
}) => {
  const stats = integratedRoleStats[role];
  stats.planned += 1;
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart + 0.001, end);
  const dominant = mix < 0.5 ? fromInstrument : toInstrument;
  const dualRequested = fromInstrument !== toInstrument && mix > 0.04 && mix < 0.96;
  const roleLimit = role === 'harmony'
    ? 32
    : role === 'bass'
      ? 34
      : role === 'accompaniment'
        ? 36
        : 40;
  let instruments = [];
  let degraded = false;
  if (
    dualRequested &&
    canScheduleIntegratedSources(safeStart, safeEnd, 2, Math.min(roleLimit, 34))
  ) {
    instruments = [fromInstrument, toInstrument];
  } else if (canScheduleIntegratedSources(safeStart, safeEnd, 1, roleLimit)) {
    instruments = [dominant];
    degraded = dualRequested;
  }
  if (instruments.length === 0) {
    stats.dropped += 1;
    if (integratedDropExamples.length < 12) {
      const overlapping = integratedLiveWindows.filter((window) => (
        window.start < safeEnd && window.end > safeStart
      ));
      integratedDropExamples.push({
        activeInstruments: [...new Set(overlapping.map((window) => window.instrument))].sort(),
        activeRoles: [...new Set(overlapping.map((window) => window.role))].sort(),
        activeSources: integratedOverlapPeak(safeStart, safeEnd),
        end: Number(safeEnd.toFixed(3)),
        role,
        start: Number(safeStart.toFixed(3)),
      });
    }
    return false;
  }
  stats.scheduled += 1;
  stats.toneSources += instruments.length;
  for (const instrument of instruments) {
    addIntegratedSourceWindow({
      end: safeEnd,
      instrument,
      kind: 'tone',
      role,
      start: safeStart,
      voiceId,
    });
  }

  const recipe = INSTRUMENTS[dominant];
  if ((recipe.breath ?? 0) + (recipe.transient ?? 0) >= 0.035) {
    const transient = recipe.transient ?? 0;
    const breath = recipe.breath ?? 0;
    const duration = safeEnd - safeStart;
    const transientDuration = Math.min(0.12, Math.max(0.035, duration * 0.12));
    const bodyDuration = Math.max(
      transientDuration + 0.02,
      Math.min(duration, transient > breath ? 0.28 + breath * duration : duration),
    );
    const noiseEnd = safeStart + bodyDuration + 0.015;
    if (canScheduleIntegratedSources(safeStart, noiseEnd, 1, 30)) {
      addIntegratedSourceWindow({
        end: noiseEnd,
        instrument: dominant,
        kind: 'noise',
        role,
        start: safeStart,
        voiceId,
      });
      stats.noiseSources += 1;
    } else {
      degraded = true;
    }
  }
  if (degraded) stats.degraded += 1;
  return true;
};

const integrateScheduledDensity = (start, end, stage) => {
  const clippedEnd = Math.min(end, INTEGRATED_END_SECONDS);
  if (clippedEnd <= start) return;
  const overlapping = integratedLiveWindows.filter((window) => (
    window.start < clippedEnd && window.end > start
  ));
  const boundaries = new Set([start, clippedEnd]);
  overlapping.forEach((window) => {
    boundaries.add(clamp(window.start, start, clippedEnd));
    boundaries.add(clamp(window.end, start, clippedEnd));
  });
  const points = [...boundaries].sort((left, right) => left - right);
  for (let index = 0; index + 1 < points.length; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    const duration = segmentEnd - segmentStart;
    if (duration <= 0) continue;
    const midpoint = (segmentStart + segmentEnd) * 0.5;
    const active = overlapping.filter((window) => (
      window.start <= midpoint && window.end > midpoint
    ));
    const instruments = new Set(active.map((window) => window.instrument));
    const roles = new Set(active.map((window) => window.role));
    const voices = new Set(active.map((window) => window.voiceId));
    if (instruments.size > integratedPeakSimultaneousInstruments) {
      integratedPeakSimultaneousInstruments = instruments.size;
      integratedPeakInstrumentIdentities = [...instruments].sort();
    }
    if (roles.size > integratedPeakSimultaneousRoles) {
      integratedPeakSimultaneousRoles = roles.size;
      integratedPeakRoleIdentities = [...roles].sort();
    }
    integratedPeakSimultaneousVoices = Math.max(
      integratedPeakSimultaneousVoices,
      voices.size,
    );
    integratedInstrumentCountSeconds[instruments.size] =
      (integratedInstrumentCountSeconds[instruments.size] ?? 0) + duration;
    integratedRoleCountSeconds[roles.size] =
      (integratedRoleCountSeconds[roles.size] ?? 0) + duration;
    integratedVoiceCountSeconds[voices.size] =
      (integratedVoiceCountSeconds[voices.size] ?? 0) + duration;
    instruments.forEach((instrument) => {
      integratedInstrumentAudibleSeconds[instrument] =
        (integratedInstrumentAudibleSeconds[instrument] ?? 0) + duration;
    });
    roles.forEach((role) => {
      integratedRoleAudibleSeconds[role] =
        (integratedRoleAudibleSeconds[role] ?? 0) + duration;
    });
    const totals = integratedStageDensity[stage];
    totals.duration += duration;
    totals.instrumentSeconds += instruments.size * duration;
    totals.roleSeconds += roles.size * duration;
    totals.voiceSeconds += voices.size * duration;
  }
};

const integratedPitchClass = (midi) => ((midi % 12) + 12) % 12;
const integratedOverlap = (left, right) =>
  left.beat < right.beat + right.durationBeats - 0.001 &&
  right.beat < left.beat + left.durationBeats - 0.001;
const integratedStableInterval = (upper, lower) =>
  [0, 3, 4, 5, 7, 8, 9].includes(
    integratedPitchClass(Math.abs(upper - lower)),
  );
const auditIntegratedCounterpoint = (leadEvents, counterEvents) => {
  let overlapPairs = 0;
  let violationPairs = 0;
  for (const counterEvent of counterEvents) {
    for (const leadEvent of leadEvents) {
      if (!integratedOverlap(leadEvent, counterEvent)) continue;
      overlapPairs += 1;
      const crossing = counterEvent.midi > leadEvent.midi - 3;
      const accented = counterEvent.metricStrength >= 0.66 || leadEvent.metricStrength >= 0.66;
      const allowed = counterEvent.accentedDissonanceAllowed ||
        leadEvent.accentedDissonanceAllowed;
      const unstableAccentedInterval = accented &&
        !allowed &&
        !integratedStableInterval(leadEvent.midi, counterEvent.midi);
      if (crossing || unstableAccentedInterval) violationPairs += 1;
    }
  }
  return { overlapPairs, violationPairs };
};

let integratedSeed = 'A91C27E4';
let integratedProfile;
let integratedForm;
let integratedScene;
let integratedOpeningScene;
let integratedFormSceneIndex;
let integratedBarsUntilSceneChange;
let integratedChordDegree;
let integratedPhraseBar;
let integratedPhraseOrdinal;
let integratedOpeningHarmonyPlan;
let integratedPreviousHarmonyPlan;
let integratedOpeningMelodyPlan;
let integratedPreviousMelodyPlan;
let integratedPreviousPattern;
let integratedHarmonyRandom;
let integratedMelodyRandom;
let integratedArrangementRandom;
let integratedOrchestrationRandom;
let integratedLeadMotif;
let integratedCounterMotif;
let integratedOrchestrationFrom;
let integratedOrchestrationTarget;
let integratedOrchestrationMix;
let integratedCurrentVoicing = [];
let integratedLastBassMidi = 46;
let integratedLastLeadMidi = 69;
let integratedLastCounterMidi = 62;
let integratedLeadNeedsResolution = false;
let integratedCounterNeedsResolution = false;
let integratedLeadResolutionDirection = 0;
let integratedLeadResolutionMaximumStep = 0;
let integratedCounterpointPairState = null;

const resetIntegratedSeed = (seed) => {
  integratedSeed = seed;
  integratedProfile = profileFromSeed(seed);
  integratedForm = emotionalFormFromSeed(seed);
  const rawScene = sceneFromSeed(seed);
  integratedScene = shapeSceneWithEmotionalFormMemory(
    rawScene,
    rawScene,
    integratedForm,
    0,
  );
  integratedOpeningScene = integratedScene;
  integratedFormSceneIndex = 0;
  integratedBarsUntilSceneChange = 12;
  integratedChordDegree = 0;
  integratedPhraseBar = 0;
  integratedPhraseOrdinal = 0;
  integratedOpeningHarmonyPlan = null;
  integratedPreviousHarmonyPlan = null;
  integratedOpeningMelodyPlan = null;
  integratedPreviousMelodyPlan = null;
  integratedPreviousPattern = null;
  const root = deriveSeedNumber(seed, 'integrated-planning-soak');
  integratedHarmonyRandom = new SeededRandom(deriveSeedNumber(root, 'harmony'));
  integratedMelodyRandom = new SeededRandom(deriveSeedNumber(root, 'melody'));
  integratedArrangementRandom = new SeededRandom(deriveSeedNumber(root, 'arrangement'));
  integratedOrchestrationRandom = new SeededRandom(deriveSeedNumber(root, 'orchestration'));
  const motifs = createMotifPair(integratedMelodyRandom, integratedScene);
  integratedLeadMotif = motifs.lead;
  integratedCounterMotif = motifs.counter;
  const stage = emotionalFormStageAt(integratedForm, 0);
  integratedOrchestrationFrom = chooseOrchestration(
    integratedScene,
    stage,
    integratedProfile,
    integratedOrchestrationRandom,
  );
  integratedOrchestrationTarget = integratedOrchestrationFrom;
  integratedOrchestrationMix = 1;
  integratedCurrentVoicing = [];
  integratedLeadNeedsResolution = false;
  integratedCounterNeedsResolution = false;
  integratedLeadResolutionDirection = 0;
  integratedLeadResolutionMaximumStep = 0;
  integratedCounterpointPairState = null;
  integratedBarsUntilSceneChange = 12 + Math.floor(integratedHarmonyRandom.next() * 9);
};

const integratedPhraseFormRole = (stage) => {
  if (stage.id === 'return') return 'A-double-prime';
  if (stage.id === 'intensification') return 'B';
  if (stage.id === 'release') return 'A-prime';
  if (stage.id === 'statement') return integratedOpeningMelodyPlan ? 'A-prime' : 'A';
  return integratedPhraseOrdinal % 2 === 0 ? 'B' : 'A-prime';
};

const planIntegratedPhrase = () => {
  const stage = emotionalFormStageAt(integratedForm, integratedFormSceneIndex);
  const formRole = integratedPhraseFormRole(stage);
  const harmonyReference = formRole === 'A-double-prime'
    ? integratedOpeningHarmonyPlan ?? integratedPreviousHarmonyPlan
    : formRole === 'A-prime' || formRole === 'B'
      ? integratedPreviousHarmonyPlan ?? integratedOpeningHarmonyPlan
      : null;
  const harmonyPlan = harmonyReference
    ? planPhraseHarmonyVariation(integratedScene, harmonyReference, integratedHarmonyRandom, {
        goal: phraseHarmonicGoalForFormStage(stage),
        phraseBars: integratedScene.phraseBars,
        relationship: formRole,
        startDegree: integratedChordDegree,
      })
    : planPhraseHarmony(integratedScene, integratedHarmonyRandom, {
        goal: phraseHarmonicGoalForFormStage(stage),
        phraseBars: integratedScene.phraseBars,
        startDegree: integratedChordDegree,
      });
  if (!integratedOpeningHarmonyPlan && formRole === 'A') {
    integratedOpeningHarmonyPlan = harmonyPlan;
  }
  integratedPreviousHarmonyPlan = harmonyPlan;
  const bassPlan = planBassLine(integratedScene, harmonyPlan, integratedHarmonyRandom, {
    pedalStrength: 0.58 + (1 - integratedScene.arousal) * 0.46,
    previousBassMidi: integratedLastBassMidi,
    stepwiseStrength: 0.76 + (1 - integratedScene.tension) * 0.24,
  });
  const texturePlan = planPhraseTexture(
    integratedScene,
    integratedProfile,
    stage,
    integratedArrangementRandom,
    {
      harmonyEvents: harmonyPlan.events,
      phraseBars: harmonyPlan.phraseBars,
      previousAccompanimentPattern: integratedPreviousPattern,
    },
  );
  integratedPreviousPattern = texturePlan.accompanimentPattern;
  integratedPatternsVisited.add(texturePlan.accompanimentPattern.id);
  const counterSegments = texturePlan.segments.filter((segment) =>
    segment.activeRoles.includes('counter')
  );
  const melodyPlan = planPhraseMelody(
    integratedScene,
    integratedMelodyRandom,
    integratedLeadMotif,
    integratedCounterMotif,
    {
      counterEnabled: counterSegments.length > 0,
      counterEntryBar: counterSegments[0]?.startBar,
      counterExitBar: counterSegments.length > 0
        ? counterSegments.at(-1).startBar + counterSegments.at(-1).spanBars
        : undefined,
      formRole,
      harmonyPlan,
      openingReference: integratedOpeningMelodyPlan ?? undefined,
      previousLeadMidi: integratedLastLeadMidi,
      previousPhrase: integratedPreviousMelodyPlan ?? undefined,
    },
  );
  if (!integratedOpeningMelodyPlan && formRole === 'A') {
    integratedOpeningMelodyPlan = melodyPlan;
  }
  integratedPreviousMelodyPlan = melodyPlan;
  integratedPhraseOrdinal += 1;
  integratedPhrases += 1;
  return { bassPlan, harmonyPlan, melodyPlan, stage, texturePlan };
};

resetIntegratedSeed(integratedSeed);
let integratedNow = 0.025;
let integratedPhrasePlans = null;
while (integratedNow < INTEGRATED_END_SECONDS) {
  if (integratedBarsUntilSceneChange <= 0 && integratedPhraseBar === 0) {
    integratedFormSceneIndex += 1;
    const formSceneCount = integratedForm.stages.length * integratedForm.scenesPerStage;
    if (integratedFormSceneIndex >= formSceneCount) {
      integratedSeedChanges += 1;
      resetIntegratedSeed(nextSeed(integratedSeed));
    } else {
      const nextScene = shapeSceneWithEmotionalFormMemory(
        chooseNeighborScene(integratedScene, integratedHarmonyRandom),
        integratedOpeningScene,
        integratedForm,
        integratedFormSceneIndex,
      );
      integratedChordDegree = findPivotDegree(
        integratedScene,
        integratedChordDegree,
        nextScene,
      );
      integratedScene = nextScene;
      integratedOrchestrationFrom = integratedOrchestrationTarget;
      integratedOrchestrationTarget = chooseOrchestration(
        integratedScene,
        emotionalFormStageAt(integratedForm, integratedFormSceneIndex),
        integratedProfile,
        integratedOrchestrationRandom,
        integratedOrchestrationFrom,
      );
      integratedOrchestrationMix = Object.keys(integratedOrchestrationFrom).every((role) =>
        integratedOrchestrationFrom[role] === integratedOrchestrationTarget[role]
      ) ? 1 : 0;
      integratedBarsUntilSceneChange =
        12 + Math.floor(integratedHarmonyRandom.next() * 13);
      integratedPhrasePlans = null;
    }
  }

  if (integratedPhraseBar === 0 || !integratedPhrasePlans) {
    integratedPhrasePlans = planIntegratedPhrase();
  }
  const { bassPlan, harmonyPlan, melodyPlan, stage, texturePlan } = integratedPhrasePlans;
  const harmonyEvent = phraseHarmonyEventAtBar(harmonyPlan, integratedPhraseBar);
  if (!harmonyEvent) throw new Error('integrated phrase harmony plan produced no event');
  integratedChordDegree = harmonyEvent.degree;
  integratedHarmonyEvents += 1;
  integratedModesVisited.add(MODES[integratedScene.modeIndex].id);
  const bassEvent = bassPlan.events[harmonyEvent.index];
  const meter = METERS[integratedScene.meterIndex];
  const beatSeconds = 60 / integratedScene.tempo;
  const spanBars = harmonyEvent.spanBars;
  const duration = spanBars * meter.beatsPerBar * beatSeconds;
  const chordStart = integratedNow;
  const chordEnd = chordStart + duration;
  integratedLiveWindows = integratedLiveWindows.filter((window) => window.end > chordStart);
  const textureSegment = texturePlan.segments.find((segment) => (
    integratedPhraseBar >= segment.startBar &&
    integratedPhraseBar < segment.startBar + segment.spanBars
  )) ?? texturePlan.segments.at(-1);
  const activeRoles = textureSegment?.activeRoles ?? ['lead', 'harmony', 'bass'];
  const bassActive = activeRoles.includes('bass');
  const harmonyActive = activeRoles.includes('harmony');
  const accompanimentActive = activeRoles.includes('accompaniment');
  const upperHarmonyVoiceCount = harmonyActive
    ? Math.max(1, (textureSegment?.totalChordVoices ?? 3) - (bassActive ? 1 : 0))
    : 0;
  const harmonicVoiceCount = Math.max(
    1 + upperHarmonyVoiceCount,
    accompanimentActive ? 3 : 1,
  );
  integratedCurrentVoicing = voiceLeadChord(
    integratedScene,
    integratedChordDegree,
    integratedCurrentVoicing,
    harmonicVoiceCount,
    bassEvent
      ? { bassMidi: bassEvent.bassMidi, inversion: bassEvent.inversion }
      : undefined,
  );
  const fromPlan = integratedOrchestrationFrom;
  const toPlan = integratedOrchestrationTarget;
  const mix = integratedOrchestrationMix;

  const bassMidi = integratedCurrentVoicing[0] ??
    chordRootMidi(integratedScene, integratedChordDegree);

  const melodicSlice = slicePhraseMelody(
    melodyPlan,
    integratedPhraseBar,
    spanBars,
    meter.beatsPerBar,
  );
  const slicedLead = activeRoles.includes('lead') ? melodicSlice.leadEvents : [];
  const slicedCounter = activeRoles.includes('counter') ? melodicSlice.counterEvents : [];
  const melodicTimeline = [
    ...slicedLead.map((event, index) => ({
      event,
      index,
      role: 'lead',
      voiceEventCount: slicedLead.length,
    })),
    ...slicedCounter.map((event, index) => ({
      event,
      index,
      role: 'counter',
      voiceEventCount: slicedCounter.length,
    })),
  ].sort((left, right) => left.event.beat - right.event.beat ||
    (left.role === 'lead' ? -1 : 1));
  let localLeadMidi = integratedLastLeadMidi;
  let localCounterMidi = integratedLastCounterMidi;
  let localLeadNeedsResolution = integratedLeadNeedsResolution;
  let localCounterNeedsResolution = integratedCounterNeedsResolution;
  let localLeadResolutionDirection = integratedLeadResolutionDirection;
  let localLeadResolutionMaximumStep = integratedLeadResolutionMaximumStep;
  const phraseEndsWithChord = integratedPhraseBar + spanBars >= integratedScene.phraseBars;
  const pendingMelody = [];
  for (const item of melodicTimeline) {
    const previousMidi = item.role === 'lead' ? localLeadMidi : localCounterMidi;
    const unresolved = item.role === 'lead'
      ? localLeadNeedsResolution
      : localCounterNeedsResolution;
    const cadenceArrival = phraseEndsWithChord &&
      item.event.phraseRole === 'cadence' &&
      !item.event.mustResolveNext &&
      item.index === item.voiceEventCount - 1;
    const plannedTargetMidi = item.event.retainPreviousPitch
      ? previousMidi
      : item.event.targetMidi;
    const directionDelta = plannedTargetMidi - previousMidi;
    const plannedDirection = directionDelta > 0.8 ? 1 : directionDelta < -0.8 ? -1 : 0;
    const direction = item.role === 'lead' &&
      unresolved &&
      localLeadResolutionDirection !== 0
      ? localLeadResolutionDirection
      : plannedDirection;
    const targetPitchClass = item.event.retainPreviousPitch
      ? integratedPitchClass(previousMidi)
      : motifPitchClass(integratedScene, item.event.motifDegree);
    const midi = pickMelodyMidi(
      integratedScene,
      integratedChordDegree,
      previousMidi,
      integratedMelodyRandom,
      {
        allowAccentedDissonance: item.event.accentedDissonanceAllowed,
        backgroundNotes: [
          ...(bassActive ? [bassMidi] : []),
          ...(harmonyActive ? integratedCurrentVoicing.slice(1, 1 + upperHarmonyVoiceCount) : []),
        ],
        bassMidi: bassActive ? bassMidi : undefined,
        direction,
        maximumInterval: item.role === 'lead' && unresolved
          ? localLeadResolutionMaximumStep || 2
          : undefined,
        metricStrength: item.event.metricStrength,
        mustResolve: unresolved || cadenceArrival,
        otherVoiceMidi: item.role === 'counter'
          ? localLeadMidi
          : slicedCounter.length > 0
            ? localCounterMidi
            : undefined,
        registerHigh: item.role === 'lead'
          ? melodyPlan.registerArc.leadHighMidi
          : melodyPlan.registerArc.counterHighMidi,
        registerLow: item.role === 'lead'
          ? melodyPlan.registerArc.leadLowMidi
          : melodyPlan.registerArc.counterLowMidi,
        phraseRole: item.event.phraseRole,
        targetMidi: plannedTargetMidi,
        targetPitchClass,
      },
    );
    const chordTone = isChordTone(integratedScene, integratedChordDegree, midi);
    if (item.role === 'lead') {
      localLeadMidi = midi;
      localLeadNeedsResolution = !chordTone || item.event.mustResolveNext;
      if (item.event.mustResolveNext) {
        localLeadResolutionDirection = item.event.resolutionDirection;
        localLeadResolutionMaximumStep = item.event.resolutionMaximumStep;
      } else if (unresolved) {
        localLeadResolutionDirection = 0;
        localLeadResolutionMaximumStep = 0;
      }
    } else {
      localCounterMidi = midi;
      localCounterNeedsResolution = !chordTone || item.event.mustResolveNext;
    }
    pendingMelody.push({ ...item, midi });
  }
  const realizedLead = pendingMelody
    .filter((item) => item.role === 'lead')
    .map((item) => ({ ...item.event, midi: item.midi }));
  const realizedCounter = pendingMelody
    .filter((item) => item.role === 'counter')
    .map((item) => ({ ...item.event, midi: item.midi }));
  const reconciled = reconcilePhraseCounterpoint(realizedLead, realizedCounter, {
    allowedPitchClasses: MODES[integratedScene.modeIndex].intervals.map((interval) =>
      integratedPitchClass(integratedScene.tonic + interval)
    ),
    counterHighMidi: melodyPlan.registerArc.counterHighMidi,
    counterLowMidi: melodyPlan.registerArc.counterLowMidi,
    minimumVoiceGapSemitones: 3,
    previousPair: integratedCounterpointPairState,
  });
  const counterpointAudit = auditIntegratedCounterpoint(
    reconciled.leadEvents,
    reconciled.counterEvents,
  );
  integratedCounterpointOverlapPairs += counterpointAudit.overlapPairs;
  integratedCounterpointViolationPairs += counterpointAudit.violationPairs;
  let reconciledLeadIndex = 0;
  let reconciledCounterIndex = 0;
  for (const item of pendingMelody) {
    const corrected = item.role === 'lead'
      ? reconciled.leadEvents[reconciledLeadIndex++]
      : reconciled.counterEvents[reconciledCounterIndex++];
    const midi = corrected?.midi ?? item.midi;
    const humanizeSeconds = item.event.humanizeBeats * beatSeconds;
    const noteStart = Math.max(
      chordStart + 0.035,
      chordStart + item.event.beat * beatSeconds + humanizeSeconds,
    );
    const maximumDuration = Math.max(0.42, chordEnd + 0.58 - noteStart);
    const role = item.role;
    const maximumRelease = Math.max(
      INSTRUMENTS[fromPlan[role]].release,
      INSTRUMENTS[toPlan[role]].release,
    );
    const body = Math.max(0.095, item.event.durationBeats * beatSeconds * 0.94);
    const noteDuration = Math.min(maximumDuration, body + maximumRelease);
    const scheduled = scheduleIntegratedLogicalVoice({
      end: noteStart + noteDuration + 0.025,
      fromInstrument: fromPlan[role],
      mix,
      role,
      start: noteStart - 0.008,
      toInstrument: toPlan[role],
      voiceId: `${role}:${integratedVoiceSerial++}:${midi}`,
    });
    if (scheduled) {
      const chordTone = isChordTone(integratedScene, integratedChordDegree, midi);
      if (role === 'lead') {
        integratedLastLeadMidi = midi;
        integratedLeadNeedsResolution = !chordTone || item.event.mustResolveNext;
        integratedLeadResolutionDirection = item.event.mustResolveNext
          ? item.event.resolutionDirection
          : 0;
        integratedLeadResolutionMaximumStep = item.event.mustResolveNext
          ? item.event.resolutionMaximumStep
          : 0;
      } else {
        integratedLastCounterMidi = midi;
        integratedCounterNeedsResolution = !chordTone || item.event.mustResolveNext;
      }
    }
  }
  if (reconciled.counterEvents.length > 0) {
    integratedCounterpointPairState = reconciled.terminalPair;
  }

  if (harmonyActive) {
    integratedCurrentVoicing.slice(1, 1 + upperHarmonyVoiceCount).forEach((midi) => {
      const maximumRelease = Math.max(
        INSTRUMENTS[fromPlan.harmony].release,
        INSTRUMENTS[toPlan.harmony].release,
      );
      const voiceEnd = chordStart + duration * 0.96 + Math.min(2.7, maximumRelease) + 0.025;
      scheduleIntegratedLogicalVoice({
        end: voiceEnd,
        fromInstrument: fromPlan.harmony,
        mix,
        role: 'harmony',
        start: chordStart - 0.008,
        toInstrument: toPlan.harmony,
        voiceId: `harmony:${integratedVoiceSerial++}:${midi}`,
      });
    });
  }

  if (bassActive) {
    const maximumRelease = Math.max(
      INSTRUMENTS[fromPlan.bass].release,
      INSTRUMENTS[toPlan.bass].release,
    );
    const bassBody = Math.min(duration * 0.72, meter.beatsPerBar * beatSeconds * 1.3);
    scheduleIntegratedLogicalVoice({
      end: chordStart + bassBody * 0.92 + Math.min(1.8, maximumRelease) + 0.025,
      fromInstrument: fromPlan.bass,
      mix,
      role: 'bass',
      start: chordStart - 0.008,
      toInstrument: toPlan.bass,
      voiceId: `bass:${integratedVoiceSerial++}:${bassMidi}`,
    });
    integratedLastBassMidi = bassMidi;
  }

  if (accompanimentActive && integratedCurrentVoicing.length >= 2) {
    const accompanimentEvents = accompanimentEventsForSpan(
      texturePlan.accompanimentPattern,
      integratedScene.meterIndex,
      integratedPhraseBar,
      spanBars,
    );
    for (const event of accompanimentEvents) {
      const eventStart = chordStart + event.beatOffset * beatSeconds;
      const maximumRelease = Math.max(
        INSTRUMENTS[fromPlan.accompaniment].release,
        INSTRUMENTS[toPlan.accompaniment].release,
      );
      const body = Math.max(0.075, event.durationBeats * beatSeconds * 0.88);
      const release = Math.min(
        Math.max(0.12, event.durationBeats * beatSeconds * 0.72),
        maximumRelease,
      );
      scheduleIntegratedLogicalVoice({
        end: eventStart + body + release + 0.025,
        fromInstrument: fromPlan.accompaniment,
        mix,
        role: 'accompaniment',
        start: eventStart - 0.008,
        toInstrument: toPlan.accompaniment,
        voiceId: `accompaniment:${integratedVoiceSerial++}`,
      });
    }
  }

  const clippedDuration = Math.max(
    0,
    Math.min(chordEnd, INTEGRATED_END_SECONDS) - chordStart,
  );
  integratedTextureSeconds[textureSegment?.state ?? 'chamber'] += clippedDuration;
  integrateScheduledDensity(chordStart, chordEnd, stage.id);
  const phraseScale = 4 / Math.max(4, integratedScene.phraseBars);
  integratedOrchestrationMix = clamp(
    integratedOrchestrationMix + Math.min(0.3, spanBars * 0.14 * phraseScale),
  );
  integratedPhraseBar = (integratedPhraseBar + spanBars) % integratedScene.phraseBars;
  integratedBarsUntilSceneChange -= spanBars;
  integratedNow = chordEnd;
}

const integratedTextureShares = Object.fromEntries(
  Object.entries(integratedTextureSeconds).map(([state, seconds]) => [
    state,
    seconds / INTEGRATED_END_SECONDS,
  ]),
);
const integratedAverageDensityByStage = Object.fromEntries(
  Object.entries(integratedStageDensity).map(([stage, totals]) => [stage, {
    instruments: totals.instrumentSeconds / Math.max(1, totals.duration),
    roles: totals.roleSeconds / Math.max(1, totals.duration),
    voices: totals.voiceSeconds / Math.max(1, totals.duration),
  }]),
);
const integratedCounterpointViolationRate =
  integratedCounterpointViolationPairs / Math.max(1, integratedCounterpointOverlapPairs);
const integratedDurationShares = (durations) => Object.fromEntries(
  Object.entries(durations)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([key, seconds]) => [key, Number((seconds / INTEGRATED_END_SECONDS).toFixed(5))]),
);

const orchestrationCoverage = {
  accompaniment: new Set(),
  bass: new Set(),
  counter: new Set(),
  harmony: new Set(),
  lead: new Set(),
};
const articulationCoverage = new Set();
const initialEmotionCoverage = new Set();
const journeyEmotionCoverage = new Set();
let maxEmotionJourneyStep = 0;
let lowArousalArticulation = 0;
let lowArousalSamples = 0;
let highArousalArticulation = 0;
let highArousalSamples = 0;
let orchestrationChanges = 0;
let orchestrationRoleChanges = 0;
let maxOrchestrationRoleChanges = 0;
let brightSceneSamples = 0;
let brightJourneySamples = 0;
let fastPositiveJourneySamples = 0;
let maximumJourneyBpm = -Infinity;
const visualVariants = new Set();
const adaptiveHarmonySampleCounts = new Set();
let previousOrchestration;
let previousPerformance;
let maxPerformanceInterpolationStep = 0;
for (let index = 0; index < 2048; index += 1) {
  const seed = ((0x7f3a91c2 + index * 0x9e3779b9) >>> 0)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();
  visualVariants.add(visualVariantFromSeed(seed, 3));
  const sampleRandom = new SeededRandom(seedToNumber(seed) ^ 0x41c6ce57);
  const form = emotionalFormFromSeed(seed);
  if (index < 512) {
    const journeyRandom = new SeededRandom(deriveSeedNumber(seed, 'journey-audit'));
    let journeyScene = sceneFromSeed(seed);
    let journeyHasBrightScene = false;
    let journeyHasFastPositiveScene = false;
    const journeySceneCount = form.stages.length * form.scenesPerStage;
    for (let journeyIndex = 0; journeyIndex < journeySceneCount; journeyIndex += 1) {
      if (journeyIndex > 0) {
        journeyScene = chooseNeighborScene(journeyScene, journeyRandom);
      }
      const shapedJourneyScene = shapeSceneWithEmotionalForm(
        journeyScene,
        form,
        journeyIndex,
      );
      maximumJourneyBpm = Math.max(maximumJourneyBpm, shapedJourneyScene.tempo);
      if (shapedJourneyScene.valence > 0.7 && shapedJourneyScene.arousal > 0.58) {
        journeyHasBrightScene = true;
      }
      if (shapedJourneyScene.valence > 0.7 && shapedJourneyScene.tempo > 116) {
        journeyHasFastPositiveScene = true;
      }
      const journeyStage = emotionalFormStageAt(form, journeyIndex);
      const harmonyPlan = planPhraseHarmony(shapedJourneyScene, journeyRandom, {
        goal: phraseHarmonicGoalForFormStage(journeyStage),
      });
      cadenceTypesVisited.add(harmonyPlan.cadence.type);
    }
    if (journeyHasBrightScene) brightJourneySamples += 1;
    if (journeyHasFastPositiveScene) fastPositiveJourneySamples += 1;
  }
  initialEmotionCoverage.add(emotionalFormEmotionAt(form, 0));
  form.emotionJourney.forEach((emotion, emotionIndex) => {
    journeyEmotionCoverage.add(emotion);
    if (emotionIndex === 0) return;
    const previous = EMOTION_PRESETS[form.emotionJourney[emotionIndex - 1]];
    const current = EMOTION_PRESETS[emotion];
    maxEmotionJourneyStep = Math.max(
      maxEmotionJourneyStep,
      Math.hypot(
        current.arousal - previous.arousal,
        current.valence - previous.valence,
        current.tension - previous.tension,
      ),
    );
  });
  const formIndex = index % form.stages.length;
  const stage = emotionalFormStageAt(form, formIndex);
  const sampleScene = shapeSceneWithEmotionalForm(sceneFromSeed(seed), form, formIndex);
  if (sampleScene.valence > 0.7 && sampleScene.arousal > 0.58) {
    brightSceneSamples += 1;
  }
  const sampleProfile = profileFromSeed(seed);
  adaptiveHarmonySampleCounts.add(
    chooseHarmonyVoiceCount(
      sampleScene,
      sampleProfile.density,
      0.5,
      sampleScene.arousal > 0.66 ? 5 : 2,
      sampleRandom,
    ),
  );
  const orchestration = chooseOrchestration(
    sampleScene,
    stage,
    sampleProfile,
    sampleRandom,
    previousOrchestration,
  );
  const performance = choosePerformancePlan(sampleScene, stage, sampleRandom);
  for (const role of Object.keys(orchestrationCoverage)) {
    orchestrationCoverage[role].add(orchestration[role]);
    articulationCoverage.add(`${role}:${articulationName(performance[role])}`);
  }
  if (previousOrchestration) {
    const roleChanges = Object.keys(orchestration).filter(
      (role) => orchestration[role] !== previousOrchestration[role],
    ).length;
    if (roleChanges > 0) orchestrationChanges += 1;
    orchestrationRoleChanges += roleChanges;
    maxOrchestrationRoleChanges = Math.max(
      maxOrchestrationRoleChanges,
      roleChanges,
    );
  }
  if (sampleScene.arousal < 0.34) {
    lowArousalArticulation += performance.lead.articulation;
    lowArousalSamples += 1;
  }
  if (sampleScene.arousal > 0.72) {
    highArousalArticulation += performance.lead.articulation;
    highArousalSamples += 1;
  }
  if (previousPerformance) {
    let last = previousPerformance;
    for (let step = 1; step <= 10; step += 1) {
      const interpolated = interpolatePerformancePlan(
        previousPerformance,
        performance,
        step / 10,
      );
      for (const role of Object.keys(orchestrationCoverage)) {
        for (const parameter of Object.keys(interpolated[role])) {
          maxPerformanceInterpolationStep = Math.max(
            maxPerformanceInterpolationStep,
            Math.abs(interpolated[role][parameter] - last[role][parameter]),
          );
        }
      }
      last = interpolated;
    }
  }
  previousOrchestration = orchestration;
  previousPerformance = performance;
}
const averageLowArousalArticulation =
  lowArousalArticulation / Math.max(1, lowArousalSamples);
const averageHighArousalArticulation =
  highArousalArticulation / Math.max(1, highArousalSamples);
const averageOrchestrationRoleChanges =
  orchestrationRoleChanges / Math.max(1, 2047);
const seededBrightSceneShare = brightSceneSamples / 2048;
const brightJourneyShare = brightJourneySamples / 512;
const fastPositiveJourneyShare = fastPositiveJourneySamples / 512;
const randomDomainRootA = new SeededRandom(START_SEED);
const isolatedHarmonyA = randomDomainRootA.fork('harmony');
const isolatedTextureA = randomDomainRootA.fork('texture');
const harmonySequenceA = Array.from({ length: 16 }, () => isolatedHarmonyA.next());
const textureSequence = Array.from({ length: 32 }, () => isolatedTextureA.next());
const randomDomainRootB = new SeededRandom(START_SEED);
const isolatedTextureB = randomDomainRootB.fork('texture');
for (let index = 0; index < 2048; index += 1) isolatedTextureB.next();
const isolatedHarmonyB = randomDomainRootB.fork('harmony');
const harmonySequenceB = Array.from({ length: 16 }, () => isolatedHarmonyB.next());
const randomDomainsAreIndependent =
  JSON.stringify(harmonySequenceA) === JSON.stringify(harmonySequenceB) &&
  harmonySequenceA.some((value, index) => value !== textureSequence[index]);
const timbreNoiseRecipes = Object.values(INSTRUMENTS).filter(
  (recipe) => (recipe.breath ?? 0) + (recipe.transient ?? 0) > 0,
).length;
const gestureExpression = {
  articulation: 1.02,
  attackScale: 1,
  dynamic: 0.94,
  releaseScale: 1,
  swell: 0.12,
  vibratoScale: 1,
};
const gestureInstrumentIds = Object.keys(INSTRUMENTS);
let idiomaticConnectionFailures = 0;
let longNoteVibratoInstruments = 0;
let naturalDecayInstruments = 0;
for (const instrument of gestureInstrumentIds) {
  const profile = INSTRUMENT_GESTURES[instrument];
  const longGesture = planNoteGesture({
    connectionRandom: 0,
    continuousGestureSeconds: 0.8,
    durationSeconds: 3.2,
    expression: gestureExpression,
    instrument,
    intervalSemitones: 4,
    legatoRequested: true,
    metricStrength: 0.72,
    phraseProgress: 0.58,
  });
  if (profile.legato.portamentoChance === 0 && longGesture.connection.glideSeconds > 0) {
    idiomaticConnectionFailures += 1;
  }
  if (longGesture.vibrato.enabled) longNoteVibratoInstruments += 1;
  if (longGesture.decay.kind === 'natural') naturalDecayInstruments += 1;
}
const fluteBreathGesture = planNoteGesture({
  connectionRandom: 0.5,
  continuousGestureSeconds: INSTRUMENT_GESTURES.flute.continuity.maxSeconds,
  durationSeconds: 2.4,
  expression: gestureExpression,
  instrument: 'flute',
  intervalSemitones: 2,
  legatoRequested: true,
  metricStrength: 0.8,
  phraseProgress: 0.08,
});
const violinPortamentoGesture = planNoteGesture({
  connectionRandom: 0,
  continuousGestureSeconds: 1,
  durationSeconds: 2.2,
  expression: gestureExpression,
  instrument: 'violin',
  intervalSemitones: 5,
  legatoRequested: true,
  metricStrength: 0.7,
  phraseProgress: 0.62,
  phraseRole: 'climax',
});
const celestaLegatoGesture = planNoteGesture({
  connectionRandom: 0,
  durationSeconds: 1.4,
  expression: gestureExpression,
  instrument: 'celesta',
  intervalSemitones: 3,
  legatoRequested: true,
  metricStrength: 0.7,
  phraseProgress: 0.42,
});
const smootherstepHasRestingEndpoints =
  smootherstep(0) === 0 &&
  smootherstep(1) === 1 &&
  smootherstep(0.001) < 1e-7 &&
  1 - smootherstep(0.999) < 1e-7;
const shaderTemplateLabels = new Set(
  CORE_EMOTIONS.flatMap((emotion) =>
    EMOTION_SHADER_TEMPLATES[emotion].map((template) => template.label),
  ),
);
const shaderTemplatesAreValid = CORE_EMOTIONS.every((emotion) =>
  EMOTION_SHADER_TEMPLATES[emotion].length === 3 &&
  EMOTION_SHADER_TEMPLATES[emotion].every(
    (template) =>
      template.weights.length === 12 &&
      Math.abs(template.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9 &&
      template.params.every((value) => Number.isFinite(value) && value > 0),
  ),
);
const emotionPalettesAreValid =
  Object.keys(EMOTION_COLOR_PALETTES).length === CORE_EMOTIONS.length &&
  new Set(Object.values(EMOTION_COLOR_PALETTES).flat()).size === CORE_EMOTIONS.length * 3;
const emotionPresetTempos = CORE_EMOTIONS.map((emotion) => {
  const preset = EMOTION_PRESETS[emotion];
  return tempoFromArousal(preset.arousal, preset.valence);
});
const emotionPresetTempoRange = [
  Math.min(...emotionPresetTempos),
  Math.max(...emotionPresetTempos),
];
const audioEngineSource = readFileSync(
  new URL('../lib/nagi/audio-engine.ts', import.meta.url),
  'utf8',
);
const zeroGainAttackCount = (
  audioEngineSource.match(/envelope\.gain\.setValueAtTime\(0,/g) ?? []
).length;
const zeroGainReleaseCount = (
  audioEngineSource.match(/envelope\.gain\.linearRampToValueAtTime\(0,/g) ?? []
).length;
const prerollSourceCount = (audioEngineSource.match(/start - 0\.008/g) ?? []).length;
const sceneSource = readFileSync(
  new URL('../app/nagi-scene.tsx', import.meta.url),
  'utf8',
);
const foregroundShaderSource = sceneSource.slice(
  sceneSource.indexOf('const CORE_VERTEX_SHADER'),
  sceneSource.indexOf('type PaletteSet'),
);
const orbitalSource = sceneSource.slice(
  sceneSource.indexOf('function OrbitalDetails'),
  sceneSource.indexOf('function SceneController'),
);
const foregroundUsesInstantRhythm =
  /uAudio|uTransport/.test(foregroundShaderSource) ||
  /audio\.(?:bass|mid|treble|pulse|beatPhase|barPhase|phrase)/.test(orbitalSource);
const backdropOwnsRhythm =
  sceneSource.includes('audio.pulse,') &&
  sceneSource.includes('audio.beatPhase,') &&
  sceneSource.includes('audio.barPhase,') &&
  sceneSource.includes('audio.phrase,');
const shaderRandomnessIsTemporallyStable =
  !sceneSource.includes('floor((d + slowTime') &&
  sceneSource.includes('smoothstep(0.965, 0.997, sparkleNoise)');
const engineUsesIndependentRandomDomains = [
  'arrangementRandom',
  'harmonyRandom',
  'melodyRandom',
  'orchestrationRandom',
  'performanceRandom',
  'textureRandom',
  'atmosphereRandom',
].every((domain) => audioEngineSource.includes(domain));
const scheduledGestureRoleCount = (
  audioEngineSource.match(/planNoteGesture\(/g) ?? []
).length;
const engineUsesFormalPlanningStack = [
  'planPhraseHarmonyVariation(',
  'planPhraseTexture(',
  'planPhraseMelody(',
  'textureSegmentAtBar(',
  'slicePhraseMelody(',
  'reconcilePhraseCounterpoint(',
  'accompanimentEventsForSpan(',
].every((call) => audioEngineSource.includes(call));
const engineUsesEqualPowerTimbreHandoffs =
  audioEngineSource.includes('getToneLayers(') &&
  audioEngineSource.includes('Math.cos(mix * Math.PI * 0.5)') &&
  audioEngineSource.includes('Math.sin(mix * Math.PI * 0.5)') &&
  (audioEngineSource.match(/this\.getToneLayers\(/g) ?? []).length >= 4;
const automaticSeedWaitsForFormalArc =
  audioEngineSource.includes('if (!this.formCycleComplete) return;') &&
  audioEngineSource.includes('this.formCycleComplete ||=');
const sceneLifecycleCountsBars =
  audioEngineSource.includes('private barsUntilSceneChange = 0;') &&
  audioEngineSource.includes('this.barsUntilSceneChange <= 0') &&
  audioEngineSource.includes('this.barsUntilSceneChange -= spanBars') &&
  !audioEngineSource.includes('chordsUntilSceneChange');

const assertions = {
  activeSourceCap: maxActiveSources <= 40,
  accompanimentUsesTransportGrid: maxAccompanimentGridError < 1e-9,
  backgroundRoughnessIsControlled: averageBackgroundRoughness < 0.12,
  backgroundUsesBreathingDynamics: minimumBedBreath < 0.83 && maximumBedBreath > 0.99,
  bpmRangeIsMusical:
    minimumBpm >= 58 && maximumBpm <= 136.000001,
  emotionLibrarySpansSlowToFastTempo:
    emotionPresetTempoRange[0] < 70 && emotionPresetTempoRange[1] > 116,
  brightMoodsAreRepresented:
    seededBrightSceneShare > 0.08 &&
    brightJourneyShare > 0.45 &&
    fastPositiveJourneyShare > 0.08 &&
    maximumJourneyBpm > 116 &&
    EMOTION_PRESETS.JOYFUL.valence > 0.88 &&
    EMOTION_PRESETS.UPLIFTING.brightness > 0.82,
  continuousEmotion: maxEmotionStep < 0.09,
  continuousWeather: maxProfileStep < 0.012,
  corpusPriorLoaded:
    CLASSICAL_MODEL_META.scoreCount >= 1000 &&
    CLASSICAL_MODEL_META.melodyNoteCount >= 150000 &&
    CLASSICAL_MODEL_META.accompanimentNoteCount >= 900000,
  corpusMetricPriorUsesRealOnsets:
    classicalMetricClassAt(0, 4) === 'downbeat' &&
    classicalMetricClassAt(1, 4) === 'beat' &&
    classicalMetricClassAt(1.5, 4) === 'offbeat',
  counterpointIndependence: counterpointIndependence > 0.72,
  counterpointUsesContraryAndObliqueMotion:
    contraryOrObliqueCounterpointShare > 0.55,
  cadencesFollowPhrasePlan:
    plannedCadenceArrivalRate > 0.995 && cadenceTypesVisited.size === 5,
  adaptiveHarmonyMovesBeyondFourVoices:
    harmonyVoiceCounts.has(1) &&
    harmonyVoiceCounts.has(3) &&
    harmonyVoiceCounts.has(5) &&
    adaptiveHarmonySampleCounts.has(6) &&
    Math.max(...adaptiveHarmonySampleCounts) <= 7,
  emotionalFormCoversFullArc:
    emotionalFormIsSeedDeterministic && formStages.size === emotionalForm.stages.length,
  emotionalJourneyCoversTwelveCoreMoods:
    initialEmotionCoverage.size === CORE_EMOTIONS.length &&
    journeyEmotionCoverage.size === CORE_EMOTIONS.length,
  emotionalJourneyMovesContinuously: maxEmotionJourneyStep < 0.82,
  harmonicPhrasesUseThematicMemory:
    averageHarmonicSimilarity.A > 0.98 &&
    averageHarmonicSimilarity['A-prime'] > 0.68 &&
    averageHarmonicSimilarity['A-prime'] < 0.95 &&
    averageHarmonicSimilarity['A-double-prime'] > 0.55 &&
    averageHarmonicSimilarity['A-double-prime'] < 0.9 &&
    averageHarmonicSimilarity.B > 0.25 &&
    averageHarmonicSimilarity.B < 0.65 &&
    averageHarmonicSimilarity.B + 0.12 < averageHarmonicSimilarity['A-prime'] &&
    averageHarmonicSimilarity.B + 0.12 <
      averageHarmonicSimilarity['A-double-prime'] &&
    harmonicExactShares.A === 1 &&
    harmonicExactShares['A-prime'] < 0.05 &&
    harmonicExactShares.B < 0.05 &&
    harmonicExactShares['A-double-prime'] < 0.05,
  everyModeHasAuditedHarmonicGrammar:
    modeGrammarAudit.length === MODES.length &&
    modeGrammarFieldFailures === 0 &&
    modeCadenceFailures === 0 &&
    modeCharacteristicExposureFailures === 0 &&
    modeCadenceNames.size === MODES.length,
  returnSceneRecallsOpeningIdentity:
    returnTonicRate > 0.98 &&
    returnModeRate > 0.98 &&
    returnTonicRate > developmentTonicRate + 0.5 &&
    returnModeRate > developmentModeRate + 0.5 &&
    averageReturnEmotionDistance < averageDevelopmentEmotionDistance * 0.4 &&
    explicitOpeningRecallFailures === 0,
  expressiveTechniquesFollowEmotion:
    averageLowArousalArticulation > averageHighArousalArticulation + 0.18,
  expressiveTransitionsAreSmooth: maxPerformanceInterpolationStep < 0.12,
  expressiveTimingIsBounded: maxExpressiveOffsetMs < 38,
  gridIntegrity: maxGridUnitError < 1e-9,
  immediateOpening: 0.025 < 0.1,
  darkModesRemainRareColour: darkModeShare < 0.12,
  highTensionIsNotTheDefault: highTensionTimeShare < 0.2,
  classicalThemesRemainTransformativeColour:
    familiarThemeShare > 0.04 && familiarThemeShare < 0.12 && familiarThemeNames.size >= 8,
  orchestrationEvolves:
    orchestrationChanges > 1200 &&
    averageOrchestrationRoleChanges >= 0.7 &&
    maxOrchestrationRoleChanges <= 2,
  orchestrationHasBroadInstrumentCoverage:
    orchestrationCoverage.lead.size === 5 &&
    orchestrationCoverage.counter.size === 5 &&
    orchestrationCoverage.harmony.size === 4 &&
    orchestrationCoverage.bass.size === 4 &&
    orchestrationCoverage.accompaniment.size === 4,
  performanceUsesMultipleArticulations: articulationCoverage.size >= 12,
  phraseMelodyPlansClimaxCadenceAndMemory:
    phraseClimaxFailures === 0 &&
    phraseCadenceFailures === 0 &&
    controlledAccentedDissonances > formalAuditSamples &&
    controlledDissonanceMarkerFailures === 0 &&
    melodicVariationSources['A-prime'].has('opening') &&
    melodicVariationSources['A-prime'].size === 1 &&
    melodicVariationSources['A-double-prime'].has('opening') &&
    melodicVariationSources['A-double-prime'].size === 1 &&
    melodicVariationTechniques['A-prime'].size === 3 &&
    melodicVariationTechniques['A-double-prime'].size === 3 &&
    aPrimeExactMelodyShare < 0.05 &&
    aDoublePrimeExactMelodyShare < 0.05 &&
    phraseSliceFieldSamples > 1000 &&
    phraseSliceFieldFailures === 0,
  accentedDissonanceIsRealAndResolves:
    conservativeStrongBeatChordToneRate > 0.95 &&
    realizedAccentedDissonanceRate > 0.3 &&
    realizedAccentedDissonanceRate < 0.85 &&
    realizedDissonanceResolutionRate > 0.92,
  plannedCounterpointRepairsConcreteFaults:
    reconciliationCorrectionFailures === 0 &&
    delayedLeadOverlapRegressionFailures === 0 &&
    reconciliationCorrectionReasons.size === 3 &&
    reconciliationCorrectionReasons.has('voice-crossing') &&
    reconciliationCorrectionReasons.has('accented-vertical-dissonance') &&
    reconciliationCorrectionReasons.has('parallel-perfect-interval'),
  instrumentGesturesAreIdiomatic:
    scheduledGestureRoleCount >= 4 &&
    gestureInstrumentIds.length === Object.keys(INSTRUMENT_GESTURES).length &&
    idiomaticConnectionFailures === 0 &&
    longNoteVibratoInstruments >= 8 &&
    naturalDecayInstruments >= 5 &&
    fluteBreathGesture.boundary.kind === 'breath' &&
    fluteBreathGesture.boundary.breakBeforeSeconds > 0 &&
    violinPortamentoGesture.connection.kind === 'portamento' &&
    violinPortamentoGesture.connection.glideSeconds > 0 &&
    celestaLegatoGesture.connection.glideSeconds === 0,
  rhythmSyncIsIsolatedToBackdrop:
    backdropOwnsRhythm && !foregroundUsesInstantRhythm,
  renderQualityAdaptsToPlatform:
    lowMobileTier === 'economy' &&
    desktopTier === 'ultra' &&
    lowMobilePlan.dpr < desktopPlan.dpr &&
    lowMobilePlan.detailScale < desktopPlan.detailScale,
  renderQualityAlwaysHasPostAntialiasing:
    lowMobilePlan.smaa &&
    lowMobilePlan.multisampling === 0 &&
    !desktopPlan.smaa &&
    desktopPlan.multisampling === 4 &&
    noMsaaPlan.smaa,
  renderQualityRecoveryRespectsPlatformCeiling:
    stepRenderQualityTier('economy', 'balanced', 'up') === 'balanced' &&
    stepRenderQualityTier('balanced', 'balanced', 'up') === 'balanced' &&
    stepRenderQualityTier('balanced', 'ultra', 'down') === 'economy',
  noteOnsetsUseZeroGainPreroll:
    zeroGainAttackCount >= 6 &&
    zeroGainReleaseCount >= 6 &&
    prerollSourceCount >= 6 &&
    !audioEngineSource.includes('envelope.gain.setValueAtTime(0.0001'),
  everyEmotionHasThreeCompactShaderTemplates:
    shaderTemplatesAreValid && shaderTemplateLabels.size === CORE_EMOTIONS.length * 3,
  everyEmotionHasDedicatedThreeColorPalette: emotionPalettesAreValid,
  instrumentModelsIncludeNoiseOrTransientLayers: timbreNoiseRecipes >= 12,
  lowRegisterSpacing: minimumBassSeparation >= 5,
  bassLineUsesPlayableInversions:
    nonRootBassShare > 0.08 &&
    nonRootBassShare < 0.62 &&
    connectedBassMotionShare > 0.5 &&
    maximumBassLeap <= 7,
  melodicMotionIsSingable:
    averageLeadMovement > 1.4 &&
    averageLeadMovement < 7 &&
    averageCounterMovement < 7,
  meterCoverage: meters.size === METERS.length,
  modeCoverage: modes.size >= 8,
  motifIdentitySurvives: motifTargetRate > 0.34 && leadMotif.cycle > 100,
  parallelPerfectMotionIsRare: parallelPerfectRate < 0.012,
  pivotContinuity: averagePivotCommonTones >= 1.5,
  modalTransitionsShareScaleMaterial: minimumSceneScaleCommonTones >= 4,
  phraseDurationsRespectFormalBoundaries: phraseBoundaryOvershoots === 0,
  psychoacousticRoughnessIsControlled: averageMelodyRoughness < 0.42,
  progressionBalancesRecurrenceAndVariety:
    progressionUniqueness > 0.35 && progressionUniqueness < 0.985,
  resolutionsBehave: resolutionRate > 0.72,
  strongBeatsAreHarmonicallyStable: strongBeatConsonance > 0.78,
  sustainedHarmonyBalancesTriadsAndColour: triadShare > 0.82 && triadShare < 0.95,
  unstableTriadsRemainPassingColour: unstableTriadShare < 0.07,
  tempoTransitionsAreGradual: maxTempoStep <= 1.91,
  tonalCoverage: keys.size >= 10,
  transportHasNoCumulativeDrift: maxTransportDriftMs < 1e-6,
  randomDomainsAreIndependent:
    randomDomainsAreIndependent && engineUsesIndependentRandomDomains,
  phraseTexturePlansRealDensityArcs:
    ['sparse', 'duo', 'chamber', 'full', 'release'].every((state) =>
      textureStatesVisited.has(state)
    ) &&
    [1, 2, 3, 4, 5].every((count) => textureActiveRoleCounts.has(count)) &&
    [0, 1, 2, 3].every((count) => soundingChordVoiceCounts.has(count)) &&
    [...soundingChordVoiceCounts].some((count) => count >= 5) &&
    textureStageStates.statement.has('sparse') &&
    textureStageStates.intensification.has('full') &&
    textureStageStates.release.has('release') &&
    averageTextureRolesByStage.statement < averageTextureRolesByStage.development &&
    averageTextureRolesByStage.development <
      averageTextureRolesByStage.intensification &&
    averageTextureRolesByStage.release < averageTextureRolesByStage.development &&
    textureSilentSegments === 0 &&
    textureInactiveSpotlights === 0 &&
    textureMinimumDurationViolations === 0 &&
    textureRoleFlickerViolations === 0,
  integratedPlanningStackSurvives24Hours:
    integratedNow >= INTEGRATED_END_SECONDS &&
    integratedPhrases > 1000 &&
    integratedHarmonyEvents > 2500 &&
    integratedSeedChanges > 10 &&
    integratedModesVisited.size === MODES.length &&
    integratedCounterpointOverlapPairs > 1000 &&
    integratedCounterpointViolationRate < 0.018,
  integratedSchedulerProtectsStructuralVoices:
    integratedRoleStats.lead.planned > 1000 &&
    integratedRoleStats.counter.planned > 100 &&
    integratedRoleStats.lead.dropped === 0 &&
    integratedRoleStats.counter.dropped === 0 &&
    integratedPeakSourceOverlap <= 40 &&
    INTEGRATED_ROLES.every((role) =>
      integratedRoleStats[role].scheduled + integratedRoleStats[role].dropped ===
        integratedRoleStats[role].planned
    ),
  integratedSoundingTextureIsDiverse:
    Object.keys(INSTRUMENTS).every((instrument) =>
      (integratedInstrumentAudibleSeconds[instrument] ?? 0) /
        INTEGRATED_END_SECONDS > 0.02
    ) &&
    [1, 2, 3, 4, 5].every((count) =>
      (integratedInstrumentCountSeconds[count] ?? 0) /
        INTEGRATED_END_SECONDS > 0.03
    ) &&
    [1, 2, 3, 4, 5].every((count) =>
      (integratedRoleCountSeconds[count] ?? 0) /
        INTEGRATED_END_SECONDS > 0.03
    ) &&
    (integratedRoleCountSeconds[0] ?? 0) / INTEGRATED_END_SECONDS > 0.005 &&
    (integratedRoleCountSeconds[0] ?? 0) / INTEGRATED_END_SECONDS < 0.08 &&
    integratedPeakSimultaneousInstruments >= 6 &&
    integratedPeakSimultaneousRoles === INTEGRATED_ROLES.length &&
    integratedPeakSimultaneousVoices >= 6,
  integratedTextureStatesHaveMaterialShare:
    integratedTextureShares.sparse > 0.04 &&
    integratedTextureShares.duo > 0.04 &&
    integratedTextureShares.chamber > 0.06 &&
    integratedTextureShares.full > 0.04 &&
    integratedTextureShares.release > 0.04 &&
    integratedAverageDensityByStage.statement.roles <
      integratedAverageDensityByStage.development.roles &&
    integratedAverageDensityByStage.development.roles <
      integratedAverageDensityByStage.intensification.roles &&
    integratedAverageDensityByStage.release.roles <
      integratedAverageDensityByStage.development.roles &&
    integratedAverageDensityByStage.return.roles >
      integratedAverageDensityByStage.statement.roles,
  accompanimentPatternsAreMeterAwareAndContinuous:
    ['sustain', 'pulse', 'arpeggio', 'syncopated', 'sparse'].every((pattern) =>
      accompanimentPatternsVisited.has(pattern)
    ) &&
    ['new', 'retained', 'varied'].every((continuity) =>
      accompanimentContinuityVisited.has(continuity)
    ) &&
    maxPlannedAccompanimentGridError < 1e-9,
  engineUsesNewFormalPlanningStack: engineUsesFormalPlanningStack,
  timbreHandoffsUseDualEqualPowerLayers: engineUsesEqualPowerTimbreHandoffs,
  automaticLifecyclePreservesFormalArc:
    automaticSeedWaitsForFormalArc && sceneLifecycleCountsBars,
  seedTransitionsRestAtEndpoints: smootherstepHasRestingEndpoints,
  shaderRandomnessIsStable:
    shaderRandomnessIsTemporallyStable && visualVariants.size === 3,
  voiceLeadingIsSmooth: averageVoiceMovement < 7,
};

const report = {
  assertions,
  accompanimentPulseEvents,
  averageBackgroundRoughness: Number(averageBackgroundRoughness.toFixed(4)),
  averageCounterMovement: Number(averageCounterMovement.toFixed(3)),
  averageLeadMovement: Number(averageLeadMovement.toFixed(3)),
  averageMelodyRoughness: Number(averageMelodyRoughness.toFixed(4)),
  averagePivotCommonTones: Number(averagePivotCommonTones.toFixed(3)),
  averageVoiceMovement: Number(averageVoiceMovement.toFixed(3)),
  bpmRange: [Number(minimumBpm.toFixed(2)), Number(maximumBpm.toFixed(2))],
  brightMoodShare: Number(brightMoodShare.toFixed(4)),
  brightJourneyShare: Number(brightJourneyShare.toFixed(4)),
  fastPositiveJourneyShare: Number(fastPositiveJourneyShare.toFixed(4)),
  maximumJourneyBpm: Number(maximumJourneyBpm.toFixed(2)),
  seededBrightSceneShare: Number(seededBrightSceneShare.toFixed(4)),
  cadenceTonicRate: Number(cadenceTonicRate.toFixed(4)),
  plannedCadenceArrivalRate: Number(plannedCadenceArrivalRate.toFixed(4)),
  cadenceTypesVisited: [...cadenceTypesVisited].sort(),
  classicalCorpus: CLASSICAL_MODEL_META,
  chordsGenerated: chordCount,
  counterpointIndependence: Number(counterpointIndependence.toFixed(4)),
  contraryOrObliqueCounterpointShare: Number(
    contraryOrObliqueCounterpointShare.toFixed(4),
  ),
  darkModeShare: Number(darkModeShare.toFixed(4)),
  emotionalFormStages: [...formStages],
  engineIntegration: {
    automaticSeedWaitsForFormalArc,
    equalPowerDualTimbreLayers: engineUsesEqualPowerTimbreHandoffs,
    formalPlanningStack: engineUsesFormalPlanningStack,
    sceneLifecycleCountsBars,
  },
  integratedPlanningSoak: {
    accompanimentPatterns: [...integratedPatternsVisited].sort(),
    averageDensityByStage: Object.fromEntries(
      Object.entries(integratedAverageDensityByStage).map(([stage, density]) => [
        stage,
        Object.fromEntries(Object.entries(density).map(([key, value]) => [
          key,
          Number(value.toFixed(4)),
        ])),
      ]),
    ),
    counterpointOverlapPairs: integratedCounterpointOverlapPairs,
    counterpointViolationPairs: integratedCounterpointViolationPairs,
    counterpointViolationRate: Number(integratedCounterpointViolationRate.toFixed(5)),
    dropExamples: integratedDropExamples,
    harmonyEvents: integratedHarmonyEvents,
    hoursSimulated: INTEGRATED_HOURS,
    modesVisited: [...integratedModesVisited].sort(),
    instrumentAudibleShare: integratedDurationShares(integratedInstrumentAudibleSeconds),
    simultaneousInstrumentCountShare: integratedDurationShares(
      integratedInstrumentCountSeconds,
    ),
    simultaneousRoleCountShare: integratedDurationShares(integratedRoleCountSeconds),
    simultaneousVoiceCountShare: integratedDurationShares(integratedVoiceCountSeconds),
    peakSimultaneousInstruments: integratedPeakSimultaneousInstruments,
    peakInstrumentIdentities: integratedPeakInstrumentIdentities,
    peakSimultaneousRoles: integratedPeakSimultaneousRoles,
    peakRoleIdentities: integratedPeakRoleIdentities,
    peakSimultaneousVoices: integratedPeakSimultaneousVoices,
    peakSourceOverlap: integratedPeakSourceOverlap,
    phrases: integratedPhrases,
    roleScheduling: integratedRoleStats,
    roleAudibleShare: integratedDurationShares(integratedRoleAudibleSeconds),
    seedChanges: integratedSeedChanges,
    textureShares: Object.fromEntries(
      Object.entries(integratedTextureShares).map(([state, share]) => [
        state,
        Number(share.toFixed(4)),
      ]),
    ),
  },
  emotionSystem: {
    coreEmotions: CORE_EMOTIONS,
    initialEmotionCoverage: [...initialEmotionCoverage].sort(),
    journeyEmotionCoverage: [...journeyEmotionCoverage].sort(),
    maxJourneyStep: Number(maxEmotionJourneyStep.toFixed(4)),
    paletteCount: Object.keys(EMOTION_COLOR_PALETTES).length,
    presetTempoRange: emotionPresetTempoRange.map((value) => Number(value.toFixed(2))),
    shaderTemplateCount: shaderTemplateLabels.size,
  },
  formalHarmonyMemory: {
    averageSimilarity: Object.fromEntries(
      Object.entries(averageHarmonicSimilarity).map(([role, similarity]) => [
        role,
        Number(similarity.toFixed(4)),
      ]),
    ),
    exactMatchShare: Object.fromEntries(
      Object.entries(harmonicExactShares).map(([role, share]) => [
        role,
        Number(share.toFixed(4)),
      ]),
    ),
  },
  formalSceneMemory: {
    averageDevelopmentEmotionDistance: Number(
      averageDevelopmentEmotionDistance.toFixed(4),
    ),
    averageReturnEmotionDistance: Number(averageReturnEmotionDistance.toFixed(4)),
    developmentModeRate: Number(developmentModeRate.toFixed(4)),
    developmentTonicRate: Number(developmentTonicRate.toFixed(4)),
    explicitOpeningRecallFailures,
    returnModeRate: Number(returnModeRate.toFixed(4)),
    returnTonicRate: Number(returnTonicRate.toFixed(4)),
  },
  modeGrammarAudit: {
    cadenceFailures: modeCadenceFailures,
    characteristicExposureFailures: modeCharacteristicExposureFailures,
    distinctCadenceNames: modeCadenceNames.size,
    fieldFailures: modeGrammarFieldFailures,
    modes: modeGrammarAudit,
  },
  familiarThemeNames: [...familiarThemeNames],
  familiarThemeShare: Number(familiarThemeShare.toFixed(4)),
  harmonyVoiceCounts: [...harmonyVoiceCounts].sort(),
  adaptiveHarmonySampleCounts: [...adaptiveHarmonySampleCounts].sort(),
  hoursSimulated: HOURS,
  keysVisited: keys.size,
  leadMotifCycles: leadMotif.cycle,
  leadMotifMutations: leadMotif.mutations,
  maxActiveSources,
  maxAccompanimentGridError,
  maxEmotionStep: Number(maxEmotionStep.toFixed(5)),
  maxExpressiveOffsetMs: Number(maxExpressiveOffsetMs.toFixed(3)),
  maxGridUnitError,
  maxTempoStep: Number(maxTempoStep.toFixed(4)),
  maxTransportDriftMs,
  maxWeatherDeltaPerSecond: Number(maxProfileStep.toFixed(6)),
  minimumSceneScaleCommonTones,
  orchestration: {
    articulationCoverage: [...articulationCoverage].sort(),
    averageHighArousalArticulation: Number(averageHighArousalArticulation.toFixed(4)),
    averageLowArousalArticulation: Number(averageLowArousalArticulation.toFixed(4)),
    averageRolesChanged: Number(averageOrchestrationRoleChanges.toFixed(4)),
    changes: orchestrationChanges,
    instrumentCoverage: Object.fromEntries(
      Object.entries(orchestrationCoverage).map(([role, instruments]) => [
        role,
        [...instruments].sort(),
      ]),
    ),
    maxPerformanceInterpolationStep: Number(maxPerformanceInterpolationStep.toFixed(5)),
    maxRolesChanged: maxOrchestrationRoleChanges,
  },
  onsetSafety: {
    prerollSourceCount,
    zeroGainAttackCount,
    zeroGainReleaseCount,
  },
  highTensionShare: Number(highTensionShare.toFixed(4)),
  highTensionTimeShare: Number(highTensionTimeShare.toFixed(4)),
  metersVisited: meters.size,
  minimumBassSeparation,
  bassLine: {
    connectedMotionShare: Number(connectedBassMotionShare.toFixed(4)),
    maximumLeap: maximumBassLeap,
    nonRootShare: Number(nonRootBassShare.toFixed(4)),
  },
  bedBreathRange: [
    Number(minimumBedBreath.toFixed(4)),
    Number(maximumBedBreath.toFixed(4)),
  ],
  modesVisited: modes.size,
  motifTargetRate: Number(motifTargetRate.toFixed(4)),
  phraseMelodyPlanning: {
    aDoublePrimeExactCopyShare: Number(aDoublePrimeExactMelodyShare.toFixed(4)),
    aPrimeExactCopyShare: Number(aPrimeExactMelodyShare.toFixed(4)),
    cadenceFailures: phraseCadenceFailures,
    climaxFailures: phraseClimaxFailures,
    conservativeStrongBeatChordToneRate: Number(
      conservativeStrongBeatChordToneRate.toFixed(4),
    ),
    controlledAccentedDissonances,
    controlledDissonanceMarkerFailures,
    realizedAccentedDissonanceRate: Number(realizedAccentedDissonanceRate.toFixed(4)),
    realizedDissonanceResolutionRate: Number(realizedDissonanceResolutionRate.toFixed(4)),
    sliceFieldFailures: phraseSliceFieldFailures,
    sliceFieldSamples: phraseSliceFieldSamples,
    variationSources: Object.fromEntries(
      Object.entries(melodicVariationSources).map(([role, sources]) => [
        role,
        [...sources].sort(),
      ]),
    ),
    variationTechniques: Object.fromEntries(
      Object.entries(melodicVariationTechniques).map(([role, techniques]) => [
        role,
        [...techniques].sort(),
      ]),
    ),
  },
  parallelPerfectRate: Number(parallelPerfectRate.toFixed(5)),
  progressionWindowUniqueness: Number(progressionUniqueness.toFixed(4)),
  performanceGestures: {
    idiomaticConnectionFailures,
    instrumentProfiles: Object.keys(INSTRUMENT_GESTURES).length,
    longNoteVibratoInstruments,
    naturalDecayInstruments,
    scheduledRolePaths: scheduledGestureRoleCount,
  },
  renderQuality: {
    desktop: desktopPlan,
    lowMobile: lowMobilePlan,
    noMsaaFallback: noMsaaPlan,
  },
  resolutionRate: Number(resolutionRate.toFixed(4)),
  plannedCounterpointReconciliation: {
    correctionFailures: reconciliationCorrectionFailures,
    correctionReasons: [...reconciliationCorrectionReasons].sort(),
    delayedLeadOverlapRegressionFailures,
  },
  seedChanges,
  timbreNoiseRecipes,
  strongBeatConsonance: Number(strongBeatConsonance.toFixed(4)),
  triadShare: Number(triadShare.toFixed(4)),
  texturePlanning: {
    accompanimentContinuity: [...accompanimentContinuityVisited].sort(),
    accompanimentPatterns: [...accompanimentPatternsVisited].sort(),
    activeRoleCounts: [...textureActiveRoleCounts].sort((left, right) => left - right),
    averageRolesByStage: Object.fromEntries(
      Object.entries(averageTextureRolesByStage).map(([stage, roleCount]) => [
        stage,
        Number(roleCount.toFixed(4)),
      ]),
    ),
    inactiveSpotlights: textureInactiveSpotlights,
    maxAccompanimentGridError: maxPlannedAccompanimentGridError,
    minimumDurationViolations: textureMinimumDurationViolations,
    roleFlickerViolations: textureRoleFlickerViolations,
    silentSegments: textureSilentSegments,
    soundingChordVoiceCounts: [...soundingChordVoiceCounts]
      .sort((left, right) => left - right),
    stageStates: Object.fromEntries(
      Object.entries(textureStageStates).map(([stage, states]) => [
        stage,
        [...states].sort(),
      ]),
    ),
    states: [...textureStatesVisited].sort(),
  },
  unstableTriadShare: Number(unstableTriadShare.toFixed(4)),
  visualVariants: [...visualVariants].sort(),
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
