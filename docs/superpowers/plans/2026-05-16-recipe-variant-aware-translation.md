# Recipe ingredient translator: preserve non-interchangeable variants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the recipe translator from collapsing Swedish sugar/fat/flour/dairy variants (e.g. `syltsocker`, `vaniljsocker`) onto generic Finnish products (`sokeri`) by upgrading the AI translation prompt with a reasoning principle plus category exemplars.

**Architecture:** Prompt-only change to `_translate_ingredients()` in `HA-recipes/recipes/backend.py`. No new pipeline stages, no rules table, no AI-call changes. Downstream matching/dedup/stub-creation already handles the `specific` field correctly — the bug is purely upstream.

**Tech Stack:** Python 3, pytest, Gemini/Claude via existing `_call_ai_json` helper.

**Spec:** `docs/superpowers/plans/../specs/2026-05-16-recipe-variant-aware-translation-design.md`

---

### Task 1: Add prompt-content regression test (TDD red)

**Files:**
- Modify: `HA-recipes/recipes/tests/test_matching.py` (append new class at end of file)

- [ ] **Step 1: Add the failing test class**

Append to the end of `HA-recipes/recipes/tests/test_matching.py`:

```python


class TestTranslatePromptVariantRules:
    """Prompt-content regression guard for the rabarberpaj bug.

    The translation prompt must teach the AI to preserve non-interchangeable
    sugar/fat/flour/dairy variants instead of collapsing them onto plain
    generics. We assert on the prompt text (captured from the mocked
    _call_ai_json) rather than the model's output, so the test is
    deterministic and fails loudly if a future edit drops the variant rules.
    """

    def test_translate_prompt_includes_variant_reasoning_rules(self, monkeypatch):
        captured = {}

        def fake_call(prompt):
            captured["prompt"] = prompt
            return []

        monkeypatch.setattr(backend, "_call_ai_json", fake_call)

        backend._translate_ingredients(["1 dl syltsocker"])

        prompt = captured["prompt"]
        # Reasoning principle present in some form
        assert "swap" in prompt.lower() or "interchangeable" in prompt.lower(), (
            "Prompt must teach the swap-test reasoning principle"
        )
        # Sugar variant exemplars
        assert "syltsocker" in prompt and "hillosokeri" in prompt
        assert "vaniljsocker" in prompt and "vaniljasokeri" in prompt
        assert "tomusokeri" in prompt  # powdered
        assert "fariinisokeri" in prompt  # brown
        # Fat variants
        assert "margariini" in prompt
        # Flour variants (rye was already there; check a newly added one)
        assert "mantelijauho" in prompt or "speltijauho" in prompt
        # Dairy
        assert "vispikerma" in prompt
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `cd HA-recipes/recipes && python -m pytest tests/test_matching.py::TestTranslatePromptVariantRules -v`

Expected: FAIL with `AssertionError` — current prompt does not contain `syltsocker`, `hillosokeri`, `vaniljasokeri`, `tomusokeri`, `fariinisokeri`, `margariini`, `mantelijauho`/`speltijauho`, or `vispikerma`.

- [ ] **Step 3: Commit the failing test**

```bash
cd HA-recipes
git add recipes/tests/test_matching.py
git -c user.email='74153343+Glitchtit@users.noreply.github.com' commit -m "test: prompt-content guard for sugar/fat/flour/dairy variants (failing)"
```

---

### Task 2: Replace the `specific` rule with reasoning principle + category exemplars

**Files:**
- Modify: `HA-recipes/recipes/backend.py:1218` (single line, replaced with a 7-line block)

- [ ] **Step 1: Make the edit**

Open `HA-recipes/recipes/backend.py`. The current line 1218 is:

```
- "specific": set to a Finnish-translated variant ONLY when the source names a non-interchangeable sub-type (parmesan, gouda, juustoraaste, mozzarella, fetajuusto, oliiviöljy, ruisjauho, spaghetti, basmati, merisuolahiutaleet, …). Plain generics ("cheese", "salt", "flour", "oil") → specific=null.
```

Replace that single line with:

```
- "specific": Finnish-translated variant name when the source names a non-interchangeable sub-type, else null. Reasoning test: if a cook were to swap this variant for the plain generic and the recipe outcome would change (different texture, flavor, chemistry, fat content), the variant is non-interchangeable — set "specific". Be conservative: when in doubt, set "specific".
  * Sugars: strösocker/socker/sugar → "sokeri", specific=null. syltsocker → specific="hillosokeri" (contains pectin). vaniljsocker/vaniljsukker → specific="vaniljasokeri". florsocker/florsukker/powdered sugar → specific="tomusokeri". farinsocker/brunt socker/brown sugar → specific="fariinisokeri". rörsocker/cane sugar → specific="ruokosokeri".
  * Fats: smör/butter → "voi", specific=null. margarin → specific="margariini". osaltat smör/unsalted butter → specific="suolaton voi". olivolja/olive oil → specific="oliiviöljy". rapsolja → specific="rypsiöljy". kokosolja → specific="kookosöljy".
  * Flours: vetemjöl/wheat flour → "vehnäjauho", specific=null. rågmjöl/rye → specific="ruisjauho". grahamsmjöl → specific="grahamjauho". potatismjöl → specific="perunajauho" (distinct from wheat). majsstärkelse/cornstarch → specific="maissitärkkelys". mandelmjöl → specific="mantelijauho". dinkelmjöl → specific="speltijauho".
  * Dairy & misc: grädde/cream → "kerma", specific=null. vispgrädde → specific="vispikerma". matlagningsgrädde → specific="ruokakerma". crème fraîche → specific="crème fraîche". gräddfil/sour cream → specific="smetana". flingsalt/flake salt → specific="merisuolahiutaleet". whole peppercorns → specific="kokonainen mustapippuri".
  * Cheese: plain "cheese"/"juusto" → null. Parmesan/gouda/mozzarella/feta → specific=<finnish name>.
```

Use Edit with `old_string` = the existing single line and `new_string` = the seven-line block above.

- [ ] **Step 2: Run the test, confirm it now passes (or pinpoint what's missing)**

Run: `cd HA-recipes/recipes && python -m pytest tests/test_matching.py::TestTranslatePromptVariantRules -v`

Expected: PASS. If any assertion still fails, the substring it's checking for is missing from the new block — fix the block before moving on.

- [ ] **Step 3: Run the full matcher test suite to confirm no regressions**

Run: `cd HA-recipes/recipes && python -m pytest tests/ -v`

Expected: all existing tests still pass.

---

### Task 3: Add concrete example lines to the prompt's `Examples:` block

**Files:**
- Modify: `HA-recipes/recipes/backend.py:1241` (insert three new example lines)

- [ ] **Step 1: Make the edit**

Open `HA-recipes/recipes/backend.py`. The current line 1241 ends the example list:

```
  "peppar efter smak" → name="pippuri", amount=null, unit=null
- Do NOT include any text outside the JSON array"""
```

Insert three new lines between `"peppar efter smak" → …` and `- Do NOT include any text outside the JSON array`, so it reads:

```
  "peppar efter smak" → name="pippuri", amount=null, unit=null
  "1 dl strösocker" → name="sokeri", specific=null, amount=1, unit="dl"
  "1 dl syltsocker" → name="sokeri", specific="hillosokeri", amount=1, unit="dl"
  "2 tsk vaniljsocker" → name="sokeri", specific="vaniljasokeri", amount=2, unit="tl"
- Do NOT include any text outside the JSON array"""
```

Use Edit with `old_string` capturing the `peppar` line through the `Do NOT include` line, and `new_string` inserting the three lines between them.

- [ ] **Step 2: Re-run the test suite to confirm nothing broke**

Run: `cd HA-recipes/recipes && python -m pytest tests/ -v`

Expected: all tests pass (the prompt-content test from Task 1 still passes — its assertions weren't tied to the examples block, but adding examples reinforces the behavior).

- [ ] **Step 3: Commit the prompt changes**

```bash
cd HA-recipes
git add recipes/backend.py
git -c user.email='74153343+Glitchtit@users.noreply.github.com' commit -m "fix(recipes): preserve non-interchangeable ingredient variants in translation

Upgrade _translate_ingredients prompt with a swap-test reasoning principle
plus category exemplars for sugar/fat/flour/dairy. Fixes the case where
syltsocker, vaniljsocker, and strösocker all collapsed onto a single
generic 'sokeri' product, breaking recipes that depend on variant-specific
behavior (pectin in jam sugar, vanilla flavoring, etc.)."
```

---

### Task 4: Live-call sanity check on the rabarberpaj recipe

This is a manual verification step, not a committed test. It confirms the live model honors the new prompt before we ship a version bump.

**Files:** none (read-only verification).

- [ ] **Step 1: Run the live translator against the rabarberpaj ingredient list**

```bash
cd HA-recipes/recipes && python -c "
import sys; sys.path.insert(0, '.')
import backend
out = backend._translate_ingredients([
    '500 g rabarber',
    '1 msk potatismjöl',
    '1 dl strösocker',
    '1 citron',
    '100 g smör',
    '1 dl syltsocker',
    '2 msk sirap',
    '2.5 dl vetemjöl',
    '1 tsk bakpulver',
    '2 tsk vaniljsocker',
    'glass',
])
import json
print(json.dumps(out, ensure_ascii=False, indent=2))
"
```

This requires a working AI provider configured locally (Gemini-flash by default, see `_call_ai_json` for env vars).

- [ ] **Step 2: Confirm the output**

Expected:
- `strösocker` → `name="sokeri"`, `specific=null`
- `syltsocker` → `name="sokeri"`, `specific="hillosokeri"`
- `vaniljsocker` → `name="sokeri"`, `specific="vaniljasokeri"`
- `potatismjöl` → `name="perunajauho"`, `specific=null` *(or `specific="perunajauho"` with name "vehnäjauho"; either is acceptable as long as it does not collapse onto plain wheat flour)*

If any of the three sugar lines comes back with `specific=null`, the prompt needs another iteration — go back to Task 2/3 and add more emphasis, then re-run this step.

**If the output is correct, proceed.** If not, do not move to Task 5 — diagnose first.

---

### Task 5: Version bump + changelog

**Files:**
- Modify: `HA-recipes/recipes/config.json:N` (the line with `"version": "2.2.0"`)
- Modify: `HA-recipes/recipes/CHANGELOG.md` (prepend a new `## 2.2.1` entry)

- [ ] **Step 1: Bump version**

In `HA-recipes/recipes/config.json`, change:

```
  "version": "2.2.0",
```

to:

```
  "version": "2.2.1",
```

- [ ] **Step 2: Prepend changelog entry**

At the very top of `HA-recipes/recipes/CHANGELOG.md`, insert a new entry (plain `## X.Y.Z` header — no date, no brackets, Supervisor parsing depends on this):

```
## 2.2.1
- Recipe ingredient translator now preserves non-interchangeable sugar, fat, flour, and dairy variants (syltsocker→hillosokeri, vaniljsocker→vaniljasokeri, florsocker→tomusokeri, vispgrädde→vispikerma, etc.) instead of collapsing them onto the plain generic product. Fixes recipes like Camillas bästa rabarberpaj where three Swedish sugar variants all bound to a single Finnish "sokeri" product.

```

Make sure there's a blank line between the new entry and the existing `## 2.2.0` heading.

- [ ] **Step 3: Commit the bump**

```bash
cd HA-recipes
git add recipes/config.json recipes/CHANGELOG.md
git -c user.email='74153343+Glitchtit@users.noreply.github.com' commit -m "Bump HA-recipes to 2.2.1: variant-aware ingredient translation"
```

---

### Task 6: Push submodule and update root pointer

**Files:**
- Modify: `HA-apps` root — submodule pointer for `HA-recipes/`.

- [ ] **Step 1: Push HA-recipes**

```bash
cd HA-recipes
git push
```

- [ ] **Step 2: Bump submodule pointer in HA-apps root**

```bash
cd /home/glitch/GIT/HA-apps
git add HA-recipes
git -c user.email='74153343+Glitchtit@users.noreply.github.com' commit -m "Bump HA-recipes to 2.2.1: variant-aware ingredient translation"
git push
```

- [ ] **Step 3: Confirm clean state**

```bash
cd /home/glitch/GIT/HA-apps && git status
cd HA-recipes && git status
```

Expected: both report `nothing to commit, working tree clean` and `Your branch is up to date with 'origin/...'`.

---

## Self-review

**Spec coverage:**
- "Edit 1 — replace the `specific` rule" → Task 2 ✓
- "Edit 2 — add three example lines" → Task 3 ✓
- "Test coverage" (prompt-content contract test) → Task 1 ✓
- "Live-call sanity check" → Task 4 ✓
- "Version bump 2.2.0 → 2.2.1" → Task 5 ✓
- "Changelog entry under plain `## 2.2.1` header" → Task 5 ✓
- "Submodule-first workflow" → Task 6 ✓

No spec requirements are unimplemented.

**Placeholder scan:** No TBD, TODO, or "TBD" remain. Every step has either concrete code or an exact command.

**Type consistency:** Task 1's test asserts on substrings (`hillosokeri`, `margariini`, etc.); Task 2's prompt block contains those exact substrings. Verified.

**Note on Task 4:** if the live model returns `specific=null` for the variants, do not skip ahead to the version bump — iterate on the prompt first. The spec is explicit about this gate.
