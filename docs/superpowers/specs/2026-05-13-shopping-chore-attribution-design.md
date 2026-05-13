# Shopping Chore Attribution — Design

**Status:** Draft
**Date:** 2026-05-13
**Apps touched:** `HA-grocy-stock`, `HA-chores`

## 1. Problem

When a household member finishes a shopping run in HA-grocy-stock (continuous
scanner in `mode === 'shopping'`), nothing is credited toward gamification in
HA-chores even though "Grocery shopping" and "Unpack & scan" are typically
modelled as two chained chores. Worse: HA-chores still spawns the "Unpack &
scan" follow-up after the (currently-uncredited) shopping chore completes,
producing a dangling chore in today's list that the user has effectively
already done from within Stock.

## 2. Goal

After the user presses **Finish** in the shopping scanner (and at least one
item was scanned):

1. Prompt "Who did the shopping?" — multi-select picker over household
   persons, with **Skip**.
2. Prompt "Who did the scanning?" — same widget, same rules.
3. For each shopper picked, complete the configured **shopping** chore in
   HA-chores (full XP, streaks, badges, level-ups).
4. For each scanner picked, complete the configured **scan** chore in
   HA-chores.
5. **Inhibit the shopping chore's follow-up spawn** when at least one scanner
   is picked (we already recorded the scan). If the scanner role is **skipped
   entirely**, fall back to the normal follow-up spawn so somebody can still
   claim the unpack/scan chore later.
6. Any level-up / badge / power-up celebrations triggered by the above are
   **deferred** — they appear in HA-chores the next time the relevant person
   opens it, via the existing `GameEffects.jsx` modal queue.

## 3. Non-goals (v1)

- Retry queue for offline HA-chores.
- Per-person XP split (we duplicate full XP to each picked person — same as
  if each had completed their own instance).
- Editing attribution after the fact.
- "Who did the put-away" as a separate role.
- Showing celebrations inside HA-grocy-stock.

## 4. Architecture

```
HA-grocy-stock frontend            HA-grocy-stock backend         HA-chores backend
─────────────────────────          ─────────────────────────      ─────────────────────────
Finish button (continuous          POST /shopping-session/        POST /api/shopping-hook/
  scanner, mode='shopping',          finish                         complete
  scanCount > 0)                     { shoppers: [...],             { chore_id, person,
   │                                   scanners: [...],              suppress_followup,
   ▼                                   scan_count }                  notes }
ShoppingAttributionModal               │                            ─── for each (chore × person):
  step 1: "Who did the shopping?"      ▼                            1. find/create today's instance
  step 2: "Who did the scanning?"  chores_client.py                 2. apply_completion() — shared
   │                                 (httpx → chores_base_url)        helper extracted from
   ▼                                   │                              POST /assignments/{id}/complete
  POST .../shopping-session/finish     ▼                            3. if suppress_followup: skip
                                   for shopper in shoppers:           the followup-spawn block
                                     hook(shopping_chore_id,        4. if leveled_up|new_badges|
                                          shopper,                     powerup_earned: insert into
                                          suppress=bool(scanners))     pending_celebrations
                                   for scanner in scanners:
                                     hook(scan_chore_id, scanner,
                                          suppress=False)

HA-chores frontend on mount → GET /api/persons/me/pending-celebrations
                              → enqueue into modal queue
                              → POST .../ack with consumed ids
```

The two add-ons are separate ingress services and cannot share a relative
URL. HA-grocy-stock's backend talks to HA-chores' backend over the Supervisor
internal docker network. The exact hostname Supervisor exposes depends on
the install (commonly `http://local-ha_chores` or `http://<repo_id>_ha_chores`,
or — if Chores declares a `ports` mapping — the host's IP). Stock add-on
options expose `chores_base_url` (string, no default validation) so the user
can set it once at install time. Chores' FastAPI process listens on
**port 8100** internally (`main.py` `uvicorn.run(..., port=8100)`); nginx
fronts that on port 8099 for ingress. The hook endpoint should be reachable
on the FastAPI port directly — verify during implementation whether
Supervisor routing allows that, otherwise expose the hook through nginx by
adding a `location /api/shopping-hook/` block that proxies to FastAPI (the
nginx template already proxies `/api/`, so the new route is covered).

## 5. Components

### 5.1 Stock frontend

- **Modify** `handleScannerClose({scanned})` in
  `HA-grocy-stock/grocy_stock/frontend/src/App.jsx` so that when
  `mode === 'shopping' && scanned > 0`, the new modal is opened *before*
  running the existing close logic. The existing logic (refresh stock,
  reset shopping recents) runs after the modal closes regardless of outcome.

- **Add** `ShoppingAttributionModal` component (new file
  `HA-grocy-stock/grocy_stock/frontend/src/components/ShoppingAttributionModal.jsx`).
  - Two-step state machine (`step: 'shoppers' | 'scanners' | 'submitting'`).
  - Persons fetched from `${API_BASE}/persons` (Stock proxies to Chores).
  - Each step renders a list of person cards (avatar + name, tap to toggle
    selection), a "Skip this role" button, and "Next"/"Done".
  - Cancel from step 1 aborts the whole flow (returns to scanner close as if
    nothing happened). Cancel from step 2 preserves step 1's pick and
    re-opens step 2.
  - On Done: POST `${API_BASE}/shopping-session/finish` with
    `{shoppers: [entity_id...], scanners: [entity_id...], scan_count}`.
  - Toast on success summarising attributions. Toast on failure (see §6).

- **Add** chore-picker rows to the Stock settings panel (existing settings
  modal already exists). Two dropdowns: "Shopping chore" and "Scan/unpack
  chore", populated from `${API_BASE}/chores` (Stock proxies). Selection is
  persisted in the Stock add-on options (round-trip via Supervisor
  `/addons/self/options`).

- **Guard** the modal: if either chore ID is unset, show the modal with a
  single message "Pick the shopping and scan chores in settings first" and a
  link that opens settings. Skip the attribution flow that session.

### 5.2 Stock backend

- **New file** `HA-grocy-stock/grocy_stock/app/chores_client.py`:
  - httpx async client bound to `chores_base_url` from add-on options.
  - 5s connect timeout, 10s read timeout, one retry on `ConnectError`.
  - `async def get_persons() -> list[dict]`
  - `async def get_chores() -> list[dict]`
  - `async def complete_via_hook(chore_id: int, person: str,
                                 suppress_followup: bool,
                                 notes: str = "") -> dict`
  - Raises `ChoresUnreachable` on transport failure; `ChoresAPIError(status,
    body)` on non-2xx.

- **New router** `HA-grocy-stock/grocy_stock/app/routers/shopping_session.py`:
  - `GET /persons` → `chores_client.get_persons()`.
  - `GET /chores` → `chores_client.get_chores()`.
  - `POST /shopping-session/finish`:
    ```python
    class FinishBody(BaseModel):
        shoppers: list[str]
        scanners: list[str]
        scan_count: int
    ```
    Reads `shopping_chore_id` / `scan_chore_id` from add-on options.
    For each shopper:
      `complete_via_hook(shopping_chore_id, person,
                         suppress_followup=bool(scanners))`
    For each scanner:
      `complete_via_hook(scan_chore_id, person, suppress_followup=False)`
    Aggregates results into
    ```json
    {
      "shoppers": [{"person": "...", "ok": true,  "result": {...}},
                   {"person": "...", "ok": false, "error": "..."}],
      "scanners": [...]
    }
    ```
    Returns 200 if all succeeded, 207 if any individual call failed, 502 if
    Chores was completely unreachable.

- **Modify** `HA-grocy-stock/grocy_stock/app/config.py` (or wherever add-on
  options are loaded) to expose `chores_base_url`, `shopping_chore_id`,
  `scan_chore_id`. Update `HA-grocy-stock/grocy_stock/config.json` schema
  block accordingly. Defaults: `chores_base_url: ""` (user fills in), the
  two IDs default to `null`. The Stock add-on README should document the
  expected value — for the common case where Chores' add-on declares its
  ports via `ports`, this is `http://<host_or_slug>:8100`. If Chores does
  not declare host ports, add a `ports: {"8100/tcp": null}` entry in
  `HA-chores/chores/config.json` so the API is reachable from sibling
  add-ons (no host exposure — `null` means container-network only).

### 5.3 Chores backend

- **Refactor** `HA-chores/chores/app/routers/assignments.py`:
  - Extract the body of `POST /assignments/{instance_id}/complete` (lines
    144–275) into a helper
    `apply_completion(conn, instance_row, completed_by, notes, *,
                       bg: BackgroundTasks | None,
                       suppress_followup: bool = False) -> dict`.
  - The existing `complete_instance` endpoint becomes a thin wrapper calling
    `apply_completion(..., suppress_followup=False)`.
  - `apply_completion` is the single place that:
    1. Validates not already completed.
    2. Calculates XP with bonuses / power-ups.
    3. Updates the instance row.
    4. Runs `update_streak`, `add_xp`, `award_levelup_powerup`.
    5. Bumps pet happiness.
    6. Runs `check_and_award_badges`.
    7. Optionally fires push notifications via `bg.add_task` (only when bg
       is not None — i.e. the original endpoint path).
    8. Spawns the follow-up instance, **iff** not `suppress_followup`.
    9. **NEW**: when `leveled_up or new_badges or powerup_earned`, inserts a
       row into `pending_celebrations` (see §5.4).
  - Returns the same enriched dict as before so `CompleteResult` is unchanged.

- **New router** `HA-chores/chores/app/routers/shopping_hook.py`:
  - `POST /api/shopping-hook/complete`:
    ```python
    class HookBody(BaseModel):
        chore_id: int
        person: str           # entity_id
        suppress_followup: bool = False
        notes: str = ""
    ```
    Behaviour:
    1. Look up today's pending/claimed instance:
       `SELECT * FROM chore_instances
        WHERE chore_id = ? AND due_date = ? AND status IN ('pending','claimed')
        ORDER BY id LIMIT 1`.
    2. If none, create one: `INSERT INTO chore_instances (chore_id, due_date,
       assigned_to, status, created_by) VALUES (?, ?, NULL, 'pending',
       'shopping-hook')`.
    3. Fetch the joined instance row (with chore fields needed by
       `apply_completion`).
    4. Call `apply_completion(conn, row, person, notes,
                              bg=None,            # no push notifications
                              suppress_followup=suppress_followup)`.
    5. Return the dict.
  - Mounted in `app/main.py` alongside the existing routers.

- **New endpoints on `persons` router** in
  `HA-chores/chores/app/routers/persons.py`:
  - `GET /api/persons/me/pending-celebrations` — returns unseen rows for the
    HA user behind `X-Remote-User-Id` (matching the existing `whoami`
    resolution). Shape: `list[PendingCelebration]` (see model below).
  - `POST /api/persons/me/pending-celebrations/ack` — body `{ids: [int...]}`,
    sets `seen_at = now()` for those rows. Only rows belonging to the
    requesting person are updated; others are silently ignored.

### 5.4 Chores schema migration

In `HA-chores/chores/app/database.py` `_run_migrations`, add:

```sql
CREATE TABLE IF NOT EXISTS pending_celebrations (
    id          INTEGER PRIMARY KEY,
    person_id   TEXT NOT NULL REFERENCES persons(entity_id) ON DELETE CASCADE,
    payload     TEXT NOT NULL,            -- JSON
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    seen_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_celebrations_person_unseen
    ON pending_celebrations(person_id) WHERE seen_at IS NULL;
```

Payload JSON shape (matches what `GameEffects.jsx` already expects):

```json
{
  "old_level": 6,
  "new_level": 7,
  "leveled_up": true,
  "new_badges": [{"id":"...", "name":"...", "icon":"...", "description":"..."}],
  "powerup_earned": {"id": 12, "name":"XP Boost", "icon":"⚡", ...},
  "source": "shopping-hook",
  "completed_at": "2026-05-13T18:42:00"
}
```

Pydantic model:

```python
class PendingCelebration(BaseModel):
    id: int
    payload: dict
    created_at: str
```

### 5.5 Chores frontend

- **Modify** `HA-chores/chores/frontend/src/api.js` to add
  `getPendingCelebrations()` and `ackPendingCelebrations(ids)`.

- **Modify** `HA-chores/chores/frontend/src/components/effects/GameEffects.jsx`:
  - On mount (top-level component), fetch pending celebrations.
  - For each row, translate the payload into the same `modalQueue` entries
    the file already builds at lines 583–626 (level-up first, then badges,
    then power-up).
  - When the modal queue drains, POST the consumed ids to ack.
  - Guard against double-firing if the user navigates and the component
    remounts: ack synchronously when each modal is dismissed rather than at
    the end of the queue.

No changes to the modal visuals.

## 6. Error handling

| Failure                                       | Result                                                                                                       |
|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| Chores unreachable from Stock                  | Stock returns 502; modal toast: "Couldn't reach Chores — scans saved, XP not credited." Modal closes anyway. |
| `chore_id` not found / inactive in Chores      | Hook returns 404; Stock aggregates as failure for that person, toast lists the role.                         |
| `person` not in Chores DB                      | Hook returns 404; Stock skips that attribution silently, logs a warning.                                     |
| `scanCount == 0`                               | Modal not opened; scanner closes as today.                                                                   |
| Both roles skipped                             | No HTTP call made; modal closes; follow-up spawn does NOT happen (no shopping chore was completed at all).   |
| Shoppers picked, scanners skipped              | Shopping chore completed for each shopper with `suppress_followup=False` → normal follow-up spawn fires once. |
| Shoppers picked, scanners picked               | Shopping chore completed with `suppress_followup=True` → no follow-up. Scan chore completed for each scanner. |
| Shoppers skipped, scanners picked              | Only scan chore completed for each scanner. No shopping chore → no follow-up question to begin with.         |
| Chore IDs not configured in Stock settings     | Modal opens with "configure chores in settings" message and a link; no HTTP call.                            |
| Partial failure (some persons OK, some not)    | Stock returns 207, toast lists failed persons by role.                                                       |
| Celebration insert fails                       | Logged; the completion itself still succeeds. We don't fail the hook because of a missed popup.              |

## 7. Testing

### 7.1 Chores backend (pytest)

- `test_shopping_hook_completes_existing_instance` — pre-seed a pending
  instance, call hook, assert `status = completed`, `completed_by` set, XP
  awarded.
- `test_shopping_hook_creates_instance_when_missing` — no pending instance,
  call hook, assert a new instance was created and completed.
- `test_shopping_hook_suppress_followup` — chore has `followup_chore_id`
  set; call hook with `suppress_followup=True`; assert no new instance for
  the followup chore was created.
- `test_shopping_hook_spawns_followup_when_not_suppressed` — same chore,
  `suppress_followup=False`; assert followup spawned.
- `test_shopping_hook_writes_pending_celebration_on_levelup` — set person's
  XP just below threshold; call hook; assert one row in
  `pending_celebrations` with `leveled_up: true`.
- `test_pending_celebrations_get_filters_seen` — insert two rows, mark one
  seen, GET returns only the unseen one.
- `test_pending_celebrations_ack_marks_seen` — POST ack with ids; rows now
  have `seen_at` set; GET returns nothing.
- `test_pending_celebrations_ack_scoped_to_requester` — ack with another
  person's id is silently ignored.

### 7.2 Stock backend (pytest)

Mock `chores_client` throughout.

- `test_finish_fans_out_to_each_person` — 2 shoppers, 1 scanner ⇒ 3
  `complete_via_hook` calls with correct args; shoppers have
  `suppress_followup=True`.
- `test_finish_suppress_false_when_scanners_skipped` — 1 shopper, 0
  scanners ⇒ 1 call, `suppress_followup=False`.
- `test_finish_partial_failure_returns_207` — one call raises
  `ChoresAPIError`; response includes per-person `ok=False`.
- `test_finish_returns_502_on_chores_unreachable` — first call raises
  `ChoresUnreachable`; backend short-circuits.
- `test_finish_with_unconfigured_chore_ids_returns_400`.

### 7.3 Manual frontend verification

(No automated frontend tests in either repo.)

1. Configure shopping & scan chores in Stock settings.
2. Open shopping scanner, scan ≥1 barcode, press Finish.
3. Pick two shoppers, pick one scanner → submit.
4. In HA-chores: today's shopping chore appears completed by both shoppers
   (two completed instances or one with two completers? — confirm before
   implementation: simplest is one instance per person, created on the fly).
5. Today's scan chore appears completed by the scanner.
6. No "Unpack & scan" follow-up appears in today's list.
7. Open HA-chores as one of the levelled-up persons → see level-up modal,
   then any badge modals, then any power-up modal.
8. Repeat with scanner = Skip → confirm follow-up DOES appear.
9. Repeat with both = Skip → confirm no chores touched, no follow-up.
10. Repeat with `scanCount == 0` → confirm modal does NOT appear.

## 8. Multi-person completion model

`chore_instances.completed_by` is a single column, so when multiple shoppers
or scanners are picked the hook records **one instance per person** for that
chore on today's date:

- First call: claim/complete an existing pending instance if one is already
  scheduled for today; otherwise insert a new one.
- Subsequent calls (same chore, same day, different person): always insert a
  new instance with `status='completed'`, `completed_by=person`,
  `assigned_to=NULL`, `created_by='shopping-hook'`.

This is consistent with the existing UI: `MyChores.jsx` filters by
`completed_by === activePerson`, and the leaderboard / streak / badge
queries in `gamification.py` all key on `completed_by`. Each completer gets
their own row, their own XP, their own streak bump.

## 9. Version bumps & changelog (per CLAUDE.md)

- `HA-grocy-stock/grocy_stock/config.json` minor bump + entry in
  `HA-grocy-stock/grocy_stock/CHANGELOG.md`.
- `HA-chores/chores/config.json` minor bump + entry in
  `HA-chores/chores/CHANGELOG.md`.
- Plain `## X.Y.Z` headers only.

## 10. Rollout

1. Land Chores backend changes (hook endpoint, migration, celebration
   endpoints) and ship a new add-on version. The schema migration is
   additive; the existing complete endpoint is byte-for-byte equivalent
   after refactor.
2. Land Chores frontend changes (drain pending celebrations on mount).
3. Land Stock backend (`chores_client`, new router, option fields).
4. Land Stock frontend (settings dropdowns + attribution modal + Finish
   integration).
5. User configures chore IDs in Stock settings; feature is live.
