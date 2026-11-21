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
fn hides_services_installers_and_tool_children_seen_in_real_history() {
    let noisy_processes = [
        // Always-on services and driver daemons with no window of their own.
        (
            "sqlservr.exe",
            r"C:\ProgramData\SOLIDWORKS Electrical\MSSQL15.TEW_SQLEXPRESS\MSSQL\Binn\sqlservr.exe",
        ),
        (
            "sqlceip.exe",
            r"C:\ProgramData\SOLIDWORKS Electrical\MSSQL15.TEW_SQLEXPRESS\MSSQL\Binn\sqlceip.exe",
        ),
        (
            "sqlwriter.exe",
            r"C:\Program Files\Microsoft SQL Server\90\Shared\sqlwriter.exe",
        ),
        (
            "sqlbrowser.exe",
            r"C:\Program Files (x86)\Microsoft SQL Server\90\Shared\sqlbrowser.exe",
        ),
        (
            "WTabletServicePro.exe",
            r"C:\Program Files\Tablet\Wacom\WTabletServicePro.exe",
        ),
        (
            "Wacom_Tablet.exe",
            r"C:\Program Files\Tablet\Wacom\Wacom_Tablet.exe",
        ),
        (
            "Wacom_TabletUser.exe",
            r"C:\Program Files\Tablet\Wacom\Wacom_TabletUser.exe",
        ),
        (
            "Wacom_TouchUser.exe",
            r"C:\Program Files\Tablet\Wacom\Wacom_TouchUser.exe",
        ),
        (
            "EwServer.exe",
            r"E:\software\SolidWorks\MAIN\SOLIDWORKS Electrical\server\EwServer.exe",
        ),
        (
            "dispatcher.exe",
            r"E:\software\SolidWorks\MAIN\SOLIDWORKS Flow Simulation\binCFW\dispatcher.exe",
        ),
        (
            "GameSDK.exe",
            r"C:\Program Files (x86)\ASUS\GameSDK Service\GameSDK.exe",
        ),
        (
            "mDNSResponder.exe",
            r"C:\Program Files\Bonjour\mDNSResponder.exe",
        ),
        (
            "OfficeClickToRun.exe",
            r"C:\Program Files\Common Files\microsoft shared\ClickToRun\OfficeClickToRun.exe",
        ),
        (
            "FNPLicensingService64.exe",
            r"C:\Program Files\Common Files\Macrovision Shared\FlexNet Publisher\FNPLicensingService64.exe",
        ),
        (
            "vpnclient_x64.exe",
            r"C:\Program Files\PacketiX VPN Client\vpnclient_x64.exe",
        ),
        (
            "gamingservices.exe",
            r"C:\Program Files\WindowsApps\Microsoft.GamingServices_36.113.14003.0_x64__8wekyb3d8bbwe\gamingservices.exe",
        ),
        (
            "gamingservicesnet.exe",
            r"C:\Program Files\WindowsApps\Microsoft.GamingServices_36.113.14003.0_x64__8wekyb3d8bbwe\gamingservicesnet.exe",
        ),
        (
            "TypeEasyTask.exe",
            r"E:\金山打字通\Typeeasy\11.9\TypeEasyTask.exe",
        ),
        (
            "kmenureg.exe",
            r"C:\ProgramData\SogouInput\shell_ext\sdk\wallpaper\1.0.0.14\kmenureg.exe",
        ),
        (
            "SGKaomoji.exe",
            r"D:\Software\SogouInput\16.2.0.3548\SGKaomoji.exe",
        ),
        // Helpers next to a main app that stays tracked.
        ("WinSMod.exe", r"C:\Program Files (x86)\BitDock\WinSMod.exe"),
        (
            "WinShowDesktop.exe",
            r"C:\Program Files (x86)\BitDock\WinShowDesktop.exe",
        ),
        (
            "TaskProcess.exe",
            r"C:\Program Files (x86)\BitDock\TaskProcess.exe",
        ),
        ("search.exe", r"C:\Program Files (x86)\BitDock\search.exe"),
        (
            "EternalCore.exe",
            r"D:\Users\dev\AppData\Local\Programs\Eternal\EternalCore.exe",
        ),
        (
            "MATLABWindow.exe",
            r"D:\Program Files\MATLAB\R2021a\bin\win64\MATLABWindow.exe",
        ),
        (
            "sldProcMon.exe",
            r"D:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\sldProcMon.exe",
        ),
        (
            "SLDEXITAPP.exe",
            r"D:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\SLDEXITAPP.exe",
        ),
        (
            "sldIM.exe",
            r"D:\Program Files\SolidWorks\SolidWorks2026\Setup\sldim\sldIM.exe",
        ),
        (
            "photolaunch.exe",
            r"C:\Users\dev\AppData\Local\kingsoft\WPS Office\12.1.0.26375\office6\photolaunch.exe",
        ),
        (
            "EnableLoopback.exe",
            r"C:\Program Files\FlClash\EnableLoopback.exe",
        ),
        (
            "FPSserver.exe",
            r"D:\Program Files (x86)\LeiGod_Acc\resources\leishenSdk\datacenter\game_fps_enhance\service\FPSserver.exe",
        ),
        (
            "pubkey_verify.exe",
            r"D:\Program Files\Cadence_Install\Cadence\SPB_17.4\tools\pubkey_verify.exe",
        ),
        (
            "CheckNETInst.exe",
            r"C:\Program Files (x86)\RIGOL\Ultra Sigma\CheckNETInst.exe",
        ),
        // Command-line tools spawned by editors and agents.
        ("git.exe", r"C:\Program Files\Git\cmd\git.exe"),
        (
            "git-remote-https.exe",
            r"C:\Program Files\Git\mingw64\libexec\git-core\git-remote-https.exe",
        ),
        ("rustup.exe", r"C:\Users\dev\.cargo\bin\rustup.exe"),
        (
            "pwsh.exe",
            r"C:\Users\dev\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe",
        ),
        (
            "codex-computer-use.exe",
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\runtimes\cua_node\e4d75eceaa042f20\bin\codex-computer-use.exe",
        ),
        // Installers, uninstallers and their unpacked temp stages.
        (
            "windows-x64-3.2.206.tmp",
            r"C:\Users\dev\AppData\Local\Temp\is-LPFG0.tmp\windows-x64-3.2.206.tmp",
        ),
        (
            "InstallConfig.exe",
            r"C:\Users\dev\AppData\Local\Temp\{850611C4-DE22-4A4B-9BD8-169B4F611E8B}\InstallConfig.exe",
        ),
        (
            "Un.exe",
            r"C:\Users\dev\AppData\Local\Temp\~nsu1.tmp\Un.exe",
        ),
        ("geek64.exe", r"C:\Users\dev\AppData\Local\Temp\geek64.exe"),
        (
            "parsec-windows.exe",
            r"C:\Users\dev\Downloads\parsec-windows.exe",
        ),
        (
            "Transocks_Win_v3.5.7_official_x64 (1).exe",
            r"C:\Users\dev\Downloads\Transocks_Win_v3.5.7_official_x64 (1).exe",
        ),
        (
            "5EClient-8.2.7.exe",
            r"C:\Users\dev\AppData\Local\5eclient-updater\pending\5EClient-8.2.7.exe",
        ),
        (
            "uninstall.exe",
            r"C:\Users\dev\AppData\Local\Global Software Timer\uninstall.exe",
        ),
        ("unins000.exe", r"D:\Program Files\SomeApp\unins000.exe"),
        (
            "vcredist_x86_sp1.exe",
            r"D:\Program Files\Cadence_Install\Cadence\SPB_17.4\tools\msbase\vn2008\vcredist_x86_sp1.exe",
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
fn keeps_real_apps_that_mostly_run_in_the_background() {
    let real_apps = [
        (
            "Listary.exe",
            r"C:\Program Files\Listary\Listary.exe",
            "Listary",
        ),
        (
            "Snipaste.exe",
            r"E:\software\Snipaste\Snipaste.exe",
            "Snipaste",
        ),
        (
            "BitDock.exe",
            r"C:\Program Files (x86)\BitDock\BitDock.exe",
            "BitDock",
        ),
        (
            "BitSetting.exe",
            r"C:\Program Files (x86)\BitDock\BitSetting.exe",
            "BitSetting",
        ),
        (
            "Eternal.exe",
            r"D:\Users\dev\AppData\Local\Programs\Eternal\Eternal.exe",
            "Eternal",
        ),
        (
            "MATLAB.exe",
            r"D:\Program Files\MATLAB\R2021a\bin\win64\MATLAB.exe",
            "MATLAB",
        ),
        (
            "eDrawings.exe",
            r"D:\Program Files\SOLIDWORKS Corp\eDrawings\eDrawings.exe",
            "eDrawings",
        ),
        (
            "tailscale-ipn.exe",
            r"C:\Program Files\Tailscale\tailscale-ipn.exe",
            "tailscale-ipn",
        ),
        (
            "ollama app.exe",
            r"C:\Users\dev\AppData\Local\Programs\Ollama\ollama app.exe",
            "ollama app",
        ),
        (
            "FACEIT.exe",
            r"C:\Users\dev\AppData\Local\FACEIT\app-2.11.2\FACEIT.exe",
            "FACEIT",
        ),
        (
            "pwsh.exe",
            r"C:\Program Files\PowerShell\7\pwsh.exe",
            "PowerShell",
        ),
        (
            "GitHubDesktop.exe",
            r"C:\Users\dev\AppData\Local\GitHubDesktop\app-3.4.0\GitHubDesktop.exe",
            "GitHubDesktop",
        ),
    ];

    for (process_name, executable_path, display_name) in real_apps {
        assert_eq!(
            classify_process(process_name, executable_path),
            Classification::Tracked {
                display_name: display_name.to_string()
            },
            "{process_name} should stay tracked"
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
