# v0.4.3 Posters and Reports Design

Status: binding. All product decisions below (A–I) were approved by the user on 2026-11-25, for version v0.4.3, after three rounds of rendered mockups. The previous release spec is `2026-11-24-v042-date-browsing-and-exports-design.md` (v0.4.2, shipped). The version number stays `0.4.2` on the `feat/v0.4.3` branch until release.

This spec is written in English; every UI string is given in Chinese exactly as it must appear.

The approved look comes from throwaway mockups outside the repository, which are not committed and are not production code: the round-3 mock folder in the session scratchpad (`kit.css`, `kit.js` with the name-fit and hero cap-top logic, `data.js`, `daily-d2.html`, `ach-a3.html`, `picker.html`, `header.html`), its renders (`daily-d2-{dark,light}`, `ach-a3-{excel,code,chrome,ssms}-{dark,light}`, `picker-{dark,light}`, `picker-30-{dark,light}`, `header-{dark,light}`) and the review sheets `posters.png`, `picker.png`, `extras.png`. The mock posters are laid out at 1080×1440 CSS px; production lays them out at 540×720 CSS px and renders at scale 2, so every mock coordinate and size is halved. Port the look faithfully; rewrite the code to production quality. Where this spec and the mock disagree, this spec wins.

## Goal and scope

Let the user save a shareable picture of a day or of a software milestone, and take the `统计` range out in fuller CSV files.

| Do | Do not |
| --- | --- |
| `日报海报` PNG from `概览`; `成就海报` PNG from `成就` | Change tracking, the schema (still schema 3), metrics or their definitions |
| `统计` `区间汇总` with every software in the range, plus `每日明细` CSV | `成就记录` CSV, `统计` `区间报告` PNG, a poster theme choice, timeline |
| Bundled poster fonts (Inter, Noto Sans SC), loaded only when exporting | Change the app UI's own fonts |
| A Rust command that saves PNG bytes through the native dialog | Network access, telemetry, admin rights, automatic writes to any folder |
| CORS on the `gsticon` protocol for the app's own origins only | Program paths on posters or in exports |

## A. 日报海报 (layout D2 「屏幕时间」)

A 1080×1440 PNG (540×720 CSS px rendered at scale 2) of the day shown on `概览`.

1. **Date** at the top left: the viewed day as `11月25日 周三` (month and day without leading zeros, weekday `周一` … `周日`).
2. **Label** `今日活跃` when the viewed day is today, `当日活跃` for a past day.
3. **Hero**: that day's active time in decimal hours with one fractional digit (`6.3`) followed by the unit `小时`, in Inter Display (optical size) weight 300. The hero shrinks to fit its column (the mock's `data-fit`).
4. **Progress bar**: a gradient bar whose filled share is active ÷ recorded for that day, clamped to 0–1; an empty bar when nothing was recorded.
5. **Recorded line**, right-aligned under the bar: `记录` + that day's recorded hours (one decimal) + `小时`.
6. **Glass tray** with the top 3 software of that day, one column each: icon, name, hours (one decimal) + `小时`.
   - Rows are the rows the overview table lists for that day, with hidden software excluded exactly as the overview excludes it.
   - Ranked by that day's active seconds (highest first), ties by runtime seconds, then display name. A column shows the software's active hours; when the day has no active time at all, the tray falls back to runtime: ranked and shown by runtime hours.
   - Fewer than 3 rows → that many columns, centred in the tray. No rows → no tray.
   - Names use the name fit below (B.3).
7. **Footer**: the clock app mark + `全局软件计时器`, centred.
8. **Theme**: the app's current resolved theme (`dark` or `light`). **Background**: an opaque painted Mica glow (gradients painted into the poster, no `backdrop-filter`, no transparency in the PNG).
9. File name `GST-日报-YYYY-MM-DD.png` (the viewed day).

## B. 成就海报 (layout A3 「里程碑」)

A 1080×1440 PNG of ONE software's focus milestone.

1. **Header line**: `成就` on the left; on the right the date that software reached its highest focus tier, as `2026年11月20日`.
2. **Software**: icon + display name.
3. **Name fit** (the mock's `kit.js` logic, shared with the daily tray names): shrink the name to fit its slot down to 0.8× its size; if it still does not fit, wrap to two balanced lines at 0.8×; only then ellipsis (line clamp). The daily tray names use the one-line variant (shrink to 0.8×, then ellipsis).
4. **Label** `专注里程碑`.
5. **Hero**: the tier in hours (the app's tiers, `statistics::MILESTONE_HOURS` = 10 / 50 / 100 / 500 / 1000 / 6666) + `小时`. The hero is fitted to its slot and anchored by cap top (the mock's `data-captop`: Inter figures are 1490/2048 em tall), so 2-, 3- and 4-digit heroes sit at the same top and the label-to-numeral gap is identical on every tier.
6. A hairline rule.
7. **Two facts**, in this order: `使用 N 天` (all-time days on which this software had at least 300 s of focus) then `累计专注 X 小时` (all-time focus, one decimal).
8. **Footer** signature as in A.7. Theme and background as in A.8.
9. File name `GST-成就-<软件名>-YYYY-MM-DD.png`, where the date is the reached date and characters invalid in Windows file names (`\ / : * ? " < > |` and control characters) are stripped from the software name (trailing dots and spaces trimmed).

## C. 成就 page export

1. The `成就` page header gets an export key `导出成就` with a `PNG` format tag. It has a single format, so no caret and no menu (the v0.4.2 `ExportKey` rule).
2. Clicking it opens the `成就海报` dialog in the v0.4.2 glass dialog language of the settings import dialog: a scrim, the background made `inert`, a focus trap, Esc closes, and focus returns to the `导出成就` key on close.
   - **Left**: a live poster preview, the real `AchievementPoster` component scaled to 270×360.
   - **Right**: a listbox of the software that reached at least one focus milestone: icon, name, and the highest tier as `100 小时`. Sorted by tier (highest first), then total focus (highest first).
   - **Default selection**: the software whose highest tier was reached most recently (latest `reached_on`; ties follow the list order).
   - **Keyboard**: ↑ / ↓ / Home / End move the selection; typeahead selects by name; Enter = `保存图片`; Esc = `取消`. Double-click on a row = save.
   - The list scrolls past about 6 rows and keeps the selected row scrolled into view.
   - Selected row = an accent-tinted fill and a 1px accent outline. No side bar.
   - Keys `取消` and `保存图片` (primary).
3. The list respects the page's `包含隐藏软件` switch. When the switch changes, the selection is kept if that software is still listed, otherwise it falls back to the default.
4. While the milestone list is loading the key is busy. When no software qualifies, the key is disabled (`aria-disabled`, dimmed, no hover or press) with the tooltip `暂无里程碑` (the existing `UnavailableTooltip` bubble) and opens no dialog.
5. `保存图片` renders the PNG and calls `save_binary_export`. While rendering and saving, `保存图片` is busy and cannot be pressed again. On success the dialog closes and the v0.4.2 `已保存` toast appears with `在文件夹中显示`. If the user cancels the native dialog, nothing happens and the poster dialog stays open. On failure the dialog stays open and the toast says `保存失败`.
6. Dark, light and forced-colors must work for the key, the dialog and the list; transitions respect `prefers-reduced-motion`.

## D. 概览 export menu

`导出日报` becomes a menu key (caret + glass menu, v0.4.2 rule): `日报海报` [`PNG`] and `当日明细` [`CSV`] (the existing v0.4.2 日报 CSV, unchanged columns). File names: `GST-日报-YYYY-MM-DD.png` / `GST-日报-YYYY-MM-DD.csv`, both for the viewed day. `日报海报` saves directly (no preview dialog), with the same toast flow.

## E. 统计 export menu

`导出报表` becomes a menu key: `区间汇总` [`CSV`] and `每日明细` [`CSV`]. Both use `get_statistics_export` for the page's current range and `包含隐藏软件` switch. CSV format rules are those of v0.4.2 section E (UTF-8 with BOM, CRLF, RFC 4180 quoting, formula-injection guard, hours with 2 decimals, no program paths).

### 区间汇总 (file `GST-统计-START至END.csv`, unchanged name)

- Columns, in order: `软件名称`, `进程名`, `排名`, `焦点(小时)`, `窗口开着(小时)`, `开着没用(小时)`, `打开次数`, `平均单次(小时)`, `最长单次(小时)`, `后台(小时)`, `使用天数`.
- Rows: every software with any focus, window or background time in the range (not only the top 20), ordered by focus (highest first), then window, then display name.
- `焦点`, `窗口开着`, `后台` and `使用天数` come from `get_statistics_export`. `排名`, `开着没用`, `打开次数`, `平均单次` and `最长单次` come from the page's `StatisticsSummary` ledgers as in v0.4.2 and stay empty for a software those ledgers do not list.
- A used day = a day with focus ≥ 300 s (`STREAK_MIN_ACTIVE_SECONDS`) for that software. Window-only or background-only days never count.

### 每日明细 (file `GST-统计每日明细-START至END.csv`)

- Columns: `日期`, `软件名称`, `进程名`, `焦点(小时)`, `窗口开着(小时)`, `后台(小时)`.
- One row per date × software with any nonzero value; ordered by date ascending, then focus (highest first), then display name.

## F. Rendering

1. `modern-screenshot` pinned to exactly `4.7.0` (MIT), loaded with a dynamic `import()` only when exporting, so it is not in the startup bundle.
2. The poster React component renders into a portal positioned `position: fixed; left: -10000px; top: 0; pointer-events: none` with `aria-hidden="true"`. Never `display: none` or `visibility: hidden` (the clone would measure nothing). The poster subtree sets `forced-color-adjust: none` so the PNG does not depend on forced-colors.
3. Before capture: load the poster fonts (`FontFace` / `document.fonts.load` for each family and weight used), `await img.decode()` for every image, run the name and hero fit, then wait two animation frames.
4. Capture with `domToBlob(node, { scale: 2, backgroundColor, font: { cssText } })`: an explicit integer `scale: 2`, never `devicePixelRatio`; `backgroundColor` is the poster's opaque base colour for the theme; `cssText` holds the poster `@font-face` rules so the fonts are embedded. The result must be exactly 1080×1440.
5. **Icons**: `iconToDataUrl(url)` = `fetch(url, { cache: "no-store" })` with an `AbortController` timeout of about 3 s; it requires `response.ok` and a `Content-Type` of `image/png`, then reads the blob into a `data:` URL with `FileReader`. Any failure returns `null`, and the poster draws a letter tile (the first character of the name) instead. `no-store` keeps the request from reusing an `<img>` response cached without CORS headers.
6. **Backend CORS**: `native_icon::icon_response` adds `Access-Control-Allow-Origin` echoing the request's `Origin` (and `Vary: Origin`) only when that origin is one of the app's own: the production origin `http://tauri.localhost`, and in debug builds also the dev server origin from `tauri.conf.json` `build.devUrl` (`http://localhost:1420`). Any other origin gets no CORS header. The implementer verifies the real origins in a built app's webview and in the dev webview before relying on them; the allowed-origin check is a pure function with unit tests.

## G. Saving PNGs

New Rust command `save_binary_export`:

1. Takes the PNG as a raw IPC body (`tauri::ipc::Request`, `InvokeBody::Raw`); a JSON body is rejected (`export_invalid_request`).
2. The suggested file name comes from the request header `x-gst-file-name`, percent-encoded UTF-8. A missing header or undecodable name is `export_invalid_request`. The decoded name goes through the existing `sanitize_file_name` and gets a `.png` extension if it has none.
3. Size cap 32 MiB (`export_too_large`); the body must start with the 8-byte PNG signature `89 50 4E 47 0D 0A 1A 0A` (`export_not_png`). Both checks run before the dialog opens.
4. The save dialog runs in Rust (`tauri-plugin-dialog`, as v0.4.2: default folder Downloads, filter `PNG 图片` / `png`, `blocking_*` only off the main thread).
5. Writes through the existing `replace_via_temporary` path (`write_file_replacing`), and remembers the saved path so `reveal_saved_file` (`在文件夹中显示`) accepts it.
6. Returns `Option<String>`: the saved path, `None` if cancelled. Errors are stable codes.
7. The toast flow is v0.4.2's: `已保存` + `在文件夹中显示` on success, nothing on cancel, `保存失败` on failure.

## H. Poster fonts

1. For posters only (the app UI keeps its fonts), under `src/assets/fonts/poster/`:
   - Inter variable (axes `opsz` + `wght`, Latin subset), woff2, from the official releases at `github.com/rsms/inter`.
   - Noto Sans SC (思源黑体) variable (`wght`), subset to GB2312 plus ASCII and common CJK punctuation, woff2, from `github.com/notofonts/noto-cjk` or Google Fonts.
   - Both are SIL OFL 1.1: commit their licence texts beside them and a `NOTICE` / `README` stating each source URL, release version and the SHA-256 of the source file.
2. A reproducible subsetting script under `scripts/` using Python fontTools `pyftsubset` (install with `python -m pip install --user fonttools brotli` if missing) that rebuilds both woff2 files from the downloaded sources and keeps the variable axes.
3. Poster `@font-face` rules use poster-only family names, are bundled by Vite as local assets (no network), and are loaded only when a poster is rendered. Fallback for characters outside the subset: `"Microsoft YaHei UI", sans-serif`.
4. The scratchpad copies used by the mockups may be used to verify the result; the committed files come from the official sources.

## I. Not in v0.4.3

`成就记录` CSV, `统计` `区间报告` PNG, a poster theme choice, timeline. The version stays `0.4.2` on the branch.

## API contract

Backend and frontend tasks must match this exactly. Tauri converts argument names to camelCase on the JS side.

### Rust commands (registered in `src-tauri/src/lib.rs`)

| Command | Returns | Errors |
| --- | --- | --- |
| `get_statistics_export(start: String, end: String, include_hidden: bool)` | `StatisticsExport { start, end, software: Vec<StatisticsExportSoftware>, days: Vec<StatisticsExportDay> }` | same range validation and errors as `get_statistics_summary` |
| `get_milestone_software(include_hidden: bool)` | `Vec<MilestoneSoftware>` | |
| `save_binary_export` (raw body = PNG bytes; header `x-gst-file-name` = percent-encoded suggested name) | `Option<String>` | `export_invalid_request`, `export_too_large`, `export_not_png`, plus the write errors of `save_text_export` |

```text
StatisticsExportSoftware {
  identity_key: String, display_name: String, process_name: String,
  focused_seconds: i64, window_seconds: i64, background_seconds: i64,
  used_days: u32,
}
StatisticsExportDay {
  date: String,            // YYYY-MM-DD
  identity_key: String, display_name: String, process_name: String,
  focused_seconds: i64, window_seconds: i64, background_seconds: i64,
}
MilestoneSoftware {
  identity_key: String, display_name: String, process_name: String,
  icon_url: Option<String>,
  tier_hours: u32,
  reached_on: String,      // YYYY-MM-DD
  total_focused_seconds: i64,
  used_days: u32,
}
```

- `StatisticsExport.software` lists every software with any nonzero focus, window or background seconds in the range, sorted focus desc, then window desc, then display name. `days` lists every date × software with any nonzero value, sorted date asc, then focus desc, then display name. Focus and window come from the same daily tables `get_statistics_summary` reads; background is `daily_software_runtime_usage.background_seconds` (the `软件` page's 后台 figure). `used_days` counts days in the range with focus ≥ `STREAK_MIN_ACTIVE_SECONDS`. Hidden software is left out unless `include_hidden`.
- `get_milestone_software` returns only software with a tier reached, sorted `tier_hours` desc, then `total_focused_seconds` desc, then identity key. It reuses the achievements milestone tier definition (`MILESTONE_HOURS`) and reached-date logic (`statistics::milestones`: the day the running total first crossed the highest tier) but is not truncated to `MILESTONE_LIMIT`. `used_days` is all-time days with focus ≥ `STREAK_MIN_ACTIVE_SECONDS`. `icon_url` is the `gsticon` URL the other pages use, when one is known. Hidden software is left out unless `include_hidden`.

### TypeScript (`src/api.ts`)

- `getStatisticsExport({ start, end, includeHidden }): Promise<StatisticsExport>`
- `getMilestoneSoftware(includeHidden: boolean): Promise<MilestoneSoftware[]>`
- `saveBinaryExport(bytes: Uint8Array, suggestedName: string): Promise<string | null>`, which calls `invoke("save_binary_export", bytes, { headers: { "x-gst-file-name": encodeURIComponent(name) } })`
- Interfaces match the Rust structs (snake_case fields, as serialized).

### Poster module (`src/posters/`)

- `DailyPoster` and `AchievementPoster` components, each taking a typed view model and a theme.
- Pure view-model builders: `dailyPosterModel(summary, viewedDate, isToday)` and `achievementPosterModel(milestoneSoftware)`, including the date strings, label, hero and fact strings, and top-3 selection.
- `renderPosterPng(element): Promise<Uint8Array>` (section F) and `iconToDataUrl(url): Promise<string | null>`.

### UI preview mock

- `scripts/ui-preview` answers `get_statistics_export`, `get_milestone_software` and `save_binary_export` with demo data consistent with `mock-data.ts`. Milestone software includes VS Code 6666 reached 2026-11-20, Chrome 500 reached 2026-10-12, Excel 100 reached 2026-11-22, Typora 50, MATLAB 50, Windows Terminal 10, with plausible `used_days`. `save_binary_export` resolves to a fake path like `C:\Users\demo\Downloads\<name>` and never touches the disk.
- A preview-only route shows one poster alone at 540×720 for screenshots: `?poster=daily|achievement&theme=dark|light&software=<identity key>`.

## Privacy

- Posters and CSV files are written only to the path the user picks in the native dialog; nothing is written automatically and nothing leaves the machine.
- Posters show software display names, icons, hours, days and dates only: never program paths or process names. CSV exports never contain program paths.
- The `gsticon` CORS header is sent only to the app's own origins.
- Fonts are bundled; no runtime network access. Still no telemetry, no admin rights, and no window titles, document names, web page titles, keystrokes, mouse coordinates, file contents or browser history.

## Acceptance criteria

1. `npm.cmd run check` and `cargo clippy --all-targets -- -D warnings` pass; `cargo fmt --check` is clean. Schema is still 3; the version is still `0.4.2`.
2. `日报海报` and `成就海报` are exactly 1080×1440 PNGs matching the approved D2 and A3 mocks in dark and light, with the bundled fonts embedded (no fallback glyphs for GB2312 text), icons drawn (or letter tiles when an icon cannot be fetched), an opaque background and no program paths.
3. The daily poster follows section A for today and for a past day (label, date, hero, bar, recorded line, 0–3 tray columns, hidden software excluded).
4. The achievement poster follows section B for every tier, including 2-, 3- and 4-digit heroes aligned by cap top, and long names that shrink, wrap to two lines and finally ellipsise.
5. The `成就` dialog meets section C: default selection, sort order, keyboard (↑ ↓ Home End, typeahead, Enter, Esc), double-click save, scroll-into-view, focus trap and return, inert background, the disabled key with `暂无里程碑`, and the `包含隐藏软件` switch.
6. `概览` and `统计` export menus offer exactly the items of D and E; the CSV files have the columns, rows and order of E and the file names of A, B, D and E.
7. `save_binary_export` rejects non-raw bodies, a missing or bad name header, bodies over 32 MiB and non-PNG bodies with the stable codes; cancel does nothing; success shows the toast and `在文件夹中显示` works for the saved path.
8. `gsticon` icon responses carry `Access-Control-Allow-Origin` only for the app's own origins, verified against the real webview origins.
9. `package.json` pins `modern-screenshot` to `4.7.0`; it is absent from the startup chunk. The poster fonts, licences, NOTICE and subsetting script are committed.
10. Preview screenshots (mock data only) at 1440×900 of the changed headers, menus and dialog in dark, light and forced-colors, and of both posters in dark and light through the poster route; console clean; reduced motion respected.

## Test plan

- **Rust** (`cargo test`):
  - `get_statistics_export`: all software beyond 20 are included; window-only and background-only software are listed but have `used_days` 0; the 300 s boundary (299 s not counted, 300 s counted); hidden filtering on and off; `days` rows only for nonzero values and in the stated order; range errors equal to `get_statistics_summary`'s.
  - `get_milestone_software`: tier and reached date match `statistics::milestones`; software below 10 h left out; no 30-row truncation; sort tier desc then total focus desc; all-time `used_days`; hidden filtering.
  - `save_binary_export` helpers: header percent-decoding (Chinese names, invalid UTF-8), name sanitising and `.png` appending, the 32 MiB cap boundary, PNG signature check, raw-body requirement.
  - The `gsticon` allowed-origin function: production origin, debug dev origin, other origins and a missing `Origin` header.
- **Vitest**:
  - `dailyPosterModel`: today vs past label, date and weekday strings, one-decimal hours, bar share clamping and zero recorded time, top-3 ranking with ties, runtime fallback, 0 / 1 / 2 / 3 columns, hidden software excluded.
  - `achievementPosterModel`: `2026年11月20日`, tier hero, `使用 N 天`, `累计专注 X 小时`.
  - File names, including stripping invalid characters from software names.
  - The 区间汇总 and 每日明细 CSV builders: columns, ordering, empty ledger cells, used days, BOM-free text with CRLF and the injection guard.
  - `iconToDataUrl`: success, non-ok, wrong content type and timeout return `null` (mocked `fetch`).
  - `saveBinaryExport` calls `invoke` with the raw bytes and the encoded header.
  - The `成就海报` dialog: default selection, keyboard, typeahead, Enter / Esc, double-click, focus return, the disabled key and its tooltip, the hidden switch.
  - The `概览` and `统计` export menus list exactly their items.
- **Manual / preview**: the poster route and the probe screenshots of section "Acceptance criteria" 10, compared side by side with the approved mock PNGs; one real save through the dialog in the built app is left to the user's acceptance pass.

## Docs to update

- `README.md`: posters and the new `统计` CSV files; acknowledge modern-screenshot (MIT), Inter and Noto Sans SC (SIL OFL 1.1) next to the existing acknowledgements; screenshots from mock data only.
- `PRIVACY.md`: posters are written only where the user chooses and show no program paths; the `gsticon` CORS header.
- `DESIGN.md`: the poster layouts, the `成就海报` dialog and the poster fonts.
- `CHANGELOG.md` `## Unreleased` (English entries), `docs/CURRENT_STATE.md`, `memory.md`.
- `AGENTS.md`: the `v0.4.3 additionally includes` block (added with this spec).
