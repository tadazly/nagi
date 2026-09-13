import { useSyncExternalStore } from 'react';

import type { PlaybackSettings } from '../lib/nagi/playback-settings';

export type WallpaperSettings = PlaybackSettings;

declare global {
  interface Window {
    __NAGI_WALLPAPER__?: {
      getSnapshot: () => WallpaperSettings;
      subscribe: (listener: () => void) => () => void;
    };
    wallpaperPropertyListener?: {
      applyUserProperties: (properties: Record<string, { value: unknown }>) => void;
      applyGeneralProperties: (properties: { fps?: number }) => void;
      setPaused: (paused: boolean) => void;
    };
  }
}

const getSnapshot = () => window.__NAGI_WALLPAPER__?.getSnapshot() ?? null;
const getServerSnapshot = () => null;
const subscribe = (listener: () => void) =>
  window.__NAGI_WALLPAPER__?.subscribe(listener) ?? (() => {});

export function useWallpaperSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
