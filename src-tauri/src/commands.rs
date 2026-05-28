use crate::app_state::AppState;
use serde::Serialize;
use tauri::State;

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
    pub total_seconds: i64,
    pub today_seconds: i64,
    pub is_running: bool,
}

#[tauri::command]
pub fn get_dashboard_summary(_state: State<'_, AppState>) -> DashboardSummary {
    DashboardSummary {
        product_title: "全局软件计时器".to_string(),
        locale: "zh-CN".to_string(),
        most_used: None,
        recorded_today_seconds: 0,
        active_today_seconds: 0,
        apps: Vec::new(),
    }
}

#[tauri::command]
pub fn run_tracker_scan_once(state: State<'_, AppState>) -> Result<(), String> {
    let mut tracker = state
        .tracker
        .lock()
        .map_err(|_| "tracker mutex poisoned".to_string())?;
    tracker.scan_once().map_err(|error| error.to_string())
}
