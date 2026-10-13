<p align="center">
  <img src="Design%20system/icons/png/storage.png" width="44" alt="">&nbsp;
  <img src="Design%20system/icons/png/scraper.png" width="44" alt="">&nbsp;
  <img src="Design%20system/icons/png/stock.png" width="44" alt="">&nbsp;
  <img src="Design%20system/icons/png/recipes.png" width="44" alt="">&nbsp;
  <img src="Design%20system/icons/png/chores.png" width="44" alt="">&nbsp;
  <img src="Design%20system/icons/png/lists.png" width="44" alt="">&nbsp;
  <img src="Design%20system/icons/png/print.png" width="44" alt="">
</p>

<h1 align="center">Glitchtit's Home Assistant apps</h1>

<p align="center">
  <b>Household add-ons for Home Assistant: food, stock, recipes, chores and to-dos.</b><br>
  Seven add-ons that share one data store and one look, made for a Finnish household.
</p>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FGlitchtit%2FHA-apps"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="Add this repository to Home Assistant"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Glitchtit/HA-recipes/main/docs/screenshots/hero.png" alt="Recipes" width="100%">
</p>

## 📦 The apps

| | App | What it does | HACS integration |
|---|-----|--------------|:---:|
| <img src="Design%20system/icons/png/storage.png" width="48" alt="Storage"> | [**Storage**](https://github.com/Glitchtit/HA-storage) | The shared database: products, stock, recipes, shopping list and images. Install it first | ✅ |
| <img src="Design%20system/icons/png/scraper.png" width="48" alt="Scraper"> | [**Scraper**](https://github.com/Glitchtit/HA-scraper) | Fills Storage with Finnish grocery products, prices and store availability | ✅ |
| <img src="Design%20system/icons/png/stock.png" width="48" alt="Stock"> | [**Stock**](https://github.com/Glitchtit/HA-stock) | Phone-first pantry: scan, consume, use-soon list and an aisle-ordered shopping list | |
| <img src="Design%20system/icons/png/recipes.png" width="48" alt="Recipes"> | [**Recipe**](https://github.com/Glitchtit/HA-recipes) | Paste a recipe URL; every ingredient is matched to a real product | ✅ |
| <img src="Design%20system/icons/png/chores.png" width="48" alt="Chores"> | [**Chores**](https://github.com/Glitchtit/HA-chores) | Household chores as a game: XP, streaks, quests and a pet house to decorate | ✅ |
| <img src="Design%20system/icons/png/lists.png" width="48" alt="Lists"> | [**Lists**](https://github.com/Glitchtit/HA-lists) | Folders, lists and subtasks, with AI task breakdown and household assignment | ✅ |
| <img src="Design%20system/icons/png/print.png" width="48" alt="Print"> | [**Print**](https://github.com/Glitchtit/HA-print) | Shopping lists, recipes and custom designs on an 80 mm receipt printer | ✅ |

## 📸 A look around

<table>
  <tr>
    <td width="50%"><a href="https://github.com/Glitchtit/HA-stock"><img src="https://raw.githubusercontent.com/Glitchtit/HA-stock/main/docs/screenshots/hero.png" alt="Stock"></a></td>
    <td width="50%"><a href="https://github.com/Glitchtit/HA-storage"><img src="https://raw.githubusercontent.com/Glitchtit/HA-storage/main/docs/screenshots/insights.png" alt="Storage insights"></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Stock: pantry, shopping list and use-soon</sub></td>
    <td align="center"><sub>Storage: stock value and monthly spend</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="https://github.com/Glitchtit/HA-chores"><img src="https://raw.githubusercontent.com/Glitchtit/HA-chores/main/docs/screenshots/hero.png" alt="Chores"></a></td>
    <td width="50%"><a href="https://github.com/Glitchtit/HA-lists"><img src="https://raw.githubusercontent.com/Glitchtit/HA-lists/main/docs/screenshots/hero.png" alt="Lists"></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Chores: pet house and today's chores</sub></td>
    <td align="center"><sub>Lists: lists, spiciness and subtasks</sub></td>
  </tr>
</table>

## 🚀 Installation

1. Click the button above, or open **Settings → Add-ons → Add-on Store → ⋮ → Repositories** and add `https://github.com/Glitchtit/HA-apps`
2. Install **Storage** first, then any of the others. Chores and Lists also work on their own
3. Optional: add the HACS integrations (each app's README has the steps) for sensors, to-do lists and actions in automations and voice assistants

## 🧭 How they fit together

Storage is the system of record: Scraper, Stock and Recipe keep their data there and wait for it at startup. Storage asks Scraper when it needs to find a product, and Print reads the shopping list from Storage.

```
             ┌──────────── Scraper   finds products, prices, availability
             │
  Storage  ◄─┼──────────── Stock     scan, consume, shopping list ──┐
             │                                                     ├──►  Print   receipts
             └──────────── Recipe    import recipes, match products ┘

  Chores, Lists   standalone, with their own databases
```

## 🛠️ Development

This repository bundles the apps as Git submodules; each app lives in its own repository with its own README and tests.

```bash
git clone --recurse-submodules https://github.com/Glitchtit/HA-apps.git
git submodule update --remote --merge   # pull every app to its latest commit
```

Icons and logos come from one generator: `python scripts/make_icons.py` (masters in `Design system/icons/`).
