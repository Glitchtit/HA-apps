# HA-Storage Strengthened Expiry / Lot Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snapshot `(purchased_date, best_before_days)` per stock lot in HA-Storage, make FIFO deterministic with NULLs-last, add a targeted-spoil endpoint, surface the new data in the storage frontend, and bump versions.

**Architecture:** One new column on `stock` (`best_before_days`), one new index, one new endpoint (`POST /stock/spoil/{lot_id}`), a shared FIFO ordering clause used by consume/open/transfer/queries, two `Pydantic` model edits, two `React` component edits, one `api.js` helper. Migration backfills `best_before_days` from each product's current `default_best_before_days`. No new tables. No breaking changes to existing endpoints.

**Tech Stack:** FastAPI + Pydantic v2, SQLite (raw `sqlite3`), `pytest` + `TestClient`, React 18 + Tailwind utility classes (no Tailwind config), nginx ingress proxy.

**Spec:** `docs/superpowers/specs/2026-05-13-storage-expiry-lots-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `HA-storage/storage/app/database.py` | Modify | Add `best_before_days` to `stock` table in `_SCHEMA_SQL` (line 66–76); add migration block in `_migrate_schema` (line 212+); add FIFO index in migration. |
| `HA-storage/storage/app/models.py` | Modify | `StockAdd` gains `purchased_date`; `StockEntry` gains `best_before_days`. |
| `HA-storage/storage/app/routers/stock.py` | Modify | Snapshot derivation in `add_stock`; shared `_fifo_order_sql()` helper; apply to consume/open/transfer/get_product_stock/list_stock_entries; transfer copies `best_before_days`; new `POST /stock/spoil/{lot_id}` route. |
| `HA-storage/storage/app/tests/test_api.py` | Modify | Add 11 tests across migration, anchor, FIFO, spoil. |
| `HA-storage/storage/frontend/src/api.js` | Modify | Export `spoilStockLot(lotId, body)`. |
| `HA-storage/storage/frontend/src/components/Stock.jsx` | Modify | Add `Scanned`, `BB (days)`, `Days left`, `Spoil` columns to expanded lot table; add `purchased_date` input to add modal. |
| `HA-storage/storage/frontend/src/components/Dashboard.jsx` | Modify | Add "scanned NN days ago" muted label per expiring row. |
| `HA-storage/storage/config.json` | Modify | Bump `version` to `0.9.0`. |
| `HA-storage/storage/CHANGELOG.md` | Modify | Prepend `## 0.9.0` section. |
| `HA-storage/custom_components/ha_storage/manifest.json` | Modify | Bump integration `version` to `0.2.0`. |

---

## Task 1: Schema column + migration + FIFO index

**Files:**
- Modify: `HA-storage/storage/app/database.py:66-76` (table DDL)
- Modify: `HA-storage/storage/app/database.py:212-279` (migration)
- Test: `HA-storage/storage/app/tests/test_api.py` (new `TestExpiryMigration` class near the existing `TestStock`)

- [ ] **Step 1.1: Write the failing migration test**

Add to `HA-storage/storage/app/tests/test_api.py` after the existing `TestStock` class:

```python
import sqlite3 as _sqlite3_for_migration_test


class TestExpiryMigration:
    """The schema migration backfills best_before_days for pre-existing rows."""

    def _make_legacy_stock_row(self, product_id: int, location_id: int, unit_id: int, bbd: str | None = None):
        """Insert a stock row directly (bypassing the API) so we can simulate a
        row created before the best_before_days column existed."""
        from main import get_connection
        conn = get_connection()
        cur = conn.execute(
            "INSERT INTO stock (product_id, location_id, amount, unit_id, best_before_date) "
            "VALUES (?, ?, ?, ?, ?)",
            (product_id, location_id, 3, unit_id, bbd),
        )
        # Force best_before_days NULL to simulate pre-migration state.
        conn.execute("UPDATE stock SET best_before_days = NULL WHERE id = ?", (cur.lastrowid,))
        conn.commit()
        return cur.lastrowid

    def test_existing_rows_get_best_before_days_backfilled(self):
        kpl = next(u["id"] for u in client.get("/api/units").json() if u["abbreviation"] == "kpl")
        loc = client.get("/api/locations").json()[0]["id"]
        p = client.post("/api/products", json={
            "name": f"MigTest_{id(self)}",
            "unit_id": kpl,
            "default_best_before_days": 14,
        }).json()
        stock_id = self._make_legacy_stock_row(p["id"], loc, kpl)

        # Trigger the migration explicitly (idempotent — safe to re-run).
        from main import get_connection
        from database import _migrate_schema
        _migrate_schema(get_connection())

        row = get_connection().execute(
            "SELECT best_before_days, purchased_date FROM stock WHERE id = ?",
            (stock_id,),
        ).fetchone()
        assert row["best_before_days"] == 14
        assert row["purchased_date"] is not None
```

- [ ] **Step 1.2: Run the test to confirm it fails**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestExpiryMigration -v
```

Expected: FAIL because `_make_legacy_stock_row` references a `best_before_days` column that does not yet exist (or because the migration logic is absent).

- [ ] **Step 1.3: Add the column to the fresh-install schema**

Modify `HA-storage/storage/app/database.py:66-76`. Replace the `stock` table DDL with:

```sql
CREATE TABLE IF NOT EXISTS stock (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id      INTEGER NOT NULL REFERENCES locations(id),
    amount           REAL NOT NULL DEFAULT 0,
    amount_opened    REAL DEFAULT 0,
    unit_id          INTEGER NOT NULL REFERENCES units(id),
    best_before_date TEXT,
    best_before_days INTEGER,
    purchased_date   TEXT DEFAULT (date('now')),
    created_at       TEXT DEFAULT (datetime('now'))
);
```

Note: `CREATE TABLE IF NOT EXISTS` does NOT add columns to existing tables. The new column on existing DBs is added by the migration block in Step 1.4. Do NOT add `CREATE INDEX idx_stock_fifo` to `_SCHEMA_SQL` — it would fail on first run for pre-existing DBs that haven't migrated yet.

- [ ] **Step 1.4: Add the migration block**

Modify `HA-storage/storage/app/database.py`. Insert at the END of `_migrate_schema` (after the existing stock_history backfill and before the closing of the function, around line 279):

```python
    # Add best_before_days column for pre-existing databases.
    stock_cols = {r["name"] for r in conn.execute("PRAGMA table_info(stock)").fetchall()}
    if "best_before_days" not in stock_cols:
        conn.execute("ALTER TABLE stock ADD COLUMN best_before_days INTEGER")
        conn.execute("""
            UPDATE stock SET best_before_days = (
                SELECT default_best_before_days FROM products WHERE products.id = stock.product_id
            )
            WHERE best_before_days IS NULL
        """)
        conn.execute("""
            UPDATE stock SET purchased_date = COALESCE(purchased_date, date(created_at))
            WHERE purchased_date IS NULL
        """)
        conn.commit()
        log.info("Added best_before_days column to stock and backfilled from product defaults.")

    # Canonical FIFO index. Idempotent — safe on every init.
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_stock_fifo
          ON stock(product_id, best_before_date, purchased_date, id)
    """)
    conn.commit()
```

- [ ] **Step 1.5: Run the migration test — expect PASS**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestExpiryMigration -v
```

Expected: PASS.

- [ ] **Step 1.6: Run the full existing test suite — expect no regressions**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

Expected: all existing tests still pass (only the migration test is new; nothing else touched yet).

- [ ] **Step 1.7: Commit**

```bash
cd HA-storage && git add storage/app/database.py storage/app/tests/test_api.py
cd HA-storage && git commit -m "feat(storage): add best_before_days column + FIFO index migration"
```

---

## Task 2: Model updates (`StockAdd`, `StockEntry`)

**Files:**
- Modify: `HA-storage/storage/app/models.py:108-114` (`StockAdd`)
- Modify: `HA-storage/storage/app/models.py:134-143` (`StockEntry`)

- [ ] **Step 2.1: Update `StockAdd` to accept a purchased_date override**

In `HA-storage/storage/app/models.py:108-114`, replace `StockAdd` with:

```python
class StockAdd(BaseModel):
    product_id: int
    amount: float = 1
    unit_id: int | None = None
    location_id: int | None = None
    best_before_date: str | None = None
    purchased_date: str | None = None
    note: str = ""
```

- [ ] **Step 2.2: Update `StockEntry` to expose `best_before_days`**

In `HA-storage/storage/app/models.py:134-143`, replace `StockEntry` with:

```python
class StockEntry(BaseModel):
    id: int
    product_id: int
    location_id: int
    amount: float
    amount_opened: float
    unit_id: int
    best_before_date: str | None
    best_before_days: int | None
    purchased_date: str | None
    created_at: str
```

`StockEntryWithProduct` inherits from `StockEntry` so it picks up `best_before_days` automatically — no further edit there.

- [ ] **Step 2.3: Run the existing tests — expect no regressions**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

Expected: all tests still pass. The new field is `Optional[int]` and SQLite returns `None` for the freshly-migrated rows where backfill didn't run (none in this test DB), so Pydantic v2 accepts it.

- [ ] **Step 2.4: Commit**

```bash
cd HA-storage && git add storage/app/models.py
cd HA-storage && git commit -m "feat(storage): expose best_before_days on StockEntry, accept purchased_date on StockAdd"
```

---

## Task 3: Snapshot derivation in `add_stock`

**Files:**
- Modify: `HA-storage/storage/app/routers/stock.py:98-142` (`add_stock`)
- Test: `HA-storage/storage/app/tests/test_api.py` (new tests inside or after `TestStock`)

- [ ] **Step 3.1: Write the failing tests**

Add to `HA-storage/storage/app/tests/test_api.py` inside `TestStock` (or a new `TestExpirySnapshot` class — either works, keep it next to the other stock tests):

```python
class TestExpirySnapshot:
    """Adding a lot snapshots (purchased_date, best_before_days) and derives best_before_date."""

    def _make_product(self, bb_days: int = 10):
        kpl = next(u["id"] for u in client.get("/api/units").json() if u["abbreviation"] == "kpl")
        loc = client.get("/api/locations").json()[0]["id"]
        p = client.post("/api/products", json={
            "name": f"Snap_{id(self)}_{bb_days}",
            "unit_id": kpl,
            "location_id": loc,
            "default_best_before_days": bb_days,
        }).json()
        return p["id"], kpl, loc

    def test_anchor_derivation_default(self):
        from datetime import date, timedelta
        pid, _, _ = self._make_product(bb_days=10)
        entry = client.post("/api/stock/add", json={"product_id": pid, "amount": 1}).json()
        today = date.today().isoformat()
        expected_bb = (date.today() + timedelta(days=10)).isoformat()
        assert entry["purchased_date"] == today
        assert entry["best_before_days"] == 10
        assert entry["best_before_date"] == expected_bb

    def test_user_override_best_before_date_sticks(self):
        from datetime import date, timedelta
        pid, _, _ = self._make_product(bb_days=10)
        override = (date.today() + timedelta(days=3)).isoformat()
        entry = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "best_before_date": override},
        ).json()
        # Snapshot of product default still recorded for audit.
        assert entry["best_before_days"] == 10
        # But the user's override is what's stored.
        assert entry["best_before_date"] == override

    def test_purchased_date_override_shifts_expiry(self):
        from datetime import date, timedelta
        pid, _, _ = self._make_product(bb_days=10)
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        expected_bb = (date.today() + timedelta(days=9)).isoformat()
        entry = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "purchased_date": yesterday},
        ).json()
        assert entry["purchased_date"] == yesterday
        assert entry["best_before_days"] == 10
        assert entry["best_before_date"] == expected_bb

    def test_product_default_change_does_not_affect_existing_lots(self):
        pid, _, _ = self._make_product(bb_days=10)
        first = client.post("/api/stock/add", json={"product_id": pid, "amount": 1}).json()
        # Change the product default after the first add.
        client.put(f"/api/products/{pid}", json={"default_best_before_days": 30})
        second = client.post("/api/stock/add", json={"product_id": pid, "amount": 1}).json()
        # First lot keeps its original snapshot.
        assert first["best_before_days"] == 10
        # Second lot uses the new value.
        assert second["best_before_days"] == 30
```

- [ ] **Step 3.2: Run the tests — expect FAIL**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestExpirySnapshot -v
```

Expected: all four FAIL. The handler does not yet accept `purchased_date`, does not store `best_before_days`, and does not derive `best_before_date` from the anchor.

- [ ] **Step 3.3: Rewrite `add_stock`**

In `HA-storage/storage/app/routers/stock.py:98-142`, replace `add_stock` with:

```python
@router.post("/stock/add", response_model=StockEntry, status_code=201)
def add_stock(body: StockAdd):
    conn = _get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (body.product_id,)).fetchone()
    if not product:
        raise HTTPException(404, f"Product {body.product_id} not found")

    unit_id = body.unit_id or product["unit_id"]
    location_id = body.location_id or product["location_id"]
    if not location_id:
        loc = conn.execute("SELECT id FROM locations LIMIT 1").fetchone()
        location_id = loc["id"] if loc else None
    if not location_id:
        raise HTTPException(400, "No location specified and no default location exists")

    # Anchor date: explicit override, else today.
    purchased_date = body.purchased_date
    if not purchased_date:
        row = conn.execute("SELECT date('now') as d").fetchone()
        purchased_date = row["d"]

    # Snapshot of the product's best-before-days at the moment of add.
    bb_days = int(product["default_best_before_days"] or 0)

    # Derived expiry — user override wins.
    best_before = body.best_before_date
    if not best_before and bb_days > 0:
        row = conn.execute(
            "SELECT date(?, '+' || ? || ' days') as d",
            (purchased_date, bb_days),
        ).fetchone()
        best_before = row["d"]

    cur = conn.execute(
        """INSERT INTO stock
              (product_id, location_id, amount, unit_id,
               best_before_date, best_before_days, purchased_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (body.product_id, location_id, body.amount, unit_id,
         best_before, bb_days, purchased_date),
    )
    log_event(
        conn,
        product_id=body.product_id,
        event_type="purchase",
        amount=body.amount,
        unit_id=unit_id,
        location_id=location_id,
        stock_id=cur.lastrowid,
        note=body.note,
    )
    conn.commit()
    log.info("Added %.1f to stock for product %d (purchased=%s, bb_days=%d).",
             body.amount, body.product_id, purchased_date, bb_days)
    entry = conn.execute("SELECT * FROM stock WHERE id = ?", (cur.lastrowid,)).fetchone()
    sync_auto_shopping(conn)
    return entry
```

- [ ] **Step 3.4: Run the tests — expect PASS**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestExpirySnapshot -v
```

Expected: all four PASS.

- [ ] **Step 3.5: Run the full suite — expect no regressions**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

Expected: all tests still pass. Existing `TestStock::test_add_stock` continues to work because the new fields all have sensible defaults.

- [ ] **Step 3.6: Commit**

```bash
cd HA-storage && git add storage/app/routers/stock.py storage/app/tests/test_api.py
cd HA-storage && git commit -m "feat(storage): snapshot (purchased_date, best_before_days) on stock/add"
```

---

## Task 4: Shared FIFO ordering + apply everywhere

**Files:**
- Modify: `HA-storage/storage/app/routers/stock.py` (consume, open, transfer, get_product_stock, list_stock_entries)
- Test: `HA-storage/storage/app/tests/test_api.py` (new `TestFifoOrder` class)

- [ ] **Step 4.1: Write the failing tests**

Add to `HA-storage/storage/app/tests/test_api.py`:

```python
class TestFifoOrder:
    """FIFO order: best_before_date ASC NULLS LAST → purchased_date ASC → id ASC."""

    def _make_product(self):
        kpl = next(u["id"] for u in client.get("/api/units").json() if u["abbreviation"] == "kpl")
        loc = client.get("/api/locations").json()[0]["id"]
        p = client.post("/api/products", json={
            "name": f"Fifo_{id(self)}", "unit_id": kpl, "location_id": loc,
            "default_best_before_days": 0,  # so add does not auto-derive expiry
        }).json()
        return p["id"], kpl, loc

    def test_null_expiry_consumed_last_not_first(self):
        from datetime import date, timedelta
        pid, _, _ = self._make_product()
        # Lot A: no expiry (default_best_before_days=0 → bb_days=0 → NULL expiry stays).
        lot_null = client.post("/api/stock/add", json={"product_id": pid, "amount": 1}).json()
        # Lot B: explicit expiry 5 days from today.
        future = (date.today() + timedelta(days=5)).isoformat()
        lot_dated = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "best_before_date": future},
        ).json()

        client.post("/api/stock/consume", json={"product_id": pid, "amount": 1})

        # The dated lot must be the one consumed; the null-expiry lot still exists.
        remaining = {
            e["id"]: e["amount"]
            for e in client.get(f"/api/stock/product/{pid}").json()
        }
        assert remaining.get(lot_dated["id"], 0) == 0 or lot_dated["id"] not in remaining
        assert remaining.get(lot_null["id"]) == 1

    def test_tiebreak_by_purchased_date(self):
        from datetime import date, timedelta
        pid, _, _ = self._make_product()
        same_bb = (date.today() + timedelta(days=5)).isoformat()
        older = (date.today() - timedelta(days=2)).isoformat()
        newer = date.today().isoformat()
        lot_older = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "best_before_date": same_bb, "purchased_date": older},
        ).json()
        lot_newer = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "best_before_date": same_bb, "purchased_date": newer},
        ).json()

        client.post("/api/stock/consume", json={"product_id": pid, "amount": 1})

        remaining = {e["id"]: e["amount"] for e in client.get(f"/api/stock/product/{pid}").json()}
        # Older purchased_date must be consumed; newer is still there.
        assert remaining.get(lot_older["id"], 0) == 0 or lot_older["id"] not in remaining
        assert remaining.get(lot_newer["id"]) == 1
```

- [ ] **Step 4.2: Run the tests — expect FAIL**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestFifoOrder -v
```

Expected: both FAIL. The current `ORDER BY best_before_date ASC` puts NULL first, and there is no purchased_date tiebreak.

- [ ] **Step 4.3: Add a shared FIFO helper**

In `HA-storage/storage/app/routers/stock.py`, insert near the top (after the imports, before `_get_db`):

```python
_FIFO_ORDER_SQL = (
    " ORDER BY "
    " CASE WHEN best_before_date IS NULL THEN 1 ELSE 0 END, "
    " best_before_date ASC, "
    " purchased_date ASC, "
    " id ASC"
)
```

A constant (not a function) so the existing inline-SQL style is preserved.

- [ ] **Step 4.4: Apply the helper to `consume_stock`**

In `HA-storage/storage/app/routers/stock.py:147-152`, change the SELECT to:

```python
    entries = conn.execute(
        "SELECT * FROM stock WHERE product_id = ? AND amount > 0" + _FIFO_ORDER_SQL,
        (body.product_id,),
    ).fetchall()
```

- [ ] **Step 4.5: Apply the helper to `open_stock`**

In `HA-storage/storage/app/routers/stock.py:191-196`, change to:

```python
    entries = conn.execute(
        "SELECT * FROM stock WHERE product_id = ? AND (amount - amount_opened) > 0"
        + _FIFO_ORDER_SQL,
        (body.product_id,),
    ).fetchall()
```

- [ ] **Step 4.6: Apply the helper to `transfer_stock`**

In `HA-storage/storage/app/routers/stock.py:227-232`, change to:

```python
    entries = conn.execute(
        "SELECT * FROM stock WHERE product_id = ? AND location_id = ? AND amount > 0"
        + _FIFO_ORDER_SQL,
        (body.product_id, body.from_location_id),
    ).fetchall()
```

- [ ] **Step 4.7: Apply the helper to `get_product_stock`**

In `HA-storage/storage/app/routers/stock.py:93-95`, change to:

```python
    return conn.execute(
        "SELECT * FROM stock WHERE product_id = ?" + _FIFO_ORDER_SQL,
        (product_id,),
    ).fetchall()
```

- [ ] **Step 4.8: Apply the helper to `list_stock_entries`**

In `HA-storage/storage/app/routers/stock.py:79-85`, replace the `ORDER BY` tail with `_FIFO_ORDER_SQL`. The full revised function becomes:

```python
@router.get("/stock/entries", response_model=list[StockEntryWithProduct])
def list_stock_entries(expiring_within_days: int | None = None, expired: bool | None = None):
    conn = _get_db()
    where = ["s.amount > 0"]
    params: list = []
    if expired:
        where.append("s.best_before_date IS NOT NULL AND s.best_before_date < date('now')")
    elif expiring_within_days is not None:
        where.append(
            "s.best_before_date IS NOT NULL "
            "AND s.best_before_date >= date('now') "
            "AND s.best_before_date <= date('now', '+' || ? || ' days')"
        )
        params.append(expiring_within_days)
    sql = (
        "SELECT s.*, p.name AS product_name FROM stock s "
        "JOIN products p ON p.id = s.product_id "
        "WHERE " + " AND ".join(where)
        + " ORDER BY "
        + " CASE WHEN s.best_before_date IS NULL THEN 1 ELSE 0 END, "
        + " s.best_before_date ASC, "
        + " s.purchased_date ASC, "
        + " s.id ASC"
    )
    return conn.execute(sql, params).fetchall()
```

The join requires the `s.` prefix, so this query uses a local inline copy of the ordering rather than `_FIFO_ORDER_SQL`. That is intentional — both clauses must stay consistent. Add a one-line comment above the local copy in the source: `# Mirror of _FIFO_ORDER_SQL with s. prefix for the join.`

- [ ] **Step 4.9: Run the FIFO tests — expect PASS**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestFifoOrder -v
```

Expected: both PASS.

- [ ] **Step 4.10: Run the full suite — expect no regressions**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

Expected: all tests still pass.

- [ ] **Step 4.11: Commit**

```bash
cd HA-storage && git add storage/app/routers/stock.py storage/app/tests/test_api.py
cd HA-storage && git commit -m "feat(storage): deterministic FIFO order with NULLs-last and purchased_date tiebreak"
```

---

## Task 5: Transfer copies `best_before_days`

**Files:**
- Modify: `HA-storage/storage/app/routers/stock.py:246-254` (the INSERT inside `transfer_stock`)
- Test: `HA-storage/storage/app/tests/test_api.py` (one test in `TestFifoOrder` or a new tiny class)

- [ ] **Step 5.1: Write the failing test**

Add to `HA-storage/storage/app/tests/test_api.py`:

```python
class TestTransferCopiesSnapshot:
    def test_transfer_copies_best_before_days(self):
        kpl = next(u["id"] for u in client.get("/api/units").json() if u["abbreviation"] == "kpl")
        locs = client.get("/api/locations").json()
        from_loc, to_loc = locs[0]["id"], locs[1]["id"]
        pid = client.post("/api/products", json={
            "name": f"Xfer_{id(self)}", "unit_id": kpl,
            "default_best_before_days": 21,
        }).json()["id"]
        client.post("/api/stock/add", json={"product_id": pid, "amount": 4, "location_id": from_loc})

        client.post("/api/stock/transfer", json={
            "product_id": pid, "amount": 2,
            "from_location_id": from_loc, "to_location_id": to_loc,
        })

        rows = client.get(f"/api/stock/product/{pid}").json()
        assert len(rows) == 2
        # Both halves must carry the same best_before_days snapshot.
        assert {r["best_before_days"] for r in rows} == {21}
```

- [ ] **Step 5.2: Run the test — expect FAIL**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestTransferCopiesSnapshot -v
```

Expected: FAIL — the destination row has `best_before_days = NULL` because the INSERT doesn't copy the column.

- [ ] **Step 5.3: Update the transfer INSERT**

In `HA-storage/storage/app/routers/stock.py:246-254`, change the INSERT block to:

```python
        # Create new entry at destination — carry the audit snapshot along.
        conn.execute(
            """INSERT INTO stock (product_id, location_id, amount, amount_opened, unit_id,
               best_before_date, best_before_days, purchased_date)
               VALUES (?, ?, ?, 0, ?, ?, ?, ?)""",
            (body.product_id, body.to_location_id, take, entry["unit_id"],
             entry["best_before_date"], entry["best_before_days"], entry["purchased_date"]),
        )
```

- [ ] **Step 5.4: Run the test — expect PASS**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestTransferCopiesSnapshot -v
```

Expected: PASS.

- [ ] **Step 5.5: Run the full suite — expect no regressions**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

- [ ] **Step 5.6: Commit**

```bash
cd HA-storage && git add storage/app/routers/stock.py storage/app/tests/test_api.py
cd HA-storage && git commit -m "feat(storage): transfer copies best_before_days to destination lot"
```

---

## Task 6: Targeted spoil endpoint

**Files:**
- Modify: `HA-storage/storage/app/models.py` (new `StockSpoilLot` model)
- Modify: `HA-storage/storage/app/routers/stock.py` (new route at the bottom)
- Test: `HA-storage/storage/app/tests/test_api.py` (new `TestTargetedSpoil` class)

- [ ] **Step 6.1: Write the failing tests**

Add to `HA-storage/storage/app/tests/test_api.py`:

```python
class TestTargetedSpoil:
    def _make_product(self):
        kpl = next(u["id"] for u in client.get("/api/units").json() if u["abbreviation"] == "kpl")
        loc = client.get("/api/locations").json()[0]["id"]
        p = client.post("/api/products", json={
            "name": f"Spoil_{id(self)}", "unit_id": kpl, "location_id": loc,
            "default_best_before_days": 7,
        }).json()
        return p["id"], kpl, loc

    def test_spoil_whole_lot(self):
        pid, _, _ = self._make_product()
        older = client.post("/api/stock/add", json={"product_id": pid, "amount": 1}).json()
        newer = client.post("/api/stock/add", json={"product_id": pid, "amount": 1}).json()
        # Spoil the newer lot specifically — not the FIFO oldest.
        r = client.post(f"/api/stock/spoil/{newer['id']}", json={})
        assert r.status_code == 200
        assert r.json()["spoiled"] == 1
        # Older lot is intact, newer lot is gone.
        remaining = {e["id"]: e["amount"] for e in client.get(f"/api/stock/product/{pid}").json()}
        assert remaining.get(older["id"]) == 1
        assert newer["id"] not in remaining
        # A spoil history event is logged with stock_id = newer lot's id.
        history = client.get(f"/api/history/product/{pid}").json()
        spoil_events = [h for h in history if h["event_type"] == "spoil"]
        assert any(h.get("stock_id") == newer["id"] for h in spoil_events)

    def test_spoil_partial_amount(self):
        pid, _, _ = self._make_product()
        lot = client.post("/api/stock/add", json={"product_id": pid, "amount": 4}).json()
        r = client.post(f"/api/stock/spoil/{lot['id']}", json={"amount": 2})
        assert r.status_code == 200
        assert r.json()["spoiled"] == 2
        remaining = {e["id"]: e["amount"] for e in client.get(f"/api/stock/product/{pid}").json()}
        assert remaining[lot["id"]] == 2

    def test_spoil_amount_clamps_to_lot_amount(self):
        pid, _, _ = self._make_product()
        lot = client.post("/api/stock/add", json={"product_id": pid, "amount": 2}).json()
        # Ask for more than exists — must clamp to 2, not 400.
        r = client.post(f"/api/stock/spoil/{lot['id']}", json={"amount": 99})
        assert r.status_code == 200
        assert r.json()["spoiled"] == 2
        remaining = [e for e in client.get(f"/api/stock/product/{pid}").json() if e["id"] == lot["id"]]
        assert remaining == []

    def test_spoil_unknown_lot_returns_404(self):
        r = client.post("/api/stock/spoil/999999", json={})
        assert r.status_code == 404
```

The history endpoint at `/api/history/product/{id}` is the existing one (see `HA-storage/storage/app/routers/history.py:86`). It returns a list of `StockHistoryEntry` rows ordered newest-first.

- [ ] **Step 6.2: Run the tests — expect FAIL**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestTargetedSpoil -v
```

Expected: all four FAIL with 404 (route does not exist).

- [ ] **Step 6.3: Add the request model**

In `HA-storage/storage/app/models.py`, after `StockTransfer` (around line 132), add:

```python
class StockSpoilLot(BaseModel):
    amount: float | None = None
    note: str = ""
```

- [ ] **Step 6.4: Add the route**

In `HA-storage/storage/app/routers/stock.py`, add the import at the top:

```python
from models import (
    StockAdd,
    StockConsume,
    StockEntry,
    StockEntryWithProduct,
    StockOpen,
    StockSpoilLot,
    StockSummary,
    StockTransfer,
)
```

Then append at the bottom of the file:

```python
@router.post("/stock/spoil/{lot_id}", status_code=200)
def spoil_lot(lot_id: int, body: StockSpoilLot):
    """Spoil a specific stock lot (not FIFO). If amount is null, spoil the whole lot.
    Larger-than-lot amounts are clamped to the lot's remaining amount."""
    conn = _get_db()
    entry = conn.execute("SELECT * FROM stock WHERE id = ?", (lot_id,)).fetchone()
    if not entry:
        raise HTTPException(404, f"Stock entry {lot_id} not found")

    requested = entry["amount"] if body.amount is None else float(body.amount)
    spoiled = min(requested, entry["amount"])
    if spoiled <= 0:
        return {"spoiled": 0}

    new_amount = entry["amount"] - spoiled
    if new_amount <= 0:
        conn.execute("DELETE FROM stock WHERE id = ?", (lot_id,))
    else:
        conn.execute("UPDATE stock SET amount = ? WHERE id = ?", (new_amount, lot_id))

    note = body.note
    if entry["best_before_date"]:
        suffix = f"lot bb={entry['best_before_date']}"
        note = f"{note} ({suffix})" if note else suffix

    log_event(
        conn,
        product_id=entry["product_id"],
        event_type="spoil",
        amount=spoiled,
        unit_id=entry["unit_id"],
        location_id=entry["location_id"],
        stock_id=lot_id,
        note=note,
    )
    conn.commit()
    sync_auto_shopping(conn)
    log.info("Spoiled %.1f from lot %d (product %d).", spoiled, lot_id, entry["product_id"])
    return {"spoiled": spoiled}
```

- [ ] **Step 6.5: Run the tests — expect PASS**

```bash
cd HA-storage/storage && python -m pytest app/tests/test_api.py::TestTargetedSpoil -v
```

Expected: all four PASS.

- [ ] **Step 6.6: Run the full suite — expect no regressions**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

- [ ] **Step 6.7: Commit**

```bash
cd HA-storage && git add storage/app/routers/stock.py storage/app/models.py storage/app/tests/test_api.py
cd HA-storage && git commit -m "feat(storage): add POST /stock/spoil/{lot_id} targeted spoil endpoint"
```

---

## Task 7: Frontend api helper + lot inspector UI

**Files:**
- Modify: `HA-storage/storage/frontend/src/api.js:17-24`
- Modify: `HA-storage/storage/frontend/src/components/Stock.jsx`

The frontend has no test harness — verification is manual via `npm run dev`. Each step still builds incrementally.

- [ ] **Step 7.1: Add the spoil helper to `api.js`**

In `HA-storage/storage/frontend/src/api.js`, after the existing stock helpers (around line 22), add:

```javascript
export const spoilStockLot = (lotId, body = {}) => api.post(`/stock/spoil/${lotId}`, body);
```

- [ ] **Step 7.2: Import the helper in `Stock.jsx`**

In `HA-storage/storage/frontend/src/components/Stock.jsx`, find the import line that pulls in `getProductStock` etc., and add `spoilStockLot`. After the change the import block should look like:

```javascript
import {
  getStock, getUnits, getLocations, getProducts,
  getProductStock, addStock, consumeStock, openStock, transferStock,
  deleteStockEntry, spoilStockLot,
} from '../api';
```

(Use whichever exact form already exists in the file — keep the existing style; just add `spoilStockLot` to the list.)

- [ ] **Step 7.3: Add a `daysLeft` helper next to `daysUntil`**

In `HA-storage/storage/frontend/src/components/Stock.jsx`, near the existing `daysUntil` helper (line 24), add:

```javascript
function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
```

- [ ] **Step 7.4: Add a spoil handler inside the `Stock` component**

In `HA-storage/storage/frontend/src/components/Stock.jsx`, near the existing `handleDeleteEntry` handler (search for it inside the `Stock` component body), add:

```javascript
  const handleSpoilLot = async (lotId) => {
    if (!confirm('Spoil this entire lot? This is logged separately from consume.')) return;
    try {
      await spoilStockLot(lotId, {});
      await reload();
      if (expanded) {
        try { const { data } = await getProductStock(expanded); setEntries(data); } catch {}
      }
    } catch (err) {
      alert(err?.response?.data?.detail || 'Spoil failed');
    }
  };
```

- [ ] **Step 7.5: Replace the lot table headers and rows**

In `HA-storage/storage/frontend/src/components/Stock.jsx:450-475`, replace the `<thead>` and `<tbody>` of the per-product expanded table with:

```jsx
<thead>
  <tr className="text-left text-xs text-gray-400 uppercase">
    <th className="pb-1 pr-3">Amount</th>
    <th className="pb-1 pr-3">Opened</th>
    <th className="pb-1 pr-3">Location</th>
    <th className="pb-1 pr-3">Scanned</th>
    <th className="pb-1 pr-3">BB (days)</th>
    <th className="pb-1 pr-3">Expires</th>
    <th className="pb-1 pr-3">Days left</th>
    <th className="pb-1"></th>
  </tr>
</thead>
<tbody>
  {entries.map((entry) => {
    const eu = unitMap[entry.unit_id];
    const loc = locationMap[entry.location_id];
    const daysLeft = daysUntil(entry.best_before_date);
    const scannedAgo = daysSince(entry.purchased_date);
    return (
      <tr key={entry.id} className={`border-t border-gray-700 ${bbClass(entry.best_before_date)}`}>
        <td className="py-1.5 pr-3 text-gray-100">{entry.amount} {eu?.abbreviation || eu?.name || ''}</td>
        <td className="py-1.5 pr-3 text-gray-300">{entry.amount_opened || 0}</td>
        <td className="py-1.5 pr-3 text-gray-300">{loc?.name || '–'}</td>
        <td className="py-1.5 pr-3 text-gray-300">
          {fmtDate(entry.purchased_date)}
          {scannedAgo !== null && scannedAgo > 0 && (
            <span className="text-xs text-gray-500 ml-1">({scannedAgo}d ago)</span>
          )}
        </td>
        <td className="py-1.5 pr-3 text-gray-300">{entry.best_before_days ?? '–'}</td>
        <td className="py-1.5 pr-3 text-gray-300">{fmtDate(entry.best_before_date)}</td>
        <td className="py-1.5 pr-3 text-gray-300">
          {daysLeft === null
            ? '–'
            : daysLeft < 0
              ? <span className="text-red-400">{Math.abs(daysLeft)}d ago</span>
              : <span>{daysLeft}d</span>}
        </td>
        <td className="py-1.5 text-right">
          <button
            onClick={() => handleSpoilLot(entry.id)}
            className="text-amber-400 hover:text-amber-300 text-xs mr-2"
            title="Spoil this lot"
          >🗑️🦠</button>
          <button
            onClick={() => handleDeleteEntry(entry.id)}
            className="text-red-500 hover:text-red-700 text-xs"
            title="Delete"
          >🗑️</button>
        </td>
      </tr>
    );
  })}
</tbody>
```

The Spoil button uses two emojis to distinguish it from plain Delete in the same row — consistent with the project's "emoji is the icon system" convention. Sentence-case button titles per the design system.

- [ ] **Step 7.6: Add a "Purchased on" field to the add modal**

In `HA-storage/storage/frontend/src/components/Stock.jsx`, find the add-modal form (search for `case 'add'` in `handleSubmit`, around line 262). Two changes:

First, add a piece of state next to the other modal form state (around line 188):

```javascript
const [formPurchased, setFormPurchased] = useState('');
```

And reset it in `openModal` (around line 248):

```javascript
setFormPurchased('');
```

Second, in the add-modal form JSX (search for the `<label>` containing "Best Before"), add a sibling `<label>` directly above it:

```jsx
<label className="block">
  <span className="text-sm text-gray-400">Purchased on (leave empty for today)</span>
  <input
    type="date"
    value={formPurchased}
    onChange={(e) => setFormPurchased(e.target.value)}
    className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100"
  />
</label>
```

Third, in `handleSubmit` inside the `case 'add'` block (line 261-265), include the override:

```javascript
case 'add': {
  const payload = { product_id: Number(pid), amount: Number(formAmt) };
  if (formLoc) payload.location_id = Number(formLoc);
  if (formBB) payload.best_before_date = formBB;
  if (formPurchased) payload.purchased_date = formPurchased;
  await addStock(payload);
  break;
}
```

- [ ] **Step 7.7: Verify in the dev server**

```bash
cd HA-storage/storage/frontend && npm install
cd HA-storage/storage/frontend && npm run dev
```

Open the dev URL. Manual check list:
- Existing stock page renders without console errors.
- Expand a product → the table now has Scanned, BB (days), Days left columns, plus a 🗑️🦠 button per row.
- Open the Add modal → "Purchased on" date input is visible above the existing best-before input.
- Add a lot with a back-dated Purchased on → it appears in the table with the correct days-left.
- Click 🗑️🦠 on a lot → confirmation dialog, then the lot disappears and a spoil history event is logged (verify in the History page if available).

If anything is wrong, fix it. Do not commit until the manual checks pass.

- [ ] **Step 7.8: Commit**

```bash
cd HA-storage && git add storage/frontend/src/api.js storage/frontend/src/components/Stock.jsx
cd HA-storage && git commit -m "feat(storage): lot inspector + per-lot spoil + purchased_date input"
```

---

## Task 8: Dashboard expiring-row enhancement

**Files:**
- Modify: `HA-storage/storage/frontend/src/components/Dashboard.jsx:246-285`

- [ ] **Step 8.1: Add the helper inside `Dashboard.jsx`**

In `HA-storage/storage/frontend/src/components/Dashboard.jsx`, near the top of the component or wherever local helpers live, add:

```javascript
function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
```

- [ ] **Step 8.2: Render the "scanned NN days ago" label**

In `HA-storage/storage/frontend/src/components/Dashboard.jsx`, find the JSX block that renders each expiring item (search for `expiring.map`, around line 261). Inside the cell that shows the product name, add a muted line below the name:

```jsx
{(() => {
  const ago = daysSince(item.purchased_date);
  return ago !== null && ago > 0
    ? <div className="text-xs text-gray-500">scanned {ago}d ago</div>
    : null;
})()}
```

Place it directly after the existing product-name node and before the days-left chip on the right. The exact insertion point depends on how the current row JSX is structured — keep the chip alignment intact.

- [ ] **Step 8.3: Verify in the dev server**

```bash
cd HA-storage/storage/frontend && npm run dev
```

Manual check:
- Dashboard "Expiring soon" panel still renders.
- Rows with a `purchased_date` show a muted "scanned Nd ago" sub-line under the name.
- Rows with no `purchased_date` (legacy data) do not show the label.

- [ ] **Step 8.4: Commit**

```bash
cd HA-storage && git add storage/frontend/src/components/Dashboard.jsx
cd HA-storage && git commit -m "feat(storage): show 'scanned Nd ago' on Dashboard expiring panel"
```

---

## Task 9: Version bump + changelog + integration manifest

**Files:**
- Modify: `HA-storage/storage/config.json` (top-level `version`)
- Modify: `HA-storage/storage/CHANGELOG.md` (prepend `## 0.9.0`)
- Modify: `HA-storage/custom_components/ha_storage/manifest.json` (`version`)

The convention from the root `CLAUDE.md`: changelog headers are plain `## X.Y.Z` only, no bracketed versions, no dates.

- [ ] **Step 9.1: Bump add-on version**

In `HA-storage/storage/config.json`, change:

```json
"version": "0.8.2",
```

to:

```json
"version": "0.9.0",
```

- [ ] **Step 9.2: Bump integration version**

In `HA-storage/custom_components/ha_storage/manifest.json`, change:

```json
"version": "0.1.1",
```

to:

```json
"version": "0.2.0",
```

- [ ] **Step 9.3: Prepend changelog section**

In `HA-storage/storage/CHANGELOG.md`, insert at the very top (above the existing `## 0.8.2` line):

```markdown
## 0.9.0
- Strengthened expiry tracking. Each stock lot now snapshots `(purchased_date, best_before_days)` at add time, so a later edit to a product's `default_best_before_days` does not retroactively shift existing stock.
- Fixed FIFO ordering. `consume`, `open`, and `transfer` now sort by `best_before_date ASC` with NULL dates LAST (was first), tie-breaking by `purchased_date` then `id`. Previously a no-expiry lot would be eaten before a real one.
- `POST /stock/spoil/{lot_id}` — new endpoint. Targets a specific lot (whole or partial amount) and logs a `spoil` history event tied to that lot.
- `POST /stock/add` accepts an optional `purchased_date` override, for receipt imports and manual backfill.
- `StockEntry` responses gain `best_before_days`.
- Storage frontend lot inspector now shows `Scanned`, `BB (days)`, `Days left`, plus a per-lot Spoil button. The Dashboard "Expiring soon" panel labels each row with "scanned Nd ago".
- Migration is automatic and idempotent: new column added to `stock`, existing rows backfilled from each product's current `default_best_before_days`, FIFO index created. Live `best_before_date` values are not recomputed.
```

- [ ] **Step 9.4: Confirm the test suite is still green**

```bash
cd HA-storage/storage && python -m pytest app/tests/ -v
```

- [ ] **Step 9.5: Commit**

```bash
cd HA-storage && git add storage/config.json storage/CHANGELOG.md custom_components/ha_storage/manifest.json
cd HA-storage && git commit -m "chore(storage): bump 0.8.2 → 0.9.0 (expiry lots)"
```

---

## Task 10: Push submodule, update root pointer

**Files:**
- `HA-storage/` (submodule push)
- Root repo pointer commit

- [ ] **Step 10.1: Push the HA-storage submodule**

```bash
cd HA-storage && git push
```

- [ ] **Step 10.2: Update the root pointer**

```bash
git -C /home/glitch/GIT/HA-apps add HA-storage
git -C /home/glitch/GIT/HA-apps commit -m "Bump HA-Storage 0.9.0 — strengthened expiry / lot tracking"
```

- [ ] **Step 10.3: (Optional) push the root repo**

```bash
git -C /home/glitch/GIT/HA-apps push
```

Skip this if the user wants to inspect first.

---

## Self-Review

**Spec coverage check** — running through each section of `2026-05-13-storage-expiry-lots-design.md`:

| Spec section | Implementing task(s) |
|---|---|
| Data model — new column `best_before_days` | Task 1 |
| Data model — FIFO index | Task 1 |
| Per-lot semantics — `purchased_date` reused as anchor | Task 3 |
| Per-lot semantics — `best_before_days` snapshot | Task 3 |
| Per-lot semantics — `best_before_date` derived, user override wins | Task 3 |
| `POST /stock/add` accepts `purchased_date` | Task 2 (model) + Task 3 (handler) |
| `POST /stock/consume/open/transfer` deterministic FIFO | Task 4 |
| `POST /stock/transfer` copies `best_before_days` | Task 5 |
| `POST /stock/spoil/{lot_id}` | Task 6 |
| `StockEntry` gains `best_before_days` | Task 2 |
| `GET /stock/product/{id}` uses canonical FIFO | Task 4 (step 4.7) |
| `GET /stock/entries` uses canonical FIFO + new field flows through | Task 4 (step 4.8) + Task 2 |
| Migration — column + backfill + index | Task 1 |
| UI — lot inspector enhancements in `Stock.jsx` | Task 7 |
| UI — `Purchased on` field in add modal | Task 7 (step 7.6) |
| UI — Dashboard "scanned Nd ago" label | Task 8 |
| Integration coordinator unchanged | (no task — passes through automatically because the wire format is just extended) |
| Tests — 11 cases listed in spec | Tasks 1, 3, 4, 5, 6 |
| Versioning — config.json + CHANGELOG.md + manifest.json | Task 9 |
| Out of scope — receipt parser plumbing of `purchased_date` | (no task — explicit out-of-scope in spec) |

All 11 spec tests are covered:
1. Migration backfill → Task 1 (`test_existing_rows_get_best_before_days_backfilled`)
2. Anchor derivation → Task 3 (`test_anchor_derivation_default`)
3. User override sticks → Task 3 (`test_user_override_best_before_date_sticks`)
4. `purchased_date` override → Task 3 (`test_purchased_date_override_shifts_expiry`)
5. Product default change doesn't affect existing lots → Task 3 (`test_product_default_change_does_not_affect_existing_lots`)
6. FIFO — NULL last → Task 4 (`test_null_expiry_consumed_last_not_first`)
7. FIFO — tie-break by purchased_date → Task 4 (`test_tiebreak_by_purchased_date`)
8. Targeted spoil whole lot → Task 6 (`test_spoil_whole_lot`)
9. Targeted spoil partial → Task 6 (`test_spoil_partial_amount`)
10. Targeted spoil clamp → Task 6 (`test_spoil_amount_clamps_to_lot_amount`)
11. Transfer copies `best_before_days` → Task 5 (`test_transfer_copies_best_before_days`)

Bonus: Task 6 also adds a 404-on-unknown-lot test (`test_spoil_unknown_lot_returns_404`), not in the spec but useful for boundary coverage.

**Type / name consistency check:**
- `StockSpoilLot` model name → used in Task 6 import and route signature. Consistent.
- `_FIFO_ORDER_SQL` constant → used in Task 4 steps 4.4–4.7. Step 4.8 uses an inline copy (with `s.` prefix) for the join query — flagged with a comment so future readers see why.
- `spoilStockLot` JS helper → declared in Task 7 step 7.1, imported in step 7.2, called in step 7.4. Consistent.
- `daysSince` is declared in both `Stock.jsx` (Task 7 step 7.3) and `Dashboard.jsx` (Task 8 step 8.1). Both copies are identical 4-liners. The duplication is acceptable per the design system style (no shared utils module in this frontend today); promoting to a shared helper is out of scope.

**Placeholder scan:** none found. All code blocks are complete.
