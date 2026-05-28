#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
    Tracked { display_name: String },
    Hidden,
}

pub fn classify_process(process_name: &str, executable_path: &str) -> Classification {
    let name = process_name.trim().to_lowercase();
    let path = executable_path.trim().to_lowercase();

    if is_system_process(&name, &path) {
        return Classification::Hidden;
    }

    if let Some(display_name) = known_display_name(&name) {
        return Classification::Tracked {
            display_name: display_name.to_string(),
        };
    }

    if is_helper_process(&name, &path) {
        return Classification::Hidden;
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

fn is_system_process(name: &str, path: &str) -> bool {
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

    SYSTEM_NAMES.contains(&name) || path.starts_with(r"c:\windows\")
}

fn is_helper_process(name: &str, path: &str) -> bool {
    const HELPER_KEYWORDS: &[&str] = &[
        "update",
        "updater",
        "crashpad",
        "helper",
        "cloudsrv",
        "wpscloud",
        "sync",
        "installer",
    ];
    const HELPER_PATH_SEGMENTS: &[&str] = &["squirreltemp"];

    let stem = executable_stem(name);

    stem == "service"
        || HELPER_KEYWORDS.iter().any(|keyword| stem.contains(keyword))
        || path
            .split(['\\', '/'])
            .any(|segment| HELPER_PATH_SEGMENTS.contains(&segment))
}

fn clean_process_name(process_name: &str) -> String {
    executable_stem(process_name.trim()).to_string()
}

fn executable_stem(process_name: &str) -> &str {
    let trimmed = process_name.trim();

    if trimmed
        .get(trimmed.len().saturating_sub(4)..)
        .is_some_and(|suffix| suffix.eq_ignore_ascii_case(".exe"))
    {
        &trimmed[..trimmed.len() - 4]
    } else {
        trimmed
    }
}
