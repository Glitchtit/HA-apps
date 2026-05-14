#!/usr/bin/env python3
"""Flood-fill chroma-key for nanobanana sprite outputs.

Gemini's image generation API returns JPEGs (saved with .png extension) and
paints the editor's transparency-checkerboard pattern as literal pixels. This
script reads each image, flood-fills from every edge pixel inward, and clears
alpha on any pixel within tolerance of the seed color. The flood stops at the
sprite's outline so the foreground art is preserved.

Usage:
    transparentize.py PATH [PATH ...]
    transparentize.py --tolerance 60 PATH

Exit status 0 even when individual files fail (errors logged to stderr).

Also tolerates a literal-path-list on stdin when invoked with `-` so it can be
chained from hooks that pass paths via env var. Example:
    echo "/a.png\n/b.png" | transparentize.py -
"""

from __future__ import annotations
import argparse
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("error: Pillow (PIL) not installed. Run: pip install Pillow", file=sys.stderr)
    sys.exit(2)


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    """Max-component absolute distance — cheaper than Euclidean, good enough
    for distinguishing checkerboard grays from sprite black outlines."""
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def transparentize(path: str, tolerance: int = 50, out_path: str | None = None) -> int:
    """Make the background of *path* transparent. Returns pixels cleared."""
    src = Image.open(path).convert("RGBA")
    w, h = src.size
    px = src.load()

    seed_pixels = [
        px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1],
        px[w // 2, 0], px[w // 2, h - 1], px[0, h // 2], px[w - 1, h // 2],
    ]
    seeds = [(p[0], p[1], p[2]) for p in seed_pixels]

    def is_bg(rgb: tuple[int, int, int]) -> bool:
        for s in seeds:
            if color_distance(rgb, s) <= tolerance:
                return True
        return False

    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        idx = y * w + x
        if visited[idx]:
            return
        r, g, b, _ = px[x, y]
        if is_bg((r, g, b)):
            visited[idx] = 1
            q.append((x, y))

    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)

    cleared = 0
    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        cleared += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if visited[idx]:
                    continue
                pr, pg, pb, _ = px[nx, ny]
                if is_bg((pr, pg, pb)):
                    visited[idx] = 1
                    q.append((nx, ny))

    out = out_path or path
    src.save(out, "PNG")
    return cleared


def _process(paths: list[str], tolerance: int, quiet: bool = False) -> int:
    rc = 0
    for p in paths:
        if not Path(p).is_file():
            print(f"  skip (not a file): {p}", file=sys.stderr)
            continue
        try:
            cleared = transparentize(p, tolerance=tolerance)
            if not quiet:
                print(f"  transparentized {p} ({cleared} px cleared)")
        except Exception as e:
            print(f"  failed {p}: {e}", file=sys.stderr)
            rc = 0  # don't fail the hook; just log
    return rc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip())
    ap.add_argument("paths", nargs="*", help="image paths to process; use - to read from stdin")
    ap.add_argument("--tolerance", type=int, default=50,
                    help="max RGB distance from corner seed to consider as background (default 50)")
    ap.add_argument("--quiet", action="store_true", help="suppress per-file success messages")
    args = ap.parse_args()

    paths = list(args.paths)
    if "-" in paths or not paths:
        paths.remove("-") if "-" in paths else None
        if not sys.stdin.isatty():
            for line in sys.stdin.read().splitlines():
                line = line.strip()
                if line:
                    paths.append(line)

    if not paths:
        ap.print_help(sys.stderr)
        return 1

    return _process(paths, tolerance=args.tolerance, quiet=args.quiet)


if __name__ == "__main__":
    sys.exit(main())
