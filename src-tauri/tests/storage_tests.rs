use chrono::{Duration, Local, TimeZone, Utc};
use global_software_timer_lib::storage::Store;
use tempfile::NamedTempFile;

#[test]
fn migrate_creates_expected_tables_and_wal_mode() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let tables = store.table_names().expect("table names");
    assert!(tables.contains(&"apps".to_string()));
    assert!(tables.contains(&"run_events".to_string()));
    assert!(tables.contains(&"usage_sessions".to_string()));
    assert!(tables.contains(&"daily_app_usage".to_string()));
    assert!(tables.contains(&"daily_system_usage".to_string()));
    assert!(tables.contains(&"daily_software_runtime_usage".to_string()));
    assert!(tables.contains(&"app_settings".to_string()));
    assert_eq!(store.journal_mode().expect("journal mode"), "wal");
}

#[test]
fn open_enables_foreign_key_enforcement() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");

    assert!(store.foreign_keys_enabled().expect("foreign keys enabled"));
}

#[test]
fn app_upsert_keeps_user_facing_identity() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let app = store
        .upsert_app(
            "code.exe",
            "C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
            "Visual Studio Code",
        )
        .expect("upsert app");

    assert_eq!(app.process_name, "code.exe");
    assert_eq!(app.display_name, "Visual Studio Code");
    assert!(!app.is_hidden);

    let again = store
        .upsert_app(
            "CODE.EXE",
            "C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
            "VS Code",
        )
        .expect("upsert same app");

    assert_eq!(app.id, again.id);
    assert_eq!(again.display_name, "Visual Studio Code");
}

#[test]
fn app_usage_summary_includes_closed_and_open_sessions_for_today() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code app");
    let word = store
        .upsert_app(
            "WINWORD.EXE",
            r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
            "Microsoft Word",
        )
        .expect("word app");

    let closed_start = Utc.with_ymd_and_hms(2026, 5, 28, 23, 59, 0).unwrap();
    let closed_end = Utc.with_ymd_and_hms(2026, 5, 29, 0, 1, 0).unwrap();
    let closed_id = store
        .start_session(code.id, closed_start)
        .expect("start closed");
    store
        .close_session(closed_id, closed_end, "process_closed", false)
        .expect("close closed");

    let open_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 30).unwrap();
    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 0, 2, 0).unwrap();
    let open_id = store
        .start_session(word.id, open_start)
        .expect("start open");
    store
        .heartbeat_session(open_id, now)
        .expect("heartbeat open");

    let rows = store
        .app_usage_summary(day_start, now)
        .expect("usage summary");

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].display_name, "Visual Studio Code");
    assert_eq!(rows[0].total_seconds, 120);
    assert_eq!(rows[0].today_seconds, 60);
    assert!(!rows[0].is_running);
    assert_eq!(rows[1].display_name, "Microsoft Word");
    assert_eq!(rows[1].total_seconds, 90);
    assert_eq!(rows[1].today_seconds, 90);
    assert!(rows[1].is_running);
}

#[test]
fn app_usage_summary_caps_open_sessions_at_last_heartbeat() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code app");

    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let heartbeat_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 1, 0).unwrap();
    let query_at = Utc.with_ymd_and_hms(2026, 5, 29, 12, 0, 0).unwrap();
    let session_id = store.start_session(app.id, started_at).expect("start");
    store
        .heartbeat_session(session_id, heartbeat_at)
        .expect("heartbeat");

    let rows = store
        .app_usage_summary(started_at, query_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].total_seconds, 60);
    assert_eq!(rows[0].today_seconds, 60);
    assert!(rows[0].is_running);
}

#[test]
fn app_usage_summary_applies_default_classifier_to_existing_rows() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code app");
    let node = store
        .upsert_app("node.exe", r"C:\Program Files\nodejs\node.exe", "node")
        .expect("node app");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    for app_id in [code.id, node.id] {
        let session_id = store.start_session(app_id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary(day_start, ended_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "Visual Studio Code");
}

#[test]
fn app_usage_summary_merges_same_classified_application_rows() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let first_wps = store
        .upsert_app(
            "wps.exe",
            r"C:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wps.exe",
            "wps",
        )
        .expect("first wps");
    let second_wps = store
        .upsert_app(
            "wps.exe",
            r"D:\Users\dev\AppData\Local\Kingsoft\WPSOFF~1\office6\wps.exe",
            "wps",
        )
        .expect("second wps");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let first_start = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let first_end = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    let second_start = Utc.with_ymd_and_hms(2026, 5, 29, 10, 0, 0).unwrap();
    let second_end = Utc.with_ymd_and_hms(2026, 5, 29, 10, 2, 0).unwrap();

    let first_session = store
        .start_session(first_wps.id, first_start)
        .expect("first start");
    store
        .close_session(first_session, first_end, "process_closed", false)
        .expect("first close");
    let second_session = store
        .start_session(second_wps.id, second_start)
        .expect("second start");
    store
        .close_session(second_session, second_end, "process_closed", false)
        .expect("second close");

    let rows = store
        .app_usage_summary(day_start, second_end)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "WPS Office");
    assert_eq!(rows[0].process_name, "wps.exe");
    assert_eq!(rows[0].total_seconds, 420);
    assert_eq!(rows[0].today_seconds, 420);
}

#[test]
fn app_usage_summary_merges_wps_suite_components() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let apps = [
        store
            .upsert_app(
                "wps.exe",
                r"C:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wps.exe",
                "wps",
            )
            .expect("wps app"),
        store
            .upsert_app(
                "et.exe",
                r"C:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\et.exe",
                "et",
            )
            .expect("spreadsheet app"),
        store
            .upsert_app(
                "wpp.exe",
                r"C:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wpp.exe",
                "wpp",
            )
            .expect("presentation app"),
        store
            .upsert_app(
                "wpspdf.exe",
                r"C:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wpspdf.exe",
                "wpspdf",
            )
            .expect("pdf app"),
    ];

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let query_at = Utc.with_ymd_and_hms(2026, 5, 29, 10, 10, 0).unwrap();
    for (index, app) in apps.iter().enumerate() {
        let started_at = Utc
            .with_ymd_and_hms(2026, 5, 29, 9, index as u32 * 2, 0)
            .unwrap();
        let ended_at = started_at + chrono::Duration::minutes(1);
        let session_id = store.start_session(app.id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary(day_start, query_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "WPS Office");
    assert_eq!(rows[0].total_seconds, 240);
    assert_eq!(rows[0].today_seconds, 240);
}

#[test]
fn app_usage_summary_uses_wps_main_executable_for_suite_icon() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let wps_pdf = store
        .upsert_app(
            "wpspdf.exe",
            r"C:\Users\dev\AppData\Local\Kingsoft\WPS Office\office6\wpspdf.exe",
            "wpspdf",
        )
        .expect("pdf app");
    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    let session_id = store.start_session(wps_pdf.id, started_at).expect("start");
    store
        .close_session(session_id, ended_at, "process_closed", false)
        .expect("close");

    let rows = store
        .app_usage_summary(day_start, ended_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "WPS Office");
    assert_eq!(rows[0].process_name, "wpspdf.exe");
    assert!(rows[0].executable_path.ends_with(r"\office6\wps.exe"));
}

#[test]
fn app_usage_summary_counts_overlapping_same_app_sessions_once() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let first_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex\app\Codex.exe",
            "Codex",
        )
        .expect("first codex");
    let second_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_2.0.0.0_x64__abc\app\Codex.exe",
            "Codex",
        )
        .expect("second codex");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let first_end = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    let second_end = Utc.with_ymd_and_hms(2026, 5, 29, 9, 3, 0).unwrap();

    let first_session = store
        .start_session(first_codex.id, started_at)
        .expect("first start");
    store
        .close_session(first_session, first_end, "process_closed", false)
        .expect("first close");
    let second_session = store
        .start_session(second_codex.id, started_at)
        .expect("second start");
    store
        .close_session(second_session, second_end, "process_closed", false)
        .expect("second close");

    let rows = store
        .app_usage_summary(day_start, first_end)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "Codex");
    assert_eq!(rows[0].total_seconds, 300);
    assert_eq!(rows[0].today_seconds, 300);
}

#[test]
fn app_usage_summary_ignores_codex_backend_helper_when_packaged_app_exists() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let backend_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\958d608b5e0546a5\codex.exe",
            "Codex",
        )
        .expect("backend codex");
    let packaged_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1.0.0.0_x64__abc\app\Codex.exe",
            "Codex",
        )
        .expect("packaged codex");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    for app_id in [backend_codex.id, packaged_codex.id] {
        let session_id = store.start_session(app_id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary(day_start, ended_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].total_seconds, 300);
    assert_eq!(
        rows[0].executable_path,
        r"C:\Program Files\WindowsApps\OpenAI.Codex_1.0.0.0_x64__abc\app\Codex.exe"
    );
}

#[test]
fn open_codex_backend_helper_does_not_keep_closed_desktop_app_running() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let desktop_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1.0.0.0_x64__abc\app\Codex.exe",
            "Codex",
        )
        .expect("desktop codex");
    let backend_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1.0.0.0_x64__abc\app\resources\codex.exe",
            "Codex",
        )
        .expect("backend codex");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let desktop_end = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    let query_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 10, 0).unwrap();
    let desktop_session = store
        .start_session(desktop_codex.id, started_at)
        .expect("desktop start");
    store
        .close_session(desktop_session, desktop_end, "process_closed", false)
        .expect("desktop close");
    let backend_session = store
        .start_session(backend_codex.id, started_at)
        .expect("backend start");
    store
        .heartbeat_session(backend_session, query_at)
        .expect("backend heartbeat");

    let rows = store
        .app_usage_summary(day_start, query_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "Codex");
    assert_eq!(rows[0].total_seconds, 300);
    assert!(!rows[0].is_running);
}

#[test]
fn app_usage_summary_prefers_existing_install_path_over_stale_package_path() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let stale_path = temp_dir
        .path()
        .join("Program Files")
        .join("WindowsApps")
        .join("OpenAI.Codex_26.519.11010.0_x64__abc")
        .join("app")
        .join("Codex.exe");
    let current_path = temp_dir
        .path()
        .join("Program Files")
        .join("WindowsApps")
        .join("OpenAI.Codex_26.527.3686.0_x64__abc")
        .join("app")
        .join("Codex.exe");
    std::fs::create_dir_all(current_path.parent().expect("current parent")).expect("current dir");
    std::fs::write(&current_path, b"MZ").expect("current exe placeholder");

    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let stale_codex = store
        .upsert_app("codex.exe", &stale_path.to_string_lossy(), "Codex")
        .expect("stale codex");
    let current_codex = store
        .upsert_app("codex.exe", &current_path.to_string_lossy(), "Codex")
        .expect("current codex");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();
    for app_id in [stale_codex.id, current_codex.id] {
        let session_id = store.start_session(app_id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary(day_start, ended_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].executable_path, current_path.to_string_lossy());
}

#[test]
fn app_usage_summary_merges_foreground_active_seconds_for_today() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let first_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex\app\Codex.exe",
            "Codex",
        )
        .expect("first codex");
    let second_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_2.0.0.0_x64__abc\app\Codex.exe",
            "Codex",
        )
        .expect("second codex");
    let date = chrono::NaiveDate::from_ymd_opt(2026, 5, 29).unwrap();
    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 5, 0).unwrap();

    for app_id in [first_codex.id, second_codex.id] {
        let session_id = store.start_session(app_id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
    }
    store
        .increment_daily_app_usage(date, first_codex.id, 0, 7)
        .expect("first active");
    store
        .increment_daily_app_usage(date, second_codex.id, 0, 5)
        .expect("second active");

    let rows = store
        .app_usage_summary_for_date(day_start, ended_at, date)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "Codex");
    assert_eq!(rows[0].active_today_seconds, 12);
}

#[test]
fn daily_system_usage_accumulates_and_defaults_to_none() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let date = chrono::NaiveDate::from_ymd_opt(2026, 5, 29).unwrap();

    assert!(store
        .daily_system_usage(date)
        .expect("empty usage")
        .is_none());

    store
        .increment_daily_system_usage(date, 5, 3, 5)
        .expect("first increment");
    store
        .increment_daily_system_usage(date, 7, 0, 7)
        .expect("second increment");

    let usage = store
        .daily_system_usage(date)
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(usage.recorded_seconds, 12);
    assert_eq!(usage.active_seconds, 3);
    assert_eq!(usage.tracker_uptime_seconds, 12);
}

#[test]
fn settings_round_trip_and_can_be_removed() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    assert_eq!(
        store
            .setting_value("window.close_behavior")
            .expect("empty setting"),
        None
    );

    store
        .set_setting_value("window.close_behavior", "minimize_to_tray")
        .expect("set setting");
    assert_eq!(
        store
            .setting_value("window.close_behavior")
            .expect("read setting"),
        Some("minimize_to_tray".to_string())
    );

    store
        .remove_setting("window.close_behavior")
        .expect("remove setting");
    assert_eq!(
        store
            .setting_value("window.close_behavior")
            .expect("removed setting"),
        None
    );
}

#[test]
fn migrate_creates_software_identity_tables() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let tables = store.table_names().expect("table names");
    assert!(tables.contains(&"software_identities".to_string()));
    assert!(tables.contains(&"software_identity_members".to_string()));
    assert!(tables.contains(&"focused_software_identities".to_string()));
    assert!(tables.contains(&"hidden_software_identities".to_string()));
    assert!(tables.contains(&"daily_software_focus_usage".to_string()));
    assert!(tables.contains(&"daily_software_runtime_usage".to_string()));
}

#[test]
fn software_identity_groups_wps_components_under_one_key() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let wps = store
        .upsert_app("wps.exe", r"C:\Kingsoft\WPS Office\office6\wps.exe", "wps")
        .expect("wps");
    let sheet = store
        .upsert_app("et.exe", r"C:\Kingsoft\WPS Office\office6\et.exe", "et")
        .expect("sheet");

    let first = store
        .upsert_software_identity_for_app(wps.id)
        .expect("first identity");
    let second = store
        .upsert_software_identity_for_app(sheet.id)
        .expect("second identity");

    assert_eq!(first.identity_key, "known:wps-office");
    assert_eq!(second.identity_key, first.identity_key);
    assert_eq!(first.display_name, "WPS Office");
    assert_eq!(
        store
            .software_identity_member_ids("known:wps-office")
            .expect("members"),
        vec![wps.id, sheet.id]
    );
}

#[test]
fn start_session_rolls_back_when_identity_cache_refresh_fails() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let schema_conn = rusqlite::Connection::open(db_file.path()).expect("open schema conn");
    schema_conn
        .execute("DROP TABLE software_identity_members", [])
        .expect("drop members table");
    drop(schema_conn);

    let started_at = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let result = store.start_session(app.id, started_at);

    assert!(result.is_err());
    assert!(store.all_sessions().expect("sessions").is_empty());
}

#[test]
fn start_session_updates_identity_membership_and_keeps_latest_opened_time() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let started_at = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let older_opened_at = Utc.with_ymd_and_hms(2026, 6, 5, 8, 0, 0).unwrap();

    store.start_session(app.id, started_at).expect("start");
    let identity_key = store
        .software_identity_key_for_app(app.id)
        .expect("identity key")
        .expect("identity key exists");
    assert_eq!(
        store
            .software_identity_member_ids(&identity_key)
            .expect("members"),
        vec![app.id]
    );

    let identity = store
        .upsert_software_identity_for_app_started_at(app.id, older_opened_at)
        .expect("older identity upsert");
    assert_eq!(identity.last_opened_at, Some(started_at));
}

#[test]
fn focused_and_hidden_identity_lists_are_mutually_exclusive_and_sorted_newest_first() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code");
    let chrome = store
        .upsert_app("chrome.exe", r"C:\Chrome\chrome.exe", "Google Chrome")
        .expect("chrome");
    let code_identity = store
        .upsert_software_identity_for_app(code.id)
        .expect("code identity");
    let chrome_identity = store
        .upsert_software_identity_for_app(chrome.id)
        .expect("chrome identity");

    store
        .add_focused_software_identities(std::slice::from_ref(&code_identity.identity_key))
        .expect("focus code");
    store
        .add_focused_software_identities(std::slice::from_ref(&chrome_identity.identity_key))
        .expect("focus chrome");

    let focused = store
        .focused_software_identity_keys()
        .expect("focused rows");
    assert_eq!(
        focused,
        vec![
            chrome_identity.identity_key.clone(),
            code_identity.identity_key.clone()
        ]
    );

    let hidden_result = store.add_hidden_software_identities(&[code_identity.identity_key]);
    assert!(hidden_result.is_err());
}

#[test]
fn focused_identity_mixed_batch_conflict_rolls_back_valid_keys() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code");
    let chrome = store
        .upsert_app("chrome.exe", r"C:\Chrome\chrome.exe", "Google Chrome")
        .expect("chrome");
    let code_identity = store
        .upsert_software_identity_for_app(code.id)
        .expect("code identity");
    let chrome_identity = store
        .upsert_software_identity_for_app(chrome.id)
        .expect("chrome identity");

    store
        .add_hidden_software_identities(std::slice::from_ref(&code_identity.identity_key))
        .expect("hide code");
    let result = store.add_focused_software_identities(&[
        chrome_identity.identity_key.clone(),
        code_identity.identity_key.clone(),
    ]);

    assert!(result.is_err());
    assert!(store
        .focused_software_identity_keys()
        .expect("focused rows")
        .is_empty());
}

#[test]
fn hidden_conflict_wins_when_reading_identity_mark() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");

    let conflict_conn = rusqlite::Connection::open(db_file.path()).expect("open conflict conn");
    conflict_conn
        .execute(
            "INSERT INTO focused_software_identities (identity_key) VALUES (?1)",
            [&identity.identity_key],
        )
        .expect("force focus");
    conflict_conn
        .execute(
            "INSERT INTO hidden_software_identities (identity_key) VALUES (?1)",
            [&identity.identity_key],
        )
        .expect("force hidden");

    assert_eq!(
        store
            .software_identity_mark(&identity.identity_key)
            .expect("mark"),
        "hidden"
    );
}

#[test]
fn daily_software_focus_usage_accumulates_by_identity() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");
    let date = chrono::NaiveDate::from_ymd_opt(2026, 6, 5).unwrap();

    store
        .increment_daily_software_focus_usage(date, &identity.identity_key, 5)
        .expect("first increment");
    store
        .increment_daily_software_focus_usage(date, &identity.identity_key, 7)
        .expect("second increment");

    assert_eq!(
        store
            .software_focus_seconds_for_date(date)
            .expect("focus seconds")
            .get(&identity.identity_key)
            .copied(),
        Some(12)
    );
}

#[test]
fn app_usage_summary_excludes_hidden_software_identities() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code");
    let bitdock = store
        .upsert_app("BitDock.exe", r"C:\Tools\BitDock\BitDock.exe", "BitDock")
        .expect("bitdock");
    let hidden_identity = store
        .upsert_software_identity_for_app(bitdock.id)
        .expect("hidden identity");
    store
        .add_hidden_software_identities(&[hidden_identity.identity_key])
        .expect("hide bitdock");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    for app_id in [code.id, bitdock.id] {
        let session = store.start_session(app_id, start).expect("start");
        store
            .close_session(session, end, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary_for_date(start, end, start.date_naive())
        .expect("summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].display_name, "Visual Studio Code");
}

#[test]
fn software_page_summary_rows_include_marks_and_last_opened() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code");
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let session = store.start_session(code.id, start).expect("start");
    store
        .close_session(session, end, "process_closed", false)
        .expect("close");
    let identity = store
        .upsert_software_identity_for_app_started_at(code.id, start)
        .expect("identity");
    store
        .add_focused_software_identities(std::slice::from_ref(&identity.identity_key))
        .expect("focus");

    let rows = store
        .software_page_rows(start, end, start.date_naive(), &Default::default())
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.focused.len(), 1);
    assert_eq!(rows.hidden.len(), 0);
    assert_eq!(rows.discovered[0].mark, "focused");
    assert_eq!(rows.discovered[0].last_opened_at, Some(start));
}

#[test]
fn hidden_software_filter_can_be_removed_without_losing_raw_sessions() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code");
    let chrome = store
        .upsert_app("chrome.exe", r"C:\Chrome\chrome.exe", "Google Chrome")
        .expect("chrome");
    let hidden_identity = store
        .upsert_software_identity_for_app(chrome.id)
        .expect("hidden identity");
    store
        .add_hidden_software_identities(std::slice::from_ref(&hidden_identity.identity_key))
        .expect("hide chrome");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    for app_id in [code.id, chrome.id] {
        let session = store.start_session(app_id, start).expect("start");
        store
            .close_session(session, end, "process_closed", false)
            .expect("close");
    }
    assert_eq!(store.all_sessions().expect("raw sessions").len(), 2);

    let hidden_rows = store
        .app_usage_summary_for_date(start, end, start.date_naive())
        .expect("hidden summary");
    assert_eq!(hidden_rows.len(), 1);
    assert_eq!(hidden_rows[0].display_name, "Visual Studio Code");

    store
        .remove_hidden_software_identity(&hidden_identity.identity_key)
        .expect("unhide chrome");
    let restored_rows = store
        .app_usage_summary_for_date(start, end, start.date_naive())
        .expect("restored summary");
    let restored_names = restored_rows
        .iter()
        .map(|row| row.display_name.as_str())
        .collect::<Vec<_>>();

    assert_eq!(restored_rows.len(), 2);
    assert!(restored_names.contains(&"Google Chrome"));
    assert!(restored_names.contains(&"Visual Studio Code"));
    assert_eq!(store.all_sessions().expect("unchanged sessions").len(), 2);
}

#[test]
fn software_page_rows_show_hidden_identity_and_hidden_wins_conflict() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");
    store
        .add_hidden_software_identities(std::slice::from_ref(&identity.identity_key))
        .expect("hide");

    let conflict_conn = rusqlite::Connection::open(db_file.path()).expect("open conflict conn");
    conflict_conn
        .execute(
            "INSERT INTO focused_software_identities (identity_key) VALUES (?1)",
            [&identity.identity_key],
        )
        .expect("force focused conflict");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let rows = store
        .software_page_rows(start, end, start.date_naive(), &Default::default())
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.hidden.len(), 1);
    assert_eq!(rows.focused.len(), 0);
    assert_eq!(rows.discovered[0].identity_key, identity.identity_key);
    assert_eq!(rows.discovered[0].mark, "hidden");
    assert_eq!(rows.hidden[0].mark, "hidden");
}

#[test]
fn software_page_rows_sort_focused_and_hidden_newest_added_first() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let code = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("code");
    let chrome = store
        .upsert_app("chrome.exe", r"C:\Chrome\chrome.exe", "Google Chrome")
        .expect("chrome");
    let bitdock = store
        .upsert_app("BitDock.exe", r"C:\Tools\BitDock\BitDock.exe", "BitDock")
        .expect("bitdock");
    let obsidian = store
        .upsert_app(
            "Obsidian.exe",
            r"C:\Tools\Obsidian\Obsidian.exe",
            "Obsidian",
        )
        .expect("obsidian");
    let code_identity = store
        .upsert_software_identity_for_app(code.id)
        .expect("code identity");
    let chrome_identity = store
        .upsert_software_identity_for_app(chrome.id)
        .expect("chrome identity");
    let bitdock_identity = store
        .upsert_software_identity_for_app(bitdock.id)
        .expect("bitdock identity");
    let obsidian_identity = store
        .upsert_software_identity_for_app(obsidian.id)
        .expect("obsidian identity");

    store
        .add_focused_software_identities(std::slice::from_ref(&code_identity.identity_key))
        .expect("focus code");
    store
        .add_focused_software_identities(std::slice::from_ref(&chrome_identity.identity_key))
        .expect("focus chrome");
    store
        .add_hidden_software_identities(std::slice::from_ref(&bitdock_identity.identity_key))
        .expect("hide bitdock");
    store
        .add_hidden_software_identities(std::slice::from_ref(&obsidian_identity.identity_key))
        .expect("hide obsidian");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let rows = store
        .software_page_rows(start, end, start.date_naive(), &Default::default())
        .expect("software rows");
    let focused_keys = rows
        .focused
        .iter()
        .map(|row| row.identity_key.as_str())
        .collect::<Vec<_>>();
    let hidden_keys = rows
        .hidden
        .iter()
        .map(|row| row.identity_key.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        focused_keys,
        vec![
            chrome_identity.identity_key.as_str(),
            code_identity.identity_key.as_str()
        ]
    );
    assert_eq!(
        hidden_keys,
        vec![
            obsidian_identity.identity_key.as_str(),
            bitdock_identity.identity_key.as_str()
        ]
    );
}

#[test]
fn software_page_rows_split_today_and_total_focus_seconds() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");
    let previous_date = chrono::NaiveDate::from_ymd_opt(2026, 6, 4).unwrap();
    let usage_date = chrono::NaiveDate::from_ymd_opt(2026, 6, 5).unwrap();
    store
        .increment_daily_software_focus_usage(previous_date, &identity.identity_key, 5)
        .expect("previous focus");
    store
        .increment_daily_software_focus_usage(usage_date, &identity.identity_key, 7)
        .expect("today focus");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let rows = store
        .software_page_rows(start, end, usage_date, &Default::default())
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].today_focused_seconds, 7);
    assert_eq!(rows.discovered[0].total_focused_seconds, 12);
}

#[test]
fn software_page_rows_split_foreground_and_background_runtime_seconds() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");
    let previous_date = chrono::NaiveDate::from_ymd_opt(2026, 6, 4).unwrap();
    let usage_date = chrono::NaiveDate::from_ymd_opt(2026, 6, 5).unwrap();
    store
        .increment_daily_software_runtime_usage(
            previous_date,
            &identity.identity_key,
            5,
            2,
            Utc.with_ymd_and_hms(2026, 6, 4, 9, 0, 0).unwrap(),
        )
        .expect("previous runtime");
    store
        .increment_daily_software_runtime_usage(
            usage_date,
            &identity.identity_key,
            7,
            3,
            Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap(),
        )
        .expect("today runtime");

    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let rows = store
        .software_page_rows(start, end, usage_date, &Default::default())
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].today_foreground_seconds, 7);
    assert_eq!(rows.discovered[0].today_background_seconds, 3);
    assert_eq!(rows.discovered[0].today_runtime_seconds, 10);
    assert_eq!(rows.discovered[0].total_foreground_seconds, 12);
    assert_eq!(rows.discovered[0].total_background_seconds, 5);
    assert_eq!(rows.discovered[0].total_runtime_seconds, 17);
}

#[test]
fn software_page_rows_keep_legacy_runtime_when_split_runtime_exists_for_newer_dates() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    let identity = store
        .upsert_software_identity_for_app(app.id)
        .expect("identity");
    let previous_start = Utc.with_ymd_and_hms(2026, 6, 4, 9, 0, 0).unwrap();
    let previous_end = Utc.with_ymd_and_hms(2026, 6, 4, 9, 5, 0).unwrap();
    let local_today_start = Local
        .with_ymd_and_hms(2026, 6, 5, 0, 30, 0)
        .single()
        .expect("local start");
    let today_start = local_today_start.with_timezone(&Utc);
    let today_end = today_start + Duration::minutes(5);

    for (start, end) in [(previous_start, previous_end), (today_start, today_end)] {
        let session = store.start_session(app.id, start).expect("start");
        store
            .close_session(session, end, "process_closed", false)
            .expect("close");
    }
    store
        .increment_daily_software_runtime_usage(
            local_today_start.date_naive(),
            &identity.identity_key,
            7,
            3,
            today_start,
        )
        .expect("today split runtime");

    let rows = store
        .software_page_rows(
            local_today_start
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .and_then(|value| Local.from_local_datetime(&value).single())
                .expect("local day start")
                .with_timezone(&Utc),
            today_end,
            local_today_start.date_naive(),
            &Default::default(),
        )
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].today_foreground_seconds, 7);
    assert_eq!(rows.discovered[0].today_background_seconds, 3);
    assert_eq!(rows.discovered[0].total_foreground_seconds, 5 * 60 + 7);
    assert_eq!(rows.discovered[0].total_background_seconds, 3);
    assert_eq!(rows.discovered[0].total_runtime_seconds, 5 * 60 + 10);
}

#[test]
fn software_page_rows_backfill_last_opened_from_legacy_sessions() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            r"C:\Tools\VS Code\Code.exe",
            "Visual Studio Code",
        )
        .expect("app");
    store
        .upsert_software_identity_for_app(app.id)
        .expect("identity without opened time");
    let older_start = Utc.with_ymd_and_hms(2026, 6, 4, 9, 0, 0).unwrap();
    let older_end = Utc.with_ymd_and_hms(2026, 6, 4, 9, 5, 0).unwrap();
    let newer_start = Utc.with_ymd_and_hms(2026, 6, 5, 10, 0, 0).unwrap();
    let newer_end = Utc.with_ymd_and_hms(2026, 6, 5, 10, 5, 0).unwrap();
    let raw_conn = rusqlite::Connection::open(db_file.path()).expect("open raw conn");
    raw_conn
        .execute(
            r#"
            INSERT INTO usage_sessions (app_id, started_at, ended_at, last_heartbeat_at)
            VALUES (?1, ?2, ?3, ?3), (?1, ?4, ?5, ?5)
            "#,
            (
                app.id,
                older_start.to_rfc3339(),
                older_end.to_rfc3339(),
                newer_start.to_rfc3339(),
                newer_end.to_rfc3339(),
            ),
        )
        .expect("insert legacy sessions");
    drop(raw_conn);

    let rows = store
        .software_page_rows(
            Utc.with_ymd_and_hms(2026, 6, 5, 0, 0, 0).unwrap(),
            newer_end,
            newer_start.date_naive(),
            &Default::default(),
        )
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].last_opened_at, Some(newer_start));
}

#[test]
fn software_page_rows_merge_overlapping_runtime_across_wps_app_ids() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let wps = store
        .upsert_app("wps.exe", r"C:\Kingsoft\WPS Office\office6\wps.exe", "wps")
        .expect("wps");
    let sheet = store
        .upsert_app("et.exe", r"C:\Kingsoft\WPS Office\office6\et.exe", "et")
        .expect("sheet");
    let day_start = Utc.with_ymd_and_hms(2026, 6, 5, 0, 0, 0).unwrap();
    let wps_start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let wps_end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 10, 0).unwrap();
    let sheet_start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 5, 0).unwrap();
    let sheet_end = Utc.with_ymd_and_hms(2026, 6, 5, 9, 15, 0).unwrap();
    let query_at = Utc.with_ymd_and_hms(2026, 6, 5, 9, 20, 0).unwrap();

    let wps_session = store.start_session(wps.id, wps_start).expect("wps start");
    store
        .close_session(wps_session, wps_end, "process_closed", false)
        .expect("wps close");
    let sheet_session = store
        .start_session(sheet.id, sheet_start)
        .expect("sheet start");
    store
        .close_session(sheet_session, sheet_end, "process_closed", false)
        .expect("sheet close");

    let rows = store
        .software_page_rows(
            day_start,
            query_at,
            day_start.date_naive(),
            &Default::default(),
        )
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].display_name, "WPS Office");
    assert_eq!(rows.discovered[0].app_ids, vec![wps.id, sheet.id]);
    assert_eq!(rows.discovered[0].total_runtime_seconds, 15 * 60);
    assert_eq!(rows.discovered[0].today_runtime_seconds, 15 * 60);
    assert_eq!(rows.discovered[0].total_foreground_seconds, 15 * 60);
    assert_eq!(rows.discovered[0].today_foreground_seconds, 15 * 60);
    assert_eq!(rows.discovered[0].total_background_seconds, 0);
    assert_eq!(rows.discovered[0].today_background_seconds, 0);
}
