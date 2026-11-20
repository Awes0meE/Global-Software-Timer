"""Rasterises the GST clock mark into the Tauri icon set (also used for the tray).

Usage (Windows, from the repository root):
    python scripts/brand/build-clock-mark.py
    python scripts/brand/build-icons.py

Renders each SVG once at 512 px with headless Microsoft Edge on a transparent
background, then downsamples with Pillow. 16-32 px sizes use the simplified mark.
"""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "src" / "assets"
ICONS = ROOT / "src-tauri" / "icons"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
RENDER = 512


def render(svg: Path, work: Path) -> Image.Image:
    page = work / f"{svg.stem}.html"
    page.write_text(
        "<!doctype html><meta charset='utf-8'>"
        "<style>html,body{margin:0;background:transparent}img{display:block}</style>"
        f"<img src='{svg.as_uri()}' width='{RENDER}' height='{RENDER}'>",
        encoding="utf-8",
    )
    shot = work / f"{svg.stem}.png"
    subprocess.run(
        [
            str(EDGE),
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--allow-file-access-from-files",
            "--default-background-color=00000000",
            f"--user-data-dir={work / 'profile'}",
            f"--window-size={RENDER},{RENDER}",
            f"--screenshot={shot}",
            page.as_uri(),
        ],
        check=False,
        capture_output=True,
    )
    # The Edge launcher can return before the screenshot lands on disk.
    for _ in range(60):
        if shot.exists() and shot.stat().st_size > 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError(f"Edge did not write {shot}")
    time.sleep(0.25)
    with Image.open(shot) as image:
        return image.convert("RGBA").crop((0, 0, RENDER, RENDER))


def main() -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        work = Path(tmp)
        detailed = render(ASSETS / "gst-clock.svg", work)
        small = render(ASSETS / "gst-clock-small.svg", work)

    def sized(size: int) -> Image.Image:
        source = small if size <= 32 else detailed
        return source.resize((size, size), Image.LANCZOS)

    sized(32).save(ICONS / "32x32.png")
    sized(128).save(ICONS / "128x128.png")
    sized(256).save(ICONS / "128x128@2x.png")
    frames = [sized(size) for size in (16, 24, 32, 48, 64, 128, 256)]
    frames[-1].save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[frame.size for frame in frames],
        append_images=frames[:-1],
    )
    print("wrote icons to", ICONS)


if __name__ == "__main__":
    main()
