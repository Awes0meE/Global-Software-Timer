# v0.4.2 Date Browsing and Exports Design

Status: binding. All product decisions below (A–J) were approved by the user on 2026-11-24, for version v0.4.2. The previous release spec is `2026-11-22-glass-eink-redesign-design.md` (v0.4.0, shipped; v0.4.1 was a polish release on the same design). The version number stays `0.4.1` on `feat/v0.4.2` until the user approves the release bump.

This spec is written in English; every UI string is given in Chinese exactly as it must appear.

The approved look comes from a throwaway mockup outside this branch, which is not committed and is not production code: the worktree `.worktrees/v042-mock` (uncommitted diff plus the untracked `src/components/HeaderControls.tsx`, `HeaderControls.css`, `DayCalendar.tsx`). Its screenshots, including the sheets `header-keys.png`, `calendar-variants.png`, `export-menus.png` and `background-screen.png`, live in the session scratchpad outside the repository. Port the look; rewrite the code to production quality (the mock was quick and dirty and used mocked data). Where this spec and the mock disagree, this spec wins.

## Goal and scope

Let the user look at a past day on `概览` and `后台`, and take their data out of the app in plain files they choose to save. Tidy the page header at the same time.

| Do | Do not |
| --- | --- |
| Date browsing on `概览` and `后台` with a calendar popover | Change tracking, the schema (still schema 3), metrics or their definitions |
| The same calendar for the `统计` custom range | Persist the viewed date |
| Page-specific CSV exports, settings export/import (JSON), full data backup | Posters (`日报海报`, `成就海报`), `统计` daily-detail CSV and range-report PNG, `成就` export, `从备份恢复` |
| Remove every `更多` button; raised glass header keys | Placeholder or disabled (`未开放`) buttons in headers |
| A taller `后台` e-ink strip | New Settings customisation options (主题色, 透明度, ...) |
| Native save/open dialogs run in Rust; files are written only where the user chooses | Network access, telemetry, admin rights, automatic writes to any folder |

## A. Page header

1. **No `更多`.** Remove the header `更多` button on every page, and the in-panel `更多` buttons of `今日分布` (`TodayMix`) and `正在运行` (`RecentActivity`). Headers no longer carry placeholder or disabled (`未开放`) buttons of any kind.
2. **Raised Mica-glass keys.** Header controls are tactile raised keys in the same family as the selected nav key (`.nav-key`, `--nk-*` tokens) and the Settings 3D sliding toggles: they look pressable, sink when pressed, and keep the `--glass-2` / `--edge` surface (no `backdrop-filter`, per the v0.4.0 glass cap). No single-side accent bars. They must read correctly in dark, light and forced-colors themes; in forced-colors they use system colours and an inset `outline` like the other key-like controls. Transitions follow `prefers-reduced-motion`.
3. **Date control** (`概览` and `后台` only): one grouped key `[‹ 前一天][calendar icon, date "YYYY-MM-DD 周X", chevron][› 后一天]`.
   - `›` is disabled when the viewed day is today; `‹` is disabled at the data start date (and when there is no data yet).
   - When the viewed day is not today, a separate `今天` key appears to the right of the group and jumps back to today.
   - No caption text anywhere around it.
   - Aria: the group is labelled `查看日期`; the step keys `前一天` / `后一天`; the date key announces the full date and that it opens a calendar.
4. **Calendar popover** (revised by the user on 2026-11-24: a plain date picker, superseding the earlier variant B heat shading). Clicking the date key opens a popover whose whole surface is the e-ink screen, containing:
   - `react-day-picker@10.0.2`, pinned to that exact version (MIT). Do not import its stylesheet; style everything ourselves.
   - zh-CN locale (`import { zhCN } from "react-day-picker/locale"`), weeks start on Monday.
   - A caption key `2026年11月` that switches to a month/year view of the same popover height, and `‹` `›` month keys (Chinese aria labels such as `上个月` / `下个月`, `上一年` / `下一年` in the month view).
   - The surface: the popover itself is the e-ink paper (`.paper`: the dark theme's `--eink-paper` gradient, 105deg `#1f2d40` → `#281f40` → `#401f40`; the light theme's `#fafaf7` paper), with the paper grain and finish. There is no glass or black frame around a separate inner screen panel: the day grid sits directly on that surface, and the caption and month keys sit on it too, legible in both themes.
   - A plain date picker with no per-day data: no heat shading, no record dots, no dashed future cells (the activity heatmap lives on the `成就` page). Days are pixel digits in `--eink-ink`.
   - Day states, and only these: today = a 1px ink frame; selected = solid ink fill with a paper-coloured digit; selectable outside-month days = `--eink-mid` (the one exception to `--eink-mid` being graphics-only); disabled days (after today, before `data_start_date`) = about 28% ink; hover = a faint ink tint; a focus-visible ring.
   - The popover is pixel-snapped to whole device pixels (the mock's `usePixelSnap`) so the pixel font stays crisp at 100% / 125% / 150%.
   - Esc or an outside click closes it and returns focus to the date key. Full keyboard navigation comes from react-day-picker. All aria labels are Chinese.
   - In forced-colors, today, selected and disabled days (and a range's middle) stay distinguishable with system colours.
5. **Viewed date state.** The viewed date is held in `App` state, shared by `概览` and `后台`, and never persisted: an app restart returns to today.
   - While viewing today, the pages stay live (polling as now) and follow midnight to the new day.
   - While viewing a past day, the pages stay on that day; page data is not polled live. The sidebar `正在记录` lamp keeps its live value.
   - If the backend answers `day_invalid_date`, the frontend resets the viewed date to today.

## B. Statistics custom range

Replace the native `<input type="date">` pair of the `统计` `自定义` range with a `RangeControl` key that opens the same calendar in react-day-picker range mode: two clicks pick start and end; the same plain e-ink date picker as A.4, with the range's ends in solid ink and its middle days on a faint ink tint band (running across the gaps within a week; outside-month middles in `--eink-dim`, since `--eink-mid` on the band falls under 3:1 on the dark paper). The range is bounded by the data start date and today.

## C. Export keys

Labels are exact. Icon: lucide `FileDown` unless noted.

- A page whose export has a **single format** shows a key **without** caret or menu: label + a small format tag (for example `CSV`). Clicking saves directly.
- A page with **several items** shows a caret and opens a glass menu: each item is icon + title + format tag, keyboard focusable, no sentences.

| Page | Key | Content in v0.4.2 |
| --- | --- | --- |
| `概览` | `导出日报` | single format `CSV` (the `日报海报` PNG comes later; do not show it now) |
| `软件` | `导出软件清单` | `CSV` |
| `后台` | `导出后台记录` | `CSV` of the viewed day |
| `统计` | `导出报表` | `CSV` = 区间汇总 only (single format, no menu) |
| `成就` | none | no export key in v0.4.2 |
| `时间轴` (unavailable page) | none | no key |
| `设置` | `迁移与备份` (lucide `ArchiveRestore`) | menu: `导出设置` [`JSON`], `导入设置…` (no tag), separator, `备份全部数据` [`DB`]. `从备份恢复` is not in v0.4.2 |

## D. Saving files

- The native save and open dialogs run in Rust through `tauri-plugin-dialog`, pinned to an exact version published at least two weeks before 2026-11-24. `blocking_*` dialog calls are used only inside async commands or `spawn_blocking`, never on the main thread. The frontend gets no dialog or file-system permission.
- The default folder is the user's Downloads folder. The app writes only to the path the user picked.
- Suggested file names:

| Export | File name |
| --- | --- |
| 日报 | `GST-日报-YYYY-MM-DD.csv` (viewed day) |
| 软件清单 | `GST-软件清单-YYYY-MM-DD.csv` (today) |
| 后台 | `GST-后台-YYYY-MM-DD.csv` (viewed day) |
| 统计 | `GST-统计-START至END.csv` |
| 设置 | `GST-设置-YYYY-MM-DD.json` |
| 备份 | `GST-数据备份-YYYY-MM-DD.db` |

- After a successful save: a glass toast `已保存` with a `在文件夹中显示` key. That key asks Rust to run `explorer /select,<path>`, which Rust does only for a path saved in this app session. The toast auto-hides after about 6 s.
- Cancel: nothing happens. Failure: toast `保存失败`.
- No network.

## E. CSV format

- UTF-8 with BOM, CRLF line ends, RFC 4180 quoting.
- Formula-injection guard: prefix `'` to any cell that starts with `=`, `+`, `-`, `@`, TAB or CR.
- Durations are hours with 2 decimals (`"5.40"`); column names carry units.
- No program paths in any export.
- The frontend builds the CSV text (without BOM); `save_text_export` prepends the BOM when writing.

| File | Columns |
| --- | --- |
| 日报 | `日期`, `软件名称`, `进程名`, `当日运行(小时)`, `当日活跃(小时)`, `累计运行(小时)`. Rows = the rows the overview table shows for that day (hidden software excluded, like the UI). |
| 软件清单 | `软件名称`, `进程名`, `分组` (`特别关注` / `隐藏` / `已发现`; each identity once), `状态`, `最近打开`, `今日前台(小时)`, `今日后台(小时)`, `今日专注(小时)`, `累计前台(小时)`, `累计后台(小时)`, `累计专注(小时)` |
| 后台 | `日期`, `软件名称`, `进程名`, `峰值进程数`, `峰值内存(MB)`, `后台时长(小时)`, `CPU 时间(秒)`. Never current CPU or status, so every day's file has the same columns. |
| 统计 区间汇总 | One row per software as the page's ranking and ledgers show it for the chosen range, respecting `包含隐藏软件`. Columns derive from `StatisticsSummary`: name, process, foreground / focus / background hours, used days, sessions, and `开着没用` hours where available. The range goes in the file name; no title rows. |

## F. Settings file (JSON)

```json
{
  "kind": "gst-settings",
  "schema": 1,
  "app_version": "0.4.1",
  "exported_at": "<RFC 3339>",
  "settings": { "theme": "...", "duration_format": "...", "close_behavior": "..." },
  "focused": [{ "identity_key": "...", "display_name": "...", "process_name": "..." }],
  "hidden": [{ "identity_key": "...", "display_name": "...", "process_name": "..." }]
}
```

- Excludes autostart, any usage history and program paths.
- **Import flow:**
  1. Rust open dialog. Size cap 1 MB (`settings_import_too_large`). Validate `kind` and `schema` (`settings_import_invalid`); ignore unknown fields.
  2. Build a preview: each changed setting old → new; focused +N; hidden +N; unmatched N; conflicts N. Store it in `AppState` under an import id.
  3. The frontend shows a glass confirm dialog listing those facts as rows (no sentences beyond the facts), with `导入` / `取消`.
  4. Apply merges the lists and never removes local entries. Matching: `identity_key` first, then `process_name` case-insensitively among known identities; unmatched entries are skipped; an identity that is already on the opposite list locally is skipped as a conflict. Settings and list changes are written in one transaction.
  5. The UI then reloads settings, theme and lists.
- An unknown or already-used import id answers `settings_import_expired`.

## G. Full data backup

`备份全部数据`: Rust save dialog → `VACUUM INTO` a temporary file in the chosen folder, then rename it over the target. The README documents a manual restore (quit GST, replace the database file). No restore UI in v0.4.2.

## H. Past-day behaviour (viewed date != today)

### Backend

- `get_dashboard_summary(date?: "YYYY-MM-DD")` and `get_background_page_summary(date?)` take an optional date. Missing or equal to today → the live path. Future or malformed → error `day_invalid_date`. Dates before the data start return empty summaries.
- Day bounds come from `local_date_bounds_in` (DST-safe). Today's path also switches off `local_day_start_utc`'s `.single()` fallback onto the same bounds.
- Both summaries return `usage_date` (the requested day) and `is_today`.
- Dashboard, past day: `until` = the end of that day; no live statuses (every app is not running); `累计` = totals clipped to the end of that day; apps are listed only if they ran or were active that day.
- Background, past day: stored rows only, no live overlay; `process_count` = peak, memory = peak, `cpu_percent` = null, `is_running` = false.
- New read-only command `get_calendar_summary` → `{today, data_start_date}`: the calendar's bounds only (revised 2026-11-24: no per-day list and no threshold, because the calendar no longer shades days). `App` reads it when the day changes.

### `概览`, past day

- Dial: every tick is inked, no pointer, no `今日已过 HH:MM`; the centre shows weekday and day (`周二` / `17日`).
- Labels `今日记录` / `今日活跃` → `当日记录` / `当日活跃`; the `最常用` note → `当日活跃 X`.
- Table: column `今天` → `当日`; the `状态` column → `当日活跃`. The panel count counts the listed apps.
- The `正在运行` panel is hidden and `当日分布` (renamed from `今日分布`) fills the right rail.
- Empty states: `这一天没有记录到软件` / `这一天没有活跃记录。`

### `后台`, past day

- The e-ink strip shows 4 readings: `当日 CPU 时间`, `当日出现`, `当日后台时长`, `峰值内存`.
- The table hides the `当前 CPU` and `状态` columns. `进程数` → `峰值进程数` (sortable on the peak), `内存` → `峰值内存`, `今日后台时长` → `当日后台时长`, `今日 CPU 时间` → `当日 CPU 时间`. If the sort key was a hidden column, fall back to the default sort.
- Empty state: `这一天没有后台记录。`
- The `后台进程` HelpPopover text becomes date-neutral.

## I. `后台` e-ink strip

Today uses approved variant B, `加高屏幕`: a taller screen (about 104–112px) that keeps the 36px pixel digits (and the existing 125% / 150% sizes), with relaxed label/digit spacing. A past day uses the same height with 4 cells.

## J. Not in v0.4.2

Posters (`日报海报`, `成就海报`), `统计` `每日明细` CSV and `区间报告` PNG, `成就` export, `从备份恢复`, new Settings customisation options (主题色, 透明度, ...). The version number stays `0.4.1` in this branch; the release bump happens later with the user's OK.

## API contract

Backend and frontend tasks must match this exactly.

### Rust commands (registered in `src-tauri/src/lib.rs`)

| Command | Returns | Errors |
| --- | --- | --- |
| `get_dashboard_summary(date: Option<String>)` | `DashboardSummary`: existing fields + `usage_date` (the requested day) + `is_today: bool` | `day_invalid_date` |
| `get_background_page_summary(date: Option<String>)` | `BackgroundPageSummary`: existing fields + `usage_date: String` + `is_today: bool` | `day_invalid_date` |
| `get_calendar_summary()` | `CalendarSummary { today: String, data_start_date: Option<String> }` (revised 2026-11-24: the `days` list and `streak_threshold_seconds` are removed) | |
| `save_text_export(suggested_name: String, filter_name: String, extension: String, contents: String)` | `Option<String>`: the saved path, `None` if cancelled. Writes UTF-8 with BOM | |
| `reveal_saved_file(path: String)` | `()`; only for a path saved by this app session | `export_unknown_path` |
| `export_settings_file()` | `Option<String>` | |
| `pick_settings_import()` | `Option<SettingsImportPreview { import_id: String, changes: Vec<SettingChange { key: String, from: String, to: String }>, focused_added: u32, hidden_added: u32, unmatched: u32, conflicts: u32 }>` | `settings_import_invalid`, `settings_import_too_large` |
| `apply_settings_import(import_id: String)` | `SettingsImportResult { focused_added: u32, hidden_added: u32, unmatched: u32, conflicts: u32 }` | `settings_import_expired` (unknown id) |
| `backup_all_data()` | `Option<String>` | |

`day_invalid_date` covers a malformed or future date.

### TypeScript (`src/api.ts`)

`getDashboardSummary(date?: string)`, `getBackgroundPageSummary(date?: string)`, `getCalendarSummary()`, `saveTextExport(args)`, `revealSavedFile(path)`, `exportSettingsFile()`, `pickSettingsImport()`, `applySettingsImport(importId)`, `backupAllData()`, with matching interfaces (snake_case fields, as serialized). Invoke arguments use the camelCase keys Tauri v2 expects (`suggestedName`, `filterName`, `importId`).

### UI preview mock

`scripts/ui-preview/tauri-core.ts` and `mock-data.ts` answer every new or changed command with sensible demo data:

- the calendar summary with `data_start_date` 2026-09-03 and the virtual today;
- past-day summaries derived from the mock;
- export commands resolve to a fake path like `C:\Users\demo\Downloads\<name>` and never touch the disk.

## Privacy

- Files are written only to the path the user picks in the native dialog; nothing is written automatically, and nothing leaves the machine.
- Exports never contain program paths. The settings file holds only the three settings and the focused/hidden lists (identity key, display name, process name); no autostart, no usage history.
- The backup is a full copy of the local database, so it contains the whole usage history; `PRIVACY.md` says so.
- `reveal_saved_file` opens Explorer only for a path this app session saved.
- Still no window titles, document names, web page titles, keystrokes, mouse coordinates, file contents or browser history; no telemetry, no admin rights.

## Acceptance criteria

1. `npm.cmd run check` passes (vitest, `tsc --noEmit`, build, `cargo test`, `cargo clippy --all-targets -- -D warnings`). New behaviour has tests: date parsing and `day_invalid_date`, past-day dashboard and background summaries (DST day included), calendar summary, CSV quoting / BOM / CRLF / injection guard, settings import validation, merge, conflicts and expiry, backup to a temporary path.
2. No page header and neither `今日分布` nor `正在运行` renders a `更多` button; no header renders an `aria-disabled` placeholder.
3. Past days on `概览` and `后台` show the wording, columns and empty states of section H; today stays live and follows midnight; an app restart opens on today.
4. Calendar: Monday-first zh-CN plain date picker on the e-ink surface with no per-day data, today / selected / disabled / outside-month / hover / range states, keyboard navigation, Esc and outside click return focus to the date key, crisp pixel text at 100% / 125% / 150%.
5. Every export writes only where the user chose, with the file names of D and the columns of E; cancel does nothing; failure shows `保存失败`.
6. Preview screenshots (mock data only) of every changed page and popover in dark, light and forced-colors at 1440×900; console clean; reduced motion respected.
7. `package.json` pins `react-day-picker` to `10.0.2`; `Cargo.toml` pins `tauri-plugin-dialog` to an exact version published at least two weeks before 2026-11-24. Schema is still 3.

## Docs to update

- `README.md`: date browsing, exports, settings import/export, backup and the manual restore steps; add react-day-picker (MIT) next to the Ark Pixel acknowledgement; retake affected screenshots from mock data only.
- `PRIVACY.md`: user-chosen files only, export contents, the backup containing full history.
- `DESIGN.md`: header keys, calendar popover, export menu, toast, taller `后台` strip.
- `CHANGELOG.md` `## Unreleased` (English entries), `docs/CURRENT_STATE.md`, `memory.md`.
- `AGENTS.md`: the `v0.4.2 additionally includes` block (added with this spec).
