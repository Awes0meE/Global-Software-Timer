use crate::classifier::{classify_process, Classification};
use crate::domain::{AppIdentity, AppUsageSummary, DailySystemUsage, RunEventKind, UsageSession};
use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
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

            CREATE TABLE IF NOT EXISTS app_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        struct AppTotals {
            app_id: i64,
            display_name: String,
            process_name: String,
            executable_path: String,
            total_intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>,
            today_intervals: Vec<(DateTime<Utc>, DateTime<Utc>)>,
            active_today_seconds: i64,
            active_app_ids: HashSet<i64>,
            is_running: bool,
        }

        let active_seconds_by_app_id = self.daily_app_active_seconds(usage_date)?;
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
        let mut totals: HashMap<String, AppTotals> = HashMap::new();

        while let Some(row) = rows.next()? {
            let app_id: i64 = row.get(0)?;
            let stored_display_name: String = row.get(1)?;
            let process_name: String = row.get(2)?;
            let executable_path: String = row.get(3)?;
            let is_user_renamed = row.get::<_, i64>(4)? != 0;
            let classification = classify_process(&process_name, &executable_path);
            let display_name = match classification {
                Classification::Hidden => continue,
                Classification::Tracked { display_name: _ } if is_user_renamed => {
                    stored_display_name
                }
                Classification::Tracked {
                    display_name: classified_display_name,
                } => classified_display_name,
            };

            let started_at: String = row.get(5)?;
            let ended_at: Option<String> = row.get(6)?;
            let last_heartbeat_at: String = row.get(7)?;
            let started_at = DateTime::parse_from_rfc3339(&started_at)?.with_timezone(&Utc);
            let ended_at = ended_at
                .map(|value| DateTime::parse_from_rfc3339(&value).map(|dt| dt.with_timezone(&Utc)))
                .transpose()?;
            let last_heartbeat_at =
                DateTime::parse_from_rfc3339(&last_heartbeat_at)?.with_timezone(&Utc);
            let display_end = ended_at.unwrap_or(last_heartbeat_at);

            let summary_key = display_name.to_lowercase();
            let entry = totals.entry(summary_key).or_insert(AppTotals {
                app_id,
                display_name,
                process_name: process_name.clone(),
                executable_path: executable_path.clone(),
                total_intervals: Vec::new(),
                today_intervals: Vec::new(),
                active_today_seconds: 0,
                active_app_ids: HashSet::new(),
                is_running: false,
            });
            if entry.active_app_ids.insert(app_id) {
                entry.active_today_seconds +=
                    active_seconds_by_app_id.get(&app_id).copied().unwrap_or(0);
            }
            if should_prefer_executable_path(
                &entry.executable_path,
                &executable_path,
                &entry.display_name,
                &process_name,
            ) {
                entry.app_id = app_id;
                entry.process_name = process_name.clone();
                entry.executable_path = executable_path.clone();
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
            .into_iter()
            .map(|(_, mut totals)| {
                let total_seconds = merged_interval_seconds(&mut totals.total_intervals);
                let today_seconds = merged_interval_seconds(&mut totals.today_intervals);

                AppUsageSummary {
                    app_id: totals.app_id,
                    display_name: totals.display_name,
                    process_name: totals.process_name,
                    executable_path: totals.executable_path,
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
