# Project Memory

Last updated: 2026-06-04

## Product Decisions

- Product name: Global Software Timer.
- Chinese UI name: 全局软件计时器.
- v0.1 platform: Windows 10/11 first.
- Later platform direction: macOS with a more polished native-feeling UI, then mobile companion apps.
- v0.1 shape: system tray app, background tracking, dashboard on demand.
- UI direction: dark Steam-like software library, not a marketing landing page.
- Chinese duration format: decimal hours with one fractional digit, for example `8.3小时` or `0.7小时`.
- Latest release: `v0.1.2`, published on GitHub on 2026-06-04.
- v0.1.2 adds a Settings page with startup-at-login and close-window behavior controls.
- Startup at login defaults to enabled in v0.1.2, uses the current-user autostart mechanism, and does not require administrator permission.
- First window close still asks whether to exit or minimize to tray; the choice is saved automatically and can be changed later in Settings.

## Technical Decisions

- Stack: Tauri v2, Rust, React, TypeScript, SQLite.
- Storage strategy: event log plus summary tables from v0.1.
- Runtime tracking: v0.1 tracks application process runtime.
- Runtime sessions require a user-visible top-level window; Browser/Electron child helpers are filtered with transient command-line flag checks. Dashboard status is tri-state: foreground window plus process is `前台运行`, background process without foreground window is `后台运行`, no detected process is `未运行`. Window titles and command lines are not stored in SQLite or shown in the UI.
- WPS suite components are grouped as `WPS Office` for usage summaries, including `wps.exe`, `et.exe`, `wpp.exe`, and `wpspdf.exe`; live status for merged rows is taken from the highest-priority status across all grouped app ids. WPS grouped rows use the main `wps.exe` sibling path for icon lookup, even when the visible component is `wpspdf.exe`, `et.exe`, or `wpp.exe`.
- Active time: v0.1 tracks daily machine-level active time using keyboard/mouse idle state.
- App settings are stored locally in the existing SQLite `app_settings` table, including `window.close_behavior` and `startup.autostart_enabled`.
- Long-term direction: record both runtime and active usage, with foreground/window-level features only as explicit opt-in.
- Permissions: v0.1.2 runs as a normal user-space app and does not request administrator permission by default, including for startup at login.

## Privacy Decisions

- v0.1.2 records app identity, app runtime, daily recorded computer time, daily active computer time, and local app settings.
- v0.1.2 does not record window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, or cloud data.
- v0.1.2 does not upload data or require an account.

## Product Strategy

- Initial stage: open-source core modules on GitHub and build a developer/privacy-focused community.
- Middle stage: integrate with productivity tools such as Notion and Obsidian through import/export or plugins.
- Long-term stage: launch mobile companion apps for full-device time tracking.
- Monetization direction: free core, one-time paid advanced analytics, future small-team local deployment.

## Current Repository State

- Design spec committed.
- Implementation plan committed.
- Settings/autostart spec and implementation plan committed:
  - `docs/superpowers/specs/2026-06-04-settings-autostart-design.md`
  - `docs/superpowers/plans/2026-06-04-settings-autostart.md`
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
