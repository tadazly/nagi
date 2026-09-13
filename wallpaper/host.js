// Register before the application bundle loads so initial host events are retained.
(() => {
  let state = Object.freeze({
    fps: 30,
    paused: false,
    seed: '',
    showcontrols: true,
    showtitle: true,
    sound: true,
    toolbarbottom: 80,
    volume: 84,
  });
  const listeners = new Set();
  function update(values) {
    if (Object.keys(values).every((key) => state[key] === values[key])) return;
    state = Object.freeze({ ...state, ...values });
    listeners.forEach((listener) => listener());
  }
  window.__NAGI_WALLPAPER__ = {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      const values = {};
      for (const key of ['sound', 'showtitle', 'showcontrols']) {
        if (typeof properties[key]?.value === 'boolean') {
          values[key] = properties[key].value;
        }
      }
      if (typeof properties.volume?.value === 'number' && Number.isFinite(properties.volume.value)) {
        values.volume = Math.min(100, Math.max(0, properties.volume.value));
      }
      if (typeof properties.toolbarbottom?.value === 'number' && Number.isFinite(properties.toolbarbottom.value)) {
        values.toolbarbottom = Math.min(240, Math.max(0, properties.toolbarbottom.value));
      }
      if (typeof properties.seed?.value === 'string') {
        const seed = properties.seed.value.trim().toUpperCase();
        if (seed === '' || /^[0-9A-F]{8}$/.test(seed)) values.seed = seed;
      }
      update(values);
    },
    applyGeneralProperties(properties) {
      if (typeof properties.fps === 'number' && Number.isFinite(properties.fps) && properties.fps > 0) {
        update({ fps: Math.min(240, Math.max(1, properties.fps)) });
      }
    },
    setPaused(paused) {
      update({ paused: Boolean(paused) });
    },
  };
})();
