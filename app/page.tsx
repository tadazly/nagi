'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NagiAudioEngine,
  type NagiDiagnostics,
} from '../lib/nagi/audio-engine';
import {
  clamp,
  profileFromSeed,
  randomSeed,
  seedToNumber,
  type SeedSnapshot,
} from '../lib/nagi/generative';

const FALLBACK_SEED = '7F3A91C2';

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_audio;
uniform vec4 u_pointer;
uniform vec2 u_seed;
uniform float u_seedMix;
uniform vec4 u_weather;
uniform vec4 u_visual;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += noise3(p) * amplitude;
    p = p * 1.93 + vec3(4.17, -2.31, 5.73);
    amplitude *= 0.48;
  }
  return value;
}

mat2 rotate2(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float smoothMin(float a, float b, float amount) {
  float h = clamp(0.5 + 0.5 * (b - a) / amount, 0.0, 1.0);
  return mix(b, a, h) - amount * h * (1.0 - h);
}

float sphereSdf(vec3 p, float radius) {
  return length(p) - radius;
}

float torusSdf(vec3 p, vec2 radii) {
  vec2 q = vec2(length(p.xz) - radii.x, p.y);
  return length(q) - radii.y;
}

float roundedBoxSdf(vec3 p, vec3 bounds, float radius) {
  vec3 q = abs(p) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - radius;
}

float world(vec3 p, float seed, float shape, float flow, float interaction) {
  float t = u_time * (0.035 + u_weather.w * 0.035);
  p.xy *= rotate2(0.18 * sin(t * 0.31 + seed * 9.0));
  p.xz *= rotate2(t * 0.12 + seed * 1.7);
  float wave = sin(p.x * 2.6 + t) * sin(p.y * 2.2 - t * 0.7) * sin(p.z * 2.4 + seed * 8.0);
  p += vec3(
    sin(p.y * 1.8 + t),
    sin(p.z * 1.5 - t * 0.8),
    cos(p.x * 1.7 + t * 0.6)
  ) * (0.045 + flow * 0.075);

  float orb = sphereSdf(p + vec3(0.18, -0.04, 0.0), 0.72 + u_audio.x * 0.14);
  float moon = sphereSdf(p - vec3(0.63, 0.22, 0.18), 0.31 + flow * 0.08);
  float joined = smoothMin(orb, moon, 0.38 + flow * 0.18);
  float ring = torusSdf(p.xzy, vec2(0.68 + flow * 0.18, 0.09 + shape * 0.11));
  float crystal = roundedBoxSdf(p * vec3(0.9, 1.12, 0.88), vec3(0.5, 0.58, 0.44), 0.16);
  float gyroid = abs(
    dot(sin(p * (2.4 + flow * 1.7)), cos(p.zxy * (2.4 + flow * 1.7))) / 2.2
  ) - (0.13 + shape * 0.08);
  float torusBlend = smoothstep(0.16, 0.46, shape) * (1.0 - smoothstep(0.56, 0.76, shape));
  float crystalBlend = smoothstep(0.38, 0.66, flow) * (1.0 - smoothstep(0.72, 0.94, shape));
  float object = mix(joined, ring, torusBlend * 0.9);
  object = mix(object, crystal, crystalBlend * 0.62);
  object = mix(object, gyroid, smoothstep(0.64, 0.9, shape));
  object += wave * (0.035 + flow * 0.055);

  vec2 cursor = u_pointer.xy * vec2(0.62, 0.42);
  float cursorDistance = length(p.xy - cursor);
  object -= interaction * 0.08 * exp(-cursorDistance * 3.4) * sin(cursorDistance * 15.0 - t * 5.0);
  return object;
}

vec3 worldNormal(vec3 p, float seed, float shape, float flow, float interaction) {
  vec2 e = vec2(0.0035, 0.0);
  float d = world(p, seed, shape, flow, interaction);
  return normalize(vec3(
    world(p + e.xyy, seed, shape, flow, interaction) - d,
    world(p + e.yxy, seed, shape, flow, interaction) - d,
    world(p + e.yyx, seed, shape, flow, interaction) - d
  ));
}

float deepStars(vec2 uv, float seed, float sparkle, float treble) {
  float sum = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float depth = float(layer) + 1.0;
    vec2 gridUv = uv * (12.0 + depth * 9.0);
    gridUv += vec2(u_time * 0.0016 * depth, -u_time * 0.0011 * depth);
    vec2 cell = floor(gridUv);
    vec2 local = fract(gridUv) - 0.5;
    float chance = hash21(cell + seed * (31.0 + depth));
    vec2 offset = vec2(hash21(cell + 4.7), hash21(cell + 9.3)) - 0.5;
    float point = smoothstep(0.06 / depth, 0.0, length(local - offset * 0.72));
    float alive = smoothstep(0.955 - sparkle * 0.045, 0.985, chance);
    sum += point * alive * (0.22 + treble * 1.9) / depth;
  }
  return sum;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screen = uv * 2.0 - 1.0;
  screen.x *= u_resolution.x / u_resolution.y;

  float seed = mix(u_seed.x, u_seed.y, u_seedMix);
  float brightness = u_weather.x;
  float density = u_weather.y;
  float harmony = u_weather.z;
  float shape = u_visual.x;
  float flow = u_visual.y;
  float depth = u_visual.z;
  float sparkle = u_visual.w;
  float interaction = max(u_audio.w, u_pointer.z);

  vec3 night = mix(vec3(0.006, 0.011, 0.027), vec3(0.018, 0.012, 0.038), harmony);
  vec3 sea = mix(vec3(0.055, 0.205, 0.275), vec3(0.16, 0.10, 0.31), harmony);
  vec3 iris = mix(vec3(0.29, 0.48, 0.52), vec3(0.53, 0.26, 0.54), harmony);
  vec3 pearl = mix(vec3(0.64, 0.78, 0.76), vec3(0.79, 0.61, 0.73), harmony);

  vec3 ro = vec3(u_pointer.x * 0.18, u_pointer.y * 0.12, 3.25 + depth * 0.45);
  vec3 rd = normalize(vec3(screen, -1.72 - depth * 0.28));
  rd.yz *= rotate2(-u_pointer.y * 0.07);
  rd.xz *= rotate2(u_pointer.x * 0.09);

  float travel = 0.0;
  float mist = 0.0;
  float halo = 0.0;
  float hit = 0.0;
  vec3 hitPosition = vec3(0.0);
  for (int step = 0; step < 34; step++) {
    vec3 position = ro + rd * travel;
    float distance = world(position, seed, shape, flow, interaction);
    float proximity = exp(-abs(distance) * (7.0 + depth * 5.0));
    halo += proximity * (0.012 + density * 0.009);
    float volumeNoise = noise3(position * (1.1 + flow) + vec3(seed * 7.0, u_time * 0.008, 0.0));
    mist += smoothstep(0.55, 0.92, volumeNoise) * (0.002 + density * 0.0018);
    if (distance < 0.004) {
      hit = 1.0;
      hitPosition = position;
      break;
    }
    travel += clamp(abs(distance) * 0.68, 0.025, 0.19);
    if (travel > 7.0) break;
  }

  float cloud = fbm3(vec3(screen * (0.34 + depth * 0.16), seed * 4.0 + u_time * 0.006));
  vec3 color = mix(night, sea * 0.55, smoothstep(0.35, 0.92, cloud) * 0.6);
  color += sea * mist * (0.7 + depth * 1.2);
  color += mix(sea, iris, shape) * halo * (0.92 + u_audio.y * 0.9);

  float angle = atan(screen.y, screen.x) + seed * PI * 2.0;
  float shafts = pow(max(0.0, sin(angle * (3.0 + floor(flow * 4.0)) + cloud * 3.0)), 10.0);
  shafts *= exp(-length(screen) * (1.2 + depth));
  color += mix(sea, pearl, 0.28) * shafts * (0.018 + sparkle * 0.035);

  if (hit > 0.5) {
    vec3 normal = worldNormal(hitPosition, seed, shape, flow, interaction);
    vec3 lightDirection = normalize(vec3(-0.55 + u_pointer.x * 0.3, 0.7, 0.46));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, -rd), 0.0), 2.6);
    float specular = pow(max(dot(reflect(-lightDirection, normal), -rd), 0.0), 22.0);
    float bands = 0.5 + 0.5 * sin(hitPosition.y * (8.0 + flow * 8.0) + u_time * 0.16 + seed * 17.0);
    float caustic = pow(bands, 5.0) * (0.12 + flow * 0.22);
    vec3 surface = mix(sea * 0.82, iris * 1.2, diffuse * 0.72 + bands * 0.26);
    surface = mix(surface, pearl, fresnel * (0.5 + sparkle * 0.42));
    surface += pearl * (specular * 0.7 + caustic + u_audio.x * 0.22 * diffuse);
    color = mix(color, surface, 0.66 + fresnel * 0.25);
  }

  float cursorGlow = exp(-length(screen - u_pointer.xy * vec2(1.0, 0.72)) * (3.8 - interaction));
  color += mix(sea, pearl, 0.38) * cursorGlow * interaction * 0.15;
  float stars = deepStars(uv + u_pointer.xy * 0.014, seed, sparkle, u_audio.z);
  color += pearl * stars * (0.09 + brightness * 0.075);

  float vignette = smoothstep(0.36, 1.36, length(screen));
  color *= 1.0 - vignette * 0.48;
  color *= 0.86 + brightness * 0.28;
  float grain = hash21(gl_FragCoord.xy + mod(u_time * 13.0, 83.0)) - 0.5;
  color += grain * 0.008;
  color = pow(max(color, 0.0), vec3(0.92));
  gl_FragColor = vec4(color, 1.0);
}
`;

type RendererDiagnostics = {
  fps: number;
  frames: number;
  pointerEnergy: number;
  quality: number;
  webgl: boolean;
};

type DebugSurface = {
  destroy: () => Promise<void>;
  getState: () => {
    audio: NagiDiagnostics | null;
    renderer: RendererDiagnostics;
  };
};

type PointerField = {
  down: number;
  lastAt: number;
  lastX: number;
  lastY: number;
  targetEnergy: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
};

declare global {
  interface Window {
    __NAGI_DEBUG__?: DebugSurface;
  }
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const diagnosticsRef = useRef<HTMLOutputElement>(null);
  const engineRef = useRef<NagiAudioEngine | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<PointerField>({
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
  const rendererRef = useRef<RendererDiagnostics>({
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
  const [volume, setVolume] = useState(0.62);

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
    if (starting || started) return;
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
      setStarting(false);
    }
  }, [started, starting]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    const uniforms = {
      audio: gl.getUniformLocation(program, 'u_audio'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      seed: gl.getUniformLocation(program, 'u_seed'),
      seedMix: gl.getUniformLocation(program, 'u_seedMix'),
      time: gl.getUniformLocation(program, 'u_time'),
      visual: gl.getUniformLocation(program, 'u_visual'),
      weather: gl.getUniformLocation(program, 'u_weather'),
    };
    const startedAt = performance.now();
    let frame = 0;
    let lastFrameAt = startedAt;
    let fpsWindowAt = startedAt;
    let fpsFrames = 0;
    let diagnosticsAt = startedAt;
    let quality = 1;

    const rendererDiagnostics = rendererRef.current;
    rendererDiagnostics.webgl = true;
    const render = (now: number) => {
      const frameDelta = now - lastFrameAt;
      lastFrameAt = now;
      fpsFrames += 1;
      rendererDiagnostics.frames += 1;
      if (now - fpsWindowAt >= 2500) {
        const fps = (fpsFrames * 1000) / (now - fpsWindowAt);
        rendererDiagnostics.fps = Math.round(fps * 10) / 10;
        if (now - startedAt > 6000 && fps < 48 && quality > 0.56) {
          quality = Math.max(0.56, quality * 0.82);
        }
        if (fps > 58 && quality < 1) quality = Math.min(1, quality + 0.05);
        rendererDiagnostics.quality = quality;
        rendererDiagnostics.pointerEnergy = pointerRef.current.targetEnergy;
        fpsFrames = 0;
        fpsWindowAt = now;
      }

      if (now - diagnosticsAt >= 500 && diagnosticsRef.current) {
        diagnosticsRef.current.textContent = JSON.stringify({
          audio: engineRef.current?.getDiagnostics() ?? null,
          renderer: rendererDiagnostics,
        });
        diagnosticsAt = now;
      }

      if (!document.hidden && frameDelta < 1000) {
        const mobileCap = window.innerWidth < 720 ? 1 : 1.3;
        const dpr = Math.min(window.devicePixelRatio || 1, mobileCap) * quality;
        const width = Math.max(1, Math.round(window.innerWidth * dpr));
        const height = Math.max(1, Math.round(window.innerHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }

        const engine = engineRef.current;
        const snapshot = engine?.getSnapshot() ?? {
          currentSeed: seedRef.current,
          incomingSeed: null,
          profile: profileFromSeed(seedRef.current),
          transition: 0,
        };
        const bands = engine?.readAudioBands() ?? {
          bass: 0.035,
          mid: 0.025,
          treble: 0.012,
          interaction: 0,
        };
        const pointer = pointerRef.current;
        pointer.x += (pointer.targetX - pointer.x) * 0.055;
        pointer.y += (pointer.targetY - pointer.y) * 0.055;
        pointer.targetEnergy *= pointer.down > 0 ? 0.97 : 0.9;
        const seedA = seedToNumber(snapshot.currentSeed) / 4294967295;
        const seedB = snapshot.incomingSeed
          ? seedToNumber(snapshot.incomingSeed) / 4294967295
          : seedA;

        gl.useProgram(program);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.time, (now - startedAt) / 1000);
        gl.uniform4f(uniforms.audio, bands.bass, bands.mid, bands.treble, bands.interaction);
        gl.uniform4f(
          uniforms.pointer,
          pointer.x * 2 - 1,
          1 - pointer.y * 2,
          pointer.targetEnergy,
          pointer.down,
        );
        gl.uniform2f(uniforms.seed, seedA, seedB);
        gl.uniform1f(uniforms.seedMix, snapshot.transition);
        gl.uniform4f(
          uniforms.weather,
          snapshot.profile.brightness,
          snapshot.profile.density,
          snapshot.profile.harmonicHue,
          snapshot.profile.motion,
        );
        gl.uniform4f(
          uniforms.visual,
          snapshot.profile.shape,
          snapshot.profile.flow,
          snapshot.profile.depth,
          snapshot.profile.sparkle,
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    window.__NAGI_DEBUG__ = {
      destroy: async () => {
        await engineRef.current?.destroy();
        engineRef.current = null;
      },
      getState: () => ({
        audio: engineRef.current?.getDiagnostics() ?? null,
        renderer: { ...rendererDiagnostics },
      }),
    };

    return () => {
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      rendererDiagnostics.webgl = false;
      delete window.__NAGI_DEBUG__;
    };
  }, [ready]);

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
      onPointerLeave={() => {
        pointerRef.current.targetX = 0.5;
        pointerRef.current.targetY = 0.5;
        pointerRef.current.down = 0;
        engineRef.current?.setInteraction(0.5, 0.5, 0, false);
      }}
      onFocusCapture={() => started && setControlsVisible(true)}
    >
      <canvas ref={canvasRef} className="nagi-canvas" aria-hidden="true" />
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
          {starting ? 'sound is arriving' : 'enter the quiet'}
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
