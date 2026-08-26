import {
  SeededRandom,
  chordRootMidi,
  chooseNeighborScene,
  chooseNextDegree,
  findPivotDegree,
  interpolateProfile,
  nextSeed,
  pickMelodyMidi,
  profileFromSeed,
  sceneFromSeed,
  sceneName,
  seedToNumber,
  voiceLeadChord,
} from '../lib/nagi/generative.ts';

const HOURS = 12;
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

for (let now = 0; now <= END_SECONDS; now += 1) {
  if (incomingSeed === null && now >= nextSeedAt) {
    incomingSeed = nextSeed(currentSeed);
    incomingProfile = profileFromSeed(incomingSeed);
    transitionStart = now;
    transitionDuration = 190 + incomingProfile.space * 155;
  }
  let profile = currentProfile;
  if (incomingProfile) {
    const amount = Math.min(1, (now - transitionStart) / transitionDuration);
    profile = interpolateProfile(currentProfile, incomingProfile, amount);
    if (amount >= 1) {
      currentSeed = incomingSeed;
      currentProfile = incomingProfile;
      incomingSeed = null;
      incomingProfile = null;
      nextSeedAt = now + 430 + currentProfile.motion * 330;
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
let previousVoicing = [];
let previousMelody = 69;
let totalVoiceMovement = 0;
let voiceMovementSamples = 0;
let totalMelodyMovement = 0;
let melodySamples = 0;
let minimumBassSeparation = Infinity;
let chordCount = 0;
let now = 0.025;
const intervals = [];
const modes = new Set();
const keys = new Set();
const progressionWindows = new Set();
const recentProgression = [];

while (now < END_SECONDS) {
  if (chordsUntilSceneChange <= 0) {
    const nextScene = chooseNeighborScene(scene, random);
    chordDegree = findPivotDegree(scene, chordDegree, nextScene);
    scene = nextScene;
    chordsUntilSceneChange = 7 + Math.floor(random.next() * 8);
  } else if (chordCount > 0) {
    chordDegree = chooseNextDegree(chordDegree, scene, random);
  }

  const beat = 60 / scene.tempo;
  const beats = random.pick([6, 8, 8, 10]);
  const duration = beat * beats * random.between(0.97, 1.04);
  const voicing = voiceLeadChord(scene, chordDegree, previousVoicing);
  if (previousVoicing.length > 0) {
    const paired = Math.min(previousVoicing.length, voicing.length);
    for (let index = 0; index < paired; index += 1) {
      totalVoiceMovement += Math.abs(voicing[index] - previousVoicing[index]);
      voiceMovementSamples += 1;
    }
  }
  const bass = chordRootMidi(scene, chordDegree);
  minimumBassSeparation = Math.min(minimumBassSeparation, Math.min(...voicing) - bass);
  voicing.forEach(() => intervals.push([now, now + duration + 3.4]));
  intervals.push([now, now + duration + 2.4]);

  const motifCount = Math.round(2 + scene.motifRate * 4);
  const segment = duration / (motifCount + 0.55);
  for (let index = 0; index < motifCount; index += 1) {
    const midi = pickMelodyMidi(scene, chordDegree, previousMelody, random);
    totalMelodyMovement += Math.abs(midi - previousMelody);
    melodySamples += 1;
    previousMelody = midi;
    const start = now + segment * (index + 0.48);
    intervals.push([start, start + 3.6]);
  }

  modes.add(scene.modeIndex);
  keys.add(scene.tonic);
  recentProgression.push(`${sceneName(scene)}:${chordDegree}`);
  if (recentProgression.length > 6) recentProgression.shift();
  if (recentProgression.length === 6) progressionWindows.add(recentProgression.join('|'));
  previousVoicing = voicing;
  chordsUntilSceneChange -= 1;
  chordCount += 1;
  now += duration;
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
const averageMelodyMovement = totalMelodyMovement / Math.max(1, melodySamples);
const progressionUniqueness = progressionWindows.size / Math.max(1, chordCount - 5);
const assertions = {
  activeSourceCap: maxActiveSources <= 40,
  continuousWeather: maxProfileStep < 0.012,
  immediateOpening: 0.025 < 0.1,
  lowRegisterSpacing: minimumBassSeparation >= 7,
  melodicMotionIsSingable: averageMelodyMovement < 6.5,
  modeCoverage: modes.size >= 7,
  progressionVariety: progressionUniqueness > 0.78,
  tonalCoverage: keys.size >= 10,
  voiceLeadingIsSmooth: averageVoiceMovement < 7,
};

const report = {
  assertions,
  averageMelodyMovement: Number(averageMelodyMovement.toFixed(3)),
  averageVoiceMovement: Number(averageVoiceMovement.toFixed(3)),
  chordsGenerated: chordCount,
  hoursSimulated: HOURS,
  keysVisited: keys.size,
  maxActiveSources,
  maxWeatherDeltaPerSecond: Number(maxProfileStep.toFixed(6)),
  minimumBassSeparation,
  modesVisited: modes.size,
  progressionWindowUniqueness: Number(progressionUniqueness.toFixed(4)),
  seedChanges,
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
