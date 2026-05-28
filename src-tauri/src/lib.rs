pub mod activity;
pub mod app_state;
pub mod classifier;
pub mod commands;
pub mod domain;
pub mod process_source;
pub mod storage;
pub mod tracker;
pub mod tray;

use app_state::AppState;
use app_state::SharedTracker;
use chrono::Local;
use std::time::{Duration, Instant};
use tauri::Manager;

const TRACKER_SCAN_INTERVAL: Duration = Duration::from_secs(5);
const ACTIVE_IDLE_THRESHOLD: Duration = Duration::from_secs(5 * 60);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            let db_path = app_data_dir.join("global-software-timer.sqlite3");
            let state = AppState::new(db_path).expect("failed to initialize app state");
            let tracker = state.tracker.clone();
            app.manage(state);
            start_background_scan_loop(tracker);
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard_summary,
            commands::run_tracker_scan_once
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Global Software Timer");
}

fn start_background_scan_loop(tracker: SharedTracker) {
    std::thread::spawn(move || {
        let activity_source = activity::WindowsActivitySource;
        let mut last_tick = Instant::now();
        loop {
            std::thread::sleep(TRACKER_SCAN_INTERVAL);
            let tick_duration = last_tick.elapsed();
            last_tick = Instant::now();

            match tracker.lock() {
                Ok(mut tracker) => {
                    if let Err(error) = tracker::run_tracker_tick(
                        &mut tracker,
                        &activity_source,
                        Local::now().date_naive(),
                        tick_duration,
                        ACTIVE_IDLE_THRESHOLD,
                    ) {
                        eprintln!("tracker scan failed: {error}");
                    }
                }
                Err(_) => eprintln!("tracker scan failed: tracker mutex poisoned"),
            }
        }
    });
}
