#!/usr/bin/env python3
"""Render the GlitchyRee app icon family for every add-on and integration.

One source of truth for the shape language: a dark rounded tile, a white
line glyph drawn on a 24-unit grid, and exactly one International Orange
accent per glyph. Outputs:

  Design system/icons/<app>.svg            master icon (512 canvas) + png/ for the README
  <addon dir>/icon.png, logo.png            Supervisor add-on store
  custom_components/<domain>/brand/*.png    HA 2026.3+ local brand images (HACS)

Needs `rsvg-convert` and Pillow. Space Grotesk is downloaded on first run
into a cache dir so the wordmark renders identically on any machine.

    python scripts/make_icons.py            # write everything
    python scripts/make_icons.py --preview sheet.png  # contact sheet only
"""
from __future__ import annotations

import argparse
import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "glitchyree-icons"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf"

ORANGE = "#FF4F00"
INK = "#F3F4F6"

# ── Glyphs — 24-unit grid, stroke 2, round caps. `{a}` marks the accent. ──
GLYPHS: dict[str, str] = {
    # Database cylinder; the lid is the accent.
    "storage": """
      <path d="M4 6v12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V6"/>
      <path d="M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5"/>
      <ellipse cx="12" cy="6" rx="8" ry="3.5" fill="{a}"/>
    """,
    # Magnifier sweeping rows of product data; handle is the accent.
    "scraper": """
      <circle cx="10.5" cy="10.5" r="7"/>
      <path d="M7.5 8.5h6M7.5 12.5h4"/>
      <path d="M15.8 15.8 21 21" stroke="{a}" stroke-width="3"/>
    """,
    # Parcel with packing tape across the lid.
    "stock": """
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z"/>
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>
      <path d="M7.75 4.75 16.25 9.25" stroke="{a}" stroke-width="2.6"/>
    """,
    # Chef's toque; the band is the accent.
    "recipes": """
      <path d="M7.5 15C4.2 15 2.4 11.2 4.4 8.8 5.7 7.3 7.6 7.2 8.6 7.7 9.2 4.8 10.6 3 12 3s2.8 1.8 3.4 4.7c1-.5 2.9-.4 4.2 1.1 2 2.4.2 6.2-3.1 6.2"/>
      <rect x="6.5" y="15" width="11" height="5.5" rx="1.5" fill="{a}"/>
    """,
    # Tilted broom with a sparkle of a job done; bristles are the accent.
    "chores": """
      <g transform="rotate(32 12 12)">
        <path d="M12 1v10"/>
        <rect x="9.25" y="11" width="5.5" height="3" rx="1"/>
        <path d="M9.25 14 6 21.5h12L14.75 14Z" fill="{a}"/>
        <path d="M10.5 17.5l-.6 4M13.5 17.5l.6 4"/>
      </g>
      <path d="M5 2.5v5M2.5 5h5" stroke-width="1.8"/>
    """,
    # Checklist: two done, one to go.
    "lists": """
      <path d="M3.5 5.5 5.5 7.5 9 4M3.5 12.5l2 2L9 11" stroke="{a}" stroke-width="2.4"/>
      <rect x="3.5" y="17" width="5" height="4.5" rx="1"/>
      <path d="M12.5 6h8M12.5 13h8M12.5 19.25h5.5"/>
    """,
    # Thermal receipt rolling out of the printer slot.
    "print": """
      <path d="M2.5 4.5h19" stroke="{a}" stroke-width="2.8"/>
      <path d="M6 4.5v16l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5v-16"/>
      <path d="M9 9h6M9 12.5h6M9 16h3.5"/>
    """,
}

# app key → (display name, add-on dir, integration domain dir or None)
APPS = {
    "storage": ("Storage", "HA-storage/storage", "HA-storage/custom_components/ha_storage"),
    "scraper": ("Scraper", "HA-scraper/addon", "HA-scraper/custom_components/scraper"),
    "stock": ("Stock", "HA-stock/stock", None),
    "recipes": ("Recipes", "HA-recipes/recipes", "HA-recipes/custom_components/ha_recipes"),
    "chores": ("Chores", "HA-chores/chores", "HA-chores/custom_components/ha_chores"),
    "lists": ("Lists", "HA-lists/lists", "HA-lists/custom_components/ha_lists"),
    "print": ("Print", "HA-print/print", "HA-print/custom_components/ha_print"),
}

TILE_DEFS = f"""
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1F2937"/>
      <stop offset="1" stop-color="#0A0D14"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.86" r="0.75">
      <stop offset="0" stop-color="{ORANGE}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="{ORANGE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cobalt" cx="0.12" cy="0.08" r="0.7">
      <stop offset="0" stop-color="#2E6BD6" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#2E6BD6" stop-opacity="0"/>
    </radialGradient>
  </defs>
"""


def tile(w: int, h: int, r: int) -> str:
    return f"""
  <rect width="{w}" height="{h}" rx="{r}" fill="url(#bg)"/>
  <rect width="{w}" height="{h}" rx="{r}" fill="url(#cobalt)"/>
  <rect width="{w}" height="{h}" rx="{r}" fill="url(#glow)"/>
  <rect x="2" y="2" width="{w - 4}" height="{h - 4}" rx="{r - 2}" fill="none"
        stroke="#FFFFFF" stroke-opacity="0.09" stroke-width="4"/>
"""


def glyph(key: str, x: float, y: float, size: float) -> str:
    body = GLYPHS[key].replace("{a}", ORANGE)
    s = size / 24
    return f"""
  <g transform="translate({x} {y}) scale({s})" fill="none" stroke="{INK}"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</g>
"""


def icon_svg(key: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
{TILE_DEFS}{tile(512, 512, 116)}{glyph(key, 96, 96, 320)}</svg>
"""


def logo_svg(key: str, name: str, font: Path) -> tuple[str, int]:
    """Wide badge: glyph + wordmark on the same tile. Height 256 (=@2x 128)."""
    h, pad, gsize, fsize = 256, 52, 152, 112
    f = ImageFont.truetype(str(font), fsize)
    f.set_variation_by_name("Bold")
    text_w = f.getlength(name)
    w = int(pad + gsize + 40 + text_w + pad + 8)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
{TILE_DEFS}{tile(w, h, 72)}{glyph(key, pad, (h - gsize) / 2, gsize)}
  <text x="{pad + gsize + 40}" y="{h / 2 + fsize * 0.35:.1f}" fill="{INK}"
        font-family="Space Grotesk" font-weight="700" font-size="{fsize}"
        letter-spacing="-2">{name}</text>
</svg>
""", w


def ensure_font() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    font = CACHE / "SpaceGrotesk.ttf"
    if not font.exists():
        urllib.request.urlretrieve(FONT_URL, font)
    conf = CACHE / "fonts.conf"
    conf.write_text(
        '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'
        '<include ignore_missing="yes">/etc/fonts/fonts.conf</include>'
        f"<dir>{CACHE}</dir><cachedir>{CACHE / 'fc'}</cachedir></fontconfig>"
    )
    os.environ["FONTCONFIG_FILE"] = str(conf)
    return font


def render(svg: str, out: Path, width: int) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as fh:
        fh.write(svg)
    try:
        subprocess.run(["rsvg-convert", "-w", str(width), "-o", str(out), fh.name], check=True)
    finally:
        os.unlink(fh.name)


def contact_sheet(out: Path, tmp: Path) -> None:
    """All icons + logos on HA light and dark card colours, for review."""
    keys = list(APPS)
    cell, gap = 160, 24
    rows = []
    for bg in ("#FFFFFF", "#1C1C1C"):
        row = Image.new("RGBA", (gap + len(keys) * (cell + gap), cell + 2 * gap), bg)
        for i, k in enumerate(keys):
            im = Image.open(tmp / f"{k}-icon.png").convert("RGBA").resize((cell, cell), Image.LANCZOS)
            row.alpha_composite(im, (gap + i * (cell + gap), gap))
        rows.append(row)
        logos = [Image.open(tmp / f"{k}-logo.png").convert("RGBA") for k in keys]
        lrow = Image.new("RGBA", (sum(l.width for l in logos[:4]) + 5 * gap, 2 * (128 + gap) + gap), bg)
        x, y = gap, gap
        for j, l in enumerate(logos):
            if j == 4:
                x, y = gap, 128 + 2 * gap
            lrow.alpha_composite(l, (x, y))
            x += l.width + gap
        rows.append(lrow)
    # small sizes, as HA lists them
    smalls = Image.new("RGBA", (gap + len(keys) * (48 + gap), 48 + 2 * gap), "#1C1C1C")
    for i, k in enumerate(keys):
        im = Image.open(tmp / f"{k}-icon.png").convert("RGBA").resize((48, 48), Image.LANCZOS)
        smalls.alpha_composite(im, (gap + i * (48 + gap), gap))
    rows.append(smalls)
    W = max(r.width for r in rows)
    sheet = Image.new("RGBA", (W, sum(r.height for r in rows)), "#808080")
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    sheet.save(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="PNG", help="only write a contact sheet to PNG")
    args = ap.parse_args()
    font = ensure_font()

    if args.preview:
        tmp = Path(tempfile.mkdtemp())
        for key, (name, _, _) in APPS.items():
            render(icon_svg(key), tmp / f"{key}-icon.png", 256)
            svg, w = logo_svg(key, name, font)
            render(svg, tmp / f"{key}-logo.png", w // 2)
        contact_sheet(Path(args.preview), tmp)
        print(args.preview)
        return

    masters = ROOT / "Design system" / "icons"
    masters.mkdir(parents=True, exist_ok=True)
    for key, (name, addon, integ) in APPS.items():
        isvg = icon_svg(key)
        lsvg, lw = logo_svg(key, name, font)
        (masters / f"{key}.svg").write_text(isvg)
        (masters / f"{key}-logo.svg").write_text(lsvg)
        # Submodule files don't resolve from the umbrella README on GitHub
        render(isvg, masters / "png" / f"{key}.png", 256)

        # Supervisor add-on store: icon.png (square) + logo.png (wide)
        render(isvg, ROOT / addon / "icon.png", 256)
        render(lsvg, ROOT / addon / "logo.png", lw // 2)

        # HA 2026.3+ local brand images; the tile reads on light and dark,
        # so no dark_ variants are needed.
        if integ:
            brand = ROOT / integ / "brand"
            render(isvg, brand / "icon.png", 256)
            render(isvg, brand / "icon@2x.png", 512)
            render(lsvg, brand / "logo.png", lw // 2)
            render(lsvg, brand / "logo@2x.png", lw)
        print(f"{key}: ok")


if __name__ == "__main__":
    main()
