'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  NagiRendererDiagnostics,
} from './scene';
import {
  createPointerField,
  releasePointer,
  updatePointerTarget,
  type NagiPointerField,
} from '../../lib/nagi/pointer-field';
import {
  DEFAULT_VOLUME,
  MAX_VOLUME,
  NagiAudioEngine,
  type NagiDiagnostics,
} from '../../lib/nagi/audio-engine';
import {
  clamp,
  initialEmotionFromSeed,
  profileFromSeed,
  randomSeed,
  type SeedSnapshot,
} from '../../lib/nagi/generative';
import type { PlaybackSettings } from '../../lib/nagi/playback-settings';

const FALLBACK_SEED = '7F3A91C2';
const NagiScene = lazy(() =>
  import('./scene').then(({ NagiScene }) => ({ default: NagiScene })),
);

type DebugSurface = {
  destroy: () => Promise<void>;
  getState: () => {
    audio: NagiDiagnostics | null;
    pointer: NagiPointerField;
    renderer: NagiRendererDiagnostics;
  };
};

declare global {
  interface Window {
    __NAGI_DEBUG__?: DebugSurface;
  }
}

export default function NagiExperience({
  wallpaper = null,
}: {
  wallpaper?: PlaybackSettings | null;
}) {
  const wallpaperRef = useRef(wallpaper);
  const userPausedRef = useRef(false);
  const diagnosticsRef = useRef<HTMLOutputElement>(null);
  const engineRef = useRef<NagiAudioEngine | null>(null);
  const pointerRef = useRef(createPointerField());
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
      const requestedSeed = wallpaperRef.current?.seed ||
        new URLSearchParams(window.location.search).get('seed');
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
        pointer: { ...pointerRef.current },
        renderer: {
          ...rendererRef.current,
          motion: rendererRef.current.motion ? { ...rendererRef.current.motion } : undefined,
        },
      }),
    };
    return () => {
      delete window.__NAGI_DEBUG__;
    };
  }, []);

  const updatePointer = useCallback(
    (clientX: number, clientY: number, pressed: boolean) => {
      const pointer = pointerRef.current;
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const x = clamp(clientX / width);
      const y = clamp(clientY / height);
      const velocity = updatePointerTarget(pointer, x, y, pressed, performance.now());
      engineRef.current?.setInteraction(x, y, velocity, pressed);
    },
    [],
  );

  const resetPointer = useCallback(() => {
    releasePointer(pointerRef.current);
    engineRef.current?.setInteraction(0.5, 0.5, 0, false);
  }, []);

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
      const settings = wallpaperRef.current;
      if (settings) {
        engine.setVolume(MAX_VOLUME * settings.volume / 100);
        engine.setMuted(!settings.sound || settings.volume === 0);
      }
      await engine.start();
      setStarted(true);
      setPlaying(true);
    } catch {
      setError('Sound could not begin on this device. Touch once more to retry.');
      await engineRef.current?.destroy();
      engineRef.current = null;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [ready, started]);

  useEffect(() => {
    wallpaperRef.current = wallpaper;
  }, [wallpaper]);

  useEffect(() => {
    if (!wallpaper || !ready || started || wallpaper.paused) return;
    const frame = requestAnimationFrame(() => void begin());
    return () => cancelAnimationFrame(frame);
  }, [begin, ready, started, wallpaper]);

  const wallpaperVolume = wallpaper?.volume;
  const wallpaperSound = wallpaper?.sound;
  useEffect(() => {
    if (wallpaperVolume === undefined || wallpaperSound === undefined) return;
    const nextVolume = Math.max(0.04, MAX_VOLUME * wallpaperVolume / 100);
    const nextMuted = !wallpaperSound || wallpaperVolume === 0;
    engineRef.current?.setVolume(nextVolume);
    engineRef.current?.setMuted(nextMuted);
    const frame = requestAnimationFrame(() => {
      setVolume(nextVolume);
      setMuted(nextMuted);
    });
    return () => cancelAnimationFrame(frame);
  }, [wallpaperVolume, wallpaperSound, started]);

  const wallpaperPaused = wallpaper?.paused;
  useEffect(() => {
    if (wallpaperPaused === undefined || !started) return;
    const engine = engineRef.current;
    if (!engine) return;
    const paused = wallpaperPaused || userPausedRef.current;
    const frame = requestAnimationFrame(() => setPlaying(!paused));
    void (paused ? engine.pause() : engine.resume()).catch(() => {
      setError('Sound could not resume. Reload the wallpaper to retry.');
    });
    return () => cancelAnimationFrame(frame);
  }, [wallpaperPaused, started]);

  const wallpaperSeed = wallpaper?.seed;
  useEffect(() => {
    if (wallpaperSeed === undefined || !started) return;
    if (wallpaperSeed && wallpaperSeed !== seedRef.current) {
      seedRef.current = wallpaperSeed;
      engineRef.current?.transitionToSeed(wallpaperSeed);
    }
  }, [wallpaperSeed, started]);

  const togglePlaying = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) {
      userPausedRef.current = true;
      setPlaying(false);
      await engine.pause();
    } else {
      if (wallpaperRef.current?.paused) return;
      userPausedRef.current = false;
      await engine.resume();
      setPlaying(true);
    }
  }, [playing]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  }, [muted]);

  const randomize = useCallback(() => {
    const next = randomSeed();
    seedRef.current = next;
    if (engineRef.current) {
      engineRef.current.transitionToSeed(next);
    } else {
      setSeedSnapshot({
        currentSeed: next,
        emotion: initialEmotionFromSeed(next),
        incomingEmotion: null,
        incomingSeed: null,
        profile: profileFromSeed(next),
        transition: 0,
      });
    }
  }, []);

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
      void engineRef.current?.destroy();
    },
    [],
  );

  const outgoingProgress = seedSnapshot.incomingSeed
    ? clamp(seedSnapshot.transition / 0.48)
    : 0;
  const incomingProgress = seedSnapshot.incomingSeed
    ? clamp((seedSnapshot.transition - 0.52) / 0.48)
    : 0;
  const outgoingEase =
    outgoingProgress * outgoingProgress * (3 - 2 * outgoingProgress);
  const incomingEase =
    incomingProgress * incomingProgress * (3 - 2 * incomingProgress);

  return (
    <main
      className={`nagi-shell ${started ? 'has-started' : ''}`}
      data-ready={ready}
      data-wallpaper={Boolean(wallpaper)}
      data-show-title={wallpaper?.showtitle ?? true}
      data-show-controls={wallpaper?.showcontrols ?? true}
      onPointerMove={(event) => updatePointer(event.clientX, event.clientY, event.buttons > 0)}
      onPointerDown={(event) => {
        updatePointer(event.clientX, event.clientY, true);
        // A regular browser may hold the automatic start until a user gesture.
        if (wallpaper && startingRef.current) void engineRef.current?.resume();
      }}
      onPointerUp={(event) => updatePointer(event.clientX, event.clientY, false)}
      onPointerCancel={resetPointer}
      onClick={() => {
        if (!started) void begin();
      }}
      onPointerLeave={resetPointer}
    >
      <div className="nagi-scene" aria-hidden="true">
        {ready && (
          <Suspense fallback={null}>
            <NagiScene
              diagnosticsRef={diagnosticsRef}
              engineRef={engineRef}
              pointerRef={pointerRef}
              rendererRef={rendererRef}
              seedSnapshot={seedSnapshot}
              frameRate={wallpaper?.fps}
              paused={wallpaper?.paused}
            />
          </Suspense>
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
          <span
            style={{
              filter: `blur(${outgoingEase * 1.8}px)`,
              opacity: 1 - outgoingEase,
              transform: `translateY(${-outgoingEase * 0.14}rem)`,
            }}
          >
            {seedSnapshot.emotion} {seedSnapshot.currentSeed}
          </span>
          {seedSnapshot.incomingSeed && (
            <span
              style={{
                filter: `blur(${(1 - incomingEase) * 1.8}px)`,
                opacity: incomingEase,
                transform: `translateY(${(1 - incomingEase) * 0.14}rem)`,
              }}
              aria-hidden="true"
            >
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

      <div
        className="nagi-controls-area"
        inert={!started}
        onPointerEnter={resetPointer}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
        style={wallpaper ? {
          paddingBottom: `max(${wallpaper.toolbarbottom}px, env(safe-area-inset-bottom))`,
        } : undefined}
      >
        <div className="nagi-controls" role="group" aria-label="Playback controls">
          <button
            type="button"
            onClick={togglePlaying}
            aria-label={playing ? 'Pause sound' : 'Resume sound'}
          >
            {playing ? 'pause' : 'listen'}
          </button>
          <span className="nagi-divider" aria-hidden="true" />
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? 'unmute' : 'quiet'}
          </button>
          <span className="nagi-divider" aria-hidden="true" />
          <button
            type="button"
            onClick={randomize}
            aria-label="Randomize the musical and visual seed"
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
      </div>

      <p className="nagi-status sr-only" aria-live="polite">
        {started ? (playing ? 'NAGI is sounding' : 'NAGI is paused') : ''}
      </p>
      <output ref={diagnosticsRef} id="nagi-diagnostics" hidden aria-hidden="true" />
    </main>
  );
}
