# GlitchyRee Design System Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the GlitchyRee design system (CSS tokens + self-hosted fonts + targeted accent re-theme) into all four HA-apps submodule frontends — Storage, Stock, Recipes, Chores — in a single batch.

**Architecture:** Token CSS lives per-submodule (copied, not shared — follows the existing "scraper package duplicated on purpose" precedent). Tailwind's `theme.extend` exposes the tokens as `brand.*` / `semantic.*` / `font-display` utility classes so both new and legacy class usage keep working. Fonts are hosted under each frontend's `public/fonts/` so nothing is fetched from the public internet at runtime.

**Tech Stack:** React, Vite, Tailwind CSS (empty `theme.extend` currently), PostCSS. Font source is Google Fonts' woff2 (latin subset only). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-04-19-glitchyree-design-integration.md`

**Verification approach:** No frontend test suites exist. Each submodule's "test" is `npm run build` passing cleanly (catches Tailwind config errors, missing imports, broken JSX). Visual verification is by user.

---

## File structure

**Shared staging area** (built once, copied into each submodule):
- `/tmp/glitchyree-staging/fonts/*.woff2` — 11 font files
- `/tmp/glitchyree-staging/design-tokens.css` — modified `colors_and_type.css` with `@font-face` blocks replacing the Google Fonts `@import`

**Per-submodule, added:**
- `<submodule>/frontend/src/styles/design-tokens.css` — copy of staged file
- `<submodule>/frontend/public/fonts/*.woff2` — copy of staged files

**Per-submodule, modified:**
- `<submodule>/frontend/tailwind.config.js` — `theme.extend` populated
- `<submodule>/frontend/src/index.css` — new import at top
- `<submodule>/frontend/src/App.jsx` (+ select `components/*.jsx`) — accent swaps
- `<submodule>/<name>/config.json` — version bump
- `<submodule>/<name>/CHANGELOG.md` — new entry at top

---

## Task 1: Prepare shared staging artifacts

**Files:**
- Create: `/tmp/glitchyree-staging/fonts/*.woff2` (11 files)
- Create: `/tmp/glitchyree-staging/design-tokens.css`

- [ ] **Step 1: Create staging directory**

```bash
rm -rf /tmp/glitchyree-staging
mkdir -p /tmp/glitchyree-staging/fonts
```

- [ ] **Step 2: Download the 11 woff2 files from Google Fonts**

Write this script to `/tmp/glitchyree-staging/fetch-fonts.py`:

```python
import re, urllib.request, os

CSS_URL = ("https://fonts.googleapis.com/css2?"
           "family=Space+Grotesk:wght@400;500;600;700"
           "&family=Inter:wght@400;500;600;700"
           "&family=JetBrains+Mono:wght@400;500;700"
           "&display=swap")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

req = urllib.request.Request(CSS_URL, headers={"User-Agent": UA})
css = urllib.request.urlopen(req).read().decode()

# Split into subset blocks: ['', 'latin', '@font-face{...}', 'latin-ext', '...']
blocks = re.split(r'/\*\s*([\w-]+)\s*\*/', css)

family_slug = {
    'Space Grotesk': 'space-grotesk',
    'Inter': 'inter',
    'JetBrains Mono': 'jetbrains-mono',
}

os.chdir('/tmp/glitchyree-staging/fonts')
downloaded = []
for i in range(1, len(blocks) - 1, 2):
    subset, body = blocks[i], blocks[i + 1]
    if subset != 'latin':
        continue
    m_family = re.search(r"font-family:\s*'([^']+)'", body)
    m_weight = re.search(r'font-weight:\s*(\d+)', body)
    m_url = re.search(r"url\((https://[^)]+\.woff2)\)", body)
    if not (m_family and m_weight and m_url):
        continue
    slug = family_slug.get(m_family.group(1))
    if not slug:
        continue
    fname = f"{slug}-{m_weight.group(1)}.woff2"
    print(f"Downloading {fname}")
    urllib.request.urlretrieve(m_url.group(1), fname)
    downloaded.append(fname)

print(f"\nTotal: {len(downloaded)} files")
assert len(downloaded) == 11, f"expected 11 files, got {len(downloaded)}"
```

Run it:

```bash
python3 /tmp/glitchyree-staging/fetch-fonts.py
```

Expected: prints 11 "Downloading …" lines then "Total: 11 files" and exits 0. Files land in `/tmp/glitchyree-staging/fonts/`.

- [ ] **Step 3: Verify the 11 files exist with plausible sizes**

```bash
ls -la /tmp/glitchyree-staging/fonts/*.woff2 | wc -l
du -sh /tmp/glitchyree-staging/fonts/
```

Expected: `11` on the first line; total size roughly `150K`–`400K` on the second. If either fails, re-run Step 2 (Google may throttle — wait 30s and retry). **Do not** proceed to Step 4 until Step 3 passes.

- [ ] **Step 4: Create the modified design-tokens.css**

Write the full contents to `/tmp/glitchyree-staging/design-tokens.css`:

```css
/* ============================================================
   GlitchyRee Design System — Colors & Type
   Dark-mode first, themed around International Orange + Cobalt Blue
   Integrated into HA-apps frontends 2026-04-19.
   ============================================================ */

/* ── Self-hosted fonts (see public/fonts/) ─────────────────── */
@font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/space-grotesk-400.woff2') format('woff2'); }
@font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/space-grotesk-500.woff2') format('woff2'); }
@font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/space-grotesk-600.woff2') format('woff2'); }
@font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/space-grotesk-700.woff2') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/inter-400.woff2') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/inter-500.woff2') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/inter-600.woff2') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/inter-700.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/jetbrains-mono-400.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/jetbrains-mono-500.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/jetbrains-mono-700.woff2') format('woff2'); }

:root {
  /* ── Brand ──────────────────────────────────────────── */
  --brand-orange:        #FF4F00;
  --brand-orange-600:    #E04400;
  --brand-orange-400:    #FF7A3D;
  --brand-orange-300:    #FFA27A;
  --brand-orange-100:    #FFE3D2;

  --brand-cobalt:        #0047AB;
  --brand-cobalt-600:    #003A8C;
  --brand-cobalt-400:    #2E6BD6;
  --brand-cobalt-300:    #5E8EE8;
  --brand-cobalt-100:    #D3E0F7;

  /* ── Neutrals (dark-first) ─────────────────────────── */
  --bg-0:  #0A0D14;
  --bg-1:  #111827;
  --bg-2:  #1F2937;
  --bg-3:  #374151;
  --bg-4:  #4B5563;

  --line-1: #374151;
  --line-2: #1F2937;

  /* ── Foreground ────────────────────────────────────── */
  --fg-1: #F3F4F6;
  --fg-2: #D1D5DB;
  --fg-3: #9CA3AF;
  --fg-4: #6B7280;

  /* ── Semantic ──────────────────────────────────────── */
  --success:      #10B981;
  --success-bg:   #064E3B33;
  --warning:      #F59E0B;
  --warning-bg:   #78350F33;
  --danger:       #EF4444;
  --danger-bg:    #7F1D1D33;
  --info:         #2E6BD6;
  --info-bg:      #0047AB22;

  --xp-gold:      #FBBF24;
  --xp-gold-soft: #FDE68A;

  /* ── Typography ────────────────────────────────────── */
  --font-display: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-emoji:   'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;

  --fs-xs:   12px;   --lh-xs:   16px;
  --fs-sm:   14px;   --lh-sm:   20px;
  --fs-base: 16px;   --lh-base: 24px;
  --fs-md:   18px;   --lh-md:   26px;
  --fs-lg:   20px;   --lh-lg:   28px;
  --fs-xl:   24px;   --lh-xl:   32px;
  --fs-2xl:  30px;   --lh-2xl:  38px;
  --fs-3xl:  36px;   --lh-3xl:  44px;
  --fs-4xl:  48px;   --lh-4xl:  56px;

  /* ── Radii ─────────────────────────────────────────── */
  --r-sm:   6px;
  --r-md:   10px;
  --r-lg:   12px;
  --r-xl:   16px;
  --r-2xl:  20px;
  --r-pill: 9999px;

  /* ── Spacing (4px grid) ───────────────────────────── */
  --s-1: 4px;   --s-2: 8px;   --s-3: 12px;  --s-4: 16px;
  --s-5: 20px;  --s-6: 24px;  --s-8: 32px;  --s-10: 40px;
  --s-12: 48px; --s-16: 64px;

  /* ── Shadows & glows ─────────────────────────────── */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.25);
  --shadow-md:  0 4px 10px rgba(0,0,0,0.35);
  --shadow-lg:  0 10px 30px rgba(0,0,0,0.5);
  --shadow-xl:  0 20px 50px rgba(0,0,0,0.6);

  --glow-orange: 0 0 24px rgba(255, 79, 0, 0.45);
  --glow-cobalt: 0 0 24px rgba(46, 107, 214, 0.45);
  --glow-gold:   0 0 20px rgba(251, 191, 36, 0.6);

  /* ── Motion ────────────────────────────────────── */
  --dur-fast:  120ms;
  --dur-base:  200ms;
  --dur-slow:  320ms;
  --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* ============================================================
   Semantic type classes
   ============================================================ */
.ds-h1 { font-family: var(--font-display); font-size: var(--fs-4xl); line-height: var(--lh-4xl); font-weight: 700; letter-spacing: -0.02em; color: var(--fg-1); }
.ds-h2 { font-family: var(--font-display); font-size: var(--fs-3xl); line-height: var(--lh-3xl); font-weight: 700; letter-spacing: -0.015em; color: var(--fg-1); }
.ds-h3 { font-family: var(--font-display); font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: 600; letter-spacing: -0.01em; color: var(--fg-1); }
.ds-h4 { font-family: var(--font-display); font-size: var(--fs-xl); line-height: var(--lh-xl); font-weight: 600; color: var(--fg-1); }
.ds-title-app { font-family: var(--font-display); font-size: var(--fs-md); line-height: var(--lh-md); font-weight: 700; color: var(--fg-1); }
.ds-p { font-family: var(--font-body); font-size: var(--fs-base); line-height: var(--lh-base); font-weight: 400; color: var(--fg-2); }
.ds-p-sm { font-family: var(--font-body); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--fg-2); }
.ds-caption { font-family: var(--font-body); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--fg-3); }
.ds-eyebrow { font-family: var(--font-display); font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
.ds-code { font-family: var(--font-mono); font-size: 0.92em; background: var(--bg-3); color: var(--brand-orange-300); padding: 2px 6px; border-radius: var(--r-sm); }

.ds-reset {
  color: var(--fg-1);
  font-family: var(--font-body);
  background: var(--bg-1);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**Note:** The source file ended `code` selector styling with `.ds-code, code { … }`. We drop the bare `code` selector to avoid styling every `<code>` element in the apps (too invasive for this pass). Only `.ds-code` is styled here.

- [ ] **Step 5: Verify the design-tokens.css is valid**

```bash
node -e "const fs=require('fs'); const c=fs.readFileSync('/tmp/glitchyree-staging/design-tokens.css','utf8'); console.log('bytes:', c.length); console.log('font-face count:', (c.match(/@font-face/g)||[]).length); console.log('root var count:', (c.match(/--[a-z0-9-]+:/gi)||[]).length);"
```

Expected output:
- `bytes:` at least `4000`
- `font-face count: 11`
- `root var count:` at least `60`

If any of those is off, re-do Step 4. Do not proceed until this passes.

- [ ] **Step 6: Commit nothing yet — staging is external to the repo**

No commit. The `/tmp/glitchyree-staging/` tree is consumed by Tasks 2–5. Keep the shell that built the staging alive, or re-run Steps 1–5 if the machine reboots.

---

## Task 2: Integrate into HA-storage submodule

**Submodule path:** `/home/glitch/GIT/HA-apps/HA-storage/`
**Frontend path:** `HA-storage/storage/frontend/`
**Version:** `0.3.30` → `0.3.31`

**Files:**
- Create: `HA-storage/storage/frontend/src/styles/design-tokens.css`
- Create: `HA-storage/storage/frontend/public/fonts/*.woff2` (11 files)
- Modify: `HA-storage/storage/frontend/tailwind.config.js`
- Modify: `HA-storage/storage/frontend/src/index.css`
- Modify: `HA-storage/storage/frontend/src/App.jsx:81`
- Modify: `HA-storage/storage/frontend/src/components/Products.jsx:709`
- Modify: `HA-storage/storage/config.json` (version)
- Modify: `HA-storage/storage/CHANGELOG.md`

- [ ] **Step 1: Copy staged tokens + fonts into the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage/frontend
mkdir -p src/styles public/fonts
cp /tmp/glitchyree-staging/design-tokens.css src/styles/design-tokens.css
cp /tmp/glitchyree-staging/fonts/*.woff2 public/fonts/
ls public/fonts/*.woff2 | wc -l
```

Expected: final `wc -l` prints `11`.

- [ ] **Step 2: Replace tailwind.config.js**

Write the full contents to `/home/glitch/GIT/HA-apps/HA-storage/storage/frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange:      'var(--brand-orange)',
          'orange-600':'var(--brand-orange-600)',
          'orange-400':'var(--brand-orange-400)',
          'orange-300':'var(--brand-orange-300)',
          'orange-100':'var(--brand-orange-100)',
          cobalt:      'var(--brand-cobalt)',
          'cobalt-600':'var(--brand-cobalt-600)',
          'cobalt-400':'var(--brand-cobalt-400)',
          'cobalt-300':'var(--brand-cobalt-300)',
          'cobalt-100':'var(--brand-cobalt-100)',
        },
        semantic: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          danger:  'var(--danger)',
          info:    'var(--info)',
        },
        'xp-gold':      'var(--xp-gold)',
        'xp-gold-soft': 'var(--xp-gold-soft)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl:   '12px',
        '2xl':'16px',
      },
    },
  },
  plugins: [],
};
```

**Note on color var usage:** Tailwind accepts raw CSS custom property values as color values; `bg-brand-orange` compiles to `background-color: var(--brand-orange)`. Opacity modifiers (e.g. `bg-brand-orange/20`) will not work with this simple form, but none of the edits below require them — every accent swap uses a solid color.

- [ ] **Step 3: Prepend token import to src/index.css**

Read `HA-storage/storage/frontend/src/index.css`, then add this as the very first line (before any existing `@tailwind` directives):

```css
@import './styles/design-tokens.css';
```

Use the `Edit` tool with an empty `old_string` approach: read the current first line, then replace it with the import + newline + the original first line. If the current first line is `@tailwind base;`, the edit is:

- `old_string`: `@tailwind base;`
- `new_string`: `@import './styles/design-tokens.css';\n@tailwind base;`

- [ ] **Step 4: Accent edit — App.jsx active tab underline**

File: `HA-storage/storage/frontend/src/App.jsx`, line 81.

Use Edit tool:
- `old_string`: `                  ? 'border-emerald-500 text-emerald-400 font-medium'`
- `new_string`: `                  ? 'border-brand-orange text-brand-orange font-medium'`

- [ ] **Step 5: Accent edit — Products.jsx primary "➕ Add Product" button**

File: `HA-storage/storage/frontend/src/components/Products.jsx`, line 709.

Use Edit tool:
- `old_string`: `            className="px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"`
- `new_string`: `            className="px-4 py-2 text-sm rounded-xl bg-brand-cobalt text-white hover:bg-brand-cobalt-600 whitespace-nowrap"`

- [ ] **Step 6: Verify no other Storage edits pending**

```bash
grep -n -E "emerald|green-5" /home/glitch/GIT/HA-apps/HA-storage/storage/frontend/src/App.jsx
```

Expected: only line 55 (`border-emerald-500`, the loading spinner) remains. The spec leaves it as semantic (initial load uses emerald → signals "working / OK"). Leave line 55 alone.

Also check that line 81 now reads `border-brand-orange text-brand-orange`:

```bash
sed -n '81p' /home/glitch/GIT/HA-apps/HA-storage/storage/frontend/src/App.jsx
```

- [ ] **Step 7: Build the frontend**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage/storage/frontend
npm run build
```

Expected: build completes without errors. Warnings are OK. **Do not commit if build fails.**

- [ ] **Step 8: Bump version in config.json**

File: `HA-storage/storage/config.json`.

Use Edit tool:
- `old_string`: `  "version": "0.3.30",`
- `new_string`: `  "version": "0.3.31",`

- [ ] **Step 9: Add CHANGELOG.md entry**

File: `HA-storage/storage/CHANGELOG.md`. Read the first line. Prepend the new entry above it:

Use Edit tool:
- `old_string`: `## 0.3.30` (the existing top entry header)
- `new_string`:
```
## 0.3.31
- Apply GlitchyRee design system: brand orange active tabs, cobalt primary "Add Product" button, self-hosted Space Grotesk/Inter/JetBrains Mono
- Add CSS design tokens at src/styles/design-tokens.css
- Wire Tailwind theme.extend to expose brand.* / semantic.* / font-display utilities

## 0.3.30
```

**Note:** Plain `## X.Y.Z` header only — no brackets, no date. CLAUDE.md says Supervisor parsing depends on this format.

- [ ] **Step 10: Stage and commit inside the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-storage
git add storage/frontend/src/styles/design-tokens.css \
        storage/frontend/public/fonts/ \
        storage/frontend/tailwind.config.js \
        storage/frontend/src/index.css \
        storage/frontend/src/App.jsx \
        storage/frontend/src/components/Products.jsx \
        storage/config.json \
        storage/CHANGELOG.md
git status
```

Expected: `git status` shows only the files listed above, plus any entry that became staged. No surprises.

Commit:

```bash
git commit -m "$(cat <<'EOF'
Apply GlitchyRee design system (v0.3.31)

Add design tokens, self-hosted fonts, and brand-orange active tabs +
cobalt primary "Add Product" button. Version bump to 0.3.31.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Push the submodule to origin (asks user before actually pushing)**

**Before pushing, confirm with user:** "Ready to push HA-storage submodule to origin/main. Proceed?" Wait for explicit yes. Then:

```bash
cd /home/glitch/GIT/HA-apps/HA-storage
git push origin main
```

---

## Task 3: Integrate into HA-grocy-stock submodule

**Submodule path:** `/home/glitch/GIT/HA-apps/HA-grocy-stock/`
**Frontend path:** `HA-grocy-stock/grocy_stock/frontend/`
**Version:** `1.16.20` → `1.16.21`

**Files:**
- Create: `HA-grocy-stock/grocy_stock/frontend/src/styles/design-tokens.css`
- Create: `HA-grocy-stock/grocy_stock/frontend/public/fonts/*.woff2` (11 files)
- Modify: `HA-grocy-stock/grocy_stock/frontend/tailwind.config.js`
- Modify: `HA-grocy-stock/grocy_stock/frontend/src/index.css`
- Modify: `HA-grocy-stock/grocy_stock/frontend/src/App.jsx` (6 lines: 674, 1074, 1082, 2454, 2484, 2498, 2507)
- Modify: `HA-grocy-stock/grocy_stock/config.json` (version)
- Modify: `HA-grocy-stock/grocy_stock/CHANGELOG.md`

- [ ] **Step 1: Copy staged tokens + fonts into the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-stock/grocy_stock/frontend
mkdir -p src/styles public/fonts
cp /tmp/glitchyree-staging/design-tokens.css src/styles/design-tokens.css
cp /tmp/glitchyree-staging/fonts/*.woff2 public/fonts/
ls public/fonts/*.woff2 | wc -l
```

Expected: `11`.

- [ ] **Step 2: Replace tailwind.config.js**

Write the full contents to `/home/glitch/GIT/HA-apps/HA-grocy-stock/grocy_stock/frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange:      'var(--brand-orange)',
          'orange-600':'var(--brand-orange-600)',
          'orange-400':'var(--brand-orange-400)',
          'orange-300':'var(--brand-orange-300)',
          'orange-100':'var(--brand-orange-100)',
          cobalt:      'var(--brand-cobalt)',
          'cobalt-600':'var(--brand-cobalt-600)',
          'cobalt-400':'var(--brand-cobalt-400)',
          'cobalt-300':'var(--brand-cobalt-300)',
          'cobalt-100':'var(--brand-cobalt-100)',
        },
        semantic: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          danger:  'var(--danger)',
          info:    'var(--info)',
        },
        'xp-gold':      'var(--xp-gold)',
        'xp-gold-soft': 'var(--xp-gold-soft)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl:   '12px',
        '2xl':'16px',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Prepend token import to src/index.css**

File: `HA-grocy-stock/grocy_stock/frontend/src/index.css`.

Add `@import './styles/design-tokens.css';` as the very first line (same approach as Task 2 Step 3).

- [ ] **Step 4: Accent edit — App.jsx:674 drag-selection ring**

Use Edit tool:
- `old_string`: `            ? 'shadow-2xl z-10 ring-2 ring-emerald-400/40 rounded-lg'`
- `new_string`: `            ? 'shadow-2xl z-10 ring-2 ring-brand-orange rounded-lg'`

(The `/40` alpha modifier doesn't work with our var-based colors; the solid brand-orange ring is the accepted substitute and matches the "brand highlight" intent.)

- [ ] **Step 5: Accent edit — App.jsx:1074 Undo link**

Use Edit tool:
- `old_string`: `                className="font-semibold text-emerald-400 hover:text-emerald-300 underline flex-shrink-0"`
- `new_string`: `                className="font-semibold text-brand-orange hover:text-brand-orange-400 underline flex-shrink-0"`

- [ ] **Step 6: Accent edit — App.jsx:1082 Undo progress bar**

Use Edit tool:
- `old_string`: `              className="h-1 bg-emerald-400"`
- `new_string`: `              className="h-1 bg-brand-orange"`

- [ ] **Step 7: Accent edit — App.jsx:2454 "+" scan FAB**

Use Edit tool:
- `old_string`: `            className="w-10 h-10 bg-green-600 hover:bg-green-500 active:bg-green-700 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg transition-colors"`
- `new_string`: `            className="w-10 h-10 bg-brand-cobalt hover:bg-brand-cobalt-400 active:bg-brand-cobalt-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg transition-colors"`

- [ ] **Step 8: Accent edit — App.jsx:2484 trapezoidal tab "All" active state**

Use Edit tool:
- `old_string`: `                  ? 'tab-active bg-emerald-600 text-white'`
- `new_string`: `                  ? 'tab-active bg-brand-orange text-white'`
- `replace_all`: `true`

(Line 2498 uses the same exact string — `replace_all` catches both.)

- [ ] **Step 9: Accent edit — App.jsx:2507 trapezoidal tab baseline**

Use Edit tool:
- `old_string`: `          <div className="h-0.5 bg-emerald-600" />`
- `new_string`: `          <div className="h-0.5 bg-brand-orange" />`

- [ ] **Step 10: Verify the intended swaps landed**

```bash
grep -n -E "brand-orange|brand-cobalt" /home/glitch/GIT/HA-apps/HA-grocy-stock/grocy_stock/frontend/src/App.jsx | wc -l
```

Expected: at least `7` lines (ring, undo link, undo bar, FAB, two active tabs, baseline).

Confirm we did NOT touch the emerald "+1" / "Keep in stock" / toast success background / level pill lines:

```bash
grep -n -E "emerald" /home/glitch/GIT/HA-apps/HA-grocy-stock/grocy_stock/frontend/src/App.jsx | head -20
```

These lines should still contain `emerald` (spec says they stay semantic):
- 154, 165, 248, 257 (Keep in stock buttons)
- 644 (Keep in stock swipe background)
- 701, 738, 742, 745, 749 (level pill group)
- 986, 1065 (various success indicators)
- 2381, 2401, 2414 (loading spinners)
- 2484-area: now brand-orange, was emerald — confirm no leftover

If anything unexpected swapped, revert with `git checkout src/App.jsx` and re-do Steps 4–9.

- [ ] **Step 11: Build the frontend**

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-stock/grocy_stock/frontend
npm run build
```

Expected: build completes without errors.

- [ ] **Step 12: Bump version in config.json**

File: `HA-grocy-stock/grocy_stock/config.json`.

Use Edit tool:
- `old_string`: `  "version": "1.16.20",`
- `new_string`: `  "version": "1.16.21",`

- [ ] **Step 13: Add CHANGELOG.md entry**

File: `HA-grocy-stock/grocy_stock/CHANGELOG.md`. Prepend:

Use Edit tool:
- `old_string`: `## 1.16.20`
- `new_string`:
```
## 1.16.21
- Apply GlitchyRee design system: brand-orange trapezoidal location tabs and baseline, brand-orange undo toast affordances, cobalt primary scan/+ FAB
- Add CSS design tokens at src/styles/design-tokens.css
- Self-hosted Space Grotesk / Inter / JetBrains Mono fonts
- Wire Tailwind theme.extend to expose brand.* / semantic.* / font-display utilities

## 1.16.20
```

- [ ] **Step 14: Stage and commit inside the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-stock
git add grocy_stock/frontend/src/styles/design-tokens.css \
        grocy_stock/frontend/public/fonts/ \
        grocy_stock/frontend/tailwind.config.js \
        grocy_stock/frontend/src/index.css \
        grocy_stock/frontend/src/App.jsx \
        grocy_stock/config.json \
        grocy_stock/CHANGELOG.md
git status
git commit -m "$(cat <<'EOF'
Apply GlitchyRee design system (v1.16.21)

Add design tokens, self-hosted fonts, and brand-orange active
location tabs + cobalt scan FAB + orange undo toast affordances.
Version bump to 1.16.21.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 15: Push the submodule to origin (asks user before actually pushing)**

**Before pushing, confirm with user:** "Ready to push HA-grocy-stock submodule to origin/main. Proceed?" Wait for explicit yes. Then:

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-stock
git push origin main
```

---

## Task 4: Integrate into HA-grocy-recipes submodule

**Submodule path:** `/home/glitch/GIT/HA-apps/HA-grocy-recipes/`
**Frontend path:** `HA-grocy-recipes/grocy_recipes/frontend/`
**Version:** `1.5.24` → `1.5.25`

**Files:**
- Create: `HA-grocy-recipes/grocy_recipes/frontend/src/styles/design-tokens.css`
- Create: `HA-grocy-recipes/grocy_recipes/frontend/public/fonts/*.woff2` (11 files)
- Modify: `HA-grocy-recipes/grocy_recipes/frontend/tailwind.config.js`
- Modify: `HA-grocy-recipes/grocy_recipes/frontend/src/index.css`
- Modify: `HA-grocy-recipes/grocy_recipes/frontend/src/App.jsx` (lines 34, 53, 155, 190, 242, 562)
- Modify: `HA-grocy-recipes/grocy_recipes/config.json` (version)
- Modify: `HA-grocy-recipes/grocy_recipes/CHANGELOG.md`

- [ ] **Step 1: Copy staged tokens + fonts into the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-recipes/grocy_recipes/frontend
mkdir -p src/styles public/fonts
cp /tmp/glitchyree-staging/design-tokens.css src/styles/design-tokens.css
cp /tmp/glitchyree-staging/fonts/*.woff2 public/fonts/
ls public/fonts/*.woff2 | wc -l
```

Expected: `11`.

- [ ] **Step 2: Replace tailwind.config.js**

Write the full contents to `/home/glitch/GIT/HA-apps/HA-grocy-recipes/grocy_recipes/frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange:      'var(--brand-orange)',
          'orange-600':'var(--brand-orange-600)',
          'orange-400':'var(--brand-orange-400)',
          'orange-300':'var(--brand-orange-300)',
          'orange-100':'var(--brand-orange-100)',
          cobalt:      'var(--brand-cobalt)',
          'cobalt-600':'var(--brand-cobalt-600)',
          'cobalt-400':'var(--brand-cobalt-400)',
          'cobalt-300':'var(--brand-cobalt-300)',
          'cobalt-100':'var(--brand-cobalt-100)',
        },
        semantic: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          danger:  'var(--danger)',
          info:    'var(--info)',
        },
        'xp-gold':      'var(--xp-gold)',
        'xp-gold-soft': 'var(--xp-gold-soft)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl:   '12px',
        '2xl':'16px',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Prepend token import to src/index.css**

File: `HA-grocy-recipes/grocy_recipes/frontend/src/index.css`.

Add `@import './styles/design-tokens.css';` as the very first line.

- [ ] **Step 4: Accent edit — App.jsx:34 recipe card selected state**

Use Edit tool:
- `old_string`: `                ? 'bg-emerald-600'`
- `new_string`: `                ? 'bg-brand-orange'`

- [ ] **Step 5: Accent edit — App.jsx:53 recipe card hover ring**

Use Edit tool:
- `old_string`: `      className="bg-gray-800 rounded-2xl shadow-lg overflow-hidden text-left hover:ring-2 hover:ring-emerald-400 transition-all active:scale-[0.98]"`
- `new_string`: `      className="bg-gray-800 rounded-2xl shadow-lg overflow-hidden text-left hover:ring-2 hover:ring-brand-orange transition-all active:scale-[0.98]"`

- [ ] **Step 6: Accent edit — App.jsx:155 active URL source pill**

Use Edit tool:
- `old_string`: `                    ? 'bg-emerald-900/40 text-emerald-300'`
- `new_string`: `                    ? 'bg-brand-orange text-white'`

**Note:** the `/40` opacity doesn't work with our var colors; the solid `bg-brand-orange` + white text is the accepted substitute for the active-pill treatment.

- [ ] **Step 7: Accent edit — App.jsx:190 "Lisää ostoslistalle" (RecipeDetail action)**

Use Edit tool:
- `old_string`: `            className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors"`
- `new_string`: `            className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-brand-cobalt hover:bg-brand-cobalt-400 active:bg-brand-cobalt-600 transition-colors"`
- `replace_all`: `true`

(Line 242 uses the same exact className — `replace_all` catches both.)

- [ ] **Step 8: Accent edit — App.jsx:562 sticky "Hae" fetch button**

Use Edit tool:
- `old_string`: `            className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors disabled:opacity-40"`
- `new_string`: `            className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm bg-brand-cobalt hover:bg-brand-cobalt-400 active:bg-brand-cobalt-600 transition-colors disabled:opacity-40"`

- [ ] **Step 9: Verify the intended swaps landed**

```bash
grep -n -E "brand-orange|brand-cobalt" /home/glitch/GIT/HA-apps/HA-grocy-recipes/grocy_recipes/frontend/src/App.jsx | wc -l
```

Expected: at least `6` lines.

Semantic emerald stays at lines 135 (recipe-detail link), 513 (spinner), 534 (retry button), 556 (focus ring) — do not touch those; spec keeps them semantic.

- [ ] **Step 10: Build the frontend**

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-recipes/grocy_recipes/frontend
npm run build
```

Expected: build completes without errors.

- [ ] **Step 11: Bump version in config.json**

File: `HA-grocy-recipes/grocy_recipes/config.json`.

Use Edit tool:
- `old_string`: `  "version": "1.5.24",`
- `new_string`: `  "version": "1.5.25",`

- [ ] **Step 12: Add CHANGELOG.md entry**

File: `HA-grocy-recipes/grocy_recipes/CHANGELOG.md`. Prepend:

Use Edit tool:
- `old_string`: `## 1.5.24`
- `new_string`:
```
## 1.5.25
- Apply GlitchyRee design system: brand-orange recipe card hover/selected, cobalt primary "Hae" fetch and "Lisää ostoslistalle" buttons
- Add CSS design tokens at src/styles/design-tokens.css
- Self-hosted Space Grotesk / Inter / JetBrains Mono fonts
- Wire Tailwind theme.extend to expose brand.* / semantic.* / font-display utilities

## 1.5.24
```

- [ ] **Step 13: Stage and commit inside the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-recipes
git add grocy_recipes/frontend/src/styles/design-tokens.css \
        grocy_recipes/frontend/public/fonts/ \
        grocy_recipes/frontend/tailwind.config.js \
        grocy_recipes/frontend/src/index.css \
        grocy_recipes/frontend/src/App.jsx \
        grocy_recipes/config.json \
        grocy_recipes/CHANGELOG.md
git status
git commit -m "$(cat <<'EOF'
Apply GlitchyRee design system (v1.5.25)

Add design tokens, self-hosted fonts, brand-orange recipe card
hover/selected state, cobalt primary CTA buttons ("Hae" / "Lisää
ostoslistalle"). Version bump to 1.5.25.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 14: Push the submodule to origin (asks user before actually pushing)**

**Before pushing, confirm with user:** "Ready to push HA-grocy-recipes submodule to origin/main. Proceed?" Wait for explicit yes. Then:

```bash
cd /home/glitch/GIT/HA-apps/HA-grocy-recipes
git push origin main
```

---

## Task 5: Integrate into HA-chores submodule

**Submodule path:** `/home/glitch/GIT/HA-apps/HA-chores/`
**Frontend path:** `HA-chores/chores/frontend/`
**Version:** `0.3.23` → `0.3.24`

**Files:**
- Create: `HA-chores/chores/frontend/src/styles/design-tokens.css`
- Create: `HA-chores/chores/frontend/public/fonts/*.woff2` (11 files)
- Modify: `HA-chores/chores/frontend/tailwind.config.js`
- Modify: `HA-chores/chores/frontend/src/index.css`
- Modify: `HA-chores/chores/frontend/src/App.jsx` (lines 233, 271)
- Modify: `HA-chores/chores/frontend/src/components/Dashboard.jsx` (line 225)
- Modify: `HA-chores/chores/config.json` (version)
- Modify: `HA-chores/chores/CHANGELOG.md`

- [ ] **Step 1: Copy staged tokens + fonts into the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend
mkdir -p src/styles public/fonts
cp /tmp/glitchyree-staging/design-tokens.css src/styles/design-tokens.css
cp /tmp/glitchyree-staging/fonts/*.woff2 public/fonts/
ls public/fonts/*.woff2 | wc -l
```

Expected: `11`.

- [ ] **Step 2: Replace tailwind.config.js**

Write the full contents to `/home/glitch/GIT/HA-apps/HA-chores/chores/frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange:      'var(--brand-orange)',
          'orange-600':'var(--brand-orange-600)',
          'orange-400':'var(--brand-orange-400)',
          'orange-300':'var(--brand-orange-300)',
          'orange-100':'var(--brand-orange-100)',
          cobalt:      'var(--brand-cobalt)',
          'cobalt-600':'var(--brand-cobalt-600)',
          'cobalt-400':'var(--brand-cobalt-400)',
          'cobalt-300':'var(--brand-cobalt-300)',
          'cobalt-100':'var(--brand-cobalt-100)',
        },
        semantic: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          danger:  'var(--danger)',
          info:    'var(--info)',
        },
        'xp-gold':      'var(--xp-gold)',
        'xp-gold-soft': 'var(--xp-gold-soft)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl:   '12px',
        '2xl':'16px',
      },
    },
  },
  plugins: [],
};
```

**Note:** Preserve the existing `content` array formatting (multi-line) since that's how the repo writes it — matches existing style.

- [ ] **Step 3: Prepend token import to src/index.css**

File: `HA-chores/chores/frontend/src/index.css`.

Add `@import './styles/design-tokens.css';` as the very first line. (The file already has ~380 lines of keyframes — leave them untouched.)

- [ ] **Step 4: Accent edit — App.jsx:233 nav active state (amber → orange)**

Use Edit tool:
- `old_string`: `                        ? 'grayscale-0 opacity-100 text-amber-400'`
- `new_string`: `                        ? 'grayscale-0 opacity-100 text-brand-orange'`

**Note:** The codebase currently uses amber for the active tab color (not emerald as the spec guessed). The swap target is the same — orange — matching the spec intent.

- [ ] **Step 5: Accent edit — App.jsx:271 "you" badge**

Use Edit tool:
- `old_string`: `                  ? <span className="text-xs bg-emerald-800/60 text-emerald-400 px-1.5 py-0.5 rounded">you</span>`
- `new_string`: `                  ? <span className="text-xs bg-brand-orange text-white px-1.5 py-0.5 rounded">you</span>`

**Note:** `/60` opacity isn't supported with var colors; solid orange on white-on-orange is the accepted substitute and reads as a brand badge.

- [ ] **Step 6: Accent edit — Dashboard.jsx:225 XP progress bar**

File: `HA-chores/chores/frontend/src/components/Dashboard.jsx`.

Use Edit tool:
- `old_string`: `                className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full animate-xp-fill"`
- `new_string`: `                className="h-full bg-gradient-to-r from-brand-orange to-xp-gold rounded-full animate-xp-fill"`

- [ ] **Step 7: Verify the intended swaps landed**

```bash
grep -rn -E "brand-orange|brand-cobalt|to-xp-gold" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/ | wc -l
```

Expected: at least `3`.

Confirm these emerald usages stay (spec keeps them semantic):
- App.jsx:41 (toast success background)
- components/MyChores.jsx:78, 154 (completed chore bg / confirm button)
- components/HouseholdOverview.jsx:70 (progress bar semantic success)
- components/HouseholdOverview.jsx:147 (success text)
- components/ChoreList.jsx:5 (easy difficulty badge)
- components/Pet.jsx:60–61 (pet mood text colors — "ecstatic"/"happy")
- index.css:146 (keyframe emerald-900 color)

```bash
grep -rn -E "emerald|green-5" /home/glitch/GIT/HA-apps/HA-chores/chores/frontend/src/ | grep -v "brand-orange\|brand-cobalt" | wc -l
```

Expected: at least `8` (the sites listed above stay).

- [ ] **Step 8: Build the frontend**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores/chores/frontend
npm run build
```

Expected: build completes without errors.

- [ ] **Step 9: Bump version in config.json**

File: `HA-chores/chores/config.json`.

Use Edit tool:
- `old_string`: `  "version": "0.3.23",`
- `new_string`: `  "version": "0.3.24",`

- [ ] **Step 10: Add CHANGELOG.md entry**

File: `HA-chores/chores/CHANGELOG.md`. Prepend:

Use Edit tool:
- `old_string`: `## 0.3.23`
- `new_string`:
```
## 0.3.24
- Apply GlitchyRee design system: brand-orange nav active state, "you" badge, XP bar gradient (orange → xp-gold)
- Add CSS design tokens at src/styles/design-tokens.css
- Self-hosted Space Grotesk / Inter / JetBrains Mono fonts
- Wire Tailwind theme.extend to expose brand.* / semantic.* / font-display utilities

## 0.3.23
```

- [ ] **Step 11: Stage and commit inside the submodule**

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git add chores/frontend/src/styles/design-tokens.css \
        chores/frontend/public/fonts/ \
        chores/frontend/tailwind.config.js \
        chores/frontend/src/index.css \
        chores/frontend/src/App.jsx \
        chores/frontend/src/components/Dashboard.jsx \
        chores/config.json \
        chores/CHANGELOG.md
git status
git commit -m "$(cat <<'EOF'
Apply GlitchyRee design system (v0.3.24)

Add design tokens, self-hosted fonts, brand-orange nav active state,
"you" badge, and XP bar orange→gold gradient. Version bump to 0.3.24.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12: Push the submodule to origin (asks user before actually pushing)**

**Before pushing, confirm with user:** "Ready to push HA-chores submodule to origin/main. Proceed?" Wait for explicit yes. Then:

```bash
cd /home/glitch/GIT/HA-apps/HA-chores
git push origin main
```

---

## Task 6: Update root repo submodule pointers

**Files:**
- Modify: `HA-apps/.git/modules/*` pointers (implicit — `git add <submodule>` picks up the new SHAs)

- [ ] **Step 1: Confirm all 4 submodules are ahead of their recorded SHAs**

```bash
cd /home/glitch/GIT/HA-apps
git status
```

Expected: `git status` shows four entries like:

```
  modified:   HA-chores (new commits)
  modified:   HA-grocy-recipes (new commits)
  modified:   HA-grocy-stock (new commits)
  modified:   HA-storage (new commits)
```

If any is missing, that submodule's Task was incomplete — go back and finish it.

- [ ] **Step 2: Stage the pointer bumps**

```bash
cd /home/glitch/GIT/HA-apps
git add HA-storage HA-grocy-stock HA-grocy-recipes HA-chores
git status
```

Expected: `git status` shows the same four entries now under "Changes to be committed".

- [ ] **Step 3: Commit the pointer bumps**

```bash
git commit -m "$(cat <<'EOF'
Apply GlitchyRee design system to all submodules

- HA-storage → 0.3.31
- HA-grocy-stock → 1.16.21
- HA-grocy-recipes → 1.5.25
- HA-chores → 0.3.24

Design tokens, self-hosted fonts, and targeted accent re-theme
(brand-orange active states, cobalt primary CTAs) landed in each
submodule. Semantic emerald/amber/red colors kept for success/warning/
danger.

Spec: docs/superpowers/specs/2026-04-19-glitchyree-design-integration.md
Plan: docs/superpowers/plans/2026-04-19-glitchyree-design-integration.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Do NOT push the root repo**

The root-repo push is deferred to the user. Report: "Root commit created locally. Push with `git push origin main` when ready."

---

## Post-plan verification

After Task 6 is complete, run this final sanity check:

```bash
cd /home/glitch/GIT/HA-apps
git log --oneline -5
git submodule status
for d in HA-storage HA-grocy-stock HA-grocy-recipes HA-chores; do
  echo "=== $d ===";
  git -C "$d" log --oneline -1;
  grep -m1 '"version"' "$d"/*/config.json;
done
```

Expected: recent root commit references all four submodules; each submodule's HEAD matches the root's recorded SHA; versions show `0.3.31`, `1.16.21`, `1.5.25`, `0.3.24` respectively.

---

## Typography impact

The `fontFamily.sans` Tailwind override (present in all four configs above) makes **Inter the global default sans font** the moment the tokens land. Every `<p>`, `<button>`, `<div>` that doesn't explicitly set another font picks up Inter automatically — this carries ~90% of the typographic brand impact without touching any JSX.

Space Grotesk (the display font) lands only where `font-display` or `.ds-h{1..4}` / `.ds-title-app` classes are applied. This plan does **not** apply those classes anywhere (see "Deferred" below).

---

## Deferred / known out-of-scope for this plan

The spec mentions these; they are intentionally left for a follow-up PR to keep this batch reviewable:

- **Display-font pass on app headers and H1/H2.** Applying `font-display` (Space Grotesk) to the emoji-title app header (`🗄️ Storage`, `🧹 Chores`, etc.) and to H1/H2 in dashboards/overlays. Each site requires a small class addition; the concrete line numbers aren't enumerated in this plan. Follow-up PRs per submodule can pick this up incrementally.
- **Storage stat-card `blue` tone remap** (`HA-storage/storage/frontend/src/components/Dashboard.jsx:12`). The key currently maps to emerald; whether to flip it to brand-orange depends on the intended semantic of the "blue" tone in each use site — requires a visual audit.
- **HA-chores Pet surface gradient** (spec mentioned cobalt→orange). The current Pet component uses PNG scene backgrounds (`houseBgDay`, etc.), not a CSS gradient — swapping it would break the pet scene. Left alone.
- **Migration to `.ds-h1`/`.ds-p`/`.ds-caption` utility classes across the apps.** Explicitly out of scope per spec.
