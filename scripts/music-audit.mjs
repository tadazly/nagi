import assert from 'node:assert/strict';
import {
  AMBIENT_TIMBRES,
  BEATS_PER_BAR,
  BEATS_PER_CYCLE,
  BARS_PER_PHRASE,
  LISTENING_WORLDS,
  PHRASES_PER_CYCLE,
  chordRoughness,
  createAmbientCycle,
  eventIsInsideRest,
} from '../lib/nagi/ambient-score.ts';
import {
  initialEmotionFromSeed,
  profileFromSeed,
} from '../lib/nagi/generative.ts';

const argv = new Set(process.argv.slice(2));
const runTimbreAudit = !argv.has('--score');
const runScoreAudit = !argv.has('--timbre');
const assertions = {};
const report = {};

const check = (name, condition, details = '') => {
  assertions[name] = Boolean(condition);
  assert.ok(condition, details || name);
};

const pitchClass = (midi) => ((midi % 12) + 12) % 12;

if (runTimbreAudit) {
  const timbres = Object.entries(AMBIENT_TIMBRES).map(([name, recipe]) => {
    const amplitude = recipe.partials.reduce(
      (sum, partial) => sum + partial.amplitude,
      0,
    );
    const centroidRatio = recipe.partials.reduce(
      (sum, partial) => sum + partial.ratio * partial.amplitude,
      0,
    ) / amplitude;
    return {
      attackSeconds: recipe.attackSeconds,
      centroidRatio,
      gain: recipe.gain,
      highpassHz: recipe.highpassHz,
      lowpassHz: recipe.lowpassHz,
      name,
      partialCount: recipe.partials.length,
      releaseSeconds: recipe.releaseSeconds,
      reverbSend: recipe.reverbSend,
    };
  });

  check(
    'timbresUseHarmonicPartialsOnly',
    Object.values(AMBIENT_TIMBRES).every((recipe) =>
      recipe.partials.every(
        (partial) =>
          Number.isInteger(partial.ratio) &&
          partial.ratio >= 1 &&
          partial.amplitude > 0,
      )),
  );
  check(
    'upperPartialsAlwaysDecay',
    Object.values(AMBIENT_TIMBRES).every((recipe) =>
      recipe.partials.every(
        (partial, index) =>
          index === 0 ||
          partial.amplitude < recipe.partials[index - 1].amplitude,
      )),
  );
  check(
    'spectraRemainSoft',
    timbres.every((timbre) => timbre.centroidRatio <= 1.36),
  );
  check(
    'filtersRemoveRumbleAndLimitPresence',
    Object.values(AMBIENT_TIMBRES).every(
      (recipe) =>
        recipe.highpassHz >= 50 &&
        recipe.lowpassHz <= 3_200 &&
        recipe.highpassHz < recipe.lowpassHz,
    ),
  );
  check(
    'sourceGainsStayConservative',
    Object.values(AMBIENT_TIMBRES).every((recipe) => recipe.gain <= 0.052),
  );
  check(
    'padBreathesSlowly',
    AMBIENT_TIMBRES.pad.attackSeconds >= 3.5 &&
      AMBIENT_TIMBRES.pad.releaseSeconds >= 4,
  );
  check(
    'melodicTailsDoNotStack',
    AMBIENT_TIMBRES.breath.releaseSeconds <= 1.1 &&
      AMBIENT_TIMBRES.bell.releaseSeconds <= 2.5,
  );
  check(
    'reverbSendsStayBounded',
    Object.values(AMBIENT_TIMBRES).every(
      (recipe) => recipe.reverbSend >= 0.4 && recipe.reverbSend <= 0.68,
    ),
  );

  report.timbres = timbres;
}

if (runScoreAudit) {
  const seedsToAudit = 4_096;
  const cyclesPerSeed = 4;
  const safeEmotions = new Set(['CALM', 'WARM', 'DREAMY', 'NOSTALGIC']);
  const worldCounts = Object.fromEntries(
    LISTENING_WORLDS.map((world) => [world.id, 0]),
  );
  let minimumTempo = Infinity;
  let maximumTempo = 0;
  let maximumChordRoughness = 0;
  let minimumLowVoiceGap = Infinity;
  let minimumCrossfadeInterval = Infinity;
  let maximumMelodyLeap = 0;
  let maximumNoteRate = 0;
  let maximumMelodicSources = 0;
  let minimumRestShare = 1;
  let maximumVisualDensity = 0;
  let maximumVisualMotion = 0;
  let totalSeconds = 0;

  for (let seedIndex = 0; seedIndex < seedsToAudit; seedIndex += 1) {
    const seed = seedIndex.toString(16).toUpperCase().padStart(8, '0');
    const visualProfile = profileFromSeed(seed);
    const emotion = initialEmotionFromSeed(seed);
    check('onlyLowArousalEmotionsAreSeeded', safeEmotions.has(emotion));
    maximumVisualDensity = Math.max(maximumVisualDensity, visualProfile.density);
    maximumVisualMotion = Math.max(maximumVisualMotion, visualProfile.motion);

    for (let cycleIndex = 0; cycleIndex < cyclesPerSeed; cycleIndex += 1) {
      const cycle = createAmbientCycle(seed, cycleIndex);
      const { profile } = cycle;
      worldCounts[profile.world.id] += 1;
      minimumTempo = Math.min(minimumTempo, profile.tempo);
      maximumTempo = Math.max(maximumTempo, profile.tempo);
      totalSeconds += cycle.totalBeats * 60 / profile.tempo;
      maximumNoteRate = Math.max(
        maximumNoteRate,
        cycle.notes.length / (cycle.totalBeats * 60 / profile.tempo),
      );
      minimumRestShare = Math.min(
        minimumRestShare,
        cycle.rests.reduce((sum, rest) => sum + rest.durationBeats, 0) /
          cycle.totalBeats,
      );

      assert.equal(cycle.totalBeats, BEATS_PER_CYCLE);
      assert.equal(cycle.chords.length, PHRASES_PER_CYCLE * 4);
      assert.equal(cycle.notes.length, PHRASES_PER_CYCLE * 6);
      assert.equal(cycle.rests.length, PHRASES_PER_CYCLE);
      assert.ok(safeEmotions.has(profile.emotion));
      assert.ok(profile.arousal <= 0.24);

      for (let phrase = 0; phrase < PHRASES_PER_CYCLE; phrase += 1) {
        const phraseChords = cycle.chords.filter((event) => event.phrase === phrase);
        const phraseNotes = cycle.notes.filter((event) => event.phrase === phrase);
        const rest = cycle.rests.find((event) => event.phrase === phrase);
        assert.equal(phraseChords.length, 4);
        assert.equal(phraseNotes.length, 6);
        assert.ok(rest);
        assert.equal(rest.beat, (phrase + 1) * BARS_PER_PHRASE * BEATS_PER_BAR - 4);
        assert.equal(rest.durationBeats, 4);

        for (let index = 1; index < phraseChords.length; index += 1) {
          const previous = phraseChords[index - 1].midi;
          const current = phraseChords[index].midi;
          for (const from of previous) {
            for (const to of current) {
              const interval = Math.abs(to - from);
              if (interval > 0) {
                minimumCrossfadeInterval = Math.min(
                  minimumCrossfadeInterval,
                  interval,
                );
              }
            }
          }
        }

        for (let index = 0; index < phraseNotes.length; index += 1) {
          const note = phraseNotes[index];
          assert.ok(!eventIsInsideRest(note, rest));
          assert.ok(note.beat + note.durationBeats <= rest.beat);
          assert.ok(note.midi >= 60 && note.midi <= 76);
          assert.ok(Math.abs(note.pan) <= 0.3);
          assert.ok(note.intensity <= 0.48);
          if (index > 0) {
            const previous = phraseNotes[index - 1];
            const leap = Math.abs(note.midi - previous.midi);
            maximumMelodyLeap = Math.max(maximumMelodyLeap, leap);
            assert.ok(previous.beat + previous.durationBeats <= note.beat);
          }

          if (note.beat % BEATS_PER_BAR === 0) {
            const harmony = phraseChords.find(
              (chord) =>
                note.beat >= chord.beat &&
                note.beat < chord.beat + chord.durationBeats,
            );
            assert.ok(harmony);
            assert.ok(
              harmony.midi.some(
                (midi) => pitchClass(midi) === pitchClass(note.midi),
              ),
            );
          }
        }
      }

      for (const chord of cycle.chords) {
        assert.equal(chord.midi.length, 3);
        assert.ok(chord.midi[0] < chord.midi[1]);
        assert.ok(chord.midi[1] < chord.midi[2]);
        assert.ok(chord.midi[0] >= 41 && chord.midi[2] <= 76);
        minimumLowVoiceGap = Math.min(
          minimumLowVoiceGap,
          chord.midi[1] - chord.midi[0],
        );
        maximumChordRoughness = Math.max(
          maximumChordRoughness,
          chordRoughness(chord.midi),
        );
      }

      const noteWindows = cycle.notes.map((note) => ({
        end:
          note.beat +
          note.durationBeats +
          AMBIENT_TIMBRES[note.voice].releaseSeconds * profile.tempo / 60,
        start: note.beat,
      }));
      for (const window of noteWindows) {
        const simultaneous = noteWindows.filter(
          (candidate) =>
            candidate.start < window.end && candidate.end > window.start,
        ).length;
        maximumMelodicSources = Math.max(maximumMelodicSources, simultaneous);
      }
    }

    if (seedIndex < 128) {
      assert.deepEqual(
        createAmbientCycle(seed, 1),
        createAmbientCycle(seed, 1),
      );
    }
  }

  check(
    'allListeningWorldsAreReachable',
    Object.values(worldCounts).every((count) => count > 0),
  );
  check(
    'tempoStaysModeratelySlow',
    minimumTempo >= 54 && maximumTempo <= 63,
  );
  check('visualDensityStaysCalm', maximumVisualDensity <= 0.4);
  check('visualMotionStaysCalm', maximumVisualMotion <= 0.32);
  check('chordsAlwaysUseThreeOpenVoices', minimumLowVoiceGap >= 7);
  check('chordRoughnessStaysLow', maximumChordRoughness <= 0.065);
  check(
    'crossfadesAvoidSemitoneCollisions',
    minimumCrossfadeInterval >= 2,
  );
  check('melodyRemainsSingable', maximumMelodyLeap <= 7);
  check('melodyRemainsSparse', maximumNoteRate <= 0.2);
  check('melodicSourcesNeverStack', maximumMelodicSources <= 1);
  check('everyPhraseIncludesARealRest', minimumRestShare >= 0.125);
  check(
    'engineHasOnlyThreeGentleVoices',
    Object.keys(AMBIENT_TIMBRES).sort().join(',') === 'bell,breath,pad',
  );

  report.score = {
    cyclesAudited: seedsToAudit * cyclesPerSeed,
    hoursSimulated: Math.round(totalSeconds / 36) / 100,
    maximumChordRoughness: Math.round(maximumChordRoughness * 100_000) / 100_000,
    maximumMelodicSources,
    maximumMelodyLeap,
    maximumNoteRate: Math.round(maximumNoteRate * 10_000) / 10_000,
    maximumVisualDensity: Math.round(maximumVisualDensity * 10_000) / 10_000,
    maximumVisualMotion: Math.round(maximumVisualMotion * 10_000) / 10_000,
    minimumCrossfadeInterval,
    minimumLowVoiceGap,
    minimumRestShare,
    seedsAudited: seedsToAudit,
    tempoRange: [
      Math.round(minimumTempo * 100) / 100,
      Math.round(maximumTempo * 100) / 100,
    ],
    worldCounts,
  };
}

report.assertions = assertions;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
