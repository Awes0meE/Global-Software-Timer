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
