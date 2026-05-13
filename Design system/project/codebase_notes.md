# Codebase notes — GlitchyRee HA-apps

Distilled from reading the four SPAs. Useful context for anyone hand-building against this system.

## Umbrella repo: `Glitchtit/HA-apps`
- Submodule umbrella. No top-level build.
- Each add-on is a separate repo pulled in by `.gitmodules`.
- Supervisor repository.json maps add-on folders.

## `HA-storage/storage/`  —  system of record
- FastAPI + SQLite. nginx on `8099`, FastAPI on `8100`. DB at `/data/storage.db`.
- Frontend: React, 11 tabs (`Dashboard, Products, Stock, Recipes, Shopping, Units, Locations, Groups, Barcodes, Optimize, Settings`).
- Header pattern: `bg-gray-900/90 backdrop-blur-md border-b border-gray-800`.
- Tab bar pattern: horizontal scroll, underline-highlight for active. `border-b-2 border-emerald-500 text-emerald-400` when active.
- Loading: spinner + `text-gray-500` helper text.

## `HA-stock/stock/`  —  pantry
- Entire UI is `src/App.jsx` (~2200 lines).
- Touch gestures: swipe → consume/add, long-press → drag for directional action (incl. `↓ Open`).
- Barcode scanner: full-screen, html5-qrcode, flip button, continuous mode with discover queue.
- Trapezoidal location tabs (`clip-path: polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)`).
- Toast system top-right; `type ∈ {error, success, info, undo}`; undo type has a shrinking progress bar.
- Product rows have a 48x48 rounded thumbnail with 🥫 fallback emoji.

## `HA-recipes/recipes/`  —  recipe scraper
- Mobile-first grid of recipe cards (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`).
- Recipe card: aspect-video image + 2-line clamped title + "N annosta" serving count.
- Recipe detail: full-screen overlay, `max-w-md`, `rounded-2xl`, scrolling ingredient list with red/amber/green tint rows.
- URL composer at top: sticky header, input + "Hae" (Fetch) button, emerald primary.
- Finnish copy: `Ainekset`, `Ohjeet`, `Lähde`, `Lisää ostoslistalle`, `Poista resepti`, `Peruuta`.

## `HA-chores/chores/`  —  gamified chores + pet
- Modular: `Dashboard, ChoreList, MyChores, Leaderboard, Achievements, Settings, HouseholdOverview, Pet, GameEffects`.
- Dual-mode nav: *personal* vs *household*. Different tab sets.
- 80px sidebar rail at `lg:` — icon-only column. Bottom bar on mobile.
- Header: emoji logo + title, right-side person picker with "you" badge when auto-detected.
- Heavy animation CSS file (`index.css` has 380+ lines of keyframes).
- Pet: single PNG sprite per mood; CSS transforms for breathe/bounce/droop/petted. `image-rendering: pixelated`.
- Toast stack top-right, `animate-slide-up` on enter.

## Universal patterns across all four
1. `bg-gray-900` / `text-gray-100` root
2. Ingress-path meta tag consumed at runtime for every API call + asset
3. Health check with 60-retry polling before UI shows
4. Optimistic mutations + background sync (Stock is the most elaborate case)
5. `rounded-xl` buttons, `rounded-2xl` overlays, `shadow-lg`+ on raised surfaces
6. Semantic color system: emerald=success, amber=warning, red=danger
7. Emoji glyphs for navigation/identity everywhere
8. No design tokens in `tailwind.config.js` — raw utility classes only
