"""Generates the GST skeuomorphic clock mark.

Writes:
  src/assets/gst-clock.svg        detailed mark for the sidebar and large icons (>= 48 px)
  src/assets/gst-clock-small.svg  simplified mark for 16-32 px icons

Rasterising to the Tauri icon set is done by scripts/brand/build-icons.py.
"""

from __future__ import annotations

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
C = 128.0


def polar(radius: float, degrees: float) -> tuple[float, float]:
    """Point on a circle; 0 degrees is 12 o'clock, clockwise."""
    radians = math.radians(degrees)
    return C + radius * math.sin(radians), C - radius * math.cos(radians)


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def tick(r1: float, r2: float, degrees: float, width: float, color: str) -> str:
    x1, y1 = polar(r1, degrees)
    x2, y2 = polar(r2, degrees)
    return (
        f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}" '
        f'stroke="{color}" stroke-width="{fmt(width)}" stroke-linecap="butt"/>'
    )


def hand(length: float, tail: float, base_half: float, tip_half: float, degrees: float, fill: str) -> str:
    """Tapered hand drawn pointing up, then rotated into place."""
    points = [
        (C - base_half, C + tail),
        (C - tip_half, C - length + tip_half * 2),
        (C, C - length),
        (C + tip_half, C - length + tip_half * 2),
        (C + base_half, C + tail),
    ]
    path = "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in points) + " Z"
    return f'<path d="{path}" fill="{fill}" transform="rotate({fmt(degrees)} {fmt(C)} {fmt(C)})"/>'


DEFS = """
  <defs>
    <linearGradient id="bezel" x1="0.15" y1="0.05" x2="0.85" y2="0.95">
      <stop offset="0" stop-color="#fbfbfa"/>
      <stop offset="0.28" stop-color="#d3d5d7"/>
      <stop offset="0.52" stop-color="#8f9397"/>
      <stop offset="0.74" stop-color="#d8dadc"/>
      <stop offset="1" stop-color="#6a6e72"/>
    </linearGradient>
    <linearGradient id="bezelInner" x1="0.2" y1="0.05" x2="0.8" y2="0.95">
      <stop offset="0" stop-color="#5f6367"/>
      <stop offset="0.55" stop-color="#b9bcbf"/>
      <stop offset="1" stop-color="#f4f4f3"/>
    </linearGradient>
    <radialGradient id="dial" cx="0.44" cy="0.38" r="0.72">
      <stop offset="0" stop-color="#fffdf8"/>
      <stop offset="0.68" stop-color="#f2eee5"/>
      <stop offset="1" stop-color="#d9d2c3"/>
    </radialGradient>
    <radialGradient id="recess" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.8" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.3"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="handInk" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#36383b"/>
      <stop offset="0.5" stop-color="#1a1b1d"/>
      <stop offset="1" stop-color="#0c0d0e"/>
    </linearGradient>
    <radialGradient id="cap" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#b7babd"/>
      <stop offset="1" stop-color="#4d5155"/>
    </radialGradient>
    <clipPath id="dialClip"><circle cx="128" cy="128" r="{dial_r}"/></clipPath>
    <filter id="caseShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="{case_dy}" stdDeviation="{case_blur}" flood-color="#000" flood-opacity="0.34"/>
    </filter>
    <filter id="handShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="1.6" dy="2.6" stdDeviation="1.6" flood-color="#000" flood-opacity="0.32"/>
    </filter>
  </defs>
"""

SIGNAL = "#ff6a13"
INK = "#1c1c1a"


def build(detailed: bool) -> str:
    bezel_r = 116 if detailed else 120
    inner_r = 103 if detailed else 104
    dial_r = 97 if detailed else 96
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">',
        '  <title>全局软件计时器</title>',
        DEFS.replace("{dial_r}", str(dial_r))
        .replace("{case_dy}", "6" if detailed else "4")
        .replace("{case_blur}", "6" if detailed else "3"),
        '  <g filter="url(#caseShadow)">',
        f'    <circle cx="128" cy="128" r="{bezel_r}" fill="url(#bezel)"/>',
        f'    <circle cx="128" cy="128" r="{bezel_r - 0.75}" fill="none" stroke="#575b5f" stroke-width="1.5"/>',
        "  </g>",
        f'  <circle cx="128" cy="128" r="{inner_r}" fill="url(#bezelInner)"/>',
        f'  <circle cx="128" cy="128" r="{dial_r}" fill="url(#dial)"/>',
        '  <g clip-path="url(#dialClip)">',
    ]

    if detailed:
        for minute in range(60):
            if minute % 5:
                parts.append("    " + tick(dial_r - 9, dial_r - 3.5, minute * 6, 1.6, "#3a3a37"))
        for hour in range(12):
            width = 7 if hour % 3 == 0 else 4.6
            inner = dial_r - 24 if hour % 3 == 0 else dial_r - 19
            parts.append("    " + tick(inner, dial_r - 3.5, hour * 30, width, INK))
    else:
        for hour in range(12):
            width = 13 if hour % 3 == 0 else 8
            inner = dial_r - 30 if hour % 3 == 0 else dial_r - 22
            parts.append("    " + tick(inner, dial_r - 4, hour * 30, width, INK))

    parts.append(f'    <circle cx="128" cy="128" r="{dial_r}" fill="url(#recess)"/>')
    parts.append('    <g filter="url(#handShadow)">')
    # 10:10:35, the classic display pose.
    if detailed:
        parts.append("      " + hand(56, 14, 6.2, 2.2, 305, "url(#handInk)"))
        parts.append("      " + hand(80, 16, 4.6, 1.6, 60, "url(#handInk)"))
        parts.append("      " + hand(86, 26, 1.3, 0.9, 210, SIGNAL))
        tail_x, tail_y = polar(-20, 210)
        parts.append(f'      <circle cx="{fmt(tail_x)}" cy="{fmt(tail_y)}" r="4.2" fill="{SIGNAL}"/>')
    else:
        parts.append("      " + hand(52, 12, 10, 4, 305, "url(#handInk)"))
        parts.append("      " + hand(76, 12, 8, 3.2, 60, "url(#handInk)"))
        parts.append("      " + hand(80, 18, 3.2, 2.4, 210, SIGNAL))
    parts.append("    </g>")
    parts.append(f'    <circle cx="128" cy="128" r="{9 if detailed else 12}" fill="url(#cap)"/>')
    parts.append(f'    <circle cx="128" cy="128" r="{3.4 if detailed else 5}" fill="{SIGNAL}"/>')
    # Domed crystal: a soft reflection across the upper left and a thin rim glint at the lower right.
    parts.append(
        '    <ellipse cx="96" cy="70" rx="86" ry="46" transform="rotate(-24 96 70)" '
        f'fill="url(#glass)" opacity="{0.55 if detailed else 0.4}"/>'
    )
    parts.append("  </g>")
    if detailed:
        x1, y1 = polar(dial_r - 2, 115)
        x2, y2 = polar(dial_r - 2, 165)
        parts.append(
            f'  <path d="M{fmt(x1)} {fmt(y1)} A{dial_r - 2} {dial_r - 2} 0 0 1 {fmt(x2)} {fmt(y2)}" '
            'fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2.2" stroke-linecap="round"/>'
        )
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def main() -> None:
    assets = ROOT / "src" / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "gst-clock.svg").write_text(build(detailed=True), encoding="utf-8")
    (assets / "gst-clock-small.svg").write_text(build(detailed=False), encoding="utf-8")
    print("wrote", assets / "gst-clock.svg", "and", assets / "gst-clock-small.svg")


if __name__ == "__main__":
    main()
