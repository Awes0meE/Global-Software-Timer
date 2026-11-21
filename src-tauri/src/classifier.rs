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

/// Windows itself: system process names and anything under `C:\Windows`.
pub fn is_system_process_path(process_name: &str, executable_path: &str) -> bool {
    let name = process_name.trim().to_lowercase();
    let path = executable_path.trim().replace('/', "\\").to_lowercase();
    is_system_process(&name, &path)
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
        "armourycrate.exe" => Some("Armoury Crate"),
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
    // Codex's bundled runtimes (PowerShell, computer-use, node) run as agent
    // tools; checked before known names so their pwsh.exe is not "PowerShell".
    if path.contains(r"\.cache\codex-runtimes\")
        || path.contains(r"\appdata\local\openai\codex\runtimes\")
    {
        return true;
    }

    if executable_stem(name) != "codex" {
        return false;
    }

    path.contains(r"\app\resources\codex.exe")
        || path.contains(r"\appdata\local\openai\codex\bin\")
        || path.contains(r"\.vscode\extensions\openai.chatgpt-")
}

fn is_hardware_vendor_background_noise(name: &str) -> bool {
    const VENDOR_HELPER_STEMS: &[&str] = &[
        "acpowernotification",
        "armourycrate.denoiseai",
        "armouryhtmldebugserver",
        "armourysocketserver",
        "asus_framework",
        "asusmultiantennasvc",
        "asussmartdisplaycontrol",
        "nvcontainer",
        // Overlay/host helpers that v0.1.4 miscounted as foreground; their
        // main apps (NVIDIA app, Razer Synapse, BitDock) stay tracked.
        "ashotplugctrl",
        "bitcenter",
        "nvidia overlay",
        "razer synapse service process",
    ];

    let stem = executable_stem(name);

    VENDOR_HELPER_STEMS.contains(&stem)
        || stem.starts_with("armourycrate.")
        || (stem.starts_with("armoury") && stem.ends_with("server"))
}

fn is_system_process(name: &str, path: &str) -> bool {
    const SYSTEM_NAMES: &[&str] = &[
        "system",
        "registry",
        "secure system",
        "memory compression",
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
        "checknetinst",
        "cl",
        "dispatcher",
        "enableloopback",
        "esbuild",
        "edgegameassist",
        "eternalcore",
        "ewserver",
        "fnplicensingservice64",
        "fpsserver",
        "gamesdk",
        "gamingservices",
        "gamingservicesnet",
        "git",
        "git-remote-https",
        "global-software-timer",
        "global_software_timer_lib",
        "kmenureg",
        "listaryhookhost32",
        "listaryhookhost64",
        "lmgrd",
        "mathworksservicehost-monitor",
        "matlabwindow",
        "mdnsresponder",
        "node",
        "node_repl",
        "officeclicktorun",
        "photolaunch",
        "pubkey_verify",
        "rustc",
        "rustup",
        "search",
        "sgkaomoji",
        "sgtool",
        "sldexitapp",
        "sldim",
        "sldprocmon",
        "sldworks_fs",
        "sogoucloud",
        "sqlbrowser",
        "sqlceip",
        "sqlservr",
        "sqlwriter",
        "sw_d",
        "taskprocess",
        "typeeasytask",
        "vctip",
        "vpnclient_x64",
        "wacom_tablet",
        "wacom_tabletuser",
        "wacom_touchuser",
        "wallpaper64",
        "webwallpaper32",
        "wechatappex",
        "widgets",
        "windowtool",
        "winshowdesktop",
        "winsmod",
        "wtabletservicepro",
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
        "unins",
        "vcredist",
        "packagemanager",
        "hookhost",
        "servicehost",
    ];
    const HELPER_PATH_SEGMENTS: &[&str] = &["squirreltemp"];
    // Installers run once from these folders; installed apps live elsewhere.
    const INSTALLER_PATH_PARTS: &[&str] = &[r"\appdata\local\temp\", r"\downloads\", r"-updater\"];

    let stem = executable_stem(name);

    path.is_empty()
        || stem.ends_with(".tmp")
        || INSTALLER_PATH_PARTS.iter().any(|part| path.contains(part))
        || is_hardware_vendor_background_noise(name)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_vendor_overlay_and_host_helpers_by_exact_stem() {
        let helpers = [
            (
                "NVIDIA Overlay.exe",
                r"C:\Program Files\NVIDIA Corporation\NVIDIA app\CEF\NVIDIA Overlay.exe",
            ),
            (
                "AsHotplugCtrl.exe",
                r"C:\Program Files (x86)\ASUS\ATK Package\ATK Hotkey\AsHotplugCtrl.exe",
            ),
            (
                "Razer Synapse Service Process.exe",
                r"C:\Program Files (x86)\Razer\Synapse3\Service\Razer Synapse Service Process.exe",
            ),
            ("BitCenter.exe", r"D:\Software\BitDock\BitCenter.exe"),
            ("BITCENTER.EXE", r"D:\Software\BitDock\BITCENTER.EXE"),
        ];

        for (process_name, executable_path) in helpers {
            assert_eq!(
                classify_process(process_name, executable_path),
                Classification::Hidden,
                "{process_name} should be hidden"
            );
        }
    }

    #[test]
    fn keeps_vendor_main_apps_next_to_hidden_helpers() {
        let main_apps = [
            ("BitDock.exe", r"D:\Software\BitDock\BitDock.exe", "BitDock"),
            (
                "Razer Synapse 3.exe",
                r"C:\Program Files (x86)\Razer\Synapse3\WPFUI\Framework\Razer Synapse 3 Host\Razer Synapse 3.exe",
                "Razer Synapse 3",
            ),
            (
                "NvidiaApp.exe",
                r"C:\Program Files\NVIDIA Corporation\NVIDIA app\CEF\NvidiaApp.exe",
                "NvidiaApp",
            ),
            (
                "NVIDIA GeForce Experience.exe",
                r"C:\Program Files\NVIDIA Corporation\NVIDIA GeForce Experience\NVIDIA GeForce Experience.exe",
                "NVIDIA GeForce Experience",
            ),
            (
                "ArmouryCrate.exe",
                r"C:\Program Files\ASUS\ARMOURY CRATE Service\ArmouryCrate.exe",
                "Armoury Crate",
            ),
            (
                "NVIDIA Overlay Tool.exe",
                r"D:\Tools\NVIDIA Overlay Tool.exe",
                "NVIDIA Overlay Tool",
            ),
        ];

        for (process_name, executable_path, display_name) in main_apps {
            assert_eq!(
                classify_process(process_name, executable_path),
                Classification::Tracked {
                    display_name: display_name.to_string()
                },
                "{process_name} should stay tracked"
            );
        }
    }
}
