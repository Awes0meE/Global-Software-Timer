use chrono::{Duration, TimeZone, Utc};
use global_software_timer_lib::domain::RunEventKind;
use global_software_timer_lib::storage::Store;
use rusqlite::Connection;
use tempfile::NamedTempFile;

#[test]
fn migration_versions_existing_data_and_is_repeatable() {
    let file = NamedTempFile::new().unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    let app = store
        .upsert_app("code.exe", r"C:\Code.exe", "Code")
        .unwrap();
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let id = store.start_session(app.id, start).unwrap();
    store
        .close_session(id, start + Duration::seconds(42), "closed", false)
        .unwrap();
    store.set_setting_value("preserve", "yes").unwrap();
    store
        .insert_run_event(Some(app.id), RunEventKind::AppHeartbeat, Some("historic"))
        .unwrap();
    store
        .increment_daily_system_usage(start.date_naive(), 42, 12, 42)
        .unwrap();
    store
        .increment_daily_app_usage(start.date_naive(), app.id, 42, 12)
        .unwrap();
    let conn = Connection::open(file.path()).unwrap();
    // Shipped databases had this schema without a version marker.
    conn.pragma_update(None, "user_version", 0).unwrap();
    conn.execute("DELETE FROM software_identity_members", [])
        .unwrap();
    conn.execute("DELETE FROM software_identities", []).unwrap();
    store.migrate().unwrap();
    store.migrate().unwrap();
    assert_eq!(
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(store.all_sessions().unwrap()[0].duration_seconds, 42);
    assert_eq!(
        store
            .count_run_events(RunEventKind::AppHeartbeat.as_str())
            .unwrap(),
        1
    );
    assert_eq!(
        store
            .daily_system_usage(start.date_naive())
            .unwrap()
            .unwrap()
            .recorded_seconds,
        42
    );
    assert_eq!(
        store
            .app_usage_summary(start, start + Duration::minutes(1))
            .unwrap()[0]
            .active_today_seconds,
        12
    );
    assert_eq!(
        store.setting_value("preserve").unwrap().as_deref(),
        Some("yes")
    );
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM software_identity_members", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap(),
        1
    );
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN ('usage_sessions_app_id_idx', 'usage_sessions_open_idx', 'software_identity_members_app_id_idx')", [], |r| r.get::<_, i64>(0)).unwrap(), 3);
}

#[test]
fn migration_rejects_future_versions_without_changing_schema() {
    let file = NamedTempFile::new().unwrap();
    let conn = Connection::open(file.path()).unwrap();
    conn.execute_batch("CREATE TABLE future_data (value TEXT); INSERT INTO future_data VALUES ('keep'); PRAGMA user_version = 999;").unwrap();
    let store = Store::open(file.path()).unwrap();
    assert!(store.migrate().is_err());
    assert_eq!(store.table_names().unwrap(), vec!["future_data"]);
    assert_eq!(
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        999
    );
}

#[test]
fn failed_migration_rolls_back_all_schema_changes() {
    let file = NamedTempFile::new().unwrap();
    let conn = Connection::open(file.path()).unwrap();
    // The legacy column upgrade cannot backfill without usage_date.
    conn.execute_batch("CREATE TABLE daily_software_runtime_usage (identity_key TEXT); INSERT INTO daily_software_runtime_usage VALUES ('keep');").unwrap();
    let store = Store::open(file.path()).unwrap();
    assert!(store.migrate().is_err());
    assert_eq!(
        store.table_names().unwrap(),
        vec!["daily_software_runtime_usage"]
    );
    assert_eq!(
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('daily_software_runtime_usage')",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row(
            "SELECT identity_key FROM daily_software_runtime_usage",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        "keep"
    );
}

#[test]
fn legacy_runtime_columns_are_added_without_losing_aggregates() {
    let file = NamedTempFile::new().unwrap();
    let conn = Connection::open(file.path()).unwrap();
    conn.execute_batch("CREATE TABLE daily_software_runtime_usage (usage_date TEXT NOT NULL, identity_key TEXT NOT NULL, foreground_seconds INTEGER NOT NULL, background_seconds INTEGER NOT NULL, PRIMARY KEY (usage_date, identity_key)); INSERT INTO daily_software_runtime_usage VALUES ('2026-06-05', 'legacy', 23, 7);").unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    store.migrate().unwrap();
    let values: (i64, i64, String, String) = conn.query_row("SELECT foreground_seconds, background_seconds, first_recorded_at, last_recorded_at FROM daily_software_runtime_usage", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap();
    assert_eq!(
        values,
        (
            23,
            7,
            "2026-06-05T23:59:59+00:00".into(),
            "2026-06-05T23:59:59+00:00".into()
        )
    );
}

#[test]
fn summaries_work_on_read_only_connections_and_preserve_lifetime_totals() {
    let file = NamedTempFile::new().unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    let app = store
        .upsert_app("code.exe", r"C:\Code.exe", "Code")
        .unwrap();
    let today = Utc.with_ymd_and_hms(2026, 6, 5, 0, 0, 0).unwrap();
    let start = today - Duration::days(1);
    let id = store.start_session(app.id, start).unwrap();
    store
        .close_session(id, start + Duration::seconds(42), "closed", false)
        .unwrap();
    let reader = Store::open_read_only(file.path()).unwrap();
    let overview = reader
        .app_usage_summary(today, today + Duration::hours(1))
        .unwrap();
    let software = reader
        .software_page_rows(
            today,
            today + Duration::hours(1),
            today.date_naive(),
            &Default::default(),
        )
        .unwrap();
    assert_eq!(overview[0].total_seconds, 42);
    assert_eq!(overview[0].today_seconds, 0);
    assert_eq!(software.discovered[0].total_runtime_seconds, 42);
    assert_eq!(software.discovered[0].today_runtime_seconds, 0);
    assert!(reader.set_setting_value("must", "fail").is_err());
}

#[test]
fn nested_savepoints_rollback_all_writes_when_outer_operation_fails() {
    let file = NamedTempFile::new().unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    let app = store
        .upsert_app("code.exe", r"C:\Code.exe", "Code")
        .unwrap();
    {
        let _outer = store.savepoint().unwrap();
        store
            .start_session_with_event(app.id, Utc::now(), None)
            .unwrap();
        store.set_setting_value("rollback", "yes").unwrap();
    }
    assert!(store.all_sessions().unwrap().is_empty());
    assert_eq!(
        store
            .count_run_events(RunEventKind::AppSeenStarted.as_str())
            .unwrap(),
        0
    );
    assert_eq!(store.setting_value("rollback").unwrap(), None);
    let outer = store.savepoint().unwrap();
    let session = store
        .start_session_with_event(app.id, Utc::now(), None)
        .unwrap();
    store
        .close_session_with_event(session, app.id, Utc::now(), "closed", false)
        .unwrap();
    outer.commit().unwrap();
    assert_eq!(store.all_sessions().unwrap().len(), 1);
    assert_eq!(
        store
            .count_run_events(RunEventKind::AppSeenStarted.as_str())
            .unwrap(),
        1
    );
}

#[test]
fn failed_savepoint_commit_rolls_back_and_releases_the_transaction() {
    let file = NamedTempFile::new().unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    let conn = Connection::open(file.path()).unwrap();
    conn.execute_batch(
        "CREATE TABLE deferred_guard (app_id INTEGER REFERENCES apps(id) DEFERRABLE INITIALLY DEFERRED);
         CREATE TRIGGER fail_commit AFTER INSERT ON app_settings BEGIN INSERT INTO deferred_guard VALUES (-1); END;",
    ).unwrap();
    let transaction = store.savepoint().unwrap();
    store.set_setting_value("rollback", "yes").unwrap();
    assert!(transaction.commit().is_err());
    assert_eq!(store.setting_value("rollback").unwrap(), None);
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM deferred_guard", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    conn.execute_batch("DROP TRIGGER fail_commit").unwrap();
    store.set_setting_value("next", "committed").unwrap();
    assert_eq!(
        conn.query_row(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'next'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        "committed"
    );
}

#[test]
fn nested_failure_preserves_outer_work_until_it_commits() {
    let file = NamedTempFile::new().unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    let outer = store.savepoint().unwrap();
    store.set_setting_value("keep", "yes").unwrap();
    assert!(store
        .start_session_with_event(-1, Utc::now(), None)
        .is_err());
    assert_eq!(store.setting_value("keep").unwrap().as_deref(), Some("yes"));
    outer.commit().unwrap();
    assert!(store.all_sessions().unwrap().is_empty());
    assert_eq!(store.setting_value("keep").unwrap().as_deref(), Some("yes"));
}
