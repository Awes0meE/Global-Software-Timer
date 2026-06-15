use serde::Serialize;
use std::collections::HashSet;
use std::ffi::OsString;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProcessSnapshot {
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
    pub is_background_helper: bool,
    pub has_visible_window: bool,
}

pub trait ProcessSource: Send {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot>;
}

pub struct SysinfoProcessSource {
    system: System,
}

impl SysinfoProcessSource {
    pub fn new() -> Self {
        Self {
            system: System::new(),
        }
    }
}

impl Default for SysinfoProcessSource {
    fn default() -> Self {
        Self::new()
    }
}

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
                    if let Some(icon_data_url) = crate::macos_capture::icon_data_url_from_base64(
                        app.icon_png_base64.as_deref(),
                    ) {
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

impl ProcessSource for SysinfoProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet),
        );
        let visible_window_pids = visible_window_pids();
        self.system
            .processes()
            .iter()
            .map(|(pid, process)| {
                let process_name = process.name().to_string_lossy().into_owned();

                ProcessSnapshot {
                    pid: pid.as_u32(),
                    is_background_helper: is_background_helper_process(
                        &process_name,
                        process.cmd(),
                    ),
                    has_visible_window: visible_window_pids
                        .as_ref()
                        .is_none_or(|pids| pids.contains(&pid.as_u32())),
                    process_name,
                    executable_path: process
                        .exe()
                        .map(|path| path.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                }
            })
            .collect()
    }
}

#[cfg(target_os = "windows")]
fn visible_window_pids() -> Option<HashSet<u32>> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
    };

    unsafe extern "system" fn collect_visible_window_pid(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }

        let mut process_id = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }
        if process_id > 0 {
            let pids = unsafe { &mut *(lparam as *mut HashSet<u32>) };
            pids.insert(process_id);
        }

        1
    }

    let mut pids = HashSet::new();
    let succeeded = unsafe {
        EnumWindows(
            Some(collect_visible_window_pid),
            &mut pids as *mut HashSet<u32> as LPARAM,
        )
    };

    (succeeded != 0).then_some(pids)
}

#[cfg(not(target_os = "windows"))]
fn visible_window_pids() -> Option<HashSet<u32>> {
    None
}

fn is_background_helper_process(process_name: &str, command_line: &[OsString]) -> bool {
    let name = process_name.trim().to_lowercase();
    if !is_chromium_family_name(&name) {
        return false;
    }

    command_line.iter().any(|argument| {
        let argument = argument.to_string_lossy().to_lowercase();
        argument.starts_with("--type=")
            || argument == "--embedded-browser-edgeview=1"
            || argument.starts_with("--edge-webview-host-pid")
            || argument == "--no-startup-window"
    })
}

fn is_chromium_family_name(name: &str) -> bool {
    matches!(
        name,
        "chrome.exe" | "code.exe" | "codex.exe" | "msedge.exe" | "notion.exe" | "obsidian.exe"
    )
}

#[cfg(test)]
mod tests {
    use super::is_background_helper_process;
    use std::ffi::OsString;

    #[test]
    fn detects_chromium_child_process_flags_without_storing_command_line() {
        let command_line = vec![
            OsString::from(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            OsString::from("--type=renderer"),
        ];

        assert!(is_background_helper_process("msedge.exe", &command_line));
    }

    #[test]
    fn keeps_browser_root_processes_trackable() {
        let command_line = vec![OsString::from(
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        )];

        assert!(!is_background_helper_process("msedge.exe", &command_line));
    }
}
