#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
    Tracked { display_name: String },
    Hidden,
}

pub fn classify_process(process_name: &str, executable_path: &str) -> Classification {
    let name = process_name.trim().to_lowercase();
    let path = executable_path.trim().replace('/', "\\").to_lowercase();

    if is_system_process(&name, &path) {
        return Classification::Hidden;
    }

    if is_known_backend_helper(&name, &path) {
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
        "steam.exe" => Some("Steam"),
        "steam++.exe" => Some("Watt Toolkit"),
        "wps.exe" | "et.exe" | "wpp.exe" | "wpspdf.exe" => Some("WPS Office"),
        "wechat.exe" => Some("WeChat"),
        "weixin.exe" => Some("WeChat"),
        "everything.exe" => Some("Everything"),
        "powershell.exe" => Some("PowerShell"),
        "pwsh.exe" => Some("PowerShell"),
        "wt.exe" => Some("Windows Terminal"),
        _ => None,
    }
}

fn is_known_backend_helper(name: &str, path: &str) -> bool {
    if executable_stem(name) != "codex" {
        return false;
    }

    path.contains(r"\app\resources\codex.exe")
        || path.contains(r"\appdata\local\openai\codex\bin\")
        || path.contains(r"\.vscode\extensions\openai.chatgpt-")
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
        "aggregatorhost.exe",
        "fontdrvhost.exe",
        "msmpeng.exe",
        "nissrv.exe",
        "runtimebroker.exe",
        "searchfilterhost.exe",
        "searchindexer.exe",
        "sihost.exe",
        "wininit.exe",
        "winlogon.exe",
        "wudfhost.exe",
    ];

    SYSTEM_NAMES.contains(&name) || path.starts_with(r"c:\windows\")
}

fn is_helper_process(name: &str, path: &str) -> bool {
    const HELPER_STEMS: &[&str] = &[
        "cargo",
        "cl",
        "esbuild",
        "edgegameassist",
        "global-software-timer",
        "global_software_timer_lib",
        "listaryhookhost32",
        "listaryhookhost64",
        "lmgrd",
        "mathworksservicehost-monitor",
        "node",
        "node_repl",
        "rustc",
        "sgtool",
        "sldworks_fs",
        "sogoucloud",
        "sw_d",
        "vctip",
        "wallpaper64",
        "webwallpaper32",
        "wechatappex",
        "widgets",
        "windowtool",
        "xboxpcappft",
    ];
    const HELPER_KEYWORDS: &[&str] = &[
        "update",
        "updater",
        "accelerator",
        "agent",
        "broker",
        "crashpad",
        "daemon",
        "helper",
        "cloudsrv",
        "pluginhost",
        "webview",
        "wpscloud",
        "sync",
        "setup",
        "installer",
        "packagemanager",
        "hookhost",
        "servicehost",
    ];
    const HELPER_PATH_SEGMENTS: &[&str] = &["squirreltemp"];

    let stem = executable_stem(name);

    path.is_empty()
        || HELPER_STEMS.contains(&stem)
        || stem.starts_with("global_software_timer_lib-")
        || stem == "service"
        || stem.starts_with("codex-windows-sandbox")
        || stem.ends_with("service")
        || stem.ends_with("srv")
        || stem.ends_with("host")
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
