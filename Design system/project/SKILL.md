---
name: glitchyree-design
description: Use this skill to generate well-branded interfaces and assets for GlitchyRee's Home Assistant add-on ecosystem (Storage, Stock, Recipe, Chores), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key facts:
- Four products: 🗄️ Storage (admin), 📦 Stock (pantry), 🍽️ Recipe (scraper), 🧹 Chores (gamified).
- Dark-mode-only. Root bg `#111827`. Surface ladder runs 0→4.
- Re-themed palette: International Orange `#FF4F00` + Cobalt Blue `#0047AB` for brand; emerald/amber/red kept as semantic.
- Tailwind-style. Rounded-xl / rounded-2xl everywhere.
- Emoji IS the iconography. Lucide as fallback only.
- Copy voice: casual, terse, Finnish/English mixed, imperative buttons, no marketing.
- Import `colors_and_type.css` first; use the CSS vars it exposes.
