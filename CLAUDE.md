# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

`HA-apps` is a **release umbrella**, not an application. It aggregates independent Home Assistant add-ons via Git submodules (`.gitmodules`, `repository.json`). There is no top-level build, test, or lint — always `cd` into the touched submodule.

Clone with submodules: `git clone --recurse-submodules …` or `git submodule update --init --recursive`. Update to latest: `git submodule update --remote --merge`.

Submodules:
- `HA-storage/storage` — FastAPI + SQLite, nginx on `8099`, FastAPI on `8100`, DB at `/data/storage.db`. **System of record.** Ships add-on **and** HACS integration side-by-side: the integration lives at the submodule root in `HA-storage/custom_components/ha_storage/` (sensors, todo, services), parallel to `HA-storage/storage/`.
- `grocy_scraper/` — Python scraper shipped as both a Supervisor add-on (`grocy_scraper_addon/`) and a HA custom integration (`custom_components/grocy_scraper/`).
- `HA-grocy-stock/grocy_stock` — React SPA behind nginx.
- `HA-grocy-recipes/grocy_recipes` — React SPA + Python backend (Gemini/Claude/Ollama) behind nginx.
- `HA-chores/chores` — FastAPI + React (`ingress_port: 8099`). Like `grocy_scraper/`, this submodule ships add-on **and** integration side-by-side: the integration lives at the submodule root in `HA-chores/custom_components/ha_chores/` (sensors, todo, calendar), parallel to `HA-chores/chores/`.
- `HA-lists/lists` — FastAPI + React (`ingress_port: 8099`). Goblin-Tools-style task manager: Folder → List → Item → Subtask hierarchy, spiciness-based AI breakdown (planned), household assignment. Ships add-on **and** HACS integration at `HA-lists/custom_components/ha_lists/`.

Top-level folders that are **not** shipped: `Design system/` holds cross-frontend design tokens/mocks; `docs/` holds workflow notes.

## Commands

Run inside the relevant submodule. No linter/formatter is configured anywhere.

```bash
# grocy_scraper (Python)
cd grocy_scraper && python -m pytest tests/ -v
cd grocy_scraper && python -m pytest tests/test_main.py::TestAiOptimize::test_optimize_updates_location -v
# Tests only import the top-level `grocy_scraper/grocy_scraper/` copy — drift between
# it and `grocy_scraper_addon/grocy_scraper/` will NOT surface here. Inspect both on change.

# HA-storage backend
cd HA-storage/storage && python -m pytest app/tests/ -v

# HA-storage frontend
cd HA-storage/storage/frontend && npm install && npm run dev    # or: npm run build

# HA-grocy-stock frontend (no tests)
cd HA-grocy-stock/grocy_stock/frontend && npm install && npm run dev

# HA-grocy-recipes frontend (no tests)
cd HA-grocy-recipes/grocy_recipes/frontend && npm install && npm run dev

# HA-chores
cd HA-chores/chores/app && python -m pytest tests/ -v
cd HA-chores/chores/frontend && npm install && npm run dev

# HA-lists
cd HA-lists/lists/app && python -m pytest tests/ -v
cd HA-lists/lists/frontend && npm install && npm run dev
```

## Architecture (big picture)

- **Storage is the canonical data model.** Products, stock, recipes, shopping, config, files, and AI optimize orchestration all live behind its REST API. Scraper/Stock/Recipe talk only to Storage (never to each other). Optimize runs as background `/api/ai/optimize` tasks with single-flight execution and pollable status.
- **Scraper ships twice.** The Supervisor add-on runs the periodic scraper + ingress web server; the HA integration exposes config flow, sidebar UI, and WebSocket handlers. Both paths write through `StorageClient`.
- **Recipe backend** proxies `/api/storage/*`, `/api/scraper/*`, `/api/backend/*`, `/api/storage-files/*` via nginx; exposes provider-aware `/api/config` readiness; scrapes recipe pages; matches ingredients against Storage.
- **Startup order is loose.** Storage comes up first; scraper and recipe backend block on Storage health at startup; Stock/Recipe frontends poll Storage health with bounded retry before enabling UI flows. Do not assume any service is ready — add retry.
- **All add-ons are ingress-aware.** API keys stay server-side, nginx injects the ingress path into the frontend, and browser code must call proxied relative API routes — never hard-coded hosts.
- **Finnish-first product data.** Storage product names are stored in Finnish. User-facing UI and recipe input can be any language; matching happens after translation and resolves to the Finnish canonical product.

## Design system

`Design system/project/` contains the **GlitchyRee Design System** — read `README.md` and `codebase_notes.md` there before any non-trivial UI work. Per-app hi-fi prototypes in `ui_kits/{storage,stock,recipes,chores}/`; CSS tokens in `colors_and_type.css`.

Key rules for all four frontends:
- **Dark-first, no light mode.** Root `bg-gray-900`. Surface ladder: `bg-gray-900` → `bg-gray-800` (cards) → `bg-gray-700` (hover). Overlays: `bg-black/60 backdrop-blur-sm`. Sticky headers: `bg-gray-900/90 backdrop-blur-md border-b border-gray-800`.
- **Brand palette (re-themed).** International Orange `#FF4F00` for accent; Cobalt Blue `#0047AB` for primary actions. These replace the emerald accent in existing code.
- **Semantic palette (unchanged).** Emerald = success, Amber = warning/XP, Red = danger. Tinted cells: `bg-{color}-900/40 text-{color}-300`.
- **Emoji is the icon system.** No icon font in production. Tabs/sections use emoji (🗄️ 📦 🍽️ 🧹). Chevrons/close use Unicode glyphs (`▾ ✕`).
- **Radii.** `rounded-lg` chips/inputs, `rounded-xl` buttons/cards, `rounded-2xl` overlays, `rounded-full` avatars.
- **No Tailwind custom tokens.** Raw utility classes only — no `tailwind.config.js` extension.
- **Copy voice.** Sentence case, imperative buttons, Finnish/English mixed, no marketing copy.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, **STOP** and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff between main and your changes when relevant
- Ask yourself: "Would a staff engineer accept this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "Is there a more elegant way?"
- Prefer fewer, well-factored changes over scattered fixes
- Skip this for simple, obvious fixes — don't over-engineer
- If it feels hacky: "Knowing everything I know, does the design solution?"

### 6. Autonomous Bug Fixing
- When a bug report: just fix it. Don't hand-hold
- Point at logs, errors, failing tests — then resolve them
- Go fix failing CI tests without being told how

## Task Management

### 1. Plan First
- Write plan to tasks/todo.md with checkable items
- Verify plan before starting implementation steps, not just building

### 2. Track Progress
- Mark items complete as you go
- High-level summary at each step (TLDR)
- Explain changes: high-level summary + each subsection

### 3. Document Results
- Add review section to tasks/todo.md (changes made + verification)
- Capture lessons: update tasks/lessons.md with any corrections

## Core Principles

- **Simplicity First.** Make every change as simple as possible. Impact minimal code.
- **No Laziness.** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact.** Avoid introducing bugs. Changes should only touch what's necessary.

## Conventions that bite

- **Each submodule has its own `.github/copilot-instructions.md`** with app-specific details. Read it before working in that submodule; the root file intentionally does not duplicate. `HA-grocy-stock/` additionally ships an `AGENTS.md` at its submodule root — read that too when touching Stock.
- **Submodule workflow:** commit and push inside the submodule *first*, then commit the updated pointer in the root repo. `.gitmodules` must stay on HTTPS for Supervisor compatibility even if local push remotes use SSH.
- **Every user-facing change requires a version bump and changelog entry** in the touched submodule. Bump + rebuild after any add-on fix without waiting to be asked.
  - `grocy_scraper/`: `grocy_scraper_addon/config.yaml`, `custom_components/grocy_scraper/manifest.json`, `grocy_scraper_addon/CHANGELOG.md`
  - `HA-storage/`: `storage/config.json`, `storage/CHANGELOG.md`, `custom_components/ha_storage/manifest.json`
  - `HA-grocy-stock/`: `grocy_stock/config.json`, `grocy_stock/CHANGELOG.md`
  - `HA-grocy-recipes/`: `grocy_recipes/config.json`, `grocy_recipes/CHANGELOG.md`
  - `HA-chores/`: `chores/config.json`, `chores/CHANGELOG.md`
  - `HA-lists/`: `lists/config.json`, `lists/CHANGELOG.md`
- **Changelogs use plain `## X.Y.Z` headers only.** No bracketed versions, no dates — Supervisor parsing depends on this.
- **Scraper package is duplicated on purpose:** `grocy_scraper/grocy_scraper/` is copied into `grocy_scraper/grocy_scraper_addon/grocy_scraper/`. When changing shared modules (`scraper.py`, `storage_client.py`, `skaupat_client.py`, `searxng_client.py`), keep both copies in sync. The add-on flow uses `grocy_scraper_addon/main.py`.
- **Use Storage terminology** (`parent_id`, `unit_id`, `picture_filename`, `active`) — not legacy Grocy names — when touching integrations, API clients, or migration logic.
