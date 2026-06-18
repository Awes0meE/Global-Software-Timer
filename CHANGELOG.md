# Changelog

## Unreleased

- Added a Settings switch for global Chinese duration display: default decimal hours or concrete hours/minutes.
- Improved default noise filtering for ASUS Armoury Crate helper processes and NVIDIA container background processes while keeping the main Armoury Crate app visible.

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
