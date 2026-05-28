#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
    Tracked { display_name: String },
    Hidden,
}

pub fn classify_process(process_name: &str, executable_path: &str) -> Classification {
    let name = process_name.trim().to_lowercase();
    let path = executable_path.trim().to_lowercase();

    if is_system_or_helper_process(&name, &path) {
        return Classification::Hidden;
    }

    if let Some(display_name) = known_display_name(&name) {
        return Classification::Tracked {
            display_name: display_name.to_string(),
        };
    }

    Classification::Tracked {
        display_name: clean_process_name(process_name),
    }
}

fn known_display_name(name: &str) -> Option<&'static str> {
    match name {
        "code.exe" => Some("Visual Studio Code"),
        "winword.exe" => Some("Microsoft Word"),
        "excel.exe" => Some("Microsoft Excel"),
        "powerpnt.exe" => Some("Microsoft PowerPoint"),
        "sldworks.exe" => Some("SolidWorks"),
        "chrome.exe" => Some("Google Chrome"),
        "msedge.exe" => Some("Microsoft Edge"),
        "firefox.exe" => Some("Firefox"),
        "obsidian.exe" => Some("Obsidian"),
        "notion.exe" => Some("Notion"),
        "codex.exe" => Some("Codex"),
        _ => None,
    }
}

fn is_system_or_helper_process(name: &str, path: &str) -> bool {
    const SYSTEM_NAMES: &[&str] = &[
        "system",
        "registry",
        "idle",
        "svchost.exe",
        "conhost.exe",
        "csrss.exe",
        "dwm.exe",
        "lsass.exe",
        "services.exe",
        "smss.exe",
        "spoolsv.exe",
        "wininit.exe",
        "winlogon.exe",
        "wudfhost.exe",
    ];
    const HELPER_KEYWORDS: &[&str] = &[
        "update",
        "updater",
        "crashpad",
        "helper",
        "service",
        "cloudsrv",
        "wpscloud",
        "sync",
        "installer",
        "squirreltemp",
    ];

    SYSTEM_NAMES.contains(&name)
        || path.starts_with(r"c:\windows\")
        || HELPER_KEYWORDS
            .iter()
            .any(|keyword| name.contains(keyword) || path.contains(keyword))
}

fn clean_process_name(process_name: &str) -> String {
    process_name
        .trim()
        .strip_suffix(".exe")
        .or_else(|| process_name.trim().strip_suffix(".EXE"))
        .unwrap_or(process_name.trim())
        .to_string()
}
