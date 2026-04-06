# Glitchtit's Home Assistant Add-ons

[![Open your Home Assistant instance and show the add add-on repository dialog.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FGlitchtit%2FHA-apps)

A collection of Home Assistant add-ons, managed via Git submodules for easy maintenance.

## Add-ons

| Add-on | Description |
|--------|-------------|
| [Grocy Stock](HA-grocy-stock/grocy_stock) | Grocy stock management dashboard for Home Assistant |
| [Grocy Scraper](grocy_scraper/grocy_scraper_addon) | Scrapes k-ruoka.fi for Finnish food products and populates a Grocy database |

## Installation

1. Add this repository to Home Assistant:
   **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Paste: `https://github.com/Glitchtit/HA-apps`
3. Install the desired add-on from the list.

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
