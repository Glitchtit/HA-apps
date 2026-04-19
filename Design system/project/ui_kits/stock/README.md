# UI Kit — Stock

Mobile-first pantry dashboard. Ported from `HA-grocy-stock/grocy_stock/frontend/src/App.jsx`.

## Patterns captured
- **Trapezoid location tabs** (`clip-path: polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)`), active tab raises to `bg-2` surface.
- **Universal product row** — 48px rounded thumbnail (emoji) + title + sub + trailing `qty unit` with opened count + status pill.
- **Detail bottom-sheet** (`rounded-2xl`, slide-up), four primary actions in a 2×2 grid: +1, Open 1, −1, Keep in stock.
- **Undo toast** top-right (we're rendering a snapshot; the real one has a 4s shrinking bar).
- Sticky translucent header with emoji logo + live counter (`8 products · 2 missing`).

## Files
- `App.jsx` — `StockApp`, plus `ProductRow`, `TrapTab`, `DetailSheet`, `Toast`, `StatusDot`, `Thumb`.
- `index.html` — renders in a 390×820 phone frame.

## Known trims
- Barcode scanner screen is not modelled.
- Swipe gestures are click-to-open in the kit.
- Real app has drag-for-directional-action; omitted.
