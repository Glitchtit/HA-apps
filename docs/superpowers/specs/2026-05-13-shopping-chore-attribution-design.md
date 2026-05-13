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

HA-grocy-stock is a **pure nginx + React** add-on (no Python backend). It
already proxies `/api/storage/` → HA-storage and `/api/scraper/` → scraper
via nginx upstreams. We follow the same pattern and add a third upstream:
`/api/chores/` → HA-chores' FastAPI (port 8100). The Stock frontend then
calls the hook on a relative URL exactly like it does for Storage today.

```
HA-grocy-stock frontend                   Stock nginx              HA-chores FastAPI
─────────────────────────                 ─────────────────        ─────────────────────────
Finish (continuous scanner,                                        POST /api/shopping-hook/complete
  mode='shopping', scanCount > 0)                                    { chore_id, person,
   │                                                                   suppress_followup, notes }
   ▼                                                                 ↳ find/create today's instance
ShoppingAttributionModal                                             ↳ apply_completion() (extracted
   step 1: "Who did the shopping?"                                      helper, shared with
   step 2: "Who did the scanning?"                                      POST /assignments/{id}/complete)
   │                                                                 ↳ if suppress_followup:
   │                                                                     skip followup spawn
   ▼                                                                 ↳ if leveled_up|new_badges|
   for shopper in shoppers:                                              powerup_earned:
     POST /api/chores/shopping-hook/        proxy_pass                   INSERT pending_celebrations
       complete { shopping_chore_id, ───→   ${CHORES_URL}/api/  ───→
                  shopper,
                  suppress_followup: bool(scanners) }
   for scanner in scanners:
     POST /api/chores/shopping-hook/
       complete { scan_chore_id, scanner, suppress: false }

HA-chores frontend on mount → GET /api/persons/me/pending-celebrations
                              → enqueue into modal queue
                              → POST .../ack with consumed ids
```

Cross-addon networking: Chores' FastAPI listens on **port 8100** internally
(`main.py` `uvicorn.run(..., port=8100)`). For sibling add-ons to reach it,
Chores' `config.json` declares `ports: {"8100/tcp": null}` (container-only
exposure, no host port). Stock's add-on option `chores_url` (default
`http://local_ha_chores:8100`) is exported as `CHORES_URL` and consumed by
the nginx template at startup. The exact hostname can vary by Supervisor
install — the user can override `chores_url` in add-on options.

The two `/api/chores/` and `/api/chores/shopping-hook/` routes:
`proxy_pass ${CHORES_URL}/api/` strips the `/api/chores/` prefix and replays
the rest, so the browser request `POST /api/chores/shopping-hook/complete`
becomes a backend `POST /api/shopping-hook/complete`.

## 5. Components

### 5.1 Stock nginx + add-on config

- **Modify** `HA-grocy-stock/grocy_stock/nginx.conf.template`: add a new
  `location ^~ /api/chores/` block that `proxy_pass`es to `${CHORES_URL}/api/`,
  modelled exactly on the existing `/api/storage/` block. Same headers, 30s
  read timeout (single chore-completion calls are fast).

- **Modify** `HA-grocy-stock/grocy_stock/config.json`:
  - Add one option field `chores_url` (str, optional). When omitted, the
    run script auto-detects the Chores add-on the same way it already
    does for Storage/Scraper, then probes port 8100.
  - Schema: `"chores_url": "str?"`.
  - **No** chore-id fields here. The shopping and scan chore IDs are
    stored in HA-chores' `config` table (single source of truth — see §5.4)
    and fetched at runtime by the Stock frontend.

- **Modify** `HA-grocy-stock/grocy_stock/rootfs/etc/cont-init.d/*` (or whichever
  script generates the runtime nginx.conf from the template): export
  `CHORES_URL` from `/data/options.json` so the nginx template substitution
  picks it up.

- **Modify** `HA-chores/chores/config.json` to declare
  `"ports": {"8100/tcp": null}` so sibling add-ons can reach the FastAPI
  port without exposing it to the host.

### 5.2 Stock frontend

- **Modify** `handleScannerClose({scanned})` in
  `HA-grocy-stock/grocy_stock/frontend/src/App.jsx` so that when
  `mode === 'shopping' && scanned > 0`, the new modal is opened *before*
  running the existing close logic. The existing logic (refresh stock,
  reset shopping recents) runs after the modal closes regardless of outcome.

- **Add** `ShoppingAttributionModal` component (new file
  `HA-grocy-stock/grocy_stock/frontend/src/components/ShoppingAttributionModal.jsx`).
  - Two-step state machine (`step: 'shoppers' | 'scanners' | 'submitting'`).
  - Persons fetched on mount from `${INGRESS_PATH}/api/chores/persons/`.
  - Each step renders a list of person cards (avatar + name, tap to toggle
    selection), a "Skip this role" button, and "Next"/"Done".
  - Cancel from step 1 aborts the whole flow. Cancel from step 2 returns
    to step 1.
  - On Done: builds the fan-out plan, then for each `(chore_id, person)`
    pair POSTs to `${INGRESS_PATH}/api/chores/shopping-hook/complete` with
    `{chore_id, person, suppress_followup, notes: ""}`. Uses
    `Promise.allSettled` so one failure doesn't block the others.
  - Aggregates per-call results into a toast summary
    ("Credited 2 shoppers, 1 scanner. Level-ups will appear in Chores.")
  - Toast on partial / full failure (see §6).

- **Add** the chore-id config UI to the *Chores* frontend (a small section
  in its existing Settings panel). Two dropdowns populated from
  `GET /api/chores/`; on change, PUT `/api/config/shopping_chore_id` /
  `scan_chore_id`. Stock is a consumer, not a config UI for these.

- **On modal open**: fetch both chore IDs from
  `GET ${INGRESS_PATH}/api/chores/config/shopping_chore_id` and
  `GET .../config/scan_chore_id`. If either is null/missing, the modal
  opens with "Pick the shopping and scan chores in Chores settings first"
  and a link that opens Chores ingress. No hook calls fire that session.

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
| Chores unreachable (nginx 502 / network)       | Each fan-out call fails. Frontend toast: "Couldn't reach Chores — scans saved, XP not credited." Modal still closes. |
| `chore_id` not found / inactive in Chores      | Hook returns 404 for that call; frontend aggregates as failure for that person, toast lists the failed role. |
| `person` not in Chores DB                      | Hook returns 404; frontend toasts but doesn't block other persons.                                            |
| `scanCount == 0`                               | Modal not opened; scanner closes as today.                                                                   |
| Both roles skipped                             | No HTTP call made; modal closes; follow-up spawn does NOT happen (no shopping chore was completed at all).   |
| Shoppers picked, scanners skipped              | Shopping chore completed for each shopper with `suppress_followup=False` → normal follow-up spawn fires once (only the first shopper's call spawns it; subsequent calls find the spawned instance and skip the duplicate-spawn branch). |
| Shoppers picked, scanners picked               | Shopping chore completed with `suppress_followup=True` for each shopper → no follow-up. Scan chore completed for each scanner. |
| Shoppers skipped, scanners picked              | Only scan chore completed for each scanner. No shopping chore → no follow-up question to begin with.         |
| Chore IDs not configured in Stock settings     | Modal opens with "configure chores in settings" message and a link; no HTTP call.                            |
| Partial failure (some persons OK, some not)    | `Promise.allSettled` collects results; toast lists failed persons by role; successes still take effect.       |
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

### 7.2 Manual frontend verification

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
   endpoints, `ports` declaration) and ship a new add-on version. The
   schema migration is additive; the existing complete endpoint is
   byte-for-byte equivalent after the refactor.
2. Land Chores frontend changes (drain pending celebrations on mount).
3. Land Stock add-on config + nginx changes (`chores_url` option,
   `/api/chores/` proxy block, env var wiring).
4. Land Stock frontend (settings dropdowns + attribution modal + Finish
   integration).
5. User configures chore IDs in Stock settings; feature is live.
