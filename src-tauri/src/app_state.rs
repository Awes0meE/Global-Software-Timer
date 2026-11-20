use crate::process_source::SysinfoProcessSource;
use crate::storage::Store;
use crate::tracker::Tracker;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

pub type SharedTracker = Arc<Mutex<Tracker<SysinfoProcessSource>>>;

pub struct AppState {
    pub db_path: PathBuf,
    pub tracker: SharedTracker,
    pub summary_store: Mutex<Store>,
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
            tracker: Arc::new(Mutex::new(tracker)),
            summary_store,
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

pub fn lock_tracker(tracker: &SharedTracker) -> MutexGuard<'_, Tracker<SysinfoProcessSource>> {
    lock_recovering(tracker)
}
