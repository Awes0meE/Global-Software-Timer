use chrono::{Duration, TimeZone, Utc};
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
    store
        .start_session(word.id, open_start)
        .expect("start open");

    let day_start = Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap();
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 0, 2, 0).unwrap();
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
fn app_usage_summary_merges_same_process_across_paths() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let first = store
        .upsert_app("codex.exe", r"C:\Program Files\Codex\codex.exe", "Codex")
        .expect("first app");
    let second = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\Codex\resources\codex.exe",
            "Codex",
        )
        .expect("second app");
    let day_start = Utc.with_ymd_and_hms(2026, 5, 28, 0, 0, 0).unwrap();

    store
        .start_session(first.id, day_start + Duration::minutes(10))
        .expect("start first");
    let second_session = store
        .start_session(second.id, day_start + Duration::minutes(30))
        .expect("start second");
    store
        .close_session(
            second_session,
            day_start + Duration::minutes(50),
            "process_closed",
            false,
        )
        .expect("close second");

    let summary = store
        .app_usage_summary(day_start, day_start + Duration::hours(1))
        .expect("summary");

    assert_eq!(summary.len(), 1);
    assert_eq!(summary[0].display_name, "Codex");
    assert_eq!(summary[0].process_name, "codex.exe");
    assert_eq!(summary[0].today_seconds, 50 * 60);
    assert!(summary[0].is_running);
}

#[test]
fn hide_unhide_and_rename_update_current_display_name_process_group() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");

    let first = store
        .upsert_app("codex.exe", r"C:\Program Files\Codex\codex.exe", "Codex")
        .expect("first app");
    let second = store
        .upsert_app(
            "codex.exe",
            r"C:\Program Files\Codex\resources\codex.exe",
            "Codex",
        )
        .expect("second app");
    let other = store
        .upsert_app("codex.exe", r"D:\Portable\codex.exe", "Codex Portable")
        .expect("other app");

    assert_eq!(store.set_app_group_hidden(first.id, true).expect("hide"), 2);
    assert!(
        store
            .find_app_by_key(&first.normalized_key)
            .unwrap()
            .unwrap()
            .is_hidden
    );
    assert!(
        store
            .find_app_by_key(&second.normalized_key)
            .unwrap()
            .unwrap()
            .is_hidden
    );
    assert!(
        !store
            .find_app_by_key(&other.normalized_key)
            .unwrap()
            .unwrap()
            .is_hidden
    );

    assert_eq!(
        store
            .rename_app_group(second.id, "  Codex Studio  ")
            .expect("rename"),
        2
    );
    assert_eq!(
        store
            .find_app_by_key(&first.normalized_key)
            .unwrap()
            .unwrap()
            .display_name,
        "Codex Studio"
    );
    assert!(
        store
            .find_app_by_key(&second.normalized_key)
            .unwrap()
            .unwrap()
            .is_user_renamed
    );

    assert_eq!(
        store.set_app_group_hidden(first.id, false).expect("unhide"),
        2
    );
    assert!(
        !store
            .find_app_by_key(&first.normalized_key)
            .unwrap()
            .unwrap()
            .is_hidden
    );
    assert!(
        !store
            .find_app_by_key(&second.normalized_key)
            .unwrap()
            .unwrap()
            .is_hidden
    );
}

#[test]
fn rename_app_group_rejects_blank_display_name() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open store");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app("code.exe", r"C:\Code\Code.exe", "Visual Studio Code")
        .expect("app");

    let error = store
        .rename_app_group(app.id, "   ")
        .expect_err("blank name");

    assert_eq!(error.to_string(), "display name cannot be empty");
    assert_eq!(
        store
            .find_app_by_key(&app.normalized_key)
            .unwrap()
            .unwrap()
            .display_name,
        "Visual Studio Code"
    );
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
