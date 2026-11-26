//! Full copies of the database made before risky steps, and one-time cleanups
//! of the database file run at startup before the app opens its own
//! connections.

use chrono::NaiveDateTime;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::path::{Path, PathBuf};

/// Copies made before a cleanup are `backups\GST-清理前-YYYY-MM-DD-HHMMSS[-N].db`.
pub const PRE_CLEANUP_PREFIX: &str = "GST-清理前-";
/// Copies made before an update are
/// `backups\GST-更新前-<version>-YYYY-MM-DD-HHMMSS[-N].db`.
pub const PRE_UPDATE_PREFIX: &str = "GST-更新前-";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PruneReport {
    pub removed: usize,
    pub backup: PathBuf,
}

/// Saves a full copy of the database before the update to `version` is
/// downloaded. Only the newest pre-update copy is kept; the live file is only
/// read.
pub fn backup_before_update(
    db_path: &Path,
    backups_dir: &Path,
    version: &str,
    now: NaiveDateTime,
) -> Result<PathBuf, String> {
    let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    // The version comes from the release manifest: keep file-name-safe characters only.
    let version = version
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
        .collect::<String>();
    let stem = format!("{PRE_UPDATE_PREFIX}{version}-{}", timestamp(now));
    save_newest_copy(&conn, backups_dir, PRE_UPDATE_PREFIX, &stem)
}

/// Removes the `app_heartbeat` rows of the legacy `run_events` log. Versions
/// up to v0.1.x wrote one per running app on every scan; nothing reads them
/// (the session row keeps its own heartbeat), and on a long-used database they
/// are nearly all of the file. A full copy goes to `backups_dir` first; when
/// that copy cannot be made nothing is removed. Returns `None` when there is
/// nothing to remove (no database, no event log, or no heartbeat rows).
pub fn prune_legacy_heartbeats(
    db_path: &Path,
    backups_dir: &Path,
    now: NaiveDateTime,
) -> Result<Option<PruneReport>, String> {
    if !db_path.exists() {
        return Ok(None);
    }
    let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|error| error.to_string())?;
    if !has_legacy_heartbeats(&conn).map_err(|error| error.to_string())? {
        return Ok(None);
    }

    let stem = format!("{PRE_CLEANUP_PREFIX}{}", timestamp(now));
    let backup = save_newest_copy(&conn, backups_dir, PRE_CLEANUP_PREFIX, &stem)
        .map_err(|error| format!("could not back up before the cleanup: {error}"))?;

    let removed = conn
        .execute(
            "DELETE FROM run_events WHERE event_kind = 'app_heartbeat'",
            [],
        )
        .map_err(|error| error.to_string())?;
    // Compacting only gives the space back; the rows are already gone if it fails.
    if let Err(error) = conn.execute_batch("VACUUM") {
        eprintln!("could not compact the database after the cleanup: {error}");
    }
    Ok(Some(PruneReport { removed, backup }))
}

fn has_legacy_heartbeats(conn: &Connection) -> rusqlite::Result<bool> {
    let has_log = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'run_events'",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !has_log {
        return Ok(false);
    }
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM run_events WHERE event_kind = 'app_heartbeat')",
        [],
        |row| row.get(0),
    )
}

fn timestamp(now: NaiveDateTime) -> String {
    now.format("%Y-%m-%d-%H%M%S").to_string()
}

/// Writes a full copy of the database `conn` is open on to
/// `backups_dir\<stem>[-N].db` (`VACUUM INTO`), then deletes the other copies
/// whose names start with `family`: only the newest copy of a family is kept,
/// as each one holds the whole usage history. Nothing is deleted when the copy
/// fails.
fn save_newest_copy(
    conn: &Connection,
    backups_dir: &Path,
    family: &str,
    stem: &str,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(backups_dir)
        .map_err(|error| format!("could not create {}: {error}", backups_dir.display()))?;
    let backup = unused_copy_path(backups_dir, stem);
    conn.execute("VACUUM INTO ?1", [backup.to_string_lossy()])
        .map_err(|error| error.to_string())?;
    remove_other_copies(backups_dir, family, &backup);
    Ok(backup)
}

fn unused_copy_path(dir: &Path, stem: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.db"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}.db")))
        .find(|path| !path.exists())
        .expect("an unused name")
}

/// Deletes the `.db` copies of `family` in `dir` other than `keep`.
fn remove_other_copies(dir: &Path, family: &str, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let others = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(family) && name.ends_with(".db"))
        })
        .filter(|path| path != keep);
    for path in others {
        if let Err(error) = std::fs::remove_file(&path) {
            eprintln!("could not remove {}: {error}", path.display());
        }
    }
}
