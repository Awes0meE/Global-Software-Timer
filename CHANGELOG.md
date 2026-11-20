# Changelog

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
