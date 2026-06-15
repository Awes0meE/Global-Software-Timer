# macOS Native Capture PoC Feasibility Report

Date: 2026-06-15
Branch: `feature/macos-native-capture-poc`

## Environment

| Item | Observed value |
| --- | --- |
| macOS | macOS 26.4.1 |
| Build | 25E253 |
| CPU architecture | arm64 |
| Rust | rustc 1.96.0 (ac68faa20 2026-05-25) |
| Node.js | v20.10.0 |
| npm | 10.2.3 |
| Tauri CLI | tauri-cli 2.11.2 |
| Xcode | Xcode 26.5, Build version 17F42 |

## Helper Verification

| Check | Observed value |
| --- | --- |
| Swift helper build | Passed with `xcrun swiftc src-tauri/native/macos/MacCaptureProbe.swift -o /tmp/gst-macos-capture-probe` |
| JSON returned | Yes |
| Apps returned | 140 in the final sample |
| Observed app names | `访达`, `Safari浏览器`, `Google Chrome`, `Code`, `终端` |
| Observed foreground PID | 51928 |
| Observed foreground app | `Code`, bundle id `com.microsoft.VSCode` |
| Observed idle seconds | 1122.827 in the final sample |
| Icon base64 present | Yes, 140 of 140 final-sample app records had `iconPngBase64` |

## App Detection Matrix

| App | Detected | Bundle id | Executable path | Visible window | Icon | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Finder | Yes | `com.apple.finder` | `/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder` | No in final sample; Yes during foreground-switch sample | Yes | Display name returned as `访达`; PID 1347 |
| Safari | Yes | `com.apple.Safari` | `/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari` | No in final sample; Yes during foreground-switch sample | Yes | Display name returned as `Safari浏览器`; PID 5614 |
| Google Chrome | Yes | `com.google.Chrome` | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | No | Yes | Installed and launched; `open -a Google Chrome` did not make it foreground in this run; PID 13857 |
| Visual Studio Code | Yes | `com.microsoft.VSCode` | `/Applications/Visual Studio Code.app/Contents/MacOS/Code` | Yes | Yes | Foreground in final sample; PID 51928 |
| Terminal | Yes | `com.apple.Terminal` | `/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal` | No in final sample; Yes during foreground-switch sample | Yes | Display name returned as `终端`; PID 13786 |
| Xcode | No | Not running | `/Applications/Xcode.app` installed | No | No runtime record | Installed but not running during capture |
| Notion | No | Not running | `/Applications/Notion.app` installed | No | No runtime record | Installed but not running during capture |
| Obsidian | No | Not installed | Not installed | No | No runtime record | `/Applications/Obsidian.app` was absent |

## Foreground Switching

| Transition | Observed result |
| --- | --- |
| Finder to Terminal | Finder activation returned foreground PID 1347, `访达`, `com.apple.finder`, visible window Yes; Terminal activation returned foreground PID 13786, `终端`, `com.apple.Terminal`, visible window Yes |
| Terminal to VS Code | Terminal activation returned foreground PID 13786; Visual Studio Code activation returned foreground PID 51928, `Code`, `com.microsoft.VSCode`, visible window Yes |
| Browser to editor | Safari activation returned foreground PID 5614, `Safari浏览器`, `com.apple.Safari`, visible window Yes; Visual Studio Code activation returned foreground PID 51928, `Code`, `com.microsoft.VSCode`, visible window Yes |
| Chrome note | `open -a Google Chrome` launched Chrome and it appeared in the app list, but foreground stayed on VS Code in this run |

## Idle Time

| Check | Observed result |
| --- | --- |
| Idle increase | Idle rose from 1161.206 seconds to 1164.856 seconds after a 3 second wait |
| Keyboard reset | A synthetic Escape key event returned exit code 0 but did not reset HID idle time; idle continued to 1170.745 seconds |
| Mouse reset | A synthetic scroll event returned exit code 0 but did not reset HID idle time; idle continued from 1174.390 seconds to 1176.576 seconds |
| Interpretation | `CGEventSource.secondsSinceLastEventType(.hidSystemState, ...)` returned plausible idle growth and appears to ignore synthetic events in this automation run; physical keyboard and mouse reset behavior still needs a human-device validation pass |

## Permissions

| Permission | Required for | Denied behavior | SwiftUI rewrite implication |
| --- | --- | --- | --- |
| Accessibility | Synthetic input automation and possible future enhanced foreground/workspace controls | Not required for this helper run; no prompt observed; synthetic events did not reset HID idle | Do not request by default; reserve for explicit opt-in enhanced features if needed |
| Screen Recording | Window titles or screen content capture | Not required in this run; no prompt observed; helper only used owner PID/layer from `CGWindowListCopyWindowInfo` | Avoid for baseline runtime tracking; requesting it would conflict with the privacy-first default |
| Automation | Apple Events control of other apps | Not required in this run; `open -a` activation worked without an Automation prompt | Avoid dependency for production capture; native AppKit/CoreGraphics service should observe, not control, other apps |

## Privacy Check

| Data category | Persisted by PoC | Returned by helper | Notes |
| --- | --- | --- | --- |
| Window titles | No | No | Helper reads window owner PID and layer only |
| Document names | No | No | No document APIs used |
| Webpage titles | No | No | Browser content is not inspected |
| Keystrokes | No | No | Idle API reads elapsed time since input type, not key values |
| Mouse coordinates | No | No | Helper does not serialize pointer coordinates |
| File contents | No | No | Executable path and bundle metadata only |
| Browser history | No | No | No browser APIs or profile files used |
| Network upload | No | No | Helper prints local JSON to stdout only |

## Conclusion

Native macOS capture is feasible for the core PoC target. The Swift helper can return running app records, foreground PID, visible-window ownership, bundle metadata, executable paths, icon PNG base64, and idle seconds without requesting Screen Recording, Accessibility, Automation, admin permission, telemetry, accounts, or network upload.

Main blockers for a polished macOS product are not basic data access. The open items are physical HID reset validation, permission behavior across clean user accounts, launch agent/startup integration, signing/notarization, and reducing the current helper-per-query overhead.

Recommended SwiftUI rewrite direction: build a native AppKit/SwiftUI menu bar app with one in-process capture service that samples `NSWorkspace`, CoreGraphics window ownership, and HID idle time once per tick, then writes to the same local SQLite-shaped domain model. Keep the strict privacy boundary: no window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, browser history, telemetry, or cloud upload by default.

Current Tauri PoC code worth keeping: the Swift capture shape, JSON field names, Rust serde mapping tests, tracker adapter boundaries, icon data URL seeding concept, and the feasibility report. Current Tauri PoC code to discard for the long-term Mac product: React dashboard shell, Tauri command surface, external helper process invocation per capture, and macOS behavior coupled to the Windows-first Rust tracker loop.
