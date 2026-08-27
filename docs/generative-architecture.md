# NAGI generative audio-visual architecture

This document records the complete algorithm audit, the musical and visual
model behind the implementation, and the acceptance criteria used for the
August 2026 refactor. It is intentionally implementation-facing: every design
decision below maps to the current source tree and to an automated or live
browser check.

## System inventory

| Layer | Source | Generated state |
| --- | --- | --- |
| Seed lifecycle | `lib/nagi/generative.ts`, `app/page.tsx` | Cryptographic user seeds, deterministic successor seeds, queued manual changes |
| Weather | `lib/nagi/generative.ts` | Brightness, density, depth, flow, hue, motion, shape, space, sparkle, spread, warmth |
| Macro form | `lib/nagi/generative.ts` | Statement, development, intensification, release, return; twelve emotional identities |
| Harmony | `lib/nagi/generative.ts` | Twelve modes, tonal centres, functional progressions, chord colour, pivots, voice leading |
| Rhythm and motif | `lib/nagi/composition.ts`, `lib/nagi/classical-prior.ts` | Meter-aware Euclidean grids, corpus-informed contours and rhythms, motif evolution |
| Orchestration | `lib/nagi/performance.ts` | Five roles, seventeen instruments, formal-stage-aware hand-offs and expression |
| Synthesis and mix | `lib/nagi/audio-engine.ts` | Additive waves, filtered noise/transients, envelopes, vibrato, delay, convolution, dynamics |
| Interaction | `app/page.tsx`, `lib/nagi/audio-engine.ts` | Pointer energy, spatial movement, short quantized tonal ripples, playback and volume |
| Visual generation | `app/nagi-scene.tsx`, `lib/nagi/visual-presets.ts` | 36 emotion-specific shader templates, palettes, weather, core geometry, particles and post FX |
| Long-run audit | `scripts/soak-audit.mjs` | 24 simulated hours plus 2,048-seed distribution and determinism sweeps |

No uncontrolled `Math.random()` path remains. A displayed eight-digit seed is
the identity of a reproducible state; `crypto.getRandomValues()` is used only
to request a new identity.

## Audit findings and implemented decisions

### Random architecture

Previously, one mutable pseudo-random stream drove harmony, melody,
orchestration, performance, timbre detail, and atmosphere. A new branch in any
one subsystem therefore changed every later decision while the displayed seed
remained the same. Visual template selection also used a large floating-point
`sin()` hash, which is not a reliable cross-device identity function.

The engine now derives independent 32-bit streams for harmony, melody,
orchestration, performance, timbre detail, and atmosphere. Domain hashing uses
integer avalanche mixing; the visual template index uses the same integer
family. Adding an atmospheric draw can no longer rewrite the melody or chord
sequence. Repeated Random commands are serialized: one transition runs while
the newest request waits in a one-item queue.

### Harmony, mode and voice leading

Uniform key/mode jumps were too abrupt even when the final moods were close.
Candidate scenes are now searched across musically useful root moves and all
twelve modes, rejected below four shared scale tones, then sampled from a
scored neighbourhood. The score favours shared material, mood fit, modal
comfort, and modest tonic distance. A pivot chord is selected for maximal
common-tone continuity before the new scene begins.

Harmony is no longer selected one chord at a time. At every phrase boundary the
engine first allocates an exact-bar structural plan with establishment,
departure, development, cadence preparation and arrival roles. The plan chooses
authentic, plagal, half, deceptive or modal closure from the current formal
stage. Cadence degrees are adapted to the active mode and unstable triads are
substituted before they can occupy a structural cadence position.

The bass is planned over the same phrase rather than being forced to every chord
root. A bounded dynamic-programming pass balances pedal tones, stepwise motion,
inversions and cadence-safe root arrivals. The chosen bass pitch is then a hard
constraint for the normal voice-leading search, so the sounding voicing and the
reported inversion cannot disagree.

Chord extensions had unreachable thresholds: the scene generator capped
colour below the old seventh/ninth gates. The gates are now reachable while
keeping unstable sonorities as passing colour. The 24-hour audit targets an
82–95% triad share instead of treating either 100% triads or constant extended
harmony as desirable. Low-register spacing, sensory roughness, parallel
perfect motion, strong-beat consonance, and resolution behaviour remain scored
explicitly.

### Form, rhythm and melody

Chord spans previously could jump over an exact phrase boundary. Every span is
now clamped to the remaining bars, so scene changes and seed changes can land
on formal boundaries. Tempo moves by at most 1.4% of the current tempo per
chord (with a small lower bound), replacing an audible fixed 3.2 BPM step.
Seed transitions use fifth-order smootherstep curves and do not apply a new
harmonic scene before sufficient visual/weather blending; the preferred commit
point is a phrase boundary, with a late-transition fallback to avoid stalling.

The OpenScore Lieder prior remains a statistical influence for local contour,
rhythm, metric stability, cadence motion and bass affinity. Runtime metric
conditioning now receives the generated note's real onset and meter instead of
inferring a false beat class from its index. Corpus motif n-grams and cadence
intervals, which were previously trained but unused, now shape phrase identity
and final motion. Familiar public-domain theme DNA is selected about eighteen
percent of the time so that named quotations remain rare colour.
When selected it is rotated, re-based, and frequently inverted or retrograded;
rhythm is also rotated and scaled. Mutation remains periodic rather than
per-note, so identity survives many cycles while the music avoids literal,
repetitive quotation. Lead and counterpoint are planned as a pair in one random
domain. Counter onsets are moved before its motif cursor advances, so discarded
collisions can no longer punch holes in the heard motif; contrary and oblique
responses are preferred while both voices retain independent rhythm, register,
resolution pressure and roughness constraints. Non-chord tones may cross an
ordinary harmony change, with strong resolution pressure reserved for the true
phrase cadence.

### Orchestration and digital synthesis

A scene change could previously redraw the entire ensemble. Formal boundaries
now behave like orchestral hand-offs: one role normally changes, and at most
two change in development or intensification. Instrument continuity is part of
the sampling weight and lead/counter collision correction stays inside that
budget.

Performance is resolved per note and per concrete instrument. All seventeen
recipes declare a physical gesture family, playable legato behavior, breath or
bow capacity, natural or sustained decay, and duration-dependent vibrato onset.
Only instruments that explicitly permit portamento can glide between pitches;
struck and plucked instruments rearticulate and decay, while winds and strings
insert bounded breath or bow changes at phrase roles. Pickup, statement,
continuation, climax, cadence and echo roles shape local dynamics and
articulation without adding random timing jitter.

The oscillator model is no longer only a static harmonic array. Periodic waves
are cached by instrument morph and pitch bucket, high partials are attenuated
as they approach Nyquist, and deterministic harmonic phases prevent every
instrument from sharing the same waveform shape. Fourteen instrument recipes
now include a breath or transient component. Filtered noise supplies flute,
reed, string and choir air; short noise transients add the excitation missing
from celesta, harp, felt piano, pizzicato and marimba. These layers remain under
the same source cap and envelope safety rules as tonal sources.

Convolution reverb now uses equal-power-inspired dry/wet gains instead of two
independently linear levels. Master smoothing, rumble removal, presence control,
compression and limiting remain downstream. Live acceptance watches RMS, peak,
sample discontinuity, limiter reduction, active source count and scheduler
recovery rather than equating successful construction of an AudioContext with
audio quality.

### Interactive audio

Pointer position still affects spatial focus and spectral brightness through
smoothed parameters. Audible ripples are scheduled on the nearest subdivision
only when that grid point is within 90 ms; otherwise they play immediately.
This preserves responsiveness while allowing gestures that are already close
to the beat to feel rhythmically attached. Source count and retrigger limits
prevent dense pointer motion from overwhelming the composition.

### Shader and music visualisation

The visual generator has two timescales. Weather and template weights move on
the long seed curve; audio transport drives only subtle background pulse,
beat/bar phase, phrase light, and tension. Foreground geometry deliberately
avoids raw beat deformation so it breathes rather than flashes.

The old sparkle field put time inside `floor()`, causing entire random cells to
pop. Cells are now spatially stable and their brightness drifts continuously.
Hard high-power masks for stars, crystals, lattice and ribbons were replaced by
band-limited smooth thresholds, reducing pixel shimmer. The CPU chooses one of
three templates per emotion with an integer seed hash; shader noise is used for
texture, not identity. Renderer diagnostics now report the real audio pulse.
Rendering quality is selected from economy, balanced, quality and ultra plans.
The initial ceiling combines viewport pixel load, pointer class, logical cores
and reported device memory; the live WebGL renderer then clamps MSAA to its
actual sample limit and enables half-float post-processing only when the color
buffer extension is present. Economy devices use SMAA with a 1x DPR cap, while
faster devices progressively raise geometry detail and DPR and use 2x or 4x
MSAA. This keeps every tier antialiased instead of treating antialiasing as an
all-or-nothing performance switch. The default canvas framebuffer leaves its
redundant MSAA disabled because all scene geometry is rendered through the
composer's antialiased offscreen target.

A runtime controller uses an exponentially smoothed frame time after a warm-up
period. Four sustained seconds below roughly 45 FPS lower one tier; eighteen
sustained seconds near 60 FPS recover one tier, never above the detected
platform ceiling. Cooldowns and opposing counters prevent rapid quality
oscillation. Viewport or display changes recompute the ceiling and DPR without
discarding a performance-driven downgrade.

### Interaction and accessibility

The disappearing controls remain visually quiet, but they are no longer removed
from keyboard order or placed inside an `aria-hidden` subtree. Tabbing into the
control group reveals it through `:focus-within`. Manual randomization trusts
the engine snapshot, preventing the label from announcing a queued seed as if
it were already active.

## Acceptance contract

`npm run test:soak` must finish with every assertion true. The current audit
covers, among other checks:

- 24 hours of transport with no cumulative grid drift and at most 40 sources;
- all twelve keys, at least eight modes, all meters and all formal stages;
- phrase-boundary integrity, gradual tempo, common-tone modal transitions and
  pivot continuity, plus all five planned cadence types and exact arrivals;
- motif identity, real-onset corpus conditioning, melodic singability,
  contrary/oblique counterpoint, cadence and resolution quality, roughness and
  parallel-motion limits;
- non-root bass coverage, pedal/stepwise motion, a seven-semitone bass-leap cap,
  phrase recurrence, and unstable-triad limits;
- deterministic independent random domains and all three visual variants;
- deterministic platform quality plans, an SMAA fallback when MSAA is
  unavailable, and recovery bounded by the platform ceiling;
- 512 complete multi-seed emotional journeys with bright/high-tempo coverage;
- all seventeen instruments, idiomatic connection/decay/breath/vibrato plans,
  no more than two changed roles per formal hand-off, expression interpolation,
  and fourteen noise/transient recipes;
- stable shader cells, complete palette/template coverage, zero-gain onset and
  release scheduling, and smooth transition endpoints.

The browser gate adds real Web Audio and WebGL evidence: running context,
non-zero output, no limiter overload, no scheduler recovery, no WebGL context
loss, pulse agreement between audio and renderer, desktop/mobile screenshots,
and reachable semantic controls. It does not claim loudspeaker, headphone or
psychoacoustic listener-panel acceptance.

## Research basis

- [W3C Web Audio API](https://webaudio.github.io/web-audio-api/) — graph and
  sample-accurate AudioParam scheduling semantics.
- [Music Theory Online: parsimonious voice leading](https://mtosmt.org/issues/mto.18.24.4/mto.18.24.4.seress.html)
  — common-tone and minimal-motion continuity.
- [Audiokinetic Wwise transition properties](https://www.audiokinetic.com/en/library/edge/?id=setting_source_and_destination_properties&source=Help)
  — bar, beat, cue and fade-aware interactive transition design.
- [GPU Gems: Implementing Improved Perlin Noise](https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-26-implementing-improved-perlin-noise)
  and [GPU Gems: Improved Noise](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-5-implementing-improved-perlin-noise)
  — coherent gradients and avoiding frequencies above the sampling limit.
- [Khronos WebGL / ShaderToy presentation](https://www.khronos.org/assets/uploads/developers/library/2017-siggraph/WebGL-BOF-ShaderToy-Aug17.pdf)
  — portability limits of large floating-point sine hashes.
- [DDSP](https://research.google/pubs/ddsp-differentiable-digital-signal-processing/)
  and [MIDI-DDSP](https://research.google/pubs/midi-ddsp-hierarchical-modeling-of-music-for-detailed-control/)
  — interpretable oscillator, filter, noise and performance hierarchies.
- [Learning the Long-Term Structure of the Blues](https://research.google/pubs/learning-the-long-term-structure-of-the-blues/)
  — the gap between locally plausible notes and coherent long-range form.
- [Learning Latent Representations of Music to Generate Interactive Musical Palettes](https://research.google/pubs/learning-latent-representations-of-music-to-generate-interactive-musical-palettes/)
  — continuous, constrained interactive exploration.
- [TISMIR: perceptual timbre controls](https://transactions.ismir.net/articles/10.5334/tismir.76)
  — perceptual control dimensions beyond a single spectral-brightness value.
