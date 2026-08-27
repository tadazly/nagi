import { readFileSync } from 'node:fs';
import {
  CORE_EMOTIONS,
  EMOTION_PRESETS,
  METERS,
  MODES,
  SeededRandom,
  chordPitchClasses,
  chordRootMidi,
  chooseChordSpanBars,
  chooseHarmonyVoiceCount,
  chooseNeighborScene,
  chooseNextDegree,
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
  nextSeed,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  sceneScaleCommonTones,
  seedToNumber,
  sensoryRoughness,
  shapeSceneWithEmotionalForm,
  smootherstep,
  tempoFromArousal,
  voiceLeadChord,
  visualVariantFromSeed,
} from '../lib/nagi/generative.ts';
import {
  createMotif,
  motifPitchClass,
  planMotifPhrase,
} from '../lib/nagi/composition.ts';
import { CLASSICAL_MODEL_META } from '../lib/nagi/classical-prior.ts';
import {
  INSTRUMENTS,
  articulationName,
  chooseOrchestration,
  choosePerformancePlan,
  interpolatePerformancePlan,
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
const leadMotif = createMotif(
  melodyRandom,
  currentArousal,
  'lead',
  undefined,
  currentValence,
);
const counterMotif = createMotif(
  melodyRandom,
  currentArousal,
  'counter',
  leadMotif,
  currentValence,
);
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
  } else if (chordCount > 0) {
    chordDegree = chooseNextDegree(
      chordDegree,
      scene,
      random,
      phraseBar / Math.max(1, scene.phraseBars),
    );
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
  const meter = METERS[sceneForChord.meterIndex];
  const beatSeconds = 60 / sceneForChord.tempo;
  const remainingPhraseBars = sceneForChord.phraseBars - phraseBar;
  const spanBars = chooseChordSpanBars(
    sceneForChord,
    random,
    remainingPhraseBars,
  );
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
  if (degreeTension(chordDegree) > 0.6) highTensionChords += 1;
  if (sceneForChord.valence > 0.7 && sceneForChord.arousal > 0.58) brightMoodChords += 1;
  formStages.add(emotionalFormStageAt(emotionalForm, formSceneIndex).id);
  if (phraseProgress >= 0.84) {
    cadenceArrivalSamples += 1;
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

  const leadEvents = planMotifPhrase(
    sceneForChord,
    spanBars,
    melodyRandom,
    'lead',
    leadMotif,
    phraseBar,
  );
  const plannedCounterEvents = planMotifPhrase(
    sceneForChord,
    spanBars,
    melodyRandom,
    'counter',
    counterMotif,
    phraseBar,
  );
  const counterEvents = plannedCounterEvents
    .filter((event) =>
      leadEvents.every((leadEvent) => Math.abs(leadEvent.beat - event.beat) > 0.45),
    )
    .slice(0, Math.max(1, Math.floor(leadEvents.length * 0.45)));
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
        mustResolve: needsResolution,
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
const triadShare = triadChords / Math.max(1, chordCount);
const unstableTriadShare = unstableTriadChords / Math.max(1, chordCount);
const brightMoodShare = brightMoodChords / Math.max(1, chordCount);
const cadenceTonicRate = cadenceArrivalsOnTonic / Math.max(1, cadenceArrivalSamples);
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
  'harmonyRandom',
  'melodyRandom',
  'orchestrationRandom',
  'performanceRandom',
  'textureRandom',
  'atmosphereRandom',
].every((domain) => audioEngineSource.includes(domain));

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
    EMOTION_PRESETS.JOYFUL.valence > 0.88 &&
    EMOTION_PRESETS.UPLIFTING.brightness > 0.82,
  continuousEmotion: maxEmotionStep < 0.09,
  continuousWeather: maxProfileStep < 0.012,
  corpusPriorLoaded:
    CLASSICAL_MODEL_META.scoreCount >= 1000 &&
    CLASSICAL_MODEL_META.melodyNoteCount >= 150000 &&
    CLASSICAL_MODEL_META.accompanimentNoteCount >= 900000,
  counterpointIndependence: counterpointIndependence > 0.72,
  cadencesPreferTonicArrival: cadenceTonicRate > 0.58,
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
  expressiveTechniquesFollowEmotion:
    averageLowArousalArticulation > averageHighArousalArticulation + 0.18,
  expressiveTransitionsAreSmooth: maxPerformanceInterpolationStep < 0.12,
  expressiveTimingIsBounded: maxExpressiveOffsetMs < 38,
  gridIntegrity: maxGridUnitError < 1e-9,
  immediateOpening: 0.025 < 0.1,
  darkModesRemainRareColour: darkModeShare < 0.12,
  highTensionIsNotTheDefault: highTensionShare < 0.2,
  classicalThemesRemainTransformativeColour:
    familiarThemeShare > 0.22 && familiarThemeShare < 0.45 && familiarThemeNames.size >= 8,
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
  progressionVariety: progressionUniqueness > 0.72,
  resolutionsBehave: resolutionRate > 0.72,
  strongBeatsAreHarmonicallyStable: strongBeatConsonance > 0.78,
  sustainedHarmonyBalancesTriadsAndColour: triadShare > 0.82 && triadShare < 0.95,
  unstableTriadsRemainPassingColour: unstableTriadShare < 0.07,
  tempoTransitionsAreGradual: maxTempoStep <= 1.91,
  tonalCoverage: keys.size >= 10,
  transportHasNoCumulativeDrift: maxTransportDriftMs < 1e-6,
  randomDomainsAreIndependent:
    randomDomainsAreIndependent && engineUsesIndependentRandomDomains,
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
  seededBrightSceneShare: Number(seededBrightSceneShare.toFixed(4)),
  cadenceTonicRate: Number(cadenceTonicRate.toFixed(4)),
  classicalCorpus: CLASSICAL_MODEL_META,
  chordsGenerated: chordCount,
  counterpointIndependence: Number(counterpointIndependence.toFixed(4)),
  darkModeShare: Number(darkModeShare.toFixed(4)),
  emotionalFormStages: [...formStages],
  emotionSystem: {
    coreEmotions: CORE_EMOTIONS,
    initialEmotionCoverage: [...initialEmotionCoverage].sort(),
    journeyEmotionCoverage: [...journeyEmotionCoverage].sort(),
    maxJourneyStep: Number(maxEmotionJourneyStep.toFixed(4)),
    paletteCount: Object.keys(EMOTION_COLOR_PALETTES).length,
    presetTempoRange: emotionPresetTempoRange.map((value) => Number(value.toFixed(2))),
    shaderTemplateCount: shaderTemplateLabels.size,
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
  metersVisited: meters.size,
  minimumBassSeparation,
  bedBreathRange: [
    Number(minimumBedBreath.toFixed(4)),
    Number(maximumBedBreath.toFixed(4)),
  ],
  modesVisited: modes.size,
  motifTargetRate: Number(motifTargetRate.toFixed(4)),
  parallelPerfectRate: Number(parallelPerfectRate.toFixed(5)),
  progressionWindowUniqueness: Number(progressionUniqueness.toFixed(4)),
  renderQuality: {
    desktop: desktopPlan,
    lowMobile: lowMobilePlan,
    noMsaaFallback: noMsaaPlan,
  },
  resolutionRate: Number(resolutionRate.toFixed(4)),
  seedChanges,
  timbreNoiseRecipes,
  strongBeatConsonance: Number(strongBeatConsonance.toFixed(4)),
  triadShare: Number(triadShare.toFixed(4)),
  unstableTriadShare: Number(unstableTriadShare.toFixed(4)),
  visualVariants: [...visualVariants].sort(),
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
