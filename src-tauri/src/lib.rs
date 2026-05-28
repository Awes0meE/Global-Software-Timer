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
use tauri::Manager;

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
            app.manage(state);
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
