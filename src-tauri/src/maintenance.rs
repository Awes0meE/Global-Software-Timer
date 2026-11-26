//! One-time cleanups of the database file, run at startup before the app
//! opens its own connections.

use chrono::NaiveDateTime;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::path::{Path, PathBuf};

/// Copies made before a cleanup are `backups\GST-清理前-YYYY-MM-DD-HHMMSS[-N].db`.
pub const PRE_CLEANUP_PREFIX: &str = "GST-清理前-";
/// Only the newest pre-cleanup copy is kept: it is a full copy of the data.
const PRE_CLEANUP_KEEP: usize = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PruneReport {
    pub removed: usize,
    pub backup: PathBuf,
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

    std::fs::create_dir_all(backups_dir)
        .map_err(|error| format!("could not create {}: {error}", backups_dir.display()))?;
    let backup = unused_copy_path(backups_dir, &copy_stem(now));
    conn.execute("VACUUM INTO ?1", [backup.to_string_lossy()])
        .map_err(|error| format!("could not back up before the cleanup: {error}"))?;
    prune_older_copies(backups_dir, &backup);

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

fn copy_stem(now: NaiveDateTime) -> String {
    format!("{PRE_CLEANUP_PREFIX}{}", now.format("%Y-%m-%d-%H%M%S"))
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

/// Keeps the newest `PRE_CLEANUP_KEEP` pre-cleanup copies, `keep` among them.
/// The names sort by time.
fn prune_older_copies(dir: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut copies = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(PRE_CLEANUP_PREFIX) && name.ends_with(".db"))
        })
        .filter(|path| path != keep)
        .collect::<Vec<_>>();
    copies.sort();
    let extra = (copies.len() + 1).saturating_sub(PRE_CLEANUP_KEEP);
    for path in copies.into_iter().take(extra) {
        if let Err(error) = std::fs::remove_file(&path) {
            eprintln!("could not remove {}: {error}", path.display());
        }
    }
}
