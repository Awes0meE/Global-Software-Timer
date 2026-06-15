# macOS Native Capture PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS native capture proof of concept that uses a Swift command-line helper under the existing Tauri app to validate running-app, foreground-app, idle-time, and app-icon collection for a future SwiftUI/AppKit rewrite.

**Architecture:** Keep the current Tauri/Rust app as a disposable PoC host. Compile a macOS-only Swift helper from `src-tauri/native/macos/MacCaptureProbe.swift`, have Rust execute it and parse JSON, then adapt the native records into existing tracker interfaces. This proves native macOS capture feasibility without committing the long-term Mac product to Tauri/React.

**Tech Stack:** Tauri v2, Rust, Swift, AppKit, CoreGraphics, serde JSON, SQLite-backed existing tracker tests.

---

## File Structure

- Create: `src-tauri/native/macos/MacCaptureProbe.swift` - native macOS capture probe that prints JSON.
- Create: `src-tauri/src/macos_capture.rs` - Rust data model, helper runner, JSON parser, and adapters for macOS capture output.
- Modify: `src-tauri/build.rs` - compile the Swift helper on macOS and expose its path through a compile-time env var.
- Modify: `src-tauri/src/lib.rs` - register `macos_capture`, use platform activity/foreground sources, and register debug command.
- Modify: `src-tauri/src/app_state.rs` - use a platform process source so macOS can use native capture while Windows keeps `sysinfo`.
- Modify: `src-tauri/src/process_source.rs` - add `PlatformProcessSource` and macOS process snapshots.
- Modify: `src-tauri/src/foreground.rs` - add `PlatformForegroundWindowSource` and macOS foreground PID lookup.
- Modify: `src-tauri/src/activity.rs` - add `PlatformActivitySource` and macOS idle duration lookup.
- Modify: `src-tauri/src/native_icon.rs` - allow macOS capture to seed icon data by executable path and make Windows-oriented icon tests platform-safe.
- Modify: `src-tauri/src/commands.rs` - add a development-only native snapshot command for inspection.
- Create: `docs/superpowers/reports/2026-06-15-macos-native-capture-poc-feasibility.md` - manual validation report after running the PoC.

---

### Task 1: Rust macOS Capture Model And Mapping

**Files:**
- Create: `src-tauri/src/macos_capture.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing parser and adapter tests**

Create `src-tauri/src/macos_capture.rs` with the test module first:

```rust
use crate::process_source::ProcessSnapshot;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacCaptureOutput {
    pub idle_seconds: f64,
    pub foreground_pid: Option<u32>,
    pub apps: Vec<MacNativeAppSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacNativeAppSnapshot {
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
    pub bundle_id: Option<String>,
    pub display_name: String,
    pub bundle_path: Option<String>,
    pub icon_png_base64: Option<String>,
    pub is_foreground: bool,
    pub has_visible_window: bool,
}

pub fn parse_capture_output(stdout: &str) -> Result<MacCaptureOutput, serde_json::Error> {
    serde_json::from_str(stdout)
}

pub fn process_snapshots_from_capture(capture: &MacCaptureOutput) -> Vec<ProcessSnapshot> {
    capture
        .apps
        .iter()
        .map(|app| ProcessSnapshot {
            pid: app.pid,
            process_name: app.process_name.clone(),
            executable_path: app.executable_path.clone(),
            is_background_helper: false,
            has_visible_window: app.has_visible_window,
        })
        .collect()
}

pub fn foreground_pid_from_capture(capture: &MacCaptureOutput) -> Option<u32> {
    capture
        .foreground_pid
        .or_else(|| capture.apps.iter().find(|app| app.is_foreground).map(|app| app.pid))
}

pub fn idle_duration_from_capture(capture: &MacCaptureOutput) -> Duration {
    if capture.idle_seconds.is_finite() && capture.idle_seconds > 0.0 {
        Duration::from_millis((capture.idle_seconds * 1000.0).round() as u64)
    } else {
        Duration::ZERO
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_JSON: &str = r#"{
      "idleSeconds": 12.5,
      "foregroundPid": 123,
      "apps": [
        {
          "pid": 123,
          "processName": "Code",
          "executablePath": "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
          "bundleId": "com.microsoft.VSCode",
          "displayName": "Visual Studio Code",
          "bundlePath": "/Applications/Visual Studio Code.app",
          "iconPngBase64": "aWNvbg==",
          "isForeground": true,
          "hasVisibleWindow": true
        },
        {
          "pid": 456,
          "processName": "Notion",
          "executablePath": "/Applications/Notion.app/Contents/MacOS/Notion",
          "bundleId": "notion.id",
          "displayName": "Notion",
          "bundlePath": "/Applications/Notion.app",
          "iconPngBase64": null,
          "isForeground": false,
          "hasVisibleWindow": false
        }
      ]
    }"#;

    #[test]
    fn parses_swift_capture_json() {
        let capture = parse_capture_output(SAMPLE_JSON).expect("capture json");

        assert_eq!(capture.idle_seconds, 12.5);
        assert_eq!(capture.foreground_pid, Some(123));
        assert_eq!(capture.apps.len(), 2);
        assert_eq!(capture.apps[0].bundle_id.as_deref(), Some("com.microsoft.VSCode"));
    }

    #[test]
    fn maps_native_apps_to_process_snapshots() {
        let capture = parse_capture_output(SAMPLE_JSON).expect("capture json");
        let snapshots = process_snapshots_from_capture(&capture);

        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].pid, 123);
        assert_eq!(snapshots[0].process_name, "Code");
        assert_eq!(snapshots[0].executable_path, "/Applications/Visual Studio Code.app/Contents/MacOS/Electron");
        assert!(snapshots[0].has_visible_window);
        assert!(!snapshots[0].is_background_helper);
        assert!(!snapshots[1].has_visible_window);
    }

    #[test]
    fn derives_foreground_pid_and_idle_duration() {
        let capture = parse_capture_output(SAMPLE_JSON).expect("capture json");

        assert_eq!(foreground_pid_from_capture(&capture), Some(123));
        assert_eq!(idle_duration_from_capture(&capture), Duration::from_millis(12_500));
    }

    #[test]
    fn falls_back_to_foreground_app_flag_when_pid_is_missing() {
        let mut capture = parse_capture_output(SAMPLE_JSON).expect("capture json");
        capture.foreground_pid = None;

        assert_eq!(foreground_pid_from_capture(&capture), Some(123));
    }

    #[test]
    fn clamps_invalid_idle_duration_to_zero() {
        let mut capture = parse_capture_output(SAMPLE_JSON).expect("capture json");
        capture.idle_seconds = f64::NAN;

        assert_eq!(idle_duration_from_capture(&capture), Duration::ZERO);
    }
}
```

Register the module in `src-tauri/src/lib.rs`:

```rust
pub mod macos_capture;
```

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml macos_capture
```

Expected: PASS for the pure parser and mapping tests. This task does not execute native Swift yet.

- [ ] **Step 2: Commit**

Run:

```bash
git add src-tauri/src/macos_capture.rs src-tauri/src/lib.rs
git commit -m "test(macos): add native capture mapping model"
```

Expected: commit succeeds.

---

### Task 2: Swift Capture Helper And Build Wiring

**Files:**
- Create: `src-tauri/native/macos/MacCaptureProbe.swift`
- Modify: `src-tauri/build.rs`

- [ ] **Step 1: Create the Swift helper**

Create `src-tauri/native/macos/MacCaptureProbe.swift`:

```swift
import AppKit
import CoreGraphics
import Foundation

struct CaptureOutput: Encodable {
    let idleSeconds: Double
    let foregroundPid: Int32?
    let apps: [AppSnapshot]
}

struct AppSnapshot: Encodable {
    let pid: Int32
    let processName: String
    let executablePath: String
    let bundleId: String?
    let displayName: String
    let bundlePath: String?
    let iconPngBase64: String?
    let isForeground: Bool
    let hasVisibleWindow: Bool
}

func visibleWindowPids() -> Set<Int32> {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let rawList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    var pids = Set<Int32>()
    for window in rawList {
        let layer = window[kCGWindowLayer as String] as? Int ?? 0
        guard layer == 0 else {
            continue
        }
        if let pid = window[kCGWindowOwnerPID as String] as? Int32 {
            pids.insert(pid)
        }
    }
    return pids
}

func pngBase64(for icon: NSImage?) -> String? {
    guard let icon else {
        return nil
    }

    let targetSize = NSSize(width: 64, height: 64)
    let image = NSImage(size: targetSize)
    image.lockFocus()
    icon.draw(in: NSRect(origin: .zero, size: targetSize))
    image.unlockFocus()

    guard
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let png = bitmap.representation(using: .png, properties: [:])
    else {
        return nil
    }

    return png.base64EncodedString()
}

func secondsSinceLastInput() -> Double {
    let eventTypes: [CGEventType] = [
        .leftMouseDown,
        .rightMouseDown,
        .mouseMoved,
        .leftMouseDragged,
        .rightMouseDragged,
        .keyDown,
        .scrollWheel,
        .tabletPointer
    ]

    let seconds = eventTypes.map {
        CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: $0)
    }

    return seconds.min() ?? 0
}

func capture() -> CaptureOutput {
    let foregroundPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
    let windowPids = visibleWindowPids()
    let apps = NSWorkspace.shared.runningApplications.compactMap { app -> AppSnapshot? in
        guard let executablePath = app.executableURL?.path else {
            return nil
        }

        let pid = app.processIdentifier
        let fallbackName = URL(fileURLWithPath: executablePath).deletingPathExtension().lastPathComponent
        let displayName = app.localizedName ?? fallbackName
        let processName = URL(fileURLWithPath: executablePath).lastPathComponent

        return AppSnapshot(
            pid: pid,
            processName: processName,
            executablePath: executablePath,
            bundleId: app.bundleIdentifier,
            displayName: displayName,
            bundlePath: app.bundleURL?.path,
            iconPngBase64: pngBase64(for: app.icon),
            isForeground: foregroundPid == pid,
            hasVisibleWindow: windowPids.contains(pid)
        )
    }

    return CaptureOutput(
        idleSeconds: secondsSinceLastInput(),
        foregroundPid: foregroundPid,
        apps: apps
    )
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

do {
    let data = try encoder.encode(capture())
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("failed to encode capture output: \(error)\n".utf8))
    exit(1)
}
```

- [ ] **Step 2: Verify the helper directly**

Run:

```bash
xcrun swiftc src-tauri/native/macos/MacCaptureProbe.swift -o /tmp/gst-macos-capture-probe
/tmp/gst-macos-capture-probe | python3 -m json.tool | sed -n '1,80p'
```

Expected: JSON output with `apps`, `foregroundPid`, and `idleSeconds`. At least Finder or Terminal should appear when running on macOS.

- [ ] **Step 3: Compile the helper from `build.rs` on macOS**

Replace `src-tauri/build.rs` with:

```rust
use std::path::PathBuf;
use std::process::Command;

fn main() {
    compile_macos_capture_probe();
    tauri_build::build();
}

fn compile_macos_capture_probe() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let source = manifest_dir.join("native/macos/MacCaptureProbe.swift");
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("out dir"));
    let output = out_dir.join("gst-macos-capture-probe");

    println!("cargo:rerun-if-changed={}", source.display());

    let status = Command::new("xcrun")
        .args(["swiftc"])
        .arg(&source)
        .arg("-o")
        .arg(&output)
        .status()
        .expect("failed to run xcrun swiftc for macOS capture probe");

    if !status.success() {
        panic!("xcrun swiftc failed for {}", source.display());
    }

    println!("cargo:rustc-env=GST_MACOS_CAPTURE_HELPER={}", output.display());
}
```

- [ ] **Step 4: Verify Cargo build wiring**

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml macos_capture
```

Expected: PASS. On macOS, Cargo should compile the Swift helper before Rust tests run.

- [ ] **Step 5: Commit**

Run:

```bash
git add src-tauri/native/macos/MacCaptureProbe.swift src-tauri/build.rs
git commit -m "build(macos): compile native capture probe"
```

Expected: commit succeeds.

---

### Task 3: Rust Helper Runner And Platform Sources

**Files:**
- Modify: `src-tauri/src/macos_capture.rs`
- Modify: `src-tauri/src/process_source.rs`
- Modify: `src-tauri/src/foreground.rs`
- Modify: `src-tauri/src/activity.rs`
- Modify: `src-tauri/src/native_icon.rs`
- Modify: `src-tauri/src/app_state.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add native helper execution to `macos_capture.rs`**

Add:

```rust
use std::path::PathBuf;
use std::process::Command;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MacCaptureError {
    #[error("macOS capture helper is unavailable")]
    HelperUnavailable,
    #[error("macOS capture helper failed: {0}")]
    HelperFailed(String),
    #[error("macOS capture helper output was invalid: {0}")]
    InvalidOutput(#[from] serde_json::Error),
    #[error("macOS capture helper could not be launched: {0}")]
    Io(#[from] std::io::Error),
}

pub type MacCaptureResult<T> = Result<T, MacCaptureError>;

#[cfg(target_os = "macos")]
fn helper_path() -> Option<PathBuf> {
    option_env!("GST_MACOS_CAPTURE_HELPER").map(PathBuf::from)
}

#[cfg(not(target_os = "macos"))]
fn helper_path() -> Option<PathBuf> {
    None
}

pub fn capture_once() -> MacCaptureResult<MacCaptureOutput> {
    let helper = helper_path().ok_or(MacCaptureError::HelperUnavailable)?;
    let output = Command::new(helper).output()?;
    if !output.status.success() {
        return Err(MacCaptureError::HelperFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_capture_output(&stdout).map_err(MacCaptureError::from)
}

pub fn icon_data_url_from_base64(icon_png_base64: Option<&str>) -> Option<String> {
    let icon = icon_png_base64?.trim();
    if icon.is_empty() {
        None
    } else {
        Some(format!("data:image/png;base64,{icon}"))
    }
}
```

Add tests:

```rust
#[test]
fn builds_icon_data_url_from_base64() {
    assert_eq!(
        icon_data_url_from_base64(Some("aWNvbg==")).as_deref(),
        Some("data:image/png;base64,aWNvbg==")
    );
    assert_eq!(icon_data_url_from_base64(Some("   ")), None);
    assert_eq!(icon_data_url_from_base64(None), None);
}
```

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml macos_capture
```

Expected: PASS.

- [ ] **Step 2: Let macOS capture seed icon data**

In `src-tauri/src/native_icon.rs`, add:

```rust
pub fn remember_native_icon_data_url_for_path(executable_path: &str, icon_data_url: String) {
    let key = executable_path.trim();
    if key.is_empty() || !icon_data_url.starts_with("data:image/png;base64,") {
        return;
    }

    let cache = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut icons) = cache.lock() {
        icons.insert(key.to_string(), Some(icon_data_url));
    }
}
```

Make the Windows-only assertion in `src-tauri/src/commands.rs` platform-safe by changing:

```rust
assert!(summary.apps[0].icon_data_url.is_none());
```

to:

```rust
#[cfg(target_os = "windows")]
assert!(summary.apps[0].icon_data_url.is_none());
#[cfg(not(target_os = "windows"))]
let _ = &summary.apps[0].icon_data_url;
```

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml commands::tests::dashboard_summary_reads_sessions_and_daily_system_usage
```

Expected: PASS on macOS.

- [ ] **Step 3: Add `PlatformProcessSource`**

In `src-tauri/src/process_source.rs`, add:

```rust
pub enum PlatformProcessSource {
    Sysinfo(SysinfoProcessSource),
    #[cfg(target_os = "macos")]
    Mac(MacProcessSource),
}

impl PlatformProcessSource {
    pub fn new() -> Self {
        #[cfg(target_os = "macos")]
        {
            return Self::Mac(MacProcessSource);
        }

        #[cfg(not(target_os = "macos"))]
        {
            Self::Sysinfo(SysinfoProcessSource::new())
        }
    }
}

impl Default for PlatformProcessSource {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessSource for PlatformProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        match self {
            Self::Sysinfo(source) => source.snapshot(),
            #[cfg(target_os = "macos")]
            Self::Mac(source) => source.snapshot(),
        }
    }
}

#[cfg(target_os = "macos")]
pub struct MacProcessSource;

#[cfg(target_os = "macos")]
impl ProcessSource for MacProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        match crate::macos_capture::capture_once() {
            Ok(capture) => {
                for app in &capture.apps {
                    if let Some(icon_data_url) =
                        crate::macos_capture::icon_data_url_from_base64(app.icon_png_base64.as_deref())
                    {
                        crate::native_icon::remember_native_icon_data_url_for_path(
                            &app.executable_path,
                            icon_data_url,
                        );
                    }
                }
                crate::macos_capture::process_snapshots_from_capture(&capture)
            }
            Err(error) => {
                eprintln!("macOS capture failed: {error}");
                Vec::new()
            }
        }
    }
}
```

Modify `src-tauri/src/app_state.rs`:

```rust
use crate::process_source::PlatformProcessSource;
```

Change:

```rust
pub type SharedTracker = Arc<Mutex<Tracker<SysinfoProcessSource>>>;
```

to:

```rust
pub type SharedTracker = Arc<Mutex<Tracker<PlatformProcessSource>>>;
```

Change:

```rust
let tracker = Tracker::new(store, SysinfoProcessSource::new());
```

to:

```rust
let tracker = Tracker::new(store, PlatformProcessSource::new());
```

- [ ] **Step 4: Add platform foreground and activity sources**

In `src-tauri/src/foreground.rs`, add:

```rust
pub struct PlatformForegroundWindowSource;

impl ForegroundWindowSource for PlatformForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        #[cfg(target_os = "macos")]
        {
            return crate::macos_capture::capture_once()
                .ok()
                .and_then(|capture| crate::macos_capture::foreground_pid_from_capture(&capture));
        }

        #[cfg(target_os = "windows")]
        {
            return WindowsForegroundWindowSource.foreground_pid();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            None
        }
    }
}
```

In `src-tauri/src/activity.rs`, add:

```rust
#[derive(Debug, Default)]
pub struct PlatformActivitySource;

impl ActivitySource for PlatformActivitySource {
    fn idle_duration(&self) -> Duration {
        #[cfg(target_os = "macos")]
        {
            return crate::macos_capture::capture_once()
                .map(|capture| crate::macos_capture::idle_duration_from_capture(&capture))
                .unwrap_or(Duration::ZERO);
        }

        #[cfg(target_os = "windows")]
        {
            return WindowsActivitySource.idle_duration();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Duration::ZERO
        }
    }
}
```

In `src-tauri/src/lib.rs`, change:

```rust
let activity_source = activity::WindowsActivitySource;
```

to:

```rust
let activity_source = activity::PlatformActivitySource;
```

Change:

```rust
let foreground_source = foreground::WindowsForegroundWindowSource;
```

to:

```rust
let foreground_source = foreground::PlatformForegroundWindowSource;
```

- [ ] **Step 5: Verify platform-source integration**

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml macos_capture
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml --test tracker_tests
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml commands::tests::dashboard_summary_reads_sessions_and_daily_system_usage
```

Expected: all PASS on macOS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src-tauri/src/macos_capture.rs src-tauri/src/process_source.rs src-tauri/src/foreground.rs src-tauri/src/activity.rs src-tauri/src/native_icon.rs src-tauri/src/app_state.rs src-tauri/src/lib.rs src-tauri/src/commands.rs
git commit -m "feat(macos): route tracker through native capture probe"
```

Expected: commit succeeds.

---

### Task 4: Development Debug Command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add a temporary debug command**

In `src-tauri/src/commands.rs`, add:

```rust
#[tauri::command]
pub fn debug_macos_native_snapshot() -> Result<Option<crate::macos_capture::MacCaptureOutput>, String> {
    #[cfg(target_os = "macos")]
    {
        return crate::macos_capture::capture_once()
            .map(Some)
            .map_err(|error| error.to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}
```

In `src-tauri/src/lib.rs`, register it:

```rust
commands::debug_macos_native_snapshot
```

inside `tauri::generate_handler![...]`.

- [ ] **Step 2: Verify backend command registration**

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

Expected: Rust tests compile and frontend production build still passes.

- [ ] **Step 3: Run the dev app for manual command inspection**

Run:

```bash
PATH="/opt/homebrew/opt/rustup/bin:$PATH" npm run tauri:dev
```

Expected: the app launches on macOS. Use the WebView devtools console or temporary local debugging to invoke `debug_macos_native_snapshot` and confirm the command returns `apps`, `foregroundPid`, and `idleSeconds`.

Do not commit a permanent frontend panel for this PoC unless manual inspection through the command is not workable.

- [ ] **Step 4: Commit**

Run:

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(macos): expose native capture debug snapshot"
```

Expected: commit succeeds.

---

### Task 5: Manual Validation Report

**Files:**
- Create: `docs/superpowers/reports/2026-06-15-macos-native-capture-poc-feasibility.md`

- [ ] **Step 1: Capture environment and native probe output**

Run:

```bash
sw_vers
uname -m
PATH="/opt/homebrew/opt/rustup/bin:$PATH" rustc --version
node -v
npm -v
PATH="/opt/homebrew/opt/rustup/bin:$PATH" npm run tauri -- --version
xcodebuild -version
xcrun swiftc src-tauri/native/macos/MacCaptureProbe.swift -o /tmp/gst-macos-capture-probe
/tmp/gst-macos-capture-probe | python3 -m json.tool | sed -n '1,80p'
```

Expected: commands return environment details and readable capture JSON. Keep the terminal output available for the next step.

- [ ] **Step 2: Create the report from observed results**

Create `docs/superpowers/reports/2026-06-15-macos-native-capture-poc-feasibility.md` with real observed values. Use `Not installed` for apps that are not present on the test Mac. Use `Not required in this run` for permissions that were not prompted or needed.

The report must include these sections with measured values, not prompts:

- `Environment`: macOS version/build, CPU architecture, Rust version, Node version, npm version, Tauri CLI version, Xcode version.
- `Helper Verification`: whether JSON returned, observed app names, observed foreground PID, observed idle seconds, and whether icon base64 was present.
- `App Detection Matrix`: one row each for Finder, Safari, Google Chrome, Visual Studio Code, Terminal, Xcode, Notion, and Obsidian. Each row must include detected yes/no, bundle id, executable path, visible-window yes/no, icon yes/no, and notes.
- `Foreground Switching`: observed transition for Finder to Terminal, Terminal to VS Code, and browser to editor.
- `Idle Time`: observed idle increase, keyboard reset, and mouse reset behavior.
- `Permissions`: one row each for Accessibility, Screen Recording, and Automation. Each row must include required-for, denied behavior, and SwiftUI rewrite implication.
- `Privacy Check`: fixed values showing window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, and browser history were not persisted.
- `Conclusion`: native capture feasibility, main blockers, recommended SwiftUI rewrite direction, current Tauri PoC code to keep, and current Tauri PoC code to discard.

Before committing, run:

```bash
python3 - <<'PY'
from pathlib import Path
path = Path("docs/superpowers/reports/2026-06-15-macos-native-capture-poc-feasibility.md")
text = path.read_text()
markers = ["TB" + "D", "TO" + "DO", "FIX" + "ME", "|  |"]
found = [marker for marker in markers if marker in text]
if found:
    raise SystemExit(f"unfinished report markers: {found}")
PY
```

Expected: no unfinished markers and no empty table cells remain.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/reports/2026-06-15-macos-native-capture-poc-feasibility.md
git commit -m "docs(macos): record native capture poc feasibility"
```

Expected: commit succeeds after the report is fully filled in.

---

### Task 6: Full Verification And Review

**Files:**
- Modify: `memory.md`
- Optionally modify: `CHANGELOG.md`

- [ ] **Step 1: Update project memory**

In `memory.md`, add a current repository note that macOS native capture PoC work was added with:

- Swift helper under the Tauri host.
- Rust mapping/adapters.
- Debug command for native snapshot inspection.
- Feasibility report path.
- Long-term direction remains SwiftUI/AppKit native rewrite.

If this PoC is not part of an upcoming shipped release, do not add it to `CHANGELOG.md`. If it will be mentioned in an unreleased developer section, add a concise `Unreleased` entry that clearly marks it as a macOS PoC.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run build
PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

- Frontend tests PASS.
- Frontend production build PASS.
- Rust tests PASS on macOS.

- [ ] **Step 3: Self-review against the spec**

Review `docs/superpowers/specs/2026-06-15-macos-poc-design.md` and confirm:

- Native bridge exists under `src-tauri/native/macos/`.
- Running app snapshot exists.
- Foreground PID detection exists.
- Idle duration detection exists.
- Bundle metadata extraction exists.
- Icon extraction exists.
- Rust adapters map native output into existing tracker interfaces.
- Debug command or logs expose snapshot data.
- Feasibility report exists.
- No privacy-sensitive fields are stored or returned beyond the PoC scope.

Fix any mismatch and rerun affected checks.

- [ ] **Step 4: Code-quality review**

Review for:

- macOS code behind `#[cfg(target_os = "macos")]`.
- Windows behavior preserved.
- No permanent frontend debug UI unless explicitly needed.
- No network, telemetry, account, or cloud code.
- No collection of window titles, document names, webpage titles, keystrokes, mouse coordinates, file contents, or browser history.
- Helper execution errors logged without crashing the tracker loop.
- Swift helper output stays plain JSON with stable camelCase keys.

Fix any finding and rerun affected checks.

- [ ] **Step 5: Commit final docs/checkpoint**

Run:

```bash
git add memory.md CHANGELOG.md
git diff --cached --stat
git commit -m "docs(macos): update poc project state"
```

Expected: commit succeeds if `memory.md` or `CHANGELOG.md` changed. If neither file changed, skip this commit and record that no final docs checkpoint was needed.

---

## Self-Review Notes

- Spec coverage: This plan covers the macOS native bridge, running app snapshots, foreground owner detection, idle-time detection, bundle metadata, icon data, Rust adapter mapping, debug inspection, privacy boundaries, manual validation, and long-term SwiftUI rewrite hand-off.
- Scope control: The plan intentionally uses a Swift command-line helper instead of direct FFI to reduce PoC build risk. It does not add a SwiftUI UI, production signing, notarization, analytics, accounts, telemetry, or cloud features.
- Known PoC tradeoff: The tracker may invoke the helper more than once per tick through separate process, foreground, and activity sources. That overhead is acceptable for feasibility testing; the SwiftUI rewrite should use one native in-process capture service.
- Platform risk: macOS permissions may change observed results. The feasibility report is required so permission behavior becomes part of the product decision, not hidden implementation trivia.
