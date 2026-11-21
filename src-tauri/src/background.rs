//! Groups processes the user cannot see — no taskbar window, no tray icon —
//! into per-software background entries for the `后台` page.
//!
//! A process started (directly or through intermediate helpers) by an app the
//! user can see belongs to that app and is not listed, so one app's helper
//! swarm does not show up as many background entries.

use crate::classifier::{classify_process, is_system_process_path, Classification};
use crate::process_source::ProcessSnapshot;
use crate::storage::{normalize_identity_key, software_family_key};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// Parent chains on Windows are short; this also bounds PID-reuse cycles.
const MAX_ANCESTOR_DEPTH: usize = 16;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BackgroundProcessGroup {
    pub family_key: String,
    pub display_name: String,
    pub process_name: String,
    pub executable_path: String,
    pub process_count: u32,
    /// Sum over the group's processes; 100.0 is one fully busy core.
    pub cpu_percent: f32,
    pub memory_bytes: u64,
}

pub fn family_key_for(snapshot: &ProcessSnapshot) -> String {
    software_family_key(&normalize_identity_key(
        &snapshot.executable_path,
        &snapshot.process_name,
    ))
}

fn is_user_facing(snapshot: &ProcessSnapshot) -> bool {
    !snapshot.is_background_helper && (snapshot.has_visible_window || snapshot.has_tray_icon)
}

fn is_system(snapshot: &ProcessSnapshot) -> bool {
    snapshot.pid <= 4
        || snapshot.process_name.trim().is_empty()
        || is_system_process_path(&snapshot.process_name, &snapshot.executable_path)
}

pub fn background_groups(snapshots: &[ProcessSnapshot]) -> Vec<BackgroundProcessGroup> {
    let candidates = snapshots
        .iter()
        .filter(|snapshot| !is_system(snapshot))
        .collect::<Vec<_>>();
    let user_facing_pids = candidates
        .iter()
        .filter(|snapshot| is_user_facing(snapshot))
        .map(|snapshot| snapshot.pid)
        .collect::<HashSet<_>>();
    let user_facing_families = candidates
        .iter()
        .filter(|snapshot| is_user_facing(snapshot))
        .map(|snapshot| family_key_for(snapshot))
        .collect::<HashSet<_>>();
    let parent_by_pid = snapshots
        .iter()
        .filter_map(|snapshot| snapshot.parent_pid.map(|parent| (snapshot.pid, parent)))
        .collect::<HashMap<_, _>>();
    let started_by_user_facing_app = |pid: u32| {
        let mut current = pid;
        for _ in 0..MAX_ANCESTOR_DEPTH {
            let Some(parent) = parent_by_pid.get(&current).copied() else {
                return false;
            };
            if parent == current {
                return false;
            }
            if user_facing_pids.contains(&parent) {
                return true;
            }
            current = parent;
        }
        false
    };

    let mut groups: HashMap<String, (BackgroundProcessGroup, u64)> = HashMap::new();
    for snapshot in candidates {
        let family_key = family_key_for(snapshot);
        if user_facing_families.contains(&family_key) || started_by_user_facing_app(snapshot.pid) {
            continue;
        }
        let (group, representative_memory) =
            groups.entry(family_key.clone()).or_insert_with(|| {
                (
                    BackgroundProcessGroup {
                        family_key,
                        display_name: String::new(),
                        process_name: String::new(),
                        executable_path: String::new(),
                        process_count: 0,
                        cpu_percent: 0.0,
                        memory_bytes: 0,
                    },
                    0,
                )
            });
        group.process_count += 1;
        group.cpu_percent += snapshot.cpu_percent.max(0.0);
        group.memory_bytes += snapshot.memory_bytes;
        // The largest process names the group (the main one, not a helper).
        if group.display_name.is_empty() || snapshot.memory_bytes > *representative_memory {
            *representative_memory = snapshot.memory_bytes;
            group.display_name = display_name_for(snapshot);
            group.process_name = snapshot.process_name.to_lowercase();
            group.executable_path = snapshot.executable_path.clone();
        }
    }

    let mut groups = groups
        .into_values()
        .map(|(group, _)| group)
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| {
        right
            .cpu_percent
            .total_cmp(&left.cpu_percent)
            .then_with(|| right.memory_bytes.cmp(&left.memory_bytes))
            .then_with(|| left.family_key.cmp(&right.family_key))
    });
    groups
}

fn display_name_for(snapshot: &ProcessSnapshot) -> String {
    match classify_process(&snapshot.process_name, &snapshot.executable_path) {
        Classification::Tracked { display_name } => display_name,
        Classification::Hidden => {
            let name = snapshot.process_name.trim();
            name.strip_suffix(".exe")
                .or_else(|| name.strip_suffix(".EXE"))
                .unwrap_or(name)
                .to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn process(pid: u32, parent: Option<u32>, name: &str, path: &str) -> ProcessSnapshot {
        ProcessSnapshot {
            pid,
            parent_pid: parent,
            process_name: name.into(),
            executable_path: path.into(),
            memory_bytes: 10,
            ..Default::default()
        }
    }

    #[test]
    fn lists_unseen_third_party_processes_grouped_by_software() {
        let mut service = process(
            100,
            Some(8),
            "nvcontainer.exe",
            r"C:\Program Files\NVIDIA Corporation\NvContainer\nvcontainer.exe",
        );
        service.cpu_percent = 12.5;
        let mut second = process(
            101,
            Some(8),
            "nvcontainer.exe",
            r"C:\Program Files\NVIDIA Corporation\NvContainer\nvcontainer.exe",
        );
        second.cpu_percent = 2.5;
        let system = process(
            200,
            Some(8),
            "svchost.exe",
            r"C:\Windows\System32\svchost.exe",
        );

        let groups = background_groups(&[service, second, system]);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].display_name, "nvcontainer");
        assert_eq!(groups[0].process_count, 2);
        assert_eq!(groups[0].cpu_percent, 15.0);
        assert_eq!(groups[0].memory_bytes, 20);
    }

    #[test]
    fn windowed_tray_apps_and_their_child_processes_are_not_background() {
        let mut chat = process(
            10,
            Some(1),
            "ChatGPT.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.1.0.0_x64__p\app\ChatGPT.exe",
        );
        chat.has_visible_window = true;
        let mut chat_gpu = process(
            11,
            Some(10),
            "ChatGPT.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.1.0.0_x64__p\app\ChatGPT.exe",
        );
        chat_gpu.is_background_helper = true;
        let mut weixin = process(20, Some(1), "Weixin.exe", r"D:\Software\Weixin\Weixin.exe");
        weixin.has_tray_icon = true;
        let appex = process(
            21,
            Some(20),
            "WeChatAppEx.exe",
            r"D:\Software\Weixin\4.0\WeChatAppEx.exe",
        );
        let grandchild = process(
            22,
            Some(21),
            "crashpad.exe",
            r"D:\Software\Weixin\crashpad.exe",
        );
        let updater = process(
            30,
            Some(1),
            "updater.exe",
            r"C:\Program Files\Vendor\updater.exe",
        );

        let groups = background_groups(&[chat, chat_gpu, weixin, appex, grandchild, updater]);
        assert_eq!(
            groups
                .iter()
                .map(|group| group.display_name.as_str())
                .collect::<Vec<_>>(),
            vec!["updater"]
        );
    }

    #[test]
    fn hidden_vendor_helpers_still_list_on_the_background_page() {
        let overlay = process(
            300,
            Some(8),
            "NVIDIA Overlay.exe",
            r"C:\Program Files\NVIDIA Corporation\NVIDIA app\CEF\NVIDIA Overlay.exe",
        );
        assert_eq!(
            classify_process(&overlay.process_name, &overlay.executable_path),
            Classification::Hidden
        );

        let groups = background_groups(&[overlay]);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].display_name, "NVIDIA Overlay");
        assert_eq!(groups[0].process_name, "nvidia overlay.exe");
    }

    #[test]
    fn parent_cycles_do_not_hang() {
        let first = process(50, Some(51), "a.exe", r"D:\a.exe");
        let second = process(51, Some(50), "b.exe", r"D:\b.exe");
        assert_eq!(background_groups(&[first, second]).len(), 2);
    }
}
