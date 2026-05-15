# Animated WebP particle effects — design

**Date:** 2026-05-15
**Scope:** `HA-chores/chores/frontend`
**Related:** [`docs/sprite-pipeline.md`](../../sprite-pipeline.md) — durable reference for the procedural-sprite-animation pipeline this design establishes.

## Goal

Replace the 12 static particle PNGs (`particle_*.png`) currently rendered as the equipped-particle overlay on pet sprites with animated images whose motion is derived **procedurally** from the existing artwork. No new asset authoring needed; the pipeline is reusable for future sprite work.

## Decisions

| Question | Choice | Why |
|---|---|---|
| Animation form | Real animated image files | User wants motion baked into the asset, not CSS-driven. |
| Format | **Animated WebP** | Full alpha (GIF can't do this — visible jagged halos), ~50% smaller than APNG, ~3–5× smaller than equivalent GIF, ~95% browser support. |
| Frame source | **Procedural from existing PNGs** | Authoring 12 × N frames by hand or via AI is high effort with low frame-coherence. The existing PNGs already contain dense element coverage (snowflakes scattered, hearts placed) so applying per-effect transforms (rotate, drift, scale, hue cycle) produces convincing animation cheaply. |

## Architecture

### Build script

New file: `HA-chores/chores/frontend/scripts/animate_particles.py`

- Python + Pillow, standalone script
- Reads each `particle_*.png` from `src/assets/pets/cosmetics/particles/`
- Applies a per-effect motion recipe to generate **16 frames**
- Downscales each frame from 1024×1024 → **256×256** (render box is ≤78px on screen — 1024 is enormous overkill and the single biggest size lever)
- Writes `particle_*.webp` (animated, **80 ms/frame** = 1.28 s loop, infinite, `quality=85`, `method=6`) alongside the PNG
- Idempotent — re-run any time. PNG sources stay in the repo as canonical art.

Invocation: `cd HA-chores/chores/frontend && python scripts/animate_particles.py`. Script resolves its input/output paths relative to its own location so it works from any cwd, but the command above is the canonical form. No npm/Vite integration; outputs are committed.

### Motion recipes

| Particle | Motion |
|---|---|
| sparkle | Rotate 0→360° + scale pulse 0.92↔1.08 |
| stars | Rotate 0→360° + opacity twinkle 0.7↔1.0 |
| hearts | Scale pulse 0.92↔1.10 |
| bubbles | Vertical drift up (-6%) + opacity fade-loop |
| fire | X-jitter ±2% + Y-jitter ±1% + scale 0.95↔1.05 |
| lightning | 4-step flicker (full / dim / off / full), repeated through the 16-frame loop |
| snow | Vertical drift down 0→10% (seamless wrap) |
| leaves | Vertical drift down + rotate wiggle ±8° |
| blossoms | Vertical drift down + rotate wiggle ±5° + scale pulse |
| music | Rotate wiggle ±10° + vertical drift up |
| paws | Step-cascade opacity (mask thirds of the frame) — gives a "trail" |
| rainbow | Hue-rotate cycle 0→360° via HSV channel shift |

All transforms implemented with Pillow primitives. See [`docs/sprite-pipeline.md`](../../sprite-pipeline.md) for the recipe library.

### Wiring change in `Pet.jsx`

Twelve import lines: `.png` → `.webp`. Nothing else moves. `COSMETIC_IMG` keeps the same shape; Vite ships `.webp` URLs as bundled assets; `<img src>` auto-plays the loop. Pet shop preview animates too (same import map) — accept this for now; if a static shop preview is wanted later, swap to a `still` poster variant.

### Files added / modified

- `HA-chores/chores/frontend/scripts/animate_particles.py` *(new)*
- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_*.webp` *(12 new)*
- `HA-chores/chores/frontend/src/components/Pet.jsx` *(12 import lines flipped)*
- `HA-chores/chores/config.json` *(version bump)*
- `HA-chores/chores/CHANGELOG.md` *(entry)*

No backend changes. `cosmetics.id` strings, the cosmetics table, equipped-state serialization, shop pricing — none reference file paths.

## Size budget

- Source PNGs: 12 × ~860 KB = ~10 MB committed (unchanged — PNGs stay)
- New animated WebPs: estimated **80–250 KB each** at 256×256, 16 frames, q=85
- Total addition: **~1.5–3 MB**
- Net effect on bundle: **shrinks ~70%** vs current PNG bundling, because we're downscaling 1024→256 along the way

## Risks / mitigations

- **Pillow WebP alpha encoding** — Pillow handles alpha for animated WebP since Pillow 9.x. Will verify with one particle before generating all 12.
- **Quality at small sizes for sparse particles** — `paws` and `music` have isolated sub-elements; the 256→78 downscale should be fine but worth a spot-check.
- **Browser support** — Animated WebP works in Chrome/Edge/Firefox/Safari 14+. The HA frontend stack is modern enough.
- **Seamless looping for drift effects** — `snow`/`leaves`/`blossoms` drift vertically; need wrap-around (frame N's bottom matches frame 0's top) for a clean loop. Implementation note for the script.

## Out of scope

- Downscaling/optimizing the source PNGs themselves (separate cleanup).
- Replacing PNGs with WebP for non-particle cosmetics (hats, backgrounds, nameplates).
- Per-particle authored frame sequences (we picked procedural; revisit only if procedural results look weak).
- Build-time integration with Vite (manual script + committed outputs is simpler and matches the repo's "no build magic" style).
