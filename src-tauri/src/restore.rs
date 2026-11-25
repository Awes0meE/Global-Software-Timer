//! 打开数据文件夹 and 从备份恢复.
//!
//! A restore never touches the live database while it is open. Picking a
//! backup validates and migrates a private copy in the data folder. Applying it
//! renames that copy to `<db>.restore-pending` and relaunches the app. The next
//! start swaps the files in `run_startup_swap`, before any connection opens.
//! Every step can be resumed after a crash. All restore files stay in the data
//! folder, so every rename stays on one volume.

use crate::app_state::{lock_recovering, AppState};
use crate::export::{blocking, explorer_path, pick_open_path};
use crate::storage::{Store, StoreError, SCHEMA_VERSION};
use chrono::NaiveDateTime;
use rusqlite::config::DbConfig;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const DB_FILE_NAME: &str = "global-software-timer.sqlite3";
/// Pre-restore copies, inside the data folder.
pub const BACKUPS_DIR_NAME: &str = "backups";
/// Appended to the live file name.
pub const PENDING_SUFFIX: &str = ".restore-pending";
pub const BEFORE_RESTORE_SUFFIX: &str = ".before-restore";
pub const FAILED_SUFFIX: &str = ".restore-failed";
/// Staged copies are `.gst-restore-<uuid>.tmp` in the data folder.
pub const STAGING_PREFIX: &str = ".gst-restore-";

const PRE_RESTORE_PREFIX: &str = "GST-恢复前-";
const PRE_RESTORE_KEEP: usize = 3;
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";
const AFTER_RESTORE_ARG: &str = "--after-restore=";
const RENAME_ATTEMPTS: u32 = 10;
const RENAME_RETRY_DELAY: Duration = Duration::from_millis(200);
const DATA_FOLDER_OPEN_FAILED: &str = "data_folder_open_failed";

static RELAUNCH_AFTER_EXIT: AtomicBool = AtomicBool::new(false);

/// Why a backup cannot be restored. The frontend maps each code to its message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreError {
    /// Not a GST backup, corrupt, or containing triggers or views.
    Invalid,
    /// Written by a newer schema than this build supports.
    Newer,
    /// The live database, one of its files, or another file in the data folder.
    LiveDatabase,
    NoSpace,
    /// Anything else; the live data is unchanged.
    Failed,
}

impl RestoreError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Invalid => "restore_invalid",
            Self::Newer => "restore_newer",
            Self::LiveDatabase => "restore_live_database",
            Self::NoSpace => "restore_no_space",
            Self::Failed => "restore_failed",
        }
    }
}

impl From<RestoreError> for String {
    fn from(error: RestoreError) -> Self {
        error.code().to_string()
    }
}

/// The one-shot result of a restore, reported to the UI after the restart.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RestoreStatus {
    #[default]
    None,
    Restored,
    RolledBack,
}

/// The fixed file names in one data folder.
#[derive(Debug, Clone)]
pub struct RestorePaths {
    pub live: PathBuf,
    pub pending: PathBuf,
    pub before: PathBuf,
    pub failed: PathBuf,
    pub backups: PathBuf,
}

impl RestorePaths {
    pub fn new(data_dir: &Path) -> Self {
        let named = |suffix: &str| data_dir.join(format!("{DB_FILE_NAME}{suffix}"));
        Self {
            live: data_dir.join(DB_FILE_NAME),
            pending: named(PENDING_SUFFIX),
            before: named(BEFORE_RESTORE_SUFFIX),
            failed: named(FAILED_SUFFIX),
            backups: data_dir.join(BACKUPS_DIR_NAME),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RestorePreview {
    pub restore_id: String,
    pub file_name: String,
    /// `YYYY-MM-DD`; `None` when the backup has no recorded day.
    pub first_day: Option<String>,
    pub last_day: Option<String>,
    /// Distinct software identities with at least one usage session.
    pub software_count: u32,
    pub file_size_bytes: u64,
}

/// A validated, migrated, single-file schema-3 copy in the data folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StagedBackup {
    pub path: PathBuf,
    pub file_name: String,
    pub first_day: Option<String>,
    pub last_day: Option<String>,
    pub software_count: u32,
    pub file_size_bytes: u64,
}

impl StagedBackup {
    pub fn preview(&self, restore_id: String) -> RestorePreview {
        RestorePreview {
            restore_id,
            file_name: self.file_name.clone(),
            first_day: self.first_day.clone(),
            last_day: self.last_day.clone(),
            software_count: self.software_count,
            file_size_bytes: self.file_size_bytes,
        }
    }
}

/// Session-only restore state: the one staged copy awaiting confirmation and
/// the one-shot status of the restore that ran at this start.
#[derive(Default)]
pub struct RestoreSession {
    staged: Mutex<Option<(String, PathBuf)>>,
    status: Mutex<RestoreStatus>,
}

impl RestoreSession {
    /// Replaces (and deletes) any earlier staged copy; returns the new id.
    pub fn stash(&self, path: PathBuf) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let earlier = lock_recovering(&self.staged).replace((id.clone(), path));
        if let Some((_, earlier)) = earlier {
            remove_with_side_files(&earlier);
        }
        id
    }

    /// Single use: a second call with the same id returns `None`.
    pub fn take(&self, restore_id: &str) -> Option<PathBuf> {
        let mut staged = lock_recovering(&self.staged);
        if staged.as_ref().is_some_and(|(id, _)| id == restore_id) {
            staged.take().map(|(_, path)| path)
        } else {
            None
        }
    }

    /// Deletes the staged copy when it has this id.
    pub fn discard(&self, restore_id: &str) {
        if let Some(path) = self.take(restore_id) {
            remove_with_side_files(&path);
        }
    }

    /// Deletes any staged copy.
    pub fn discard_any(&self) {
        if let Some((_, path)) = lock_recovering(&self.staged).take() {
            remove_with_side_files(&path);
        }
    }

    pub fn set_status(&self, status: RestoreStatus) {
        *lock_recovering(&self.status) = status;
    }

    /// One shot: later calls return `None`.
    pub fn take_status(&self) -> RestoreStatus {
        std::mem::take(&mut *lock_recovering(&self.status))
    }
}

/// The `--after-restore=<pid>` argument of a relaunch after a restore.
pub fn after_restore_pid(args: impl IntoIterator<Item = String>) -> Option<u32> {
    args.into_iter()
        .find_map(|arg| arg.strip_prefix(AFTER_RESTORE_ARG)?.parse().ok())
}

/// Refuses the live database, its side files and the restore files, and
/// anything else in the data folder that is not a `backups\` copy.
pub fn ensure_restorable_source(source: &Path, data_dir: &Path) -> Result<(), RestoreError> {
    let source = std::fs::canonicalize(source).map_err(|_| RestoreError::Failed)?;
    let data_dir = std::fs::canonicalize(data_dir).map_err(|_| RestoreError::Failed)?;
    let lower = |path: &Path| path.to_string_lossy().to_lowercase();
    let in_backups = source
        .parent()
        .is_some_and(|parent| lower(parent) == lower(&data_dir.join(BACKUPS_DIR_NAME)));
    let in_data_dir = lower(&source).starts_with(&format!(
        "{}{}",
        lower(&data_dir),
        std::path::MAIN_SEPARATOR
    ));
    if in_data_dir && !in_backups {
        return Err(RestoreError::LiveDatabase);
    }
    Ok(())
}

/// Validates `source` and stages a migrated copy in `data_dir`. The live
/// database is never opened. `free_space` is the free bytes on the data
/// folder's volume, when known. On error no staged file is left behind.
pub fn stage_backup(
    source: &Path,
    data_dir: &Path,
    free_space: Option<u64>,
) -> Result<StagedBackup, RestoreError> {
    ensure_restorable_source(source, data_dir)?;
    let file_size_bytes = std::fs::metadata(source)
        .map_err(|_| RestoreError::Failed)?
        .len();
    let mut header = [0u8; 16];
    let read = std::fs::File::open(source)
        .and_then(|mut file| read_up_to(&mut file, &mut header))
        .map_err(|_| RestoreError::Failed)?;
    if read < header.len() || &header != SQLITE_HEADER {
        return Err(RestoreError::Invalid);
    }
    if free_space.is_some_and(|free| free < file_size_bytes) {
        return Err(RestoreError::NoSpace);
    }
    let staged = data_dir.join(format!("{STAGING_PREFIX}{}.tmp", uuid::Uuid::new_v4()));
    let result = std::fs::copy(source, &staged)
        .map_err(|error| io_error(&error))
        .and_then(|_| validate_and_migrate(&staged));
    match result {
        Ok(facts) => Ok(StagedBackup {
            path: staged,
            file_name: source
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            first_day: facts.first_day,
            last_day: facts.last_day,
            software_count: facts.software_count,
            file_size_bytes,
        }),
        Err(error) => {
            remove_with_side_files(&staged);
            Err(error)
        }
    }
}

fn read_up_to(file: &mut std::fs::File, buffer: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buffer.len() {
        match file.read(&mut buffer[filled..])? {
            0 => break,
            count => filled += count,
        }
    }
    Ok(filled)
}

struct BackupFacts {
    first_day: Option<String>,
    last_day: Option<String>,
    software_count: u32,
}

/// Validates the copy on a private connection, migrates it to schema 3 and
/// leaves it as one file (`journal_mode=DELETE`).
fn validate_and_migrate(path: &Path) -> Result<BackupFacts, RestoreError> {
    let invalid = |_| RestoreError::Invalid;
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|error| sqlite_error(&error))?;
    conn.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
        .map_err(invalid)?;
    conn.pragma_update(None, "trusted_schema", "OFF")
        .map_err(invalid)?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(invalid)?;
    if version > SCHEMA_VERSION {
        return Err(RestoreError::Newer);
    }
    if version < 0 {
        return Err(RestoreError::Invalid);
    }
    // GST defines no triggers or views; a crafted one could run during migrate.
    let code_objects: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('trigger', 'view')",
            [],
            |row| row.get(0),
        )
        .map_err(invalid)?;
    if code_objects > 0 {
        return Err(RestoreError::Invalid);
    }
    let check: Vec<String> = conn
        .prepare("PRAGMA quick_check")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()
        })
        .map_err(invalid)?;
    if check != ["ok"] {
        return Err(RestoreError::Invalid);
    }
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()
        })
        .map_err(invalid)?;
    let mut required = vec!["apps", "usage_sessions", "run_events"];
    if version >= 1 {
        required.extend(["app_settings", "software_identities"]);
    }
    if !required
        .iter()
        .all(|name| tables.iter().any(|table| table == name))
    {
        return Err(RestoreError::Invalid);
    }

    let store = Store::from_connection(conn).map_err(|error| store_error(&error))?;
    store.migrate().map_err(|error| store_error(&error))?;
    let conn = store.into_connection();
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode=DELETE", [], |row| row.get(0))
        .map_err(|error| sqlite_error(&error))?;
    if !journal_mode.eq_ignore_ascii_case("delete") {
        return Err(RestoreError::Failed);
    }
    let (first_day, last_day) = conn
        .query_row(
            "SELECT MIN(usage_date), MAX(usage_date) FROM daily_system_usage",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(invalid)?;
    let software_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT members.identity_key)
             FROM usage_sessions AS sessions
             JOIN software_identity_members AS members ON members.app_id = sessions.app_id",
            [],
            |row| row.get(0),
        )
        .map_err(invalid)?;
    conn.close().map_err(|(_, error)| sqlite_error(&error))?;
    Ok(BackupFacts {
        first_day,
        last_day,
        software_count: u32::try_from(software_count).unwrap_or(u32::MAX),
    })
}

fn io_error(error: &io::Error) -> RestoreError {
    const ERROR_HANDLE_DISK_FULL: i32 = 39;
    const ERROR_DISK_FULL: i32 = 112;
    match error.raw_os_error() {
        Some(ERROR_HANDLE_DISK_FULL | ERROR_DISK_FULL) => RestoreError::NoSpace,
        _ if error.kind() == io::ErrorKind::StorageFull => RestoreError::NoSpace,
        _ => RestoreError::Failed,
    }
}

fn sqlite_error(error: &rusqlite::Error) -> RestoreError {
    match error.sqlite_error_code() {
        Some(rusqlite::ErrorCode::DiskFull) => RestoreError::NoSpace,
        Some(rusqlite::ErrorCode::NotADatabase | rusqlite::ErrorCode::DatabaseCorrupt) => {
            RestoreError::Invalid
        }
        _ => RestoreError::Failed,
    }
}

/// A failed migration means the file is not a usable GST database.
fn store_error(error: &StoreError) -> RestoreError {
    match error {
        StoreError::UnsupportedSchemaVersion { .. } => RestoreError::Newer,
        StoreError::Sqlite(error) if sqlite_error(error) == RestoreError::NoSpace => {
            RestoreError::NoSpace
        }
        _ => RestoreError::Invalid,
    }
}

/// Renames the staged copy to `<db>.restore-pending`; the copy is deleted on failure.
pub fn promote_staged(staged: &Path, data_dir: &Path) -> Result<(), RestoreError> {
    let pending = RestorePaths::new(data_dir).pending;
    rename_with_retry(staged, &pending).map_err(|_| {
        remove_with_side_files(staged);
        RestoreError::Failed
    })
}

/// Swaps in a pending restore, then opens the live database with `open`
/// (`AppState::new` in the app). Call before any connection to the live file
/// opens. Safe to resume after a crash at any point.
pub fn run_startup_swap<T, E>(
    data_dir: &Path,
    now: NaiveDateTime,
    mut open: impl FnMut(&Path) -> Result<T, E>,
) -> (Result<T, E>, RestoreStatus) {
    let paths = RestorePaths::new(data_dir);
    remove_staging_leftovers(data_dir);

    if paths.pending.exists() && paths.live.exists() {
        if paths.before.exists() {
            // An earlier pre-restore copy that never reached backups\.
            let _ = archive_before_restore(&paths, now);
        }
        let set_aside = !paths.before.exists()
            && checkpoint_into_single_file(&paths.live).is_ok()
            && rename_with_retry(&paths.live, &paths.before).is_ok();
        if !set_aside {
            let _ = rename_with_retry(&paths.pending, &paths.failed);
            return (open(&paths.live), RestoreStatus::RolledBack);
        }
    }

    if paths.pending.exists() && !paths.live.exists() {
        // A WAL or journal left with the live name would be replayed into the new file.
        remove_side_files(&paths.live);
        if rename_with_retry(&paths.pending, &paths.live).is_err() {
            let _ = rename_with_retry(&paths.pending, &paths.failed);
            if paths.before.exists() {
                let _ = rename_with_retry(&paths.before, &paths.live);
            }
            return (open(&paths.live), RestoreStatus::RolledBack);
        }
    }

    if !paths.before.exists() {
        return (open(&paths.live), RestoreStatus::None);
    }
    if !paths.live.exists() {
        // A rollback was cut short. Put the original back before anything
        // opens the live name, which would create an empty database.
        remove_side_files(&paths.live);
        let _ = rename_with_retry(&paths.before, &paths.live);
        return (open(&paths.live), RestoreStatus::RolledBack);
    }

    // The live file is the restored one; the original waits beside it.
    match open(&paths.live) {
        Ok(state) => {
            let _ = archive_before_restore(&paths, now);
            (Ok(state), RestoreStatus::Restored)
        }
        Err(_) => {
            let _ = rename_with_retry(&paths.live, &paths.failed);
            remove_side_files(&paths.live);
            let _ = rename_with_retry(&paths.before, &paths.live);
            (open(&paths.live), RestoreStatus::RolledBack)
        }
    }
}

/// Folds any WAL into the main file and switches it to `journal_mode=DELETE`.
fn checkpoint_into_single_file(path: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    conn.busy_timeout(Duration::from_secs(3))?;
    let busy: i64 = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| row.get(0))?;
    let journal_mode: String =
        conn.query_row("PRAGMA journal_mode=DELETE", [], |row| row.get(0))?;
    conn.close().map_err(|(_, error)| error)?;
    if busy != 0 || !journal_mode.eq_ignore_ascii_case("delete") {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY),
            Some("could not fold the WAL into the database".to_string()),
        ));
    }
    Ok(())
}

/// Moves `.before-restore` to `backups\GST-恢复前-YYYY-MM-DD-HHMMSS.db` and
/// keeps the newest `PRE_RESTORE_KEEP` such copies.
fn archive_before_restore(paths: &RestorePaths, now: NaiveDateTime) -> io::Result<()> {
    std::fs::create_dir_all(&paths.backups)?;
    let stamp = now.format("%Y-%m-%d-%H%M%S");
    let mut target = paths
        .backups
        .join(format!("{PRE_RESTORE_PREFIX}{stamp}.db"));
    let mut counter = 1;
    while target.exists() {
        target = paths
            .backups
            .join(format!("{PRE_RESTORE_PREFIX}{stamp}-{counter}.db"));
        counter += 1;
    }
    rename_with_retry(&paths.before, &target)?;
    prune_pre_restore_copies(&paths.backups, PRE_RESTORE_KEEP);
    Ok(())
}

fn prune_pre_restore_copies(backups: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(backups) else {
        return;
    };
    let mut copies: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy())
                .is_some_and(|name| name.starts_with(PRE_RESTORE_PREFIX) && name.ends_with(".db"))
        })
        .collect();
    // The timestamp in the name sorts chronologically.
    copies.sort();
    let excess = copies.len().saturating_sub(keep);
    for old in copies.into_iter().take(excess) {
        let _ = std::fs::remove_file(old);
    }
}

fn remove_staging_leftovers(data_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(data_dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if entry
            .file_name()
            .to_string_lossy()
            .to_lowercase()
            .starts_with(STAGING_PREFIX)
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn side_file(main: &Path, suffix: &str) -> PathBuf {
    let mut name = main.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn remove_side_files(main: &Path) {
    for suffix in ["-wal", "-shm", "-journal"] {
        let _ = std::fs::remove_file(side_file(main, suffix));
    }
}

fn remove_with_side_files(main: &Path) {
    let _ = std::fs::remove_file(main);
    remove_side_files(main);
}

/// Retries briefly for antivirus or indexer handles; a missing source fails at once.
fn rename_with_retry(from: &Path, to: &Path) -> io::Result<()> {
    let mut attempt = 1;
    loop {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Err(error),
            Err(error) if attempt >= RENAME_ATTEMPTS => return Err(error),
            Err(_) => {
                attempt += 1;
                std::thread::sleep(RENAME_RETRY_DELAY);
            }
        }
    }
}

/// Spawns this executable again after the tracker shut down, if `apply_restore` asked.
pub fn relaunch_if_requested() {
    if !RELAUNCH_AFTER_EXIT.load(Ordering::SeqCst) {
        return;
    }
    let spawned = std::env::current_exe().and_then(|exe| {
        std::process::Command::new(exe)
            .arg(format!("{AFTER_RESTORE_ARG}{}", std::process::id()))
            .spawn()
    });
    // If this fails, the next manual launch still completes the swap.
    if let Err(error) = spawned {
        eprintln!("could not relaunch after the restore: {error}");
    }
}

/// Waits up to `timeout` for the process that asked for a relaunch to exit.
#[cfg(windows)]
pub fn wait_for_process_exit(pid: u32, timeout: Duration) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
    };
    if pid == std::process::id() {
        return;
    }
    let process = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
    if process.is_null() {
        return;
    }
    let millis = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX);
    unsafe {
        WaitForSingleObject(process, millis);
        CloseHandle(process);
    }
}

#[cfg(not(windows))]
pub fn wait_for_process_exit(_pid: u32, _timeout: Duration) {}

/// Free bytes available to this user on the volume holding `dir`.
#[cfg(windows)]
fn free_space_bytes(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some(available)
}

#[cfg(not(windows))]
fn free_space_bytes(_dir: &Path) -> Option<u64> {
    None
}

fn data_dir(state: &AppState) -> Result<&Path, String> {
    state
        .db_path
        .parent()
        .ok_or_else(|| RestoreError::Failed.into())
}

/// Opens the folder holding the live database in Explorer. The path comes
/// from the app state, never from the webview.
#[tauri::command(async)]
pub fn open_data_folder(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let dir = state
        .db_path
        .parent()
        .ok_or_else(|| DATA_FOLDER_OPEN_FAILED.to_string())?;
    let mut command = std::process::Command::new(explorer_path());
    #[cfg(windows)]
    {
        // Explorer parses its own command line.
        use std::os::windows::process::CommandExt;
        command.raw_arg(format!("\"{}\"", dir.display()));
    }
    #[cfg(not(windows))]
    command.arg(dir);
    // explorer.exe exits with 1 even on success, so its status is not checked.
    command
        .spawn()
        .map_err(|_| DATA_FOLDER_OPEN_FAILED.to_string())?;
    Ok(())
}

/// Opens the file picker, then validates and stages the backup; `None` when cancelled.
#[tauri::command]
pub async fn pick_restore_backup(app: AppHandle) -> Result<Option<RestorePreview>, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        state.restore.discard_any();
        let Some(path) = pick_open_path(&app, "GST 数据备份", &["db", "sqlite3", "sqlite"])
        else {
            return Ok(None);
        };
        let data_dir = data_dir(&state)?;
        let staged = stage_backup(&path, data_dir, free_space_bytes(data_dir))?;
        let restore_id = state.restore.stash(staged.path.clone());
        Ok(Some(staged.preview(restore_id)))
    })
    .await
}

/// Queues the staged backup for the next start and exits; the app relaunches
/// itself after the tracker has shut down.
#[tauri::command(async)]
pub fn apply_restore(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    restore_id: String,
) -> Result<(), String> {
    let staged = state
        .restore
        .take(&restore_id)
        .ok_or_else(|| String::from(RestoreError::Failed))?;
    promote_staged(&staged, data_dir(&state)?)?;
    RELAUNCH_AFTER_EXIT.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

/// Deletes the staged copy when the confirm dialog is cancelled.
#[tauri::command(async)]
pub fn discard_restore(state: tauri::State<'_, AppState>, restore_id: String) {
    state.restore.discard(&restore_id);
}

/// `restored`, `rolled_back` or `none`; reported once per start.
#[tauri::command]
pub fn get_restore_status(state: tauri::State<'_, AppState>) -> RestoreStatus {
    state.restore.take_status()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, TimeZone, Utc};
    use tempfile::TempDir;

    const MARKER: &str = "test.marker";

    fn at(day: u32, hms: (u32, u32, u32)) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, day)
            .unwrap()
            .and_hms_opt(hms.0, hms.1, hms.2)
            .unwrap()
    }

    /// A schema-3 GST database with a marker setting, two used software
    /// (one with two sessions), one seen but never used, and two recorded days.
    fn gst_database(path: &Path, marker: &str) {
        let store = Store::open(path).unwrap();
        store.migrate().unwrap();
        store.set_setting_value(MARKER, marker).unwrap();
        let mut app_ids = Vec::new();
        for name in ["Code.exe", "EXCEL.EXE", "Unused.exe"] {
            let app = store
                .upsert_app(name, &format!(r"X:\Fixtures\{name}"), name)
                .unwrap();
            store.upsert_software_identity_for_app(app.id).unwrap();
            app_ids.push(app.id);
        }
        let start = Utc.with_ymd_and_hms(2026, 11, 20, 9, 0, 0).unwrap();
        for app_id in [app_ids[0], app_ids[0], app_ids[1]] {
            store.start_session(app_id, start).unwrap();
        }
        for day in [
            NaiveDate::from_ymd_opt(2026, 9, 3),
            NaiveDate::from_ymd_opt(2026, 11, 20),
        ] {
            store
                .increment_daily_system_usage(day.unwrap(), 60, 30, 60)
                .unwrap();
        }
    }

    fn marker_of(path: &Path) -> Option<String> {
        let store = Store::open_read_only(path).unwrap();
        store.setting_value(MARKER).unwrap()
    }

    /// What `AppState::new` does to the live file.
    fn open_store(path: &Path) -> Result<Store, StoreError> {
        let store = Store::open(path)?;
        store.migrate()?;
        store.recover_open_sessions()?;
        Ok(store)
    }

    fn names_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .map(|entries| {
                entries
                    .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    fn raw(path: &Path) -> Connection {
        Connection::open(path).unwrap()
    }

    /// A data folder and a separate folder for picked backups.
    fn folders() -> (TempDir, TempDir) {
        (TempDir::new().unwrap(), TempDir::new().unwrap())
    }

    #[test]
    fn a_backup_is_staged_as_one_migrated_file_with_its_preview_facts() {
        let (data, picked) = folders();
        gst_database(&data.path().join(DB_FILE_NAME), "live");
        let source = picked.path().join("GST-数据备份-2026-11-20.db");
        gst_database(&source, "backup");
        let size = std::fs::metadata(&source).unwrap().len();

        let staged = stage_backup(&source, data.path(), Some(u64::MAX)).unwrap();

        assert_eq!(staged.file_name, "GST-数据备份-2026-11-20.db");
        assert_eq!(staged.first_day.as_deref(), Some("2026-09-03"));
        assert_eq!(staged.last_day.as_deref(), Some("2026-11-20"));
        assert_eq!(staged.software_count, 2);
        assert_eq!(staged.file_size_bytes, size);
        assert_eq!(staged.path.parent(), Some(data.path()));
        let staged_name = staged.path.file_name().unwrap().to_string_lossy();
        assert!(staged_name.starts_with(STAGING_PREFIX) && staged_name.ends_with(".tmp"));
        // One complete file: no WAL beside it, and journal_mode DELETE.
        assert_eq!(
            names_in(data.path()),
            vec![staged_name.to_string(), DB_FILE_NAME.to_string()]
        );
        let mode: String = raw(&staged.path)
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(mode, "delete");
        assert_eq!(marker_of(&staged.path).as_deref(), Some("backup"));
        assert_eq!(
            marker_of(&data.path().join(DB_FILE_NAME)).as_deref(),
            Some("live")
        );
        assert_eq!(
            staged.preview("id".to_string()),
            RestorePreview {
                restore_id: "id".to_string(),
                file_name: "GST-数据备份-2026-11-20.db".to_string(),
                first_day: Some("2026-09-03".to_string()),
                last_day: Some("2026-11-20".to_string()),
                software_count: 2,
                file_size_bytes: size,
            }
        );
    }

    #[test]
    fn a_backup_without_recorded_days_has_no_range() {
        let (data, picked) = folders();
        let source = picked.path().join("empty.db");
        open_store(&source).unwrap();

        let staged = stage_backup(&source, data.path(), None).unwrap();

        assert_eq!((staged.first_day, staged.last_day), (None, None));
        assert_eq!(staged.software_count, 0);
    }

    #[test]
    fn a_schema_2_backup_is_migrated_to_schema_3_on_the_copy() {
        let (data, picked) = folders();
        let source = picked.path().join("v0.3.0.db");
        gst_database(&source, "old");
        {
            let conn = raw(&source);
            conn.execute_batch(
                "DROP TABLE timeline_segments; DROP TABLE timeline_window_spans;
                 PRAGMA user_version = 2; PRAGMA journal_mode = DELETE;",
            )
            .unwrap();
        }
        let original = std::fs::read(&source).unwrap();

        let staged = stage_backup(&source, data.path(), None).unwrap();

        let conn = raw(&staged.path);
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);
        let tables = Store::open_read_only(&staged.path)
            .unwrap()
            .table_names()
            .unwrap();
        assert!(tables.contains(&"timeline_segments".to_string()));
        assert!(tables.contains(&"timeline_window_spans".to_string()));
        assert_eq!(marker_of(&staged.path).as_deref(), Some("old"));
        assert_eq!(staged.software_count, 2);
        // The picked file itself is never changed.
        assert_eq!(std::fs::read(&source).unwrap(), original);
    }

    fn rejection(prepare: impl FnOnce(&Path)) -> RestoreError {
        let (data, picked) = folders();
        let source = picked.path().join("backup.db");
        prepare(&source);
        let error = stage_backup(&source, data.path(), None).unwrap_err();
        assert_eq!(
            names_in(data.path()),
            Vec::<String>::new(),
            "no staged leftovers"
        );
        error
    }

    #[test]
    fn files_that_are_not_gst_backups_are_rejected() {
        let not_sqlite = rejection(|path| std::fs::write(path, "id,name\n1,Code\n").unwrap());
        assert_eq!(not_sqlite, RestoreError::Invalid);
        let empty = rejection(|path| std::fs::write(path, b"").unwrap());
        assert_eq!(empty, RestoreError::Invalid);
        let corrupt = rejection(|path| {
            let mut bytes = SQLITE_HEADER.to_vec();
            bytes.extend(std::iter::repeat_n(0xA5u8, 8192));
            std::fs::write(path, bytes).unwrap();
        });
        assert_eq!(corrupt, RestoreError::Invalid);
        let foreign = rejection(|path| {
            raw(path)
                .execute_batch("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);")
                .unwrap();
        });
        assert_eq!(foreign, RestoreError::Invalid);
        let empty_sqlite = rejection(|path| {
            raw(path).execute_batch("PRAGMA user_version = 0;").unwrap();
            raw(path).execute_batch("VACUUM;").unwrap();
        });
        assert_eq!(empty_sqlite, RestoreError::Invalid);
        let schema_1_without_settings = rejection(|path| {
            gst_database(path, "x");
            raw(path)
                .execute_batch("DROP TABLE app_settings; PRAGMA user_version = 1;")
                .unwrap();
        });
        assert_eq!(schema_1_without_settings, RestoreError::Invalid);
    }

    #[test]
    fn backups_with_triggers_or_views_are_rejected() {
        let trigger = rejection(|path| {
            gst_database(path, "x");
            raw(path)
                .execute_batch(
                    "CREATE TRIGGER wipe AFTER INSERT ON apps BEGIN DELETE FROM usage_sessions; END;",
                )
                .unwrap();
        });
        assert_eq!(trigger, RestoreError::Invalid);
        let view = rejection(|path| {
            gst_database(path, "x");
            raw(path)
                .execute_batch("CREATE VIEW names AS SELECT display_name FROM apps;")
                .unwrap();
        });
        assert_eq!(view, RestoreError::Invalid);
    }

    #[test]
    fn a_backup_from_a_newer_schema_is_rejected() {
        let newer = rejection(|path| {
            gst_database(path, "x");
            raw(path).execute_batch("PRAGMA user_version = 4;").unwrap();
        });
        assert_eq!(newer, RestoreError::Newer);
    }

    #[test]
    fn the_live_database_and_other_data_folder_files_are_refused() {
        let data = TempDir::new().unwrap();
        let paths = RestorePaths::new(data.path());
        gst_database(&paths.live, "live");
        let wal = side_file(&paths.live, "-wal");
        std::fs::write(&wal, b"").unwrap();
        gst_database(&paths.pending, "pending");
        let other = data.path().join("copy.db");
        gst_database(&other, "copy");
        for path in [&paths.live, &wal, &paths.pending, &other] {
            assert_eq!(
                stage_backup(path, data.path(), None),
                Err(RestoreError::LiveDatabase),
                "{}",
                path.display()
            );
        }
        // Relative or differently cased spellings of the live file are caught too.
        let dotted = data.path().join(".").join(DB_FILE_NAME.to_uppercase());
        assert_eq!(
            stage_backup(&dotted, data.path(), None),
            Err(RestoreError::LiveDatabase)
        );
        // A pre-restore copy in backups\ may be restored.
        std::fs::create_dir(&paths.backups).unwrap();
        let copy = paths.backups.join("GST-恢复前-2026-11-26-101500.db");
        gst_database(&copy, "before");
        let staged = stage_backup(&copy, data.path(), None).unwrap();
        assert_eq!(marker_of(&staged.path).as_deref(), Some("before"));
    }

    #[test]
    fn a_backup_larger_than_the_free_space_is_rejected() {
        let (data, picked) = folders();
        let source = picked.path().join("backup.db");
        gst_database(&source, "backup");
        assert_eq!(
            stage_backup(&source, data.path(), Some(1024)),
            Err(RestoreError::NoSpace)
        );
        assert_eq!(names_in(data.path()), Vec::<String>::new());
        assert_eq!(
            stage_backup(&picked.path().join("missing.db"), data.path(), None),
            Err(RestoreError::Failed)
        );
    }

    #[test]
    fn error_codes_are_stable() {
        let codes: Vec<&str> = [
            RestoreError::Invalid,
            RestoreError::Newer,
            RestoreError::LiveDatabase,
            RestoreError::NoSpace,
            RestoreError::Failed,
        ]
        .into_iter()
        .map(RestoreError::code)
        .collect();
        assert_eq!(
            codes,
            [
                "restore_invalid",
                "restore_newer",
                "restore_live_database",
                "restore_no_space",
                "restore_failed"
            ]
        );
        assert_eq!(
            serde_json::to_value([
                RestoreStatus::None,
                RestoreStatus::Restored,
                RestoreStatus::RolledBack
            ])
            .unwrap(),
            serde_json::json!(["none", "restored", "rolled_back"])
        );
    }

    #[test]
    fn a_restore_id_is_single_use_and_a_new_pick_deletes_the_earlier_copy() {
        let dir = TempDir::new().unwrap();
        let first = dir.path().join(".gst-restore-1.tmp");
        let second = dir.path().join(".gst-restore-2.tmp");
        std::fs::write(&first, b"1").unwrap();
        std::fs::write(&second, b"2").unwrap();
        let session = RestoreSession::default();

        let first_id = session.stash(first.clone());
        let second_id = session.stash(second.clone());
        assert!(!first.exists(), "picking again deletes the earlier copy");
        assert_eq!(session.take(&first_id), None);
        assert_eq!(session.take("unknown"), None);
        assert_eq!(session.take(&second_id), Some(second.clone()));
        assert_eq!(session.take(&second_id), None);

        let third_id = session.stash(second.clone());
        session.discard("unknown");
        assert!(second.exists());
        session.discard(&third_id);
        assert!(!second.exists(), "cancelling deletes the copy");
        assert_eq!(session.take(&third_id), None);
    }

    #[test]
    fn the_restore_status_is_reported_once() {
        let session = RestoreSession::default();
        assert_eq!(session.take_status(), RestoreStatus::None);
        session.set_status(RestoreStatus::Restored);
        assert_eq!(session.take_status(), RestoreStatus::Restored);
        assert_eq!(session.take_status(), RestoreStatus::None);
    }

    #[test]
    fn the_after_restore_argument_carries_the_old_pid() {
        let args = |list: &[&str]| list.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
        assert_eq!(
            after_restore_pid(args(&["gst.exe", "--after-restore=4242"])),
            Some(4242)
        );
        assert_eq!(after_restore_pid(args(&["gst.exe"])), None);
        assert_eq!(
            after_restore_pid(args(&["gst.exe", "--after-restore=x"])),
            None
        );
    }

    #[test]
    fn applying_moves_the_staged_copy_to_the_pending_name() {
        let data = TempDir::new().unwrap();
        let staged = data.path().join(".gst-restore-1.tmp");
        std::fs::write(&staged, b"db").unwrap();
        promote_staged(&staged, data.path()).unwrap();
        assert_eq!(
            names_in(data.path()),
            vec![format!("{DB_FILE_NAME}{PENDING_SUFFIX}")]
        );
        assert_eq!(
            promote_staged(&staged, data.path()),
            Err(RestoreError::Failed)
        );
    }

    /// A data folder with a live database and a staged restore queued as pending.
    fn queued_restore() -> (TempDir, RestorePaths) {
        let (data, picked) = folders();
        let paths = RestorePaths::new(data.path());
        gst_database(&paths.live, "live");
        let source = picked.path().join("backup.db");
        gst_database(&source, "backup");
        let staged = stage_backup(&source, data.path(), None).unwrap();
        promote_staged(&staged.path, data.path()).unwrap();
        (data, paths)
    }

    fn pre_restore_copies(paths: &RestorePaths) -> Vec<String> {
        names_in(&paths.backups)
    }

    #[test]
    fn a_start_without_restore_files_just_opens_the_live_database() {
        let data = TempDir::new().unwrap();
        let (store, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);
        assert!(store.is_ok());
        assert_eq!(status, RestoreStatus::None);
        assert_eq!(
            names_in(data.path()).first().map(String::as_str),
            Some(DB_FILE_NAME)
        );
        assert!(!RestorePaths::new(data.path()).backups.exists());
    }

    #[test]
    fn a_pending_restore_replaces_the_live_database_and_keeps_the_old_one() {
        let (data, paths) = queued_restore();
        // Live writes the old process never checkpointed must reach the pre-restore copy.
        let scratch = TempDir::new().unwrap();
        let crashed = scratch.path().join(DB_FILE_NAME);
        gst_database(&crashed, "live");
        let wal = stale_wal_of(&crashed, "live-in-wal", |path| {
            std::fs::copy(path, &paths.live).unwrap();
        });
        std::fs::write(side_file(&paths.live, "-wal"), wal).unwrap();

        let (store, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);

        let store = store.unwrap();
        assert_eq!(status, RestoreStatus::Restored);
        assert_eq!(
            store.setting_value(MARKER).unwrap().as_deref(),
            Some("backup")
        );
        drop(store);
        assert!(!paths.pending.exists() && !paths.before.exists() && !paths.failed.exists());
        assert_eq!(
            pre_restore_copies(&paths),
            vec!["GST-恢复前-2026-11-26-101500.db".to_string()]
        );
        assert_eq!(
            marker_of(&paths.backups.join("GST-恢复前-2026-11-26-101500.db")).as_deref(),
            Some("live-in-wal")
        );
    }

    /// Writes `marker` to the GST database at `path` without checkpointing and
    /// returns the WAL bytes. `snapshot` sees the main file in that state, as a
    /// crashed process leaves it.
    fn stale_wal_of(path: &Path, marker: &str, snapshot: impl FnOnce(&Path)) -> Vec<u8> {
        let writer = raw(path);
        writer.pragma_update(None, "journal_mode", "WAL").unwrap();
        writer.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        writer
            .execute(
                "UPDATE app_settings SET setting_value = ?2 WHERE setting_key = ?1",
                [MARKER, marker],
            )
            .unwrap();
        snapshot(path);
        let bytes = std::fs::read(side_file(path, "-wal")).unwrap();
        assert!(!bytes.is_empty());
        bytes
    }

    /// The bytes of a WAL holding `marker`, from a database shaped like GST's.
    fn stale_wal(dir: &Path, marker: &str) -> Vec<u8> {
        let path = dir.join("wal-source.sqlite3");
        gst_database(&path, "wal-base");
        stale_wal_of(&path, marker, |_| {})
    }

    #[test]
    fn a_stale_wal_with_the_live_name_is_not_applied_to_the_restored_file() {
        let (data, paths) = queued_restore();
        let scratch = TempDir::new().unwrap();
        // A crash after step 2: live set aside, its WAL still under the live name.
        checkpoint_into_single_file(&paths.live).unwrap();
        std::fs::rename(&paths.live, &paths.before).unwrap();
        let wal = stale_wal(scratch.path(), "stale");
        std::fs::write(side_file(&paths.live, "-wal"), &wal).unwrap();
        std::fs::write(side_file(&paths.live, "-journal"), b"stale journal").unwrap();

        let (store, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);

        let store = store.unwrap();
        assert_eq!(status, RestoreStatus::Restored);
        assert_eq!(
            store.setting_value(MARKER).unwrap().as_deref(),
            Some("backup")
        );
        drop(store);
        assert!(!side_file(&paths.live, "-journal").exists());
        assert_eq!(pre_restore_copies(&paths).len(), 1);
    }

    #[test]
    fn a_start_after_a_crash_before_the_restored_file_opened_finishes_the_restore() {
        let (data, paths) = queued_restore();
        checkpoint_into_single_file(&paths.live).unwrap();
        std::fs::rename(&paths.live, &paths.before).unwrap();
        std::fs::rename(&paths.pending, &paths.live).unwrap();

        let (store, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);

        assert_eq!(status, RestoreStatus::Restored);
        assert_eq!(
            store.unwrap().setting_value(MARKER).unwrap().as_deref(),
            Some("backup")
        );
        assert!(!paths.before.exists());
        assert_eq!(pre_restore_copies(&paths).len(), 1);
    }

    #[test]
    fn a_missing_live_file_with_a_pre_restore_copy_is_put_back_before_opening() {
        let data = TempDir::new().unwrap();
        let paths = RestorePaths::new(data.path());
        gst_database(&paths.before, "original");
        std::fs::write(side_file(&paths.live, "-wal"), b"not ours").unwrap();
        let mut opened_with = Vec::new();

        let (store, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), |path| {
            opened_with.push(marker_of(path));
            open_store(path)
        });

        assert_eq!(status, RestoreStatus::RolledBack);
        assert_eq!(opened_with, vec![Some("original".to_string())]);
        assert_eq!(
            store.unwrap().setting_value(MARKER).unwrap().as_deref(),
            Some("original")
        );
        assert!(!paths.before.exists());
    }

    #[test]
    fn a_restored_file_that_fails_to_open_is_rolled_back() {
        let (data, paths) = queued_restore();
        let mut corrupt = SQLITE_HEADER.to_vec();
        corrupt.extend(std::iter::repeat_n(0x5Au8, 8192));
        std::fs::write(&paths.pending, corrupt).unwrap();

        let (store, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);

        assert_eq!(status, RestoreStatus::RolledBack);
        assert_eq!(
            store.unwrap().setting_value(MARKER).unwrap().as_deref(),
            Some("live")
        );
        assert!(paths.failed.exists());
        assert!(!paths.pending.exists() && !paths.before.exists());
        assert_eq!(pre_restore_copies(&paths), Vec::<String>::new());
    }

    #[test]
    fn a_live_file_that_cannot_be_checkpointed_keeps_its_place() {
        let (data, paths) = queued_restore();
        std::fs::write(&paths.live, b"not a database at all").unwrap();
        let mut opened = 0;

        let (_, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), |path| {
            opened += 1;
            assert_eq!(std::fs::read(path).unwrap(), b"not a database at all");
            Ok::<(), ()>(())
        });

        assert_eq!(status, RestoreStatus::RolledBack);
        assert_eq!(opened, 1);
        assert!(paths.failed.exists() && !paths.pending.exists() && !paths.before.exists());
    }

    #[test]
    fn only_the_newest_three_pre_restore_copies_are_kept() {
        let (data, paths) = queued_restore();
        std::fs::create_dir_all(&paths.backups).unwrap();
        for day in 1..=4 {
            std::fs::write(
                paths
                    .backups
                    .join(format!("GST-恢复前-2026-11-0{day}-000000.db")),
                b"old",
            )
            .unwrap();
        }
        std::fs::write(paths.backups.join("notes.txt"), b"mine").unwrap();

        let (_, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);

        assert_eq!(status, RestoreStatus::Restored);
        assert_eq!(
            pre_restore_copies(&paths),
            vec![
                "GST-恢复前-2026-11-03-000000.db".to_string(),
                "GST-恢复前-2026-11-04-000000.db".to_string(),
                "GST-恢复前-2026-11-26-101500.db".to_string(),
                "notes.txt".to_string(),
            ]
        );
    }

    #[test]
    fn leftover_staged_copies_are_deleted_at_startup() {
        let data = TempDir::new().unwrap();
        for name in [
            ".gst-restore-a.tmp",
            ".gst-restore-a.tmp-journal",
            ".gst-backup-b.tmp",
        ] {
            std::fs::write(data.path().join(name), b"x").unwrap();
        }

        let (_, status) = run_startup_swap(data.path(), at(26, (10, 15, 0)), open_store);

        assert_eq!(status, RestoreStatus::None);
        let names = names_in(data.path());
        assert!(
            names.iter().all(|name| !name.starts_with(STAGING_PREFIX)),
            "{names:?}"
        );
        assert!(names.contains(&".gst-backup-b.tmp".to_string()));
    }
}
