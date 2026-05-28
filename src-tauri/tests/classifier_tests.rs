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
}

#[test]
fn hides_windows_and_helper_noise() {
    assert_eq!(
        classify_process("svchost.exe", r"C:\Windows\System32\svchost.exe"),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "msedgewebview2.exe",
            r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\148.0.3967.83\msedgewebview2.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "jhi_service.exe",
            r"C:\Windows\System32\DriverStore\FileRepository\jhi_service.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "SearchIndexer.exe",
            r"C:\Windows\System32\SearchIndexer.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "SecurityHealthService.exe",
            r"C:\Windows\System32\SecurityHealthService.exe"
        ),
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
        classify_process("AggregatorHost.exe", ""),
        Classification::Hidden
    );
    assert_eq!(
        classify_process("AppleMobileDeviceService.exe", ""),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "ListaryHookHost64.exe",
            r"D:\Program Files\Listary\ListaryHookHost64.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "MathWorksServiceHost.exe",
            r"C:\Users\dev\AppData\Local\MathWorks\ServiceHost\v2026.5.0.3\bin\win64\MathWorksServiceHost.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "Steam++.Accelerator.exe",
            r"C:\Program Files\WindowsApps\Steam++\modules\Accelerator\Steam++.Accelerator.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "promecefpluginhost.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\promecefpluginhost.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "global-software-timer.exe",
            r"D:\Projects\GlobalSoftwareTimer\global-software-timer.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "WeChatAppEx.exe",
            r"C:\Users\dev\AppData\Roaming\Tencent\xwechat\XPlugin\Plugins\RadiumWMPF\extracted\runtime\WeChatAppEx.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "Widgets.exe",
            r"C:\Program Files\WindowsApps\microsoftwindows.client.webexperience\Dashboard\Widgets.exe"
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
    assert_eq!(
        classify_process(
            "SogouCloud.exe",
            r"C:\Program Files (x86)\SogouInput\Components\SogouCloud.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "SGTool.exe",
            r"C:\Program Files (x86)\SogouInput\Components\SGTool.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process(
            "wpscloudsvr.exe",
            r"C:\Program Files\WPS Office\11.1.0.12345\office6\cef\wpscloudsvr.exe"
        ),
        Classification::Hidden
    );
    assert_eq!(
        classify_process("node.exe", r"C:\Program Files\nodejs\node.exe"),
        Classification::Hidden
    );
    assert_eq!(
        classify_process("cargo.exe", r"C:\Users\dev\.cargo\bin\cargo.exe"),
        Classification::Hidden
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
    assert_eq!(
        classify_process("Code.exe", ""),
        Classification::Tracked {
            display_name: "Visual Studio Code".to_string()
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
