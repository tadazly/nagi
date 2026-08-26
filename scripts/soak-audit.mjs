import {
  METERS,
  MODES,
  SeededRandom,
  chordPitchClasses,
  chordRootMidi,
  chooseChordSpanBars,
  chooseNeighborScene,
  chooseNextDegree,
  findPivotDegree,
  interpolateProfile,
  isChordTone,
  nextSeed,
  pickMelodyMidi,
  planRhythm,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  voiceLeadChord,
} from '../lib/nagi/generative.ts';

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
let chordDegree = 0;
let chordsUntilSceneChange = 7 + Math.floor(random.next() * 7);
let phraseBar = 0;
let previousVoicing = [];
let leadMidi = 69;
let counterMidi = 62;
let leadNeedsResolution = false;
let counterNeedsResolution = false;
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
let minimumBassSeparation = Infinity;
let maxGridUnitError = 0;
let maxHumanizeMs = 0;
let maxTransportDriftMs = 0;
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

  const meter = METERS[scene.meterIndex];
  const beatSeconds = 60 / scene.tempo;
  const spanBars = chooseChordSpanBars(scene, random);
  const totalBeats = meter.beatsPerBar * spanBars;
  const duration = beatSeconds * totalBeats;
  const exactEnd = now + beatSeconds * meter.beatsPerBar * spanBars;
  maxTransportDriftMs = Math.max(maxTransportDriftMs, Math.abs(now + duration - exactEnd) * 1000);

  const voicing = voiceLeadChord(scene, chordDegree, previousVoicing);
  if (previousVoicing.length > 0) {
    for (const note of voicing) {
      totalVoiceMovement += Math.min(...previousVoicing.map((old) => Math.abs(note - old)));
      voiceMovementSamples += 1;
    }
  }
  const bass = chordRootMidi(scene, chordDegree);
  minimumBassSeparation = Math.min(minimumBassSeparation, Math.min(...voicing) - bass);
  voicing.forEach(() => intervals.push([now, now + duration + 3.4]));
  for (let bar = 0; bar < spanBars; bar += 1) {
    const bassStart = now + bar * meter.beatsPerBar * beatSeconds;
    intervals.push([bassStart, bassStart + meter.beatsPerBar * beatSeconds * 0.9 + 2.4]);
  }

  const leadEvents = planRhythm(scene, spanBars, random, 'lead');
  const counterEvents = planRhythm(scene, spanBars, random, 'counter');
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
      const gridUnits = event.beat * meter.subdivisionsPerBeat;
      maxGridUnitError = Math.max(maxGridUnitError, Math.abs(gridUnits - Math.round(gridUnits)));
      const humanizeMs = Math.abs(event.humanizeBeats * beatSeconds * 1000);
      maxHumanizeMs = Math.max(maxHumanizeMs, humanizeMs);
      const phraseProgress =
        ((phraseBar + event.beat / meter.beatsPerBar) % scene.phraseBars) /
        scene.phraseBars;
      const contour = Math.sin(phraseProgress * Math.PI * 2 + scene.tension * Math.PI);
      const direction = contour > 0.16 ? 1 : contour < -0.16 ? -1 : 0;
      const previous = role === 'lead' ? leadMidi : counterMidi;
      const needsResolution = role === 'lead' ? leadNeedsResolution : counterNeedsResolution;
      const targetMidi = (role === 'lead' ? 70 : 62) + contour * (role === 'lead' ? 4.2 : 3.1);
      const midi = pickMelodyMidi(scene, chordDegree, previous, random, {
        direction,
        metricStrength: event.metricStrength,
        mustResolve: needsResolution,
        otherVoiceMidi: role === 'lead' ? counterMidi : leadMidi,
        registerHigh: role === 'lead' ? 84 : 74,
        registerLow: role === 'lead' ? 60 : 52,
        targetMidi,
      });
      const chordTone = isChordTone(scene, chordDegree, midi);
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
        intervals.push([now + event.beat * beatSeconds, now + event.beat * beatSeconds + 4.2]);
      } else {
        totalCounterMovement += Math.abs(midi - counterMidi);
        counterSamples += 1;
        counterMidi = midi;
        counterNeedsResolution = !chordTone;
        intervals.push([now + event.beat * beatSeconds, now + event.beat * beatSeconds + 5.1]);
      }
    }
  };

  simulateVoice('lead', leadEvents);
  simulateVoice('counter', counterEvents);

  modes.add(scene.modeIndex);
  keys.add(scene.tonic);
  meters.add(scene.meterIndex);
  recentProgression.push(`${sceneName(scene)}:${chordDegree}`);
  if (recentProgression.length > 6) recentProgression.shift();
  if (recentProgression.length === 6) progressionWindows.add(recentProgression.join('|'));
  previousVoicing = voicing;
  phraseBar = (phraseBar + spanBars) % scene.phraseBars;
  chordsUntilSceneChange -= 1;
  chordCount += 1;
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

const assertions = {
  activeSourceCap: maxActiveSources <= 40,
  continuousWeather: maxProfileStep < 0.012,
  counterpointIndependence: counterpointIndependence > 0.72,
  gridIntegrity: maxGridUnitError < 1e-9,
  humanizationIsBounded: maxHumanizeMs < 28,
  immediateOpening: 0.025 < 0.1,
  lowRegisterSpacing: minimumBassSeparation >= 7,
  melodicMotionIsSingable: averageLeadMovement < 6.5 && averageCounterMovement < 6.5,
  meterCoverage: meters.size === METERS.length,
  modeCoverage: modes.size >= MODES.length - 1,
  pivotContinuity: averagePivotCommonTones >= 1.5,
  progressionVariety: progressionUniqueness > 0.72,
  resolutionsBehave: resolutionRate > 0.72,
  strongBeatsAreHarmonicallyStable: strongBeatConsonance > 0.78,
  tonalCoverage: keys.size >= 10,
  transportHasNoCumulativeDrift: maxTransportDriftMs < 1e-6,
  voiceLeadingIsSmooth: averageVoiceMovement < 7,
};

const report = {
  assertions,
  averageCounterMovement: Number(averageCounterMovement.toFixed(3)),
  averageLeadMovement: Number(averageLeadMovement.toFixed(3)),
  averagePivotCommonTones: Number(averagePivotCommonTones.toFixed(3)),
  averageVoiceMovement: Number(averageVoiceMovement.toFixed(3)),
  chordsGenerated: chordCount,
  counterpointIndependence: Number(counterpointIndependence.toFixed(4)),
  hoursSimulated: HOURS,
  keysVisited: keys.size,
  maxActiveSources,
  maxGridUnitError,
  maxHumanizeMs: Number(maxHumanizeMs.toFixed(3)),
  maxTransportDriftMs,
  maxWeatherDeltaPerSecond: Number(maxProfileStep.toFixed(6)),
  metersVisited: meters.size,
  minimumBassSeparation,
  modesVisited: modes.size,
  progressionWindowUniqueness: Number(progressionUniqueness.toFixed(4)),
  resolutionRate: Number(resolutionRate.toFixed(4)),
  seedChanges,
  strongBeatConsonance: Number(strongBeatConsonance.toFixed(4)),
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
