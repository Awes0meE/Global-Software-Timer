# Settings And Autostart Design

Date: 2026-06-04

## Goal

Add a Settings page for the next Global Software Timer release. The page keeps the existing app chrome and left navigation, then adds settings content for startup at login and close-window behavior.

## Visual Reference

Reference image:

- `docs/superpowers/assets/2026-06-04-settings-autostart-ui-reference.png`

The reference is for the settings page body only. The shipped UI must keep the existing navigation items:

- 概览
- 软件
- 统计
- 时间轴
- 日报
- 设置

## Functional Requirements

- `设置` becomes a real navigation item instead of an unavailable control.
- `概览` continues to show the existing dashboard.
- Other unfinished navigation items remain unavailable.
- The Settings page contains an iOS-style animated switch for `开机自启动`.
- Startup at login is on by default using the current user's normal autostart mechanism.
- Startup at login must not request administrator permission.
- The startup preference is stored locally so a user who turns it off does not have it re-enabled on the next launch.
- Turning startup on or off applies immediately through the existing Tauri autostart plugin.
- The Settings page contains the previous close-window behavior as a setting:
  - Switch on: closing the window minimizes/hides to tray.
  - Switch off: closing the window exits the app.
- The close-window behavior preference is stored in local SQLite through the existing `app_settings` table.

## Privacy And Permission Boundaries

- Do not add telemetry.
- Do not add network upload.
- Do not collect window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, or browser history.
- Do not request administrator permission for startup at login.

## Implementation Shape

- Frontend owns the Settings page, toggles, default autostart sync, and optimistic state rollback on failures.
- `src/api.ts` wraps both the existing close behavior commands and the Tauri autostart plugin calls.
- Rust keeps the existing close behavior persistence and adds startup preference fields to the settings DTO.
- Existing tray behavior and dashboard refresh continue unchanged.

## Acceptance Criteria

- Settings navigation opens a Settings page without changing the other left navigation items.
- Startup switch defaults on, calls `enable()` when the OS autostart state is off, and shows no permission/admin dialog.
- Startup switch calls `disable()` and stores the local preference when turned off.
- Close behavior switch calls the existing close behavior command with `minimize_to_tray` or `exit`.
- First close still shows the close behavior choice dialog, saves that choice automatically, and includes `后续可在设置中更改。`.
- Later closes apply the saved behavior without showing the dialog.
- `npm test`, `npm run build`, and `cargo test` pass.
