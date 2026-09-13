# NAGI（凪）

> An endless, slowly evolving space of sound and light.

[Open NAGI in your browser](https://nagi.luyilabs.com/) · [简体中文](README.zh-CN.md) · [GitHub](https://github.com/tadazly/nagi)

NAGI is a generative ambient music experience built for the web. It creates music with the Web Audio API and a shared emotional world with Three.js: harmony, melody, timbre, color, and motion evolve together over time.

“凪” describes the calm after the wind settles. Here, calm still contains movement: a slow tide, a shift in light, a distant echo. There is no playlist to manage and no next track to wait for.

## Experience

Click or tap anywhere to begin listening. Move the pointer to gently influence the space. In both the website and wallpaper, move near the bottom-right corner to reveal the toolbar: pause, mute, choose a new random Seed, or adjust the volume. It fades out when you move away. On a touchscreen, tap that corner to reveal it.

Each eight-character hexadecimal Seed defines an initial emotion and a musical and visual identity. A new Seed blends into the current state. Music continues to develop through phrases and changing orchestration; the picture shares its mood without turning every foreground movement into a beat pulse.

You can start with a particular Seed using `?seed=7F3A91C2`. The same Seed determines the generative starting state; live interaction and playback timing still influence the experience.

## Run locally

Use **Node.js 22.13 or newer** and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by the development server. The browser needs WebGL 2 and Web Audio support; audio starts after a user gesture.

## Build and publish the website

The website is the primary application, using Next.js App Router. Routes and metadata live in `app/`; website build settings live in `next.config.ts`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the production website into `.next/`. |
| `npm run start` | Serve the Next.js production build. |
| `npm run build:static` | Export the website with Next.js into `out/` for static hosting. |
| `npm run build:wallpaper` | Build an independent, offline Wallpaper Engine package. |
| `npm run lint` | Check JavaScript and TypeScript style and common mistakes. |
| `npm run typecheck` | Check TypeScript without emitting files. |
| `npm run test:pointer` | Check damped pointer motion, pressure, release, and frame-rate consistency. |
| `npm run test:soak` | Run the deterministic generative and visual regression audit. |

For Node.js hosting, run `npm run build` followed by `npm run start`. For static hosting, run `npm run build:static` and upload the contents of `out/`. Stop a development server before running standalone builds or type checks so generated framework files do not compete.

## Wallpaper Engine

```sh
npm run build:wallpaper
```

The command produces `dist/wallpaper-engine/NAGI/`, `NAGI-Wallpaper-Engine.zip`, and an external SHA-256 checksum. Extract the ZIP and copy its `NAGI` folder into Wallpaper Engine's `projects/myprojects/`, or import `NAGI/index.html` in the wallpaper editor. Preserve the bundled `project.json` to keep its settings and links.

This is a secondary entry to the same experience. It starts automatically, works offline, follows the host's frame limit and pause state, and exposes music, volume, Seed, title, and control visibility settings. The properties panel includes links to the project repository and the author's Steam profile.

The wallpaper toolbar reserves 80px below it for the desktop taskbar. Adjust **Toolbar bottom spacing** in the properties panel if needed. The GitHub link opens through Steam's external-link confirmation page.

Only the seven runtime files are packaged. The project and dependency license notices are embedded in the JavaScript bundle; documentation, source maps, and development files are not included. The build uses standard production minification.

[Wallpaper Engine import reference](https://docs.wallpaperengine.io/en/web/first/gettingstarted.html) · [Detailed import notes (中文)](docs/wallpaper-engine.md)

## Project structure

```text
app/                         Website route, layout, metadata, and global style entry
components/nagi/
  experience.tsx             Shared playback controls, pointer input, and Seed UI
  scene.tsx                  Three.js scene, camera, effects, and frame limiting
lib/nagi/
  audio-engine.ts            Web Audio graph, scheduling, synthesis, and diagnostics
  generative.ts              Seed, emotion, harmony, and continuous transitions
  composition.ts             Motifs, rhythm, and melodic development
  performance.ts             Instrument choices, articulation, and orchestration
  shaders.ts                 Background, core, and shell GLSL shaders
  visual-presets.ts          Emotion palettes and shader templates
  classical-*.ts / *.json    Musical themes and the compact corpus-derived prior
  playback-settings.ts       Optional external playback settings
  pointer-field.ts           Damped pointer motion and soft pressure/release
styles/nagi.css              Shared visual styles
wallpaper/                   Wallpaper entry, host bridge, properties, and styles
scripts/                     Web/static/wallpaper builds, model training, and audits
public/                      Website icon and social preview
```

The web route renders the shared experience without host settings. The wallpaper entry reads its host bridge and passes settings to that same component. The audio and generative modules do not depend on either publishing environment.

## Contributing and remixing

Fork the project, try a new sound or visual idea, and open an issue or pull request. Changes to synthesis belong in `audio-engine.ts`; changes to musical structure belong in `generative.ts`, `composition.ts`, or `performance.ts`; visual experiments can start in `shaders.ts` and `visual-presets.ts`.

Please preserve smooth transitions, reproducible random domains, and restrained foreground movement. Run lint, type checks, the soak audit, and the build you changed. For shared UI changes, check both the website and wallpaper entry. The soak audit simulates 24 hours; it does not replace real listening, browser interaction, or device acceptance.

[Architecture and musical design](docs/generative-architecture.md)

## Acknowledgments

NAGI is built on the following open-source projects. Thank you to their authors and contributors:

- **Web:** [React](https://github.com/facebook/react) and [Next.js](https://github.com/vercel/next.js).
- **Visuals:** [Three.js](https://github.com/mrdoob/three.js), [React Three Fiber](https://github.com/pmndrs/react-three-fiber), [Drei](https://github.com/pmndrs/drei), [React Postprocessing](https://github.com/pmndrs/react-postprocessing), and [Postprocessing](https://github.com/pmndrs/postprocessing).
- **Music corpus:** [OpenScore Lieder Corpus](https://github.com/OpenScore/Lieder), used to train NAGI's classical melodic prior.

See [package.json](package.json) for the full dependency list and [third-party notices](THIRD_PARTY_NOTICES.md) for attribution details.

## License and author

NAGI's original code is available under the [MIT License](LICENSE), copyright © 2026 [tadazly](https://github.com/tadazly). You are welcome to use, modify, redistribute, and build on it under those terms. Third-party components retain their own licenses and copyright notices.

[Browser experience](https://nagi.luyilabs.com/) · [Source repository](https://github.com/tadazly/nagi) · [Author Steam](https://steamcommunity.com/id/tadazly/)
