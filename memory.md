# Project Memory

Last updated: 2026-05-29

## Product Decisions

- Product name: Global Software Timer.
- Chinese UI name: 全局软件计时器.
- v0.1 platform: Windows 10/11 first.
- Later platform direction: macOS with a more polished native-feeling UI, then mobile companion apps.
- v0.1 shape: system tray app, background tracking, dashboard on demand.
- UI direction: dark Steam-like software library, not a marketing landing page.
- Chinese duration format: `8小时16分钟`; below one hour: `42分钟`.

## Technical Decisions

- Stack: Tauri v2, Rust, React, TypeScript, SQLite.
- Storage strategy: event log plus summary tables from v0.1.
- Runtime tracking: v0.1 tracks application process runtime.
- Active time: v0.1 tracks daily machine-level active time using keyboard/mouse idle state.
- Long-term direction: record both runtime and active usage, with foreground/window-level features only as explicit opt-in.
- Permissions: v0.1 runs as a normal user-space app and does not request administrator permission by default.

## Privacy Decisions

- v0.1 records app identity, app runtime, daily recorded computer time, and daily active computer time.
- v0.1 does not record window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, or cloud data.
- v0.1 does not upload data or require an account.

## Product Strategy

- Initial stage: open-source core modules on GitHub and build a developer/privacy-focused community.
- Middle stage: integrate with productivity tools such as Notion and Obsidian through import/export or plugins.
- Long-term stage: launch mobile companion apps for full-device time tracking.
- Monetization direction: free core, one-time paid advanced analytics, future small-team local deployment.

## Current Repository State

- Design spec committed.
- Implementation plan committed.
- v0.1 implementation completed on branch `feature/v01-implementation` in worktree `.worktrees/v01-implementation`.
- Latest implementation commit reviewed: `8c73698 fix: add v0.1 settings controls`.
- Final release-blocking review status: READY.
- Windows dev validation passed:
  - Tauri app starts with window title `全局软件计时器`.
  - Background tracker writes local SQLite sessions and daily system usage.
  - Dashboard reads real SQLite summaries.
  - Main window close hides to tray; tray quit exits.
  - Startup-at-login, hide/unhide, and rename controls are present.
  - Local DB schema contains no window-title, document-name, webpage-title, keystroke, mouse-coordinate, file-content, browser-history, telemetry, account, or cloud-sync fields.
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

## Active Implementation Plan

Plan file:

- `docs/superpowers/plans/2026-05-28-global-software-timer-v01.md`

Planned tasks:

1. Bootstrap the Tauri React project. Completed.
2. Add Rust domain types and SQLite storage. Completed.
3. Add application classification and filtering. Completed.
4. Add process snapshots and active-time detection. Completed.
5. Implement tracker engine, heartbeats, and recovery. Completed.
6. Add Tauri state, commands, tray, and autostart. Completed.
7. Build the Steam-like dashboard UI. Completed.
8. Add documentation, privacy statement, license, and CI. Completed.
9. Manual Windows verification and v0.1 polish pass. Completed.

Final checks passed:

- `npm test`
- `npm run build`
- `cargo test`
- `cargo fmt --check`
- `cargo clippy --all-targets -- -D warnings`
- `npm run tauri -- build --no-bundle`

## Execution Notes For Future Agents

- Work from an isolated worktree/branch, not directly on `main`.
- Keep the open-source tracker core separable from future paid analytics.
- Avoid speculative abstractions; implement the v0.1 plan only.
- After each task, update this file if a decision changes or a blocker appears.
