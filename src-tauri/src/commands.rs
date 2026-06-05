use crate::app_state::AppState;
use crate::domain::{AppRuntimeStatus, AppUsageSummary, SoftwarePageRow};
use crate::native_icon::native_icon_data_url_for_path;
use crate::storage::{Store, StoreError};
use chrono::{DateTime, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};

const CLOSE_BEHAVIOR_SETTING_KEY: &str = "window.close_behavior";
const AUTOSTART_SETTING_KEY: &str = "startup.autostart_enabled";
const DEFAULT_CLOSE_BEHAVIOR: CloseBehavior = CloseBehavior::MinimizeToTray;
const DEFAULT_AUTOSTART_ENABLED: bool = true;

#[derive(Debug, Clone, Serialize)]
pub struct DashboardSummary {
    pub product_title: String,
    pub locale: String,
    pub most_used: Option<AppUsageRow>,
    pub recorded_today_seconds: i64,
    pub active_today_seconds: i64,
    pub apps: Vec<AppUsageRow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppUsageRow {
    pub app_id: i64,
    pub display_name: String,
    pub process_name: String,
    pub icon_data_url: Option<String>,
    pub total_seconds: i64,
    pub today_seconds: i64,
    pub active_today_seconds: i64,
    pub status: AppRuntimeStatus,
    pub is_running: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwarePageSummary {
    pub focused: Vec<SoftwarePageRowDto>,
    pub hidden: Vec<SoftwarePageRowDto>,
    pub discovered: Vec<SoftwarePageRowDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwarePageRowDto {
    pub identity_key: String,
    pub display_name: String,
    pub process_name: String,
    pub icon_data_url: Option<String>,
    pub today_runtime_seconds: i64,
    pub today_focused_seconds: i64,
    pub total_runtime_seconds: i64,
    pub total_focused_seconds: i64,
    pub today_foreground_seconds: i64,
    pub today_background_seconds: i64,
    pub total_foreground_seconds: i64,
    pub total_background_seconds: i64,
    pub last_opened_at: Option<String>,
    pub status: AppRuntimeStatus,
    pub mark: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    Exit,
    MinimizeToTray,
}

impl CloseBehavior {
    fn as_str(self) -> &'static str {
        match self {
            Self::Exit => "exit",
            Self::MinimizeToTray => "minimize_to_tray",
        }
    }

    fn from_setting(value: &str) -> Option<Self> {
        match value {
            "exit" => Some(Self::Exit),
            "minimize_to_tray" => Some(Self::MinimizeToTray),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppSettings {
    pub close_behavior: CloseBehavior,
    pub close_behavior_configured: bool,
    pub autostart_enabled: bool,
    pub autostart_configured: bool,
}

#[tauri::command]
pub fn get_dashboard_summary(state: State<'_, AppState>) -> Result<DashboardSummary, String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    let now_utc = Utc::now();
    dashboard_summary_from_store(
        tracker.store(),
        local_day_start_utc(),
        now_utc,
        tracker.runtime_status_by_app_id(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_software_page_summary(
    state: State<'_, AppState>,
) -> Result<SoftwarePageSummary, String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    let now_utc = Utc::now();
    software_page_summary_from_store(
        tracker.store(),
        local_day_start_utc(),
        now_utc,
        tracker.runtime_status_by_app_id(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_tracker_scan_once(state: State<'_, AppState>) -> Result<(), String> {
    let mut tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .scan_once()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_focused_software_identities(
    state: State<'_, AppState>,
    identity_keys: Vec<String>,
) -> Result<(), String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .store()
        .add_focused_software_identities(&identity_keys)
        .map_err(software_list_command_error)
}

#[tauri::command]
pub fn remove_focused_software_identity(
    state: State<'_, AppState>,
    identity_key: String,
) -> Result<(), String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .store()
        .remove_focused_software_identity(&identity_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_hidden_software_identities(
    state: State<'_, AppState>,
    identity_keys: Vec<String>,
) -> Result<(), String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .store()
        .add_hidden_software_identities(&identity_keys)
        .map_err(software_list_command_error)
}

#[tauri::command]
pub fn remove_hidden_software_identity(
    state: State<'_, AppState>,
    identity_key: String,
) -> Result<(), String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .store()
        .remove_hidden_software_identity(&identity_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    app_settings_from_store(tracker.store()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_close_behavior_preference(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    let preference = tracker
        .store()
        .setting_value(CLOSE_BEHAVIOR_SETTING_KEY)
        .map_err(|error| error.to_string())?;

    Ok(preference
        .as_deref()
        .and_then(CloseBehavior::from_setting)
        .map(|behavior| behavior.as_str().to_string()))
}

#[tauri::command]
pub fn set_close_behavior_preference(
    state: State<'_, AppState>,
    choice: CloseBehavior,
) -> Result<(), String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .store()
        .set_setting_value(CLOSE_BEHAVIOR_SETTING_KEY, choice.as_str())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_autostart_preference(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker
        .store()
        .set_setting_value(
            AUTOSTART_SETTING_KEY,
            if enabled { "true" } else { "false" },
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_window_close_choice(
    app: AppHandle,
    state: State<'_, AppState>,
    choice: CloseBehavior,
    remember: bool,
) -> Result<(), String> {
    if remember {
        let tracker = state
            .tracker
            .lock()
            .map_err(|_| "tracker mutex poisoned".to_string())?;
        tracker
            .store()
            .set_setting_value(CLOSE_BEHAVIOR_SETTING_KEY, choice.as_str())
            .map_err(|error| error.to_string())?;
    }

    match choice {
        CloseBehavior::Exit => app.exit(0),
        CloseBehavior::MinimizeToTray => {
            if let Some(window) = app.get_webview_window("main") {
                window.hide().map_err(|error| error.to_string())?;
            }
        }
    }

    Ok(())
}

fn app_settings_from_store(store: &Store) -> Result<AppSettings, StoreError> {
    let stored_close_behavior = store
        .setting_value(CLOSE_BEHAVIOR_SETTING_KEY)?
        .as_deref()
        .and_then(CloseBehavior::from_setting);
    let close_behavior = stored_close_behavior.unwrap_or(DEFAULT_CLOSE_BEHAVIOR);
    let (autostart_enabled, autostart_configured) =
        bool_setting_from_store(store, AUTOSTART_SETTING_KEY, DEFAULT_AUTOSTART_ENABLED)?;

    Ok(AppSettings {
        close_behavior,
        close_behavior_configured: stored_close_behavior.is_some(),
        autostart_enabled,
        autostart_configured,
    })
}

fn bool_setting_from_store(
    store: &Store,
    key: &str,
    default_value: bool,
) -> Result<(bool, bool), StoreError> {
    let Some(value) = store.setting_value(key)? else {
        return Ok((default_value, false));
    };

    match value.as_str() {
        "true" => Ok((true, true)),
        "false" => Ok((false, true)),
        _ => Ok((default_value, false)),
    }
}

fn software_list_command_error(error: StoreError) -> String {
    match error {
        StoreError::SoftwareIdentityListConflict {
            conflicting_list: "hidden",
            ..
        } => "software_conflict_hidden".to_string(),
        StoreError::SoftwareIdentityListConflict {
            conflicting_list: "focused",
            ..
        } => "software_conflict_focused".to_string(),
        error => error.to_string(),
    }
}

fn dashboard_summary_from_store(
    store: &Store,
    day_start_utc: DateTime<Utc>,
    now_utc: DateTime<Utc>,
    runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
) -> Result<DashboardSummary, StoreError> {
    let usage_date = day_start_utc.with_timezone(&Local).date_naive();
    let apps = store
        .app_usage_summary_for_date(day_start_utc, now_utc, usage_date)?
        .into_iter()
        .map(|summary| AppUsageRow::from_summary(summary, runtime_status_by_app_id))
        .collect::<Vec<_>>();
    let daily_usage = store.daily_system_usage(usage_date)?;

    Ok(DashboardSummary {
        product_title: "全局软件计时器".to_string(),
        locale: "zh-CN".to_string(),
        most_used: apps.first().cloned(),
        recorded_today_seconds: daily_usage
            .as_ref()
            .map(|usage| usage.recorded_seconds)
            .unwrap_or(0),
        active_today_seconds: daily_usage
            .as_ref()
            .map(|usage| usage.active_seconds)
            .unwrap_or(0),
        apps,
    })
}

fn software_page_summary_from_store(
    store: &Store,
    day_start_utc: DateTime<Utc>,
    now_utc: DateTime<Utc>,
    runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
) -> Result<SoftwarePageSummary, StoreError> {
    let usage_date = day_start_utc.with_timezone(&Local).date_naive();
    let rows =
        store.software_page_rows(day_start_utc, now_utc, usage_date, runtime_status_by_app_id)?;

    Ok(SoftwarePageSummary {
        focused: rows
            .focused
            .into_iter()
            .map(|row| SoftwarePageRowDto::from_row(row, runtime_status_by_app_id))
            .collect(),
        hidden: rows
            .hidden
            .into_iter()
            .map(|row| SoftwarePageRowDto::from_row(row, runtime_status_by_app_id))
            .collect(),
        discovered: rows
            .discovered
            .into_iter()
            .map(|row| SoftwarePageRowDto::from_row(row, runtime_status_by_app_id))
            .collect(),
    })
}

fn local_day_start_utc() -> DateTime<Utc> {
    let local_date = Local::now().date_naive();
    let local_midnight = Local
        .from_local_datetime(&local_date.and_hms_opt(0, 0, 0).expect("valid midnight"))
        .single()
        .unwrap_or_else(Local::now);
    local_midnight.with_timezone(&Utc)
}

impl AppUsageRow {
    fn from_summary(
        summary: AppUsageSummary,
        runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
    ) -> Self {
        let status = runtime_status_for_summary(&summary, runtime_status_by_app_id);

        Self {
            app_id: summary.app_id,
            display_name: summary.display_name,
            process_name: summary.process_name,
            icon_data_url: native_icon_data_url_for_path(&summary.executable_path),
            total_seconds: summary.total_seconds,
            today_seconds: summary.today_seconds,
            active_today_seconds: summary.active_today_seconds,
            status,
            is_running: status == AppRuntimeStatus::Foreground,
        }
    }
}

impl SoftwarePageRowDto {
    fn from_row(
        row: SoftwarePageRow,
        runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
    ) -> Self {
        let status = runtime_status_for_app_ids(&row.app_ids, runtime_status_by_app_id);

        Self {
            identity_key: row.identity_key,
            display_name: row.display_name,
            process_name: row.process_name,
            icon_data_url: native_icon_data_url_for_path(&row.executable_path),
            today_runtime_seconds: row.today_runtime_seconds,
            today_focused_seconds: row.today_focused_seconds,
            total_runtime_seconds: row.total_runtime_seconds,
            total_focused_seconds: row.total_focused_seconds,
            today_foreground_seconds: row.today_foreground_seconds,
            today_background_seconds: row.today_background_seconds,
            total_foreground_seconds: row.total_foreground_seconds,
            total_background_seconds: row.total_background_seconds,
            last_opened_at: row.last_opened_at.map(|value| value.to_rfc3339()),
            status,
            mark: row.mark,
        }
    }
}

fn runtime_status_for_summary(
    summary: &AppUsageSummary,
    runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
) -> AppRuntimeStatus {
    runtime_status_for_app_ids(&summary.app_ids, runtime_status_by_app_id)
}

fn runtime_status_for_app_ids(
    app_ids: &[i64],
    runtime_status_by_app_id: &HashMap<i64, AppRuntimeStatus>,
) -> AppRuntimeStatus {
    let mut status = AppRuntimeStatus::Closed;

    for app_id in app_ids {
        let candidate = runtime_status_by_app_id
            .get(app_id)
            .copied()
            .unwrap_or(AppRuntimeStatus::Closed);
        if runtime_status_rank(candidate) > runtime_status_rank(status) {
            status = candidate;
        }
    }

    status
}

fn runtime_status_rank(status: AppRuntimeStatus) -> u8 {
    match status {
        AppRuntimeStatus::Closed => 0,
        AppRuntimeStatus::Background => 1,
        AppRuntimeStatus::Foreground => 2,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        app_settings_from_store, dashboard_summary_from_store, software_list_command_error,
        CloseBehavior,
    };
    use crate::domain::AppRuntimeStatus;
    use crate::storage::{Store, StoreError};
    use chrono::{TimeZone, Utc};
    use std::collections::HashMap;
    use tempfile::NamedTempFile;

    #[test]
    fn dashboard_summary_reads_sessions_and_daily_system_usage() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let app = store
            .upsert_app(
                "Code.exe",
                r"C:\Users\dev\AppData\Local\Programs\Microsoft VS Code\Code.exe",
                "Visual Studio Code",
            )
            .expect("app");
        let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 8, 0, 0).unwrap();
        let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 8, 1, 0).unwrap();
        let session_id = store.start_session(app.id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
        let usage_date = chrono::NaiveDate::from_ymd_opt(2026, 5, 29).unwrap();
        store
            .increment_daily_system_usage(usage_date, 300, 120, 300)
            .expect("system usage");

        let summary = dashboard_summary_from_store(
            &store,
            Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 29, 8, 2, 0).unwrap(),
            &HashMap::new(),
        )
        .expect("summary");

        assert_eq!(summary.product_title, "全局软件计时器");
        assert_eq!(summary.locale, "zh-CN");
        assert_eq!(summary.recorded_today_seconds, 300);
        assert_eq!(summary.active_today_seconds, 120);
        assert_eq!(summary.apps.len(), 1);
        assert_eq!(
            summary.most_used.as_ref().unwrap().display_name,
            "Visual Studio Code"
        );
        assert!(summary.apps[0].icon_data_url.is_none());
        assert_eq!(summary.apps[0].status, AppRuntimeStatus::Closed);
    }

    #[test]
    fn dashboard_summary_overlays_live_background_status() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let app = store
            .upsert_app(
                "msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                "Microsoft Edge",
            )
            .expect("app");
        let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 8, 0, 0).unwrap();
        let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 8, 1, 0).unwrap();
        let session_id = store.start_session(app.id, started_at).expect("start");
        store
            .close_session(session_id, ended_at, "process_closed", false)
            .expect("close");
        let mut statuses = HashMap::new();
        statuses.insert(app.id, AppRuntimeStatus::Background);

        let summary = dashboard_summary_from_store(
            &store,
            Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 29, 8, 2, 0).unwrap(),
            &statuses,
        )
        .expect("summary");

        assert_eq!(summary.apps[0].status, AppRuntimeStatus::Background);
        assert!(!summary.apps[0].is_running);
    }

    #[test]
    fn dashboard_summary_overlays_foreground_status_from_merged_wps_component() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let short_path_wps = store
            .upsert_app(
                "wps.exe",
                r"D:\Users\123\AppData\Local\Kingsoft\WPSOFF~1\1210~1.263\office6\wps.exe",
                "WPS Office",
            )
            .expect("short path app");
        let wps_pdf = store
            .upsert_app(
                "wpspdf.exe",
                r"D:\Users\123\AppData\Local\Kingsoft\WPS Office\12.1.0.26375\office6\wpspdf.exe",
                "WPS Office",
            )
            .expect("pdf app");
        let started_at = Utc.with_ymd_and_hms(2026, 5, 29, 8, 0, 0).unwrap();
        let ended_at = Utc.with_ymd_and_hms(2026, 5, 29, 8, 1, 0).unwrap();
        for app_id in [short_path_wps.id, wps_pdf.id] {
            let session_id = store.start_session(app_id, started_at).expect("start");
            store
                .close_session(session_id, ended_at, "process_closed", false)
                .expect("close");
        }
        let mut statuses = HashMap::new();
        statuses.insert(short_path_wps.id, AppRuntimeStatus::Background);
        statuses.insert(wps_pdf.id, AppRuntimeStatus::Foreground);

        let summary = dashboard_summary_from_store(
            &store,
            Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 29, 8, 2, 0).unwrap(),
            &statuses,
        )
        .expect("summary");

        assert_eq!(summary.apps.len(), 1);
        assert_eq!(summary.apps[0].display_name, "WPS Office");
        assert_eq!(summary.apps[0].status, AppRuntimeStatus::Foreground);
        assert!(summary.apps[0].is_running);
    }

    #[test]
    fn app_settings_defaults_close_behavior_to_minimize_to_tray() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");

        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.close_behavior, CloseBehavior::MinimizeToTray);
        assert!(!settings.close_behavior_configured);
        assert!(settings.autostart_enabled);
        assert!(!settings.autostart_configured);

        store
            .set_setting_value("window.close_behavior", "exit")
            .expect("set setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.close_behavior, CloseBehavior::Exit);
        assert!(settings.close_behavior_configured);

        store
            .set_setting_value("window.close_behavior", "unexpected")
            .expect("set invalid setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.close_behavior, CloseBehavior::MinimizeToTray);
        assert!(!settings.close_behavior_configured);
    }

    #[test]
    fn app_settings_defaults_autostart_to_enabled() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");

        let settings = app_settings_from_store(&store).expect("settings");
        assert!(settings.autostart_enabled);
        assert!(!settings.autostart_configured);

        store
            .set_setting_value("startup.autostart_enabled", "false")
            .expect("set setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert!(!settings.autostart_enabled);
        assert!(settings.autostart_configured);

        store
            .set_setting_value("startup.autostart_enabled", "unexpected")
            .expect("set invalid setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert!(settings.autostart_enabled);
        assert!(!settings.autostart_configured);
    }

    #[test]
    fn software_list_command_error_returns_stable_conflict_codes() {
        let hidden_error = StoreError::SoftwareIdentityListConflict {
            identity_key: "app:bitdock".to_string(),
            conflicting_list: "hidden",
        };
        let focused_error = StoreError::SoftwareIdentityListConflict {
            identity_key: "app:code".to_string(),
            conflicting_list: "focused",
        };

        assert_eq!(
            software_list_command_error(hidden_error),
            "software_conflict_hidden"
        );
        assert_eq!(
            software_list_command_error(focused_error),
            "software_conflict_focused"
        );
    }
}
