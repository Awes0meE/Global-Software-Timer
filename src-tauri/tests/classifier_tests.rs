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

    let wps_suite_processes = [
        (
            "wps.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wps.exe",
        ),
        (
            "et.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\et.exe",
        ),
        (
            "wpp.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wpp.exe",
        ),
        (
            "wpspdf.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wpspdf.exe",
        ),
    ];
    for (process_name, executable_path) in wps_suite_processes {
        assert_eq!(
            classify_process(process_name, executable_path),
            Classification::Tracked {
                display_name: "WPS Office".to_string()
            },
            "{process_name} should be grouped under WPS Office"
        );
    }
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
        (
            "CodeSetup-stable-8761a.exe",
            r"C:\Users\dev\AppData\Local\Temp\CodeSetup-stable-8761a.exe",
        ),
        (
            "WindowsPackageManager.exe",
            r"C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\WindowsPackageManager.exe",
        ),
        (
            "codex-windows-sandbox-s.exe",
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\codex-windows-sandbox-s.exe",
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
fn hides_hardware_vendor_background_noise_without_hiding_main_apps() {
    assert_eq!(
        classify_process(
            "ArmouryCrate.exe",
            r"C:\Program Files\ASUS\ARMOURY CRATE Service\ArmouryCrate.exe",
        ),
        Classification::Tracked {
            display_name: "Armoury Crate".to_string()
        }
    );

    let noisy_processes = [
        (
            "asus_framework.exe",
            r"C:\Program Files\ASUS\ARMOURY CRATE Service\asus_framework.exe",
        ),
        (
            "NvContainer.exe",
            r"C:\Program Files\NVIDIA Corporation\NvContainer\nvcontainer.exe",
        ),
        (
            "ACPowerNotification.exe",
            r"C:\Program Files\ASUS\ArmouryDevice\ACPowerNotification.exe",
        ),
        (
            "ArmouryCrate.DenoiseAI.exe",
            r"C:\Program Files\ASUS\ARMOURY CRATE Service\ArmouryCrate.DenoiseAI.exe",
        ),
        (
            "ArmouryHtmlDebugServer.exe",
            r"C:\Program Files\ASUS\ARMOURY CRATE Service\ArmouryHtmlDebugServer.exe",
        ),
        (
            "ArmourySocketServer.exe",
            r"C:\Program Files\ASUS\ARMOURY CRATE Service\ArmourySocketServer.exe",
        ),
        (
            "AsusMultiAntennaSvc.exe",
            r"C:\Program Files\ASUS\ArmouryDevice\AsusMultiAntennaSvc.exe",
        ),
        (
            "AsusSmartDisplayControl.exe",
            r"C:\Program Files\ASUS\ArmouryDevice\AsusSmartDisplayControl.exe",
        ),
    ];

    for (process_name, executable_path) in noisy_processes {
        assert_eq!(
            classify_process(process_name, executable_path),
            Classification::Hidden,
            "{process_name} should be hidden"
        );
    }

    assert_eq!(
        classify_process("MyArmouryTool.exe", r"D:\Tools\MyArmouryTool.exe"),
        Classification::Tracked {
            display_name: "MyArmouryTool".to_string()
        }
    );
    assert_eq!(
        classify_process(
            "NvidiaApp.exe",
            r"C:\Program Files\NVIDIA Corporation\NVIDIA app\NvidiaApp.exe",
        ),
        Classification::Tracked {
            display_name: "NvidiaApp".to_string()
        }
    );
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
fn hides_codex_backend_helpers_but_keeps_desktop_app_visible() {
    assert_eq!(
        classify_process(
            "Codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.527.3686.0_x64__2p2nqsd0c76g0\app\Codex.exe",
        ),
        Classification::Tracked {
            display_name: "Codex".to_string()
        }
    );

    let helper_processes = [
        (
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.527.3686.0_x64__2p2nqsd0c76g0\app\resources\codex.exe",
        ),
        (
            "codex.exe",
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\7dea4a003bc76627\codex.exe",
        ),
        (
            "codex.exe",
            r"C:\Users\dev\.vscode\extensions\openai.chatgpt-26.519.32039-win32-x64\bin\windows-x86_64\codex.exe",
        ),
    ];

    for (process_name, executable_path) in helper_processes {
        assert_eq!(
            classify_process(process_name, executable_path),
            Classification::Hidden,
            "{executable_path} should be hidden"
        );
    }
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
