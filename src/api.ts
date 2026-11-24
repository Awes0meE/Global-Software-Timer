import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { DurationFormat } from "./i18n";

export type { DurationFormat } from "./i18n";

export type CloseBehavior = "exit" | "minimize_to_tray";
export type AppRuntimeStatus = "foreground" | "tray" | "background" | "closed";
export type SoftwareMark = "none" | "focused" | "hidden";
export type ThemePreference = "system" | "light" | "dark";

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

export interface CalendarDay {
  date: string;
  recorded_seconds: number;
  active_seconds: number;
}

/** Dates are local "YYYY-MM-DD". `days` lists stored days only, data start to today. */
export interface CalendarSummary {
  today: string;
  data_start_date: string | null;
  streak_threshold_seconds: number;
  days: CalendarDay[];
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

export async function getAppSettings(): Promise<AppSettings> {
  const settings = (await invoke<Partial<AppSettings> | null>("get_app_settings")) ?? {};
  const durationFormat = normalizeDurationFormat(settings.duration_format);
  const theme = normalizeThemePreference(settings.theme);

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

/** Shows the file in Explorer; only paths saved in this app session are accepted. */
export async function revealSavedFile(path: string): Promise<void> {
  return invoke("reveal_saved_file", { path });
}

export async function exportSettingsFile(): Promise<string | null> {
  return invoke<string | null>("export_settings_file");
}

export type SettingsImportKey = "theme" | "duration_format" | "close_behavior";

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

function normalizeCloseBehavior(value: unknown): CloseBehavior {
  return value === "exit" || value === "minimize_to_tray" ? value : "minimize_to_tray";
}

function normalizeDurationFormat(value: unknown): DurationFormat {
  return value === "hours_minutes" ? value : "decimal_hours";
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
