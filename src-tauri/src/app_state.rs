use crate::process_source::SysinfoProcessSource;
use crate::storage::Store;
use crate::tracker::Tracker;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

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
