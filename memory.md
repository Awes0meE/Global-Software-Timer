# Project Memory

Last updated: 2026-06-12

## Product Decisions

- Product name: Global Software Timer.
- `GST` is an accepted shorthand for Global Software Timer in project discussions and docs.
- Chinese UI name: 全局软件计时器.
- v0.1 platform: Windows 10/11 first.
- Later platform direction: macOS with a more polished native-feeling UI, then mobile companion apps.
- v0.1 shape: system tray app, background tracking, dashboard on demand.
- UI direction: dark Steam-like software library, not a marketing landing page.
- Default Chinese duration format: decimal hours with one fractional digit, for example `8.3小时` or `0.7小时`. The 2026-06-06 duration-format setting adds an unreleased optional concrete-minute display such as `8小时35分钟`.
- Latest release: `v0.1.3`, published on GitHub on 2026-06-05.
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
- Runtime tracking: v0.1 tracks application process runtime.
- Runtime sessions require a user-visible top-level window; Browser/Electron child helpers are filtered with transient command-line flag checks. Dashboard status is tri-state: foreground window plus process is `前台运行`, background process without foreground window is `后台运行`, no detected process is `未运行`. Window titles and command lines are not stored in SQLite or shown in the UI.
- Default classifier noise filtering uses conservative process-name rules for hardware vendor background helpers. ASUS Armoury Crate helper processes and `nvcontainer.exe` are hidden by default, while the main `armourycrate.exe` app remains visible as `Armoury Crate`; avoid broad vendor path substring filters that could hide user-launched apps.
- WPS suite components are grouped as `WPS Office` for usage summaries, including `wps.exe`, `et.exe`, `wpp.exe`, and `wpspdf.exe`; live status for merged rows is taken from the highest-priority status across all grouped app ids. WPS grouped rows use the main `wps.exe` sibling path for icon lookup, even when the visible component is `wpspdf.exe`, `et.exe`, or `wpp.exe`.
- Active time: v0.1 tracks daily machine-level active time using keyboard/mouse idle state.
- App settings are stored locally in the existing SQLite `app_settings` table, including `window.close_behavior`, `startup.autostart_enabled`, and the unreleased `ui.duration_format` display preference.
- Long-term direction: record both runtime and active usage, with foreground/window-level features only as explicit opt-in.
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
- Karpathy Guidelines skill is already installed at `C:\Users\123\.codex\skills\karpathy-guidelines`.
- Requested execution mode: Superpowers subagent-driven development.
- Local toolchain prepared on 2026-05-28:
  - Node `v24.15.0`
  - npm `11.12.1`
  - Rust `1.95.0`
  - Cargo `1.95.0`
  - Visual Studio 2022 Build Tools with C++ workload
  - Microsoft Edge WebView2 Runtime `148.0.3967.83`
- Existing Codex shells may not inherit the refreshed Cargo PATH. Run `. .\scripts\dev-env.ps1` before Rust/Tauri commands.

## Release State

- `v0.1.0` was the initial Windows-first GitHub release on 2026-05-30.
- `v0.1.1` is the first stability patch release, published on GitHub on 2026-05-31.
- `v0.1.2` adds Settings, default-on current-user startup at login, and close-window behavior controls; it was published on GitHub on 2026-06-04.
- `v0.1.3` adds the `软件` page, focused/hidden/discovered software lists, local pinyin-capable search, hidden-software default summary filtering, and software-page focused active time; it was published on GitHub on 2026-06-05.
- Release bundles are built with `npm run tauri:build`.

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
