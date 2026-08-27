'use client';

import { Sparkles } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  SMAA,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, SMAAPreset } from 'postprocessing';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import {
  type AudioBands,
  type NagiAudioEngine,
} from '../lib/nagi/audio-engine';
import {
  CORE_EMOTIONS,
  seedToNumber,
  visualVariantFromSeed,
  type EmotionName,
  type SeedSnapshot,
} from '../lib/nagi/generative';
import {
  EMOTION_COLOR_PALETTES,
  EMOTION_SHADER_TEMPLATES,
} from '../lib/nagi/visual-presets';
import {
  chooseRenderQualityCeiling,
  readRenderDeviceProfile,
  renderTierIndex,
  resolveRenderQualityPlan,
  stepRenderQualityTier,
  type RenderGpuProfile,
  type RenderQualityPlan,
  type RenderQualityTier,
} from '../lib/nagi/render-quality';

export type NagiPointerField = {
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

export type NagiRendererDiagnostics = {
  antialias: boolean;
  barPhase: number;
  beatPhase: number;
  contextLosses: number;
  drawCalls: number;
  fps: number;
  frameBuffer: RenderQualityPlan['frameBuffer'];
  frames: number;
  maxFrameGapMs: number;
  multisampling: number;
  pointerEnergy: number;
  postAntialias: 'msaa' | 'smaa';
  pulse: number;
  quality: number;
  qualityCeiling: RenderQualityTier;
  qualityTier: RenderQualityTier;
  styleName: string;
  styleVariant: number;
  webgl: boolean;
};

type NagiSceneProps = {
  diagnosticsRef: RefObject<HTMLOutputElement | null>;
  engineRef: RefObject<NagiAudioEngine | null>;
  pointerRef: RefObject<NagiPointerField>;
  rendererRef: RefObject<NagiRendererDiagnostics>;
  seedSnapshot: SeedSnapshot;
};

type InnerSceneProps = NagiSceneProps & {
  audioRef: RefObject<AudioBands>;
  renderQuality: RenderQualityPlan;
};

const BACKDROP_VERTEX_SHADER = `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BACKDROP_FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform float uSeed;
uniform vec2 uEmotion;
uniform vec3 uPointer;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec4 uPatternA;
uniform vec4 uPatternB;
uniform vec4 uPatternC;
uniform vec4 uPatternParams;
uniform vec4 uTransport;
varying vec3 vDirection;

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

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.52;
  for (int i = 0; i < 4; i++) {
    value += noise3(p) * amplitude;
    p = p * 2.03 + vec3(1.7, 2.9, 1.1);
    amplitude *= 0.48;
  }
  return value;
}

void main() {
  vec3 d = normalize(vDirection);
  float arousal = uEmotion.x;
  float valence = uEmotion.y;
  float slowTime = uTime * mix(0.018, 0.075, arousal) * uPatternParams.y;
  vec3 q = d * uPatternParams.x;
  float mist = fbm(q * mix(2.2, 4.8, arousal) + vec3(slowTime, -slowTime * 0.7, uSeed * 8.0));
  float tide = 0.5 + 0.5 * sin(d.y * 5.0 + mist * 3.2 - slowTime * 3.0);
  float longitude = atan(d.z, d.x);
  float auroraWave = 0.5 + 0.5 * sin(
    longitude * 2.6 + d.y * 7.0 + mist * 5.2 + slowTime * 4.0
  );
  float aurora = smoothstep(
    mix(0.68, 0.52, arousal),
    mix(0.94, 0.84, arousal),
    auroraWave
  ) * (0.52 + mist * 0.48);
  float crystalSignal = abs(sin(
    (abs(d.x) + abs(d.y * 1.3) + abs(d.z * 0.8)) * 21.0 + mist * 3.4
  ));
  float crystal = smoothstep(0.82, 0.985, crystalSignal);
  float halo = pow(max(0.0, 1.0 - abs(length(d.xy) - 0.72 - mist * 0.12)), 7.0);
  float lagoon = 0.5 + 0.5 * sin((d.x + d.z) * 8.0 + mist * 4.0 - slowTime * 2.0);
  float rays = smoothstep(
    0.68,
    0.97,
    0.5 + 0.5 * sin(longitude * 7.0 + mist * 2.0 + slowTime)
  );
  float bloom = smoothstep(
    0.38,
    0.96,
    max(0.0, sin(longitude * 3.0 + d.y * 5.0 + slowTime * 1.6))
  );
  float storm = fbm(d * 8.0 + vec3(-slowTime * 2.0, slowTime, uSeed * 15.0));
  float lattice = smoothstep(
    0.84,
    0.985,
    abs(sin((d.x - d.z) * 28.0 + storm * 5.0))
  );
  float ribbon = smoothstep(
    0.58,
    0.98,
    0.5 + 0.5 * sin(longitude * 5.0 + d.y * 9.0 + mist * 3.0 + slowTime * 2.0)
  );
  float vortex = 0.5 + 0.5 * sin(longitude * 4.0 + length(d.xy) * 13.0 - slowTime * 1.4 + mist * 4.0);
  float sparkleNoise = hash31(floor(d * 82.0 + uSeed * 19.0));
  float sparkleDrift = 0.72 + 0.28 * sin(
    slowTime * 7.0 + sparkleNoise * 18.0 + uTransport.y * 6.2831853
  );
  float sparkleCells = smoothstep(0.965, 0.997, sparkleNoise) * sparkleDrift;
  vec4 patternsA = vec4(mist * 0.58 + tide * 0.42, halo, lagoon, aurora);
  vec4 patternsB = vec4(rays, bloom, crystal, storm);
  vec4 patternsC = vec4(lattice, ribbon, vortex, sparkleCells);
  float field = dot(uPatternA, patternsA) + dot(uPatternB, patternsB) + dot(uPatternC, patternsC);
  field = smoothstep(0.08, max(0.34, 1.08 - uPatternParams.z * 0.38), field);
  vec3 color = mix(uColorA, uColorB, clamp(mist * 0.32 + field * 0.68, 0.0, 1.0));
  color *= 0.48 + field * 0.58 + mist * 0.12;
  color += uColorC * field * (0.08 + valence * 0.13);
  float starNoise = hash31(floor(d * 180.0 + uSeed * 37.0));
  float stars = smoothstep(0.982, 0.999, starNoise);
  float twinkle = 0.5 + 0.5 * sin(uTransport.y * 6.2831853 + starNoise * 21.0);
  float flowingLight = 0.5 + 0.5 * sin(
    longitude * 3.0 + mist * 4.0 + uTransport.z * 6.2831853
  );
  color += uColorC * stars * (0.006 + twinkle * 0.018 + uTransport.x * 0.006) * uPatternParams.w;
  color += uColorB * flowingLight * (0.005 + valence * 0.006);
  float pointerGlow = pow(max(dot(d, normalize(vec3(uPointer.xy, 0.7))), 0.0), 18.0);
  color += uColorC * pointerGlow * uPointer.z * 0.24;
  color *= 0.7 + max(d.y, -0.25) * 0.12;
  gl_FragColor = vec4(max(color, vec3(0.002, 0.003, 0.007)), 1.0);
}
`;

const CORE_VERTEX_SHADER = `
uniform float uTime;
uniform float uSeed;
uniform float uShape;
uniform vec4 uPointer;
uniform vec2 uEmotion;
varying vec3 vNormalWorld;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;

float layeredField(vec3 p) {
  float a = sin(p.x * 2.8 + uTime * 0.31 + uSeed * 17.0);
  float b = sin(p.y * 3.7 - uTime * 0.23 + uSeed * 9.0);
  float c = sin(p.z * 4.3 + uTime * 0.17 - uSeed * 13.0);
  float d = sin(dot(p, normalize(vec3(1.0, 1.7, 2.3))) * 5.1 - uTime * 0.19);
  return (a * b + b * c + c * d) / 3.0;
}

void main() {
  vec3 transformed = position;
  float arousal = uEmotion.x;
  float valence = uEmotion.y;
  float tideField = layeredField(position);
  float ribbonField = sin(
    atan(position.y, position.x) * 3.0 + position.z * 5.0 - uTime * (0.12 + arousal * 0.2)
  ) * 0.72;
  float facetField = abs(sin(
    (abs(position.x) + abs(position.y * 1.35) + abs(position.z * 0.82)) * 8.0
    + uTime * 0.08
  )) - 0.48;
  float energetic = smoothstep(0.28, 0.76, arousal);
  float crystalline = smoothstep(0.62, 0.92, arousal) * (0.55 + (1.0 - valence) * 0.45);
  float field = mix(tideField, ribbonField, energetic);
  field = mix(field, facetField, crystalline * 0.72);
  float fine = sin(
    (position.x + position.y - position.z) * mix(9.0, 17.0, arousal) + uTime * 0.24
  ) * mix(0.018, 0.036, arousal);
  float interaction = uPointer.z;
  float cursorFacing = max(dot(normalize(position.xy + vec2(0.0001)), normalize(uPointer.xy + vec2(0.0001))), 0.0);
  float displacement = field * mix(0.1, 0.3, uShape) * mix(0.72, 1.2, arousal)
    + fine * (0.45 + uShape);
  displacement += interaction * cursorFacing * 0.055;
  transformed += vec3(
    sin(position.y * 2.7 + uTime * 0.13),
    sin(position.z * 3.1 - uTime * 0.11),
    cos(position.x * 2.9 + uTime * 0.09)
  ) * (0.018 + uShape * 0.025);
  transformed += normal * displacement;
  transformed.xy += uPointer.xy * (0.018 + (position.z + 1.0) * 0.018);

  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vPosition = transformed;
  vWorldPosition = world.xyz;
  vDisplacement = displacement;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CORE_FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform float uSeed;
uniform float uSparkle;
uniform float uTension;
uniform vec2 uEmotion;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec3 vNormalWorld;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;

void main() {
  vec3 normal = normalize(vNormalWorld);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.4);
  vec3 lightDirection = normalize(vec3(-0.55, 0.72, 0.48));
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float opposite = max(dot(normal, normalize(vec3(0.72, -0.35, 0.4))), 0.0);
  float band = 0.5 + 0.5 * sin(
    vPosition.y * (7.0 + uSparkle * 9.0 + uEmotion.x * 6.0)
    + uTime * (0.14 + uEmotion.x * 0.12) + uSeed * 23.0
  );
  float caustic = pow(band, 7.0) * (0.08 + uSparkle * 0.24);
  float slowInterference = sin(uTime * 0.07 + uSeed * 11.0);
  float interference = 0.5 + 0.5 * sin(
    (vPosition.x - vPosition.z) * 9.0 - uTime * 0.12 + slowInterference * 0.18
  );
  vec3 color = mix(uColorA, uColorB, diffuse * 0.64 + opposite * 0.2 + band * 0.15);
  color = mix(color, uColorC, fresnel * (0.58 + uSparkle * 0.25));
  color += uColorC * (caustic + pow(max(diffuse, 0.0), 10.0) * 0.4);
  color += mix(uColorA, uColorC, interference) * vDisplacement * 0.45;
  color += uColorC * (uEmotion.y * 0.025 + uEmotion.x * fresnel * 0.04);
  color = mix(color, color * vec3(1.04, 0.98, 1.08), uTension * 0.08);
  color = mix(color, color * mix(vec3(0.9, 0.82, 1.18), vec3(1.12, 1.04, 0.82), uEmotion.y), uEmotion.x * 0.16);
  float alpha = 0.9 + fresnel * 0.1;
  gl_FragColor = vec4(max(color, 0.0) * 0.72, alpha);
}
`;

const SHELL_VERTEX_SHADER = `
uniform float uTime;
varying vec3 vNormalWorld;
varying vec3 vWorldPosition;
void main() {
  vec3 transformed = position + normal * sin(position.y * 6.0 + uTime * 0.22) * 0.022;
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SHELL_FRAGMENT_SHADER = `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormalWorld;
varying vec3 vWorldPosition;
void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormalWorld), viewDirection), 0.0), 3.2);
  gl_FragColor = vec4(uColor * (0.28 + fresnel * 1.6), fresnel * uOpacity);
}
`;

type PaletteSet = {
  a: THREE.Color;
  b: THREE.Color;
  c: THREE.Color;
};

const emotionColors = Object.fromEntries(
  (Object.entries(EMOTION_COLOR_PALETTES) as Array<
    [EmotionName, readonly [string, string, string]]
  >).map(([emotion, colors]) => [
    emotion,
    {
      a: new THREE.Color(colors[0]),
      b: new THREE.Color(colors[1]),
      c: new THREE.Color(colors[2]),
    },
  ]),
) as Record<EmotionName, PaletteSet>;

function setEmotionPalette(
  target: PaletteSet,
  emotion: EmotionName,
  incomingEmotion: EmotionName | null,
  transition: number,
  harmony: number,
  brightness: number,
  arousal: number,
  valence: number,
  seed: number,
) {
  const source = emotionColors[emotion];
  const incoming = incomingEmotion ? emotionColors[incomingEmotion] : source;
  const mix = incomingEmotion ? THREE.MathUtils.smoothstep(transition, 0, 1) : 0;
  target.a.copy(source.a).lerp(incoming.a, mix);
  target.b.copy(source.b).lerp(incoming.b, mix);
  target.c.copy(source.c).lerp(incoming.c, mix);
  const harmonicShift = (harmony - 0.5) * 0.018;
  const seedShift = Math.sin(seed * 91.73) * 0.008;
  const positive = THREE.MathUtils.smoothstep(valence, 0.38, 0.84);
  target.a.offsetHSL(harmonicShift + seedShift, arousal * 0.015, brightness * 0.006);
  target.b.offsetHSL(-harmonicShift * 0.5 - seedShift * 0.35, arousal * 0.02, brightness * 0.012);
  target.c.offsetHSL(seedShift * 0.25, arousal * 0.018, brightness * 0.025 + positive * 0.012);
  return target;
}

function palette(
  emotion: EmotionName = 'CALM',
  harmony = 0.5,
  brightness = 0.5,
  arousal = 0.28,
  valence = 0.52,
  seed = 0.5,
): PaletteSet {
  return setEmotionPalette(
    { a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color() },
    emotion,
    null,
    0,
    harmony,
    brightness,
    arousal,
    valence,
    seed,
  );
}

function shaderVariantIndex(seed: string) {
  return visualVariantFromSeed(seed, 3);
}

function shaderState(emotion: EmotionName, seed: string) {
  const variants = EMOTION_SHADER_TEMPLATES[emotion];
  const variant = shaderVariantIndex(seed);
  const template = variants[variant];
  const weights = template.weights;
  return {
    a: new THREE.Vector4(weights[0], weights[1], weights[2], weights[3]),
    b: new THREE.Vector4(weights[4], weights[5], weights[6], weights[7]),
    c: new THREE.Vector4(weights[8], weights[9], weights[10], weights[11]),
    label: template.label,
    params: new THREE.Vector4(...template.params),
    variant,
  };
}

function EmotionBackdrop({
  audioRef,
  pointerRef,
  renderQuality,
  seedSnapshot,
}: InnerSceneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const seedValue = seedToNumber(seedSnapshot.currentSeed) / 4294967295;
  const colorTarget = useMemo(() => palette(), []);
  const blendedStyles = useMemo(
    () => ({
      a: new THREE.Vector4(),
      b: new THREE.Vector4(),
      c: new THREE.Vector4(),
      params: new THREE.Vector4(),
    }),
    [],
  );
  const styleTargets = useMemo(() => {
    const current = seedSnapshot.currentSeed;
    const incoming = seedSnapshot.incomingSeed ?? current;
    return {
      current: shaderState(seedSnapshot.emotion, current),
      incoming: shaderState(
        seedSnapshot.incomingEmotion ?? seedSnapshot.emotion,
        incoming,
      ),
    };
  }, [
    seedSnapshot.currentSeed,
    seedSnapshot.emotion,
    seedSnapshot.incomingEmotion,
    seedSnapshot.incomingSeed,
  ]);
  const uniforms = useMemo(
    () => ({
      uColorA: { value: new THREE.Color('#071326') },
      uColorB: { value: new THREE.Color('#183a56') },
      uColorC: { value: new THREE.Color('#9fb9d2') },
      uEmotion: { value: new THREE.Vector2(0.2, 0.5) },
      uPatternA: { value: new THREE.Vector4(1, 0, 0, 0) },
      uPatternB: { value: new THREE.Vector4() },
      uPatternC: { value: new THREE.Vector4() },
      uPatternParams: { value: new THREE.Vector4(1, 0.6, 0.75, 0.3) },
      uPointer: { value: new THREE.Vector3() },
      uSeed: { value: 0 },
      uTime: { value: 0 },
      uTransport: { value: new THREE.Vector4() },
    }),
    [],
  );

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const audio = audioRef.current;
    const pointer = pointerRef.current;
    const targetSeed = seedSnapshot.incomingSeed
      ? THREE.MathUtils.lerp(
          seedToNumber(seedSnapshot.currentSeed) / 4294967295,
          seedToNumber(seedSnapshot.incomingSeed) / 4294967295,
          seedSnapshot.transition,
        )
      : seedValue;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uSeed.value = THREE.MathUtils.lerp(
      material.uniforms.uSeed.value,
      targetSeed,
      1 - Math.exp(-delta * 0.55),
    );
    material.uniforms.uEmotion.value.x = THREE.MathUtils.lerp(
      material.uniforms.uEmotion.value.x,
      audio.arousal,
      1 - Math.exp(-delta * 0.42),
    );
    material.uniforms.uEmotion.value.y = THREE.MathUtils.lerp(
      material.uniforms.uEmotion.value.y,
      audio.valence,
      1 - Math.exp(-delta * 0.42),
    );
    material.uniforms.uPointer.value.set(
      pointer.x * 2 - 1,
      1 - pointer.y * 2,
      pointer.targetEnergy,
    );
    setEmotionPalette(
      colorTarget,
      seedSnapshot.emotion,
      seedSnapshot.incomingEmotion,
      seedSnapshot.transition,
      seedSnapshot.profile.harmonicHue,
      seedSnapshot.profile.brightness,
      audio.arousal,
      audio.valence,
      targetSeed,
    );
    material.uniforms.uColorA.value.lerp(colorTarget.a, 1 - Math.exp(-delta * 0.55));
    material.uniforms.uColorB.value.lerp(colorTarget.b, 1 - Math.exp(-delta * 0.55));
    material.uniforms.uColorC.value.lerp(colorTarget.c, 1 - Math.exp(-delta * 0.55));
    const styleMix = seedSnapshot.incomingSeed ? seedSnapshot.transition : 0;
    const styleEase = 1 - Math.exp(-delta * 0.8);
    blendedStyles.a.copy(styleTargets.current.a).lerp(styleTargets.incoming.a, styleMix);
    blendedStyles.b.copy(styleTargets.current.b).lerp(styleTargets.incoming.b, styleMix);
    blendedStyles.c.copy(styleTargets.current.c).lerp(styleTargets.incoming.c, styleMix);
    blendedStyles.params
      .copy(styleTargets.current.params)
      .lerp(styleTargets.incoming.params, styleMix);
    material.uniforms.uPatternA.value.lerp(blendedStyles.a, styleEase);
    material.uniforms.uPatternB.value.lerp(blendedStyles.b, styleEase);
    material.uniforms.uPatternC.value.lerp(blendedStyles.c, styleEase);
    material.uniforms.uPatternParams.value.lerp(blendedStyles.params, styleEase);
    material.uniforms.uTransport.value.set(
      audio.pulse,
      audio.beatPhase,
      audio.barPhase,
      audio.phrase,
    );
  });

  return (
    <mesh renderOrder={-10} scale={1}>
      <sphereGeometry
        args={[12, renderQuality.backdropSegments, renderQuality.backdropSegments]}
      />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={BACKDROP_VERTEX_SHADER}
        fragmentShader={BACKDROP_FRAGMENT_SHADER}
        depthTest={false}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function DreamCore({
  audioRef,
  pointerRef,
  renderQuality,
  seedSnapshot,
}: InnerSceneProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const coreMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const shellMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const seedValue = seedToNumber(seedSnapshot.currentSeed) / 4294967295;
  const colors = useMemo(() => palette(), []);
  const coreUniforms = useMemo(
    () => ({
      uColorA: { value: new THREE.Color('#102b3a') },
      uColorB: { value: new THREE.Color('#75608b') },
      uColorC: { value: new THREE.Color('#d4dbe8') },
      uEmotion: { value: new THREE.Vector2() },
      uPointer: { value: new THREE.Vector4() },
      uSeed: { value: 0 },
      uShape: { value: 0.5 },
      uSparkle: { value: 0.5 },
      uTension: { value: 0 },
      uTime: { value: 0 },
    }),
    [],
  );
  const shellUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#d4dbe8') },
      uOpacity: { value: 0.16 },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const core = coreRef.current;
    const shell = shellRef.current;
    const material = coreMaterialRef.current;
    const shellMaterial = shellMaterialRef.current;
    if (!core || !shell || !material || !shellMaterial) return;
    const audio = audioRef.current;
    const pointer = pointerRef.current;
    const targetSeed = seedSnapshot.incomingSeed
      ? THREE.MathUtils.lerp(
          seedToNumber(seedSnapshot.currentSeed) / 4294967295,
          seedToNumber(seedSnapshot.incomingSeed) / 4294967295,
          seedSnapshot.transition,
        )
      : seedValue;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uSeed.value = THREE.MathUtils.lerp(
      material.uniforms.uSeed.value,
      targetSeed,
      1 - Math.exp(-delta * 1.2),
    );
    material.uniforms.uShape.value = THREE.MathUtils.lerp(
      material.uniforms.uShape.value,
      seedSnapshot.profile.shape,
      1 - Math.exp(-delta * 0.8),
    );
    material.uniforms.uSparkle.value = THREE.MathUtils.lerp(
      material.uniforms.uSparkle.value,
      seedSnapshot.profile.sparkle,
      1 - Math.exp(-delta * 0.8),
    );
    material.uniforms.uEmotion.value.set(audio.arousal, audio.valence);
    material.uniforms.uTension.value = audio.tension;
    material.uniforms.uPointer.value.set(
      pointer.x * 2 - 1,
      1 - pointer.y * 2,
      pointer.targetEnergy,
      pointer.down,
    );
    setEmotionPalette(
      colors,
      seedSnapshot.emotion,
      seedSnapshot.incomingEmotion,
      seedSnapshot.transition,
      seedSnapshot.profile.harmonicHue,
      seedSnapshot.profile.brightness,
      audio.arousal,
      audio.valence,
      targetSeed,
    );
    material.uniforms.uColorA.value.lerp(colors.a, 1 - Math.exp(-delta * 0.7));
    material.uniforms.uColorB.value.lerp(colors.b, 1 - Math.exp(-delta * 0.7));
    material.uniforms.uColorC.value.lerp(colors.c, 1 - Math.exp(-delta * 0.7));

    shellMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    shellMaterial.uniforms.uColor.value.lerp(colors.c, 1 - Math.exp(-delta * 0.7));
    shellMaterial.uniforms.uOpacity.value = 0.12 + seedSnapshot.profile.depth * 0.12;

    const shape = seedSnapshot.profile.shape;
    const targetScale = new THREE.Vector3(
      0.92 + shape * 0.14 + audio.arousal * 0.13,
      1.08 - shape * 0.1 - audio.arousal * 0.08,
      0.9 + seedSnapshot.profile.depth * 0.1 + audio.valence * 0.08,
    );
    core.scale.lerp(targetScale, 1 - Math.exp(-delta * 0.55));
    shell.scale
      .copy(core.scale)
      .multiplyScalar(1.045);
    core.rotation.y += delta * (0.035 + seedSnapshot.profile.motion * 0.05);
    core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, (pointer.y - 0.5) * 0.16, 0.025);
    core.rotation.z = THREE.MathUtils.lerp(core.rotation.z, (pointer.x - 0.5) * -0.12, 0.025);
    shell.rotation.copy(core.rotation);
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry
          args={[0.9, renderQuality.coreSegments, renderQuality.coreSegments]}
        />
        <shaderMaterial
          ref={coreMaterialRef}
          uniforms={coreUniforms}
          vertexShader={CORE_VERTEX_SHADER}
          fragmentShader={CORE_FRAGMENT_SHADER}
        />
      </mesh>
      <mesh ref={shellRef}>
        <sphereGeometry
          args={[0.9, renderQuality.shellSegments, renderQuality.shellSegments]}
        />
        <shaderMaterial
          ref={shellMaterialRef}
          uniforms={shellUniforms}
          vertexShader={SHELL_VERTEX_SHADER}
          fragmentShader={SHELL_FRAGMENT_SHADER}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
          transparent
        />
      </mesh>
    </group>
  );
}

function OrbitalDetails({
  audioRef,
  pointerRef,
  renderQuality,
  seedSnapshot,
}: InnerSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const knotRef = useRef<THREE.Mesh>(null);
  const satellitesRef = useRef<THREE.Group>(null);
  const color = useMemo(
    () =>
      palette(
        seedSnapshot.emotion,
        seedSnapshot.profile.harmonicHue,
        seedSnapshot.profile.brightness,
        0.34,
        0.56,
        seedToNumber(seedSnapshot.currentSeed) / 4294967295,
      ).c,
    [
      seedSnapshot.currentSeed,
      seedSnapshot.emotion,
      seedSnapshot.profile.brightness,
      seedSnapshot.profile.harmonicHue,
    ],
  );

  useFrame((state, delta) => {
    if (!groupRef.current || !knotRef.current || !satellitesRef.current) return;
    const pointer = pointerRef.current;
    const audio = audioRef.current;
    groupRef.current.rotation.x +=
      delta * (0.018 + seedSnapshot.profile.flow * 0.03 + audio.arousal * 0.055);
    groupRef.current.rotation.z -= delta * 0.018;
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      (pointer.x - 0.5) * 0.28 + state.clock.elapsedTime * 0.012,
      0.025,
    );
    knotRef.current.rotation.y -=
      delta * (0.028 + seedSnapshot.profile.flow * 0.05 + audio.arousal * 0.09);
    knotRef.current.rotation.z += delta * 0.026;
    satellitesRef.current.rotation.y += delta * (0.06 + seedSnapshot.profile.motion * 0.09);
    satellitesRef.current.rotation.x = (pointer.y - 0.5) * 0.3;
    satellitesRef.current.rotation.z =
      state.clock.elapsedTime * (0.012 + seedSnapshot.profile.motion * 0.018);
    const moodScale = 0.82 + audio.arousal * 0.42 + audio.valence * 0.08;
    groupRef.current.scale.setScalar(
      THREE.MathUtils.lerp(
        groupRef.current.scale.x,
        moodScale,
        1 - Math.exp(-delta * 1.8),
      ),
    );
  });

  return (
    <group ref={groupRef} rotation={[0.8, 0.1, 0.25]}>
      {[0, 1].map((index) => (
        <mesh key={index} rotation={[Math.PI / 2 + index * 0.48, index * 0.72, index * 0.35]}>
          <torusGeometry
            args={[
              1.15 + index * 0.16,
              0.0035 + index * 0.001,
              8,
              renderQuality.orbitalSegments,
            ]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.016 + seedSnapshot.profile.sparkle * 0.012}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh ref={knotRef}>
        <torusKnotGeometry
          args={[1.24, 0.0035, renderQuality.knotSegments, 8, 2, 3]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.012 + seedSnapshot.profile.flow * 0.012}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <group ref={satellitesRef}>
        {[
          [1.34, 0.18, 0.12, 0.024],
          [-1.16, -0.58, -0.26, 0.018],
          [0.32, 1.21, -0.48, 0.014],
        ].map(([x, y, z, size], index) => (
          <mesh key={index} position={[x, y, z]}>
            <sphereGeometry args={[size, 20, 20]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SceneController({
  audioRef,
  diagnosticsRef,
  engineRef,
  pointerRef,
  renderQuality,
  rendererRef,
  seedSnapshot,
}: InnerSceneProps) {
  const { camera, gl } = useThree();
  const frameWindow = useRef({ at: 0, frames: 0 });
  const diagnosticsAt = useRef(0);
  const lightRef = useRef<THREE.PointLight>(null);
  const secondLightRef = useRef<THREE.PointLight>(null);
  const pointerTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      rendererRef.current.contextLosses += 1;
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    return () => canvas.removeEventListener('webglcontextlost', handleContextLost);
  }, [gl, rendererRef]);

  useFrame((state, delta) => {
    if (!rendererRef.current.webgl) {
      rendererRef.current.webgl = true;
      rendererRef.current.antialias = gl.getContextAttributes()?.antialias ?? false;
    }
    rendererRef.current.quality = gl.getPixelRatio();
    rendererRef.current.frameBuffer = renderQuality.frameBuffer;
    rendererRef.current.multisampling = renderQuality.multisampling;
    rendererRef.current.postAntialias = renderQuality.smaa ? 'smaa' : 'msaa';
    rendererRef.current.qualityTier = renderQuality.tier;
    rendererRef.current.maxFrameGapMs = Math.max(
      rendererRef.current.maxFrameGapMs,
      Math.min(1000, delta * 1000),
    );
    const styleVariant = shaderVariantIndex(seedSnapshot.currentSeed);
    rendererRef.current.styleVariant =
      CORE_EMOTIONS.indexOf(seedSnapshot.emotion) * 3 + styleVariant;
    rendererRef.current.styleName =
      EMOTION_SHADER_TEMPLATES[seedSnapshot.emotion][styleVariant].label;
    const pointer = pointerRef.current;
    pointer.x += (pointer.targetX - pointer.x) * (1 - Math.exp(-delta * 4.8));
    pointer.y += (pointer.targetY - pointer.y) * (1 - Math.exp(-delta * 4.8));
    pointer.targetEnergy *= pointer.down > 0 ? 0.965 : 0.9;
    audioRef.current = engineRef.current?.readAudioBands() ?? {
      arousal: 0.16,
      barPhase: 0,
      bass: 0.025,
      beatPhase: 0,
      phrase: 0,
      pulse: 0,
      tension: 0,
      mid: 0.018,
      treble: 0.008,
      valence: 0.5,
      interaction: 0,
    };
    rendererRef.current.barPhase = audioRef.current.barPhase;
    rendererRef.current.beatPhase = audioRef.current.beatPhase;
    rendererRef.current.pulse = audioRef.current.pulse;

    const mobile = state.size.width < 720;
    pointerTarget.set(
      (pointer.x - 0.5) * (mobile ? 0.16 : 0.24),
      (0.5 - pointer.y) * (mobile ? 0.1 : 0.15),
      mobile ? 8.4 : 4.9,
    );
    camera.position.lerp(pointerTarget, 1 - Math.exp(-delta * 1.7));
    camera.lookAt(0, 0, 0);

    if (lightRef.current && secondLightRef.current) {
      lightRef.current.position.x = -2.2 + (pointer.x - 0.5) * 1.2;
      lightRef.current.position.y = 2.1 + (0.5 - pointer.y) * 0.9;
      lightRef.current.intensity = 3 + audioRef.current.mid * 2.2;
      secondLightRef.current.intensity = 1.2 + audioRef.current.treble * 3;
    }

    const windowState = frameWindow.current;
    windowState.frames += 1;
    rendererRef.current.frames += 1;
    const now = performance.now();
    if (windowState.at === 0) windowState.at = now;
    if (diagnosticsAt.current === 0) diagnosticsAt.current = now;
    if (now - windowState.at >= 2200) {
      rendererRef.current.fps = Math.round((windowState.frames * 10000) / (now - windowState.at)) / 10;
      rendererRef.current.drawCalls = gl.info.render.calls;
      rendererRef.current.pointerEnergy = pointer.targetEnergy;
      windowState.at = now;
      windowState.frames = 0;
    }
    if (now - diagnosticsAt.current >= 500 && diagnosticsRef.current) {
      diagnosticsRef.current.textContent = JSON.stringify({
        audio: engineRef.current?.getDiagnostics() ?? null,
        renderer: rendererRef.current,
      });
      diagnosticsAt.current = now;
    }
  });

  return (
    <>
      <EmotionBackdrop
        audioRef={audioRef}
        diagnosticsRef={diagnosticsRef}
        engineRef={engineRef}
        pointerRef={pointerRef}
        renderQuality={renderQuality}
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <ambientLight intensity={0.18} />
      <pointLight ref={lightRef} position={[-2.2, 2.1, 2.8]} color="#9fd8e7" intensity={3} distance={8} />
      <pointLight ref={secondLightRef} position={[2.4, -1.2, 1.8]} color="#c5a2ff" intensity={1.4} distance={7} />
      <DreamCore
        audioRef={audioRef}
        diagnosticsRef={diagnosticsRef}
        engineRef={engineRef}
        pointerRef={pointerRef}
        renderQuality={renderQuality}
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <OrbitalDetails
        audioRef={audioRef}
        diagnosticsRef={diagnosticsRef}
        engineRef={engineRef}
        pointerRef={pointerRef}
        renderQuality={renderQuality}
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <Sparkles
        count={Math.round(
          (90 + seedSnapshot.profile.density * 90) * renderQuality.detailScale,
        )}
        scale={[5.8, 4, 4.2]}
        size={0.55 + seedSnapshot.profile.sparkle * 0.65}
        speed={0.055 + seedSnapshot.profile.motion * 0.08}
        opacity={0.22 + seedSnapshot.profile.sparkle * 0.2}
        color={
          palette(
            seedSnapshot.emotion,
            seedSnapshot.profile.harmonicHue,
            seedSnapshot.profile.brightness,
            0.34,
            0.56,
            seedToNumber(seedSnapshot.currentSeed) / 4294967295,
          ).c
        }
        noise={1.2}
      />
      <fog attach="fog" args={['#03050d', 4.4, 10]} />
    </>
  );
}

function PostEffects({
  renderQuality,
  seedSnapshot,
}: {
  renderQuality: RenderQualityPlan;
  seedSnapshot: SeedSnapshot;
}) {
  const chromaticOffset = useMemo(() => new THREE.Vector2(0.00028, 0.00042), []);
  const frameBufferType =
    renderQuality.frameBuffer === 'half-float'
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
  return (
    <EffectComposer
      multisampling={renderQuality.multisampling}
      frameBufferType={frameBufferType}
    >
      <Bloom
        intensity={0.32 + seedSnapshot.profile.sparkle * 0.2}
        luminanceThreshold={0.52}
        luminanceSmoothing={0.68}
        mipmapBlur={renderQuality.mipmapBloom}
      />
      {renderQuality.chromaticAberration && (
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={chromaticOffset}
          radialModulation={false}
          modulationOffset={0.35}
        />
      )}
      {renderQuality.smaa && (
        <SMAA
          preset={
            renderQuality.smaaPreset === 'high'
              ? SMAAPreset.HIGH
              : SMAAPreset.MEDIUM
          }
        />
      )}
      <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.016} />
      <Vignette eskil={false} offset={0.18} darkness={0.64} />
    </EffectComposer>
  );
}

function AdaptiveRenderQuality({
  ceiling,
  onTierChange,
  tier,
}: {
  ceiling: RenderQualityTier;
  onTierChange: (tier: RenderQualityTier) => void;
  tier: RenderQualityTier;
}) {
  const monitorRef = useRef({
    cooldownUntil: 0,
    emaFrameMs: 16.67,
    fastSeconds: 0,
    slowSeconds: 0,
    startedAt: 0,
  });

  useEffect(() => {
    const now = performance.now();
    monitorRef.current = {
      cooldownUntil: now + 8_000,
      emaFrameMs: 16.67,
      fastSeconds: 0,
      slowSeconds: 0,
      startedAt: now,
    };
  }, [tier]);

  useFrame((_, delta) => {
    const monitor = monitorRef.current;
    const now = performance.now();
    if (monitor.startedAt === 0) {
      monitor.startedAt = now;
      monitor.cooldownUntil = now + 5_000;
    }
    if (document.hidden || delta <= 0 || delta > 0.12) {
      monitor.fastSeconds = 0;
      monitor.slowSeconds = 0;
      return;
    }

    const frameMs = delta * 1_000;
    const smoothing = 1 - Math.exp(-delta * 2.4);
    monitor.emaFrameMs += (frameMs - monitor.emaFrameMs) * smoothing;
    if (now < monitor.cooldownUntil) return;

    if (monitor.emaFrameMs > 22.2) {
      monitor.slowSeconds += delta;
      monitor.fastSeconds = Math.max(0, monitor.fastSeconds - delta * 2);
    } else if (monitor.emaFrameMs < 17.8) {
      monitor.fastSeconds += delta;
      monitor.slowSeconds = Math.max(0, monitor.slowSeconds - delta * 2);
    } else {
      monitor.fastSeconds = Math.max(0, monitor.fastSeconds - delta);
      monitor.slowSeconds = Math.max(0, monitor.slowSeconds - delta);
    }

    if (monitor.slowSeconds >= 4) {
      const nextTier = stepRenderQualityTier(tier, ceiling, 'down');
      monitor.slowSeconds = 0;
      monitor.fastSeconds = 0;
      monitor.cooldownUntil = now + 10_000;
      if (nextTier !== tier) onTierChange(nextTier);
    } else if (monitor.fastSeconds >= 18) {
      const nextTier = stepRenderQualityTier(tier, ceiling, 'up');
      monitor.slowSeconds = 0;
      monitor.fastSeconds = 0;
      monitor.cooldownUntil = now + 12_000;
      if (nextTier !== tier) onTierChange(nextTier);
    }
  });

  return null;
}

export function NagiScene(props: NagiSceneProps) {
  const { rendererRef } = props;
  const audioRef = useRef<AudioBands>({
    arousal: 0.16,
    barPhase: 0,
    bass: 0,
    beatPhase: 0,
    mid: 0,
    treble: 0,
    interaction: 0,
    phrase: 0,
    pulse: 0,
    tension: 0,
    valence: 0.5,
  });
  const [gpuProfile, setGpuProfile] = useState<RenderGpuProfile>({
    halfFloatColorBuffer: false,
    maxSamples: 4,
  });
  const [qualityState, setQualityState] = useState(() => {
    const device = readRenderDeviceProfile();
    const ceiling = chooseRenderQualityCeiling(device);
    return {
      ceiling,
      devicePixelRatio: device.devicePixelRatio,
      tier: ceiling,
    };
  });
  const renderQuality = useMemo(
    () =>
      resolveRenderQualityPlan(
        qualityState.tier,
        qualityState.devicePixelRatio,
        gpuProfile,
      ),
    [gpuProfile, qualityState.devicePixelRatio, qualityState.tier],
  );
  const handleTierChange = useCallback((tier: RenderQualityTier) => {
    setQualityState((current) =>
      current.tier === tier ? current : { ...current, tier },
    );
  }, []);

  useEffect(() => {
    let frame = 0;
    const updatePlatformProfile = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const device = readRenderDeviceProfile();
        const ceiling = chooseRenderQualityCeiling(device);
        setQualityState((current) => ({
          ceiling,
          devicePixelRatio: device.devicePixelRatio,
          tier:
            renderTierIndex(current.tier) > renderTierIndex(ceiling)
              ? ceiling
              : current.tier,
        }));
      });
    };
    window.addEventListener('resize', updatePlatformProfile, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePlatformProfile);
    };
  }, []);

  useEffect(() => {
    rendererRef.current.qualityCeiling = qualityState.ceiling;
  }, [rendererRef, qualityState.ceiling]);

  return (
    <Canvas
      className="nagi-r3f"
      dpr={renderQuality.dpr}
      camera={{ fov: 38, near: 0.1, far: 30, position: [0, 0, 4.9] }}
      gl={{
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#03050d'), 1);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.82;
        setGpuProfile({
          halfFloatColorBuffer: gl.extensions.has('EXT_color_buffer_float'),
          maxSamples: gl.capabilities.maxSamples,
        });
      }}
    >
      <SceneController
        {...props}
        audioRef={audioRef}
        renderQuality={renderQuality}
      />
      <PostEffects
        renderQuality={renderQuality}
        seedSnapshot={props.seedSnapshot}
      />
      <AdaptiveRenderQuality
        ceiling={qualityState.ceiling}
        onTierChange={handleTierChange}
        tier={qualityState.tier}
      />
    </Canvas>
  );
}
