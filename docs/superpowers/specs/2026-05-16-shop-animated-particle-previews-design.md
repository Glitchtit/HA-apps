# Animated particle previews in pet shop — design

**Date:** 2026-05-16
**Scope:** `HA-chores/chores/frontend`
**Related:** [`docs/superpowers/specs/2026-05-15-animated-webp-particles-design.md`](2026-05-15-animated-webp-particles-design.md) — sibling spec that produced the animated `.webp` particle assets shipped in HA-chores 0.7.3.

## Goal

Make the 12 particle thumbnails in the cosmetics shop play their animated loops, so users browsing the shop see the same blink/drift/cycle motion that appears on an equipped pet.

## Background

`HA-chores/chores/frontend/src/components/Pet.jsx` was flipped to `.webp` particle imports in commit `2154494` (HA-chores 0.7.3). However `PetShop.jsx` keeps its own duplicate `COSMETIC_IMG` map (lines 23–34) that still points at the old `.png` paths, so the shop tiles render the static first frame instead of the animated WebP. This is the gap.

## The change

Flip 12 import lines in `HA-chores/chores/frontend/src/components/PetShop.jsx`:

```diff
-import particleSparkle   from '../assets/pets/cosmetics/particles/particle_sparkle.png';
+import particleSparkle   from '../assets/pets/cosmetics/particles/particle_sparkle.webp';
… (and 11 more)
```

That's the entire scope. No other code, no CSS, no new assets. The `<img>` at PetShop.jsx:169 renders any browser-decodable source; animated WebPs autoplay in `<img>` by default; Vite imports `.webp` natively. All three behaviours are already proven in production via the equipped-pet rendering path.

## Files

- Modify: `HA-chores/chores/frontend/src/components/PetShop.jsx` (12 import lines)
- Modify: `HA-chores/chores/config.json` (`0.7.4` → `0.7.5`)
- Modify: `HA-chores/chores/CHANGELOG.md` (new `## 0.7.5` entry)

## Visual rendering

Shop tiles render the cosmetic image at `h-12 w-12 object-contain` (48×48 px CSS, scales further on hi-DPI). The animated WebP source is 256×256, so the downscale is benign. All 12 particle tiles will loop their existing animation:
- Drifting (snow, leaves, blossoms, bubbles, music) → continuous downward/upward drift
- Crossfade morph (hearts, stars, rainbow) → smooth color/position morphs
- Reveal/flicker (sparkle, fire, lightning, paws) → discrete frame-by-frame swaps

## Risks

Essentially none. Animated WebP rendering in `<img>` is already validated by the equipped-pet path. The shop tile size (48×48) is smaller than the equipped overlay, so any rendering issue would have surfaced there first.

## Out of scope

- **DRY-ing the duplicate `COSMETIC_IMG` map** between `Pet.jsx` and `PetShop.jsx`. This duplication is the *root cause* of the gap — both files import 40+ cosmetic assets and maintain identical maps. A natural follow-up is to extract `src/assets/pets/cosmetics/index.js` (or similar) that exports `COSMETIC_IMG` once and is imported by both consumers. Worth doing, but not as part of this fix — it touches more code and risks regressions in a release that should otherwise be a one-line fix.
- Other cosmetic types (hats, backgrounds, nameplates) are still PNGs — they don't have animated variants yet, so there's nothing to flip.
- Hi-DPI sourcing (a 2× or 3× WebP for retina shop displays). Not warranted at the 48×48 render size.
