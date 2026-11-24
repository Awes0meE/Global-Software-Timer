"""Rebuild the poster fonts in src/assets/fonts/poster/ from the official source files.

Usage (from the repository root):

    python -m pip install --user fonttools brotli
    python scripts/fonts/subset-poster-fonts.py --inter <InterVariable.ttf> --noto <NotoSansSC-VF.ttf>

Sources (see src/assets/fonts/poster/NOTICE.md for versions and SHA-256):
  - InterVariable.ttf from the Inter 4.1 release zip, https://github.com/rsms/inter/releases/tag/v4.1
  - NotoSansSC-VF.ttf from https://github.com/notofonts/noto-cjk, tag Sans2.004,
    Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf

Both outputs keep their variable axes (Inter: opsz + wght, Noto Sans SC: wght) and all layout
features. The script refuses a source whose SHA-256 differs from the recorded one unless
--allow-other-source is given, so a rebuild cannot silently switch upstream versions.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "src" / "assets" / "fonts" / "poster"

INTER_SHA256 = "4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf"
NOTO_SHA256 = "d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964"

INTER_OUT = "InterVariable-latin.woff2"
NOTO_OUT = "NotoSansSC-VF-gb2312.woff2"

# Latin: Basic Latin, Latin-1, the usual typographic extras (the Google Fonts "latin" range).
LATIN_RANGES = [
    (0x0000, 0x00FF), (0x0131, 0x0131), (0x0152, 0x0153), (0x02BB, 0x02BC), (0x02C6, 0x02C6),
    (0x02DA, 0x02DA), (0x02DC, 0x02DC), (0x0304, 0x0304), (0x0308, 0x0308), (0x0329, 0x0329),
    (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2191, 0x2191), (0x2193, 0x2193),
    (0x2212, 0x2212), (0x2215, 0x2215), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD),
]

# Added to GB2312 for Noto Sans SC: ASCII, general punctuation, CJK symbols and punctuation,
# and the halfwidth and fullwidth forms.
CJK_EXTRA_RANGES = [(0x0020, 0x007E), (0x00B7, 0x00B7), (0x2000, 0x206F), (0x3000, 0x303F), (0xFF00, 0xFFEF)]


def expand(ranges: list[tuple[int, int]]) -> set[int]:
    return {code for start, end in ranges for code in range(start, end + 1)}


def gb2312_codepoints() -> set[int]:
    """Every character GB2312 encodes (rows 0xA1-0xF7, cells 0xA1-0xFE)."""
    codes: set[int] = set()
    for row in range(0xA1, 0xF8):
        for cell in range(0xA1, 0xFF):
            try:
                text = bytes((row, cell)).decode("gb2312")
            except UnicodeDecodeError:
                continue
            codes.update(ord(char) for char in text)
    return codes


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(source: Path, expected_sha: str, unicodes: set[int], out: Path, allow_other: bool) -> None:
    actual = sha256(source)
    if actual != expected_sha and not allow_other:
        sys.exit(f"{source}: SHA-256 {actual} is not the recorded {expected_sha}; pass --allow-other-source to use it")

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = True

    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    subset.save_font(font, str(out), options)

    check = TTFont(str(out))
    axes = [axis.axisTag for axis in check["fvar"].axes] if "fvar" in check else []
    print(f"{out.relative_to(REPO)}: {out.stat().st_size} bytes, {len(check.getBestCmap())} code points, axes {axes}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--inter", type=Path, required=True, help="InterVariable.ttf from the Inter 4.1 release zip")
    parser.add_argument("--noto", type=Path, required=True, help="NotoSansSC-VF.ttf from noto-cjk Sans2.004")
    parser.add_argument("--allow-other-source", action="store_true", help="accept sources with another SHA-256")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build(args.inter, INTER_SHA256, expand(LATIN_RANGES), OUT_DIR / INTER_OUT, args.allow_other_source)
    build(args.noto, NOTO_SHA256, gb2312_codepoints() | expand(CJK_EXTRA_RANGES), OUT_DIR / NOTO_OUT, args.allow_other_source)


if __name__ == "__main__":
    main()
