# Changelog

## Unreleased

- The last explanatory small print is gone. The sidebar drops `本地软件时长记录` and `数据只保存在本机`; `设置` → `数据存储` still reads `仅本机`. The rows in `设置` show only their titles. Empty lists show only their one-line title, without the hint below it. The first-close dialog keeps a single line, `GST 在状态栏里运行时才会记录，退出后就不再记录。`, so you know that exiting stops the recording. The two warnings in the `从备份恢复` dialog and the privacy note at the bottom of `设置` stay.
- The database shrinks from about 200 MB to a few MB on a long-used install. Versions up to v0.1.x logged a heartbeat event for every running app on every scan. Nothing reads that log, and the sessions keep their own heartbeat. The first start of this version removes those rows and compacts the file, which takes about two seconds on a six-month database. It first saves a full copy as `backups\GST-清理前-<date>-<time>.db` in the data folder, and only the newest such copy is kept. If the copy cannot be made, nothing is removed. Upgrade backups, `备份全部数据` and `从备份恢复` all get faster with the smaller file. Restoring an older backup brings the rows back, and the next start removes them the same way.
- `概览` refreshes about four times faster: on a six-month database its 5-second summary took 44 ms and now takes 12 ms. Each software's name, identity and best executable path are now worked out once per software instead of once per recorded session. The last of these checks the disk, so it was the costliest. The numbers shown are unchanged.
- The interface is set in Inter and Noto Sans SC (思源黑体) instead of Segoe UI, Microsoft YaHei UI and Bahnschrift. They are the same bundled font files the posters already use, so the installer does not grow. Both are variable fonts, so titles, software names and table heads now get a true semibold instead of YaHei's only bold, and every weight is one step lighter: titles and names 600, secondary emphasis 500, body 400. Numbers use Inter's tabular digits everywhere. The pixel font on the e-ink screens is unchanged.
- The `今天` lamp under the `统计` trend chart no longer touches its date label.
- E-ink screens now sit an even 8 px inside their panels on every page (they were 8 to 14 px) with 8 px corners, so screen and panel corners share one centre, as Apple's guidelines ask for nested shapes.
- Text outside the e-ink screens uses one size ladder, Apple's macOS steps plus Windows' 14 px body: dialog titles and the trend totals are 17 px (were 18), the `今日分布` total and personal-record figures 26 px (were 30 and 28), milestone tiers 22 px (were 24).
- Chinese titles, table heads and labels are no longer letter-spaced; only Latin capitals such as `CSV` and the version, figures and the `终极成就` plaque keep their tracking.
- Scrolling lists inside panels fade out over their last 16 px where more rows continue past the edge, instead of cutting a row in half; a list that fits, or the end you have scrolled to, has no fade. The `后台` table, with its sticky head, fades only at the bottom. `统计`, `成就` and `设置`, which scroll as a whole page, fade at the top under the page title once you scroll down.
- Commands that ask for more before they run end with an ellipsis, as Apple's guidelines ask: `添加…` on `软件` and `导出成就…` on `成就` open a dialog, and every export that opens the Windows save dialog reads `导出软件清单…`, `导出后台记录…`, `日报海报…`, `当日明细…`, `区间汇总…`, `每日明细…`, `导出设置…` and `备份全部数据…`. Keys that only open a menu (`导出日报`, `导出报表`, `迁移与备份`) keep their name.
- `软件` has one dark primary key: the `添加…` of `隐藏软件列表` is now a light secondary key like the `编辑` beside it.
- Keyboard shortcuts: `Ctrl+1` to `Ctrl+6` open the sidebar's pages in order (the unavailable `时间轴` is skipped), `Ctrl+,` opens `设置`, and `Ctrl+←` / `Ctrl+→` step the day on `概览` and `后台`, stopping where the `‹ ›` keys stop. Text fields and open dialogs keep their keys. The README lists them.
- `设置` → `显示` has `文字大小`: `标准` (the default) or `大`. `大` zooms the whole interface, text, icons and e-ink screens alike, to 125%, as Windows display scaling would, so the pixel digits stay crisp. The smallest window then grows to 1280 × 800 (a smaller window is enlarged), which leaves the layout its usual room, and the sidebar folds into its icons. It applies at once, at startup before the page shows, and after `导入设置…`; settings files carry it, and older files import as before. Apple asks apps to let people enlarge text; GST does it this way because its layout and pixel screens are drawn to fixed sizes.
- The sidebar can fold into a strip of icons: the key to the right of the version under the nav folds and opens it, and pointing at an icon (or tabbing to it) shows the page name. The choice is remembered. When the window is narrower than 1200 px of interface (the smallest window, or 文字大小 大), the sidebar folds by itself; opening it then lasts until the window crosses that width again.
- The sidebar floats as a glass card, inset 10 px from the top and bottom of the window and 12 px from its left edge, with rounded corners and the panels' edge and shadow, so the background glow runs on beneath it. The content panels keep their glass.
- The round `?` help keys keep their 16 px look but react to clicks and hover within 28 px, Apple's default pointer target.

## v0.4.4 - 2026-11-26

- `设置` has two new groups. `外观` holds `主题`, `主题色` and `墨水屏配色`, and `数据` holds `数据文件夹` and `从备份恢复`. `运行` gains `启动时打开`, and `显示` gains `每周起始日` and `减少动画`. The other rows keep their text and behaviour.
- `主题色` offers eight choices: 跟随 Windows, 蓝, 青, 绿, 紫, 玫红, 琥珀 and 石墨.
  - The accent colours the toggles, selected items, the current nav icon, focus rings, text selection and search hits.
  - Every choice except 蓝 also tints the background glow. The tint is a little lighter than in the mockups, so text over the glow stays as readable as before.
  - 蓝 is the default and looks exactly like v0.4.3.
  - 跟随 Windows uses the Windows accent colour, made lighter or darker where needed to keep contrast. When the colour cannot be read it uses 蓝's colours, still with the tinted glow. GST reads it again each time the window is shown.
  - The orange "now" lamps, software colours, warnings and posters stay the same.
- `墨水屏配色` offers five paper and ink palettes for every e-ink screen: 极光 (the default, today's look), 石墨, 夜蓝, 暖纸 and 墨绿. Each has its own light and dark paper. Posters keep their own look.
- `每周起始日` (周一 or 周日) sets the first day of the week in five places: the date-picker calendars, the 统计 `本周` preset, the 成就 heatmap months, the weekly labels on the 每日趋势 recorder, and the 软件 page's `这周X` / `上周X` last-opened text. Weekday names, 工作日 and 周末, CSV exports, posters and the 统计 comparison range do not change.
- `启动时打开` (概览, 软件, 后台, 统计 or 成就) picks the page shown when GST starts: at login, when you open it yourself, or when it restarts after a restore. GST opens straight on that page, without showing 概览 first. Opening the window from the tray keeps the page you left.
- `减少动画` turns motion off even when Windows does not ask for it.
  - Switches, dialogs and notices still change, but instantly. The recording lamp stays lit without breathing.
  - When it is off, the Windows setting applies as before.
- `数据文件夹` → `打开` shows the folder that holds the database in File Explorer. If Explorer cannot open it, you see `无法打开数据文件夹`.
- `从备份恢复` → `选择备份…` restores a full data backup from inside the app. There is no need to replace the file by hand any more.
  - Pick a `.db`, `.sqlite3` or `.sqlite` file. GST checks a copy of it and never touches the current data at this step.
  - A dialog shows the file name, the recorded range, the number of software and the file size. `恢复并重启` then replaces the data and restarts GST.
  - Before the data is replaced, the current data is saved to `backups\` in the data folder as `GST-恢复前-<date>-<time>.db`. The three newest such copies are kept.
  - Backups from older versions are upgraded. A backup from a newer version, a damaged file, or the database GST is using is refused with a message, and nothing changes.
  - After the restart, a notice reads `已从备份恢复`. If the restored data cannot be opened, the original data is kept and the notice reads `恢复没有完成，已保留原来的数据`.
  - If a data file stays locked during the swap (for example by antivirus), GST shows a message and opens nothing until the next start finishes the job. No data is lost.
  - The backup's own settings apply after the restart, startup at login included.
  - A read-only backup file can now be restored as well.
- `导出设置` and `导入设置…` include the five new settings. Older settings files import as before.
- Keyboard and contrast themes:
  - `启动时打开`, `每周起始日`, `主题`, `主题色` and `墨水屏配色` each take one Tab stop. The arrow keys, Home and End move between choices and select them.
  - In Windows contrast themes, the chosen colour or palette has a highlight-colour ring.
  - `选择备份…` is dimmed while the backup is being checked.
- Icons are read only from programs on a lettered local drive. Software that runs from a network share shows its first letter instead of its icon.
- Tracking, metrics and the database schema (still 3) are unchanged. No plugin is added and nothing is fetched from the network. For 跟随 Windows and its swatch, GST reads the Windows accent colour from the registry read-only. The colour is not stored in the database.

## v0.4.3 - 2026-11-25

- Save a day as a share poster: `导出日报` on `概览` is now a menu with `日报海报` (PNG) and `当日明细` (the v0.4.2 day CSV, unchanged). The poster is a 1080×1440 PNG of the viewed day: the date, that day's active time as one large figure under `今日活跃` or `当日活跃`, a bar of active over recorded time with `记录 X 小时` under it, and the day's top three software by active time (by runtime on a day without active time). Hidden software is left out, as on the page.
- Save one software's focus milestone as a poster: `成就` has a new `导出成就` key that opens the `成就海报` dialog, a live preview of the poster next to a list of every software that reached a milestone, highest tier first. The software that reached its tier most recently is selected; ↑, ↓, Home, End and typing a name move the selection, and Enter, a double-click or `保存图片` saves. The poster shows the software's icon and name, its highest tier and the date it was reached, `使用 N 天` and `累计专注 X 小时`. The list follows the page's `包含隐藏软件` switch; while no software has a milestone the key is dimmed and its tooltip reads `暂无里程碑`.
- Posters follow the app's current light or dark theme on an opaque painted glow, and show software names, icons, hours, days and dates only, never program paths or process names. They are set in Inter and Noto Sans SC (思源黑体), bundled with the app as subsets and used only for posters; the app's own fonts are unchanged. Icons come from the local icon cache; a software without one gets its first letter on a tile. The PNG carries no DPI tag, so Word and PowerPoint place it at its pixel size.
- `导出报表` on `统计` is now a menu. `区间汇总` lists every software with focus, window or background time in the range instead of only those on the three lists, adds `后台(小时)` and `使用天数` (days with at least 5 minutes of focus; window-only or background-only days do not count), and puts ranked software first in `排名` order. The new `每日明细` CSV has one row per day and software with that day's focus, window and background hours. Both follow the range and the `包含隐藏软件` switch.
- Posters are saved through the same Windows save dialog and `已保存` / `保存失败` notice as the CSV files. The notice now shows above an open dialog, so a failed save stays readable while the poster dialog stays open, and the first-close dialog can open over the poster dialog. In Windows contrast themes a dialog's primary key is drawn in the highlight colour.
- Tracking, metrics and the database schema (still 3) are unchanged, and nothing is fetched from the network. Posters are drawn by modern-screenshot 4.7.0 (MIT), loaded only when a poster is exported; Inter and Noto Sans SC are licensed under the SIL Open Font License 1.1, with their licence texts in `src/assets/fonts/poster/`.

## v0.4.2 - 2026-11-25

- Look at a past day on `概览` and `后台`. The page header has a date key group (`‹ 前一天`, the date, `› 后一天`) whose date key opens a calendar; a `今天` key appears while a past day is shown. A past day is a read-only view of what was stored: the readout and table read `当日记录`, `当日活跃` and `当日`, the `正在运行` panel is hidden and `当日分布` fills the right rail, and `后台` shows that day's peak process count and memory instead of current CPU and status. The viewed day is not saved, so the app opens on today again after a restart; today's view stays live and follows midnight.
- The calendar is a plain date picker printed on an e-ink screen: Monday first, a month view behind the `2026年11月` caption, and only today, the selected day, other-month days and days outside the recorded range (after today or before the first record) marked. The `统计` custom range now opens the same calendar in range mode instead of two date boxes.
- Export from the page header: `导出日报` on `概览` and `导出后台记录` on `后台` save the viewed day, `导出软件清单` on `软件` saves every software once under 特别关注, 隐藏 or 已发现, and `导出报表` on `统计` saves one row per software for the chosen range, following the `包含隐藏软件` switch. The files are CSV (UTF-8 with BOM, durations in hours with two decimals) and hold no program paths; a cell that a spreadsheet could run as a formula gets a leading `'`.
- `设置` has a `迁移与备份` menu: `导出设置` saves the theme, duration format and close behaviour you chose plus the 特别关注 and 隐藏 lists as JSON; `导入设置…` shows what a settings file would change and adds to the lists without removing anything; `备份全部数据` saves a full copy of the database. There is no restore button yet; the README describes how to restore a backup by hand.
- Every file goes through the Windows save dialog, which opens in Downloads, and is written only to the path picked there, through a temporary file so a failed save never leaves a half-written file. A saved file shows an `已保存` notice with `在文件夹中显示`; cancelling does nothing and a failure shows `保存失败`.
- The header and the `今日分布` and `正在运行` panels no longer have `更多` buttons, and headers carry no unavailable placeholder keys. Header keys are raised keys like the selected sidebar item.
- The `后台` e-ink strip is taller, with more room between labels and digits.
- Tracking, metrics and the database schema (still 3) are unchanged. The calendar uses react-day-picker 10.0.2 (MIT); the native dialogs use tauri-plugin-dialog 2.7.3.

## v0.4.1 - 2026-11-24

- The selected sidebar item is now a raised key instead of a side bar, and the sticky heads of the 特别关注 and 后台 tables are a raised key strip that no longer sinks into near-black in the dark theme.
- The 后台 summary is now an e-ink strip of six pixel readings: 正在后台运行, 进程, 当前合计 CPU, 当前合计内存, 今日 CPU 时间 and 今日出现, all from data the page already had.
- The achievements heatmap gives every month the same width, and its streak and range readings and legend move to a strip along the bottom of the screen.
- Removed the explanatory small print across the app: under the overview readings and the 今日分布 total, on the 后台, 统计 and 成就 pages, and under each row of the hidden software list. Where an explanation is still needed, a ? bubble beside the title now holds it (隐藏软件列表, 后台进程, 开着没用, 作息); the counting rules for the 统计 and 成就 figures are in the README metrics table.
- The 统计 page now shows 作息 right after 每日趋势, and 会话 last.
- The 今日分布 bar segments are drawn flat without the dark-theme glow, so bright and dark segments are the same height. This reverses the v0.4.0 design decision to give each segment a glow of its own colour in the dark theme.
- The 每日趋势 recorder loses the roller strips at both ends; the 今日活跃 legend key now matches the dial's inner ring.
- In the light theme, software icons get a thin outline that follows each icon instead of a grey well, so white icons stay visible.
- Fixes: the heatmap's row rule runs the full width when the last row of months is short; pixel readings on the 后台 strip and the heatmap stay sharp at 125% display scaling and their labels are no longer clipped; contrast themes drop the raised key's sheen, rule the 后台 head off from its rows and drop the light icon outline. Data, schema and metrics are unchanged.

## v0.4.0 - 2026-11-24

- Redesigned the whole app as a Mica-like glass shell with matte e-ink screens for the readouts, in both light and dark themes. Nothing about the data, metrics or layout changes.
- The overview dial gains 96 quarter-hour ticks; the two large overview readouts keep a faint ghost of the previous value; the ghost clears when the day changes or a reading drops.
- Panels turn opaque when Windows transparency effects are off (applied the next time the window is shown), when reduced transparency is requested, or when blur is unsupported; high-contrast themes keep text and focus rings visible. GST reads the Windows transparency effects setting only to choose how panels look; it is not stored.
- Signal orange now marks only what is happening now; selection and focus use a blue accent, and errors and warnings use their own red.

## v0.3.1 - 2026-11-22

- Recorded a local timeline of focus and activity segments, and of when each software had a window, in the new `timeline_segments` and `timeline_window_spans` tables (schema version 3); nothing in the UI changes yet.
- Databases upgraded to schema 3 cannot be opened by v0.3.0 or earlier.

## v0.3.0 - 2026-11-22

- Opened the `统计` page. Pick 近 7 天 (default), 本周, 本月, 近 30 天, 今年 or a custom range of up to 366 days; every total is compared with the previous range of the same length.
- Drew daily recorded and active time as a paper-strip recorder chart, with the active ratio as a trace and the daily average active time as a dashed rule.
- Ranked software by focus time in the range and marked 新上榜, rises and falls. `开着没用` lists software whose window was open for at least 5 hours but focused for under 5% of that time; tray and background time do not count.
- Added per-software sessions (opens, average and longest) and a rhythm panel: weekday and weekend average active time, average tracker uptime, and the median first and last record time.
- Days recorded before per-software detail began are marked 无软件明细; they are left out of software figures instead of counted as zero.
- Opened the `成就` page. An LCD month-by-month activity heatmap covers the last 90 days, half a year or a year, next to the current and longest streak.
- Days with under 5 active minutes count as 没用, so switching the computer on for a moment is not recorded as use. The page only records: no targets, countdowns, streak reminders or notifications.
- Added personal records (longest active day, longest focus day for a single app), focus-time milestone plates at 10, 50, 100, 500 and 1000 hours plus a 6666-hour ultimate milestone, and software comings and goings over the last 30 days. Software with under a minute of total window time, such as installers, is left out of comings and goings.
- Both pages leave hidden software out by default and offer a 包含隐藏软件 switch; machine-wide totals are unaffected. Both read existing local data only, without schema or tracking changes.
- The unfinished single-day date button in the page header now appears only on `概览` and `后台`; `软件`, `统计`, `成就` and `设置` no longer show it.

## v0.2.4 - 2026-11-21

- Hide more noise from 已发现软件 and the tracked runtime: always-on services (SQL Server, Wacom, Bonjour, Office Click-to-Run, FlexNet, ASUS GameSDK, Microsoft Gaming Services), helpers next to tracked apps (BitDock, Eternal, MATLAB, SolidWorks, Sogou, WPS), command-line tools started by other programs (git, rustup, Codex runtimes), and installers run from Temp, Downloads or an updater folder. The 后台 page still lists them and stored history is unchanged.
- Read executable icons at their largest embedded size (up to 256px) and scale them to a shared 96px, so they stay sharp at 125% and 150% display scaling. Restore the straight alpha that Windows drawing premultiplies, which had darkened antialiased icon edges, and keep the black outlines of legacy icons that have no alpha channel.
- Serve icons through a local `gsticon` protocol instead of embedding them in every summary refresh, and keep them on disk between restarts. Icons appear as soon as they are read rather than on the next refresh; software without an icon keeps its initial.
- Sort the 后台 table by clicking a column header. The first click sorts high to low and the next one reverses it; rows without a value stay at the bottom. The default order is still today's CPU time.
- Keep the 今日活跃 help bubble in the 特别关注 table fully visible: it opens above the button when there is no room below and stays inside the window while the table scrolls.
- Update `serde_with`, which Tauri depends on, from 3.20.0 to 3.21.0 to resolve advisory GHSA-7gcf-g7xr-8hxj. Neither Tauri nor this app uses the affected `KeyValueMap` serializer, so behavior is unchanged.

## v0.2.3 - 2026-11-21

- Hide the NVIDIA Overlay, AsHotplugCtrl, Razer Synapse Service Process and BitCenter helpers by default, so their runtime recorded by v0.1.4 no longer heads the overview. Their main apps stay tracked, the 后台 page still lists the helpers, and stored history is unchanged.
- Choose 最常用 from today's active time, falling back to today's runtime, instead of all-time runtime, so an always-running tray app no longer wins. The note under it shows the figure used.
- Show seconds or minutes for small CPU times on the 后台 page instead of `0.0小时` or `0分钟`.
- Preload the LCD pixel font so the readout does not briefly render in the fallback font.
- Set an explicit icon on the Start menu shortcut and taskbar pin during installation and notify Windows, so the taskbar shows the current clock icon after an in-place upgrade.

## v0.2.2 - 2026-11-21

- Split the initial frontend bundle and read the latest completed sample independently of ongoing scans. Software rows outside the viewport defer layout and painting.
- Use the detailed desktop clock for Windows taskbar and launcher icons in ten resolutions. The notification area retains its small-size artwork.

- Distinguish loading, read errors and empty results on the overview and background pages. The sidebar now reports the latest tracking scan and the running list identifies tray apps.
- Keep package names and icons stable across scan order, retry failed icon reads, recover from a failed scan and recognize the main window across installation paths.
- Align background metrics with the selected duration format, label peak memory for exited apps and improve keyboard access to scrollable lists.
- Run native QA against a private SQLite snapshot, including committed WAL data.

## v0.2.1 - 2026-11-21

- Count Microsoft Edge runtime when a taskbar window opens on a process launched by startup boost. A preloaded browser without a confirmed window, Chromium child processes, and embedded WebViews remain background helpers.

## v0.2.0 — UI 分支版本，随 v0.2.1 首次公开发布

- Redesigned the desktop UI as a desk instrument: aluminium/graphite panels, keycap navigation, indicator lamps and an aligned software ledger.
- Added a dot-matrix LCD readout for today's recorded time, active time and most-used software, set in the bundled Ark Pixel 12px font (SIL OFL 1.1), with a segmented 24-hour dial.
- Added light and dark themes; Settings offers 跟随系统 / 浅色 / 深色 (default follows Windows), saved locally as `ui.theme`, and the native title bar follows the theme.
- Redrew the app mark as a skeuomorphic clock and regenerated the app, installer and tray icons from it.
- Moved the unavailable 日期 and 导出 controls from the bottom bar into the page header.
- Fixed the add-software dialog focus trap to follow document order.
- Added a browser-only UI preview with synthetic data (`npm run preview:ui`).
- Load native icons in the background on the dashboard, software and background pages. Keep the v0.1.5 tracking and database schema.
- Fixed rapid theme changes, header tooltip clipping, narrow-window duration wrapping and light icon contrast; revised navigation spacing, settings layout and the small tray mark.

## v0.1.5 - 2026-11-20

- Recorded tray apps: an app showing a notification-area icon now counts as running (`托盘运行`) like a windowed app. Detection uses the Windows 11 tray registry and the user's session; Windows 10 keeps the previous behavior.
- Added the `后台` page: third-party processes with neither a window nor a tray icon, grouped by software, with live CPU/memory and today's background time and CPU time. Child processes of apps the user can see stay with that app. Data is stored in the new `daily_background_usage` table (schema version 2).

- Counted only taskbar-style app windows as `前台运行`; overlays, docks, tool and hidden host windows (for example NVIDIA Overlay, Razer, BitDock) are no longer credited as foreground runtime. UWP frame windows and the UWP foreground window are attributed to the hosted app.
- Fixed Chromium/Electron helper detection, which never ran because process command lines were not loaded; any `--type=` child (ChatGPT, Discord and similar) is now a background helper. Command lines are only checked in memory.
- Kept one software identity across updates: packaged apps group by package family, and version or hash install directories are ignored. Existing per-version identities, aggregates and focused/hidden marks are folded together at startup.
- Kept original executable casing in display names (`ChatGPT`, not `chatgpt`).
- Stopped dropping the sub-second part of every tracker tick, which undercounted daily totals by 1-6%.
- Moved commands off the UI thread, removed per-session filesystem checks from summaries, added a SQLite busy timeout, and recovered poisoned locks.
- Read only the PE header for icon checks and made alpha-less legacy icons visible.
- Replaced startup panics with an error dialog, and made a second launch show the running window.
- Stopped re-enabling startup at login when saved settings cannot be read.

## v0.1.4 - 2026-11-17

- Prevented long scan gaps and clock rollback from inflating session and daily time; credited counters now split at local midnight.
- Removed new heartbeat event rows, deduplicated per-executable heartbeats, and made scans/ticks atomic with in-memory rollback.
- Added normal-exit session closure and versioned transactional schema migration with forward-version rejection.
- Moved summary reads to an independent read-only connection and removed query-time identity writes while preserving historical totals.
- Paused hidden-page polling, refreshed visible software totals, and prevented stale software responses from undoing list mutations.
- Stopped release staging on failed checks/builds and added release-script regression checks to local and CI gates.
- Set metadata/sidebar to 0.1.4; release installers are built and hashed by the verified Windows workflow.

- Reconciled documentation and project memory with the code, documented metric semantics and remaining reliability work, and aligned development commands and branch naming.
- Added a Settings switch for global Chinese duration display: default decimal hours or concrete hours/minutes.
- Improved default noise filtering for ASUS Armoury Crate helper processes and NVIDIA container background processes while keeping the main Armoury Crate app visible.
- Added a strict local development workflow with reusable check and release-build scripts.
- Upgraded the Vite/Vitest/jsdom frontend toolchain, clearing the npm audit findings checked on 2026-06-18. On 2026-11-17, local audit could not reach the registry and Windows CI's dependency installation reported 7 vulnerabilities (2 moderate, 5 high); compatible lockfile updates resolved these findings and the release audit reports zero vulnerabilities.
- Documented the non-Windows `glib` Dependabot alert and upstream Tauri dependency constraint observed on 2026-06-18; current advisory status needs an online recheck.

## v0.1.3 - 2026-06-05

- Bumped app metadata and the sidebar version display to `V0.1.3`.
- Added the `软件` page with focused software, hidden software, discovered software, and local search.
- Added software-page foreground/background runtime split for focused software rows.
- Added software-page focused active time based on the foreground Windows-focused software identity, without changing overview active-time semantics.
- Added hidden software filtering for default dashboard summaries while preserving local raw history.
- Fixed last-opened time formatting so tests and UI helpers are deterministic across machine time zones.

## v0.1.2 - 2026-06-04

- Added a Settings page while keeping the existing left navigation layout.
- Added startup-at-login control, enabled by default through the current-user autostart mechanism.
- Added a Settings control for close-window behavior: minimize to tray or exit directly.
- Kept the first-close choice dialog, now saving the user's choice automatically and noting that it can be changed later in Settings.
- Preserved the privacy model: no telemetry, no network upload, no administrator permission for startup at login, and no window-title/document-title/webpage-title collection.

## v0.1.1 - 2026-05-31

- Improved default filtering for installer, package-manager, sandbox, toolchain, and background helper processes.
- Stabilized dashboard runtime status after one day of local validation on Windows.
- Refined app grouping and icon lookup for WPS Office, Codex, and packaged Windows apps.
- Kept the privacy model unchanged: local-only storage, no telemetry, no window-title/document-title/webpage-title collection.

## v0.1.0 - 2026-05-30

- Initial Windows-first release of Global Software Timer.
- Added tray-based background tracking, local SQLite storage, runtime sessions, active computer time, and the Steam-like dashboard.
- Added privacy documentation, contribution materials, CI, and Windows release bundles.
