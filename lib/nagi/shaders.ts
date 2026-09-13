// 背景与前景 Shader 独立保存，便于调整视觉效果。
export const BACKDROP_VERTEX_SHADER = `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BACKDROP_FRAGMENT_SHADER = `
precision highp float;
uniform float uDrift;
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
  float slowTime = uDrift;
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
  float sparkleNoise = hash31(floor(d * 82.0));
  float sparkleDrift = 0.72 + 0.28 * sin(
    slowTime * 7.0 + sparkleNoise * 18.0 + uSeed * 9.0 + uTransport.y * 6.2831853
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
  float starNoise = hash31(floor(d * 180.0));
  float stars = smoothstep(0.982, 0.999, starNoise);
  float twinkle = 0.5 + 0.5 * sin(uTransport.y * 6.2831853 + starNoise * 21.0 + uSeed * 11.0);
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

// 核心与外层共用连续的局部凹陷和轻微隆起，避免穿过中心时方向翻转。
const SOFT_TOUCH_GLSL = `
uniform vec4 uPointer;
uniform vec2 uTouch;

float softTouchDisplacement(vec3 localPosition, vec3 localNormal) {
  vec3 worldPosition = (modelMatrix * vec4(localPosition, 1.0)).xyz;
  vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
  vec2 offset = worldPosition.xy - uTouch;
  float distanceSquared = dot(offset, offset);
  float contact = exp(-distanceSquared * 5.0);
  float shoulder = exp(-distanceSquared * 1.8) - contact;
  float front = smoothstep(-0.05, 0.5, worldNormal.z);
  float strength = uPointer.z * 0.055 + uPointer.w * 0.06;
  return (-contact + shoulder * 0.32) * strength * front;
}
`;

export const CORE_VERTEX_SHADER = `
uniform float uTime;
uniform float uRibbonPhase;
uniform float uSeed;
uniform float uShape;
${SOFT_TOUCH_GLSL}
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
    atan(position.y, position.x) * 3.0 + position.z * 5.0 - uRibbonPhase
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
  float displacement = field * mix(0.1, 0.3, uShape) * mix(0.72, 1.2, arousal)
    + fine * (0.45 + uShape);
  displacement += softTouchDisplacement(position, normal);
  transformed += vec3(
    sin(position.y * 2.7 + uTime * 0.13),
    sin(position.z * 3.1 - uTime * 0.11),
    cos(position.x * 2.9 + uTime * 0.09)
  ) * (0.018 + uShape * 0.025);
  transformed += normal * displacement;
  transformed.xy += uPointer.xy * (0.006 + (position.z + 1.0) * 0.008);

  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vPosition = transformed;
  vWorldPosition = world.xyz;
  vDisplacement = displacement;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const CORE_FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform float uBandPhase;
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
    + uBandPhase + uSeed * 23.0
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

export const SHELL_VERTEX_SHADER = `
uniform float uTime;
${SOFT_TOUCH_GLSL}
varying vec3 vNormalWorld;
varying vec3 vWorldPosition;
void main() {
  vec3 transformed = position + normal * sin(position.y * 6.0 + uTime * 0.22) * 0.022;
  transformed += normal * softTouchDisplacement(position, normal);
  transformed.xy += uPointer.xy * (0.006 + (position.z + 1.0) * 0.008);
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const SHELL_FRAGMENT_SHADER = `
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

export const PARTICLE_VERTEX_SHADER = `
uniform float uPhase;
uniform float uSeed;
uniform float uDensity;
uniform float uSize;
uniform float uOpacity;
uniform float uPixelRatio;
varying float vOpacity;
void main() {
  vec3 moved = position;
  float phase = uPhase + uSeed * 6.0;
  moved.y += sin(phase + position.x * 120.0) * 0.2;
  moved.z += cos(phase * 0.93 + position.y * 120.0) * 0.2;
  moved.x += cos(phase * 0.87 + position.z * 120.0) * 0.2;
  vec4 viewPosition = modelViewMatrix * vec4(moved, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSize * 25.0 * uPixelRatio / max(0.1, -viewPosition.z);
  float rank = fract(sin(dot(position, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  vOpacity = uOpacity * (1.0 - smoothstep(uDensity - 0.04, uDensity + 0.04, rank));
}
`;

export const PARTICLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
varying float vOpacity;
void main() {
  float radius = max(length(gl_PointCoord - 0.5), 0.015);
  float strength = max(0.0, 0.05 / radius - 0.1);
  gl_FragColor = vec4(uColor, strength * vOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
