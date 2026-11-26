//! 设置 → 关于与反馈 → 检查更新… (v0.4.6): the only network access GST has.
//! These commands run only after the user pressed 检查更新… and agreed in the
//! consent dialog, every time; nothing here runs at startup, on a timer or in
//! the background. The updater plugin is driven from Rust only, so the webview
//! has no updater permission of its own.

use crate::app_state::{self, AppState};
use crate::{maintenance, restore};
use chrono::Local;
use semver::Version;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Offline, a GitHub error or a release manifest that cannot be read.
pub const UPDATE_CHECK_FAILED: &str = "update_check_failed";
/// The copy of the database made before an update could not be written; nothing was downloaded.
pub const UPDATE_BACKUP_FAILED: &str = "update_backup_failed";
/// The download broke off or its signature did not verify.
pub const UPDATE_DOWNLOAD_FAILED: &str = "update_download_failed";
/// The installer could not be started; the current version keeps running.
pub const UPDATE_INSTALL_FAILED: &str = "update_install_failed";
/// `cancel_update` stopped the update; nothing was installed.
pub const UPDATE_CANCELLED: &str = "update_cancelled";

const CHECK_TIMEOUT: Duration = Duration::from_secs(20);
/// Progress messages are sent at most once per this many bytes, and at the end.
const PROGRESS_STEP: u64 = 64 * 1024;

/// What the 发现新版本 dialog shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// The installer size from the release manifest, when it lists one.
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// Only a stable release newer than the running version is offered.
pub fn is_newer_stable(current: &Version, remote: &Version) -> bool {
    remote.pre.is_empty() && remote > current
}

/// The installer size GST's release manifest lists as `size` beside the
/// platform entry whose `url` is the one to download.
pub fn manifest_size(raw: &serde_json::Value, download_url: &str) -> Option<u64> {
    raw.get("platforms")?
        .as_object()?
        .values()
        .find(|platform| platform.get("url").and_then(|url| url.as_str()) == Some(download_url))?
        .get("size")?
        .as_u64()
        .filter(|size| *size > 0)
}

/// The update found by the last check, and the download in flight.
#[derive(Default)]
pub struct UpdateSession {
    found: Mutex<Option<Update>>,
    download: Mutex<DownloadControl>,
}

type Abort = Box<dyn FnOnce() + Send>;

/// Lets `cancel_update` stop a download, also one that is still being set up.
#[derive(Default)]
pub struct DownloadControl {
    cancelled: bool,
    abort: Option<Abort>,
}

impl DownloadControl {
    /// A new update run starts uncancelled.
    pub fn begin(&mut self) {
        self.cancelled = false;
        self.abort = None;
    }

    /// Hands over the way to stop the running download; stops it at once
    /// when the run was cancelled before.
    pub fn arm(&mut self, abort: Abort) {
        if self.cancelled {
            abort();
        } else {
            self.abort = Some(abort);
        }
    }

    pub fn cancel(&mut self) {
        self.cancelled = true;
        if let Some(abort) = self.abort.take() {
            abort();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled
    }

    /// The download is over; true when it was cancelled.
    pub fn finish(&mut self) -> bool {
        self.abort = None;
        self.cancelled
    }
}

fn failed(code: &'static str, error: impl std::fmt::Display) -> String {
    eprintln!("{code}: {error}");
    code.to_string()
}

/// Asks GitHub for the latest release manifest. Returns `None` when this is
/// the latest stable version.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let tracker = app.state::<AppState>().tracker.clone();
    let updater = app
        .updater_builder()
        .version_comparator(|current, release| is_newer_stable(&current, &release.version))
        .timeout(CHECK_TIMEOUT)
        // The installer is started and this process exits without the app's
        // exit path: close the open sessions first, as that path does.
        .on_before_exit(move || app_state::shutdown_tracker(&tracker))
        .build()
        .map_err(|error| failed(UPDATE_CHECK_FAILED, error))?;
    let update = updater
        .check()
        .await
        .map_err(|error| failed(UPDATE_CHECK_FAILED, error))?;
    let info = update.as_ref().map(|update| UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        size_bytes: manifest_size(&update.raw_json, update.download_url.as_str()),
    });
    *app_state::lock_recovering(&app.state::<AppState>().update.found) = update;
    Ok(info)
}

/// 更新并重启: backs up the database, downloads and verifies the installer
/// with progress messages, then starts it; on Windows the app exits and the
/// installer starts the new version.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    on_progress: Channel<UpdateProgress>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let update = app_state::lock_recovering(&state.update.found)
        .clone()
        .ok_or_else(|| UPDATE_DOWNLOAD_FAILED.to_string())?;
    app_state::lock_recovering(&state.update.download).begin();

    let db_path = state.db_path.clone();
    let version = update.version.clone();
    crate::export::blocking(move || {
        let data_dir = db_path.parent().ok_or("the database has no folder")?;
        let backups = data_dir.join(restore::BACKUPS_DIR_NAME);
        maintenance::backup_before_update(&db_path, &backups, &version, Local::now().naive_local())
    })
    .await
    .map_err(|error| failed(UPDATE_BACKUP_FAILED, error))?;
    // 取消 during the backup: the download never starts.
    if app_state::lock_recovering(&state.update.download).is_cancelled() {
        return Err(UPDATE_CANCELLED.to_string());
    }

    let size = manifest_size(&update.raw_json, update.download_url.as_str());
    let download = {
        let update = update.clone();
        tauri::async_runtime::spawn(async move {
            let (mut downloaded, mut sent) = (0u64, 0u64);
            update
                .download(
                    |chunk, length| {
                        downloaded += chunk as u64;
                        let total = length.or(size);
                        if downloaded - sent >= PROGRESS_STEP || Some(downloaded) == total {
                            sent = downloaded;
                            let _ = on_progress.send(UpdateProgress { downloaded, total });
                        }
                    },
                    || {},
                )
                .await
        })
    };
    let abort = download.inner().abort_handle();
    app_state::lock_recovering(&state.update.download).arm(Box::new(move || abort.abort()));
    let result = download.await;
    if app_state::lock_recovering(&state.update.download).finish() {
        return Err(UPDATE_CANCELLED.to_string());
    }
    let bytes = match result {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(error)) => return Err(failed(UPDATE_DOWNLOAD_FAILED, error)),
        Err(error) => return Err(failed(UPDATE_DOWNLOAD_FAILED, error)),
    };

    let tracker = state.tracker.clone();
    crate::export::blocking(move || {
        update.install(bytes).map_err(|error| {
            // The tracker may already be shut down for an exit that did not happen.
            app_state::lock_tracker(&tracker).resume();
            failed(UPDATE_INSTALL_FAILED, error)
        })
    })
    .await
}

/// 取消 while the installer downloads: stops the download; nothing is installed.
#[tauri::command]
pub fn cancel_update(state: State<'_, AppState>) {
    app_state::lock_recovering(&state.update.download).cancel();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn version(text: &str) -> Version {
        Version::parse(text).unwrap()
    }

    #[test]
    fn offers_only_a_newer_stable_release() {
        let current = version("0.4.6");
        assert!(is_newer_stable(&current, &version("0.4.7")));
        assert!(is_newer_stable(&current, &version("0.10.0")));
        assert!(is_newer_stable(&current, &version("1.0.0")));
        assert!(!is_newer_stable(&current, &version("0.4.6")));
        assert!(!is_newer_stable(&current, &version("0.4.5")));
        assert!(!is_newer_stable(&current, &version("0.4.7-beta.1")));
        assert!(!is_newer_stable(&current, &version("0.5.0-rc.1")));
    }

    #[test]
    fn reads_the_size_listed_beside_the_download_url() {
        let setup = "https://github.com/Awes0meE/Global-Software-Timer/releases/download/v0.4.7/Global.Software.Timer_0.4.7_x64-setup.exe";
        let msi = "https://github.com/Awes0meE/Global-Software-Timer/releases/download/v0.4.7/Global.Software.Timer_0.4.7_x64_en-US.msi";
        let manifest = json!({
            "version": "0.4.7",
            "platforms": {
                "windows-x86_64": { "signature": "s", "url": setup, "size": 6_606_028 },
                "windows-x86_64-msi": { "signature": "s", "url": msi, "size": 7_000_000 }
            }
        });
        assert_eq!(manifest_size(&manifest, setup), Some(6_606_028));
        assert_eq!(manifest_size(&manifest, msi), Some(7_000_000));
        assert_eq!(
            manifest_size(&manifest, "https://example.com/other.exe"),
            None
        );
    }

    #[test]
    fn a_missing_or_unreadable_size_is_unknown() {
        let url = "https://example.com/setup.exe";
        for manifest in [
            json!({ "version": "0.4.7" }),
            json!({ "platforms": [] }),
            json!({ "platforms": { "windows-x86_64": { "url": url } } }),
            json!({ "platforms": { "windows-x86_64": { "url": url, "size": "6.3 MB" } } }),
            json!({ "platforms": { "windows-x86_64": { "url": url, "size": -1 } } }),
            json!({ "platforms": { "windows-x86_64": { "url": url, "size": 0 } } }),
            json!({ "platforms": { "windows-x86_64": { "url": url, "size": 1.5 } } }),
        ] {
            assert_eq!(manifest_size(&manifest, url), None, "{manifest}");
        }
    }

    fn counting_abort(count: &Arc<AtomicUsize>) -> Abort {
        let count = count.clone();
        Box::new(move || {
            count.fetch_add(1, Ordering::SeqCst);
        })
    }

    #[test]
    fn cancel_stops_the_running_download_once() {
        let aborted = Arc::new(AtomicUsize::new(0));
        let mut control = DownloadControl::default();
        control.begin();
        control.arm(counting_abort(&aborted));
        assert_eq!(aborted.load(Ordering::SeqCst), 0);
        control.cancel();
        control.cancel();
        assert_eq!(aborted.load(Ordering::SeqCst), 1);
        assert!(control.finish(), "the run reports it was cancelled");
    }

    #[test]
    fn a_cancel_before_the_download_starts_stops_it_as_soon_as_it_is_armed() {
        let aborted = Arc::new(AtomicUsize::new(0));
        let mut control = DownloadControl::default();
        control.begin();
        control.cancel();
        assert!(control.is_cancelled());
        control.arm(counting_abort(&aborted));
        assert_eq!(aborted.load(Ordering::SeqCst), 1);
        assert!(control.finish());
    }

    #[test]
    fn a_finished_download_cannot_be_aborted_and_a_new_run_starts_uncancelled() {
        let aborted = Arc::new(AtomicUsize::new(0));
        let mut control = DownloadControl::default();
        control.begin();
        control.arm(counting_abort(&aborted));
        assert!(!control.finish());
        control.cancel();
        assert_eq!(aborted.load(Ordering::SeqCst), 0, "nothing left to abort");
        control.begin();
        assert!(!control.is_cancelled());
        control.arm(counting_abort(&aborted));
        assert!(!control.finish());
        assert_eq!(aborted.load(Ordering::SeqCst), 0);
    }
}
