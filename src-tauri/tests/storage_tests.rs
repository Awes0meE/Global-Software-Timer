use chrono::{TimeZone, Utc};
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
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\codex.exe",
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
fn app_usage_summary_prefers_primary_install_path_for_merged_apps() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let helper_codex = store
        .upsert_app(
            "codex.exe",
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\958d608b5e0546a5\codex.exe",
            "Codex",
        )
        .expect("helper codex");
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
    for app_id in [helper_codex.id, packaged_codex.id] {
        let session_id = store.start_session(app_id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
    }

    let rows = store
        .app_usage_summary(day_start, ended_at)
        .expect("usage summary");

    assert_eq!(rows.len(), 1);
    assert_eq!(
        rows[0].executable_path,
        r"C:\Program Files\WindowsApps\OpenAI.Codex_1.0.0.0_x64__abc\app\Codex.exe"
    );
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
            r"C:\Users\dev\AppData\Local\OpenAI\Codex\bin\codex.exe",
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
