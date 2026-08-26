'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import dynamic from 'next/dynamic';
import type {
  NagiPointerField,
  NagiRendererDiagnostics,
} from './nagi-scene';
import {
  DEFAULT_VOLUME,
  MAX_VOLUME,
  NagiAudioEngine,
  type NagiDiagnostics,
} from '../lib/nagi/audio-engine';
import {
  clamp,
  initialEmotionFromSeed,
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
    barPhase: 0,
    beatPhase: 0,
    contextLosses: 0,
    drawCalls: 0,
    fps: 0,
    frames: 0,
    maxFrameGapMs: 0,
    pointerEnergy: 0,
    pulse: 0,
    quality: 1,
    styleName: 'mist tide',
    styleVariant: 0,
    webgl: false,
  });
  const [controlsVisible, setControlsVisible] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [seedSnapshot, setSeedSnapshot] = useState<SeedSnapshot>({
    currentSeed: FALLBACK_SEED,
    emotion: initialEmotionFromSeed(FALLBACK_SEED),
    incomingEmotion: null,
    incomingSeed: null,
    profile: profileFromSeed(FALLBACK_SEED),
    transition: 0,
  });
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const requestedSeed = new URLSearchParams(window.location.search).get('seed');
      const seed = requestedSeed && /^[0-9a-f]{8}$/i.test(requestedSeed)
        ? requestedSeed.toUpperCase()
        : randomSeed();
      seedRef.current = seed;
      setSeedSnapshot({
        currentSeed: seed,
        emotion: initialEmotionFromSeed(seed),
        incomingEmotion: null,
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

  const randomize = useCallback(() => {
    const next = randomSeed();
    const nextEmotion = initialEmotionFromSeed(next);
    seedRef.current = next;
    if (engineRef.current) {
      engineRef.current.transitionToSeed(next);
      setSeedSnapshot((snapshot) => ({
        ...snapshot,
        incomingEmotion: nextEmotion,
        incomingSeed: next,
        transition: Math.max(0.025, snapshot.transition),
      }));
    } else {
      setSeedSnapshot({
        currentSeed: next,
        emotion: nextEmotion,
        incomingEmotion: null,
        incomingSeed: null,
        profile: profileFromSeed(next),
        transition: 0,
      });
    }
    revealControls();
  }, [revealControls]);

  const applyVolume = useCallback(
    (next: number) => {
      const safeVolume = clamp(next, 0.04, MAX_VOLUME);
      setVolume(safeVolume);
      engineRef.current?.setVolume(safeVolume);
      if (muted) {
        setMuted(false);
        engineRef.current?.setMuted(false);
      }
    },
    [muted],
  );

  const applyVolumeFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      const next = 0.04 + ratio * (MAX_VOLUME - 0.04);
      applyVolume(Math.round(next * 100) / 100);
    },
    [applyVolume],
  );

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      void engineRef.current?.destroy();
    },
    [],
  );

  const incomingProgress = seedSnapshot.incomingSeed
    ? Math.max(0, Math.min(1, (seedSnapshot.transition + 0.12) / 0.38))
    : 0;
  const incomingOpacity =
    incomingProgress * incomingProgress * (3 - 2 * incomingProgress);

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
        <div
          className="nagi-seed"
          aria-label={`current musical state ${seedSnapshot.emotion} ${seedSnapshot.currentSeed}`}
        >
          <span style={{ opacity: 1 - incomingOpacity }}>
            {seedSnapshot.emotion} {seedSnapshot.currentSeed}
          </span>
          {seedSnapshot.incomingSeed && (
            <span style={{ opacity: incomingOpacity }} aria-hidden="true">
              {seedSnapshot.incomingEmotion} {seedSnapshot.incomingSeed}
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
        <span className="nagi-divider" aria-hidden="true" />
        <button
          type="button"
          onClick={randomize}
          aria-label="Randomize the musical and visual seed"
          tabIndex={controlsVisible ? 0 : -1}
        >
          random
        </button>
        <label className="nagi-volume">
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min="0.04"
            max={MAX_VOLUME}
            step="0.01"
            value={volume}
            tabIndex={controlsVisible ? 0 : -1}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              applyVolumeFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                applyVolumeFromPointer(event);
              }
            }}
            onChange={(event) => applyVolume(Number(event.target.value))}
            aria-label="Volume"
            aria-valuetext={`${Math.round((volume / MAX_VOLUME) * 100)} percent`}
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
