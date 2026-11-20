# Project Memory

Last updated: 2026-11-20

## Product Decisions

- Product name: Global Software Timer.
- `GST` is an accepted shorthand for Global Software Timer in project discussions and docs.
- Chinese UI name: 全局软件计时器.
- v0.1 platform: Windows 10/11 first.
- Later platform direction: a native SwiftUI/AppKit macOS app, then mobile companion apps. The 2026-06-15 native capture PoC is archived under `MACOS/native-capture-poc/`; it is reference material, not production macOS support. Physical keyboard/mouse idle-reset validation remains open.
- v0.1 shape: system tray app, background tracking, dashboard on demand.
- UI direction: dark Steam-like software library, not a marketing landing page.
- Default Chinese duration format: decimal hours with one fractional digit, for example `8.3小时` or `0.7小时`. The 2026-06-06 duration-format setting adds an optional concrete-minute display such as `8小时35分钟`.
- Release version: `v0.1.5` (2026-11-20); publication is gated by complete Windows checks and installer builds.
- v0.1.2 adds a Settings page with startup-at-login and close-window behavior controls.
- Startup at login defaults to enabled in v0.1.2, uses the current-user autostart mechanism, and does not require administrator permission.
- First window close still asks whether to exit or minimize to tray; the choice is saved automatically and can be changed later in Settings.
- v0.1.3 implements the `软件` page with `特别关注`, `隐藏软件列表`, read-only `已发现软件`, local pinyin-capable search, and software-page focused active time.
- The `特别关注` table shows software-page foreground runtime, background runtime, focused active time, and last opened time. Foreground/background runtime is stored in software-page identity daily aggregates; legacy runtime sessions are shown as foreground runtime when no split aggregate exists yet.
- `隐藏软件列表` is a global display filter: GST still records the software locally, but default summaries, rankings, distributions, and future report-style pages exclude it unless a future view explicitly includes hidden software.
- Hidden add/remove changes refresh the default dashboard summaries immediately so hidden software leaves the overview without waiting for the normal polling interval.
- `特别关注` and `隐藏软件列表` are mutually exclusive. If abnormal data creates a conflict, hidden wins as the defensive fallback.
- v0.1.3 software-page active time means the software identity has Windows foreground focus. It is separate from the overview page's current keyboard/mouse active-time semantics.

## Technical Decisions

- Stack: Tauri v2, Rust, React, TypeScript, SQLite.
- v0.1.3 software-page design should use a robust software identity layer keyed by merged user-visible software identity, not raw single executable app IDs. WPS-style components should behave as one software identity.
- Storage strategy: event log plus summary tables from v0.1.
- Runtime sessions track classified non-helper processes that own a taskbar-style app window (`src-tauri/src/window_info.rs`); this is not all process uptime. Any Chromium/Electron/CEF `--type=` child is a helper, identified with transient in-memory command-line checks.
- User-facing = taskbar window or tray icon. Tray detection (`tray_icons.rs`) matches `HKCU\Control Panel\NotifyIconSettings` executable paths version-insensitively per executable, only for processes in the user's session; Windows 10 has no such data. Tray-only apps get runtime sessions with status `tray` (`托盘运行`).
- The `后台` page (`background.rs`) groups non-system processes with neither window nor tray icon by software family; descendants of user-facing processes belong to that app. Daily totals live in `daily_background_usage` (schema version 2).
- Software identity keys are version-insensitive (`storage::software_family_key`): packaged apps group by package family; version and hash directories are ignored. Startup maintenance folds legacy per-version identities together.
- Dashboard status is tri-state: an eligible visible-window process is `前台运行`; a known executable seen only without a visible window or as a helper is `后台运行`; no detected matching process is `未运行`. Here foreground means window visibility, not keyboard focus. Software-page focused active time separately uses the Windows foreground PID. Window titles and command lines are not stored in SQLite or shown in the UI.
- Default classifier noise filtering uses conservative process-name rules for hardware vendor background helpers. ASUS Armoury Crate helper processes and `nvcontainer.exe` are hidden by default, while the main `armourycrate.exe` app remains visible as `Armoury Crate`; avoid broad vendor path substring filters that could hide user-launched apps.
- WPS suite components are grouped as `WPS Office` for usage summaries, including `wps.exe`, `et.exe`, `wpp.exe`, and `wpspdf.exe`; live status for merged rows is taken from the highest-priority status across all grouped app ids. WPS grouped rows use the main `wps.exe` sibling path for icon lookup, even when the visible component is `wpspdf.exe`, `et.exe`, or `wpp.exe`.
- Active time: v0.1 tracks daily machine-level active time using keyboard/mouse idle state.
- App settings are stored locally in the existing SQLite `app_settings` table, including `window.close_behavior`, `startup.autostart_enabled`, and the `ui.duration_format` display preference.
- Current software-page focus attribution is part of v0.1.3. Future additional privacy-sensitive window/workspace features must be explicit and opt-in; do not describe existing foreground-PID attribution as an unimplemented future feature.
- Permissions: v0.1.3 runs as a normal user-space app and does not request administrator permission by default, including for startup at login.

## Privacy Decisions

- v0.1.3 records app identity, app runtime, daily recorded computer time, daily active computer time, software-page marks, software-page foreground/background runtime aggregates, software-page focused active time, and local app settings.
- v0.1.3 does not record window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, or cloud data.
- v0.1.3 does not upload data or require an account.

## Product Strategy

- Initial stage: open-source core modules on GitHub and build a developer/privacy-focused community.
- Middle stage: integrate with productivity tools such as Notion and Obsidian through import/export or plugins.
- Long-term stage: launch mobile companion apps for full-device time tracking.
- Monetization direction: free core, one-time paid advanced analytics, future small-team local deployment.

## Future Development Directions

- Settings should eventually expose a software-page active-time logic switch. Off/default keeps the current v0.1.3 behavior: a software identity counts as active whenever it has the Windows foreground focused window. On should count the current Windows focused software as active only when keyboard or mouse input was recent.
- The `软件` page can later add Excel-style sorting or simple sort controls for managed and discovered lists, such as add time, last opened time, or usage time. v0.1.3 keeps simple defaults: managed lists newest-added first and discovered software last-opened descending.
- A future software details drawer can show richer per-software history and analytics. v0.1.3 intentionally omits drawers so the first page stays dense and stable.
- A future add flow may offer manual `.exe` selection for software GST has not discovered yet. v0.1.3 intentionally uses the discovered software directory because it is friendlier for non-technical users.
- Hidden software should remain excluded from default summaries and rankings, but future report-style pages may provide an explicit opt-in view that includes hidden software.

## Current Repository State

- The process-grouping release version is `0.1.5` across npm, Cargo, Tauri and the sidebar. The UI redesign is planned for `0.2.x`.
- PR #12 is merged. Main worktree: `.worktrees/v01-implementation`; development worktree: `.worktrees/current-dev`. The enclosing folder is a container.
- Repair baseline: local and GitHub API `main` were both `d8bfc6cb986d7f72113c84bdade6cc06cc261ab6` on 2026-11-17. Direct CLI GitHub access fails in this environment; verify remote Git objects through the connected GitHub service when publishing.
- A redacted reviewer report is preserved in `docs/2026-11-17-improvement-suggestions.md`; the complete original is archived locally outside Git. Its current-state claims refer to the pre-fix baseline. Use `docs/CURRENT_STATE.md` for repaired behavior and remaining work.
- Completed repair plan: `docs/superpowers/plans/2026-11-17-reliability-fixes.md`.
- Approved settings, software-page and duration-format specifications are under `docs/superpowers/specs/`. Historical plans under `docs/superpowers/plans/` are not a live backlog.
- The 2026-06-06 duration-format preference is implemented on main but was not in the published v0.1.3 release.
- Local gate: `npm.cmd run check` runs release-script failure tests, frontend tests/build, Rust fmt/tests, and npm audit. `npm.cmd run release:build` runs the gate and Tauri build, stops on failure, then stages installers and prints SHA256 hashes.
- Load `. .\scripts\dev-env.ps1` before Rust commands. The 2026-06-18 toolchain/audit observations are historical; the 2026-11-17 online npm audit could not reach its endpoint. Do not claim a fresh clean dependency audit.
- Superpowers workflows are available in the active environment's plugin cache; discover them per environment. Portable workflow fallback is `docs/DEVELOPMENT_WORKFLOW.md` and `AGENTS.md`.
- The original v0.1 plan requires subagent-driven development. This repair used implementation plus independent spec and quality reviews.

## Release State

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
