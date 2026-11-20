use serde::Serialize;
use std::collections::HashSet;
use std::ffi::OsString;
use std::time::{Duration, Instant};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// The tray registry changes rarely; re-read it at most this often.
const TRAY_REFRESH_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ProcessSnapshot {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub process_name: String,
    pub executable_path: String,
    pub is_background_helper: bool,
    pub has_visible_window: bool,
    /// The executable has a notification-area icon registered (see `tray_icons`).
    pub has_tray_icon: bool,
    /// CPU usage since the previous snapshot; 100.0 is one fully busy core.
    pub cpu_percent: f32,
    pub memory_bytes: u64,
}

pub trait ProcessSource: Send {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot>;
}

pub struct SysinfoProcessSource {
    system: System,
    tray_keys: Option<HashSet<String>>,
    tray_read_at: Option<Instant>,
}

impl SysinfoProcessSource {
    pub fn new() -> Self {
        Self {
            system: {
                // Process CPU usage is scaled by the CPU count; without the CPU
                // list sysinfo reports 0% for every process.
                let mut system = System::new();
                system.refresh_cpu_list(sysinfo::CpuRefreshKind::new());
                system
            },
            tray_keys: None,
            tray_read_at: None,
        }
    }

    fn tray_keys(&mut self) -> Option<&HashSet<String>> {
        if self
            .tray_read_at
            .is_none_or(|read_at| read_at.elapsed() >= TRAY_REFRESH_INTERVAL)
        {
            self.tray_keys = crate::tray_icons::tray_family_keys();
            self.tray_read_at = Some(Instant::now());
        }
        self.tray_keys.as_ref()
    }
}

impl Default for SysinfoProcessSource {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessSource for SysinfoProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            // Command lines are read once per process for transient helper-flag checks
            // and are never stored or shown.
            ProcessRefreshKind::new()
                .with_exe(UpdateKind::OnlyIfNotSet)
                .with_cmd(UpdateKind::OnlyIfNotSet)
                .with_cpu()
                .with_memory(),
        );
        let visible_window_pids = crate::window_info::app_window_pids();
        let tray_keys = self.tray_keys().cloned();
        self.system
            .processes()
            .iter()
            .map(|(pid, process)| {
                let process_name = process.name().to_string_lossy().into_owned();
                let executable_path = process
                    .exe()
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_default();
                // Services (session 0) cannot show tray icons even when the
                // registry remembers one from an earlier user-session run.
                let has_tray_icon = !executable_path.is_empty()
                    && tray_keys.as_ref().is_some_and(|keys| {
                        keys.contains(&crate::storage::executable_version_key(
                            &crate::storage::normalize_identity_key(
                                &executable_path,
                                &process_name,
                            ),
                        ))
                    })
                    && is_in_current_session(pid.as_u32());

                let app_window = visible_window_pids
                    .as_ref()
                    .map(|pids| pids.contains(&pid.as_u32()));

                ProcessSnapshot {
                    pid: pid.as_u32(),
                    parent_pid: process.parent().map(|parent| parent.as_u32()),
                    is_background_helper: is_background_helper_process(
                        &process_name,
                        process.cmd(),
                        app_window,
                    ),
                    has_visible_window: app_window.unwrap_or(true),
                    has_tray_icon,
                    cpu_percent: process.cpu_usage(),
                    memory_bytes: process.memory(),
                    process_name,
                    executable_path,
                }
            })
            .collect()
    }
}

#[cfg(target_os = "windows")]
fn is_in_current_session(pid: u32) -> bool {
    use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;

    let mut current = 0;
    let mut session = 0;
    unsafe {
        ProcessIdToSessionId(GetCurrentProcessId(), &mut current) != 0
            && ProcessIdToSessionId(pid, &mut session) != 0
            && session == current
    }
}

#[cfg(not(target_os = "windows"))]
fn is_in_current_session(_pid: u32) -> bool {
    true
}

fn is_background_helper_process(
    process_name: &str,
    command_line: &[OsString],
    has_app_window: Option<bool>,
) -> bool {
    let name = process_name.trim().to_lowercase();
    let is_chromium_family = is_chromium_family_name(&name);

    command_line.iter().skip(1).any(|argument| {
        let argument = argument.to_string_lossy().to_lowercase();
        // Chromium, Electron and CEF child processes (renderer, GPU, utility,
        // crashpad) all carry `--type=`; this covers ChatGPT, Discord, etc.
        argument.starts_with("--type=")
            || (is_chromium_family
                && (argument == "--embedded-browser-edgeview=1"
                    || argument.starts_with("--edge-webview-host-pid")
                    // Startup boost starts the browser root windowless; windows the
                    // user opens later belong to this same process.
                    || (argument == "--no-startup-window" && has_app_window != Some(true))))
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

        assert!(is_background_helper_process(
            "msedge.exe",
            &command_line,
            Some(false)
        ));
    }

    #[test]
    fn keeps_browser_root_processes_trackable() {
        let command_line = vec![OsString::from(
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        )];

        assert!(!is_background_helper_process(
            "msedge.exe",
            &command_line,
            Some(true)
        ));
    }

    #[test]
    fn startup_boost_browser_root_counts_once_it_shows_a_window() {
        // Edge startup boost launches the browser root with --no-startup-window;
        // windows the user opens later belong to that same process.
        let command_line = vec![
            OsString::from(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            OsString::from("--no-startup-window"),
            OsString::from("--win-session-start"),
        ];

        assert!(is_background_helper_process(
            "msedge.exe",
            &command_line,
            Some(false)
        ));
        assert!(!is_background_helper_process(
            "msedge.exe",
            &command_line,
            Some(true)
        ));
    }

    #[test]
    fn startup_boost_requires_positive_window_evidence() {
        let args = [
            OsString::from("msedge.exe"),
            OsString::from("--no-startup-window"),
        ];
        assert!(is_background_helper_process("msedge.exe", &args, None));
    }

    #[test]
    fn child_and_embedded_processes_stay_helpers_even_with_a_window() {
        let renderer = vec![
            OsString::from(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            OsString::from("--type=renderer"),
        ];
        assert!(is_background_helper_process(
            "msedge.exe",
            &renderer,
            Some(true)
        ));

        let embedded = vec![
            OsString::from(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            OsString::from("--embedded-browser-edgeview=1"),
        ];
        assert!(is_background_helper_process(
            "msedge.exe",
            &embedded,
            Some(true)
        ));
    }

    #[test]
    fn detects_electron_child_processes_for_any_executable_name() {
        let command_line = vec![
            OsString::from(
                r"C:\Program Files\WindowsApps\OpenAI.Codex_26.1111.2228.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe",
            ),
            OsString::from("--type=gpu-process"),
        ];

        assert!(is_background_helper_process(
            "ChatGPT.exe",
            &command_line,
            Some(false)
        ));
    }

    #[test]
    fn ignores_flag_text_in_the_executable_path_and_unrelated_apps() {
        let command_line = vec![OsString::from(r"C:\Tools\--type=odd\tool.exe")];
        assert!(!is_background_helper_process(
            "tool.exe",
            &command_line,
            Some(false)
        ));

        let command_line = vec![
            OsString::from(r"C:\Tools\player.exe"),
            OsString::from("--no-startup-window"),
        ];
        assert!(!is_background_helper_process(
            "player.exe",
            &command_line,
            Some(false)
        ));
    }
}
