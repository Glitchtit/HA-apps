# UI Kit — Storage

System-of-record admin UI. Ported from `HA-storage/storage/frontend/` (React).

## Patterns
- **Desktop-leaning layout**, unlike the three mobile kits.
- **Horizontal tab bar** — 11 tabs, active tab gets a 2px bottom underline + colored label. Source uses emerald; we use brand orange for the re-themed palette.
- **Sticky header** `bg-gray-900/90 backdrop-blur-md border-b border-gray-800` — logo emoji, version/db info, green health dot + API port chip, primary `＋ New product` button.
- **Stat cards** — 4-up grid, left-border accent in tone color.
- **Products table** — `bg-3` header row, uppercase eyebrow labels, tinted status pills, inline edit button per row.
- **Toolbar filters** — dropdown-style ghost buttons with `▾` chevrons, counter on the right.

## Files
- `App.jsx` — `StorageApp`, `StatCard`, `Row`.
