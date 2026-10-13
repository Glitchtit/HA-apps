# Glitchtit's Home Assistant Add-ons

[![Open your Home Assistant instance and show the add add-on repository dialog.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FGlitchtit%2FHA-apps)

A collection of Home Assistant add-ons for household inventory, recipe management, and grocery shopping. Managed via Git submodules.

## Add-ons

| | Add-on | Description |
|---|--------|-------------|
| <img src="Design%20system/icons/png/storage.png" width="48"> | [Storage](HA-storage/storage) | Central SQLite database for products, stock, recipes, and shopping lists |
| <img src="Design%20system/icons/png/scraper.png" width="48"> | [Scraper](HA-scraper/addon) | Scrapes Finnish grocery sites (k-ruoka.fi, s-kaupat.fi) and populates Storage with AI-powered optimization |
| <img src="Design%20system/icons/png/stock.png" width="48"> | [Stock](HA-stock/stock) | Stock management dashboard with barcode scanning and one-click consume |
| <img src="Design%20system/icons/png/recipes.png" width="48"> | [Recipe](HA-recipes/recipes) | AI-powered recipe scraping — paste a URL, get ingredients matched to your inventory |
| <img src="Design%20system/icons/png/chores.png" width="48"> | [Chores](HA-chores/chores) | Gamified household chores with XP, streaks, and a calendar |
| <img src="Design%20system/icons/png/lists.png" width="48"> | [Lists](HA-lists/lists) | Folders, lists, items, and subtasks, with household assignment |
| <img src="Design%20system/icons/png/print.png" width="48"> | [Print](HA-print/print) | Shopping lists and recipes on an 80mm thermal receipt printer |

Icons and logos come from one generator: `python scripts/make_icons.py` (masters in `Design system/icons/`).

## Architecture

All add-ons communicate through the **Storage** add-on, which provides a REST API backed by SQLite. The Scraper, Stock, and Recipe add-ons include retry logic to handle any startup ordering.

```
Storage  ←──  Scraper  (discovers products, AI optimization)
   ↑
   ├──────  Stock     (consume/add stock, barcode scanning)
   │
   └──────  Recipe    (scrape recipes, match ingredients)
```

## Installation

1. Add this repository to Home Assistant:
   **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Paste: `https://github.com/Glitchtit/HA-apps`
3. Install **Storage** first, then the other add-ons.

## Development

This repository uses Git submodules. After cloning:

```bash
git clone --recurse-submodules https://github.com/Glitchtit/HA-apps.git
```

Or if already cloned:

```bash
git submodule update --init --recursive
```

To update all submodules to their latest commits:

```bash
git submodule update --remote --merge
```
