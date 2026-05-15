# Clear Shopping Items on Purchase — Design

**Status:** Draft
**Date:** 2026-05-15
**Apps touched:** `HA-storage` (backend only)

## 1. Problem

When a household member buys groceries and scans them in via HA-stock's
inventory scanner, the corresponding manual entries on the shopping list stay
behind and have to be checked off by hand. The repo already has a partial
mechanism — `sync_auto_shopping()` removes **auto-added** shopping rows once
stock crosses `min_stock_amount` — but **manually-added** shopping rows are
intentionally untouched. That is the gap.

## 2. Goal

After `POST /stock/add` succeeds for product P with amount A and unit U,
manual shopping rows for P should be **decremented quantity-aware** and
hard-deleted once their `amount` reaches zero.

The trigger lives in the HA-storage backend so the behavior is symmetric
across every client that ends up calling `/stock/add`: HA-stock's inventory
scanner, the HA-storage frontend's manual stock-in dialog, the
`ha_storage.consume_stock` integration service's inverse, anything else.
There are no frontend changes.

## 3. Non-goals

- Triggering on `/stock/consume`. Consume = "I used some from existing
  stock," not "I bought some." Out of scope.
- Triggering on the HA-stock shopping-mode scanner (which records intent at
  the store but does not commit to stock). That flow currently has no
  /stock/add call attached; if the user wants symmetry there later, it's a
  separate ticket.
- Cross-unit conversion via `pack_size` / `pack_unit_id`. Risky and easy to
  get wrong. Unit mismatch = skip the row, leave it for the user.
- Touching auto-added rows. The existing `sync_auto_shopping()` already
  handles them based on `min_stock_amount`. Mixing the two mechanisms is what
  caused us to scope this manually-only in the first place — auto-added rows
  represent "you need this," not "you intended to buy this," and would just
  get re-created by `sync_auto_shopping` if stock is still below threshold.
- No HACS integration changes. The HA todo entity (`todo.py`) and services
  (`services.py`) keep their existing shape. The cleared rows simply stop
  appearing in the next poll.

## 4. Behavior

Inputs (from `add_stock()` in `HA-storage/storage/app/routers/stock.py:116`):

- `product_id` — int
- `amount` — float (the lot quantity)
- `unit_id` — int | None

Algorithm:

1. Select candidate rows from `shopping_list`:
   - `product_id = :product_id`
   - `auto_added = 0`
   - `done = 0`
   - Unit equivalence: `(unit_id IS NULL AND :unit_id IS NULL) OR unit_id = :unit_id`
   - Ordered by `created_at ASC` (oldest first)
2. Initialize `remaining = amount`.
3. For each candidate row, while `remaining > 0`:
   - Compute `new_amount = row.amount - remaining`.
   - If `new_amount <= 0`: `DELETE` the row; set `remaining = -new_amount`
     (spill the leftover into the next row).
   - Else: `UPDATE shopping_list SET amount = :new_amount WHERE id = :id`;
     set `remaining = 0`.
4. After the loop, let `sync_auto_shopping(conn)` run as it does today
   (handles auto-added rows). Order is not strictly meaningful — the two
   helpers operate on disjoint row sets (`auto_added = 0` vs.
   `auto_added = 1`) — but the new helper runs **before** the existing
   call so the file reads top-down: manual purchase clearance, then
   threshold-based auto-add sync.

The helper runs immediately after `add_stock` commits the stock insert,
mirroring the pre-existing `sync_auto_shopping(conn)` post-commit
pattern in the same function. The stock insert and the shopping
clearance are therefore *not* a single atomic transaction — if the
helper raises mid-loop, prior DELETEs/UPDATEs are committed but the
stock insert remains. In practice the helper does only DELETEs and
UPDATEs against rows it just read, so failure modes are limited;
treating them as eventually-consistent matches how `sync_auto_shopping`
has always behaved.

## 5. Implementation

### 5.1 New helper

In `HA-storage/storage/app/routers/shopping.py`, alongside `sync_auto_shopping`:

```python
def consume_shopping_for_purchase(
    conn: sqlite3.Connection,
    product_id: int,
    amount: float,
    unit_id: int | None,
) -> list[int]:
    """Decrement manual shopping rows for a product when stock is purchased.

    Matches non-done manual rows (auto_added = 0) with equivalent unit_id,
    oldest first. Subtracts the purchased amount; deletes rows that reach
    amount <= 0 and spills leftover into the next row. Returns the ids of
    affected rows (deleted or updated) for callers that want to log.
    """
```

Signature mirrors `sync_auto_shopping(conn)` — takes the open connection,
returns nothing critical to the caller. Returning the affected id list is
cheap and useful for future logging / tests.

### 5.2 Call site

`HA-storage/storage/app/routers/stock.py`, in `add_stock()`, immediately
before the existing `sync_auto_shopping(conn)` call at ~line 190:

```python
consume_shopping_for_purchase(conn, product_id, amount, unit_id)
sync_auto_shopping(conn)
```

`product_id`, `amount`, `unit_id` come from the request payload that's
already in scope.

### 5.3 No frontend or integration changes

HA-stock polls / refreshes shopping on its existing cadence; the cleared
rows simply stop appearing. The HA-storage HACS integration's todo entity
(`HA-storage/custom_components/ha_storage/todo.py`) likewise re-fetches and
shows fewer items.

## 6. Edge cases

- **Unit mismatch** (`shopping.unit_id != stock_add.unit_id`, treating
  NULL/NULL as a match): skip the row. The user may have meant "2 liters"
  while scanning a "pack" — we can't know.
- **Multiple manual rows for same product/unit**: handled by the loop with
  spill carrying leftover into the next row, oldest first.
- **Fractional amounts**: arithmetic is float-native. `0.5 - 0.7 = -0.2`
  deletes the row and 0.2 spills.
- **Recipe-linked manual rows** (`recipe_id IS NOT NULL`, `auto_added = 0`):
  still cleared. Recipe linkage is metadata, not exclusion criteria.
- **No matching manual rows**: no-op, normal `/stock/add` flow continues.
- **Purchase amount exceeds total shopping demand**: loop terminates after
  the last row is deleted; the surplus `remaining` is discarded (we don't
  go negative on rows that don't exist).
- **Concurrent purchases**: handled by SQLite's transaction isolation.
  `add_stock` already runs in a transaction.

## 7. Tests

Add to `HA-storage/storage/app/tests/test_api.py`, which already holds
the shopping endpoint tests (see existing tests around
`/api/shopping-list`, `/api/shopping-list/sync`, etc.). Each test sets
up a product, possibly some shopping rows, posts to `/api/stock/add`,
then asserts on `/api/shopping-list` contents.

1. **Manual row fully consumed** → row deleted.
   Setup: shopping row `{product=P, amount=1, unit=NULL, auto_added=0}`.
   Action: `POST /stock/add {product_id=P, amount=1, unit_id=NULL}`.
   Expect: row gone.

2. **Manual row partially consumed** → `amount` updated.
   Setup: shopping row `{product=P, amount=6, unit=NULL}`.
   Action: `POST /stock/add {product_id=P, amount=1, unit_id=NULL}`.
   Expect: row's `amount = 5`, row still present.

3. **Spill across rows** in `created_at` order.
   Setup: rows A `{amount=1, created_at=t0}`, B `{amount=2, created_at=t1}`.
   Action: `POST /stock/add {amount=2}`.
   Expect: A deleted; B's `amount = 1`.

4. **Auto-added row untouched** by the new logic.
   Setup: shopping row `{product=P, amount=1, auto_added=1}`, product has
   `min_stock_amount=10` so `sync_auto_shopping` won't clear it either.
   Action: `POST /stock/add {amount=1}`.
   Expect: row still present with `amount = 1`.

5. **Unit mismatch** → row untouched.
   Setup: shopping row `{product=P, amount=2, unit_id=U_liters}`.
   Action: `POST /stock/add {amount=1, unit_id=U_pack}`.
   Expect: row unchanged.

6. **`/stock/consume` does not trigger** the new logic.
   Setup: shopping row `{product=P, amount=2}`, stock already exists.
   Action: `POST /stock/consume {amount=1}`.
   Expect: shopping row unchanged.

7. **No matching rows** → purchase succeeds, no error.

## 8. Versioning

Per repo convention:

- Bump `HA-storage/storage/config.json` (patch — bug-fix-ish UX
  improvement, no API change).
- Add a `## X.Y.Z` entry to `HA-storage/storage/CHANGELOG.md` (plain
  header, no brackets, no date).
- `HA-storage/custom_components/ha_storage/manifest.json` does **not**
  need a bump — no integration-side code changes.
- After backend changes pass, rebuild the add-on so the Supervisor picks
  up the new image.

## 9. Open questions

None blocking. Filed for future thought:

- Should the helper emit a history event ("shopping_cleared" or similar)
  so a future activity feed can show "scanning 1 milk cleared 1 shopping
  item"? Out of scope here; trivially additive if wanted.
- Should the HA-stock shopping-mode scanner eventually call /stock/add
  itself once items are committed at the store? That would unify the two
  scanner flows and inherit this behavior automatically. Out of scope.
