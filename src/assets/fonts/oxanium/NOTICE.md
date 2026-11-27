# Number font

Oxanium sets the numbers outside the e-ink screens: durations in tables, statistics, dates and the version. The UI
declares it as `GST Num` in `src/styles.css` (the `--font-num` token) and preloads it from `index.html`. Nothing is
fetched at runtime. It is licensed under the SIL Open Font License 1.1; the licence text is next to it.

| File | Font | Source | Licence |
| --- | --- | --- | --- |
| `Oxanium-Variable.woff2` | Oxanium 2.000 by Severin Meyer, variable (`wght` 200–800), every glyph | `ofl/oxanium/Oxanium[wght].ttf` from <https://github.com/google/fonts> at commit `5026800714d07231937d92eb4cceabf06e05d74e` | [`Oxanium-OFL.txt`](./Oxanium-OFL.txt) |

## Source file

| Source | SHA-256 |
| --- | --- |
| `Oxanium[wght].ttf` | `2ce01d946e1e1ffc8d7eecfffbda8623bedd63eaf811a20488c4b69af45babb0` |

`Oxanium-OFL.txt` is `ofl/oxanium/OFL.txt` from the same commit. The font declares no Reserved Font Name.

## Rebuilding

The woff2 is the source font recompressed, with every glyph, axis, layout feature and name kept. Rebuild it with:

```powershell
python -m pip install --user fonttools brotli
python -m fontTools.subset "Oxanium[wght].ttf" --unicodes="*" --glyphs="*" --layout-features="*" --name-IDs="*" --name-languages="*" --notdef-outline --flavor=woff2 --output-file=src/assets/fonts/oxanium/Oxanium-Variable.woff2
```

The committed file was built with fontTools 4.63.0 and Brotli 1.2.1.

| Output | SHA-256 |
| --- | --- |
| `Oxanium-Variable.woff2` | `3301a72ebcb2fe6fbb1f399f5667d6cd77edccd10e9fb89139ebe65ab67e04aa` |
