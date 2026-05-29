use global_software_timer_lib::classifier::{classify_process, Classification};

#[test]
fn recognizes_common_user_apps() {
    let code = classify_process(
        "Code.exe",
        r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe",
    );
    assert_eq!(
        code,
        Classification::Tracked {
            display_name: "Visual Studio Code".to_string()
        }
    );

    let word = classify_process(
        "WINWORD.EXE",
        r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
    );
    assert_eq!(
        word,
        Classification::Tracked {
            display_name: "Microsoft Word".to_string()
        }
    );

    let steam = classify_process("steam.exe", r"D:\Program Files (x86)\Steam\steam.exe");
    assert_eq!(
        steam,
        Classification::Tracked {
            display_name: "Steam".to_string()
        }
    );

    let wps = classify_process(
        "wps.exe",
        r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wps.exe",
    );
    assert_eq!(
        wps,
        Classification::Tracked {
            display_name: "WPS Office".to_string()
        }
    );
}

#[test]
fn hides_windows_and_helper_noise() {
    assert_eq!(
        classify_process("svchost.exe", r"C:\Windows\System32\svchost.exe"),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "WPSCloudSrv.exe",
            r"C:\Program Files\WPS Office\WPSCloudSrv.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "Update.exe",
            r"C:\Users\dev\AppData\Local\SquirrelTemp\Update.exe"
        ),
        Classification::Hidden
    );
}

#[test]
fn hides_background_services_hosts_and_toolchain_children() {
    let noisy_processes = [
        ("AggregatorHost.exe", ""),
        ("SearchFilterHost.exe", ""),
        ("MsMpEng.exe", ""),
        ("NisSrv.exe", ""),
        ("steamservice.exe", ""),
        ("clash-verge-service.exe", ""),
        (
            "msedgewebview2.exe",
            r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\msedgewebview2.exe",
        ),
        (
            "promecefpluginhost.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\promecefpluginhost.exe",
        ),
        (
            "Steam++.Accelerator.exe",
            r"C:\Program Files\WindowsApps\Steam++\modules\Accelerator\Steam++.Accelerator.exe",
        ),
        ("node.exe", r"C:\Program Files\nodejs\node.exe"),
        (
            "node_repl.exe",
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\node_repl.exe",
        ),
        (
            "esbuild.exe",
            r"C:\Users\dev\AppData\Local\Temp\esbuild.exe",
        ),
        (
            "global-software-timer.exe",
            r"D:\Projects\Global_Software_Timer\src-tauri\target\debug\global-software-timer.exe",
        ),
        (
            "global_software_timer_lib-78cd8083c2678af5.exe",
            r"D:\Projects\Global_Software_Timer\src-tauri\target\debug\deps\global_software_timer_lib-78cd8083c2678af5.exe",
        ),
        (
            "ListaryHookHost64.exe",
            r"D:\Program Files\Listary\ListaryHookHost64.exe",
        ),
        (
            "MathWorksServiceHost-Monitor.exe",
            r"C:\Users\dev\AppData\Local\MathWorks\ServiceHost\bin\MathWorksServiceHost-Monitor.exe",
        ),
        (
            "WeChatAppEx.exe",
            r"C:\Users\dev\AppData\Roaming\Tencent\xwechat\XPlugin\Plugins\RadiumWMPF\runtime\WeChatAppEx.exe",
        ),
        (
            "Widgets.exe",
            r"C:\Program Files\WindowsApps\microsoftwindows.client.webexperience\Dashboard\Widgets.exe",
        ),
        (
            "XboxPcAppFT.exe",
            r"C:\Program Files\WindowsApps\Microsoft.GamingApp\XboxPcAppFT.exe",
        ),
        (
            "SGTool.exe",
            r"D:\Program Files (x86)\SogouInput\SGTool.exe",
        ),
        (
            "SogouCloud.exe",
            r"D:\Program Files (x86)\SogouInput\SogouCloud.exe",
        ),
        (
            "WindowTool.exe",
            r"D:\Program Files (x86)\BitDock\WindowTool.exe",
        ),
        (
            "sldworks_fs.exe",
            r"D:\SolidWorks\RealSoftware\SOLIDWORKS\sldworks_fs.exe",
        ),
        (
            "vctip.exe",
            r"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\bin\vctip.exe",
        ),
        (
            "wallpaper64.exe",
            r"I:\SteamLibrary\steamapps\common\wallpaper_engine\wallpaper64.exe",
        ),
        (
            "webwallpaper32.exe",
            r"I:\SteamLibrary\steamapps\common\wallpaper_engine\bin\webwallpaper32.exe",
        ),
    ];

    for (process_name, executable_path) in noisy_processes {
        assert_eq!(
            classify_process(process_name, executable_path),
            Classification::Hidden,
            "{process_name} should be hidden"
        );
    }
}

#[test]
fn falls_back_to_clean_exe_name() {
    assert_eq!(
        classify_process("MyResearchTool.exe", r"D:\Tools\MyResearchTool.exe"),
        Classification::Tracked {
            display_name: "MyResearchTool".to_string()
        }
    );
}

#[test]
fn known_apps_are_not_hidden_by_helper_words_in_path() {
    assert_eq!(
        classify_process("firefox.exe", r"D:\Sync\Apps\firefox.exe"),
        Classification::Tracked {
            display_name: "Firefox".to_string()
        }
    );
}

#[test]
fn fallback_apps_are_not_hidden_by_helper_words_inside_name() {
    assert_eq!(
        classify_process("ServiceStudio.exe", r"C:\Tools\ServiceStudio.exe"),
        Classification::Tracked {
            display_name: "ServiceStudio".to_string()
        }
    );
}

#[test]
fn fallback_exe_cleanup_is_case_insensitive() {
    assert_eq!(
        classify_process("MyTool.Exe", r"D:\Tools\MyTool.Exe"),
        Classification::Tracked {
            display_name: "MyTool".to_string()
        }
    );
}
