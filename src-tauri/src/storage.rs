use crate::classifier::{classify_process, Classification};
use crate::domain::{
    AppIdentity, AppRuntimeStatus, AppUsageSummary, DailySystemUsage, RunEventKind,
    SoftwareIdentity, SoftwarePageRow, SoftwarePageRows, UsageSession,
};
use chrono::{DateTime, Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
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
    #[error("software identity {identity_key} already exists in {conflicting_list}")]
    SoftwareIdentityListConflict {
        identity_key: String,
        conflicting_list: &'static str,
    },
}

pub type StoreResult<T> = Result<T, StoreError>;

#[derive(Debug, Clone, Copy, Default)]
struct SoftwareRuntimeSeconds {
    foreground_seconds: i64,
    background_seconds: i64,
}

#[derive(Debug, Clone, Copy, Default)]
struct SoftwareLegacyRuntimeSeconds {
    total_seconds: i64,
    today_seconds: i64,
}

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

            CREATE TABLE IF NOT EXISTS software_identities (
                identity_key TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                process_name TEXT NOT NULL,
                representative_executable_path TEXT NOT NULL,
                last_opened_at TEXT,
                last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS software_identity_members (
                identity_key TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (identity_key, app_id),
                FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key),
                FOREIGN KEY(app_id) REFERENCES apps(id)
            );

            CREATE TABLE IF NOT EXISTS focused_software_identities (
                identity_key TEXT PRIMARY KEY,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
            );

            CREATE TABLE IF NOT EXISTS hidden_software_identities (
                identity_key TEXT PRIMARY KEY,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
            );

            CREATE TABLE IF NOT EXISTS daily_software_focus_usage (
                usage_date TEXT NOT NULL,
                identity_key TEXT NOT NULL,
                focused_seconds INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (usage_date, identity_key),
                FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
            );

            CREATE TABLE IF NOT EXISTS daily_software_runtime_usage (
                usage_date TEXT NOT NULL,
                identity_key TEXT NOT NULL,
                foreground_seconds INTEGER NOT NULL DEFAULT 0,
                background_seconds INTEGER NOT NULL DEFAULT 0,
                first_recorded_at TEXT NOT NULL,
                last_recorded_at TEXT NOT NULL,
                PRIMARY KEY (usage_date, identity_key),
                FOREIGN KEY(identity_key) REFERENCES software_identities(identity_key)
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )?;
        self.ensure_daily_software_runtime_usage_columns()?;
        Ok(())
    }

    fn ensure_daily_software_runtime_usage_columns(&self) -> StoreResult<()> {
        if !self
            .table_columns("daily_software_runtime_usage")?
            .contains(&"first_recorded_at".to_string())
        {
            self.conn.execute(
                "ALTER TABLE daily_software_runtime_usage ADD COLUMN first_recorded_at TEXT",
                [],
            )?;
            self.conn.execute(
                "UPDATE daily_software_runtime_usage SET first_recorded_at = usage_date || 'T23:59:59+00:00' WHERE first_recorded_at IS NULL",
                [],
            )?;
        }

        if !self
            .table_columns("daily_software_runtime_usage")?
            .contains(&"last_recorded_at".to_string())
        {
            self.conn.execute(
                "ALTER TABLE daily_software_runtime_usage ADD COLUMN last_recorded_at TEXT",
                [],
            )?;
            self.conn.execute(
                "UPDATE daily_software_runtime_usage SET last_recorded_at = first_recorded_at WHERE last_recorded_at IS NULL",
                [],
            )?;
        }

        Ok(())
    }

    fn table_columns(&self, table_name: &str) -> StoreResult<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({table_name})"))?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
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

    fn find_app_by_id(&self, app_id: i64) -> StoreResult<Option<AppIdentity>> {
        self.conn
            .query_row(
                "SELECT id, process_name, executable_path, display_name, normalized_key, is_hidden, is_user_renamed
                 FROM apps WHERE id = ?1",
                params![app_id],
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

    pub fn software_identity_key_for_app(&self, app_id: i64) -> StoreResult<Option<String>> {
        let Some(app) = self.find_app_by_id(app_id)? else {
            return Ok(None);
        };

        Ok(Some(software_identity_parts_for_app(&app).identity_key))
    }

    pub fn upsert_software_identity_for_app(&self, app_id: i64) -> StoreResult<SoftwareIdentity> {
        self.upsert_software_identity_for_app_with_started_at(app_id, None)
    }

    pub fn upsert_software_identity_for_app_started_at(
        &self,
        app_id: i64,
        started_at: DateTime<Utc>,
    ) -> StoreResult<SoftwareIdentity> {
        self.upsert_software_identity_for_app_with_started_at(app_id, Some(started_at))
    }

    fn upsert_software_identity_for_app_with_started_at(
        &self,
        app_id: i64,
        started_at: Option<DateTime<Utc>>,
    ) -> StoreResult<SoftwareIdentity> {
        let app = self
            .find_app_by_id(app_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let mut parts = software_identity_parts_for_app(&app);

        if let Some(existing) = self.find_software_identity(&parts.identity_key)? {
            if !should_prefer_executable_path(
                &existing.representative_executable_path,
                &parts.representative_executable_path,
                &parts.display_name,
                &parts.process_name,
            ) {
                parts.process_name = existing.process_name;
                parts.representative_executable_path = existing.representative_executable_path;
            }
        }

        let last_opened_at = started_at.map(|value| value.to_rfc3339());
        self.conn.execute(
            r#"
            INSERT INTO software_identities (
                identity_key,
                display_name,
                process_name,
                representative_executable_path,
                last_opened_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(identity_key) DO UPDATE SET
                display_name = excluded.display_name,
                process_name = excluded.process_name,
                representative_executable_path = excluded.representative_executable_path,
                last_opened_at = CASE
                    WHEN excluded.last_opened_at IS NULL THEN software_identities.last_opened_at
                    WHEN software_identities.last_opened_at IS NULL THEN excluded.last_opened_at
                    WHEN software_identities.last_opened_at < excluded.last_opened_at THEN excluded.last_opened_at
                    ELSE software_identities.last_opened_at
                END,
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            "#,
            params![
                parts.identity_key,
                parts.display_name,
                parts.process_name,
                parts.representative_executable_path,
                last_opened_at
            ],
        )?;
        self.conn.execute(
            r#"
            INSERT INTO software_identity_members (identity_key, app_id, updated_at)
            VALUES (?1, ?2, CURRENT_TIMESTAMP)
            ON CONFLICT(identity_key, app_id) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP
            "#,
            params![parts.identity_key, app_id],
        )?;

        self.find_software_identity(&parts.identity_key)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows.into())
    }

    fn find_software_identity(&self, identity_key: &str) -> StoreResult<Option<SoftwareIdentity>> {
        let row = self
            .conn
            .query_row(
                r#"
                SELECT identity_key,
                       display_name,
                       process_name,
                       representative_executable_path,
                       last_opened_at
                FROM software_identities
                WHERE identity_key = ?1
                "#,
                params![identity_key],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                },
            )
            .optional()?;

        row.map(
            |(
                identity_key,
                display_name,
                process_name,
                representative_executable_path,
                last_opened_at,
            )| {
                Ok(SoftwareIdentity {
                    identity_key,
                    display_name,
                    process_name,
                    representative_executable_path,
                    last_opened_at: parse_optional_utc(last_opened_at)?,
                })
            },
        )
        .transpose()
    }

    pub fn software_identity_member_ids(&self, identity_key: &str) -> StoreResult<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT app_id FROM software_identity_members WHERE identity_key = ?1 ORDER BY app_id",
        )?;
        let rows = stmt.query_map(params![identity_key], |row| row.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub fn focused_software_identity_keys(&self) -> StoreResult<Vec<String>> {
        self.software_identity_keys_from_list("focused_software_identities")
    }

    pub fn hidden_software_identity_keys(&self) -> StoreResult<Vec<String>> {
        self.software_identity_keys_from_list("hidden_software_identities")
    }

    fn software_identity_keys_from_list(
        &self,
        table_name: &'static str,
    ) -> StoreResult<Vec<String>> {
        let sql =
            format!("SELECT identity_key FROM {table_name} ORDER BY created_at DESC, rowid DESC");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StoreError::from)
    }

    pub fn software_identity_mark(&self, identity_key: &str) -> StoreResult<&'static str> {
        if self.identity_exists_in_list("hidden_software_identities", identity_key)? {
            return Ok("hidden");
        }
        if self.identity_exists_in_list("focused_software_identities", identity_key)? {
            return Ok("focused");
        }
        Ok("none")
    }

    pub fn add_focused_software_identities(&self, identity_keys: &[String]) -> StoreResult<()> {
        self.add_software_identities_to_list(
            identity_keys,
            "focused_software_identities",
            "hidden_software_identities",
            "hidden",
        )
    }

    pub fn remove_focused_software_identity(&self, identity_key: &str) -> StoreResult<()> {
        self.conn.execute(
            "DELETE FROM focused_software_identities WHERE identity_key = ?1",
            params![identity_key],
        )?;
        Ok(())
    }

    pub fn add_hidden_software_identities(&self, identity_keys: &[String]) -> StoreResult<()> {
        self.add_software_identities_to_list(
            identity_keys,
            "hidden_software_identities",
            "focused_software_identities",
            "focused",
        )
    }

    pub fn remove_hidden_software_identity(&self, identity_key: &str) -> StoreResult<()> {
        self.conn.execute(
            "DELETE FROM hidden_software_identities WHERE identity_key = ?1",
            params![identity_key],
        )?;
        Ok(())
    }

    fn add_software_identities_to_list(
        &self,
        identity_keys: &[String],
        target_table: &'static str,
        conflict_table: &'static str,
        conflicting_list: &'static str,
    ) -> StoreResult<()> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            for identity_key in identity_keys {
                if self.identity_exists_in_list(conflict_table, identity_key)? {
                    return Err(StoreError::SoftwareIdentityListConflict {
                        identity_key: identity_key.clone(),
                        conflicting_list,
                    });
                }
            }

            let sql = format!("INSERT OR IGNORE INTO {target_table} (identity_key) VALUES (?1)");
            for identity_key in identity_keys {
                self.conn.execute(&sql, params![identity_key])?;
            }
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

    fn identity_exists_in_list(
        &self,
        table_name: &'static str,
        identity_key: &str,
    ) -> StoreResult<bool> {
        let sql = format!("SELECT 1 FROM {table_name} WHERE identity_key = ?1 LIMIT 1");
        self.conn
            .query_row(&sql, params![identity_key], |_| Ok(()))
            .optional()
            .map(|row| row.is_some())
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
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            let session_id = self.insert_session_row(app_id, now)?;
            self.upsert_software_identity_for_app_started_at(app_id, now)?;
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

    fn insert_session_row(&self, app_id: i64, now: DateTime<Utc>) -> StoreResult<i64> {
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
            let session_id = self.insert_session_row(app_id, now)?;
            self.upsert_software_identity_for_app_started_at(app_id, now)?;
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
        let duration_seconds = non_negative_seconds(started_at, ended_at);

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

    pub fn app_usage_summary(
        &self,
        day_start_utc: DateTime<Utc>,
        now_utc: DateTime<Utc>,
    ) -> StoreResult<Vec<AppUsageSummary>> {
        self.app_usage_summary_for_date(day_start_utc, now_utc, day_start_utc.date_naive())
    }

    pub fn app_usage_summary_for_date(
        &self,
        day_start_utc: DateTime<Utc>,
        now_utc: DateTime<Utc>,
        usage_date: NaiveDate,
    ) -> StoreResult<Vec<AppUsageSummary>> {
        #[derive(Debug)]
        struct AppSessionRow {
            app_id: i64,
            stored_display_name: String,
            process_name: String,
            executable_path: String,
            is_user_renamed: bool,
            started_at: String,
            ended_at: Option<String>,
            last_heartbeat_at: String,
        }

        #[derive(Debug)]
        struct AppTotals {
            app_id: i64,
            display_name: String,
            process_name: String,
            executable_path: String,
            total_intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>,
            today_intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>,
            active_today_seconds: i64,
            app_ids: HashSet<i64>,
            active_app_ids: HashSet<i64>,
            is_running: bool,
        }

        let active_seconds_by_app_id = self.daily_app_active_seconds(usage_date)?;
        let hidden_identity_keys = self
            .hidden_software_identity_keys()?
            .into_iter()
            .collect::<HashSet<_>>();
        let mut stmt = self.conn.prepare(
            r#"
            SELECT apps.id,
                   apps.display_name,
                   apps.process_name,
                   apps.executable_path,
                   apps.is_user_renamed,
                   usage_sessions.started_at,
                   usage_sessions.ended_at,
                   usage_sessions.last_heartbeat_at
            FROM usage_sessions
            INNER JOIN apps ON apps.id = usage_sessions.app_id
            WHERE apps.is_hidden = 0
            ORDER BY apps.id, usage_sessions.id
            "#,
        )?;
        let mut rows = stmt.query([])?;
        let mut session_rows = Vec::new();

        while let Some(row) = rows.next()? {
            session_rows.push(AppSessionRow {
                app_id: row.get(0)?,
                stored_display_name: row.get(1)?,
                process_name: row.get(2)?,
                executable_path: row.get(3)?,
                is_user_renamed: row.get::<_, i64>(4)? != 0,
                started_at: row.get(5)?,
                ended_at: row.get(6)?,
                last_heartbeat_at: row.get(7)?,
            });
        }
        drop(rows);
        drop(stmt);

        let mut totals: HashMap<String, AppTotals> = HashMap::new();
        let mut identity_keys_by_app_id: HashMap<i64, String> = HashMap::new();

        for row in session_rows {
            let classification = classify_process(&row.process_name, &row.executable_path);
            let display_name = match classification {
                Classification::Hidden => continue,
                Classification::Tracked { display_name: _ } if row.is_user_renamed => {
                    row.stored_display_name
                }
                Classification::Tracked {
                    display_name: classified_display_name,
                } => classified_display_name,
            };

            let identity_key = if let Some(identity_key) = identity_keys_by_app_id.get(&row.app_id)
            {
                identity_key.clone()
            } else {
                let identity = self.upsert_software_identity_for_app(row.app_id)?;
                let identity_key = identity.identity_key;
                identity_keys_by_app_id.insert(row.app_id, identity_key.clone());
                identity_key
            };
            if hidden_identity_keys.contains(&identity_key) {
                continue;
            }

            let started_at = DateTime::parse_from_rfc3339(&row.started_at)?.with_timezone(&Utc);
            let ended_at = row
                .ended_at
                .map(|value| DateTime::parse_from_rfc3339(&value).map(|dt| dt.with_timezone(&Utc)))
                .transpose()?;
            let last_heartbeat_at =
                DateTime::parse_from_rfc3339(&row.last_heartbeat_at)?.with_timezone(&Utc);
            let display_end = ended_at.unwrap_or(last_heartbeat_at);

            let summary_key = display_name.to_lowercase();
            let entry = totals.entry(summary_key).or_insert(AppTotals {
                app_id: row.app_id,
                display_name,
                process_name: row.process_name.clone(),
                executable_path: row.executable_path.clone(),
                total_intervals: Vec::new(),
                today_intervals: Vec::new(),
                active_today_seconds: 0,
                app_ids: HashSet::new(),
                active_app_ids: HashSet::new(),
                is_running: false,
            });
            entry.app_ids.insert(row.app_id);
            if entry.active_app_ids.insert(row.app_id) {
                entry.active_today_seconds += active_seconds_by_app_id
                    .get(&row.app_id)
                    .copied()
                    .unwrap_or(0);
            }
            if should_prefer_executable_path(
                &entry.executable_path,
                &row.executable_path,
                &entry.display_name,
                &row.process_name,
            ) {
                entry.app_id = row.app_id;
                entry.process_name = row.process_name.clone();
                entry.executable_path = row.executable_path.clone();
            }
            entry.total_intervals.push((started_at, display_end));
            let today_start = started_at.max(day_start_utc);
            let today_end = display_end.min(now_utc);
            if today_end > today_start {
                entry.today_intervals.push((today_start, today_end));
            }
            entry.is_running |= ended_at.is_none();
        }

        let mut summaries = totals
            .into_values()
            .map(|mut totals| {
                let total_seconds = merged_interval_seconds(&mut totals.total_intervals);
                let today_seconds = merged_interval_seconds(&mut totals.today_intervals);
                let mut app_ids = totals.app_ids.into_iter().collect::<Vec<_>>();
                app_ids.sort_unstable();
                let executable_path =
                    representative_executable_path(&totals.display_name, &totals.executable_path);

                AppUsageSummary {
                    app_id: totals.app_id,
                    app_ids,
                    display_name: totals.display_name,
                    process_name: totals.process_name,
                    executable_path,
                    total_seconds,
                    today_seconds,
                    active_today_seconds: totals.active_today_seconds,
                    is_running: totals.is_running,
                }
            })
            .collect::<Vec<_>>();

        summaries.sort_by(|left, right| {
            right
                .total_seconds
                .cmp(&left.total_seconds)
                .then_with(|| left.display_name.cmp(&right.display_name))
        });
        Ok(summaries)
    }

    pub fn software_page_rows(
        &self,
        day_start_utc: DateTime<Utc>,
        now_utc: DateTime<Utc>,
        usage_date: NaiveDate,
        _runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
    ) -> StoreResult<SoftwarePageRows> {
        #[derive(Debug)]
        struct SoftwarePageTotals {
            identity_key: String,
            display_name: String,
            process_name: String,
            executable_path: String,
            app_ids: Vec<i64>,
            legacy_total_intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>,
            legacy_today_intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>,
            total_foreground_seconds: i64,
            today_foreground_seconds: i64,
            total_background_seconds: i64,
            today_background_seconds: i64,
            total_focused_seconds: i64,
            today_focused_seconds: i64,
            last_opened_at: Option<DateTime<Utc>>,
            mark: String,
        }

        #[derive(Debug)]
        struct SessionIntervalRow {
            app_id: i64,
            started_at: String,
            ended_at: Option<String>,
            last_heartbeat_at: String,
        }

        let app_rows = {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT id,
                       process_name,
                       executable_path,
                       display_name,
                       normalized_key,
                       is_hidden,
                       is_user_renamed
                FROM apps
                WHERE is_hidden = 0
                ORDER BY id
                "#,
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(AppIdentity {
                    id: row.get(0)?,
                    process_name: row.get(1)?,
                    executable_path: row.get(2)?,
                    display_name: row.get(3)?,
                    normalized_key: row.get(4)?,
                    is_hidden: row.get::<_, i64>(5)? != 0,
                    is_user_renamed: row.get::<_, i64>(6)? != 0,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut identity_key_by_app_id = HashMap::new();
        for app in app_rows {
            if matches!(
                classify_process(&app.process_name, &app.executable_path),
                Classification::Hidden
            ) {
                continue;
            }

            let identity = self.upsert_software_identity_for_app(app.id)?;
            identity_key_by_app_id.insert(app.id, identity.identity_key);
        }

        let mut app_ids_by_identity: HashMap<String, Vec<i64>> = HashMap::new();
        for (app_id, identity_key) in &identity_key_by_app_id {
            app_ids_by_identity
                .entry(identity_key.clone())
                .or_default()
                .push(*app_id);
        }
        for app_ids in app_ids_by_identity.values_mut() {
            app_ids.sort_unstable();
            app_ids.dedup();
        }

        let focused_orders = self.software_identity_list_orders("focused_software_identities")?;
        let hidden_orders = self.software_identity_list_orders("hidden_software_identities")?;
        let today_focus_by_identity = self.software_focus_seconds_for_date(usage_date)?;
        let total_focus_by_identity = self.total_software_focus_seconds_by_identity()?;
        let today_runtime_by_identity = self.software_runtime_seconds_for_date(usage_date)?;
        let total_runtime_by_identity = self.total_software_runtime_seconds_by_identity()?;
        let split_started_at_by_identity_date =
            self.software_runtime_first_recorded_at_by_identity_date()?;
        let identity_rows = {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT identity_key,
                       display_name,
                       process_name,
                       representative_executable_path,
                       last_opened_at
                FROM software_identities
                ORDER BY identity_key
                "#,
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut totals_by_identity = HashMap::new();
        for (
            identity_key,
            display_name,
            process_name,
            representative_executable_path,
            last_opened_at,
        ) in identity_rows
        {
            let Some(app_ids) = app_ids_by_identity.get(&identity_key) else {
                continue;
            };
            let mark = if hidden_orders.contains_key(&identity_key) {
                "hidden"
            } else if focused_orders.contains_key(&identity_key) {
                "focused"
            } else {
                "none"
            };
            let today_runtime = today_runtime_by_identity
                .get(&identity_key)
                .copied()
                .unwrap_or_default();
            let total_runtime = total_runtime_by_identity
                .get(&identity_key)
                .copied()
                .unwrap_or_default();

            totals_by_identity.insert(
                identity_key.clone(),
                SoftwarePageTotals {
                    identity_key: identity_key.clone(),
                    display_name,
                    process_name,
                    executable_path: representative_executable_path,
                    app_ids: app_ids.clone(),
                    legacy_total_intervals: Vec::new(),
                    legacy_today_intervals: Vec::new(),
                    total_foreground_seconds: total_runtime.foreground_seconds,
                    today_foreground_seconds: today_runtime.foreground_seconds,
                    total_background_seconds: total_runtime.background_seconds,
                    today_background_seconds: today_runtime.background_seconds,
                    total_focused_seconds: total_focus_by_identity
                        .get(&identity_key)
                        .copied()
                        .unwrap_or(0),
                    today_focused_seconds: today_focus_by_identity
                        .get(&identity_key)
                        .copied()
                        .unwrap_or(0),
                    last_opened_at: parse_optional_utc(last_opened_at)?,
                    mark: mark.to_string(),
                },
            );
        }

        let session_rows = {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT app_id,
                       started_at,
                       ended_at,
                       last_heartbeat_at
                FROM usage_sessions
                ORDER BY app_id, id
                "#,
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(SessionIntervalRow {
                    app_id: row.get(0)?,
                    started_at: row.get(1)?,
                    ended_at: row.get(2)?,
                    last_heartbeat_at: row.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        for row in session_rows {
            let Some(identity_key) = identity_key_by_app_id.get(&row.app_id) else {
                continue;
            };
            let Some(totals) = totals_by_identity.get_mut(identity_key) else {
                continue;
            };

            let started_at = DateTime::parse_from_rfc3339(&row.started_at)?.with_timezone(&Utc);
            let ended_at = row
                .ended_at
                .map(|value| DateTime::parse_from_rfc3339(&value).map(|dt| dt.with_timezone(&Utc)))
                .transpose()?;
            let last_heartbeat_at =
                DateTime::parse_from_rfc3339(&row.last_heartbeat_at)?.with_timezone(&Utc);
            let display_end = ended_at.unwrap_or(last_heartbeat_at);
            let session_date = started_at.with_timezone(&Local).date_naive();

            totals.last_opened_at = latest_optional_datetime(totals.last_opened_at, started_at);
            let split_started_at = split_started_at_by_identity_date
                .get(identity_key)
                .and_then(|dates| dates.get(&session_date));
            let is_split_runtime_session =
                split_started_at.is_some_and(|first_recorded_at| started_at >= *first_recorded_at);
            if !is_split_runtime_session {
                totals
                    .legacy_total_intervals
                    .push((started_at, display_end));
                let today_start = started_at.max(day_start_utc);
                let today_end = display_end.min(now_utc);
                if today_end > today_start {
                    totals.legacy_today_intervals.push((today_start, today_end));
                }
            }
        }

        let mut discovered = totals_by_identity
            .into_values()
            .map(|mut totals| {
                let legacy_runtime = SoftwareLegacyRuntimeSeconds {
                    total_seconds: merged_interval_seconds(&mut totals.legacy_total_intervals),
                    today_seconds: merged_interval_seconds(&mut totals.legacy_today_intervals),
                };
                let total_foreground_seconds =
                    totals.total_foreground_seconds + legacy_runtime.total_seconds;
                let today_foreground_seconds =
                    totals.today_foreground_seconds + legacy_runtime.today_seconds;
                let total_background_seconds = totals.total_background_seconds;
                let today_background_seconds = totals.today_background_seconds;

                SoftwarePageRow {
                    identity_key: totals.identity_key,
                    display_name: totals.display_name,
                    process_name: totals.process_name,
                    executable_path: totals.executable_path,
                    app_ids: totals.app_ids,
                    total_runtime_seconds: total_foreground_seconds + total_background_seconds,
                    today_runtime_seconds: today_foreground_seconds + today_background_seconds,
                    total_foreground_seconds,
                    today_foreground_seconds,
                    total_background_seconds,
                    today_background_seconds,
                    total_focused_seconds: totals.total_focused_seconds,
                    today_focused_seconds: totals.today_focused_seconds,
                    last_opened_at: totals.last_opened_at,
                    mark: totals.mark,
                }
            })
            .collect::<Vec<_>>();

        discovered.sort_by(compare_last_opened_desc);

        let mut focused = discovered
            .iter()
            .filter(|row| row.mark == "focused")
            .cloned()
            .collect::<Vec<_>>();
        focused.sort_by(|left, right| {
            compare_list_order_desc(&focused_orders, left, right)
                .then_with(|| compare_last_opened_desc(left, right))
        });

        let mut hidden = discovered
            .iter()
            .filter(|row| row.mark == "hidden")
            .cloned()
            .collect::<Vec<_>>();
        hidden.sort_by(|left, right| {
            compare_list_order_desc(&hidden_orders, left, right)
                .then_with(|| compare_last_opened_desc(left, right))
        });

        Ok(SoftwarePageRows {
            focused,
            hidden,
            discovered,
        })
    }

    fn daily_app_active_seconds(&self, date: NaiveDate) -> StoreResult<HashMap<i64, i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT app_id, active_seconds FROM daily_app_usage WHERE usage_date = ?1")?;
        let mut rows = stmt.query(params![date.to_string()])?;
        let mut active_seconds_by_app_id = HashMap::new();

        while let Some(row) = rows.next()? {
            active_seconds_by_app_id.insert(row.get::<_, i64>(0)?, row.get::<_, i64>(1)?);
        }

        Ok(active_seconds_by_app_id)
    }

    pub fn increment_daily_app_usage(
        &self,
        date: NaiveDate,
        app_id: i64,
        runtime_seconds: i64,
        active_seconds: i64,
    ) -> StoreResult<()> {
        self.conn.execute(
            r#"
            INSERT INTO daily_app_usage (
                usage_date,
                app_id,
                runtime_seconds,
                active_seconds
            )
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(usage_date, app_id) DO UPDATE SET
                runtime_seconds = runtime_seconds + excluded.runtime_seconds,
                active_seconds = active_seconds + excluded.active_seconds
            "#,
            params![
                date.to_string(),
                app_id,
                runtime_seconds.max(0),
                active_seconds.max(0)
            ],
        )?;
        Ok(())
    }

    pub fn increment_daily_software_focus_usage(
        &self,
        date: NaiveDate,
        identity_key: &str,
        focused_seconds: i64,
    ) -> StoreResult<()> {
        self.conn.execute(
            r#"
            INSERT INTO daily_software_focus_usage (
                usage_date,
                identity_key,
                focused_seconds
            )
            VALUES (?1, ?2, ?3)
            ON CONFLICT(usage_date, identity_key) DO UPDATE SET
                focused_seconds = focused_seconds + excluded.focused_seconds
            "#,
            params![date.to_string(), identity_key, focused_seconds.max(0)],
        )?;
        Ok(())
    }

    pub fn increment_daily_software_runtime_usage(
        &self,
        date: NaiveDate,
        identity_key: &str,
        foreground_seconds: i64,
        background_seconds: i64,
        recorded_at: DateTime<Utc>,
    ) -> StoreResult<()> {
        let recorded_at = recorded_at.to_rfc3339();
        self.conn.execute(
            r#"
            INSERT INTO daily_software_runtime_usage (
                usage_date,
                identity_key,
                foreground_seconds,
                background_seconds,
                first_recorded_at,
                last_recorded_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            ON CONFLICT(usage_date, identity_key) DO UPDATE SET
                foreground_seconds = foreground_seconds + excluded.foreground_seconds,
                background_seconds = background_seconds + excluded.background_seconds,
                first_recorded_at = CASE
                    WHEN daily_software_runtime_usage.first_recorded_at < excluded.first_recorded_at
                    THEN daily_software_runtime_usage.first_recorded_at
                    ELSE excluded.first_recorded_at
                END,
                last_recorded_at = CASE
                    WHEN daily_software_runtime_usage.last_recorded_at > excluded.last_recorded_at
                    THEN daily_software_runtime_usage.last_recorded_at
                    ELSE excluded.last_recorded_at
                END
            "#,
            params![
                date.to_string(),
                identity_key,
                foreground_seconds.max(0),
                background_seconds.max(0),
                recorded_at,
            ],
        )?;
        Ok(())
    }

    pub fn software_focus_seconds_for_date(
        &self,
        date: NaiveDate,
    ) -> StoreResult<HashMap<String, i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT identity_key, focused_seconds FROM daily_software_focus_usage WHERE usage_date = ?1",
        )?;
        let mut rows = stmt.query(params![date.to_string()])?;
        let mut seconds = HashMap::new();

        while let Some(row) = rows.next()? {
            seconds.insert(row.get::<_, String>(0)?, row.get::<_, i64>(1)?);
        }

        Ok(seconds)
    }

    fn software_runtime_seconds_for_date(
        &self,
        date: NaiveDate,
    ) -> StoreResult<HashMap<String, SoftwareRuntimeSeconds>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT identity_key, foreground_seconds, background_seconds
            FROM daily_software_runtime_usage
            WHERE usage_date = ?1
            "#,
        )?;
        let mut rows = stmt.query(params![date.to_string()])?;
        let mut seconds = HashMap::new();

        while let Some(row) = rows.next()? {
            seconds.insert(
                row.get::<_, String>(0)?,
                SoftwareRuntimeSeconds {
                    foreground_seconds: row.get(1)?,
                    background_seconds: row.get(2)?,
                },
            );
        }

        Ok(seconds)
    }

    fn total_software_focus_seconds_by_identity(&self) -> StoreResult<HashMap<String, i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT identity_key, SUM(focused_seconds) FROM daily_software_focus_usage GROUP BY identity_key",
        )?;
        let mut rows = stmt.query([])?;
        let mut seconds = HashMap::new();

        while let Some(row) = rows.next()? {
            seconds.insert(row.get::<_, String>(0)?, row.get::<_, i64>(1)?);
        }

        Ok(seconds)
    }

    fn total_software_runtime_seconds_by_identity(
        &self,
    ) -> StoreResult<HashMap<String, SoftwareRuntimeSeconds>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT identity_key, SUM(foreground_seconds), SUM(background_seconds)
            FROM daily_software_runtime_usage
            GROUP BY identity_key
            "#,
        )?;
        let mut rows = stmt.query([])?;
        let mut seconds = HashMap::new();

        while let Some(row) = rows.next()? {
            seconds.insert(
                row.get::<_, String>(0)?,
                SoftwareRuntimeSeconds {
                    foreground_seconds: row.get(1)?,
                    background_seconds: row.get(2)?,
                },
            );
        }

        Ok(seconds)
    }

    fn software_runtime_first_recorded_at_by_identity_date(
        &self,
    ) -> StoreResult<HashMap<String, HashMap<NaiveDate, DateTime<Utc>>>> {
        let mut stmt = self.conn.prepare(
            "SELECT identity_key, usage_date, first_recorded_at FROM daily_software_runtime_usage",
        )?;
        let mut rows = stmt.query([])?;
        let mut first_recorded_at_by_identity_date = HashMap::new();

        while let Some(row) = rows.next()? {
            let identity_key = row.get::<_, String>(0)?;
            let usage_date = NaiveDate::parse_from_str(&row.get::<_, String>(1)?, "%Y-%m-%d")?;
            let first_recorded_at =
                DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)?.with_timezone(&Utc);
            first_recorded_at_by_identity_date
                .entry(identity_key)
                .or_insert_with(HashMap::new)
                .insert(usage_date, first_recorded_at);
        }

        Ok(first_recorded_at_by_identity_date)
    }

    fn software_identity_list_orders(
        &self,
        table_name: &'static str,
    ) -> StoreResult<HashMap<String, SoftwareIdentityListOrder>> {
        let sql = format!("SELECT identity_key, created_at, rowid FROM {table_name}");
        let mut stmt = self.conn.prepare(&sql)?;
        let mut rows = stmt.query([])?;
        let mut orders = HashMap::new();

        while let Some(row) = rows.next()? {
            orders.insert(
                row.get::<_, String>(0)?,
                SoftwareIdentityListOrder {
                    created_at: row.get(1)?,
                    rowid: row.get(2)?,
                },
            );
        }

        Ok(orders)
    }

    pub fn increment_daily_system_usage(
        &self,
        date: NaiveDate,
        recorded_seconds: i64,
        active_seconds: i64,
        tracker_uptime_seconds: i64,
    ) -> StoreResult<()> {
        self.conn.execute(
            r#"
            INSERT INTO daily_system_usage (
                usage_date,
                recorded_seconds,
                active_seconds,
                tracker_uptime_seconds
            )
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(usage_date) DO UPDATE SET
                recorded_seconds = recorded_seconds + excluded.recorded_seconds,
                active_seconds = active_seconds + excluded.active_seconds,
                tracker_uptime_seconds = tracker_uptime_seconds + excluded.tracker_uptime_seconds
            "#,
            params![
                date.to_string(),
                recorded_seconds.max(0),
                active_seconds.max(0),
                tracker_uptime_seconds.max(0)
            ],
        )?;
        Ok(())
    }

    pub fn daily_system_usage(&self, date: NaiveDate) -> StoreResult<Option<DailySystemUsage>> {
        self.conn
            .query_row(
                "SELECT usage_date, recorded_seconds, active_seconds, tracker_uptime_seconds
                 FROM daily_system_usage WHERE usage_date = ?1",
                params![date.to_string()],
                |row| {
                    let usage_date: String = row.get(0)?;
                    Ok(DailySystemUsage {
                        date: NaiveDate::parse_from_str(&usage_date, "%Y-%m-%d").map_err(
                            |error| {
                                rusqlite::Error::FromSqlConversionFailure(
                                    0,
                                    rusqlite::types::Type::Text,
                                    Box::new(error),
                                )
                            },
                        )?,
                        recorded_seconds: row.get(1)?,
                        active_seconds: row.get(2)?,
                        tracker_uptime_seconds: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(StoreError::from)
    }

    pub fn recover_open_sessions(&self) -> StoreResult<usize> {
        let mut stmt = self.conn.prepare(
            "SELECT id, app_id, started_at, last_heartbeat_at
             FROM usage_sessions WHERE ended_at IS NULL ORDER BY id",
        )?;
        let mut rows = stmt.query([])?;
        let mut open_sessions = Vec::new();

        while let Some(row) = rows.next()? {
            let started_at: String = row.get(2)?;
            let last_heartbeat_at: String = row.get(3)?;
            open_sessions.push((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                DateTime::parse_from_rfc3339(&started_at)?.with_timezone(&Utc),
                DateTime::parse_from_rfc3339(&last_heartbeat_at)?.with_timezone(&Utc),
            ));
        }

        if open_sessions.is_empty() {
            return Ok(0);
        }

        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| {
            for (session_id, app_id, started_at, last_heartbeat_at) in &open_sessions {
                self.conn.execute(
                    r#"
                    UPDATE usage_sessions
                    SET ended_at = ?1,
                        duration_seconds = ?2,
                        close_reason = 'tracker_restarted',
                        recovered = 1
                    WHERE id = ?3 AND ended_at IS NULL
                    "#,
                    params![
                        last_heartbeat_at.to_rfc3339(),
                        non_negative_seconds(*started_at, *last_heartbeat_at),
                        session_id
                    ],
                )?;
                self.insert_run_event(Some(*app_id), RunEventKind::SessionRecovered, None)?;
            }
            Ok(open_sessions.len())
        })();

        match result {
            Ok(count) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(count)
            }
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }

    pub fn count_run_events(&self, event_kind: &str) -> StoreResult<i64> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM run_events WHERE event_kind = ?1",
                params![event_kind],
                |row| row.get(0),
            )
            .map_err(StoreError::from)
    }

    pub fn setting_value(&self, key: &str) -> StoreResult<Option<String>> {
        self.conn
            .query_row(
                "SELECT setting_value FROM app_settings WHERE setting_key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(StoreError::from)
    }

    pub fn set_setting_value(&self, key: &str, value: &str) -> StoreResult<()> {
        self.conn.execute(
            r#"
            INSERT INTO app_settings (setting_key, setting_value, updated_at)
            VALUES (?1, ?2, CURRENT_TIMESTAMP)
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value = excluded.setting_value,
                updated_at = CURRENT_TIMESTAMP
            "#,
            params![key, value],
        )?;
        Ok(())
    }

    pub fn remove_setting(&self, key: &str) -> StoreResult<()> {
        self.conn.execute(
            "DELETE FROM app_settings WHERE setting_key = ?1",
            params![key],
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct SoftwareIdentityListOrder {
    created_at: String,
    rowid: i64,
}

struct SoftwareIdentityParts {
    identity_key: String,
    display_name: String,
    process_name: String,
    representative_executable_path: String,
}

fn compare_last_opened_desc(left: &SoftwarePageRow, right: &SoftwarePageRow) -> Ordering {
    let order = match (&left.last_opened_at, &right.last_opened_at) {
        (Some(left_opened_at), Some(right_opened_at)) => right_opened_at.cmp(left_opened_at),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    };

    order
        .then_with(|| left.display_name.cmp(&right.display_name))
        .then_with(|| left.identity_key.cmp(&right.identity_key))
}

fn compare_list_order_desc(
    orders: &HashMap<String, SoftwareIdentityListOrder>,
    left: &SoftwarePageRow,
    right: &SoftwarePageRow,
) -> Ordering {
    let order = match (
        orders.get(&left.identity_key),
        orders.get(&right.identity_key),
    ) {
        (Some(left_order), Some(right_order)) => right_order
            .created_at
            .cmp(&left_order.created_at)
            .then_with(|| right_order.rowid.cmp(&left_order.rowid)),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    };

    order
        .then_with(|| left.display_name.cmp(&right.display_name))
        .then_with(|| left.identity_key.cmp(&right.identity_key))
}

fn software_identity_parts_for_app(app: &AppIdentity) -> SoftwareIdentityParts {
    let display_name = display_name_for_app(app);
    let identity_key = if is_wps_suite_component(&app.process_name) {
        "known:wps-office".to_string()
    } else {
        format!("app:{}", app.normalized_key)
    };
    let representative_executable_path =
        representative_executable_path(&display_name, &app.executable_path);

    SoftwareIdentityParts {
        identity_key,
        display_name,
        process_name: app.process_name.clone(),
        representative_executable_path,
    }
}

fn display_name_for_app(app: &AppIdentity) -> String {
    match classify_process(&app.process_name, &app.executable_path) {
        Classification::Hidden => app.display_name.clone(),
        Classification::Tracked { display_name: _ } if app.is_user_renamed => {
            app.display_name.clone()
        }
        Classification::Tracked { display_name } => display_name,
    }
}

fn is_wps_suite_component(process_name: &str) -> bool {
    matches!(
        process_name.trim().to_lowercase().as_str(),
        "wps.exe" | "et.exe" | "wpp.exe" | "wpspdf.exe"
    )
}

fn parse_optional_utc(value: Option<String>) -> Result<Option<DateTime<Utc>>, chrono::ParseError> {
    value
        .map(|value| DateTime::parse_from_rfc3339(&value).map(|dt| dt.with_timezone(&Utc)))
        .transpose()
}

fn latest_optional_datetime(
    current: Option<DateTime<Utc>>,
    candidate: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    Some(current.map_or(candidate, |value| value.max(candidate)))
}

pub fn normalize_identity_key(executable_path: &str, process_name: &str) -> String {
    let path = executable_path.trim().replace('/', "\\").to_lowercase();
    if path.is_empty() {
        process_name.trim().to_lowercase()
    } else {
        path
    }
}

fn should_prefer_executable_path(
    current_path: &str,
    candidate_path: &str,
    display_name: &str,
    process_name: &str,
) -> bool {
    if candidate_path.trim().is_empty() {
        return false;
    }
    if current_path.trim().is_empty() {
        return true;
    }

    executable_path_score(candidate_path, display_name, process_name)
        > executable_path_score(current_path, display_name, process_name)
}

fn executable_path_score(path: &str, display_name: &str, process_name: &str) -> i32 {
    let normalized = path.trim().replace('/', "\\").to_lowercase();
    if normalized.is_empty() {
        return i32::MIN;
    }

    let file_name = normalized.rsplit('\\').next().unwrap_or_default();
    let file_stem = file_name.strip_suffix(".exe").unwrap_or(file_name);
    let process_name = process_name.trim().to_lowercase();
    let process_stem = process_name.strip_suffix(".exe").unwrap_or(&process_name);
    let display_stem = display_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();

    let mut score = 0;
    if Path::new(path.trim()).exists() {
        score += 500;
    }
    if normalized.contains("\\windowsapps\\")
        || normalized.contains("\\program files\\")
        || normalized.contains("\\program files (x86)\\")
    {
        score += 100;
    }
    if normalized.contains("\\appdata\\local\\programs\\") {
        score += 90;
    } else if normalized.contains("\\appdata\\local\\")
        || normalized.contains("\\appdata\\roaming\\")
    {
        score -= 20;
    }
    if normalized.contains("\\app\\") {
        score += 15;
    }
    if normalized.contains("\\bin\\") {
        score -= 40;
    }
    if normalized.contains("\\resources\\") {
        score -= 30;
    }
    if !display_stem.is_empty() && file_stem == display_stem {
        score += 25;
    }
    if !process_stem.is_empty() && file_stem == process_stem {
        score += 10;
    }

    score
}

fn representative_executable_path(display_name: &str, executable_path: &str) -> String {
    let path = executable_path.trim().replace('/', "\\");
    if !display_name.eq_ignore_ascii_case("WPS Office") {
        return path;
    }

    let lower_path = path.to_lowercase();
    for component in [r"\et.exe", r"\wpp.exe", r"\wpspdf.exe"] {
        if lower_path.ends_with(component) {
            let directory = &path[..path.len() - component.len()];
            return format!(r"{directory}\wps.exe");
        }
    }

    path
}

fn non_negative_seconds(start: DateTime<Utc>, end: DateTime<Utc>) -> i64 {
    end.signed_duration_since(start).num_seconds().max(0)
}

fn merged_interval_seconds(intervals: &mut [(DateTime<Utc>, DateTime<Utc>)]) -> i64 {
    if intervals.is_empty() {
        return 0;
    }

    intervals.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let mut total = 0;
    let mut current_start = intervals[0].0;
    let mut current_end = intervals[0].1;

    for (start, end) in intervals.iter().skip(1).copied() {
        if end <= start {
            continue;
        }

        if start <= current_end {
            current_end = current_end.max(end);
        } else {
            total += non_negative_seconds(current_start, current_end);
            current_start = start;
            current_end = end;
        }
    }

    total + non_negative_seconds(current_start, current_end)
}
