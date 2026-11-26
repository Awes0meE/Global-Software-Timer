use chrono::NaiveDate;
use global_software_timer_lib::maintenance::{
    backup_before_update, prune_legacy_heartbeats, PRE_CLEANUP_PREFIX, PRE_UPDATE_PREFIX,
};
use rusqlite::Connection;
use std::path::Path;

fn now() -> chrono::NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 11, 26)
        .unwrap()
        .and_hms_opt(13, 30, 5)
        .unwrap()
}

/// A database with the legacy event log: `heartbeats` app_heartbeat rows and
/// two other events that must stay.
fn legacy_db(path: &Path, heartbeats: usize) {
    let mut conn = Connection::open(path).unwrap();
    conn.execute_batch(
        "CREATE TABLE run_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER,
            event_kind TEXT NOT NULL,
            payload_json TEXT,
            occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO run_events (app_id, event_kind) VALUES (1, 'app_seen_started');
        INSERT INTO run_events (app_id, event_kind) VALUES (1, 'app_seen_stopped');",
    )
    .unwrap();
    let tx = conn.transaction().unwrap();
    {
        let mut insert = tx
            .prepare(
                "INSERT INTO run_events (app_id, event_kind, payload_json) VALUES (1, 'app_heartbeat', '{\"pid\":1234}')",
            )
            .unwrap();
        for _ in 0..heartbeats {
            insert.execute([]).unwrap();
        }
    }
    tx.commit().unwrap();
}

fn kinds(path: &Path) -> Vec<(String, i64)> {
    let conn = Connection::open(path).unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT event_kind, COUNT(*) FROM run_events GROUP BY event_kind ORDER BY event_kind",
        )
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn copies(backups: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(backups) else {
        return Vec::new();
    };
    let mut names = entries
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    names.sort();
    names
}

#[test]
fn removes_heartbeats_after_backing_up_and_shrinks_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    legacy_db(&db, 20_000);
    let before = std::fs::metadata(&db).unwrap().len();

    let report = prune_legacy_heartbeats(&db, &backups, now())
        .unwrap()
        .expect("pruned");

    assert_eq!(report.removed, 20_000);
    assert_eq!(
        kinds(&db),
        vec![
            ("app_seen_started".to_string(), 1),
            ("app_seen_stopped".to_string(), 1)
        ]
    );
    assert!(
        std::fs::metadata(&db).unwrap().len() < before / 2,
        "the file is compacted"
    );

    let names = copies(&backups);
    assert_eq!(
        names,
        vec![format!("{PRE_CLEANUP_PREFIX}2026-11-26-133005.db")]
    );
    assert_eq!(report.backup, backups.join(&names[0]));
    // The copy keeps everything, heartbeats included.
    assert_eq!(kinds(&backups.join(&names[0])).len(), 3);
}

#[test]
fn does_nothing_without_heartbeats() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    legacy_db(&db, 0);

    assert!(prune_legacy_heartbeats(&db, &backups, now())
        .unwrap()
        .is_none());
    assert!(
        copies(&backups).is_empty(),
        "no backup when there is nothing to remove"
    );
}

#[test]
fn does_nothing_for_a_missing_database_or_one_without_the_event_log() {
    let dir = tempfile::tempdir().unwrap();
    let backups = dir.path().join("backups");
    let missing = dir.path().join("missing.sqlite3");
    assert!(prune_legacy_heartbeats(&missing, &backups, now())
        .unwrap()
        .is_none());
    assert!(!missing.exists(), "a missing database is not created");

    let empty = dir.path().join("empty.sqlite3");
    Connection::open(&empty)
        .unwrap()
        .execute_batch("CREATE TABLE apps (id INTEGER)")
        .unwrap();
    assert!(prune_legacy_heartbeats(&empty, &backups, now())
        .unwrap()
        .is_none());
    assert!(copies(&backups).is_empty());
}

#[test]
fn keeps_the_heartbeats_when_the_backup_cannot_be_written() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    std::fs::write(&backups, b"a file where the folder should be").unwrap();
    legacy_db(&db, 10);

    assert!(prune_legacy_heartbeats(&db, &backups, now()).is_err());
    assert_eq!(
        kinds(&db)
            .iter()
            .find(|(kind, _)| kind == "app_heartbeat")
            .map(|(_, n)| *n),
        Some(10)
    );
}

#[test]
fn keeps_only_the_newest_pre_cleanup_copy() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    std::fs::create_dir_all(&backups).unwrap();
    let older = backups.join(format!("{PRE_CLEANUP_PREFIX}2026-11-01-080000.db"));
    std::fs::write(&older, b"old copy").unwrap();
    let unrelated = backups.join("GST-恢复前-2026-11-01-080000.db");
    std::fs::write(&unrelated, b"pre-restore copy").unwrap();
    legacy_db(&db, 10);

    prune_legacy_heartbeats(&db, &backups, now())
        .unwrap()
        .expect("pruned");

    assert!(!older.exists(), "the older pre-cleanup copy is removed");
    assert!(unrelated.exists(), "other backups are left alone");
    assert_eq!(copies(&backups).len(), 2);
}

#[test]
fn backs_up_before_an_update_and_keeps_only_the_newest_pre_update_copy() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    std::fs::create_dir_all(&backups).unwrap();
    let older = backups.join(format!("{PRE_UPDATE_PREFIX}0.4.6-2026-11-01-080000.db"));
    std::fs::write(&older, b"old copy").unwrap();
    let cleanup = backups.join(format!("{PRE_CLEANUP_PREFIX}2026-11-01-080000.db"));
    std::fs::write(&cleanup, b"pre-cleanup copy").unwrap();
    let restore = backups.join("GST-恢复前-2026-11-01-080000.db");
    std::fs::write(&restore, b"pre-restore copy").unwrap();
    legacy_db(&db, 3);

    let backup = backup_before_update(&db, &backups, "0.4.7", now()).unwrap();

    assert_eq!(
        backup,
        backups.join(format!("{PRE_UPDATE_PREFIX}0.4.7-2026-11-26-133005.db"))
    );
    assert_eq!(kinds(&backup), kinds(&db), "a full copy");
    assert!(!older.exists(), "the older pre-update copy is removed");
    assert!(cleanup.exists() && restore.exists(), "other backups stay");
    assert_eq!(copies(&backups).len(), 3);
}

#[test]
fn a_second_update_backup_in_the_same_second_gets_its_own_name() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    legacy_db(&db, 1);

    let first = backup_before_update(&db, &backups, "0.4.7", now()).unwrap();
    let second = backup_before_update(&db, &backups, "0.4.7", now()).unwrap();

    // The first copy still exists while the second is written.
    assert_eq!(
        second,
        backups.join(format!("{PRE_UPDATE_PREFIX}0.4.7-2026-11-26-133005-2.db"))
    );
    assert!(!first.exists());
    assert_eq!(copies(&backups).len(), 1);
}

#[test]
fn update_backup_names_keep_only_file_name_safe_version_characters() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    let backups = dir.path().join("backups");
    legacy_db(&db, 1);

    let backup = backup_before_update(&db, &backups, r"..\0.5.0-rc.1+b7", now()).unwrap();

    assert_eq!(backup.parent(), Some(backups.as_path()));
    assert_eq!(
        backup.file_name().unwrap().to_string_lossy(),
        format!("{PRE_UPDATE_PREFIX}..0.5.0-rc.1+b7-2026-11-26-133005.db")
    );
}

#[test]
fn an_update_backup_fails_without_touching_older_copies_when_it_cannot_be_written() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("global-software-timer.sqlite3");
    legacy_db(&db, 1);
    let backups = dir.path().join("backups");
    std::fs::write(&backups, b"a file where the folder should be").unwrap();
    assert!(backup_before_update(&db, &backups, "0.4.7", now()).is_err());

    let missing = dir.path().join("missing.sqlite3");
    let real_backups = dir.path().join("real-backups");
    std::fs::create_dir_all(&real_backups).unwrap();
    let older = real_backups.join(format!("{PRE_UPDATE_PREFIX}0.4.6-2026-11-01-080000.db"));
    std::fs::write(&older, b"old copy").unwrap();
    assert!(backup_before_update(&missing, &real_backups, "0.4.7", now()).is_err());
    assert!(!missing.exists(), "a missing database is not created");
    assert!(older.exists(), "nothing is pruned when the copy fails");
}
