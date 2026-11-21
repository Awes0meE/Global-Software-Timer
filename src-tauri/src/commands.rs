use crate::app_state::AppState;
use crate::background::BackgroundProcessGroup;
use crate::domain::{AppRuntimeStatus, AppUsageSummary, SoftwarePageRow};
use crate::native_icon::cached_native_icon;
use crate::storage::{BackgroundUsage, Store, StoreError};
use chrono::{DateTime, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};

const CLOSE_BEHAVIOR_SETTING_KEY: &str = "window.close_behavior";
const AUTOSTART_SETTING_KEY: &str = "startup.autostart_enabled";
const DURATION_FORMAT_SETTING_KEY: &str = "ui.duration_format";
const THEME_SETTING_KEY: &str = "ui.theme";
const DEFAULT_CLOSE_BEHAVIOR: CloseBehavior = CloseBehavior::MinimizeToTray;
const DEFAULT_AUTOSTART_ENABLED: bool = true;
const DEFAULT_DURATION_FORMAT: DurationFormat = DurationFormat::DecimalHours;
const DEFAULT_THEME: ThemePreference = ThemePreference::System;

#[derive(Debug, Clone, Serialize)]
pub struct DashboardSummary {
    pub last_scan_succeeded: Option<bool>,
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
pub struct BackgroundPageSummary {
    /// Logical processors; `cpu_percent` is already divided by this.
    pub logical_cores: u32,
    pub running_count: usize,
    pub rows: Vec<BackgroundRowDto>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BackgroundRowDto {
    pub family_key: String,
    pub display_name: String,
    pub process_name: String,
    pub icon_data_url: Option<String>,
    pub is_running: bool,
    pub process_count: u32,
    /// Share of the whole machine's CPU right now (0-100), when running.
    pub cpu_percent: Option<f32>,
    /// Current memory when running, else today's peak.
    pub memory_bytes: u64,
    pub today_running_seconds: i64,
    /// Core-seconds of CPU used today.
    pub today_cpu_seconds: f64,
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

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DurationFormat {
    DecimalHours,
    HoursMinutes,
}

impl DurationFormat {
    fn as_str(self) -> &'static str {
        match self {
            Self::DecimalHours => "decimal_hours",
            Self::HoursMinutes => "hours_minutes",
        }
    }

    fn from_setting(value: &str) -> Option<Self> {
        match value {
            "decimal_hours" => Some(Self::DecimalHours),
            "hours_minutes" => Some(Self::HoursMinutes),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    System,
    Light,
    Dark,
}

impl ThemePreference {
    fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    fn from_setting(value: &str) -> Option<Self> {
        match value {
            "system" => Some(Self::System),
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
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
    pub duration_format: DurationFormat,
    pub duration_format_configured: bool,
    pub theme: ThemePreference,
    pub theme_configured: bool,
}

// Summaries use a read-only transaction and the last published process sample.
#[tauri::command(async)]
pub fn get_dashboard_summary(state: State<'_, AppState>) -> Result<DashboardSummary, String> {
    let live = crate::app_state::lock_recovering(&state.live).clone();
    let store = crate::app_state::lock_recovering(&state.summary_store);
    let transaction = store.savepoint().map_err(|error| error.to_string())?;
    let now_utc = Utc::now();
    let summary = dashboard_summary_from_store(
        &store,
        local_day_start_utc(),
        now_utc,
        &live.statuses,
        live.last_scan_succeeded,
    )
    .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(summary)
}

#[tauri::command(async)]
pub fn get_software_page_summary(
    state: State<'_, AppState>,
) -> Result<SoftwarePageSummary, String> {
    let live = crate::app_state::lock_recovering(&state.live).clone();
    let store = crate::app_state::lock_recovering(&state.summary_store);
    let transaction = store.savepoint().map_err(|error| error.to_string())?;
    let now_utc = Utc::now();
    let summary =
        software_page_summary_from_store(&store, local_day_start_utc(), now_utc, &live.statuses)
            .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(summary)
}

#[tauri::command(async)]
pub fn get_background_page_summary(
    state: State<'_, AppState>,
) -> Result<BackgroundPageSummary, String> {
    let live = crate::app_state::lock_recovering(&state.live).clone();
    let store = crate::app_state::lock_recovering(&state.summary_store);
    let stored = store
        .background_usage_for_date(Local::now().date_naive())
        .map_err(|error| error.to_string())?;
    let cores = std::thread::available_parallelism()
        .map(|count| count.get() as u32)
        .unwrap_or(1);
    let rows = background_rows(stored, live.background.clone(), cores);
    Ok(BackgroundPageSummary {
        logical_cores: cores,
        running_count: rows.iter().filter(|(row, _)| row.is_running).count(),
        rows: rows
            .into_iter()
            .map(|(row, path)| BackgroundRowDto {
                icon_data_url: cached_native_icon(&path),
                ..row
            })
            .collect(),
    })
}

/// Today's stored totals overlaid with the latest live sample. Sorted by
/// today's CPU use, so the heaviest background software comes first.
fn background_rows(
    stored: Vec<BackgroundUsage>,
    live: Vec<BackgroundProcessGroup>,
    logical_cores: u32,
) -> Vec<(BackgroundRowDto, String)> {
    let mut rows: HashMap<String, (BackgroundRowDto, String)> = HashMap::new();
    for usage in stored {
        rows.insert(
            usage.family_key.clone(),
            (
                BackgroundRowDto {
                    family_key: usage.family_key,
                    display_name: usage.display_name,
                    process_name: usage.process_name,
                    icon_data_url: None,
                    is_running: false,
                    process_count: u32::try_from(usage.peak_process_count).unwrap_or(0),
                    cpu_percent: None,
                    memory_bytes: u64::try_from(usage.peak_memory_bytes).unwrap_or(0),
                    today_running_seconds: usage.running_seconds,
                    today_cpu_seconds: usage.cpu_core_seconds,
                },
                usage.executable_path,
            ),
        );
    }
    for group in live {
        let (row, path) = rows.entry(group.family_key.clone()).or_insert_with(|| {
            (
                BackgroundRowDto {
                    family_key: group.family_key.clone(),
                    display_name: group.display_name.clone(),
                    process_name: group.process_name.clone(),
                    icon_data_url: None,
                    is_running: true,
                    process_count: 0,
                    cpu_percent: None,
                    memory_bytes: 0,
                    today_running_seconds: 0,
                    today_cpu_seconds: 0.0,
                },
                group.executable_path.clone(),
            )
        });
        row.is_running = true;
        row.display_name = group.display_name;
        row.process_count = group.process_count;
        row.cpu_percent = Some(group.cpu_percent / logical_cores.max(1) as f32);
        row.memory_bytes = group.memory_bytes;
        if !group.executable_path.is_empty() {
            *path = group.executable_path;
        }
    }
    let mut rows = rows.into_values().collect::<Vec<_>>();
    rows.sort_by(|(left, _), (right, _)| {
        right
            .today_cpu_seconds
            .total_cmp(&left.today_cpu_seconds)
            .then_with(|| right.is_running.cmp(&left.is_running))
            .then_with(|| right.today_running_seconds.cmp(&left.today_running_seconds))
            .then_with(|| left.family_key.cmp(&right.family_key))
    });
    rows
}

#[tauri::command(async)]
pub fn run_tracker_scan_once(state: State<'_, AppState>) -> Result<(), String> {
    let mut tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker.scan_once().map_err(|error| error.to_string())?;
    crate::app_state::LiveSample::publish(&tracker, &state.live);
    Ok(())
}

#[tauri::command(async)]
pub fn add_focused_software_identities(
    state: State<'_, AppState>,
    identity_keys: Vec<String>,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker
        .store()
        .add_focused_software_identities(&identity_keys)
        .map_err(software_list_command_error)
}

#[tauri::command(async)]
pub fn remove_focused_software_identity(
    state: State<'_, AppState>,
    identity_key: String,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker
        .store()
        .remove_focused_software_identity(&identity_key)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn add_hidden_software_identities(
    state: State<'_, AppState>,
    identity_keys: Vec<String>,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker
        .store()
        .add_hidden_software_identities(&identity_keys)
        .map_err(software_list_command_error)
}

#[tauri::command(async)]
pub fn remove_hidden_software_identity(
    state: State<'_, AppState>,
    identity_key: String,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker
        .store()
        .remove_hidden_software_identity(&identity_key)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    app_settings_from_store(tracker.store()).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn get_close_behavior_preference(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    let preference = tracker
        .store()
        .setting_value(CLOSE_BEHAVIOR_SETTING_KEY)
        .map_err(|error| error.to_string())?;

    Ok(preference
        .as_deref()
        .and_then(CloseBehavior::from_setting)
        .map(|behavior| behavior.as_str().to_string()))
}

#[tauri::command(async)]
pub fn set_close_behavior_preference(
    state: State<'_, AppState>,
    choice: CloseBehavior,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker
        .store()
        .set_setting_value(CLOSE_BEHAVIOR_SETTING_KEY, choice.as_str())
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn set_autostart_preference(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    tracker
        .store()
        .set_setting_value(
            AUTOSTART_SETTING_KEY,
            if enabled { "true" } else { "false" },
        )
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn set_duration_format_preference(
    state: State<'_, AppState>,
    duration_format: DurationFormat,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    save_duration_format_preference(tracker.store(), duration_format)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn set_theme_preference(
    state: State<'_, AppState>,
    theme: ThemePreference,
) -> Result<(), String> {
    let tracker = crate::app_state::lock_tracker(&state.tracker);
    save_theme_preference(tracker.store(), theme).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn apply_window_close_choice(
    app: AppHandle,
    state: State<'_, AppState>,
    choice: CloseBehavior,
    remember: bool,
) -> Result<(), String> {
    if remember {
        let tracker = crate::app_state::lock_tracker(&state.tracker);
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
    let stored_duration_format = store
        .setting_value(DURATION_FORMAT_SETTING_KEY)?
        .as_deref()
        .and_then(DurationFormat::from_setting);
    let duration_format = stored_duration_format.unwrap_or(DEFAULT_DURATION_FORMAT);
    let stored_theme = store
        .setting_value(THEME_SETTING_KEY)?
        .as_deref()
        .and_then(ThemePreference::from_setting);

    Ok(AppSettings {
        close_behavior,
        close_behavior_configured: stored_close_behavior.is_some(),
        autostart_enabled,
        autostart_configured,
        duration_format,
        duration_format_configured: stored_duration_format.is_some(),
        theme: stored_theme.unwrap_or(DEFAULT_THEME),
        theme_configured: stored_theme.is_some(),
    })
}

fn save_theme_preference(store: &Store, theme: ThemePreference) -> Result<(), StoreError> {
    store.set_setting_value(THEME_SETTING_KEY, theme.as_str())
}

fn save_duration_format_preference(
    store: &Store,
    duration_format: DurationFormat,
) -> Result<(), StoreError> {
    store.set_setting_value(DURATION_FORMAT_SETTING_KEY, duration_format.as_str())
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
    last_scan_succeeded: Option<bool>,
) -> Result<DashboardSummary, StoreError> {
    let usage_date = day_start_utc.with_timezone(&Local).date_naive();
    let apps = store
        .app_usage_summary_for_date(day_start_utc, now_utc, usage_date)?
        .into_iter()
        .map(|summary| AppUsageRow::from_summary(summary, runtime_status_by_app_id))
        .collect::<Vec<_>>();
    let daily_usage = store.daily_system_usage(usage_date)?;

    Ok(DashboardSummary {
        last_scan_succeeded,
        product_title: "全局软件计时器".to_string(),
        locale: "zh-CN".to_string(),
        most_used: most_used_today(&apps),
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

/// Today's keyboard/mouse-active focus picks the app, so an always-on tray app
/// with large runtime does not win; falls back to today's runtime.
fn most_used_today(apps: &[AppUsageRow]) -> Option<AppUsageRow> {
    apps.iter()
        .filter(|app| app.today_seconds > 0 || app.active_today_seconds > 0)
        .min_by(|left, right| {
            right
                .active_today_seconds
                .cmp(&left.active_today_seconds)
                .then_with(|| right.today_seconds.cmp(&left.today_seconds))
                .then_with(|| left.display_name.cmp(&right.display_name))
        })
        .cloned()
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
            icon_data_url: cached_native_icon(&summary.executable_path),
            total_seconds: summary.total_seconds,
            today_seconds: summary.today_seconds,
            active_today_seconds: summary.active_today_seconds,
            status,
            is_running: status.is_user_facing(),
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
            icon_data_url: cached_native_icon(&row.executable_path),
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
        if candidate.rank() > status.rank() {
            status = candidate;
        }
    }

    status
}

#[cfg(test)]
mod background_row_tests {
    use super::*;

    fn usage(key: &str, cpu: f64) -> BackgroundUsage {
        BackgroundUsage {
            family_key: key.into(),
            display_name: key.into(),
            process_name: format!("{key}.exe"),
            executable_path: format!(r"C:\Tools\{key}.exe"),
            running_seconds: 600,
            cpu_core_seconds: cpu,
            peak_memory_bytes: 1_000,
            peak_process_count: 3,
            last_seen_at: "2026-11-20T08:00:00+00:00".into(),
        }
    }

    #[test]
    fn overlays_live_samples_and_sorts_by_cpu_today() {
        let live = vec![BackgroundProcessGroup {
            family_key: "light".into(),
            display_name: "Light".into(),
            process_name: "light.exe".into(),
            executable_path: r"C:\Tools\light.exe".into(),
            process_count: 2,
            cpu_percent: 80.0,
            memory_bytes: 500,
        }];
        let rows = background_rows(vec![usage("light", 5.0), usage("heavy", 90.0)], live, 8);

        assert_eq!(rows[0].0.family_key, "heavy");
        assert!(!rows[0].0.is_running);
        assert_eq!(rows[0].0.memory_bytes, 1_000);
        let light = &rows[1].0;
        assert!(light.is_running);
        assert_eq!(light.process_count, 2);
        assert_eq!(light.cpu_percent, Some(10.0));
        assert_eq!(light.memory_bytes, 500);
        assert_eq!(light.today_running_seconds, 600);
    }
}

#[cfg(test)]
mod most_used_tests {
    use super::*;

    fn row(name: &str, total: i64, today: i64, active: i64) -> AppUsageRow {
        AppUsageRow {
            app_id: 0,
            display_name: name.into(),
            process_name: format!("{name}.exe"),
            icon_data_url: None,
            total_seconds: total,
            today_seconds: today,
            active_today_seconds: active,
            status: AppRuntimeStatus::Closed,
            is_running: false,
        }
    }

    fn picked(apps: &[AppUsageRow]) -> Option<String> {
        most_used_today(apps).map(|app| app.display_name)
    }

    #[test]
    fn active_time_beats_an_always_on_tray_app() {
        let apps = vec![
            row("BitDock", 2_000 * 3600, 10 * 3600, 0),
            row("Code", 50 * 3600, 2 * 3600, 600),
            row("Chrome", 80 * 3600, 3 * 3600, 300),
        ];

        assert_eq!(picked(&apps).as_deref(), Some("Code"));
    }

    #[test]
    fn active_ties_fall_back_to_today_then_name() {
        let apps = vec![
            row("Zed", 0, 100, 60),
            row("Code", 0, 200, 60),
            row("Atom", 0, 200, 60),
        ];

        assert_eq!(picked(&apps).as_deref(), Some("Atom"));
    }

    #[test]
    fn without_active_time_uses_largest_today_runtime() {
        let apps = vec![
            row("Legacy", 9_000 * 3600, 0, 0),
            row("BitDock", 100, 4 * 3600, 0),
            row("Code", 100, 3600, 0),
        ];

        assert_eq!(picked(&apps).as_deref(), Some("BitDock"));
    }

    #[test]
    fn nothing_ran_today_means_no_most_used() {
        let apps = vec![row("Legacy", 9_000 * 3600, 0, 0)];

        assert_eq!(picked(&apps), None);
        assert_eq!(picked(&[]), None);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        app_settings_from_store, dashboard_summary_from_store, save_duration_format_preference,
        save_theme_preference, software_list_command_error, CloseBehavior, DurationFormat,
        ThemePreference,
    };
    use crate::domain::AppRuntimeStatus;
    use crate::storage::{Store, StoreError};
    use chrono::{TimeZone, Utc};
    use std::collections::HashMap;
    use tempfile::NamedTempFile;

    /// Run in a fresh process to include cold icon-cache behavior.
    #[test]
    #[ignore = "requires GST_BENCH_DB pointing to a disposable database snapshot"]
    fn benchmark_software_first_response() {
        let path = std::env::var("GST_BENCH_DB").expect("set GST_BENCH_DB");
        let store = Store::open_read_only(path).unwrap();
        let started = std::time::Instant::now();
        let transaction = store.savepoint().unwrap();
        let summary = super::software_page_summary_from_store(
            &store,
            super::local_day_start_utc(),
            Utc::now(),
            &HashMap::new(),
        )
        .unwrap();
        let payload = serde_json::to_vec(&summary).unwrap();
        transaction.commit().unwrap();
        println!(
            "{} discovered, {} bytes, {:?} first response",
            summary.discovered.len(),
            payload.len(),
            started.elapsed()
        );
    }

    #[test]
    fn dashboard_summary_reads_sessions_and_daily_system_usage() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let app = store
            .upsert_app(
                "Code.exe",
                r"X:\Fixtures\Microsoft VS Code\Code.exe",
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
            Some(true),
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
    fn dashboard_most_used_comes_from_today_not_the_ledger_leader() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        let legacy = store
            .upsert_app("Legacy.exe", r"X:\Fixtures\Legacy\Legacy.exe", "Legacy")
            .expect("legacy app");
        let code = store
            .upsert_app(
                "Code.exe",
                r"X:\Fixtures\Code\Code.exe",
                "Visual Studio Code",
            )
            .expect("code app");
        let legacy_session = store
            .start_session(
                legacy.id,
                Utc.with_ymd_and_hms(2026, 5, 20, 0, 0, 0).unwrap(),
            )
            .expect("legacy start");
        store
            .close_session(
                legacy_session,
                Utc.with_ymd_and_hms(2026, 5, 20, 20, 0, 0).unwrap(),
                "process_closed",
                false,
            )
            .expect("legacy close");
        let code_session = store
            .start_session(code.id, Utc.with_ymd_and_hms(2026, 5, 29, 8, 0, 0).unwrap())
            .expect("code start");
        store
            .close_session(
                code_session,
                Utc.with_ymd_and_hms(2026, 5, 29, 8, 10, 0).unwrap(),
                "process_closed",
                false,
            )
            .expect("code close");

        let summary = dashboard_summary_from_store(
            &store,
            Utc.with_ymd_and_hms(2026, 5, 29, 0, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 29, 9, 0, 0).unwrap(),
            &HashMap::new(),
            Some(true),
        )
        .expect("summary");

        assert_eq!(summary.apps[0].display_name, "Legacy");
        assert_eq!(
            summary.most_used.as_ref().unwrap().display_name,
            "Visual Studio Code"
        );
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
            Some(true),
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
                r"X:\Fixtures\Kingsoft\WPSOFF~1\1000~1.001\office6\wps.exe",
                "WPS Office",
            )
            .expect("short path app");
        let wps_pdf = store
            .upsert_app(
                "wpspdf.exe",
                r"X:\Fixtures\Kingsoft\WPS Office\1.0.0.1\office6\wpspdf.exe",
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
            Some(true),
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
    fn app_settings_defaults_duration_format_to_decimal_hours() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");

        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.duration_format, DurationFormat::DecimalHours);
        assert!(!settings.duration_format_configured);

        store
            .set_setting_value("ui.duration_format", "hours_minutes")
            .expect("set setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.duration_format, DurationFormat::HoursMinutes);
        assert!(settings.duration_format_configured);

        store
            .set_setting_value("ui.duration_format", "unexpected")
            .expect("set invalid setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.duration_format, DurationFormat::DecimalHours);
        assert!(!settings.duration_format_configured);
    }

    #[test]
    fn save_duration_format_preference_writes_setting_key() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");

        save_duration_format_preference(&store, DurationFormat::HoursMinutes).expect("save");

        assert_eq!(
            store
                .setting_value("ui.duration_format")
                .expect("read setting")
                .as_deref(),
            Some("hours_minutes")
        );
    }

    #[test]
    fn app_settings_defaults_theme_to_system() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");

        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.theme, ThemePreference::System);
        assert!(!settings.theme_configured);

        store
            .set_setting_value("ui.theme", "dark")
            .expect("set setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.theme, ThemePreference::Dark);
        assert!(settings.theme_configured);

        store
            .set_setting_value("ui.theme", "sepia")
            .expect("set invalid setting");
        let settings = app_settings_from_store(&store).expect("settings");
        assert_eq!(settings.theme, ThemePreference::System);
        assert!(!settings.theme_configured);
    }

    #[test]
    fn save_theme_preference_writes_setting_key() {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");

        save_theme_preference(&store, ThemePreference::Light).expect("save");

        assert_eq!(
            store
                .setting_value("ui.theme")
                .expect("read setting")
                .as_deref(),
            Some("light")
        );
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
