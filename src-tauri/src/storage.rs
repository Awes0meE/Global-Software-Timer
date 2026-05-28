use crate::domain::{AppIdentity, RunEventKind, UsageSession};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("datetime parse error: {0}")]
    ChronoParse(#[from] chrono::ParseError),
    #[error("{operation} updated {count} rows")]
    UnexpectedUpdateCount {
        operation: &'static str,
        count: usize,
    },
}

pub type StoreResult<T> = Result<T, StoreError>;

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> StoreResult<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
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

    pub fn foreign_keys_enabled(&self) -> StoreResult<bool> {
        self.conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))
            .map(|enabled| enabled != 0)
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

    pub fn insert_run_event(
        &self,
        app_id: Option<i64>,
        event_kind: RunEventKind,
        payload_json: Option<&str>,
    ) -> StoreResult<()> {
        self.conn.execute(
            "INSERT INTO run_events (app_id, event_kind, payload_json) VALUES (?1, ?2, ?3)",
            params![app_id, event_kind.as_str(), payload_json],
        )?;
        Ok(())
    }

    pub fn start_session(&self, app_id: i64, now: DateTime<Utc>) -> StoreResult<i64> {
        self.conn.execute(
            "INSERT INTO usage_sessions (app_id, started_at, last_heartbeat_at)
             VALUES (?1, ?2, ?2)",
            params![app_id, now.to_rfc3339()],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn start_session_with_event(
        &self,
        app_id: i64,
        now: DateTime<Utc>,
        payload_json: Option<&str>,
    ) -> StoreResult<i64> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            let session_id = self.start_session(app_id, now)?;
            self.insert_run_event(Some(app_id), RunEventKind::AppSeenStarted, payload_json)?;
            Ok(session_id)
        })();

        match result {
            Ok(session_id) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(session_id)
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }

    pub fn heartbeat_session(&self, session_id: i64, now: DateTime<Utc>) -> StoreResult<()> {
        let count = self.conn.execute(
            "UPDATE usage_sessions SET last_heartbeat_at = ?1 WHERE id = ?2 AND ended_at IS NULL",
            params![now.to_rfc3339(), session_id],
        )?;
        if count != 1 {
            return Err(StoreError::UnexpectedUpdateCount {
                operation: "heartbeat_session",
                count,
            });
        }
        Ok(())
    }

    pub fn close_session(
        &self,
        session_id: i64,
        ended_at: DateTime<Utc>,
        close_reason: &str,
        recovered: bool,
    ) -> StoreResult<()> {
        let started_at = self
            .conn
            .query_row(
                "SELECT started_at FROM usage_sessions WHERE id = ?1 AND ended_at IS NULL",
                params![session_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(started_at) = started_at else {
            return Err(StoreError::UnexpectedUpdateCount {
                operation: "close_session",
                count: 0,
            });
        };
        let started_at = DateTime::parse_from_rfc3339(&started_at)?.with_timezone(&Utc);
        let duration_seconds = ended_at.signed_duration_since(started_at).num_seconds();

        let count = self.conn.execute(
            r#"
            UPDATE usage_sessions
            SET ended_at = ?1,
                duration_seconds = ?2,
                close_reason = ?3,
                recovered = ?4
            WHERE id = ?5 AND ended_at IS NULL
            "#,
            params![
                ended_at.to_rfc3339(),
                duration_seconds,
                close_reason,
                recovered as i64,
                session_id
            ],
        )?;
        if count != 1 {
            return Err(StoreError::UnexpectedUpdateCount {
                operation: "close_session",
                count,
            });
        }
        Ok(())
    }

    pub fn close_session_with_event(
        &self,
        session_id: i64,
        app_id: i64,
        ended_at: DateTime<Utc>,
        close_reason: &str,
        recovered: bool,
    ) -> StoreResult<()> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            self.close_session(session_id, ended_at, close_reason, recovered)?;
            self.insert_run_event(Some(app_id), RunEventKind::AppSeenStopped, None)?;
            Ok(())
        })();

        match result {
            Ok(()) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(())
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }

    pub fn all_sessions(&self) -> StoreResult<Vec<UsageSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, app_id, started_at, ended_at, last_heartbeat_at, duration_seconds, close_reason, recovered
             FROM usage_sessions ORDER BY id",
        )?;
        let mut rows = stmt.query([])?;
        let mut sessions = Vec::new();

        while let Some(row) = rows.next()? {
            let started_at: String = row.get(2)?;
            let ended_at: Option<String> = row.get(3)?;
            let last_heartbeat_at: String = row.get(4)?;

            sessions.push(UsageSession {
                id: row.get(0)?,
                app_id: row.get(1)?,
                started_at: DateTime::parse_from_rfc3339(&started_at)?.with_timezone(&Utc),
                ended_at: ended_at
                    .map(|value| {
                        DateTime::parse_from_rfc3339(&value).map(|dt| dt.with_timezone(&Utc))
                    })
                    .transpose()?,
                last_heartbeat_at: DateTime::parse_from_rfc3339(&last_heartbeat_at)?
                    .with_timezone(&Utc),
                duration_seconds: row.get(5)?,
                close_reason: row.get(6)?,
                recovered: row.get::<_, i64>(7)? != 0,
            });
        }

        Ok(sessions)
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
