use crate::app_state::AppState;
use crate::domain::AppUsageSummary;
use crate::native_icon::native_icon_data_url_for_path;
use crate::storage::{Store, StoreError};
use chrono::{DateTime, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

const CLOSE_BEHAVIOR_SETTING_KEY: &str = "window.close_behavior";

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
    pub is_running: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
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

#[tauri::command]
pub fn get_dashboard_summary(state: State<'_, AppState>) -> Result<DashboardSummary, String> {
    let tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    let now_utc = Utc::now();
    dashboard_summary_from_store(tracker.store(), local_day_start_utc(), now_utc)
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

fn dashboard_summary_from_store(
    store: &Store,
    day_start_utc: DateTime<Utc>,
    now_utc: DateTime<Utc>,
) -> Result<DashboardSummary, StoreError> {
    let usage_date = day_start_utc.with_timezone(&Local).date_naive();
    let apps = store
        .app_usage_summary_for_date(day_start_utc, now_utc, usage_date)?
        .into_iter()
        .map(AppUsageRow::from)
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

fn local_day_start_utc() -> DateTime<Utc> {
    let local_date = Local::now().date_naive();
    let local_midnight = Local
        .from_local_datetime(&local_date.and_hms_opt(0, 0, 0).expect("valid midnight"))
        .single()
        .unwrap_or_else(Local::now);
    local_midnight.with_timezone(&Utc)
}

impl From<AppUsageSummary> for AppUsageRow {
    fn from(summary: AppUsageSummary) -> Self {
        Self {
            app_id: summary.app_id,
            display_name: summary.display_name,
            process_name: summary.process_name,
            icon_data_url: native_icon_data_url_for_path(&summary.executable_path),
            total_seconds: summary.total_seconds,
            today_seconds: summary.today_seconds,
            active_today_seconds: summary.active_today_seconds,
            is_running: summary.is_running,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::dashboard_summary_from_store;
    use crate::storage::Store;
    use chrono::{TimeZone, Utc};
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
    }
}
