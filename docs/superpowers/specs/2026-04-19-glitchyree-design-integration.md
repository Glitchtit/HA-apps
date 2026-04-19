# GlitchyRee Design System Integration — Design Spec

**Date:** 2026-04-19
**Scope:** All four HA-apps submodule frontends (Storage, Stock, Recipes, Chores)
**Source:** `/home/glitch/Downloads/GlitchyRee Design System-handoff.zip` → extracted at `/tmp/glitchyree-design/glitchyree-design-system/`

## Goal

Integrate the GlitchyRee design system into all four submodule frontends in a single batch. The integration ships CSS tokens plus a targeted accent re-theme so the brand (International Orange + Cobalt Blue) lands immediately across the ecosystem, without reworking layouts, components, or interaction patterns.

## Decisions locked in during brainstorming

1. **Scope:** tokens + accent re-theme (not token-only, not a full port).
2. **Cadence:** all four submodules changed and shipped in one batch.
3. **Fonts:** self-hosted under each frontend's `public/fonts/` — no external CDN at runtime.

## Accent role model

The design system uses three accent roles, and the existing apps conflate the first and third. The re-theme splits them:

| Role | Color | Usage |
|------|-------|-------|
| Primary CTA | Cobalt Blue (`--brand-cobalt`) | "Commit" buttons: Save, Add, Fetch |
| Brand / Active | International Orange (`--brand-orange`) | Active tab, XP bar, "you" badge, undo toast, brand-identity highlights |
| Semantic | Emerald / Amber / Red | Success / warning / danger — unchanged |

## Architecture

### Tokens live per-submodule (copied, not shared)

`colors_and_type.css` is copied verbatim into each frontend as `src/styles/design-tokens.css` and imported at the top of `src/index.css`. This mirrors the existing "scraper package duplicated on purpose" precedent in `CLAUDE.md`. No npm workspace, no cross-submodule imports, no new shared infra.

### Tailwind bridges the tokens

Each `tailwind.config.js` gains, via `theme.extend`:

- `colors.brand.{orange,cobalt}` with 100/300/400/600 scales mapped to the CSS vars.
- `colors.semantic.{success,warning,danger,info}` mapped to existing semantic vars.
- `fontFamily.{display,body,mono}` pointing to the CSS vars. `fontFamily.sans` is also overridden to `var(--font-body)` so Tailwind's default sans-serif becomes Inter — this makes the body-text font swap global without requiring per-component class changes.
- `borderRadius.xl` / `borderRadius.2xl` aligned to `--r-lg` / `--r-xl`.

The token-to-Tailwind mapping uses `rgb(from var(--token) r g b / <alpha-value>)` syntax so Tailwind opacity modifiers (`bg-brand-orange/20`) keep working.

Existing classes like `bg-gray-900`, `text-gray-100`, `bg-emerald-500` are not touched — they keep working. New or re-themed code reaches for `bg-brand-*`, `bg-semantic-*`, `font-display`.

### Fonts self-hosted in `public/fonts/`

11 woff2 files, subset to weights the tokens use:

- Space Grotesk 400/500/600/700
- Inter 400/500/600/700
- JetBrains Mono 400/500/700

Downloaded from Google Fonts' static `woff2` endpoints once, then copied byte-identical into all 4 frontends' `public/fonts/`. The `@import url(...)` line in the source `colors_and_type.css` is **removed** and replaced with `@font-face` blocks pointing at `/fonts/*.woff2` (ingress-path-safe — browsers resolve relative to the document origin). The system font stack remains as fallback so failed loads degrade cleanly.

### Files added per submodule (identical structure)

- `frontend/src/styles/design-tokens.css` — tokens, type classes, `@font-face` blocks
- `frontend/public/fonts/*.woff2` — 11 font files

### Files modified per submodule

- `frontend/tailwind.config.js` — `theme.extend` populated
- `frontend/src/index.css` — add `@import './styles/design-tokens.css';` at top
- `frontend/src/App.jsx` (+ `frontend/src/components/*` for chores/storage) — targeted accent swaps, see per-app section
- `config.json` — version bump
- `CHANGELOG.md` — new entry

## Per-submodule accent re-theme

### HA-storage (`App.jsx`, ~11 tabs)

- Active tab underline + label: `border-emerald-500 text-emerald-400` → `border-brand-orange text-brand-orange`
- Header "＋ New product" button: `bg-emerald-600` → `bg-brand-cobalt hover:bg-brand-cobalt-600`
- Health dot (API green): stays semantic success
- Stat card left-border accents: keep per-card tone (success/warning/danger); any "brand" accent card switches to orange
- App header title gets `font-display` class (Space Grotesk)

### HA-grocy-stock (`App.jsx`)

- Trapezoidal location tabs active state: emerald → orange
- "＋ Add product" primary button: emerald → cobalt
- "Keep in stock" action button: **stays emerald** (semantic success action, not a CTA)
- Undo toast border + shrinking progress bar: existing color → orange (brand identity for the undo affordance)
- Consume / +1 buttons: stay semantic (red for consume, emerald for +1)

### HA-grocy-recipes (`App.jsx`)

- Sticky "Hae" (Fetch) button: emerald → cobalt
- "Lisää ostoslistalle" (Add to shopping): emerald → cobalt
- Recipe card hover/selected state: emerald → orange
- Ingredient row tints (red/amber/green for match strength): stay semantic

### HA-chores (`App.jsx` + `components/`)

- Bottom tab bar / sidebar rail active state: emerald → orange
- XP bar fill: single color → `linear-gradient(90deg, var(--brand-orange), var(--xp-gold))`
- "you" badge text: emerald → orange
- Rank-1 leaderboard glow: keeps gold
- Pet surface gradient: current gradient → `linear-gradient(var(--brand-cobalt), var(--brand-orange))`
- Achievement badges, streak flames: stay semantic
- All keyframe animations in `index.css`: untouched

## Typography pass (light)

- App header title (`🗄️ Storage`, `🧹 Chores`, etc.): add `font-display` class so Space Grotesk lands on the brand.
- Body text: stays on Inter via the default sans-serif (Inter becomes the default through the Tailwind mapping).
- H1/H2 in dashboards and overlays: pick up Space Grotesk via `font-display` on those headings only.
- No blanket migration to `.ds-h1` / `.ds-p` utility classes — too invasive for this pass.

## Out of scope for this pass

- Reworking layouts, spacing, or component structures
- Migrating from raw Tailwind classes to the `.ds-*` utility classes
- Changing animations, touch gestures, or interaction patterns
- Replacing emoji iconography
- Light-mode support (design system is dark-mode-only by intent)

## Release mechanics

### Version bumps (patch-level — styling only, no API/behavior change)

| Submodule | From | To |
|-----------|------|----|
| Storage | 0.3.30 | 0.3.31 |
| Stock | 1.16.20 | 1.16.21 |
| Recipes | 1.5.24 | 1.5.25 |
| Chores | 0.3.23 | 0.3.24 |

### Changelog format (per CLAUDE.md)

Each submodule's `CHANGELOG.md` gets a new entry at the top with a plain `## X.Y.Z` header (no brackets, no dates — Supervisor parsing depends on this):

```
## 0.3.31
- Apply GlitchyRee design system: brand orange accents, cobalt primary actions, self-hosted Space Grotesk/Inter/JetBrains Mono
- Add CSS design tokens at src/styles/design-tokens.css
```

### Commit & push order

1. In each submodule repo: commit frontend changes + version bump + changelog entry, then push to the submodule's `main`.
2. In the root `HA-apps` repo: stage the 4 updated submodule pointers, commit with a descriptive message, **do not push root until user confirms**.

### Build verification (before each submodule commit)

- `cd <submodule>/frontend && npm run build`
- Do not commit if build fails. No frontend test suites to run.

### `.gitmodules`

Untouched (stays HTTPS per CLAUDE.md — Supervisor compatibility).

### Rollback plan

Each submodule's change is self-contained in one commit. Rollback is `git revert <sha>` in that submodule + another root pointer bump. No database or configuration migration is involved.

## Risks & mitigations

- **Risk:** Font files bloat bundles. **Mitigation:** Subset to only the weights the tokens reference (11 files, ~300KB total per frontend).
- **Risk:** Tailwind's `rgb(from ...)` CSS Color 5 syntax needs modern browsers. **Mitigation:** Home Assistant frontend targets modern browsers; this syntax is supported in Chrome 111+, Safari 16.4+, Firefox 128+. If a problem surfaces, fall back to explicit hex in the Tailwind config (cheap change).
- **Risk:** Accent swap mis-buckets a button (e.g., flipping a "Keep in stock" CTA that should stay semantic). **Mitigation:** Role model is explicit in this spec; implementation plan will enumerate each swap site before editing.
- **Risk:** Ingress path breaks font URLs. **Mitigation:** `/fonts/*.woff2` resolves against the document origin, which is ingress-aware by construction; no absolute hosts.
