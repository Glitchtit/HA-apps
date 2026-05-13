# Shopping Chore Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the HA-grocy-stock shopping scanner finishes, prompt for who did the shopping and who did the scanning, complete the corresponding HA-chores chores for each picked person, suppress the auto-spawned "Unpack & scan" follow-up when a scanner is picked, and defer level-up / badge / power-up celebrations to HA-chores' next mount.

**Architecture:** Stock stays pure-frontend; its nginx proxies a new `/api/chores/` upstream to HA-chores' FastAPI (port 8100). Stock's React modal fans out one HTTP POST per `(chore × person)` pair to a new `/api/shopping-hook/complete` endpoint on Chores. Chores' existing `complete_instance` body is refactored into an `apply_completion` helper shared with the new hook; the helper writes any celebrations into a new `pending_celebrations` table, drained by Chores' `GameEffects.jsx` on mount.

**Tech Stack:** Python 3 / FastAPI / SQLite (Chores), React + axios (Stock & Chores frontends), nginx + bashio s6-overlay (Stock add-on), pytest.

**Spec:** `docs/superpowers/specs/2026-05-13-shopping-chore-attribution-design.md`

---

## File map

**HA-chores (backend + frontend):**
- Modify `HA-chores/chores/app/database.py` — add `pending_celebrations` table to SCHEMA.
- Modify `HA-chores/chores/app/routers/assignments.py` — extract `apply_completion`; add `suppress_followup` plumbing; write celebrations.
- Create `HA-chores/chores/app/routers/shopping_hook.py` — new `POST /api/shopping-hook/complete`.
- Modify `HA-chores/chores/app/routers/persons.py` — add `me/pending-celebrations` GET + ACK.
- Modify `HA-chores/chores/app/models.py` — add `PendingCelebration`, `HookBody`, `AckBody`.
- Modify `HA-chores/chores/app/main.py` — include new router.
- Modify `HA-chores/chores/app/tests/test_api.py` — new tests.
- Modify `HA-chores/chores/config.json` — `ports: {"8100/tcp": null}`, version bump.
- Modify `HA-chores/chores/CHANGELOG.md` — new entry.
- Modify `HA-chores/chores/frontend/src/api.js` — pending-celebration helpers, config helpers.
- Modify `HA-chores/chores/frontend/src/components/effects/GameEffects.jsx` — drain on mount.
- Modify `HA-chores/chores/frontend/src/components/Settings.jsx` — chore-id pickers.

**HA-grocy-stock (add-on plumbing + frontend):**
- Modify `HA-grocy-stock/grocy_stock/config.json` — `chores_url` option, version bump.
- Modify `HA-grocy-stock/grocy_stock/CHANGELOG.md` — new entry.
- Modify `HA-grocy-stock/grocy_stock/rootfs/etc/s6-overlay/s6-rc.d/grocy-stock/run` — `_detect_chores` + `CHORES_URL` export + envsubst.
- Modify `HA-grocy-stock/grocy_stock/nginx.conf.template` — `/api/chores/` proxy block.
- Create `HA-grocy-stock/grocy_stock/frontend/src/components/ShoppingAttributionModal.jsx` — modal component.
- Modify `HA-grocy-stock/grocy_stock/frontend/src/App.jsx` — wire modal into `handleScannerClose`; new `CHORES_API` const.

---

## Task 1: Add `pending_celebrations` table

**Files:**
- Modify: `HA-chores/chores/app/database.py`
- Modify: `HA-chores/chores/app/tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Append to `HA-chores/chores/app/tests/test_api.py` (at the end of the file):

```python
class TestPendingCelebrationsSchema:
    def test_table_exists_after_initialize(self, tmp_db):
        row = tmp_db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_celebrations'"
        ).fetchone()
        assert row is not None

    def test_table_columns(self, tmp_db):
        cols = {r["name"] for r in tmp_db.execute(
            "PRAGMA table_info(pending_celebrations)"
        ).fetchall()}
        assert cols == {"id", "person_id", "payload", "created_at", "seen_at"}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsSchema -v
```

Expected: both tests fail (table doesn't exist).

- [ ] **Step 3: Add the table to the SCHEMA string**

In `HA-chores/chores/app/database.py`, append to the `SCHEMA` string (after the `pet_states` table, before the closing `"""`):

```sql

CREATE TABLE IF NOT EXISTS pending_celebrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id   TEXT    NOT NULL REFERENCES persons(entity_id) ON DELETE CASCADE,
    payload     TEXT    NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    seen_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_celebrations_person_unseen
    ON pending_celebrations(person_id, created_at)
    WHERE seen_at IS NULL;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsSchema -v
```

Expected: PASS.

- [ ] **Step 5: Run the full chores test suite to confirm no regressions**

```bash
cd HA-chores/chores && python -m pytest app/tests/ -v
```

Expected: all green (no existing tests rely on table count).

- [ ] **Step 6: Commit**

```bash
cd HA-chores
git add chores/app/database.py chores/app/tests/test_api.py
git commit -m "Add pending_celebrations table"
```

---

## Task 2: Refactor `complete_instance` — extract `apply_completion`

**Files:**
- Modify: `HA-chores/chores/app/routers/assignments.py`
- Test: `HA-chores/chores/app/tests/test_api.py` (existing test must still pass)

This is a pure refactor — no behaviour change. The existing `test_complete_instance` in `test_api.py` is our regression guard.

- [ ] **Step 1: Run the existing complete-instance test to capture green baseline**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestAssignments::test_complete_instance -v
```

Expected: PASS. If not, stop and investigate before touching anything.

- [ ] **Step 2: Replace `complete_instance` with a thin wrapper around a new `apply_completion` helper**

In `HA-chores/chores/app/routers/assignments.py`, replace the entire `async def complete_instance(...)` body (currently lines 144–275, the function decorated with `@router.post("/{instance_id}/complete", response_model=CompleteResult)`) with this structure:

```python
def apply_completion(
    conn,
    instance_row,
    completed_by: str,
    notes: str,
    *,
    bg: BackgroundTasks | None,
    suppress_followup: bool = False,
) -> dict:
    """Shared completion logic. Returns the same dict shape as CompleteResult."""
    row = instance_row
    if row["status"] == "completed":
        raise HTTPException(400, "Already completed")

    was_overdue = row["status"] == "overdue"

    person = conn.execute(
        "SELECT * FROM persons WHERE entity_id = ?", (completed_by,)
    ).fetchone()
    streak = person["current_streak"] if person else 0
    old_level = person["level"] if person else 1

    early = date.fromisoformat(row["due_date"]) > date.today()
    claimed = row["assignment_mode"] == "claim" and row["assigned_to"] == completed_by
    xp = calculate_xp(
        base_xp=row["xp_reward"],
        streak=streak,
        early=early,
        claimed=claimed,
    )

    difficulty = row["chore_difficulty"] or "medium"
    powerup_multiplier, consumed_powerup = apply_powerup_to_xp(completed_by, difficulty)
    if powerup_multiplier != 1.0:
        xp = max(1, int(xp * powerup_multiplier))

    now = datetime.now().isoformat()
    conn.execute(
        """UPDATE chore_instances
           SET status = 'completed', completed_at = ?, completed_by = ?,
               xp_awarded = ?, notes = ?
           WHERE id = ?""",
        (now, completed_by, xp, notes, row["id"]),
    )
    conn.commit()

    new_streak, _ = update_streak(completed_by)
    new_total, new_level, leveled_up = add_xp(completed_by, xp)

    earned_powerup = None
    if leveled_up:
        try:
            earned_powerup = award_levelup_powerup(completed_by, new_level)
        except Exception as e:
            logger.warning("Failed to award level-up power-up: %s", e)

    try:
        pets.ensure_pet(conn, completed_by)
        old_happiness = conn.execute(
            "SELECT happiness FROM pet_states WHERE person_id = ?",
            (completed_by,),
        ).fetchone()
        prev_happiness = old_happiness["happiness"] if old_happiness else 80
        new_happiness = pets.bump_happiness(conn, completed_by, was_overdue=was_overdue)
        pet_delta = new_happiness - prev_happiness
    except Exception as e:
        logger.warning("Failed to bump pet happiness: %s", e)
        new_happiness = None
        pet_delta = None

    new_badges = check_and_award_badges(completed_by)
    if bg is not None:
        for badge in new_badges:
            bg.add_task(
                notify_badge_earned, completed_by, badge["name"], badge["icon"]
            )
        if leveled_up:
            bg.add_task(notify_level_up, completed_by, new_level)

    updated = conn.execute(
        """SELECT ci.*, c.name as chore_name, c.icon as chore_icon, c.difficulty as chore_difficulty, c.assignment_mode as chore_assignment_mode
           FROM chore_instances ci JOIN chores c ON ci.chore_id = c.id
           WHERE ci.id = ?""",
        (row["id"],),
    ).fetchone()

    followup_name: str | None = None
    followup_chore_id = row["followup_chore_id"]
    if followup_chore_id and not suppress_followup:
        followup_chore = conn.execute(
            "SELECT * FROM chores WHERE id = ? AND active = 1", (followup_chore_id,)
        ).fetchone()
        if followup_chore:
            today_str = date.today().isoformat()
            already_exists = conn.execute(
                """SELECT id FROM chore_instances
                   WHERE chore_id = ? AND due_date = ? AND status IN ('pending', 'claimed')""",
                (followup_chore_id, today_str),
            ).fetchone()
            if not already_exists:
                conn.execute(
                    """INSERT INTO chore_instances (chore_id, due_date, assigned_to, status)
                       VALUES (?, ?, NULL, 'pending')""",
                    (followup_chore_id, today_str),
                )
                conn.commit()
                followup_name = followup_chore["name"]

    return {
        "instance": _row_to_instance(updated),
        "xp_awarded": xp,
        "leveled_up": leveled_up,
        "old_level": old_level,
        "new_level": new_level,
        "new_streak": new_streak,
        "new_badges": [BadgeResult(**b) for b in new_badges],
        "powerup_consumed": PowerUp(**consumed_powerup) if consumed_powerup else None,
        "powerup_earned": PowerUp(**earned_powerup) if earned_powerup else None,
        "followup_triggered": followup_name is not None,
        "followup_name": followup_name,
        "pet_happiness": new_happiness,
        "pet_delta": pet_delta,
    }


@router.post("/{instance_id}/complete", response_model=CompleteResult)
async def complete_instance(instance_id: int, body: InstanceComplete, bg: BackgroundTasks):
    """Mark a chore instance as completed, awarding XP and checking badges."""
    conn = get_connection()
    row = conn.execute(
        """SELECT ci.*, c.xp_reward, c.assignment_mode, c.difficulty as chore_difficulty,
                  c.followup_chore_id
           FROM chore_instances ci JOIN chores c ON ci.chore_id = c.id
           WHERE ci.id = ?""",
        (instance_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Instance not found")
    return apply_completion(conn, row, body.completed_by, body.notes, bg=bg)
```

- [ ] **Step 3: Run the existing test to verify behaviour is unchanged**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestAssignments -v
```

Expected: all `TestAssignments` tests still PASS (including `test_complete_instance`).

- [ ] **Step 4: Run the full suite**

```bash
cd HA-chores/chores && python -m pytest app/tests/ -v
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd HA-chores
git add chores/app/routers/assignments.py
git commit -m "Extract apply_completion helper from complete_instance"
```

---

## Task 3: Wire `pending_celebrations` writes into `apply_completion`

**Files:**
- Modify: `HA-chores/chores/app/routers/assignments.py`
- Modify: `HA-chores/chores/app/tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Append to `HA-chores/chores/app/tests/test_api.py`:

```python
class TestPendingCelebrationsWrite:
    def _seed_person_at_threshold(self, tmp_db, xp_total=95, level=1):
        tmp_db.execute(
            "INSERT INTO persons (entity_id, name, xp_total, level) VALUES (?, ?, ?, ?)",
            ("person.lvltest", "LevelTest", xp_total, level),
        )
        tmp_db.commit()

    def _seed_chore_and_instance(self, tmp_db, xp_reward=10):
        tmp_db.execute(
            "INSERT INTO chores (name, xp_reward, difficulty, assignment_mode) VALUES (?, ?, 'medium', 'manual')",
            ("LevelUp Chore", xp_reward),
        )
        chore_id = tmp_db.execute("SELECT last_insert_rowid()").fetchone()[0]
        from datetime import date
        tmp_db.execute(
            "INSERT INTO chore_instances (chore_id, due_date, status) VALUES (?, ?, 'pending')",
            (chore_id, date.today().isoformat()),
        )
        inst_id = tmp_db.execute("SELECT last_insert_rowid()").fetchone()[0]
        tmp_db.commit()
        return chore_id, inst_id

    def test_levelup_writes_pending_celebration(self, client, tmp_db):
        self._seed_person_at_threshold(tmp_db, xp_total=95, level=1)
        _, inst_id = self._seed_chore_and_instance(tmp_db, xp_reward=10)
        resp = client.post(f"/api/assignments/{inst_id}/complete",
                           json={"completed_by": "person.lvltest"})
        assert resp.status_code == 200
        assert resp.json()["leveled_up"] is True
        rows = tmp_db.execute(
            "SELECT payload FROM pending_celebrations WHERE person_id = ?",
            ("person.lvltest",),
        ).fetchall()
        assert len(rows) == 1
        import json
        payload = json.loads(rows[0]["payload"])
        assert payload["leveled_up"] is True
        assert payload["new_level"] == 2

    def test_no_celebration_when_nothing_earned(self, client, tmp_db):
        self._seed_person_at_threshold(tmp_db, xp_total=0, level=1)
        _, inst_id = self._seed_chore_and_instance(tmp_db, xp_reward=5)
        resp = client.post(f"/api/assignments/{inst_id}/complete",
                           json={"completed_by": "person.lvltest"})
        assert resp.status_code == 200
        assert resp.json()["leveled_up"] is False
        rows = tmp_db.execute(
            "SELECT 1 FROM pending_celebrations WHERE person_id = ?",
            ("person.lvltest",),
        ).fetchall()
        assert rows == []
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsWrite -v
```

Expected: `test_levelup_writes_pending_celebration` fails (no rows inserted yet); `test_no_celebration_when_nothing_earned` passes trivially.

- [ ] **Step 3: Add the celebration-write to `apply_completion`**

In `HA-chores/chores/app/routers/assignments.py`, at the **top of the file**, add:

```python
import json as _json
```

Then in `apply_completion`, immediately **after** the `new_badges = check_and_award_badges(completed_by)` line and **before** the `if bg is not None:` block, insert:

```python
    if leveled_up or new_badges or earned_powerup:
        payload = {
            "old_level": old_level,
            "new_level": new_level,
            "leveled_up": leveled_up,
            "new_badges": new_badges,
            "powerup_earned": (
                {**earned_powerup,
                 "expires_at": earned_powerup.get("expires_at")}
                if earned_powerup else None
            ),
            "source": "shopping-hook" if bg is None else "assignment",
            "completed_at": now,
        }
        try:
            conn.execute(
                "INSERT INTO pending_celebrations (person_id, payload) VALUES (?, ?)",
                (completed_by, _json.dumps(payload, default=str)),
            )
            conn.commit()
        except Exception as e:
            logger.warning("Failed to write pending celebration for %s: %s",
                           completed_by, e)
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsWrite -v
```

Expected: both PASS.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
cd HA-chores/chores && python -m pytest app/tests/ -v
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd HA-chores
git add chores/app/routers/assignments.py chores/app/tests/test_api.py
git commit -m "Write pending_celebrations on level-up/badge/power-up"
```

---

## Task 4: Add `POST /api/shopping-hook/complete`

**Files:**
- Create: `HA-chores/chores/app/routers/shopping_hook.py`
- Modify: `HA-chores/chores/app/models.py`
- Modify: `HA-chores/chores/app/main.py`
- Modify: `HA-chores/chores/app/tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `HA-chores/chores/app/tests/test_api.py`:

```python
class TestShoppingHook:
    def _seed_basic(self, tmp_db):
        tmp_db.execute(
            "INSERT INTO persons (entity_id, name) VALUES ('person.shopper', 'Shopper')"
        )
        tmp_db.execute(
            "INSERT INTO chores (name, xp_reward, difficulty, assignment_mode) VALUES ('Shopping', 10, 'medium', 'manual')"
        )
        shop_id = tmp_db.execute("SELECT id FROM chores WHERE name='Shopping'").fetchone()["id"]
        tmp_db.execute(
            "INSERT INTO chores (name, xp_reward, difficulty, assignment_mode) VALUES ('Unpack', 5, 'easy', 'manual')"
        )
        scan_id = tmp_db.execute("SELECT id FROM chores WHERE name='Unpack'").fetchone()["id"]
        tmp_db.execute("UPDATE chores SET followup_chore_id = ? WHERE id = ?", (scan_id, shop_id))
        tmp_db.commit()
        return shop_id, scan_id

    def test_hook_creates_instance_when_missing(self, client, tmp_db):
        shop_id, _ = self._seed_basic(tmp_db)
        resp = client.post("/api/shopping-hook/complete", json={
            "chore_id": shop_id,
            "person": "person.shopper",
            "suppress_followup": False,
        })
        assert resp.status_code == 200
        from datetime import date
        rows = tmp_db.execute(
            "SELECT * FROM chore_instances WHERE chore_id = ? AND due_date = ?",
            (shop_id, date.today().isoformat()),
        ).fetchall()
        assert len(rows) == 1
        assert rows[0]["status"] == "completed"
        assert rows[0]["completed_by"] == "person.shopper"

    def test_hook_completes_existing_pending_instance(self, client, tmp_db):
        shop_id, _ = self._seed_basic(tmp_db)
        from datetime import date
        tmp_db.execute(
            "INSERT INTO chore_instances (chore_id, due_date, status) VALUES (?, ?, 'pending')",
            (shop_id, date.today().isoformat()),
        )
        existing_id = tmp_db.execute("SELECT last_insert_rowid()").fetchone()[0]
        tmp_db.commit()
        resp = client.post("/api/shopping-hook/complete", json={
            "chore_id": shop_id,
            "person": "person.shopper",
            "suppress_followup": False,
        })
        assert resp.status_code == 200
        row = tmp_db.execute(
            "SELECT * FROM chore_instances WHERE id = ?", (existing_id,)
        ).fetchone()
        assert row["status"] == "completed"
        # Should NOT have created a duplicate
        count = tmp_db.execute(
            "SELECT COUNT(*) FROM chore_instances WHERE chore_id = ? AND due_date = ?",
            (shop_id, date.today().isoformat()),
        ).fetchone()[0]
        assert count == 1

    def test_hook_suppress_followup_blocks_spawn(self, client, tmp_db):
        shop_id, scan_id = self._seed_basic(tmp_db)
        resp = client.post("/api/shopping-hook/complete", json={
            "chore_id": shop_id,
            "person": "person.shopper",
            "suppress_followup": True,
        })
        assert resp.status_code == 200
        from datetime import date
        followups = tmp_db.execute(
            "SELECT * FROM chore_instances WHERE chore_id = ? AND due_date = ?",
            (scan_id, date.today().isoformat()),
        ).fetchall()
        assert followups == []

    def test_hook_spawns_followup_when_not_suppressed(self, client, tmp_db):
        shop_id, scan_id = self._seed_basic(tmp_db)
        resp = client.post("/api/shopping-hook/complete", json={
            "chore_id": shop_id,
            "person": "person.shopper",
            "suppress_followup": False,
        })
        assert resp.status_code == 200
        from datetime import date
        followups = tmp_db.execute(
            "SELECT * FROM chore_instances WHERE chore_id = ? AND due_date = ?",
            (scan_id, date.today().isoformat()),
        ).fetchall()
        assert len(followups) == 1
        assert followups[0]["status"] == "pending"

    def test_hook_unknown_chore_returns_404(self, client, tmp_db):
        tmp_db.execute(
            "INSERT INTO persons (entity_id, name) VALUES ('person.x', 'X')"
        )
        tmp_db.commit()
        resp = client.post("/api/shopping-hook/complete", json={
            "chore_id": 99999,
            "person": "person.x",
            "suppress_followup": False,
        })
        assert resp.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestShoppingHook -v
```

Expected: all fail (endpoint does not exist).

- [ ] **Step 3: Add the `HookBody` model**

In `HA-chores/chores/app/models.py`, add (anywhere among the other Pydantic models):

```python
class HookCompleteBody(BaseModel):
    chore_id: int
    person: str
    suppress_followup: bool = False
    notes: str = ""
```

- [ ] **Step 4: Create the new router file**

Create `HA-chores/chores/app/routers/shopping_hook.py`:

```python
"""Chores – Shopping-hook endpoint for HA-grocy-stock attribution."""

from __future__ import annotations
from datetime import date
import logging

from fastapi import APIRouter, HTTPException

from models import HookCompleteBody
from database import get_connection
from routers.assignments import apply_completion

router = APIRouter(prefix="/api/shopping-hook", tags=["shopping-hook"])
logger = logging.getLogger(__name__)


@router.post("/complete")
async def complete_via_hook(body: HookCompleteBody):
    """Complete (or create + complete) today's instance of `chore_id` for `person`.

    Mirrors POST /api/assignments/{id}/complete but takes a chore-id (not
    instance-id) and supports `suppress_followup` to inhibit the
    auto-spawn of the followup chore when Stock already covered that work.
    """
    conn = get_connection()

    chore = conn.execute(
        "SELECT * FROM chores WHERE id = ? AND active = 1", (body.chore_id,)
    ).fetchone()
    if not chore:
        raise HTTPException(404, "Chore not found or inactive")

    person = conn.execute(
        "SELECT entity_id FROM persons WHERE entity_id = ?", (body.person,)
    ).fetchone()
    if not person:
        raise HTTPException(404, "Person not found")

    today_str = date.today().isoformat()
    instance = conn.execute(
        """SELECT id FROM chore_instances
           WHERE chore_id = ? AND due_date = ? AND status IN ('pending', 'claimed')
           ORDER BY id LIMIT 1""",
        (body.chore_id, today_str),
    ).fetchone()
    if not instance:
        cursor = conn.execute(
            """INSERT INTO chore_instances (chore_id, due_date, assigned_to, status, created_by)
               VALUES (?, ?, NULL, 'pending', 'shopping-hook')""",
            (body.chore_id, today_str),
        )
        conn.commit()
        instance_id = cursor.lastrowid
    else:
        instance_id = instance["id"]

    row = conn.execute(
        """SELECT ci.*, c.xp_reward, c.assignment_mode, c.difficulty as chore_difficulty,
                  c.followup_chore_id
           FROM chore_instances ci JOIN chores c ON ci.chore_id = c.id
           WHERE ci.id = ?""",
        (instance_id,),
    ).fetchone()

    return apply_completion(
        conn, row, body.person, body.notes,
        bg=None,
        suppress_followup=body.suppress_followup,
    )
```

- [ ] **Step 5: Mount the router in main.py**

In `HA-chores/chores/app/main.py`, modify the router-import line (around line 320):

Change:

```python
from routers import health, chores, persons, assignments, gamification, config, calendar, powerups, pets as pets_router
```

to:

```python
from routers import health, chores, persons, assignments, gamification, config, calendar, powerups, pets as pets_router, shopping_hook
```

Then immediately after the existing `app.include_router(pets_router.router)` line, add:

```python
app.include_router(shopping_hook.router)
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestShoppingHook -v
```

Expected: all PASS.

- [ ] **Step 7: Run the full suite**

```bash
cd HA-chores/chores && python -m pytest app/tests/ -v
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd HA-chores
git add chores/app/routers/shopping_hook.py chores/app/models.py chores/app/main.py chores/app/tests/test_api.py
git commit -m "Add POST /api/shopping-hook/complete endpoint"
```

---

## Task 5: Add `GET /api/persons/me/pending-celebrations`

**Files:**
- Modify: `HA-chores/chores/app/routers/persons.py`
- Modify: `HA-chores/chores/app/models.py`
- Modify: `HA-chores/chores/app/tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `HA-chores/chores/app/tests/test_api.py`:

```python
class TestPendingCelebrationsAPI:
    def _seed_person_with_ha_user(self, tmp_db, entity_id="person.cele",
                                  ha_user_id="ha-user-1"):
        tmp_db.execute(
            "INSERT INTO persons (entity_id, name, ha_user_id) VALUES (?, ?, ?)",
            (entity_id, "Cele", ha_user_id),
        )
        tmp_db.commit()

    def _insert_celebration(self, tmp_db, person_id, payload='{"leveled_up":true}',
                            seen_at=None):
        tmp_db.execute(
            "INSERT INTO pending_celebrations (person_id, payload, seen_at) VALUES (?, ?, ?)",
            (person_id, payload, seen_at),
        )
        tmp_db.commit()
        return tmp_db.execute("SELECT last_insert_rowid()").fetchone()[0]

    def test_get_returns_unseen_only(self, client, tmp_db):
        self._seed_person_with_ha_user(tmp_db)
        unseen_id = self._insert_celebration(tmp_db, "person.cele")
        self._insert_celebration(tmp_db, "person.cele", seen_at="2025-01-01T00:00:00")
        resp = client.get(
            "/api/persons/me/pending-celebrations",
            headers={"X-Remote-User-Id": "ha-user-1"},
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["id"] == unseen_id

    def test_get_returns_empty_when_no_user_header(self, client, tmp_db):
        self._seed_person_with_ha_user(tmp_db)
        self._insert_celebration(tmp_db, "person.cele")
        resp = client.get("/api/persons/me/pending-celebrations")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_payload_is_parsed_as_json(self, client, tmp_db):
        self._seed_person_with_ha_user(tmp_db)
        self._insert_celebration(tmp_db, "person.cele",
                                 payload='{"leveled_up":true,"new_level":5}')
        resp = client.get(
            "/api/persons/me/pending-celebrations",
            headers={"X-Remote-User-Id": "ha-user-1"},
        )
        rows = resp.json()
        assert rows[0]["payload"]["new_level"] == 5
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsAPI -v
```

Expected: all fail (404 — endpoint missing).

- [ ] **Step 3: Add `PendingCelebration` model**

In `HA-chores/chores/app/models.py`, add:

```python
class PendingCelebration(BaseModel):
    id: int
    payload: dict
    created_at: str
```

- [ ] **Step 4: Add the GET endpoint to persons.py**

In `HA-chores/chores/app/routers/persons.py`:

1. At the top, add to the imports:

```python
import json as _json
from models import Person, PendingCelebration
```

(Replace the existing `from models import Person` line.)

2. Add a new endpoint after the existing `whoami_debug` function (after line 82):

```python
@router.get("/me/pending-celebrations", response_model=list[PendingCelebration])
async def get_pending_celebrations(request: Request):
    """Return unseen celebration popups for the requesting HA user."""
    ha_user_id = request.headers.get("X-Remote-User-Id", "")
    if not ha_user_id:
        return []
    conn = get_connection()
    person = conn.execute(
        "SELECT entity_id FROM persons WHERE ha_user_id = ?", (ha_user_id,)
    ).fetchone()
    if not person:
        return []
    rows = conn.execute(
        """SELECT id, payload, created_at FROM pending_celebrations
           WHERE person_id = ? AND seen_at IS NULL
           ORDER BY id ASC""",
        (person["entity_id"],),
    ).fetchall()
    out = []
    for r in rows:
        try:
            payload = _json.loads(r["payload"])
        except Exception:
            payload = {}
        out.append({"id": r["id"], "payload": payload, "created_at": r["created_at"]})
    return out
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsAPI -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd HA-chores
git add chores/app/routers/persons.py chores/app/models.py chores/app/tests/test_api.py
git commit -m "Add GET /api/persons/me/pending-celebrations"
```

---

## Task 6: Add `POST /api/persons/me/pending-celebrations/ack`

**Files:**
- Modify: `HA-chores/chores/app/routers/persons.py`
- Modify: `HA-chores/chores/app/models.py`
- Modify: `HA-chores/chores/app/tests/test_api.py`

- [ ] **Step 1: Write the failing tests**

Append to `HA-chores/chores/app/tests/test_api.py` (inside the same `TestPendingCelebrationsAPI` class):

```python
    def test_ack_marks_rows_seen(self, client, tmp_db):
        self._seed_person_with_ha_user(tmp_db)
        c1 = self._insert_celebration(tmp_db, "person.cele")
        c2 = self._insert_celebration(tmp_db, "person.cele")
        resp = client.post(
            "/api/persons/me/pending-celebrations/ack",
            headers={"X-Remote-User-Id": "ha-user-1"},
            json={"ids": [c1, c2]},
        )
        assert resp.status_code == 200
        unseen = tmp_db.execute(
            "SELECT COUNT(*) FROM pending_celebrations WHERE seen_at IS NULL"
        ).fetchone()[0]
        assert unseen == 0

    def test_ack_only_scopes_to_requester(self, client, tmp_db):
        self._seed_person_with_ha_user(tmp_db, "person.cele", "ha-user-1")
        self._seed_person_with_ha_user(tmp_db, "person.other", "ha-user-2")
        my_id = self._insert_celebration(tmp_db, "person.cele")
        other_id = self._insert_celebration(tmp_db, "person.other")
        resp = client.post(
            "/api/persons/me/pending-celebrations/ack",
            headers={"X-Remote-User-Id": "ha-user-1"},
            json={"ids": [my_id, other_id]},
        )
        assert resp.status_code == 200
        # Mine acked, theirs still unseen
        mine = tmp_db.execute(
            "SELECT seen_at FROM pending_celebrations WHERE id = ?", (my_id,)
        ).fetchone()
        theirs = tmp_db.execute(
            "SELECT seen_at FROM pending_celebrations WHERE id = ?", (other_id,)
        ).fetchone()
        assert mine["seen_at"] is not None
        assert theirs["seen_at"] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsAPI -v
```

Expected: the two new tests fail (404).

- [ ] **Step 3: Add `AckBody` model**

In `HA-chores/chores/app/models.py`, add:

```python
class CelebrationAckBody(BaseModel):
    ids: list[int]
```

- [ ] **Step 4: Add the POST endpoint to persons.py**

In `HA-chores/chores/app/routers/persons.py`:

1. Add `CelebrationAckBody` to the model imports:

```python
from models import Person, PendingCelebration, CelebrationAckBody
```

2. Append after the `get_pending_celebrations` endpoint:

```python
@router.post("/me/pending-celebrations/ack")
async def ack_pending_celebrations(request: Request, body: CelebrationAckBody):
    """Mark the given celebration rows as seen, scoped to the requesting user."""
    ha_user_id = request.headers.get("X-Remote-User-Id", "")
    if not ha_user_id or not body.ids:
        return {"acked": 0}
    conn = get_connection()
    person = conn.execute(
        "SELECT entity_id FROM persons WHERE ha_user_id = ?", (ha_user_id,)
    ).fetchone()
    if not person:
        return {"acked": 0}
    placeholders = ",".join("?" * len(body.ids))
    from datetime import datetime as _dt
    now = _dt.now().isoformat()
    cursor = conn.execute(
        f"""UPDATE pending_celebrations
            SET seen_at = ?
            WHERE seen_at IS NULL
              AND person_id = ?
              AND id IN ({placeholders})""",
        (now, person["entity_id"], *body.ids),
    )
    conn.commit()
    return {"acked": cursor.rowcount}
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd HA-chores/chores && python -m pytest app/tests/test_api.py::TestPendingCelebrationsAPI -v
```

Expected: all PASS.

- [ ] **Step 6: Run the full suite**

```bash
cd HA-chores/chores && python -m pytest app/tests/ -v
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd HA-chores
git add chores/app/routers/persons.py chores/app/models.py chores/app/tests/test_api.py
git commit -m "Add POST /api/persons/me/pending-celebrations/ack"
```

---

## Task 7: Expose Chores FastAPI port to sibling add-ons; bump version

**Files:**
- Modify: `HA-chores/chores/config.json`
- Modify: `HA-chores/chores/CHANGELOG.md`

This task has no code under test — it's a config + release-note change.

- [ ] **Step 1: Add port mapping to config.json**

In `HA-chores/chores/config.json`, add a `"ports"` key alongside the existing `"ingress_port"`:

```json
  "ports": {
    "8100/tcp": null
  },
  "ports_description": {
    "8100/tcp": "Internal FastAPI port for sibling add-on access"
  },
```

(Insert before the `"map"` line. `null` means the port is reachable on the
container network but **not** mapped to a host port.)

- [ ] **Step 2: Bump version**

Change the `"version"` field in `HA-chores/chores/config.json` from the
current `0.3.27` to `0.4.0` (minor bump — the new endpoints + schema row are
additive).

- [ ] **Step 3: Add changelog entry**

Prepend to `HA-chores/chores/CHANGELOG.md` (above the most recent `## X.Y.Z` header):

```markdown
## 0.4.0

- Add `/api/shopping-hook/complete` endpoint for cross-add-on chore attribution (used by HA-grocy-stock to credit shopping/scanning chores per person and inhibit the duplicate `Unpack & scan` follow-up).
- Add `pending_celebrations` table and `/api/persons/me/pending-celebrations` GET + ACK endpoints so level-up / badge / power-up popups triggered by external completions appear in the Chores UI on next mount.
- Expose FastAPI port 8100 on the container network so sibling add-ons can reach the new hook.
```

- [ ] **Step 4: Commit**

```bash
cd HA-chores
git add chores/config.json chores/CHANGELOG.md
git commit -m "Bump HA-chores to 0.4.0: shopping-hook + pending celebrations"
```

---

## Task 8: Chores frontend — add API helpers

**Files:**
- Modify: `HA-chores/chores/frontend/src/api.js`

- [ ] **Step 1: Append the new helpers**

Append to `HA-chores/chores/frontend/src/api.js`:

```javascript
// ── Pending celebrations (cross-app completions) ────────────────────────────
export const getPendingCelebrations = () =>
  api.get('/persons/me/pending-celebrations').then(r => r.data);

export const ackPendingCelebrations = (ids) =>
  api.post('/persons/me/pending-celebrations/ack', { ids }).then(r => r.data);

// ── Config (chore-id mapping for shopping attribution) ──────────────────────
export const getConfigValue = (key) =>
  api.get(`/config/${encodeURIComponent(key)}`).then(r => r.data);

export const setConfigValue = (key, value) =>
  api.put(`/config/${encodeURIComponent(key)}`, { key, value }).then(r => r.data);
```

- [ ] **Step 2: Verify the dev server still builds**

```bash
cd HA-chores/chores/frontend && npm install && npm run build
```

Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
cd HA-chores
git add chores/frontend/src/api.js
git commit -m "Chores frontend: add pending-celebrations and config helpers"
```

---

## Task 9: Chores frontend — drain pending celebrations on mount

**Files:**
- Modify: `HA-chores/chores/frontend/src/components/effects/GameEffects.jsx`

- [ ] **Step 1: Read the file and identify the top-level component**

Open `HA-chores/chores/frontend/src/components/effects/GameEffects.jsx`. The
exported top-level component manages the `modalQueue` state — read around
lines 553–626 (the queue assembly from a completion `result`) and around
line 721 (`{currentModal?.type === 'levelup' && ...}`) so the new entries
match the queue's existing shape.

- [ ] **Step 2: Add the mount-time drain**

At the top of the file, add the import:

```javascript
import { getPendingCelebrations, ackPendingCelebrations } from '../../api';
```

Inside the top-level component (the one that holds `modalQueue` state), add
the following `useEffect` near the other top-level effects:

```javascript
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const rows = await getPendingCelebrations();
      if (cancelled || !rows?.length) return;

      // Translate each row's payload into the same modal-queue entries the
      // post-completion flow already uses (level-up first, badges next,
      // power-up last).
      const entries = [];
      const ackIds = [];
      for (const row of rows) {
        const p = row.payload || {};
        ackIds.push(row.id);
        if (p.leveled_up) {
          entries.push({
            type: 'levelup',
            oldLevel: p.old_level,
            newLevel: p.new_level,
            _ackId: row.id,
          });
        }
        for (const b of (p.new_badges || [])) {
          entries.push({ type: 'badge', ...b, _ackId: row.id });
        }
        if (p.powerup_earned) {
          entries.push({ type: 'powerup', ...p.powerup_earned, _ackId: row.id });
        }
      }
      if (entries.length === 0) {
        // Payloads existed but produced no visible modal — ack them so they
        // don't accumulate.
        if (ackIds.length) ackPendingCelebrations(ackIds).catch(() => {});
        return;
      }

      setModalQueue(prev => [...prev, ...entries]);

      // Ack the rows whose entries we just queued. We ack at enqueue time
      // (rather than per-dismiss) to avoid re-firing if the component
      // remounts before the queue drains.
      ackPendingCelebrations(ackIds).catch(() => {});
    } catch (err) {
      console.warn('Failed to load pending celebrations:', err);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

(`modalQueue` / `setModalQueue` are the identifiers used in the file —
declared at the existing `useState([])` line near `const [modalQueue,
setModalQueue] = useState([]);`.)

- [ ] **Step 3: Build and verify there are no errors**

```bash
cd HA-chores/chores/frontend && npm run build
```

Expected: build completes.

- [ ] **Step 4: Manual verification**

Start the chores dev server:

```bash
cd HA-chores/chores/frontend && npm run dev
```

In a separate terminal, insert a synthetic celebration into the running dev
DB (or against a running add-on instance):

```bash
sqlite3 /path/to/chores.db "INSERT INTO pending_celebrations (person_id, payload) VALUES ('person.YOUR_ID', '{\"leveled_up\":true,\"old_level\":3,\"new_level\":4,\"new_badges\":[],\"powerup_earned\":null}')"
```

Open the frontend as that HA user → confirm the level-up modal fires once
and does not reappear on reload.

- [ ] **Step 5: Commit**

```bash
cd HA-chores
git add chores/frontend/src/components/effects/GameEffects.jsx
git commit -m "Chores frontend: drain pending celebrations on mount"
```

---

## Task 10: Chores frontend — chore-id picker in Settings

**Files:**
- Modify: `HA-chores/chores/frontend/src/components/Settings.jsx`

This is the *configuration UI* for the two chore IDs used by HA-grocy-stock.
Stock reads them from Chores' `/api/config` endpoint; this task gives the
user a place to set them.

- [ ] **Step 1: Read Settings.jsx to find an insertion point**

Open `HA-chores/chores/frontend/src/components/Settings.jsx`. Find the
section that lists notification toggles (around line 350 — `cfgKey="notif_levelup"`).
We'll add a new section above or below it titled "Cross-app integrations".

- [ ] **Step 2: Add chore-id picker UI**

Near the top of `Settings.jsx`, ensure these imports are present (add
whichever are missing):

```javascript
import { useState, useEffect } from 'react';
import {
  getChores,
  getConfigValue,
  setConfigValue,
} from '../api';
```

Inside the Settings component body (find a good spot among the existing
state hooks), add:

```javascript
const [allChores, setAllChores] = useState([]);
const [shoppingChoreId, setShoppingChoreId] = useState('');
const [scanChoreId, setScanChoreId] = useState('');

useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const [chores, shopCfg, scanCfg] = await Promise.all([
        getChores(true),
        getConfigValue('shopping_chore_id').catch(() => ({ value: null })),
        getConfigValue('scan_chore_id').catch(() => ({ value: null })),
      ]);
      if (cancelled) return;
      setAllChores(chores);
      setShoppingChoreId(shopCfg?.value ?? '');
      setScanChoreId(scanCfg?.value ?? '');
    } catch (err) {
      console.warn('Failed to load chores/config:', err);
    }
  })();
  return () => { cancelled = true; };
}, []);

const persistChoreId = async (key, value) => {
  await setConfigValue(key, String(value || ''));
};
```

In the JSX (inside the same render that returns the Settings panel), add a
new section. Use the existing surface styling for consistency — read the
file to match the look of the surrounding cards:

```jsx
<section className="rounded-xl bg-gray-800 p-4 mt-4">
  <h3 className="text-lg font-semibold text-white">Cross-app integrations</h3>
  <p className="text-sm text-gray-400 mt-1">
    Pick which chores HA-grocy-stock credits when a shopping session finishes.
  </p>

  <label className="block mt-3 text-sm text-gray-300">Shopping chore</label>
  <select
    className="mt-1 w-full rounded-lg bg-gray-700 text-white px-3 py-2"
    value={shoppingChoreId}
    onChange={async (e) => {
      setShoppingChoreId(e.target.value);
      await persistChoreId('shopping_chore_id', e.target.value);
    }}
  >
    <option value="">— pick a chore —</option>
    {allChores.map(c => (
      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
    ))}
  </select>

  <label className="block mt-3 text-sm text-gray-300">Scan / unpack chore</label>
  <select
    className="mt-1 w-full rounded-lg bg-gray-700 text-white px-3 py-2"
    value={scanChoreId}
    onChange={async (e) => {
      setScanChoreId(e.target.value);
      await persistChoreId('scan_chore_id', e.target.value);
    }}
  >
    <option value="">— pick a chore —</option>
    {allChores.map(c => (
      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
    ))}
  </select>
</section>
```

- [ ] **Step 3: Build and run dev server, smoke-test**

```bash
cd HA-chores/chores/frontend && npm run dev
```

Open the Settings panel, pick a chore for each role, reload — the picks
should persist (verifies the PUT to `/api/config/...`).

- [ ] **Step 4: Commit**

```bash
cd HA-chores
git add chores/frontend/src/components/Settings.jsx
git commit -m "Chores frontend: add shopping/scan chore-id pickers in Settings"
```

---

## Task 11: Commit HA-chores submodule pointer in the root repo

**Files:**
- The HA-chores submodule pointer in the root repo.

- [ ] **Step 1: Push HA-chores commits**

```bash
cd HA-chores
git push
cd ..
```

(If the user has not configured a push remote, just stay local.)

- [ ] **Step 2: Update the root submodule pointer and commit**

```bash
git add HA-chores
git commit -m "Bump HA-chores submodule to 0.4.0 (shopping attribution backend)"
```

---

## Task 12: Stock add-on — `chores_url` option + auto-detect + nginx env wiring

**Files:**
- Modify: `HA-grocy-stock/grocy_stock/config.json`
- Modify: `HA-grocy-stock/grocy_stock/rootfs/etc/s6-overlay/s6-rc.d/grocy-stock/run`

- [ ] **Step 1: Add the `chores_url` option to config.json**

In `HA-grocy-stock/grocy_stock/config.json`:

1. Add `"chores_url"` to the `options` block (alongside `storage_url` if
   present, otherwise at the end of `options`).
2. Add `"chores_url": "str?"` to the `schema` block.

Example shape:

```json
  "options": {
    "storage_url": "",
    "scraper_url": "",
    "chores_url": ""
  },
  "schema": {
    "storage_url": "str?",
    "scraper_url": "str?",
    "chores_url": "str?"
  }
```

(Use whatever existing option keys are already there — only the
`chores_url` lines are new.)

- [ ] **Step 2: Add `_detect_chores` to the run script**

In `HA-grocy-stock/grocy_stock/rootfs/etc/s6-overlay/s6-rc.d/grocy-stock/run`,
**immediately after** the `_detect_scraper` function definition (which ends
around line 99), add:

```bash
_detect_chores() {
    local _url=""
    if [ -n "${REPO_PREFIX}" ] && [ "${REPO_PREFIX}" != "${MY_HOSTNAME_NORM}" ]; then
        for _c in "${REPO_PREFIX}-ha-chores" "${REPO_PREFIX}_ha_chores"; do
            if curl -sf --max-time 3 "http://${_c}:8100/api/health" >/dev/null 2>&1; then
                _url="http://${_c}:8100"
                break
            fi
        done
    fi
    if [ -z "${_url}" ] && [ -n "${SUPERVISOR_TOKEN}" ]; then
        local _slug=""
        _slug=$(curl -sf --max-time 5 \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            http://supervisor/addons \
            | jq -r '[.data.addons[]? | select(.slug | test("ha.chores"; "i"))][0].slug // empty') || true
        if [ -z "${_slug}" ]; then
            _slug=$(curl -sf --max-time 5 \
                -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
                http://supervisor/addons \
                | jq -r '[.data.addons[]? | select(.name | test("ha.chores"; "i"))][0].slug // empty') || true
        fi
        if [ -n "${_slug}" ]; then
            local _ip=""
            _ip=$(curl -sf --max-time 5 \
                -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
                "http://supervisor/addons/${_slug}/info" \
                | jq -r '.data.ip_address // empty') || true
            if [ -n "${_ip}" ]; then
                _url="http://${_ip}:8100"
            elif curl -sf --max-time 3 "http://${_slug}:8100/api/health" >/dev/null 2>&1; then
                _url="http://${_slug}:8100"
            fi
        fi
    fi
    echo "${_url}"
}
```

- [ ] **Step 3: Wire CHORES_URL through the run script**

In the same run script, find the existing block that handles `SCRAPER_URL`
(roughly lines 124–138). Immediately **after** that block (before
`bashio::log.info "Storage URL: ..."` at line 140), add:

```bash
_CHORES_PLACEHOLDER="http://127.0.0.1:1"
CHORES_AUTODETECT=0
CHORES_URL=""

if bashio::config.has_value 'chores_url'; then
    CHORES_URL=$(bashio::config 'chores_url')
    bashio::log.info "Chores URL (from config): ${CHORES_URL}"
else
    CHORES_AUTODETECT=1
    bashio::log.info "Attempting auto-detect of HA-Chores addon..."
    CHORES_URL=$(_detect_chores)
    if [ -n "${CHORES_URL}" ]; then
        bashio::log.info "Chores URL (auto-detected): ${CHORES_URL}"
    else
        bashio::log.info "HA-Chores addon not found -- will retry in background every 30 s."
    fi
fi
[ -z "${CHORES_URL}" ] && CHORES_URL="${_CHORES_PLACEHOLDER}"
export CHORES_URL
```

Then update the `envsubst` call (around line 142) to include `CHORES_URL`:

Change:

```bash
envsubst '${STORAGE_URL} ${SCRAPER_URL} ${NGINX_LOG_ROUTINE}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf
```

to:

```bash
envsubst '${STORAGE_URL} ${SCRAPER_URL} ${CHORES_URL} ${NGINX_LOG_ROUTINE}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf
```

- [ ] **Step 4: Extend the background health monitor**

In the same run script, the background loop starting around line 149
re-detects Storage and Scraper on a 30s cadence. Add the same treatment for
Chores. Inside the `(while sleep 30; do ... done) &` block, after the
SCRAPER detection block (ending around line 195), add:

```bash
            if [ "${CHORES_AUTODETECT}" = "1" ]; then
                if [ "${_cur_chores}" = "${_CHORES_PLACEHOLDER}" ]; then
                    _new=$(_detect_chores)
                    if [ -n "${_new}" ]; then
                        bashio::log.info "Chores found at ${_new} -- updating config."
                        _cur_chores="${_new}"; _changed=1
                    fi
                elif ! curl -sf --max-time 3 "${_cur_chores}/api/health" >/dev/null 2>&1; then
                    bashio::log.warning "Chores at ${_cur_chores} unreachable -- re-detecting..."
                    _new=$(_detect_chores)
                    if [ -n "${_new}" ] && [ "${_new}" != "${_cur_chores}" ]; then
                        bashio::log.info "Chores re-detected at ${_new}."
                        _cur_chores="${_new}"; _changed=1
                    elif [ -z "${_new}" ]; then
                        bashio::log.warning "Chores not found -- reverting to placeholder."
                        _cur_chores="${_CHORES_PLACEHOLDER}"; _changed=1
                    fi
                fi
            fi
```

Initialize `_cur_chores` at the top of the loop body (alongside `_cur_storage`
and `_cur_scraper`):

```bash
        _cur_chores="${CHORES_URL}"
```

And in the "if _changed" block at the end, add `CHORES_URL` to the envsubst:

```bash
            if [ "${_changed}" = "1" ]; then
                STORAGE_URL="${_cur_storage}"
                SCRAPER_URL="${_cur_scraper}"
                CHORES_URL="${_cur_chores}"
                envsubst '${STORAGE_URL} ${SCRAPER_URL} ${CHORES_URL} ${NGINX_LOG_ROUTINE}' \
                  < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
                nginx -s reload
                bashio::log.info "nginx reloaded (storage: ${_cur_storage}, scraper: ${_cur_scraper}, chores: ${_cur_chores})."
            fi
```

Update the outer `if` that starts the monitor (around line 149) to also fire
when `CHORES_AUTODETECT=1`:

Change:

```bash
if [ "${STORAGE_AUTODETECT}" = "1" ] || [ "${SCRAPER_AUTODETECT}" = "1" ]; then
```

to:

```bash
if [ "${STORAGE_AUTODETECT}" = "1" ] || [ "${SCRAPER_AUTODETECT}" = "1" ] || [ "${CHORES_AUTODETECT}" = "1" ]; then
```

- [ ] **Step 5: Smoke-test the run script syntax**

```bash
bash -n HA-grocy-stock/grocy_stock/rootfs/etc/s6-overlay/s6-rc.d/grocy-stock/run
```

Expected: no output (clean parse).

- [ ] **Step 6: Commit**

```bash
cd HA-grocy-stock
git add grocy_stock/config.json grocy_stock/rootfs/etc/s6-overlay/s6-rc.d/grocy-stock/run
git commit -m "Stock add-on: add chores_url option + auto-detect"
```

---

## Task 13: Stock nginx — `/api/chores/` proxy block

**Files:**
- Modify: `HA-grocy-stock/grocy_stock/nginx.conf.template`

- [ ] **Step 1: Add the proxy block**

In `HA-grocy-stock/grocy_stock/nginx.conf.template`, immediately **after**
the existing `location ^~ /api/scraper/` block (which ends with its closing
`}` before the "Static assets" comment), insert:

```nginx
        # ── Chores API proxy ──────────────────────────────────────────────
        # Strips /api/chores/ prefix and forwards to the HA-Chores addon's
        # FastAPI service (port 8100). Used by the shopping-attribution
        # modal to fan out chore completions and read the configured
        # shopping/scan chore IDs.
        location ^~ /api/chores/ {
            proxy_pass            ${CHORES_URL}/api/;
            proxy_set_header      Host              $http_host;
            proxy_set_header      X-Real-IP         $remote_addr;
            proxy_set_header      X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header      X-Remote-User-Id  $http_x_remote_user_id;
            proxy_http_version    1.1;
            proxy_buffering       off;
            proxy_connect_timeout 10s;
            proxy_read_timeout    30s;
            proxy_send_timeout    30s;
        }
```

The `X-Remote-User-Id` passthrough is required by Chores' `/me/...`
endpoints — HA's ingress already provides this header on the incoming
request.

- [ ] **Step 2: Smoke-test nginx config substitution**

Run the run script logic by hand to make sure the template substitutes
cleanly:

```bash
STORAGE_URL=http://stub:1 SCRAPER_URL=http://stub:1 CHORES_URL=http://stub:1 NGINX_LOG_ROUTINE=0 \
  envsubst '${STORAGE_URL} ${SCRAPER_URL} ${CHORES_URL} ${NGINX_LOG_ROUTINE}' \
  < HA-grocy-stock/grocy_stock/nginx.conf.template \
  | grep -A1 "/api/chores/"
```

Expected: the `proxy_pass http://stub:1/api/;` line shows up substituted.

- [ ] **Step 3: Commit**

```bash
cd HA-grocy-stock
git add grocy_stock/nginx.conf.template
git commit -m "Stock nginx: add /api/chores/ proxy upstream"
```

---

## Task 14: Stock frontend — `ShoppingAttributionModal` component

**Files:**
- Create: `HA-grocy-stock/grocy_stock/frontend/src/components/ShoppingAttributionModal.jsx`

(No automated test framework is configured for the Stock frontend; this task
ends with a build smoke-test.)

- [ ] **Step 1: Create the component file**

Create `HA-grocy-stock/grocy_stock/frontend/src/components/ShoppingAttributionModal.jsx`:

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Shopping Attribution Modal
//
// Shown after the user presses "Finish" in shopping-mode continuous scanner
// (when scanCount > 0). Two-step picker: who did the shopping, who did the
// scanning. Each step is multi-select with a "Skip" option.
//
// On submit, fans out one POST /api/chores/shopping-hook/complete per
// (chore, person) pair. The shopping chore's follow-up is suppressed when
// at least one scanner is picked.
//
// Celebration popups (level-up / badges / power-ups) are not shown here —
// they appear in HA-chores on its next mount via pending_celebrations.
// ---------------------------------------------------------------------------

const STEP_LOADING_CONFIG = 'loading_config';
const STEP_NOT_CONFIGURED = 'not_configured';
const STEP_SHOPPERS = 'shoppers';
const STEP_SCANNERS = 'scanners';
const STEP_SUBMITTING = 'submitting';

export default function ShoppingAttributionModal({
  choresApi,
  ingressPath,
  scanCount,
  onClose,
  onToast,
}) {
  const [step, setStep] = useState(STEP_LOADING_CONFIG);
  const [persons, setPersons] = useState([]);
  const [shoppingChoreId, setShoppingChoreId] = useState(null);
  const [scanChoreId, setScanChoreId] = useState(null);

  const [shoppers, setShoppers] = useState([]);
  const [scanners, setScanners] = useState([]);

  // Load config + persons on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [personsResp, shopCfg, scanCfg] = await Promise.all([
          axios.get(`${choresApi}/persons/`),
          axios.get(`${choresApi}/config/shopping_chore_id`).catch(() => null),
          axios.get(`${choresApi}/config/scan_chore_id`).catch(() => null),
        ]);
        if (cancelled) return;
        setPersons(personsResp.data || []);
        const sid = parseInt(shopCfg?.data?.value, 10);
        const cid = parseInt(scanCfg?.data?.value, 10);
        if (Number.isFinite(sid) && Number.isFinite(cid)) {
          setShoppingChoreId(sid);
          setScanChoreId(cid);
          setStep(STEP_SHOPPERS);
        } else {
          setStep(STEP_NOT_CONFIGURED);
        }
      } catch (err) {
        if (cancelled) return;
        onToast?.(
          `Couldn't reach Chores (${err?.message ?? 'network error'}).`,
          'error',
        );
        onClose?.();
      }
    })();
    return () => { cancelled = true; };
  }, [choresApi, onClose, onToast]);

  const togglePick = (list, setter, entityId) => {
    setter(list.includes(entityId)
      ? list.filter((x) => x !== entityId)
      : [...list, entityId]);
  };

  const submit = async () => {
    setStep(STEP_SUBMITTING);
    const calls = [];
    const suppressFollowup = scanners.length > 0;
    for (const p of shoppers) {
      calls.push({
        role: 'shopping',
        person: p,
        promise: axios.post(`${choresApi}/shopping-hook/complete`, {
          chore_id: shoppingChoreId,
          person: p,
          suppress_followup: suppressFollowup,
          notes: `Shopping session via Stock (${scanCount} scans)`,
        }),
      });
    }
    for (const p of scanners) {
      calls.push({
        role: 'scanning',
        person: p,
        promise: axios.post(`${choresApi}/shopping-hook/complete`, {
          chore_id: scanChoreId,
          person: p,
          suppress_followup: false,
          notes: `Shopping session via Stock (${scanCount} scans)`,
        }),
      });
    }

    if (calls.length === 0) {
      onClose?.();
      return;
    }

    const results = await Promise.allSettled(calls.map((c) => c.promise));
    const failures = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') failures.push(calls[i]);
    });

    if (failures.length === 0) {
      const parts = [];
      if (shoppers.length) parts.push(`${shoppers.length} shopper(s)`);
      if (scanners.length) parts.push(`${scanners.length} scanner(s)`);
      onToast?.(
        `Credited ${parts.join(', ')}. Level-ups will appear in Chores.`,
        'success',
      );
    } else if (failures.length === results.length) {
      onToast?.(
        "Couldn't reach Chores — scans saved, but XP wasn't credited.",
        'error',
      );
    } else {
      const failedRoles = failures.map((f) => `${f.role}:${f.person}`).join(', ');
      onToast?.(
        `Some attributions failed (${failedRoles}).`,
        'error',
      );
    }
    onClose?.();
  };

  if (step === STEP_LOADING_CONFIG || step === STEP_SUBMITTING) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-800 text-white rounded-2xl px-6 py-5">
          {step === STEP_LOADING_CONFIG ? 'Loading…' : 'Crediting…'}
        </div>
      </div>
    );
  }

  if (step === STEP_NOT_CONFIGURED) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-800 text-white rounded-2xl px-6 py-5 max-w-sm w-full">
          <h3 className="text-lg font-semibold">Chore mapping not configured</h3>
          <p className="text-sm text-gray-300 mt-2">
            Open the Chores add-on → Settings → Cross-app integrations and
            pick a shopping chore and a scan/unpack chore. Then come back
            and finish a shopping session again.
          </p>
          <button
            className="mt-4 w-full py-2 rounded-lg bg-brand-cobalt hover:bg-brand-cobalt-400 font-semibold"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  // STEP_SHOPPERS or STEP_SCANNERS
  const isShoppers = step === STEP_SHOPPERS;
  const picks = isShoppers ? shoppers : scanners;
  const setPicks = isShoppers ? setShoppers : setScanners;
  const title = isShoppers ? 'Who did the shopping?' : 'Who did the scanning?';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 text-white rounded-2xl px-5 py-5 max-w-sm w-full">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-xs text-gray-400 mt-1">
          {scanCount} item{scanCount === 1 ? '' : 's'} scanned this session.
        </p>
        <ul className="mt-4 space-y-2 max-h-72 overflow-y-auto">
          {persons.map((p) => {
            const picked = picks.includes(p.entity_id);
            return (
              <li key={p.entity_id}>
                <button
                  type="button"
                  onClick={() => togglePick(picks, setPicks, p.entity_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                    picked
                      ? 'bg-brand-cobalt/20 border-brand-cobalt'
                      : 'bg-gray-700/60 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                    : <span className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">👤</span>}
                  <span className="flex-1 text-left">{p.name}</span>
                  {picked && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className="w-full py-3 rounded-xl bg-brand-cobalt hover:bg-brand-cobalt-400 font-semibold disabled:opacity-50"
            onClick={() => {
              if (isShoppers) {
                setStep(STEP_SCANNERS);
              } else {
                submit();
              }
            }}
          >
            {isShoppers ? 'Next' : 'Done'}
          </button>
          <button
            type="button"
            className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600"
            onClick={() => {
              setPicks([]);
              if (isShoppers) {
                setStep(STEP_SCANNERS);
              } else {
                submit();
              }
            }}
          >
            Skip this role
          </button>
          <button
            type="button"
            className="w-full py-2 rounded-xl text-gray-400 hover:text-white text-sm"
            onClick={() => {
              if (isShoppers) {
                onClose?.();
              } else {
                setStep(STEP_SHOPPERS);
              }
            }}
          >
            {isShoppers ? 'Cancel' : 'Back'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the frontend**

```bash
cd HA-grocy-stock/grocy_stock/frontend && npm install && npm run build
```

Expected: build completes with no errors. The component is not yet wired,
so it won't appear in the UI — that's Task 15.

- [ ] **Step 3: Commit**

```bash
cd HA-grocy-stock
git add grocy_stock/frontend/src/components/ShoppingAttributionModal.jsx
git commit -m "Stock frontend: add ShoppingAttributionModal component"
```

---

## Task 15: Stock frontend — wire modal into `handleScannerClose`

**Files:**
- Modify: `HA-grocy-stock/grocy_stock/frontend/src/App.jsx`

- [ ] **Step 1: Add the import and CHORES_API const**

In `HA-grocy-stock/grocy_stock/frontend/src/App.jsx`, near the existing
imports (top of the file), add:

```javascript
import ShoppingAttributionModal from './components/ShoppingAttributionModal';
```

Near the existing `const API_BASE = ...` and `const SCRAPER_API = ...`
lines (around line 14–15), add:

```javascript
const CHORES_API = `${INGRESS_PATH}/api/chores`;
```

- [ ] **Step 2: Add modal state**

Inside the top-level `App` component, near the other `useState` hooks
(find an appropriate spot — e.g. near `showScanner` state), add:

```javascript
const [shoppingAttribution, setShoppingAttribution] = useState(null);
// shoppingAttribution shape: { scanCount: number } | null
```

- [ ] **Step 3: Modify `handleScannerClose` to open the modal**

Find `handleScannerClose` (currently around line 2959). Change the body
from:

```javascript
const handleScannerClose = useCallback(
  async ({ scanned = 0 } = {}) => {
    setShowScanner(false);
    setShoppingRecents([]);
    if (scanned > 0 && discoverQueueRef.current.length === 0) {
      await refreshStock();
    }
  },
  [refreshStock],
);
```

to:

```javascript
const handleScannerClose = useCallback(
  async ({ scanned = 0 } = {}) => {
    setShowScanner(false);
    setShoppingRecents([]);
    if (scanned > 0 && discoverQueueRef.current.length === 0) {
      await refreshStock();
    }
    // After a shopping-mode session with at least one scan, ask who did
    // the shopping / scanning so HA-chores can credit XP and skip the
    // duplicate "Unpack & scan" follow-up.
    if (mode === 'shopping' && scanned > 0) {
      setShoppingAttribution({ scanCount: scanned });
    }
  },
  [refreshStock, mode],
);
```

(The dependency array gains `mode`.)

- [ ] **Step 4: Render the modal**

Find a top-level render site in `App` (alongside other overlays like
`{showScanner && <BarcodeScanner ... />}`). Add:

```jsx
{shoppingAttribution && (
  <ShoppingAttributionModal
    choresApi={CHORES_API}
    ingressPath={INGRESS_PATH}
    scanCount={shoppingAttribution.scanCount}
    onClose={() => setShoppingAttribution(null)}
    onToast={addToast}
  />
)}
```

- [ ] **Step 5: Build the frontend**

```bash
cd HA-grocy-stock/grocy_stock/frontend && npm run build
```

Expected: clean build.

- [ ] **Step 6: Smoke-test in dev mode (no backend wired)**

```bash
cd HA-grocy-stock/grocy_stock/frontend && npm run dev
```

Open the app, switch into shopping mode, scan a fake barcode (manual entry
fallback), press Finish — the modal should appear (it will then show
"Couldn't reach Chores" since there's no proxy in dev, which is expected).

- [ ] **Step 7: Commit**

```bash
cd HA-grocy-stock
git add grocy_stock/frontend/src/App.jsx
git commit -m "Stock frontend: open ShoppingAttributionModal after shopping finish"
```

---

## Task 16: Stock add-on — version bump + changelog

**Files:**
- Modify: `HA-grocy-stock/grocy_stock/config.json`
- Modify: `HA-grocy-stock/grocy_stock/CHANGELOG.md`

- [ ] **Step 1: Determine the new version**

Read the current `version` in `HA-grocy-stock/grocy_stock/config.json`. The
project's CLAUDE.md tracks this as `1.20.0` at the time of writing. Bump
the **minor** segment (feature add): `1.21.0`. If the actual current
version is different, use the highest existing one and apply the same minor
bump.

- [ ] **Step 2: Update version**

In `HA-grocy-stock/grocy_stock/config.json`, change the `"version"` field
to the new value (e.g. `"1.21.0"`).

- [ ] **Step 3: Add changelog entry**

Prepend to `HA-grocy-stock/grocy_stock/CHANGELOG.md`, above the topmost
existing `## X.Y.Z` header:

```markdown
## 1.21.0

- After finishing a shopping-mode scanning session, prompt for who did the shopping and who did the scanning (multi-select, with Skip).
- Each picked person gets the corresponding chore completed in HA-chores with full XP, streak, badge and level-up tracking.
- When at least one scanner is picked, the auto-spawned "Unpack & scan" follow-up chore is suppressed so the chore list doesn't show a duplicate.
- Level-up / badge / power-up popups appear inside the Chores add-on on its next open.
- New add-on option `chores_url` (auto-detected by default) plus `/api/chores/` nginx proxy.
```

- [ ] **Step 4: Commit**

```bash
cd HA-grocy-stock
git add grocy_stock/config.json grocy_stock/CHANGELOG.md
git commit -m "Bump HA-grocy-stock to 1.21.0: shopping-finish chore attribution"
```

---

## Task 17: Update the HA-grocy-stock submodule pointer

- [ ] **Step 1: Push Stock commits**

```bash
cd HA-grocy-stock
git push
cd ..
```

- [ ] **Step 2: Update the root submodule pointer**

```bash
git add HA-grocy-stock
git commit -m "Bump HA-grocy-stock submodule to 1.21.0 (shopping chore attribution)"
```

---

## Task 18: End-to-end manual verification

This task has no code; it's a smoke-test of the assembled feature against
running add-ons. Run through every line item.

- [ ] **Step 1: Install / rebuild both add-ons** through Supervisor and
      confirm both start cleanly. The Chores log should show "Database
      initialized" with one more table than before. The Stock log should
      show a "Chores URL (auto-detected): http://..." or
      "(from config): ..." line.

- [ ] **Step 2: In Chores → Settings → Cross-app integrations**, pick a
      shopping chore and a scan/unpack chore. (Create them first if they
      don't exist. The shopping chore should have its `followup_chore_id`
      set to the scan chore so the follow-up logic has something to
      inhibit.)

- [ ] **Step 3: Pick chore A** with a tiny XP reward so the test person is
      close to leveling up. In the Chores Persons table, set a test
      person's `xp_total` close to a level threshold.

- [ ] **Step 4: Open Stock**, switch to shopping mode, scan ≥1 barcode (or
      enter one manually), press **Finish**.

- [ ] **Step 5:** The "Who did the shopping?" modal should appear. Pick
      two persons. Press **Next**.

- [ ] **Step 6:** The "Who did the scanning?" modal should appear. Pick
      one person. Press **Done**.

- [ ] **Step 7: In HA-chores**, navigate to "My Chores" for each picked
      shopper — the shopping chore should appear under today's completed
      list, with the correct completer. Repeat for the scanner.

- [ ] **Step 8:** Today's chore list should **NOT** contain a pending
      "Unpack & scan" instance for the scan chore (it was completed).

- [ ] **Step 9: Reload Chores in the browser as the user who crossed a
      level**. A level-up modal should fire once. Reload again — it should
      NOT re-fire.

- [ ] **Step 10: Skip-scanner case.** Repeat the flow, but on the
      scanning step press "Skip this role". Confirm: shopping chore
      completed for shoppers; today's chore list now DOES contain a
      pending "Unpack & scan" instance.

- [ ] **Step 11: Skip-both case.** Repeat, skipping both. Confirm: no
      chore touched, no follow-up spawned.

- [ ] **Step 12: scanCount==0 case.** Open shopping scanner, immediately
      press Finish without scanning anything. The modal should NOT appear.

If any step fails, stop and reopen the relevant task to debug. Do not mark
this task complete until every box is checked.

- [ ] **Step 13: Commit any documentation updates** discovered during
      verification.

```bash
git status   # ensure clean
```

(Expected: clean working tree if no issues found.)

---

## Self-review notes

Spec coverage check:
- §5.1 nginx proxy + add-on option + Chores `ports` ⇒ Tasks 7 (ports), 12 (option + run script), 13 (nginx proxy). ✓
- §5.2 Stock frontend modal + Finish wiring + guard ⇒ Tasks 14 (modal), 15 (wiring). Guard is inside the modal (STEP_NOT_CONFIGURED). ✓
- §5.3 `apply_completion` refactor + suppress_followup + new hook router ⇒ Tasks 2 (refactor), 4 (hook + suppress wiring). ✓
- §5.3 persons endpoints ⇒ Tasks 5 (GET) + 6 (ACK). ✓
- §5.4 `pending_celebrations` migration + payload writes ⇒ Tasks 1 (table) + 3 (writes). ✓
- §5.5 Chores frontend drain ⇒ Task 9. ✓
- §5 chore-id config UI in Chores ⇒ Task 10. ✓
- §9 version bumps + changelogs ⇒ Tasks 7, 11, 16, 17. ✓
- §7.1 pytest cases ⇒ split across Tasks 1, 3, 4, 5, 6. ✓
- §7.2 manual verification ⇒ Task 18 (all 12 verification points). ✓
