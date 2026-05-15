# Recipe ingredient translator: preserve non-interchangeable variants

**Date:** 2026-05-16
**Submodule:** `HA-recipes/`
**Type:** Bug fix (prompt-only)

## Problem

The recipe page for *Camillas bästa rabarberpaj* (https://www.koket.se/camillas-basta-rabarberpaj) ingests three distinct Swedish sugar variants — `strösocker`, `syltsocker`, `vaniljsocker` — but all three collapse to a single Finnish product `sokeri` in HA-Storage. A household member who has only ordinary `sokeri` stocked cannot actually make this recipe: `syltsocker` (jam sugar with pectin) and `vaniljsocker` (vanilla-flavored sugar) are functionally different ingredients, not interchangeable with plain granulated sugar.

Tracing the pipeline, the failure is upstream in `_translate_ingredients()` at `HA-recipes/recipes/backend.py:1197–1248`. The current prompt instructs the AI to set `specific=null` for "plain generics" with examples drawn from cheese, oil, flour, and salt categories — but does not enumerate sugar variants, so the AI overgeneralizes and treats every `*socker` string as a plain generic. Downstream matching (`_match_ingredient`, `_ai_match_ingredients`, `_deduplicate_stub_candidates`, stub creation) already correctly distinguishes specific vs generic — it just never gets the chance because the upstream `specific` field arrives as `null`.

## Goal & non-goals

**Goal.** Teach the recipe ingredient translator to preserve functionally-distinct variants (jam sugar ≠ granulated sugar ≠ vanilla sugar) so downstream matching either binds to existing child products in HA-Storage or creates correct stub products — instead of collapsing every "sugar-ish" string to `sokeri`.

**Non-goals.**
- No new pipeline stages, no second AI call, no curated rules table.
- No changes to `_match_ingredient`, `_ai_match_ingredients`, `_deduplicate_stub_candidates`, or stub creation — those already do the right thing once `specific` is set.
- No retroactive cleanup of existing collapsed-into-`sokeri` recipes in Storage.
- No UX changes; the user already sees orange-highlighted "missing" pills in the recipe view when a stub product is inactive.

**Out of scope (deliberate YAGNI).**
- A curated SV/EN/FI variant dictionary — explicitly rejected in brainstorming. The AI is the source of truth for variant knowledge, guided by an upgraded prompt.
- Variant-aware deduplication beyond the existing `_deduplicate_stub_candidates`: if Gemini happens to translate `vaniljsocker` slightly differently across two recipes, the existing dedup step handles it.

## Approach

Targeted prompt expansion of `_translate_ingredients()` in `HA-recipes/recipes/backend.py`. Two surgical edits to the prompt; everything else in the function unchanged.

### Edit 1 — replace the `specific` rule (current line 1218)

Replace the single-line rule with a reasoning principle plus category exemplars:

> `"specific": Finnish-translated variant name when the source names a non-interchangeable sub-type, else null.`
>
> `Reasoning test: if a cook were to swap this variant for the plain generic and the recipe outcome would change (different texture, flavor, chemistry, fat content), the variant is non-interchangeable — set "specific".`
>
> `Category exemplars (apply the same reasoning to anything not listed):`
> `  Sugars: strösocker/socker/sugar → "sokeri", specific=null. syltsocker → specific="hillosokeri" (contains pectin). vaniljsocker/vaniljsukker → specific="vaniljasokeri". florsocker/florsukker/powdered → specific="tomusokeri". farinsocker/brunt socker/brown sugar → specific="fariinisokeri". rörsocker/cane → specific="ruokosokeri".`
> `  Fats: smör/butter → "voi", specific=null. margarin → specific="margariini". osaltat smör/unsalted → specific="suolaton voi". olivolja/olive oil → specific="oliiviöljy". rapsolja → specific="rypsiöljy". kokosolja → specific="kookosöljy".`
> `  Flours: vetemjöl/wheat flour → "vehnäjauho", specific=null. rågmjöl/rye → specific="ruisjauho". grahamsmjöl → specific="grahamjauho". potatismjöl/perunajauho → specific="perunajauho" (distinct from wheat). majsstärkelse/cornstarch → specific="maissitärkkelys". mandelmjöl → specific="mantelijauho". dinkelmjöl → specific="speltijauho".`
> `  Dairy & misc: grädde/cream → "kerma", specific=null. vispgrädde → specific="vispikerma". matlagningsgrädde → specific="ruokakerma". crème fraîche → specific="crème fraîche". gräddfil/sour cream → specific="smetana". flingsalt/flake salt → specific="merisuolahiutaleet". mustapippuri kokonainen/whole pepper → specific="kokonainen mustapippuri".`
> `  Cheese (existing coverage): plain "cheese"/"juusto" → null. Parmesan/gouda/mozzarella/feta → specific=<finnish name>.`
> `  Anything else: apply the swap-test. Be conservative — when in doubt, set specific.`

### Edit 2 — add three example lines

Inside the existing `Examples:` block (after line 1241, before `Do NOT include any text outside the JSON array`):

> `  "1 dl syltsocker" → name="sokeri", specific="hillosokeri", amount=1, unit="dl"`
> `  "2 tsk vaniljsocker" → name="sokeri", specific="vaniljasokeri", amount=2, unit="tl"`
> `  "1 dl strösocker" → name="sokeri", specific=null, amount=1, unit="dl"  (interchangeable with plain sugar)`

### Everything else unchanged

- Function signature, return shape, callers, and post-processing (`_fix_countable_units`) are not touched.
- Matching, dedup, and stub creation downstream are not touched.

## Test coverage

One new test in `HA-recipes/recipes/tests/test_matching.py`.

**`test_translate_preserves_sugar_variants`**
- Mocks `_call_ai_json` to return the JSON structure we expect Gemini to produce given the upgraded prompt.
- Feeds the rabarberpaj ingredient list (`strösocker`, `syltsocker`, `vaniljsocker`) into `_translate_ingredients`.
- Asserts:
  - `strösocker` → `name="sokeri"`, `specific=None`
  - `syltsocker` → `name="sokeri"`, `specific="hillosokeri"`
  - `vaniljsocker` → `name="sokeri"`, `specific="vaniljasokeri"`

Because `_call_ai_json` is mocked, this is a **prompt-output contract test** — it locks in the expected shape so a future prompt edit that loses the variant rules will fail visibly. It does *not* validate that Gemini actually produces that output in production.

**Live-call sanity check (not a committed test).** Before bumping the version, run the real `_translate_ingredients` against the rabarberpaj list using the configured local provider (Gemini-flash by default), inspect the output, and confirm Gemini honors the new rules. If it doesn't, iterate on the prompt before merging.

## Rollout

**Version.** Patch bump in `HA-recipes/recipes/config.json` from `2.2.0` → `2.2.1`.

**Changelog entry** in `HA-recipes/recipes/CHANGELOG.md` under a new `## 2.2.1` header (plain — no date, no brackets, Supervisor parsing depends on this):

> Recipe ingredient translator now preserves non-interchangeable sugar, fat, flour, and dairy variants (syltsocker, vaniljsocker, brun farin, vispgrädde, etc.) instead of collapsing them onto the generic product.

**Impact on existing data.**
- Existing recipes in HA-Storage are not retroactively re-translated.
- Newly imported recipes that encounter a variant the user hasn't curated will create stub parent products (`hillosokeri`, `vaniljasokeri`, …) via the existing unmatched-ingredient path. These land as inactive parents in the "Group master" group and surface as orange/missing pills in the recipe UI for the user to activate or merge.
- `_deduplicate_stub_candidates` already protects against near-duplicate stub creation.

**Workflow.** Submodule-first per the repo's bite-table convention: commit and push inside `HA-recipes/`, then bump the submodule pointer in the `HA-apps` root repo.

## Files changed

- `HA-recipes/recipes/backend.py` — prompt edits to `_translate_ingredients()`.
- `HA-recipes/recipes/tests/test_matching.py` — new test `test_translate_preserves_sugar_variants`.
- `HA-recipes/recipes/config.json` — version bump.
- `HA-recipes/recipes/CHANGELOG.md` — new `## X.Y.Z` entry.

## Verification

1. New unit test passes.
2. Live `_translate_ingredients` call on the rabarberpaj ingredient list produces `specific="hillosokeri"` and `specific="vaniljasokeri"` for the two non-generic sugars, and `specific=None` for `strösocker`.
3. After re-importing the recipe in a dev HA instance, the three sugar lines render as three distinct product pills (one already-stocked `sokeri`, two new stubs) rather than three pills bound to the same `sokeri` product.
