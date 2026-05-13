# UI Kit — Recipes

Recipe scraper UI. Ported from `HA-recipes/recipes/frontend/`.

## Patterns
- **URL composer at top** — sticky header, input + "Hae" primary button (cobalt in our theme; emerald in source).
- **Grid of recipe cards** (2-up mobile / 3-up sm / 4-up lg) — `aspect-video` image + 2-line clamped title + serving pill + Finnish tag chips.
- **Detail overlay** — `max-w-md` `rounded-2xl` full-screen overlay, scrollable, footer with `Lisää ostoslistalle` + `Poista`.
- **Ingredient rows** — tinted status cells: emerald for in-stock, amber for opened, red for missing. `/12` opacity background, `-300` text color — the canonical tint pattern from Stock and Storage too.

## Files
- `App.jsx` — `RecipesApp`, plus `RecipeCard`, `RecipeDetail`, `IngredientRow`.
