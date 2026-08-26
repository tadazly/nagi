import {
  SeededRandom,
  interpolateProfile,
  nextSeed,
  pickAmbientPitch,
  profileFromSeed,
  seedToNumber,
  smoothstep,
  type SeedSnapshot,
  type WeatherProfile,
} from './generative';

type EngineOptions = {
  debugFast?: boolean;
  onSnapshot?: (snapshot: SeedSnapshot) => void;
};

type BedVoice = {
  filter: BiquadFilterNode;
  gain: GainNode;
  oscillator: OscillatorNode;
  panner: StereoPannerNode;
};

export type NagiDiagnostics = {
  activeSources: number;
  bass: number;
  contextState: AudioContextState | 'uninitialized';
  currentSeed: string;
  incomingSeed: string | null;
  maxSchedulerJitterMs: number;
  scheduledEvents: number;
  transition: number;
  treble: number;
};

const SOFT_PARTIALS = new Float32Array([0, 1, 0.16, 0.05, 0.018, 0.008]);

export class NagiAudioEngine {
  private readonly options: EngineOptions;
  private readonly trackedSources = new Set<AudioScheduledSourceNode>();
  private analyser?: AnalyserNode;
  private analyserData?: Uint8Array<ArrayBuffer>;
  private bass = 0;
  private bed: BedVoice[] = [];
  private compressor?: DynamicsCompressorNode;
  private context?: AudioContext;
  private currentProfile: WeatherProfile;
  private currentSeed: string;
  private filter?: BiquadFilterNode;
  private incomingProfile: WeatherProfile | null = null;
  private incomingSeed: string | null = null;
  private lastSnapshotAt = -Infinity;
  private lastTickWall = 0;
  private master?: GainNode;
  private maxSchedulerJitterMs = 0;
  private muted = false;
  private nextBedWanderAt = 0;
  private nextBloomAt = 0;
  private nextDustAt = 0;
  private nextSeedAt = 0;
  private noiseBuffer?: AudioBuffer;
  private playing = false;
  private random: SeededRandom;
  private scheduledEvents = 0;
  private softWave?: PeriodicWave;
  private sourceBus?: GainNode;
  private timer?: ReturnType<typeof setInterval>;
  private transitionDuration = 0;
  private transitionStartedAt = 0;
  private treble = 0;
  private volume = 0.56;
  private wet?: GainNode;

  constructor(seed: string, options: EngineOptions = {}) {
    this.currentSeed = seed;
    this.currentProfile = profileFromSeed(seed);
    this.random = new SeededRandom(seedToNumber(seed) ^ 0x51f2e9ad);
    this.options = options;
  }

  async start() {
    if (this.context) {
      await this.resume();
      return;
    }

    const context = new AudioContext({ latencyHint: 'playback' });
    this.context = context;
    this.sourceBus = context.createGain();
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 6200;
    this.filter.Q.value = 0.38;

    const dry = context.createGain();
    dry.gain.value = 0.72;
    const convolver = context.createConvolver();
    convolver.buffer = this.createImpulse(context, 7.8);
    this.wet = context.createGain();
    this.wet.gain.value = 0.38;

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -22;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 2.2;
    this.compressor.attack.value = 0.16;
    this.compressor.release.value = 1.2;

    this.master = context.createGain();
    this.master.gain.value = 0.0001;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.86;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

    this.sourceBus.connect(this.filter);
    this.filter.connect(dry);
    dry.connect(this.compressor);
    this.filter.connect(convolver);
    convolver.connect(this.wet);
    this.wet.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(context.destination);

    this.softWave = context.createPeriodicWave(
      new Float32Array(SOFT_PARTIALS.length),
      SOFT_PARTIALS,
      { disableNormalization: false },
    );
    this.noiseBuffer = this.createNoise(context, 3.4);
    this.createBed();

    const now = context.currentTime;
    this.nextBloomAt = now + 0.25;
    this.nextDustAt = now + 9;
    this.nextBedWanderAt = now + 4;
    this.nextSeedAt = now + this.dwellSeconds(this.currentProfile);
    this.playing = true;
    this.master.gain.exponentialRampToValueAtTime(this.volume, now + 4.5);
    this.lastTickWall = 0;
    this.timer = setInterval(() => this.tick(), 220);
    this.tick();
  }

  async pause() {
    if (!this.context || !this.master || !this.playing) return;
    this.playing = false;
    this.lastTickWall = 0;
    const context = this.context;
    this.master.gain.cancelScheduledValues(context.currentTime);
    this.master.gain.setTargetAtTime(0.0001, context.currentTime, 0.18);
    await new Promise((resolve) => setTimeout(resolve, 520));
    if (!this.playing && context.state === 'running') await context.suspend();
  }

  async resume() {
    if (!this.context || !this.master) return;
    this.playing = true;
    this.lastTickWall = 0;
    if (this.context.state !== 'running') await this.context.resume();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(
      this.muted ? 0.0001 : this.volume,
      this.context.currentTime,
      0.7,
    );
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(
      muted ? 0.0001 : this.volume,
      this.context.currentTime,
      0.32,
    );
  }

  setVolume(value: number) {
    this.volume = Math.min(0.86, Math.max(0.06, value));
    if (!this.context || !this.master || this.muted) return;
    this.master.gain.setTargetAtTime(
      this.volume,
      this.context.currentTime,
      0.22,
    );
  }

  getSnapshot(): SeedSnapshot {
    const now = this.context?.currentTime ?? 0;
    const transition = this.getTransition(now);
    return {
      currentSeed: this.currentSeed,
      incomingSeed: this.incomingSeed,
      profile:
        this.incomingProfile === null
          ? this.currentProfile
          : interpolateProfile(
              this.currentProfile,
              this.incomingProfile,
              transition,
            ),
      transition,
    };
  }

  readAudioBands() {
    if (!this.analyser || !this.analyserData || !this.context) {
      return { bass: this.bass, treble: this.treble };
    }
    this.analyser.getByteFrequencyData(this.analyserData);
    const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
    const bandEnergy = (fromHz: number, toHz: number) => {
      const from = Math.max(1, Math.floor(fromHz / hzPerBin));
      const to = Math.min(
        this.analyserData!.length,
        Math.ceil(toHz / hzPerBin),
      );
      let total = 0;
      let peak = 0;
      for (let index = from; index < to; index += 1) {
        total += this.analyserData![index];
        peak = Math.max(peak, this.analyserData![index]);
      }
      return {
        average: total / Math.max(1, to - from) / 255,
        peak: peak / 255,
      };
    };
    const bassNow = bandEnergy(45, 190).average;
    const trebleBand = bandEnergy(2200, 7200);
    const trebleNow = trebleBand.average * 0.35 + trebleBand.peak * 0.65;
    this.bass += (bassNow - this.bass) * 0.055;
    this.treble += (trebleNow - this.treble) * 0.075;
    return { bass: this.bass, treble: this.treble };
  }

  getDiagnostics(): NagiDiagnostics {
    const snapshot = this.getSnapshot();
    return {
      activeSources: this.trackedSources.size,
      bass: this.bass,
      contextState: this.context?.state ?? 'uninitialized',
      currentSeed: snapshot.currentSeed,
      incomingSeed: snapshot.incomingSeed,
      maxSchedulerJitterMs: Math.round(this.maxSchedulerJitterMs),
      scheduledEvents: this.scheduledEvents,
      transition: snapshot.transition,
      treble: this.treble,
    };
  }

  async destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const source of this.trackedSources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // It may already have stopped between iteration and cleanup.
      }
      source.disconnect();
    }
    this.trackedSources.clear();
    this.bed = [];
    this.playing = false;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }

  private tick() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.playing) return;
    const wall = performance.now();
    if (this.lastTickWall > 0) {
      this.maxSchedulerJitterMs = Math.max(
        this.maxSchedulerJitterMs,
        Math.abs(wall - this.lastTickWall - 220),
      );
    }
    this.lastTickWall = wall;

    const now = context.currentTime;
    const horizon = now + 2.4;
    this.updateSeed(now);
    const profile = this.getSnapshot().profile;
    this.updateMix(profile, now);

    while (this.nextBloomAt < horizon) {
      if (this.trackedSources.size < 18) {
        this.scheduleBloom(this.nextBloomAt, profile);
      }
      this.nextBloomAt += this.bloomInterval(profile);
    }

    while (this.nextDustAt < horizon) {
      if (this.trackedSources.size < 18) {
        this.scheduleDust(this.nextDustAt, profile);
      }
      this.nextDustAt += this.dustInterval(profile);
    }

    if (now >= this.nextBedWanderAt) {
      this.wanderBed(profile, now);
      this.nextBedWanderAt = now + this.random.between(17, 38);
    }

    if (now - this.lastSnapshotAt > 0.8) {
      this.lastSnapshotAt = now;
      this.options.onSnapshot?.(this.getSnapshot());
    }
  }

  private updateSeed(now: number) {
    if (this.incomingSeed === null && now >= this.nextSeedAt) {
      this.incomingSeed = nextSeed(this.currentSeed);
      this.incomingProfile = profileFromSeed(this.incomingSeed);
      this.transitionStartedAt = now;
      this.transitionDuration = this.options.debugFast
        ? 10
        : 190 + this.incomingProfile.space * 150;
      this.options.onSnapshot?.(this.getSnapshot());
      return;
    }

    if (
      this.incomingSeed !== null &&
      now >= this.transitionStartedAt + this.transitionDuration
    ) {
      this.currentSeed = this.incomingSeed;
      this.currentProfile = this.incomingProfile!;
      this.incomingSeed = null;
      this.incomingProfile = null;
      this.random = new SeededRandom(
        seedToNumber(this.currentSeed) ^ this.scheduledEvents ^ 0x51f2e9ad,
      );
      this.nextSeedAt = now + this.dwellSeconds(this.currentProfile);
      this.options.onSnapshot?.(this.getSnapshot());
    }
  }

  private getTransition(now: number) {
    if (this.incomingSeed === null || this.transitionDuration <= 0) return 0;
    return smoothstep((now - this.transitionStartedAt) / this.transitionDuration);
  }

  private dwellSeconds(profile: WeatherProfile) {
    if (this.options.debugFast) return 11 + profile.motion * 5;
    return 430 + profile.motion * 330;
  }

  private bloomInterval(profile: WeatherProfile) {
    const base = 12.5 - profile.density * 7;
    return base * this.random.between(0.72, 1.52);
  }

  private dustInterval(profile: WeatherProfile) {
    const base = 43 - profile.density * 19;
    return base * this.random.between(0.72, 1.48);
  }

  private updateMix(profile: WeatherProfile, now: number) {
    if (!this.filter || !this.wet) return;
    const cutoff = 3600 + profile.brightness * 5500;
    this.filter.frequency.setTargetAtTime(cutoff, now, 5.5);
    this.wet.gain.setTargetAtTime(0.26 + profile.space * 0.28, now, 8);
  }

  private createBed() {
    if (!this.context || !this.sourceBus || !this.softWave) return;
    const context = this.context;
    const frequencies = [73.416, 110, 146.832, 220];
    const pans = [-0.74, 0.48, -0.18, 0.78];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.setPeriodicWave(this.softWave!);
      oscillator.frequency.value = frequency;
      oscillator.detune.value = this.random.between(-4, 4);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 820 + index * 180;
      filter.Q.value = 0.5;
      const gain = context.createGain();
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(
        0.006 + this.currentProfile.warmth * 0.005,
        context.currentTime + 9 + index * 2.2,
      );
      const panner = context.createStereoPanner();
      panner.pan.value = pans[index];
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.sourceBus!);
      oscillator.start();
      this.trackSource(oscillator, [filter, gain, panner]);
      this.bed.push({ filter, gain, oscillator, panner });
    });
  }

  private wanderBed(profile: WeatherProfile, now: number) {
    this.bed.forEach((voice, index) => {
      const detune = this.random.between(-7, 7) * (0.55 + profile.motion);
      voice.oscillator.detune.setTargetAtTime(
        detune,
        now,
        this.random.between(10, 24),
      );
      voice.filter.frequency.setTargetAtTime(
        540 + profile.brightness * 1160 + index * 120,
        now,
        this.random.between(8, 19),
      );
      voice.gain.gain.setTargetAtTime(
        0.0048 + profile.warmth * 0.006 + profile.density * 0.0015,
        now,
        this.random.between(9, 18),
      );
    });
  }

  private scheduleBloom(start: number, profile: WeatherProfile) {
    if (!this.context || !this.sourceBus || !this.softWave) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(this.softWave);
    const registerRoll = this.random.next();
    const register = registerRoll < 0.16 ? -12 : registerRoll > 0.68 ? 12 : 0;
    oscillator.frequency.setValueAtTime(
      pickAmbientPitch(profile, this.random, register),
      start,
    );
    oscillator.detune.setValueAtTime(this.random.between(-5, 5), start);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 950 + profile.brightness * 3200;
    filter.Q.value = 0.32 + profile.warmth * 0.35;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = this.random.between(-profile.spread, profile.spread);

    const duration = this.random.between(23, 49) * (0.9 + profile.space * 0.28);
    const attack = Math.min(duration * 0.42, this.random.between(8, 15));
    const release = Math.min(duration * 0.48, this.random.between(10, 18));
    const end = start + duration;
    const peak = this.random.between(0.009, 0.018) * (0.72 + profile.density);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + attack);
    envelope.gain.setValueAtTime(peak, Math.max(start + attack, end - release));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.detune.linearRampToValueAtTime(
      this.random.between(-6, 6),
      end,
    );

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sourceBus);
    oscillator.start(start);
    oscillator.stop(end + 0.08);
    this.trackSource(oscillator, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private scheduleDust(start: number, profile: WeatherProfile) {
    if (!this.context || !this.sourceBus || !this.noiseBuffer) return;
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = this.random.between(0.62, 0.95);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900 + profile.brightness * 2600;
    filter.Q.value = 0.55;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.value = this.random.between(-profile.spread, profile.spread);
    const duration = this.random.between(1.7, 3.1);
    const end = start + duration;
    const peak = 0.0012 + profile.density * 0.0015;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + duration * 0.45);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sourceBus);
    source.start(start, this.random.between(0, 0.2), duration);
    source.stop(end + 0.05);
    this.trackSource(source, [filter, envelope, panner]);
    this.scheduledEvents += 1;
  }

  private trackSource(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.trackedSources.add(source);
    source.onended = () => {
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      this.trackedSources.delete(source);
    };
  }

  private createNoise(context: AudioContext, seconds: number) {
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    const random = new SeededRandom(seedToNumber(this.currentSeed) ^ 0x87c4ad21);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      smoothed = smoothed * 0.72 + (random.next() * 2 - 1) * 0.28;
      channel[index] = smoothed;
    }
    return buffer;
  }

  private createImpulse(context: AudioContext, seconds: number) {
    const length = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const random = new SeededRandom(seedToNumber(this.currentSeed) ^ 0xe31a9f02);
    for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      let smoothed = 0;
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        smoothed = smoothed * 0.24 + (random.next() * 2 - 1) * 0.76;
        channel[index] = smoothed * (1 - progress) ** 3.15;
      }
    }
    return buffer;
  }
}
