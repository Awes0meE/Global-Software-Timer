# macOS Native Capture PoC Design

Date: 2026-06-15
Status: Draft for review

## Goal

Build a narrow macOS proof of concept for Global Software Timer that validates whether the app can reliably collect the native data needed for a future SwiftUI/AppKit macOS rewrite.

The PoC uses the existing Tauri v2 application as a temporary host, but the macOS data collection path should be implemented through a Swift or Objective-C native bridge. The goal is to prove the native capture layer, not to make the current Tauri/React app the long-term macOS product architecture.

## Product Direction

Short term:

- Use the current Tauri/Rust/React/SQLite repository as the fastest test harness.
- Add a native macOS bridge for process, foreground, idle, and icon collection.
- Keep the PoC small enough that it can be discarded after the native feasibility questions are answered.

Long term:

- Build the real macOS app as a SwiftUI/AppKit native application.
- Reuse product decisions, privacy boundaries, data model lessons, and validated native capture code.
- Do not treat the current React dashboard as the long-term macOS UI.
- Keep the Windows Tauri app and the future macOS SwiftUI app as sibling products that share concepts, not necessarily one UI codebase.

## PoC Scope

The PoC includes:

- A macOS native bridge under the Tauri app.
- A native snapshot of currently running user applications.
- Foreground application or foreground window owner detection.
- User idle duration detection.
- Basic `.app` bundle metadata extraction:
  - bundle identifier
  - localized display name
  - executable path
  - icon image data
- Rust adapters that map native output into the existing interfaces:
  - `ProcessSnapshot`
  - `ProcessSource`
  - `ForegroundWindowSource`
  - `ActivitySource`
- A debug command that returns the latest macOS native snapshot to the frontend or logs.
- Focused tests for data mapping and platform fallbacks.
- A written feasibility report after running the PoC locally.

The PoC does not include:

- A SwiftUI product UI.
- A polished macOS onboarding flow.
- Production signing, notarization, or release packaging.
- Long-term analytics pages.
- Cloud sync, accounts, licensing, or telemetry.
- Window title, document name, webpage title, keystroke, mouse-coordinate, file-content, or browser-history collection.
- A cross-platform abstraction rewrite beyond what is needed to host the PoC.

## Success Criteria

The PoC succeeds if it can answer these questions with evidence:

- Can GST identify common user-facing macOS apps such as Finder, Safari, Chrome, VS Code, Terminal, Xcode, Notion, and Obsidian?
- Can GST distinguish foreground and background app ownership without storing window titles?
- Can GST measure machine-level active time from user idle duration?
- Can GST extract stable app identity from bundle id plus executable path?
- Can GST extract enough icon data for a software list?
- Which permissions are required for reliable results?
- Which APIs work without extra permissions?
- Which behaviors are brittle enough that the SwiftUI rewrite must design around them?

## Architecture

The existing Tauri app remains the host:

```text
React debug UI / logs
        |
        | Tauri command
        v
Rust app core
        |
        | FFI / native bridge wrapper
        v
Swift or Objective-C macOS bridge
        |
        | AppKit / CoreGraphics / CoreServices
        v
macOS process, window, activity, and bundle metadata
```

The important boundary is between Rust and the native macOS bridge. Rust should receive already-normalized native records and map them into existing GST domain concepts. Rust should not directly own complex AppKit/CoreGraphics object lifetimes unless the bridge approach proves too limited.

## Native Bridge Shape

Create a native bridge folder:

```text
src-tauri/native/macos/
```

Expected bridge responsibilities:

- Query running applications.
- Query foreground application or foreground window owner.
- Query idle duration.
- Resolve application bundle metadata.
- Return plain serialized data to Rust.

Preferred bridge output shape:

```text
MacNativeAppSnapshot
- pid
- process_name
- executable_path
- bundle_id
- display_name
- bundle_path
- icon_png_base64
- is_foreground
- has_visible_window
```

Rust should convert this to existing structures:

- `ProcessSnapshot.pid`
- `ProcessSnapshot.process_name`
- `ProcessSnapshot.executable_path`
- `ProcessSnapshot.has_visible_window`
- `ForegroundWindowSource::foreground_pid()`
- `ActivitySource::idle_duration()`

## Platform API Direction

The PoC should evaluate these macOS API families:

- AppKit `NSWorkspace` and `NSRunningApplication` for running app identity.
- CoreGraphics window-list APIs for foreground or visible-window owner PID detection.
- CoreGraphics event-source idle-time APIs for machine idle duration.
- Bundle metadata APIs for display name, bundle id, executable URL, and icon.

The bridge must not persist window titles or document titles. If a native API returns those values as part of a larger record, the bridge should discard them before returning data to Rust.

## Existing Code Touchpoints

The PoC should keep existing app logic mostly intact.

Expected Rust touchpoints:

- `src-tauri/src/process_source.rs`
  - Add a macOS-backed process source or route `SysinfoProcessSource` through native visible-window data on macOS.
- `src-tauri/src/foreground.rs`
  - Add `MacForegroundWindowSource`.
- `src-tauri/src/activity.rs`
  - Add `MacActivitySource`.
- `src-tauri/src/native_icon.rs`
  - Add macOS bundle icon extraction or route icon extraction through the bridge.
- `src-tauri/src/lib.rs`
  - Select platform-specific source types in the background scan loop.
- `src-tauri/src/commands.rs`
  - Add a temporary debug command only if needed for inspection.

Avoid broad rewrites to storage, dashboard rendering, software-page tables, or the classifier unless a small platform correction is required.

## Privacy Boundary

The PoC keeps the existing privacy model:

- No telemetry.
- No cloud upload.
- No accounts.
- No window-title storage.
- No document-name storage.
- No webpage-title storage.
- No keystroke collection.
- No mouse-coordinate collection.
- No file-content collection.
- No browser-history collection.

If a permission is needed, the PoC should record exactly:

- Which permission was requested.
- Which API required it.
- What breaks when the permission is denied.
- Whether the future SwiftUI app can explain the permission clearly.

## Validation Plan

Manual validation should cover:

- Launch the Tauri dev app on macOS.
- Open common apps and confirm they appear in the native snapshot.
- Switch foreground focus between apps and confirm foreground PID updates.
- Let the machine sit idle and confirm idle duration increases.
- Move input and confirm idle duration resets.
- Confirm icons appear for at least a few `.app` bundles.
- Deny or remove relevant permissions and document degraded behavior.

Automated validation should cover:

- Rust mapping from native records to `ProcessSnapshot`.
- Foreground PID selection when one native record is marked foreground.
- Idle duration conversion.
- Empty or permission-denied native output.
- Platform-specific icon behavior so macOS does not fail Windows-oriented icon assertions.

## Risks

### Permission Ambiguity

macOS may restrict parts of window and process inspection depending on API, OS version, sandboxing, and user privacy settings. The PoC must treat permission behavior as a first-class result, not an implementation detail.

### Bridge Complexity

Swift-to-Rust or Objective-C-to-Rust bridging can add build complexity. The PoC should prefer the simplest bridge that can prove data collection. A polished module boundary can wait until the SwiftUI rewrite.

### False Confidence From Tauri Host

The Tauri app is only a host. If the bridge works inside Tauri, the conclusion should be about native macOS capture feasibility, not about keeping Tauri for the final Mac product.

### Data Identity Differences

Windows uses executable names and paths heavily. macOS app identity should prefer bundle id plus bundle path when available, with executable path as a fallback. The SwiftUI rewrite should design around bundle identity from the beginning.

## Long-Term SwiftUI Rewrite Hand-Off

After the PoC, write a feasibility report that becomes input to a separate SwiftUI design spec.

The SwiftUI rewrite should own:

- Menu bar app behavior.
- Native settings and permission onboarding.
- App lifecycle and launch-at-login behavior.
- Local SQLite storage.
- Native software list and dashboard UI.
- macOS-first identity model.
- Packaging, signing, notarization, and update strategy.

The current Tauri app should remain useful as:

- The Windows product.
- A reference implementation of tracker concepts.
- A source of storage and privacy lessons.
- A disposable macOS experimentation harness.

## Open Decisions For Implementation Planning

- Use Swift bridge or Objective-C bridge for the first PoC.
- Return native data through direct FFI, a generated static library, or a command-line helper.
- Whether icon data should be collected in the same bridge call or a separate lazy lookup.
- Whether the debug surface should be a temporary Tauri command, logs, or a small development-only frontend panel.
- Whether to add a separate Cargo feature such as `macos-poc` to keep the bridge isolated.
