# Changelog

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
