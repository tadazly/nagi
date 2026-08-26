'use client';

import { Sparkles } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { type RefObject, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type AudioBands,
  type NagiAudioEngine,
} from '../lib/nagi/audio-engine';
import { seedToNumber, type SeedSnapshot } from '../lib/nagi/generative';

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
  drawCalls: number;
  fps: number;
  frames: number;
  pointerEnergy: number;
  quality: number;
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
  float slowTime = uTime * mix(0.018, 0.075, arousal);
  float mist = fbm(d * mix(2.2, 4.8, arousal) + vec3(slowTime, -slowTime * 0.7, uSeed * 8.0));
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
  float crystal = pow(
    abs(sin((abs(d.x) + abs(d.y * 1.3) + abs(d.z * 0.8)) * 21.0 + mist * 3.4)),
    13.0
  );
  float calmWeight = 1.0 - smoothstep(0.2, 0.62, arousal);
  float crystalWeight = smoothstep(0.56, 0.9, arousal) * (0.52 + (1.0 - valence) * 0.48);
  float auroraWeight = clamp(1.0 - calmWeight * 0.7 - crystalWeight * 0.45, 0.0, 1.0);

  vec3 calmA = mix(vec3(0.008, 0.018, 0.04), vec3(0.018, 0.052, 0.07), valence);
  vec3 calmB = mix(vec3(0.06, 0.035, 0.11), vec3(0.025, 0.13, 0.13), valence);
  vec3 auroraA = mix(vec3(0.16, 0.035, 0.25), vec3(0.02, 0.24, 0.2), valence);
  vec3 auroraB = mix(vec3(0.18, 0.12, 0.34), vec3(0.38, 0.22, 0.08), valence);
  vec3 crystalColor = mix(vec3(0.19, 0.06, 0.32), vec3(0.11, 0.3, 0.34), valence);

  vec3 calm = mix(calmA, calmB, tide * 0.65 + mist * 0.25);
  vec3 veil = mix(auroraA, auroraB, mist) * (0.28 + aurora * 1.08 + mist * 0.14);
  vec3 facets = crystalColor * (0.1 + crystal * 0.98 + mist * 0.16);
  vec3 color = calm * calmWeight + veil * auroraWeight + facets * crystalWeight;
  float pointerGlow = pow(max(dot(d, normalize(vec3(uPointer.xy, 0.7))), 0.0), 18.0);
  color += mix(vec3(0.05, 0.12, 0.18), vec3(0.18, 0.12, 0.07), valence)
    * pointerGlow * uPointer.z * 0.34;
  color *= 0.7 + max(d.y, -0.25) * 0.12;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`;

const CORE_VERTEX_SHADER = `
uniform float uTime;
uniform float uSeed;
uniform float uShape;
uniform vec4 uAudio;
uniform vec4 uPointer;
uniform vec3 uTransport;
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
  float interaction = max(uAudio.w, uPointer.z);
  float cursorFacing = max(dot(normalize(position.xy + vec2(0.0001)), normalize(uPointer.xy + vec2(0.0001))), 0.0);
  float displacement = field * mix(0.1, 0.3, uShape) * mix(0.72, 1.2, arousal)
    + fine * (0.45 + uShape);
  displacement += uAudio.x * 0.08 + uTransport.x * 0.014 + interaction * cursorFacing * 0.055;
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
uniform vec4 uAudio;
uniform vec3 uTransport;
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
  float phraseWave = sin(uTransport.y * 6.2831853);
  float interference = 0.5 + 0.5 * sin((vPosition.x - vPosition.z) * 9.0 - uTime * 0.12 + phraseWave * 0.24);
  vec3 color = mix(uColorA, uColorB, diffuse * 0.64 + opposite * 0.2 + band * 0.15);
  color = mix(color, uColorC, fresnel * (0.58 + uSparkle * 0.25));
  color += uColorC * (caustic + pow(max(diffuse, 0.0), 10.0) * 0.4);
  color += mix(uColorA, uColorC, interference) * vDisplacement * 0.45;
  color += uColorC * (uAudio.y * 0.11 + uAudio.z * fresnel * 0.22 + uTransport.x * 0.018);
  color = mix(color, color * vec3(1.04, 0.98, 1.08), uTransport.z * 0.08);
  color = mix(color, color * mix(vec3(0.9, 0.82, 1.18), vec3(1.12, 1.04, 0.82), uEmotion.y), uEmotion.x * 0.16);
  float alpha = 0.9 + fresnel * 0.1;
  gl_FragColor = vec4(max(color, 0.0) * 0.72, alpha);
}
`;

const SHELL_VERTEX_SHADER = `
uniform float uTime;
uniform vec4 uAudio;
varying vec3 vNormalWorld;
varying vec3 vWorldPosition;
void main() {
  vec3 transformed = position + normal * sin(position.y * 6.0 + uTime * 0.22) * (0.018 + uAudio.x * 0.025);
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

function palette(harmony: number, brightness: number) {
  const coolHue = THREE.MathUtils.lerp(0.49, 0.66, harmony);
  const warmHue = THREE.MathUtils.lerp(0.53, 0.84, harmony);
  return {
    a: new THREE.Color().setHSL(coolHue, 0.64, 0.035 + brightness * 0.025),
    b: new THREE.Color().setHSL(warmHue, 0.58, 0.15 + brightness * 0.065),
    c: new THREE.Color().setHSL(warmHue + 0.04, 0.38, 0.42 + brightness * 0.085),
  };
}

function EmotionBackdrop({ audioRef, pointerRef, seedSnapshot }: InnerSceneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const seedValue = seedToNumber(seedSnapshot.currentSeed) / 4294967295;
  const uniforms = useMemo(
    () => ({
      uEmotion: { value: new THREE.Vector2(0.2, 0.5) },
      uPointer: { value: new THREE.Vector3() },
      uSeed: { value: 0 },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const audio = audioRef.current;
    const pointer = pointerRef.current;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uSeed.value = THREE.MathUtils.lerp(
      material.uniforms.uSeed.value,
      seedSnapshot.incomingSeed
        ? THREE.MathUtils.lerp(
            seedToNumber(seedSnapshot.currentSeed) / 4294967295,
            seedToNumber(seedSnapshot.incomingSeed) / 4294967295,
            seedSnapshot.transition,
          )
        : seedValue,
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
  });

  return (
    <mesh renderOrder={-10} scale={1}>
      <sphereGeometry args={[12, 64, 64]} />
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

function DreamCore({ audioRef, pointerRef, seedSnapshot }: InnerSceneProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const coreMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const shellMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const seedValue = seedToNumber(seedSnapshot.currentSeed) / 4294967295;
  const colors = useMemo(
    () => palette(seedSnapshot.profile.harmonicHue, seedSnapshot.profile.brightness),
    [seedSnapshot.profile.brightness, seedSnapshot.profile.harmonicHue],
  );
  const coreUniforms = useMemo(
    () => ({
      uAudio: { value: new THREE.Vector4() },
      uColorA: { value: new THREE.Color('#102b3a') },
      uColorB: { value: new THREE.Color('#75608b') },
      uColorC: { value: new THREE.Color('#d4dbe8') },
      uEmotion: { value: new THREE.Vector2() },
      uPointer: { value: new THREE.Vector4() },
      uSeed: { value: 0 },
      uShape: { value: 0.5 },
      uSparkle: { value: 0.5 },
      uTime: { value: 0 },
      uTransport: { value: new THREE.Vector3() },
    }),
    [],
  );
  const shellUniforms = useMemo(
    () => ({
      uAudio: { value: new THREE.Vector4() },
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
    material.uniforms.uAudio.value.set(audio.bass, audio.mid, audio.treble, audio.interaction);
    material.uniforms.uEmotion.value.set(audio.arousal, audio.valence);
    material.uniforms.uTransport.value.set(audio.pulse, audio.phrase, audio.tension);
    material.uniforms.uPointer.value.set(
      pointer.x * 2 - 1,
      1 - pointer.y * 2,
      pointer.targetEnergy,
      pointer.down,
    );
    material.uniforms.uColorA.value.lerp(colors.a, 1 - Math.exp(-delta * 0.7));
    material.uniforms.uColorB.value.lerp(colors.b, 1 - Math.exp(-delta * 0.7));
    material.uniforms.uColorC.value.lerp(colors.c, 1 - Math.exp(-delta * 0.7));

    shellMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    shellMaterial.uniforms.uAudio.value.copy(material.uniforms.uAudio.value);
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
      .multiplyScalar(1.035 + audio.bass * 0.035 + audio.pulse * 0.008);
    core.rotation.y += delta * (0.035 + seedSnapshot.profile.motion * 0.05);
    core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, (pointer.y - 0.5) * 0.16, 0.025);
    core.rotation.z = THREE.MathUtils.lerp(core.rotation.z, (pointer.x - 0.5) * -0.12, 0.025);
    shell.rotation.copy(core.rotation);
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.9, 128, 128]} />
        <shaderMaterial
          ref={coreMaterialRef}
          uniforms={coreUniforms}
          vertexShader={CORE_VERTEX_SHADER}
          fragmentShader={CORE_FRAGMENT_SHADER}
        />
      </mesh>
      <mesh ref={shellRef}>
        <sphereGeometry args={[0.9, 96, 96]} />
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

function OrbitalDetails({ audioRef, pointerRef, seedSnapshot }: InnerSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const knotRef = useRef<THREE.Mesh>(null);
  const satellitesRef = useRef<THREE.Group>(null);
  const color = useMemo(
    () => palette(seedSnapshot.profile.harmonicHue, seedSnapshot.profile.brightness).c,
    [seedSnapshot.profile.brightness, seedSnapshot.profile.harmonicHue],
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
      delta * (0.028 + audio.mid * 0.08 + audio.arousal * 0.09);
    knotRef.current.rotation.z += delta * 0.026;
    satellitesRef.current.rotation.y += delta * (0.06 + seedSnapshot.profile.motion * 0.09);
    satellitesRef.current.rotation.x = (pointer.y - 0.5) * 0.3;
    const moodScale = 0.82 + audio.arousal * 0.42 + audio.valence * 0.08;
    groupRef.current.scale.setScalar(
      THREE.MathUtils.lerp(
        groupRef.current.scale.x,
        moodScale,
        1 - Math.exp(-delta * 0.36),
      ),
    );
  });

  return (
    <group ref={groupRef} rotation={[0.8, 0.1, 0.25]}>
      {[0, 1].map((index) => (
        <mesh key={index} rotation={[Math.PI / 2 + index * 0.48, index * 0.72, index * 0.35]}>
          <torusGeometry args={[1.15 + index * 0.16, 0.0035 + index * 0.001, 8, 180]} />
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
        <torusKnotGeometry args={[1.24, 0.0035, 240, 8, 2, 3]} />
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
  rendererRef,
  seedSnapshot,
}: InnerSceneProps) {
  const { camera, gl } = useThree();
  const frameWindow = useRef({ at: 0, frames: 0 });
  const diagnosticsAt = useRef(0);
  const lightRef = useRef<THREE.PointLight>(null);
  const secondLightRef = useRef<THREE.PointLight>(null);
  const pointerTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!rendererRef.current.webgl) {
      rendererRef.current.webgl = true;
      rendererRef.current.antialias = gl.getContextAttributes()?.antialias ?? false;
    }
    rendererRef.current.quality = gl.getPixelRatio();
    const pointer = pointerRef.current;
    pointer.x += (pointer.targetX - pointer.x) * (1 - Math.exp(-delta * 4.8));
    pointer.y += (pointer.targetY - pointer.y) * (1 - Math.exp(-delta * 4.8));
    pointer.targetEnergy *= pointer.down > 0 ? 0.965 : 0.9;
    audioRef.current = engineRef.current?.readAudioBands() ?? {
      arousal: 0.16,
      bass: 0.025,
      phrase: 0,
      pulse: 0,
      tension: 0,
      mid: 0.018,
      treble: 0.008,
      valence: 0.5,
      interaction: 0,
    };

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
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <OrbitalDetails
        audioRef={audioRef}
        diagnosticsRef={diagnosticsRef}
        engineRef={engineRef}
        pointerRef={pointerRef}
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <Sparkles
        count={90 + Math.round(seedSnapshot.profile.density * 90)}
        scale={[5.8, 4, 4.2]}
        size={0.55 + seedSnapshot.profile.sparkle * 0.65}
        speed={0.055 + seedSnapshot.profile.motion * 0.08}
        opacity={0.22 + seedSnapshot.profile.sparkle * 0.2}
        color={palette(seedSnapshot.profile.harmonicHue, seedSnapshot.profile.brightness).c}
        noise={1.2}
      />
      <fog attach="fog" args={['#03050d', 4.4, 10]} />
    </>
  );
}

function PostEffects({ seedSnapshot }: { seedSnapshot: SeedSnapshot }) {
  const chromaticOffset = useMemo(() => new THREE.Vector2(0.00028, 0.00042), []);
  return (
    <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
      <Bloom
        intensity={0.32 + seedSnapshot.profile.sparkle * 0.2}
        luminanceThreshold={0.52}
        luminanceSmoothing={0.68}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={chromaticOffset}
        radialModulation={false}
        modulationOffset={0.35}
      />
      <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.016} />
      <Vignette eskil={false} offset={0.18} darkness={0.64} />
    </EffectComposer>
  );
}

export function NagiScene(props: NagiSceneProps) {
  const audioRef = useRef<AudioBands>({
    arousal: 0.16,
    bass: 0,
    mid: 0,
    treble: 0,
    interaction: 0,
    phrase: 0,
    pulse: 0,
    tension: 0,
    valence: 0.5,
  });
  const [quality, setQuality] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 720 ? 1 : 1.45,
  );

  return (
    <Canvas
      className="nagi-r3f"
      dpr={quality}
      camera={{ fov: 38, near: 0.1, far: 30, position: [0, 0, 4.9] }}
      gl={{
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#03050d'), 1);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.82;
      }}
    >
      <SceneController {...props} audioRef={audioRef} />
      <PostEffects seedSnapshot={props.seedSnapshot} />
      <AdaptiveQuality
        quality={quality}
        rendererRef={props.rendererRef}
        setQuality={setQuality}
      />
    </Canvas>
  );
}

function AdaptiveQuality({
  quality,
  rendererRef,
  setQuality,
}: {
  quality: number;
  rendererRef: RefObject<NagiRendererDiagnostics>;
  setQuality: (quality: number) => void;
}) {
  const lowFrames = useRef(0);
  const highFrames = useRef(0);
  useFrame((_, delta) => {
    const fps = 1 / Math.max(delta, 0.001);
    if (fps < 43) {
      lowFrames.current += 1;
      highFrames.current = 0;
    } else if (fps > 57) {
      highFrames.current += 1;
      lowFrames.current = 0;
    } else {
      lowFrames.current = Math.max(0, lowFrames.current - 1);
      highFrames.current = Math.max(0, highFrames.current - 1);
    }
    if (lowFrames.current > 100 && quality > 0.85) {
      const next = Math.max(0.85, quality - 0.2);
      setQuality(next);
      rendererRef.current.quality = next;
      lowFrames.current = 0;
    }
    if (highFrames.current > 480 && quality < 1.45 && window.innerWidth >= 720) {
      const next = Math.min(1.45, quality + 0.1);
      setQuality(next);
      rendererRef.current.quality = next;
      highFrames.current = 0;
    }
  });
  return null;
}
