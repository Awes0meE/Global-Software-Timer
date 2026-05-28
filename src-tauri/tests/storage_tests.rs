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
