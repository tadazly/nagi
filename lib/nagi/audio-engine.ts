import {
  AMBIENT_TIMBRES,
  BEATS_PER_BAR,
  BEATS_PER_CYCLE,
  BARS_PER_PHRASE,
  createAmbientCycle,
  createListeningProfile,
  midiToFrequency,
  type AmbientChordEvent,
  type AmbientNoteEvent,
  type ListeningProfile,
  type TimbreRecipe,
} from './ambient-score.ts';
import {
  SeededRandom,
  clamp,
  deriveSeedNumber,
  interpolateProfile,
  profileFromSeed,
  smootherstep,
  type SeedSnapshot,
} from './generative.ts';

type EngineOptions = {
  debugFast?: boolean;
  onSnapshot?: (snapshot: SeedSnapshot) => void;
};

export type AudioBands = {
  arousal: number;
  barPhase: number;
  bass: number;
  beatPhase: number;
  interaction: number;
  mid: number;
  phrase: number;
  pulse: number;
  tension: number;
  treble: number;
  valence: number;
};

export type NagiDiagnostics = {
  activeSources: number;
  arousal: number;
  bar: number;
  barPhase: number;
  beat: number;
  beatPhase: number;
  bpm: number;
  contextState: AudioContextState | 'uninitialized';
  currentSeed: string;
  cycle: number;
  intentionalRest: boolean;
  key: string;
  maximumActiveSources: number;
  musicalLayers: number;
  outputPeak: number;
  outputRms: number;
  recoveredHarmonyEvents: number;
  scheduledChordEvents: number;
  scheduledMelodyEvents: number;
  transition: number;
  valence: number;
  volume: number;
  world: string;
};

type ScheduledEntry = {
  end: number;
};

type SeedTransition = {
  commitAt: number;
  committed: boolean;
  endAt: number;
  fromProfile: ListeningProfile;
  fromSeed: string;
  startedAt: number;
  toProfile: ListeningProfile;
  toSeed: string;
};

const SCHEDULER_INTERVAL_MS = 100;
const SCHEDULE_HORIZON_SECONDS = 3.2;
const SCHEDULE_EPSILON_SECONDS = 0.035;
const PAD_TAIL_SECONDS = 0.72;
const TRANSITION_SECONDS = 12;
const DEBUG_TRANSITION_SECONDS = 1.6;

export const DEFAULT_VOLUME = 0.58;
export const MAX_VOLUME = 0.78;

const safeParamValue = (value: number) => Math.max(0.0001, value);

export class NagiAudioEngine {
  private readonly options: EngineOptions;
  private readonly trackedSources = new Set<AudioScheduledSourceNode>();
  private readonly activeVoices = new Map<
    AudioScheduledSourceNode,
    'pad' | 'breath' | 'bell'
  >();
  private readonly permanentSources = new Set<AudioScheduledSourceNode>();
  private readonly scheduledEntries = new Map<string, ScheduledEntry>();
  private readonly waveCache = new Map<string, PeriodicWave>();

  private analyser?: AnalyserNode;
  private analyserFrequencyData?: Uint8Array<ArrayBuffer>;
  private analyserTimeData?: Float32Array<ArrayBuffer>;
  private compressor?: DynamicsCompressorNode;
  private context?: AudioContext;
  private dryBus?: GainNode;
  private masterGain?: GainNode;
  private presenceFilter?: BiquadFilterNode;
  private reverbInput?: GainNode;
  private sceneGain?: GainNode;
  private airGain?: GainNode;

  private bands: AudioBands = {
    arousal: 0.15,
    barPhase: 0,
    bass: 0,
    beatPhase: 0,
    interaction: 0,
    mid: 0,
    phrase: 0,
    pulse: 0,
    tension: 0.08,
    treble: 0,
    valence: 0.62,
  };
  private currentSeed: string;
  private profile: ListeningProfile;
  private interval?: ReturnType<typeof setInterval>;
  private transition: SeedTransition | null = null;
  private queuedSeed: string | null = null;
  private transportOrigin = 0;
  private volume = DEFAULT_VOLUME;
  private muted = false;
  private destroyed = false;
  private interaction = 0;
  private outputPeak = 0;
  private outputRms = 0;
  private maximumActiveSources = 0;
  private scheduledChordEvents = 0;
  private scheduledMelodyEvents = 0;
  private recoveredHarmonyEvents = 0;

  constructor(seed: string, options: EngineOptions = {}) {
    this.currentSeed = seed;
    this.profile = createListeningProfile(seed);
    this.options = options;
    this.bands.arousal = this.profile.arousal;
    this.bands.valence = this.profile.valence;
  }

  async start() {
    if (this.destroyed) throw new Error('Cannot restart a destroyed audio engine.');
    if (this.context) {
      await this.resume();
      return;
    }

    const context = new AudioContext({ latencyHint: 'playback' });
    this.context = context;
    this.buildAudioGraph(context);
    this.startAirBed(context);
    if (context.state !== 'running') await context.resume();

    this.transportOrigin = context.currentTime + 0.08;
    this.masterGain?.gain.setValueAtTime(0.0001, context.currentTime);
    this.masterGain?.gain.exponentialRampToValueAtTime(
      safeParamValue(this.volume),
      context.currentTime + 1.8,
    );
    this.tick();
    this.interval = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.emitSnapshot();
  }

  private buildAudioGraph(context: AudioContext) {
    const dryBus = context.createGain();
    const dryGain = context.createGain();
    const reverbInput = context.createGain();
    const convolver = context.createConvolver();
    const wetFilter = context.createBiquadFilter();
    const wetGain = context.createGain();
    const sceneGain = context.createGain();
    const presenceFilter = context.createBiquadFilter();
    const rumbleFilter = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const masterGain = context.createGain();
    const analyser = context.createAnalyser();

    dryGain.gain.value = 0.84;
    wetGain.gain.value = 0.25;
    sceneGain.gain.value = 1;

    convolver.buffer = this.createReverbImpulse(context);
    wetFilter.type = 'lowpass';
    wetFilter.frequency.value = 3_600;
    wetFilter.Q.value = 0.25;

    presenceFilter.type = 'lowpass';
    presenceFilter.frequency.value = 2_350;
    presenceFilter.Q.value = 0.22;

    rumbleFilter.type = 'highpass';
    rumbleFilter.frequency.value = 34;
    rumbleFilter.Q.value = 0.3;

    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 2.2;
    compressor.attack.value = 0.035;
    compressor.release.value = 0.72;

    masterGain.gain.value = 0.0001;
    analyser.fftSize = 2_048;
    analyser.smoothingTimeConstant = 0.84;

    dryBus.connect(dryGain);
    dryGain.connect(sceneGain);
    reverbInput.connect(convolver);
    convolver.connect(wetFilter);
    wetFilter.connect(wetGain);
    wetGain.connect(sceneGain);
    sceneGain.connect(presenceFilter);
    presenceFilter.connect(rumbleFilter);
    rumbleFilter.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(context.destination);

    this.dryBus = dryBus;
    this.reverbInput = reverbInput;
    this.sceneGain = sceneGain;
    this.presenceFilter = presenceFilter;
    this.compressor = compressor;
    this.masterGain = masterGain;
    this.analyser = analyser;
    this.analyserFrequencyData = new Uint8Array(analyser.frequencyBinCount);
    this.analyserTimeData = new Float32Array(analyser.fftSize);
  }

  private createReverbImpulse(context: AudioContext) {
    const seconds = 4.2;
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    const random = new SeededRandom(
      deriveSeedNumber(this.currentSeed, 'reverb-impulse'),
    );

    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);
      let smoothNoise = 0;
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        const white = random.next() * 2 - 1;
        smoothNoise = smoothNoise * 0.58 + white * 0.42;
        const decay = (1 - progress) ** 3.1;
        const earlyShape = 0.58 + Math.min(1, index / (context.sampleRate * 0.055)) * 0.42;
        channel[index] = smoothNoise * decay * earlyShape * 0.62;
      }
    }
    return impulse;
  }

  private startAirBed(context: AudioContext) {
    if (!this.dryBus || !this.reverbInput) return;
    const duration = 6;
    const buffer = context.createBuffer(
      1,
      Math.floor(context.sampleRate * duration),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    const random = new SeededRandom(deriveSeedNumber(this.currentSeed, 'air-bed'));
    let brown = 0;
    for (let index = 0; index < data.length; index += 1) {
      brown = brown * 0.985 + (random.next() * 2 - 1) * 0.015;
      data[index] = brown * 0.42;
    }

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const airGain = context.createGain();
    const wetSend = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();

    source.buffer = buffer;
    source.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 90;
    highpass.Q.value = 0.25;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 780;
    lowpass.Q.value = 0.2;
    airGain.gain.value = 0.0052;
    wetSend.gain.value = 0.42;
    lfo.frequency.value = 0.035;
    lfoDepth.gain.value = 0.00135;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(airGain);
    airGain.connect(this.dryBus);
    airGain.connect(wetSend);
    wetSend.connect(this.reverbInput);
    lfo.connect(lfoDepth);
    lfoDepth.connect(airGain.gain);

    this.airGain = airGain;
    this.permanentSources.add(source);
    this.permanentSources.add(lfo);
    source.start();
    lfo.start();
  }

  private periodicWave(name: keyof typeof AMBIENT_TIMBRES) {
    const cached = this.waveCache.get(name);
    if (cached) return cached;
    const context = this.context;
    if (!context) throw new Error('Audio context is not ready.');
    const recipe = AMBIENT_TIMBRES[name];
    const maximumRatio = Math.max(...recipe.partials.map((partial) => partial.ratio));
    const real = new Float32Array(maximumRatio + 1);
    const imaginary = new Float32Array(maximumRatio + 1);
    recipe.partials.forEach((partial) => {
      imaginary[partial.ratio] = partial.amplitude;
    });
    const wave = context.createPeriodicWave(real, imaginary, {
      disableNormalization: false,
    });
    this.waveCache.set(name, wave);
    return wave;
  }

  private scheduleTone(
    midi: number,
    at: number,
    bodySeconds: number,
    intensity: number,
    pan: number,
    recipe: TimbreRecipe,
    waveName: keyof typeof AMBIENT_TIMBRES,
  ) {
    const context = this.context;
    if (!context || !this.dryBus || !this.reverbInput) return;

    const oscillator = context.createOscillator();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const drySend = context.createGain();
    const wetSend = context.createGain();
    const attackEnd = at + Math.min(recipe.attackSeconds, bodySeconds * 0.9);
    const releaseStart = waveName === 'pad'
      ? Math.min(
          at + bodySeconds,
          Math.max(attackEnd + 0.15, at + bodySeconds - 2.8),
        )
      : at + bodySeconds;
    const stopAt = waveName === 'pad'
      ? at + bodySeconds + PAD_TAIL_SECONDS
      : releaseStart + recipe.releaseSeconds;
    const gain = safeParamValue(recipe.gain * intensity);

    oscillator.setPeriodicWave(this.periodicWave(waveName));
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), at);
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(recipe.highpassHz, at);
    highpass.Q.value = 0.22;
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(
      recipe.lowpassHz * (0.82 + this.profile.brightness * 0.34),
      at,
    );
    lowpass.Q.value = 0.28;
    panner.pan.setValueAtTime(clamp(pan, -0.72, 0.72), at);
    drySend.gain.value = 1;
    wetSend.gain.value = recipe.reverbSend;

    envelope.gain.setValueAtTime(0.0001, at);
    if (waveName === 'bell') {
      envelope.gain.exponentialRampToValueAtTime(gain, attackEnd);
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    } else {
      envelope.gain.linearRampToValueAtTime(gain, attackEnd);
      envelope.gain.setValueAtTime(gain, releaseStart);
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    }

    if (waveName === 'breath' && bodySeconds > 1.2) {
      const vibrato = new Float32Array(48);
      for (let index = 0; index < vibrato.length; index += 1) {
        const fade = Math.min(1, index / 12);
        vibrato[index] = Math.sin((index / (vibrato.length - 1)) * Math.PI * 10) * 3.2 * fade;
      }
      oscillator.detune.setValueCurveAtTime(vibrato, at + 0.5, Math.max(0.2, bodySeconds - 0.5));
    }

    oscillator.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(envelope);
    envelope.connect(panner);
    panner.connect(drySend);
    panner.connect(wetSend);
    drySend.connect(this.dryBus);
    wetSend.connect(this.reverbInput);

    this.trackSource(oscillator, waveName);
    oscillator.start(at);
    oscillator.stop(stopAt + 0.08);
  }

  private trackSource(
    source: AudioScheduledSourceNode,
    voice: 'pad' | 'breath' | 'bell',
  ) {
    this.trackedSources.add(source);
    this.activeVoices.set(source, voice);
    this.maximumActiveSources = Math.max(
      this.maximumActiveSources,
      this.trackedSources.size + this.permanentSources.size,
    );
    source.addEventListener('ended', () => {
      this.trackedSources.delete(source);
      this.activeVoices.delete(source);
      source.disconnect();
    }, { once: true });
  }

  private scheduleChord(
    event: AmbientChordEvent,
    at: number,
    bodySeconds: number,
  ) {
    const pans = [-0.34, 0, 0.34] as const;
    event.midi.forEach((midi, index) => {
      this.scheduleTone(
        midi,
        at,
        bodySeconds,
        event.intensity / Math.sqrt(event.midi.length),
        pans[index],
        AMBIENT_TIMBRES.pad,
        'pad',
      );
    });
    this.scheduledChordEvents += 1;
  }

  private scheduleNote(event: AmbientNoteEvent, at: number, bodySeconds: number) {
    const recipe = AMBIENT_TIMBRES[event.voice];
    this.scheduleTone(
      event.midi,
      at,
      bodySeconds,
      event.intensity,
      event.pan,
      recipe,
      event.voice,
    );
    this.scheduledMelodyEvents += 1;
  }

  private tick() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.destroyed) return;
    const now = context.currentTime;
    this.updateTransition(now);
    this.scheduleWindow(now + SCHEDULE_EPSILON_SECONDS, now + SCHEDULE_HORIZON_SECONDS);
    this.updateAnalysis();
    this.updateTransportBands(now);
    this.interaction *= 0.91;

    for (const [key, entry] of this.scheduledEntries) {
      if (entry.end < now - 2) this.scheduledEntries.delete(key);
    }
  }

  private scheduleWindow(windowStart: number, windowEnd: number) {
    const secondsPerBeat = 60 / this.profile.tempo;
    const startBeat = Math.max(0, (windowStart - this.transportOrigin) / secondsPerBeat);
    const endBeat = Math.max(0, (windowEnd - this.transportOrigin) / secondsPerBeat);
    const firstCycle = Math.max(0, Math.floor(startBeat / BEATS_PER_CYCLE));
    const lastCycle = Math.max(firstCycle, Math.floor(endBeat / BEATS_PER_CYCLE));

    for (let cycleIndex = firstCycle; cycleIndex <= lastCycle; cycleIndex += 1) {
      const cycle = createAmbientCycle(this.currentSeed, cycleIndex);
      const cycleBeat = cycleIndex * BEATS_PER_CYCLE;
      cycle.chords.forEach((event, eventIndex) => {
        const key = `chord:${cycleIndex}:${eventIndex}`;
        if (this.scheduledEntries.has(key)) return;
        const intendedStart =
          this.transportOrigin + (cycleBeat + event.beat) * secondsPerBeat;
        const intendedBodyEnd = intendedStart + event.durationBeats * secondsPerBeat;
        const audibleEnd = intendedBodyEnd + PAD_TAIL_SECONDS;
        if (intendedStart > windowEnd || audibleEnd <= windowStart) return;

        const recovered = intendedStart < windowStart;
        const actualStart = recovered ? windowStart : intendedStart;
        const bodySeconds = Math.max(0.65, intendedBodyEnd - actualStart);
        this.scheduleChord(event, actualStart, bodySeconds);
        if (recovered) this.recoveredHarmonyEvents += 1;
        this.scheduledEntries.set(key, {
          end: actualStart + bodySeconds + PAD_TAIL_SECONDS,
        });
      });

      cycle.notes.forEach((event, eventIndex) => {
        const key = `note:${cycleIndex}:${eventIndex}`;
        if (this.scheduledEntries.has(key)) return;
        const intendedStart =
          this.transportOrigin + (cycleBeat + event.beat) * secondsPerBeat;
        if (intendedStart < windowStart || intendedStart > windowEnd) return;
        const bodySeconds = event.durationBeats * secondsPerBeat;
        this.scheduleNote(event, intendedStart, bodySeconds);
        this.scheduledEntries.set(key, {
          end:
            intendedStart +
            bodySeconds +
            AMBIENT_TIMBRES[event.voice].releaseSeconds,
        });
      });
    }
  }

  private updateAnalysis() {
    if (
      !this.analyser ||
      !this.analyserFrequencyData ||
      !this.analyserTimeData
    ) return;
    this.analyser.getByteFrequencyData(this.analyserFrequencyData);
    this.analyser.getFloatTimeDomainData(this.analyserTimeData);

    let squared = 0;
    let peak = 0;
    for (const sample of this.analyserTimeData) {
      squared += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(squared / Math.max(1, this.analyserTimeData.length));
    this.outputRms += (rms - this.outputRms) * 0.18;
    this.outputPeak = Math.max(peak, this.outputPeak * 0.94);

    const averageBins = (from: number, to: number) => {
      let sum = 0;
      let count = 0;
      for (
        let index = Math.max(0, from);
        index < Math.min(this.analyserFrequencyData!.length, to);
        index += 1
      ) {
        sum += this.analyserFrequencyData![index];
        count += 1;
      }
      return count > 0 ? sum / count / 255 : 0;
    };

    const bass = averageBins(1, 8);
    const mid = averageBins(8, 42);
    const treble = averageBins(42, 140);
    this.bands.bass += (bass - this.bands.bass) * 0.2;
    this.bands.mid += (mid - this.bands.mid) * 0.2;
    this.bands.treble += (treble - this.bands.treble) * 0.2;
  }

  private updateTransportBands(now: number) {
    const secondsPerBeat = 60 / this.profile.tempo;
    const elapsedBeats = Math.max(0, (now - this.transportOrigin) / secondsPerBeat);
    const beatInBar = elapsedBeats % BEATS_PER_BAR;
    const beatPhase = beatInBar % 1;
    const phraseBeats = BARS_PER_PHRASE * BEATS_PER_BAR;
    this.bands.beatPhase = beatPhase;
    this.bands.barPhase = beatInBar / BEATS_PER_BAR;
    this.bands.phrase = (elapsedBeats % phraseBeats) / phraseBeats;
    this.bands.pulse = Math.exp(-beatPhase * 7.2) * 0.2;
    this.bands.tension = 0.075 + Math.sin(this.bands.phrase * Math.PI) ** 2 * 0.055;
    this.bands.arousal = clamp(this.profile.arousal + this.interaction * 0.035, 0, 1);
    this.bands.valence = this.profile.valence;
    this.bands.interaction = this.interaction;
  }

  async pause() {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain || context.state !== 'running') return;
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(safeParamValue(masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    await new Promise((resolve) => setTimeout(resolve, 620));
    if (!this.destroyed && context.state === 'running') await context.suspend();
  }

  async resume() {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain || this.destroyed) return;
    if (context.state !== 'running') await context.resume();
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(
      safeParamValue(this.muted ? 0.0001 : this.volume),
      now + 0.9,
    );
    this.tick();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.updateMasterLevel(0.45);
  }

  setVolume(value: number) {
    this.volume = clamp(value, 0.04, MAX_VOLUME);
    this.updateMasterLevel(0.16);
  }

  private updateMasterLevel(seconds: number) {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) return;
    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(safeParamValue(masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(
      safeParamValue(this.muted ? 0.0001 : this.volume),
      now + seconds,
    );
  }

  transitionToSeed(seed: string) {
    if (!seed || seed === this.currentSeed) return;
    const context = this.context;
    if (!context || !this.sceneGain) {
      this.currentSeed = seed;
      this.profile = createListeningProfile(seed);
      this.emitSnapshot();
      return;
    }
    if (this.transition) {
      this.queuedSeed = seed;
      return;
    }

    const now = context.currentTime;
    const duration = this.options.debugFast
      ? DEBUG_TRANSITION_SECONDS
      : TRANSITION_SECONDS;
    const commitAt = now + duration * 0.46;
    const endAt = now + duration;
    this.transition = {
      commitAt,
      committed: false,
      endAt,
      fromProfile: this.profile,
      fromSeed: this.currentSeed,
      startedAt: now,
      toProfile: createListeningProfile(seed),
      toSeed: seed,
    };

    this.sceneGain.gain.cancelScheduledValues(now);
    this.sceneGain.gain.setValueAtTime(safeParamValue(this.sceneGain.gain.value), now);
    this.sceneGain.gain.exponentialRampToValueAtTime(0.018, commitAt);
    this.sceneGain.gain.setValueAtTime(0.018, commitAt + duration * 0.035);
    this.sceneGain.gain.exponentialRampToValueAtTime(1, endAt);
    this.emitSnapshot();
  }

  private updateTransition(now: number) {
    const transition = this.transition;
    if (!transition) return;

    if (!transition.committed && now >= transition.commitAt) {
      transition.committed = true;
      this.stopScheduledMusic();
      this.currentSeed = transition.toSeed;
      this.profile = transition.toProfile;
      this.transportOrigin = now + 0.08;
      this.scheduledEntries.clear();
      this.waveCache.clear();
    }

    this.emitSnapshot();
    if (now < transition.endAt) return;

    this.transition = null;
    this.emitSnapshot();
    const queued = this.queuedSeed;
    this.queuedSeed = null;
    if (queued && queued !== this.currentSeed) this.transitionToSeed(queued);
  }

  setInteraction(x: number, y: number, velocity: number, pressed = false) {
    const context = this.context;
    this.interaction = clamp(
      Math.max(this.interaction * 0.82, velocity * 0.42 + (pressed ? 0.06 : 0)),
      0,
      1,
    );
    if (!context) return;
    const now = context.currentTime;
    const targetCutoff = 1_900 + clamp(1 - y) * 720 + this.interaction * 260;
    this.presenceFilter?.frequency.setTargetAtTime(targetCutoff, now, 0.32);
    this.airGain?.gain.setTargetAtTime(
      0.0048 + clamp(x) * 0.0007 + this.interaction * 0.0006,
      now,
      0.45,
    );
  }

  getSnapshot(): SeedSnapshot {
    const transition = this.transition;
    if (!transition || !this.context) {
      return {
        currentSeed: this.currentSeed,
        emotion: this.profile.emotion,
        incomingEmotion: null,
        incomingSeed: null,
        profile: profileFromSeed(this.currentSeed),
        transition: 0,
      };
    }
    const progress = clamp(
      (this.context.currentTime - transition.startedAt) /
        Math.max(0.001, transition.endAt - transition.startedAt),
    );
    return {
      currentSeed: transition.fromSeed,
      emotion: transition.fromProfile.emotion,
      incomingEmotion: transition.toProfile.emotion,
      incomingSeed: transition.toSeed,
      profile: interpolateProfile(
        profileFromSeed(transition.fromSeed),
        profileFromSeed(transition.toSeed),
        smootherstep(progress),
      ),
      transition: progress,
    };
  }

  private emitSnapshot() {
    this.options.onSnapshot?.(this.getSnapshot());
  }

  readAudioBands(): AudioBands {
    const context = this.context;
    if (context?.state === 'running') this.updateTransportBands(context.currentTime);
    return { ...this.bands };
  }

  getDiagnostics(): NagiDiagnostics {
    const context = this.context;
    const now = context?.currentTime ?? 0;
    const secondsPerBeat = 60 / this.profile.tempo;
    const elapsedBeats = Math.max(0, (now - this.transportOrigin) / secondsPerBeat);
    const beatInBar = elapsedBeats % BEATS_PER_BAR;
    const phraseBeat = elapsedBeats % (BARS_PER_PHRASE * BEATS_PER_BAR);
    const transition = this.transition;
    const transitionProgress = transition && context
      ? clamp((now - transition.startedAt) / (transition.endAt - transition.startedAt))
      : 0;
    return {
      activeSources: this.trackedSources.size + this.permanentSources.size,
      arousal: this.profile.arousal,
      bar: Math.floor(elapsedBeats / BEATS_PER_BAR),
      barPhase: beatInBar / BEATS_PER_BAR,
      beat: Math.floor(beatInBar),
      beatPhase: beatInBar % 1,
      bpm: Math.round(this.profile.tempo * 100) / 100,
      contextState: context?.state ?? 'uninitialized',
      currentSeed: this.currentSeed,
      cycle: Math.floor(elapsedBeats / BEATS_PER_CYCLE),
      intentionalRest: phraseBeat >= 28,
      key: this.profile.keyName,
      maximumActiveSources: this.maximumActiveSources,
      musicalLayers: new Set(this.activeVoices.values()).size,
      outputPeak: Math.round(this.outputPeak * 10_000) / 10_000,
      outputRms: Math.round(this.outputRms * 10_000) / 10_000,
      recoveredHarmonyEvents: this.recoveredHarmonyEvents,
      scheduledChordEvents: this.scheduledChordEvents,
      scheduledMelodyEvents: this.scheduledMelodyEvents,
      transition: transitionProgress,
      valence: this.profile.valence,
      volume: this.muted ? 0 : this.volume,
      world: this.profile.world.label,
    };
  }

  private stopScheduledMusic() {
    for (const source of this.trackedSources) {
      try {
        source.stop();
      } catch {
        // A source may already have ended between iteration and stop().
      }
    }
    this.trackedSources.clear();
    this.activeVoices.clear();
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    this.stopScheduledMusic();
    for (const source of this.permanentSources) {
      try {
        source.stop();
      } catch {
        // The AudioContext may already have released the source.
      }
      source.disconnect();
    }
    this.permanentSources.clear();
    this.scheduledEntries.clear();
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
