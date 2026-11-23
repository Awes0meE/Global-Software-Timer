# Project Memory

Last updated: 2026-11-24

## Product Decisions

- Product name: Global Software Timer.
- `GST` is an accepted shorthand for Global Software Timer in project discussions and docs.
- Chinese UI name: 全局软件计时器.
- v0.1 platform: Windows 10/11 first.
- Later platform direction: a native SwiftUI/AppKit macOS app, then mobile companion apps. The 2026-06-15 native capture PoC is archived under `MACOS/native-capture-poc/`; it is reference material, not production macOS support. Physical keyboard/mouse idle-reset validation remains open.
- v0.1 shape: system tray app, background tracking, dashboard on demand.
- UI direction (2026-11-22 glass and e-ink redesign for v0.4.0, replacing the 2026-11-20 desk-instrument look of v0.2.1): e-ink instruments in Mica-like glass. A soft colour glow is painted once behind the window; the sidebar and each page's top-level panels are one layer of translucent glass (at most 6 blurred layers per page, never nested; sub-plates use translucent fills only, popovers and dialogs are opaque). Readouts sit on recessed matte e-ink screens (light: near-white paper; dark: a blue-violet gradient paper) with fine grain and no glow; their text and numbers use the bundled Ark Pixel 12px font (OFL, `src/assets/fonts/`), which appears only inside e-ink screens. The 24-hour dial keeps its two capacity rings (outer 今日记录, inner 今日活跃) and gains 96 quarter-hour ticks; the two large overview readings keep a faint ghost of the previously shown value (cleared when the dashboard's `usage_date` changes or the reading shrinks). Signal orange marks only what is happening now (the 正在记录 lamp, the 前台运行 dot, the 托盘运行 ring, the recorder's pen lamp). The blue `--accent` marks selection and focus (current nav item, focus ring, text selection, search hits, toggles, sort buttons, the add-software selected row, and the reached 6666-hour plate's outline). Errors, warnings and remove buttons use their own red `--alert-*`. The `--mix-*` colours are software identity colours, always next to the software name. `DESIGN.md` records the system; `PRODUCT.md` records product truth for design work. The released v0.1.4 UI is the older dark Steam-like library.
- App mark: a skeuomorphic wall clock (steel bezel, ivory dial, 10:10 hands, orange second hand). `scripts/brand/build-clock-mark.py` writes `src/assets/gst-clock.svg` and `gst-clock-small.svg`; `scripts/brand/build-icons.py` rasterises them into `src-tauri/icons/` (also the tray icon) with headless Edge and Pillow.
- Theme: 跟随系统 / 浅色 / 深色, default follows Windows. Stored as `ui.theme` in SQLite `app_settings`; the native title bar follows through the window `setTheme` permission; `localStorage` key `gst.theme` only caches the last choice to avoid a first-frame flash.
- Default Chinese duration format: decimal hours with one fractional digit, for example `8.3小时` or `0.7小时`. The 2026-06-06 duration-format setting adds an optional concrete-minute display such as `8小时35分钟`.
- Latest published release: `v0.3.1` (2026-11-22); publication is gated by complete Windows checks and installer builds.
- v0.1.2 adds a Settings page with startup-at-login and close-window behavior controls.
- Startup at login defaults to enabled in v0.1.2, uses the current-user autostart mechanism, and does not require administrator permission.
- First window close still asks whether to exit or minimize to tray; the choice is saved automatically and can be changed later in Settings.
- v0.1.3 implements the `软件` page with `特别关注`, `隐藏软件列表`, read-only `已发现软件`, local pinyin-capable search, and software-page focused active time.
- The `特别关注` table shows software-page foreground runtime, background runtime, focused active time, and last opened time. Foreground/background runtime is stored in software-page identity daily aggregates; legacy runtime sessions are shown as foreground runtime when no split aggregate exists yet.
- `隐藏软件列表` is a global display filter: GST still records the software locally, but default summaries, rankings and distributions exclude it. The `统计` and `成就` pages leave it out of software-level figures unless their `包含隐藏软件` switch is on; machine-level figures are unaffected.
- Hidden add/remove changes refresh the default dashboard summaries immediately so hidden software leaves the overview without waiting for the normal polling interval.
- `特别关注` and `隐藏软件列表` are mutually exclusive. If abnormal data creates a conflict, hidden wins as the defensive fallback.
- v0.1.3 software-page active time means the software identity has Windows foreground focus. It is separate from the overview page's current keyboard/mouse active-time semantics.
- v0.3.1 records a local timeline (schema 3) for the future `时间轴` page; the UI is unchanged. Scope and rules: the v0.3.1 entry in `AGENTS.md`; binding decisions: `docs/superpowers/specs/2026-11-22-timeline-data-collection-design.md`. A v0.3.1 database cannot be opened by v0.3.0 or earlier.
- v0.3.0 adds the `统计` and `成就` pages. Scope and rules: the v0.3.0 entry in `AGENTS.md`; binding decisions: `docs/superpowers/specs/2026-11-21-statistics-and-achievements-design.md`; metric definitions: `docs/CURRENT_STATE.md`.

## Technical Decisions

- Stack: Tauri v2, Rust, React, TypeScript, SQLite.
- v0.1.3 software-page design should use a robust software identity layer keyed by merged user-visible software identity, not raw single executable app IDs. WPS-style components should behave as one software identity.
- Storage strategy: event log plus summary tables from v0.1.
- Runtime sessions track classified non-helper processes that own a taskbar-style app window (`src-tauri/src/window_info.rs`); this is not all process uptime. Any Chromium/Electron/CEF `--type=` child is a helper, identified with transient in-memory command-line checks.
- User-facing = taskbar window or tray icon. Tray detection (`tray_icons.rs`) matches `HKCU\Control Panel\NotifyIconSettings` executable paths version-insensitively per executable, only for processes in the user's session; Windows 10 has no such data. Tray-only apps get runtime sessions with status `tray` (`托盘运行`).
- The `后台` page (`background.rs`) groups non-system processes with neither window nor tray icon by software family; descendants of user-facing processes belong to that app. Daily totals live in `daily_background_usage` (schema version 2).
- Software identity keys are version-insensitive (`storage::software_family_key`): packaged apps group by package family; version and hash directories are ignored. Startup maintenance folds legacy per-version identities together.
- Dashboard status has four states: an eligible process with a taskbar-style window is `前台运行`; one without such a window but with a recognized tray icon is `托盘运行`; a known executable seen only without either, or only as a helper, is `后台运行`; no detected matching process is `未运行`. Here foreground means window visibility, not keyboard focus. Software-page focused active time separately uses the Windows foreground PID. Window titles and command lines are not stored in SQLite or shown in the UI.
- Default classifier noise filtering uses conservative process-name rules for hardware vendor background helpers. ASUS Armoury Crate helper processes and `nvcontainer.exe` are hidden by default, while the main `armourycrate.exe` app remains visible as `Armoury Crate`. v0.2.3 adds exact-stem rules for `NVIDIA Overlay`, `AsHotplugCtrl`, `Razer Synapse Service Process` and `BitCenter` (their main apps stay tracked; the `后台` page still lists them). Since v0.2.4, more exact-stem helpers (SQL Server, Wacom, Bonjour, Office Click-to-Run, git, rustup and others), Codex runtime folders, `.tmp` executables, and anything run from `\AppData\Local\Temp\`, `\Downloads\` or a `*-updater\` folder are classified as helpers, so a portable app started from Downloads is not tracked either. Avoid broad vendor path substring filters that could hide user-launched apps.
- The overview readout's `最常用` (v0.2.3) is the app with the most active time today, falling back to today's runtime; the ledger still sorts by all-time runtime.
- WPS suite components are grouped as `WPS Office` for usage summaries, including `wps.exe`, `et.exe`, `wpp.exe`, and `wpspdf.exe`; live status for merged rows is taken from the highest-priority status across all grouped app ids. WPS grouped rows use the main `wps.exe` sibling path for icon lookup, even when the visible component is `wpspdf.exe`, `et.exe`, or `wpp.exe`.
- Statistics and achievements are computed in `src-tauri/src/statistics.rs` from read-only range queries in `storage.rs` and exposed as `get_statistics_summary` / `get_achievements_summary`. They read existing daily-summary and session tables only and change neither schema 2 nor tracking. The ignored test `real_database_statistics_acceptance` in `commands.rs` prints both summaries and their timings for a disposable database snapshot (`GST_BENCH_DB`).
- Timeline data (v0.3.1, schema 3): `timeline_segments` (focus identity key and active state per credited stretch) and `timeline_window_spans` (when each identity had a taskbar window) are written in the same tracker savepoint as the daily summaries, from the same per-local-date chunks. An in-memory cursor decides whether a chunk extends the last row or opens a new one with a start reason; it is never persisted, so a restart always opens new rows. The read-only `get_timeline_summary` command is registered but unused until the v0.5.0 page. The four equalities with the daily summaries are listed in `docs/CURRENT_STATE.md`; the ignored test `real_database_timeline_acceptance` checks a schema 2 -> 3 migration on a disposable copy.
- Glass fallback (v0.4.0): the read-only command `get_transparency_effects_enabled` reads `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize\EnableTransparency` (missing or unreadable counts as on; nothing is stored). `src/glass.ts` calls it at startup and whenever the window becomes visible again, and sets `<html data-glass="off">` when it returns `false`. `data-glass="off"`, `prefers-reduced-transparency: reduce` and `@supports not (backdrop-filter: ...)` each only switch the tokens `--glass-surface`, `--side-surface` and `--glass-filter`, so panels turn opaque without duplicated rules.
- `get_dashboard_summary` (v0.4.0) also returns `usage_date`, the local `YYYY-MM-DD` date that today's readings belong to (the date the backend already queries). It is a read-only field with no schema or tracking change; the overview readout ghost uses it so a date change clears the ghost, also after the window was hidden in the tray or left on another page past midnight.
- Active time: v0.1 tracks daily machine-level active time using keyboard/mouse idle state.
- App settings are stored locally in the existing SQLite `app_settings` table, including `window.close_behavior`, `startup.autostart_enabled`, the `ui.duration_format` display preference, and the `ui.theme` preference.
- Current software-page focus attribution is part of v0.1.3. Future additional privacy-sensitive window/workspace features must be explicit and opt-in; do not describe existing foreground-PID attribution as an unimplemented future feature.
- Permissions: v0.1.3 runs as a normal user-space app and does not request administrator permission by default, including for startup at login.

## Privacy Decisions

- v0.1.3 records app identity, app runtime, daily recorded computer time, daily active computer time, software-page marks, software-page foreground/background runtime aggregates, software-page focused active time, and local app settings.
- v0.1.3 does not record window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, or cloud data.
- v0.1.3 does not upload data or require an account.
- Since v0.1.5 GST also records, for the `后台` page, background processes' executable name and path, daily running time, CPU time, peak memory and process count. `PRIVACY.md` is the current public statement.
- Since v0.3.1 GST also keeps a local timeline: per stretch of recorded time, the focused software identity and whether the computer was active, and per identity the stretches with a taskbar window (existence only, no titles). Kept permanently, never uploaded.

## Product Strategy

- Initial stage: open-source core modules on GitHub and build a developer/privacy-focused community.
- Middle stage: integrate with productivity tools such as Notion and Obsidian through import/export or plugins.
- Long-term stage: launch mobile companion apps for full-device time tracking.
- Monetization direction: free core, one-time paid advanced analytics, future small-team local deployment.

## Future Development Directions

- Settings should eventually expose a software-page active-time logic switch. Off/default keeps the current v0.1.3 behavior: a software identity counts as active whenever it has the Windows foreground focused window. On should count the current Windows focused software as active only when keyboard or mouse input was recent.
- The `软件` page can later add Excel-style sorting or simple sort controls for managed and discovered lists, such as add time, last opened time, or usage time. v0.1.3 keeps simple defaults: managed lists newest-added first and discovered software last-opened descending. The `后台` table sorts by column header since v0.2.4; reuse that pattern.
- A future software details drawer can show richer per-software history and analytics. v0.1.3 intentionally omits drawers so the first page stays dense and stable.
- A future add flow may offer manual `.exe` selection for software GST has not discovered yet. v0.1.3 intentionally uses the discovered software directory because it is friendlier for non-technical users.
- `统计` / `成就` follow-ups: the 星期 × 小时 habit chart can be derived from timeline segments from the collection start (v0.3.1) onward, and the heatmap day click waits for the `时间轴` page (v0.5.0); see `docs/CURRENT_STATE.md`.

## Current Repository State

- Version `0.3.1` adds timeline data collection (`timeline_segments`, `timeline_window_spans`) and the unused read-only `get_timeline_summary` command, developed on branch `feat/timeline-segments` (worktree `.worktrees/timeline-segments`) and fast-forwarded into main. It moves the database to schema 3. Next steps: v0.4.0 Mica glass and e-ink redesign, then the v0.5.0 `时间轴` page (specs dated 2026-11-22 under `docs/superpowers/specs/`).
- Version `0.3.0` adds the `统计` and `成就` pages, developed on branch `feat/statistics-and-achievements` (worktree `.worktrees/statistics-brainstorm`, rebased onto main `4a365f4` = v0.2.4). It retains schema 2.
- Version `0.2.4` adds the 已发现软件 noise filter, the icon pipeline (largest embedded size scaled to 96px, `gsticon` protocol, disk cache under `%LOCALAPPDATA%\com.globalsoftwaretimer.app\icons`, described in `PRIVACY.md`), 后台 column sorting, the 今日活跃 help popover fix and `serde_with` 3.21.0. It retains schema 2.
- Version `0.2.3` updates helper filtering, most-used ranking, short CPU times, font loading and NSIS shortcut icons. It retains schema 2.
- Version `0.2.2` includes the v0.2.0 UI, the v0.2.1 Edge startup boost fix, the v0.2.2 startup-bundle split, detailed taskbar clock icons and scan/loading/icon reliability fixes, and the published `v0.1.5` process-grouping implementation and schema 2.
- PR #12 is merged. Main worktree: `.worktrees/v01-implementation`; create a worktree and branch per task (`.worktrees/current-dev` is a detached v0.1.4 checkout, not an active development tree). The enclosing folder is a container.
- Repair baseline: local and GitHub API `main` were both `d8bfc6cb986d7f72113c84bdade6cc06cc261ab6` on 2026-11-17. As of 2026-11-21 `git fetch` and the `gh` CLI reach GitHub from this machine.
- A redacted reviewer report is preserved in `docs/2026-11-17-improvement-suggestions.md`; the complete original is archived locally outside Git. Its current-state claims refer to the pre-fix baseline. Use `docs/CURRENT_STATE.md` for repaired behavior and remaining work.
- Completed repair plan: `docs/superpowers/plans/2026-11-17-reliability-fixes.md`.
- Approved settings, software-page and duration-format specifications are under `docs/superpowers/specs/`. Historical plans under `docs/superpowers/plans/` are not a live backlog.
- The 2026-06-06 duration-format preference is implemented on main but was not in the published v0.1.3 release.
- Local gate: `npm.cmd run check` runs release-script failure tests, frontend tests/build, Rust fmt/tests, and npm audit. `npm.cmd run release:build` runs the gate and Tauri build, stops on failure, then stages installers and prints SHA256 hashes.
- Redesign changes, benchmark results and outstanding environment checks for the UI redesign are recorded in `docs/ui-redesign-backlog.md`.
- Browser UI preview with synthetic data: `npm.cmd run preview:ui` (port 1421) aliases the Tauri APIs to `scripts/ui-preview/`; query options `?theme=light|dark`, `?format=hm`, `?empty`, `?page=software|background|statistics|achievements|settings`, `?dialog=add`, `?glass=off` (opaque fallback panels), `?tick` (each poll adds 6 minutes to today's readings, to show the readout ghost). It never touches the real database. In another worktree start it with `npm.cmd run preview:ui -- --port <n> --strictPort` so port 1421 stays with the main checkout. `scripts/ui-preview/probe.mjs` drives a local Edge over CDP for screenshots with media emulation and a fixed clock (`--time`, plus `--date` so the date-dependent mock data stays the same), layout exports and frame timing.
- Load `. .\scripts\dev-env.ps1` before Rust commands. The 2026-06-18 toolchain/audit observations are historical; on 2026-11-21 the local `npm.cmd run check` audit reported 0 vulnerabilities. Re-run the audit before claiming a clean result for a later release.
- Superpowers workflows are available in the active environment's plugin cache; discover them per environment. Portable workflow fallback is `docs/DEVELOPMENT_WORKFLOW.md` and `AGENTS.md`.
- The original v0.1 plan requires subagent-driven development. This repair used implementation plus independent spec and quality reviews.

## Release State

- `v0.3.1` (2026-11-22): local timeline data collection (focus and activity segments, window spans), schema 3; no UI change.
- `v0.3.0` (2026-11-22): the `统计` and `成就` pages, the header date button limited to `概览` and `后台`, statistics icons through the `gsticon` protocol.
- `v0.2.4` (2026-11-21): sharp icons with a local disk cache, stricter discovered-software noise filter (also anything run from Downloads), 后台 column sorting, active-time popover fix, `serde_with` advisory fix.
- `v0.2.3` (2026-11-21): default-hidden vendor helpers, most-used from today's active time, short CPU times on the `后台` page, LCD font preload, NSIS hook that refreshes shortcut icons after in-place upgrades.
- `v0.2.2` (2026-11-21): split first-paint bundle, detailed taskbar clock, scan recovery and live scan status, loading/error states, stable package names and icons.
- `v0.2.1` (2026-11-21): first public release of the v0.2.0 instrument UI, plus the Edge startup-boost tracking fix. `v0.2.0` itself was a branch version, never published on its own.
- `v0.1.5` (2026-11-20): tray tracking, the `后台` page, version-insensitive identities, schema 2.
- `v0.1.4` (2026-11-17) includes reliability repairs and dependency remediation; installer publication is gated by the Windows release workflow.

- `v0.1.0` was the initial Windows-first GitHub release on 2026-05-30.
- `v0.1.1` is the first stability patch release, published on GitHub on 2026-05-31.
- `v0.1.2` adds Settings, default-on current-user startup at login, and close-window behavior controls; it was published on GitHub on 2026-06-04.
- `v0.1.3` adds the `软件` page, focused/hidden/discovered software lists, local pinyin-capable search, hidden-software default summary filtering, and software-page focused active time; it was published on GitHub on 2026-06-05.
- The release workflow entrypoint is `npm.cmd run release:build`; `npm.cmd run tauri:build` is the underlying bundling command. A code push does not publish an installer release.

## Reliability Checkpoint: 2026-11-17

- Long scan gaps (>10 seconds) and backwards wall time end sessions at the last reliable heartbeat and receive no daily credit. A defensive 60-second tick cap remains. Credited seconds split at local midnight using injected timestamps, enabling deterministic tests.
- New `AppHeartbeat` events are suppressed; each executable gets at most one heartbeat update per scan, while focus mapping retains all eligible PIDs. Existing heartbeat history remains intact.
- Scan/tick writes use nested-safe savepoints; cloned tracker state becomes live only after database commit. Failures roll back session, identity, event and aggregate changes together. Normal Tauri exit closes sessions at their last heartbeat; forced exits still use startup recovery.
- Schema version 1 upgrades legacy structures atomically, rejects future versions, retains settings/history and adds indexes. Identity cache maintenance runs at startup/write boundaries. Summary queries use a separate read-only connection with a read transaction and briefly clone runtime status under the tracker mutex.
- UI polling pauses when document.hidden and resumes on visibility; software mutations and polling share response-generation protection. Release command failures now stop before staging.
- Final local validation: 66 frontend tests, TypeScript/Vite build, 95 Rust tests, Rust formatting, and both release-script failure regressions passed. Independent spec/quality reviews passed. Full `npm.cmd run check` exits 1 at npm audit because its registry endpoint is unreachable; real sleep/hibernate and tray interaction were not manually tested.
- Release dependency remediation: compatible lockfile updates resolved seven npm findings; cloud npm audit reports zero vulnerabilities. CI now enforces audit. Windows release builds rerun the complete gate and produce EXE/MSI plus SHA256SUMS.txt.
- These changes do not unify the accounting model, rebuild corrupted historical time, delete old events, compact databases, or implement backup/restore. No production database was opened or modified during this repair.
- Still pending: Windows power/session hooks and real sleep/hibernate validation; materialized summary/performance benchmarks; safe historic cleanup with recoverable backup; identity/rule redesign; live tracker-health UI; persistent logs, CSP, signing, updates, and export/restore. See `docs/CURRENT_STATE.md`.

## Historical Implementation Plan

Plan file:

- `docs/superpowers/plans/2026-05-28-global-software-timer-v01.md`

Plan tasks:

1. Bootstrap the Tauri React project.
2. Add Rust domain types and SQLite storage.
3. Add application classification and filtering.
4. Add process snapshots and active-time detection.
5. Implement tracker engine, heartbeats, and recovery.
6. Add Tauri state, commands, tray, and autostart.
7. Build the Steam-like dashboard UI.
8. Add documentation, privacy statement, license, and CI.
9. Manual Windows verification and v0.1 polish pass.

## Execution Notes For Future Agents

- Work from an isolated worktree/branch, not directly on `main`.
- Keep the open-source tracker core separable from future paid analytics.
- Avoid speculative abstractions; implement the current approved task and plan. Shipped-release plans remain historical context.
- After each task, update this file if a decision changes or a blocker appears.
- Commit history should follow Conventional Commits-style types. Use `feat` for new user-visible behavior, `fix` for bug fixes, `docs` for documentation-only changes, `test` for tests, `build`/`ci` for build and workflow changes, and reserve `chore` for auxiliary maintenance/tooling only.
- Do not bundle a batch of new features or fixes into a final `chore(release)` commit. Release/version commits may be `chore(release): ...` only after the underlying feature/fix/doc/test commits have already been made separately.
- Prefer one commit per completed feature, fix, documentation update, test addition, or coherent checkpoint. Once the user has granted commit permission for the task/session, commit after each finished step rather than waiting until the release is complete.
- The GitHub repository allows rebase merges as of 2026-06-05. Prefer rebase merge over squash merge when the user wants every stage commit preserved on `main`.
