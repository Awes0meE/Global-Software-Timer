use chrono::{
    DateTime, FixedOffset, LocalResult, NaiveDate, NaiveDateTime, Offset, SecondsFormat, TimeZone,
    Utc,
};
use global_software_timer_lib::activity::ActivitySource;
use global_software_timer_lib::app_state::AppState;
use global_software_timer_lib::commands::local_date_bounds_in;
use global_software_timer_lib::domain::AppRuntimeStatus;
use global_software_timer_lib::foreground::ForegroundWindowSource;
use global_software_timer_lib::process_source::{ProcessSnapshot, ProcessSource};
use global_software_timer_lib::storage::Store;
use global_software_timer_lib::tracker::{
    run_tracker_tick, run_tracker_tick_with_foreground, Tracker, TrackerResult,
};
use std::sync::{Arc, Mutex};
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
        ..Default::default()
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
        ..Default::default()
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
        now,
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
        now,
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
fn tracker_rolls_back_whole_tick_when_software_focus_write_fails() {
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
        now,
        Duration::from_secs(5),
        Duration::from_secs(300),
    );

    assert!(result.is_err());
    assert!(tracker
        .store()
        .daily_system_usage(now.date_naive())
        .unwrap()
        .is_none());
    assert!(tracker.store().all_sessions().unwrap().is_empty());
    assert!(tracker.runtime_status_by_app_id().is_empty());
    assert_eq!(
        tracker
            .store()
            .count_run_events("app_seen_started")
            .unwrap(),
        0
    );
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
        now,
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
fn tracker_tick_records_software_foreground_runtime_for_visible_windows() {
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
        now,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .expect("tick");

    let rows = tracker
        .store()
        .software_page_rows(
            now,
            now,
            now.date_naive(),
            tracker.runtime_status_by_app_id(),
        )
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].today_foreground_seconds, 5);
    assert_eq!(rows.discovered[0].today_background_seconds, 0);
}

#[test]
fn tracker_tick_records_software_background_runtime_for_known_background_processes() {
    let db_file = NamedTempFile::new().expect("temp db");
    let store = Store::open(db_file.path()).expect("open");
    store.migrate().expect("migrate");
    store
        .upsert_app(
            "Code.exe",
            code_process().executable_path.as_str(),
            "Visual Studio Code",
        )
        .expect("known app");
    let mut background_code = code_process();
    background_code.has_visible_window = false;
    let source = FakeProcessSource::new(vec![vec![background_code]]);
    let mut tracker = Tracker::new(store, source);
    let activity = FakeActivitySource {
        idle_duration: Duration::from_secs(60),
    };
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();

    run_tracker_tick(
        &mut tracker,
        &activity,
        now,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .expect("tick");

    let rows = tracker
        .store()
        .software_page_rows(
            now,
            now,
            now.date_naive(),
            tracker.runtime_status_by_app_id(),
        )
        .expect("software rows");

    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].today_foreground_seconds, 0);
    assert_eq!(rows.discovered[0].today_background_seconds, 5);
    assert!(tracker.store().all_sessions().expect("sessions").is_empty());
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

#[test]
fn repeated_scans_do_not_append_heartbeat_events() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut second_process = code_process();
    second_process.pid = 43;
    let snapshots = vec![code_process(), second_process];
    let mut tracker = Tracker::new(
        store,
        FakeProcessSource::new(vec![snapshots.clone(), snapshots]),
    );
    tracker.scan_once().unwrap();
    let conn = rusqlite::Connection::open(db_file.path()).unwrap();
    conn.execute_batch("CREATE TABLE heartbeat_writes (session_id INTEGER); CREATE TRIGGER count_heartbeat AFTER UPDATE OF last_heartbeat_at ON usage_sessions BEGIN INSERT INTO heartbeat_writes VALUES (NEW.id); END;").unwrap();
    let outcome = tracker.scan_once().unwrap();
    assert_eq!(outcome.app_ids_by_pid.len(), 2);
    assert_eq!(tracker.store().all_sessions().unwrap().len(), 1);
    assert_eq!(
        tracker.store().count_run_events("app_heartbeat").unwrap(),
        0
    );
    let updates: i64 = conn
        .query_row("SELECT COUNT(*) FROM heartbeat_writes", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(updates, 1);
}

#[test]
fn scan_gap_and_clock_rollback_close_at_the_last_reliable_heartbeat() {
    for (offset, reason) in [(11, "scan_gap"), (-1, "clock_rollback")] {
        let db_file = NamedTempFile::new().unwrap();
        let store = Store::open(db_file.path()).unwrap();
        store.migrate().unwrap();
        let mut tracker =
            Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 3]));
        let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
        tracker.scan_once_at(start).unwrap();
        let heartbeat = start + chrono::Duration::seconds(5);
        tracker.scan_once_at(heartbeat).unwrap();
        let resumed = heartbeat + chrono::Duration::seconds(offset);
        tracker.scan_once_at(resumed).unwrap();
        let sessions = tracker.store().all_sessions().unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].ended_at, Some(heartbeat));
        assert_eq!(sessions[0].duration_seconds, 5);
        assert_eq!(sessions[0].close_reason.as_deref(), Some(reason));
        assert!(!sessions[0].recovered);
        assert_eq!(sessions[1].started_at, resumed);
    }
}

#[test]
fn ten_second_scan_gap_is_still_continuous() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 2]));
    let now = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    tracker.scan_once_at(now).unwrap();
    tracker
        .scan_once_at(now + chrono::Duration::seconds(10))
        .unwrap();
    assert_eq!(tracker.store().all_sessions().unwrap().len(), 1);
}

#[test]
fn long_tick_credits_no_unknown_sleep_time_and_resumes_next_tick() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 3]));
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    for (offset, elapsed) in [(0, 5), (3600, 3600), (3605, 5)] {
        run_tracker_tick_with_foreground(
            &mut tracker,
            &activity,
            &foreground,
            start + chrono::Duration::seconds(offset),
            Duration::from_secs(elapsed),
            Duration::from_secs(300),
        )
        .unwrap();
    }
    let daily = tracker
        .store()
        .daily_system_usage(start.date_naive())
        .unwrap()
        .unwrap();
    assert_eq!(daily.recorded_seconds, 10);
    assert_eq!(daily.active_seconds, 10);
    assert_eq!(daily.tracker_uptime_seconds, 10);
    let sessions = tracker.store().all_sessions().unwrap();
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].ended_at, Some(start));
    assert_eq!(
        sessions[1].last_heartbeat_at,
        start + chrono::Duration::seconds(3605)
    );
}

#[test]
fn midnight_splits_every_credited_counter_using_the_injected_timezone() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]]));
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let timezone = FixedOffset::east_opt(8 * 3600).unwrap();
    let now = timezone.with_ymd_and_hms(2026, 6, 6, 0, 0, 2).unwrap();
    run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        now,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .unwrap();
    let app_id = tracker.store().all_sessions().unwrap()[0].app_id;
    let identity = tracker
        .store()
        .upsert_software_identity_for_app(app_id)
        .unwrap();
    let conn = rusqlite::Connection::open(db_file.path()).unwrap();
    for (date, seconds) in [
        (now.date_naive().pred_opt().unwrap(), 3),
        (now.date_naive(), 2),
    ] {
        let daily = tracker.store().daily_system_usage(date).unwrap().unwrap();
        assert_eq!(daily.recorded_seconds, seconds);
        assert_eq!(daily.active_seconds, seconds);
        assert_eq!(daily.tracker_uptime_seconds, seconds);
        assert_eq!(
            tracker
                .store()
                .software_focus_seconds_for_date(date)
                .unwrap()[&identity.identity_key],
            seconds
        );
        let app_seconds: i64 = conn
            .query_row(
                "SELECT active_seconds FROM daily_app_usage WHERE usage_date=?1 AND app_id=?2",
                rusqlite::params![date.to_string(), app_id],
                |row| row.get(0),
            )
            .unwrap();
        let runtime: (i64, i64) = conn.query_row("SELECT foreground_seconds, background_seconds FROM daily_software_runtime_usage WHERE usage_date=?1",
            [date.to_string()], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
        assert_eq!(app_seconds, seconds);
        assert_eq!(runtime, (seconds, 0));
    }
}

#[test]
fn failed_scan_restores_heartbeat_maps_and_can_retry() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(
        store,
        FakeProcessSource::new(vec![vec![code_process()], vec![], vec![]]),
    );
    let now = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    tracker.scan_once_at(now).unwrap();
    let conn = rusqlite::Connection::open(db_file.path()).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_stop BEFORE INSERT ON run_events WHEN NEW.event_kind='app_seen_stopped' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    assert!(tracker
        .scan_once_at(now + chrono::Duration::seconds(5))
        .is_err());
    assert!(tracker.store().all_sessions().unwrap()[0]
        .ended_at
        .is_none());
    assert_eq!(tracker.runtime_status_by_app_id().len(), 1);
    conn.execute_batch("DROP TRIGGER fail_stop").unwrap();
    tracker
        .scan_once_at(now + chrono::Duration::seconds(6))
        .unwrap();
    assert!(tracker.store().all_sessions().unwrap()[0]
        .ended_at
        .is_some());
    assert!(tracker.runtime_status_by_app_id().is_empty());
}

#[test]
fn graceful_shutdown_closes_at_heartbeat_and_prevents_new_sessions() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 3]));
    let now = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    tracker.scan_once_at(now).unwrap();
    tracker
        .scan_once_at(now + chrono::Duration::seconds(5))
        .unwrap();
    tracker.shutdown().unwrap();
    tracker.shutdown().unwrap();
    tracker
        .scan_once_at(now + chrono::Duration::seconds(10))
        .unwrap();
    let sessions = tracker.store().all_sessions().unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(
        sessions[0].ended_at,
        Some(now + chrono::Duration::seconds(5))
    );
    assert_eq!(
        sessions[0].close_reason.as_deref(),
        Some("tracker_shutdown")
    );
    assert!(!sessions[0].recovered);
}

#[test]
fn tick_failure_restores_an_existing_heartbeat_and_retries_without_partial_counters() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 3]));
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let foreground = FakeForegroundWindowSource { pid: Some(42) };
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        start,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .unwrap();
    let conn = rusqlite::Connection::open(db_file.path()).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_focus BEFORE UPDATE ON daily_software_focus_usage BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    let second = start + chrono::Duration::seconds(5);
    assert!(run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        second,
        Duration::from_secs(5),
        Duration::from_secs(300)
    )
    .is_err());
    assert_eq!(
        tracker.store().all_sessions().unwrap()[0].last_heartbeat_at,
        start
    );
    assert_eq!(
        tracker
            .store()
            .daily_system_usage(start.date_naive())
            .unwrap()
            .unwrap()
            .recorded_seconds,
        5
    );
    assert_eq!(tracker.runtime_status_by_app_id().len(), 1);
    conn.execute_batch("DROP TRIGGER fail_focus").unwrap();
    run_tracker_tick_with_foreground(
        &mut tracker,
        &activity,
        &foreground,
        second,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .unwrap();
    assert_eq!(tracker.store().all_sessions().unwrap().len(), 1);
    assert_eq!(
        tracker.store().all_sessions().unwrap()[0].last_heartbeat_at,
        second
    );
    assert_eq!(
        tracker
            .store()
            .daily_system_usage(start.date_naive())
            .unwrap()
            .unwrap()
            .recorded_seconds,
        10
    );
}

#[test]
fn delayed_first_tick_and_clock_rollback_never_credit_unknown_time() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 3]));
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    for (offset, elapsed) in [(0, 3600), (5, 5), (4, 5)] {
        run_tracker_tick(
            &mut tracker,
            &activity,
            start + chrono::Duration::seconds(offset),
            Duration::from_secs(elapsed),
            Duration::from_secs(300),
        )
        .unwrap();
    }
    let daily = tracker
        .store()
        .daily_system_usage(start.date_naive())
        .unwrap()
        .unwrap();
    assert_eq!(daily.recorded_seconds, 5);
    assert_eq!(daily.active_seconds, 5);
    let sessions = tracker.store().all_sessions().unwrap();
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].close_reason.as_deref(), Some("clock_rollback"));
    assert_eq!(sessions[0].duration_seconds, 5);
}

#[test]
fn fractional_tick_after_zero_credit_or_scan_only_start_does_not_double_count_runtime() {
    for start_with_scan_only in [false, true] {
        let db_file = NamedTempFile::new().unwrap();
        let store = Store::open(db_file.path()).unwrap();
        store.migrate().unwrap();
        let mut tracker =
            Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 2]));
        let activity = FakeActivitySource {
            idle_duration: Duration::ZERO,
        };
        let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
        if start_with_scan_only {
            tracker.scan_once_at(start).unwrap();
        } else {
            run_tracker_tick(
                &mut tracker,
                &activity,
                start,
                Duration::from_secs(3600),
                Duration::from_secs(300),
            )
            .unwrap();
        }
        let now = start + chrono::Duration::milliseconds(5500);
        run_tracker_tick(
            &mut tracker,
            &activity,
            now,
            Duration::from_millis(5500),
            Duration::from_secs(300),
        )
        .unwrap();
        let rows = tracker
            .store()
            .software_page_rows(
                start,
                now,
                start.date_naive(),
                tracker.runtime_status_by_app_id(),
            )
            .unwrap();
        assert_eq!(
            rows.discovered[0].today_foreground_seconds, 5,
            "scan-only start: {start_with_scan_only}"
        );
        assert_eq!(
            rows.discovered[0].total_foreground_seconds, 5,
            "scan-only start: {start_with_scan_only}"
        );
    }
}

#[test]
fn split_boundary_preserves_genuine_legacy_sessions_from_the_same_day() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    let legacy_start = start - chrono::Duration::hours(1);
    let app = store
        .upsert_app(
            "Code.exe",
            &code_process().executable_path,
            "Visual Studio Code",
        )
        .unwrap();
    let session = store.start_session(app.id, legacy_start).unwrap();
    store
        .close_session(
            session,
            legacy_start + chrono::Duration::seconds(42),
            "closed",
            false,
        )
        .unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 2]));
    tracker.scan_once_at(start).unwrap();
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let now = start + chrono::Duration::milliseconds(5500);
    run_tracker_tick(
        &mut tracker,
        &activity,
        now,
        Duration::from_millis(5500),
        Duration::from_secs(300),
    )
    .unwrap();
    let rows = tracker
        .store()
        .software_page_rows(
            legacy_start,
            now,
            start.date_naive(),
            tracker.runtime_status_by_app_id(),
        )
        .unwrap();
    assert_eq!(rows.discovered[0].today_foreground_seconds, 47);
    assert_eq!(rows.discovered[0].total_foreground_seconds, 47);
}

#[test]
fn fractional_tick_credit_is_carried_instead_of_dropped() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![vec![code_process()]; 5]));
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    tracker.scan_once_at(start).unwrap();
    let mut now = start;
    for _ in 0..4 {
        now += chrono::Duration::milliseconds(5_500);
        run_tracker_tick(
            &mut tracker,
            &activity,
            now,
            Duration::from_millis(5_500),
            Duration::from_secs(300),
        )
        .unwrap();
    }

    let usage = tracker
        .store()
        .daily_system_usage(start.date_naive())
        .unwrap()
        .expect("system usage");
    // 4 x 5.5s = 22s; truncating each tick would have recorded only 20s.
    assert_eq!(usage.recorded_seconds, 22);
    assert_eq!(usage.active_seconds, 22);
}

fn tray_weixin() -> ProcessSnapshot {
    ProcessSnapshot {
        pid: 70,
        process_name: "Weixin.exe".to_string(),
        executable_path: r"D:\Software\Weixin\Weixin.exe".to_string(),
        has_tray_icon: true,
        ..Default::default()
    }
}

fn background_service() -> ProcessSnapshot {
    ProcessSnapshot {
        pid: 80,
        process_name: "RazerCentralService.exe".to_string(),
        executable_path:
            r"C:\Program Files (x86)\Razer\Razer Services\Razer Central\RazerCentralService.exe"
                .to_string(),
        cpu_percent: 50.0,
        memory_bytes: 64 * 1024 * 1024,
        ..Default::default()
    }
}

#[test]
fn tray_apps_are_recorded_as_running_and_background_processes_are_logged_separately() {
    let db_file = NamedTempFile::new().unwrap();
    let store = Store::open(db_file.path()).unwrap();
    store.migrate().unwrap();
    let mut tracker = Tracker::new(
        store,
        FakeProcessSource::new(vec![vec![tray_weixin(), background_service()]; 3]),
    );
    let activity = FakeActivitySource {
        idle_duration: Duration::ZERO,
    };
    let start = Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap();
    tracker.scan_once_at(start).unwrap();
    let now = start + chrono::Duration::seconds(5);
    run_tracker_tick(
        &mut tracker,
        &activity,
        now,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .unwrap();

    let sessions = tracker.store().all_sessions().unwrap();
    assert_eq!(
        sessions.len(),
        1,
        "only the tray app gets a runtime session"
    );
    assert!(tracker
        .runtime_status_by_app_id()
        .values()
        .any(|status| *status == AppRuntimeStatus::Tray));

    let background = tracker
        .store()
        .background_usage_for_date(start.date_naive())
        .unwrap();
    assert_eq!(background.len(), 1);
    assert_eq!(background[0].display_name, "RazerCentralService");
    assert_eq!(background[0].running_seconds, 5);
    assert!((background[0].cpu_core_seconds - 2.5).abs() < 1e-9);
    assert_eq!(background[0].peak_memory_bytes, 64 * 1024 * 1024);
    assert_eq!(tracker.background_live().len(), 1);
}

#[test]
fn overlapping_package_versions_only_credit_one_tick() {
    let file = NamedTempFile::new().unwrap();
    let store = Store::open(file.path()).unwrap();
    store.migrate().unwrap();
    let snapshots = [("1.0.0.0", 41), ("2.0.0.0", 42)].map(|(version, pid)| ProcessSnapshot {
        pid,
        executable_path: format!(
            r"C:\Program Files\WindowsApps\Test.App_{version}_x64__publisher\Code.exe"
        ),
        ..code_process()
    });
    let mut tracker = Tracker::new(store, FakeProcessSource::new(vec![snapshots.to_vec()]));
    let now = Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap();
    run_tracker_tick(
        &mut tracker,
        &FakeActivitySource {
            idle_duration: Duration::ZERO,
        },
        now,
        Duration::from_secs(5),
        Duration::from_secs(300),
    )
    .unwrap();
    let rows = tracker
        .store()
        .software_page_rows(
            now,
            now,
            now.date_naive(),
            tracker.runtime_status_by_app_id(),
        )
        .unwrap();
    assert_eq!(rows.discovered.len(), 1);
    assert_eq!(rows.discovered[0].today_foreground_seconds, 5);
}

/// A fixed-rule DST zone for tests: `summer` applies from `summer_starts`
/// (inclusive) to `summer_ends` (exclusive), both UTC; `standard` otherwise.
#[derive(Clone, Copy, Debug, PartialEq)]
struct TestDst {
    standard: FixedOffset,
    summer: FixedOffset,
    summer_starts: NaiveDateTime,
    summer_ends: NaiveDateTime,
}

/// Carries the rule so `TimeZone::from_offset` can rebuild the zone.
#[derive(Clone, Copy, Debug)]
struct TestDstOffset {
    zone: TestDst,
    offset: FixedOffset,
}

impl Offset for TestDstOffset {
    fn fix(&self) -> FixedOffset {
        self.offset
    }
}

impl TestDst {
    fn utc_instant(value: &str) -> NaiveDateTime {
        DateTime::parse_from_rfc3339(value).unwrap().naive_utc()
    }

    /// +01:00 / +02:00, changing at 01:00 UTC like the EU rule.
    fn eu_like() -> Self {
        Self {
            standard: FixedOffset::east_opt(3600).unwrap(),
            summer: FixedOffset::east_opt(2 * 3600).unwrap(),
            summer_starts: Self::utc_instant("2026-03-29T01:00:00Z"),
            summer_ends: Self::utc_instant("2026-10-25T01:00:00Z"),
        }
    }

    /// Springs forward at local 00:00 (so 2026-03-29 has no midnight) and falls
    /// back at local 01:00 (so 00:00-00:59 on 2026-10-25 happens twice).
    fn midnight_switch() -> Self {
        Self {
            standard: FixedOffset::east_opt(3600).unwrap(),
            summer: FixedOffset::east_opt(2 * 3600).unwrap(),
            summer_starts: Self::utc_instant("2026-03-28T23:00:00Z"),
            summer_ends: Self::utc_instant("2026-10-24T23:00:00Z"),
        }
    }

    fn offset_at(&self, utc: &NaiveDateTime) -> FixedOffset {
        if self.summer_starts <= *utc && *utc < self.summer_ends {
            self.summer
        } else {
            self.standard
        }
    }

    fn wrap(&self, offset: FixedOffset) -> TestDstOffset {
        TestDstOffset {
            zone: *self,
            offset,
        }
    }
}

impl TimeZone for TestDst {
    type Offset = TestDstOffset;

    fn from_offset(offset: &TestDstOffset) -> Self {
        offset.zone
    }

    fn offset_from_utc_datetime(&self, utc: &NaiveDateTime) -> TestDstOffset {
        self.wrap(self.offset_at(utc))
    }

    fn offset_from_utc_date(&self, utc: &NaiveDate) -> TestDstOffset {
        self.offset_from_utc_datetime(&utc.and_hms_opt(0, 0, 0).unwrap())
    }

    fn offset_from_local_datetime(&self, local: &NaiveDateTime) -> LocalResult<TestDstOffset> {
        // A local time is valid under an offset when the instant it names
        // really has that offset; none means skipped, two means repeated.
        let mut valid: Vec<(NaiveDateTime, FixedOffset)> = [self.standard, self.summer]
            .into_iter()
            .map(|offset| (*local - offset, offset))
            .filter(|(utc, offset)| self.offset_at(utc) == *offset)
            .collect();
        valid.sort_by_key(|(utc, _)| *utc);
        valid.dedup();
        match valid.as_slice() {
            [] => LocalResult::None,
            [(_, only)] => LocalResult::Single(self.wrap(*only)),
            [(_, earlier), (_, later)] => {
                LocalResult::Ambiguous(self.wrap(*earlier), self.wrap(*later))
            }
            _ => unreachable!("two offsets give at most two instants"),
        }
    }

    fn offset_from_local_date(&self, local: &NaiveDate) -> LocalResult<TestDstOffset> {
        self.offset_from_local_datetime(&local.and_hms_opt(0, 0, 0).unwrap())
    }
}

fn utc_at(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .with_timezone(&Utc)
}

#[test]
fn timeline_dst_day_bounds_are_23_and_25_hours() {
    let eu = TestDst::eu_like();
    let spring = NaiveDate::from_ymd_opt(2026, 3, 29).unwrap();
    let autumn = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
    assert_eq!(
        local_date_bounds_in(spring, &eu),
        (
            utc_at("2026-03-28T23:00:00Z"),
            utc_at("2026-03-29T22:00:00Z")
        )
    );
    assert_eq!(
        local_date_bounds_in(autumn, &eu),
        (
            utc_at("2026-10-24T22:00:00Z"),
            utc_at("2026-10-25T23:00:00Z")
        )
    );
    let (start, end) = local_date_bounds_in(spring, &eu);
    assert_eq!((end - start).num_hours(), 23);
    let (start, end) = local_date_bounds_in(autumn, &eu);
    assert_eq!((end - start).num_hours(), 25);
    // Consecutive days share their boundary.
    assert_eq!(
        local_date_bounds_in(spring.pred_opt().unwrap(), &eu).1,
        local_date_bounds_in(spring, &eu).0
    );

    let switch = TestDst::midnight_switch();
    // No local midnight on the spring day: it starts at 01:00 (+02:00).
    assert_eq!(
        local_date_bounds_in(spring, &switch).0,
        utc_at("2026-03-28T23:00:00Z")
    );
    // Midnight repeats on the autumn day: the earlier instant wins.
    assert_eq!(
        local_date_bounds_in(autumn, &switch).0,
        utc_at("2026-10-24T22:00:00Z")
    );
}

/// Hands the tracker whatever processes the test set for the next tick.
#[derive(Clone, Default)]
struct SharedProcessSource(Arc<Mutex<Vec<ProcessSnapshot>>>);

impl ProcessSource for SharedProcessSource {
    fn snapshot(&mut self) -> Vec<ProcessSnapshot> {
        self.0.lock().unwrap().clone()
    }
}

/// A timeline segment row, read back with a separate connection.
#[derive(Debug, Clone, PartialEq)]
struct Segment {
    date: String,
    start: String,
    end: String,
    seconds: i64,
    focus: Option<String>,
    active: bool,
    reason: String,
}

/// One tracker over a temp database, fed one scripted tick at a time.
struct Rig {
    db: NamedTempFile,
    processes: SharedProcessSource,
    tracker: Tracker<SharedProcessSource>,
}

impl Rig {
    fn new() -> Self {
        let db = NamedTempFile::new().expect("temp db");
        let processes = SharedProcessSource::default();
        let tracker = Self::open_tracker(&db, &processes);
        Self {
            db,
            processes,
            tracker,
        }
    }

    fn open_tracker(
        db: &NamedTempFile,
        processes: &SharedProcessSource,
    ) -> Tracker<SharedProcessSource> {
        let store = Store::open(db.path()).expect("open");
        store.migrate().expect("migrate");
        Tracker::new(store, processes.clone())
    }

    /// A new tracker on the same database, as after the app restarts.
    fn restart(&mut self) {
        self.tracker = Self::open_tracker(&self.db, &self.processes);
    }

    fn try_tick<Tz: TimeZone>(
        &mut self,
        now: DateTime<Tz>,
        tick: Duration,
        processes: &[ProcessSnapshot],
        focus_pid: Option<u32>,
        active: bool,
    ) -> TrackerResult<()> {
        *self.processes.0.lock().unwrap() = processes.to_vec();
        let idle_duration = if active {
            Duration::ZERO
        } else {
            Duration::from_secs(600)
        };
        run_tracker_tick_with_foreground(
            &mut self.tracker,
            &FakeActivitySource { idle_duration },
            &FakeForegroundWindowSource { pid: focus_pid },
            now,
            tick,
            Duration::from_secs(300),
        )
    }

    fn tick<Tz: TimeZone>(
        &mut self,
        now: DateTime<Tz>,
        tick: Duration,
        processes: &[ProcessSnapshot],
        focus_pid: Option<u32>,
        active: bool,
    ) {
        self.try_tick(now, tick, processes, focus_pid, active)
            .expect("tick");
    }

    fn conn(&self) -> rusqlite::Connection {
        rusqlite::Connection::open(self.db.path()).expect("raw open")
    }

    fn segments(&self) -> Vec<Segment> {
        self.conn()
            .prepare(
                "SELECT usage_date, start_utc, end_utc, credited_seconds, focus_identity_key, is_active, start_reason
                 FROM timeline_segments ORDER BY id",
            )
            .unwrap()
            .query_map([], |r| {
                Ok(Segment {
                    date: r.get(0)?,
                    start: r.get(1)?,
                    end: r.get(2)?,
                    seconds: r.get(3)?,
                    focus: r.get(4)?,
                    active: r.get(5)?,
                    reason: r.get(6)?,
                })
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn identity(&self, process_name: &str) -> String {
        self.conn()
            .query_row(
                "SELECT m.identity_key FROM software_identity_members m
                 JOIN apps a ON a.id = m.app_id WHERE lower(a.process_name) = lower(?1)",
                [process_name],
                |r| r.get(0),
            )
            .expect("identity")
    }

    fn recorded_seconds(&self, date: &str) -> i64 {
        self.conn()
            .query_row(
                "SELECT recorded_seconds FROM daily_system_usage WHERE usage_date = ?1",
                [date],
                |r| r.get(0),
            )
            .expect("daily row")
    }
}

fn ms<Tz: TimeZone>(value: DateTime<Tz>) -> String {
    value
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, false)
}

fn t0() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 6, 5, 9, 0, 0).unwrap()
}

fn after(seconds: i64) -> DateTime<Utc> {
    t0() + chrono::Duration::seconds(seconds)
}

const FIVE: Duration = Duration::from_secs(5);

fn reasons(segments: &[Segment]) -> Vec<&str> {
    segments.iter().map(|s| s.reason.as_str()).collect()
}

#[test]
fn timeline_consecutive_ticks_extend_one_segment() {
    let mut rig = Rig::new();
    for k in 0..3 {
        rig.tick(after(5 * k), FIVE, &[code_process()], Some(42), true);
    }
    assert_eq!(
        rig.segments(),
        vec![Segment {
            date: "2026-06-05".to_string(),
            start: ms(after(-5)),
            end: ms(after(10)),
            seconds: 15,
            focus: Some(rig.identity("Code.exe")),
            active: true,
            reason: "tracker_started".to_string(),
        }]
    );
}

#[test]
fn timeline_focus_change_opens_a_focus_changed_segment() {
    let mut rig = Rig::new();
    let processes = [code_process(), edge_process(100, false, true)];
    for (k, (pid, active)) in [(42, true), (42, true), (100, true), (42, false)]
        .into_iter()
        .enumerate()
    {
        rig.tick(after(5 * k as i64), FIVE, &processes, Some(pid), active);
    }
    let segments = rig.segments();
    let (code, edge) = (rig.identity("Code.exe"), rig.identity("msedge.exe"));
    assert_eq!(
        reasons(&segments),
        ["tracker_started", "focus_changed", "focus_changed"]
    );
    let shape: Vec<_> = segments
        .iter()
        .map(|s| (s.focus.clone(), s.active, s.seconds))
        .collect();
    assert_eq!(
        shape,
        vec![
            (Some(code.clone()), true, 10),
            (Some(edge), true, 5),
            (Some(code), false, 5),
        ]
    );
}

#[test]
fn timeline_activity_change_opens_an_activity_changed_segment() {
    let mut rig = Rig::new();
    for (k, active) in [true, false, true].into_iter().enumerate() {
        rig.tick(
            after(5 * k as i64),
            FIVE,
            &[code_process()],
            Some(42),
            active,
        );
    }
    let segments = rig.segments();
    assert_eq!(
        reasons(&segments),
        ["tracker_started", "activity_changed", "activity_changed"]
    );
    let code = rig.identity("Code.exe");
    assert!(segments.iter().all(|s| s.focus.as_ref() == Some(&code)));
    assert_eq!(
        segments.iter().map(|s| s.active).collect::<Vec<_>>(),
        [true, false, true]
    );
}

fn windows_notepad() -> ProcessSnapshot {
    ProcessSnapshot {
        pid: 50,
        process_name: "notepad.exe".to_string(),
        executable_path: r"C:\Windows\System32\notepad.exe".to_string(),
        has_visible_window: true,
        ..Default::default()
    }
}

#[test]
fn timeline_focus_is_null_without_a_countable_foreground_app() {
    let mut rig = Rig::new();
    let processes = [
        code_process(),
        windows_notepad(),
        edge_process(101, true, false),
    ];
    // Code, then: no foreground window, a Windows process, a background
    // helper, and a PID missing from the snapshot.
    for (k, pid) in [Some(42), None, None, Some(50), Some(101), Some(999)]
        .into_iter()
        .enumerate()
    {
        rig.tick(after(5 * k as i64), FIVE, &processes, pid, true);
    }
    let segments = rig.segments();
    assert_eq!(reasons(&segments), ["tracker_started", "focus_changed"]);
    assert_eq!(segments[1].focus, None);
    assert_eq!(segments[1].seconds, 25);
}

#[test]
fn timeline_records_hidden_list_and_tray_focus() {
    let mut rig = Rig::new();
    let processes = [code_process(), tray_weixin()];
    rig.tick(after(0), FIVE, &processes, Some(42), true);
    let code = rig.identity("Code.exe");
    rig.tracker
        .store()
        .add_hidden_software_identities(&[code.clone()])
        .expect("hide");
    rig.tick(after(5), FIVE, &processes, Some(42), true);
    rig.tick(after(10), FIVE, &processes, Some(70), true);
    let shape: Vec<_> = rig
        .segments()
        .into_iter()
        .map(|s| (s.focus, s.seconds))
        .collect();
    assert_eq!(
        shape,
        vec![(Some(code), 10), (Some(rig.identity("Weixin.exe")), 5)]
    );
}

#[test]
fn timeline_midnight_splits_segments_with_day_changed() {
    let mut rig = Rig::new();
    let zone = FixedOffset::east_opt(8 * 3600).unwrap();
    let now = zone.with_ymd_and_hms(2026, 6, 6, 0, 0, 2).unwrap();
    rig.tick(now, FIVE, &[code_process()], Some(42), true);
    let segments = rig.segments();
    let shape: Vec<_> = segments
        .iter()
        .map(|s| {
            (
                s.date.as_str(),
                s.start.as_str(),
                s.end.as_str(),
                s.seconds,
                s.reason.as_str(),
            )
        })
        .collect();
    assert_eq!(
        shape,
        vec![
            (
                "2026-06-05",
                "2026-06-05T15:59:57.000+00:00",
                "2026-06-05T16:00:00.000+00:00",
                3,
                "tracker_started"
            ),
            (
                "2026-06-06",
                "2026-06-05T16:00:00.000+00:00",
                "2026-06-05T16:00:02.000+00:00",
                2,
                "day_changed"
            ),
        ]
    );
    assert_eq!(rig.recorded_seconds("2026-06-05"), 3);
    assert_eq!(rig.recorded_seconds("2026-06-06"), 2);
}

#[test]
fn timeline_long_gaps_write_nothing_and_reopen_with_scan_gap() {
    // (seconds after the last tick, tick_duration): a wall-clock jump, an
    // overlong tick, and a sleep.
    for (jump, tick) in [(11, 5), (5, 11), (3600, 3600)] {
        let mut rig = Rig::new();
        rig.tick(after(0), FIVE, &[code_process()], Some(42), true);
        rig.tick(after(5), FIVE, &[code_process()], Some(42), true);
        let before = rig.segments();
        let gap_at = 5 + jump;
        rig.tick(
            after(gap_at),
            Duration::from_secs(tick),
            &[code_process()],
            Some(42),
            true,
        );
        assert_eq!(rig.segments(), before, "jump {jump}, tick {tick}");
        rig.tick(after(gap_at + 5), FIVE, &[code_process()], Some(42), true);
        let segments = rig.segments();
        assert_eq!(segments[0], before[0]);
        assert_eq!(reasons(&segments), ["tracker_started", "scan_gap"]);
        assert_eq!(segments[1].start, ms(after(gap_at)));
        assert_eq!(segments[1].seconds, 5);
    }
}

#[test]
fn timeline_ten_second_gap_still_extends() {
    let mut rig = Rig::new();
    rig.tick(after(0), FIVE, &[code_process()], Some(42), true);
    rig.tick(
        after(10),
        Duration::from_secs(10),
        &[code_process()],
        Some(42),
        true,
    );
    let segments = rig.segments();
    assert_eq!(reasons(&segments), ["tracker_started"]);
    assert_eq!(segments[0].seconds, 15);
}

#[test]
fn timeline_newer_break_reason_replaces_an_earlier_one() {
    let mut rig = Rig::new();
    rig.tick(after(0), FIVE, &[code_process()], Some(42), true);
    rig.tick(after(20), FIVE, &[code_process()], Some(42), true); // scan gap
    rig.tick(after(15), FIVE, &[code_process()], Some(42), true); // rollback
    rig.tick(after(20), FIVE, &[code_process()], Some(42), true);
    assert_eq!(
        reasons(&rig.segments()),
        ["tracker_started", "clock_rollback"]
    );
}

#[test]
fn timeline_first_tick_break_keeps_tracker_started() {
    let mut rig = Rig::new();
    rig.tick(
        after(0),
        Duration::from_secs(3600),
        &[code_process()],
        Some(42),
        true,
    );
    assert!(rig.segments().is_empty());
    rig.tick(after(5), FIVE, &[code_process()], Some(42), true);
    let segments = rig.segments();
    assert_eq!(reasons(&segments), ["tracker_started"]);
    assert_eq!(segments[0].seconds, 5);
}

#[test]
fn timeline_clock_rollback_reopens_and_may_overlap() {
    let mut rig = Rig::new();
    rig.tick(after(0), FIVE, &[code_process()], Some(42), true);
    rig.tick(after(5), FIVE, &[code_process()], Some(42), true);
    rig.tick(after(4), FIVE, &[code_process()], Some(42), true);
    rig.tick(after(9), FIVE, &[code_process()], Some(42), true);
    let segments = rig.segments();
    assert_eq!(reasons(&segments), ["tracker_started", "clock_rollback"]);
    assert_eq!(segments[0].end, ms(after(5)));
    assert_eq!(segments[1].start, ms(after(4)));
    assert!(segments[1].start < segments[0].end);
    assert_eq!((segments[0].seconds, segments[1].seconds), (10, 5));
}

#[test]
fn timeline_restart_never_extends_the_previous_segment() {
    let mut rig = Rig::new();
    rig.tick(after(0), FIVE, &[code_process()], Some(42), true);
    rig.tick(after(5), FIVE, &[code_process()], Some(42), true);
    rig.restart();
    rig.tick(after(10), FIVE, &[code_process()], Some(42), true);
    let segments = rig.segments();
    assert_eq!(reasons(&segments), ["tracker_started", "tracker_started"]);
    assert_eq!((segments[0].seconds, segments[1].seconds), (10, 5));
}
