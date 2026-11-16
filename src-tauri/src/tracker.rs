use crate::activity::ActivitySource;
use crate::classifier::{classify_process, Classification};
use crate::domain::AppRuntimeStatus;
use crate::foreground::{ForegroundWindowSource, NoForegroundWindowSource};
use crate::process_source::{ProcessSnapshot, ProcessSource};
use crate::storage::{Store, StoreError, StoreResult};
use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use thiserror::Error;

const MAX_SCAN_GAP: Duration = Duration::from_secs(10);
const MAX_TICK_CREDIT: Duration = Duration::from_secs(60);

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
    last_heartbeat_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct ScanOutcome {
    pub app_ids_by_pid: HashMap<u32, i64>,
}

#[derive(Clone, Default)]
struct TrackingState {
    running_by_key: HashMap<String, RunningApp>,
    runtime_status_by_app_id: HashMap<i64, AppRuntimeStatus>,
    last_scan_at: Option<DateTime<Utc>>,
    last_tick_at: Option<DateTime<Utc>>,
    stopped: bool,
}

pub struct Tracker<S: ProcessSource> {
    store: Store,
    source: S,
    state: TrackingState,
}

impl<S: ProcessSource> Tracker<S> {
    pub fn new(store: Store, source: S) -> Self {
        Self {
            store,
            source,
            state: TrackingState::default(),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn runtime_status_by_app_id(&self) -> &HashMap<i64, AppRuntimeStatus> {
        &self.state.runtime_status_by_app_id
    }

    pub fn scan_once(&mut self) -> TrackerResult<ScanOutcome> {
        self.scan_once_at(Local::now())
    }

    /// The supplied observation time is shared by every write in this scan.
    pub fn scan_once_at<Tz: TimeZone>(&mut self, now: DateTime<Tz>) -> TrackerResult<ScanOutcome> {
        if self.state.stopped {
            return Ok(ScanOutcome::default());
        }
        let snapshots = self.source.snapshot();
        let mut next = self.state.clone();
        let transaction = self.store.savepoint()?;
        let now_utc = now.with_timezone(&Utc);
        let reason = discontinuity(next.last_scan_at, now_utc);
        let outcome = apply_scan(
            &self.store,
            snapshots,
            &mut next,
            now_utc,
            now.date_naive(),
            reason,
        )?;
        transaction.commit()?;
        self.state = next;
        Ok(outcome)
    }

    /// Close at the last observation, never at an unobserved shutdown timestamp.
    pub fn shutdown(&mut self) -> TrackerResult<()> {
        if self.state.stopped {
            return Ok(());
        }
        let transaction = self.store.savepoint()?;
        close_running_sessions(&self.store, &self.state, "tracker_shutdown")?;
        transaction.commit()?;
        self.state.running_by_key.clear();
        self.state.runtime_status_by_app_id.clear();
        self.state.stopped = true;
        Ok(())
    }
}

fn discontinuity(previous: Option<DateTime<Utc>>, now: DateTime<Utc>) -> Option<&'static str> {
    let previous = previous?;
    if now < previous {
        Some("clock_rollback")
    } else if now.signed_duration_since(previous).to_std().ok()? > MAX_SCAN_GAP {
        Some("scan_gap")
    } else {
        None
    }
}

fn close_running_sessions(store: &Store, state: &TrackingState, reason: &str) -> StoreResult<()> {
    for running in state.running_by_key.values() {
        store.close_session_with_event(
            running.session_id,
            running.app_id,
            running.last_heartbeat_at,
            reason,
            false,
        )?;
    }
    Ok(())
}

fn apply_scan(
    store: &Store,
    snapshots: Vec<ProcessSnapshot>,
    state: &mut TrackingState,
    now: DateTime<Utc>,
    usage_date: NaiveDate,
    break_reason: Option<&str>,
) -> StoreResult<ScanOutcome> {
    if let Some(reason) = break_reason {
        close_running_sessions(store, state, reason)?;
        state.running_by_key.clear();
    }
    let mut seen_foreground_keys = HashSet::new();
    let mut app_ids_by_pid = HashMap::new();
    let mut statuses = HashMap::new();
    let mut background_keys = HashSet::new();
    for snapshot in snapshots {
        let Classification::Tracked { display_name } =
            classify_process(&snapshot.process_name, &snapshot.executable_path)
        else {
            continue;
        };
        let key = crate::storage::normalize_identity_key(
            &snapshot.executable_path,
            &snapshot.process_name,
        );
        if snapshot.is_background_helper || !snapshot.has_visible_window {
            background_keys.insert(key);
            continue;
        }
        // Each visible PID retains focus attribution, with one heartbeat per executable.
        let first_seen = seen_foreground_keys.insert(key.clone());
        if let Some(running) = state.running_by_key.get_mut(&key) {
            if first_seen {
                store.heartbeat_session(running.session_id, now)?;
                running.last_heartbeat_at = now;
            }
            record_runtime_status(&mut statuses, running.app_id, AppRuntimeStatus::Foreground);
            app_ids_by_pid.insert(snapshot.pid, running.app_id);
        } else {
            let app = store.upsert_app(
                &snapshot.process_name,
                &snapshot.executable_path,
                &display_name,
            )?;
            let payload = format!(r#"{{"pid":{}}}"#, snapshot.pid);
            let session_id = store.start_session_with_event(app.id, now, Some(&payload))?;
            let identity_key = store
                .software_identity_key_for_app(app.id)?
                .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            // Establish the split-accounting boundary even when this observation
            // earns no whole seconds. Otherwise a later fractional tick can make
            // this new session look legacy and count its runtime a second time.
            store.increment_daily_software_runtime_usage(usage_date, &identity_key, 0, 0, now)?;
            record_runtime_status(&mut statuses, app.id, AppRuntimeStatus::Foreground);
            app_ids_by_pid.insert(snapshot.pid, app.id);
            state.running_by_key.insert(
                key,
                RunningApp {
                    app_id: app.id,
                    session_id,
                    last_heartbeat_at: now,
                },
            );
        }
    }
    for key in background_keys {
        let app_id = if let Some(running) = state.running_by_key.get(&key) {
            Some(running.app_id)
        } else {
            store.find_app_by_key(&key)?.map(|app| app.id)
        };
        if let Some(app_id) = app_id {
            record_runtime_status(&mut statuses, app_id, AppRuntimeStatus::Background);
        }
    }
    let stopped_keys: Vec<_> = state
        .running_by_key
        .keys()
        .filter(|key| !seen_foreground_keys.contains(*key))
        .cloned()
        .collect();
    for key in stopped_keys {
        let running = &state.running_by_key[&key];
        store.close_session_with_event(
            running.session_id,
            running.app_id,
            now,
            "process_closed",
            false,
        )?;
        state.running_by_key.remove(&key);
    }
    state.runtime_status_by_app_id = statuses;
    state.last_scan_at = Some(now);
    Ok(ScanOutcome { app_ids_by_pid })
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

pub fn run_tracker_tick<S: ProcessSource, A: ActivitySource, Tz: TimeZone>(
    tracker: &mut Tracker<S>,
    activity_source: &A,
    now: DateTime<Tz>,
    tick_duration: Duration,
    active_threshold: Duration,
) -> TrackerResult<()> {
    run_tracker_tick_with_foreground(
        tracker,
        activity_source,
        &NoForegroundWindowSource,
        now,
        tick_duration,
        active_threshold,
    )
}

pub fn run_tracker_tick_with_foreground<S, A, F, Tz>(
    tracker: &mut Tracker<S>,
    activity_source: &A,
    foreground_source: &F,
    now: DateTime<Tz>,
    tick_duration: Duration,
    active_threshold: Duration,
) -> TrackerResult<()>
where
    S: ProcessSource,
    A: ActivitySource,
    F: ForegroundWindowSource,
    Tz: TimeZone,
{
    if tracker.state.stopped {
        return Ok(());
    }
    let now_utc = now.with_timezone(&Utc);
    let break_reason = discontinuity(tracker.state.last_scan_at, now_utc)
        .or_else(|| discontinuity(tracker.state.last_tick_at, now_utc))
        .or(if tick_duration > MAX_SCAN_GAP {
            Some("scan_gap")
        } else {
            None
        });
    let mut credited = tick_duration.min(MAX_TICK_CREDIT);
    if break_reason.is_some() {
        credited = Duration::ZERO;
    } else if let Some(previous) = tracker.state.last_tick_at {
        credited = credited.min(
            now_utc
                .signed_duration_since(previous)
                .to_std()
                .unwrap_or_default(),
        );
    }
    let snapshots = tracker.source.snapshot();
    let mut next = tracker.state.clone();
    let store = &tracker.store;
    let transaction = store.savepoint()?;
    let outcome = apply_scan(
        store,
        snapshots,
        &mut next,
        now_utc,
        now.date_naive(),
        break_reason,
    )?;
    let is_active = activity_source.is_active(active_threshold);
    let foreground_app_id = foreground_source
        .foreground_pid()
        .and_then(|pid| outcome.app_ids_by_pid.get(&pid).copied());
    for (date, seconds, recorded_at) in credited_days(&now, credited.as_secs() as i64) {
        let active_seconds = if is_active { seconds } else { 0 };
        store.increment_daily_system_usage(date, seconds, active_seconds, seconds)?;
        record_daily_software_runtime_usage(
            store,
            &next.runtime_status_by_app_id,
            date,
            seconds,
            recorded_at,
        )?;
        if let Some(app_id) = foreground_app_id {
            if active_seconds > 0 {
                store.increment_daily_app_usage(date, app_id, 0, active_seconds)?;
            }
            let identity = store.upsert_software_identity_for_app(app_id)?;
            // Software-page focus remains independent of the machine idle gate.
            store.increment_daily_software_focus_usage(date, &identity.identity_key, seconds)?;
        }
    }
    next.last_tick_at = Some(now_utc);
    transaction.commit()?;
    tracker.state = next;
    Ok(())
}

fn credited_days<Tz: TimeZone>(
    now: &DateTime<Tz>,
    seconds: i64,
) -> Vec<(NaiveDate, i64, DateTime<Utc>)> {
    let mut days: Vec<(NaiveDate, i64, DateTime<Utc>)> = Vec::new();
    // At most 60 whole seconds; local conversion also handles timezone transitions.
    for offset in 0..seconds {
        let instant = now.with_timezone(&Utc) - chrono::Duration::seconds(seconds - offset);
        let date = instant.with_timezone(&now.timezone()).date_naive();
        if let Some((last_date, count, _)) = days.last_mut() {
            if *last_date == date {
                *count += 1;
                continue;
            }
        }
        days.push((date, 1, instant));
    }
    days
}

fn record_daily_software_runtime_usage(
    store: &Store,
    statuses: &HashMap<i64, AppRuntimeStatus>,
    usage_date: NaiveDate,
    seconds: i64,
    recorded_at: DateTime<Utc>,
) -> StoreResult<()> {
    let mut status_by_identity: HashMap<String, AppRuntimeStatus> = HashMap::new();
    for (app_id, status) in statuses {
        if *status == AppRuntimeStatus::Closed {
            continue;
        }
        let identity = store.upsert_software_identity_for_app(*app_id)?;
        let entry = status_by_identity
            .entry(identity.identity_key)
            .or_insert(AppRuntimeStatus::Closed);
        if runtime_status_rank(*status) > runtime_status_rank(*entry) {
            *entry = *status;
        }
    }
    for (identity_key, status) in status_by_identity {
        let (foreground_seconds, background_seconds) = match status {
            AppRuntimeStatus::Foreground => (seconds, 0),
            AppRuntimeStatus::Background => (0, seconds),
            AppRuntimeStatus::Closed => (0, 0),
        };
        store.increment_daily_software_runtime_usage(
            usage_date,
            &identity_key,
            foreground_seconds,
            background_seconds,
            recorded_at,
        )?;
    }
    Ok(())
}
