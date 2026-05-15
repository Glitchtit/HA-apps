# Sprite & particle animation pipeline

Reference for producing animated sprites for HA-apps frontends (HA-chores, HA-stock, HA-recipes, HA-storage). Captures the "procedural-from-PNG" recipe established in [`docs/superpowers/specs/2026-05-15-animated-webp-particles-design.md`](superpowers/specs/2026-05-15-animated-webp-particles-design.md). Read this first when asked to animate a sprite, build a sprite-sheet, or convert an existing static asset to a moving one.

## When to use this approach

Procedural-from-PNG is the right choice when:

- You have one (or several) static PNGs with **dense element coverage** (many snowflakes scattered across the frame, a bouquet of hearts, etc.) — applying a small motion to the whole frame reads as continuous motion of the elements.
- The motion is **simple and looping**: rotate, drift, scale-pulse, opacity-pulse, hue-cycle, jitter, flicker.
- The asset will be rendered at **much smaller dimensions than the source** — downscaling absorbs minor procedural imperfections.
- You want **zero new authoring effort** and a single script that anyone can re-run.

Don't use it when:

- The animation requires **frame-by-frame character variation** (different sparkle shapes, sequential paw prints showing distinct steps). Author the frames or build a sprite sheet.
- You need **physics-driven** motion (cloth, soft-body deformation). Use a tool that solves physics; the procedural recipes here are kinematic.
- The asset is already small (<256 px) — procedural transforms compound aliasing.

## Format choice: always animated WebP

For sprites rendered as `<img>` in the HA frontends:

| Format | Alpha | Size vs PNG static | Notes |
|---|---|---|---|
| **Animated WebP** | Full | smaller (downscaling wins) | **Default choice.** Native Vite import, autoplays in `<img>`. |
| APNG | Full | larger than WebP | Use only if a target environment refuses WebP. |
| GIF | 1-bit | 3–5× larger | Avoid — visible jagged halos around any sub-pixel-alpha edge. |
| Sprite sheet + CSS | N/A | depends | Use when you need per-frame CSS control (pause, sync with state) — see *Sprite-sheet pattern* below. |

## Script template

Place at `<submodule>/<frontend>/scripts/animate_<thing>.py`. The script should be standalone — no project deps, runs with system Python + Pillow.

```python
"""Procedural sprite animator.

Reads <source>.png files from <input dir> and writes animated <name>.webp
files alongside them. Idempotent — safe to re-run.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageChops
import colorsys
import math

SRC = Path(__file__).parent.parent / "src" / "assets" / "<path-to-sprites>"
FRAMES = 16
DURATION_MS = 80              # 16 × 80 ms = 1.28 s loop
TARGET_SIZE = 256             # Source is 1024; downscale aggressively
QUALITY = 85
WEBP_METHOD = 6               # 0=fast, 6=slow/best

# ── Per-sprite motion recipes ───────────────────────────────────────────────
RECIPES = {
    "particle_sparkle": {"motion": "rotate_pulse",     "amp": (360, 0.08)},
    "particle_stars":   {"motion": "rotate_twinkle",   "amp": (360, 0.3)},
    "particle_hearts":  {"motion": "pulse",            "amp": (0.10,)},
    "particle_bubbles": {"motion": "drift_fade",       "amp": (-0.06, 0.5)},
    "particle_fire":    {"motion": "jitter_pulse",     "amp": (0.02, 0.01, 0.05)},
    "particle_lightning":{"motion": "flicker",         "amp": (0.0, 0.5, 0.0, 1.0)},
    "particle_snow":    {"motion": "drift_wrap",       "amp": (0.10,)},  # downward
    "particle_leaves":  {"motion": "drift_wiggle",     "amp": (0.10, 8)},
    "particle_blossoms":{"motion": "drift_wiggle_pulse","amp":(0.08, 5, 0.05)},
    "particle_music":   {"motion": "wiggle_rise",      "amp": (10, -0.05)},
    "particle_paws":    {"motion": "cascade",          "amp": (3,)},  # 3 thirds
    "particle_rainbow": {"motion": "hue_cycle",        "amp": (360,)},
}

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

# ── Main loop ───────────────────────────────────────────────────────────────
def build(path: Path, recipe: dict) -> None:
    src = Image.open(path).convert("RGBA")
    src = src.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    frames = []
    for n in range(FRAMES):
        t = n / FRAMES
        frame = dispatch(src, t, recipe)
        frames.append(frame)
    out = path.with_suffix(".webp")
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
    print(f"{path.name} → {out.name} ({out.stat().st_size // 1024} KB)")

def dispatch(im, t, recipe):
    motion = recipe["motion"]
    amp = recipe["amp"]
    if motion == "rotate_pulse":   return rotate_pulse(im, t, *amp)
    if motion == "drift_wrap":     return drift_wrap(im, t, *amp)
    if motion == "hue_cycle":      return hue_cycle(im, t, *amp)
    # ... add the rest as you implement them
    raise ValueError(f"unknown motion: {motion}")

if __name__ == "__main__":
    for png in sorted(SRC.glob("*.png")):
        stem = png.stem
        if stem in RECIPES:
            build(png, RECIPES[stem])
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

- [ ] Source PNGs exist and have dense element coverage (or use a different approach)
- [ ] Decide motion per sprite (see recipe library)
- [ ] Decide target size — render box × 2-3× DPR, no bigger
- [ ] Drop a script at `<submodule>/<frontend>/scripts/animate_<thing>.py` based on the template above
- [ ] Run, eyeball one output, then bulk-run
- [ ] Commit outputs alongside source PNGs
- [ ] Flip `.png` → `.webp` imports in the consuming JSX
- [ ] Bump submodule version + add changelog entry
- [ ] Bump umbrella pointer
