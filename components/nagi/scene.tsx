'use client';

import {
  BACKDROP_VERTEX_SHADER,
  BACKDROP_FRAGMENT_SHADER,
  CORE_VERTEX_SHADER,
  CORE_FRAGMENT_SHADER,
  SHELL_VERTEX_SHADER,
  SHELL_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
} from '../../lib/nagi/shaders';
import { Points } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, type BloomEffect } from 'postprocessing';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type AudioBands,
  type NagiAudioEngine,
} from '../../lib/nagi/audio-engine';
import {
  CORE_EMOTIONS,
  SeededRandom,
  seedToNumber,
  visualVariantFromSeed,
  type EmotionName,
  type SeedSnapshot,
} from '../../lib/nagi/generative';
import {
  EMOTION_COLOR_PALETTES,
  EMOTION_SHADER_TEMPLATES,
} from '../../lib/nagi/visual-presets';
import { advancePointer, type NagiPointerField } from '../../lib/nagi/pointer-field';

export type NagiRendererDiagnostics = {
  antialias: boolean;
  barPhase: number;
  beatPhase: number;
  contextLosses: number;
  drawCalls: number;
  fps: number;
  frames: number;
  maxFrameGapMs: number;
  pointerEnergy: number;
  motion?: {
    backdrop: number;
    coreRibbon: number;
    coreBand: number;
    particles: number;
    particleCount: number;
    particleGeometry?: number;
  };
  pulse: number;
  quality: number;
  styleName: string;
  styleVariant: number;
  webgl: boolean;
};

type NagiSceneProps = {
  frameRate?: number;
  paused?: boolean;
  diagnosticsRef: RefObject<HTMLOutputElement | null>;
  engineRef: RefObject<NagiAudioEngine | null>;
  pointerRef: RefObject<NagiPointerField>;
  rendererRef: RefObject<NagiRendererDiagnostics>;
  seedSnapshot: SeedSnapshot;
};

type InnerSceneProps = NagiSceneProps & {
  audioRef: RefObject<AudioBands>;
  snapshotRef: RefObject<SeedSnapshot>;
};

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

function EmotionBackdrop({ audioRef, pointerRef, snapshotRef, rendererRef }: InnerSceneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
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
  const stylesRef = useRef<{
    key: string;
    current: ReturnType<typeof shaderState>;
    incoming: ReturnType<typeof shaderState>;
  } | null>(null);
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
      uDrift: { value: 0 },
      uTransport: { value: new THREE.Vector4() },
    }),
    [],
  );

  useFrame((_state, elapsed) => {
    const material = materialRef.current;
    if (!material) return;
    const delta = Math.min(elapsed, 0.1);
    const seedSnapshot = snapshotRef.current;
    const seedValue = seedToNumber(seedSnapshot.currentSeed) / 4294967295;
    const styleKey = `${seedSnapshot.currentSeed}:${seedSnapshot.incomingSeed}:${seedSnapshot.emotion}:${seedSnapshot.incomingEmotion}`;
    if (stylesRef.current?.key !== styleKey) {
      stylesRef.current = {
        key: styleKey,
        current: shaderState(seedSnapshot.emotion, seedSnapshot.currentSeed),
        incoming: shaderState(seedSnapshot.incomingEmotion ?? seedSnapshot.emotion,
          seedSnapshot.incomingSeed ?? seedSnapshot.currentSeed),
      };
    }
    const styleTargets = stylesRef.current;
    const audio = audioRef.current;
    const pointer = pointerRef.current;
    const targetSeed = seedSnapshot.incomingSeed
      ? THREE.MathUtils.lerp(
          seedToNumber(seedSnapshot.currentSeed) / 4294967295,
          seedToNumber(seedSnapshot.incomingSeed) / 4294967295,
          seedSnapshot.transition,
        )
      : seedValue;
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
      pointer.energy,
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
    material.uniforms.uDrift.value += delta *
      THREE.MathUtils.lerp(0.018, 0.075, material.uniforms.uEmotion.value.x) *
      material.uniforms.uPatternParams.value.y;
    if (rendererRef.current.motion) rendererRef.current.motion.backdrop = material.uniforms.uDrift.value;
    material.uniforms.uTransport.value.set(
      audio.pulse,
      audio.beatPhase,
      audio.barPhase,
      audio.phrase,
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

function DreamCore({ audioRef, pointerRef, snapshotRef, rendererRef }: InnerSceneProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const coreMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const shellMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const colors = useMemo(() => palette(), []);
  const targetScale = useMemo(() => new THREE.Vector3(), []);
  const touchPosition = useMemo(() => new THREE.Vector3(), []);
  const coreUniforms = useMemo(
    () => ({
      uColorA: { value: new THREE.Color('#102b3a') },
      uColorB: { value: new THREE.Color('#75608b') },
      uColorC: { value: new THREE.Color('#d4dbe8') },
      uEmotion: { value: new THREE.Vector2() },
      uPointer: { value: new THREE.Vector4() },
      uTouch: { value: new THREE.Vector2() },
      uSeed: { value: 0 },
      uShape: { value: 0.5 },
      uSparkle: { value: 0.5 },
      uTension: { value: 0 },
      uTime: { value: 0 },
      uRibbonPhase: { value: 0 },
      uBandPhase: { value: 0 },
    }),
    [],
  );
  const shellUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#d4dbe8') },
      uOpacity: { value: 0.16 },
      uPointer: { value: new THREE.Vector4() },
      uTouch: { value: new THREE.Vector2() },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state, elapsed) => {
    const core = coreRef.current;
    const shell = shellRef.current;
    const material = coreMaterialRef.current;
    const shellMaterial = shellMaterialRef.current;
    if (!core || !shell || !material || !shellMaterial) return;
    const delta = Math.min(elapsed, 0.1);
    const seedSnapshot = snapshotRef.current;
    const seedValue = seedToNumber(seedSnapshot.currentSeed) / 4294967295;
    const audio = audioRef.current;
    const pointer = pointerRef.current;
    const targetSeed = seedSnapshot.incomingSeed
      ? THREE.MathUtils.lerp(
          seedToNumber(seedSnapshot.currentSeed) / 4294967295,
          seedToNumber(seedSnapshot.incomingSeed) / 4294967295,
          seedSnapshot.transition,
        )
      : seedValue;
    material.uniforms.uTime.value += delta;
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
    const emotionEase = 1 - Math.exp(-delta * 1.2);
    material.uniforms.uEmotion.value.x = THREE.MathUtils.lerp(material.uniforms.uEmotion.value.x, audio.arousal, emotionEase);
    material.uniforms.uEmotion.value.y = THREE.MathUtils.lerp(material.uniforms.uEmotion.value.y, audio.valence, emotionEase);
    material.uniforms.uRibbonPhase.value += delta * (0.12 + material.uniforms.uEmotion.value.x * 0.2);
    material.uniforms.uBandPhase.value += delta * (0.14 + material.uniforms.uEmotion.value.x * 0.12);
    if (rendererRef.current.motion) {
      rendererRef.current.motion.coreRibbon = material.uniforms.uRibbonPhase.value;
      rendererRef.current.motion.coreBand = material.uniforms.uBandPhase.value;
    }
    material.uniforms.uTension.value = audio.tension;
    material.uniforms.uPointer.value.set(
      pointer.x * 2 - 1,
      1 - pointer.y * 2,
      pointer.energy,
      pointer.pressure,
    );
    // 将指针投到主体所在的世界平面，按压位置不随主体自转而漂移。
    touchPosition.set(pointer.x * 2 - 1, 1 - pointer.y * 2, 0.5).unproject(state.camera);
    touchPosition.sub(state.camera.position);
    touchPosition.multiplyScalar(-state.camera.position.z / touchPosition.z).add(state.camera.position);
    material.uniforms.uTouch.value.set(touchPosition.x, touchPosition.y);
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

    shellMaterial.uniforms.uTime.value = material.uniforms.uTime.value;
    shellMaterial.uniforms.uColor.value.lerp(colors.c, 1 - Math.exp(-delta * 0.7));
    shellMaterial.uniforms.uOpacity.value = 0.12 + seedSnapshot.profile.depth * 0.12;
    shellMaterial.uniforms.uPointer.value.copy(material.uniforms.uPointer.value);
    shellMaterial.uniforms.uTouch.value.copy(material.uniforms.uTouch.value);

    const shape = seedSnapshot.profile.shape;
    targetScale.set(
      0.92 + shape * 0.14 + audio.arousal * 0.13,
      1.08 - shape * 0.1 - audio.arousal * 0.08,
      0.9 + seedSnapshot.profile.depth * 0.1 + audio.valence * 0.08,
    );
    core.scale.lerp(targetScale, 1 - Math.exp(-delta * 0.55));
    shell.scale
      .copy(core.scale)
      .multiplyScalar(1.045);
    core.rotation.y += delta * (0.035 + seedSnapshot.profile.motion * 0.05);
    const tiltEase = 1 - Math.exp(-delta * 1.2);
    core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, (pointer.y - 0.5) * 0.09, tiltEase);
    core.rotation.z = THREE.MathUtils.lerp(core.rotation.z, (pointer.x - 0.5) * -0.07, tiltEase);
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

function OrbitalDetails({ audioRef, pointerRef, seedSnapshot, snapshotRef }: InnerSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const knotRef = useRef<THREE.Mesh>(null);
  const satellitesRef = useRef<THREE.Group>(null);
  const colors = useMemo(() => palette(), []);
  const materials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);

  useFrame((state, elapsed) => {
    if (!groupRef.current || !knotRef.current || !satellitesRef.current) return;
    const delta = Math.min(elapsed, 0.1);
    const seedSnapshot = snapshotRef.current;
    const pointer = pointerRef.current;
    const audio = audioRef.current;
    groupRef.current.rotation.x +=
      delta * (0.018 + seedSnapshot.profile.flow * 0.03 + audio.arousal * 0.055);
    groupRef.current.rotation.z -= delta * 0.018;
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      (pointer.x - 0.5) * 0.28 + state.clock.elapsedTime * 0.012,
      1 - Math.exp(-delta * 1.2),
    );
    knotRef.current.rotation.y -=
      delta * (0.028 + seedSnapshot.profile.flow * 0.05 + audio.arousal * 0.09);
    knotRef.current.rotation.z += delta * 0.026;
    satellitesRef.current.rotation.y += delta * (0.06 + seedSnapshot.profile.motion * 0.09);
    satellitesRef.current.rotation.x = (pointer.y - 0.5) * 0.3;
    satellitesRef.current.rotation.z +=
      delta * (0.012 + seedSnapshot.profile.motion * 0.018);
    setEmotionPalette(colors, seedSnapshot.emotion, seedSnapshot.incomingEmotion,
      seedSnapshot.transition, seedSnapshot.profile.harmonicHue, seedSnapshot.profile.brightness,
      audio.arousal, audio.valence, seedToNumber(seedSnapshot.currentSeed) / 4294967295);
    for (const material of materials.current) material?.color.lerp(colors.c, 1 - Math.exp(-delta * 0.7));
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
          <torusGeometry args={[1.15 + index * 0.16, 0.0035 + index * 0.001, 8, 180]} />
          <meshBasicMaterial
            ref={(material) => { materials.current[index] = material; }}
            color="#d4dbe8"
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
          ref={(material) => { materials.current[2] = material; }}
          color="#d4dbe8"
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
              ref={(material) => { materials.current[index + 3] = material; }}
              color="#d4dbe8"
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

function AmbientParticles({ audioRef, snapshotRef, rendererRef }: Pick<InnerSceneProps,
  'audioRef' | 'snapshotRef' | 'rendererRef'>) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const colors = useMemo(() => palette(), []);
  // 保留粒子身份；位置仍随连续相位和 Seed 漂移，密度以透明度过渡。
  const positions = useMemo(() => {
    const random = new SeededRandom('4E414749').fork('ambient-particles');
    return Float32Array.from({ length: 180 * 3 }, (_, index) =>
      (random.next() - 0.5) * [5.8, 4, 4.2][index % 3]);
  }, []);
  const uniforms = useMemo(() => ({
    uPhase: { value: 0 }, uSeed: { value: 0 }, uDensity: { value: 0.75 },
    uSize: { value: 0.8 }, uOpacity: { value: 0.3 }, uPixelRatio: { value: 1 },
    uColor: { value: new THREE.Color('#d4dbe8') },
  }), []);
  useFrame((state, elapsed) => {
    const material = materialRef.current;
    if (!material) return;
    const delta = Math.min(elapsed, 0.1);
    const snapshot = snapshotRef.current;
    const profile = snapshot.profile;
    const audio = audioRef.current;
    const seed = THREE.MathUtils.lerp(seedToNumber(snapshot.currentSeed),
      seedToNumber(snapshot.incomingSeed ?? snapshot.currentSeed), snapshot.transition) / 4294967295;
    const ease = 1 - Math.exp(-delta * 0.8);
    material.uniforms.uPhase.value += delta * (0.055 + profile.motion * 0.08);
    material.uniforms.uSeed.value = THREE.MathUtils.lerp(material.uniforms.uSeed.value, seed, ease);
    material.uniforms.uDensity.value = THREE.MathUtils.lerp(material.uniforms.uDensity.value, 0.5 + profile.density * 0.5, ease);
    material.uniforms.uSize.value = THREE.MathUtils.lerp(material.uniforms.uSize.value, 0.55 + profile.sparkle * 0.65, ease);
    material.uniforms.uOpacity.value = THREE.MathUtils.lerp(material.uniforms.uOpacity.value, 0.22 + profile.sparkle * 0.2, ease);
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    setEmotionPalette(colors, snapshot.emotion, snapshot.incomingEmotion, snapshot.transition,
      profile.harmonicHue, profile.brightness, audio.arousal, audio.valence, seed);
    material.uniforms.uColor.value.lerp(colors.c, ease);
    if (rendererRef.current.motion) {
      rendererRef.current.motion.particles = material.uniforms.uPhase.value;
      rendererRef.current.motion.particleCount = positions.length / 3;
      rendererRef.current.motion.particleGeometry = pointsRef.current?.geometry.id;
    }
  });
  return (
    <Points ref={pointsRef} positions={positions} frustumCulled={false}>
      <shaderMaterial ref={materialRef} uniforms={uniforms}
        vertexShader={PARTICLE_VERTEX_SHADER} fragmentShader={PARTICLE_FRAGMENT_SHADER}
        transparent depthWrite={false} />
    </Points>
  );
}

function SceneController({
  audioRef,
  snapshotRef,
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

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      rendererRef.current.contextLosses += 1;
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    return () => canvas.removeEventListener('webglcontextlost', handleContextLost);
  }, [gl, rendererRef]);

  useFrame((state, elapsed) => {
    const delta = Math.min(elapsed, 0.1);
    snapshotRef.current = engineRef.current?.getSnapshot() ?? seedSnapshot;
    rendererRef.current.motion ??= { backdrop: 0, coreRibbon: 0, coreBand: 0, particles: 0, particleCount: 180 };
    if (!rendererRef.current.webgl) {
      rendererRef.current.webgl = true;
      rendererRef.current.antialias = gl.getContextAttributes()?.antialias ?? false;
    }
    rendererRef.current.quality = gl.getPixelRatio();
    rendererRef.current.maxFrameGapMs = Math.max(
      rendererRef.current.maxFrameGapMs,
      Math.min(1000, elapsed * 1000),
    );
    const styleVariant = shaderVariantIndex(seedSnapshot.currentSeed);
    rendererRef.current.styleVariant =
      CORE_EMOTIONS.indexOf(seedSnapshot.emotion) * 3 + styleVariant;
    rendererRef.current.styleName =
      EMOTION_SHADER_TEMPLATES[seedSnapshot.emotion][styleVariant].label;
    const pointer = pointerRef.current;
    advancePointer(pointer, delta);
    rendererRef.current.pointerEnergy = pointer.energy;
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
      (pointer.x - 0.5) * (mobile ? 0.08 : 0.12),
      (0.5 - pointer.y) * (mobile ? 0.05 : 0.075),
      mobile ? 8.4 : 4.9,
    );
    camera.position.lerp(pointerTarget, 1 - Math.exp(-delta * 1.7));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

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
  }, -1);

  return (
    <>
      <EmotionBackdrop
        audioRef={audioRef}
        snapshotRef={snapshotRef}
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
        snapshotRef={snapshotRef}
        diagnosticsRef={diagnosticsRef}
        engineRef={engineRef}
        pointerRef={pointerRef}
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <OrbitalDetails
        audioRef={audioRef}
        snapshotRef={snapshotRef}
        diagnosticsRef={diagnosticsRef}
        engineRef={engineRef}
        pointerRef={pointerRef}
        rendererRef={rendererRef}
        seedSnapshot={seedSnapshot}
      />
      <AmbientParticles audioRef={audioRef} snapshotRef={snapshotRef} rendererRef={rendererRef} />
      <fog attach="fog" args={['#03050d', 4.4, 10]} />
    </>
  );
}

function PostEffects({ snapshotRef }: { snapshotRef: RefObject<SeedSnapshot> }) {
  const bloom = useRef<BloomEffect>(null);
  useFrame((_state, delta) => {
    if (bloom.current) bloom.current.intensity = THREE.MathUtils.lerp(bloom.current.intensity,
      0.32 + snapshotRef.current.profile.sparkle * 0.2, 1 - Math.exp(-Math.min(delta, 0.1) * 0.8));
  });
  const chromaticOffset = useMemo(() => new THREE.Vector2(0.00028, 0.00042), []);
  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.UnsignedByteType}>
      <Bloom
        ref={bloom}
        intensity={0.4}
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

function FrameRateLimiter({ fps, paused }: { fps: number; paused: boolean }) {
  const advance = useThree((state) => state.advance);
  const elapsed = useRef(0);

  useEffect(() => {
    if (paused) return;
    let frame = 0;
    let last = performance.now();
    let lastRender = last;
    let accumulated = 0;
    const interval = 1000 / fps;
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      accumulated += Math.min(100, now - last);
      last = now;
      if (accumulated + 0.5 < interval) return;
      elapsed.current += Math.min(1, (now - lastRender) / 1000);
      lastRender = now;
      accumulated = Math.max(0, accumulated - interval) % interval;
      advance(elapsed.current);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [advance, fps, paused]);

  return null;
}

export function NagiScene(props: NagiSceneProps) {
  const snapshotRef = useRef(props.seedSnapshot);
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
  const qualityForViewport = () =>
    Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1 : 1.35);
  const [quality, setQuality] = useState(qualityForViewport);

  useEffect(() => {
    let frame = 0;
    const updateQuality = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setQuality(qualityForViewport()));
    };
    window.addEventListener('resize', updateQuality, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateQuality);
    };
  }, []);

  return (
    <Canvas
      className="nagi-r3f"
      frameloop={props.frameRate === undefined ? 'always' : 'never'}
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
      {props.frameRate !== undefined && (
        <FrameRateLimiter fps={props.frameRate} paused={props.paused ?? false} />
      )}
      <SceneController {...props} audioRef={audioRef} snapshotRef={snapshotRef} />
      <PostEffects snapshotRef={snapshotRef} />
    </Canvas>
  );
}
