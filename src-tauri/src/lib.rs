pub mod activity;
pub mod app_state;
pub mod background;
pub mod classifier;
pub mod commands;
pub mod domain;
pub mod foreground;
pub mod native_icon;
pub mod process_source;
pub mod single_instance;
pub mod statistics;
pub mod storage;
pub mod tracker;
pub mod tray;
pub mod tray_icons;
#[cfg(windows)]
pub mod window_icon;
pub mod window_info;

use app_state::AppState;
use app_state::SharedTracker;
use chrono::Local;
use single_instance::SingleInstance;
use std::time::{Duration, Instant};
use tauri::Manager;

const TRACKER_SCAN_INTERVAL: Duration = Duration::from_secs(5);
const ACTIVE_IDLE_THRESHOLD: Duration = Duration::from_secs(5 * 60);
const APP_WINDOW_TITLE: &str = "全局软件计时器";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _single_instance_guard = match single_instance::acquire_app_lock() {
        Ok(SingleInstance::Acquired(guard)) => guard,
        Ok(SingleInstance::AlreadyRunning) => {
            // Launching again (e.g. from the Start menu while hidden in the
            // tray) should bring the running dashboard back, not do nothing.
            single_instance::show_existing_window(APP_WINDOW_TITLE);
            return;
        }
        Err(error) => fatal_startup_error(&format!("无法检查是否已有实例在运行：{error}")),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .register_asynchronous_uri_scheme_protocol(
            native_icon::URI_SCHEME,
            |_context, request, responder| {
                native_icon::resolve_icon(
                    request.uri().path(),
                    Box::new(move |icon| responder.respond(native_icon::icon_response(icon))),
                );
            },
        )
        .setup(|app| {
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window_icon::apply(&window) {
                    eprintln!("could not set the taskbar icon: {error}");
                }
            }
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|error| fatal_startup_error(&format!("无法定位数据目录：{error}")));
            if let Err(error) = std::fs::create_dir_all(&app_data_dir) {
                fatal_startup_error(&format!(
                    "无法创建数据目录 {}：{error}",
                    app_data_dir.display()
                ));
            }
            match app.path().app_cache_dir() {
                Ok(cache_dir) => native_icon::init_disk_cache(cache_dir.join("icons")),
                Err(error) => eprintln!("icons will not be cached on disk: {error}"),
            }
            let db_path = app_data_dir.join("global-software-timer.sqlite3");
            let state = AppState::new(db_path.clone()).unwrap_or_else(|error| {
                fatal_startup_error(&startup_store_error_message(&db_path, &error))
            });
            let tracker = state.tracker.clone();
            let live = state.live.clone();
            app.manage(state);
            start_background_scan_loop(tracker, live);
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard_summary,
            commands::get_software_page_summary,
            commands::get_background_page_summary,
            commands::get_statistics_summary,
            commands::get_timeline_summary,
            commands::get_achievements_summary,
            commands::run_tracker_scan_once,
            commands::add_focused_software_identities,
            commands::remove_focused_software_identity,
            commands::add_hidden_software_identities,
            commands::remove_hidden_software_identity,
            commands::get_app_settings,
            commands::get_close_behavior_preference,
            commands::set_autostart_preference,
            commands::set_close_behavior_preference,
            commands::set_duration_format_preference,
            commands::set_theme_preference,
            commands::apply_window_close_choice
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Global Software Timer")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                let mut tracker = app_state::lock_tracker(&state.tracker);
                if let Err(error) = tracker.shutdown() {
                    eprintln!("tracker shutdown failed: {error}");
                }
            }
        });
}

fn start_background_scan_loop(tracker: SharedTracker, live: app_state::SharedSample) {
    std::thread::spawn(move || {
        let activity_source = activity::WindowsActivitySource;
        let mut last_tick = Instant::now();
        loop {
            std::thread::sleep(TRACKER_SCAN_INTERVAL);
            let tick_duration = last_tick.elapsed();
            last_tick = Instant::now();

            let mut tracker = app_state::lock_tracker(&tracker);
            tracker.run_automatic_scan(|tracker| {
                tracker::run_tracker_tick_with_foreground(
                    tracker,
                    &activity_source,
                    &foreground::WindowsForegroundWindowSource,
                    Local::now(),
                    tick_duration,
                    ACTIVE_IDLE_THRESHOLD,
                )
            });
            app_state::LiveSample::publish(&tracker, &live);
        }
    });
}

fn startup_store_error_message(db_path: &std::path::Path, error: &storage::StoreError) -> String {
    let hint = match error {
        storage::StoreError::UnsupportedSchemaVersion { .. } => {
            "这个数据库由更新版本的全局软件计时器创建。请安装最新版本后再打开。"
        }
        _ => "数据库可能被其他程序占用或已损坏。请关闭占用它的程序（如杀毒或备份工具）后重试。",
    };
    format!(
        "无法打开本地数据：{error}\n\n{hint}\n\n数据文件：{}",
        db_path.display()
    )
}

/// Release builds have no console, so a panic at login would fail silently.
fn fatal_startup_error(message: &str) -> ! {
    eprintln!("{message}");
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let text = wide(message);
        let caption = wide(APP_WINDOW_TITLE);
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                text.as_ptr(),
                caption.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
    std::process::exit(1)
}
