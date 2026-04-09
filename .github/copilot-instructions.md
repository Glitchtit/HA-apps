# Copilot Instructions for HA-apps

## Repository Structure

This is a **Home Assistant add-on repository** containing four independent Git submodules:

- **`grocy_scraper/`** — Python HA add-on (slug: `grocy_scraper`) + HA custom integration. Scrapes Finnish grocery sites (k-ruoka.fi, s-kaupat.fi) and populates **HA-Storage** via `StorageClient`. Uses Gemini AI for product sorting, dating, grouping, and optimization.
- **`HA-grocy-stock/`** — React + nginx HA add-on (slug: `grocy_stock`). Stock management dashboard with one-click consume, product grouping, and barcode scanning. Talks to **Storage API**.
- **`HA-grocy-recipes/`** — React + Python + nginx HA add-on (slug: `grocy_recipes`). AI-powered recipe scraping. Gemini AI extracts recipes from URLs, ingredients matched to Storage products. Fetches AI key from Storage.
- **`HA-storage/`** — FastAPI + SQLite + React HA add-on (slug: `ha_storage`). **Central data store** for the entire ecosystem, replacing Grocy and Barcode Buddy entirely.

The root repo (`HA-apps`) ties them together via `repository.json` and `.gitmodules`. Each submodule has its own Git history and versioning.

**Submodule workflow**: Push inside the submodule first, then commit the updated submodule reference in the root repo (e.g. `cd /path/to/HA-apps && git add grocy_scraper && git commit`). `.gitmodules` uses HTTPS (HA Supervisor compatibility); local remotes can use SSH for push.

## Build, Test, and Lint

### grocy_scraper (Python)

```bash
cd grocy_scraper
python -m pytest tests/ -v                # 445 tests

python -m pytest tests/test_storage_client.py -v                                    # Single file
python -m pytest tests/test_main.py::TestAiOptimize::test_optimize_updates_location -v  # Single test
```

No linter or formatter configured.

### HA-storage (Python + React)

```bash
# API tests
cd HA-storage/storage
python -m pytest app/tests/ -v   # 54 tests

# Frontend
cd HA-storage/storage/frontend
npm install && npm run build
```

### HA-grocy-stock (React)

```bash
cd HA-grocy-stock/grocy_stock/frontend
npm install && npm run build
```

No tests or linter configured.

### HA-grocy-recipes (React + Python)

```bash
cd HA-grocy-recipes/grocy_recipes/frontend
npm install && npm run build
```

No tests or linter configured.

## Architecture

### Central Data Store — HA-Storage

HA-Storage (FastAPI + SQLite) is the central data store. All other apps communicate with it via REST API. There are **no external dependencies** on Grocy or Barcode Buddy.

Two s6-overlay services: nginx (port 8099) + FastAPI (port 8100). SQLite database at `/data/storage.db`.

- nginx serves the React SPA and proxies `/api/*` → FastAPI
- 11 API routers: products, stock, barcodes, units, conversions, locations, groups, recipes, shopping, barcode-queue, config
- Seeded data: 9 Finnish units, 12 conversions, 3 locations
- Frontend: React 18 + Vite + Tailwind CSS. English UI. Dark mode.

### Scraper — Two Deployment Modes

The same codebase ships two ways:

1. **HA Supervisor Add-on** (`grocy_scraper_addon/`) — Docker container with s6-overlay running two services: the periodic scraper and an ingress web server (`ingress_server.py` on port 8099). Uses `StorageClient` to talk to Storage API. Entry point: `grocy_scraper_addon/main.py`.
2. **HA Custom Integration** (`custom_components/grocy_scraper/`) — Sidebar panel + config flow + WebSocket API. Runs discover on a timer via `async_track_time_interval`.

### Scraper — Key Modules

| Module | Role |
|---|---|
| `grocy_scraper/scraper.py` | K-ruoka.fi scraper (GraphQL + kr-api REST) |
| `grocy_scraper/storage_client.py` | Storage REST API client (replaced GrocyClient) |
| `grocy_scraper/skaupat_client.py` | S-kaupat.fi EAN lookup |
| `grocy_scraper_addon/main.py` | Entry point — Gemini AI helpers, optimize/sort/date/group logic |
| `grocy_scraper_addon/ingress_server.py` | HTTP server for the HA ingress web UI |
| `custom_components/grocy_scraper/ws_api.py` | WebSocket API handlers for the HA sidebar panel |
| `custom_components/grocy_scraper/www/panel.js` | Vanilla JS web component (shadow DOM) for the sidebar UI |

### Stock — Architecture

Multi-stage Docker build: Node 20 builds the React frontend, then nginx serves it on port 8099 with reverse proxies:

- `/api/storage/*` → Storage API
- `/api/scraper/*` → Scraper addon

Frontend: React 18 + Vite + Tailwind CSS. Single main component in `App.jsx`. Dark mode.

### Recipe — Architecture

Two s6-overlay services: nginx (port 8099) serves the React SPA and proxies APIs, Python backend (port 8100) handles recipe scraping via Gemini AI, product matching, and Storage CRUD.

- `/api/storage/*` → Storage API
- `/api/scraper/*` → Scraper addon
- `/api/backend/*` → Python backend (localhost:8100)
- `/api/storage-files/*` → Storage file server (recipe images)

Frontend: React 18 + Vite + Tailwind CSS. Single main component in `App.jsx`. Dark mode.

## Key Conventions

### Duplicated files — keep them in sync

The `grocy_scraper/` Python package is **copied identically** into `grocy_scraper_addon/grocy_scraper/`. Any change to `scraper.py`, `storage_client.py`, or `skaupat_client.py` must be applied to both locations.

There is only **one** `main.py` — at `grocy_scraper_addon/main.py`.

### Gemini AI integration

All Gemini API calls go through `_call_gemini()` → `_call_gemini_json()` in `grocy_scraper_addon/main.py`. The JSON wrapper retries up to `_GEMINI_MAX_RETRIES` times with exponential back-off and sanitizes control characters from responses. Batch sizes: 100 for sort/date/group, 1000 for optimize. The AI key is stored centrally in Storage.

### Error handling

- `GrocyAPIError` is the standard exception for Storage and Gemini API failures (defined in `storage_client.py`, re-used in `grocy_scraper_addon/main.py`).
- API clients log warnings and continue on non-fatal errors; batch operations skip failed batches rather than aborting.

### Retry logic

All apps retry connecting to Storage on startup to handle startup order gracefully:
- Scraper: 30 retries × 5s intervals
- Stock / Recipe: health-check loops until Storage responds

### Version bumps

**Always bump the version** when making user-facing changes. When prompting from the root `HA-apps/` folder, remember that version files live **inside the submodules**. All version locations must be bumped together per submodule.

**grocy_scraper** — bump all three:

| File (relative to `grocy_scraper/`) | Field |
|---|---|
| `grocy_scraper_addon/config.yaml` | `version: "X.Y.Z"` |
| `custom_components/grocy_scraper/manifest.json` | `"version": "X.Y.Z"` |
| `grocy_scraper_addon/CHANGELOG.md` | New `## X.Y.Z` section |

**HA-grocy-stock** — bump both:

| File (relative to `HA-grocy-stock/`) | Field |
|---|---|
| `grocy_stock/config.json` | `"version": "X.Y.Z"` |
| `grocy_stock/CHANGELOG.md` | New `## X.Y.Z` section |

**HA-grocy-recipes** — bump both:

| File (relative to `HA-grocy-recipes/`) | Field |
|---|---|
| `grocy_recipes/config.json` | `"version": "X.Y.Z"` |
| `grocy_recipes/CHANGELOG.md` | New `## X.Y.Z` section |

**HA-storage** — bump both:

| File (relative to `HA-storage/`) | Field |
|---|---|
| `storage/config.json` | `"version": "X.Y.Z"` |
| `storage/CHANGELOG.md` | New `## X.Y.Z` section |

CHANGELOGs use plain `## VERSION` headers (e.g. `## 1.11.0`). Do **not** use brackets or dates (`## [1.11.0] - 2026-04-06`) — HA Supervisor cannot parse that format.

### Home Assistant patterns

- All four addons use **HA ingress** on port 8099 with automatic path injection.
- API keys are injected **server-side** (nginx headers or Python code) — never exposed to the browser.
- Add-on services use **s6-overlay** (`rootfs/etc/s6-overlay/s6-rc.d/`).
- Product names and UI strings are in **Finnish** (the target grocery sites are Finnish).
- All four apps follow the same patterns: React + Vite + Tailwind frontends, dark mode, ingress-aware URLs, server-side API key injection.

### Testing style

Tests use `unittest.mock.patch` extensively. Test classes are grouped by function/method (e.g., `TestGetAllProducts`, `TestAiOptimize`). Mocks patch at the module boundary — typically `requests.Session` or `requests.post`.
