import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  ACCENT_IDS,
  DEFAULT_ACCENT,
  DEFAULT_EINK,
  DEFAULT_START_PAGE,
  EINK_IDS,
  START_PAGE_IDS,
  type AccentId,
  type EinkId,
  type StartPage,
} from "./appearancePresets";
import type { DurationFormat } from "./i18n";

export type { AccentId, EinkId, StartPage } from "./appearancePresets";
export type { DurationFormat } from "./i18n";

export type CloseBehavior = "exit" | "minimize_to_tray";
export type AppRuntimeStatus = "foreground" | "tray" | "background" | "closed";
export type SoftwareMark = "none" | "focused" | "hidden";
export type ThemePreference = "system" | "light" | "dark";
/** 每周起始日 as stored (`ui.week_start`). */
export type WeekStartSetting = "monday" | "sunday";
/** 减少动画 as stored (`ui.reduce_motion`): `system` follows Windows, `reduce` always reduces. */
export type ReduceMotion = "system" | "reduce";
/** 文字大小 as stored (`ui.text_size`): `standard` is 100%, `large` is 125%; Rust applies it as the window zoom. */
export type TextSize = "standard" | "large";

/** The v0.4.4 display preferences, keyed by their `set_ui_preference` and settings-file names. */
export interface UiPreferences {
  accent: AccentId;
  eink: EinkId;
  week_start: WeekStartSetting;
  start_page: StartPage;
  reduce_motion: ReduceMotion;
  text_size: TextSize;
}

export type UiPreferenceKey = keyof UiPreferences;

export interface AppUsageRow {
  app_id: number;
  display_name: string;
  process_name: string;
  icon_url: string | null;
  total_seconds: number;
  today_seconds: number;
  active_today_seconds: number;
  status: AppRuntimeStatus;
  is_running: boolean;
}

export interface DashboardSummary {
  last_scan_succeeded: boolean | null;
  product_title: string;
  locale: string;
  /** The local calendar date ("YYYY-MM-DD") the today readings belong to. */
  usage_date: string;
  /** False when `usage_date` is a past day: no live statuses, totals end with that day. */
  is_today: boolean;
  most_used: AppUsageRow | null;
  recorded_today_seconds: number;
  active_today_seconds: number;
  apps: AppUsageRow[];
}

export interface SoftwarePageRow {
  identity_key: string;
  display_name: string;
  process_name: string;
  icon_url: string | null;
  today_runtime_seconds: number;
  today_focused_seconds: number;
  total_runtime_seconds: number;
  total_focused_seconds: number;
  today_foreground_seconds?: number;
  today_background_seconds?: number;
  total_foreground_seconds?: number;
  total_background_seconds?: number;
  last_opened_at: string | null;
  status: AppRuntimeStatus;
  mark: SoftwareMark;
}

export interface SoftwarePageSummary {
  focused: SoftwarePageRow[];
  hidden: SoftwarePageRow[];
  discovered: SoftwarePageRow[];
}

export interface AppSettings {
  close_behavior: CloseBehavior;
  close_behavior_configured: boolean;
  autostart_enabled: boolean;
  autostart_configured: boolean;
  duration_format: DurationFormat;
  duration_format_configured: boolean;
  theme: ThemePreference;
  theme_configured: boolean;
  accent: AccentId;
  accent_configured: boolean;
  eink: EinkId;
  eink_configured: boolean;
  week_start: WeekStartSetting;
  week_start_configured: boolean;
  start_page: StartPage;
  start_page_configured: boolean;
  reduce_motion: ReduceMotion;
  reduce_motion_configured: boolean;
  text_size: TextSize;
  text_size_configured: boolean;
}

/** Error for a malformed or future `date` on the date-browsing summaries. */
export const DAY_INVALID_DATE = "day_invalid_date";

/** `date` is a local "YYYY-MM-DD" no later than today; omit it for today (live). */
export async function getDashboardSummary(date?: string): Promise<DashboardSummary> {
  return date === undefined
    ? invoke<DashboardSummary>("get_dashboard_summary")
    : invoke<DashboardSummary>("get_dashboard_summary", { date });
}

export async function getSoftwarePageSummary(): Promise<SoftwarePageSummary> {
  return invoke<SoftwarePageSummary>("get_software_page_summary");
}

export interface BackgroundRow {
  family_key: string;
  display_name: string;
  process_name: string;
  icon_url: string | null;
  is_running: boolean;
  process_count: number;
  /** Share of the whole machine's CPU right now (0-100); null when not running. */
  cpu_percent: number | null;
  /** Current memory when running, otherwise today's peak. */
  memory_bytes: number;
  /** The day's peak process count, including the live sample. */
  peak_process_count: number;
  /** The day's peak memory, including the live sample. */
  peak_memory_bytes: number;
  today_running_seconds: number;
  /** CPU core-seconds used today. */
  today_cpu_seconds: number;
}

/** On a past day the rows are stored totals and peaks only: not running, `cpu_percent` null. */
export interface BackgroundPageSummary {
  logical_cores: number;
  running_count: number;
  rows: BackgroundRow[];
  /** The local calendar date ("YYYY-MM-DD") the rows belong to. */
  usage_date: string;
  is_today: boolean;
}

/** `date` is a local "YYYY-MM-DD" no later than today; omit it for today (live). */
export async function getBackgroundPageSummary(date?: string): Promise<BackgroundPageSummary> {
  return date === undefined
    ? invoke<BackgroundPageSummary>("get_background_page_summary")
    : invoke<BackgroundPageSummary>("get_background_page_summary", { date });
}

/** The header date picker's bounds, local "YYYY-MM-DD"; `data_start_date` is null before the first record. */
export interface CalendarSummary {
  today: string;
  data_start_date: string | null;
}

export async function getCalendarSummary(): Promise<CalendarSummary> {
  return invoke<CalendarSummary>("get_calendar_summary");
}

/** Dates are local `YYYY-MM-DD`; timestamps are RFC 3339. */
export interface StatisticsDay {
  date: string;
  recorded_seconds: number;
  active_seconds: number;
  tracker_uptime_seconds: number;
  first_recorded_at: string | null;
  last_recorded_at: string | null;
  has_software_detail: boolean;
}

export interface RankingRow {
  identity_key: string;
  display_name: string;
  icon_url: string | null;
  rank: number;
  previous_rank: number | null;
  is_new: boolean;
  focused_seconds: number;
  previous_focused_seconds: number;
  window_seconds: number;
}

export interface IdleOpenRow {
  identity_key: string;
  display_name: string;
  icon_url: string | null;
  window_seconds: number;
  focused_seconds: number;
  idle_seconds: number;
}

export interface SessionStatRow {
  identity_key: string;
  display_name: string;
  icon_url: string | null;
  launch_count: number;
  average_seconds: number;
  longest_seconds: number;
}

export interface StatisticsSummary {
  start: string;
  end: string;
  days_count: number;
  previous_start: string;
  previous_end: string;
  data_start_date: string | null;
  software_detail_start_date: string | null;
  days_without_software_detail: number;
  system_comparison_available: boolean;
  software_comparison_available: boolean;
  previous_recorded_seconds: number;
  previous_active_seconds: number;
  days: StatisticsDay[];
  ranking: RankingRow[];
  idle_open: IdleOpenRow[];
  sessions: SessionStatRow[];
}

export interface HeatmapDay {
  date: string;
  active_seconds: number;
}

export interface DayRecord {
  date: string;
  seconds: number;
}

export interface SoftwareDayRecord {
  identity_key: string;
  display_name: string;
  icon_url: string | null;
  date: string;
  seconds: number;
}

export interface MilestoneRow {
  identity_key: string;
  display_name: string;
  icon_url: string | null;
  focused_seconds: number;
  reached_hours: number | null;
  reached_on: string | null;
  next_hours: number | null;
}

export interface SoftwareRef {
  identity_key: string;
  display_name: string;
  icon_url: string | null;
  date: string;
}

export interface AchievementsSummary {
  today: string;
  heatmap_days: number;
  heatmap: HeatmapDay[];
  streak_threshold_seconds: number;
  current_streak_days: number;
  current_streak_start: string | null;
  longest_streak_days: number;
  longest_streak_start: string | null;
  longest_streak_end: string | null;
  best_active_day: DayRecord | null;
  best_software_day: SoftwareDayRecord | null;
  milestone_hours: number[];
  milestones: MilestoneRow[];
  new_software: SoftwareRef[];
  dormant_software: SoftwareRef[];
}

export type HeatmapDays = 90 | 180 | 365;

export interface StatisticsExportSoftware {
  identity_key: string;
  display_name: string;
  process_name: string;
  focused_seconds: number;
  window_seconds: number;
  background_seconds: number;
  /** Days in the range with at least 300 s of focus. */
  used_days: number;
}

export interface StatisticsExportDay {
  date: string;
  identity_key: string;
  display_name: string;
  process_name: string;
  focused_seconds: number;
  window_seconds: number;
  background_seconds: number;
}

/**
 * The 统计 CSV exports for a range. `software` lists every software with any focus, window or
 * background time (focus, then window desc, then name); `days` every nonzero date × software row
 * (date asc, then focus desc, then name).
 */
export interface StatisticsExport {
  start: string;
  end: string;
  software: StatisticsExportSoftware[];
  days: StatisticsExportDay[];
}

/** A software with at least one focus milestone reached; dates are local `YYYY-MM-DD`. */
export interface MilestoneSoftware {
  identity_key: string;
  display_name: string;
  process_name: string;
  icon_url: string | null;
  /** The highest tier reached, in hours. */
  tier_hours: number;
  /** The day the running focus total first crossed that tier. */
  reached_on: string;
  total_focused_seconds: number;
  /** All-time days with at least 300 s of focus. */
  used_days: number;
}

export async function getStatisticsSummary(args: {
  start: string;
  end: string;
  includeHidden: boolean;
}): Promise<StatisticsSummary> {
  return invoke<StatisticsSummary>("get_statistics_summary", args);
}

export async function getAchievementsSummary(args: {
  heatmapDays: HeatmapDays;
  includeHidden: boolean;
}): Promise<AchievementsSummary> {
  return invoke<AchievementsSummary>("get_achievements_summary", args);
}

/** Rejects with the same range errors as getStatisticsSummary. */
export async function getStatisticsExport(args: {
  start: string;
  end: string;
  includeHidden: boolean;
}): Promise<StatisticsExport> {
  return invoke<StatisticsExport>("get_statistics_export", args);
}

/** Sorted by tier (highest first), then total focus (highest first). */
export async function getMilestoneSoftware(includeHidden: boolean): Promise<MilestoneSoftware[]> {
  return invoke<MilestoneSoftware[]>("get_milestone_software", { includeHidden });
}

export async function addFocusedSoftwareIdentities(identityKeys: string[]): Promise<void> {
  return invoke("add_focused_software_identities", { identityKeys });
}

export async function removeFocusedSoftwareIdentity(identityKey: string): Promise<void> {
  return invoke("remove_focused_software_identity", { identityKey });
}

export async function addHiddenSoftwareIdentities(identityKeys: string[]): Promise<void> {
  return invoke("add_hidden_software_identities", { identityKeys });
}

export async function removeHiddenSoftwareIdentity(identityKey: string): Promise<void> {
  return invoke("remove_hidden_software_identity", { identityKey });
}

/** Read-only: whether Windows "Transparency effects" is on. Nothing is stored. */
export async function getTransparencyEffectsEnabled(): Promise<boolean> {
  return invoke<boolean>("get_transparency_effects_enabled");
}

/** The Windows accent as `#rrggbb` per app theme (light AccentDark1, dark AccentLight2). */
export interface WindowsAccent {
  light: string;
  dark: string;
}

/** Read-only: the Windows accent, or null when it cannot be read. Nothing is stored. */
export async function getWindowsAccent(): Promise<WindowsAccent | null> {
  return invoke<WindowsAccent | null>("get_windows_accent");
}

export async function getAppSettings(): Promise<AppSettings> {
  const settings = (await invoke<Partial<AppSettings> | null>("get_app_settings")) ?? {};
  const durationFormat = normalizeDurationFormat(settings.duration_format);
  const theme = normalizeThemePreference(settings.theme);
  const accent = normalizeAccent(settings.accent);
  const eink = normalizeEink(settings.eink);
  const weekStart = normalizeWeekStart(settings.week_start);
  const startPage = normalizeStartPage(settings.start_page);
  const reduceMotion = normalizeReduceMotion(settings.reduce_motion);
  const textSize = normalizeTextSize(settings.text_size);

  return {
    close_behavior: normalizeCloseBehavior(settings.close_behavior),
    close_behavior_configured: settings.close_behavior_configured === true,
    autostart_enabled: settings.autostart_enabled !== false,
    autostart_configured: settings.autostart_configured === true,
    duration_format: durationFormat,
    duration_format_configured:
      settings.duration_format_configured === true && settings.duration_format === durationFormat,
    theme,
    theme_configured: settings.theme_configured === true && settings.theme === theme,
    accent,
    accent_configured: settings.accent_configured === true && settings.accent === accent,
    eink,
    eink_configured: settings.eink_configured === true && settings.eink === eink,
    week_start: weekStart,
    week_start_configured: settings.week_start_configured === true && settings.week_start === weekStart,
    start_page: startPage,
    start_page_configured: settings.start_page_configured === true && settings.start_page === startPage,
    reduce_motion: reduceMotion,
    reduce_motion_configured:
      settings.reduce_motion_configured === true && settings.reduce_motion === reduceMotion,
    text_size: textSize,
    text_size_configured: settings.text_size_configured === true && settings.text_size === textSize,
  };
}

export async function getCloseBehaviorPreference(): Promise<CloseBehavior | null> {
  const preference = await invoke<CloseBehavior | null>("get_close_behavior_preference");

  return preference === "exit" || preference === "minimize_to_tray" ? preference : null;
}

export async function setCloseBehaviorPreference(choice: CloseBehavior): Promise<void> {
  return invoke("set_close_behavior_preference", { choice });
}

export async function setAutostartPreference(enabled: boolean): Promise<void> {
  return invoke("set_autostart_preference", { enabled });
}

export async function setDurationFormatPreference(durationFormat: DurationFormat): Promise<void> {
  return invoke("set_duration_format_preference", { durationFormat });
}

export async function setThemePreference(theme: ThemePreference): Promise<void> {
  return invoke("set_theme_preference", { theme });
}

/** Error strings `set_ui_preference` rejects with. */
export const UI_PREFERENCE_ERRORS = {
  unknownKey: "ui_preference_unknown_key",
  invalidValue: "ui_preference_invalid_value",
} as const;

/** Saves one display preference; rejects with a `UI_PREFERENCE_ERRORS` string. */
export async function setUiPreference<K extends UiPreferenceKey>(key: K, value: UiPreferences[K]): Promise<void> {
  return invoke("set_ui_preference", { key, value });
}

export async function applyWindowCloseChoice(
  choice: CloseBehavior,
  remember: boolean,
): Promise<void> {
  return invoke("apply_window_close_choice", { choice, remember });
}

export async function getAutostartEnabled(): Promise<boolean> {
  return isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}

// Exports. Save and open dialogs run in Rust; each call resolves to the saved
// path, or null when the user cancels the dialog.

/** Error strings the export commands reject with. */
export const EXPORT_ERRORS = {
  unknownPath: "export_unknown_path",
  invalidRequest: "export_invalid_request",
  targetIsDatabase: "export_target_is_database",
  tooLarge: "export_too_large",
  notPng: "export_not_png",
  importInvalid: "settings_import_invalid",
  importTooLarge: "settings_import_too_large",
  importExpired: "settings_import_expired",
} as const;

export interface SaveTextExportArgs {
  /** File name offered in the save dialog, e.g. "GST-日报-2026-11-24.csv". */
  suggestedName: string;
  /** Dialog filter label, e.g. "CSV". */
  filterName: string;
  /** Extension without the dot, e.g. "csv". */
  extension: string;
  /** Text without a BOM; Rust writes it as UTF-8 with a BOM. */
  contents: string;
}

export async function saveTextExport(args: SaveTextExportArgs): Promise<string | null> {
  return invoke<string | null>("save_text_export", { ...args });
}

/** Request header for the suggested file name of `saveBinaryExport`. */
export const FILE_NAME_HEADER = "x-gst-file-name";

/**
 * Saves PNG bytes (at most 32 MiB) through the native dialog. The bytes go as
 * the raw IPC body and the suggested name, e.g. "GST-日报-2026-11-25.png", as a
 * percent-encoded header.
 */
export async function saveBinaryExport(bytes: Uint8Array, suggestedName: string): Promise<string | null> {
  return invoke<string | null>("save_binary_export", bytes, {
    headers: { [FILE_NAME_HEADER]: encodeURIComponent(suggestedName) },
  });
}

/** Shows the file in Explorer; only paths saved in this app session are accepted. */
export async function revealSavedFile(path: string): Promise<void> {
  return invoke("reveal_saved_file", { path });
}

export async function exportSettingsFile(): Promise<string | null> {
  return invoke<string | null>("export_settings_file");
}

export type SettingsImportKey = "theme" | "duration_format" | "close_behavior" | UiPreferenceKey;

/** `from` / `to` are stored values such as "dark" or "hours_minutes". */
export interface SettingChange {
  key: SettingsImportKey;
  from: string;
  to: string;
}

export interface SettingsImportResult {
  focused_added: number;
  hidden_added: number;
  unmatched: number;
  conflicts: number;
}

export interface SettingsImportPreview extends SettingsImportResult {
  import_id: string;
  changes: SettingChange[];
}

/** Opens the file picker and previews the import; null when cancelled. */
export async function pickSettingsImport(): Promise<SettingsImportPreview | null> {
  return invoke<SettingsImportPreview | null>("pick_settings_import");
}

export async function applySettingsImport(importId: string): Promise<SettingsImportResult> {
  return invoke<SettingsImportResult>("apply_settings_import", { importId });
}

export async function backupAllData(): Promise<string | null> {
  return invoke<string | null>("backup_all_data");
}

// 数据文件夹 and 从备份恢复. The data folder path never leaves Rust.

/** Opens the folder holding the database in Explorer; rejects when Explorer cannot start. */
export async function openDataFolder(): Promise<void> {
  return invoke("open_data_folder");
}

/** Error codes `pickRestoreBackup` and `applyRestore` reject with. */
export const RESTORE_ERRORS = {
  invalid: "restore_invalid",
  newer: "restore_newer",
  liveDatabase: "restore_live_database",
  noSpace: "restore_no_space",
  failed: "restore_failed",
} as const;

export type RestoreErrorCode = (typeof RESTORE_ERRORS)[keyof typeof RESTORE_ERRORS];

const RESTORE_ERROR_MESSAGES: Record<RestoreErrorCode, string> = {
  restore_invalid: "这个文件不是有效的 GST 备份。",
  restore_newer: "这份备份来自更新版本的 GST，无法在当前版本恢复。",
  restore_live_database: "不能选择正在使用的数据库。",
  restore_no_space: "磁盘空间不足，无法恢复。",
  restore_failed: "恢复失败，当前数据没有改动。",
};

/** The error dialog text for a rejected restore call; unknown errors read as 恢复失败. */
export function restoreErrorMessage(error: unknown): string {
  return typeof error === "string" && Object.prototype.hasOwnProperty.call(RESTORE_ERROR_MESSAGES, error)
    ? RESTORE_ERROR_MESSAGES[error as RestoreErrorCode]
    : RESTORE_ERROR_MESSAGES.restore_failed;
}

/** A validated, staged backup awaiting confirmation. */
export interface RestorePreview {
  restore_id: string;
  file_name: string;
  /** `YYYY-MM-DD`, or null when the backup has no recorded day. */
  first_day: string | null;
  last_day: string | null;
  /** Software with at least one usage session. */
  software_count: number;
  file_size_bytes: number;
}

/** Opens the file picker, then validates and stages the backup; null when cancelled. */
export async function pickRestoreBackup(): Promise<RestorePreview | null> {
  return invoke<RestorePreview | null>("pick_restore_backup");
}

/** Queues the staged backup and exits; the app restarts itself and swaps the data in. */
export async function applyRestore(restoreId: string): Promise<void> {
  return invoke("apply_restore", { restoreId });
}

/** Deletes the staged copy when the confirm dialog is cancelled. */
export async function discardRestore(restoreId: string): Promise<void> {
  return invoke("discard_restore", { restoreId });
}

export type RestoreStatus = "restored" | "rolled_back" | "none";

/** The result of a restore at this start, reported once. */
export async function getRestoreStatus(): Promise<RestoreStatus> {
  const status = await invoke<unknown>("get_restore_status");
  return status === "restored" || status === "rolled_back" ? status : "none";
}

function normalizeCloseBehavior(value: unknown): CloseBehavior {
  return value === "exit" || value === "minimize_to_tray" ? value : "minimize_to_tray";
}

function normalizeDurationFormat(value: unknown): DurationFormat {
  return value === "hours_minutes" ? value : "decimal_hours";
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function oneOf<T extends string>(ids: readonly T[], value: unknown, fallback: T): T {
  return ids.find((id) => id === value) ?? fallback;
}

/** Unknown values, a raw colour included, are 蓝. */
export function normalizeAccent(value: unknown): AccentId {
  return oneOf(ACCENT_IDS, value, DEFAULT_ACCENT);
}

export function normalizeEink(value: unknown): EinkId {
  return oneOf(EINK_IDS, value, DEFAULT_EINK);
}

export function normalizeWeekStart(value: unknown): WeekStartSetting {
  return value === "sunday" ? value : "monday";
}

/** Unknown pages, `settings` and `timeline` included, are 概览. */
export function normalizeStartPage(value: unknown): StartPage {
  return oneOf(START_PAGE_IDS, value, DEFAULT_START_PAGE);
}

export function normalizeReduceMotion(value: unknown): ReduceMotion {
  return value === "reduce" ? value : "system";
}

export function normalizeTextSize(value: unknown): TextSize {
  return value === "large" ? value : "standard";
}
