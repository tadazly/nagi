export const RENDER_QUALITY_TIERS = [
  'economy',
  'balanced',
  'quality',
  'ultra',
] as const;

export type RenderQualityTier = (typeof RENDER_QUALITY_TIERS)[number];

export type RenderDeviceProfile = {
  coarsePointer: boolean;
  deviceMemoryGb: number | null;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  height: number;
  width: number;
};

export type RenderGpuProfile = {
  halfFloatColorBuffer: boolean;
  maxSamples: number;
};

export type RenderQualityPlan = {
  backdropSegments: number;
  chromaticAberration: boolean;
  coreSegments: number;
  detailScale: number;
  dpr: number;
  dprCap: number;
  frameBuffer: 'half-float' | 'unsigned-byte';
  knotSegments: number;
  mipmapBloom: boolean;
  multisampling: number;
  orbitalSegments: number;
  shellSegments: number;
  smaa: boolean;
  smaaPreset: 'medium' | 'high';
  tier: RenderQualityTier;
};

type TierProfile = Omit<
  RenderQualityPlan,
  'dpr' | 'frameBuffer' | 'multisampling' | 'smaa' | 'tier'
> & {
  desiredMultisampling: number;
  preferHalfFloat: boolean;
};

const TIER_PROFILES: Readonly<Record<RenderQualityTier, TierProfile>> = {
  economy: {
    backdropSegments: 48,
    chromaticAberration: false,
    coreSegments: 72,
    detailScale: 0.72,
    desiredMultisampling: 0,
    dprCap: 1,
    knotSegments: 160,
    mipmapBloom: false,
    orbitalSegments: 120,
    preferHalfFloat: false,
    shellSegments: 56,
    smaaPreset: 'medium',
  },
  balanced: {
    backdropSegments: 56,
    chromaticAberration: false,
    coreSegments: 96,
    detailScale: 0.84,
    desiredMultisampling: 2,
    dprCap: 1.3,
    knotSegments: 192,
    mipmapBloom: false,
    orbitalSegments: 144,
    preferHalfFloat: false,
    shellSegments: 72,
    smaaPreset: 'high',
  },
  quality: {
    backdropSegments: 64,
    chromaticAberration: true,
    coreSegments: 112,
    detailScale: 0.92,
    desiredMultisampling: 4,
    dprCap: 1.6,
    knotSegments: 216,
    mipmapBloom: true,
    orbitalSegments: 168,
    preferHalfFloat: true,
    shellSegments: 88,
    smaaPreset: 'high',
  },
  ultra: {
    backdropSegments: 64,
    chromaticAberration: true,
    coreSegments: 128,
    detailScale: 1,
    desiredMultisampling: 4,
    dprCap: 2,
    knotSegments: 240,
    mipmapBloom: true,
    orbitalSegments: 180,
    preferHalfFloat: true,
    shellSegments: 96,
    smaaPreset: 'high',
  },
};

const tierAt = (index: number) =>
  RENDER_QUALITY_TIERS[Math.max(0, Math.min(RENDER_QUALITY_TIERS.length - 1, index))];

export function renderTierIndex(tier: RenderQualityTier) {
  return RENDER_QUALITY_TIERS.indexOf(tier);
}

export function chooseRenderQualityCeiling(
  device: RenderDeviceProfile,
): RenderQualityTier {
  let score = 2;
  if (device.hardwareConcurrency >= 10) score += 1;
  else if (device.hardwareConcurrency <= 4) score -= 1;

  if (device.deviceMemoryGb !== null) {
    if (device.deviceMemoryGb >= 8) score += 1;
    else if (device.deviceMemoryGb <= 2) score -= 1;
  }

  const shortEdge = Math.min(device.width, device.height);
  if (device.coarsePointer && shortEdge < 720) score -= 1;

  const sampledPixels =
    device.width *
    device.height *
    Math.pow(Math.min(Math.max(device.devicePixelRatio, 1), 2), 2);
  if (sampledPixels > 12_000_000) score -= 2;
  else if (sampledPixels > 7_000_000) score -= 1;

  return tierAt(score);
}

export function resolveRenderQualityPlan(
  tier: RenderQualityTier,
  devicePixelRatio: number,
  gpu: RenderGpuProfile,
): RenderQualityPlan {
  const profile = TIER_PROFILES[tier];
  const availableSamples = Math.max(0, Math.floor(gpu.maxSamples));
  const multisampling =
    profile.desiredMultisampling >= 2 && availableSamples >= 2
      ? Math.min(profile.desiredMultisampling, availableSamples)
      : 0;
  return {
    backdropSegments: profile.backdropSegments,
    chromaticAberration: profile.chromaticAberration,
    coreSegments: profile.coreSegments,
    detailScale: profile.detailScale,
    dpr: Math.min(Math.max(devicePixelRatio || 1, 0.75), profile.dprCap),
    dprCap: profile.dprCap,
    frameBuffer:
      profile.preferHalfFloat && gpu.halfFloatColorBuffer
        ? 'half-float'
        : 'unsigned-byte',
    knotSegments: profile.knotSegments,
    mipmapBloom: profile.mipmapBloom,
    multisampling,
    orbitalSegments: profile.orbitalSegments,
    shellSegments: profile.shellSegments,
    smaa: multisampling === 0,
    smaaPreset: profile.smaaPreset,
    tier,
  };
}

export function stepRenderQualityTier(
  tier: RenderQualityTier,
  ceiling: RenderQualityTier,
  direction: 'down' | 'up',
): RenderQualityTier {
  const currentIndex = renderTierIndex(tier);
  const ceilingIndex = renderTierIndex(ceiling);
  const nextIndex = direction === 'down' ? currentIndex - 1 : currentIndex + 1;
  return tierAt(Math.min(nextIndex, ceilingIndex));
}

export function readRenderDeviceProfile(): RenderDeviceProfile {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    deviceMemoryGb:
      typeof navigatorWithMemory.deviceMemory === 'number'
        ? navigatorWithMemory.deviceMemory
        : null,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    height: window.innerHeight,
    width: window.innerWidth,
  };
}
