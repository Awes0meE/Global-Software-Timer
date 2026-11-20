//! Executables that show notification-area (tray) icons.
//!
//! Windows 11 keeps one `HKCU\Control Panel\NotifyIconSettings\<id>` entry per
//! tray icon an executable has registered, with its `ExecutablePath`. A running
//! process whose software family appears there is treated as a tray app. The
//! registry remembers icons after an app stops showing them, so this is an
//! approximation; it never reads icon tooltips. Windows 10 has no such key, and
//! tray detection is then unavailable (`None`).

use crate::storage::{executable_version_key, normalize_identity_key};
use std::collections::HashSet;

/// Known-folder GUID prefixes used in `ExecutablePath`.
const KNOWN_FOLDERS: &[(&str, &str)] = &[
    ("{1ac14e77-02e7-4e5d-b744-2eb1ae5198b7}", "system32"),
    ("{d65231b0-b2f1-4857-a4ce-a8e7c6ea7d27}", "syswow64"),
    ("{6d809377-6af0-444b-8957-a3773f02200e}", "programfiles"),
    ("{7c5a40ef-a0fb-4bfc-874a-c0f2e0b9fa8e}", "programfilesx86"),
    ("{f38bf404-1d43-42f2-9305-67de0b28fc23}", "windows"),
];

#[derive(Debug, Clone, Default)]
pub struct FolderRoots {
    pub windows: String,
    pub program_files: String,
    pub program_files_x86: String,
}

impl FolderRoots {
    pub fn from_env() -> Self {
        let var = |name: &str, fallback: &str| {
            std::env::var(name).unwrap_or_else(|_| fallback.to_string())
        };
        Self {
            windows: var("SystemRoot", r"C:\Windows"),
            program_files: var("ProgramW6432", &var("ProgramFiles", r"C:\Program Files")),
            program_files_x86: var("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        }
    }

    fn root(&self, folder: &str) -> String {
        match folder {
            "system32" => format!(r"{}\System32", self.windows),
            "syswow64" => format!(r"{}\SysWOW64", self.windows),
            "programfiles" => self.program_files.clone(),
            "programfilesx86" => self.program_files_x86.clone(),
            _ => self.windows.clone(),
        }
    }
}

/// Software family key for a registry `ExecutablePath`, or `None` when the
/// value uses an unknown known-folder prefix.
pub fn tray_family_key(raw_path: &str, roots: &FolderRoots) -> Option<String> {
    let raw = raw_path.trim();
    if raw.is_empty() {
        return None;
    }
    let path = if raw.starts_with('{') {
        let end = raw.find('}')?;
        let guid = raw[..=end].to_ascii_lowercase();
        let (_, folder) = KNOWN_FOLDERS.iter().find(|(known, _)| *known == guid)?;
        format!("{}{}", roots.root(folder), &raw[end + 1..])
    } else {
        raw.to_string()
    };
    Some(executable_version_key(&normalize_identity_key(&path, "")))
}

#[cfg(target_os = "windows")]
pub fn tray_family_keys() -> Option<HashSet<String>> {
    let roots = FolderRoots::from_env();
    let keys = registry::executable_paths()?
        .iter()
        .filter_map(|path| tray_family_key(path, &roots))
        .collect();
    Some(keys)
}

#[cfg(not(target_os = "windows"))]
pub fn tray_family_keys() -> Option<HashSet<String>> {
    None
}

#[cfg(target_os = "windows")]
mod registry {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        RRF_RT_REG_SZ,
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    pub fn executable_paths() -> Option<Vec<String>> {
        let mut key: HKEY = std::ptr::null_mut();
        let subkey = wide(r"Control Panel\NotifyIconSettings");
        if unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut key) }
            != ERROR_SUCCESS
        {
            return None;
        }
        let value_name = wide("ExecutablePath");
        let mut paths = Vec::new();
        for index in 0.. {
            let mut name = [0u16; 256];
            let mut name_len = name.len() as u32;
            let status = unsafe {
                RegEnumKeyExW(
                    key,
                    index,
                    name.as_mut_ptr(),
                    &mut name_len,
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            };
            if status != ERROR_SUCCESS {
                break;
            }
            name[name_len as usize] = 0;
            let mut buffer = [0u16; 1024];
            let mut size = std::mem::size_of_val(&buffer) as u32;
            let status = unsafe {
                RegGetValueW(
                    key,
                    name.as_ptr(),
                    value_name.as_ptr(),
                    RRF_RT_REG_SZ,
                    std::ptr::null_mut(),
                    buffer.as_mut_ptr().cast(),
                    &mut size,
                )
            };
            if status == ERROR_SUCCESS {
                let len = (size as usize / 2).saturating_sub(1).min(buffer.len());
                paths.push(String::from_utf16_lossy(&buffer[..len]));
            }
        }
        unsafe { RegCloseKey(key) };
        Some(paths)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots() -> FolderRoots {
        FolderRoots {
            windows: r"C:\Windows".into(),
            program_files: r"C:\Program Files".into(),
            program_files_x86: r"C:\Program Files (x86)".into(),
        }
    }

    #[test]
    fn resolves_known_folder_prefixes_and_plain_paths() {
        assert_eq!(
            tray_family_key(
                r"{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\Steam\steam.exe",
                &roots()
            )
            .as_deref(),
            Some(r"c:\program files (x86)\steam\steam.exe")
        );
        assert_eq!(
            tray_family_key(r"D:\Software\Weixin\Weixin.exe", &roots()).as_deref(),
            Some(r"d:\software\weixin\weixin.exe")
        );
        assert_eq!(tray_family_key("{00000000-0000}\\x.exe", &roots()), None);
        assert_eq!(tray_family_key("  ", &roots()), None);
    }

    #[test]
    fn matches_running_versions_through_the_family_key() {
        let registered = tray_family_key(
            r"{6D809377-6AF0-444B-8957-A3773F02200E}\WindowsApps\Sample_2.1000.0.0_x64__123456789abcd\app\sample.exe",
            &roots(),
        );
        let running = executable_version_key(&normalize_identity_key(
            r"C:\Program Files\WindowsApps\Sample_2.1000.1.0_x64__123456789abcd\app\sample.exe",
            "sample.exe",
        ));
        assert_eq!(registered, Some(running));
        assert_eq!(
            tray_family_key(
                r"C:\Users\me\AppData\Local\FACEIT\app-2.9.0\FACEIT.exe",
                &roots()
            ),
            tray_family_key(
                r"C:\Users\me\AppData\Local\FACEIT\app-2.11.2\FACEIT.exe",
                &roots()
            )
        );
    }
}
