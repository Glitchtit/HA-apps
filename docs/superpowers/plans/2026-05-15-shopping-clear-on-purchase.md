# Clear Shopping Items on Purchase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When stock is added (`POST /stock/add`), automatically clear matching **manual** shopping list rows in HA-storage, quantity-aware, hard-deleting once amount reaches zero. Auto-added rows remain under the existing `min_stock_amount` logic.

**Architecture:** Backend-only change in HA-storage. Add a sibling helper `consume_shopping_for_purchase()` next to the existing `sync_auto_shopping()` in `routers/shopping.py`. Call it from `add_stock()` in `routers/stock.py` right before the existing `sync_auto_shopping(conn)` call (post-commit, matching the existing pattern — `add_stock` commits the stock insert before either helper runs). No frontend or HACS integration changes.

**Tech Stack:** Python 3, FastAPI, sqlite3, pytest with `TestClient` (existing scaffolding in `HA-storage/storage/app/tests/test_api.py`).

**Spec:** `docs/superpowers/specs/2026-05-15-shopping-clear-on-purchase-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `HA-storage/storage/app/routers/shopping.py` | New `consume_shopping_for_purchase()` helper next to `sync_auto_shopping()`. |
| Modify | `HA-storage/storage/app/routers/stock.py` | Import the new helper; call it inside `add_stock()` immediately before the existing `sync_auto_shopping(conn)` (~line 190). |
| Modify | `HA-storage/storage/app/tests/test_api.py` | Add `TestShoppingClearOnPurchase` class with the seven scenarios from the spec. |
| Modify | `HA-storage/storage/config.json` | Bump `version` `0.12.3` → `0.12.4`. |
| Modify | `HA-storage/storage/CHANGELOG.md` | Add `## 0.12.4` entry at the top. |
| Modify | `HA-apps/` root | Bump `HA-storage` submodule pointer after submodule commit/push. |

No new files. The HACS integration manifest (`HA-storage/custom_components/ha_storage/manifest.json`) is **not** bumped — no integration code changes.

---

## Working directory & submodule note

All file paths below are relative to the **HA-storage submodule root** unless prefixed with `HA-apps/`. Submodule workflow per repo convention: commit and push inside `HA-storage/` first, then bump the submodule pointer in the `HA-apps/` superrepo as the very last task.

```bash
cd /home/glitch/GIT/HA-apps/HA-storage
```

---

## Task 1: TDD the helper — core happy path

**Files:**
- Modify: `storage/app/tests/test_api.py` (append new test class near `TestShoppingList`, around line 442)
- Modify: `storage/app/routers/shopping.py` (add helper after `sync_auto_shopping`, before `_get_db`-using endpoints — around line 86)
- Modify: `storage/app/routers/stock.py` (import + call in `add_stock`, ~line 190)

### Background for the implementer

- `shopping_list` schema columns: `id, product_id, amount, unit_id, note, done, recipe_id, auto_added, ha_item_name, created_at`. See `storage/app/database.py:112-121`.
- `add_stock()` lives at `storage/app/routers/stock.py:116`. It resolves the effective unit at line 123: `unit_id = body.unit_id or product["unit_id"]`. **Pass the resolved `unit_id` to the new helper**, not `body.unit_id` — otherwise rows that match the product default unit will be missed when callers omit `unit_id` from the request.
- `add_stock` commits the stock insert at line 186 and then calls `sync_auto_shopping(conn)` at line 190 (post-commit). The new helper runs **between** the commit and `sync_auto_shopping`, matching the existing pattern.
- Existing import in `routers/stock.py:21`: `from routers.shopping import sync_auto_shopping`. Extend that import.
- Existing test fixtures: `test_api.py` shares a single module-level `TestClient(app)` and `os.environ["DATA_DIR"]` to a fresh tempdir. Tests use unique product names (e.g. `f"Shop_{id(self)}"`) to avoid cross-test collisions. Follow that style.

### Steps

- [ ] **Step 1: Add the failing test class skeleton with two tests (full consume + partial consume)**

Append to `storage/app/tests/test_api.py` after the `TestShoppingProposal` class (or anywhere after `TestShoppingList`):

```python
# ── Shopping clear on purchase ─────────────────────────────────────────────

class TestShoppingClearOnPurchase:
    """When /stock/add fires, manual shopping rows for that product are
    decremented quantity-aware and hard-deleted once amount reaches 0."""

    def _setup(self):
        units = {u["abbreviation"]: u["id"] for u in client.get("/api/units").json()}
        loc_id = client.get("/api/locations").json()[0]["id"]
        pid = client.post(
            "/api/products",
            json={"name": f"ClearOnBuy_{id(self)}_{self.__class__.__name__}",
                  "unit_id": units["kpl"]},
        ).json()["id"]
        return pid, units["kpl"], loc_id

    def _add_manual(self, pid, amount, unit_id=None):
        return client.post(
            "/api/shopping-list",
            json={"product_id": pid, "amount": amount, "unit_id": unit_id},
        ).json()

    def _shopping_rows_for(self, pid):
        return [r for r in client.get("/api/shopping-list").json()
                if r["product_id"] == pid]

    def test_full_consume_deletes_row(self):
        pid, kpl, loc_id = self._setup()
        item = self._add_manual(pid, amount=1, unit_id=kpl)
        assert self._shopping_rows_for(pid) != []

        r = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "unit_id": kpl,
                  "location_id": loc_id},
        )
        assert r.status_code == 201

        assert self._shopping_rows_for(pid) == [], \
            "manual shopping row should be hard-deleted when amount hits 0"

    def test_partial_consume_decrements_row(self):
        pid, kpl, loc_id = self._setup()
        item = self._add_manual(pid, amount=6, unit_id=kpl)

        r = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "unit_id": kpl,
                  "location_id": loc_id},
        )
        assert r.status_code == 201

        rows = self._shopping_rows_for(pid)
        assert len(rows) == 1
        assert rows[0]["id"] == item["id"]
        assert rows[0]["amount"] == 5
        assert rows[0]["done"] is False
```

- [ ] **Step 2: Run the new tests, expect FAIL**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage
python -m pytest app/tests/test_api.py::TestShoppingClearOnPurchase -v
```

Expected: both tests fail because `add_stock` does not yet touch manual shopping rows — `test_full_consume_deletes_row` will see the row still present; `test_partial_consume_decrements_row` will see `amount` still at 6.

- [ ] **Step 3: Add the helper to `storage/app/routers/shopping.py`**

Insert immediately after `sync_auto_shopping()` (after the closing `return {"added": added, "removed": removed}` block, before line 88's `@router.get("/shopping-list", ...)`):

```python
def consume_shopping_for_purchase(
    conn,
    product_id: int,
    amount: float,
    unit_id: int | None,
) -> list[int]:
    """Decrement manual shopping rows when stock is purchased for `product_id`.

    Targets the disjoint complement of `sync_auto_shopping`: matches only
    non-done **manual** rows (`auto_added = 0`, `done = 0`) for the given
    product whose `unit_id` is equivalent to the purchase's `unit_id`
    (treating NULL/NULL as a match).

    Iterates oldest-first (`created_at ASC`), subtracting `amount` from each
    matching row. A row whose new amount is `<= 0` is hard-deleted and the
    leftover (the negation of `new_amount`) spills into the next row. Rows
    whose new amount stays `> 0` are updated in place.

    Returns the list of affected row ids (deleted or updated). The helper
    commits only if at least one row changed, matching `sync_auto_shopping`.
    """
    rows = conn.execute(
        """
        SELECT id, amount FROM shopping_list
        WHERE product_id = ?
          AND auto_added = 0
          AND done = 0
          AND ((unit_id IS NULL AND ? IS NULL) OR unit_id = ?)
        ORDER BY created_at ASC, id ASC
        """,
        (product_id, unit_id, unit_id),
    ).fetchall()

    remaining = float(amount)
    affected: list[int] = []
    for row in rows:
        if remaining <= 0:
            break
        new_amount = float(row["amount"]) - remaining
        if new_amount <= 0:
            conn.execute("DELETE FROM shopping_list WHERE id = ?", (row["id"],))
            remaining = -new_amount  # spill leftover into next row
        else:
            conn.execute(
                "UPDATE shopping_list SET amount = ? WHERE id = ?",
                (new_amount, row["id"]),
            )
            remaining = 0
        affected.append(row["id"])

    if affected:
        conn.commit()
        log.info(
            "Shopping clear-on-purchase: product=%d, amount=%.3f, affected=%d",
            product_id, amount, len(affected),
        )
    return affected
```

Notes for the implementer:
- `id ASC` is a deterministic tiebreaker — `created_at` is a TEXT timestamp and two rows inserted in the same second would otherwise have an unspecified order.
- Uses the same `log = logging.getLogger(__name__)` already defined at module level (`shopping.py:18`).
- The helper does **not** raise on "no matching rows" — that's a normal no-op.

- [ ] **Step 4: Wire the helper into `add_stock()`**

In `storage/app/routers/stock.py`:

Extend the existing import at line 21:

```python
from routers.shopping import sync_auto_shopping, consume_shopping_for_purchase
```

Then in `add_stock()` (line 116), find the existing trailing block (around line 189-191):

```python
    entry = conn.execute("SELECT * FROM stock WHERE id = ?", (cur.lastrowid,)).fetchone()
    sync_auto_shopping(conn)
    return entry
```

Insert the new helper call **before** `sync_auto_shopping(conn)`:

```python
    entry = conn.execute("SELECT * FROM stock WHERE id = ?", (cur.lastrowid,)).fetchone()
    consume_shopping_for_purchase(conn, body.product_id, body.amount, unit_id)
    sync_auto_shopping(conn)
    return entry
```

Important: pass `unit_id` (the local variable resolved at line 123: `unit_id = body.unit_id or product["unit_id"]`) — **not** `body.unit_id`. This is the unit the purchase is actually being recorded in.

- [ ] **Step 5: Run the two new tests, expect PASS**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage
python -m pytest app/tests/test_api.py::TestShoppingClearOnPurchase -v
```

Expected: both tests pass.

- [ ] **Step 6: Run the entire test_api.py to confirm no regressions**

In particular, `TestShoppingList::test_auto_sync_adds_and_removes` and `TestShoppingList::test_auto_sync_keeps_done_rows` exercise the existing `/stock/add` → `sync_auto_shopping` flow and must still pass — they use **auto-added** rows, which the new helper deliberately leaves untouched.

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage
python -m pytest app/tests/test_api.py -v
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage
git add storage/app/routers/shopping.py storage/app/routers/stock.py storage/app/tests/test_api.py
git commit -m "feat(shopping): clear manual rows on /stock/add

When /stock/add fires for a product, decrement matching manual shopping
rows (auto_added=0, done=0) by the purchased amount, hard-deleting rows
that reach 0 and spilling leftover into the next matching row.
Auto-added rows are untouched — they continue to be managed by
sync_auto_shopping() against min_stock_amount."
```

---

## Task 2: Edge-case tests — spill, guardrails, unit mismatch

**Files:**
- Modify: `storage/app/tests/test_api.py` (extend `TestShoppingClearOnPurchase` from Task 1)

### Steps

- [ ] **Step 1: Add five edge-case tests to the existing class**

Append these methods inside `class TestShoppingClearOnPurchase:` after `test_partial_consume_decrements_row`:

```python
    def test_spill_across_rows(self):
        """Purchase amount exceeds first row → leftover spills to next row,
        oldest first."""
        pid, kpl, loc_id = self._setup()
        # Two rows, insertion order is the implicit oldest→newest order
        first = self._add_manual(pid, amount=1, unit_id=kpl)
        second = self._add_manual(pid, amount=2, unit_id=kpl)

        r = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 2, "unit_id": kpl,
                  "location_id": loc_id},
        )
        assert r.status_code == 201

        rows = self._shopping_rows_for(pid)
        assert len(rows) == 1
        assert rows[0]["id"] == second["id"]
        assert rows[0]["amount"] == 1  # 2 - (2 - 1)

    def test_auto_added_row_untouched(self):
        """Auto-added rows remain governed by sync_auto_shopping (min_stock).
        The new helper must not touch them."""
        kpl = next(u["id"] for u in client.get("/api/units").json()
                   if u["abbreviation"] == "kpl")
        loc_id = client.get("/api/locations").json()[0]["id"]
        # min_stock_amount high so sync_auto_shopping won't clear after restock
        pid = client.post(
            "/api/products",
            json={"name": f"ClearOnBuyAuto_{id(self)}",
                  "unit_id": kpl, "min_stock_amount": 10},
        ).json()["id"]
        # Force an auto-added row via the sync endpoint
        client.post("/api/shopping-list/sync")
        rows = [r for r in client.get("/api/shopping-list").json()
                if r["product_id"] == pid]
        assert len(rows) == 1 and rows[0]["auto_added"] is True
        original_amount = rows[0]["amount"]

        # Buy 1 — stock still below min_stock_amount, sync_auto_shopping
        # leaves the auto-added row in place; the new helper must too.
        client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "unit_id": kpl,
                  "location_id": loc_id},
        )
        rows_after = [r for r in client.get("/api/shopping-list").json()
                      if r["product_id"] == pid]
        assert len(rows_after) == 1
        assert rows_after[0]["auto_added"] is True
        assert rows_after[0]["amount"] == original_amount

    def test_unit_mismatch_skips_row(self):
        """Shopping row in unit A, purchase in unit B → row untouched."""
        units = {u["abbreviation"]: u["id"] for u in client.get("/api/units").json()}
        loc_id = client.get("/api/locations").json()[0]["id"]
        pid = client.post(
            "/api/products",
            json={"name": f"ClearOnBuyUnit_{id(self)}",
                  "unit_id": units["kpl"]},
        ).json()["id"]
        item = client.post(
            "/api/shopping-list",
            json={"product_id": pid, "amount": 2, "unit_id": units["l"]},
        ).json()

        r = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "unit_id": units["kpl"],
                  "location_id": loc_id},
        )
        assert r.status_code == 201

        rows = self._shopping_rows_for(pid)
        assert len(rows) == 1
        assert rows[0]["id"] == item["id"]
        assert rows[0]["amount"] == 2

    def test_stock_consume_does_not_clear_shopping(self):
        """Consume is using existing stock, not buying — must not fire the
        new helper."""
        pid, kpl, loc_id = self._setup()
        # Seed stock so consume succeeds
        client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 5, "unit_id": kpl,
                  "location_id": loc_id},
        )
        # Add a fresh manual shopping row after the stock-add (the stock-add
        # itself would have cleared a pre-existing row).
        item = self._add_manual(pid, amount=1, unit_id=kpl)

        r = client.post(
            "/api/stock/consume",
            json={"product_id": pid, "amount": 1},
        )
        assert r.status_code == 200

        rows = self._shopping_rows_for(pid)
        assert len(rows) == 1
        assert rows[0]["id"] == item["id"]
        assert rows[0]["amount"] == 1

    def test_no_matching_rows_is_noop(self):
        """Purchase for a product with no shopping rows succeeds normally."""
        pid, kpl, loc_id = self._setup()
        r = client.post(
            "/api/stock/add",
            json={"product_id": pid, "amount": 1, "unit_id": kpl,
                  "location_id": loc_id},
        )
        assert r.status_code == 201
        assert self._shopping_rows_for(pid) == []
```

- [ ] **Step 2: Run the new tests, expect PASS**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage
python -m pytest app/tests/test_api.py::TestShoppingClearOnPurchase -v
```

Expected: all 7 tests (2 from Task 1 + 5 from Task 2) pass.

- [ ] **Step 3: Run the full test suite to confirm no broader regressions**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage
python -m pytest app/tests/ -v
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage
git add storage/app/tests/test_api.py
git commit -m "test(shopping): edge cases for clear-on-purchase

Cover spill across rows, auto-added rows untouched, unit mismatch
skipped, /stock/consume not firing the helper, and no-matching-rows
no-op."
```

---

## Task 3: Version bump + changelog + submodule pointer

**Files:**
- Modify: `storage/config.json`
- Modify: `storage/CHANGELOG.md`
- Modify: `HA-apps/HA-storage` submodule pointer

### Steps

- [ ] **Step 1: Bump `storage/config.json` version**

Open `storage/config.json`. Change:

```json
"version": "0.12.3",
```

to:

```json
"version": "0.12.4",
```

Leave the rest of the file untouched.

- [ ] **Step 2: Add changelog entry at the top of `storage/CHANGELOG.md`**

Insert the following block **above** the existing `## 0.12.3` header (the file uses plain `## X.Y.Z` headers — no brackets, no dates — Supervisor parses on that exact shape):

```markdown
## 0.12.4
- Buying a tracked product now clears matching **manual** shopping list rows automatically. `POST /api/stock/add` decrements every non-done manual row (`auto_added = 0`) for that product whose unit matches the purchase, oldest-first; rows that reach amount 0 are hard-deleted, and any leftover spills into the next matching row. Unit mismatches are skipped — no automatic conversion. Auto-added rows continue to be managed by the existing `sync_auto_shopping()` against `min_stock_amount`, so the two mechanisms cover disjoint sets.
```

- [ ] **Step 3: Sanity-check the version is consistent and tests still green**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage
grep -m1 '"version"' config.json
head -3 CHANGELOG.md
python -m pytest app/tests/ -v
```

Expected: `config.json` shows `0.12.4`, `CHANGELOG.md` starts with `## 0.12.4`, all tests pass.

- [ ] **Step 4: Commit inside HA-storage and push**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage
git add storage/config.json storage/CHANGELOG.md
git commit -m "release: 0.12.4 — clear manual shopping rows on purchase"
git push
```

- [ ] **Step 5: Bump submodule pointer in HA-apps superrepo**

```bash
cd /home/glitch/GIT/HA-apps
git add HA-storage
git commit -m "Bump HA-storage to 0.12.4: clear shopping items on purchase"
```

(Push to the superrepo is the user's call — leave it staged-and-committed locally unless they ask for `git push`.)

- [ ] **Step 6: Final verification**

```bash
cd /home/glitch/GIT/HA-apps
git log --oneline -3
git submodule status HA-storage
```

Expected: top commit is the submodule-pointer bump; `git submodule status` shows the new commit hash (no `+` or `-` prefix indicating drift).

---

## Acceptance criteria

- [ ] `TestShoppingClearOnPurchase` (7 tests) all pass.
- [ ] Existing `TestShoppingList::test_auto_sync_adds_and_removes` and `TestShoppingList::test_auto_sync_keeps_done_rows` still pass (auto-added behavior unchanged).
- [ ] Full `pytest app/tests/` is green.
- [ ] `storage/config.json` reports `0.12.4`.
- [ ] `storage/CHANGELOG.md` has a `## 0.12.4` entry at the top.
- [ ] HA-storage submodule is committed + pushed; HA-apps superrepo has a matching submodule-pointer commit locally.

## Out of scope (reaffirmed)

- HA-stock frontend changes.
- HA-storage HACS integration changes (`custom_components/ha_storage/`).
- Triggering on `/stock/consume`.
- Cross-unit conversion via `pack_size`.
- Touching auto-added rows.
- History event for "shopping cleared" (additive future work, see spec §9).
