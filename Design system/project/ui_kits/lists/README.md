# UI Kit — Lists

Goblin-Tools-style task manager with folders → lists → items → subtasks, spiciness-driven AI breakdown, and HA-storage-backed AI config. Ported from `HA-lists/lists/frontend/`.

## Patterns

- **Three-pane desktop layout** — sidebar (folders/lists) · items column · item detail. Collapses to single-column on mobile.
- **Sidebar** — folder groups with emoji + name, counters in mono, active row uses cobalt fill + glow.
- **Item row** — rounded card, left-edge status dot (hollow → green check), title, due/pepper/tag meta row in `--fg-3`. Overdue rows get a red 1px border + red text; done rows strike through and fade to 55% opacity.
- **Pepper indicator** — 1–5 🌶️ emoji at `-2px` letter-spacing for a tight cluster.
- **Spiciness slider** — custom `.spice` slider with an orange→gold gradient track and glowing orange thumb. Reads `gentle ←→ goblin` below.
- **AI actions row** — three buttons: 🪄 Break down (primary, orange + glow), ⏱️ Estimate (neutral), ✏️ Formalize (neutral pill with inline tone `<select>`). Shown in item detail.
- **AI subtask pill** — AI-generated subtasks get a warm-orange tint + 1px orange-25% border + ✨ badge on the right. Human-added subtasks sit on plain `--bg-2`.
- **AI job toast** — bottom-right cobalt card, shimmer overlay while running, mono log tail inside; switches to emerald on done / red on error.
- **Compile dialog** — modal with a `--font-mono` textarea (evokes brain-dump free-writing), primary action is orange 🪄 "Compile".

## Colors used
- Cobalt = primary navigation (active list, toast running).
- Orange = AI / creative / "go do it" accent, plus spiciness gradient.
- Emerald = done / success. Amber-bg + red text = overdue.

## Files
- `App.jsx` — `ListsApp`, plus `Sidebar`, `ItemsColumn`, `ItemDetail`, `AiJobToast`, `CompileDialog`, and primitives (`Pepper`, `Tag`, `AssigneeDot`, `AiActionButton`).
- `index.html` — desktop frame (1200 × 780) with spice slider + ai-shimmer keyframes inlined.
