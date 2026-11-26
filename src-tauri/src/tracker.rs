use crate::activity::ActivitySource;
use crate::background::{background_groups, BackgroundProcessGroup};
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
    /// Sub-second credit carried to the next tick so whole-second counters
    /// do not lose the fraction of every tick.
    credit_remainder: Duration,
    /// Background processes seen by the latest tick, for the live page view.
    background_live: Vec<BackgroundProcessGroup>,
    /// Which timeline rows the next tick may extend; never persisted, so a
    /// restart always opens new rows.
    timeline: TimelineCursor,
    stopped: bool,
}

#[derive(Debug, Clone, Default)]
struct TimelineCursor {
    segment: SegmentCursor,
    /// Identity key -> the window span the next chunk may extend. Holds only
    /// identities that had a window in the previous chunk.
    windows: HashMap<String, i64>,
}

#[derive(Debug, Clone, Default)]
enum SegmentCursor {
    /// No segment written by this process yet.
    #[default]
    Fresh,
    /// A scan gap or clock rollback followed the last segment.
    AfterBreak(&'static str),
    /// The last segment, which the next chunk may extend.
    Open {
        segment_id: i64,
        usage_date: NaiveDate,
        focus_identity_key: Option<String>,
        is_active: bool,
    },
}

impl TimelineCursor {
    /// `Fresh` stays `Fresh`: its next segment is `tracker_started` anyway;
    /// an existing `AfterBreak` takes the newer reason.
    fn note_break(&mut self, reason: &'static str) {
        if !matches!(self.segment, SegmentCursor::Fresh) {
            self.segment = SegmentCursor::AfterBreak(reason);
        }
        self.windows.clear();
    }

    /// Why a chunk on `date` cannot continue the previous rows: `tracker_started`,
    /// the break reason, or `day_changed`; `None` when the cursor is open on `date`.
    fn chunk_break(&self, date: NaiveDate) -> Option<&'static str> {
        match &self.segment {
            SegmentCursor::Fresh => Some("tracker_started"),
            SegmentCursor::AfterBreak(reason) => Some(reason),
            SegmentCursor::Open { usage_date, .. } if *usage_date != date => Some("day_changed"),
            SegmentCursor::Open { .. } => None,
        }
    }
}

pub struct Tracker<S: ProcessSource> {
    store: Store,
    source: S,
    state: TrackingState,
    last_scan_succeeded: Option<bool>,
}

impl<S: ProcessSource> Tracker<S> {
    pub fn new(store: Store, source: S) -> Self {
        Self {
            store,
            source,
            state: TrackingState::default(),
            last_scan_succeeded: None,
        }
    }

    pub fn last_scan_succeeded(&self) -> Option<bool> {
        self.last_scan_succeeded
    }

    pub fn run_automatic_scan(&mut self, tick: impl FnOnce(&mut Self) -> TrackerResult<()>) {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| tick(self)));
        self.last_scan_succeeded = Some(matches!(result, Ok(Ok(()))));
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => eprintln!("tracker scan failed: {error}"),
            Err(_) => eprintln!("tracker scan panicked; retrying on the next tick"),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn runtime_status_by_app_id(&self) -> &HashMap<i64, AppRuntimeStatus> {
        &self.state.runtime_status_by_app_id
    }

    pub fn background_live(&self) -> &[BackgroundProcessGroup] {
        &self.state.background_live
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
            &snapshots,
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
        self.state.background_live.clear();
        self.state.stopped = true;
        Ok(())
    }

    /// Undoes `shutdown` when the exit it prepared for did not happen (an
    /// update installer that could not be started): the next scan opens new
    /// sessions for the software still running.
    pub fn resume(&mut self) {
        self.state.stopped = false;
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
    snapshots: &[ProcessSnapshot],
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
        // Users see an app through a taskbar window or a tray icon; anything
        // else is a background process and gets no runtime session.
        let status = if snapshot.is_background_helper {
            AppRuntimeStatus::Background
        } else if snapshot.has_visible_window {
            AppRuntimeStatus::Foreground
        } else if snapshot.has_tray_icon {
            AppRuntimeStatus::Tray
        } else {
            AppRuntimeStatus::Background
        };
        if !status.is_user_facing() {
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
            record_runtime_status(&mut statuses, running.app_id, status);
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
            record_runtime_status(&mut statuses, app.id, status);
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
    if status.rank() > entry.rank() {
        *entry = status;
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
    let carried = if break_reason.is_some() {
        Duration::ZERO
    } else {
        tracker.state.credit_remainder
    };
    let credited = (credited + carried).min(MAX_TICK_CREDIT);
    let credit_remainder = credited - Duration::from_secs(credited.as_secs());
    let snapshots = tracker.source.snapshot();
    let mut next = tracker.state.clone();
    let store = &tracker.store;
    let transaction = store.savepoint()?;
    let outcome = apply_scan(
        store,
        &snapshots,
        &mut next,
        now_utc,
        now.date_naive(),
        break_reason,
    )?;
    if let Some(reason) = break_reason {
        // A break credits nothing, so no chunk below can carry it.
        next.timeline.note_break(reason);
    }
    let is_active = activity_source.is_active(active_threshold);
    let foreground_app_id = foreground_source
        .foreground_pid()
        .and_then(|pid| outcome.app_ids_by_pid.get(&pid).copied());
    let background = background_groups(&snapshots);
    for (date, seconds, recorded_at) in credited_days(&now, credited.as_secs() as i64) {
        for group in &background {
            store.increment_daily_background_usage(date, group, seconds, recorded_at)?;
        }
        let active_seconds = if is_active { seconds } else { 0 };
        store.increment_daily_system_usage(date, seconds, active_seconds, seconds)?;
        let windowed_keys = record_daily_software_runtime_usage(
            store,
            &next.runtime_status_by_app_id,
            date,
            seconds,
            recorded_at,
        )?;
        let focus_key = match foreground_app_id {
            Some(app_id) => {
                if active_seconds > 0 {
                    store.increment_daily_app_usage(date, app_id, 0, active_seconds)?;
                }
                let identity = store.upsert_software_identity_for_app(app_id)?;
                // Software-page focus remains independent of the machine idle gate.
                store.increment_daily_software_focus_usage(
                    date,
                    &identity.identity_key,
                    seconds,
                )?;
                Some(identity.identity_key)
            }
            None => None,
        };
        record_timeline_chunk(
            store,
            &mut next.timeline,
            date,
            recorded_at,
            seconds,
            focus_key.as_deref(),
            is_active,
            &windowed_keys,
        )?;
    }
    next.last_tick_at = Some(now_utc);
    next.credit_remainder = credit_remainder;
    next.background_live = background;
    transaction.commit()?;
    tracker.state = next;
    Ok(())
}

/// Writes one dated chunk of credited seconds to the timeline: extends the open
/// segment when nothing changed, otherwise opens a new one with the reason; and
/// extends or opens a window span for each identity in `windowed_keys`.
#[allow(clippy::too_many_arguments)]
fn record_timeline_chunk(
    store: &Store,
    cursor: &mut TimelineCursor,
    date: NaiveDate,
    chunk_start: DateTime<Utc>,
    seconds: i64,
    focus_key: Option<&str>,
    is_active: bool,
    windowed_keys: &[String],
) -> StoreResult<()> {
    let chunk_end = chunk_start + chrono::Duration::seconds(seconds);
    // Taken before the segment cursor moves: window spans break with the
    // segments, but focus and activity changes do not split them.
    let chunk_break = cursor.chunk_break(date);
    let mut windows = HashMap::with_capacity(windowed_keys.len());
    for identity_key in windowed_keys {
        let open_span = match chunk_break {
            Some(_) => None,
            None => cursor.windows.get(identity_key).copied(),
        };
        let span_id = match open_span {
            Some(span_id) => {
                store.extend_timeline_window_span(span_id, chunk_end, seconds)?;
                span_id
            }
            None => store.insert_timeline_window_span(
                date,
                identity_key,
                chunk_start,
                chunk_end,
                seconds,
                chunk_break.unwrap_or("window_opened"),
            )?,
        };
        windows.insert(identity_key.clone(), span_id);
    }
    // Identities without a window in this chunk drop out; their rows stay as written.
    cursor.windows = windows;
    let segment_id = match &cursor.segment {
        SegmentCursor::Open {
            segment_id,
            usage_date,
            focus_identity_key,
            is_active: was_active,
        } if *usage_date == date
            && focus_identity_key.as_deref() == focus_key
            && *was_active == is_active =>
        {
            store.extend_timeline_segment(*segment_id, chunk_end, seconds)?;
            *segment_id
        }
        segment => {
            let same_focus = matches!(
                segment,
                SegmentCursor::Open { focus_identity_key, .. }
                    if focus_identity_key.as_deref() == focus_key
            );
            // A focus change that also flips activity is recorded as the focus change.
            let reason = chunk_break.unwrap_or(if same_focus {
                "activity_changed"
            } else {
                "focus_changed"
            });
            store.insert_timeline_segment(
                date,
                chunk_start,
                chunk_end,
                seconds,
                focus_key,
                is_active,
                reason,
            )?
        }
    };
    cursor.segment = SegmentCursor::Open {
        segment_id,
        usage_date: date,
        focus_identity_key: focus_key.map(str::to_string),
        is_active,
    };
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
) -> StoreResult<Vec<String>> {
    let mut status_by_identity: HashMap<String, AppRuntimeStatus> = HashMap::new();
    for (app_id, status) in statuses {
        if *status == AppRuntimeStatus::Closed {
            continue;
        }
        let identity = store.upsert_software_identity_for_app(*app_id)?;
        let entry = status_by_identity
            .entry(identity.identity_key)
            .or_insert(AppRuntimeStatus::Closed);
        if status.rank() > entry.rank() {
            *entry = *status;
        }
    }
    let mut windowed_keys = Vec::new();
    for (identity_key, status) in status_by_identity {
        if status == AppRuntimeStatus::Foreground {
            windowed_keys.push(identity_key.clone());
        }
        let (foreground_seconds, background_seconds) = match status {
            AppRuntimeStatus::Foreground => (seconds, 0),
            // The software page splits window time from out-of-window time.
            AppRuntimeStatus::Tray | AppRuntimeStatus::Background => (0, seconds),
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
    // The identities credited window time, sorted so writes follow a stable order.
    windowed_keys.sort();
    Ok(windowed_keys)
}
