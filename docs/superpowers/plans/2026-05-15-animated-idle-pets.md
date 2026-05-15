# Animated Idle Pet Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 4 static `idle.png` pet sprites (adult+mythic stages of `orange_black` and `blue_black`) with animated WebPs that play a 2.4 s blink + subtle body sway loop.

**Architecture:** Two phases. Phase 1: invoke `nanobanana:edit_image` once per sprite to produce an eyes-closed variant from the existing `idle.png` (preserves the rest of the character via the edit-in-place model). Phase 2: a standalone Python script (Pillow) loads each sprite's open and closed frames, composes a 24-frame loop using a fixed "blink" schedule (open / open / open ... / half / closed / closed / half / open) with a subtle body-sway overlay (`wiggle ±1°` + `±1 px` vertical drift), and saves an animated WebP. Then 4 import lines in `Pet.jsx` flip from `.png` to `.webp`.

**Tech Stack:** Python 3.14 + Pillow (already installed); nanobanana skill (`mcp__plugin_nanobanana_nanobanana__edit_image`); existing Vite/React frontend (handles `.webp` natively); existing `transparentize.py` helper for stripping AI-generated solid-white backgrounds.

**Reference:** Design spec at [`docs/superpowers/specs/2026-05-15-animated-idle-pets-design.md`](../specs/2026-05-15-animated-idle-pets-design.md); generalized pipeline (including the "Edit-based pattern" section) at [`docs/sprite-pipeline.md`](../../sprite-pipeline.md).

---

## File map

**Create:**
- `HA-chores/chores/frontend/scripts/animate_pets.py` — the assembly script (single file, ~120 LOC)
- `HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/sources/idle_02.png`
- `HA-chores/chores/frontend/src/assets/pets/orange_black/stages/mythic/sources/idle_02.png`
- `HA-chores/chores/frontend/src/assets/pets/blue_black/stages/adult/sources/idle_02.png`
- `HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/sources/idle_02.png`
- `HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.webp`
- `HA-chores/chores/frontend/src/assets/pets/orange_black/stages/mythic/idle.webp`
- `HA-chores/chores/frontend/src/assets/pets/blue_black/stages/adult/idle.webp`
- `HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/idle.webp`

**Modify:**
- `HA-chores/chores/frontend/src/components/Pet.jsx` — 4 import lines flipped (the ones for `*Adult*Idle` and `*Mythic*Idle` for both designs)
- `HA-chores/chores/config.json` — version `0.7.3` → `0.7.4`
- `HA-chores/chores/CHANGELOG.md` — new `## 0.7.4` entry at top

**Unchanged:**
- The 4 existing `idle.png` files at `pets/{design}/stages/{adult,mythic}/idle.png` — kept as canonical art + frame_01 sources
- All other stage sprites (egg/baby/teen idle, all happy/sad/petted) — stay static
- CSS animations in `index.css` — the existing `pet-breathe` keyframe still applies to the wrapper

---

## Task 1: Scaffold animate_pets.py

Create the assembly script with the recipe table, the source loader, the per-frame source picker (the "blink" schedule), the body-sway overlay, and the build loop. The script should be runnable end-to-end on any single sprite path, erroring gracefully when `idle_02.png` doesn't exist.

**Files:**
- Create: `HA-chores/chores/frontend/scripts/animate_pets.py`

- [ ] **Step 1: Create the script file**

Write this content verbatim to `HA-chores/chores/frontend/scripts/animate_pets.py`:

```python
#!/usr/bin/env python3
"""Edit-based sprite animator for HA-chores pet idle states.

For each pet sprite key (e.g. ``orange_black/adult``), loads the canonical
``idle.png`` plus the AI-edited ``sources/idle_02.png`` (eyes closed) and
writes ``idle.webp`` next to the PNG — a 24-frame, 2.4 s blink loop with
subtle body sway.

Idempotent — safe to re-run.

CLI:
    python scripts/animate_pets.py                       # all sprites
    python scripts/animate_pets.py orange_black/adult    # one sprite
"""
from __future__ import annotations
import math
import sys
from pathlib import Path
from PIL import Image, ImageChops

PETS_ROOT = Path(__file__).resolve().parent.parent / "src" / "assets" / "pets"
FRAMES = 24
DURATION_MS = 100             # 24 × 100 ms = 2.4 s loop
TARGET_SIZE = 256
QUALITY = 85
WEBP_METHOD = 6

# Sprite keys — one entry per animated idle sprite. The blink schedule is
# fixed (open mostly, brief close at the end of the cycle).
SPRITES = [
    "orange_black/adult",
    "orange_black/mythic",
    "blue_black/adult",
    "blue_black/mythic",
]


def stage_dir(key: str) -> Path:
    """Resolve <design>/<stage> key to its on-disk directory."""
    design, stage = key.split("/")
    return PETS_ROOT / design / "stages" / stage


def load_sources(key: str) -> tuple[Image.Image, Image.Image]:
    """Return (open_eyes, closed_eyes) both resized to TARGET_SIZE."""
    d = stage_dir(key)
    open_path = d / "idle.png"
    closed_path = d / "sources" / "idle_02.png"
    if not open_path.exists():
        raise FileNotFoundError(f"missing canonical art: {open_path}")
    if not closed_path.exists():
        raise FileNotFoundError(f"missing eyes-closed source: {closed_path}")
    open_im = Image.open(open_path).convert("RGBA").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    closed_im = Image.open(closed_path).convert("RGBA").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    return open_im, closed_im


def pick_blink_frame(open_im: Image.Image, closed_im: Image.Image, n: int) -> Image.Image:
    """Blink schedule for frame *n* in 0..FRAMES-1.

    Frames 0–18: open (19 frames)
    Frame 19:    half-blend (going down)
    Frame 20:    closed
    Frame 21:    closed (held)
    Frame 22:    half-blend (coming up)
    Frame 23:    open
    """
    if n in (20, 21):
        return closed_im
    if n in (19, 22):
        return Image.blend(open_im, closed_im, 0.5)
    return open_im


def body_sway(im: Image.Image, t: float) -> Image.Image:
    """Subtle idle motion: ±1° rotate + ±1 px vertical drift, sin-driven."""
    angle = 1.0 * math.sin(t * 2 * math.pi)
    y_off = int(round(1.0 * math.sin(t * 2 * math.pi)))
    rotated = im.rotate(angle, resample=Image.BICUBIC)
    return ImageChops.offset(rotated, 0, y_off)


def build(key: str) -> Path:
    open_im, closed_im = load_sources(key)
    frames: list[Image.Image] = []
    for n in range(FRAMES):
        t = n / FRAMES
        base = pick_blink_frame(open_im, closed_im, n)
        frames.append(body_sway(base, t))
    out = stage_dir(key) / "idle.webp"
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
    targets = SPRITES
    if len(sys.argv) > 1:
        wanted = sys.argv[1]
        if wanted not in SPRITES:
            print(f"unknown sprite: {wanted} (have: {', '.join(SPRITES)})")
            return 2
        targets = [wanted]
    for key in targets:
        try:
            out = build(key)
            print(f"{key}: → {out.relative_to(PETS_ROOT.parent.parent.parent)} ({out.stat().st_size // 1024} KB)")
        except FileNotFoundError as e:
            print(f"{key}: SKIP — {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/scripts/animate_pets.py`

- [ ] **Step 3: Smoke-run with no sources present**

Run:
```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend && python scripts/animate_pets.py orange_black/adult
```

Expected output: `orange_black/adult: SKIP — missing eyes-closed source: …/orange_black/stages/adult/sources/idle_02.png` (no traceback). Confirms the loader errors gracefully when sources are absent.

- [ ] **Step 4: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/scripts/animate_pets.py
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Add animate_pets.py scaffolding (blink + body sway)"
```

---

## Task 2: Pilot — orange_black/adult (USER GATE)

End-to-end validation on one sprite before bulk. **STOP after this task and ask the user to approve the pilot output before generating the other 3 eyes-closed variants in Task 3.**

`orange_black/adult` is the chosen pilot because it's the most "vanilla" reference design — easy to judge whether the edit preserved the character correctly.

**Files:**
- Create: `HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/sources/idle_02.png`
- Create: `HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.webp`

- [ ] **Step 1: Create the sources directory**

```bash
mkdir -p /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/sources
```

- [ ] **Step 2: Inspect frame_01**

Read `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.png` with the Read tool. Note: where the eyes are, how big they are, what the eye shape and color look like.

- [ ] **Step 3: Generate the eyes-closed variant via nanobanana edit**

Use the `mcp__plugin_nanobanana_nanobanana__edit_image` MCP tool. Parameters:
- `file`: `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.png`
- `prompt`: `Edit this pixel-art axolotl sprite so its eyes are fully closed (sleeping or blinking expression — two curved closed-eye lines). Keep everything else identical pixel-for-pixel: same body, same pose, same colors, same outline, same transparent background. Only the eyes change to closed eyes.`

After the call returns, locate the output file in `/home/glitch/GIT/HA-apps/nanobanana-output/` (the response prints the path).

- [ ] **Step 4: Run transparentize.py --force on the edit output**

The PostToolUse hook does NOT reliably fire for `edit_image` outputs (carryover risk from the particle work). Run it manually to be safe:

```bash
/home/glitch/GIT/HA-apps/scripts/transparentize.py --force --max-clear-pct 99 /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png
```

Replace `<derived-filename>` with whatever filename nanobanana created.

- [ ] **Step 5: Move the output to the target path**

```bash
mv /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/sources/idle_02.png
```

- [ ] **Step 6: Eyeball the eyes-closed variant against frame_01**

Read both files:
- `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.png` (frame_01, open eyes)
- `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/sources/idle_02.png` (just-edited, closed eyes)

Verify:
- Same body, same colors, same pose
- Eyes are closed (two horizontal lines or arcs, not blank)
- Transparent background preserved
- No drastic style drift

If the body changed significantly, regenerate with a stronger preservation prompt: `Edit ONLY the eyes — close them. DO NOT change the body, head, limbs, or background. Pixel-art axolotl, eyes closed, sleeping expression. Everything else stays exactly the same.`

- [ ] **Step 7: Assemble the WebP**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend && python scripts/animate_pets.py orange_black/adult
```

Expected output: `orange_black/adult: → pets/orange_black/stages/adult/idle.webp (NNN KB)` where NNN is between 30 and 200.

- [ ] **Step 8: Verify the WebP**

Read `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.webp` with the Read tool. Confirm:
- Animated WebP (not single frame)
- Frame 0 shows open-eye pose
- Alpha preserved (transparent background)

Also run:
```bash
python -c "from PIL import Image; im = Image.open('/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/adult/idle.webp'); print('frames:', im.n_frames, 'mode:', im.mode, 'size:', im.size)"
```

Expected: `frames: 24 mode: RGBA size: (256, 256)`.

- [ ] **Step 9: USER GATE — show pilot output and ask for approval**

Show the user:
- The static `idle.png` (frame_01)
- The just-generated `idle_02.png` (eyes closed)
- The assembled `idle.webp` (frame 0 preview)

Ask:
> "Pilot for `orange_black/adult` complete — closed-eye edit + 24-frame blink loop (NNN KB). The eyes-closed variant is shown above. Does the character look preserved? Approve to generate the remaining 3 sprites' edits and assemble all 4 WebPs."

**Do not proceed to Task 3 without explicit approval.** If the user wants the edit regenerated, repeat Steps 3–6 before proceeding.

- [ ] **Step 10: Commit the pilot**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/src/assets/pets/orange_black/stages/adult/sources/idle_02.png \
        chores/frontend/src/assets/pets/orange_black/stages/adult/idle.webp
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Pilot animated idle: orange_black/adult (blink + body sway)"
```

---

## Task 3: Generate eyes-closed variants for remaining 3 sprites

After user sign-off on the pilot, generate the eyes-closed edits for `orange_black/mythic`, `blue_black/adult`, and `blue_black/mythic`. Same procedure as the pilot, per sprite.

**Files:**
- Create: `…/orange_black/stages/mythic/sources/idle_02.png`
- Create: `…/blue_black/stages/adult/sources/idle_02.png`
- Create: `…/blue_black/stages/mythic/sources/idle_02.png`

- [ ] **Step 1: Create sources directories**

```bash
mkdir -p /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/mythic/sources
mkdir -p /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/adult/sources
mkdir -p /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/sources
```

- [ ] **Step 2: orange_black/mythic — edit + transparentize + move + verify**

Read `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/mythic/idle.png` first.

Invoke `mcp__plugin_nanobanana_nanobanana__edit_image`:
- `file`: `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/mythic/idle.png`
- `prompt`: `Edit this pixel-art mythic axolotl sprite so its eyes are fully closed (sleeping or blinking expression — two curved closed-eye lines). Keep everything else identical pixel-for-pixel: same body, same pose, same colors, same outline, same transparent background. Only the eyes change to closed eyes.`

Then:
```bash
/home/glitch/GIT/HA-apps/scripts/transparentize.py --force --max-clear-pct 99 /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png
mv /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/orange_black/stages/mythic/sources/idle_02.png
```

Read both `orange_black/stages/mythic/idle.png` and `…/sources/idle_02.png` to verify the body is preserved and only the eyes changed.

- [ ] **Step 3: blue_black/adult — edit + transparentize + move + verify**

Read `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/adult/idle.png` first.

Invoke `mcp__plugin_nanobanana_nanobanana__edit_image`:
- `file`: `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/adult/idle.png`
- `prompt`: `Edit this pixel-art axolotl sprite so its eyes are fully closed (sleeping or blinking expression — two curved closed-eye lines). Keep everything else identical pixel-for-pixel: same body, same pose, same colors, same outline, same transparent background. Only the eyes change to closed eyes.`

Then:
```bash
/home/glitch/GIT/HA-apps/scripts/transparentize.py --force --max-clear-pct 99 /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png
mv /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/adult/sources/idle_02.png
```

Verify by reading both PNGs.

- [ ] **Step 4: blue_black/mythic — edit + transparentize + move + verify**

Read `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/idle.png` first.

Invoke `mcp__plugin_nanobanana_nanobanana__edit_image`:
- `file`: `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/idle.png`
- `prompt`: `Edit this pixel-art mythic axolotl sprite so its eyes are fully closed (sleeping or blinking expression — two curved closed-eye lines). Keep everything else identical pixel-for-pixel: same body, same pose, same colors, same outline, same transparent background. Only the eyes change to closed eyes.`

Then:
```bash
/home/glitch/GIT/HA-apps/scripts/transparentize.py --force --max-clear-pct 99 /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png
mv /home/glitch/GIT/HA-apps/nanobanana-output/<derived-filename>.png /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/sources/idle_02.png
```

Verify by reading both PNGs.

- [ ] **Step 5: Spot-check transparency on all 3 new sources**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores && python -c "
from PIL import Image
for f in [
    'chores/frontend/src/assets/pets/orange_black/stages/mythic/sources/idle_02.png',
    'chores/frontend/src/assets/pets/blue_black/stages/adult/sources/idle_02.png',
    'chores/frontend/src/assets/pets/blue_black/stages/mythic/sources/idle_02.png',
]:
    im = Image.open(f).convert('RGBA')
    a = im.split()[3].histogram()
    total = im.size[0] * im.size[1]
    print(f'{f}: transparent={a[0]/total:.1%} opaque={a[255]/total:.1%}')
"
```

Expected: each shows a meaningful transparent fraction (>30%). If any is 0% transparent, re-run `transparentize.py --force` on that specific file.

- [ ] **Step 6: Commit the 3 new sources**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/src/assets/pets/orange_black/stages/mythic/sources/idle_02.png \
        chores/frontend/src/assets/pets/blue_black/stages/adult/sources/idle_02.png \
        chores/frontend/src/assets/pets/blue_black/stages/mythic/sources/idle_02.png
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Add AI-edited eyes-closed sources for 3 more idle sprites"
```

---

## Task 4: Bulk-assemble remaining 3 idle.webps

**Files:**
- Create: `…/orange_black/stages/mythic/idle.webp`
- Create: `…/blue_black/stages/adult/idle.webp`
- Create: `…/blue_black/stages/mythic/idle.webp`

- [ ] **Step 1: Run the assembly script for all sprites**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend && python scripts/animate_pets.py
```

Expected output (4 lines, no errors or SKIPs):
```
orange_black/adult: → pets/orange_black/stages/adult/idle.webp (NNN KB)
orange_black/mythic: → pets/orange_black/stages/mythic/idle.webp (NNN KB)
blue_black/adult: → pets/blue_black/stages/adult/idle.webp (NNN KB)
blue_black/mythic: → pets/blue_black/stages/mythic/idle.webp (NNN KB)
```

The pilot's `orange_black/adult/idle.webp` will be overwritten — same recipe, deterministic output, so the rebuild is a no-op in practice.

- [ ] **Step 2: Verify size budget**

```bash
du -sh /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/{orange_black,blue_black}/stages/{adult,mythic}/idle.webp
```

Expected: each file 30–200 KB; total under 800 KB. If any single file exceeds 300 KB, the edit may have introduced too much detail variation — note for follow-up but don't block the task.

- [ ] **Step 3: Spot-check one of the new WebPs visually**

Read `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/blue_black/stages/mythic/idle.webp` with the Read tool.

Confirm: frame 0 renders correctly with the mythic blue character visible and a transparent background.

- [ ] **Step 4: Commit the 3 new WebPs**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/src/assets/pets/orange_black/stages/mythic/idle.webp \
        chores/frontend/src/assets/pets/blue_black/stages/adult/idle.webp \
        chores/frontend/src/assets/pets/blue_black/stages/mythic/idle.webp
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Build animated idle.webp for 3 remaining adult+mythic sprites"
```

---

## Task 5: Flip 4 Pet.jsx imports to .webp

**Files:**
- Modify: `HA-chores/chores/frontend/src/components/Pet.jsx`

- [ ] **Step 1: Locate the 4 import lines**

Run:
```bash
grep -nE "stage(Orange|Blue)(Adult|Mythic)Idle" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/Pet.jsx
```

Expected: 4 lines (the import lines for `stageOrangeAdultIdle`, `stageOrangeMythicIdle`, `stageBlueAdultIdle`, `stageBlueMythicIdle`), each ending in `idle.png';`.

- [ ] **Step 2: Flip the extension on those 4 lines**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
sed -i -E 's#(stages/(adult|mythic)/idle)\.png#\1.webp#g' chores/frontend/src/components/Pet.jsx
```

- [ ] **Step 3: Verify the change**

```bash
grep -nE "stage(Orange|Blue)(Adult|Mythic)Idle" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/Pet.jsx
```

Expected: all 4 lines now end in `idle.webp';`. No `idle.png` remains for the adult or mythic stages of either design.

Also confirm only `idle` (not `happy`/`sad`/`petted`) got flipped:
```bash
grep -nE "stages/(adult|mythic)/(happy|sad|petted)\.png" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/Pet.jsx
```

Expected: 12 lines (3 states × 2 designs × 2 stages), all still `.png`. The sed regex anchored to `idle` so only those 4 changed.

- [ ] **Step 4: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/src/components/Pet.jsx
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Use animated WebP for adult+mythic idle in Pet.jsx"
```

---

## Task 6: Build + version bump + changelog

**Files:**
- Modify: `HA-chores/chores/config.json`
- Modify: `HA-chores/chores/CHANGELOG.md`

- [ ] **Step 1: Production build (smoke verify the import flip)**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in N.NNs`, no missing-import errors.

- [ ] **Step 2: Verify the 4 webps are in the bundle**

```bash
ls /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/dist/assets/ | grep -E '^idle-' | wc -l
```

Expected: at least 4 (each `idle.webp` becomes a hashed `idle-XXXXX.webp` in dist; there may be more `idle-*` entries from non-stage idles, that's fine).

- [ ] **Step 3: Bump version 0.7.3 → 0.7.4**

Edit `HA-chores/chores/config.json` to change the version line:

```diff
-  "version": "0.7.3",
+  "version": "0.7.4",
```

- [ ] **Step 4: Add changelog entry**

Prepend to `HA-chores/chores/CHANGELOG.md` (above the existing `## 0.7.3` block):

```markdown
## 0.7.4
- **Adult and mythic pets now blink.** The four adult+mythic idle sprites (orange_black + blue_black) play a 2.4 s looping animation: 19 frames of open-eye + subtle body sway, then a 4-frame blink (half-closed → closed → closed → half-closed), then back to open. Earlier stages (egg/baby/teen) and other states (happy/sad/petted) stay static.
- New script: `frontend/scripts/animate_pets.py` (idempotent — re-run to rebuild idle.webp from sources).
- Eyes-closed variants generated via `nanobanana:edit_image` for character coherence (same pet, only the eyes change); committed under `pets/<design>/stages/<stage>/sources/idle_02.png`.
- The existing CSS `pet-breathe` animation still applies to the wrapper. Combined with the WebP's baked sway, the effect is layered but subtle. If too busy in practice, dial the WebP body-sway amplitude to 0 in `animate_pets.py`.

```

- [ ] **Step 5: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/config.json chores/CHANGELOG.md
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "$(cat <<'EOF'
Bump HA-chores to 0.7.4: animated idle for adult+mythic pets

Adult and mythic pets now blink every 2.4 s with subtle body sway.
Sources from nanobanana edit_image (one eyes-closed variant per
sprite, character preserved). Assembled via Pillow into 24-frame
animated WebPs. Earlier stages stay static.
EOF
)"
```

---

## Task 7: Push HA-chores + bump umbrella

- [ ] **Step 1: Push HA-chores submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git push origin main
```

Expected: `main -> main` push success.

- [ ] **Step 2: Commit the new submodule pointer in the umbrella**

```bash
cd /home/glitch/GIT/HA-apps
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit HA-chores -m "Bump HA-chores to 0.7.4: animated idle for adult+mythic pets"
```

- [ ] **Step 3: Push umbrella**

```bash
git push origin main
```

Expected: `main -> main` push success.

- [ ] **Step 4: Verify both repos in sync**

```bash
cd /home/glitch/GIT/HA-apps && git log -1 --oneline
cd /home/glitch/GIT/HA-apps/HA-chores && git log -1 --oneline
```

Both should show the latest commits.

---

## Done

Adult and mythic pets ship animated as part of HA-chores 0.7.4. The user should do a quick browser check (`cd HA-chores/chores/frontend && npm run dev`) to confirm the pets visibly blink in idle state.

If you want to extend to other stages (egg/baby/teen) later, the procedure is the same — add the stage keys to `SPRITES` in `animate_pets.py`, run `edit_image` per sprite, run the script, flip the JSX imports.
