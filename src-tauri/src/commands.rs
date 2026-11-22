use crate::app_state::AppState;
use crate::background::BackgroundProcessGroup;
use crate::domain::{AppRuntimeStatus, AppUsageSummary, DailySystemUsage, SoftwarePageRow};
use crate::native_icon::icon_url;
use crate::statistics::{self, DateRange, SoftwareDate};
use crate::storage::{BackgroundUsage, Store, StoreError};
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveTime, SecondsFormat, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Manager, State};

const CLOSE_BEHAVIOR_SETTING_KEY: &str = "window.close_behavior";
const AUTOSTART_SETTING_KEY: &str = "startup.autostart_enabled";
const DURATION_FORMAT_SETTING_KEY: &str = "ui.duration_format";
const THEME_SETTING_KEY: &str = "ui.theme";
const DEFAULT_CLOSE_BEHAVIOR: CloseBehavior = CloseBehavior::MinimizeToTray;
const DEFAULT_AUTOSTART_ENABLED: bool = true;
const DEFAULT_DURATION_FORMAT: DurationFormat = DurationFormat::DecimalHours;
const DEFAULT_THEME: ThemePreference = ThemePreference::System;
const STATISTICS_INVALID_RANGE: &str = "statistics_invalid_range";
const ACHIEVEMENTS_INVALID_HEATMAP_DAYS: &str = "achievements_invalid_heatmap_days";
const TIMELINE_INVALID_DATE: &str = "timeline_invalid_date";

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
    pub icon_url: Option<String>,
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
    pub icon_url: Option<String>,
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
    pub icon_url: Option<String>,
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

/// Dates are local `YYYY-MM-DD`; timestamps are RFC 3339.
#[derive(Debug, Clone, Serialize)]
pub struct StatisticsSummary {
    pub start: String,
    pub end: String,
    pub days_count: u32,
    pub previous_start: String,
    pub previous_end: String,
    pub data_start_date: Option<String>,
    pub software_detail_start_date: Option<String>,
    pub days_without_software_detail: u32,
    pub system_comparison_available: bool,
    pub software_comparison_available: bool,
    pub previous_recorded_seconds: i64,
    pub previous_active_seconds: i64,
    pub days: Vec<StatisticsDayDto>,
    pub ranking: Vec<RankingRowDto>,
    pub idle_open: Vec<IdleOpenRowDto>,
    pub sessions: Vec<SessionStatRowDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatisticsDayDto {
    pub date: String,
    pub recorded_seconds: i64,
    pub active_seconds: i64,
    pub tracker_uptime_seconds: i64,
    pub first_recorded_at: Option<String>,
    pub last_recorded_at: Option<String>,
    pub has_software_detail: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RankingRowDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub rank: u32,
    pub previous_rank: Option<u32>,
    pub is_new: bool,
    pub focused_seconds: i64,
    pub previous_focused_seconds: i64,
    pub window_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdleOpenRowDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub window_seconds: i64,
    pub focused_seconds: i64,
    pub idle_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionStatRowDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub launch_count: u32,
    pub average_seconds: i64,
    pub longest_seconds: i64,
}

/// Dates are local `YYYY-MM-DD`. Streaks, records and milestones use all history.
#[derive(Debug, Clone, Serialize)]
pub struct AchievementsSummary {
    pub today: String,
    pub heatmap_days: u32,
    pub heatmap: Vec<HeatmapDayDto>,
    pub streak_threshold_seconds: i64,
    pub current_streak_days: u32,
    pub current_streak_start: Option<String>,
    pub longest_streak_days: u32,
    pub longest_streak_start: Option<String>,
    pub longest_streak_end: Option<String>,
    pub best_active_day: Option<DayRecordDto>,
    pub best_software_day: Option<SoftwareDayRecordDto>,
    pub milestone_hours: Vec<i64>,
    pub milestones: Vec<MilestoneRowDto>,
    pub new_software: Vec<SoftwareRefDto>,
    pub dormant_software: Vec<SoftwareRefDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HeatmapDayDto {
    pub date: String,
    pub active_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DayRecordDto {
    pub date: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwareDayRecordDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub date: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MilestoneRowDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub focused_seconds: i64,
    pub reached_hours: Option<i64>,
    pub reached_on: Option<String>,
    pub next_hours: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwareRefDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub date: String,
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
pub fn get_statistics_summary(
    state: State<'_, AppState>,
    start: String,
    end: String,
    include_hidden: bool,
) -> Result<StatisticsSummary, String> {
    let store = crate::app_state::lock_recovering(&state.summary_store);
    let transaction = store.savepoint().map_err(|error| error.to_string())?;
    let summary = statistics_summary_from_store(&store, &start, &end, include_hidden)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(summary)
}

#[tauri::command(async)]
pub fn get_achievements_summary(
    state: State<'_, AppState>,
    heatmap_days: u32,
    include_hidden: bool,
) -> Result<AchievementsSummary, String> {
    let store = crate::app_state::lock_recovering(&state.summary_store);
    let transaction = store.savepoint().map_err(|error| error.to_string())?;
    let summary = achievements_summary_from_store(
        &store,
        heatmap_days,
        include_hidden,
        Local::now().date_naive(),
    )?;
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
                icon_url: icon_url(&path),
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
                    icon_url: None,
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
                    icon_url: None,
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

/// The instant `date` starts in local time.
fn local_date_start_utc(date: NaiveDate) -> DateTime<Utc> {
    local_date_bounds_in(date, &Local).0
}

/// The UTC instants a local date starts and ends in `tz`. Where a DST change
/// skips midnight, a day starts at the first local hour that exists; where it
/// repeats midnight, at the earlier instant.
pub fn local_date_bounds_in<Tz: TimeZone>(
    date: NaiveDate,
    tz: &Tz,
) -> (DateTime<Utc>, DateTime<Utc>) {
    let start_of = |date: NaiveDate| {
        (0..24)
            .find_map(|hour| {
                tz.from_local_datetime(&date.and_hms_opt(hour, 0, 0)?)
                    .earliest()
            })
            .map(|start| start.with_timezone(&Utc))
            .unwrap_or_else(|| Utc.from_utc_datetime(&date.and_time(NaiveTime::MIN)))
    };
    let end = date.succ_opt().map_or(DateTime::<Utc>::MAX_UTC, start_of);
    (start_of(date), end)
}

/// Strict `YYYY-MM-DD`; chrono alone also accepts unpadded fields and signed
/// years of five or more digits, whose range arithmetic can overflow.
fn parse_local_date(value: &str) -> Option<NaiveDate> {
    if value.len() != 10 {
        return None;
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|date| date.to_string() == value)
}

/// One local day of the timeline. Dates are local `YYYY-MM-DD`; instants are
/// millisecond RFC 3339 ending in `+00:00`, the format the tables store.
#[derive(Debug, Clone, Serialize)]
pub struct TimelineSummary {
    pub date: String,
    pub day_start: String,
    pub day_end: String,
    pub generated_at: String,
    /// `before_collection`, `collection_started` or `collected`.
    pub day_status: String,
    pub collection_started_at: Option<String>,
    pub first_recorded_date: Option<String>,
    pub segments: Vec<TimelineSegmentDto>,
    pub focus_segments: Vec<FocusSegmentDto>,
    pub active_segments: Vec<ActiveSegmentDto>,
    pub running: Vec<RunningSoftwareDto>,
    pub software: Vec<TimelineSoftwareDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineSegmentDto {
    pub start: String,
    pub end: String,
    pub seconds: i64,
    pub focus_identity_key: Option<String>,
    pub focus_hidden: bool,
    pub is_active: bool,
    pub start_reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusSegmentDto {
    pub start: String,
    pub end: String,
    pub seconds: i64,
    pub focus_identity_key: Option<String>,
    pub focus_hidden: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveSegmentDto {
    pub start: String,
    pub end: String,
    pub seconds: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunningSoftwareDto {
    pub identity_key: String,
    pub intervals: Vec<RunningIntervalDto>,
    pub window_intervals: Vec<WindowIntervalDto>,
    pub window_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunningIntervalDto {
    pub start: String,
    pub end: String,
    pub open: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowIntervalDto {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineSoftwareDto {
    pub identity_key: String,
    pub display_name: String,
    pub icon_url: Option<String>,
    pub is_hidden: bool,
}

#[tauri::command(async)]
pub fn get_timeline_summary(
    state: State<'_, AppState>,
    date: String,
    include_hidden: bool,
) -> Result<TimelineSummary, String> {
    let store = crate::app_state::lock_recovering(&state.summary_store);
    let transaction = store.savepoint().map_err(|error| error.to_string())?;
    let summary = timeline_summary_from_store(&store, &date, include_hidden, Utc::now())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(summary)
}

fn timeline_summary_from_store(
    store: &Store,
    date: &str,
    include_hidden: bool,
    now: DateTime<Utc>,
) -> Result<TimelineSummary, String> {
    let date = parse_local_date(date).ok_or_else(|| TIMELINE_INVALID_DATE.to_string())?;
    timeline_summary_for_date(store, date, include_hidden, now).map_err(|error| error.to_string())
}

fn timeline_instant(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, false)
}

/// A stored segment as the summary returns it: hidden focus already masked.
#[derive(Debug, Clone)]
struct SummarySegment {
    id: i64,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    seconds: i64,
    focus_identity_key: Option<String>,
    focus_hidden: bool,
    is_active: bool,
    start_reason: String,
}

fn timeline_summary_for_date(
    store: &Store,
    date: NaiveDate,
    include_hidden: bool,
    now: DateTime<Utc>,
) -> Result<TimelineSummary, StoreError> {
    let (day_start, day_end) = local_date_bounds_in(date, &Local);
    let first_segment = store.first_timeline_segment()?;
    let day_status = match first_segment {
        Some((first_date, _)) if date > first_date => "collected",
        Some((first_date, _)) if date == first_date => "collection_started",
        _ => "before_collection",
    };
    let hidden: HashSet<String> = store.hidden_software_identity_keys()?.into_iter().collect();
    // Segments are returned whole: one written under another time zone may
    // reach past this day's bounds, and clipping it would break the totals.
    let segments: Vec<SummarySegment> = store
        .timeline_segments_for_date(date)?
        .into_iter()
        .map(|segment| {
            let focus_hidden = !include_hidden
                && segment
                    .focus_identity_key
                    .as_ref()
                    .is_some_and(|key| hidden.contains(key));
            SummarySegment {
                id: segment.id,
                start: segment.start,
                end: segment.end,
                seconds: segment.credited_seconds,
                focus_identity_key: segment.focus_identity_key.filter(|_| !focus_hidden),
                focus_hidden,
                is_active: segment.is_active,
                start_reason: segment.start_reason,
            }
        })
        .collect();
    let mut by_id = segments.clone();
    by_id.sort_by_key(|segment| segment.id);

    let mut software_keys: Vec<String> = segments
        .iter()
        .filter_map(|segment| segment.focus_identity_key.clone())
        .collect();
    software_keys.sort();
    software_keys.dedup();
    let labels = SoftwareLabels(store.software_identity_labels()?);
    let software = software_keys
        .into_iter()
        .map(|identity_key| TimelineSoftwareDto {
            display_name: labels.display_name(&identity_key),
            icon_url: labels.icon_url(&identity_key),
            is_hidden: hidden.contains(&identity_key),
            identity_key,
        })
        .collect();

    Ok(TimelineSummary {
        date: date.to_string(),
        day_start: timeline_instant(day_start),
        day_end: timeline_instant(day_end),
        generated_at: timeline_instant(now),
        day_status: day_status.to_string(),
        collection_started_at: first_segment.map(|(_, start)| timeline_instant(start)),
        first_recorded_date: store.data_start_date()?.map(|date| date.to_string()),
        segments: segments
            .iter()
            .map(|segment| TimelineSegmentDto {
                start: timeline_instant(segment.start),
                end: timeline_instant(segment.end),
                seconds: segment.seconds,
                focus_identity_key: segment.focus_identity_key.clone(),
                focus_hidden: segment.focus_hidden,
                is_active: segment.is_active,
                start_reason: segment.start_reason.clone(),
            })
            .collect(),
        focus_segments: merge_focus_segments(&by_id),
        active_segments: merge_active_segments(&by_id),
        running: Vec::new(),
        software,
    })
}

/// Folds rows into the row before them by id when `joins` says so, then
/// orders the groups by start and first id. Returns (first row, end, seconds).
fn merge_segments(
    by_id: &[SummarySegment],
    joins: impl Fn(&SummarySegment, &SummarySegment) -> bool,
) -> Vec<(&SummarySegment, DateTime<Utc>, i64)> {
    let mut groups: Vec<(&SummarySegment, DateTime<Utc>, i64)> = Vec::new();
    for segment in by_id {
        match groups.last_mut() {
            Some((first, end, seconds)) if joins(first, segment) => {
                *end = segment.end;
                *seconds += segment.seconds;
            }
            _ => groups.push((segment, segment.end, segment.seconds)),
        }
    }
    groups.sort_by_key(|(first, _, _)| (first.start, first.id));
    groups
}

/// The focus band: an activity change keeps the focus, so it joins the row before.
fn merge_focus_segments(by_id: &[SummarySegment]) -> Vec<FocusSegmentDto> {
    merge_segments(by_id, |_, next| next.start_reason == "activity_changed")
        .into_iter()
        .map(|(first, end, seconds)| FocusSegmentDto {
            start: timeline_instant(first.start),
            end: timeline_instant(end),
            seconds,
            focus_identity_key: first.focus_identity_key.clone(),
            focus_hidden: first.focus_hidden,
        })
        .collect()
}

/// The active band: a focus change that keeps the activity state joins the row before.
fn merge_active_segments(by_id: &[SummarySegment]) -> Vec<ActiveSegmentDto> {
    merge_segments(by_id, |first, next| {
        next.start_reason == "focus_changed" && next.is_active == first.is_active
    })
    .into_iter()
    .map(|(first, end, seconds)| ActiveSegmentDto {
        start: timeline_instant(first.start),
        end: timeline_instant(end),
        seconds,
        is_active: first.is_active,
    })
    .collect()
}

/// Hidden identities to leave out, or none when hidden software is included.
fn excluded_identities(store: &Store, include_hidden: bool) -> Result<HashSet<String>, StoreError> {
    if include_hidden {
        return Ok(HashSet::new());
    }
    Ok(store.hidden_software_identity_keys()?.into_iter().collect())
}

fn without<V>(mut map: HashMap<String, V>, excluded: &HashSet<String>) -> HashMap<String, V> {
    map.retain(|key, _| !excluded.contains(key));
    map
}

/// Display names and icons per identity; unknown identities show their key.
struct SoftwareLabels(HashMap<String, (String, String)>);

impl SoftwareLabels {
    fn display_name(&self, identity_key: &str) -> String {
        self.0
            .get(identity_key)
            .map_or_else(|| identity_key.to_string(), |(name, _)| name.clone())
    }

    fn icon_url(&self, identity_key: &str) -> Option<String> {
        self.0
            .get(identity_key)
            .and_then(|(_, path)| icon_url(path))
    }

    fn display_names(&self) -> HashMap<String, String> {
        self.0
            .iter()
            .map(|(key, (name, _))| (key.clone(), name.clone()))
            .collect()
    }
}

fn statistics_summary_from_store(
    store: &Store,
    start: &str,
    end: &str,
    include_hidden: bool,
) -> Result<StatisticsSummary, String> {
    let range = parse_local_date(start)
        .zip(parse_local_date(end))
        .and_then(|(start, end)| DateRange::new(start, end).ok())
        .ok_or_else(|| STATISTICS_INVALID_RANGE.to_string())?;
    statistics_summary_for_range(store, range, include_hidden).map_err(|error| error.to_string())
}

fn statistics_summary_for_range(
    store: &Store,
    range: DateRange,
    include_hidden: bool,
) -> Result<StatisticsSummary, StoreError> {
    let previous = range.previous();
    let data_start = store.data_start_date()?;
    let detail_start = store.software_detail_start_date()?;
    let has_software_detail = |date: NaiveDate| detail_start.is_some_and(|start| date >= start);
    let previous_covered_from =
        |first: Option<NaiveDate>| first.is_some_and(|first| previous.start >= first);
    let software_comparison_available = previous_covered_from(detail_start);

    let system: HashMap<NaiveDate, DailySystemUsage> = store
        .daily_system_usage_range(range.start, range.end)?
        .into_iter()
        .map(|usage| (usage.date, usage))
        .collect();
    let bounds: HashMap<NaiveDate, (DateTime<Utc>, DateTime<Utc>)> = store
        .daily_recorded_bounds_range(range.start, range.end)?
        .into_iter()
        .map(|(date, first, last)| (date, (first, last)))
        .collect();
    let days = range
        .dates()
        .map(|date| {
            let usage = system.get(&date);
            let bound = bounds.get(&date);
            StatisticsDayDto {
                date: date.to_string(),
                recorded_seconds: usage.map_or(0, |usage| usage.recorded_seconds),
                active_seconds: usage.map_or(0, |usage| usage.active_seconds),
                tracker_uptime_seconds: usage.map_or(0, |usage| usage.tracker_uptime_seconds),
                first_recorded_at: bound.map(|(first, _)| first.to_rfc3339()),
                last_recorded_at: bound.map(|(_, last)| last.to_rfc3339()),
                has_software_detail: has_software_detail(date),
            }
        })
        .collect::<Vec<_>>();
    let previous_usage = store.daily_system_usage_range(previous.start, previous.end)?;

    let excluded = excluded_identities(store, include_hidden)?;
    let focus = without(
        store.software_focus_seconds_range(range.start, range.end)?,
        &excluded,
    );
    let previous_focus = without(
        store.software_focus_seconds_range(previous.start, previous.end)?,
        &excluded,
    );
    let window = without(
        store.software_window_seconds_range(range.start, range.end)?,
        &excluded,
    );
    let sessions = store
        .sessions_started_between(
            local_date_start_utc(range.start),
            local_date_start_utc(range.end + Duration::days(1)),
        )?
        .into_iter()
        .filter(|(key, _)| !excluded.contains(key))
        .collect::<Vec<_>>();
    let labels = SoftwareLabels(store.software_identity_labels()?);

    Ok(StatisticsSummary {
        start: range.start.to_string(),
        end: range.end.to_string(),
        days_count: days.len() as u32,
        previous_start: previous.start.to_string(),
        previous_end: previous.end.to_string(),
        data_start_date: data_start.map(|date| date.to_string()),
        software_detail_start_date: detail_start.map(|date| date.to_string()),
        days_without_software_detail: days.iter().filter(|day| !day.has_software_detail).count()
            as u32,
        system_comparison_available: previous_covered_from(data_start),
        software_comparison_available,
        previous_recorded_seconds: previous_usage
            .iter()
            .map(|usage| usage.recorded_seconds)
            .sum(),
        previous_active_seconds: previous_usage
            .iter()
            .map(|usage| usage.active_seconds)
            .sum(),
        days,
        ranking: statistics::rank_software(
            &focus,
            &previous_focus,
            &window,
            &labels.display_names(),
            software_comparison_available,
        )
        .into_iter()
        .map(|entry| RankingRowDto {
            display_name: labels.display_name(&entry.identity_key),
            icon_url: labels.icon_url(&entry.identity_key),
            identity_key: entry.identity_key,
            rank: entry.rank,
            previous_rank: entry.previous_rank,
            is_new: entry.is_new,
            focused_seconds: entry.focused_seconds,
            previous_focused_seconds: entry.previous_focused_seconds,
            window_seconds: entry.window_seconds,
        })
        .collect(),
        idle_open: statistics::idle_open(&window, &focus)
            .into_iter()
            .map(|entry| IdleOpenRowDto {
                display_name: labels.display_name(&entry.identity_key),
                icon_url: labels.icon_url(&entry.identity_key),
                identity_key: entry.identity_key,
                window_seconds: entry.window_seconds,
                focused_seconds: entry.focused_seconds,
                idle_seconds: entry.idle_seconds,
            })
            .collect(),
        sessions: statistics::session_stats(&sessions)
            .into_iter()
            .map(|entry| SessionStatRowDto {
                display_name: labels.display_name(&entry.identity_key),
                icon_url: labels.icon_url(&entry.identity_key),
                identity_key: entry.identity_key,
                launch_count: entry.launch_count,
                average_seconds: entry.average_seconds,
                longest_seconds: entry.longest_seconds,
            })
            .collect(),
    })
}

fn achievements_summary_from_store(
    store: &Store,
    heatmap_days: u32,
    include_hidden: bool,
    today: NaiveDate,
) -> Result<AchievementsSummary, String> {
    if !statistics::HEATMAP_DAY_OPTIONS.contains(&heatmap_days) {
        return Err(ACHIEVEMENTS_INVALID_HEATMAP_DAYS.to_string());
    }
    achievements_summary_for_days(store, heatmap_days, include_hidden, today)
        .map_err(|error| error.to_string())
}

fn achievements_summary_for_days(
    store: &Store,
    heatmap_days: u32,
    include_hidden: bool,
    today: NaiveDate,
) -> Result<AchievementsSummary, StoreError> {
    let active_days: Vec<(NaiveDate, i64)> = match store.data_start_date()? {
        Some(start) => store
            .daily_system_usage_range(start, today)?
            .into_iter()
            .map(|usage| (usage.date, usage.active_seconds))
            .collect(),
        None => Vec::new(),
    };
    let active_by_date: HashMap<NaiveDate, i64> = active_days.iter().copied().collect();
    let heatmap = (today - Duration::days(i64::from(heatmap_days) - 1))
        .iter_days()
        .take(heatmap_days as usize)
        .map(|date| HeatmapDayDto {
            date: date.to_string(),
            active_seconds: active_by_date.get(&date).copied().unwrap_or(0),
        })
        .collect();
    let streaks = statistics::streaks(&active_days, today);
    // The highest value wins; on a tie the earliest day stays the record.
    let best_active_day = active_days
        .iter()
        .filter(|(_, seconds)| *seconds > 0)
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
        .map(|(date, seconds)| DayRecordDto {
            date: date.to_string(),
            seconds: *seconds,
        });

    let excluded = excluded_identities(store, include_hidden)?;
    let focus_daily = store
        .software_focus_daily()?
        .into_iter()
        .filter(|(key, _, _)| !excluded.contains(key))
        .collect::<Vec<_>>();
    let (new_software, dormant_software) = match store.software_detail_start_date()? {
        Some(detail_start) => statistics::comings_and_goings(
            &without(store.software_window_date_bounds()?, &excluded),
            today,
            detail_start,
        ),
        None => (Vec::new(), Vec::new()),
    };
    let labels = SoftwareLabels(store.software_identity_labels()?);
    let software_ref = |row: SoftwareDate| SoftwareRefDto {
        display_name: labels.display_name(&row.identity_key),
        icon_url: labels.icon_url(&row.identity_key),
        identity_key: row.identity_key,
        date: row.date.to_string(),
    };

    Ok(AchievementsSummary {
        today: today.to_string(),
        heatmap_days,
        heatmap,
        streak_threshold_seconds: statistics::STREAK_MIN_ACTIVE_SECONDS,
        current_streak_days: streaks.current_days,
        current_streak_start: streaks.current_start.map(|date| date.to_string()),
        longest_streak_days: streaks.longest_days,
        longest_streak_start: streaks.longest_start.map(|date| date.to_string()),
        longest_streak_end: streaks.longest_end.map(|date| date.to_string()),
        best_active_day,
        best_software_day: focus_daily
            .iter()
            .max_by(|a, b| {
                a.2.cmp(&b.2)
                    .then_with(|| b.1.cmp(&a.1))
                    .then_with(|| b.0.cmp(&a.0))
            })
            .map(|(key, date, seconds)| SoftwareDayRecordDto {
                identity_key: key.clone(),
                display_name: labels.display_name(key),
                icon_url: labels.icon_url(key),
                date: date.to_string(),
                seconds: *seconds,
            }),
        milestone_hours: statistics::MILESTONE_HOURS.to_vec(),
        milestones: statistics::milestones(&focus_daily)
            .into_iter()
            .map(|entry| MilestoneRowDto {
                display_name: labels.display_name(&entry.identity_key),
                icon_url: labels.icon_url(&entry.identity_key),
                identity_key: entry.identity_key,
                focused_seconds: entry.focused_seconds,
                reached_hours: entry.reached_hours,
                reached_on: entry.reached_on.map(|date| date.to_string()),
                next_hours: entry.next_hours,
            })
            .collect(),
        new_software: new_software.into_iter().map(software_ref).collect(),
        dormant_software: dormant_software.into_iter().map(software_ref).collect(),
    })
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
            icon_url: icon_url(&summary.executable_path),
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
            icon_url: icon_url(&row.executable_path),
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
            icon_url: None,
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

    /// Prints both statistics summaries for a database snapshot as JSON, to
    /// compare with independent SQL, and each call's first and warm median time.
    /// `GST_ACCEPT_END` is the last day (default 2026-11-21): the statistics
    /// range is the 30 days ending then, and achievements use it as today.
    #[test]
    #[ignore = "requires GST_BENCH_DB pointing to a disposable database snapshot"]
    fn real_database_statistics_acceptance() {
        let path = std::env::var("GST_BENCH_DB").expect("set GST_BENCH_DB");
        let end = std::env::var("GST_ACCEPT_END").unwrap_or_else(|_| "2026-11-21".to_string());
        let today = chrono::NaiveDate::parse_from_str(&end, "%Y-%m-%d").expect("GST_ACCEPT_END");
        let start = (today - chrono::Duration::days(29)).to_string();
        let store = Store::open_read_only(path).unwrap();

        // (first call, warm median of five) in milliseconds
        let timings_ms = |run: &dyn Fn()| {
            let mut times: Vec<f64> = (0..6)
                .map(|_| {
                    let started = std::time::Instant::now();
                    run();
                    started.elapsed().as_secs_f64() * 1000.0
                })
                .collect();
            let first = times.remove(0); // also warms the icon cache and SQLite pages
            times.sort_by(f64::total_cmp);
            (first, times[2])
        };
        let statistics_ms = timings_ms(&|| {
            let transaction = store.savepoint().unwrap();
            super::statistics_summary_from_store(&store, &start, &end, false).unwrap();
            transaction.commit().unwrap();
        });
        let achievements_ms = timings_ms(&|| {
            let transaction = store.savepoint().unwrap();
            super::achievements_summary_from_store(&store, 90, false, today).unwrap();
            transaction.commit().unwrap();
        });

        let statistics = super::statistics_summary_from_store(&store, &start, &end, false).unwrap();
        let achievements =
            super::achievements_summary_from_store(&store, 90, false, today).unwrap();
        println!(
            "ACCEPT_JSON {}",
            serde_json::json!({ "statistics": statistics, "achievements": achievements })
        );
        for (name, (first, warm)) in [
            ("statistics", statistics_ms),
            ("achievements", achievements_ms),
        ] {
            println!("{name}: first call {first:.1} ms, warm median of 5 {warm:.1} ms");
        }
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
        // Rows carry a short protocol URL; the icon itself is fetched lazily.
        assert!(summary.apps[0]
            .icon_url
            .as_deref()
            .is_some_and(|url| url.contains(crate::native_icon::URI_SCHEME) && url.len() < 64));
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

#[cfg(test)]
mod statistics_command_tests {
    use super::{
        achievements_summary_from_store, statistics_summary_from_store, StatisticsSummary,
    };
    use crate::storage::Store;
    use chrono::{DateTime, Duration, Local, NaiveDate, TimeZone, Utc};
    use tempfile::NamedTempFile;

    const H: i64 = 3600;

    fn migrated_store() -> (NamedTempFile, Store) {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        (db_file, store)
    }

    /// `(app_id, identity_key)` for a fixture app.
    fn software(store: &Store, process_name: &str) -> (i64, String) {
        let app_id = store
            .upsert_app(
                process_name,
                &format!(r"X:\Fixtures\{process_name}"),
                process_name,
            )
            .expect("app")
            .id;
        let identity_key = store
            .upsert_software_identity_for_app(app_id)
            .expect("identity")
            .identity_key;
        (app_id, identity_key)
    }

    fn date(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).unwrap()
    }

    fn local_utc(day: NaiveDate, hour: u32) -> DateTime<Utc> {
        Local
            .from_local_datetime(&day.and_hms_opt(hour, 0, 0).unwrap())
            .single()
            .unwrap()
            .with_timezone(&Utc)
    }

    fn summary(store: &Store, start: &str, end: &str, include_hidden: bool) -> StatisticsSummary {
        statistics_summary_from_store(store, start, end, include_hidden).expect("summary")
    }

    fn system_day(store: &Store, day: NaiveDate, active: i64) {
        store
            .increment_daily_system_usage(day, active * 2, active, active * 3)
            .expect("system usage");
    }

    fn window_day(store: &Store, day: NaiveDate, key: &str, foreground: i64) {
        store
            .increment_daily_software_runtime_usage(day, key, foreground, 0, local_utc(day, 9))
            .expect("runtime usage");
    }

    fn focus_day(store: &Store, day: NaiveDate, key: &str, focused: i64) {
        store
            .increment_daily_software_focus_usage(day, key, focused)
            .expect("focus usage");
    }

    fn session(store: &Store, app_id: i64, day: NaiveDate, seconds: i64) {
        session_at(store, app_id, local_utc(day, 10), seconds);
    }

    fn session_at(store: &Store, app_id: i64, started_at: DateTime<Utc>, seconds: i64) {
        let session_id = store.start_session(app_id, started_at).expect("start");
        store
            .close_session(
                session_id,
                started_at + Duration::seconds(seconds),
                "test",
                false,
            )
            .expect("close");
    }

    fn display_name(store: &Store, identity_key: &str) -> String {
        store.software_identity_labels().expect("labels")[identity_key]
            .0
            .clone()
    }

    fn keys<'a>(rows: impl IntoIterator<Item = &'a String>) -> Vec<&'a str> {
        rows.into_iter().map(String::as_str).collect()
    }

    #[test]
    fn statistics_summary_zero_fills_days_and_flags_days_before_software_detail() {
        let (_file, store) = migrated_store();
        let (_, code) = software(&store, "Code.exe");
        system_day(&store, date(2026, 11, 1), 600);
        system_day(&store, date(2026, 11, 3), 1200);
        window_day(&store, date(2026, 11, 3), &code, 1800);

        let summary = summary(&store, "2026-11-01", "2026-11-04", false);

        assert_eq!(summary.days_count, 4);
        assert_eq!(
            summary
                .days
                .iter()
                .map(|day| (
                    day.date.as_str(),
                    day.active_seconds,
                    day.has_software_detail
                ))
                .collect::<Vec<_>>(),
            vec![
                ("2026-11-01", 600, false),
                ("2026-11-02", 0, false),
                ("2026-11-03", 1200, true),
                ("2026-11-04", 0, true),
            ]
        );
        assert_eq!(summary.days_without_software_detail, 2);
        assert_eq!(summary.days[0].recorded_seconds, 1200);
        assert_eq!(summary.days[0].tracker_uptime_seconds, 1800);
        assert_eq!(
            summary.days[2].first_recorded_at,
            Some(local_utc(date(2026, 11, 3), 9).to_rfc3339())
        );
        assert_eq!(summary.days[1].first_recorded_at, None);
        assert_eq!(
            (summary.start.as_str(), summary.end.as_str()),
            ("2026-11-01", "2026-11-04")
        );
        assert_eq!(
            (
                summary.previous_start.as_str(),
                summary.previous_end.as_str()
            ),
            ("2026-10-28", "2026-10-31")
        );
        assert_eq!(summary.data_start_date.as_deref(), Some("2026-11-01"));
        assert_eq!(
            summary.software_detail_start_date.as_deref(),
            Some("2026-11-03")
        );
    }

    #[test]
    fn statistics_summary_excludes_hidden_software_unless_requested() {
        let (_file, store) = migrated_store();
        let (code_app, code) = software(&store, "Code.exe");
        let (game_app, game) = software(&store, "Game.exe");
        let day = date(2026, 11, 3);
        system_day(&store, day, 1200);
        for key in [&code, &game] {
            window_day(&store, day, key, 6 * H);
            focus_day(&store, day, key, 60);
        }
        session(&store, code_app, day, 600);
        session(&store, game_app, day, 900);
        store
            .add_hidden_software_identities(std::slice::from_ref(&game))
            .expect("hide");

        let visible = summary(&store, "2026-11-03", "2026-11-03", false);
        let all = summary(&store, "2026-11-03", "2026-11-03", true);

        assert_eq!(
            keys(visible.ranking.iter().map(|row| &row.identity_key)),
            vec![code.as_str()]
        );
        assert_eq!(
            keys(visible.idle_open.iter().map(|row| &row.identity_key)),
            vec![code.as_str()]
        );
        assert_eq!(
            keys(visible.sessions.iter().map(|row| &row.identity_key)),
            vec![code.as_str()]
        );
        assert!(all.ranking.iter().any(|row| row.identity_key == game));
        assert!(all.idle_open.iter().any(|row| row.identity_key == game));
        assert!(all.sessions.iter().any(|row| row.identity_key == game));
        assert_eq!(visible.ranking[0].display_name, display_name(&store, &code));
        let machine = |summary: &StatisticsSummary| {
            summary
                .days
                .iter()
                .map(|day| (day.recorded_seconds, day.active_seconds))
                .collect::<Vec<_>>()
        };
        assert_eq!(machine(&visible), machine(&all));
    }

    #[test]
    fn statistics_summary_counts_sessions_started_on_inclusive_local_days() {
        let (_file, store) = migrated_store();
        let (inside_app, inside) = software(&store, "Code.exe");
        let (before_app, _) = software(&store, "Before.exe");
        let (after_app, _) = software(&store, "After.exe");
        let local_at = |day: NaiveDate, hour: u32, minute: u32| {
            Local
                .from_local_datetime(&day.and_hms_opt(hour, minute, 0).unwrap())
                .single()
                .unwrap()
                .with_timezone(&Utc)
        };
        // range 11-03..11-04: first and last local minutes count, neighbours do not
        session_at(&store, before_app, local_at(date(2026, 11, 2), 23, 30), 60);
        session_at(&store, inside_app, local_at(date(2026, 11, 3), 0, 30), 60);
        session_at(&store, inside_app, local_at(date(2026, 11, 4), 23, 30), 120);
        session_at(&store, after_app, local_at(date(2026, 11, 5), 0, 30), 60);

        let summary = summary(&store, "2026-11-03", "2026-11-04", true);

        assert_eq!(
            summary
                .sessions
                .iter()
                .map(|row| (row.identity_key.as_str(), row.launch_count))
                .collect::<Vec<_>>(),
            vec![(inside.as_str(), 2)]
        );
        assert_eq!(summary.sessions[0].longest_seconds, 120);
    }

    #[test]
    fn statistics_summary_reports_comparison_availability() {
        let (_file, store) = migrated_store();
        let (_, code) = software(&store, "Code.exe");
        for day in 1..=6 {
            system_day(&store, date(2026, 11, day), 600);
        }
        window_day(&store, date(2026, 11, 3), &code, 600);

        let availability = |start: &str, end: &str| {
            let summary = summary(&store, start, end, false);
            (
                summary.system_comparison_available,
                summary.software_comparison_available,
            )
        };

        // previous 10-31..11-01 starts before the data start
        assert_eq!(availability("2026-11-02", "2026-11-03"), (false, false));
        // previous 11-01..11-02 starts before the software detail start
        assert_eq!(availability("2026-11-03", "2026-11-04"), (true, false));
        // previous 11-03..11-04 is fully covered
        assert_eq!(availability("2026-11-05", "2026-11-06"), (true, true));

        // previous 11-01..11-03
        let summary = summary(&store, "2026-11-04", "2026-11-06", false);
        assert_eq!(summary.previous_active_seconds, 1800);
        assert_eq!(summary.previous_recorded_seconds, 3600);
    }

    #[test]
    fn statistics_summary_rejects_invalid_ranges() {
        let (_file, store) = migrated_store();

        for (start, end) in [
            ("2026-11-05", "2026-11-01"),
            ("2025-01-01", "2026-11-21"),
            ("2026-13-01", "2026-11-21"),
            ("2026/11/01", "2026-11-21"),
            ("2026-11-1", "2026-11-21"),
            ("", "2026-11-21"),
            ("+262142-12-31", "+262142-12-31"),
            ("-262143-01-01", "-262143-01-01"),
            ("+10000-01-01", "+10000-01-01"),
        ] {
            assert_eq!(
                statistics_summary_from_store(&store, start, end, false).err(),
                Some("statistics_invalid_range".to_string()),
                "{start}..{end}"
            );
        }
        assert!(statistics_summary_from_store(&store, "2025-11-21", "2026-11-21", false).is_ok());
    }

    #[test]
    fn achievements_summary_heatmap_has_exactly_requested_days_ending_today() {
        let (_file, store) = migrated_store();
        let today = date(2026, 11, 21);
        system_day(&store, today, 600);
        system_day(&store, today - Duration::days(2), 900);

        for invalid in [0, 30, 91, 366] {
            assert_eq!(
                achievements_summary_from_store(&store, invalid, false, today).err(),
                Some("achievements_invalid_heatmap_days".to_string())
            );
        }
        for days in [90_u32, 180, 365] {
            let summary =
                achievements_summary_from_store(&store, days, false, today).expect("summary");
            assert_eq!(summary.heatmap_days, days);
            assert_eq!(summary.heatmap.len(), days as usize);
            assert_eq!(summary.heatmap.last().unwrap().date, "2026-11-21");
            assert_eq!(
                summary.heatmap[0].date,
                (today - Duration::days(i64::from(days) - 1)).to_string()
            );
        }
        let summary = achievements_summary_from_store(&store, 90, false, today).unwrap();
        assert_eq!(
            summary.heatmap[87..]
                .iter()
                .map(|day| (day.date.as_str(), day.active_seconds))
                .collect::<Vec<_>>(),
            vec![("2026-11-19", 900), ("2026-11-20", 0), ("2026-11-21", 600)]
        );
        assert_eq!(summary.today, "2026-11-21");
        assert_eq!(summary.streak_threshold_seconds, 300);
        assert_eq!(summary.milestone_hours, vec![10, 50, 100, 500, 1000, 6666]);
    }

    #[test]
    fn achievements_summary_picks_best_active_day_and_best_software_day() {
        let (_file, store) = migrated_store();
        let (_, code) = software(&store, "Code.exe");
        let (_, word) = software(&store, "Word.exe");
        let today = date(2026, 11, 21);
        // Records and streaks use all history, not just the heatmap window.
        for (day, active) in [
            (date(2026, 1, 10), 9 * H),
            (date(2026, 1, 11), 9 * H),
            (date(2026, 11, 19), 2 * H),
            (date(2026, 11, 20), 2 * H),
            (date(2026, 11, 21), 60),
        ] {
            system_day(&store, day, active);
        }
        focus_day(&store, date(2026, 11, 2), &code, 3 * H);
        focus_day(&store, date(2026, 11, 3), &word, 4 * H);
        focus_day(&store, date(2026, 11, 4), &code, 4 * H);

        let summary = achievements_summary_from_store(&store, 90, false, today).unwrap();

        // Equal days: the earlier one stays the record.
        let best = summary.best_active_day.expect("best active day");
        assert_eq!((best.date.as_str(), best.seconds), ("2026-01-10", 9 * H));
        let best_software = summary.best_software_day.expect("best software day");
        assert_eq!(
            (
                best_software.identity_key.as_str(),
                best_software.date.as_str(),
                best_software.seconds
            ),
            (word.as_str(), "2026-11-03", 4 * H)
        );
        assert_eq!(best_software.display_name, display_name(&store, &word));
        assert_eq!(summary.current_streak_days, 2);
        assert_eq!(summary.current_streak_start.as_deref(), Some("2026-11-19"));
        assert_eq!(summary.longest_streak_days, 2);
        assert_eq!(summary.longest_streak_start.as_deref(), Some("2026-01-10"));
        assert_eq!(summary.longest_streak_end.as_deref(), Some("2026-01-11"));
    }

    #[test]
    fn achievements_summary_without_history_has_no_records() {
        let (_file, store) = migrated_store();

        let summary =
            achievements_summary_from_store(&store, 90, false, date(2026, 11, 21)).unwrap();

        assert!(summary.heatmap.iter().all(|day| day.active_seconds == 0));
        assert!(summary.best_active_day.is_none());
        assert!(summary.best_software_day.is_none());
        assert_eq!(summary.current_streak_days, 0);
        assert!(summary.milestones.is_empty());
        assert!(summary.new_software.is_empty() && summary.dormant_software.is_empty());
    }

    #[test]
    fn achievements_summary_excludes_hidden_software_from_milestones_and_comings_goings() {
        let (_file, store) = migrated_store();
        let (_, base) = software(&store, "Base.exe");
        let (_, code) = software(&store, "Code.exe");
        let (_, game) = software(&store, "Game.exe");
        let today = date(2026, 11, 21);
        let recent = today - Duration::days(5);
        window_day(&store, today - Duration::days(100), &base, H);
        for key in [&code, &game] {
            window_day(&store, recent, key, H);
        }
        focus_day(&store, recent, &code, 2 * H);
        focus_day(&store, recent, &game, 12 * H);
        store
            .add_hidden_software_identities(std::slice::from_ref(&game))
            .expect("hide");

        let visible = achievements_summary_from_store(&store, 90, false, today).unwrap();
        let all = achievements_summary_from_store(&store, 90, true, today).unwrap();

        assert_eq!(
            keys(visible.milestones.iter().map(|row| &row.identity_key)),
            vec![code.as_str()]
        );
        assert_eq!(visible.milestones[0].reached_hours, None);
        assert_eq!(visible.milestones[0].next_hours, Some(10));
        assert_eq!(
            keys(visible.new_software.iter().map(|row| &row.identity_key)),
            vec![code.as_str()]
        );
        assert_eq!(visible.new_software[0].date, recent.to_string());
        assert_eq!(
            keys(visible.dormant_software.iter().map(|row| &row.identity_key)),
            vec![base.as_str()]
        );
        assert_eq!(visible.best_software_day.unwrap().identity_key, code);

        assert_eq!(
            keys(all.milestones.iter().map(|row| &row.identity_key)),
            vec![game.as_str(), code.as_str()]
        );
        assert_eq!(all.milestones[0].reached_hours, Some(10));
        assert_eq!(
            all.milestones[0].reached_on.as_deref(),
            Some(recent.to_string().as_str())
        );
        assert_eq!(all.new_software.len(), 2);
        assert_eq!(all.best_software_day.unwrap().identity_key, game);
    }

    #[test]
    fn achievements_summary_comings_goings_need_a_minute_of_all_time_window() {
        let (_file, store) = migrated_store();
        let (_, base) = software(&store, "Base.exe");
        let (_, installer) = software(&store, "Setup.exe");
        let (_, split) = software(&store, "Split.exe");
        let (_, old_blip) = software(&store, "OldBlip.exe");
        let today = date(2026, 11, 21);
        window_day(&store, today - Duration::days(100), &base, H);
        window_day(&store, today, &base, H);
        window_day(&store, today - Duration::days(3), &installer, 59);
        // 两天各 30 秒，累计恰好 1 分钟
        window_day(&store, today - Duration::days(4), &split, 30);
        window_day(&store, today - Duration::days(2), &split, 30);
        window_day(&store, today - Duration::days(60), &old_blip, 59);

        let summary = achievements_summary_from_store(&store, 90, false, today).unwrap();

        assert_eq!(
            keys(summary.new_software.iter().map(|row| &row.identity_key)),
            vec![split.as_str()]
        );
        assert_eq!(
            summary.new_software[0].date,
            (today - Duration::days(4)).to_string()
        );
        assert!(summary.dormant_software.is_empty());
    }
}

#[cfg(test)]
mod local_date_bounds_tests {
    use super::local_date_bounds_in;
    use chrono::{DateTime, FixedOffset, NaiveDate, Utc};

    fn utc(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn local_date_bounds_in_spans_one_day_for_fixed_offsets() {
        let date = NaiveDate::from_ymd_opt(2026, 6, 5).unwrap();
        let east = FixedOffset::east_opt(8 * 3600).unwrap();
        assert_eq!(
            local_date_bounds_in(date, &east),
            (utc("2026-06-04T16:00:00Z"), utc("2026-06-05T16:00:00Z"))
        );
        let west = FixedOffset::west_opt(5 * 3600).unwrap();
        assert_eq!(
            local_date_bounds_in(date, &west),
            (utc("2026-06-05T05:00:00Z"), utc("2026-06-06T05:00:00Z"))
        );
    }
}

#[cfg(test)]
mod timeline_command_tests {
    use super::{local_date_bounds_in, timeline_summary_from_store, TimelineSummary};
    use crate::storage::Store;
    use chrono::{DateTime, Duration, Local, NaiveDate, SecondsFormat, TimeZone, Utc};
    use tempfile::NamedTempFile;

    fn migrated_store() -> (NamedTempFile, Store) {
        let db_file = NamedTempFile::new().expect("temp db");
        let store = Store::open(db_file.path()).expect("open store");
        store.migrate().expect("migrate");
        (db_file, store)
    }

    /// `(app_id, identity_key)` for a fixture app.
    fn software(store: &Store, process_name: &str) -> (i64, String) {
        let app_id = store
            .upsert_app(
                process_name,
                &format!(r"X:\Fixtures\{process_name}"),
                process_name,
            )
            .expect("app")
            .id;
        let identity_key = store
            .upsert_software_identity_for_app(app_id)
            .expect("identity")
            .identity_key;
        (app_id, identity_key)
    }

    fn day(day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 6, day).unwrap()
    }

    /// `minutes` after the local start of `date`.
    fn at(date: NaiveDate, minutes: i64) -> DateTime<Utc> {
        local_date_bounds_in(date, &Local).0 + Duration::minutes(minutes)
    }

    fn ms(value: DateTime<Utc>) -> String {
        value.to_rfc3339_opts(SecondsFormat::Millis, false)
    }

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 6, 20, 12, 0, 0).unwrap()
    }

    /// A segment on `date` from `start` for `minutes`, both in minutes.
    fn segment(
        store: &Store,
        date: NaiveDate,
        start: i64,
        minutes: i64,
        focus: Option<&str>,
        is_active: bool,
        reason: &str,
    ) {
        store
            .insert_timeline_segment(
                date,
                at(date, start),
                at(date, start + minutes),
                minutes * 60,
                focus,
                is_active,
                reason,
            )
            .expect("segment");
    }

    fn summary(store: &Store, date: NaiveDate, include_hidden: bool) -> TimelineSummary {
        timeline_summary_from_store(store, &date.to_string(), include_hidden, now())
            .expect("summary")
    }

    #[test]
    fn timeline_summary_rejects_invalid_dates_and_handles_an_empty_database() {
        let (_db, store) = migrated_store();
        for invalid in ["2026-6-5", "2026-02-30", "+12026-06-05", ""] {
            assert_eq!(
                timeline_summary_from_store(&store, invalid, false, now()).unwrap_err(),
                "timeline_invalid_date",
                "{invalid:?}"
            );
        }
        let empty = summary(&store, day(5), false);
        let (start, end) = local_date_bounds_in(day(5), &Local);
        assert_eq!(empty.date, "2026-06-05");
        assert_eq!((empty.day_start, empty.day_end), (ms(start), ms(end)));
        assert_eq!(empty.generated_at, ms(now()));
        assert_eq!(empty.day_status, "before_collection");
        assert_eq!(empty.collection_started_at, None);
        assert_eq!(empty.first_recorded_date, None);
        assert!(empty.segments.is_empty());
        assert!(empty.focus_segments.is_empty());
        assert!(empty.active_segments.is_empty());
        assert!(empty.running.is_empty());
        assert!(empty.software.is_empty());
    }

    #[test]
    fn timeline_summary_reports_day_status_and_collection_start() {
        let (_db, store) = migrated_store();
        store
            .increment_daily_system_usage(day(1), 10, 5, 10)
            .expect("system usage");
        // Written out of order: the first segment is found by date and start, not by id.
        segment(&store, day(7), 0, 5, None, true, "tracker_started");
        segment(&store, day(5), 90, 5, None, true, "tracker_started");
        segment(&store, day(5), 60, 5, None, true, "clock_rollback");

        let statuses: Vec<String> = [4, 5, 6, 7]
            .into_iter()
            .map(|d| summary(&store, day(d), false).day_status)
            .collect();
        assert_eq!(
            statuses,
            [
                "before_collection",
                "collection_started",
                "collected",
                "collected"
            ]
        );
        let collected = summary(&store, day(6), false);
        assert!(collected.segments.is_empty());
        assert_eq!(collected.collection_started_at, Some(ms(at(day(5), 60))));
        assert_eq!(collected.first_recorded_date.as_deref(), Some("2026-06-01"));
    }

    type FocusShape = (String, String, i64, Option<String>);

    fn focus_shape(result: &TimelineSummary) -> Vec<FocusShape> {
        result
            .focus_segments
            .iter()
            .map(|s| {
                (
                    s.start.clone(),
                    s.end.clone(),
                    s.seconds,
                    s.focus_identity_key.clone(),
                )
            })
            .collect()
    }

    #[test]
    fn timeline_summary_merges_focus_and_active_bands() {
        let (_db, store) = migrated_store();
        let a = software(&store, "a.exe").1;
        let b = software(&store, "b.exe").1;
        let c = software(&store, "c.exe").1;
        let d = day(5);
        segment(&store, d, 0, 10, Some(&a), true, "tracker_started");
        segment(&store, d, 10, 10, Some(&a), false, "activity_changed");
        segment(&store, d, 20, 10, Some(&b), false, "focus_changed");
        segment(&store, d, 30, 10, Some(&c), true, "focus_changed");
        segment(&store, d, 40, 10, Some(&c), false, "activity_changed");

        let result = summary(&store, d, false);
        assert_eq!(
            focus_shape(&result),
            vec![
                (ms(at(d, 0)), ms(at(d, 20)), 1200, Some(a.clone())),
                (ms(at(d, 20)), ms(at(d, 30)), 600, Some(b.clone())),
                (ms(at(d, 30)), ms(at(d, 50)), 1200, Some(c.clone())),
            ]
        );
        let active: Vec<_> = result
            .active_segments
            .iter()
            .map(|s| (s.start.clone(), s.end.clone(), s.seconds, s.is_active))
            .collect();
        assert_eq!(
            active,
            vec![
                (ms(at(d, 0)), ms(at(d, 10)), 600, true),
                (ms(at(d, 10)), ms(at(d, 30)), 1200, false),
                (ms(at(d, 30)), ms(at(d, 40)), 600, true),
                (ms(at(d, 40)), ms(at(d, 50)), 600, false),
            ]
        );

        // After a rollback the row before by start is not the true predecessor:
        // B's activity change (by id) joins B's rollback row, not A's row.
        let e = day(6);
        segment(&store, e, 30, 10, Some(&a), true, "tracker_started");
        segment(&store, e, 28, 5, Some(&b), true, "clock_rollback");
        segment(&store, e, 33, 5, Some(&b), false, "activity_changed");
        let result = summary(&store, e, false);
        let starts: Vec<_> = result.segments.iter().map(|s| s.start.clone()).collect();
        assert_eq!(starts, [ms(at(e, 28)), ms(at(e, 30)), ms(at(e, 33))]);
        assert_eq!(
            focus_shape(&result),
            vec![
                (ms(at(e, 28)), ms(at(e, 38)), 600, Some(b.clone())),
                (ms(at(e, 30)), ms(at(e, 40)), 600, Some(a.clone())),
            ]
        );
        // B's rollback row has A's activity state but is not a focus change.
        assert_eq!(
            active_shape(&result),
            vec![
                (ms(at(e, 28)), ms(at(e, 33)), 300, true),
                (ms(at(e, 30)), ms(at(e, 40)), 600, true),
                (ms(at(e, 33)), ms(at(e, 38)), 300, false),
            ]
        );

        // Rows opened by a break keep their own group even when focus and
        // activity match the row before.
        let f = day(7);
        segment(&store, f, 0, 10, Some(&a), true, "tracker_started");
        segment(&store, f, 20, 10, Some(&a), true, "scan_gap");
        segment(&store, f, 30, 5, Some(&a), false, "activity_changed");
        segment(&store, f, 35, 5, Some(&b), false, "focus_changed");
        segment(&store, f, 40, 5, Some(&b), false, "day_changed");
        let result = summary(&store, f, false);
        assert_eq!(
            focus_shape(&result),
            vec![
                (ms(at(f, 0)), ms(at(f, 10)), 600, Some(a.clone())),
                (ms(at(f, 20)), ms(at(f, 35)), 900, Some(a)),
                (ms(at(f, 35)), ms(at(f, 40)), 300, Some(b.clone())),
                (ms(at(f, 40)), ms(at(f, 45)), 300, Some(b)),
            ]
        );
        assert_eq!(
            active_shape(&result),
            vec![
                (ms(at(f, 0)), ms(at(f, 10)), 600, true),
                (ms(at(f, 20)), ms(at(f, 30)), 600, true),
                (ms(at(f, 30)), ms(at(f, 40)), 600, false),
                (ms(at(f, 40)), ms(at(f, 45)), 300, false),
            ]
        );
    }

    fn active_shape(result: &TimelineSummary) -> Vec<(String, String, i64, bool)> {
        result
            .active_segments
            .iter()
            .map(|s| (s.start.clone(), s.end.clone(), s.seconds, s.is_active))
            .collect()
    }

    #[test]
    fn timeline_summary_returns_segments_past_the_day_bounds_whole() {
        let (_db, store) = migrated_store();
        let d = day(5);
        // Written under another time zone: starts before this day's local start.
        segment(&store, d, -30, 40, None, true, "tracker_started");
        let result = summary(&store, d, false);
        let whole = (ms(at(d, -30)), ms(at(d, 10)), 2400);
        let segment = &result.segments[0];
        assert_eq!(
            (segment.start.clone(), segment.end.clone(), segment.seconds),
            whole
        );
        assert_eq!(
            focus_shape(&result),
            vec![(whole.0.clone(), whole.1.clone(), whole.2, None)]
        );
        assert_eq!(
            active_shape(&result),
            vec![(whole.0, whole.1, whole.2, true)]
        );
    }

    #[test]
    fn timeline_summary_masks_hidden_focus_without_changing_totals() {
        let (_db, store) = migrated_store();
        let a = software(&store, "a.exe").1;
        let b = software(&store, "b.exe").1;
        let d = day(5);
        segment(&store, d, 0, 10, Some(&a), true, "tracker_started");
        segment(&store, d, 10, 10, Some(&b), true, "focus_changed");
        segment(&store, d, 20, 10, None, true, "focus_changed");
        store
            .add_hidden_software_identities(&[a.clone()])
            .expect("hide");

        let masked = summary(&store, d, false);
        let rows: Vec<_> = masked
            .segments
            .iter()
            .map(|s| (s.focus_identity_key.clone(), s.focus_hidden, s.seconds))
            .collect();
        assert_eq!(
            rows,
            vec![
                (None, true, 600),
                (Some(b.clone()), false, 600),
                (None, false, 600)
            ]
        );
        let focus: Vec<_> = masked
            .focus_segments
            .iter()
            .map(|s| (s.focus_identity_key.clone(), s.focus_hidden))
            .collect();
        assert_eq!(
            focus,
            vec![(None, true), (Some(b.clone()), false), (None, false)]
        );
        let software: Vec<_> = masked
            .software
            .iter()
            .map(|s| s.identity_key.clone())
            .collect();
        assert_eq!(software, [b.clone()]);

        let full = summary(&store, d, true);
        assert_eq!(
            full.segments.iter().map(|s| s.seconds).sum::<i64>(),
            masked.segments.iter().map(|s| s.seconds).sum::<i64>()
        );
        assert!(full.segments.iter().all(|s| !s.focus_hidden));
        assert!(full.focus_segments.iter().all(|s| !s.focus_hidden));
        assert_eq!(
            full.segments[0].focus_identity_key.as_deref(),
            Some(a.as_str())
        );
        let software: Vec<_> = full
            .software
            .iter()
            .map(|s| (s.identity_key.clone(), s.display_name.clone(), s.is_hidden))
            .collect();
        let mut expected = vec![(a, "a".to_string(), true), (b, "b".to_string(), false)];
        expected.sort();
        assert_eq!(software, expected);
    }

    #[test]
    fn timeline_summary_runs_on_a_read_only_connection() {
        let (db, store) = migrated_store();
        segment(&store, day(5), 0, 10, None, true, "tracker_started");
        let reader = Store::open_read_only(db.path()).expect("read-only");
        let transaction = reader.savepoint().expect("savepoint");
        let result = summary(&reader, day(5), false);
        transaction.commit().expect("commit");
        assert_eq!(result.segments.len(), 1);
        assert_eq!(result.day_status, "collection_started");
    }
}
