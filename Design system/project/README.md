# GlitchyRee Design System

> Design language and UI kit for **GlitchyRee's Home Assistant add‑ons** — a self‑hosted household ecosystem that lives inside the Home Assistant sidebar.

GlitchyRee (a.k.a. *Glitchtit*) ships four small, opinionated add‑ons that plug into Home Assistant. Each is a separate React SPA proxied through nginx under ingress. They share a vocabulary — dark surfaces, rounded cards, emoji glyphs for navigation, semantic color signals — but no formal design system has ever been written down. This project extracts and formalises that vocabulary, re‑themes it around **International Orange + Cobalt Blue**, and packages it for designers and agents to build against.

---

## The products

| Add‑on | Role | Frontend |
|---|---|---|
| **🗄️ Storage** | System of record. FastAPI + SQLite. Owns products, stock, recipes, shopping lists. | Desktop‑leaning admin tabs. |
| **📦 Stock** | Household pantry. Barcode scanning, one‑tap consume, swipe gestures. | Mobile‑first, thumb‑zone optimised. |
| **🍽️ Recipe** | AI recipe scraper. Paste a URL, get ingredients matched against Storage. | Mobile‑first, grid of recipe cards. |
| **🧹 Chores** | Gamified household chore tracker. XP, levels, badges, a virtual axolotl pet. | Mobile + sidebar rail, very animated. |

All four apps talk only to Storage over REST; they are *ingress‑aware* (a meta tag injects the ingress path at runtime) so every asset + API call is relative.

See `codebase_notes.md` for structural notes pulled from the repos.

---

## Sources

- **Repo (umbrella):** `Glitchtit/HA-apps` — Git‑submodule release umbrella.
  - Root: <https://github.com/Glitchtit/HA-apps>
  - `HA-storage/storage/frontend/` — Storage admin UI (React + Tailwind).
  - `HA-stock/stock/frontend/` — Stock dashboard (React + Tailwind + html5‑qrcode).
  - `HA-recipes/recipes/frontend/` — Recipe scraper UI (React + Tailwind + axios).
  - `HA-chores/chores/frontend/` — Chores + Pet (React + Tailwind, heavy CSS animation).
- All frontends use **Tailwind 3.4** with the default theme (no `extend:` tokens). Every colour in the source code is a raw Tailwind class — we've promoted the ones that recur to named tokens in `colors_and_type.css`.
- No dedicated brand guidelines exist in the repo. Icon choices are emoji, chosen per‑tab in the `App.jsx` files.

> ⚠️ The user requested a **re‑themed** palette: International Orange + Cobalt Blue. The source apps actually lean on emerald/amber/red. We treat emerald/amber/red as **semantic** (success / warning / danger) and introduce orange & cobalt as the **brand** layer. See *Colors* cards.

---

## Index

```
/
├── README.md                 ← you are here
├── SKILL.md                  ← SKILL.md for use as an Agent Skill
├── codebase_notes.md         ← deeper structural notes on the source repos
├── colors_and_type.css       ← all tokens (import this first)
│
├── fonts/                    ← (none bundled; system stack + Google Fonts CDN)
├── assets/                   ← logos, iconography notes
│
├── preview/                  ← design-system review cards (registered below)
│   ├── type-*.html
│   ├── colors-*.html
│   ├── spacing-*.html
│   ├── components-*.html
│   └── brand-*.html
│
└── ui_kits/
    ├── storage/              ← admin panel — tabs + tables
    ├── stock/                ← mobile pantry — swipe rows, barcode scan
    ├── recipes/              ← recipe grid + detail overlay
    └── chores/               ← gamified chores + pet + XP
```

---

## Content Fundamentals

The voice of the product is **casual, terse, affectionate, and bilingual**. It never speaks in marketing copy. Tone cues pulled directly from the code:

### Voice
- **First‑person plural / second‑person.** The Chores app says "My Chores", "Today's Chores", "Keep in stock". Nobody says "you" at the user directly; things are just labelled.
- **Imperatives win.** `Keep in stock`, `Consume all`, `Open 1`, `Scan a barcode`, `Poista resepti` (Delete recipe), `Lisää ostoslistalle` (Add to shopping list). Button copy is verbs, no trailing punctuation, no hedging.
- **Finnish‑first for recipes + products.** Recipe UI labels are written in Finnish (`Ainekset`, `Ohjeet`, `Haetaan…`). Other apps mix English and Finnish freely. Don't translate either away.
- **Diagnostic honesty.** Error states are blunt: `⚠️ Storage ei tavoitettavissa` ("Storage not reachable"), `Could not connect to Chores API`, `Stock list may be outdated — pull down to refresh.`
- **Numbers are factual.** `2 in stock (1 opened)`, `6 queued for lookup`, `attempt 12`. No decoration.

### Casing
- **Sentence case** for buttons, labels, headers. Never ALL‑CAPS (except the occasional eyebrow `AINEKSET` tracking‑expanded).
- **Title Case** is rare — used only for product/page names (`My Chores`, `Household Overview`).
- **Lowercase** for inline metadata: `you`, `kept`, `active`.

### Emoji
- **Emoji are iconography**, not decoration. Every tab, every app header, most empty states use a single emoji as its primary glyph:
  - 🗄️ Storage · 📦 Stock · 🍽️ Recipe · 🧹 Chores · 🐾 Pet · 🏆 Leaderboard · 🎖️ Achievements · 🏠 Dashboard · 📋 Chores · ✅ My · ⚙️ Settings · 🛒 Shopping · 📏 Units · 📍 Locations · 🏷️ Groups · 🥫 (generic product fallback) · 📖 (empty recipes) · ⚠️ (error) · ❌ (fail) · ✕ (close).
- **Emoji also signal status** on toasts: `✅ success`, `⚠️ warning`, `❌ error`, `💡 tip`, `🔄 retry`.
- Allow actual emoji in user data (pets, chores are often named with emoji).

### Vibe
- **Self‑hosted, tinkery, playful.** The Chores app has an animated pixel axolotl pet that droops when chores go undone. Confetti fires on chore completion. The Storage admin tool is utilitarian but still uses emoji on every tab. This is Home Assistant energy: it's for people who enjoy their dashboards.
- **No marketing copy. No upsell. No onboarding slop.** If you're about to write "Welcome!" or "Let's get started", stop.

### Examples
```
Empty state:     📖  Ei reseptejä vielä. Liitä reseptin URL ylhäällä aloittaaksesi!
Error:           ⚠️ Yhteys katkesi — lataa sivu uudelleen
Success toast:   Resepti "Lohikeitto" tallennettu!
Button:          Lisää ostoslistalle         (not "Add to Shopping List")
Button:          Keep in stock               (not "Save to Favorites")
Button:          Consume all                 (not "Remove All Items")
Destructive:     Do not keep                 (toggle-back of "Keep in stock")
Nav label:       🧹  Chores
```

---

## Visual Foundations

### Colors
- **Dark‑first.** The root background is `#111827` (Tailwind `gray-900`) across every app. There is no light mode. All four `<body>` tags set `bg-gray-900 text-gray-100`.
- **Surface ladder.** `bg-0` (#0A0D14, only used as a letterbox) → `bg-1` (#111827, app root) → `bg-2` (#1F2937, cards) → `bg-3` (#374151, hover / chips) → `bg-4` (#4B5563, divider emphasis). Stay on this ladder.
- **Brand (re‑themed).** International Orange `#FF4F00` is the attention / accent. Cobalt Blue `#0047AB` is the primary affirmative action. Use orange sparingly — a single pill, a nav highlight, the logo mark. Cobalt is the default button.
- **Semantics (source apps).** Emerald `#10B981` = success/keep/+1 · Amber `#F59E0B` = warning/opened/XP · Red `#EF4444` = danger/consume/−1 · Gold `#FBBF24` = XP and level‑ups (Chores only).
- **Tinted status cells.** A recurring pattern: `bg-emerald-900/40 text-emerald-300` for positive cells, `bg-amber-900/40 text-amber-300` for pending, `bg-red-900/40 text-red-300` for missing. Use the `/40` opacity and the `-300` text together — it's the only consistent tint system in the code.

### Type
- **Family.** Source apps use the system stack. We've introduced **Space Grotesk** (display) + **Inter** (body) + **JetBrains Mono** (code) from Google Fonts as substitutes — *this is a substitution, flagged for user review*. The original apps have no custom webfont; if you need to ship 1:1 fidelity, strip back to `system-ui`.
- **Weights.** 400 regular, 500 medium, 600 semibold, 700 bold. Most headers are 700; body runs at 400; button labels 600.
- **Tracking.** Tight on displays (−0.015 to −0.02em). Body is natural. **Eyebrows** (section labels like `AINEKSET`, `OHJEET`) use `uppercase` + `tracking-wide` + `font-bold` at 14px.

### Backgrounds / imagery
- **No hand‑drawn illustrations.** No patterns. No gradients on surfaces. The source apps are basically flat dark panels.
- **Only gradient in the wild:** radial/linear emerald glow rings on XP bars in Chores. Treated as *motion/FX*, not chrome.
- **Full‑bleed images** appear only for recipe hero images (`aspect-video object-cover`) and pet sprites (`image-rendering: pixelated`).

### Animation
- **Chores is heavily animated** (10+ keyframe effects: xp-fill, badge-pop, streak-glow, confetti, star-spin, level-up, balloon-pop, speed-trail). See `chores/frontend/src/index.css`. This is fine for celebration moments — don't scatter it across the rest of the system.
- **Everything else is restrained.** `overlay-fade-in` (0.2s), `overlay-card-slide-up` (0.25s cubic‑bezier). `transition-colors` on every button. `active:scale-[0.98]` on cards. `animate-spin` on loaders.
- **Easing.** Default `ease-out` / `cubic-bezier(.25,.46,.45,.94)` for restraint; `cubic-bezier(0.175, 0.885, 0.32, 1.275)` (bounce) for celebration entrances only.

### Hover / press states
- **Hover:** always a **background tone shift**, never opacity change. `bg-emerald-500 → hover:bg-emerald-600 → active:bg-emerald-700` is the canonical pattern. For neutral surfaces: `hover:bg-gray-700` on `bg-gray-800`.
- **Active/press:** deeper tone (`-700` variant) or `active:scale-[0.98]` on card buttons. Buttons don't shrink in‑place — whole card shrinks.
- **Disabled:** `disabled:opacity-40`. Keep the colour.
- **Focus:** `focus:outline-none focus:ring-2 focus:ring-emerald-500` on inputs. Rings, not outlines.

### Borders & dividers
- **1px `border-gray-800`** between sections (header bottom, nav separators). `border-gray-700` for lighter surface‑on‑surface borders.
- **No outlined buttons.** Buttons are filled or ghost‑transparent.
- **Cards have no border by default** — they sit on top of `bg-gray-900` via `bg-gray-800 rounded-xl` (+ `shadow-sm` or `shadow-lg`). Rings appear only on hover/focus.

### Shadows
- `shadow-sm` on grouped rows.
- `shadow-lg` on toasts, cards.
- `shadow-2xl` on overlay dialogs.
- No inner shadows.
- **Glow shadows** only on XP/badge animations. See `animate-streak-glow`, `animate-golden-sparkle` keyframes.

### Transparency + blur
- **Overlay backdrop:** `bg-black/60 backdrop-blur-sm` or `bg-black/70 backdrop-blur-sm`. Always.
- **Sticky header:** `bg-gray-900/90 backdrop-blur-md`. Always with bottom border.
- **Tinted status cells:** `/40` opacity on `-900` colour (see Colors above).
- No frosted‑glass cards. No transparent surfaces apart from the three patterns above.

### Corner radii
- `rounded-lg` (8px) — compact chips, pills, input fields.
- `rounded-xl` (12px) — most buttons, grouped cards.
- `rounded-2xl` (16px) — overlays, hero cards, primary action buttons.
- `rounded-full` — avatars, dots, status pills.

### Cards
- `bg-gray-800 rounded-xl shadow-sm` — default. `overflow-hidden` when they contain hero images.
- Hero/grouped cards: add `rounded-2xl shadow-lg`.
- Group accordions use a tinted header: `bg-emerald-900/40 text-emerald-400` — re‑themed here as cobalt/orange variants.
- Status rows have a thumbnail (`w-12 h-12 rounded-lg`) + title + secondary line + trailing icon. This is *the* universal row.

### Layout rules
- **Mobile‑first.** Stock + Recipe + Chores are designed for phones. Breakpoints: `sm:` 640 (two-up grid), `lg:` 1024 (sidebar rail).
- **Fixed bottom nav on mobile → sidebar rail on lg.** Chores does this: a bottom tab bar transforms into a 80px vertical rail at `lg:`.
- **Safe-area padding.** Chores uses `paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))'`. Always reserve space for mobile nav + home indicator.
- **Max widths on overlays.** `max-w-sm` (384) for action sheets, `max-w-md` (448) for detail dialogs, `max-w-xs` (320) for confirms.

---

## Iconography

- **Primary iconography is emoji.** See the full inventory in *Content Fundamentals → Emoji*. This is deliberate: emoji give every app a playful identity without shipping an icon font, and they auto‑render on every HA user's system.
- **No icon font is bundled.** Zero `@icon`, `react-icons`, `lucide`, `heroicons` imports anywhere in the four codebases. The only `svg` elements in the source are the inline spinner circles for loading states.
- **Svg is used for:**
  - inline loading spinners (`<svg class="animate-spin">`);
  - no other purpose in the original apps.
- **Pet sprites** (Chores) are `.png` at `image-rendering: pixelated`. Six axolotl frames — happy, sad, petted, etc — shipped in `chores/frontend/public/` (see `GENERATE_PET_ASSETS.md` in the repo).
- **Unicode as icons.** `▲ ▼ ← → ↓ ▾ ✕ ✅ ❌` appear inline. Treat these as typographic glyphs (same color as surrounding text), not icons.
- **For this design system** we add **Lucide** (CDN) as a general‑purpose fallback when emoji aren't appropriate (e.g. toolbar icons in UI kits that need geometric clarity). Lucide's stroke weight (1.5) matches the low‑chrome feel of the apps. This is a substitution — flagged.

### When to use what
| Need | Use |
|---|---|
| App / section identity | Emoji (🗄️ 📦 🍽️ 🧹 🐾) |
| Tab label | Emoji + label ("🏠 Dashboard") |
| Status indicator on a list cell | Tinted bg + emoji (✅ ⚠️ ❌) |
| Inline arrow / chevron / close | Unicode glyph (▾ ✕ ↓ →) |
| Toolbar action (edit/sort/filter) | Lucide (CDN) |
| Product / recipe thumbnail fallback | Emoji (🥫 🍽️) inside bg‑gray‑700 square |

---

## UI kits

Each kit is a standalone hi-fi prototype of one product, rooted in the real component patterns lifted from the repo.

- `ui_kits/stock/index.html` — the pantry dashboard. Swipeable rows, location tabs (trapezoid), detail overlay, toast stack.
- `ui_kits/chores/index.html` — the chores dashboard. Bottom nav → sidebar rail, chore list, XP bar, pet.
- `ui_kits/recipes/index.html` — recipe grid + paste‑URL composer + detail overlay.
- `ui_kits/storage/index.html` — admin tabs + dashboard table.
- `ui_kits/lists/index.html` — Goblin-Tools-style folders→lists→items, spiciness slider, AI actions row, compile dialog, AI job toast.

Each kit has its own `README.md` and a small set of JSX components. None of them are production code — they're visual fidelity at the cost of wiring.
