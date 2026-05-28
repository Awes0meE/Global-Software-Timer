use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppIdentity {
    pub id: i64,
    pub process_name: String,
    pub executable_path: String,
    pub display_name: String,
    pub normalized_key: String,
    pub is_hidden: bool,
    pub is_user_renamed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunEventKind {
    TrackerStarted,
    TrackerStopped,
    AppSeenStarted,
    AppSeenStopped,
    AppHeartbeat,
    SessionRecovered,
    ScanError,
    DatabaseError,
}

impl RunEventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TrackerStarted => "tracker_started",
            Self::TrackerStopped => "tracker_stopped",
            Self::AppSeenStarted => "app_seen_started",
            Self::AppSeenStopped => "app_seen_stopped",
            Self::AppHeartbeat => "app_heartbeat",
            Self::SessionRecovered => "session_recovered",
            Self::ScanError => "scan_error",
            Self::DatabaseError => "database_error",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageSession {
    pub id: i64,
    pub app_id: i64,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub last_heartbeat_at: DateTime<Utc>,
    pub duration_seconds: i64,
    pub close_reason: Option<String>,
    pub recovered: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyAppUsage {
    pub date: NaiveDate,
    pub app_id: i64,
    pub runtime_seconds: i64,
    pub active_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailySystemUsage {
    pub date: NaiveDate,
    pub recorded_seconds: i64,
    pub active_seconds: i64,
    pub tracker_uptime_seconds: i64,
}
