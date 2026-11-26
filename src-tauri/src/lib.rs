pub mod activity;
pub mod app_state;
pub mod appearance;
pub mod background;
pub mod classifier;
pub mod commands;
pub mod domain;
pub mod export;
pub mod foreground;
pub mod local_path;
pub mod maintenance;
pub mod native_icon;
pub mod process_source;
pub mod restore;
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
/// How long a relaunch after a restore waits for the old process to exit.
const RESTORE_HANDOVER_TIMEOUT: Duration = Duration::from_secs(15);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // After a restore the old process relaunches us; wait for it to let go of
    // the database and the single-instance lock instead of quitting.
    let after_restore = restore::after_restore_pid(std::env::args_os());
    if let Some(pid) = after_restore {
        restore::wait_for_process_exit(pid, RESTORE_HANDOVER_TIMEOUT);
    }
    let lock_attempts = if after_restore.is_some() { 25 } else { 1 };
    let _single_instance_guard = match single_instance::acquire_app_lock_with_retry(
        lock_attempts,
        Duration::from_millis(200),
    ) {
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
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(
            native_icon::URI_SCHEME,
            |context, request, responder| {
                let dev_origin = native_icon::dev_server_origin(
                    context.app_handle().config().build.dev_url.as_ref(),
                );
                let request_origin = request
                    .headers()
                    .get(tauri::http::header::ORIGIN)
                    .and_then(|value| value.to_str().ok());
                native_icon::log_first_request_origin(request_origin);
                let allow_origin =
                    native_icon::allowed_cors_origin(request_origin, dev_origin.as_deref())
                        .map(str::to_owned);
                native_icon::resolve_icon(
                    request.uri().path(),
                    Box::new(move |icon| {
                        responder.respond(native_icon::icon_response(icon, allow_origin.as_deref()))
                    }),
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
            let db_path = app_data_dir.join(restore::DB_FILE_NAME);
            // Swaps in a pending restore before any connection opens.
            let backups_dir = app_data_dir.join(restore::BACKUPS_DIR_NAME);
            let (state, restore_status) =
                restore::run_startup_swap(&app_data_dir, Local::now().naive_local(), |path| {
                    // v0.4.5: drop the legacy heartbeat log once, after a backup,
                    // before any connection to the live file opens.
                    match maintenance::prune_legacy_heartbeats(
                        path,
                        &backups_dir,
                        Local::now().naive_local(),
                    ) {
                        Ok(Some(report)) => eprintln!(
                            "removed {} legacy heartbeat events; copy kept at {}",
                            report.removed,
                            report.backup.display()
                        ),
                        Ok(None) => {}
                        Err(error) => eprintln!("legacy heartbeat cleanup skipped: {error}"),
                    }
                    AppState::new(path.to_path_buf())
                });
            let state = state.unwrap_or_else(|error| match error {
                restore::StartupError::Open(error) => {
                    fatal_startup_error(&startup_store_error_message(&db_path, &error))
                }
                restore::StartupError::RestoreStuck => {
                    fatal_startup_error(&restore_stuck_message(&app_data_dir))
                }
            });
            state.restore.set_status(restore_status);
            // Apply 文字大小 before the page loads so it never shows at 100% first.
            let text_size = {
                let tracker = app_state::lock_tracker(&state.tracker);
                commands::app_settings_from_store(tracker.store())
                    .map(|settings| settings.text_size)
            };
            match text_size {
                Ok(size) => commands::apply_main_window_text_size(app.handle(), size),
                Err(error) => eprintln!("could not read the text size: {error}"),
            }
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
            commands::get_statistics_export,
            commands::get_timeline_summary,
            commands::get_achievements_summary,
            commands::get_milestone_software,
            commands::get_calendar_summary,
            commands::run_tracker_scan_once,
            commands::add_focused_software_identities,
            commands::remove_focused_software_identity,
            commands::add_hidden_software_identities,
            commands::remove_hidden_software_identity,
            commands::get_app_settings,
            commands::get_transparency_effects_enabled,
            commands::get_windows_accent,
            commands::get_close_behavior_preference,
            commands::set_autostart_preference,
            commands::set_close_behavior_preference,
            commands::set_duration_format_preference,
            commands::set_theme_preference,
            commands::set_ui_preference,
            commands::apply_window_close_choice,
            export::save_text_export,
            export::save_binary_export,
            export::reveal_saved_file,
            export::export_settings_file,
            export::pick_settings_import,
            export::apply_settings_import,
            export::backup_all_data,
            restore::open_data_folder,
            restore::pick_restore_backup,
            restore::apply_restore,
            restore::discard_restore,
            restore::get_restore_status
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
                drop(tracker);
                restore::relaunch_if_requested();
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

fn restore_stuck_message(data_dir: &std::path::Path) -> String {
    format!(
        "从备份恢复没有完成：数据文件暂时无法移动。\n\n请关闭占用数据文件夹的程序（如杀毒或备份工具）后重新打开全局软件计时器，现有数据不会丢失。\n\n数据文件夹：{}",
        data_dir.display()
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
