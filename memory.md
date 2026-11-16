# Project Memory

Last updated: 2026-11-17

## Product Decisions

- Product name: Global Software Timer.
- `GST` is an accepted shorthand for Global Software Timer in project discussions and docs.
- Chinese UI name: 全局软件计时器.
- v0.1 platform: Windows 10/11 first.
- Later platform direction: a native SwiftUI/AppKit macOS app, then mobile companion apps. The 2026-06-15 native capture PoC is archived under `MACOS/native-capture-poc/`; it is reference material, not production macOS support. Physical keyboard/mouse idle-reset validation remains open.
- v0.1 shape: system tray app, background tracking, dashboard on demand.
- UI direction: dark Steam-like software library, not a marketing landing page.
- Default Chinese duration format: decimal hours with one fractional digit, for example `8.3小时` or `0.7小时`. The 2026-06-06 duration-format setting adds an unreleased optional concrete-minute display such as `8小时35分钟`.
- Latest release recorded in repository documentation: `v0.1.3`, published on 2026-06-05. The 2026-11-17 check verified the remote `main` commit, not the live Releases listing.
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
- Runtime sessions track classified non-helper processes with a visible top-level window; this is not all process uptime. Browser/Electron child helpers are identified with transient command-line flag checks.
- Dashboard status is tri-state: an eligible visible-window process is `前台运行`; a known executable seen only without a visible window or as a helper is `后台运行`; no detected matching process is `未运行`. Here foreground means window visibility, not keyboard focus. Software-page focused active time separately uses the Windows foreground PID. Window titles and command lines are not stored in SQLite or shown in the UI.
- Default classifier noise filtering uses conservative process-name rules for hardware vendor background helpers. ASUS Armoury Crate helper processes and `nvcontainer.exe` are hidden by default, while the main `armourycrate.exe` app remains visible as `Armoury Crate`; avoid broad vendor path substring filters that could hide user-launched apps.
- WPS suite components are grouped as `WPS Office` for usage summaries, including `wps.exe`, `et.exe`, `wpp.exe`, and `wpspdf.exe`; live status for merged rows is taken from the highest-priority status across all grouped app ids. WPS grouped rows use the main `wps.exe` sibling path for icon lookup, even when the visible component is `wpspdf.exe`, `et.exe`, or `wpp.exe`.
- Active time: v0.1 tracks daily machine-level active time using keyboard/mouse idle state.
- App settings are stored locally in the existing SQLite `app_settings` table, including `window.close_behavior`, `startup.autostart_enabled`, and the unreleased `ui.duration_format` display preference.
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

- Verified baseline on 2026-11-17: local `main`, local `codex/current-dev`, cached `origin/main`, and GitHub API `main` all point to `d8bfc6cb986d7f72113c84bdade6cc06cc261ab6`. CLI fetch/ls-remote failed to connect; the API comparison did not refresh local refs. Remote branch enumeration returned only `main`.
- Documentation reconciliation used an isolated development worktree on `docs/neat-review-20261117`; implementation must stay off `main`.
- A redacted reviewer report is retained at `docs/2026-11-17-improvement-suggestions.md`; the complete original is archived locally outside Git. Use `docs/CURRENT_STATE.md` for verified findings and current behavior.
- `backup/pre-remote-main-sync-20260618-204117` is an ancestor of `main` (93 commits behind, no unique commits). It is retained as a historical recovery reference.
- Design spec committed.
- Implementation plan committed.
- Settings/autostart spec and implementation plan committed:
  - `docs/superpowers/specs/2026-06-04-settings-autostart-design.md`
  - `docs/superpowers/plans/2026-06-04-settings-autostart.md`
- Software page v0.1.3 spec and implementation plan committed:
  - `docs/superpowers/specs/2026-06-05-software-page-design.md`
  - `docs/superpowers/plans/2026-06-05-software-page-v013.md`
- Duration-format setting spec and implementation plan committed:
  - `docs/superpowers/specs/2026-06-06-duration-format-setting-design.md`
  - `docs/superpowers/plans/2026-06-12-duration-format-setting.md`
- v0.1.3 software-page implementation was merged into `main` through PR #10 on 2026-06-05.
- For future development/release checkpoints, update the app's bottom-left sidebar version display as a default final step after feature work and verification.
- Discover the Karpathy Guidelines skill in the active environment; do not assume a machine-specific installation path.
- The original v0.1 implementation plan requires Superpowers subagent-driven development. Documentation-only reconciliation does not execute that plan.
- Local workflow entrypoint: `npm.cmd run check` loads frontend tests, frontend production build, Rust formatting check, Rust tests, and npm audit. `npm.cmd run release:build` invokes that gate, builds Tauri bundles, stages installer assets, and prints SHA256 hashes. At `d8bfc6c`, the release wrapper does not check native npm exit codes; verify command success and artifact freshness before release.
- Dependency audit status on 2026-06-18: npm audit is clear at moderate severity or higher. GitHub Dependabot still reports a medium Rust `glib` alert from `src-tauri/Cargo.lock`, but `glib` is absent from the Windows target dependency tree and appears only under `cargo tree --target all` through Tauri's Linux GTK/WebKit/tray stack. `cargo update -p glib --dry-run` cannot move it under current upstream constraints.
- Superpowers workflow files were found on 2026-11-17 in the active environment's plugin cache. Discover skills per environment rather than retaining the June missing-installation assumption. The portable fallback remains `docs/DEVELOPMENT_WORKFLOW.md` and `AGENTS.md`.
- Local toolchain verified on 2026-06-18:
  - Node `v22.18.0`
  - npm `10.9.3`
  - Rust `1.96.0`
  - Cargo `1.96.0`
  - Visual Studio 2022 Build Tools with C++ workload
  - Microsoft Edge WebView2 Runtime `149.0.4022.69`
- Existing Codex shells may not inherit the refreshed Cargo PATH. Run `. .\scripts\dev-env.ps1` before Rust/Tauri commands.

## Release State

- `v0.1.0` was the initial Windows-first GitHub release on 2026-05-30.
- `v0.1.1` is the first stability patch release, published on GitHub on 2026-05-31.
- `v0.1.2` adds Settings, default-on current-user startup at login, and close-window behavior controls; it was published on GitHub on 2026-06-04.
- `v0.1.3` adds the `软件` page, focused/hidden/discovered software lists, local pinyin-capable search, hidden-software default summary filtering, and software-page focused active time; it was published on GitHub on 2026-06-05.
- The release workflow entrypoint is `npm.cmd run release:build`; `npm.cmd run tauri:build` is the underlying bundling command. See the release-wrapper limitation above.

## Open Reliability Findings

- No runtime fixes were made during the 2026-11-17 documentation review. The tick cap and regression test introduced by `f00093a` are absent from the reviewed baseline; session continuity also lacks long-gap handling. The exact commit that removed the protection was not identified.
- Heartbeat updates and `AppHeartbeat` events remain separate per-snapshot writes; a whole tick is not atomic. Start, stop, recovery, and batch list additions already have local transactions.
- Summary commands hold the tracker mutex, scan session history, and upsert identity caches. Separate read connections require moving those writes first; filtering the current query to one date would break lifetime totals.
- Versioned migrations, safe backup/restore, and historical-heartbeat cleanup are proposals, not available features. The reviewer's local database measurements were not rechecked and are omitted from the published report. Do not delete local history based only on this report.
- Overview active time uses a five-minute keyboard/mouse idle threshold; software-page active time uses focus without idle gating. The existing metric distinction is intentional. Future terminology or accounting changes require an explicit design and regression coverage.

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
- Avoid speculative abstractions; implement the v0.1 plan only.
- After each task, update this file if a decision changes or a blocker appears.
- Commit history should follow Conventional Commits-style types. Use `feat` for new user-visible behavior, `fix` for bug fixes, `docs` for documentation-only changes, `test` for tests, `build`/`ci` for build and workflow changes, and reserve `chore` for auxiliary maintenance/tooling only.
- Do not bundle a batch of new features or fixes into a final `chore(release)` commit. Release/version commits may be `chore(release): ...` only after the underlying feature/fix/doc/test commits have already been made separately.
- Prefer one commit per completed feature, fix, documentation update, test addition, or coherent checkpoint. Once the user has granted commit permission for the task/session, commit after each finished step rather than waiting until the release is complete.
- The GitHub repository allows rebase merges as of 2026-06-05. Prefer rebase merge over squash merge when the user wants every stage commit preserved on `main`.
