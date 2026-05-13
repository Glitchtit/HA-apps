# Glitchtit's Home Assistant Add-ons

[![Open your Home Assistant instance and show the add add-on repository dialog.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FGlitchtit%2FHA-apps)

A collection of Home Assistant add-ons for household inventory, recipe management, and grocery shopping. Managed via Git submodules.

## Add-ons

| Add-on | Description |
|--------|-------------|
| [Storage](HA-storage/storage) | Central SQLite database for products, stock, recipes, and shopping lists |
| [Scraper](HA-scraper/addon) | Scrapes Finnish grocery sites (k-ruoka.fi, s-kaupat.fi) and populates Storage with AI-powered optimization |
| [Stock](HA-stock/stock) | Stock management dashboard with barcode scanning and one-click consume |
| [Recipe](HA-recipes/recipes) | AI-powered recipe scraping — paste a URL, get ingredients matched to your inventory |

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
