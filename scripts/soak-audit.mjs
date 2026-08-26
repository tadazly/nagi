import {
  SeededRandom,
  interpolateProfile,
  nextSeed,
  pickAmbientPitch,
  profileFromSeed,
  seedToNumber,
} from '../lib/nagi/generative.ts';

const HOURS = 12;
const END_SECONDS = HOURS * 60 * 60;
const STEP_SECONDS = 1;
const START_SEED = '7F3A91C2';

let currentSeed = START_SEED;
let currentProfile = profileFromSeed(currentSeed);
let incomingSeed = null;
let incomingProfile = null;
let transitionStart = 0;
let transitionDuration = 0;
let nextSeedAt = 430 + currentProfile.motion * 330;
let nextBloomAt = 0;
let nextDustAt = 8;
let seedChanges = 0;
let scheduledBlooms = 0;
let scheduledDust = 0;
let maxActiveVoices = 0;
let maxProfileStep = 0;
let previousProfile = currentProfile;
let random = new SeededRandom(seedToNumber(currentSeed) ^ 0x51f2e9ad);
const activeEnds = [];
const pitchWindows = new Set();
const recentPitches = [];

const fieldDelta = (a, b) =>
  Math.max(...Object.keys(a).map((key) => Math.abs(a[key] - b[key])));

for (let now = 0; now <= END_SECONDS; now += STEP_SECONDS) {
  if (incomingSeed === null && now >= nextSeedAt) {
    incomingSeed = nextSeed(currentSeed);
    incomingProfile = profileFromSeed(incomingSeed);
    transitionStart = now;
    transitionDuration = 190 + incomingProfile.space * 150;
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
      random = new SeededRandom(
        seedToNumber(currentSeed) ^ scheduledBlooms ^ scheduledDust ^ 0x51f2e9ad,
      );
      nextSeedAt = now + 430 + currentProfile.motion * 330;
      seedChanges += 1;
    }
  }

  maxProfileStep = Math.max(maxProfileStep, fieldDelta(previousProfile, profile));
  previousProfile = profile;

  for (let index = activeEnds.length - 1; index >= 0; index -= 1) {
    if (activeEnds[index] <= now) activeEnds.splice(index, 1);
  }

  while (nextBloomAt <= now + 2.4) {
    if (activeEnds.length < 14) {
      const pitch = Math.round(pickAmbientPitch(profile, random, 0) * 100) / 100;
      const duration = random.between(23, 49) * (0.9 + profile.space * 0.28);
      activeEnds.push(nextBloomAt + duration);
      recentPitches.push(pitch);
      if (recentPitches.length > 10) recentPitches.shift();
      if (recentPitches.length === 10) pitchWindows.add(recentPitches.join(','));
      scheduledBlooms += 1;
    }
    const interval =
      (12.5 - profile.density * 7) * random.between(0.72, 1.52);
    nextBloomAt += interval;
  }

  while (nextDustAt <= now + 2.4) {
    if (activeEnds.length < 14) {
      activeEnds.push(nextDustAt + random.between(1.7, 3.1));
      scheduledDust += 1;
    }
    const interval =
      (43 - profile.density * 19) * random.between(0.72, 1.48);
    nextDustAt += interval;
  }
  maxActiveVoices = Math.max(maxActiveVoices, activeEnds.length + 4);
}

const uniqueness = pitchWindows.size / Math.max(1, scheduledBlooms - 9);
const assertions = {
  activeSourceCap: maxActiveVoices <= 18,
  continuousWeather: maxProfileStep < 0.01,
  enoughEvolution: seedChanges >= 35,
  eventRateIsGentle: scheduledBlooms / HOURS / 60 < 10,
  pitchWindowsVary: uniqueness > 0.72,
};

const report = {
  assertions,
  hoursSimulated: HOURS,
  maxActiveSources: maxActiveVoices,
  maxWeatherDeltaPerSecond: Number(maxProfileStep.toFixed(6)),
  pitchWindowUniqueness: Number(uniqueness.toFixed(4)),
  scheduledBlooms,
  scheduledDust,
  seedChanges,
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(assertions).some((passed) => !passed)) process.exitCode = 1;
