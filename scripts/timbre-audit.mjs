import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  InstrumentSampleBank,
  INSTRUMENT_RENDERER_VERSION,
  INSTRUMENT_RENDER_PROFILES,
  renderInstrumentSampleData,
} from '../lib/nagi/instrument-rendering.ts';
import { INSTRUMENTS } from '../lib/nagi/performance.ts';

function signalStats(channel) {
  let dc = 0;
  let peak = 0;
  let sumSquares = 0;
  let differenceSquares = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const sample = channel[index];
    assert.ok(Number.isFinite(sample), `non-finite PCM at frame ${index}`);
    dc += sample;
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
    if (index > 0) {
      const difference = sample - channel[index - 1];
      differenceSquares += difference * difference;
    }
  }
  const rms = Math.sqrt(sumSquares / channel.length);
  return {
    dc: dc / channel.length,
    peak,
    rms,
    spectralProxy:
      Math.sqrt(differenceSquares / Math.max(1, channel.length - 1)) /
      Math.max(1e-9, rms),
  };
}

function interpolate(channel, frame) {
  const left = Math.max(0, Math.min(channel.length - 1, Math.floor(frame)));
  const right = Math.min(channel.length - 1, left + 1);
  const mix = frame - Math.floor(frame);
  return channel[left] + (channel[right] - channel[left]) * mix;
}

function sampleHash(sample) {
  const hash = createHash('sha256');
  for (const channel of sample.channels) {
    hash.update(Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength));
  }
  return hash.digest('hex');
}

const instruments = Object.keys(INSTRUMENTS).sort();
const profileInstruments = Object.keys(INSTRUMENT_RENDER_PROFILES).sort();
assert.equal(instruments.length, 20, 'expected all 20 NAGI instruments');
assert.deepEqual(profileInstruments, instruments, 'renderer profile coverage drifted');
assert.equal(
  new Set(Object.values(INSTRUMENT_RENDER_PROFILES).map(({ model }) => model)).size,
  instruments.length,
  'each instrument must expose a distinct acoustic model identity',
);

const fingerprints = new Set();
const reports = [];
let brighterDynamicCount = 0;
let loopedCount = 0;
let maximumColdRenderMs = 0;

for (const instrument of instruments) {
  const reference = renderInstrumentSampleData(instrument, 60, 0.62, 1, 44100);
  const repeated = renderInstrumentSampleData(instrument, 60, 0.62, 1, 44100);
  const low = renderInstrumentSampleData(instrument, 60, 0.36, 0, 48000);
  const coldRenderStartedAt = performance.now();
  const high = renderInstrumentSampleData(instrument, 60, 0.9, 0, 48000);
  maximumColdRenderMs = Math.max(
    maximumColdRenderMs,
    performance.now() - coldRenderStartedAt,
  );
  const referenceHash = sampleHash(reference);
  assert.equal(referenceHash, sampleHash(repeated), `${instrument} is not deterministic`);
  assert.ok(!fingerprints.has(referenceHash), `${instrument} PCM collides with another model`);
  fingerprints.add(referenceHash);

  const stats = signalStats(reference.channels[0]);
  const lowStats = signalStats(low.channels[0]);
  const highStats = signalStats(high.channels[0]);
  assert.ok(stats.peak > 0.8 && stats.peak <= 0.841, `${instrument} normalization drift`);
  assert.ok(stats.rms > 0.001, `${instrument} rendered near-silence`);
  assert.ok(
    Math.abs(stats.dc) / stats.rms < 0.025,
    `${instrument} has excessive DC offset`,
  );
  if (highStats.spectralProxy > lowStats.spectralProxy * 1.002) {
    brighterDynamicCount += 1;
  }

  let seamRatio = null;
  if (reference.loop) {
    loopedCount += 1;
    const channel = reference.channels[0];
    const startFrame = reference.loopStart * 44100;
    const endFrame = reference.loopEnd * 44100;
    const seam = Math.abs(interpolate(channel, endFrame) - interpolate(channel, startFrame));
    const localDelta = Math.max(
      1e-7,
      Math.abs(interpolate(channel, startFrame + 1) - interpolate(channel, startFrame)),
      Math.abs(interpolate(channel, endFrame) - interpolate(channel, endFrame - 1)),
    );
    seamRatio = seam / localDelta;
    assert.ok(seam < 0.012, `${instrument} loop value seam is audible (${seam})`);
    assert.ok(seamRatio < 2.5, `${instrument} loop seam exceeds local slope`);
  } else {
    assert.equal(reference.loopStart, 0, `${instrument} one-shot has loop start`);
    assert.equal(
      reference.loopEnd,
      INSTRUMENT_RENDER_PROFILES[instrument].sampleSeconds,
      `${instrument} one-shot duration drifted`,
    );
    const tailFrames = Math.ceil(44100 * 0.01);
    let tailPeak = 0;
    for (
      let index = reference.channels[0].length - tailFrames;
      index < reference.channels[0].length;
      index += 1
    ) {
      tailPeak = Math.max(tailPeak, Math.abs(reference.channels[0][index]));
    }
    assert.ok(tailPeak < 0.012, `${instrument} one-shot tail can click (${tailPeak})`);
  }

  reports.push({
    channels: reference.channels.length,
    instrument,
    loop: reference.loop,
    model: reference.model,
    peak: Number(stats.peak.toFixed(4)),
    rms: Number(stats.rms.toFixed(4)),
    seamRatio: seamRatio === null ? null : Number(seamRatio.toFixed(4)),
    spectralProxy: Number(stats.spectralProxy.toFixed(4)),
  });
}

assert.equal(loopedCount, 14, 'sustain/one-shot classification drifted');
assert.ok(
  brighterDynamicCount >= 16,
  `only ${brighterDynamicCount}/20 models became brighter at higher dynamics`,
);
assert.ok(
  maximumColdRenderMs < 90,
  `cold PCM render exceeded the real-time budget (${maximumColdRenderMs.toFixed(1)} ms)`,
);

class AuditAudioContext {
  sampleRate = 12000;

  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      getChannelData: (channel) => data[channel],
      length,
      numberOfChannels: channels,
      sampleRate,
    };
  }
}

const bank = new InstrumentSampleBank(new AuditAudioContext(), 8);
const first = bank.get('flute', 60, 0.62, 0);
const sameBucket = bank.get('flute', 61, 0.62, 0);
const nextBucket = bank.get('flute', 62, 0.62, 0);
assert.equal(first, sameBucket, 'same pitch bucket did not reuse its AudioBuffer');
assert.notEqual(first, nextBucket, 'different pitch buckets shared an AudioBuffer');
for (const [index, instrument] of instruments.entries()) {
  bank.get(instrument, 36 + index * 3, 0.9, index);
  assert.ok(bank.diagnostics().entries <= 8, 'sample LRU exceeded its entry cap');
}
assert.equal(bank.diagnostics().entries, 8, 'sample LRU did not retain its target size');
assert.ok(bank.diagnostics().hits >= 1, 'sample LRU did not record a cache hit');

console.log(JSON.stringify({
  cache: bank.diagnostics(),
  dynamicBrightnessPasses: brighterDynamicCount,
  instruments: reports,
  maximumColdRenderMs: Number(maximumColdRenderMs.toFixed(2)),
  renderer: INSTRUMENT_RENDERER_VERSION,
}, null, 2));
