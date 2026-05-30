use crate::activity::ActivitySource;
use crate::classifier::{classify_process, Classification};
use crate::domain::{AppRuntimeStatus, RunEventKind};
use crate::foreground::{ForegroundWindowSource, NoForegroundWindowSource};
use crate::process_source::{ProcessSnapshot, ProcessSource};
use crate::storage::{Store, StoreError};
use chrono::{NaiveDate, Utc};
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TrackerError {
    #[error("store error: {0}")]
    Store(#[from] StoreError),
}

pub type TrackerResult<T> = Result<T, TrackerError>;

#[derive(Debug, Clone)]
struct RunningApp {
    app_id: i64,
    session_id: i64,
}

#[derive(Debug, Clone, Default)]
pub struct ScanOutcome {
    pub app_ids_by_pid: HashMap<u32, i64>,
}

pub struct Tracker<S: ProcessSource> {
    store: Store,
    source: S,
    running_by_key: HashMap<String, RunningApp>,
    runtime_status_by_app_id: HashMap<i64, AppRuntimeStatus>,
}

impl<S: ProcessSource> Tracker<S> {
    pub fn new(store: Store, source: S) -> Self {
        Self {
            store,
            source,
            running_by_key: HashMap::new(),
            runtime_status_by_app_id: HashMap::new(),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn runtime_status_by_app_id(&self) -> &HashMap<i64, AppRuntimeStatus> {
        &self.runtime_status_by_app_id
    }

    pub fn scan_once(&mut self) -> TrackerResult<ScanOutcome> {
        let snapshots = self.source.snapshot();
        let mut seen_foreground_keys = HashSet::new();
        let mut app_ids_by_pid = HashMap::new();
        let mut runtime_status_by_app_id = HashMap::new();

        for snapshot in snapshots {
            let Some((key, display_name)) = self.classified_snapshot(&snapshot) else {
                continue;
            };

            if snapshot.is_background_helper || !snapshot.has_visible_window {
                if let Some(app_id) = self.app_id_for_known_key(&key)? {
                    record_runtime_status(
                        &mut runtime_status_by_app_id,
                        app_id,
                        AppRuntimeStatus::Background,
                    );
                }
                continue;
            }

            seen_foreground_keys.insert(key.clone());

            if let Some(running) = self.running_by_key.get(&key) {
                record_runtime_status(
                    &mut runtime_status_by_app_id,
                    running.app_id,
                    AppRuntimeStatus::Foreground,
                );
                app_ids_by_pid.insert(snapshot.pid, running.app_id);
                self.store
                    .heartbeat_session(running.session_id, Utc::now())?;
                self.store.insert_run_event(
                    Some(running.app_id),
                    RunEventKind::AppHeartbeat,
                    Some(&format!(r#"{{"pid":{}}}"#, snapshot.pid)),
                )?;
                continue;
            }

            let app = self.store.upsert_app(
                &snapshot.process_name,
                &snapshot.executable_path,
                &display_name,
            )?;
            let payload_json = format!(r#"{{"pid":{}}}"#, snapshot.pid);
            let session_id =
                self.store
                    .start_session_with_event(app.id, Utc::now(), Some(&payload_json))?;
            record_runtime_status(
                &mut runtime_status_by_app_id,
                app.id,
                AppRuntimeStatus::Foreground,
            );
            app_ids_by_pid.insert(snapshot.pid, app.id);
            self.running_by_key.insert(
                key,
                RunningApp {
                    app_id: app.id,
                    session_id,
                },
            );
        }

        let stopped_keys = self
            .running_by_key
            .keys()
            .filter(|key| !seen_foreground_keys.contains(*key))
            .cloned()
            .collect::<Vec<_>>();

        for key in stopped_keys {
            if let Some(running) = self.running_by_key.get(&key).cloned() {
                self.store.close_session_with_event(
                    running.session_id,
                    running.app_id,
                    Utc::now(),
                    "process_closed",
                    false,
                )?;
                self.running_by_key.remove(&key);
            }
        }

        self.runtime_status_by_app_id = runtime_status_by_app_id;

        Ok(ScanOutcome { app_ids_by_pid })
    }

    fn classified_snapshot(&self, snapshot: &ProcessSnapshot) -> Option<(String, String)> {
        match classify_process(&snapshot.process_name, &snapshot.executable_path) {
            Classification::Hidden => None,
            Classification::Tracked { display_name } => {
                let key = crate::storage::normalize_identity_key(
                    &snapshot.executable_path,
                    &snapshot.process_name,
                );
                Some((key, display_name))
            }
        }
    }

    fn app_id_for_known_key(&self, key: &str) -> TrackerResult<Option<i64>> {
        if let Some(running) = self.running_by_key.get(key) {
            return Ok(Some(running.app_id));
        }

        self.store
            .find_app_by_key(key)
            .map(|app| app.map(|app| app.id))
            .map_err(TrackerError::from)
    }
}

fn record_runtime_status(
    statuses: &mut HashMap<i64, AppRuntimeStatus>,
    app_id: i64,
    status: AppRuntimeStatus,
) {
    let entry = statuses.entry(app_id).or_insert(AppRuntimeStatus::Closed);
    if runtime_status_rank(status) > runtime_status_rank(*entry) {
        *entry = status;
    }
}

fn runtime_status_rank(status: AppRuntimeStatus) -> u8 {
    match status {
        AppRuntimeStatus::Closed => 0,
        AppRuntimeStatus::Background => 1,
        AppRuntimeStatus::Foreground => 2,
    }
}

pub fn run_tracker_tick<S: ProcessSource, A: ActivitySource>(
    tracker: &mut Tracker<S>,
    activity_source: &A,
    usage_date: NaiveDate,
    tick_duration: Duration,
    active_threshold: Duration,
) -> TrackerResult<()> {
    let foreground_source = NoForegroundWindowSource;
    run_tracker_tick_with_foreground(
        tracker,
        activity_source,
        &foreground_source,
        usage_date,
        tick_duration,
        active_threshold,
    )
}

pub fn run_tracker_tick_with_foreground<S, A, F>(
    tracker: &mut Tracker<S>,
    activity_source: &A,
    foreground_source: &F,
    usage_date: NaiveDate,
    tick_duration: Duration,
    active_threshold: Duration,
) -> TrackerResult<()>
where
    S: ProcessSource,
    A: ActivitySource,
    F: ForegroundWindowSource,
{
    let scan_result = tracker.scan_once();
    let seconds = tick_duration.as_secs().min(i64::MAX as u64) as i64;
    let active_seconds = if activity_source.is_active(active_threshold) {
        seconds
    } else {
        0
    };
    let foreground_app_id = scan_result.as_ref().ok().and_then(|outcome| {
        foreground_source
            .foreground_pid()
            .and_then(|pid| outcome.app_ids_by_pid.get(&pid).copied())
    });

    tracker
        .store()
        .increment_daily_system_usage(usage_date, seconds, active_seconds, seconds)?;
    if active_seconds > 0 {
        if let Some(app_id) = foreground_app_id {
            tracker
                .store()
                .increment_daily_app_usage(usage_date, app_id, 0, active_seconds)?;
        }
    }

    scan_result.map(|_| ())
}
