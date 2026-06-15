use crate::process_source::ProcessSnapshot;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use thiserror::Error;

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

pub fn parse_capture_output(stdout: &str) -> Result<MacCaptureOutput, serde_json::Error> {
    serde_json::from_str(stdout)
}

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
    capture.foreground_pid.or_else(|| {
        capture
            .apps
            .iter()
            .find(|app| app.is_foreground)
            .map(|app| app.pid)
    })
}

pub fn idle_duration_from_capture(capture: &MacCaptureOutput) -> Duration {
    if capture.idle_seconds.is_finite() && capture.idle_seconds > 0.0 {
        Duration::from_millis((capture.idle_seconds * 1000.0).round() as u64)
    } else {
        Duration::ZERO
    }
}

pub fn icon_data_url_from_base64(icon_png_base64: Option<&str>) -> Option<String> {
    let icon = icon_png_base64?.trim();
    if icon.is_empty() {
        None
    } else {
        Some(format!("data:image/png;base64,{icon}"))
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
        assert_eq!(
            capture.apps[0].bundle_id.as_deref(),
            Some("com.microsoft.VSCode")
        );
    }

    #[test]
    fn maps_native_apps_to_process_snapshots() {
        let capture = parse_capture_output(SAMPLE_JSON).expect("capture json");
        let snapshots = process_snapshots_from_capture(&capture);

        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].pid, 123);
        assert_eq!(snapshots[0].process_name, "Code");
        assert_eq!(
            snapshots[0].executable_path,
            "/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
        );
        assert!(snapshots[0].has_visible_window);
        assert!(!snapshots[0].is_background_helper);
        assert!(!snapshots[1].has_visible_window);
    }

    #[test]
    fn derives_foreground_pid_and_idle_duration() {
        let capture = parse_capture_output(SAMPLE_JSON).expect("capture json");

        assert_eq!(foreground_pid_from_capture(&capture), Some(123));
        assert_eq!(
            idle_duration_from_capture(&capture),
            Duration::from_millis(12_500)
        );
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

    #[test]
    fn builds_icon_data_url_from_base64() {
        assert_eq!(
            icon_data_url_from_base64(Some("aWNvbg==")).as_deref(),
            Some("data:image/png;base64,aWNvbg==")
        );
        assert_eq!(icon_data_url_from_base64(Some("   ")), None);
        assert_eq!(icon_data_url_from_base64(None), None);
    }
}
