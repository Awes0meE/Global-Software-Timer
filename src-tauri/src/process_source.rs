use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProcessSnapshot {
    pub pid: u32,
    pub process_name: String,
    pub executable_path: String,
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
            ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet),
        );
        self.system
            .processes()
            .iter()
            .map(|(pid, process)| ProcessSnapshot {
                pid: pid.as_u32(),
                process_name: process.name().to_string_lossy().into_owned(),
                executable_path: process
                    .exe()
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            })
            .collect()
    }
}
