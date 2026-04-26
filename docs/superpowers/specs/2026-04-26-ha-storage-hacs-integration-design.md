# HA-Storage HACS Integration

## Goal

Convert HA-Storage from add-on-only to the same dual-shipping pattern as HA-Chores and HA-Lists: keep the add-on as the system of record, add a parallel HACS-installable custom integration that polls the add-on's REST API and exposes HA entities and services.

## Current state

- `HA-storage/storage/` ships only as a Supervisor add-on (FastAPI + nginx, port 8099, ingress).
- The add-on currently bridges to HA via `storage/app/ha_sync.py`, which uses the `SUPERVISOR_TOKEN` to push shopping/stock items into HA todo entities. This inverted bridge is the "cumbersome and clanky" path being replaced.
- `HA-chores/` and `HA-lists/` already follow the target pattern: add-on dir + `custom_components/<domain>/` + `hacs.json` at the submodule root.

## Architecture

Side-by-side: keep `storage/` add-on unchanged in scope (still owns SQLite, still serves the SPA). Add `custom_components/ha_storage/` at the `HA-storage/` submodule root. The integration is a thin `httpx` client over the add-on's existing REST API, polling on a 5-minute `DataUpdateCoordinator` (matches chores cadence).

The integration does three things:
1. Registers a sidebar iframe panel pointing at the add-on's ingress URL ("Storage").
2. Exposes 7 sensors and 1 todo entity built from the polled data.
3. Registers 3 HA services for automation use.

## Storage API additions

Two new read-only endpoints, both small:

- **`GET /api/stock/entries`** in `storage/app/routers/stock.py`. Query params `expiring_within_days: int | None` and `expired: bool | None`. Returns `list[StockEntry]` with `product_id` and `product_name` joined. Single SQL query joining `stock` and `products`. Exists so the integration can compute aggregate expiry counters in one call instead of N+1 per-product fetches.

- **`GET /api/ai/optimize`** (no task_id) in `storage/app/routers/ai.py`. Returns `{status, task_id, started_at, finished_at, progress, error}` for the currently running task, or the most recent completed/errored task, or `{status: "idle"}` if nothing has ever run. Backed by the existing `_running_task_id` and `_tasks` registry. Exists so the integration can show optimize state without already knowing a task id.

## Storage removals (clean break)

Delete in this single change:

- `storage/app/ha_sync.py` (entire module)
- These routes from `storage/app/routers/shopping.py`:
  - `POST /api/shopping-list/ha-sync`, `GET /api/shopping-list/ha-status`
  - `POST /api/stock-list/ha-sync`, `GET /api/stock-list/ha-status`
- All `import ha_sync` / `ha_sync.*` calls in `shopping.py`, `stock.py`, `products.py`, `main.py` (startup-sync calls)

The `ha_item_name` column stays in the `shopping_list` table to avoid a destructive migration; it just stops being maintained. Can be cleaned up later if desired.

The add-on's existing `homeassistant_api: true` and `hassio_api: true` permissions in `storage/config.json` are kept (still used by other add-on logic).

## Integration package layout

`HA-storage/custom_components/ha_storage/`:

- `manifest.json` — `domain: "ha_storage"`, `version: "0.1.0"`, `requirements: ["httpx>=0.28.0"]`, `dependencies: ["frontend", "http"]`, `iot_class: "local_polling"`, `config_flow: true`
- `const.py` — `DOMAIN`, `CONF_ADDON_URL`, `DEFAULT_ADDON_URL`, `ADDON_SLUG = "ha_storage"`, panel constants, default `EXPIRING_WITHIN_DAYS = 7`
- `__init__.py` — `async_setup_entry` creates coordinator, registers sidebar panel, forwards platforms `["sensor", "todo"]`, registers services
- `config_flow.py` — Supervisor auto-discovery of add-on URL via `http://supervisor/addons/ha_storage/info`, single-step form with URL field, connection test against `/api/health`
- `coordinator.py` — `StorageCoordinator(DataUpdateCoordinator)`, 5-minute interval, parallel fetches via `asyncio.gather` of: `/api/health`, `/api/products`, `/api/stock`, `/api/stock/entries?expiring_within_days=7`, `/api/stock/entries?expired=true`, `/api/shopping-list`, `/api/barcode-queue`, `/api/ai/optimize`. Computes `low_stock_count` from stock list (`amount <= min_stock_amount and min_stock_amount > 0`), and `shopping_pending_count` by filtering `done=false`. Exposes typed accessors used by entities.
- `sensor.py` — 7 sensors:
  - `StorageProductsTotalSensor` → `len(products)`
  - `StorageLowStockSensor` → derived count
  - `StorageExpiringSoonSensor` → `len(expiring_entries)`, attribute `days = 7`
  - `StorageExpiredSensor` → `len(expired_entries)`
  - `StorageShoppingPendingSensor` → unchecked count
  - `StorageBarcodeQueueSensor` → queue length
  - `StorageOptimizeStatusSensor` → `status` value, attributes `task_id`, `started_at`, `finished_at`, `progress`, `error`
  All use `CoordinatorEntity`, all carry stable `unique_id` of `f"{entry.entry_id}_<key>"`.
- `todo.py` — `StorageShoppingListTodo`. Items = current shopping list. `async_get_todo_items` returns one `TodoItem` per shopping entry (using `product_name` as summary, `note` as description, status from `done`). `async_update_todo_item` toggles `done` via `PUT /api/shopping-list/{id}` (handles UI check/uncheck). `async_delete_todo_items` calls `DELETE /api/shopping-list/{id}` per id. **`async_create_todo_item` is not implemented** and the entity does *not* set the `CREATE_TODO_ITEM` feature flag — Storage shopping items must be tied to an existing product, and there is no name → product lookup endpoint, so adding from the HA todo UI is intentionally disabled. The `add_to_shopping_list` service (below) is the supported add path.
- `services.py` — registers 3 services on first config entry:
  - `ha_storage.add_to_shopping_list(product_id, amount=1, unit_id=null, note="")` → `POST /api/shopping-list`
  - `ha_storage.consume_stock(product_id, amount, location_id=null)` → `POST /api/stock/consume`
  - `ha_storage.run_optimize(product_ids=null)` → `POST /api/ai/optimize`
  Each calls `coordinator.async_request_refresh()` after success so HA state reflects the change quickly.
- `services.yaml` — service schemas with field descriptions
- `strings.json` + `translations/en.json` — config flow titles, error strings

## HACS / Supervisor metadata at submodule root

- `HA-storage/hacs.json` — `{ "name": "Storage", "content_in_root": false, "render_readme": true, "homeassistant": "2023.1.0" }` (matches chores/lists exactly)
- `HA-storage/repository.json` — Supervisor add-on store metadata (matches chores)

## Versioning

- Storage add-on: `0.3.32` → `0.4.0` (minor — new endpoints + breaking removal of `ha_sync` routes). Bumped in `storage/config.json` and `storage/CHANGELOG.md`.
- Integration: `0.1.0` (new) in `custom_components/ha_storage/manifest.json`.

## Tests

Backend (`HA-storage/storage/app/tests/test_api.py`):

- `TestStockEntries` — boundary tests: today, today+N, today-1; verify `expiring_within_days` and `expired` filters; verify `product_name` is joined.
- `TestOptimizeStatus` — idle case (empty registry), running case (mock `_running_task_id`), most-recent-completed case.
- `TestRemovedHaSyncRoutes` — assert all four removed routes return 404; assert `add_shopping_item` still works without ha_sync calls.

No tests for the integration package itself (matches chores/lists — neither has integration tests).

## Root CLAUDE.md updates

- Fix the stale line claiming HA-lists is "Add-on only — no custom integration." It actually ships an integration.
- Add HA-storage to the list of submodules that ship add-on + integration side-by-side.
- Extend the version-bump checklist with `HA-storage/custom_components/ha_storage/manifest.json`.

## Out of scope

- Removing the `ha_item_name` column from the schema (kept to avoid migration).
- Moving the SQLite layer or image storage into HA core (would require replacing the add-on entirely).
- Lovelace cards or any frontend tied to the integration — sidebar panel still iframes the add-on UI.
- Tests for the integration Python code.
