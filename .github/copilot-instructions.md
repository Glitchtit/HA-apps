# Copilot Instructions for HA-apps

## Build, test, and lint

The root repository is a submodule umbrella. There is no single top-level build or test command; run commands inside the touched submodule.

Clone with submodules: `git clone --recurse-submodules …` or after cloning: `git submodule update --init --recursive`.

### `grocy_scraper/` (Python add-on + HA integration)

```bash
cd grocy_scraper
python -m pytest tests/ -v
python -m pytest tests/test_storage_client.py -v
python -m pytest tests/test_main.py::TestAiOptimize::test_optimize_updates_location -v
```

No linter or formatter is configured. Note: tests import only from the top-level `grocy_scraper/grocy_scraper/` copy — drift with `grocy_scraper_addon/grocy_scraper/` will not surface here.

### `HA-storage/storage/` (FastAPI + SQLite API)

```bash
cd HA-storage/storage
python -m pytest app/tests/ -v
python -m pytest app/tests/test_api.py -v
python -m pytest app/tests/test_api.py::TestHealth::test_health -v
```

### `HA-storage/storage/frontend/` (React UI)

```bash
cd HA-storage/storage/frontend
npm install
npm run dev
npm run build
```

No linter is configured.

### `HA-grocy-stock/grocy_stock/frontend/` (React UI)

```bash
cd HA-grocy-stock/grocy_stock/frontend
npm install
npm run dev
npm run build
```

No tests or linter are configured.

### `HA-grocy-recipes/grocy_recipes/frontend/` (React UI)

```bash
cd HA-grocy-recipes/grocy_recipes/frontend
npm install
npm run dev
npm run build
```

No tests or linter are configured for Recipe. The Python backend currently has no dedicated automated test suite in this repo.

### `HA-chores/chores/` (FastAPI + React add-on + HA integration)

```bash
cd HA-chores/chores/app
python -m pytest tests/ -v
python -m pytest tests/test_gamification.py -v
python -m pytest tests/test_api.py::TestChores::test_create_chore -v

cd HA-chores/chores/frontend
npm install
npm run dev
npm run build
```

No linter or formatter is configured.

## High-level architecture

- The root `HA-apps` repo is a release umbrella, not an application entry point. It ties together four independent Git submodules via `.gitmodules` and `repository.json`, and each submodule ships as its own Home Assistant add-on or integration with separate versioning and changelog history.
- `HA-storage/` is the system of record. It runs nginx on `8099`, FastAPI on `8100`, and a shared SQLite database at `/data/storage.db`. All other apps talk to Storage over its REST API for products, stock, recipes, shopping, config, files, and AI-related operations. Storage also owns optimize orchestration through background `/api/ai/optimize` tasks, with single-flight execution and pollable task status.
- `grocy_scraper/` is the ingestion and product-discovery layer. The same scraper codebase ships in two modes: the Supervisor add-on (`grocy_scraper_addon/`), which runs the periodic scraper plus an ingress web server, and the Home Assistant custom integration (`custom_components/grocy_scraper/`), which exposes config flow, sidebar UI, and WebSocket handlers. Both paths write into Storage through `StorageClient`.
- `HA-grocy-stock/` is a React SPA served by nginx. It does not own business data; it proxies `/api/storage/*` to Storage and `/api/scraper/*` to the scraper add-on and keeps most frontend behavior in a single `frontend/src/App.jsx`.
- `HA-grocy-recipes/` is split between a React SPA and a Python backend behind nginx. nginx proxies `/api/storage/*`, `/api/scraper/*`, `/api/backend/*`, and `/api/storage-files/*`. The backend supports Gemini, Claude, and Ollama, exposes provider-aware `/api/config` readiness, scrapes recipe pages, extracts structured recipe data, and matches ingredients against Storage products.
- `HA-chores/` ships both a Supervisor add-on (`chores/`) with FastAPI backend + React frontend on `ingress_port: 8099`, and a HA custom integration (`custom_components/ha_chores/`) that creates sensors, todo lists, and calendar entities by polling the add-on API.
- Startup order is intentionally loose because Home Assistant may bring services up in different sequences. Storage is expected to come up first, while Scraper and the Recipe backend block on Storage health at startup and the Stock/Recipe frontends poll Storage health with bounded retry loops before enabling their main UI flows.
- `Design system/` and `docs/` at the root are not shipped — they hold cross-frontend design tokens/mocks and workflow notes respectively.

## Key conventions

- Read the local submodule instructions too. Each major submodule has its own `.github/copilot-instructions.md`, and those files contain app-specific details that the root file intentionally does not repeat in full.
- Submodule workflow matters: commit and push inside the changed submodule first, then commit the updated submodule pointer in the root repo. `.gitmodules` must stay on HTTPS for Home Assistant Supervisor compatibility even if local push remotes use SSH.
- Every user-facing change requires a version bump and changelog entry in the touched submodule:
  - `grocy_scraper/`: `grocy_scraper_addon/config.yaml`, `custom_components/grocy_scraper/manifest.json`, `grocy_scraper_addon/CHANGELOG.md`
  - `HA-storage/`: `storage/config.json`, `storage/CHANGELOG.md`
  - `HA-grocy-stock/`: `grocy_stock/config.json`, `grocy_stock/CHANGELOG.md`
  - `HA-grocy-recipes/`: `grocy_recipes/config.json`, `grocy_recipes/CHANGELOG.md`
  - `HA-chores/`: `chores/config.json`, `chores/CHANGELOG.md`
- Changelogs use plain `## X.Y.Z` headers only. Do not use bracketed versions or dates; Home Assistant Supervisor parsing depends on the simpler format.
- The scraper package is duplicated on purpose: `grocy_scraper/grocy_scraper/` is copied into `grocy_scraper/grocy_scraper_addon/grocy_scraper/`. When changing shared scraper modules such as `scraper.py`, `storage_client.py`, `skaupat_client.py`, or `searxng_client.py`, keep both copies in sync. The only `main.py` that matters for the add-on flow is `grocy_scraper_addon/main.py`.
- Storage is the canonical data model. Use Storage terminology and field names (`parent_id`, `unit_id`, `picture_filename`, `active`) instead of old Grocy names when touching integrations, API clients, or migration logic.
- All four add-ons are ingress-aware Home Assistant apps. API keys stay server-side, nginx injects the ingress path into the frontend, and browser code should talk to proxied relative API routes instead of hard-coded host URLs.
- Product data is Finnish-first across the suite. Recipe input can be multilingual, but matching and stored product names are expected to resolve to Finnish Storage products.
