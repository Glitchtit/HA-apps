# Sprite & particle animation pipeline

Reference for producing animated sprites for HA-apps frontends (HA-chores, HA-stock, HA-recipes, HA-storage). Captures the **hybrid AI-frames + procedural-assembly** recipe established in [`docs/superpowers/specs/2026-05-15-animated-webp-particles-design.md`](superpowers/specs/2026-05-15-animated-webp-particles-design.md). Read this first when asked to animate a sprite, build a sprite sheet, or convert an existing static asset to a moving one.

## Three approaches, pick by content type

| Approach | What it is | Best for |
|---|---|---|
| **Hybrid AI + Pillow** (default) | nanobanana generates 3–6 style-matched *variant frames* per sprite; Pillow assembles them into a coherent loop with crossfades + global motion overlay. | Sprites where per-frame *artistic variety* matters (sparkles look different each frame) AND you need *coherent looping motion*. This is the right default for particle effects. |
| **Pure procedural** | One source PNG, motion entirely from Pillow transforms (rotate/drift/scale/hue). | Sprites with dense element coverage where the motion *is* the variety (rainbow color cycle, hue-shifting palette swaps, simple drift). Cheapest path. |
| **Sprite sheet + CSS** | Frames concatenated into one PNG, played back via `background-position` + `@keyframes steps()`. | UI that needs **state-driven** playback — play on hover, pause on idle, sync with a React state value. Animated WebP can't be paused. |

**Don't use any of these when:**

- The animation needs **frame-by-frame character variation that loops perfectly** (a paw walking cycle with distinct foot placements). Author the frames in an animation tool; AI gen won't produce frame-coherent walk cycles.
- You need **physics-driven** motion (cloth, soft-body deformation). Use a physics solver.
- The asset is already small (<256 px) — procedural transforms compound aliasing.

## Format choice: always animated WebP

For sprites rendered as `<img>` in the HA frontends:

| Format | Alpha | Size vs PNG static | Notes |
|---|---|---|---|
| **Animated WebP** | Full | smaller (downscaling wins) | **Default choice.** Native Vite import, autoplays in `<img>`. |
| APNG | Full | larger than WebP | Use only if a target environment refuses WebP. |
| GIF | 1-bit | 3–5× larger | Avoid — visible jagged halos around any sub-pixel-alpha edge. |
| Sprite sheet + CSS | N/A | depends | Use when you need per-frame CSS control (pause, sync with state) — see *Sprite-sheet pattern* below. |

## Hybrid pattern: nanobanana frames + Pillow assembly

This is the default for new sprite-animation work. nanobanana provides per-frame artistic variety; the Pillow script provides the coherent loop.

### Folder layout

```
<assets-dir>/
├── <sprite>.png            (existing canonical art — also serves as frame_01)
├── <sprite>.webp           (assembled animated output)
└── sources/
    ├── <sprite>_02.png     (additional AI-generated variant frames)
    ├── <sprite>_03.png
    └── ...
```

The existing PNG is `*_01` implicitly. Only the *additional* sources go in `sources/`. This avoids duplication and lets static contexts (shop previews, etc.) keep using the canonical first frame.

### Phase 1 — generating frame sources via nanobanana

For each sprite, generate 3–6 *style-matched variant* frames. Goal: same palette, density, and composition style as frame 01, with **different specific arrangement of elements**.

**Prompt template:**

> "[sprite description matching frame 01's style], variant N, transparent background, same color palette and density as reference, different specific arrangement of elements, 1024x1024"

Run each via the `nanobanana:generate` skill. The repo's `transparentize.py` PostToolUse hook strips checkerboard backgrounds automatically.

**Tips:**

- Generate one variant first and eyeball it against frame 01 before producing the rest. Style drift compounds — catch it early.
- Lock the prompt prefix exactly across all variants of a single sprite. Only the variation-language differs ("scattered higher up", "denser to the left", "fewer but larger elements").
- 3–4 sources is enough for crossfade-mode sprites; 5–6 for sequential-reveal sprites where each frame is visibly distinct.

### Phase 2a — assembly concepts

Each output frame is built from **(A) a frame-source selection** plus **(B) an optional global motion overlay**.

**Frame-source modes:**

- **`crossfade`** — output frame is an alpha-blend of the current and next source frame. Each source has a center frame; output frames between centers interpolate. Smooth morphing, best when sources are visually similar.
- **`reveal`** — each source gets `output_frames // N` consecutive frames. Snap from one to the next, optionally with a single crossfade transition frame. Used when sources are visually distinct (paws, lightning, sparkle bursts).
- **`flicker`** — like `reveal` but with explicit per-frame opacity multipliers. Used for lightning (full / dim / off / full).

**Global motion overlays** (applied on top of whichever source is active):

- `rotate(deg, t)` — continuous spin
- `wiggle(deg, t)` — back-and-forth (`sin`-driven)
- `drift_wrap(amount, t)` — vertical drift with seamless wrap
- `pulse(amp, t)` — scale pulse around center
- `twinkle(low, t)` — opacity oscillation
- `jitter(x_amp, y_amp, t)` — random per-frame offset within bounds
- `hue_cycle(deg, t)` — HSV hue shift (color-only; no compositional change)

See the *Recipe library* below for implementations.

### Phase 2b — sketch of the assembly script

```python
# Per-sprite assembly recipe
RECIPES = {
    "particle_sparkle": {
        "sources": 6,                          # uses frame_01 + sources/*_02..*_06
        "mode": "reveal",
        "overlay": ("rotate", 15),             # ±15° gentle spin
    },
    "particle_snow": {
        "sources": 4,
        "mode": "crossfade",
        "overlay": ("drift_wrap", 0.10),       # 10% downward per loop
    },
    # ... etc
}

def assemble(name, recipe):
    sources = load_sources(name, recipe["sources"])   # → list of N images at TARGET_SIZE
    out_frames = []
    for n in range(FRAMES):
        t = n / FRAMES
        base = pick_source(sources, t, recipe["mode"])
        frame = apply_overlay(base, t, recipe.get("overlay"))
        out_frames.append(frame)
    save_webp(out_frames, name)
```

### Choosing mode + overlay per sprite

Use this decision table:

| Sprite character | Mode | Overlay | Example |
|---|---|---|---|
| Chaotic flicker (sparkle, fire, lightning) | `reveal` | Light wiggle or jitter | Sparkle: `reveal` + `wiggle(15)` |
| Smooth morph (snow, hearts, stars) | `crossfade` | Drift or pulse | Snow: `crossfade` + `drift_wrap(0.10)` |
| Distinct cascade (paws) | `reveal` | None | Paws: `reveal` only |
| Pure color motion (rainbow) | `crossfade` long | `hue_cycle` | Rainbow: `crossfade` + `hue_cycle(360)` |
| Float upward (bubbles, music) | `crossfade` | `drift_wrap` (negative) + opacity | Bubbles: `crossfade` + `drift_wrap(-0.06)` + fade |

## Edit-based pattern: nanobanana `edit_image` for frame-coherent sprites

Use when the animation needs **frame coherence** — same character/object, just one feature changes. The classic case is a character blink: same pet, same pose, same colors, eyes closed. `generate_image` can't promise that across calls; `edit_image` can.

### When to use this vs generate-based

| Need | Use |
|---|---|
| Many small details vary per frame (sparkles, fire) | `generate_image` (the original hybrid pattern above) |
| Same character does ONE thing differently (blink, head turn, single limb move) | `edit_image` (this pattern) |
| Same character moves through a multi-step pose change | Multiple `edit_image` calls, each editing from frame_01 with a different prompt |

### Prompt style for `edit_image`

Lock everything you want preserved, name only what should change:

> "Edit this pixel-art [subject] so [specific change]. Keep everything else identical: same body, same pose, same colors, same outline, same transparent background. Only [the edited area] changes."

The "keep everything identical" language matters — without it, the model often interprets the edit as a license to redraw nearby pixels too.

### Assembly with `Image.blend` for in-between frames

When you have just two source frames (e.g. eyes open + eyes closed), you don't need to AI-generate the mid-blink frames. `PIL.Image.blend(open, closed, alpha)` produces a clean linear blend that reads as half-closed:

```python
half_blink = Image.blend(frame_01_open, idle_02_closed, 0.5)
```

This is essentially a manual single-step `crossfade` mode. Use it sparingly — only when the in-between literally is a half-state (blink, fade). For animations where the in-between needs distinct geometry (e.g. a tail mid-flick), generate that as its own frame.

### Recipe for a blink loop

24 frames at 100 ms, 1 blink per cycle, mostly open:

| Frames | Source | Notes |
|---|---|---|
| 0–18 | open | optional subtle body sway overlay (`wiggle` ±1°, `drift_wrap` ±0.005) |
| 19 | blend(open, closed, 0.5) | half-closed going down |
| 20 | closed | fully closed |
| 21 | closed | held closed (1 extra frame reads as a real blink, not a glitch) |
| 22 | blend(open, closed, 0.5) | half-closed coming up |
| 23 | open | back to open |

## Script template

Place at `<submodule>/<frontend>/scripts/animate_<thing>.py`. The script should be standalone — runs with system Python + Pillow (+ numpy for hue-cycle).

```python
"""Hybrid sprite animator: AI-generated frame sources + Pillow loop assembly.

For each sprite:
  - Loads <sprite>.png as frame_01 and sources/<sprite>_NN.png as frame_02..N
  - Applies the per-sprite recipe (frame-source mode + optional overlay)
  - Writes <sprite>.webp (animated, looped) alongside the source PNG

Idempotent — safe to re-run.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageChops
import math

ROOT = Path(__file__).parent.parent / "src" / "assets" / "<path-to-sprites>"
SOURCES_DIR = ROOT / "sources"
FRAMES = 16
DURATION_MS = 80              # 16 × 80 ms = 1.28 s loop
TARGET_SIZE = 256             # Source is 1024; downscale aggressively
QUALITY = 85
WEBP_METHOD = 6               # 0=fast, 6=slow/best

# ── Per-sprite recipes: source count + assembly mode + optional overlay ────
# overlay tuple: (name, *params) — see overlay() below
RECIPES = {
    "particle_sparkle":  {"sources": 6, "mode": "reveal",    "overlay": ("wiggle",     15)},      # ±15° back-and-forth
    "particle_stars":    {"sources": 4, "mode": "crossfade", "overlay": ("rotate",     90)},      # 90° spin per loop
    "particle_hearts":   {"sources": 3, "mode": "crossfade", "overlay": ("pulse",      0.10)},
    "particle_bubbles":  {"sources": 4, "mode": "crossfade", "overlay": ("drift_fade", -0.06, 0.5)},
    "particle_fire":     {"sources": 6, "mode": "reveal",    "overlay": ("jitter",     0.02, 0.01)},
    "particle_lightning":{"sources": 4, "mode": "flicker",   "overlay": None},                    # flicker mode supplies opacity
    "particle_snow":     {"sources": 4, "mode": "crossfade", "overlay": ("drift_wrap", 0.10)},
    "particle_leaves":   {"sources": 4, "mode": "crossfade", "overlay": ("drift_wiggle", 0.10, 8)},
    "particle_blossoms": {"sources": 4, "mode": "crossfade", "overlay": ("drift_wiggle_pulse", 0.08, 5, 0.05)},
    "particle_music":    {"sources": 4, "mode": "crossfade", "overlay": ("wiggle_rise", 10, -0.05)},
    "particle_paws":     {"sources": 4, "mode": "reveal",    "overlay": None},
    "particle_rainbow":  {"sources": 4, "mode": "crossfade", "overlay": ("hue_cycle",  360)},
}

# ── Source loading ──────────────────────────────────────────────────────────
def load_sources(name: str, n: int) -> list[Image.Image]:
    """Frame 01 = the canonical PNG; frames 02..n = sources/<name>_NN.png."""
    frame_01 = (ROOT / f"{name}.png")
    out = [Image.open(frame_01).convert("RGBA").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)]
    for i in range(2, n + 1):
        path = SOURCES_DIR / f"{name}_{i:02d}.png"
        out.append(Image.open(path).convert("RGBA").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS))
    return out

# ── Frame-source selection modes ────────────────────────────────────────────
def pick_source(sources: list, t: float, mode: str) -> Image.Image:
    N = len(sources)
    pos = t * N
    if mode == "crossfade":
        i = int(pos) % N
        f = pos - int(pos)
        return Image.blend(sources[i], sources[(i + 1) % N], f)
    if mode == "reveal":
        return sources[int(pos) % N]
    if mode == "flicker":
        # Treat sources as the flicker sequence (full, dim, off, alt) — opacity from sources themselves
        return sources[int(pos) % N]
    raise ValueError(f"unknown mode: {mode}")

# ── Motion primitives ───────────────────────────────────────────────────────
def rotate_pulse(im, t, deg, pulse):
    a = deg * t
    s = 1 + pulse * math.sin(t * 2 * math.pi)
    return _scale(im.rotate(a, resample=Image.BICUBIC), s)

def drift_wrap(im, t, amount):
    """Vertically drift downward by *amount* of frame height, with seamless wrap."""
    px = int(im.height * amount * t)
    return ImageChops.offset(im, 0, px)  # wraps around — seamless when source tiles vertically

def hue_cycle(im, t, deg):
    """Shift the hue channel by deg×t. Preserves alpha."""
    r, g, b, a = im.split()
    rgb = Image.merge("RGB", (r, g, b))
    h_shift = (deg * t) / 360.0
    rotated = _hue_shift(rgb, h_shift)
    rotated.putalpha(a)
    return rotated

def _scale(im, factor):
    """Scale around center, preserve canvas size."""
    if factor == 1.0:
        return im
    w, h = im.size
    nw, nh = int(w * factor), int(h * factor)
    scaled = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(scaled, ((w - nw) // 2, (h - nh) // 2), scaled)
    return canvas

def _hue_shift(im_rgb, fraction):
    """Shift hue by fraction (0-1) of the wheel."""
    # Implementation: convert via HSV; use numpy for speed if available.
    import numpy as np
    arr = np.asarray(im_rgb).astype("float32") / 255
    # Convert RGB→HSV per pixel (numpy port of colorsys)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx, mn = arr.max(-1), arr.min(-1)
    v = mx
    s = np.where(mx == 0, 0, (mx - mn) / np.where(mx == 0, 1, mx))
    d = np.where(mx - mn == 0, 1, mx - mn)
    h = np.zeros_like(v)
    h = np.where(mx == r, ((g - b) / d) % 6, h)
    h = np.where(mx == g, (b - r) / d + 2, h)
    h = np.where(mx == b, (r - g) / d + 4, h)
    h = (h / 6 + fraction) % 1
    # HSV→RGB
    i = (h * 6).astype("int")
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    rgb_out = np.stack([
        np.choose(i % 6, [v, q, p, p, t, v]),
        np.choose(i % 6, [t, v, v, q, p, p]),
        np.choose(i % 6, [p, p, t, v, v, q]),
    ], axis=-1)
    return Image.fromarray((rgb_out * 255).clip(0, 255).astype("uint8"), "RGB")

# ── Overlay dispatcher ──────────────────────────────────────────────────────
def overlay(im: Image.Image, t: float, spec: tuple | None) -> Image.Image:
    if spec is None:
        return im
    name, *args = spec
    if name == "rotate":     return im.rotate(args[0] * t, resample=Image.BICUBIC)                    # continuous 0→deg
    if name == "wiggle":     return im.rotate(args[0] * math.sin(t * 2 * math.pi), resample=Image.BICUBIC)  # ±deg
    if name == "drift_wrap": return drift_wrap(im, t, *args)
    if name == "hue_cycle":  return hue_cycle(im, t, *args)
    if name == "pulse":      return _scale(im, 1 + args[0] * math.sin(t * 2 * math.pi))
    # ... add jitter, drift_fade, wiggle_rise, drift_wiggle, drift_wiggle_pulse
    raise ValueError(f"unknown overlay: {name}")

# ── Main loop ───────────────────────────────────────────────────────────────
def build(name: str, recipe: dict) -> None:
    sources = load_sources(name, recipe["sources"])
    frames = []
    for n in range(FRAMES):
        t = n / FRAMES
        base = pick_source(sources, t, recipe["mode"])
        frames.append(overlay(base, t, recipe.get("overlay")))
    out = ROOT / f"{name}.webp"
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS,
        loop=0,
        quality=QUALITY,
        method=WEBP_METHOD,
        lossless=False,
    )
    print(f"{name}: {len(sources)} sources → {out.name} ({out.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    for name, recipe in RECIPES.items():
        build(name, recipe)
```

## Recipe library

Each recipe is a function `(src_image, t∈[0,1)) → Image`. Compose freely.

### Rotation
- **`rotate(deg, t)`** — `im.rotate(deg * t, resample=BICUBIC)`. Resample BICUBIC for smoothness; LANCZOS is overkill for rotation and slower.
- **`wiggle(deg, t)`** — `im.rotate(deg * math.sin(t * 2π))`. Used for leaves, music notes, blossoms.

### Translation
- **`drift_wrap(amount, t)`** — `ImageChops.offset(im, 0, int(h * amount * t))`. Wraps; **only seamless if source tiles vertically** (true for snow/leaves/blossoms which fill the frame).
- **`drift_fade(amount, t, fade_amount)`** — translate + multiply alpha by `1 - fade_amount * t`. Used for bubbles rising and disappearing.

### Scale (around center, preserves canvas)
- **`pulse(amp, t)`** — `_scale(im, 1 + amp * sin(2π t))`. Used for hearts, fire, blossoms.

### Opacity
- **`twinkle(low, t)`** — multiply alpha by `low + (1 - low) * (0.5 + 0.5 * sin(2π t))`. Used for stars.
- **`flicker(sequence, t)`** — pick from a discrete list of alpha multipliers. Used for lightning.

### Color
- **`hue_cycle(deg, t)`** — shift HSV hue by `deg * t / 360`. Preserve alpha by splitting/recombining channels. Used for rainbow.

### Composite
- **`cascade(steps, t)`** — split the frame into `steps` vertical bands; mask each band's opacity based on which step it's in along `t`. Gives a "trail" or sequential reveal. Used for paws.

## Conventions

- **Frame count: 16** — sweet spot for smoothness vs file size. Bump to 24 for very slow loops; drop to 8 for flicker effects.
- **Frame duration: 80 ms** — 12.5 fps. Slow enough to read pixel art, fast enough to look alive.
- **Target size: 256 px on the long edge** — matches typical render box (≤78 px) at 3× DPR. Lower if the asset is only ever rendered tiny.
- **WebP encoder: `quality=85, method=6`** — `method=6` is slow but gives the best size/quality ratio. For one-time pre-commit conversion this is fine.
- **Always commit the outputs.** No build-time generation. Keeps the JS build dependency-free and lets reviewers see the actual asset diff.
- **Keep source PNGs.** They're the canonical authoring source; re-runnable from them.

## Wiring into Vite/React

Vite imports `.webp` natively as a URL — no plugin, no config change. Just flip the import extension:

```js
// Before
import particleSparkle from '../assets/.../particle_sparkle.png';
// After
import particleSparkle from '../assets/.../particle_sparkle.webp';
```

Animated WebP autoplays in `<img>` tags. To freeze on the first frame (for previews), render a `<canvas>` with the decoded first frame or maintain a separate static `.webp` / `.png` poster — there is no `<img>` attribute to pause an animated WebP.

## Sprite-sheet pattern (alternative)

For UI where you need **state-driven playback** — e.g. only animate while a pet is "happy", pause when idle — animated WebP can't be paused. Use a sprite sheet instead:

1. Produce frames the same way (Pillow).
2. Concatenate horizontally into one PNG (`atlas.png`).
3. Render at `width: 1 frame; height: 1 frame; background-image: url(atlas.png); background-position-x: calc(var(--frame) * -1 * <frame-width>);` with an `@keyframes` driving `--frame` via `steps(N)`.

This is more code but gives full play/pause/scrub control. The pet-state `STATE_ANIM` map in `HA-chores/chores/frontend/src/components/Pet.jsx` is already this pattern (with a single-frame "sheet" — the static PNG — plus pure CSS transform animations).

## Checklist for new sprite-animation work

- [ ] Decide approach: hybrid (default) / pure procedural / sprite-sheet (see top of doc)
- [ ] For each sprite, decide: how many AI source frames? Which mode (`crossfade` / `reveal` / `flicker`)? Which overlay (if any)?
- [ ] Generate AI source frames via `nanobanana:generate` — lock the prompt prefix per sprite, vary only the arrangement language. Eyeball one against frame 01 before producing the rest.
- [ ] Commit AI sources to `sources/` (sized like the originals, RGBA, transparent background)
- [ ] Drop an assembly script at `<submodule>/<frontend>/scripts/animate_<thing>.py` based on the template above
- [ ] Run, eyeball one output, then bulk-run
- [ ] Commit `.webp` outputs alongside source PNGs (animated WebPs are the bundled artifact)
- [ ] Flip `.png` → `.webp` imports in the consuming JSX
- [ ] Bump submodule version + add changelog entry
- [ ] Bump umbrella pointer
