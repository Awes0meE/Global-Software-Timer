use crate::classifier::{classify_process, Classification};
use crate::domain::RunEventKind;
use crate::process_source::{ProcessSnapshot, ProcessSource};
use crate::storage::{Store, StoreError};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
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

pub struct Tracker<S: ProcessSource> {
    store: Store,
    source: S,
    running_by_key: HashMap<String, RunningApp>,
}

impl<S: ProcessSource> Tracker<S> {
    pub fn new(store: Store, source: S) -> Self {
        Self {
            store,
            source,
            running_by_key: HashMap::new(),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn scan_once(&mut self) -> TrackerResult<()> {
        let snapshots = self.source.snapshot();
        let mut seen_keys = HashSet::new();

        for snapshot in snapshots {
            let Some((key, display_name)) = self.trackable_snapshot(&snapshot) else {
                continue;
            };
            seen_keys.insert(key.clone());

            if let Some(running) = self.running_by_key.get(&key) {
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
            let session_id = self.store.start_session(app.id, Utc::now())?;
            self.store.insert_run_event(
                Some(app.id),
                RunEventKind::AppSeenStarted,
                Some(&format!(r#"{{"pid":{}}}"#, snapshot.pid)),
            )?;
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
            .filter(|key| !seen_keys.contains(*key))
            .cloned()
            .collect::<Vec<_>>();

        for key in stopped_keys {
            if let Some(running) = self.running_by_key.remove(&key) {
                self.store.close_session(
                    running.session_id,
                    Utc::now(),
                    "process_closed",
                    false,
                )?;
                self.store.insert_run_event(
                    Some(running.app_id),
                    RunEventKind::AppSeenStopped,
                    None,
                )?;
            }
        }

        Ok(())
    }

    fn trackable_snapshot(&self, snapshot: &ProcessSnapshot) -> Option<(String, String)> {
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
}
