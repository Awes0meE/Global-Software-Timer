use chrono::{FixedOffset, TimeZone, Utc};
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
