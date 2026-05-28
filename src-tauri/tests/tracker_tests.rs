use chrono::{TimeZone, Utc};
use global_software_timer_lib::activity::ActivitySource;
use global_software_timer_lib::app_state::AppState;
use global_software_timer_lib::process_source::{ProcessSnapshot, ProcessSource};
use global_software_timer_lib::storage::Store;
use global_software_timer_lib::tracker::{run_tracker_tick, Tracker};
use std::time::Duration;
use tempfile::NamedTempFile;

struct FakeProcessSource {
    snapshots: Vec<Vec<ProcessSnapshot>>,
    index: usize,
}

impl FakeProcessSource {
    fn new(snapshots: Vec<Vec<ProcessSnapshot>>) -> Self {
        Self {
            snapshots,
            index: 0,
        }
    }
}

impl ProcessSource for FakeProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        let current = self.snapshots.get(self.index).cloned().unwrap_or_default();
        self.index += 1;
        current
    }
}

struct FakeActivitySource {
    idle_duration: Duration,
}

impl ActivitySource for FakeActivitySource {
    fn idle_duration(&self) -> Duration {
        self.idle_duration
    }
}

fn code_process() -> ProcessSnapshot {
    ProcessSnapshot {
        pid: 42,
        process_name: "Code.exe".to_string(),
        executable_path: r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe"
            .to_string(),
    }
}

#[test]
fn tracker_creates_and_closes_sessions_from_process_changes() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");

    let source = FakeProcessSource::new(vec![vec![code_process()], vec![code_process()], vec![]]);
    let mut tracker = Tracker::new(store, source);

    tracker.scan_once().expect("first scan starts session");
    tracker.scan_once().expect("second scan heartbeats session");
    tracker.scan_once().expect("third scan closes session");

    let sessions = tracker.store().all_sessions().expect("sessions");
    assert_eq!(sessions.len(), 1);
    assert!(sessions[0].ended_at.is_some());
    assert_eq!(sessions[0].close_reason.as_deref(), Some("process_closed"));
}

#[test]
fn tracker_deduplicates_snapshots_for_the_same_normalized_key() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");

    let source = FakeProcessSource::new(vec![vec![code_process(), code_process()], vec![]]);
    let mut tracker = Tracker::new(store, source);

    tracker.scan_once().expect("scan starts one session");
    tracker.scan_once().expect("scan closes one session");

    let sessions = tracker.store().all_sessions().expect("sessions");
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].close_reason.as_deref(), Some("process_closed"));
}

#[test]
fn close_session_stores_exact_duration_seconds() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            code_process().executable_path.as_str(),
            "Visual Studio Code",
        )
        .expect("app");
    let started_at = Utc.with_ymd_and_hms(2026, 5, 28, 10, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 28, 10, 1, 30).unwrap();
    let session_id = store.start_session(app.id, started_at).expect("start");

    store
        .close_session(session_id, ended_at, "process_closed", false)
        .expect("close");

    let sessions = store.all_sessions().expect("sessions");
    assert_eq!(sessions[0].duration_seconds, 90);
}

#[test]
fn stale_session_updates_return_errors() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let app = store
        .upsert_app(
            "Code.exe",
            code_process().executable_path.as_str(),
            "Visual Studio Code",
        )
        .expect("app");
    let started_at = Utc.with_ymd_and_hms(2026, 5, 28, 10, 0, 0).unwrap();
    let ended_at = Utc.with_ymd_and_hms(2026, 5, 28, 10, 1, 0).unwrap();
    let session_id = store.start_session(app.id, started_at).expect("start");
    store
        .close_session(session_id, ended_at, "process_closed", false)
        .expect("close");

    assert!(store.heartbeat_session(session_id, ended_at).is_err());
    assert!(store
        .close_session(session_id, ended_at, "process_closed", false)
        .is_err());
}

#[test]
fn tracker_tick_scans_and_records_daily_active_time() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(60),
    };
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();

    run_tracker_tick(
        &mut tracker,
        &activity,
        now.date_naive(),
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .expect("tick");

    let usage = tracker
        .store()
        .daily_system_usage(now.date_naive())
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(usage.recorded_seconds, 5);
    assert_eq!(usage.active_seconds, 5);
    assert_eq!(usage.tracker_uptime_seconds, 5);
    assert_eq!(tracker.store().all_sessions().expect("sessions").len(), 1);
}

#[test]
fn tracker_tick_caps_long_active_duration() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(1),
    };
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();

    run_tracker_tick(
        &mut tracker,
        &activity,
        now.date_naive(),
        Duration::from_secs(2 * 60 * 60),
        Duration::from_secs(300),
    )
    .expect("tick");

    let usage = tracker
        .store()
        .daily_system_usage(now.date_naive())
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(usage.recorded_seconds, 60);
    assert_eq!(usage.active_seconds, 60);
    assert_eq!(usage.tracker_uptime_seconds, 60);
}

#[test]
fn tracker_tick_caps_long_inactive_recorded_duration() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(10 * 60),
    };
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();

    run_tracker_tick(
        &mut tracker,
        &activity,
        now.date_naive(),
        Duration::from_secs(2 * 60 * 60),
        Duration::from_secs(300),
    )
    .expect("tick");

    let usage = tracker
        .store()
        .daily_system_usage(now.date_naive())
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(usage.recorded_seconds, 60);
    assert_eq!(usage.active_seconds, 0);
    assert_eq!(usage.tracker_uptime_seconds, 60);
}

#[test]
fn app_state_startup_recovers_open_sessions_at_last_heartbeat() {
    let db_file = NamedTempFile::new().expect("temp db");
    let db_path = db_file.path().to_path_buf();
    {
        let store = Store::open(&db_path).expect("open");
        store.migrate().expect("migrate");
        let app = store
            .upsert_app(
                "Code.exe",
                code_process().executable_path.as_str(),
                "Visual Studio Code",
            )
            .expect("app");
        let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
        let heartbeat_at = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 45).unwrap();
        let session_id = store.start_session(app.id, started_at).expect("start");
        store
            .heartbeat_session(session_id, heartbeat_at)
            .expect("heartbeat");
    }

    let state = AppState::new(db_path).expect("state");
    let tracker = state.tracker.lock().expect("tracker");
    let sessions = tracker.store().all_sessions().expect("sessions");

    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].ended_at, Some(sessions[0].last_heartbeat_at));
    assert_eq!(sessions[0].duration_seconds, 45);
    assert_eq!(
        sessions[0].close_reason.as_deref(),
        Some("tracker_restarted")
    );
    assert!(sessions[0].recovered);
    assert_eq!(
        tracker
            .store()
            .count_run_events("session_recovered")
            .expect("recovered events"),
        1
    );
}
