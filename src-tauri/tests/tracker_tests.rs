use chrono::{TimeZone, Utc};
use global_software_timer_lib::activity::ActivitySource;
use global_software_timer_lib::app_state::AppState;
use global_software_timer_lib::domain::AppRuntimeStatus;
use global_software_timer_lib::foreground::ForegroundWindowSource;
use global_software_timer_lib::process_source::{ProcessSnapshot, ProcessSource};
use global_software_timer_lib::storage::Store;
use global_software_timer_lib::tracker::{
    run_tracker_tick, run_tracker_tick_with_foreground, Tracker,
};
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

struct FakeForegroundWindowSource {
    pid: Option<u32>,
}

impl ForegroundWindowSource for FakeForegroundWindowSource {
    fn foreground_pid(&self) -> Option<u32> {
        self.pid
    }
}

fn code_process() -> ProcessSnapshot {
    ProcessSnapshot {
        pid: 42,
        process_name: "Code.exe".to_string(),
        executable_path: r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe"
            .to_string(),
        is_background_helper: false,
        has_visible_window: true,
    }
}

fn edge_process(pid: u32, is_background_helper: bool, has_visible_window: bool) -> ProcessSnapshot {
    ProcessSnapshot {
        pid,
        process_name: "msedge.exe".to_string(),
        executable_path: r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
            .to_string(),
        is_background_helper,
        has_visible_window,
    }
}

#[test]
fn tracker_tick_records_foreground_active_time_for_matching_process() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(60),
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();

    run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        now.date_naive(),
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .expect("tick");

    let rows = tracker
        .store()
        .app_usage_summary_for_date(now, now, now.date_naive())
        .expect("usage summary");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].active_today_seconds, 5);
}

#[test]
fn tracker_records_software_focus_time_even_when_machine_is_idle() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(3600),
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let now = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();

    run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        now.date_naive(),
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .expect("tick");

    let identity = tracker
        .store()
        .upsert_software_identity_for_app(
            tracker.store().all_sessions().expect("sessions")[0].app_id,
        )
        .expect("identity");
    assert_eq!(
        tracker
            .store()
            .software_focus_seconds_for_date(now.date_naive())
            .expect("focus seconds")
            .get(&identity.identity_key)
            .copied(),
        Some(5)
    );

    let overview_usage = tracker
        .store()
        .daily_system_usage(now.date_naive())
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(overview_usage.active_seconds, 0);
}

#[test]
fn tracker_persists_overview_usage_when_software_focus_write_fails() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    let corrupt_conn = rusqlite::Connection::open(db_file.path()).expect("open corrupt conn");
    corrupt_conn
        .execute("DROP TABLE daily_software_focus_usage", [])
        .expect("drop focus usage table");
    drop(corrupt_conn);

    let source = FakeProcessSource::new(vec![vec![code_process()]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(60),
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let now = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();

    let result = run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        now.date_naive(),
        Duration::from_secs(5),
        Duration::from_secs(300),
    );

    assert!(result.is_err());
    let overview_usage = tracker
        .store()
        .daily_system_usage(now.date_naive())
        .expect("daily usage")
        .expect("daily usage row");
    assert_eq!(overview_usage.recorded_seconds, 5);
    assert_eq!(overview_usage.active_seconds, 5);
    assert_eq!(overview_usage.tracker_uptime_seconds, 5);

    let rows = tracker
        .store()
        .app_usage_summary_for_date(now, now, now.date_naive())
        .expect("usage summary");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].active_today_seconds, 5);
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
fn tracker_closes_browser_session_when_only_background_helpers_remain() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");

    let source = FakeProcessSource::new(vec![
        vec![
            edge_process(100, false, true),
            edge_process(101, true, false),
        ],
        vec![edge_process(101, true, false)],
    ]);
    let mut tracker = Tracker::new(store, source);

    tracker.scan_once().expect("first scan starts session");
    tracker
        .scan_once()
        .expect("second scan closes session without visible process");

    let sessions = tracker.store().all_sessions().expect("sessions");
    assert_eq!(sessions.len(), 1);
    assert!(sessions[0].ended_at.is_some());
    assert_eq!(sessions[0].close_reason.as_deref(), Some("process_closed"));
}

#[test]
fn tracker_closes_session_when_process_remains_without_visible_windows() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");

    let source = FakeProcessSource::new(vec![
        vec![edge_process(100, false, true)],
        vec![edge_process(100, false, false)],
        vec![],
    ]);
    let mut tracker = Tracker::new(store, source);

    tracker.scan_once().expect("first scan starts session");
    let app_id = tracker.store().all_sessions().expect("sessions")[0].app_id;
    assert_eq!(
        tracker.runtime_status_by_app_id().get(&app_id),
        Some(&AppRuntimeStatus::Foreground)
    );

    tracker
        .scan_once()
        .expect("second scan closes session without visible windows");
    assert_eq!(
        tracker.runtime_status_by_app_id().get(&app_id),
        Some(&AppRuntimeStatus::Background)
    );

    let sessions = tracker.store().all_sessions().expect("sessions");
    assert_eq!(sessions.len(), 1);
    assert!(sessions[0].ended_at.is_some());
    assert_eq!(sessions[0].close_reason.as_deref(), Some("process_closed"));

    tracker
        .scan_once()
        .expect("third scan has no process presence");
    assert_eq!(tracker.runtime_status_by_app_id().get(&app_id), None);
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
