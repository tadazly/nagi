'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  NagiPointerField,
  NagiRendererDiagnostics,
} from './nagi-scene';
import {
  NagiAudioEngine,
  type NagiDiagnostics,
} from '../lib/nagi/audio-engine';
import {
  clamp,
  profileFromSeed,
  randomSeed,
  type SeedSnapshot,
} from '../lib/nagi/generative';

const FALLBACK_SEED = '7F3A91C2';
const NagiScene = dynamic(
  () => import('./nagi-scene').then((module) => module.NagiScene),
  { ssr: false },
);

type DebugSurface = {
  destroy: () => Promise<void>;
  getState: () => {
    audio: NagiDiagnostics | null;
    renderer: NagiRendererDiagnostics;
  };
};

declare global {
  interface Window {
    __NAGI_DEBUG__?: DebugSurface;
  }
}

export default function Home() {
  const diagnosticsRef = useRef<HTMLOutputElement>(null);
  const engineRef = useRef<NagiAudioEngine | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<NagiPointerField>({
    down: 0,
    lastAt: 0,
    lastX: 0.5,
    lastY: 0.5,
    targetEnergy: 0,
    targetX: 0.5,
    targetY: 0.5,
    x: 0.5,
    y: 0.5,
  });
  const seedRef = useRef(FALLBACK_SEED);
  const startingRef = useRef(false);
  const rendererRef = useRef<NagiRendererDiagnostics>({
    antialias: false,
    drawCalls: 0,
    fps: 0,
    frames: 0,
    pointerEnergy: 0,
    quality: 1,
    webgl: false,
  });
  const [controlsVisible, setControlsVisible] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [seedSnapshot, setSeedSnapshot] = useState<SeedSnapshot>({
    currentSeed: FALLBACK_SEED,
    incomingSeed: null,
    profile: profileFromSeed(FALLBACK_SEED),
    transition: 0,
  });
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [volume, setVolume] = useState(0.72);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const seed = randomSeed();
      seedRef.current = seed;
      setSeedSnapshot({
        currentSeed: seed,
        incomingSeed: null,
        profile: profileFromSeed(seed),
        transition: 0,
      });
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.__NAGI_DEBUG__ = {
      destroy: async () => {
        await engineRef.current?.destroy();
        engineRef.current = null;
      },
      getState: () => ({
        audio: engineRef.current?.getDiagnostics() ?? null,
        renderer: { ...rendererRef.current },
      }),
    };
    return () => {
      delete window.__NAGI_DEBUG__;
    };
  }, []);

  const revealControls = useCallback(() => {
    if (!started) return;
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);
  }, [started]);

  const updatePointer = useCallback(
    (clientX: number, clientY: number, pressed: boolean) => {
      const pointer = pointerRef.current;
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const x = clamp(clientX / width);
      const y = clamp(clientY / height);
      const now = performance.now();
      const elapsed = Math.max(12, now - pointer.lastAt);
      const distance = Math.hypot(x - pointer.lastX, y - pointer.lastY);
      const velocity = clamp((distance * 1000) / elapsed * 0.58);
      pointer.targetX = x;
      pointer.targetY = y;
      pointer.targetEnergy = Math.max(pointer.targetEnergy, velocity);
      pointer.down = pressed ? 1 : 0;
      pointer.lastX = x;
      pointer.lastY = y;
      pointer.lastAt = now;
      engineRef.current?.setInteraction(x, y, velocity, pressed);
      revealControls();
    },
    [revealControls],
  );

  const begin = useCallback(async () => {
    if (!ready || startingRef.current || engineRef.current || started) return;
    startingRef.current = true;
    setStarting(true);
    setError('');
    try {
      const debugFast = new URLSearchParams(window.location.search).has('debug');
      const engine = new NagiAudioEngine(seedRef.current, {
        debugFast,
        onSnapshot: setSeedSnapshot,
      });
      engineRef.current = engine;
      await engine.start();
      setStarted(true);
      setPlaying(true);
      setControlsVisible(true);
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4200);
    } catch {
      setError('Sound could not begin on this device. Touch once more to retry.');
      await engineRef.current?.destroy();
      engineRef.current = null;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [ready, started]);

  const togglePlaying = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) {
      setPlaying(false);
      await engine.pause();
    } else {
      await engine.resume();
      setPlaying(true);
    }
    revealControls();
  }, [playing, revealControls]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
    revealControls();
  }, [muted, revealControls]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      void engineRef.current?.destroy();
    },
    [],
  );

  const incomingOpacity = seedSnapshot.incomingSeed
    ? Math.max(0, Math.min(1, (seedSnapshot.transition - 0.58) / 0.34))
    : 0;

  return (
    <main
      className={`nagi-shell ${started ? 'has-started' : ''}`}
      data-controls-visible={controlsVisible}
      data-ready={ready}
      onPointerMove={(event) => updatePointer(event.clientX, event.clientY, event.buttons > 0)}
      onPointerDown={(event) => updatePointer(event.clientX, event.clientY, true)}
      onPointerUp={(event) => updatePointer(event.clientX, event.clientY, false)}
      onPointerCancel={(event) => updatePointer(event.clientX, event.clientY, false)}
      onClick={() => {
        if (!started) void begin();
      }}
      onPointerLeave={() => {
        pointerRef.current.targetX = 0.5;
        pointerRef.current.targetY = 0.5;
        pointerRef.current.down = 0;
        engineRef.current?.setInteraction(0.5, 0.5, 0, false);
      }}
      onFocusCapture={() => started && setControlsVisible(true)}
    >
      <div className="nagi-scene" aria-hidden="true">
        {ready && (
          <NagiScene
            diagnosticsRef={diagnosticsRef}
            engineRef={engineRef}
            pointerRef={pointerRef}
            rendererRef={rendererRef}
            seedSnapshot={seedSnapshot}
          />
        )}
      </div>
      <div className="nagi-haze" aria-hidden="true" />
      <div className="nagi-grain" aria-hidden="true" />

      <section className="nagi-center" aria-labelledby="nagi-title">
        <p className="nagi-kanji" lang="ja">凪</p>
        <h1 id="nagi-title">NAGI</h1>
        <div className="nagi-seed" aria-label={`current seed ${seedSnapshot.currentSeed}`}>
          <span style={{ opacity: 1 - incomingOpacity }}>seed {seedSnapshot.currentSeed}</span>
          {seedSnapshot.incomingSeed && (
            <span style={{ opacity: incomingOpacity }} aria-hidden="true">
              seed {seedSnapshot.incomingSeed}
            </span>
          )}
        </div>
      </section>

      {!started && (
        <button
          className="nagi-enter"
          type="button"
          onClick={begin}
          disabled={!ready || starting}
          aria-label="Enter the NAGI sound space"
        >
          <span aria-hidden="true" />
          {starting ? 'sound is arriving' : 'tap anywhere to listen'}
        </button>
      )}

      {error && <p className="nagi-error" role="alert">{error}</p>}

      <div className="nagi-controls" aria-hidden={!controlsVisible}>
        <button
          type="button"
          onClick={togglePlaying}
          aria-label={playing ? 'Pause sound' : 'Resume sound'}
          tabIndex={controlsVisible ? 0 : -1}
        >
          {playing ? 'pause' : 'listen'}
        </button>
        <span className="nagi-divider" aria-hidden="true" />
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          tabIndex={controlsVisible ? 0 : -1}
        >
          {muted ? 'unmute' : 'quiet'}
        </button>
        <label className="nagi-volume">
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min="0.06"
            max="0.9"
            step="0.01"
            value={volume}
            tabIndex={controlsVisible ? 0 : -1}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              engineRef.current?.setVolume(next);
              if (muted) {
                setMuted(false);
                engineRef.current?.setMuted(false);
              }
            }}
            aria-label="Volume"
          />
        </label>
      </div>

      <p className="nagi-status sr-only" aria-live="polite">
        {started ? (playing ? 'NAGI is sounding' : 'NAGI is paused') : ''}
      </p>
      <output ref={diagnosticsRef} id="nagi-diagnostics" hidden aria-hidden="true" />
    </main>
  );
}
