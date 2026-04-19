# UI Kit — Chores

Gamified household chore tracker. Ported from `HA-chores/chores/frontend/`.

## Patterns
- **Bottom tab bar** with emoji + label pairs — transforms into a 80px vertical rail at `lg:` in the real app (phone-only here).
- **Person picker** in the header — a chip with emoji + "you" badge when auto‑detected.
- **XP bar** — rounded capsule filled with an orange→gold gradient, brand glow. Used for both people and pet.
- **Leaderboard card** — rank 1 gets a gold border glow and 🏆.
- **Pet surface** — blue/orange gradient background, breathing CSS animation, sprite placeholder.
- **Overdue** chores get a red border + red text; completed chores have strike-through and 60% opacity.

## Files
- `App.jsx` — `ChoresApp`, plus `Tab`, `PersonCard`, `ChoreRow`, `XPBar`, `Pet`.
- `index.html` — phone frame.
