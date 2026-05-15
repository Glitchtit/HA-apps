# Animated idle pet sprites — design

**Date:** 2026-05-15
**Scope:** `HA-chores/chores/frontend`
**Related:**
- [`docs/sprite-pipeline.md`](../../sprite-pipeline.md) — durable reference for sprite animation pipelines; this design adds an "edit-based" pattern alongside the existing "hybrid generate+assembly" pattern
- [`docs/superpowers/specs/2026-05-15-animated-webp-particles-design.md`](2026-05-15-animated-webp-particles-design.md) — sibling spec for animated particles

## Goal

Replace the 4 static `idle.png` sprites for the adult and mythic stages of both pet designs (`orange_black`, `blue_black`) with animated WebPs that play a looping blink + subtle body sway during the pet's idle state.

## Decisions

| Question | Choice | Why |
|---|---|---|
| Animation form | Real animated image files (animated WebP) | Same as particles — autoplays in `<img>`, full alpha, native Vite import. |
| Frame source | **`nanobanana:edit_image`** (not generate) | Frame coherence is critical for pets — the same character must just close its eyes, not become a different axolotl. Edit preserves everything outside the modified area. |
| Animation scope | **Blink + subtle full-body sway** | Per user's preference. The blink is the "active" beat; the body sway adds liveliness without needing additional AI edits. |
| Sprite scope | **4 sprites only**: `orange_black/{adult,mythic}/idle` + `blue_black/{adult,mythic}/idle` | Minimum-viable scope per user's choice. Earlier stages (egg/baby/teen) stay static. |
| Loop length | **24 frames at 100 ms** = 2.4 s loop | ~1 blink every 2.4 s reads as natural; faster cadence (16f × 100 ms = 1.6 s) felt overly busy. |

## Architecture

The pipeline has two phases: **single-frame edit** (nanobanana, manual per sprite) and **loop assembly** (Pillow, scripted).

### Phase 1 — Eyes-closed frame via nanobanana edit

For each of the 4 sprites:

1. Read existing `idle.png` (frame_01).
2. Invoke `mcp__plugin_nanobanana_nanobanana__edit_image` with the file path and a prompt like:
   > "Edit this pixel-art pet sprite so its eyes are fully closed (sleeping/blinking expression). Keep everything else identical: same body, same pose, same colors, same outline, same transparent background. Only the eyes change."
3. Output lands at `/home/glitch/GIT/HA-apps/nanobanana-output/<derived>.png` (JPEG-with-`.png`-extension).
4. Run `transparentize.py --force` manually on the output (the PostToolUse hook may not fire — same caveat as the particle work).
5. Move to `src/assets/pets/{design}/stages/{stage}/sources/idle_02.png`.

**No half-closed frame needs to be generated.** Pillow blends frame_01 (open) and idle_02 (closed) at runtime to produce the mid-blink frames.

### Phase 2 — Loop assembly (Pillow script)

New file: `HA-chores/chores/frontend/scripts/animate_pets.py`

Recipe is the same shape as `animate_particles.py`:

```python
RECIPES = {
    "orange_black/adult":   {"sources": 2, "mode": "blink"},
    "orange_black/mythic":  {"sources": 2, "mode": "blink"},
    "blue_black/adult":     {"sources": 2, "mode": "blink"},
    "blue_black/mythic":    {"sources": 2, "mode": "blink"},
}
```

- 24 frames, 100 ms/frame
- 256×256 downscale (source is typically 1024×1024 or smaller)
- WebP q=85, method=6

**Frame composition per output frame `n` (0..23):**

| Frame range | Source frame | Notes |
|---|---|---|
| 0–18 | frame_01 (open) | 19 frames of open-eye |
| 19 | `Image.blend(open, closed, 0.5)` | half-closed (going down) |
| 20 | idle_02 (closed) | fully closed |
| 21 | idle_02 (closed) | fully closed (held) |
| 22 | `Image.blend(open, closed, 0.5)` | half-closed (coming back up) |
| 23 | frame_01 (open) | open again |

**Body sway overlay (applied to every frame):**
- `wiggle` rotation ±1° (`sin(2π t)`)
- Vertical translate ±1 px (`sin(2π t)`)

Both are very subtle — the pet seems alive, not visibly bobbing on top of the existing CSS animation.

### Phase 3 — Pet.jsx wiring

Four import lines change `.png` → `.webp`:

```js
import stageOrangeAdultIdle  from '../assets/pets/orange_black/stages/adult/idle.webp';
import stageOrangeMythicIdle from '../assets/pets/orange_black/stages/mythic/idle.webp';
import stageBlueAdultIdle    from '../assets/pets/blue_black/stages/adult/idle.webp';
import stageBlueMythicIdle   from '../assets/pets/blue_black/stages/mythic/idle.webp';
```

The existing CSS `pet-breathe` animation on the idle state stays on the wrapper. It composes additively with the WebP's baked motion. If the combined effect is too busy in dev-server testing, the body-sway overlay amplitude can be dialed to 0 in `animate_pets.py` (or the CSS animation skipped for stages with `.webp` sources — both are easy follow-ups).

### File layout

```
src/assets/pets/{design}/stages/{stage}/
├── idle.png                  (existing canonical art — frame_01)
├── idle.webp                 (NEW animated output)
└── sources/
    └── idle_02.png           (NEW eyes-closed variant via nanobanana edit)
```

`sources/` lives inside each stage folder, matching the existing nesting (vs the particles' flat `sources/`).

## Files added / modified

- `HA-chores/chores/frontend/scripts/animate_pets.py` *(new)*
- `HA-chores/chores/frontend/src/assets/pets/{orange_black,blue_black}/stages/{adult,mythic}/sources/idle_02.png` *(4 new — AI eyes-closed)*
- `HA-chores/chores/frontend/src/assets/pets/{orange_black,blue_black}/stages/{adult,mythic}/idle.webp` *(4 new — assembled outputs)*
- `HA-chores/chores/frontend/src/components/Pet.jsx` *(4 import lines flipped)*
- `HA-chores/chores/config.json` *(version bump — 0.7.3 → 0.7.4)*
- `HA-chores/chores/CHANGELOG.md` *(0.7.4 entry)*
- `HA-apps/docs/sprite-pipeline.md` *(add "Edit-based sprite animation" subsection)*

No backend changes. No CSS changes. The animated stages don't affect any sensor/integration code paths.

## Size budget

- Source `idle.png` files: ~80–200 KB each (smaller than the 1024×1024 particle PNGs)
- New AI source PNGs: 4 × ~80–200 KB = ~320–800 KB (committed under `sources/`, not bundled)
- New animated WebPs: 4 × estimated **40–150 KB** at 256×256, 24 frames, q=85
- Total bundle addition: **~200–600 KB**
- Net bundle effect: roughly neutral or slightly smaller (the static idle.pngs at 1024×1024 were sometimes bigger than 24 frames at 256×256 will be)

## Risks / mitigations

- **`edit_image` may redraw the body, not just the eyes.** Mitigation: explicit prompt language ("keep everything else identical pixel-for-pixel"); pilot on one sprite (recommend `orange_black/adult`) before bulk; visually compare the edit against frame_01 to confirm.
- **PostToolUse `transparentize.py` hook may not fire** (carryover risk from the particle work). Mitigation: run `transparentize.py --force` manually on each edit output.
- **CSS `pet-breathe` + WebP body sway may double up.** Mitigation: keep WebP body sway amplitude very small (±1°/±1 px); if still too busy, dial to 0 in a follow-up.
- **Mythic-stage edits may struggle with elaborate sprite details.** Mitigation: review edit results before assembly; if the model can't preserve mythic detail, fall back to skipping the body sway and using a tighter blink (3 frames closed, no half-blend) so the static portion is unmodified.

## Out of scope

- Animated `happy` / `sad` / `petted` states. They stay as static PNGs with the existing CSS keyframe animations.
- Egg, baby, teen stages. They stay static.
- Per-pet timing variation (different blink rate per pet). All 4 use the same 2.4 s loop.
- Replacing the CSS `pet-breathe` with the WebP's baked motion (could be a follow-up if compositing is too busy).
- Build-time integration of the Pillow script with Vite. Manual run + committed outputs, same pattern as particles.
