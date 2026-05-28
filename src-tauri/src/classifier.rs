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

    if path.is_empty() {
        return Classification::Hidden;
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
        "qq.exe" => Some("QQ"),
        "steam.exe" => Some("Steam"),
        "steam++.exe" => Some("Steam++"),
        "weixin.exe" => Some("WeChat"),
        "wps.exe" => Some("WPS"),
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
        "aggregatorhost.exe",
        "fontdrvhost.exe",
        "lsass.exe",
        "logonui.exe",
        "memory compression",
        "mpdefendercoreservice.exe",
        "msmpeng.exe",
        "nissrv.exe",
        "nvdisplay.container.exe",
        "services.exe",
        "smss.exe",
        "spoolsv.exe",
        "searchfilterhost.exe",
        "searchindexer.exe",
        "searchprotocolhost.exe",
        "securityhealthservice.exe",
        "wininit.exe",
        "winlogon.exe",
        "wmiapsrv.exe",
        "wmiprvse.exe",
        "wudfhost.exe",
        "widgetservice.exe",
        "jhi_service.exe",
    ];

    SYSTEM_NAMES.contains(&name) || path.starts_with(r"c:\windows\")
}

fn is_helper_process(name: &str, path: &str) -> bool {
    const HELPER_NAMES: &[&str] = &[
        "cargo.exe",
        "edgegameassist.exe",
        "esbuild.exe",
        "git.exe",
        "global-software-timer.exe",
        "listaryhookhost32.exe",
        "listaryhookhost64.exe",
        "lmgrd.exe",
        "mathworksservicehost.exe",
        "mathworksservicehost-monitor.exe",
        "msedgewebview2.exe",
        "node_repl.exe",
        "node.exe",
        "promecefpluginhost.exe",
        "sgtool.exe",
        "sldworks_fs.exe",
        "sogoucloud.exe",
        "steam++.accelerator.exe",
        "sw_d.exe",
        "vctip.exe",
        "wallpaper64.exe",
        "wechatappex.exe",
        "webwallpaper32.exe",
        "widgets.exe",
        "windowtool.exe",
        "wpscloudsvr.exe",
        "xboxpcappft.exe",
    ];
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
    const HELPER_PATH_SEGMENTS: &[&str] =
        &["edgewebview", "squirreltemp", "webexperience", "xplugin"];

    let stem = executable_stem(name);

    HELPER_NAMES.contains(&name)
        || stem == "service"
        || stem.ends_with(".service")
        || stem.ends_with("service")
        || stem.ends_with("service64")
        || stem.ends_with("hookhost")
        || stem.ends_with("pluginhost")
        || stem.ends_with("servicehost")
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
