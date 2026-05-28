use crate::domain::AppIdentity;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub type StoreResult<T> = Result<T, StoreError>;

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> StoreResult<Self> {
        let conn = Connection::open(path)?;
        Ok(Self { conn })
    }

    pub fn migrate(&self) -> StoreResult<()> {
        self.conn.pragma_update(None, "journal_mode", "WAL")?;
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                process_name TEXT NOT NULL,
                executable_path TEXT NOT NULL,
                display_name TEXT NOT NULL,
                normalized_key TEXT NOT NULL UNIQUE,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                is_user_renamed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS run_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER,
                event_kind TEXT NOT NULL,
                payload_json TEXT,
                occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS usage_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                last_heartbeat_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                close_reason TEXT,
                recovered INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS daily_app_usage (
                usage_date TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                runtime_seconds INTEGER NOT NULL DEFAULT 0,
                active_seconds INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (usage_date, app_id),
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS daily_system_usage (
                usage_date TEXT PRIMARY KEY,
                recorded_seconds INTEGER NOT NULL DEFAULT 0,
                active_seconds INTEGER NOT NULL DEFAULT 0,
                tracker_uptime_seconds INTEGER NOT NULL DEFAULT 0
            );
            "#,
        )?;
        Ok(())
    }

    pub fn table_names(&self) -> StoreResult<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub fn journal_mode(&self) -> StoreResult<String> {
        self.conn
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
            .map(|mode| mode.to_lowercase())
            .map_err(StoreError::from)
    }

    pub fn upsert_app(
        &self,
        process_name: &str,
        executable_path: &str,
        display_name: &str,
    ) -> StoreResult<AppIdentity> {
        let normalized_key = normalize_identity_key(executable_path, process_name);
        let existing = self.find_app_by_key(&normalized_key)?;

        if existing.is_none() {
            self.conn.execute(
                "INSERT INTO apps (process_name, executable_path, display_name, normalized_key)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    process_name.to_lowercase(),
                    executable_path,
                    display_name,
                    normalized_key
                ],
            )?;
        }

        self.find_app_by_key(&normalize_identity_key(executable_path, process_name))?
            .ok_or(rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn find_app_by_key(&self, normalized_key: &str) -> StoreResult<Option<AppIdentity>> {
        self.conn
            .query_row(
                "SELECT id, process_name, executable_path, display_name, normalized_key, is_hidden, is_user_renamed
                 FROM apps WHERE normalized_key = ?1",
                params![normalized_key],
                |row| {
                    Ok(AppIdentity {
                        id: row.get(0)?,
                        process_name: row.get(1)?,
                        executable_path: row.get(2)?,
                        display_name: row.get(3)?,
                        normalized_key: row.get(4)?,
                        is_hidden: row.get::<_, i64>(5)? != 0,
                        is_user_renamed: row.get::<_, i64>(6)? != 0,
                    })
                },
            )
            .optional()
            .map_err(StoreError::from)
    }
}

pub fn normalize_identity_key(executable_path: &str, process_name: &str) -> String {
    let path = executable_path.trim().replace('/', "\\").to_lowercase();
    if path.is_empty() {
        process_name.trim().to_lowercase()
    } else {
        path
    }
}
