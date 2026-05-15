# Animated WebP particle effects — design

**Date:** 2026-05-15
**Scope:** `HA-chores/chores/frontend`
**Related:** [`docs/sprite-pipeline.md`](../../sprite-pipeline.md) — durable reference for the sprite-animation pipeline this design establishes.

## Goal

Replace the 12 static particle PNGs (`particle_*.png`) currently rendered as the equipped-particle overlay on pet sprites with animated WebPs. Each frame's *artwork* comes from nanobanana (per-particle variety); a Pillow assembly step turns those source frames into a smooth, loop-coherent animated WebP.

## Decisions

| Question | Choice | Why |
|---|---|---|
| Animation form | Real animated image files | User wants motion baked into the asset, not CSS-driven. |
| Format | **Animated WebP** | Full alpha (GIF can't do this — visible jagged halos), ~50% smaller than APNG, ~3–5× smaller than equivalent GIF, ~95% browser support. |
| Frame source | **Hybrid: nanobanana for frame *artwork*, Pillow for *loop assembly*** | Per-frame AI generations don't loop coherently on their own — successive AI frames have unrelated layouts. We split the concern: nanobanana produces 4–6 *style-matched variant frames* per particle, then a Pillow script weaves them into a 16-frame loop using crossfades and overlaid global motion (rotation, drift, pulse) so the result both has AI-art variety *and* reads as continuous motion. |

## Architecture

The pipeline has two phases: **frame generation** (nanobanana, manual) and **loop assembly** (Pillow, scripted).

### Phase 1 — Source frame generation (nanobanana)

For each of the 12 particles, generate 4–6 distinct *style-matched* variant PNGs at 1024×1024 RGBA. The existing `particle_*.png` is reused as the **first frame source**; nanobanana generates the additional 3–5 frames using prompts that lock style/palette/composition density and only vary the specific element arrangement.

Frame source naming:

```
src/assets/pets/cosmetics/particles/
├── particle_sparkle.png          (existing — serves as frame_01)
├── particle_sparkle.webp         (animated output — to be generated)
├── ...
└── sources/                      (NEW — committed AI-generated source frames)
    ├── particle_sparkle_02.png
    ├── particle_sparkle_03.png
    ├── ...
    └── particle_rainbow_05.png
```

The existing PNG serves as `*_01` implicitly; only the *additional* sources live in `sources/`. This avoids any duplication and lets shop previews continue to show the canonical first frame.

Prompting strategy (general): "particle effect, [style descriptor matching existing PNG], variant N, transparent background, same color palette and density as reference, **different specific arrangement of elements**". Run each prompt through the nanobanana skill; the existing `transparentize.py` PostToolUse hook will strip checkerboards automatically.

Frame-count target per particle (see Loop assembly table below for rationale):

| Particle | AI frames needed | Why |
|---|---|---|
| sparkle, fire, stars, lightning, rainbow | 4–6 | Chaotic motion — variety reads as flicker |
| hearts, music, paws, bubbles | 3–4 | Pulse/cascade effects — fewer sources, more crossfade |
| snow, leaves, blossoms | 3–4 | Drift effects — motion comes from Pillow overlay, AI just varies the "particle bed" |

Total estimated AI generations: **~55–65**. Single batch, one-time cost.

### Phase 2 — Loop assembly (Pillow script)

New file: `HA-chores/chores/frontend/scripts/animate_particles.py`

- Python + Pillow, standalone script
- For each particle:
  1. Load `particle_<name>.png` (frame source 01) + all `sources/particle_<name>_NN.png` (frame sources 02..N)
  2. Downscale every source to 256×256 (render box is ≤78 px on screen — 1024 is enormous overkill, and downscaling is the single biggest size lever)
  3. Apply the per-particle **assembly recipe** (table below): cycle through source frames + optional global motion overlay (rotation, drift, scale-pulse, opacity-pulse, hue-cycle)
  4. Produce 16 output frames at 80 ms/frame = 1.28 s loop
  5. Save as `particle_<name>.webp` (animated, infinite loop, `quality=85`, `method=6`)
- Idempotent — re-run any time.

Invocation: `cd HA-chores/chores/frontend && python scripts/animate_particles.py`. Script resolves paths relative to its own location so cwd doesn't matter; this command is the canonical form.

### Assembly recipes

Each recipe combines a **frame-source mode** (how the AI frames are interleaved) with an optional **global motion overlay** (a continuous transform applied on top).

| Particle | Frame-source mode | Global motion overlay | Effect |
|---|---|---|---|
| sparkle | Sequential reveal w/ crossfade | Light rotation (±15°) | Sparkles morph + gently spin |
| stars | Crossfade | Slow rotation (90° per loop) + twinkle (opacity 0.7↔1.0) | Constellation slowly rotates and twinkles |
| hearts | Crossfade | Scale pulse 0.92↔1.10 | Hearts shimmer between arrangements while pulsing |
| bubbles | Crossfade | Vertical drift up (-6% per loop) + opacity fade-in/out | Bubbles rise and pop |
| fire | Sequential reveal (fast, no crossfade) | X-jitter ±2% | Crackling flame |
| lightning | Sequential reveal w/ flicker timing | None (flicker comes from frame sequencing: full / dim / off / full / alt) | Lightning strikes |
| snow | Crossfade | Vertical drift down (seamless wrap, +10% per loop) | Snow falls, layouts subtly shift |
| leaves | Crossfade | Vertical drift down + rotate wiggle ±8° | Leaves drift |
| blossoms | Crossfade | Vertical drift down + rotate wiggle ±5° + scale pulse | Petals tumble |
| music | Crossfade | Vertical drift up + rotate wiggle ±10° | Notes float up |
| paws | Sequential reveal | None (the cascade is the animation) | Pawprints appear one by one |
| rainbow | Sequential reveal w/ long crossfade | Hue cycle 0→360° via HSV channel shift | Rainbow shimmers and shifts color |

**Sequential reveal:** each AI source gets `frames_per_source ≈ 16 / N` consecutive output frames. Snaps from one to the next, optionally with a 1-frame crossfade for smoothing.

**Crossfade:** each AI source has a center frame; output frames are alpha-blends of the current and next source based on their relative weight. Used when smooth morphing is wanted (snow, hearts, stars).

**Global motion overlay:** the underlying transform from the original procedural design — applied on top of whichever source frame(s) are active for that output frame. Provides the continuous-motion illusion that AI-only sequences can't (snowflakes visibly fall, sparkles spin).

See [`docs/sprite-pipeline.md`](../../sprite-pipeline.md) for the recipe library and Pillow implementation primitives.

### Wiring change in `Pet.jsx`

Twelve import lines: `.png` → `.webp`. Nothing else moves. `COSMETIC_IMG` keeps the same shape; Vite ships `.webp` URLs as bundled assets; `<img src>` auto-plays the loop. Pet shop preview animates too (same import map) — accept this for now; if a static shop preview is wanted later, swap to a `still` poster variant.

### Files added / modified

- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/*.png` *(~45–55 new AI-generated frame sources)*
- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_*.webp` *(12 new — assembled outputs)*
- `HA-chores/chores/frontend/scripts/animate_particles.py` *(new — assembly script)*
- `HA-chores/chores/frontend/src/components/Pet.jsx` *(12 import lines flipped to .webp)*
- `HA-chores/chores/config.json` *(version bump)*
- `HA-chores/chores/CHANGELOG.md` *(entry)*

No backend changes. `cosmetics.id` strings, the cosmetics table, equipped-state serialization, shop pricing — none reference file paths.

## Size budget

- Existing PNGs: 12 × ~860 KB = ~10 MB committed (unchanged — kept as frame 01 sources + shop preview)
- New AI source PNGs: ~45–55 × ~600–900 KB ≈ **30–50 MB** committed in `sources/`. **Not bundled** — these are authoring inputs only; Vite ships only the `.webp` outputs.
- New animated WebPs (bundled): 12 × estimated **80–250 KB** at 256×256, 16 frames, q=85 → **~1.5–3 MB total**
- Net bundle effect: **shrinks ~70%** vs current PNG bundling (1024→256 downscale dominates)
- Net repo size: **grows ~30–50 MB** due to committed AI source frames. Acceptable given the artistic value (reproducible loop generation) and reasonable per-particle cap.

## Risks / mitigations

- **Style coherence across AI sources** — if frame 02 doesn't match the palette/density of frame 01, crossfade looks bad. Mitigation: generate sources iteratively; reject/regenerate any that drift; lock prompt style language.
- **Pillow animated WebP alpha** — handled since Pillow 9.x; verify with one particle before bulk-running.
- **Quality at small sizes for sparse particles** — `paws`, `music` have isolated sub-elements; the 256→78 downscale should be fine but worth a spot-check.
- **Browser support** — Animated WebP works in Chrome/Edge/Firefox/Safari 14+. HA frontend stack is modern enough.
- **Seamless looping for drift overlays** — `snow`/`leaves`/`blossoms` drift vertically; the script must apply the drift with wrap so frame N's bottom matches frame 0's top. Implementation note for the script.
- **Source-frame generation cost** — ~55–65 nanobanana calls is a one-time spike. Worth doing as a single batch to keep style consistent within a particle.

## Out of scope

- Downscaling/optimizing the source PNGs themselves (separate cleanup).
- Replacing PNGs with WebP for non-particle cosmetics (hats, backgrounds, nameplates).
- Build-time integration with Vite (manual script + committed outputs is simpler and matches the repo's "no build magic" style).
- Per-state particle variants (different animation when pet is happy vs idle).
