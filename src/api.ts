import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export type CloseBehavior = "exit" | "minimize_to_tray";
export type AppRuntimeStatus = "foreground" | "background" | "closed";

export interface AppUsageRow {
  app_id: number;
  display_name: string;
  process_name: string;
  icon_data_url: string | null;
  total_seconds: number;
  today_seconds: number;
  active_today_seconds: number;
  status: AppRuntimeStatus;
  is_running: boolean;
}

export interface DashboardSummary {
  product_title: string;
  locale: string;
  most_used: AppUsageRow | null;
  recorded_today_seconds: number;
  active_today_seconds: number;
  apps: AppUsageRow[];
}

export interface AppSettings {
  close_behavior: CloseBehavior;
  close_behavior_configured: boolean;
  autostart_enabled: boolean;
  autostart_configured: boolean;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary");
}

export async function getAppSettings(): Promise<AppSettings> {
  const settings = (await invoke<Partial<AppSettings> | null>("get_app_settings")) ?? {};

  return {
    close_behavior: normalizeCloseBehavior(settings.close_behavior),
    close_behavior_configured: settings.close_behavior_configured === true,
    autostart_enabled: settings.autostart_enabled !== false,
    autostart_configured: settings.autostart_configured === true,
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

function normalizeCloseBehavior(value: unknown): CloseBehavior {
  return value === "exit" || value === "minimize_to_tray" ? value : "minimize_to_tray";
}
