# HA-Storage — Strengthened Expiry / Lot Tracking

**Date:** 2026-05-13
**Submodule:** `HA-storage/` (backend `storage/`, integration `custom_components/ha_storage/`, frontend `storage/frontend/`)
**Author note:** This spec is the source of truth for the work. The implementation plan lives in a separate document under `docs/superpowers/plans/`.

## Goal

Make the expiry-date story explicit and auditable. Today a stock row carries one `best_before_date` computed from `today + product.default_best_before_days` at the moment of add, and FIFO leans on that one column. The model works in the common case but has three latent bugs and one missing capability:

1. NULL-expiry lots sort *first* in SQLite, so a lot with no date gets eaten before a real one. FIFO bug.
2. No tie-break — two lots sharing an expiry have undefined consumption order.
3. The expiry is a single snapshot with no provenance — we cannot tell whether it came from the product default or a manual override.
4. There is no way to spoil a specific lot. `consume?spoiled=true` always eats the oldest.

This spec strengthens the model so that each lot tracks its expiry from the day it was added, anchored to the product's best-before value at that moment, with deterministic FIFO and per-lot operations.

## Decisions captured during brainstorming

1. **Lot granularity (not per-unit).** A single add creates one `stock` row with `amount=N`. Per-unit copies were considered and rejected — same-day purchases share the same expiry in practice.
2. **Expiry is snapshot at add time** as `(purchased_date, best_before_days)`. The product's default can change later without affecting existing stock.
3. **FIFO order:** `best_before_date ASC NULLS LAST → purchased_date ASC → id ASC`. NULL-expiry rows go last, not first.
4. **Spoil:** keep the existing `POST /stock/consume {spoiled: true}` (eats FIFO, logs `spoil`) AND add a targeted `POST /stock/spoil/{lot_id}` that spoils a specific lot.
5. **Migration:** backfill `best_before_days` from the product's current value at migration time. `purchased_date` already exists and is reused as the anchor. Existing `best_before_date` values are not recomputed.
6. **UI scope:** Backend + full lot inspector view in the storage frontend, plus minor surfacing on the existing "Expiring soon" dashboard. Integration sensor passes the new fields through unchanged.

## Data model

### Schema change

One new column on `stock`. No new tables.

```sql
ALTER TABLE stock ADD COLUMN best_before_days INTEGER;
```

SQLite cannot add a `NOT NULL` column to an existing table without a rebuild, so the column is declared nullable in DDL. The application enforces non-null on writes and the migration backfill (see below) populates every existing row.

### Per-lot semantics

A `stock` row represents one lot. Its expiry-related columns are:

| Column | Meaning | Set when |
|---|---|---|
| `purchased_date` (existing) | The day this lot entered the household. Defaults to `date('now')`. Overridable on add (receipt import, manual backfill). | On add. Not modified afterwards. |
| `best_before_days` (new) | Snapshot of `products.default_best_before_days` at the moment of add. Survives later edits to the product default. | On add. Not modified afterwards. |
| `best_before_date` (existing) | The actual expiry date. Stored, indexed, used directly by FIFO and "expiring soon" queries. | On add: derived as `purchased_date + best_before_days`. May be user-overridden in `POST /stock/add`. |

The triple is the audit trail: "scanned on X, product said Y days, expires Z (possibly user-overridden)."

### Index

```sql
CREATE INDEX IF NOT EXISTS idx_stock_fifo
  ON stock(product_id, best_before_date, purchased_date, id);
```

The current `idx_stock_product` (product_id only) stays for non-FIFO lookups.

## Write path

### `POST /stock/add` — derive and snapshot

Pseudocode (current code is at `HA-storage/storage/app/routers/stock.py:98`):

```python
purchased_date = body.purchased_date or date.today()           # NEW: accept override
bb_days = product["default_best_before_days"] or 0
best_before = body.best_before_date or (
    (purchased_date + timedelta(days=bb_days)).isoformat() if bb_days > 0 else None
)
INSERT INTO stock (
    product_id, location_id, amount, unit_id,
    purchased_date, best_before_days, best_before_date
) VALUES (?, ?, ?, ?, ?, ?, ?)
```

`StockAdd` model gains an optional `purchased_date: str | None = None`. If omitted, default to today. The DB default `date('now')` becomes redundant but is left in place as a safety net.

### `POST /stock/consume`, `POST /stock/open`, `POST /stock/transfer` — deterministic FIFO

All three currently sort by `best_before_date ASC`. They are updated to use the canonical FIFO ordering:

```sql
ORDER BY
  CASE WHEN best_before_date IS NULL THEN 1 ELSE 0 END,  -- NULLs last
  best_before_date ASC,
  purchased_date ASC,
  id ASC
```

This becomes a shared helper `_fifo_order()` in `routers/stock.py` so the three paths cannot drift. The existing aggregate-event log on consume/spoil is preserved.

### `POST /stock/spoil/{lot_id}` — targeted spoil (new)

```
POST /stock/spoil/{lot_id}
Body: { amount: float | null, note: str = "" }
```

Spoil a specific lot by its stock entry id. If `amount` is null, spoil the whole lot. Otherwise spoil `min(amount, lot.amount)`. Decrements/deletes the lot row, writes a `spoil` history event with `stock_id` set to the targeted lot, and includes `lot.best_before_date` in the event note for stat clarity. Returns the spoiled amount.

`DELETE /stock/{entry_id}?reason=spoiled` continues to exist for the "delete this lot, log as spoil" use case (current behavior, unchanged).

### Open/transfer parity

The open path already passes `purchased_date` through; the transfer path already copies `purchased_date` and `best_before_date` to the destination lot. Transfer must additionally copy `best_before_days` so the destination lot retains the audit trail.

## API surface

### `StockEntry` response — new field

```python
class StockEntry(BaseModel):
    id: int
    product_id: int
    location_id: int
    amount: float
    amount_opened: float
    unit_id: int
    best_before_date: str | None
    best_before_days: int | None      # NEW
    purchased_date: str | None
    created_at: str
```

`StockEntryWithProduct` inherits the new field. The "expiring soon" list and the lot inspector both consume it.

### `StockAdd` — accept anchor override

```python
class StockAdd(BaseModel):
    product_id: int
    amount: float = 1
    unit_id: int | None = None
    location_id: int | None = None
    best_before_date: str | None = None
    purchased_date: str | None = None   # NEW
    note: str = ""
```

### Lot inspector endpoint

`GET /stock/product/{product_id}` already returns all lots for a product. It will:

- Include `best_before_days` (via the model change above).
- Use the canonical FIFO ordering, so the "what gets consumed next" order is the same on screen as in the consume code path.

No new endpoint is required for the lot inspector — the existing one becomes the data source.

### Existing endpoints unchanged

- `GET /stock` — aggregated per product. Unchanged.
- `GET /stock/entries?expiring_within_days|expired` — unchanged on the wire; gains `best_before_days` via the response model.
- `DELETE /stock/{entry_id}?reason=...` — unchanged.

## Migration

Implemented in `database._migrate_schema()` alongside the existing migrations.

```python
cols = {r["name"] for r in conn.execute("PRAGMA table_info(stock)").fetchall()}
if "best_before_days" not in cols:
    conn.execute("ALTER TABLE stock ADD COLUMN best_before_days INTEGER")
    # Backfill from the product's current default. Existing best_before_date is left as-is
    # so consumption order does not shift for live stock.
    conn.execute("""
        UPDATE stock SET best_before_days = (
            SELECT default_best_before_days FROM products WHERE products.id = stock.product_id
        )
        WHERE best_before_days IS NULL
    """)
    # Ensure purchased_date is non-null on legacy rows that pre-date the DB default.
    conn.execute("""
        UPDATE stock SET purchased_date = COALESCE(purchased_date, date(created_at))
        WHERE purchased_date IS NULL
    """)
    conn.commit()
    log.info("Added best_before_days to stock and backfilled from product defaults.")

# Create the FIFO index outside the if-block so it gets added even on already-migrated DBs.
conn.execute("""
    CREATE INDEX IF NOT EXISTS idx_stock_fifo
      ON stock(product_id, best_before_date, purchased_date, id)
""")
conn.commit()
```

No data is destroyed. The migration is idempotent.

## UI — storage frontend

Two changes to `HA-storage/storage/frontend/src/components/`:

### 1. `Stock.jsx` — per-product lot inspector

`Stock.jsx` already lists stock entries per product (`Stock.jsx:457`). The change:

- Expand the per-product expanded row to a structured table: **Scanned on · Best-before (days) · Expires · Days left · Amount · Location · Actions**.
- Add a **Spoil** button per row that hits `POST /stock/spoil/{lot_id}` with `amount=null` (spoil the whole lot). Confirmation dialog reuses the existing modal pattern.
- Lots are listed in canonical FIFO order so the user sees "this one goes next" at the top.
- Visual treatment follows the design system: `bg-gray-800` row, `bg-red-900/40 text-red-300` for expired, `bg-amber-900/40 text-amber-300` for within-7-days, otherwise `text-gray-300`.

### 2. `Dashboard.jsx` — expiring-soon enhancement

`Dashboard.jsx:246` already renders an "Expiring soon" panel. The change:

- Each row gains a small "scanned NN days ago" muted label under the product name, computed from the new `purchased_date` field. No layout change beyond that.
- The chip on the right keeps the existing "Expired Nd ago / Nd" semantics.

### 3. Add-stock form (`Stock.jsx` — existing add modal)

Accept an optional **Purchased on** date input (defaulting to today) so receipt imports and manual backfill can anchor the lot to a past date. The existing **Best before** input is preserved as a manual override.

## Integration (`custom_components/ha_storage/`)

The integration coordinator (`coordinator.py:49`) already pulls `/api/stock/entries?expiring_within_days=N`. Because the response model gains `best_before_days` automatically, the coordinator stores the field as-is and exposes it through `extra_state_attributes` on the `expiring_soon` sensor. No new sensors. No config-flow changes.

## Testing

Backend tests in `HA-storage/storage/app/tests/test_api.py`:

1. **Migration backfill.** Pre-populate a DB at the old schema with stock rows whose `best_before_days` is missing. Run init. Assert every row's `best_before_days` matches the product's current `default_best_before_days` and `purchased_date` is non-null.
2. **Add — anchor derivation.** Add a product with `default_best_before_days=10`. Add stock with no overrides. Assert the resulting row has `purchased_date == today`, `best_before_days == 10`, `best_before_date == today + 10`.
3. **Add — user override sticks.** Same product, but pass `best_before_date=today+3`. Assert the row has `best_before_days == 10` (snapshot still recorded) and `best_before_date == today+3`.
4. **Add — purchased_date override.** Pass `purchased_date=yesterday`. Assert `best_before_date == yesterday + 10`.
5. **Product default changes after add.** Add stock at `default_best_before_days=10`. Update the product to `default_best_before_days=30`. Add another lot. Assert the first lot's `best_before_days` is still 10, the second is 30.
6. **FIFO order — NULL last.** Two lots: one with `best_before_date=NULL`, one with `best_before_date=today+5`. Consume 1 unit. Assert the dated lot is consumed, not the NULL lot.
7. **FIFO order — tie-break by purchased_date.** Two lots, same `best_before_date`, different `purchased_date`. Consume 1 unit. Assert the older `purchased_date` is consumed.
8. **Targeted spoil — whole lot.** Add two lots. Call `POST /stock/spoil/{newer_lot_id}` with `amount=null`. Assert the newer lot is gone, the older lot is intact, and a `spoil` history event references `stock_id=newer_lot_id`.
9. **Targeted spoil — partial.** Lot with `amount=4`. Call `POST /stock/spoil/{id}` with `amount=2`. Assert `amount=2` remains and a `spoil` event of amount 2 is logged.
10. **Targeted spoil — bad amount.** `amount > lot.amount` returns 400 (or clamps; spec choice: clamp to `lot.amount` and proceed, matching the consume path's leniency).
11. **Transfer copies `best_before_days`.** Add a lot, transfer half to another location. Assert both source and destination rows have the same `best_before_days`.

Frontend tests are not required (the frontend has no test harness today). Manual verification via `npm run dev` and the dev container — golden path: add a lot, see it in the lot inspector with correct days-left; spoil it from the inspector and see it disappear with a history event.

## Versioning

Per the repo convention this change is user-facing and requires a version bump in the same PR:

- `HA-storage/storage/config.json` — bump `version` from `0.8.2` to `0.9.0` (minor, because of the new endpoint and response field; the migration is backward-compatible).
- `HA-storage/storage/CHANGELOG.md` — new `## 0.9.0` section listing the schema column, FIFO fix, targeted spoil endpoint, and lot inspector UI.
- `HA-storage/custom_components/ha_storage/manifest.json` — bump the integration version to match.

## Out of scope

- Per-unit copies (rejected during brainstorming).
- Recompute-on-product-edit (rejected — snapshot wins).
- Notifications on imminent expiry (already handled by HA via the `expiring_soon` sensor; no change needed).
- Stock entry editing post-add (today the only mutations are consume / open / transfer / delete — left as-is).
- Receipt-parser plumbing of `purchased_date` (the new field is accepted by `/stock/add`, but wiring it through the receipt commit flow is a separate, smaller change).
