# Animated Particle Previews in Shop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 12 particle thumbnails in the cosmetics shop play their animated loops, by flipping `PetShop.jsx`'s duplicate `COSMETIC_IMG` map from `.png` to `.webp` (the animated assets shipped in HA-chores 0.7.3 but only consumed by `Pet.jsx` so far).

**Architecture:** One file change. `PetShop.jsx:23–34` imports 12 particle assets through its own duplicate `COSMETIC_IMG` map (a known DRY problem; out of scope here). The shop's `<img>` tag at line 169 already accepts any browser-decodable source and animated WebPs autoplay automatically — flipping the import paths is the entire fix.

**Tech Stack:** Existing Vite + React frontend; no new dependencies; the animated `.webp` files are already on disk and committed.

**Reference:** Design at [`docs/superpowers/specs/2026-05-16-shop-animated-particle-previews-design.md`](../specs/2026-05-16-shop-animated-particle-previews-design.md).

---

## File map

**Modify:**
- `HA-chores/chores/frontend/src/components/PetShop.jsx` — 12 import lines, particle `*.png` → `*.webp`
- `HA-chores/chores/config.json` — version `0.7.4` → `0.7.5`
- `HA-chores/chores/CHANGELOG.md` — new `## 0.7.5` entry at top

**Unchanged:** All other PetShop.jsx code (the `<img>` tag at line 169 already renders animated WebPs); the 12 already-existing `*.webp` files; the `COSMETIC_IMG` map structure; backend; CSS.

---

## Task 1: Flip 12 particle imports in PetShop.jsx

**Files:**
- Modify: `HA-chores/chores/frontend/src/components/PetShop.jsx:23-34`

- [ ] **Step 1: Confirm the current import block**

Run:
```bash
sed -n '23,34p' /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/PetShop.jsx
```

Expected: 12 lines like `import particleSparkle   from '../assets/pets/cosmetics/particles/particle_sparkle.png';`. All 12 should end in `.png';`.

- [ ] **Step 2: Flip particle import extensions**

Use sed with `#` as delimiter to avoid escaping the `/`:

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
sed -i -E 's#/cosmetics/particles/(particle_[a-z]+)\.png#/cosmetics/particles/\1.webp#g' chores/frontend/src/components/PetShop.jsx
```

- [ ] **Step 3: Verify all 12 flipped, nothing else changed**

```bash
sed -n '23,34p' /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/PetShop.jsx
```

Expected: all 12 lines now end in `.webp';`.

Confirm no `.png` particle imports remain anywhere in the file:
```bash
grep -nE "particle_[a-z]+\.png" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/PetShop.jsx || echo "(none — clean)"
```

Expected: `(none — clean)`.

Confirm hat/background/nameplate imports are still `.png` (out of scope):
```bash
grep -cE "(hats|backgrounds|nameplates)/[a-z_]+\.png" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/components/PetShop.jsx
```

Expected: a positive number (the hat/bg/nameplate imports still exist; they were untouched by the regex anchored to `/cosmetics/particles/`).

- [ ] **Step 4: Verify the .webp files exist on disk**

```bash
ls /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/assets/pets/cosmetics/particles/*.webp | wc -l
```

Expected: `12`. If less, the build below will fail with a missing-import error.

- [ ] **Step 5: Production build (verify the import flip resolves)**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in N.NNs`, no missing-import errors. If build fails, the most likely cause is one of the .webp files isn't where expected — check Step 4's output.

- [ ] **Step 6: Verify shop bundles all 12 .webp particles**

```bash
ls /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/dist/assets/ | grep -E '^particle_.*\.webp$' | wc -l
```

Expected: `12` (same as the equipped-pet path, which already imports the same set).

- [ ] **Step 7: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/src/components/PetShop.jsx
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Use animated WebP particles in pet shop previews"
```

---

## Task 2: Version bump + changelog

**Files:**
- Modify: `HA-chores/chores/config.json:3`
- Modify: `HA-chores/chores/CHANGELOG.md`

- [ ] **Step 1: Bump version 0.7.4 → 0.7.5**

Edit `HA-chores/chores/config.json` line 3:

```diff
-  "version": "0.7.4",
+  "version": "0.7.5",
```

- [ ] **Step 2: Add changelog entry**

Prepend to `HA-chores/chores/CHANGELOG.md` (above the existing `## 0.7.4` block):

```markdown
## 0.7.5
- **Pet shop previews now animate.** The 12 particle thumbnails in the cosmetics shop play their full animated loops (blink/drift/cycle) — same WebPs as the equipped-pet overlay. Previously the shop kept its own duplicate import map that still pointed at the static .png variants from before 0.7.3.
- Known follow-up (not in this release): `PetShop.jsx` and `Pet.jsx` maintain parallel `COSMETIC_IMG` maps for 40+ cosmetic assets. Extracting a shared `cosmeticImports.js` module would prevent gaps like this one in the future.

```

- [ ] **Step 3: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/config.json chores/CHANGELOG.md
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit -m "Bump HA-chores to 0.7.5: animated particle previews in pet shop"
```

---

## Task 3: Push HA-chores + bump umbrella

- [ ] **Step 1: Push HA-chores submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git push origin main
```

Expected: `main -> main` push success.

- [ ] **Step 2: Commit submodule pointer in umbrella**

```bash
cd /home/glitch/GIT/HA-apps
git -c user.email=74153343+Glitchtit@users.noreply.github.com commit HA-chores -m "Bump HA-chores to 0.7.5: animated particle previews in pet shop"
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

Both should show the latest commit.

---

## Done

The cosmetics shop now shows animated particle previews. Quick browser sanity check (`cd HA-chores/chores/frontend && npm run dev`) — open the pet shop, scroll to the Particles section, confirm the 12 tiles loop their animations.
