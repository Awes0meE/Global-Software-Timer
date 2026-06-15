# macOS Native Capture PoC

This directory archives the macOS native capture proof of concept that was
validated on 2026-06-15.

The PoC used the existing Tauri app as a temporary host, but the long-term macOS
route remains a native SwiftUI/AppKit application. Treat these files as a
handoff package, not as the final Mac app architecture.

## What Was Proven

- Swift/AppKit can enumerate running macOS apps through `NSWorkspace`.
- The helper can return bundle id, localized display name, executable path,
  bundle path, foreground PID, visible-window ownership, and PNG icon data.
- CoreGraphics HID idle time can be read without collecting keystrokes or mouse
  coordinates.
- Rust can parse the Swift helper JSON and adapt it into the existing tracker
  interfaces for a disposable Tauri PoC host.

## Layout

- `tauri-host-files/src-tauri/native/macos/MacCaptureProbe.swift`
  - Swift command-line helper used by the PoC.
- `tauri-host-files/src-tauri/src/macos_capture.rs`
  - Rust serde model, helper runner, mapping functions, and unit tests.
- `tauri-host-files/src-tauri/build.rs`
  - Tauri build hook that compiles the Swift helper on macOS.
- `tauri-host-files/src-tauri/src/activity.rs`
  - Platform activity source that routes macOS idle-time reads through the
    helper.
- `tauri-host-files/src-tauri/src/foreground.rs`
  - Platform foreground source that routes macOS foreground PID reads through
    the helper.
- `tauri-host-files/src-tauri/src/process_source.rs`
  - Platform process source and `MacProcessSource` adapter.
- `tauri-host-files/src-tauri/src/native_icon.rs`
  - Icon cache hook used to seed app icons returned by the Swift helper.
- `tauri-host-files/src-tauri/src/commands.rs`
  - Includes the temporary `debug_macos_native_snapshot` command.
- `tauri-host-files/src-tauri/src/app_state.rs`
  - Shows how the tracker was wired to `PlatformProcessSource`.
- `tauri-host-files/src-tauri/src/lib.rs`
  - Shows module registration, command registration, and platform source
    selection in the background scan loop.
- `tauri-host-files/src-tauri/src/single_instance.rs`
  - Non-Windows lock implementation needed for macOS local verification.
- `tauri-host-files/src-tauri/src/storage.rs`
  - Native path preservation fix observed during macOS test runs.
- `docs/feasibility-report.md`
  - Manual validation report with observed apps, foreground switching, idle
    time behavior, permission notes, and conclusion.

## SwiftUI/AppKit Rewrite Notes

For the real macOS app, keep:

- The Swift capture approach.
- The JSON/data shape as a starting point for a native capture model.
- The privacy boundaries and permission observations.
- The local SQLite domain lessons from the Windows app.

Discard or replace:

- The React dashboard shell.
- Tauri command plumbing.
- Per-query external helper process execution.
- Windows-first identity assumptions where bundle id and bundle path are better
  macOS identifiers.

Open validation item:

- Synthetic keyboard and scroll events did not reset HID idle time in automation.
  The native app needs a physical keyboard/mouse validation pass before relying
  on idle reset behavior for product decisions.
