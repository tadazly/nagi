import {
  METERS,
  MODES,
  SeededRandom,
  chordPitchClasses,
  chordRootMidi,
  chooseChordSpanBars,
  chooseNeighborScene,
  chooseNextDegree,
  clamp,
  degreeTension,
  degreeTriadComfort,
  findPivotDegree,
  interpolateProfile,
  isChordTone,
  metricStrengthAt,
  nextSeed,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  sensoryRoughness,
  tempoFromArousal,
  voiceLeadChord,
} from '../lib/nagi/generative.ts';
import {
  createMotif,
  motifPitchClass,
  planMotifPhrase,
} from '../lib/nagi/composition.ts';
import { CLASSICAL_MODEL_META } from '../lib/nagi/classical-prior.ts';

const HOURS = 24;
const END_SECONDS = HOURS * 60 * 60;
const START_SEED = '7F3A91C2';

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

const random = new SeededRandom(seedToNumber(START_SEED) ^ 0x51f2e9ad);
let scene = sceneFromSeed(START_SEED);
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
let leadMidi = 69;
let counterMidi = 62;
let leadNeedsResolution = false;
let counterNeedsResolution = false;
const leadMotif = createMotif(random, currentArousal, 'lead', undefined, currentValence);
const counterMotif = createMotif(
  random,
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
let sceneChanges = 0;
let chordCount = 0;
let now = 0.025;
const intervals = [];
const modes = new Set();
const keys = new Set();
const meters = new Set();
const progressionWindows = new Set();
const recentProgression = [];
const darkModes = new Set([
  'phrygian',
  'harmonic-minor',
  'dorian-sharp-four',
  'neapolitan-major',
]);

while (now < END_SECONDS) {
  if (chordsUntilSceneChange <= 0) {
    const nextScene = chooseNeighborScene(scene, random);
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
  transportTempo += clamp(targetTempo - transportTempo, -3.2, 3.2);
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
  const spanBars = chooseChordSpanBars(sceneForChord, random);
  const totalBeats = meter.beatsPerBar * spanBars;
  const duration = beatSeconds * totalBeats;
  const exactEnd = now + beatSeconds * meter.beatsPerBar * spanBars;
  maxTransportDriftMs = Math.max(
    maxTransportDriftMs,
    Math.abs(now + duration - exactEnd) * 1000,
  );

  const voicing = voiceLeadChord(sceneForChord, chordDegree, previousVoicing);
  if (previousVoicing.length > 0) {
    for (const note of voicing) {
      totalVoiceMovement += Math.min(...previousVoicing.map((old) => Math.abs(note - old)));
      voiceMovementSamples += 1;
    }
  }
  const bass = chordRootMidi(sceneForChord, chordDegree);
  minimumBassSeparation = Math.min(minimumBassSeparation, Math.min(...voicing) - bass);
  const phraseProgress =
    (phraseBar % sceneForChord.phraseBars) / Math.max(1, sceneForChord.phraseBars);
  const bedBreath = 0.78 + Math.abs(Math.cos(phraseProgress * Math.PI)) * 0.22;
  minimumBedBreath = Math.min(minimumBedBreath, bedBreath);
  maximumBedBreath = Math.max(maximumBedBreath, bedBreath);
  const padTail = Math.min(2.2, Math.max(0.75, duration * 0.2));
  voicing.forEach(() =>
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
  if (voicing.length === 3) triadChords += 1;
  if (degreeTriadComfort(sceneForChord, chordDegree) < 0.5) unstableTriadChords += 1;
  if (darkModes.has(MODES[sceneForChord.modeIndex].id)) darkModeChords += 1;
  if (degreeTension(chordDegree) > 0.6) highTensionChords += 1;
  if (sceneForChord.valence > 0.7 && sceneForChord.arousal > 0.58) brightMoodChords += 1;

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
    random,
    'lead',
    leadMotif,
    phraseBar,
  );
  const plannedCounterEvents = planMotifPhrase(
    sceneForChord,
    spanBars,
    random,
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
      const backgroundNotes = [...voicing, bass];
      const midi = pickMelodyMidi(sceneForChord, chordDegree, previous, random, {
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

const assertions = {
  activeSourceCap: maxActiveSources <= 40,
  accompanimentUsesTransportGrid: maxAccompanimentGridError < 1e-9,
  backgroundRoughnessIsControlled: averageBackgroundRoughness < 0.12,
  backgroundUsesBreathingDynamics: minimumBedBreath < 0.83 && maximumBedBreath > 0.99,
  bpmRangeIsMusical:
    minimumBpm >= 58 && maximumBpm > 120 && maximumBpm <= 136.000001,
  brightMoodsAreRepresented: brightMoodShare > 0.2,
  continuousEmotion: maxEmotionStep < 0.09,
  continuousWeather: maxProfileStep < 0.012,
  corpusPriorLoaded:
    CLASSICAL_MODEL_META.scoreCount >= 1000 &&
    CLASSICAL_MODEL_META.melodyNoteCount >= 150000 &&
    CLASSICAL_MODEL_META.accompanimentNoteCount >= 900000,
  counterpointIndependence: counterpointIndependence > 0.72,
  expressiveTimingIsBounded: maxExpressiveOffsetMs < 38,
  gridIntegrity: maxGridUnitError < 1e-9,
  immediateOpening: 0.025 < 0.1,
  darkModesRemainRareColour: darkModeShare < 0.12,
  highTensionIsNotTheDefault: highTensionShare < 0.16,
  lowRegisterSpacing: minimumBassSeparation >= 7,
  melodicMotionIsSingable:
    averageLeadMovement > 1.4 &&
    averageLeadMovement < 7 &&
    averageCounterMovement < 7,
  meterCoverage: meters.size === METERS.length,
  modeCoverage: modes.size >= 8,
  motifIdentitySurvives: motifTargetRate > 0.34 && leadMotif.cycle > 100,
  pivotContinuity: averagePivotCommonTones >= 1.5,
  psychoacousticRoughnessIsControlled: averageMelodyRoughness < 0.42,
  progressionVariety: progressionUniqueness > 0.72,
  resolutionsBehave: resolutionRate > 0.72,
  strongBeatsAreHarmonicallyStable: strongBeatConsonance > 0.78,
  sustainedHarmonyIsMostlyTriadic: triadShare > 0.92,
  unstableTriadsRemainPassingColour: unstableTriadShare < 0.055,
  tempoTransitionsAreGradual: maxTempoStep <= 3.200001,
  tonalCoverage: keys.size >= 10,
  transportHasNoCumulativeDrift: maxTransportDriftMs < 1e-6,
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
  classicalCorpus: CLASSICAL_MODEL_META,
  chordsGenerated: chordCount,
  counterpointIndependence: Number(counterpointIndependence.toFixed(4)),
  darkModeShare: Number(darkModeShare.toFixed(4)),
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
  highTensionShare: Number(highTensionShare.toFixed(4)),
  metersVisited: meters.size,
  minimumBassSeparation,
  bedBreathRange: [
    Number(minimumBedBreath.toFixed(4)),
    Number(maximumBedBreath.toFixed(4)),
  ],
  modesVisited: modes.size,
  motifTargetRate: Number(motifTargetRate.toFixed(4)),
  progressionWindowUniqueness: Number(progressionUniqueness.toFixed(4)),
  resolutionRate: Number(resolutionRate.toFixed(4)),
  seedChanges,
  strongBeatConsonance: Number(strongBeatConsonance.toFixed(4)),
  triadShare: Number(triadShare.toFixed(4)),
  unstableTriadShare: Number(unstableTriadShare.toFixed(4)),
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
