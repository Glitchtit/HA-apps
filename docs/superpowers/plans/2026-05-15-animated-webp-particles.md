# Animated WebP Particle Effects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 12 static particle PNGs in HA-chores with animated WebPs whose frames are sourced from nanobanana and assembled into a coherent loop via a Pillow script.

**Architecture:** Two-phase hybrid pipeline. Phase 1: invoke `nanobanana:generate` to produce 3–6 style-matched variant frames per particle, saved under `src/assets/pets/cosmetics/particles/sources/`. Phase 2: a standalone Python script (Pillow + numpy) downscales every source to 256×256 and weaves them into a 16-frame animated WebP using per-particle recipes (`crossfade`/`reveal`/`flicker` modes + optional motion overlay). Finally flip 12 `.png` import lines in `Pet.jsx` to `.webp`.

**Tech Stack:**
- Python 3.14 (system), Pillow ≥9.x (animated-WebP alpha support), numpy (for `hue_cycle`)
- nanobanana skill (`nanobanana:generate`) for source frames
- Vite (already in place — handles `.webp` imports natively)
- No new JS dependencies; no new Python dependencies in the runtime image

**Reference:** Design spec at [`docs/superpowers/specs/2026-05-15-animated-webp-particles-design.md`](../specs/2026-05-15-animated-webp-particles-design.md); generalized pipeline at [`docs/sprite-pipeline.md`](../../sprite-pipeline.md).

---

## File map

**Create:**
- `HA-chores/chores/frontend/scripts/animate_particles.py` — the assembly script (single file, ~250 LOC)
- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/` — new directory for AI-generated frame sources (committed)
- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_<name>_NN.png` — ~48 new source PNGs (4 avg × 12 particles, varies per recipe)
- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_<name>.webp` — 12 new animated WebP outputs

**Modify:**
- `HA-chores/chores/frontend/src/components/Pet.jsx:106-117` — 12 import lines flipped from `.png` → `.webp`
- `HA-chores/chores/config.json:3` — version `0.7.2` → `0.7.3`
- `HA-chores/chores/CHANGELOG.md` — new `## 0.7.3` entry at top

**Unchanged (kept as canonical art / frame_01 sources):**
- `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_*.png` — 12 existing PNGs

---

## Task 1: Smoke-test Pillow animated WebP on this system

Make sure Pillow can read RGBA PNGs and write animated WebPs with alpha. Catches Pillow/libwebp version mismatches before we invest in any source generation.

**Files:**
- Test: ephemeral — run a one-liner, no committed file

- [ ] **Step 1: Verify Pillow + numpy are present**

Run:
```bash
python -c "import PIL; from PIL import Image, ImageChops; import numpy; print('PIL', PIL.__version__, 'numpy', numpy.__version__)"
```

Expected: prints versions, no ImportError. If either is missing, install with `yay -S python-pillow python-numpy` (Arch) or `pip install --user Pillow numpy`.

- [ ] **Step 2: Verify animated WebP alpha encoding**

Run:
```bash
python <<'EOF'
from PIL import Image
frames = []
for i in range(4):
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    # Translucent red square in different positions per frame
    for x in range(20):
        for y in range(20):
            im.putpixel((10 + i * 5 + x, 10 + y), (255, 0, 0, 200))
    frames.append(im)
frames[0].save("/tmp/_webp_smoke.webp", save_all=True, append_images=frames[1:],
               duration=100, loop=0, quality=85, method=6, lossless=False)
out = Image.open("/tmp/_webp_smoke.webp")
print("OK:", out.size, "n_frames:", getattr(out, "n_frames", 1), "mode:", out.mode)
EOF
```

Expected: `OK: (64, 64) n_frames: 4 mode: RGBA`. If `n_frames` is 1 or mode is not RGBA, the local Pillow build lacks animated-WebP-alpha support — STOP and resolve before continuing.

- [ ] **Step 3: Clean up**

Run: `rm /tmp/_webp_smoke.webp`

- [ ] **Step 4: No commit** (smoke test, no repo changes)

---

## Task 2: Scaffold the assembly script

Create the script file with the recipe table, the source loader, the frame-source dispatcher (`crossfade`/`reveal`/`flicker`), the overlay dispatcher (stubs only — overlay primitives come in Task 3), and the build loop. The script should be runnable end-to-end on any single particle, even if some overlay names raise `NotImplementedError`.

**Files:**
- Create: `HA-chores/chores/frontend/scripts/animate_particles.py`

- [ ] **Step 1: Create the script file**

```python
#!/usr/bin/env python3
"""Hybrid sprite animator for HA-chores particle effects.

Loads each particle's PNG (frame_01) plus the AI-generated variants in
``sources/<name>_NN.png`` and writes a 16-frame animated WebP alongside.
Idempotent — safe to re-run.

CLI:
    python scripts/animate_particles.py            # all particles
    python scripts/animate_particles.py snow       # just particle_snow
"""
from __future__ import annotations
import math
import sys
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent / "src" / "assets" / "pets" / "cosmetics" / "particles"
SOURCES_DIR = ROOT / "sources"
FRAMES = 16
DURATION_MS = 80              # 16 × 80 ms = 1.28 s loop
TARGET_SIZE = 256
QUALITY = 85
WEBP_METHOD = 6

# Per-particle recipes. overlay tuple: (name, *params) — see overlay() dispatcher.
RECIPES: dict[str, dict] = {
    "particle_sparkle":  {"sources": 6, "mode": "reveal",    "overlay": ("wiggle", 15)},
    "particle_stars":    {"sources": 4, "mode": "crossfade", "overlay": ("rotate", 90)},
    "particle_hearts":   {"sources": 3, "mode": "crossfade", "overlay": ("pulse", 0.10)},
    "particle_bubbles":  {"sources": 4, "mode": "crossfade", "overlay": ("drift_fade", -0.06, 0.5)},
    "particle_fire":     {"sources": 6, "mode": "reveal",    "overlay": ("jitter", 0.02, 0.01)},
    "particle_lightning":{"sources": 4, "mode": "flicker",   "overlay": None},
    "particle_snow":     {"sources": 4, "mode": "crossfade", "overlay": ("drift_wrap", 0.10)},
    "particle_leaves":   {"sources": 4, "mode": "crossfade", "overlay": ("drift_wiggle", 0.10, 8)},
    "particle_blossoms": {"sources": 4, "mode": "crossfade", "overlay": ("drift_wiggle_pulse", 0.08, 5, 0.05)},
    "particle_music":    {"sources": 4, "mode": "crossfade", "overlay": ("wiggle_rise", 10, -0.05)},
    "particle_paws":     {"sources": 4, "mode": "reveal",    "overlay": None},
    "particle_rainbow":  {"sources": 4, "mode": "crossfade", "overlay": ("hue_cycle", 360)},
}


def load_sources(name: str, n: int) -> list[Image.Image]:
    frame_01 = ROOT / f"{name}.png"
    if not frame_01.exists():
        raise FileNotFoundError(f"missing frame_01: {frame_01}")
    out = [Image.open(frame_01).convert("RGBA").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)]
    for i in range(2, n + 1):
        path = SOURCES_DIR / f"{name}_{i:02d}.png"
        if not path.exists():
            raise FileNotFoundError(f"missing source: {path}")
        out.append(Image.open(path).convert("RGBA").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS))
    return out


def pick_source(sources: list[Image.Image], t: float, mode: str) -> Image.Image:
    n = len(sources)
    pos = t * n
    i = int(pos) % n
    if mode == "crossfade":
        f = pos - int(pos)
        return Image.blend(sources[i], sources[(i + 1) % n], f)
    if mode == "reveal":
        return sources[i]
    if mode == "flicker":
        # Treat the 4 sources as: full bolt, dim bolt, off (blank), alt bolt
        return sources[i]
    raise ValueError(f"unknown mode: {mode}")


def overlay(im: Image.Image, t: float, spec: tuple | None) -> Image.Image:
    if spec is None:
        return im
    name, *args = spec
    raise NotImplementedError(f"overlay '{name}' not implemented yet (Task 3)")


def build(name: str, recipe: dict) -> Path:
    sources = load_sources(name, recipe["sources"])
    frames: list[Image.Image] = []
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
    return out


def main() -> int:
    targets = list(RECIPES.keys())
    if len(sys.argv) > 1:
        wanted = sys.argv[1]
        full = f"particle_{wanted}" if not wanted.startswith("particle_") else wanted
        if full not in RECIPES:
            print(f"unknown particle: {wanted} (have: {', '.join(RECIPES)})")
            return 2
        targets = [full]
    for name in targets:
        try:
            out = build(name, RECIPES[name])
            print(f"{name}: {RECIPES[name]['sources']} sources → {out.name} ({out.stat().st_size // 1024} KB)")
        except FileNotFoundError as e:
            print(f"{name}: SKIP — {e}")
        except NotImplementedError as e:
            print(f"{name}: SKIP — {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x HA-chores/chores/frontend/scripts/animate_particles.py`

- [ ] **Step 3: Smoke-run with no sources present**

Run:
```bash
cd HA-chores/chores/frontend && python scripts/animate_particles.py snow
```

Expected: prints `particle_snow: SKIP — missing source: …/sources/particle_snow_02.png` (no traceback). This confirms the file loader works and errors gracefully when sources don't exist.

- [ ] **Step 4: Commit**

```bash
cd HA-chores
git add chores/frontend/scripts/animate_particles.py
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Add animate_particles.py scaffolding"
```

---

## Task 3: Implement the overlay primitives

Replace the `NotImplementedError` stub with the full overlay library: `rotate`, `wiggle`, `drift_wrap`, `drift_fade`, `pulse`, `jitter`, `hue_cycle`, `drift_wiggle`, `drift_wiggle_pulse`, `wiggle_rise`. All are pure functions of `(im, t, *params)`.

**Files:**
- Modify: `HA-chores/chores/frontend/scripts/animate_particles.py` — replace the `overlay()` stub and add helpers + numpy hue-cycle

- [ ] **Step 1: Replace the overlay stub and add helpers**

Find the `def overlay(` block in the script and replace it with this. Also add the helpers (`_scale`, `_hue_shift`) and a deterministic `random` import at the top of the file.

Add to the top imports:
```python
import random
```

Replace `def overlay(...)` and append the helpers:

```python
def overlay(im: Image.Image, t: float, spec: tuple | None) -> Image.Image:
    if spec is None:
        return im
    name, *args = spec
    if name == "rotate":
        return im.rotate(args[0] * t, resample=Image.BICUBIC)
    if name == "wiggle":
        return im.rotate(args[0] * math.sin(t * 2 * math.pi), resample=Image.BICUBIC)
    if name == "drift_wrap":
        px = int(im.height * args[0] * t)
        return ImageChops.offset(im, 0, px)
    if name == "drift_fade":
        amount, fade_amount = args
        px = int(im.height * amount * t)
        moved = ImageChops.offset(im, 0, px)
        return _alpha_scale(moved, 1.0 - fade_amount * t)
    if name == "pulse":
        return _scale(im, 1 + args[0] * math.sin(t * 2 * math.pi))
    if name == "jitter":
        # Deterministic per-frame jitter using a seeded RNG so loops are reproducible
        rng = random.Random(int(t * 1_000_000))
        ax, ay = args
        dx = int(im.width * ax * (rng.random() * 2 - 1))
        dy = int(im.height * ay * (rng.random() * 2 - 1))
        return ImageChops.offset(im, dx, dy)
    if name == "hue_cycle":
        return _hue_cycle(im, t, args[0])
    if name == "drift_wiggle":
        amount, wiggle_deg = args
        px = int(im.height * amount * t)
        moved = ImageChops.offset(im, 0, px)
        return moved.rotate(wiggle_deg * math.sin(t * 2 * math.pi), resample=Image.BICUBIC)
    if name == "drift_wiggle_pulse":
        amount, wiggle_deg, pulse_amp = args
        px = int(im.height * amount * t)
        moved = ImageChops.offset(im, 0, px)
        rotated = moved.rotate(wiggle_deg * math.sin(t * 2 * math.pi), resample=Image.BICUBIC)
        return _scale(rotated, 1 + pulse_amp * math.sin(t * 2 * math.pi))
    if name == "wiggle_rise":
        wiggle_deg, rise_amount = args
        px = int(im.height * rise_amount * t)  # negative rise_amount = upward
        moved = ImageChops.offset(im, 0, px)
        return moved.rotate(wiggle_deg * math.sin(t * 2 * math.pi), resample=Image.BICUBIC)
    raise ValueError(f"unknown overlay: {name}")


def _scale(im: Image.Image, factor: float) -> Image.Image:
    """Scale around center, preserve canvas size."""
    if factor == 1.0:
        return im
    w, h = im.size
    nw, nh = max(1, int(w * factor)), max(1, int(h * factor))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(scaled, ((w - nw) // 2, (h - nh) // 2), scaled)
    return canvas


def _alpha_scale(im: Image.Image, factor: float) -> Image.Image:
    """Multiply alpha channel by *factor* (clamped to [0, 1])."""
    factor = max(0.0, min(1.0, factor))
    if factor == 1.0:
        return im
    r, g, b, a = im.split()
    a = a.point(lambda v: int(v * factor))
    return Image.merge("RGBA", (r, g, b, a))


def _hue_cycle(im: Image.Image, t: float, deg: float) -> Image.Image:
    """Shift HSV hue by ``deg * t``. Preserves alpha."""
    import numpy as np
    arr = np.asarray(im).astype("float32") / 255
    rgb, a = arr[..., :3], arr[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    v = mx
    diff = mx - mn
    s = np.where(mx == 0, 0, diff / np.where(mx == 0, 1, mx))
    d = np.where(diff == 0, 1, diff)
    h = np.zeros_like(v)
    h = np.where(mx == r, ((g - b) / d) % 6, h)
    h = np.where(mx == g, (b - r) / d + 2, h)
    h = np.where(mx == b, (r - g) / d + 4, h)
    h = (h / 6 + (deg * t) / 360.0) % 1
    i = (h * 6).astype("int")
    f = h * 6 - i
    p = v * (1 - s)
    q = v * (1 - f * s)
    tt = v * (1 - (1 - f) * s)
    out = np.stack([
        np.choose(i % 6, [v, q, p, p, tt, v]),
        np.choose(i % 6, [tt, v, v, q, p, p]),
        np.choose(i % 6, [p, p, tt, v, v, q]),
    ], axis=-1)
    out = np.concatenate([out, a[..., None]], axis=-1)
    return Image.fromarray((out * 255).clip(0, 255).astype("uint8"), "RGBA")
```

- [ ] **Step 2: Re-run the smoke check**

Run:
```bash
cd HA-chores/chores/frontend && python scripts/animate_particles.py snow
```

Expected: still prints `particle_snow: SKIP — missing source: …_02.png` (we still don't have sources yet, but the overlay no longer raises `NotImplementedError`).

- [ ] **Step 3: Commit**

```bash
cd HA-chores
git add chores/frontend/scripts/animate_particles.py
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Implement overlay primitives for animate_particles.py"
```

---

## Task 4: Pilot — generate sources for one particle (snow) and assemble

End-to-end validation with a single particle. **STOP after this task and visually inspect the output before proceeding to bulk generation.** If anything looks off — alpha is broken, loop has a visible seam, file is way over 250KB, AI sources don't match style — fix the script or revise the recipe before generating the other 11.

`particle_snow` is the chosen pilot because:
- Drift-mode motion is the most visually demanding (any loop seam shows immediately)
- The existing PNG is dense — easy for nanobanana to match
- 4 sources = small generation budget for the validation step

**Files:**
- Create: `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/` (directory)
- Create: `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_snow_02.png` (and `_03`, `_04`)
- Create: `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_snow.webp` (assembled output)

- [ ] **Step 1: Create the sources directory**

```bash
mkdir -p HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources
```

- [ ] **Step 2: Inspect frame_01 to lock the style language**

```bash
file HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_snow.png
```

Open `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_snow.png` with the `Read` tool to see the existing art. Note: palette, snowflake size variation, density, edge style (pixel-art vs smooth).

- [ ] **Step 3: Generate source 02 via nanobanana**

Use the `Skill` tool with `skill: nanobanana:generate`. Prompt template (substitute the observed style language from Step 2):

```
Pixel art snowflakes scattered on transparent background, white and pale blue six-pointed snowflakes, same palette and snowflake size variation as reference, different arrangement — flakes shifted to upper-left of the frame, 1024x1024, transparent background
```

After generation, the file lands wherever nanobanana drops it (the `transparentize.py` PostToolUse hook will already have run). Move it:

```bash
mv <nanobanana-output-path> HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_snow_02.png
```

- [ ] **Step 4: Generate sources 03 and 04 with different arrangements**

Same skill, vary the arrangement language:
- `_03`: "different arrangement — flakes denser at the bottom"
- `_04`: "different arrangement — fewer but larger flakes scattered evenly"

Move each to `sources/particle_snow_03.png` and `sources/particle_snow_04.png`.

- [ ] **Step 5: Eyeball the four sources together**

All four PNGs (frame_01 in the parent dir + the three new sources) should:
- Use the same palette (no rogue colors)
- Have similar density (none drastically emptier/denser than the others)
- All have a transparent background (no checkerboard remnant)

If any source is off-style, regenerate it with a corrective prompt before continuing. Style drift compounds in crossfade mode.

- [ ] **Step 6: Run the assembly script on snow**

```bash
cd HA-chores/chores/frontend && python scripts/animate_particles.py snow
```

Expected output: `particle_snow: 4 sources → particle_snow.webp (NNN KB)` where NNN is between 80 and 300.

- [ ] **Step 7: Verify the WebP visually**

Open `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_snow.webp` with the `Read` tool. Confirm:
- It's an animated WebP (not a single frame)
- Alpha is preserved (no white box around the content)
- Loop is seamless (frame 16 transitions cleanly back to frame 1)

For a more thorough check, run:
```bash
python -c "from PIL import Image; im = Image.open('HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_snow.webp'); print('frames:', im.n_frames, 'mode:', im.mode, 'size:', im.size)"
```

Expected: `frames: 16 mode: RGBA size: (256, 256)`.

- [ ] **Step 8: Get user sign-off before bulk generation**

Show the user the pilot output (`particle_snow.webp`) and ask:

> "Pilot output is `particle_snow.webp` (NNN KB). It runs through 4 AI sources in crossfade mode with a 10% downward drift overlay. Is the visual quality / style / file size acceptable? If yes, I'll proceed to generate sources for the other 11 particles."

**Do not proceed to Task 5 without explicit approval.** If the user wants changes (different quality, different motion params, different source count), update the recipe in `animate_particles.py` and regenerate snow first.

- [ ] **Step 9: Commit the pilot**

```bash
cd HA-chores
git add chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_snow_*.png \
        chores/frontend/src/assets/pets/cosmetics/particles/particle_snow.webp
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Pilot animated WebP particle: snow (4 sources)"
```

---

## Task 5: Generate AI sources for the remaining 11 particles

After user sign-off on the pilot, generate variant sources for each remaining particle. Substep counts come from `RECIPES` in the script. Each sub-bullet is one `nanobanana:generate` invocation followed by a move/rename.

For every particle: Read its existing PNG first (with the `Read` tool) and lock the observed palette/density/style into the prompt prefix. Vary only the arrangement language between variants of the same particle.

**Generation budget:** ~47 nanobanana calls (12 totals minus snow's 3 done in Task 4, minus the 12 frame_01s that come from existing PNGs).

**Files:** all under `HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/`.

- [ ] **Step 1: particle_sparkle (5 sources to generate: _02 through _06)**

Read `particle_sparkle.png` to lock style. Prompt prefix: `Pixel art sparkle particles on transparent background, [observed palette + density], variant N, different sparkle arrangement, 1024x1024`. Vary by: "rotated", "denser center", "fewer larger sparkles", "edges only", "diagonal cluster".

For each variant, invoke `nanobanana:generate` and rename the output:
```bash
mv <output> HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_sparkle_02.png
# ... _03.png through _06.png
```

- [ ] **Step 2: particle_stars (3 sources: _02 through _04)**

Read `particle_stars.png`. Prompt prefix per the same template. Vary by: "rotated 30 degrees", "denser top-right", "fewer large stars".

- [ ] **Step 3: particle_hearts (2 sources: _02 through _03)**

Read `particle_hearts.png`. Vary by: "different heart sizes", "tighter cluster".

- [ ] **Step 4: particle_bubbles (3 sources: _02 through _04)**

Read `particle_bubbles.png`. Vary by: "bubbles higher up", "fewer bubbles", "larger bubbles bottom".

- [ ] **Step 5: particle_fire (5 sources: _02 through _06)**

Read `particle_fire.png`. Vary by: "different flame shapes", "taller flames", "wider base", "more wisps", "single tall flame".

- [ ] **Step 6: particle_lightning (3 sources: _02 through _04)**

For lightning, source 02 should be a **dim** version of frame_01, source 03 should be **fully transparent** (the "off" state — generate as `Image.new('RGBA', (1024, 1024), (0,0,0,0))` via a Python one-liner, no nanobanana needed), source 04 should be an **alternate bolt** shape.

Source 03 one-liner:
```bash
python -c "from PIL import Image; Image.new('RGBA', (1024,1024), (0,0,0,0)).save('HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_lightning_03.png')"
```

For source 02, post-process frame_01 to half-alpha:
```bash
python -c "from PIL import Image; im = Image.open('HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/particle_lightning.png').convert('RGBA'); r,g,b,a = im.split(); a = a.point(lambda v: int(v*0.5)); Image.merge('RGBA', (r,g,b,a)).save('HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_lightning_02.png')"
```

For source 04, use `nanobanana:generate` with prompt prefix from frame_01 + "alternate jagged bolt shape, different angle".

- [ ] **Step 7: particle_leaves (3 sources: _02 through _04)**

Read `particle_leaves.png`. Vary by: "shifted higher", "shifted lower with rotation", "fewer larger leaves".

- [ ] **Step 8: particle_blossoms (3 sources: _02 through _04)**

Read `particle_blossoms.png`. Vary by: "shifted upward", "denser middle", "fewer larger petals".

- [ ] **Step 9: particle_music (3 sources: _02 through _04)**

Read `particle_music.png`. Vary by: "different note arrangement", "more notes top", "smaller notes scattered".

- [ ] **Step 10: particle_paws (3 sources: _02 through _04)**

Read `particle_paws.png`. Vary by: "paws walking left to right", "different paw positions", "paws facing down".

- [ ] **Step 11: particle_rainbow (3 sources: _02 through _04)**

Read `particle_rainbow.png`. Vary by: "different ribbon curve", "wider arc", "narrower zigzag pattern".

- [ ] **Step 12: Eyeball each particle's set against its frame_01**

For each of the 11 particles, briefly Read frame_01 and the new sources and confirm style consistency. Regenerate any that drift.

- [ ] **Step 13: Commit all sources in one batch**

```bash
cd HA-chores
git add chores/frontend/src/assets/pets/cosmetics/particles/sources/particle_*.png
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Add AI-generated source frames for animated particles (11 particles)"
```

---

## Task 6: Run the assembly script on all 12 particles

**Files:**
- Create: 11 more `particle_<name>.webp` files (snow already done in Task 4)

- [ ] **Step 1: Bulk-build**

```bash
cd HA-chores/chores/frontend && python scripts/animate_particles.py
```

Expected output: 12 lines like `particle_X: N sources → particle_X.webp (NNN KB)`, no errors, no SKIPs.

- [ ] **Step 2: Verify the size budget**

```bash
du -sh HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/*.webp
du -sch HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/*.webp | tail -1
```

Expected: each file 80–300 KB, total under 4 MB. If any single file is >500 KB, the recipe likely produced too much frame-to-frame variation — investigate (try lower `quality`, fewer sources, or `crossfade` instead of `reveal`).

- [ ] **Step 3: Spot-check three outputs visually**

Read with the `Read` tool: `particle_fire.webp`, `particle_paws.webp`, `particle_rainbow.webp`. Confirm: 16 frames each, RGBA mode, no obvious artefacts.

- [ ] **Step 4: Commit the WebPs**

```bash
cd HA-chores
git add chores/frontend/src/assets/pets/cosmetics/particles/*.webp
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Build animated WebP outputs for all 12 particles"
```

---

## Task 7: Flip Pet.jsx imports from .png to .webp

**Files:**
- Modify: `HA-chores/chores/frontend/src/components/Pet.jsx:106-117`

- [ ] **Step 1: Confirm current import block**

Run:
```bash
sed -n '106,117p' HA-chores/chores/frontend/src/components/Pet.jsx
```

Expected: 12 lines like `import particleSparkle  from '../assets/pets/cosmetics/particles/particle_sparkle.png';`

- [ ] **Step 2: Flip all 12 extensions to .webp**

Apply twelve edits, one per line. The find-and-replace is unique enough on each line because the variable names + paths are unique. Use the Edit tool with these substitutions:

```
particle_sparkle.png    → particle_sparkle.webp
particle_hearts.png     → particle_hearts.webp
particle_fire.png       → particle_fire.webp
particle_snow.png       → particle_snow.webp
particle_leaves.png     → particle_leaves.webp
particle_blossoms.png   → particle_blossoms.webp
particle_lightning.png  → particle_lightning.webp
particle_music.png      → particle_music.webp
particle_bubbles.png    → particle_bubbles.webp
particle_paws.png       → particle_paws.webp
particle_rainbow.png    → particle_rainbow.webp
particle_stars.png      → particle_stars.webp
```

- [ ] **Step 3: Confirm no .png imports remain in the particle block**

Run:
```bash
grep -n "particle_.*\.png" HA-chores/chores/frontend/src/components/Pet.jsx
```

Expected: no matches. If anything matches, the corresponding edit was missed.

- [ ] **Step 4: Commit**

```bash
cd HA-chores
git add chores/frontend/src/components/Pet.jsx
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Use animated WebP particle assets in Pet.jsx"
```

---

## Task 8: Build + dev-server smoke test

**Files:** none modified (verification only)

- [ ] **Step 1: Production build**

```bash
cd HA-chores/chores/frontend && npm run build
```

Expected: `✓ built in N.NNs`, no errors, no missing-import warnings. The build output should list `*.webp` assets in the `dist/assets/` summary.

- [ ] **Step 2: Verify webp assets are in the bundle**

```bash
ls HA-chores/chores/frontend/dist/assets/ | grep -E 'particle_.*\.webp$' | wc -l
```

Expected: `12` (one bundled `.webp` per particle).

- [ ] **Step 3: Visual smoke check via dev server**

Start dev server in background:
```bash
cd HA-chores/chores/frontend && npm run dev &
```

Open `http://localhost:5173/` (or whatever port Vite reports) in a browser. Navigate to a pet with an equipped particle. Confirm the particle animates. Kill the dev server when done:
```bash
pkill -f "vite"
```

If you can't run a browser, note this explicitly to the user as untested and ask them to verify the dev URL before the version bump in Task 9.

- [ ] **Step 4: No commit** (verification only)

---

## Task 9: Version bump + changelog

**Files:**
- Modify: `HA-chores/chores/config.json:3`
- Modify: `HA-chores/chores/CHANGELOG.md` (prepend new entry)

- [ ] **Step 1: Bump version 0.7.2 → 0.7.3**

Edit `HA-chores/chores/config.json:3`:
```diff
-  "version": "0.7.2",
+  "version": "0.7.3",
```

- [ ] **Step 2: Add changelog entry**

Prepend to `HA-chores/chores/CHANGELOG.md` (above the existing `## 0.7.2` block):

```markdown
## 0.7.3
- **Particle cosmetics are now animated.** Each of the 12 particle effects (sparkle, stars, hearts, bubbles, fire, lightning, snow, leaves, blossoms, music, paws, rainbow) now plays a 16-frame, 1.28 s looping animation. Frame sources come from nanobanana (3–6 style-matched variants per particle, committed to `sources/`); a Pillow assembly script weaves them into animated WebPs with `crossfade`/`reveal`/`flicker` modes and per-particle motion overlays (rotate, wiggle, drift, pulse, hue-cycle).
- Bundle particle assets shrink ~70% — animated WebPs at 256×256 are smaller than the 1024×1024 PNGs they replace, even with 16 frames. Static PNGs are kept as canonical art + frame_01 sources.
- New script: `frontend/scripts/animate_particles.py` (idempotent — re-run to rebuild WebPs).

```

- [ ] **Step 3: Commit**

```bash
cd HA-chores
git add chores/config.json chores/CHANGELOG.md
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "$(cat <<'EOF'
Bump HA-chores to 0.7.3: animated WebP particle cosmetics

Each of the 12 particle effects now plays a 1.28 s, 16-frame looping
animation. Sources from nanobanana (3-6 per particle); assembled via a
Pillow script with per-particle motion overlays. Bundle shrinks ~70%.
EOF
)"
```

---

## Task 10: Push HA-chores

- [ ] **Step 1: Push submodule**

```bash
cd HA-chores && git push origin main
```

Expected: `main -> main` push success.

---

## Task 11: Bump umbrella pointer

**Files:**
- Modify: `HA-apps/.git/...` (submodule pointer; happens automatically via `git commit HA-chores`)

- [ ] **Step 1: Commit the new submodule pointer**

```bash
cd HA-apps
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit HA-chores -m "Bump HA-chores to 0.7.3: animated WebP particle cosmetics"
```

- [ ] **Step 2: Push umbrella**

```bash
git push origin main
```

Expected: `main -> main` push success.

- [ ] **Step 3: Confirm both repos are in sync**

```bash
cd HA-apps && git log -1 --oneline
cd HA-chores && git log -1 --oneline
```

Both should show the latest commit hashes you just pushed.

---

## Done

The animated particles ship as part of HA-chores 0.7.3. Re-run `python scripts/animate_particles.py` any time the AI sources or motion recipes change.
