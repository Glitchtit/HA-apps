# Copilot Instructions for HA-apps

## Repository Structure

This is a **Home Assistant add-on repository** containing two independent Git submodules:

- **`grocy_scraper/`** — Python CLI + HA add-on + HA custom integration that scrapes Finnish grocery sites (k-ruoka.fi, s-kaupat.fi) and populates a [Grocy](https://grocy.info) database. Uses Gemini AI for product sorting, dating, grouping, and pack detection.
- **`HA-grocy-stock/`** — React + nginx HA add-on providing a Grocy stock dashboard with one-click consume, product grouping, and optional barcode scanning.

The root repo (`HA-apps`) only ties them together via `repository.json` and `.gitmodules`. Each submodule has its own Git history and versioning.

**After committing inside a submodule, also commit the updated submodule reference in the root `HA-apps` repo** (e.g. `cd /path/to/HA-apps && git add grocy_scraper && git commit`). Otherwise HA-apps will still point at the old submodule commit.

## Build, Test, and Lint

### grocy_scraper (Python)

```bash
# Run all tests (359 tests)
cd grocy_scraper
python -m pytest tests/ -v

# Run a single test file
python -m pytest tests/test_grocy_client.py -v

# Run a single test class or method
python -m pytest tests/test_grocy_client.py::TestGetAllProducts -v
python -m pytest tests/test_main.py::TestAiOptimize::test_optimize_updates_location -v

# Docker build (addon)
docker build -t grocy-scraper:latest grocy_scraper_addon/
```

No linter or formatter is configured.

### HA-grocy-stock (React)

```bash
cd HA-grocy-stock/grocy_stock/frontend
npm install
npm run dev      # Dev server (Vite)
npm run build    # Production build → dist/
```

No tests or linter configured.

## Architecture

### grocy_scraper — Three Deployment Modes

The same codebase ships three ways:

1. **Standalone CLI** (`main.py`) — Full-featured entry point with argparse. Has extra functions not in the addon version (e.g., `_discover_single_barcode`).
2. **HA Supervisor Add-on** (`grocy_scraper_addon/`) — Docker container with s6-overlay running two services: the periodic scraper and an ingress web server (`ingress_server.py` on port 8099).
3. **HA Custom Integration** (`custom_components/grocy_scraper/`) — Sidebar panel + config flow + WebSocket API. Runs discover on a timer via `async_track_time_interval`.

### grocy_scraper — Key Modules

| Module | Role |
|---|---|
| `grocy_scraper/scraper.py` | K-ruoka.fi scraper (GraphQL + kr-api REST backends) |
| `grocy_scraper/grocy_client.py` | Grocy REST API client (products, barcodes, images, stock) |
| `grocy_scraper/barcodebuddy_client.py` | Barcode Buddy web scraper with session auth |
| `grocy_scraper/skaupat_client.py` | S-kaupat.fi EAN lookup |
| `main.py` | CLI entry point — argparse, Gemini AI helpers, all `--sort`/`--date`/`--group`/`--optimize` logic |
| `grocy_scraper_addon/ingress_server.py` | HTTP server for the HA ingress web UI (search, discover, AI endpoints) |
| `custom_components/grocy_scraper/ws_api.py` | WebSocket API handlers for the HA sidebar panel |
| `custom_components/grocy_scraper/www/panel.js` | Vanilla JS web component (shadow DOM) for the sidebar UI |

### HA-grocy-stock — Architecture

A multi-stage Docker build: Node 20 builds the React frontend, then nginx serves it on port 8099 with reverse proxies:

- `/api/grocy/*` → Grocy (API key injected server-side via nginx)
- `/api/bbuddy/*` → Barcode Buddy
- `/api/scraper/*` → Grocy Scraper addon (auto-detected)

Frontend: React 18 + Vite + Tailwind CSS. Single main component in `App.jsx`.

## Key Conventions

### Duplicated files — keep them in sync

The `grocy_scraper/` Python package is **copied identically** into `grocy_scraper_addon/grocy_scraper/`. Any change to `scraper.py`, `grocy_client.py`, `barcodebuddy_client.py`, or `skaupat_client.py` must be applied to both locations.

`main.py` (CLI) and `grocy_scraper_addon/main.py` (addon) share most code but have **diverged** — the CLI version (~2038 lines) has extra functions the addon version (~1917 lines) doesn't. Changes to shared logic (Gemini helpers, AI functions, argparse setup) must be applied to both files.

### Gemini AI integration

All Gemini API calls go through `_call_gemini()` → `_call_gemini_json()` in `main.py`. The JSON wrapper retries up to `_GEMINI_MAX_RETRIES` times with exponential back-off and sanitizes control characters from responses. Batch sizes: 100 for sort/date/group, 1000 for optimize.

### Error handling

- `GrocyAPIError` is the standard exception for all Grocy and Gemini API failures (defined in `grocy_client.py`, re-used in `main.py`).
- API clients log warnings and continue on non-fatal errors; batch operations skip failed batches rather than aborting.

### Version bumps

**Always bump the version** when making user-facing changes. When prompting from the root `HA-apps/` folder, remember that version files live **inside the submodules**. All version locations must be bumped together per submodule.

**grocy_scraper** — bump all three:

| File (relative to `grocy_scraper/`) | Field |
|---|---|
| `grocy_scraper_addon/config.yaml` | `version: "X.Y.Z"` |
| `custom_components/grocy_scraper/manifest.json` | `"version": "X.Y.Z"` |
| `grocy_scraper_addon/CHANGELOG.md` | New `## [X.Y.Z] - YYYY-MM-DD` section |

**HA-grocy-stock** — bump both:

| File (relative to `HA-grocy-stock/`) | Field |
|---|---|
| `grocy_stock/config.json` | `"version": "X.Y.Z"` |
| `grocy_stock/CHANGELOG.md` | New `## X.Y.Z` section |

CHANGELOGs use plain `## VERSION` headers (e.g. `## 1.11.0`). Do **not** use brackets or dates (`## [1.11.0] - 2026-04-06`) — HA Supervisor cannot parse that format.

### Home Assistant patterns

- Both addons use **HA ingress** on port 8099 with automatic path injection.
- API keys are injected **server-side** (nginx headers or Python code) — never exposed to the browser.
- Add-on services use **s6-overlay** (`rootfs/etc/s6-overlay/s6-rc.d/`).
- Product names and UI strings are in **Finnish** (the target grocery sites are Finnish).

### Testing style

Tests use `unittest.mock.patch` extensively. Test classes are grouped by function/method (e.g., `TestGetAllProducts`, `TestAiOptimize`). Mocks patch at the module boundary — typically `requests.Session` or `requests.post`.
