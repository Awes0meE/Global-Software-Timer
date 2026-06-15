# MACOS

This folder collects macOS-specific exploration and handoff material for Global
Software Timer.

The current shipped product remains Windows-first. The macOS product direction
is a future SwiftUI/AppKit rewrite, not a permanent reuse of the current
Tauri/React UI. Code under this folder is organized as reference material for
that Mac route.

## Contents

- `native-capture-poc/` - the validated macOS native capture proof of concept,
  including Swift helper code, Rust Tauri-host adapter files, and the local
  feasibility report.

## Privacy Boundary

The macOS route must preserve the existing privacy model:

- No telemetry.
- No cloud upload.
- No account requirement.
- No window-title, document-name, webpage-title, keystroke, mouse-coordinate,
  file-content, or browser-history collection by default.
