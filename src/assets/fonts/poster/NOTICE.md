# Poster fonts

These two fonts are used only to render the share posters (日报海报, 成就海报). The app UI does not use them.
They are bundled with the app and loaded only when a poster is rendered; nothing is fetched at runtime.
Both are licensed under the SIL Open Font License 1.1; the licence texts are next to them.

| File | Font | Source | Licence |
| --- | --- | --- | --- |
| `InterVariable-latin.woff2` | Inter 4.1, variable (`opsz` 14–32, `wght` 100–900), Latin subset | `InterVariable.ttf` from `Inter-4.1.zip`, <https://github.com/rsms/inter/releases/tag/v4.1> | [`Inter-OFL.txt`](./Inter-OFL.txt) |
| `NotoSansSC-VF-gb2312.woff2` | Noto Sans SC (思源黑体) 2.004, variable (`wght` 100–900), GB2312 + ASCII + CJK punctuation subset | `Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf` from <https://github.com/notofonts/noto-cjk> at tag `Sans2.004` | [`NotoSansSC-OFL.txt`](./NotoSansSC-OFL.txt) |

## Source files

| Source | SHA-256 |
| --- | --- |
| `Inter-4.1.zip` (release asset) | `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` |
| `InterVariable.ttf` (inside the zip) | `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf` |
| `NotoSansSC-VF.ttf` (noto-cjk `Sans2.004`) | `d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964` |

Licence texts: `Inter-OFL.txt` is `LICENSE.txt` from `Inter-4.1.zip`. `NotoSansSC-OFL.txt` is `LICENSE` from noto-cjk at tag
`Sans2.004`, preceded by the copyright notice from the font's own name table.

## Rebuilding

The subsets are modified versions under the OFL (subsetting only; the family names are unchanged and contain no
Reserved Font Name). Rebuild them with:

```powershell
python -m pip install --user fonttools brotli
python scripts/fonts/subset-poster-fonts.py --inter <path>\InterVariable.ttf --noto <path>\NotoSansSC-VF.ttf
```

The script checks the source SHA-256 values above, keeps the variable axes and all layout features, and writes both
files here. The committed files were built with fontTools 4.60.1 and Brotli 1.1.0.

| Output | SHA-256 |
| --- | --- |
| `InterVariable-latin.woff2` | `105bef88f402339137614b5ac014560c560fbb95a17487ae68e731c745b9bc07` |
| `NotoSansSC-VF-gb2312.woff2` | `ed4175506ea4b787d4c450bdcff139c3436d2f33eed0baef64d51876f6cd7a0c` |

Characters outside the Noto subset fall back to `"Microsoft YaHei UI", sans-serif` on the poster.
