use crate::background::BackgroundProcessGroup;
use crate::domain::AppRuntimeStatus;
use crate::process_source::SysinfoProcessSource;
use crate::storage::Store;
use crate::tracker::Tracker;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

pub type SharedTracker = Arc<Mutex<Tracker<SysinfoProcessSource>>>;

/// UI readers take a reference to the last completed sample without waiting for
/// process enumeration, SQLite writes or icon discovery in the next scan.
#[derive(Default)]
pub struct LiveSample {
    pub statuses: HashMap<i64, AppRuntimeStatus>,
    pub last_scan_succeeded: Option<bool>,
    pub background: Vec<BackgroundProcessGroup>,
}

pub type SharedSample = Arc<Mutex<Arc<LiveSample>>>;

impl LiveSample {
    pub fn publish(tracker: &Tracker<SysinfoProcessSource>, sample: &SharedSample) {
        let next = Self {
            statuses: tracker.runtime_status_by_app_id().clone(),
            last_scan_succeeded: tracker.last_scan_succeeded(),
            background: tracker.background_live().to_vec(),
        };
        *lock_recovering(sample) = Arc::new(next);
    }
}

pub struct AppState {
    pub live: SharedSample,
    pub db_path: PathBuf,
    pub tracker: SharedTracker,
    pub summary_store: Mutex<Store>,
    pub export_session: crate::export::ExportSession,
    pub restore: crate::restore::RestoreSession,
    pub update: crate::update::UpdateSession,
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Result<Self, crate::storage::StoreError> {
        let store = Store::open(&db_path)?;
        store.migrate()?;
        store.recover_open_sessions()?;
        let summary_store = Mutex::new(Store::open_read_only(&db_path)?);
        let tracker = Tracker::new(store, SysinfoProcessSource::new());
        Ok(Self {
            db_path,
            live: Default::default(),
            tracker: Arc::new(Mutex::new(tracker)),
            summary_store,
            export_session: Default::default(),
            restore: Default::default(),
            update: Default::default(),
        })
    }
}

/// A panic while holding a lock must not stop tracking for the rest of the
/// session. Tracker state is only replaced after a committed tick, so the data
/// behind a poisoned lock is still the last consistent state.
pub fn lock_recovering<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Closes the open sessions before the process exits.
pub fn shutdown_tracker(tracker: &SharedTracker) {
    if let Err(error) = lock_tracker(tracker).shutdown() {
        eprintln!("tracker shutdown failed: {error}");
    }
}

pub fn lock_tracker(tracker: &SharedTracker) -> MutexGuard<'_, Tracker<SysinfoProcessSource>> {
    lock_recovering(tracker)
}
