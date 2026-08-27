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
| Macro form | `lib/nagi/generative.ts` | Statement, development, intensification, release, true opening recall; twelve emotional identities |
| Harmony | `lib/nagi/generative.ts` | Twelve mode-specific grammars, tonal centres, A/A′/B/A″ phrase memory, pivots, voice leading |
| Rhythm and motif | `lib/nagi/composition.ts`, `lib/nagi/phrase-melody.ts`, `lib/nagi/classical-prior.ts` | Whole-phrase melodic skeletons, climax/cadence plans, corpus-informed motifs, realized counterpoint |
| Orchestration | `lib/nagi/performance.ts`, `lib/nagi/texture-planning.ts` | Five phrase roles plus structural brass/percussion, twenty instruments, sparse-to-tutti texture plans and hand-offs |
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

Every mode now owns a separate harmonic grammar: functional-degree labels,
root preferences, identity-bearing characteristic tones, and a dedicated modal
cadence. Coverage of twelve scales therefore produces twelve harmonic dialects
rather than one major/minor grammar transposed onto different pitch sets.

Phrases participate in an explicit A, A′, B, A″ memory cycle. A′ preserves the
recognisable harmonic skeleton with limited functional substitutions, B creates
contrast, and A″ recalls the opening while recomposing its middle and cadence.
The return stage also draws the scene itself back toward the opening tonic,
mode, meter and emotional state. Automatic seed changes wait until one complete
formal cycle has finished, and scene duration is measured in bars rather than
chord-event count.

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

Tension is no longer read from one Ionian-shaped seven-degree table for every
mode. Each chord now combines its mode-specific harmonic function with triad
stability and characteristic-colour weight. Mixolydian minor-v, Lydian II and
Phrygian flat-II therefore do not inherit an unrelated major-key tension value.

### Form, rhythm and melody

Chord spans previously could jump over an exact phrase boundary. Every span is
now clamped to the remaining bars, so scene changes and seed changes can land
on formal boundaries. Tempo moves by at most 1.4% of the current tempo per
chord (with a small lower bound), replacing an audible fixed 3.2 BPM step.
Seed transitions use fifth-order smootherstep curves and do not apply a new
harmonic scene before sufficient visual/weather blending; the preferred commit
point is a phrase boundary, with a late-transition fallback to avoid stalling.

The OpenScore Lieder prior remains a statistical influence for local contour,
rhythm, metric stability, cadence motion and bass affinity. Its conditioned
second-order interval counts are also exposed as smoothed information cost, so
complete candidate paths can be compared instead of merely sampling the next
note. Runtime metric
conditioning now receives the generated note's real onset and meter instead of
inferring a false beat class from its index. Corpus motif n-grams and cadence
intervals, which were previously trained but unused, now shape phrase identity
and final motion. Familiar public-domain theme DNA is selected about eight
percent of the time so that named quotations remain a true easter egg.
When selected it is rotated, re-based, and frequently inverted or retrograded;
rhythm is also rotated and scaled. Mutation remains periodic rather than
per-note, so identity survives many cycles while the music avoids literal,
repetitive quotation. Lead and counterpoint are planned as a pair in one random
domain. Counter onsets are moved before its motif cursor advances, so discarded
collisions can no longer punch holes in the heard motif; contrary and oblique
responses are preferred while both voices retain independent rhythm, register,
resolution pressure and roughness constraints. A counterpoint window is now
planned only for the interval in which it can sound; silent pre-entry events no
longer consume motif phase or random draws. Corpus IOIs are stored in quarter-
note units and converted to dotted-quarter transport beats in 6/8 before metric
conditioning. Non-chord tones may cross an
ordinary harmony change, with strong resolution pressure reserved for the true
phrase cadence.

Melody is now planned once for the complete phrase and sliced into each harmony
window only at scheduling time. The plan fixes a register arc, one explicit
climax, cadence approach and arrival, phrase-rhetorical roles, and a sustained
counterpoint entry/exit window. Appoggiaturas and suspensions are deliberate
accented dissonances with a required following resolution. After concrete MIDI
pitches are chosen, counterpoint is reconciled against actual overlapping note
durations to correct voice crossing, accented vertical dissonance and parallel
perfect motion.

Concrete MIDI realization is no longer greedy at each harmony window. A
deterministic sixteen-path beam decoder sees the entire phrase and scores corpus
surprisal, motif pitch-class identity, harmony and metric role, register arc,
an anticipated unique climax, cadence arrival, repeated notes, leap recovery,
the harmony/melody surprise budget, bass spacing and concrete counterpoint.
Climax and cadence are future positional constraints, not wishes that a local
sampler may later miss. The selected pitches are stored in the phrase plan and
the real-time scheduler only renders them; `pickMelodyMidi` remains a fallback
for legacy or interaction-only events.

The rhythm layer now emits near-connected notated gates and leaves the final
articulation to the instrument-performance layer. This removes the former
double shortening that turned a nominally lyrical line into detached single
notes. Motif breaths use a small metric vocabulary instead of an arbitrary
continuous range. Phrase openings are bounded, ordinary motion has a seven-
semitone ceiling, and a leap of a fourth or larger creates strong contrary
stepwise recovery pressure on the following note. Randomness therefore chooses
motif and phrase identity; it no longer gets equal authority over every local
melodic connection.

### Orchestration and digital synthesis

A scene change could previously redraw the entire ensemble. Formal boundaries
now behave like orchestral hand-offs: one role normally changes, and at most
two change in development or intensification. Instrument continuity is part of
the sampling weight and lead/counter collision correction stays inside that
budget.

The orchestral target is informed by the long-form language represented in
Apple Music's “澎湃管弦” collection: recognisable thematic material, sectional
handoffs, sustained development, a structurally earned tutti and release. The
implementation borrows that large-scale grammar, never any protected melody.
Woodwind/solo lines, strings/choir beds, low strings and bassoon, and
keyboard/plucked motion remain the phrase-bearing families. A separate horn,
trumpet or trombone desk and timpani now enter only during intensification,
high-tension development or cadential arrival, allowing the same seed to grow
from chamber transparency into a complete orchestral peak.

Instrument identity and instrument presence are separate decisions. Each
phrase receives a texture plan spanning sparse, duo, chamber, full and release
states. It controls active roles, spotlight, sustained chord-voice count, and
minimum-duration entrances and exits. Counterpoint and accompaniment are
phrase-level roles instead of per-chord coin flips. Harmony may genuinely drop
to zero for an exposed solo, while intensification can reach a bounded five-
voice chord without making that density the default. Adjacent phrase plans must
share at least one sounding role, so a new density arc enters by hand-off rather
than replacing the whole ensemble at the bar line.

Accompaniment uses retained or deliberately varied meter-specific sustain,
pulse, arpeggio, syncopated and sparse patterns. Every onset remains quantized
to the shared transport subdivision; rhythmic variety does not reintroduce an
independent clock. Pattern `voicingOffset` is now the sole arpeggio voice path;
changing chord degree no longer rotates that path a second time. Delay taps are
one-half and one-and-a-half transport beats and follow gradual tempo movement,
rather than remaining at unrelated fixed millisecond values.

Performance is resolved per note and per concrete instrument. All twenty
recipes declare a physical gesture family, playable legato behavior, breath or
bow capacity, natural or sustained decay, and duration-dependent vibrato onset.
Only instruments that explicitly permit portamento can glide between pitches;
struck and plucked instruments rearticulate and decay, while winds and strings
insert bounded breath or bow changes at phrase roles. Pickup, statement,
continuation, climax, cadence and echo roles shape local dynamics and
articulation without adding random timing jitter.

Gain staging follows orchestral function rather than applying one generic
spotlight multiplier. The lead remains the reference plane; counterpoint and
rhythmic accompaniment yield while it is present, bass retains a stable
foundation, and upper harmony is equal-power normalized against its sounding
voice count. Per-instrument perceptual trims compensate for the extra projection
of bright transient sources such as celesta, violin, oboe, harp, pizzicato and
marimba after waveform normalization. Dense harmony uses one shared bow/breath
noise layer instead of one noise source per chord pitch, preventing source-
budget pressure from deleting arbitrary chord members.

The source allocator reserves six slots while upper harmony is scheduled, then
allows structural bass, cadential brass and percussion to use the full cap.
The integrated audit now constrains drop rates for every role instead of proving
only that lead and counterpoint survived.

The oscillator model is no longer only a static harmonic array. Periodic waves
are cached by instrument morph and pitch bucket, high partials are attenuated
as they approach Nyquist, and deterministic harmonic phases prevent every
instrument from sharing the same waveform shape. Fourteen instrument recipes
now include a breath or transient component. Filtered noise supplies flute,
reed, string and choir air; short noise transients add the excitation missing
from celesta, harp, felt piano, pizzicato and marimba. These layers remain under
the same source cap and envelope safety rules as tonal sources.

Instrument hand-offs no longer interpolate two harmonic tables into an
unidentifiable middle instrument. During a bounded transition, the outgoing and
incoming instruments sound as separate equal-power layers. The scheduler falls
back to the dominant layer near the source cap. Note filters now move through
the gesture envelope so timbre evolves within a note instead of remaining a
static periodic wave behind a gain envelope.

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
- phrase-boundary integrity, gradual tempo, common-tone modal transitions,
  twelve mode grammars, all five cadence types, exact arrivals, and bounded
  A/A′/B/A″ similarity bands;
- motif identity, real-onset corpus conditioning, melodic singability,
  contrary/oblique counterpoint, cadence and resolution quality, roughness and
  parallel-motion limits;
- 2,048 independently scored A/A′/B/A″ phrase realizations, each using whole-
  phrase beam search, with corpus surprisal, motif retention, strong-beat
  harmony, leap recovery, unique climax, complete planned MIDI, deterministic
  replay and cross-seed trace-collision gates;
- non-root bass coverage, pedal/stepwise motion, a seven-semitone bass-leap cap,
  phrase recurrence, and unstable-triad limits;
- deterministic independent random domains and all three visual variants;
- deterministic platform quality plans, an SMAA fallback when MSAA is
  unavailable, and recovery bounded by the platform ceiling;
- 512 complete multi-seed emotional journeys with bright/high-tempo coverage;
- all twenty instruments, idiomatic connection/decay/breath/vibrato plans,
  sparse/duo/chamber/full/release coverage, phrase-persistent entrances, five
  accompaniment families, equal-power hand-offs, and fourteen noise/transient
  recipes;
- stable shader cells, complete palette/template coverage, zero-gain onset and
  release scheduling, and smooth transition endpoints.

The browser gate adds real Web Audio and WebGL evidence: running context,
non-zero output, no limiter overload, no scheduler recovery, no WebGL context
loss, pulse agreement between audio and renderer, desktop/mobile screenshots,
and reachable semantic controls. It does not claim loudspeaker, headphone or
psychoacoustic listener-panel acceptance.

These metrics are regression guardrails, not a claim that a scalar score proves
beauty. Release-quality comparison still requires loudness-matched, same-seed
blind A/B listening on melody memorability, harmonic naturalness, rhythmic
life, form, tension/release, timbre comfort and willingness to keep listening.

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
- [Music Transformer](https://research.google/pubs/music-transformer-generating-music-with-long-term-structure/)
  and [MusicVAE](https://proceedings.mlr.press/v80/roberts18a.html) — repetition,
  relative musical position and hierarchical decoding for long-range identity.
- [DeepBach](https://proceedings.mlr.press/v70/hadjeres17a.html),
  [COCONET](https://research.google/pubs/counterpoint-by-convolution/) and
  [Anticipation-RNN](https://arxiv.org/abs/1709.06404) — positional constraints,
  non-greedy rewriting and conditioning on future musical anchors.
- [MeloForm](https://archives.ismir.net/ismir2022/paper/000068.pdf) and
  [Theme Transformer](https://arxiv.org/abs/2111.04093) — expert form first,
  learned/local refinement second, with recognisable thematic transformation.
- [REMI / Pop Music Transformer](https://arxiv.org/abs/2002.00212) — explicit
  bar, position, tempo and harmony in the event representation.
- [GrooVAE](https://proceedings.mlr.press/v97/gillick19a.html) — separate
  quantized composition from correlated performance timing and dynamics.
- [What is missing in deep music generation?](https://archives.ismir.net/ismir2022/paper/000079.pdf)
  — multilevel repetition and structure cannot be replaced by collection-level
  pitch and rhythm statistics.
- [Measure by Measure](https://transactions.ismir.net/articles/10.5334/tismir.163)
  — hierarchical symbolic generation and the limits of objective musicality
  metrics.
- [Learning Latent Representations of Music to Generate Interactive Musical Palettes](https://research.google/pubs/learning-latent-representations-of-music-to-generate-interactive-musical-palettes/)
  — continuous, constrained interactive exploration.
- [TISMIR: perceptual timbre controls](https://transactions.ismir.net/articles/10.5334/tismir.76)
  — perceptual control dimensions beyond a single spectral-brightness value.
