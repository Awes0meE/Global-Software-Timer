use serde::Serialize;
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

impl ProcessSource for SysinfoProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            // Command lines are read once per process for transient helper-flag checks
            // and are never stored or shown.
            ProcessRefreshKind::new()
                .with_exe(UpdateKind::OnlyIfNotSet)
                .with_cmd(UpdateKind::OnlyIfNotSet),
        );
        let visible_window_pids = crate::window_info::app_window_pids();
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

fn is_background_helper_process(process_name: &str, command_line: &[OsString]) -> bool {
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
                    || argument == "--no-startup-window"))
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

    #[test]
    fn detects_electron_child_processes_for_any_executable_name() {
        let command_line = vec![
            OsString::from(
                r"C:\Program Files\WindowsApps\OpenAI.Codex_26.1111.2228.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe",
            ),
            OsString::from("--type=gpu-process"),
        ];

        assert!(is_background_helper_process("ChatGPT.exe", &command_line));
    }

    #[test]
    fn ignores_flag_text_in_the_executable_path_and_unrelated_apps() {
        let command_line = vec![OsString::from(r"C:\Tools\--type=odd\tool.exe")];
        assert!(!is_background_helper_process("tool.exe", &command_line));

        let command_line = vec![
            OsString::from(r"C:\Tools\player.exe"),
            OsString::from("--no-startup-window"),
        ];
        assert!(!is_background_helper_process("player.exe", &command_line));
    }
}
