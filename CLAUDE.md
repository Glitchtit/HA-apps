# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

`HA-apps` is a **release umbrella**, not an application. It aggregates independent Home Assistant add-ons via Git submodules (`.gitmodules`, `repository.json`). There is no top-level build, test, or lint — always `cd` into the touched submodule.

Clone with submodules: `git clone --recurse-submodules …` or `git submodule update --init --recursive`. Update to latest: `git submodule update --remote --merge`.

Submodules:
- `HA-storage/storage` — FastAPI + SQLite, nginx on `8099`, FastAPI on `8100`, DB at `/data/storage.db`. **System of record.**
- `grocy_scraper/` — Python scraper shipped as both a Supervisor add-on (`grocy_scraper_addon/`) and a HA custom integration (`custom_components/grocy_scraper/`).
- `HA-grocy-stock/grocy_stock` — React SPA behind nginx.
- `HA-grocy-recipes/grocy_recipes` — React SPA + Python backend (Gemini/Claude/Ollama) behind nginx.
- `HA-chores/chores` — FastAPI + React (`ingress_port: 8099`) with a paired `custom_components/ha_chores` integration (sensors, todo, calendar).

## Commands

Run inside the relevant submodule. No linter/formatter is configured anywhere.

```bash
# grocy_scraper (Python)
cd grocy_scraper && python -m pytest tests/ -v
cd grocy_scraper && python -m pytest tests/test_main.py::TestAiOptimize::test_optimize_updates_location -v

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
```

## Architecture (big picture)

- **Storage is the canonical data model.** Products, stock, recipes, shopping, config, files, and AI optimize orchestration all live behind its REST API. Scraper/Stock/Recipe talk only to Storage (never to each other). Optimize runs as background `/api/ai/optimize` tasks with single-flight execution and pollable status.
- **Scraper ships twice.** The Supervisor add-on runs the periodic scraper + ingress web server; the HA integration exposes config flow, sidebar UI, and WebSocket handlers. Both paths write through `StorageClient`.
- **Recipe backend** proxies `/api/storage/*`, `/api/scraper/*`, `/api/backend/*`, `/api/storage-files/*` via nginx; exposes provider-aware `/api/config` readiness; scrapes recipe pages; matches ingredients against Storage.
- **Startup order is loose.** Storage comes up first; scraper and recipe backend block on Storage health at startup; Stock/Recipe frontends poll Storage health with bounded retry before enabling UI flows. Do not assume any service is ready — add retry.
- **All add-ons are ingress-aware.** API keys stay server-side, nginx injects the ingress path into the frontend, and browser code must call proxied relative API routes — never hard-coded hosts.
- **Finnish-first product data.** Recipe input can be multilingual, but matching and stored product names resolve to Finnish Storage products.

## Conventions that bite

- **Each submodule has its own `.github/copilot-instructions.md`** with app-specific details. Read it before working in that submodule; the root file intentionally does not duplicate.
- **Submodule workflow:** commit and push inside the submodule *first*, then commit the updated pointer in the root repo. `.gitmodules` must stay on HTTPS for Supervisor compatibility even if local push remotes use SSH.
- **Every user-facing change requires a version bump and changelog entry** in the touched submodule. Bump + rebuild after any add-on fix without waiting to be asked.
  - `grocy_scraper/`: `grocy_scraper_addon/config.yaml`, `custom_components/grocy_scraper/manifest.json`, `grocy_scraper_addon/CHANGELOG.md`
  - `HA-storage/`: `storage/config.json`, `storage/CHANGELOG.md`
  - `HA-grocy-stock/`: `grocy_stock/config.json`, `grocy_stock/CHANGELOG.md`
  - `HA-grocy-recipes/`: `grocy_recipes/config.json`, `grocy_recipes/CHANGELOG.md`
  - `HA-chores/`: `chores/config.json`, `chores/CHANGELOG.md`
- **Changelogs use plain `## X.Y.Z` headers only.** No bracketed versions, no dates — Supervisor parsing depends on this.
- **Scraper package is duplicated on purpose:** `grocy_scraper/grocy_scraper/` is copied into `grocy_scraper/grocy_scraper_addon/grocy_scraper/`. When changing shared modules (`scraper.py`, `storage_client.py`, `skaupat_client.py`, `searxng_client.py`), keep both copies in sync. The add-on flow uses `grocy_scraper_addon/main.py`.
- **Use Storage terminology** (`parent_id`, `unit_id`, `picture_filename`, `active`) — not legacy Grocy names — when touching integrations, API clients, or migration logic.
